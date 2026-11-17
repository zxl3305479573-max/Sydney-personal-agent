import { randomUUID } from "node:crypto";
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import tls from "node:tls";
import {
  collectNovncHtml,
  injectNovncStorageShim,
  isNovncPage,
  MAX_NOVNC_HTML_BYTES,
  novncPageRequestHeaders,
  rewrittenNovncHeaders,
  shouldInjectNovncStorageShim,
} from "./novnc-html.js";
import type { ScreenTargetFailure } from "./screen-proxy.js";
import {
  checkScreenAuthorization,
  novncRequestPath,
  resolveNovncTarget,
  safeProxyHeaders,
  screenCapabilityExpiry,
  screenProbePath,
  screenProbeStatus,
  screenRefusal,
  screenUpstreamReachable,
  watchScreenAuthorization,
} from "./screen-proxy.js";
import {
  safeScreenProxyResponseHeaders,
  stripSensitiveHandshakeHeaders,
} from "./screen-proxy-response.js";

const SCREEN_UPSTREAM_TIMEOUT_MS = 20_000;

function screenPolicy(url: string | undefined) {
  return url?.startsWith("/novnc/session/control/") ? "control" : "view";
}

function socketErrorCode(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "UNKNOWN";
}

export function createNovncProxy({
  secret,
  api,
  logger,
  handshakeTimeoutMs = SCREEN_UPSTREAM_TIMEOUT_MS,
}: {
  secret: string;
  api: string;
  handshakeTimeoutMs?: number;
  logger: {
    warn(message: string, bindings?: Record<string, unknown>): void;
    info(message: string, bindings?: Record<string, unknown>): void;
  };
}) {
  async function handleHttp(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const path = novncRequestPath(req.url);
    if (!path) {
      next();
      return;
    }
    req.url = path;
    const connectionId = randomUUID();
    const bindings = {
      "screen.connection_id": connectionId,
      "screen.policy": screenPolicy(req.url),
    };
    const confirmedAt = performance.now();
    // A status-only probe is answered here, after the same access check, and never forwarded.
    const probe = screenProbePath(req.url);
    let refusal: ScreenTargetFailure | undefined;
    const target = await resolveNovncTarget(probe ?? req.url, secret, api, (reason) => {
      refusal = reason;
      logger.warn("screen.proxy.target_rejected", {
        ...bindings,
        "screen.transport": "http",
        reason,
      });
    });
    if (res.destroyed) return;
    if (probe) {
      // Only a connection attempt reaches the computer; the proxy writes the whole answer.
      const reachable = target ? await screenUpstreamReachable(target) : false;
      if (res.destroyed) return;
      res.statusCode = screenProbeStatus(target, refusal, reachable);
      res.setHeader("cache-control", "no-store");
      res.end();
      return;
    }
    if (!target) {
      const { status, body } = screenRefusal(refusal);
      res.statusCode = status;
      res.end(body);
      return;
    }
    const forwarded = safeProxyHeaders(req.headers, target);
    const headers = {
      // The storage shim rewrites the page, so ask for all of it, uncompressed.
      ...(isNovncPage(target.path) ? novncPageRequestHeaders(forwarded) : forwarded),
      host: `${target.hostname.includes(":") ? `[${target.hostname}]` : target.hostname}:${target.port}`,
    };
    const transport = target.protocol === "https:" ? https : http;
    let upstream: ClientRequest | undefined;
    let retries = 0;
    let retryPending = false;
    let stopChecking: () => void = () => undefined;
    const retryable = req.method === "GET";
    const scheduleRetry = (incoming?: IncomingMessage) => {
      if (!retryable || retryPending || retries >= 3 || res.destroyed) return false;
      retryPending = true;
      retries += 1;
      const delayMs = 50 * retries;
      const retry = () => {
        setTimeout(() => {
          retryPending = false;
          if (!res.destroyed) requestUpstream();
        }, delayMs);
      };
      if (incoming && !incoming.destroyed) {
        incoming.once("close", retry);
        incoming.destroy();
      } else {
        retry();
      }
      return true;
    };
    let downstreamFinished = false;
    const finishUnavailable = (reason: string, errorCode?: string) => {
      if (downstreamFinished || res.destroyed || res.writableEnded) return;
      downstreamFinished = true;
      logger.warn("screen.proxy.http_failed", {
        ...bindings,
        reason,
        ...(errorCode ? { "error.code": errorCode } : {}),
      });
      stopChecking();
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.statusCode = 502;
      res.end(`Screen unavailable (${reason})`);
    };
    const requestUpstream = () => {
      if (res.destroyed) return;
      upstream = transport.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.path,
          method: req.method,
          headers,
          ...(target.protocol === "https:" ? { servername: target.hostname } : {}),
        },
        (incoming) => {
          if ((incoming.statusCode ?? 502) >= 500 && scheduleRetry(incoming)) {
            return;
          }
          if ((incoming.statusCode ?? 502) >= 400) {
            logger.warn("screen.proxy.http_upstream_response", {
              ...bindings,
              "http.status": incoming.statusCode ?? 502,
              "screen.retries": retries,
            });
          }
          const responseHeaders = safeScreenProxyResponseHeaders(incoming.headers);
          if (shouldInjectNovncStorageShim(responseHeaders, target.path)) {
            const declaredLength = Number(incoming.headers["content-length"] ?? 0);
            if (Number.isFinite(declaredLength) && declaredLength > MAX_NOVNC_HTML_BYTES) {
              finishUnavailable("html_too_large");
              incoming.destroy();
              return;
            }
            void collectNovncHtml(incoming, MAX_NOVNC_HTML_BYTES)
              .then((html) => {
                if (downstreamFinished || res.destroyed || res.writableEnded) return;
                downstreamFinished = true;
                const body = injectNovncStorageShim(html, { viewOnly: !target.interactive });
                res.writeHead(incoming.statusCode ?? 502, rewrittenNovncHeaders(responseHeaders));
                res.end(body);
              })
              .catch(() => {
                finishUnavailable("html_read_failed");
              });
            return;
          }
          res.writeHead(incoming.statusCode ?? 502, responseHeaders);
          incoming.pipe(res);
        },
      );
      // A silent upstream would leave the frame blank for as long as the browser waits. The limit
      // covers only the wait for response headers; a slow or idle body after that keeps flowing.
      const request = upstream;
      const headersTimer = setTimeout(() => {
        finishUnavailable("upstream_timeout");
        request.destroy();
      }, SCREEN_UPSTREAM_TIMEOUT_MS);
      request.once("response", () => clearTimeout(headersTimer));
      request.once("close", () => clearTimeout(headersTimer));
      upstream.on("error", (error) => {
        if (
          retryable &&
          !downstreamFinished &&
          !res.headersSent &&
          !res.destroyed &&
          (retryPending || scheduleRetry())
        ) {
          return;
        }
        finishUnavailable("upstream_error", socketErrorCode(error));
      });
      if (req.method === "GET" || req.readableEnded) upstream.end();
      else req.pipe(upstream);
    };
    stopChecking = watchScreenAuthorization(
      () => checkScreenAuthorization(req.url, secret, api, target),
      (reason) => {
        logger.warn("screen.proxy.http_revoked", {
          ...bindings,
          "screen.revoke_reason": reason,
        });
        upstream?.destroy();
        res.destroy();
      },
      {
        confirmedAt,
        expiresAt: screenCapabilityExpiry(req.url),
        onUnavailable: (consecutive) =>
          logger.warn("screen.proxy.recheck_unavailable", {
            ...bindings,
            "screen.transport": "http",
            "screen.consecutive": consecutive,
          }),
      },
    );
    res.once("close", () => {
      stopChecking();
      upstream?.destroy();
    });
    requestUpstream();
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const path = novncRequestPath(req.url);
    if (!path) return;
    req.url = path;
    const connectionId = randomUUID();
    const startedAt = Date.now();
    const bindings = {
      "screen.connection_id": connectionId,
      "screen.policy": screenPolicy(req.url),
    };
    let closeInitiator: "client" | "upstream" | "revoked" | undefined;
    // Listen before the access check; the close handler below tears down the upstream.
    socket.on("error", (error) => {
      logger.warn("screen.proxy.websocket_error", {
        ...bindings,
        "screen.side": "client",
        "error.code": socketErrorCode(error),
      });
      closeInitiator ??= "client";
    });
    const confirmedAt = performance.now();
    const target = await resolveNovncTarget(req.url, secret, api, (reason) => {
      logger.warn("screen.proxy.target_rejected", {
        ...bindings,
        "screen.transport": "websocket",
        reason,
      });
    });
    if (socket.destroyed) return;
    if (!target) {
      socket.destroy();
      return;
    }
    const upstream =
      target.protocol === "https:"
        ? tls.connect({ port: target.port, host: target.hostname, servername: target.hostname })
        : net.connect(target.port, target.hostname);
    const handshakeTimer = setTimeout(() => {
      logger.warn("screen.proxy.websocket_handshake_failed", {
        ...bindings,
        reason: "upstream_timeout",
      });
      socket.destroy();
      upstream.destroy();
    }, handshakeTimeoutMs);
    let upgraded = false;
    let closed = false;
    const logClose = (side: "client" | "upstream") => {
      if (closed) return;
      closed = true;
      const durationMs = Date.now() - startedAt;
      const details = {
        ...bindings,
        "screen.upgraded": upgraded,
        "screen.duration_ms": durationMs,
        "screen.closed_by": closeInitiator ?? side,
      };
      if (!upgraded || durationMs < 5_000) logger.warn("screen.proxy.websocket_closed", details);
      else logger.info("screen.proxy.websocket_closed", details);
    };
    const stopChecking = watchScreenAuthorization(
      () => checkScreenAuthorization(req.url, secret, api, target),
      (reason) => {
        logger.warn("screen.proxy.websocket_revoked", {
          ...bindings,
          "screen.revoke_reason": reason,
        });
        closeInitiator ??= "revoked";
        socket.destroy();
        upstream.destroy();
      },
      {
        confirmedAt,
        expiresAt: screenCapabilityExpiry(req.url),
        onUnavailable: (consecutive) =>
          logger.warn("screen.proxy.recheck_unavailable", {
            ...bindings,
            "screen.transport": "websocket",
            "screen.consecutive": consecutive,
          }),
      },
    );
    socket.once("close", () => {
      clearTimeout(handshakeTimer);
      logClose("client");
      stopChecking();
      upstream.destroy();
    });
    upstream.once("close", () => {
      clearTimeout(handshakeTimer);
      logClose("upstream");
      stopChecking();
      socket.destroy();
    });
    upstream.once(target.protocol === "https:" ? "secureConnect" : "connect", () => {
      const headerLines = [
        `${req.method ?? "GET"} ${target.path} HTTP/1.1`,
        `Host: ${target.hostname.includes(":") ? `[${target.hostname}]` : target.hostname}:${target.port}`,
      ];
      for (const [key, value] of Object.entries(safeProxyHeaders(req.headers, target))) {
        headerLines.push(`${key}: ${Array.isArray(value) ? value.join(",") : value}`);
      }
      upstream.write(`${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      const responseChunks: Buffer[] = [];
      let responseSize = 0;
      let responseTail = Buffer.alloc(0);
      const forwardHandshake = (chunk: Buffer) => {
        responseChunks.push(chunk);
        responseSize += chunk.length;
        if (responseSize > 64 * 1024) {
          logger.warn("screen.proxy.websocket_handshake_failed", {
            ...bindings,
            reason: "header_too_large",
          });
          socket.destroy();
          upstream.destroy();
          return;
        }
        const boundarySearch = Buffer.concat([responseTail, chunk]);
        if (boundarySearch.indexOf("\r\n\r\n") < 0) {
          responseTail = Buffer.from(boundarySearch.subarray(-3));
          return;
        }
        const responseHead = Buffer.concat(responseChunks, responseSize);
        const safe = stripSensitiveHandshakeHeaders(responseHead);
        if (!safe) {
          logger.warn("screen.proxy.websocket_handshake_failed", {
            ...bindings,
            reason: "malformed_response",
          });
          socket.destroy();
          upstream.destroy();
          return;
        }
        clearTimeout(handshakeTimer);
        const status = Number(
          responseHead
            .toString("latin1", 0, responseHead.indexOf("\r\n"))
            .match(/^HTTP\/1\.\d (\d{3})/)?.[1] ?? 0,
        );
        if (status !== 101) {
          logger.warn("screen.proxy.websocket_handshake_failed", {
            ...bindings,
            reason: "upstream_status",
            "http.status": status,
          });
          socket.end(safe, () => upstream.destroy());
          return;
        } else {
          upgraded = true;
          logger.info("screen.proxy.websocket_upgraded", {
            ...bindings,
            "screen.duration_ms": Date.now() - startedAt,
          });
        }
        upstream.off("data", forwardHandshake);
        socket.write(safe);
        upstream.pipe(socket);
      };
      upstream.on("data", forwardHandshake);
    });
    upstream.on("error", (error) => {
      logger.warn("screen.proxy.websocket_error", {
        ...bindings,
        "screen.side": "upstream",
        "error.code": socketErrorCode(error),
      });
      closeInitiator ??= "upstream";
      socket.destroy();
    });
  }

  return { handleHttp, handleUpgrade };
}
