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

// Offline mode (the status bar's connection menu). Read once at startup; the page changes it with setOffline.
let offlineMode = false;
try { offlineMode = !!ipcRenderer.sendSync('net:offline'); } catch {}

contextBridge.exposeInMainWorld('e2k', {
  platform,
  systemLocale,
  // macOS shows the app's menus in the menu bar at the top of the screen; the page sends their contents here.
  setMenu: (template) => ipcRenderer.send('menu:set', template),
  onMenu: (cb) => ipcRenderer.on('menu:run', (_e, id) => cb(id)),
  win: (cmd) => ipcRenderer.send('win', cmd),
  copyImageAt: (x, y) => ipcRenderer.send('picture:copy', x, y),
  savePicture: (name, bytes) => ipcRenderer.invoke('picture:save', name, bytes),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMaximized: (cb) => ipcRenderer.on('maximized', (_e, v) => cb(v)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
  splashDone: () => ipcRenderer.send('splash-done'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  net: {
    offline: () => offlineMode,
    setOffline: (on) => { offlineMode = !!on; ipcRenderer.send('net:set-offline', offlineMode); },
  },
  // The offline library (library.js): reading (info, find, titles, random) and managing it (the Offline Library
  // dialog). onUpdate hears about downloads, new editions, and library changes.
  library: {
    info: () => ipcRenderer.invoke('library:info'),
    find: (title) => ipcRenderer.invoke('library:find', title),
    titles: (q, limit, deep) => ipcRenderer.invoke('library:titles', q, limit, deep),
    random: () => ipcRenderer.invoke('library:random'),
    daily: (key) => ipcRenderer.invoke('library:daily', key),
    state: () => ipcRenderer.invoke('library:state'),
    catalog: () => ipcRenderer.invoke('library:catalog'),
    space: (pack) => ipcRenderer.invoke('library:space', pack),
    download: (pack, opts) => ipcRenderer.invoke('library:download', pack, opts),
    pause: () => ipcRenderer.invoke('library:pause'),
    cancel: () => ipcRenderer.invoke('library:cancel'),
    remove: () => ipcRenderer.invoke('library:remove'),
    chooseDir: () => ipcRenderer.invoke('library:choose-dir'),
    openFile: () => ipcRenderer.invoke('library:open-file'),
    useFile: (file) => ipcRenderer.invoke('library:use-file', file),
    cancelMove: () => ipcRenderer.invoke('library:cancel-move'),
    openDir: () => ipcRenderer.invoke('library:open-dir'),
    onUpdate: (cb) => ipcRenderer.on('library:update', (_e, s) => cb(s)),
    // Closing mid-download or mid-move: the main process asks the page to confirm, and quit() goes ahead.
    onConfirmQuit: (cb) => ipcRenderer.on('library:confirm-quit', (_e, info) => cb(info)),
    quit: () => ipcRenderer.send('library:quit'),
  },
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
