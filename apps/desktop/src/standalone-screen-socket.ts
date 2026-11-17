import { createHash, timingSafeEqual } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import http from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";

const SOCKET_PATH =
  /^\/{1,2}novnc\/session\/(?:view|control)\/\d{1,16}\.[A-Za-z0-9_-]{1,8192}\/websockify$/;
const HANDSHAKE_TIMEOUT_MS = 20_000;

export class StandaloneScreenSocket {
  private readonly requests = new Set<ClientRequest>();
  private readonly sockets = new Set<Duplex>();
  private readonly configuredHeaders: Readonly<Record<string, string>>;
  private readonly capability: string | undefined;

  constructor(
    private readonly remote: URL,
    configuredHeaders: Readonly<Record<string, string>> = {},
    capability?: string,
  ) {
    this.configuredHeaders = Object.freeze({ ...configuredHeaders });
    this.capability = capability;
  }

  handle(request: IncomingMessage, socket: Duplex, head: Buffer, local: URL) {
    socket.on("error", () => socket.destroy());
    const raw = request.url ?? "";
    const [pathname, ...queryParts] = raw.split("?");
    const key = request.headers["sec-websocket-key"];
    const protocol = request.headers["sec-websocket-protocol"];
    const connection = request.headers.connection?.toLowerCase().split(/\s*,\s*/);
    if (
      request.method !== "GET" ||
      !this.capabilityMatches(request.headers["x-sydney-proxy-capability"]) ||
      request.headers.host !== local.host ||
      request.headers.origin !== "null" ||
      request.headers.upgrade?.toLowerCase() !== "websocket" ||
      !connection?.includes("upgrade") ||
      request.headers["sec-websocket-version"] !== "13" ||
      typeof key !== "string" ||
      !/^[A-Za-z0-9+/]{22}==$/.test(key) ||
      Buffer.from(key, "base64").length !== 16 ||
      !SOCKET_PATH.test(pathname ?? "") ||
      raw.length > 16_384 ||
      /[\\#]/.test(raw) ||
      Array.from(raw).some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      ) ||
      request.headers["content-length"] !== undefined ||
      request.headers["transfer-encoding"] !== undefined ||
      (protocol !== undefined &&
        (typeof protocol !== "string" ||
          !/^[\w!#$%&'*+.^`|~,-]+(?:\s*,\s*[\w!#$%&'*+.^`|~-]+)*$/.test(protocol)))
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }

    const path = `/${pathname!.replace(/^\/+/, "")}${queryParts.length ? `?${queryParts.join("?")}` : ""}`;
    const expectedAccept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    const headers: Record<string, string> = {
      ...this.configuredHeaders,
      connection: "Upgrade",
      upgrade: "websocket",
      origin: "null",
      "sec-websocket-key": key,
      "sec-websocket-version": "13",
      ...(protocol ? { "sec-websocket-protocol": protocol } : {}),
    };
    const upstream = (this.remote.protocol === "https:" ? https : http).request({
      protocol: this.remote.protocol,
      hostname: this.remote.hostname,
      port: this.remote.port || undefined,
      method: "GET",
      path,
      headers,
      maxHeaderSize: 32_768,
    });
    this.requests.add(upstream);
    this.sockets.add(socket);
    let peer: Duplex | undefined;
    let upgraded = false;
    const timer = setTimeout(() => {
      upstream.destroy();
      socket.destroy();
      peer?.destroy();
    }, HANDSHAKE_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      this.requests.delete(upstream);
      this.sockets.delete(socket);
      if (peer) this.sockets.delete(peer);
    };
    socket.once("close", () => {
      upstream.destroy();
      peer?.destroy();
      cleanup();
    });
    upstream.once("error", () => {
      if (!socket.destroyed) socket.destroy();
      cleanup();
    });
    upstream.once("response", (response) => {
      response.destroy();
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      cleanup();
    });
    upstream.once("upgrade", (response, upstreamSocket, upstreamHead) => {
      peer = upstreamSocket;
      this.sockets.add(upstreamSocket);
      upstreamSocket.on("error", () => upstreamSocket.destroy());
      upstreamSocket.once("close", () => {
        socket.destroy();
        cleanup();
      });
      const chosenProtocol = response.headers["sec-websocket-protocol"];
      if (
        socket.destroyed ||
        response.statusCode !== 101 ||
        response.headers.upgrade?.toLowerCase() !== "websocket" ||
        !response.headers.connection
          ?.toLowerCase()
          .split(/\s*,\s*/)
          .includes("upgrade") ||
        response.headers["sec-websocket-accept"] !== expectedAccept ||
        (chosenProtocol !== undefined &&
          (typeof chosenProtocol !== "string" ||
            !protocol
              ?.split(",")
              .map((value) => value.trim())
              .includes(chosenProtocol))) ||
        response.headers["sec-websocket-extensions"] !== undefined
      ) {
        socket.destroy();
        upstreamSocket.destroy();
        cleanup();
        return;
      }
      clearTimeout(timer);
      upgraded = true;
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${expectedAccept}\r\n${chosenProtocol ? `Sec-WebSocket-Protocol: ${chosenProtocol}\r\n` : ""}\r\n`,
      );
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
    });
    upstream.once("close", () => {
      this.requests.delete(upstream);
      if (!upgraded && !socket.destroyed) socket.destroy();
    });
    upstream.end();
  }

  private capabilityMatches(actual: string | string[] | undefined) {
    if (this.capability === undefined) return true;
    const value = Array.isArray(actual) ? actual[0] : actual;
    if (typeof value !== "string") return false;
    const given = Buffer.from(value, "utf8");
    const wanted = Buffer.from(this.capability, "utf8");
    return given.length === wanted.length && timingSafeEqual(given, wanted);
  }

  stop() {
    for (const request of this.requests) request.destroy();
    for (const socket of this.sockets) socket.destroy();
    this.requests.clear();
    this.sockets.clear();
  }
}
