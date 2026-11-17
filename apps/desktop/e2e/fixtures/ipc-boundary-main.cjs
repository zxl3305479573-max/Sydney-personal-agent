const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const path = require("node:path");
const { request } = require("node:http");

const backend = new URL(process.argv.find((argument) => argument.startsWith("http://127.0.0.1:")));

protocol.registerSchemesAsPrivileged([
  { scheme: "sydney-ipc-lab", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.whenReady().then(() => {
  globalThis.syntheticWrites = 0;
  globalThis.syntheticDecisions = [];
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "ipc-boundary-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: true,
    },
  });
  window.webContents.session.protocol.handle(
    "sydney-ipc-lab",
    (incoming) =>
      new Response(
        new URL(incoming.url).pathname === "/sandbox"
          ? `<script>let result; try { result = typeof parent.syntheticBridge } catch { result = "blocked" } parent.postMessage({kind:"sandbox-parent",result}, "*")</script>`
          : "<!doctype html><title>fixture</title>",
        {
          headers: { "content-type": "text/html" },
        },
      ),
  );
  ipcMain.handle("synthetic:write", async (event) => {
    const frame = event.senderFrame;
    if (event.sender !== window.webContents) {
      globalThis.syntheticDecisions.push("window");
      throw new Error("Untrusted sender");
    }
    if (!frame || frame !== window.webContents.mainFrame) {
      globalThis.syntheticDecisions.push("frame");
      throw new Error("Untrusted sender");
    }
    if (frame.url !== "sydney-ipc-lab://app/") {
      globalThis.syntheticDecisions.push("url");
      throw new Error("Untrusted sender");
    }
    globalThis.syntheticDecisions.push("accepted");
    await new Promise((resolve, reject) => {
      const outgoing = request(
        new URL("/fixed-write", backend),
        {
          method: "POST",
          headers: { authorization: "Bearer synthetic-lab-token" },
        },
        (response) => {
          response.resume();
          response.on("end", () =>
            response.statusCode === 204 ? resolve() : reject(new Error("Synthetic backend failed")),
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.end("synthetic-body");
    });
    globalThis.syntheticWrites++;
    return "synthetic-ok";
  });
  void window.loadURL("sydney-ipc-lab://app/");
});
app.on("window-all-closed", () => app.quit());
