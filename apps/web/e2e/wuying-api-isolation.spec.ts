import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createWuyingFixtureServer } from "../../api/e2e/wuying-assets-fixture";

test.describe("Wuying API asset isolation with a synthetic SDK", () => {
  let directory: string;
  let server: Server;
  let origin: string;
  const requests: string[] = [];

  test.beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sydney-wuying-browser-"));
    await mkdir(path.join(directory, "sdk/ASP"), { recursive: true });
    for (const file of ["screen.html", "screen.js", "storage.js"]) {
      await copyFile(
        path.resolve(import.meta.dirname, "../../../packages/core/wuying-assets", file),
        path.join(directory, file),
      );
    }
    await writeFile(
      path.join(directory, "WuyingWebSDK.js"),
      `
      window.Wuying = { WebSDK: { createSession(name, options) {
        const handlers = {};
        localStorage.setItem("vendor-marker", "disposable");
        return {
          addHandle(name, callback) { handlers[name] = callback; },
          enableInput(enabled) { document.body.dataset.input = String(enabled); },
          start() {
            const frame = document.getElementById(options.iframeId);
            frame.addEventListener("load", () => handlers.onConnected());
            frame.src = "./sdk/ASP/container.html";
          },
          stop() { document.body.dataset.stopped = "true"; }
        };
      } } };
    `,
    );
    await writeFile(
      path.join(directory, "sdk/ASP/container.html"),
      '<!doctype html><html><head><script src="../../storage.js"></script></head><body>Nested vendor fixture</body></html>',
    );
    server = createWuyingFixtureServer(directory);
    server.on("request", (request) => requests.push(request.url ?? "/"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (
      directory &&
      path.dirname(directory) === tmpdir() &&
      path.basename(directory).startsWith("sydney-wuying-browser-")
    ) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  for (const control of [false, true]) {
    test(`isolates both vendor frames and preserves ${control ? "control" : "view only"} input`, async ({
      page,
    }) => {
      await page
        .context()
        .addCookies([{ name: "app-session", value: "SYNTHETIC_PRIVATE_SESSION", url: origin }]);
      await page.goto(origin);
      await page.evaluate((control) => {
        localStorage.setItem("app-data", "SYNTHETIC_PRIVATE_DATA");
        const frame = document.querySelector("iframe")!;
        document.body.dataset.states = "";
        window.addEventListener("message", (event) => {
          if (event.source === frame.contentWindow && event.data?.rakazoScreen) {
            document.body.dataset.states += `${event.data.rakazoScreen},`;
          }
        });
        frame.src = `/wuying/screen.html#desktop_id=synthetic&auth_code=SYNTHETIC_CODE&view_only=${!control}`;
      }, control);
      await expect(page.locator("body")).toHaveAttribute("data-states", "connecting,connected,");
      const outer = page.frames().find((frame) => frame.url().includes("/wuying/screen.html"))!;
      const nested = page
        .frames()
        .find((frame) => frame.url().includes("/sdk/ASP/container.html"))!;
      expect(outer).toBeTruthy();
      expect(nested).toBeTruthy();
      await expect(nested.locator("body")).toHaveText("Nested vendor fixture");
      expect(
        await outer.evaluate(() => ({
          parent: (() => {
            try {
              return parent.document.title;
            } catch (error) {
              return (error as Error).name;
            }
          })(),
          cookie: document.cookie,
          appData: localStorage.getItem("app-data"),
          vendorData: localStorage.getItem("vendor-marker"),
          input: document.body.dataset.input,
        })),
      ).toEqual({
        parent: "SecurityError",
        cookie: "",
        appData: null,
        vendorData: "disposable",
        input: String(control),
      });
      expect(
        await nested.evaluate(() => ({
          parent: (() => {
            try {
              return parent.document.title;
            } catch (error) {
              return (error as Error).name;
            }
          })(),
          cookie: document.cookie,
          appData: localStorage.getItem("app-data"),
          outerData: localStorage.getItem("vendor-marker"),
        })),
      ).toEqual({ parent: "SecurityError", cookie: "", appData: null, outerData: null });
      expect(
        await outer.evaluate(() =>
          fetch("/api/private", { credentials: "include" })
            .then((response) => response.text())
            .catch(() => "blocked"),
        ),
      ).toBe("blocked");
      expect(await page.evaluate(() => localStorage.getItem("app-data"))).toBe(
        "SYNTHETIC_PRIVATE_DATA",
      );
      expect(requests.filter((url) => url.includes("SYNTHETIC_CODE"))).toEqual([]);
      expect(requests).toContain("/wuying/sdk/ASP/container.html");
      expect(requests).not.toContain("/api/private");
    });
  }

  test("preserves gateway frame protection except for the opaque nested container", async ({
    request,
  }) => {
    for (const pathname of ["/", "/api/private", "/wuying/screen.html", "/wuying/screen.js"]) {
      const response = await request.get(`${origin}${pathname}`);
      expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    }
    const nested = await request.get(`${origin}/wuying/sdk/ASP/container.html`);
    expect(nested.headers()["x-frame-options"]).toBeUndefined();
    expect(nested.headers()["content-security-policy"]).toContain(
      "sandbox allow-scripts allow-pointer-lock",
    );
  });

  test("missing vendor resources produce an explicit unavailable response", async ({ request }) => {
    await rm(path.join(directory, "WuyingWebSDK.js"));
    const response = await request.get(`${origin}/wuying/screen.html`);
    expect(response.status()).toBe(503);
    expect(await response.text()).toBe("Wuying screen unavailable");
  });
});
