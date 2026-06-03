const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getPortalStatusHistory: () => ipcRenderer.invoke('get-portal-status-history'),
  closeStatusWindow: () => ipcRenderer.invoke('close-status-window'),
});
