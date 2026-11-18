import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";
import type { RakazoDesktop } from "@rakazo/contracts";
import { USER_DEVICE_PAIR_PATH } from "@rakazo/contracts";
import { foregroundWindow } from "./foreground-window";

interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
}

async function createRendererFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sydney-standalone-renderer-"));
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sydney Standalone</title>
    <script type="module" src="/assets/app.js"></script>
  </head>
  <body>
    <div id="root"><div data-rakazo-app-state="session-pending">Loading…</div></div>
  </body>
</html>
`,
    "utf8",
  );
  await writeFile(
    path.join(dir, "assets", "app.js"),
    `const root = document.getElementById("root");
fetch("/api/auth/get-session", { credentials: "include" })
  .then((res) => res.json())
  .then((session) => {
    const mode = session && session.mode ? session.mode : "welcome";
    if (mode === "hang-pending") {
      return;
    }
    root.innerHTML =
      '<div data-rakazo-app-state="ready">' +
      '<div data-rakazo-surface="welcome">' +
      '<h1>Sydney Standalone Ready</h1>' +
      '<p data-testid="session-user">' + (session && session.user ? session.user : "signed-out") + '</p>' +
      '</div></div>';
  })
  .catch(() => {
    root.innerHTML = '<div data-rakazo-app-state="failed">Failed</div>';
  });
`,
    "utf8",
  );
  return dir;
}

async function createApiOnlyBackend(
  options: { sessionMode?: "welcome" | "broken-session"; pairDeviceId?: string } = {},
) {
  const requests: RecordedRequest[] = [];
  let signedInUser: string | null = null;
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    requests.push({
      method: req.method ?? "GET",
      url,
      headers: { ...req.headers },
    });

    if (url === "/rpc/health" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ json: { ok: true, version: "0.2.0" } }));
      return;
    }
    if (url === "/api/monitoring/config") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ dsn: null, userId: signedInUser }));
      return;
    }
    if (url.startsWith("/api/auth/get-session")) {
      if (options.sessionMode === "broken-session") {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("not-json");
        return;
      }
      const hasCookie = (req.headers.cookie ?? "").includes(
        "__Secure-rakazo.session_token=valid-1",
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(hasCookie ? { user: "alice" } : null));
      return;
    }
    if (url === "/api/auth/test-sign-in" && req.method === "POST") {
      signedInUser = "user_alice_123";
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie":
          "__Secure-rakazo.session_token=valid-1; Path=/; Secure; HttpOnly; SameSite=Lax",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === USER_DEVICE_PAIR_PATH && req.method === "POST") {
      const hasCookie = (req.headers.cookie ?? "").includes(
        "__Secure-rakazo.session_token=valid-1",
      );
      if (!hasCookie) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          deviceId: options.pairDeviceId ?? "dev_standalone_1",
          userId: "user_alice_123",
          token: "paired-device-secret-token",
        }),
      );
      return;
    }

    // Web UI is retired: `/` and all static routes return 404 on the server.
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Web service retired");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

let rendererDir: string;
let userData: string;
let app: ElectronApplication | undefined;

test.beforeAll(async () => {
  rendererDir = await createRendererFixture();
});

test.afterAll(async () => {
  await rm(rendererDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  userData = await mkdtemp(path.join(tmpdir(), "sydney-standalone-e2e-"));
  await writeFile(path.join(userData, "ui-locale.txt"), "en\n");
});

test.afterEach(async () => {
  try {
    await app?.close();
  } finally {
    app = undefined;
    await rm(userData, { recursive: true, force: true });
  }
});

async function launchStandalone(extraEnv: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    RAKAZO_PERFORMANCE_USER_DATA: userData,
    SYDNEY_STANDALONE_RENDERER_DIR: rendererDir,
  };
  delete env.RAKAZO_WEB_URL;
  delete env.SYDNEY_PC_BACKEND_URL;
  delete env.RAKAZO_FORCE_SETUP;
  delete env.RAKAZO_DISABLE_BUNDLED_RENDERER;
  const launched = await electron.launch({
    args: ["."],
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...env, ...extraEnv } as Record<string, string>,
  });
  app = launched;
  return launched;
}

test("cold starts against a Web-retired backend (GET / -> 404) and reuses the fixed loopback origin across restarts", async () => {
  const backend = await createApiOnlyBackend();
  try {
    await writeFile(
      path.join(userData, "setup.json"),
      `${JSON.stringify({ mode: "existing", serverUrl: backend.origin }, null, 2)}\n`,
    );

    await launchStandalone();
    const firstPage = await foregroundWindow(app!);
    await expect(firstPage.getByRole("heading", { name: "Sydney Standalone Ready" })).toBeVisible();

    const firstUiOrigin = await firstPage.evaluate(() => {
      localStorage.setItem("composer-draft", "keep-across-restart");
      return window.location.origin;
    });
    expect(firstUiOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(firstUiOrigin).not.toBe(backend.origin);

    // Backend never received any GET / request because renderer came from local bundle.
    expect(backend.requests.filter((req) => req.url === "/")).toEqual([]);

    const registryRaw = JSON.parse(
      await readFile(path.join(userData, "standalone-origins.json"), "utf8"),
    );
    expect(registryRaw.version).toBe(1);
    expect(registryRaw.origins[backend.origin].port).toBe(Number(new URL(firstUiOrigin).port));

    await app!.close();
    app = undefined;

    // Restart with the same profile: must bind the exact same loopback port and keep localStorage.
    await launchStandalone();
    const secondPage = await foregroundWindow(app!);
    await expect(
      secondPage.getByRole("heading", { name: "Sydney Standalone Ready" }),
    ).toBeVisible();
    const secondState = await secondPage.evaluate(() => ({
      origin: window.location.origin,
      draft: localStorage.getItem("composer-draft"),
    }));
    expect(secondState).toEqual({
      origin: firstUiOrigin,
      draft: "keep-across-restart",
    });
  } finally {
    await backend.close();
  }
});

test("fails closed to setup without leaking headers or overwriting registry when the registered loopback port is occupied", async () => {
  const backend = await createApiOnlyBackend();
  const decoyRequests: RecordedRequest[] = [];
  const decoy = createServer((req, res) => {
    decoyRequests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: { ...req.headers },
    });
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<h1>Decoy</h1>");
  });
  await new Promise<void>((resolve) => decoy.listen(0, "127.0.0.1", resolve));
  const occupiedPort = (decoy.address() as AddressInfo).port;

  try {
    await writeFile(
      path.join(userData, "setup.json"),
      `${JSON.stringify(
        {
          mode: "existing",
          serverUrl: backend.origin,
          headers: { "X-Custom-Gate": "top-secret-header" },
        },
        null,
        2,
      )}\n`,
    );

    const { standaloneSessionPartitionForServerUrl } = await import("../src/setup-config.js");
    const registryJson = `${JSON.stringify(
      {
        version: 1,
        origins: {
          [backend.origin]: {
            port: occupiedPort,
            partition: standaloneSessionPartitionForServerUrl(backend.origin),
          },
        },
      },
      null,
      2,
    )}\n`;
    await writeFile(path.join(userData, "standalone-origins.json"), registryJson, "utf8");

    await launchStandalone();
    const setup = await foregroundWindow(app!);
    await expect(setup.getByRole("heading", { name: "Welcome to Sydney" })).toBeVisible();
    await expect(setup.locator("#status")).toContainText(
      `The local renderer port ${occupiedPort} is already in use.`,
    );

    // Zero traffic reached the foreign process squatting on the loopback port, and registry stayed intact.
    expect(decoyRequests).toEqual([]);
    expect(await readFile(path.join(userData, "standalone-origins.json"), "utf8")).toBe(
      registryJson,
    );
  } finally {
    decoy.closeAllConnections();
    await new Promise<void>((resolve) => decoy.close(() => resolve()));
    await backend.close();
  }
});

test("preserves Secure session cookies on loopback, pairs userDevices, and forwards custom headers without leaking capabilities", async () => {
  const backend = await createApiOnlyBackend({ pairDeviceId: "dev_win_standalone" });
  try {
    await writeFile(
      path.join(userData, "setup.json"),
      `${JSON.stringify(
        {
          mode: "existing",
          serverUrl: backend.origin,
          headers: { "X-Gateway-Key": "gate-v1" },
        },
        null,
        2,
      )}\n`,
    );

    await launchStandalone();
    const page = await foregroundWindow(app!);
    await expect(page.getByRole("heading", { name: "Sydney Standalone Ready" })).toBeVisible();

    // Sign in through the standalone proxy; response sets a `__Secure-` + `Secure; HttpOnly` cookie.
    const signInStatus = await page.evaluate(async () => {
      const res = await fetch("/api/auth/test-sign-in", {
        method: "POST",
        credentials: "include",
      });
      return res.status;
    });
    expect(signInStatus).toBe(200);

    // Navigate in-app so mainWindow triggers `pairAfterNavigation` and re-reads session cookie.
    await page.evaluate(() => window.location.assign("/app"));
    await expect(page.getByTestId("session-user")).toHaveText("alice");

    // Verify IPC `desktop.device.state` resolves against `remoteOrigin` even though `window.location.origin` is loopback proxy.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as typeof window & { rakazoDesktop: RakazoDesktop }).rakazoDesktop.device.state(),
        ),
      )
      .toMatchObject({
        deviceId: "dev_win_standalone",
        allowed: false,
      });

    const pairRequests = backend.requests.filter((req) => req.url === USER_DEVICE_PAIR_PATH);
    expect(pairRequests.length).toBeGreaterThanOrEqual(2);
    const pairReq = pairRequests.at(-1)!;
    expect(pairReq.headers.cookie).toContain("__Secure-rakazo.session_token=valid-1");
    expect(pairReq.headers["x-gateway-key"]).toBe("gate-v1");
    expect(pairReq.headers.origin).toBe(backend.origin);
    expect(pairReq.headers["x-sydney-proxy-capability"]).toBeUndefined();
    expect(pairReq.headers["x-sydney-main-nonce"]).toBeUndefined();

    const monitoringWithCookie = backend.requests.filter(
      (req) =>
        req.url === "/api/monitoring/config" &&
        (req.headers.cookie ?? "").includes("__Secure-rakazo.session_token=valid-1"),
    );
    expect(monitoringWithCookie.length).toBeGreaterThan(0);
    expect(monitoringWithCookie[0]!.headers["x-gateway-key"]).toBe("gate-v1");
    expect(monitoringWithCookie[0]!.headers["x-sydney-proxy-capability"]).toBeUndefined();
  } finally {
    await backend.close();
  }
});

test("rolls back to server A when switching to server B fails, and updates A -> A custom headers on the same fixed port", async () => {
  test.setTimeout(60_000);
  const backendA = await createApiOnlyBackend();
  const backendB = await createApiOnlyBackend({ sessionMode: "broken-session" });
  try {
    await writeFile(
      path.join(userData, "setup.json"),
      `${JSON.stringify(
        {
          mode: "existing",
          serverUrl: backendA.origin,
          headers: { "X-Header-Gen": "gen-1" },
        },
        null,
        2,
      )}\n`,
    );

    await launchStandalone();
    const pageA = await foregroundWindow(app!);
    await expect(pageA.getByRole("heading", { name: "Sydney Standalone Ready" })).toBeVisible();
    const initialUiOrigin = await pageA.evaluate(() => window.location.origin);

    // 1. Load-failure rollback (A -> B where B mounts data-rakazo-app-state="failed").
    const setupPromise1 = app!.waitForEvent("window");
    await app!.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById("change-rakazo-server")?.click();
    });
    const setup1 = await setupPromise1;
    await setup1.getByRole("radio", { name: /Existing instance/ }).check();
    await setup1.locator("#server-url").fill(backendB.origin);
    await setup1.getByRole("button", { name: "Continue" }).click();
    await expect(setup1.locator("#status")).toContainText(
      "Could not open that server. The server page did not become ready.",
    );

    // 2. Save-failure rollback (A -> C where C loads, but setup.json write fails).
    const backendC = await createApiOnlyBackend();
    try {
      await setup1.getByRole("radio", { name: /Existing instance/ }).check();
      await setup1.locator("#server-url").fill(backendC.origin);

      // Force writeSetup failure by turning setup.json into a directory.
      await rm(path.join(userData, "setup.json"), { force: true });
      await mkdir(path.join(userData, "setup.json"));

      await setup1.getByRole("button", { name: "Continue" }).click();
      await expect(setup1.locator("#status")).toContainText("The previous instance was restored.");

      // Restore setup.json as file and close Setup -> original pageA must still work through its live proxy!
      await rm(path.join(userData, "setup.json"), { recursive: true, force: true });
      await writeFile(
        path.join(userData, "setup.json"),
        `${JSON.stringify(
          {
            mode: "existing",
            serverUrl: backendA.origin,
            headers: { "X-Header-Gen": "gen-1" },
          },
          null,
          2,
        )}\n`,
      );
      await setup1.close();

      const checkAfterRollback = await pageA.evaluate(async () => {
        const res = await fetch("/api/auth/get-session");
        return res.status;
      });
      expect(checkAfterRollback).toBe(200);

      // Now update custom headers on the SAME server A -> A: must reuse exact same loopback port without EADDRINUSE.
      const setupPromise2 = app!.waitForEvent("window");
      await app!.evaluate(({ Menu }) => {
        Menu.getApplicationMenu()?.getMenuItemById("change-rakazo-server")?.click();
      });
      const setup2 = await setupPromise2;
      await setup2.getByRole("radio", { name: /Existing instance/ }).check();
      await setup2.locator("#server-url").fill(backendA.origin);
      if (!(await setup2.locator("#server-headers").isVisible())) {
        await setup2.locator("#server-headers-section summary").click();
      }
      await setup2.locator("#server-headers").fill("X-Header-Gen: gen-2");
      const updatedPage = await Promise.all([
        app!.waitForEvent("window"),
        setup2.getByRole("button", { name: "Continue" }).click(),
      ]).then(([window]) => window);
      await expect(
        updatedPage.getByRole("heading", { name: "Sydney Standalone Ready" }),
      ).toBeVisible();
      expect(await updatedPage.evaluate(() => window.location.origin)).toBe(initialUiOrigin);

      const latestSessionReq = [...backendA.requests]
        .reverse()
        .find((req) => req.url.startsWith("/api/auth/get-session"));
      expect(latestSessionReq?.headers["x-header-gen"]).toBe("gen-2");
    } finally {
      await backendC.close();
    }
  } finally {
    await backendB.close();
    await backendA.close();
  }
});

test("isolates SYDNEY_PC_BACKEND_URL from stale local-stack setup and keeps standalone capability hooks intact when A -> A recovery fails", async () => {
  test.setTimeout(60_000);
  const backend = await createApiOnlyBackend();
  const entryPath = path.join(rendererDir, "index.html");
  const backupPath = path.join(rendererDir, "index.html.bak");

  try {
    // Stale mode:"new" setup on disk with the exact same origin as SYDNEY_PC_BACKEND_URL (P2-2).
    await writeFile(
      path.join(userData, "setup.json"),
      `${JSON.stringify({ mode: "new", serverUrl: backend.origin }, null, 2)}\n`,
    );

    await launchStandalone({
      SYDNEY_PC_BACKEND_URL: backend.origin,
      RAKAZO_LOCAL_WEB_URL: backend.origin,
    });
    const page = await foregroundWindow(app!);
    await expect(page.getByRole("heading", { name: "Sydney Standalone Ready" })).toBeVisible();
    const uiOrigin = await page.evaluate(() => window.location.origin);
    expect(uiOrigin).not.toBe(backend.origin);
    expect(backend.requests.filter((req) => req.url === "/")).toEqual([]);

    const computerMenuVisible = await app!.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      for (const top of menu?.items ?? []) {
        for (const item of top.submenu?.items ?? []) {
          if (item.label.includes("Computer Access")) return item.visible;
        }
      }
      return false;
    });
    expect(computerMenuVisible).toBe(false);

    // Save custom headers on backend so currentSetup has headers on this standalone session.
    const setupPromise1 = app!.waitForEvent("window");
    await app!.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById("change-rakazo-server")?.click();
    });
    const setup1 = await setupPromise1;
    await setup1.getByRole("radio", { name: /Existing instance/ }).check();
    await setup1.locator("#server-url").fill(backend.origin);
    if (!(await setup1.locator("#server-headers").isVisible())) {
      await setup1.locator("#server-headers-section summary").click();
    }
    await setup1.locator("#server-headers").fill("X-Header-Gen: v1");
    const authedPage = await Promise.all([
      app!.waitForEvent("window"),
      setup1.getByRole("button", { name: "Continue" }).click(),
    ]).then(([window]) => window);
    await expect(
      authedPage.getByRole("heading", { name: "Sydney Standalone Ready" }),
    ).toBeVisible();
    // Wait for setup.json fsync + destroySetupWindow() to complete before reopening setup.
    await expect
      .poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);

    // Trigger A -> A failure where restorePausedStandalone ALSO fails (P1-1):
    // temporarily hide index.html so neither candidate nor paused snapshot can start.
    const setupPromise2 = app!.waitForEvent("window");
    await app!.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById("change-rakazo-server")?.click();
    });
    const setup2 = await setupPromise2;
    await setup2.getByRole("radio", { name: /Existing instance/ }).check();
    await setup2.locator("#server-url").fill(backend.origin);
    if (!(await setup2.locator("#server-headers").isVisible())) {
      await setup2.locator("#server-headers-section summary").click();
    }
    await setup2.locator("#server-headers").fill("X-Header-Gen: v2");

    await rename(entryPath, backupPath);
    try {
      await setup2.getByRole("button", { name: "Continue" }).click();
      await expect(setup2.locator("#status")).toContainText("Could not open that server.");

      // Unrestorable previous window was destroyed cleanly (only Setup window remains).
      expect(await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
        1,
      );
    } finally {
      await rename(backupPath, entryPath).catch(() => undefined);
    }

    // Retry Continue after restoring index.html: capability hook on the standalone session must still work (200, not 403)!
    await setup2.getByRole("radio", { name: /Existing instance/ }).check();
    await setup2.locator("#server-url").fill(backend.origin);
    if (!(await setup2.locator("#server-headers").isVisible())) {
      await setup2.locator("#server-headers-section summary").click();
    }
    await setup2.locator("#server-headers").fill("X-Header-Gen: v2");
    const recoveredPage = await Promise.all([
      app!.waitForEvent("window"),
      setup2.getByRole("button", { name: "Continue" }).click(),
    ]).then(([window]) => window);
    await expect(
      recoveredPage.getByRole("heading", { name: "Sydney Standalone Ready" }),
    ).toBeVisible();
    expect(await recoveredPage.evaluate(() => window.location.origin)).toBe(uiOrigin);

    const latestReq = [...backend.requests]
      .reverse()
      .find((req) => req.url.startsWith("/api/auth/get-session"));
    expect(latestReq?.headers["x-header-gen"]).toBe("v2");
  } finally {
    await rename(backupPath, entryPath).catch(() => undefined);
    await backend.close();
  }
});
