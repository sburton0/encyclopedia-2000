const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('e2k', {
  win: (cmd) => ipcRenderer.send('win', cmd),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMaximized: (cb) => ipcRenderer.on('maximized', (_e, v) => cb(v)),
  splashDone: () => ipcRenderer.send('splash-done'),
});
