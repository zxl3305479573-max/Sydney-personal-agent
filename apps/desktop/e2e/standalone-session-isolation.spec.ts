import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { standaloneSessionPartitionForServerUrl } from "../src/setup-config";
import { StandaloneRendererProxy } from "../src/standalone-renderer-proxy";

test("isolates loopback cookies by backend partition and exposes shared-session leakage", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-electron-partition-"));
  const userData = path.join(directory, "profile");
  await writeFile(path.join(directory, "index.html"), "<title>Fixture</title>");
  const first = createServer((request, response) => {
    if (request.url === "/api/inspect") {
      response.end(request.headers.cookie ?? "");
      return;
    }
    response.setHeader("Set-Cookie", "__Secure-session=synthetic-first; Secure; HttpOnly; Path=/");
    response.end("ok");
  });
  const second = createServer((request, response) => response.end(request.headers.cookie ?? ""));
  await Promise.all([
    new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => second.listen(0, "127.0.0.1", resolve)),
  ]);
  const firstBackend = `http://127.0.0.1:${(first.address() as AddressInfo).port}`;
  const secondBackend = `http://127.0.0.1:${(second.address() as AddressInfo).port}`;
  const firstPartition = standaloneSessionPartitionForServerUrl(firstBackend);
  const secondPartition = standaloneSessionPartitionForServerUrl(secondBackend);
  expect(firstPartition).toBeTruthy();
  expect(secondPartition).toBeTruthy();
  expect(firstPartition).not.toBe(secondPartition);
  const firstProxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: firstBackend,
  });
  const secondProxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: secondBackend,
  });
  const restartedProxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: firstBackend,
  });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const firstOrigin = await firstProxy.start();
    const secondOrigin = await secondProxy.start();
    const restartedOrigin = await restartedProxy.start();
    app = await electron.launch({
      args: [
        path.join(import.meta.dirname, "fixtures", "session-isolation-main.cjs"),
        `--user-data-dir=${userData}`,
      ],
    });
    await app.firstWindow();
    const result = await app.evaluate(
      async ({ BrowserWindow }, values) => {
        const windows = [
          new BrowserWindow({ show: false, webPreferences: { partition: values.firstPartition! } }),
          new BrowserWindow({
            show: false,
            webPreferences: { partition: values.secondPartition! },
          }),
          new BrowserWindow({ show: false, webPreferences: { partition: values.firstPartition! } }),
          new BrowserWindow({ show: false, webPreferences: { partition: values.firstPartition! } }),
        ];
        try {
          await windows[0]!.loadURL(values.firstOrigin);
          await windows[0]!.webContents.executeJavaScript(
            `localStorage.setItem("synthetic-setting", "first");
             Promise.all([
               fetch("/api/session"),
               new Promise((resolve, reject) => {
                 const request = indexedDB.open("synthetic-avatar", 1);
                 request.onsuccess = () => { request.result.close(); resolve(true); };
                 request.onerror = () => reject(request.error);
               }),
             ])`,
          );
          await Promise.all([
            windows[1]!.loadURL(values.secondOrigin),
            windows[2]!.loadURL(values.secondOrigin),
            windows[3]!.loadURL(values.restartedOrigin),
          ]);
          const isolated = await windows[1]!.webContents.executeJavaScript(
            'fetch("/api/session").then(response => response.text())',
          );
          const shared = await windows[2]!.webContents.executeJavaScript(
            'fetch("/api/session").then(response => response.text())',
          );
          const restarted = await windows[3]!.webContents.executeJavaScript(
            'fetch("/api/inspect").then(async response => ({ cookie: await response.text(), setting: localStorage.getItem("synthetic-setting"), databases: (await indexedDB.databases()).map(database => database.name) }))',
          );
          return { isolated, shared, restarted };
        } finally {
          for (const window of windows) window.destroy();
        }
      },
      { firstOrigin, secondOrigin, restartedOrigin, firstPartition, secondPartition },
    );
    expect(result.isolated).toBe("");
    expect(result.shared).toContain("__Secure-session=synthetic-first");
    expect(result.restarted.cookie).toContain("__Secure-session=synthetic-first");
    expect(result.restarted.setting).toBeNull();
    expect(result.restarted.databases).not.toContain("synthetic-avatar");
  } finally {
    await app?.close();
    await Promise.all([firstProxy.stop(), secondProxy.stop(), restartedProxy.stop()]);
    for (const server of [first, second]) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await rm(directory, { recursive: true, force: true });
  }
});
