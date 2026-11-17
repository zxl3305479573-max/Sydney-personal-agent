import { randomBytes, timingSafeEqual } from "node:crypto";
import { open, realpath, stat } from "node:fs/promises";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { contentSecurityPolicyFor } from "@rakazo/contracts/content-security-policy";
import { isLoopbackHost } from "@rakazo/contracts/network-host";
import { bundledRendererHeaders, isRendererAssetMiss } from "./renderer-assets.js";
import { parseSetupInput, serverHeadersFor } from "./setup-config.js";
import { StandaloneScreenSocket } from "./standalone-screen-socket.js";

export interface StandaloneRendererProxyOptions {
  rendererRoot: string;
  remoteOrigin: string;
  setup?: unknown;
  /** Defaults to true; only tests that never emulate the Electron injector may disable it. */
  requireCapability?: boolean;
  logger?: { warn(message: string, bindings?: Record<string, unknown>): void };
  fetchImpl?: typeof fetch;
}

export const PROXY_CAPABILITY_HEADER = "x-sydney-proxy-capability";

const BACKEND_PATHS = ["/api", "/rpc", "/novnc", "/wuying", "/.well-known"];
const OPAQUE_SCREEN_ASSETS = new Set([
  "/wuying/screen.js",
  "/wuying/storage.js",
  "/wuying/WuyingWebSDK.js",
  "/wuying/sdk/ASP/container.html",
]);
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function remoteUrl(value: string) {
  try {
    const target = new URL(value);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash ||
      target.port === "0" ||
      value.trim() !== value ||
      /[\s\\]/.test(value) ||
      (value !== target.origin && value !== `${target.origin}/`)
    ) {
      throw new Error();
    }
    return target;
  } catch {
    throw new Error("remoteOrigin must be an HTTP(S) origin without credentials or a path");
  }
}

function requestPath(value: string): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\#]/.test(value) ||
    hasControlCharacters(value) ||
    value.includes(" ")
  )
    return null;
  const pathname = value.split("?", 1)[0]!;
  try {
    const decoded = decodeURIComponent(pathname);
    if (
      /[%\\:]/.test(decoded) ||
      hasControlCharacters(decoded) ||
      /%2f/i.test(pathname) ||
      decoded.split("/").some((part) => part === "." || part === ".." || /[. ]$/.test(part)) ||
      new URL(value, "http://127.0.0.1").pathname !== pathname
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string) {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

function capabilityMatches(actual: string | string[] | undefined, expected: string) {
  const value = Array.isArray(actual) ? actual[0] : actual;
  if (typeof value !== "string") return false;
  const given = Buffer.from(value, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function backendPath(pathname: string) {
  return BACKEND_PATHS.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function withinRoot(root: string, file: string) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function connectionHeaders(value: string | undefined) {
  return new Set([...HOP_HEADERS, ...(value?.toLowerCase().split(/\s*,\s*/) ?? [])]);
}

function trustedRequest(request: IncomingMessage, local: URL) {
  if (request.headers.host !== local.host) return false;
  const site = request.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== local.origin) return false;
  const referer = request.headers.referer;
  if (referer !== undefined) {
    try {
      const source = new URL(referer);
      if (source.origin !== local.origin || source.username || source.password) return false;
    } catch {
      return false;
    }
  }
  return request.method === "GET" || request.method === "HEAD" || !!origin || !!referer;
}

function opaqueScreenAsset(request: IncomingMessage, local: URL, raw: string) {
  const pathname = raw.split("?", 1)[0]!;
  const novncCapability =
    /^\/novnc\/session\/(?:view|control)\/\d{1,16}\.[A-Za-z0-9_-]{1,8192}\/.+$/.test(pathname);
  const fetchDestination = request.headers["sec-fetch-dest"];
  const allowedAsset =
    (OPAQUE_SCREEN_ASSETS.has(raw) &&
      (fetchDestination === "script" || fetchDestination === "iframe")) ||
    (novncCapability &&
      ["script", "style", "image", "font", "empty"].includes(fetchDestination ?? ""));
  return (
    request.headers.host === local.host &&
    (request.method === "GET" || request.method === "HEAD") &&
    allowedAsset &&
    request.headers["sec-fetch-site"] === "cross-site" &&
    (request.headers.origin === undefined || request.headers.origin === "null") &&
    (request.headers.referer === undefined || request.headers.referer === "")
  );
}

function upstreamHeaders(
  headers: IncomingHttpHeaders,
  remote: URL,
  anonymousScreenAsset: boolean,
  configured: Readonly<Record<string, string>>,
) {
  const omitted = connectionHeaders(headers.connection);
  const forwarded = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      omitted.has(name) ||
      name === "host" ||
      name === "content-length" ||
      name === "forwarded" ||
      name.startsWith("x-forwarded-") ||
      name.startsWith("sec-fetch-") ||
      name === PROXY_CAPABILITY_HEADER ||
      (anonymousScreenAsset && !["accept", "accept-language", "user-agent"].includes(name))
    )
      continue;
    forwarded.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  forwarded.set("accept-encoding", "identity");
  if (!anonymousScreenAsset && headers.origin) forwarded.set("origin", remote.origin);
  if (!anonymousScreenAsset && headers.referer) {
    const source = new URL(headers.referer);
    forwarded.set("referer", `${remote.origin}${source.pathname}${source.search}`);
  }
  for (const [name, value] of Object.entries(configured)) forwarded.set(name, value);
  return forwarded;
}

function localLocation(value: string, remote: URL) {
  if (
    value.trim() !== value ||
    value.includes("\\") ||
    value.includes(" ") ||
    hasControlCharacters(value) ||
    value.startsWith("//")
  )
    return null;
  try {
    const target = new URL(value, remote);
    if (target.origin !== remote.origin || target.username || target.password) return null;
    const destination = `${target.pathname}${target.search}`;
    return requestPath(destination) ? `${destination}${target.hash}` : null;
  } catch {
    return null;
  }
}

function localCookie(value: string) {
  return value
    .split(";")
    .filter((part, index) => index === 0 || !/^\s*domain\s*=/i.test(part))
    .join(";");
}

function fail(response: ServerResponse, status: number, message: string) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  for (const name of response.getHeaderNames()) response.removeHeader(name);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(message);
}

export class StandaloneRendererProxy {
  readonly websocketSupport = "screen-only" as const;
  readonly secureCookiePolicy = "preserve" as const;
  /** Only the Electron injector for this window may present it; never forwarded upstream. */
  readonly capability: string;
  private readonly remote: URL;
  private readonly serverHeaders: Readonly<Record<string, string>>;
  private readonly fetchImpl: typeof fetch;
  private readonly screenSocket: StandaloneScreenSocket;
  private server: Server | undefined;
  private localUrl: string | undefined;
  private lifecycle = Promise.resolve();
  private readonly sockets = new Set<Socket>();
  private readonly pending = new Set<AbortController>();

  constructor(private readonly options: StandaloneRendererProxyOptions) {
    if (!path.isAbsolute(options.rendererRoot)) {
      throw new Error("rendererRoot must be an absolute directory");
    }
    this.remote = remoteUrl(options.remoteOrigin);
    this.capability = randomBytes(32).toString("base64url");
    const setup = options.setup == null ? null : parseSetupInput(options.setup);
    if (options.setup != null && setup === null) {
      throw new Error("setup must be a valid desktop server configuration");
    }
    const configuredHeaders = setup ? serverHeadersFor(this.remote.origin, setup) : {};
    if (
      setup?.headers &&
      Object.keys(setup.headers).length > 0 &&
      setup.serverUrl !== this.remote.origin
    ) {
      throw new Error("setup server must match remoteOrigin when custom headers are configured");
    }
    if (
      Object.keys(configuredHeaders).length > 0 &&
      this.remote.protocol !== "https:" &&
      !isLoopbackHost(this.remote.hostname)
    ) {
      throw new Error("custom server headers require HTTPS except for loopback servers");
    }
    this.serverHeaders = Object.freeze(
      Object.fromEntries(
        Object.entries(configuredHeaders).map(([name, value]) => [name.toLowerCase(), value]),
      ),
    );
    this.screenSocket = new StandaloneScreenSocket(
      this.remote,
      this.serverHeaders,
      options.requireCapability === false ? undefined : this.capability,
    );
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  get url() {
    return this.localUrl;
  }

  start(): Promise<string> {
    const operation = this.lifecycle.then(async () => {
      if (this.localUrl) return this.localUrl;
      const root = await realpath(this.options.rendererRoot);
      if (!(await stat(root)).isDirectory()) throw new Error("rendererRoot must be a directory");
      const entry = await realpath(path.join(root, "index.html"));
      if (!withinRoot(root, entry) || !(await stat(entry)).isFile()) {
        throw new Error("renderer entry must be a file within rendererRoot");
      }
      const entryHandle = await open(entry, "r");
      await entryHandle.close();
      const server = createServer({ maxHeaderSize: 32_768 }, (request, response) => {
        void this.handle(request, response, root).catch(() => {
          this.warn("request_failed");
          fail(response, 500, "Local renderer unavailable");
        });
      });
      server.headersTimeout = 30_000;
      server.requestTimeout = 300_000;
      server.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.once("close", () => this.sockets.delete(socket));
      });
      server.on("upgrade", (request, socket, head) => {
        if (!this.localUrl) {
          socket.destroy();
          return;
        }
        this.screenSocket.handle(request, socket, head, new URL(this.localUrl));
      });
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        throw new Error("Loopback listener unavailable");
      }
      this.server = server;
      this.localUrl = `http://127.0.0.1:${address.port}`;
      server.on("error", () => this.warn("listener_failed"));
      return this.localUrl;
    });
    this.lifecycle = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }

  stop(): Promise<void> {
    const operation = this.lifecycle.then(async () => {
      this.localUrl = undefined;
      const server = this.server;
      this.server = undefined;
      this.screenSocket.stop();
      for (const controller of this.pending) controller.abort();
      for (const socket of this.sockets) socket.destroy();
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      }
    });
    this.lifecycle = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }

  private warn(reason: string) {
    this.options.logger?.warn("desktop.standalone_renderer.failure", { reason });
  }

  private async handle(request: IncomingMessage, response: ServerResponse, root: string) {
    const raw = request.url ?? "";
    const pathname = requestPath(raw);
    if (!pathname) return fail(response, 400, "Invalid request path");
    if (!this.localUrl) return fail(response, 403, "Request source rejected");
    if (
      this.options.requireCapability !== false &&
      !capabilityMatches(request.headers[PROXY_CAPABILITY_HEADER], this.capability)
    )
      return fail(response, 403, "Request source rejected");
    const local = new URL(this.localUrl);
    const anonymousScreenAsset = opaqueScreenAsset(request, local, raw);
    if (!trustedRequest(request, local) && !anonymousScreenAsset)
      return fail(response, 403, "Request source rejected");
    const method = request.method ?? "";
    if (!METHODS.has(method)) return fail(response, 405, "Method not allowed");
    if (
      (method === "GET" || method === "HEAD") &&
      (request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) !== 0)
    )
      return fail(response, 400, "Request body not allowed");
    if (backendPath(pathname)) {
      if (!backendPath(raw.split("?", 1)[0]!))
        return fail(response, 400, "Encoded backend prefix rejected");
      return this.forward(request, response, raw, anonymousScreenAsset);
    }
    if (method !== "GET" && method !== "HEAD") return fail(response, 405, "Method not allowed");
    if (pathname.split("/").some((part) => part.startsWith(".")))
      return fail(response, 404, "Local resource not found");
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const candidates = [path.resolve(root, requested)];
    const acceptsHtml = request.headers.accept?.split(",").some((type) => {
      const [mediaType, ...parameters] = type.trim().split(";");
      if (mediaType?.trim().toLowerCase() !== "text/html") return false;
      const quality = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
      if (!quality) return true;
      const value = quality.split("=")[1]?.trim() ?? "";
      return /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value) && Number(value) > 0;
    });
    if (
      pathname !== "/" &&
      acceptsHtml &&
      (!path.extname(pathname) ||
        (request.headers["sec-fetch-dest"] === "document" &&
          /^\/app\/(?:[^/]+|g\/[^/]+|projects\/[^/]+|artifacts\/[^/]+|x\/[^/]+)$/.test(
            pathname,
          ))) &&
      !pathname.startsWith("/assets/")
    )
      candidates.push(path.join(root, "index.html"));
    for (const candidate of candidates) {
      if (!withinRoot(root, candidate)) return fail(response, 403, "Local resource rejected");
      let file: string;
      try {
        file = await realpath(candidate);
      } catch (error) {
        if (isRendererAssetMiss(error)) continue;
        throw error;
      }
      if (!withinRoot(root, file)) return fail(response, 403, "Local resource rejected");
      if (!(await stat(file)).isFile()) continue;
      const handle = await open(file, "r");
      try {
        const metadata = await handle.stat();
        if (!metadata.isFile()) continue;
        const headers = bundledRendererHeaders(file, `${this.localUrl}${raw}`);
        for (const [name, value] of headers) response.setHeader(name, value);
        response.setHeader("content-length", metadata.size);
        response.setHeader("referrer-policy", "no-referrer");
        if (method === "HEAD") response.end();
        else await pipeline(handle.createReadStream({ autoClose: false }), response);
        return;
      } finally {
        await handle.close();
      }
    }
    fail(response, 404, "Local resource not found");
  }

  private async forward(
    request: IncomingMessage,
    response: ServerResponse,
    raw: string,
    anonymousScreenAsset: boolean,
  ) {
    const controller = new AbortController();
    this.pending.add(controller);
    const abort = () => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);
    const timeout = setTimeout(abort, 30_000);
    timeout.unref();
    const screenPrefix = backendPath(raw.split("?", 1)[0]!);
    const screenResponse = screenPrefix === "/novnc" || screenPrefix === "/wuying";
    try {
      const init: RequestInit & { duplex?: "half" } = {
        method: request.method,
        headers: upstreamHeaders(
          request.headers,
          this.remote,
          anonymousScreenAsset,
          this.serverHeaders,
        ),
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = Readable.toWeb(request) as RequestInit["body"];
        init.duplex = "half";
      }
      const upstream = await this.fetchImpl(new URL(raw, this.remote), init);
      clearTimeout(timeout);
      if (upstream.status < 200 || upstream.status > 599)
        throw new Error("Invalid upstream status");
      const omitted = connectionHeaders(upstream.headers.get("connection") ?? undefined);
      for (const name of [
        "content-length",
        "content-encoding",
        "location",
        "set-cookie",
        "refresh",
        "content-location",
      ])
        omitted.add(name);
      if (screenResponse) {
        omitted.add("set-cookie2");
        omitted.add("clear-site-data");
      }
      const encoding = upstream.headers.get("content-encoding")?.toLowerCase();
      if (encoding && !["identity", "gzip", "deflate", "br"].includes(encoding))
        throw new Error("Unsupported upstream encoding");
      for (const [name, value] of upstream.headers) {
        if (!omitted.has(name) && !name.startsWith("access-control-"))
          response.setHeader(name, value);
      }
      if (screenResponse) {
        const policy = response.getHeader("content-security-policy");
        response.setHeader("content-security-policy", [
          ...(policy === undefined
            ? []
            : Array.isArray(policy)
              ? policy.map(String)
              : [String(policy)]),
          ...(screenPrefix === "/wuying"
            ? [
                contentSecurityPolicyFor(
                  raw.split("?", 1)[0] === "/wuying"
                    ? "/wuying/"
                    : new URL(raw, this.remote).pathname,
                )!,
              ]
            : ["sandbox allow-scripts allow-pointer-lock"]),
        ]);
      }
      if (
        anonymousScreenAsset &&
        raw.startsWith("/novnc/session/") &&
        upstream.headers.get("access-control-allow-origin") === "*"
      ) {
        response.setHeader("access-control-allow-origin", "*");
      }
      const location = upstream.headers.get("location");
      if (location) {
        const rewritten = localLocation(location, new URL(raw, this.remote));
        if (
          rewritten &&
          (!screenResponse ||
            backendPath(new URL(rewritten, this.localUrl).pathname) === screenPrefix)
        )
          response.setHeader("location", rewritten);
      }
      const cookies =
        anonymousScreenAsset || screenResponse
          ? []
          : upstream.headers.getSetCookie().map(localCookie);
      if (cookies.length) response.setHeader("set-cookie", cookies);
      response.statusCode = upstream.status;
      response.flushHeaders();
      if (request.method === "HEAD" || !upstream.body) {
        await upstream.body?.cancel();
        response.end();
      } else {
        await pipeline(Readable.fromWeb(upstream.body), response, { signal: controller.signal });
      }
    } catch {
      this.warn("upstream_failed");
      fail(response, 502, "Backend unavailable");
    } finally {
      clearTimeout(timeout);
      request.removeListener("aborted", abort);
      response.removeListener("close", abort);
      controller.abort();
      this.pending.delete(controller);
    }
  }
}
