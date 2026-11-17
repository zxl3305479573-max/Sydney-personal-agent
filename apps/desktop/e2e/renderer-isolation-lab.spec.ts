import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("isolated debugger experiment checks frames, popup access and debugger detachment", async () => {
  test.skip(process.env.SYDNEY_RENDERER_LAB !== "1", "Explicit isolated renderer lab only");
  const userData = await mkdtemp(path.join(tmpdir(), "sydney-renderer-lab-"));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    requests.push(requestPath);
    response.setHeader("cache-control", "no-store");
    if (requestPath === "/api/check") {
      response.setHeader("content-type", "application/json");
      response.end('{"ok":true}');
    } else {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<html><body>${requestPath === "/main" ? "REMOTE_MAIN" : requestPath}</body></html>`);
    }
  });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture port");
    const origin = `http://127.0.0.1:${address.port}`;
    app = await electron.launch({
      args: [path.join(import.meta.dirname, "fixtures", "renderer-isolation-main.cjs"), `--user-data-dir=${userData}`],
    });
    const page = await app.firstWindow();
    await app.evaluate(async ({ BrowserWindow }, fixtureOrigin) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error("Missing fixture window");
      const session = window.webContents.debugger;
      session.attach("1.3");
      await session.sendCommand("Page.enable");
      const tree = await session.sendCommand("Page.getFrameTree") as { frameTree: { frame: { id: string } } };
      const mainFrame = tree.frameTree.frame.id;
      session.on("message", (_event, method, params) => {
        if (method !== "Fetch.requestPaused") return;
        const request = params as {
          requestId: string;
          frameId: string;
          resourceType: string;
          request: { url: string; method: string };
        };
        const url = new URL(request.request.url);
        const intercept = request.frameId === mainFrame &&
          request.resourceType === "Document" &&
          request.request.method === "GET" &&
          url.origin === fixtureOrigin &&
          url.pathname === "/main";
        if (intercept) {
          const html = '<html><body>LOCAL_MAIN<iframe src="/iframe"></iframe><button onclick="window.open(\'/popup\')">open</button></body></html>';
          void session.sendCommand("Fetch.fulfillRequest", {
            requestId: request.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
            body: Buffer.from(html).toString("base64"),
          });
        } else {
          void session.sendCommand("Fetch.continueRequest", { requestId: request.requestId });
        }
      });
      await session.sendCommand("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    }, origin);
    await page.goto(`${origin}/main`);
    await expect(page.locator("body")).toContainText("LOCAL_MAIN");
    await expect(page.frameLocator("iframe").locator("body")).toContainText("/iframe");
    expect(requests).not.toContain("/main");
    expect(await page.evaluate(async () => (await fetch("/api/check")).json())).toEqual({ ok: true });
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "open" }).click();
    const popup = await popupPromise;
    await expect(popup.locator("body")).toContainText("/popup");
    expect(requests).toContain("/iframe");
    expect(requests).toContain("/api/check");
    expect(requests).toContain("/popup");
    expect(await popup.evaluate(() => {
      if (!window.opener) return false;
      const marker = window.opener.document.createElement("div");
      marker.id = "popup-opener-marker";
      marker.textContent = "POPUP_CHANGED_MAIN";
      window.opener.document.body.appendChild(marker);
      return true;
    })).toBe(true);
    await expect(page.locator("#popup-opener-marker")).toHaveText("POPUP_CHANGED_MAIN");
    await popup.close();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || !window.webContents.debugger.isAttached()) throw new Error("Missing debugger");
      window.webContents.debugger.detach();
    });
    await page.goto(`${origin}/main`);
    await expect(page.locator("body")).toContainText("REMOTE_MAIN");
    expect(requests).toContain("/main");
  } finally {
    await app?.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await rm(userData, { recursive: true, force: true });
  }
});
