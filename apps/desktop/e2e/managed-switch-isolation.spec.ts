import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("shows shared-session mode changes and isolates a candidate session", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-managed-switch-"));
  const backend = createServer((_request, response) =>
    response.writeHead(200, { "content-type": "text/html" }).end("<title>remote</title>"),
  );
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [
        path.join(import.meta.dirname, "fixtures", "session-isolation-main.cjs"),
        `--user-data-dir=${path.join(directory, "profile")}`,
      ],
    });
    await app.firstWindow();
    const result = await app.evaluate(async ({ BrowserWindow, session }, target) => {
      const sharedSession = session.fromPartition("managed-switch-shared");
      const candidateSession = session.fromPartition("managed-switch-candidate");
      let sharedMode = false;
      let candidateMode = true;
      await sharedSession.protocol.handle("http", (request) =>
        sharedMode
          ? new Response("<title>bundled</title>", { headers: { "content-type": "text/html" } })
          : sharedSession.fetch(request, { bypassCustomProtocolHandlers: true }),
      );
      await candidateSession.protocol.handle("http", (request) =>
        candidateMode
          ? new Response("<title>bundled</title>", { headers: { "content-type": "text/html" } })
          : candidateSession.fetch(request, { bypassCustomProtocolHandlers: true }),
      );
      const oldWindow = new BrowserWindow({
        show: false,
        webPreferences: { partition: "managed-switch-shared" },
      });
      const candidateWindow = new BrowserWindow({
        show: false,
        webPreferences: { partition: "managed-switch-candidate" },
      });
      const sharedWindow = new BrowserWindow({
        show: false,
        webPreferences: { partition: "managed-switch-shared" },
      });
      try {
        await oldWindow.loadURL(target);
        await sharedWindow.loadURL(target);
        const before = await oldWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        sharedMode = true;
        const duringSharedSwitch = await oldWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        const sharedCandidate = await sharedWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        sharedMode = false;
        await candidateWindow.loadURL(target);
        const isolatedOld = await oldWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        const isolatedCandidate = await candidateWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        candidateMode = false;
        const candidateAfterReset = await candidateWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        const afterCandidateRollback = await oldWindow.webContents.executeJavaScript(
          'fetch("/check").then(response => response.text())',
        );
        return {
          before,
          duringSharedSwitch,
          sharedCandidate,
          isolatedOld,
          isolatedCandidate,
          candidateAfterReset,
          afterCandidateRollback,
        };
      } finally {
        oldWindow.destroy();
        candidateWindow.destroy();
        sharedWindow.destroy();
        sharedSession.protocol.unhandle("http");
        candidateSession.protocol.unhandle("http");
      }
    }, origin);
    expect(result.before).toContain("remote");
    expect(result.duringSharedSwitch).toContain("bundled");
    expect(result.sharedCandidate).toContain("bundled");
    expect(result.isolatedOld).toContain("remote");
    expect(result.isolatedCandidate).toContain("bundled");
    expect(result.candidateAfterReset).toContain("remote");
    expect(result.afterCandidateRollback).toContain("remote");
  } finally {
    await app?.close();
    backend.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      backend.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
