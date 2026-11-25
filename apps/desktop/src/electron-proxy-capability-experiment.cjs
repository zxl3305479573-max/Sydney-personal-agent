// Run from apps/desktop: pnpm exec electron src/electron-proxy-capability-experiment.cjs
const { app, BrowserWindow, session } = require("electron");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");

function loadBundledTs(entryFile) {
  const built = esbuild.buildSync({
    entryPoints: [entryFile],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    write: false,
  });
  const mod = new Module(entryFile, module);
  mod.filename = entryFile;
  mod.paths = Module._nodeModulePaths(path.dirname(entryFile));
  mod._compile(built.outputFiles[0].text, entryFile);
  return mod.exports;
}

const { installProxyCapability, PROXY_CAPABILITY_HEADER } = loadBundledTs(
  path.join(__dirname, "proxy-request-capability.ts"),
);
const { StandaloneRendererProxy } = loadBundledTs(
  path.join(__dirname, "standalone-renderer-proxy.ts"),
);

async function listen(server, port = 0) {
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(port, "127.0.0.1", resolve),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

function emitReport(payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (process.env.SYDNEY_CAP_EXP_OUT) {
    fsSync.writeFileSync(process.env.SYDNEY_CAP_EXP_OUT, text, "utf8");
  }
  process.stdout.write(text);
}

async function main() {
  const rendererRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sydney-cap-exp-"));
  await fs.mkdir(path.join(rendererRoot, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(rendererRoot, "index.html"),
    "<!doctype html><title>Sydney Standalone</title><div id='root'>ready</div>",
  );
  await fs.writeFile(path.join(rendererRoot, "sw.js"), "// should never be served");
  await fs.writeFile(
    path.join(rendererRoot, "assets", "worker.js"),
    'fetch("/api/worker-fetch").then(async r => postMessage({ status: r.status, text: await r.text() }), e => postMessage({ error: String(e) }));',
  );
  // Deliberately omit inline CSP on this synthetic html-viewer.html so untrusted scripts inside
  // sandbox="allow-scripts" actually attempt network/worker calls against the capability gate.
  await fs.writeFile(
    path.join(rendererRoot, "html-viewer.html"),
    `<!doctype html><script>
      window.addEventListener("message", async (event) => {
        if (event.data?.probe !== "html-viewer") return;
        const base = event.data.origin;
        async function statusOf(url) {
          try {
            const res = await fetch(url, { headers: { "x-sydney-proxy-capability": "viewer-forged" } });
            return res.status;
          } catch {
            return "NETWORK_ERR";
          }
        }
        const apiStatus = await statusOf(base + "/api/from-html-viewer");
        const screenAssetStatus = await statusOf(base + "/wuying/screen.js");
        const blobWorkerStatus = await new Promise((resolve) => {
          try {
            const blob = new Blob([
              'fetch(' + JSON.stringify(base + '/api/from-blob-worker') + ').then(r => postMessage(r.status), () => postMessage("WORKER_FETCH_ERR"))'
            ], { type: 'text/javascript' });
            const w = new Worker(URL.createObjectURL(blob));
            w.onmessage = (e) => { w.terminate(); resolve(e.data); };
            w.onerror = () => resolve("WORKER_ERR");
            setTimeout(() => resolve("WORKER_TIMEOUT"), 3000);
          } catch {
            resolve("WORKER_BLOCKED");
          }
        });
        parent.postMessage({ source: "html-viewer-result", apiStatus, screenAssetStatus, blobWorkerStatus }, "*");
      });
    </script>`,
  );

  const upstreamRecords = [];
  const otherRecords = [];
  const hookEvents = [];
  let otherOrigin = "";

  const otherServer = http.createServer((req, res) => {
    otherRecords.push({
      path: new URL(req.url, "http://localhost").pathname,
      capability: req.headers[PROXY_CAPABILITY_HEADER] ?? null,
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.writeHead(200, { "Content-Type": "text/plain" }).end("other-ok");
  });

  const novncPrefix = "/novnc/session/view/9999999999999.synthetic";
  const upstream = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    upstreamRecords.push({
      path: url.pathname + url.search,
      capability: req.headers[PROXY_CAPABILITY_HEADER] ?? null,
      gatewayKey: req.headers["x-gateway-key"] ?? null,
      origin: req.headers.origin ?? null,
    });
    if (url.pathname === "/api/redirect-same") {
      res.writeHead(302, { Location: "/api/redirect-final" }).end();
      return;
    }
    if (url.pathname === `${novncPrefix}/vnc.html`) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
        <script src="./core/rfb.js"></script>
        <script>
          (async () => {
            const origin = new URL(location.href).origin;
            let apiBlocked = false;
            try {
              const r = await fetch(origin + "/api/from-novnc");
              apiBlocked = r.status === 403;
            } catch {
              apiBlocked = true;
            }
            const wsOk = await new Promise((resolve) => {
              const ws = new WebSocket(origin.replace("http:", "ws:") + "//novnc/session/view/9999999999999.synthetic/websockify");
              ws.onmessage = (e) => { ws.close(); resolve(e.data === "pong"); };
              ws.onerror = () => resolve(false);
              ws.onopen = () => ws.send("ping");
              setTimeout(() => resolve(false), 3000);
            });
            parent.postMessage({ source: "novnc-result", rfbLoaded: window.__rfbLoaded === true, wsOk, apiBlocked }, "*");
          })();
        </script>`);
      return;
    }
    if (url.pathname === `${novncPrefix}/core/rfb.js`) {
      res.writeHead(200, {
        "Content-Type": "text/javascript",
        "Access-Control-Allow-Origin": "*",
      });
      res.end("window.__rfbLoaded = true;");
      return;
    }
    if (url.pathname === "/wuying/screen.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
        <iframe id="session"></iframe>
        <script src="./screen.js"></script>`);
      return;
    }
    if (url.pathname === "/wuying/screen.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(`
        (async () => {
          const origin = new URL(location.href).origin;
          let rpcBlocked = false;
          try {
            const r = await fetch(origin + "/rpc/from-wuying", { method: "POST" });
            rpcBlocked = r.status === 403;
          } catch {
            rpcBlocked = true;
          }
          let apiScriptBlocked = await new Promise((resolve) => {
            const s = document.createElement("script");
            s.onload = () => resolve(false);
            s.onerror = () => resolve(true);
            s.src = origin + "/api/from-wuying.js";
            document.head.appendChild(s);
          });
          const nestedLoaded = await new Promise((resolve) => {
            const inner = document.getElementById("session");
            window.addEventListener("message", (e) => {
              if (e.data?.source === "wuying-inner") resolve(e.data.ok === true);
            });
            inner.onerror = () => resolve(false);
            inner.src = "./sdk/ASP/container.html";
            setTimeout(() => resolve(false), 3000);
          });
          parent.postMessage({ source: "wuying-result", nestedLoaded, rpcBlocked, apiScriptBlocked }, "*");
        })();
      `);
      return;
    }
    if (url.pathname === "/wuying/sdk/ASP/container.html") {
      res
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end('<!doctype html><script src="/wuying/storage.js"></script>');
      return;
    }
    if (url.pathname === "/wuying/storage.js") {
      res
        .writeHead(200, { "Content-Type": "text/javascript" })
        .end('parent.postMessage({ source: "wuying-inner", ok: true }, "*");');
      return;
    }
    if (url.pathname === "/api/account/export") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="export.json"',
      });
      res.end('{"exported":true}');
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" }).end(`ok:${url.pathname}`);
  });

  upstream.on("upgrade", (req, socket) => {
    upstreamRecords.push({
      path: req.url,
      upgrade: true,
      capability: req.headers[PROXY_CAPABILITY_HEADER] ?? null,
      gatewayKey: req.headers["x-gateway-key"] ?? null,
    });
    const accept = crypto
      .createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.once("data", () => {
      socket.write(Buffer.from([0x81, 0x04, 0x70, 0x6f, 0x6e, 0x67]));
    });
  });

  let proxy;
  let win;
  let popup;
  let exitCode = 0;
  try {
    const remoteOrigin = await listen(upstream);
    otherOrigin = await listen(otherServer);

    proxy = new StandaloneRendererProxy({
      rendererRoot,
      remoteOrigin,
      setup: {
        mode: "existing",
        serverUrl: remoteOrigin,
        headers: { "x-gateway-key": "configured-secret" },
      },
      requireCapability: true,
    });
    const proxyOrigin = await proxy.start();
    const currentProxyOrigin = proxyOrigin;

    const isolated = session.fromPartition(`experiment-${crypto.randomUUID()}`, { cache: false });
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    popup = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const wrappedSession = {
      webRequest: {
        onBeforeSendHeaders(handler) {
          isolated.webRequest.onBeforeSendHeaders((details, callback) => {
            handler(details, (decision) => {
              const cap = decision.requestHeaders?.[PROXY_CAPABILITY_HEADER] ?? null;
              hookEvents.push({
                path: new URL(details.url).pathname + new URL(details.url).search,
                targetOrigin: new URL(details.url).origin,
                type: details.resourceType,
                method: details.method,
                contentsMatch: details.webContentsId === win.webContents.id,
                initiatorOrigin: details.initiatorOrigin ?? null,
                frameOrigin: details.frame?.origin ?? null,
                frameUrl: details.frame?.url ?? null,
                hasParent: details.frame ? details.frame.parent !== null : null,
                injected:
                  cap === proxy.capability
                    ? "app"
                    : cap === proxy.screenCapability
                      ? "screen"
                      : cap === null
                        ? null
                        : "unexpected",
              });
              callback(decision);
            });
          });
        },
      },
    };

    installProxyCapability(wrappedSession, {
      proxyOrigin: () => currentProxyOrigin,
      token: () => proxy.capability,
      screenToken: () => proxy.screenCapability,
      appContentsId: () => win.webContents.id,
    });

    // Verify recovery from an opaque Chromium error page before loading the proxy page
    await win.loadURL("http://127.0.0.1:1/unreachable").catch(() => {});
    const errorPageOriginBeforeRecovery = win.webContents.mainFrame.origin;
    const errorPageUrlBeforeRecovery = win.webContents.mainFrame.url;

    await win.loadURL(`${proxyOrigin}/artifacts/report.v1`);
    const title = await win.webContents.getTitle();

    const downloadPath = path.join(rendererRoot, "downloaded-export.json");
    const downloadPromise = new Promise((resolve) => {
      isolated.once("will-download", (_event, item) => {
        item.setSavePath(downloadPath);
        item.once("done", (_e, state) => resolve(state));
      });
      setTimeout(() => resolve("timeout"), 4000);
    });
    await win.webContents.executeJavaScript(`(() => {
      const a = document.createElement("a");
      a.href = "/api/account/export?token=synthetic";
      a.download = "export.json";
      document.body.appendChild(a);
      a.click();
    })()`);
    const downloadState = await downloadPromise;
    const downloadedBody =
      downloadState === "completed" ? await fs.readFile(downloadPath, "utf8") : null;

    const browserChecks = await win.webContents.executeJavaScript(`(async () => {
      const out = {};
      const fetchRes = await fetch("/api/hello", {
        method: "POST",
        headers: { "x-sydney-proxy-capability": "page-forged" },
        body: "hi",
      });
      out.fetch = { status: fetchRes.status, body: await fetchRes.text() };

      out.xhr = await new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open("GET", "/api/xhr");
        x.onload = () => resolve(x.status);
        x.onerror = () => resolve("ERR");
        x.send();
      });

      const sameRedir = await fetch("/api/redirect-same");
      out.redirectSame = { status: sameRedir.status, body: await sameRedir.text() };

      out.worker = await new Promise((resolve) => {
        const w = new Worker("/assets/worker.js");
        w.onmessage = (e) => { w.terminate(); resolve(e.data); };
        w.onerror = (e) => resolve({ error: String(e.message || e) });
        setTimeout(() => resolve({ error: "timeout" }), 4000);
      });

      const swRes = await fetch("/sw.js");
      out.swBlocked = swRes.status === 404;

      out.htmlViewer = await new Promise((resolve) => {
        const f = document.createElement("iframe");
        f.sandbox = "allow-scripts";
        const onMsg = (e) => {
          if (e.data?.source === "html-viewer-result") {
            window.removeEventListener("message", onMsg);
            resolve(e.data);
          }
        };
        window.addEventListener("message", onMsg);
        f.onload = () => f.contentWindow.postMessage({ probe: "html-viewer", origin: location.origin }, "*");
        f.onerror = () => resolve({ error: "load-error" });
        f.src = "/html-viewer.html";
        document.body.appendChild(f);
        setTimeout(() => resolve({ error: "timeout" }), 5000);
      });

      out.novnc = await new Promise((resolve) => {
        const f = document.createElement("iframe");
        const onMsg = (e) => {
          if (e.data?.source === "novnc-result") {
            window.removeEventListener("message", onMsg);
            resolve(e.data);
          }
        };
        window.addEventListener("message", onMsg);
        f.src = ${JSON.stringify(`${novncPrefix}/vnc.html`)};
        document.body.appendChild(f);
        setTimeout(() => resolve({ error: "timeout" }), 5000);
      });

      out.wuying = await new Promise((resolve) => {
        const f = document.createElement("iframe");
        const onMsg = (e) => {
          if (e.data?.source === "wuying-result") {
            window.removeEventListener("message", onMsg);
            resolve(e.data);
          }
        };
        window.addEventListener("message", onMsg);
        f.src = "/wuying/screen.html#desktop_id=1";
        document.body.appendChild(f);
        setTimeout(() => resolve({ error: "timeout" }), 5000);
      });

      return out;
    })()`);

    await popup.loadURL(`${proxyOrigin}/`);
    const popupBody = await popup.webContents.executeJavaScript("document.body.innerText");

    // Verify true 302 hop from proxyOrigin -> cross-origin strips capability header on the second hop
    const proxyPort = Number(new URL(proxyOrigin).port);
    await proxy.stop();
    const redirectHopServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/cross-hop") {
        res.writeHead(302, { Location: `${otherOrigin}/cross-final` }).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" }).end("<title>hop</title>");
    });
    await listen(redirectHopServer, proxyPort);
    try {
      await win.loadURL(`${proxyOrigin}/hop-page`);
      await win.webContents.executeJavaScript(`fetch("/cross-hop").then(r => r.text())`);
    } finally {
      await new Promise((resolve) => redirectHopServer.close(resolve));
    }

    const hookFor = (pathPrefix) => hookEvents.filter((e) => e.path === pathPrefix);
    const upstreamPaths = new Set(upstreamRecords.map((r) => r.path));

    const results = {
      "recovery from opaque error page + main navigation + dotted /artifacts route (200)":
        errorPageOriginBeforeRecovery === "null" &&
        errorPageUrlBeforeRecovery === "http://127.0.0.1:1/unreachable" &&
        title === "Sydney Standalone" &&
        hookFor("/artifacts/report.v1").every((e) => e.injected === "app")
          ? "PASS"
          : "FAIL",
      "same-origin <a download> account export (200)":
        downloadState === "completed" &&
        downloadedBody === '{"exported":true}' &&
        hookFor("/api/account/export?token=synthetic").length > 0 &&
        hookFor("/api/account/export?token=synthetic").every((e) => e.injected === "app")
          ? "PASS"
          : "FAIL",
      "main fetch + forged header overwritten (200)":
        browserChecks.fetch?.status === 200 ? "PASS" : "FAIL",
      "main xhr (200)": browserChecks.xhr === 200 ? "PASS" : "FAIL",
      "same-origin redirect preserves app capability (200)":
        browserChecks.redirectSame?.status === 200 &&
        hookFor("/api/redirect-final").every((e) => e.injected === "app")
          ? "PASS"
          : "FAIL",
      "cross-origin redirect hop strips capability":
        hookFor("/cross-hop").some((e) => e.injected === "app") &&
        otherRecords.length > 0 &&
        otherRecords.every((r) => r.capability === null)
          ? "PASS"
          : "FAIL",
      "dedicated worker script + fetch (200)":
        browserChecks.worker?.status === 200 &&
        hookFor("/api/worker-fetch").every((e) => e.injected === "app")
          ? "PASS"
          : "FAIL",
      "service worker script /sw.js blocked (404)":
        browserChecks.swBlocked === true ? "PASS" : "FAIL",
      "html-viewer loads (200) while inner fetch, screen-asset probe, and blob worker receive NO token and never reach upstream":
        hookFor("/html-viewer.html").every((e) => e.injected === "app") &&
        hookFor("/api/from-html-viewer").length > 0 &&
        hookFor("/api/from-html-viewer").every((e) => e.injected === null) &&
        hookEvents.some(
          (e) =>
            e.path === "/wuying/screen.js" &&
            e.frameUrl === `${proxyOrigin}/html-viewer.html` &&
            e.injected === null,
        ) &&
        hookFor("/api/from-blob-worker").length > 0 &&
        hookFor("/api/from-blob-worker").every((e) => e.injected === null) &&
        !upstreamPaths.has("/api/from-html-viewer") &&
        !upstreamPaths.has("/api/from-blob-worker")
          ? "PASS"
          : "FAIL",
      "novnc screen gets narrow screenToken for asset + WS 101, and NO token for /api":
        browserChecks.novnc?.rfbLoaded === true &&
        browserChecks.novnc?.wsOk === true &&
        browserChecks.novnc?.apiBlocked === true &&
        hookFor(`${novncPrefix}/core/rfb.js`).every((e) => e.injected === "screen") &&
        hookFor(`/${novncPrefix}/websockify`).every((e) => e.injected === "screen") &&
        hookFor("/api/from-novnc").length > 0 &&
        hookFor("/api/from-novnc").every((e) => e.injected === null) &&
        !upstreamPaths.has("/api/from-novnc")
          ? "PASS"
          : "FAIL",
      "wuying screen gets narrow screenToken for script + nested container, and NO token for /api or /rpc":
        browserChecks.wuying?.nestedLoaded === true &&
        browserChecks.wuying?.rpcBlocked === true &&
        browserChecks.wuying?.apiScriptBlocked === true &&
        hookEvents.some(
          (e) =>
            e.path === "/wuying/screen.js" &&
            e.frameUrl?.startsWith(`${proxyOrigin}/wuying/screen.html`) &&
            e.injected === "screen",
        ) &&
        hookFor("/wuying/sdk/ASP/container.html").length > 0 &&
        hookFor("/wuying/sdk/ASP/container.html").every((e) => e.injected === "screen") &&
        hookFor("/wuying/storage.js").length > 0 &&
        hookFor("/wuying/storage.js").every((e) => e.injected === "screen") &&
        hookFor("/api/from-wuying.js").length > 0 &&
        hookFor("/api/from-wuying.js").every((e) => e.injected === null) &&
        hookFor("/rpc/from-wuying").length === 0 &&
        !upstreamPaths.has("/api/from-wuying.js") &&
        !upstreamPaths.has("/rpc/from-wuying")
          ? "PASS"
          : "FAIL",
      "second window in same session receives NO token and is rejected (403)":
        popupBody === "Request source rejected" && hookFor("/").every((e) => e.injected === null)
          ? "PASS"
          : "FAIL",
      "upstream never received capability header and always received configured header":
        upstreamRecords.length > 0 &&
        upstreamRecords.every((r) => r.capability === null && r.gatewayKey === "configured-secret")
          ? "PASS"
          : "FAIL",
    };

    emitReport({ browserChecks, popupBody, results, hookSampleCount: hookEvents.length });
    if (Object.values(results).some((v) => v !== "PASS")) {
      emitReport({ results, hookEvents, upstreamRecords, otherRecords });
      exitCode = 1;
    }
  } catch (error) {
    emitReport({
      fatalError: String(error?.stack || error),
      hookEvents,
      upstreamRecords,
      otherRecords,
    });
    exitCode = 1;
  } finally {
    if (popup && !popup.isDestroyed()) popup.destroy();
    if (win && !win.isDestroyed()) win.destroy();
    if (proxy) await proxy.stop();
    await Promise.all([
      new Promise((resolve) => upstream.close(resolve)),
      new Promise((resolve) => otherServer.close(resolve)),
    ]);
    await fs.rm(rendererRoot, { recursive: true, force: true });
  }
  return exitCode;
}

setTimeout(() => {
  console.error("experiment timed out");
  app.exit(1);
}, 25000).unref();
app
  .whenReady()
  .then(main)
  .then(
    (code) => app.exit(code),
    (error) => {
      console.error(error);
      app.exit(1);
    },
  );
