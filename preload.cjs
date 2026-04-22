const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  openEidolonLauncher: () => ipcRenderer.invoke('eidolon:open-launcher'),
  openEidolonInstaller: () => ipcRenderer.invoke('eidolon:open-installer'),
  getEidolonVaultMetrics: (vaultRef) => ipcRenderer.invoke('eidolon:get-vault-metrics', vaultRef),
  probeEidolonConnect: (payload) => ipcRenderer.invoke('eidolon:connect-probe', payload),
  createEidolonConnectSession: (payload) => ipcRenderer.invoke('eidolon:connect-session', payload),
  getVaultBridgeContext: () => ipcRenderer.invoke('vault-bridge:get-context'),
  selectPsnxFile: () => ipcRenderer.invoke('vault-bridge:select-psnx'),

  backupPassword: {
    has: (username) => ipcRenderer.invoke('backup-password:has', username),
    get: (username) => ipcRenderer.invoke('backup-password:get', username),
    set: (username, password) => ipcRenderer.invoke('backup-password:set', { username, password }),
    clear: (username) => ipcRenderer.invoke('backup-password:clear', username)
  },

  // Device-local encrypted bundle storage. The renderer encrypts the keybundle
  // with a user-supplied password (PBKDF2 + XChaCha20) before calling save —
  // main only sees the ciphertext.
  storedBundle: {
    save: (vaultId, vaultName, bytes) =>
      ipcRenderer.invoke('stored-bundle:save', { vaultId, vaultName, bytes }),
    load: (vaultId) => ipcRenderer.invoke('stored-bundle:load', vaultId),
    list: () => ipcRenderer.invoke('stored-bundle:list'),
    delete: (vaultId) => ipcRenderer.invoke('stored-bundle:delete', vaultId),
  },
  
  // Add more APIs as needed
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
