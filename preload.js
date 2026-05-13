const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("mpm", {
  openContainer: (c) => ipcRenderer.invoke("open-container", c),
  hideView: () => ipcRenderer.invoke("hide-view"),
  setBounds: (b) => ipcRenderer.invoke("set-bounds", b),
  browserBack: () => ipcRenderer.invoke("browser-back"),
  browserRefresh: () => ipcRenderer.invoke("browser-refresh"),
  outlookManualMode: (container, enabled) => ipcRenderer.invoke("outlook-manual-mode", container, enabled),
  clearContainer: (id) => ipcRenderer.invoke("clear-container", id),
  clearAll: () => ipcRenderer.invoke("clear-all"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  copy: (text) => ipcRenderer.invoke("copy-text", text),
  onSms: (cb) => ipcRenderer.on("sms-captured", (_e, data) => cb(data)),
  onStatus: (cb) => ipcRenderer.on("view-status", (_e, data) => cb(data))
});
