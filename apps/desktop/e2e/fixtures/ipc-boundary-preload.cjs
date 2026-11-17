const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("syntheticBridge", {
  write: () => ipcRenderer.invoke("synthetic:write"),
});
