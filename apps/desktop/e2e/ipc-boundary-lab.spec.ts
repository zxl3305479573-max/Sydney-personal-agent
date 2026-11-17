import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("examines IPC caller identity for main frame, sandbox frame, worker and navigation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-ipc-lab-"));
  const upstreamWrites: {
    method: string | undefined;
    url: string | undefined;
    auth: string | undefined;
    body: string;
  }[] = [];
  const startedRequests: string[] = [];
  const external = createServer((request, response) => {
    startedRequests.push(`${request.method} ${request.url}`);
    if (request.url === "/fixed-write") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => (body += chunk));
      request.on("end", () => {
        upstreamWrites.push({
          method: request.method,
          url: request.url,
          auth: request.headers.authorization,
          body,
        });
        response.writeHead(204).end();
      });
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      request.url === "/frame"
        ? `<script>Promise.resolve(window.syntheticBridge?.write?.() ?? "no-bridge").then(value => parent.postMessage({kind:"synthetic-frame",value}, "*")).catch(() => parent.postMessage({kind:"synthetic-frame",value:"rejected"}, "*"))</script>`
        : "<title>external fixture</title>",
    );
  });
  await new Promise<void>((resolve) => external.listen(0, "127.0.0.1", resolve));
  const externalOrigin = `http://127.0.0.1:${(external.address() as AddressInfo).port}`;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [
        path.join(import.meta.dirname, "fixtures", "ipc-boundary-main.cjs"),
        `--user-data-dir=${path.join(directory, "profile")}`,
        externalOrigin,
      ],
    });
    const page = await app.firstWindow();
    await expect(page).toHaveURL("sydney-ipc-lab://app/");
    expect(await page.evaluate(() => (window as any).syntheticBridge.write())).toBe("synthetic-ok");
    const subframeResult = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const frame = document.createElement("iframe");
          frame.onload = () => {
            const bridge = (frame.contentWindow as any)?.syntheticBridge;
            if (!bridge) {
              reject(new Error("Subframe bridge unavailable"));
              return;
            }
            bridge.write().then(
              () => resolve("accepted"),
              () => resolve("rejected"),
            );
          };
          frame.onerror = () => reject(new Error("Subframe failed to load"));
          frame.name = "same-origin-fixture";
          frame.src = "sydney-ipc-lab://app/";
          document.body.appendChild(frame);
        }),
    );
    expect(subframeResult).toBe("rejected");
    const sameOriginFrame = page.frames().find((frame) => frame.name() === "same-origin-fixture");
    expect(sameOriginFrame).toBeTruthy();
    const parentBridgeResult = await sameOriginFrame!.evaluate(() =>
      (parent as any).syntheticBridge
        .write()
        .then(() => "accepted")
        .catch(() => "rejected"),
    );
    expect(parentBridgeResult).toBe("accepted");
    const sandboxParentAccess = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const frame = document.createElement("iframe");
          frame.sandbox.add("allow-scripts");
          window.addEventListener("message", function listener(event) {
            if (event.source !== frame.contentWindow || event.data?.kind !== "sandbox-parent")
              return;
            window.removeEventListener("message", listener);
            resolve(event.data.result);
          });
          frame.src = "sydney-ipc-lab://app/sandbox";
          document.body.appendChild(frame);
        }),
    );
    expect(sandboxParentAccess).toBe("blocked");
    const frameResult = await page.evaluate(
      (origin) =>
        new Promise((resolve) => {
          const frame = document.createElement("iframe");
          window.addEventListener("message", function listener(event) {
            if (event.source !== frame.contentWindow || event.data?.kind !== "synthetic-frame")
              return;
            window.removeEventListener("message", listener);
            resolve(event.data.value);
          });
          frame.sandbox.add("allow-scripts");
          frame.src = `${origin}/frame`;
          document.body.appendChild(frame);
        }),
      externalOrigin,
    );
    expect(frameResult).toBe("rejected");
    const workerResult = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const worker = new Worker(
            URL.createObjectURL(
              new Blob(["postMessage(typeof self.syntheticBridge)"], { type: "text/javascript" }),
            ),
          );
          worker.onmessage = (event) => {
            worker.terminate();
            resolve(event.data);
          };
        }),
    );
    expect(workerResult).toBe("undefined");
    const externalWindow = await app.evaluate(
      async ({ BrowserWindow }, values) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            preload: values.preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        try {
          await window.loadURL(values.origin);
          return await window.webContents.executeJavaScript(`
            window.syntheticBridge.write().then(() => "accepted").catch(() => "rejected")
          `);
        } finally {
          window.destroy();
        }
      },
      {
        origin: externalOrigin,
        preload: path.join(import.meta.dirname, "fixtures", "ipc-boundary-preload.cjs"),
      },
    );
    expect(externalWindow).toBe("rejected");
    const otherTrustedWindow = await app.evaluate(
      async ({ BrowserWindow }, preload) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        try {
          await window.loadURL("sydney-ipc-lab://app/");
          return await window.webContents.executeJavaScript(`
            window.syntheticBridge.write().then(() => "accepted").catch(() => "rejected")
          `);
        } finally {
          window.destroy();
        }
      },
      path.join(import.meta.dirname, "fixtures", "ipc-boundary-preload.cjs"),
    );
    expect(otherTrustedWindow).toBe("rejected");
    await page.goto(externalOrigin);
    const navigated = await page.evaluate(() =>
      (window as any).syntheticBridge
        .write()
        .then(() => "accepted")
        .catch(() => "rejected"),
    );
    expect(navigated).toBe("rejected");
    const writes = await app.evaluate(
      () => (globalThis as typeof globalThis & { syntheticWrites: number }).syntheticWrites,
    );
    expect(writes).toBe(2);
    const decisions = await app.evaluate(
      () => (globalThis as typeof globalThis & { syntheticDecisions: string[] }).syntheticDecisions,
    );
    expect(decisions.filter((decision) => decision === "accepted")).toHaveLength(2);
    expect(decisions.filter((decision) => decision === "window")).toHaveLength(2);
    expect(decisions.filter((decision) => decision === "frame")).toHaveLength(2);
    expect(decisions.filter((decision) => decision === "url")).toHaveLength(1);
    expect(startedRequests.filter((request) => request.startsWith("POST "))).toEqual([
      "POST /fixed-write",
      "POST /fixed-write",
    ]);
    expect(upstreamWrites).toEqual([
      {
        method: "POST",
        url: "/fixed-write",
        auth: "Bearer synthetic-lab-token",
        body: "synthetic-body",
      },
      {
        method: "POST",
        url: "/fixed-write",
        auth: "Bearer synthetic-lab-token",
        body: "synthetic-body",
      },
    ]);
  } finally {
    await app?.close();
    external.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      external.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
