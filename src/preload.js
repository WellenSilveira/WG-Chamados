const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getData: () => ipcRenderer.invoke("db:get"),
  saveData: (payload) => ipcRenderer.invoke("db:save", payload),
  getDatabasePath: () => ipcRenderer.invoke("db:path"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onWindowState: (callback) => {
    const listener = (_, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:state", listener);
    return () => ipcRenderer.removeListener("window:state", listener);
  },
  selectBackupFolder: () => ipcRenderer.invoke("backup:select-folder"),
  createBackup: () => ipcRenderer.invoke("backup:create"),
  restoreBackup: () => ipcRenderer.invoke("backup:restore"),
  showNotification: (title, body) => ipcRenderer.invoke("notification:show", title, body),
});
