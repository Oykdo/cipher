const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  backupPassword: {
    has: (username) => ipcRenderer.invoke('backup-password:has', username),
    get: (username) => ipcRenderer.invoke('backup-password:get', username),
    set: (username, password) => ipcRenderer.invoke('backup-password:set', { username, password }),
    clear: (username) => ipcRenderer.invoke('backup-password:clear', username)
  },
  
  // Add more APIs as needed
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
