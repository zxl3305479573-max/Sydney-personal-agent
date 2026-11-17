import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { foregroundWindow } from "./foreground-window";

const contentTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

test("packaged web resources render responsively with an isolated renderer", async () => {
  test.setTimeout(60_000);
  const testInfo = test.info();
  const executable = process.env.RAKAZO_E2E_EXECUTABLE;
  test.skip(!executable, "Requires a packaged desktop executable");
  if (!executable) return;
  const executablePath = path.resolve(executable);
  const webRoot = path.join(path.dirname(executablePath), "resources", "web");
  const userData = await mkdtemp(path.join(tmpdir(), "sydney-bundled-web-"));
  await writeFile(path.join(userData, "ui-locale.txt"), "en\n");
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/rpc/health") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ json: { ok: true, version: "test" } }));
        return;
      }
      if (pathname === "/api/auth/get-session" || pathname === "/api/monitoring/config") {
        response.setHeader("content-type", "application/json");
        response.end(pathname.includes("monitoring") ? '{"dsn":null}' : "null");
        return;
      }
      if (pathname.startsWith("/api/") || pathname.startsWith("/rpc/")) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end('{"error":"Unauthenticated test session"}');
        return;
      }
      const resource = ["/", "/sign-in", "/sign-up", "/app"].includes(pathname)
        ? "/index.html"
        : decodeURIComponent(pathname);
      const filename = path.resolve(webRoot, `.${resource}`);
      const relative = path.relative(webRoot, filename);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        response.writeHead(403).end();
        return;
      }
      const contents = await readFile(filename);
      response.setHeader(
        "content-type",
        contentTypes[path.extname(filename)] ?? "application/octet-stream",
      );
      response.end(contents);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    });
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing web fixture port");
    const serverUrl = `http://127.0.0.1:${address.port}`;
    const env = { ...process.env, RAKAZO_PERFORMANCE_USER_DATA: userData };
    delete env.RAKAZO_WEB_URL;
    delete env.RAKAZO_FORCE_SETUP;
    const app = await electron.launch({
      executablePath,
      cwd: path.resolve(import.meta.dirname, ".."),
      env: { ...env, SYDNEY_PC_BACKEND_URL: serverUrl },
    });
    try {
      expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
      const page = await foregroundWindow(app);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await expect(page.locator('[data-rakazo-surface="welcome"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "Sydney", exact: true })).toBeVisible();
      const browserWindow = await app.browserWindow(page);
      const preferences = await browserWindow.evaluate((window) => {
        const webPreferences = window.webContents.getLastWebPreferences();
        return {
          nodeIntegration: webPreferences.nodeIntegration,
          contextIsolation: webPreferences.contextIsolation,
          sandbox: webPreferences.sandbox,
        };
      });
      expect(preferences).toEqual({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      });
      expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
        "undefined",
      );
      for (const width of [1280, 700]) {
        await browserWindow.evaluate(
          (window, contentWidth) => window.setContentSize(contentWidth, 800),
          width,
        );
        await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
        await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            (value) => document.documentElement.setAttribute("data-theme", value),
            theme,
          );
          const screenshotPath = testInfo.outputPath(`welcome-${width}-${theme}.png`);
          await page.screenshot({ path: screenshotPath });
          await testInfo.attach(`welcome-${width}-${theme}`, {
            path: screenshotPath,
            contentType: "image/png",
          });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  } finally {
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await rm(userData, { recursive: true, force: true });
  }
});
