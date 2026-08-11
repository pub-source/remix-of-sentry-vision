/**
 * MSDS Electron preload — secure bridge (contextIsolation: true).
 * Exposes a tiny, explicit API. No Node APIs and no credentials reach the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('msds', {
  /** Marker so the React app can branch on desktop vs browser. */
  isElectron: true,
  /** { isElectron, isDev, platform, appVersion, localServiceUrl, cameraServerUrl } */
  getEnv: () => ipcRenderer.invoke('msds:env'),
  openExternal: (url) => ipcRenderer.invoke('msds:openExternal', url),
});
