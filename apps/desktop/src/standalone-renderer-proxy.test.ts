import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer, request } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { gzipSync } from "node:zlib";
import {
  APP_CONTENT_SECURITY_POLICY,
  CSP_REPORTING_ENDPOINTS,
} from "@rakazo/contracts/content-security-policy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRakazoHealth } from "./setup-config.js";
import { StandaloneRendererProxy } from "./standalone-renderer-proxy.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bodyOf(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

function rawRequest(
  origin: string,
  pathname: string,
  headers: Record<string, string | undefined> = {},
) {
  return new Promise<{ status: number; body: string; headers: IncomingMessage["headers"] }>(
    (resolve, reject) => {
      const outgoing = request(
        `${origin}/`,
        { path: pathname, headers, agent: false },
        (response) => {
          void bodyOf(response).then(
            (body) => resolve({ status: response.statusCode!, body, headers: response.headers }),
            reject,
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.end();
    },
  );
}

describe("standalone renderer loopback proxy", () => {
  let directory: string;
  let root: string;
  let upstream: Server;
  let remoteOrigin: string;
  let proxy: StandaloneRendererProxy;
  let origin: string;
  let upstreamCalls: string[];
  let upstreamHandler: (request: IncomingMessage, response: ServerResponse) => void;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sydney-renderer-proxy-"));
    root = path.join(directory, "renderer");
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "index.html"), "<!doctype html><title>Local Sydney</title>");
    await writeFile(path.join(root, "assets", "app-123.js"), "export const local = true;");
    upstreamCalls = [];
    upstreamHandler = (_request, response) => response.end("synthetic backend");
    upstream = createServer((request, response) => {
      upstreamCalls.push(request.url!);
      upstreamHandler(request, response);
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("Missing upstream port");
    remoteOrigin = `http://127.0.0.1:${address.port}`;
    proxy = new StandaloneRendererProxy({
      rendererRoot: root,
      remoteOrigin,
      requireCapability: false,
    });
    origin = await proxy.start();
  });

  async function restartWithSetup(setup: unknown) {
    await proxy.stop();
    proxy = new StandaloneRendererProxy({
      rendererRoot: root,
      remoteOrigin,
      setup,
      requireCapability: false,
    });
    origin = await proxy.start();
  }

  async function restartWithCapability() {
    await proxy.stop();
    proxy = new StandaloneRendererProxy({ rendererRoot: root, remoteOrigin });
    origin = await proxy.start();
    return proxy.capability;
  }

  afterEach(async () => {
    await proxy.stop();
    await new Promise<void>((resolve) => {
      upstream.close(() => resolve());
      upstream.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
  });

  it("serves only bundled index, application routes and assets with existing security metadata", async () => {
    expect(new URL(origin).hostname).toBe("127.0.0.1");
    expect(new URL(origin).port).not.toBe("");
    expect(proxy.url).toBe(origin);
    for (const pathname of ["/", "/bots/test?tab=chat", "/app/bot.name?tab=chat"]) {
      const response = await fetch(`${origin}${pathname}`, {
        headers: { accept: "text/html", "sec-fetch-dest": "document" },
      });
      expect(await response.text()).toContain("Local Sydney");
      expect(response.headers.get("content-security-policy")).toBe(APP_CONTENT_SECURITY_POLICY);
      expect(response.headers.get("reporting-endpoints")).toBe(CSP_REPORTING_ENDPOINTS);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    const asset = await fetch(`${origin}/assets/app-123.js`);
    expect(await asset.text()).toBe("export const local = true;");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    const head = await fetch(`${origin}/assets/app-123.js`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-length")).toBe("26");
    expect(upstreamCalls).toEqual([]);
  });

  it("loads the bundled app and reaches backend health without a remote web service", async () => {
    upstreamHandler = (request, response) => {
      if (request.url === "/rpc/health" && request.method === "POST") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ json: { ok: true, version: "0.1.0" } }));
      } else {
        response.writeHead(404).end("No remote web service");
      }
    };
    const appResponse = await fetch(`${origin}/app`, { headers: { accept: "text/html" } });
    expect(appResponse.status).toBe(200);
    expect(await appResponse.text()).toContain("Local Sydney");
    const assetResponse = await fetch(`${origin}/assets/app-123.js`);
    expect(await assetResponse.text()).toContain("local = true");
    const healthResponse = await fetch(`${origin}/rpc/health`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: '{"json":{}}',
    });
    expect(isRakazoHealth(await healthResponse.json())).toBe(true);
    expect(upstreamCalls).toEqual(["/rpc/health"]);
  });

  it("does not treat missing dotted assets or unknown deep paths as app navigations", async () => {
    for (const [pathname, destination] of [
      ["/app/missing.js", "script"],
      ["/app/unknown/deep.name", "document"],
    ]) {
      const response = await fetch(`${origin}${pathname}`, {
        headers: { accept: "text/html", "sec-fetch-dest": destination! },
      });
      expect(response.status).toBe(404);
    }
    const refused = await fetch(`${origin}/app/bot.name`, {
      headers: { accept: "text/html;q=0", "sec-fetch-dest": "document" },
    });
    expect(refused.status).toBe(404);
    expect(upstreamCalls).toEqual([]);
  });

  it.each([
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets/../../secret.txt",
    "/%2e%2e%2fsecret.txt",
    "/assets%5c..%5csecret.txt",
    "/%252e%252e/secret.txt",
    "/bad%00name",
    "/bad%encoding",
    "/C:/secret.txt",
    "/assets/app-123.js.",
    "//evil.example/api",
    "http://evil.example/api",
    "/foo%2f..%2fapi/secret",
    "/rpc%2fsecret",
  ])("rejects ambiguous or escaping request target %s", async (pathname) => {
    const response = await rawRequest(origin, pathname, { accept: "text/html" });
    expect(response.status).toBe(400);
    expect(upstreamCalls).toEqual([]);
  });

  it("rejects symlink or junction escape without falling back to index", async () => {
    const outside = path.join(directory, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "secret.txt"), "private fixture");
    await symlink(
      outside,
      path.join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    for (const pathname of ["/escape/secret.txt", "/escape"]) {
      const response = await fetch(`${origin}${pathname}`, { headers: { accept: "text/html" } });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("private fixture");
    }
    expect(upstreamCalls).toEqual([]);
  });

  it("never falls back to upstream HTML for missing local files or missing index", async () => {
    upstreamHandler = (_request, response) => response.end("<html>remote Web UI</html>");
    for (const pathname of ["/assets/missing.js", "/missing.css", "/.env", "/apiary"]) {
      const response = await fetch(`${origin}${pathname}`, { headers: { accept: "text/html" } });
      expect(response.status).toBe(pathname === "/apiary" ? 200 : 404);
      expect(await response.text()).not.toContain("remote Web UI");
    }
    await rm(path.join(root, "index.html"));
    const response = await fetch(`${origin}/`, { headers: { accept: "text/html" } });
    expect(response.status).toBe(404);
    expect(upstreamCalls).toEqual([]);
  });

  it("handles directory-shaped app routes locally without treating directories as files", async () => {
    await mkdir(path.join(root, "bots"));
    const page = await fetch(`${origin}/bots/`, { headers: { accept: "text/html" } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Local Sydney");
    const assetDirectory = await fetch(`${origin}/assets/`, { headers: { accept: "text/html" } });
    expect(assetDirectory.status).toBe(404);
    expect(upstreamCalls).toEqual([]);
  });

  it.each([undefined, "sandbox allow-scripts allow-same-origin"])(
    "adds an opaque sandbox to screen responses with upstream policy %s",
    async (policy) => {
      upstreamHandler = (_request, response) => {
        if (policy) response.setHeader("content-security-policy", policy);
        response.setHeader("set-cookie", "synthetic=bad");
        response.setHeader("set-cookie2", "synthetic2=bad");
        response.setHeader("clear-site-data", '"cookies"');
        response.end("<html>synthetic screen</html>");
      };
      const response = await fetch(`${origin}/novnc/session/view`);
      const actual = response.headers.get("content-security-policy");
      expect(actual).toContain("sandbox allow-scripts allow-pointer-lock");
      if (policy) expect(actual).toContain(policy);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.has("set-cookie2")).toBe(false);
      expect(response.headers.has("clear-site-data")).toBe(false);
    },
  );

  it("keeps screen redirects within the protected screen path", async () => {
    for (const [location, expected] of [
      ["/novnc/next", "/novnc/next"],
      ["/novnc#section", "/novnc#section"],
      ["/novnc?x=1#section", "/novnc?x=1#section"],
      ["/app", null],
    ]) {
      upstreamHandler = (_request, response) => {
        response.writeHead(302, { location: location! }).end();
      };
      const response = await fetch(`${origin}/novnc/session/view`, { redirect: "manual" });
      expect(response.headers.get("location")).toBe(expected);
    }
  });

  it.each(["/wuying", "/wuying/screen.html"])(
    "enforces Wuying policy and filters state changes for %s when upstream omits CSP",
    async (pathname) => {
      upstreamHandler = (_request, response) => {
        response.setHeader("set-cookie", "synthetic=bad");
        response.setHeader("clear-site-data", '"cookies"');
        response.end("<html>synthetic screen</html>");
      };
      const response = await fetch(`${origin}${pathname}`);
      expect(response.headers.get("content-security-policy")).toContain(
        "sandbox allow-scripts allow-pointer-lock",
      );
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.has("clear-site-data")).toBe(false);
    },
  );

  it.each([
    "/%61pi/login",
    "/%72pc/bots",
    "/%6eovnc/session",
    "/%77uying/screen.html",
    "/.%77ell-known/custom",
  ])(
    "rejects encoded backend prefixes instead of requesting an upstream UI route: %s",
    async (pathname) => {
      expect((await rawRequest(origin, pathname)).status).toBe(400);
      expect(upstreamCalls).toEqual([]);
    },
  );

  it.each([
    "/api",
    "/rpc/bots?query=a%2Bb&query=c",
    "/novnc/session/view",
    "/wuying/screen.html",
    "/.well-known/custom",
  ])("forwards only backend route %s with its original query", async (pathname) => {
    const response = await fetch(`${origin}${pathname}`);
    expect(await response.text()).toBe("synthetic backend");
    expect(upstreamCalls).toEqual([pathname]);
  });

  it("rewrites trusted source headers, preserves explicit credentials and strips proxy headers", async () => {
    expect(proxy.secureCookiePolicy).toBe("preserve");
    const received = deferred<{ body: string; headers: IncomingMessage["headers"] }>();
    upstreamHandler = (request, response) => {
      void bodyOf(request).then((body) => {
        received.resolve({ body, headers: request.headers });
        response.setHeader("set-cookie", [
          "session=fake; Domain=example.test; Path=/; HttpOnly; Secure; SameSite=None",
          "refresh=fake; domain=.example.test; Path=/api; HttpOnly; Max-Age=60",
          "__Host-session=fake; Path=/; Secure; HttpOnly; SameSite=Lax",
        ]);
        response.setHeader("access-control-allow-origin", "https://evil.example");
        response.setHeader("connection", "keep-alive, x-internal");
        response.setHeader("x-internal", "not end-to-end");
        response.end(body);
      });
    };
    const response = await fetch(`${origin}/rpc/bots?state=fake`, {
      method: "POST",
      headers: {
        origin,
        referer: `${origin}/bots/test?tab=chat`,
        cookie: "session=fake-cookie",
        authorization: "Bearer fake-auth",
        "content-type": "application/json",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
        forwarded: "host=attacker.example",
      },
      body: '{"message":"hello"}',
    });
    expect(await response.text()).toBe('{"message":"hello"}');
    const result = await received.promise;
    expect(result.headers).toMatchObject({
      host: new URL(remoteOrigin).host,
      origin: remoteOrigin,
      referer: `${remoteOrigin}/bots/test?tab=chat`,
      cookie: "session=fake-cookie",
      authorization: "Bearer fake-auth",
      "accept-encoding": "identity",
    });
    expect(result.headers["x-forwarded-host"]).toBeUndefined();
    expect(result.headers.forwarded).toBeUndefined();
    expect(response.headers.getSetCookie()).toEqual([
      "session=fake; Path=/; HttpOnly; Secure; SameSite=None",
      "refresh=fake; Path=/api; HttpOnly; Max-Age=60",
      "__Host-session=fake; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-internal")).toBeNull();
  });

  it("sends an immutable server-header snapshot only to its matching HTTP backend", async () => {
    const configured = { "x-gateway-key": "configured-secret" };
    const setup = { mode: "existing", serverUrl: remoteOrigin, headers: configured };
    await restartWithSetup(setup);
    configured["x-gateway-key"] = "mutated-after-construction";
    const received = deferred<IncomingMessage["headers"]>();
    upstreamHandler = (request, response) => {
      received.resolve(request.headers);
      response.end("ok");
    };
    const response = await fetch(`${origin}/api/config`, {
      headers: { origin, "X-Gateway-Key": "page-controlled" },
    });
    expect(await response.text()).toBe("ok");
    expect((await received.promise)["x-gateway-key"]).toBe("configured-secret");
    expect(upstreamCalls).toEqual(["/api/config"]);
  });

  it("does not follow cross-origin redirects carrying configured server headers", async () => {
    await restartWithSetup({
      mode: "existing",
      serverUrl: remoteOrigin,
      headers: { "x-gateway-key": "configured-secret" },
    });
    const received = deferred<IncomingMessage["headers"]>();
    upstreamHandler = (request, response) => {
      received.resolve(request.headers);
      response.writeHead(302, { location: "https://evil.example/collect" }).end();
    };
    const response = await fetch(`${origin}/api/redirect`, {
      redirect: "manual",
      headers: { origin },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeNull();
    expect((await received.promise)["x-gateway-key"]).toBe("configured-secret");
    expect(upstreamCalls).toEqual(["/api/redirect"]);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "forwards %s bodies and method",
    async (method) => {
      upstreamHandler = (request, response) => {
        void bodyOf(request).then((body) => response.end(`${request.method}:${body}`));
      };
      const response = await fetch(`${origin}/api/echo`, {
        method,
        headers: { origin },
        body: "payload",
      });
      expect(await response.text()).toBe(`${method}:payload`);
    },
  );

  it.each([
    { origin: "https://evil.example" },
    { origin: "null" },
    { referer: "https://evil.example/page" },
    { "sec-fetch-site": "cross-site" },
    { host: "evil.example" },
  ])("rejects untrusted browser sources before forwarding: %j", async (headers) => {
    const response = await rawRequest(origin, "/api/session", headers);
    expect(response.status).toBe(403);
    expect(upstreamCalls).toEqual([]);
  });

  it("allows fixed opaque-screen assets without renderer credentials or set-cookie", async () => {
    await restartWithSetup({
      mode: "existing",
      serverUrl: remoteOrigin,
      headers: { "x-service-key": "configured-secret" },
    });
    const received = deferred<IncomingMessage["headers"]>();
    upstreamHandler = (request, response) => {
      received.resolve(request.headers);
      response.setHeader("Set-Cookie", "injected=fixture; Path=/");
      response.end("synthetic asset");
    };
    const headers = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-dest": "script",
      origin: "null",
      cookie: "session=secret",
      authorization: "Bearer secret",
      "x-api-key": "secret",
      "x-service-key": "page-controlled",
    };
    const result = await rawRequest(origin, "/wuying/screen.js", headers);
    expect(result.status).toBe(200);
    expect(result.headers["set-cookie"]).toBeUndefined();
    const sent = await received.promise;
    expect(sent.cookie).toBeUndefined();
    expect(sent.authorization).toBeUndefined();
    expect(sent["x-api-key"]).toBeUndefined();
    expect(sent["x-service-key"]).toBe("configured-secret");
    expect(sent.origin).toBeUndefined();
    expect(sent.referer).toBeUndefined();
    for (const pathname of [
      "/api/session",
      "/wuying/screen.js?x=1",
      "/wuying/screen.html",
      "/wuying/unknown.js",
    ]) {
      expect((await rawRequest(origin, pathname, headers)).status).toBe(403);
    }
    expect(
      (await rawRequest(origin, "/wuying/screen.js", { ...headers, origin: "https://evil.test" }))
        .status,
    ).toBe(403);
    expect(
      (await rawRequest(origin, "/wuying/screen.js", { ...headers, "sec-fetch-dest": "empty" }))
        .status,
    ).toBe(403);
    expect(upstreamCalls).toEqual(["/wuying/screen.js"]);
  });

  it("forwards noVNC capability resources with configured headers and wildcard CORS", async () => {
    await restartWithSetup({
      mode: "existing",
      serverUrl: remoteOrigin,
      headers: { "x-service-key": "configured-secret" },
    });
    const received = deferred<IncomingMessage["headers"]>();
    upstreamHandler = (request, response) => {
      received.resolve(request.headers);
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-allow-credentials", "true");
      response.setHeader("set-cookie", "injected=fixture");
      response.end("module");
    };
    const headers = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-dest": "script",
      origin: "null",
      cookie: "session=secret",
      authorization: "Bearer secret",
      "x-service-key": "page-controlled",
    };
    const resource = "/novnc/session/view/9999999999999.synthetic/core/rfb.js?v=1";
    const result = await rawRequest(origin, resource, headers);
    expect(result.status).toBe(200);
    expect(result.headers["access-control-allow-origin"]).toBe("*");
    expect(result.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(result.headers["set-cookie"]).toBeUndefined();
    const forwarded = await received.promise;
    expect(forwarded.cookie).toBeUndefined();
    expect(forwarded.authorization).toBeUndefined();
    expect(forwarded["x-service-key"]).toBe("configured-secret");
    for (const pathname of [
      "/novnc/session/view/not-a-capability/core/rfb.js",
      "/novnc/session/other/9999999999999.synthetic/core/rfb.js",
      "/api/session",
    ])
      expect((await rawRequest(origin, pathname, headers)).status).toBe(403);
    expect(
      (await rawRequest(origin, resource, { ...headers, origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(
      (await rawRequest(origin, resource, { ...headers, referer: "https://evil.example/" })).status,
    ).toBe(403);
    const write = await fetch(`${origin}${resource}`, {
      method: "POST",
      headers,
    });
    expect(write.status).toBe(403);
    expect(upstreamCalls).toEqual([resource]);
  });

  it("does not forward non-wildcard noVNC CORS responses", async () => {
    upstreamHandler = (_request, response) => {
      response.setHeader("access-control-allow-origin", "https://evil.example");
      response.end("module");
    };
    const result = await rawRequest(
      origin,
      "/novnc/session/view/9999999999999.synthetic/core/rfb.js",
      {
        "sec-fetch-site": "cross-site",
        "sec-fetch-dest": "script",
        origin: "null",
      },
    );
    expect(result.status).toBe(200);
    expect(result.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects unattributed writes and unsupported methods", async () => {
    expect((await fetch(`${origin}/rpc/write`, { method: "POST", body: "blocked" })).status).toBe(
      403,
    );
    const response = await new Promise<number>((resolve, reject) => {
      const outgoing = request(
        `${origin}/api/write`,
        { method: "TRACE", headers: { origin } },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      outgoing.on("error", reject);
      outgoing.end();
    });
    expect(response).toBe(405);
    expect(upstreamCalls).toEqual([]);
  });

  it("passes SSE chunks before upstream completion and aborts upstream on stop", async () => {
    const closed = deferred<void>();
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      response.write("data: first\n\n");
      response.once("close", () => closed.resolve());
    };
    const response = await fetch(`${origin}/rpc/stream`);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: first\n\n");
    await proxy.stop();
    await closed.promise;
    await expect(reader.read()).rejects.toThrow();
    expect(proxy.url).toBeUndefined();
  });

  it("streams upload chunks before the request is complete", async () => {
    const firstChunk = deferred<string>();
    const complete = deferred<string>();
    upstreamHandler = (request, response) => {
      request.once("data", (chunk: Buffer) => firstChunk.resolve(chunk.toString()));
      void bodyOf(request).then((body) => {
        complete.resolve(body);
        response.end("received");
      });
    };
    const outgoing = request(`${origin}/api/upload`, {
      method: "POST",
      headers: { origin },
      agent: false,
    });
    const result = new Promise<string>((resolve, reject) => {
      outgoing.on("response", (response) => {
        void bodyOf(response).then(resolve, reject);
      });
      outgoing.on("error", reject);
    });
    outgoing.write("first-");
    expect(await firstChunk.promise).toBe("first-");
    outgoing.end("last");
    expect(await complete.promise).toBe("first-last");
    expect(await result).toBe("received");
  });

  it.each(["absolute", "relative"])(
    "rewrites %s same-service Location without following it",
    async (kind) => {
      upstreamHandler = (_request, response) => {
        response.writeHead(302, {
          location: `${kind === "absolute" ? remoteOrigin : ""}/bots/one?state=fake#chat`,
        });
        response.end("redirect");
      };
      const response = await fetch(`${origin}/api/login`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/bots/one?state=fake#chat");
      expect(upstreamCalls).toEqual(["/api/login"]);
    },
  );

  it("resolves a relative Location against the actual upstream request path", async () => {
    upstreamHandler = (_request, response) => {
      response.writeHead(303, { location: "complete?code=fake" });
      response.end();
    };
    const response = await fetch(`${origin}/api/auth/start`, { redirect: "manual" });
    expect(response.headers.get("location")).toBe("/api/auth/complete?code=fake");
  });

  it("cancels an active upstream stream when its client disconnects", async () => {
    const closed = deferred<void>();
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: ready\n\n");
      response.once("close", () => closed.resolve());
    };
    const response = await fetch(`${origin}/api/stream`);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await closed.promise;
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  it("forwards HEAD and bodyless status responses without adding a body", async () => {
    upstreamHandler = (request, response) => {
      response.writeHead(request.method === "HEAD" ? 200 : 204, { "x-backend": "synthetic" });
      response.end();
    };
    const head = await fetch(`${origin}/api/head`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("x-backend")).toBe("synthetic");
    expect(await head.text()).toBe("");
    const empty = await fetch(`${origin}/api/empty`);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
  });

  it("aborts a pending upstream fetch during stop without awaiting upstream headers", async () => {
    await proxy.stop();
    const pending = deferred<AbortSignal>();
    const aborted = deferred<void>();
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init!.signal!;
        signal.addEventListener(
          "abort",
          () => {
            aborted.resolve();
            reject(new Error("aborted"));
          },
          { once: true },
        );
        pending.resolve(signal);
      });
    proxy = new StandaloneRendererProxy({
      rendererRoot: root,
      remoteOrigin,
      fetchImpl,
      requireCapability: false,
    });
    origin = await proxy.start();
    const response = fetch(`${origin}/api/pending`).catch(() => null);
    const signal = await pending.promise;
    await proxy.stop();
    await aborted.promise;
    expect(signal.aborted).toBe(true);
    expect(await response).toBeNull();
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "javascript:alert(1)",
    "data:text/html,evil",
    "/%2f%2fevil.example",
    "/%5cevil.example",
  ])("removes unsafe Location %s without contacting it", async (location) => {
    upstreamHandler = (_request, response) => {
      response.writeHead(302, { location, refresh: "0;url=https://evil.example" });
      response.end();
    };
    const response = await fetch(`${origin}/api/login`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("refresh")).toBeNull();
    expect(upstreamCalls).toEqual(["/api/login"]);
  });

  it.each([401, 403, 404, 429, 503])(
    "preserves backend error status %s without UI fallback",
    async (status) => {
      upstreamHandler = (_request, response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end('{"error":"synthetic"}');
      };
      const response = await fetch(`${origin}/api/failure`);
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('{"error":"synthetic"}');
    },
  );

  it("does not send stale compression headers after native fetch decodes the body", async () => {
    upstreamHandler = (_request, response) => {
      const body = gzipSync("decoded response");
      response.writeHead(200, { "content-encoding": "gzip", "content-length": body.length });
      response.end(body);
    };
    const response = await fetch(`${origin}/api/compressed`);
    expect(await response.text()).toBe("decoded response");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
  });

  it("uses injected fetch only for backend traffic and never logs sensitive request or error data", async () => {
    await proxy.stop();
    const warn = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("fake-token fake-code fake-state fake-cookie"));
    proxy = new StandaloneRendererProxy({
      rendererRoot: root,
      remoteOrigin,
      logger: { warn },
      fetchImpl,
      requireCapability: false,
    });
    origin = await proxy.start();
    expect((await fetch(`${origin}/`)).status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
    const response = await fetch(
      `${origin}/api/failure?token=fake-token&code=fake-code&state=fake-state`,
      { headers: { cookie: "fake-cookie" } },
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Backend unavailable");
    const serialized = JSON.stringify(warn.mock.calls);
    for (const secret of ["fake-token", "fake-code", "fake-state", "fake-cookie"])
      expect(serialized).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith("desktop.standalone_renderer.failure", {
      reason: "upstream_failed",
    });
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ redirect: "manual", credentials: "omit" });
  });

  it("rejects non-capability WebSocket upgrades promptly, with no upstream handshake", async () => {
    expect(proxy.websocketSupport).toBe("screen-only");
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(new URL(origin).port), "127.0.0.1");
      let result = "";
      socket.setTimeout(2_000, () => socket.destroy(new Error("Upgrade hung")));
      socket.on("error", reject);
      socket.on("data", (chunk) => {
        result += chunk.toString();
      });
      socket.on("end", () => {
        socket.destroy();
        resolve(result);
      });
      socket.on("connect", () =>
        socket.write(
          `GET /novnc/session/socket HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
        ),
      );
    });
    expect(response).toContain("403 Forbidden");
    expect(response).toContain("Connection: close");
    expect(upstreamCalls).toEqual([]);
  });

  it("relays only a validated screen handshake and bidirectional bytes without credentials", async () => {
    await restartWithSetup({
      mode: "existing",
      serverUrl: remoteOrigin,
      headers: { "x-gateway-key": "configured-secret" },
    });
    const received = deferred<{ url: string | undefined; headers: IncomingMessage["headers"] }>();
    const receivedBytes = deferred<string>();
    upstream.on("upgrade", (incoming, socket, head) => {
      socket.on("end", () => socket.destroy());
      received.resolve({ url: incoming.url, headers: incoming.headers });
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\nSet-Cookie: injected=bad\r\n\r\nserver-bytes",
      );
      if (head.length) receivedBytes.resolve(head.toString());
      else socket.once("data", (chunk) => receivedBytes.resolve(chunk.toString()));
    });
    const client = connect(Number(new URL(origin).port), "127.0.0.1");
    const data = deferred<string>();
    let result = "";
    client.on("data", (chunk) => {
      result += chunk.toString();
      if (result.includes("server-bytes")) data.resolve(result);
    });
    client.on("error", () => {});
    client.once("connect", () => {
      client.write(
        `GET //novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nCookie: session=secret\r\nAuthorization: Bearer secret\r\nX-Gateway-Key: page-controlled\r\n\r\nclient-bytes`,
      );
    });
    const response = await data.promise;
    expect(response).toContain("101 Switching Protocols");
    expect(response).not.toContain("Set-Cookie");
    expect(await receivedBytes.promise).toBe("client-bytes");
    const forwarded = await received.promise;
    expect(forwarded.url).toBe("/novnc/session/view/9999999999999.synthetic/websockify");
    expect(forwarded.headers.cookie).toBeUndefined();
    expect(forwarded.headers.authorization).toBeUndefined();
    expect(forwarded.headers["x-gateway-key"]).toBe("configured-secret");
    await proxy.stop();
    expect(
      client.destroyed ||
        (await new Promise<boolean>((resolve) => client.once("close", () => resolve(true)))),
    ).toBe(true);
  });

  it("does not follow a screen WebSocket redirect carrying configured headers", async () => {
    await restartWithSetup({
      mode: "existing",
      serverUrl: remoteOrigin,
      headers: { "x-gateway-key": "configured-secret" },
    });
    const received = deferred<IncomingMessage["headers"]>();
    upstream.on("upgrade", (request, socket) => {
      upstreamCalls.push(request.url!);
      received.resolve(request.headers);
      socket.end(
        "HTTP/1.1 302 Found\r\nLocation: https://evil.example/collect\r\nSet-Cookie: injected=secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      );
    });
    const result = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(origin).port), "127.0.0.1");
      let receivedText = "";
      client.setTimeout(2_000, () => client.destroy(new Error("Upgrade hung")));
      client.on("error", reject);
      client.on("data", (chunk) => {
        receivedText += chunk.toString();
      });
      client.once("close", () => resolve(receivedText));
      client.once("connect", () =>
        client.write(
          `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nX-Gateway-Key: page-controlled\r\n\r\n`,
        ),
      );
    });
    expect(result).toContain("502 Bad Gateway");
    expect(result).not.toContain("evil.example");
    expect(result).not.toContain("Set-Cookie");
    expect((await received.promise)["x-gateway-key"]).toBe("configured-secret");
    expect(upstreamCalls).toEqual(["/novnc/session/view/9999999999999.synthetic/websockify"]);
  });

  it("rejects invalid screen sources and paths before opening an upstream connection", async () => {
    let upgrades = 0;
    upstream.on("upgrade", (_incoming, socket) => {
      upgrades++;
      socket.destroy();
    });
    const exchange = (pathname: string, requestOrigin: string) =>
      new Promise<string>((resolve, reject) => {
        const socket = connect(Number(new URL(origin).port), "127.0.0.1");
        let response = "";
        socket.setTimeout(2_000, () => socket.destroy(new Error("Upgrade hung")));
        socket.on("error", reject);
        socket.on("data", (chunk) => {
          response += chunk.toString();
        });
        socket.once("close", () => resolve(response));
        socket.once("connect", () =>
          socket.write(
            `GET ${pathname} HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: ${requestOrigin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
          ),
        );
      });
    for (const [pathname, requestOrigin] of [
      ["/novnc/session/view/9999999999999.synthetic/websockify", "https://evil.example"],
      ["/novnc/session/view/bad/websockify", "null"],
      ["/novnc/session/view/9999999999999.synthetic/other", "null"],
      ["///novnc/session/view/9999999999999.synthetic/websockify", "null"],
      ["/api/session", "null"],
    ]) {
      expect(await exchange(pathname!, requestOrigin!)).toContain("403 Forbidden");
    }
    expect(upgrades).toBe(0);
  });

  it("rejects an upstream upgrade with an invalid accept key", async () => {
    upstream.on("upgrade", (_incoming, socket) => {
      socket.on("error", () => {});
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: invalid\r\n\r\n",
      );
      socket.on("end", () => socket.destroy());
    });
    const result = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(origin).port), "127.0.0.1");
      let response = "";
      client.setTimeout(2_000, () => client.destroy(new Error("Upgrade hung")));
      client.on("error", reject);
      client.on("data", (chunk) => {
        response += chunk.toString();
      });
      client.once("close", () => resolve(response));
      client.once("connect", () =>
        client.write(
          `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
        ),
      );
    });
    expect(result).not.toContain("101 Switching Protocols");
  });

  it("closes a pending upstream handshake when the proxy stops", async () => {
    const upstreamOpened = deferred<void>();
    const upstreamClosed = deferred<void>();
    upstream.on("upgrade", (_incoming, socket) => {
      socket.on("error", () => {});
      socket.once("close", () => upstreamClosed.resolve());
      socket.on("end", () => socket.destroy());
      upstreamOpened.resolve();
    });
    const client = connect(Number(new URL(origin).port), "127.0.0.1");
    client.on("error", () => {});
    const clientClosed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    client.once("connect", () =>
      client.write(
        `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
      ),
    );
    await upstreamOpened.promise;
    await proxy.stop();
    await Promise.all([clientClosed, upstreamClosed.promise]);
  });

  it("closes the client when an upgraded upstream disconnects", async () => {
    upstream.on("upgrade", (_incoming, socket) => {
      socket.on("error", () => {});
      socket.end(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n",
      );
    });
    const response = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(origin).port), "127.0.0.1");
      let received = "";
      client.setTimeout(2_000, () => client.destroy(new Error("Socket did not close")));
      client.on("error", reject);
      client.on("data", (chunk) => {
        received += chunk.toString();
      });
      client.once("close", () => resolve(received));
      client.once("connect", () =>
        client.write(
          `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
        ),
      );
    });
    expect(response).toContain("101 Switching Protocols");
  });

  it("closes both sides when the upstream handshake times out", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const timeout = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) =>
        originalSetTimeout(
          callback,
          delay === 20_000 ? 100 : delay,
          ...args,
        )) as typeof setTimeout);
    const upstreamClosed = deferred<void>();
    upstream.on("upgrade", (_incoming, socket) => {
      socket.on("error", () => {});
      socket.once("close", () => upstreamClosed.resolve());
      socket.on("end", () => socket.destroy());
    });
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const client = connect(Number(new URL(origin).port), "127.0.0.1");
        let received = "";
        client.setTimeout(2_000, () => client.destroy(new Error("Handshake did not time out")));
        client.on("error", reject);
        client.on("data", (chunk) => {
          received += chunk.toString();
        });
        client.once("close", () => resolve(received));
        client.once("connect", () =>
          client.write(
            `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
          ),
        );
      });
      expect(response).not.toContain("101 Switching Protocols");
      await upstreamClosed.promise;
      expect(timeout).toHaveBeenCalledWith(expect.any(Function), 20_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it.skipIf(!process.env.SYDNEY_TEST_OPENSSL)(
    "refuses untrusted TLS and connects after trusting the temporary test certificate",
    async () => {
      const keyPath = path.join(directory, "temporary-key.pem");
      const certificatePath = path.join(directory, "temporary-cert.pem");
      execFileSync(
        process.env.SYDNEY_TEST_OPENSSL!,
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          keyPath,
          "-out",
          certificatePath,
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=IP:127.0.0.1",
          "-days",
          "1",
        ],
        { stdio: "ignore", timeout: 10_000 },
      );
      const secureUpstream = createHttpsServer({
        key: await readFile(keyPath),
        cert: await readFile(certificatePath),
      });
      let upgrades = 0;
      secureUpstream.on("upgrade", (_request, socket) => {
        upgrades++;
        socket.on("error", () => {});
        socket.on("end", () => socket.destroy());
        socket.end(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n",
        );
      });
      await new Promise<void>((resolve) => secureUpstream.listen(0, "127.0.0.1", resolve));
      try {
        await proxy.stop();
        const address = secureUpstream.address();
        if (!address || typeof address === "string") throw new Error("Missing HTTPS port");
        proxy = new StandaloneRendererProxy({
          rendererRoot: root,
          remoteOrigin: `https://127.0.0.1:${address.port}`,
          requireCapability: false,
        });
        origin = await proxy.start();
        const response = await new Promise<string>((resolve, reject) => {
          const client = connect(Number(new URL(origin).port), "127.0.0.1");
          let received = "";
          client.setTimeout(3_000, () => client.destroy(new Error("TLS refusal hung")));
          client.on("error", reject);
          client.on("data", (chunk) => {
            received += chunk.toString();
          });
          client.once("close", () => resolve(received));
          client.once("connect", () =>
            client.write(
              `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
            ),
          );
        });
        expect(response).not.toContain("101 Switching Protocols");
        expect(upgrades).toBe(0);
        const originalAuthorities = getCACertificates("default");
        try {
          setDefaultCACertificates([
            ...originalAuthorities,
            await readFile(certificatePath, "utf8"),
          ]);
          const trustedResponse = await new Promise<string>((resolve, reject) => {
            const client = connect(Number(new URL(origin).port), "127.0.0.1");
            let received = "";
            client.setTimeout(3_000, () => client.destroy(new Error("Trusted TLS handshake hung")));
            client.on("error", reject);
            client.on("data", (chunk) => {
              received += chunk.toString();
            });
            client.once("close", () => resolve(received));
            client.once("connect", () =>
              client.write(
                `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
              ),
            );
          });
          expect(trustedResponse).toContain("101 Switching Protocols");
          expect(upgrades).toBe(1);
        } finally {
          setDefaultCACertificates(originalAuthorities);
        }
      } finally {
        await proxy.stop();
        secureUpstream.closeAllConnections();
        await new Promise<void>((resolve) => secureUpstream.close(() => resolve()));
      }
    },
  );

  it("does not relay sensitive headers when the upstream refuses the handshake", async () => {
    upstream.on("upgrade", (_incoming, socket) => {
      socket.end(
        "HTTP/1.1 403 Forbidden\r\nSet-Cookie: injected=bad\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      );
    });
    const response = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(origin).port), "127.0.0.1");
      let received = "";
      client.setTimeout(2_000, () => client.destroy(new Error("Upgrade hung")));
      client.on("error", reject);
      client.on("data", (chunk) => {
        received += chunk.toString();
      });
      client.once("close", () => resolve(received));
      client.once("connect", () =>
        client.write(
          `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
        ),
      );
    });
    expect(response).toContain("502 Bad Gateway");
    expect(response).not.toContain("Set-Cookie");
  });

  it("requires the per-instance capability on HTTP and never forwards it upstream", async () => {
    const capability = await restartWithCapability();
    const received = deferred<IncomingMessage["headers"]>();
    upstreamHandler = (request, response) => {
      received.resolve(request.headers);
      response.end("ok");
    };
    expect((await rawRequest(origin, "/api/capability")).status).toBe(403);
    expect(
      (await rawRequest(origin, "/api/capability", { "x-sydney-proxy-capability": "forged" }))
        .status,
    ).toBe(403);
    expect(upstreamCalls).toEqual([]);
    const accepted = await rawRequest(origin, "/api/capability", {
      "x-sydney-proxy-capability": capability,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toBe("ok");
    expect((await received.promise)["x-sydney-proxy-capability"]).toBeUndefined();
    expect(upstreamCalls).toEqual(["/api/capability"]);
  });

  it("requires the capability before a screen WebSocket reaches the upstream", async () => {
    const capability = await restartWithCapability();
    const handshake = deferred<IncomingMessage["headers"]>();
    upstream.on("upgrade", (request, socket) => {
      handshake.resolve(request.headers);
      socket.end(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n",
      );
    });
    const exchange = (headers: string) =>
      new Promise<string>((resolve, reject) => {
        const client = connect(Number(new URL(origin).port), "127.0.0.1");
        let receivedText = "";
        client.setTimeout(2_000, () => client.destroy(new Error("Upgrade hung")));
        client.on("error", reject);
        client.on("data", (chunk) => {
          receivedText += chunk.toString();
        });
        client.once("close", () => resolve(receivedText));
        client.once("connect", () =>
          client.write(
            `GET /novnc/session/view/9999999999999.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${headers}\r\n`,
          ),
        );
      });
    expect(await exchange("X-Sydney-Proxy-Capability: forged")).toContain("403 Forbidden");
    expect(upstreamCalls).toEqual([]);
    const accepted = await exchange(`X-Sydney-Proxy-Capability: ${capability}`);
    expect(accepted).toContain("101 Switching Protocols");
    expect((await handshake.promise)["x-sydney-proxy-capability"]).toBeUndefined();
  });

  it("issues a distinct capability per proxy instance", () => {
    const other = new StandaloneRendererProxy({
      rendererRoot: root,
      remoteOrigin,
      requireCapability: false,
    });
    expect(other.capability).not.toBe(proxy.capability);
    expect(other.capability.length).toBeGreaterThanOrEqual(43);
  });

  it("serializes lifecycle calls, releases its listener and supports restart", async () => {
    expect(await Promise.all([proxy.start(), proxy.start()])).toEqual([origin, origin]);
    await Promise.all([proxy.stop(), proxy.stop()]);
    expect(proxy.url).toBeUndefined();
    await expect(fetch(`${origin}/`)).rejects.toThrow();
    origin = await proxy.start();
    expect(new URL(origin).hostname).toBe("127.0.0.1");
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  it.each([
    "file:///tmp",
    "ftp://example.test",
    "http://example.test:0",
    "https://user:secret@example.test",
    "https://example.test/path",
    "https://example.test?x=1",
    "https://example.test#hash",
    " https://example.test",
    "https://example.test\\evil",
    "not a URL",
  ])("rejects invalid remote origin %s", (remoteOrigin) => {
    expect(() => new StandaloneRendererProxy({ rendererRoot: root, remoteOrigin })).toThrow(
      "remoteOrigin",
    );
  });

  it("rejects invalid or mismatched settings and LAN credentials over cleartext", () => {
    expect(
      () =>
        new StandaloneRendererProxy({
          rendererRoot: root,
          remoteOrigin,
          setup: {
            mode: "existing",
            serverUrl: remoteOrigin,
            headers: { "X-Gateway-Key": "one", "x-gateway-key": "two" },
          },
        }),
    ).toThrow("valid desktop server configuration");
    expect(
      () =>
        new StandaloneRendererProxy({
          rendererRoot: root,
          remoteOrigin,
          setup: {
            mode: "existing",
            serverUrl: "https://backend.example",
            headers: { "x-gateway-key": "configured-secret" },
          },
        }),
    ).toThrow("must match remoteOrigin");
    expect(
      () =>
        new StandaloneRendererProxy({
          rendererRoot: root,
          remoteOrigin: "http://backend.example",
          setup: {
            mode: "existing",
            serverUrl: "http://backend.example",
            headers: { "x-gateway-key": "configured-secret" },
          },
        }),
    ).toThrow("valid desktop server configuration");
    expect(
      () =>
        new StandaloneRendererProxy({
          rendererRoot: root,
          remoteOrigin: "http://192.168.1.10",
          setup: {
            mode: "existing",
            serverUrl: "http://192.168.1.10",
            headers: { "x-gateway-key": "configured-secret" },
          },
        }),
    ).toThrow("custom server headers require HTTPS except for loopback servers");
  });

  it("rejects relative or missing renderer roots without opening a listener", async () => {
    expect(() => new StandaloneRendererProxy({ rendererRoot: "relative", remoteOrigin })).toThrow(
      "absolute",
    );
    const missing = new StandaloneRendererProxy({
      rendererRoot: path.join(directory, "missing"),
      remoteOrigin,
      requireCapability: false,
    });
    await expect(missing.start()).rejects.toThrow();
    expect(missing.url).toBeUndefined();
    await missing.stop();
  });

  it("refuses to start when the entry is missing and can start after repair", async () => {
    const incompleteRoot = path.join(directory, "incomplete");
    await mkdir(incompleteRoot);
    const incomplete = new StandaloneRendererProxy({
      rendererRoot: incompleteRoot,
      remoteOrigin,
      requireCapability: false,
    });
    await expect(incomplete.start()).rejects.toThrow();
    expect(incomplete.url).toBeUndefined();
    await writeFile(path.join(incompleteRoot, "index.html"), "<title>Repaired</title>");
    const repairedOrigin = await incomplete.start();
    expect(await (await fetch(repairedOrigin)).text()).toContain("Repaired");
    await incomplete.stop();
  });

  it("refuses an entry directory", async () => {
    const incompleteRoot = path.join(directory, "incomplete");
    await mkdir(path.join(incompleteRoot, "index.html"), { recursive: true });
    const incomplete = new StandaloneRendererProxy({
      rendererRoot: incompleteRoot,
      remoteOrigin,
      requireCapability: false,
    });
    await expect(incomplete.start()).rejects.toThrow("renderer entry");
    expect(incomplete.url).toBeUndefined();
    await incomplete.stop();
  });

  it.skipIf(process.platform === "win32")(
    "refuses an entry pointing outside the root",
    async () => {
      const incompleteRoot = path.join(directory, "incomplete");
      await mkdir(incompleteRoot);
      const incomplete = new StandaloneRendererProxy({
        rendererRoot: incompleteRoot,
        remoteOrigin,
        requireCapability: false,
      });
      const outside = path.join(directory, "outside.html");
      await writeFile(outside, "outside");
      await symlink(outside, path.join(incompleteRoot, "index.html"), "file");
      await expect(incomplete.start()).rejects.toThrow("renderer entry");
      expect(incomplete.url).toBeUndefined();
      await incomplete.stop();
    },
  );
});
