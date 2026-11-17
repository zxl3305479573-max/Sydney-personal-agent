import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("examines stable custom-scheme storage and authentication across upstream port changes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-origin-lab-"));
  let syntheticActions = 0;
  let syntheticActionHasCookie = false;
  const syntheticActionBodies: string[] = [];
  const upstream = () =>
    createServer((request, response) => {
      if (request.url === "/api/set") {
        response.setHeader("Set-Cookie", "__Secure-session=synthetic; Secure; HttpOnly; Path=/");
        response.end("set");
      } else if (request.url === "/api/action") {
        syntheticActions++;
        syntheticActionHasCookie = (request.headers.cookie ?? "").includes(
          "__Secure-session=synthetic",
        );
        let body = "";
        request.on("data", (chunk) => {
          body += chunk.toString();
        });
        request.once("end", () => {
          syntheticActionBodies.push(body);
          response.end("synthetic action");
        });
      } else if (request.url === "/api/rpc?x=1") {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk.toString();
        });
        request.once("end", () => {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              origin: request.headers.origin ?? null,
              header: request.headers["x-synthetic"] ?? null,
              cookie: request.headers.cookie ?? null,
              body,
            }),
          );
        });
      } else {
        response.end(request.headers.cookie ?? "");
      }
    });
  const first = upstream();
  const second = upstream();
  const attacker = createServer((request, response) =>
    response
      .writeHead(200, { "content-type": "text/html" })
      .end(
        request.url === "/worker-frame"
          ? `<script>const source = 'fetch("sydney-lab://app/api/action",{method:"POST",body:"external-worker"}).then(response=>postMessage("worker:"+response.status)).catch(()=>postMessage("worker:rejected"))'; const worker = new Worker(URL.createObjectURL(new Blob([source],{type:"text/javascript"}))); worker.onmessage = event => parent.postMessage(event.data,"*"); worker.onerror = () => parent.postMessage("worker:error","*");</script>`
          : request.url === "/frame"
            ? `<script>fetch("sydney-lab://app/api/action", {method:"POST",body:"frame"}).then(response => parent.postMessage("frame:" + response.status, "*")).catch(() => parent.postMessage("frame:rejected", "*"))</script>`
            : "<title>fixture</title>",
      ),
  );
  await Promise.all([
    new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => second.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => attacker.listen(0, "127.0.0.1", resolve)),
  ]);
  const firstOrigin = `http://127.0.0.1:${(first.address() as AddressInfo).port}`;
  const secondOrigin = `http://127.0.0.1:${(second.address() as AddressInfo).port}`;
  const attackerOrigin = `http://127.0.0.1:${(attacker.address() as AddressInfo).port}`;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [
        path.join(import.meta.dirname, "fixtures", "stable-origin-main.cjs"),
        `--user-data-dir=${path.join(directory, "profile")}`,
      ],
    });
    await app.firstWindow();
    const result = await app.evaluate(
      async ({ BrowserWindow, session }, origins) => {
        const partition = session.fromPartition("persist:stable-origin-fixture");
        let target = origins.firstOrigin;
        const events: Array<{
          pathname: string;
          webContentsId: number | undefined;
          frameUrl: string | undefined;
        }> = [];
        const protocolRequests: Array<{
          pathname: string;
          origin: string | null;
          referer: string | null;
          destination: string;
        }> = [];
        const window = new BrowserWindow({
          show: false,
          webPreferences: { partition: "persist:stable-origin-fixture" },
        });
        let guardEnabled = false;
        partition.webRequest.onBeforeRequest((details, callback) => {
          if (details.url.startsWith("sydney-lab://")) {
            events.push({
              pathname: new URL(details.url).pathname,
              webContentsId: details.webContentsId,
              frameUrl: details.frame?.url,
            });
            if (guardEnabled && new URL(details.url).pathname.startsWith("/api/")) {
              const trusted =
                details.webContentsId === window.webContents.id &&
                details.frame === window.webContents.mainFrame &&
                details.frame.url.startsWith("sydney-lab://app/");
              callback({ cancel: !trusted });
              return;
            }
          }
          callback({});
        });
        partition.protocol.handle("sydney-lab", async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/api/action") {
            protocolRequests.push({
              pathname: url.pathname,
              origin: request.headers.get("origin"),
              referer: request.headers.get("referer"),
              destination: request.destination,
            });
          }
          if (url.pathname === "/") {
            return new Response("<!doctype html><title>fixture</title>", {
              headers: { "content-type": "text/html" },
            });
          }
          return partition.fetch(`${target}${url.pathname}${url.search}`, {
            method: request.method,
            headers: request.headers,
            body:
              request.method === "GET" || request.method === "HEAD"
                ? undefined
                : await request.arrayBuffer(),
          });
        });
        try {
          await window.loadURL("sydney-lab://app/");
          await window.webContents.executeJavaScript(`
          localStorage.setItem("synthetic-draft", "kept");
          Promise.all([
            fetch("/api/set"),
            new Promise((resolve, reject) => {
              const request = indexedDB.open("synthetic-avatar", 1);
              request.onsuccess = () => { request.result.close(); resolve(true); };
              request.onerror = () => reject(request.error);
            }),
          ]);
        `);
          target = origins.secondOrigin;
          await window.loadURL("sydney-lab://app/");
          const state = await window.webContents.executeJavaScript(`
          (async () => ({
            origin: location.origin,
            draft: localStorage.getItem("synthetic-draft"),
            databases: (await indexedDB.databases()).map(item => item.name),
            cookie: await (await fetch("/api/inspect")).text(),
            rpc: await (await fetch("/api/rpc?x=1", { method: "POST", headers: { "content-type": "application/json", "x-synthetic": "ok" }, body: JSON.stringify({ value: 1 }) })).json(),
          }))()
        `);
          const frameResult = await window.webContents.executeJavaScript(`
            new Promise(resolve => {
              window.addEventListener("message", event => resolve(event.data), { once: true });
              const frame = document.createElement("iframe");
              frame.src = ${JSON.stringify(`${origins.attackerOrigin}/frame`)};
              document.body.appendChild(frame);
            })
          `);
          const external = new BrowserWindow({
            show: false,
            webPreferences: { partition: "persist:stable-origin-fixture" },
          });
          let externalResult: string;
          try {
            await external.loadURL(origins.attackerOrigin);
            externalResult = await external.webContents.executeJavaScript(`
              fetch("sydney-lab://app/api/action", { method: "POST", body: "synthetic" })
                .then(response => "resolved:" + response.status)
                .catch(() => "rejected")
            `);
          } finally {
            external.destroy();
          }
          guardEnabled = true;
          const guardedMain = await window.webContents.executeJavaScript(
            'fetch("/api/inspect").then(response => response.text())',
          );
          const guardedFrame = await window.webContents.executeJavaScript(`
            new Promise(resolve => {
              window.addEventListener("message", event => resolve(event.data), { once: true });
              const frame = document.createElement("iframe");
              frame.src = ${JSON.stringify(`${origins.attackerOrigin}/frame`)};
              document.body.appendChild(frame);
            })
          `);
          const guardedExternal = new BrowserWindow({
            show: false,
            webPreferences: { partition: "persist:stable-origin-fixture" },
          });
          let guardedExternalResult: string;
          try {
            await guardedExternal.loadURL(origins.attackerOrigin);
            guardedExternalResult = await guardedExternal.webContents.executeJavaScript(`
              fetch("sydney-lab://app/api/action", { method: "POST", body: "synthetic" })
                .then(response => "resolved:" + response.status)
                .catch(() => "rejected")
            `);
          } finally {
            guardedExternal.destroy();
          }
          const guardedWorker = await window.webContents.executeJavaScript(`
            new Promise(resolve => {
              const source = 'fetch("sydney-lab://app/api/action", {method:"POST",body:"worker"}).then(response => postMessage("resolved:" + response.status)).catch(() => postMessage("rejected"))';
              const worker = new Worker(URL.createObjectURL(new Blob([source], {type: "text/javascript"})));
              worker.onmessage = event => { worker.terminate(); resolve(event.data); };
              worker.onerror = () => { worker.terminate(); resolve("worker-error"); };
            })
          `);
          const guardedWorkerFrame = await window.webContents.executeJavaScript(`
            new Promise(resolve => {
              window.addEventListener("message", event => resolve(event.data), { once: true });
              const frame = document.createElement("iframe");
              frame.src = ${JSON.stringify(`${origins.attackerOrigin}/worker-frame`)};
              document.body.appendChild(frame);
            })
          `);
          const guardedOpaqueWorkerFrame = await window.webContents.executeJavaScript(`
            new Promise(resolve => {
              window.addEventListener("message", event => resolve(event.data), { once: true });
              const frame = document.createElement("iframe");
              frame.sandbox = "allow-scripts";
              frame.src = ${JSON.stringify(`${origins.attackerOrigin}/worker-frame`)};
              document.body.appendChild(frame);
            })
          `);
          await window.loadURL(origins.attackerOrigin);
          const navigatedResult = await window.webContents.executeJavaScript(`
            fetch("sydney-lab://app/api/action", { method: "POST", body: "navigated" })
              .then(response => "resolved:" + response.status)
              .catch(() => "rejected")
          `);
          return {
            ...state,
            externalResult,
            frameResult,
            guardedMain,
            guardedFrame,
            guardedExternalResult,
            guardedWorker,
            guardedWorkerFrame,
            guardedOpaqueWorkerFrame,
            navigatedResult,
            mainId: window.webContents.id,
            events,
            protocolRequests,
            schemeCookieNames: (await partition.cookies.get({ url: "sydney-lab://app/" })).map(
              (cookie) => cookie.name,
            ),
            loopbackCookieNames: (await partition.cookies.get({ url: origins.firstOrigin })).map(
              (cookie) => cookie.name,
            ),
          };
        } finally {
          window.destroy();
          partition.protocol.unhandle("sydney-lab");
        }
      },
      { firstOrigin, secondOrigin, attackerOrigin },
    );
    expect(result.origin).toBe("sydney-lab://app");
    expect(result.draft).toBe("kept");
    expect(result.databases).toContain("synthetic-avatar");
    expect(result.cookie).toContain("__Secure-session=synthetic");
    expect(result.schemeCookieNames).toEqual([]);
    expect(result.loopbackCookieNames).toContain("__Secure-session");
    expect(result.rpc.header).toBe("ok");
    expect(result.rpc.body).toBe('{"value":1}');
    expect(result.rpc.cookie).toContain("__Secure-session=synthetic");
    expect(result.rpc.origin).toBeNull();
    expect(result.externalResult).toBe("resolved:200");
    expect(result.frameResult).toBe("frame:200");
    expect(result.guardedOpaqueWorkerFrame).toBe("worker:200");
    expect(syntheticActions).toBe(5);
    expect(result.protocolRequests).toHaveLength(5);
    expect(result.protocolRequests).toEqual(
      Array.from({ length: 5 }, () => ({
        pathname: "/api/action",
        origin: null,
        referer: null,
        destination: "",
      })),
    );
    expect(syntheticActionBodies).toEqual([
      "frame",
      "synthetic",
      "worker",
      "external-worker",
      "external-worker",
    ]);
    expect(syntheticActionHasCookie).toBe(true);
    const frameEvent = result.events.find(
      (event: { pathname: string; webContentsId: number; frameUrl: string }) =>
        event.pathname === "/api/action" && event.frameUrl === `${attackerOrigin}/frame`,
    );
    expect(frameEvent.webContentsId).toBe(result.mainId);
    expect(result.guardedMain).toContain("__Secure-session=synthetic");
    expect(result.guardedFrame).toBe("frame:rejected");
    expect(result.guardedExternalResult).toBe("rejected");
    expect(result.navigatedResult).toBe("rejected");
    expect(result.guardedWorker).toBe("resolved:200");
    expect(result.guardedWorkerFrame).toBe("worker:200");
    expect(
      result.events.filter((event: { pathname: string }) => event.pathname === "/api/action"),
    ).toHaveLength(5);
    await app.close();
    app = await electron.launch({
      args: [
        path.join(import.meta.dirname, "fixtures", "stable-origin-main.cjs"),
        `--user-data-dir=${path.join(directory, "profile")}`,
      ],
    });
    await app.firstWindow();
    const restarted = await app.evaluate(async ({ BrowserWindow, session }) => {
      const partition = session.fromPartition("persist:stable-origin-fixture");
      partition.protocol.handle(
        "sydney-lab",
        () =>
          new Response("<!doctype html><title>fixture</title>", {
            headers: { "content-type": "text/html" },
          }),
      );
      const window = new BrowserWindow({
        show: false,
        webPreferences: { partition: "persist:stable-origin-fixture" },
      });
      try {
        await window.loadURL("sydney-lab://app/");
        return await window.webContents.executeJavaScript(`
          (async () => ({
            draft: localStorage.getItem("synthetic-draft"),
            databases: (await indexedDB.databases()).map(item => item.name),
          }))()
        `);
      } finally {
        window.destroy();
        partition.protocol.unhandle("sydney-lab");
      }
    });
    expect(restarted.draft).toBe("kept");
    expect(restarted.databases).toContain("synthetic-avatar");
  } finally {
    await app?.close();
    for (const server of [first, second, attacker]) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await rm(directory, { recursive: true, force: true });
  }
});
