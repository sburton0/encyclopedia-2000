// Updates: new versions are published as GitHub releases (see "publish" in package.json) and installed by electron-updater.
// The installed app checks a few seconds after it starts and every six hours, downloads in the background, and offers
// "Restart Now" in the status bar. Updates that are ignored install when the app is closed.
// The check contacts GitHub only; nothing about the user is sent. It can be turned off in Tools > Options > Privacy.
const { app, ipcMain, shell } = require('electron');
const path = require('path');

// The portable version can't replace itself, so it only tells people a new version exists and links to the download page.
// The same goes for Linux's .deb package, which needs an administrator password to update. (An AppImage could update
// itself, but current Ubuntu won't start Electron AppImages, so the Linux version is shipped as a .deb for now.)
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR || (process.platform === 'linux' && !process.env.APPIMAGE);
const KIND = process.platform === 'linux' ? 'deb' : 'portable';
// The Windows portable started from its .exe (its launcher sets these): it can update itself on its drive, but only
// step by step as the user asks (see portable-update.js). Never true for the installed app, a Mac, or Linux, which
// keep the behavior below unchanged.
const SELF = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_DIR && !!process.env.PORTABLE_EXECUTABLE_FILE;
const DOWNLOADS = 'https://github.com/sburton0/encyclopedia-2000/releases/latest';

const FIRST_CHECK = 8 * 1000;
const EVERY = 6 * 60 * 60 * 1000;

function setup({ getWindow, isEnabled, quitForUpdate }) {
  let state = { state: 'idle' };
  const send = (s) => {
    state = s;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update', s);
  };

  // Development aid: E2K_FAKE_UPDATE=ready shows the "ready to install" message without a real update.
  // E2K_FAKE_KIND=deb or portable picks which "available" message to show.
  if (process.env.E2K_FAKE_UPDATE) {
    const fake = () => ({ state: process.env.E2K_FAKE_UPDATE, version: '0.4.0-beta', kind: process.env.E2K_FAKE_KIND || KIND, file: 'Encyclopedia-2000-0.4.0-beta-linux-amd64.deb' });
    ipcMain.handle('update:state', fake);
    ipcMain.handle('update:check', fake);
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
  autoUpdater.on('update-available', (i) => (SELF ? self.offer(i) : send(PORTABLE
    ? { state: 'available', version: i.version, kind: KIND, file: (i.files || []).map((f) => f.url).find((u) => /\.deb$/.test(u || '')) || '' }
    : { state: 'downloading', version: i.version, percent: 0 })));
  autoUpdater.on('download-progress', (p) => send({ ...state, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (err) => {
    const message = String((err && err.message) || err).split('\n')[0];
    // Before the first release there's nothing to compare against, which simply means there's no update.
    send(/No published versions/i.test(message) ? { state: 'none' } : { state: 'error', message });
  });

  const self = SELF ? selfUpdate({ send, getState: () => state, setState: (s) => { state = s; }, quitForUpdate }) : null;
  // (A portable copy with an update downloading or waiting for Restart Now doesn't check again.)
  const check = () => (self && self.busy() ? Promise.resolve() : autoUpdater.checkForUpdates().catch(() => {}));
  setTimeout(() => { if (isEnabled()) check(); }, FIRST_CHECK);
  setInterval(() => { if (isEnabled() && !['ready', 'downloading', 'available'].includes(state.state)) check(); }, EVERY);

  ipcMain.handle('update:state', () => state);
  ipcMain.handle('update:check', async () => {
    if (['ready', 'downloading', 'available'].includes(state.state)) return state;
    try { await autoUpdater.checkForUpdates(); } catch {}
    return state;
  });
  ipcMain.handle('update:install', () => {
    if (SELF) return self.install();
    if (state.state === 'available') shell.openExternal(DOWNLOADS);
    else if (state.state === 'ready') setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
}

// The portable version's own updates: offered (never downloaded) when a new version is found; downloaded after the
// user confirms (update:download); swapped in only on Restart Now (install). A downloaded update left from an earlier
// run is offered as ready again, never used by itself. A release without portable.yml falls back to the download page.
function selfUpdate({ send, getState, setState, quitForUpdate }) {
  const pu = require('./portable-update');
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  let job = null, offered = null;
  pu.cleanup(exe);
  const newer = (v) => require('semver').gt(v, app.getVersion());   // semver comes with electron-updater
  const waiting = pu.ready(exe);
  if (waiting && newer(waiting.version)) send({ state: 'ready', version: waiting.version, self: true });
  else if (waiting) pu.discard(exe);
  const ipc = (name, fn) => ipcMain.handle(`update:${name}`, fn);
  // A failure is told once (the window shows it), then the state goes on without it.
  const fail = (s, message) => { send({ ...s, failed: message }); setState(s); };
  ipc('download', async () => {
    if (!offered || job) return getState();
    const ac = new AbortController();
    job = ac;
    send({ state: 'downloading', version: offered.version, percent: 0, self: true });
    try {
      await pu.download(exe, offered, { signal: ac.signal, onProgress: (percent) => send({ state: 'downloading', version: offered.version, percent, self: true }) });
      send({ state: 'ready', version: offered.version, self: true });
    } catch (e) {
      if (e.message === 'cancelled') send(available()); else fail(available(), e.message);
    } finally { job = null; }
    return getState();
  });
  ipc('cancel', () => { if (job) job.abort(); return getState(); });
  ipc('discard', () => { pu.discard(exe); send(offered ? available() : { state: 'none' }); return getState(); });
  const available = () => ({ state: 'available', version: offered.version, kind: KIND, self: true, size: offered.size, readonly: !pu.writable(exe) });
  return {
    busy: () => !!job || getState().state === 'ready',
    async offer(i) {
      if (getState().state === 'ready' || job) return;
      let m = null;
      try { m = await pu.manifest(i.version); } catch {}
      if (!m) return send({ state: 'available', version: i.version, kind: KIND, file: '' });
      offered = { ...m, version: i.version };
      send(available());
    },
    install() {
      const s = getState();
      if (s.state === 'available' && !s.self) return shell.openExternal(DOWNLOADS);
      if (s.state === 'available' && s.readonly) return shell.openExternal(DOWNLOADS);
      if (s.state !== 'ready') return;
      try {
        const target = pu.swap(exe, app.getVersion());
        // The new version starts once this one has closed, so the two never share the data folder.
        app.once('will-quit', () => { require('child_process').spawn(target, [], { detached: true, stdio: 'ignore', cwd: path.dirname(target) }).unref(); });
        quitForUpdate();
      } catch (e) {
        pu.discard(exe);
        fail(offered ? available() : { state: 'none' }, e.message);
      }
    },
  };
}

module.exports = { setup };
