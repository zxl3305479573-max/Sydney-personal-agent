const { app, BrowserWindow, protocol } = require("electron");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "sydney-lab",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
app.whenReady().then(() => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void window.loadURL("about:blank");
});
app.on("window-all-closed", () => app.quit());
