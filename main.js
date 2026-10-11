const { app, BrowserWindow, ipcMain, shell, Menu, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

// Wikimedia asks API clients to identify themselves with a descriptive User-Agent.
app.userAgentFallback = `Encyclopedia2000/${app.getVersion()} (https://encyclopedia2000.com; Windows desktop encyclopedia; Electron)`;

// A fixed app ID lets Windows match the running window to its Start menu shortcut and taskbar pin.
// Keep it in sync with tools/make-shortcut.ps1.
if (process.platform === 'win32') app.setAppUserModelId('com.svid.encyclopedia2000');

// Development aid: E2K_PROFILE points test runs at a separate profile so they don't touch real saved data.
if (process.env.E2K_PROFILE) app.setPath('userData', process.env.E2K_PROFILE);

const SRC = path.join(__dirname, 'src');
const ICON = path.join(__dirname, 'build', 'icon.ico');
const env = process.env;

// Settings the main process needs before any window opens. Everything else lives in the page's storage.
const SETTINGS_DEFAULTS = { showSplash: true, windowMode: 'remember', bounds: null, maximized: false, hardwareAcceleration: true, autoUpdate: true };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...SETTINGS_DEFAULTS };
function loadSettings() {
  try { settings = { ...SETTINGS_DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...SETTINGS_DEFAULTS }; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
}
// Hardware acceleration has to be decided before the app is ready, so this setting takes effect on the next launch.
loadSettings();
if (settings.hardwareAcceleration === false) app.disableHardwareAcceleration();

// Only reuse saved bounds if they still land on a connected screen.
function onScreen(b) {
  return b && screen.getAllDisplays().some(({ workArea: w }) =>
    b.x < w.x + w.width - 80 && b.x + b.width > w.x + 80 && b.y >= w.y - 20 && b.y < w.y + w.height - 80);
}

function secure(win) {
  // Keep Chromium's page zoom at 100%. Its zoom is shared by every window of the app and remembered between
  // launches, so a stray zoom would also enlarge the startup screen.
  win.webContents.on('dom-ready', () => { if (win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1); });
  // Never let the app window navigate away or open new windows; send web links to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

function createMain(route) {
  const saved = settings.windowMode === 'remember' && onScreen(settings.bounds) ? settings.bounds : null;
  const win = new BrowserWindow({
    width: 1024, height: 740, minWidth: 980, minHeight: 640,
    frame: false, show: false, backgroundColor: '#0f2250', title: 'Encyclopedia 2000', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // setBounds mirrors getNormalBounds exactly. Passing saved bounds to the constructor instead makes a
  // frameless window grow by its invisible resize border on every launch.
  if (saved) win.setBounds(saved);
  // E2K_SIZE=WIDTHxHEIGHT opens the window at that size (for testing large screens).
  const size = /^(\d+)x(\d+)$/.exec(env.E2K_SIZE || '');
  if (size) win.setBounds({ x: 0, y: 0, width: +size[1], height: +size[2] });
  secure(win);
  win.loadFile(path.join(SRC, 'index.html'), route ? { hash: route } : {});
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  win.on('close', () => {
    if (settings.windowMode !== 'remember') return;
    // Display scaling can round the size by a pixel or two each launch; ignore that so the window doesn't creep.
    const b = win.getNormalBounds();
    const p = settings.bounds;
    if (p) for (const k of ['x', 'y', 'width', 'height']) if (Math.abs(b[k] - p[k]) <= 4) b[k] = p[k];
    settings.bounds = b;
    settings.maximized = win.isMaximized();
    saveSettings();
  });
  return win;
}

// Shows the main window, maximized if the settings ask for it.
function present(win) {
  if (settings.windowMode === 'maximized' || (settings.windowMode === 'remember' && settings.maximized)) win.maximize();
  win.show();
}

function createSplash() {
  const win = new BrowserWindow({
    width: 640, height: 400, frame: false, resizable: false, maximizable: false, center: true,
    show: false, backgroundColor: '#0f2250', title: 'Encyclopedia 2000', icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  secure(win);
  win.loadFile(path.join(SRC, 'splash.html'), env.E2K_MUTE ? { query: { mute: '1' } } : {});
  win.once('ready-to-show', () => win.show());
  return win;
}

// Development aid: E2K_CAPTURE=out.png saves a screenshot of a window after E2K_DELAY ms, then quits.
// E2K_EVAL optionally runs a script in the page first (for testing menus, dialogs, and so on).
// E2K_CAPTURE_WIN=top captures the newest window (for example, Print Preview).
function captureLater(win) {
  if (!env.E2K_CAPTURE) return;
  setTimeout(async () => {
    try {
      if (env.E2K_EVAL) {
        const result = await win.webContents.executeJavaScript(env.E2K_EVAL);
        if (env.E2K_EVAL_OUT) fs.writeFileSync(env.E2K_EVAL_OUT, JSON.stringify(result, null, 2));
        await new Promise((r) => setTimeout(r, Number(env.E2K_EVAL_WAIT || 2000)));
      }
      const target = env.E2K_CAPTURE_WIN === 'top' ? BrowserWindow.getAllWindows().sort((a, b) => b.id - a.id)[0] : win;
      const img = await target.webContents.capturePage();
      fs.writeFileSync(env.E2K_CAPTURE, img.toPNG());
    } finally {
      app.quit();
    }
  }, Number(env.E2K_DELAY || 6000));
}

ipcMain.on('win', (e, cmd) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (cmd === 'min') win.minimize();
  else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (cmd === 'close') win.close();
  else if (cmd === 'print') win.webContents.print({});
});

const mainSettings = () => ({ showSplash: settings.showSplash, windowMode: settings.windowMode, hardwareAcceleration: settings.hardwareAcceleration, autoUpdate: settings.autoUpdate });
ipcMain.handle('settings:get', () => mainSettings());
ipcMain.handle('settings:set', (_e, patch = {}) => {
  if (patch.reset) settings = { ...SETTINGS_DEFAULTS, bounds: settings.bounds, maximized: settings.maximized };
  if (typeof patch.showSplash === 'boolean') settings.showSplash = patch.showSplash;
  if (['remember', 'maximized', 'default'].includes(patch.windowMode)) settings.windowMode = patch.windowMode;
  if (typeof patch.hardwareAcceleration === 'boolean') settings.hardwareAcceleration = patch.hardwareAcceleration;
  if (typeof patch.autoUpdate === 'boolean') settings.autoUpdate = patch.autoUpdate;
  saveSettings();
  return mainSettings();
});

// ---------- Print Preview ----------
// The preview is a real PDF of the page, made with the same print layout that printing uses.
let preview = null;
let previewSource = null;
let previewFile = null;
let printOpts = { pageSize: 'Letter', landscape: false, images: true };

async function makePdf() {
  await previewSource.webContents.executeJavaScript(`document.documentElement.classList.toggle('print-noimg', ${!printOpts.images})`);
  return previewSource.webContents.printToPDF({ pageSize: printOpts.pageSize, landscape: printOpts.landscape, printBackground: false });
}
function clearPreviewFile() {
  if (previewFile) { try { fs.unlinkSync(previewFile); } catch {} previewFile = null; }
}

ipcMain.handle('print:open', (e) => {
  if (preview && !preview.isDestroyed()) { preview.focus(); return; }
  previewSource = BrowserWindow.fromWebContents(e.sender);
  preview = new BrowserWindow({
    width: 900, height: 760, minWidth: 720, minHeight: 520, frame: false, show: false, parent: previewSource,
    backgroundColor: '#0f2250', title: 'Print Preview', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, plugins: true },
  });
  secure(preview);
  preview.loadFile(path.join(SRC, 'preview.html'));
  preview.once('ready-to-show', () => preview.show());
  preview.on('closed', () => {
    preview = null;
    clearPreviewFile();
    if (previewSource && !previewSource.isDestroyed()) {
      previewSource.webContents.executeJavaScript(`document.documentElement.classList.remove('print-noimg')`).catch(() => {});
    }
  });
});

ipcMain.handle('print:render', async (_e, opts = {}) => {
  printOpts = { ...printOpts, ...opts };
  const data = await makePdf();
  clearPreviewFile();
  previewFile = path.join(app.getPath('temp'), `e2k-preview-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(previewFile, data);
  const title = await previewSource.webContents.executeJavaScript(`(document.querySelector('.band h1') || {}).textContent || ''`);
  return { url: pathToFileURL(previewFile).href, opts: printOpts, title };
});

ipcMain.handle('print:print', () => new Promise((resolve) => {
  previewSource.webContents.print({ pageSize: printOpts.pageSize, landscape: printOpts.landscape, printBackground: false },
    (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.handle('print:save', async () => {
  const title = await previewSource.webContents.executeJavaScript(`(document.querySelector('.band h1') || {}).textContent || 'Encyclopedia 2000'`);
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Encyclopedia 2000';
  const { canceled, filePath } = await dialog.showSaveDialog(preview, {
    title: 'Save as PDF', defaultPath: path.join(app.getPath('documents'), safe + '.pdf'), filters: [{ name: 'PDF document', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { saved: false };
  fs.writeFileSync(filePath, await makePdf());
  return { saved: true, filePath };
});

// The app and Windows versions, for the feedback dialog.
ipcMain.handle('app:info', () => {
  const [major, , build] = os.release().split('.').map(Number);
  const windows = process.platform !== 'win32' ? os.type() : major === 10 && build >= 22000 ? 'Windows 11' : major === 10 ? 'Windows 10' : 'Windows';
  return { version: app.getVersion(), windows: `${windows} (build ${build || os.release()})` };
});

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const route = env.E2K_ROUTE || '';
  const main = createMain(route);
  require('./updater').setup({ getWindow: () => main, isEnabled: () => settings.autoUpdate !== false });

  if (route || env.E2K_NOSPLASH || !settings.showSplash) {
    main.once('ready-to-show', () => present(main));
    captureLater(main);
    return;
  }

  const splash = createSplash();
  let splashDone = false, mainReady = false;
  const reveal = () => {
    if (!splashDone || !mainReady || main.isDestroyed()) return;
    present(main);
    if (!splash.isDestroyed()) splash.destroy();
  };
  main.once('ready-to-show', () => { mainReady = true; reveal(); });
  ipcMain.once('splash-done', () => { splashDone = true; reveal(); });
  splash.on('closed', () => { splashDone = true; reveal(); });
  captureLater(env.E2K_CAPTURE_WIN === 'splash' ? splash : main);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', clearPreviewFile);
