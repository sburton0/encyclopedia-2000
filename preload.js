const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('e2k', {
  win: (cmd) => ipcRenderer.send('win', cmd),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMaximized: (cb) => ipcRenderer.on('maximized', (_e, v) => cb(v)),
  splashDone: () => ipcRenderer.send('splash-done'),
  printPreview: () => ipcRenderer.invoke('print:open'),
  print: {
    render: (opts) => ipcRenderer.invoke('print:render', opts),
    print: () => ipcRenderer.invoke('print:print'),
    save: () => ipcRenderer.invoke('print:save'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
});
