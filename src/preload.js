const { contextBridge, ipcRenderer: ipc } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  getSettings: () => ipc.invoke("getSettings"),
});
