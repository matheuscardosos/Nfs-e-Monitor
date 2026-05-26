const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashApi', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
