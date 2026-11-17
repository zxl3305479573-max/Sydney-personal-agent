import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { StandaloneRendererProxy } from "../../desktop/src/standalone-renderer-proxy";

test("Wuying root stays opaque when directly opened or reached by redirect", async ({ page }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-wuying-root-"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Fixture</title>");
  const requests: string[] = [];
  const upstream = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/wuying/start") {
      response.writeHead(302, { location: "/wuying" }).end();
    } else if (request.url === "/wuying") {
      response.setHeader("content-type", "text/html");
      response.end('<body>waiting<script src="/wuying/screen.js"></script></body>');
    } else if (request.url === "/wuying/screen.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(`let result; try { localStorage.length; result = "accessible" }
        catch { result = "blocked" } document.body.textContent = result`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
  });
  try {
    const origin = await proxy.start();
    for (const pathname of ["/wuying", "/wuying/start"]) {
      await page.goto(`${origin}${pathname}`);
      await expect(page.locator("body")).toHaveText("blocked");
      expect(new URL(page.url()).pathname).toBe("/wuying");
    }
    expect(requests.filter((value) => value === "/wuying")).toHaveLength(2);
  } finally {
    await proxy.stop();
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

for (const upstreamPolicy of [undefined, "sandbox allow-scripts allow-same-origin"]) {
  test(`desktop screen proxy isolates documents with upstream policy ${upstreamPolicy ?? "absent"}`, async ({
    page,
  }) => {
    const directory = await mkdtemp(path.join(tmpdir(), "sydney-screen-csp-"));
    await writeFile(
      path.join(directory, "index.html"),
      '<!doctype html><iframe src="/novnc/session/view/9999999999999.synthetic/vnc.html"></iframe>',
    );
    const upstream = createServer((_request, response) => {
      if (upstreamPolicy) response.setHeader("Content-Security-Policy", upstreamPolicy);
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Set-Cookie", "synthetic_screen=unwanted; Path=/");
      response.end(`<body>waiting<script>
        const result = {};
        for (const [name, action] of Object.entries({
          parent: () => parent.document.title,
          cookies: () => document.cookie,
          storage: () => localStorage.length
        })) {
          try { action(); result[name] = "accessible"; }
          catch { result[name] = "blocked"; }
        }
        document.body.textContent = JSON.stringify(result);
      </script></body>`);
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const proxy = new StandaloneRendererProxy({
      rendererRoot: directory,
      remoteOrigin: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    });
    try {
      const origin = await proxy.start();
      await page.goto(origin);
      await expect(page.frameLocator("iframe").locator("body")).toHaveText(
        '{"parent":"blocked","cookies":"blocked","storage":"blocked"}',
      );
      expect(
        (await page.context().cookies(origin)).some((cookie) => cookie.name === "synthetic_screen"),
      ).toBe(false);
    } finally {
      await proxy.stop();
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        upstream.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("documents that separate loopback ports do not isolate server cookies", async ({ page }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-desktop-cookie-isolation-"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Fixture</title>");
  const first = createServer((_request, response) => {
    response.setHeader("Set-Cookie", "__Secure-session=synthetic-first; Secure; HttpOnly; Path=/");
    response.end("ok");
  });
  const second = createServer((request, response) => response.end(request.headers.cookie ?? ""));
  await Promise.all([
    new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => second.listen(0, "127.0.0.1", resolve)),
  ]);
  const firstProxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: `http://127.0.0.1:${(first.address() as AddressInfo).port}`,
  });
  const secondProxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: `http://127.0.0.1:${(second.address() as AddressInfo).port}`,
  });
  const browser = page.context().browser();
  if (!browser) throw new Error("Missing browser");
  const isolatedContext = await browser.newContext();
  try {
    const firstOrigin = await firstProxy.start();
    const secondOrigin = await secondProxy.start();
    await page.goto(firstOrigin);
    await page.evaluate(() => fetch("/api/session"));
    await page.goto(secondOrigin);
    const secondCookie = await page.evaluate(async () => (await fetch("/api/session")).text());
    expect(secondCookie).toContain("__Secure-session=synthetic-first");
    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.goto(secondOrigin);
    const isolatedCookie = await isolatedPage.evaluate(async () =>
      (await fetch("/api/session")).text(),
    );
    expect(isolatedCookie).toBe("");
  } finally {
    await isolatedContext.close();
    await Promise.all([firstProxy.stop(), secondProxy.stop()]);
    for (const server of [first, second]) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("loopback renderer loads noVNC modules from an opaque capability frame", async ({ page }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-novnc-browser-"));
  const requests: Array<{ url: string; cookie: string | undefined }> = [];
  const capability = "/novnc/session/view/9999999999999.synthetic";
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><iframe src="${capability}/vnc.html"></iframe>`,
  );
  const upstream = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    requests.push({ url: pathname, cookie: request.headers.cookie });
    if (pathname === `${capability}/vnc.html`) {
      response.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-pointer-lock");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<script type="module">import { ready } from "./core/rfb.js"; document.body.textContent = ready; const socket = new WebSocket("ws://" + location.host + "//${capability.slice(1)}/websockify"); socket.onmessage = (event) => { document.body.textContent = ready + " " + event.data; };</script><body>waiting</body>`,
      );
    } else if (pathname === `${capability}/core/rfb.js`) {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Content-Type", "text/javascript");
      response.end('export const ready = "noVNC module ready"');
    } else {
      response.writeHead(404).end();
    }
  });
  upstream.on("upgrade", (request, socket) => {
    requests.push({ url: request.url!, cookie: request.headers.cookie });
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.on("error", () => {});
    socket.on("end", () => socket.destroy());
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(Buffer.concat([Buffer.from([0x81, 5]), Buffer.from("ready")]));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const remoteOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const proxy = new StandaloneRendererProxy({ rendererRoot: directory, remoteOrigin });
  try {
    const origin = await proxy.start();
    await page.context().addCookies([{ name: "session", value: "fixture", url: origin }]);
    await page.goto(origin);
    await expect(page.frameLocator("iframe").locator("body")).toHaveText(
      "noVNC module ready ready",
    );
    expect(requests.find((item) => item.url === `${capability}/core/rfb.js`)).toEqual({
      url: `${capability}/core/rfb.js`,
      cookie: undefined,
    });
    expect(requests.find((item) => item.url === `${capability}/websockify`)).toEqual({
      url: `${capability}/websockify`,
      cookie: undefined,
    });
  } finally {
    await proxy.stop();
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("loopback renderer supports secure session cookies and opaque Wuying subresources", async ({
  page,
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-desktop-browser-"));
  const requests: Array<{ url: string; cookie: string | undefined }> = [];
  await mkdir(path.join(directory, "assets"));
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><title>Local desktop</title><iframe src="/wuying/screen.html"></iframe>',
  );
  const upstream = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    requests.push({ url: pathname, cookie: request.headers.cookie });
    if (pathname === "/api/cookie") {
      response.setHeader(
        "Set-Cookie",
        "__Secure-session=fixture; Secure; HttpOnly; SameSite=Lax; Path=/",
      );
      response.end("ok");
    } else if (pathname === "/api/check") {
      response.end(request.headers.cookie ?? "");
    } else if (pathname === "/wuying/screen.html") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<iframe src="/wuying/sdk/ASP/container.html"></iframe><script src="/wuying/screen.js"></script>',
      );
    } else if (pathname === "/wuying/screen.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end('document.body.dataset.script = "loaded"');
    } else if (pathname === "/wuying/sdk/ASP/container.html") {
      response.setHeader("Content-Type", "text/html");
      response.end("<body>Nested screen ready</body>");
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const remoteOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const proxy = new StandaloneRendererProxy({ rendererRoot: directory, remoteOrigin });
  const responses: Array<{ url: string; status: number }> = [];
  page.on("response", (response) => {
    if (response.url().includes("/wuying/")) {
      responses.push({ url: new URL(response.url()).pathname, status: response.status() });
    }
  });
  try {
    const origin = await proxy.start();
    await page.goto(origin);
    const cookie = await page.evaluate(async () => {
      await fetch("/api/cookie");
      return (await fetch("/api/check")).text();
    });
    expect(cookie).toContain("__Secure-session=fixture");
    const outer = page.frameLocator("iframe");
    await expect(outer.locator("body")).toHaveAttribute("data-script", "loaded");
    await expect(outer.frameLocator("iframe").locator("body")).toHaveText("Nested screen ready");
    expect(requests.find((item) => item.url === "/wuying/screen.js")).toBeTruthy();
    for (const request of requests.filter(
      (item) => item.url === "/wuying/screen.js" || item.url === "/wuying/sdk/ASP/container.html",
    )) {
      expect(request.cookie).toBeUndefined();
    }
    expect(responses).toContainEqual({ url: "/wuying/sdk/ASP/container.html", status: 200 });
  } finally {
    await proxy.stop();
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
