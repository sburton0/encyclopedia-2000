// Updates: new versions are published as GitHub releases (see "publish" in package.json) and installed by electron-updater.
// The installed app checks a few seconds after it starts and every six hours, downloads in the background, and offers
// "Restart Now" in the status bar. Updates that are ignored install when the app is closed.
// The check contacts GitHub only; nothing about the user is sent. It can be turned off in Tools > Options > Privacy.
const { app, ipcMain, shell } = require('electron');

// The portable version can't replace itself, so it only tells people a new version exists and links to the download page.
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
const DOWNLOADS = 'https://github.com/sburton0/encyclopedia-2000/releases/latest';

const FIRST_CHECK = 8 * 1000;
const EVERY = 6 * 60 * 60 * 1000;

function setup({ getWindow, isEnabled }) {
  let state = { state: 'idle' };
  const send = (s) => {
    state = s;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update', s);
  };

  // Development aid: E2K_FAKE_UPDATE=ready shows the "ready to install" message without a real update.
  if (process.env.E2K_FAKE_UPDATE) {
    ipcMain.handle('update:state', () => ({ state: process.env.E2K_FAKE_UPDATE, version: '0.1.0-beta.2' }));
    ipcMain.handle('update:check', () => ({ state: process.env.E2K_FAKE_UPDATE, version: '0.1.0-beta.2' }));
    ipcMain.handle('update:install', () => {});
    return;
  }

  // Updates only work in the installed app; a copy run from the source folder can't replace itself.
  if (!app.isPackaged) {
    ipcMain.handle('update:state', () => ({ state: 'dev' }));
    ipcMain.handle('update:check', () => ({ state: 'dev' }));
    ipcMain.handle('update:install', () => {});
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.allowPrerelease = true; // every release is a beta for now
  autoUpdater.autoDownload = !PORTABLE;
  autoUpdater.autoInstallOnAppQuit = !PORTABLE;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('update-available', (i) => send(PORTABLE ? { state: 'available', version: i.version } : { state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => send({ ...state, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (err) => {
    const message = String((err && err.message) || err).split('\n')[0];
    // Before the first release there's nothing to compare against, which simply means there's no update.
    send(/No published versions/i.test(message) ? { state: 'none' } : { state: 'error', message });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(() => { if (isEnabled()) check(); }, FIRST_CHECK);
  setInterval(() => { if (isEnabled() && !['ready', 'downloading', 'available'].includes(state.state)) check(); }, EVERY);

  ipcMain.handle('update:state', () => state);
  ipcMain.handle('update:check', async () => {
    if (['ready', 'downloading', 'available'].includes(state.state)) return state;
    try { await autoUpdater.checkForUpdates(); } catch {}
    return state;
  });
  ipcMain.handle('update:install', () => {
    if (state.state === 'available') shell.openExternal(DOWNLOADS);
    else if (state.state === 'ready') setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
}

module.exports = { setup };
