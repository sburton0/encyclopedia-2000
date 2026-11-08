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
// The Windows portable started from its .exe (its launcher sets these): it can update itself on its drive, as the user
// chooses (see selfUpdate). Never true for the installed app, a Mac, or Linux, which keep the behavior below unchanged.
const SELF = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_DIR && !!process.env.PORTABLE_EXECUTABLE_FILE;
const DOWNLOADS = 'https://github.com/sburton0/encyclopedia-2000/releases/latest';

const FIRST_CHECK = 8 * 1000;
const EVERY = 6 * 60 * 60 * 1000;

function setup({ getWindow, isEnabled, quitForUpdate, getSettings }) {
  let state = { state: 'idle' };
  const send = (s) => {
    state = s;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update', s);
  };

  // Development aid: E2K_FAKE_UPDATE=ready shows the "ready to install" message without a real update.
  // E2K_FAKE_KIND=deb or portable picks which "available" message to show; E2K_FAKE_SELF=1 shows the portable's own.
  if (process.env.E2K_FAKE_UPDATE) {
    const fake = () => ({ state: process.env.E2K_FAKE_UPDATE, version: '0.4.0-beta', kind: process.env.E2K_FAKE_KIND || KIND, file: 'Encyclopedia-2000-0.4.0-beta-linux-amd64.deb',
      ...(process.env.E2K_FAKE_SELF ? { self: true, size: 98 * 1048576, readonly: false } : {}) });
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

  const self = SELF ? selfUpdate({ send, getState: () => state, setState: (s) => { state = s; }, quitForUpdate, getSettings }) : null;
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

// The portable version's own updates (portable-update.js). It checks only once the user has answered the first-run
// question (see app.js), and what happens next depends on "Also download and install updates automatically":
// - off: the status bar says a new version exists, with Download; Restart Now then switches to it, and a downloaded
//   update waits on the drive (offered again at each start) until then.
// - on: like the installed app: it downloads by itself, offers Restart Now, and installs when the app closes.
// Install on Close (or the automatic setting) installs a downloaded update when the app closes; Help › Check for Updates
// can also delete it, and a version the user deleted isn't downloaded again by itself. A release without portable.yml falls back to the download page, and so does a drive that
// can't be written to. The previous version is deleted only once the new one has started and drawn its first screen.
function selfUpdate({ send, getState, setState, quitForUpdate, getSettings }) {
  const pu = require('./portable-update');
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  let job = null, offered = null, onQuit = false, restartTo = null;
  const declined = new Set(), toldFailure = new Set();
  pu.cleanupPending(exe);
  ipcMain.once('update:started', () => setTimeout(() => pu.removePrevious(exe, { current: app.getVersion() }), 3000));
  const newer = (v) => require('semver').gt(v, app.getVersion());   // semver comes with electron-updater
  const auto = () => getSettings().autoInstall === true;
  const waiting = pu.ready(exe);
  if (waiting && newer(waiting.version)) send({ state: 'ready', version: waiting.version, self: true });
  else if (waiting) pu.discard(exe);
  const available = () => ({ state: 'available', version: offered.version, kind: KIND, self: true, size: offered.size, readonly: !pu.writable(exe) });
  // A failure is told once per version (the window shows it), then the state goes on without it.
  const fail = (s, message) => {
    if (toldFailure.has(s.version)) return send(s);
    toldFailure.add(s.version);
    send({ ...s, failed: message });
    setState(s);
  };
  async function download() {
    if (!offered || job) return;
    job = true;
    send({ state: 'downloading', version: offered.version, percent: 0, self: true });
    try {
      await pu.download(exe, offered, { onProgress: (percent) => send({ state: 'downloading', version: offered.version, percent, self: true }) });
      send({ state: 'ready', version: offered.version, self: true });
    } catch (e) { fail(available(), e.message); } finally { job = null; }
  }
  // Installs a downloaded update as the app closes: on Restart Now (and then starts it), or, when asked to, at any close.
  app.on('will-quit', () => {
    if (restartTo) return void require('child_process').spawn(restartTo, [], { detached: true, stdio: 'ignore', cwd: path.dirname(restartTo) }).unref();
    if (getState().state === 'ready' && (onQuit || auto())) { try { pu.swap(exe, app.getVersion()); } catch {} }
  });
  const ipc = (name, fn) => ipcMain.handle(`update:${name}`, fn);
  ipc('download', async () => { await download(); return getState(); });
  ipc('install-on-quit', () => { onQuit = true; send({ ...getState(), onQuit: true }); return getState(); });
  ipc('discard', () => {
    const v = getState().version;
    pu.discard(exe);
    if (v) declined.add(v);
    send(offered ? available() : { state: 'none' });
    return getState();
  });
  // Options changed: with checks off, a notice about a version that isn't downloaded goes; with automatic downloads
  // turned on, one that's offered starts downloading.
  ipcMain.on('update:settings', () => {
    const s = getState(), set = getSettings();
    if (s.state === 'available' && s.self && set.autoUpdate === false) send({ state: 'none' });
    else if (s.state === 'available' && s.self && auto() && !s.readonly && !declined.has(s.version)) download();
  });
  return {
    busy: () => !!job || getState().state === 'ready',
    async offer(i) {
      if (getState().state === 'ready' || job) return;
      let m = null;
      try { m = await pu.manifest(i.version); } catch {}
      if (!m) return send({ state: 'available', version: i.version, kind: KIND, file: '' });
      offered = { ...m, version: i.version };
      const a = available();
      if (auto() && !a.readonly && !declined.has(a.version)) download(); else send(a);
    },
    install() {
      const s = getState();
      if (s.state === 'available' && (!s.self || s.readonly)) return shell.openExternal(DOWNLOADS);
      if (s.state === 'available') return download();
      if (s.state !== 'ready') return;
      try {
        restartTo = pu.swap(exe, app.getVersion());
        quitForUpdate();
      } catch (e) {
        pu.discard(exe);
        fail(offered ? available() : { state: 'none', version: s.version }, e.message);
      }
    },
  };
}

module.exports = { setup, SELF };
