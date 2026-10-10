const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Wikimedia asks API clients to identify themselves with a descriptive User-Agent.
app.userAgentFallback = `Encyclopedia2000/${app.getVersion()} (desktop encyclopedia demo; Electron)`;

// A fixed app ID lets Windows match the running window to its Start menu shortcut and taskbar pin.
// Keep it in sync with tools/make-shortcut.ps1.
if (process.platform === 'win32') app.setAppUserModelId('com.svid.encyclopedia2000');

// Development aid: E2K_PROFILE points test runs at a separate profile so they don't touch real saved data.
if (process.env.E2K_PROFILE) app.setPath('userData', process.env.E2K_PROFILE);

const SRC = path.join(__dirname, 'src');
const ICON = path.join(__dirname, 'build', 'icon.ico');
const env = process.env;

function secure(win) {
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
  const win = new BrowserWindow({
    width: 1024, height: 740, minWidth: 980, minHeight: 640,
    frame: false, show: false, backgroundColor: '#0f2250', title: 'Encyclopedia 2000', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  secure(win);
  win.loadFile(path.join(SRC, 'index.html'), route ? { hash: route } : {});
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  return win;
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
function captureLater(win) {
  if (!env.E2K_CAPTURE) return;
  setTimeout(async () => {
    try {
      if (env.E2K_EVAL) {
        const result = await win.webContents.executeJavaScript(env.E2K_EVAL);
        if (env.E2K_EVAL_OUT) fs.writeFileSync(env.E2K_EVAL_OUT, JSON.stringify(result, null, 2));
        await new Promise((r) => setTimeout(r, Number(env.E2K_EVAL_WAIT || 2000)));
      }
      const img = await win.webContents.capturePage();
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

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const route = env.E2K_ROUTE || '';
  const main = createMain(route);

  if (route || env.E2K_NOSPLASH) {
    main.once('ready-to-show', () => main.show());
    captureLater(main);
    return;
  }

  const splash = createSplash();
  let splashDone = false, mainReady = false;
  const reveal = () => {
    if (!splashDone || !mainReady || main.isDestroyed()) return;
    main.show();
    if (!splash.isDestroyed()) splash.destroy();
  };
  main.once('ready-to-show', () => { mainReady = true; reveal(); });
  ipcMain.once('splash-done', () => { splashDone = true; reveal(); });
  splash.on('closed', () => { splashDone = true; reveal(); });
  captureLater(env.E2K_CAPTURE_WIN === 'splash' ? splash : main);
});

app.on('window-all-closed', () => app.quit());
