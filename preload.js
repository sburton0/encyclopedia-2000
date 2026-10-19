const { contextBridge, ipcRenderer } = require('electron');

// Mark the page with its platform ("win32", "darwin", or "linux") for platform-specific styles.
// Segoe UI only ships with Windows, so other platforms load a bundled stand-in (see src/fonts/fonts.css).
const platform = process.platform;
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.platform = platform;
  if (platform !== 'win32') document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'fonts/fonts.css' }));
});

// The regional format setting (not the display language), for the default units. Read once; nothing leaves the computer.
let systemLocale = '';
try { systemLocale = ipcRenderer.sendSync('app:locale') || ''; } catch {}

contextBridge.exposeInMainWorld('e2k', {
  platform,
  systemLocale,
  // macOS shows the app's menus in the menu bar at the top of the screen; the page sends their contents here.
  setMenu: (template) => ipcRenderer.send('menu:set', template),
  onMenu: (cb) => ipcRenderer.on('menu:run', (_e, id) => cb(id)),
  win: (cmd) => ipcRenderer.send('win', cmd),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMaximized: (cb) => ipcRenderer.on('maximized', (_e, v) => cb(v)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
  splashDone: () => ipcRenderer.send('splash-done'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onChange: (cb) => ipcRenderer.on('update', (_e, s) => cb(s)),
  },
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
