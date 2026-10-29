const { app, BrowserWindow, ipcMain, shell, Menu, screen, dialog, session, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

// Wikimedia asks API clients to identify themselves with a descriptive User-Agent.
app.userAgentFallback = `Encyclopedia2000/${app.getVersion()} (https://encyclopedia2000.com; hello@encyclopedia2000.com; desktop encyclopedia; Electron)`;

// A fixed app ID lets Windows match the running window to its Start menu shortcut and taskbar pin.
// Keep it in sync with tools/make-shortcut.ps1.
if (process.platform === 'win32') app.setAppUserModelId('com.svid.encyclopedia2000');

// The portable version (no installer) keeps its settings, favorites, and progress in a folder next to the .exe,
// so it can run from a USB stick and leaves nothing behind on the computer.
// Run from somewhere it can't save (a DVD, a locked network folder, a write-protected stick), it uses the computer's
// usual app-data folder instead, and the Offline Library window says so (E2K_PORTABLE_FALLBACK).
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR;
if (PORTABLE_DIR) {
  const data = path.join(PORTABLE_DIR, 'Encyclopedia 2000 Data');
  try {
    fs.mkdirSync(data, { recursive: true });
    const probe = path.join(data, '.e2k-write-check');
    fs.writeFileSync(probe, ''); fs.unlinkSync(probe);
    app.setPath('userData', data);
  } catch { process.env.E2K_PORTABLE_FALLBACK = '1'; }
}

// On Linux, Chromium only uses the system's text-to-speech service (speech-dispatcher) for Read Aloud when asked to.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-speech-dispatcher');

// Development aid: E2K_PROFILE points test runs at a separate profile so they don't touch real saved data.
if (process.env.E2K_PROFILE) app.setPath('userData', process.env.E2K_PROFILE);

const SRC = path.join(__dirname, 'src');
const MAC = process.platform === 'darwin';
// macOS takes the app's icon from the app bundle; Linux needs a PNG.
const ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const env = process.env;
// The app draws its own title bar. On macOS it keeps the system's close, minimize, and zoom buttons, inset into that bar.
const FRAME = MAC ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 10, y: 8 } } : { frame: false };

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

// The first window fits the screen it opens on: about 80% of its width and 85% of its height, at least 1024 x 740
// (or the whole screen, if that's smaller), and at most 1260 x 960. 1260 is where an article at the normal text
// size fills the window without margins at the sides.
// It opens centered on the screen with the mouse pointer.
function firstBounds() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const fit = (share, min, max, room) => Math.min(room, Math.max(min, Math.min(max, Math.round(room * share))));
  const width = fit(0.8, 1024, 1260, area.width), height = fit(0.85, 740, 960, area.height);
  return { width, height, x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2) };
}

function createMain(route) {
  const saved = settings.windowMode === 'remember' && onScreen(settings.bounds) ? settings.bounds : null;
  const win = new BrowserWindow({
    ...firstBounds(), minWidth: 980, minHeight: 640,
    ...FRAME, show: false, backgroundColor: '#0f2250', title: 'Encyclopedia 2000', icon: ICON,
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
  // If the page's process crashes (for example, after a graphics failure), load it again instead of leaving a blank window.
  win.webContents.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit' && !win.isDestroyed()) win.reload(); });
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  // macOS hides the window buttons in full screen, so the title bar drops the space it keeps for them.
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  // Closing while an offline library is downloading or moving asks first (the page shows the question); a download
  // pauses and picks up again next time, and a move stops, leaving the library where it was.
  win.on('close', (e) => {
    if (library.busy() && !quitConfirmed && !win.webContents.isCrashed()) {
      e.preventDefault();
      win.webContents.send('library:confirm-quit', library.quitInfo());
    }
  });
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
      quitConfirmed = true;   // a test run never stops to ask about downloads
      app.quit();
    }
  }, Number(env.E2K_DELAY || 6000));
}

let quitConfirmed = false;
ipcMain.on('library:quit', (e) => {
  quitConfirmed = true;
  library.pauseForQuit();
  BrowserWindow.fromWebContents(e.sender)?.close();
});

// Offline mode, picked from the status bar's connection menu and kept between launches. While it's on, nothing the
// window asks for leaves the computer (see the request filter below). The app's own downloads, like the offline
// library, aren't the window's, so they carry on.
ipcMain.on('net:offline', (e) => { e.returnValue = !!settings.offlineMode; });
ipcMain.on('net:set-offline', (_e, on) => { settings.offlineMode = !!on; saveSettings(); });

ipcMain.on('win', (e, cmd) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (cmd === 'min') win.minimize();
  else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (cmd === 'close') win.close();
  else if (cmd === 'print') win.webContents.print({});
  else if (cmd === 'cut') win.webContents.cut();
  else if (cmd === 'copy') win.webContents.copy();
  else if (cmd === 'paste') win.webContents.paste();
});

// The right-click menu's Copy Link (the page's own clipboard refuses while the window isn't focused), Copy Picture, and
// Save Picture As….
ipcMain.on('clipboard:text', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('picture:copy', (e, x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) e.sender.copyImageAt(x, y); });
// Downloads here, not in the page: the page's security policy lets it show Wikimedia's pictures but not download
// them. Tries each address in turn (the full picture, then the one on screen) and keeps the first real picture.
ipcMain.handle('picture:save', async (e, urls) => {
  let res = null, url = '';
  for (const u of (Array.isArray(urls) ? urls : []).slice(0, 3)) {
    if (!/^(https:\/\/[a-z0-9.-]+\.(wikimedia|wikipedia)\.org\/|e2k-zim:)/.test(String(u))) continue;
    try {
      const r = await e.sender.session.fetch(u);
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) { res = r; url = u; break; }
    } catch {}
  }
  if (!res) return 'failed';
  // Its file name from the address ("…/320px-Full_Moon.jpg" is "Full Moon.jpg").
  let name = url.split(/[?#]/)[0].split('/').pop() || '';
  try { name = decodeURIComponent(name); } catch {}
  name = name.replace(/^\d+px-/, '').replace(/_/g, ' ').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Picture';
  const ext = path.extname(name).slice(1).toLowerCase();
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Save Picture', defaultPath: path.join(app.getPath('pictures'), name),
    filters: ext ? [{ name: `${ext.toUpperCase()} picture`, extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : [],
  });
  if (canceled || !filePath) return 'canceled';
  fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
  return 'saved';
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
    width: 900, height: 760, minWidth: 720, minHeight: 520, ...FRAME, show: false, parent: previewSource,
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

// The app and operating system versions, for the feedback dialog.
function systemName() {
  if (MAC) return `macOS ${process.getSystemVersion()}`;
  if (process.platform === 'linux') {
    let name = 'Linux';
    try { name = /^PRETTY_NAME="?([^"\n]*)/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))[1]; } catch {}
    return `${name} (kernel ${os.release()})`;
  }
  const [major, , build] = os.release().split('.').map(Number);
  return `${major === 10 && build >= 22000 ? 'Windows 11' : major === 10 ? 'Windows 10' : 'Windows'} (build ${build || os.release()})`;
}
ipcMain.handle('app:info', () => ({ version: app.getVersion(), windows: systemName() }));
// The system's regional format ("en-GB", "en-US"), read once by the preload: it picks the default units.
ipcMain.on('app:locale', (e) => { e.returnValue = (app.getSystemLocale && app.getSystemLocale()) || app.getLocale(); });

// ---------- macOS menu bar ----------
// The page sends its menus (the same ones it draws inside the window on Windows and Linux). Items carry either a
// built-in role, such as copy or quit, or an id that is sent back to the page when the item is chosen.
ipcMain.on('menu:set', (e, template) => {
  if (!MAC || !Array.isArray(template)) return;
  const build = (it) => {
    if (it === '-') return { type: 'separator' };
    if (it.role) return { role: it.role, ...(it.label ? { label: it.label } : {}) };
    if (it.items) return { label: it.label, submenu: it.items.map(build) };
    return {
      label: it.label, accelerator: it.key || undefined, enabled: !it.disabled,
      ...(it.checked != null ? { type: 'checkbox', checked: !!it.checked } : {}),
      click: () => { if (!e.sender.isDestroyed()) e.sender.send('menu:run', it.id); },
    };
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(template.map(build)));
});

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
});

// The offline library (see library.js). Required before the app is ready, since it registers the e2k-zim: address.
const library = require('./library');

app.whenReady().then(() => {
  library.setup({ offline: () => !!settings.offlineMode });
  // Offline mode: the window's requests to the internet are refused. (Requests from the main process have no window.)
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => cb({ cancel: !!settings.offlineMode && d.webContentsId != null }));
  // Windows and Linux use the menus drawn inside the window. macOS keeps its default menu until the page sends its own.
  if (!MAC) Menu.setApplicationMenu(null);
  // Run from source, macOS shows Electron's icon in the Dock; the built app uses its own.
  if (MAC && !app.isPackaged) app.dock.setIcon(ICON);
  const route = env.E2K_ROUTE || '';
  const main = createMain(route);
  require('./updater').setup({ getWindow: () => main, isEnabled: () => settings.autoUpdate !== false && !settings.offlineMode });

  if (route || env.E2K_NOSPLASH || !settings.showSplash) {
    main.once('ready-to-show', () => present(main));
    captureLater(main);
    return;
  }

  const splash = createSplash();
  // Development aid: E2K_DEBUG_START=1 prints each startup step with its time, for diagnosing a stuck startup screen.
  const t0 = Date.now();
  const log = (m) => { if (env.E2K_DEBUG_START) console.log(`[startup +${Date.now() - t0} ms] ${m}`); };
  if (env.E2K_DEBUG_START) {
    splash.once('ready-to-show', () => log('startup screen drawn'));
    splash.webContents.once('did-finish-load', () => log('startup page loaded'));
    main.webContents.once('did-finish-load', () => log('main page loaded'));
    app.on('child-process-gone', (_e, d) => log(`${d.type} process gone: ${d.reason}`));
  }
  let splashDone = false, mainReady = false;
  let forced = false, revealed = false;
  const reveal = () => {
    // If the main window still hasn't drawn a few seconds after the startup screen is done, show it anyway rather
    // than leave the startup screen up forever.
    if (splashDone && !mainReady && !forced) { forced = true; setTimeout(() => { if (!mainReady) log('main window never drew; showing it anyway'); mainReady = true; reveal(); }, 5000); }
    if (!splashDone || !mainReady || revealed || main.isDestroyed()) return;
    revealed = true;
    log('main window shown');
    present(main);
    if (!splash.isDestroyed()) splash.destroy();
  };
  main.once('ready-to-show', () => { log('main window drawn'); mainReady = true; reveal(); });
  // On Linux with Wayland, a hidden window may not draw (and so never be "ready to show") until it's shown, which
  // left the startup screen up for good in an Ubuntu virtual machine. Its page having loaded is enough to go on.
  main.webContents.once('did-finish-load', () => setTimeout(() => { if (!mainReady) { log('main page loaded but not drawn; showing it'); mainReady = true; reveal(); } }, 500));
  ipcMain.once('splash-done', () => { log('startup screen finished'); splashDone = true; reveal(); });
  splash.on('closed', () => { splashDone = true; reveal(); });
  // The startup screen normally finishes itself 6.5 seconds after its page loads. If its page never loads, crashes, or
  // stops drawing (seen in a Linux virtual machine without a graphics card, where the window stayed solid blue), move
  // on to the main window after 9 seconds. A page that loaded slowly (the portable version, or a fresh Windows
  // Sandbox) gets 9 seconds from when it loaded instead, so its jingle isn't cut short.
  const skipSplash = (why = 'timed out') => { if (!splashDone) { log(`startup screen skipped (${typeof why === 'string' ? why : 'stopped'})`); splashDone = true; reveal(); } };
  let loadedAt = 0;
  splash.webContents.once('did-finish-load', () => { loadedAt = Date.now(); });
  setTimeout(() => {
    if (!loadedAt) skipSplash();
    else setTimeout(skipSplash, Math.max(0, loadedAt + 9000 - Date.now()));
  }, 9000);
  splash.webContents.on('render-process-gone', skipSplash);
  splash.on('unresponsive', skipSplash);
  captureLater(env.E2K_CAPTURE_WIN === 'splash' ? splash : main);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', clearPreviewFile);
