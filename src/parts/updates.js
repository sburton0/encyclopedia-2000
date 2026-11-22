// Updates: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts.updates = (A) => {
  'use strict';
  const { $, $$, h, store } = A;
  const { setStatus, setIdle, isOffline, dialog, prettyVersion } = A.fn;

  // The installed app downloads new versions in the background (updater.js); the status bar offers to restart when one is ready.
  const updateBar = $('#updatebar');
  // The Windows portable updates itself on its drive, as the user chose on its first run (updater.js): Download (unless
  // it downloads by itself), then Restart Now or Update on Close. ✕ hides a version's notice until the next one.
  // Everything else (the installed app, Mac, Linux) is handled after this, as before.
  const releasePage = (version) => window.e2k.openExternal(`https://github.com/sburton0/encyclopedia-2000/releases/tag/v${version}`);
  function showSelfUpdate(s) {
    const v = prettyVersion(s.version);
    let shown = true;
    if (s.state === 'available' && store.get('updateHidden', '') !== s.version) {
      updateBar.replaceChildren(`Version ${v} is available`, h('button', { onclick: () => selfDownload(s) }, 'Download'),
        h('button', { class: 'ux', title: 'Hide until the next version', 'aria-label': 'Hide until the next version',
          onclick: () => { store.set('updateHidden', s.version); updateBar.hidden = true; } }, '✕'));
      updateBar.title = 'Downloads the new version to this drive, next to this one. Nothing is installed on this computer.';
    } else if (s.state === 'downloading') {
      updateBar.replaceChildren(`Downloading version ${v} · ${s.percent || 0}%`);
      updateBar.title = '';
    } else if (s.state === 'ready' && !s.onQuit) {
      updateBar.replaceChildren(`Version ${v} is ready`, h('button', { onclick: () => window.e2k.update.install() }, 'Restart Now'),
        h('button', { onclick: () => window.e2k.update.installOnQuit() }, 'Update on Close'));
      updateBar.title = 'Restart Now starts the new version; Update on Close switches to it when you close Encyclopedia 2000.';
    } else shown = false;
    updateBar.hidden = !shown;
    if (s.failed) dialog('Update Encyclopedia 2000', 'The update couldn’t be finished', [s.failed,
      'Nothing has changed: the version you have still works. You can try again from the status bar.']);
  }
  function readOnlyDrive(s) {
    dialog('Update Encyclopedia 2000', 'This drive can’t be updated', [
      'Encyclopedia 2000 is running from a drive it can’t save to (it may be locked, or a DVD).',
      `To update, download version ${prettyVersion(s.version)} from the website and copy it onto a drive you can write to.`],
    [['Open the Download Page', () => window.e2k.update.install(), true], ['Not Now']]);
  }
  const selfDownload = (s) => (s.readonly ? readOnlyDrive(s) : window.e2k.update.download());
  // Help › Check for Updates on the portable: the same choices as the status bar, plus the website and deleting a
  // downloaded update.
  function selfUpdateDialog(s) {
    const title = 'Check for Updates', v = prettyVersion(s.version);
    if (s.state === 'available' && s.readonly) return readOnlyDrive(s);
    if (s.state === 'available') {
      return dialog(title, 'A new version is available', [
        `Version ${v} is ready to download (${Math.ceil((s.size || 0) / 1048576)} MB). It downloads to this drive, next to the version you’re using, and nothing is installed on this computer.`,
        h('p', { class: 'fine' }, 'Or download it yourself from the website and use it in place of this copy. Keep the “Encyclopedia 2000 Data” folder next to it to keep your settings.')],
      [['Download', () => selfDownload(s), true], ['Download from Website…', () => releasePage(s.version)], ['Later']]);
    }
    if (s.state === 'ready') {
      return dialog(title, 'An update is ready', [
        `Version ${v} is downloaded and saved on this drive, next to the version you’re using.`,
        'Restart now to start using it, or it takes this version’s place when you close Encyclopedia 2000. If you’d rather not have it, delete it.'],
      [['Restart Now', () => window.e2k.update.install(), true], ['Update on Close', () => window.e2k.update.installOnQuit()], ['Delete Update', () => window.e2k.update.discard()]]);
    }
    return dialog(title, 'An update is on its way', [`Version ${v} is downloading. Restart Now appears in the status bar when it’s ready.`]);
  }
  // The portable's first run (and its first run of 0.5.4): whether to check for updates, and whether to download and
  // install them by itself. Only its buttons answer it (Escape is Don't Check, which also turns news off); a click outside
  // does nothing. If it goes away unanswered some other way, nothing is saved, nothing is contacted, and it asks again
  // at the next start (Scott, 2026-11-08: a click outside used to count as Don't Check, and it never asked again).
  async function askAboutUpdates() {
    const main = await window.e2k.settings.get().catch(() => ({}));
    if (!main.portableSelf || main.updateAsked) return;
    const esc = (e) => {
      if (e.key !== 'Escape' || !ov.isConnected) return;
      e.preventDefault(); e.stopImmediatePropagation();
      ov.querySelector('.df .go:not(.default)').click();   // Don't Check
    };
    const answer = async (on) => {
      document.removeEventListener('keydown', esc, true);
      // Don't Check means the app contacts nothing by itself: news goes off too (it can be turned on in Options).
      await window.e2k.settings.set({ autoUpdate: on, autoInstall: on && auto.checked, updateAsked: true, ...(on ? {} : { showNews: false }) });
      window.e2k.update.settingsChanged();
      window.e2k.notice.refresh();
      if (on) window.e2k.update.check().then(showUpdate).catch(() => {});
    };
    const auto = h('input', { type: 'checkbox' });
    dialog('Encyclopedia 2000', 'Check for updates automatically?', [
      'Once a day, along with news and important notices. You can also check anytime in Help › Check for Updates.',
      h('label', { class: 'askauto' }, auto, h('span', {}, 'Also update automatically')),
      h('p', { class: 'fine' }, 'You can change this anytime in Options.'),
    ], [['Check for Updates', () => answer(true), true], ['Don’t Check', () => answer(false)]], { stay: true });
    const ov = $$('.overlay').at(-1);
    ov.querySelector('.dialog').classList.add('askupdate');
    document.addEventListener('keydown', esc, true);
  }

  function showUpdate(s) {
    if (s.self) return showSelfUpdate(s);
    if (s.state === 'installed') {
      // Linux: the computer installed a new version (apt or Flathub) while this one was open.
      updateBar.replaceChildren(s.version ? `Version ${prettyVersion(s.version)} was installed` : 'A new version was installed', h('button', { onclick: () => window.e2k.update.install() }, 'Restart Now'));
      updateBar.title = 'Your computer installed this update. Restart Encyclopedia 2000 to start using it.';
      updateBar.hidden = false;
    } else if (s.state === 'ready') {
      updateBar.replaceChildren(`Version ${prettyVersion(s.version)} is ready`, h('button', { onclick: () => window.e2k.update.install() }, 'Restart Now'));
      updateBar.title = 'Restart Encyclopedia 2000 to finish updating. Otherwise the update installs the next time you close it.';
      updateBar.hidden = false;
    } else if (s.state === 'available') {
      updateBar.replaceChildren(`Version ${prettyVersion(s.version)} is available`, h('button', { onclick: () => window.e2k.update.install() }, 'Download'));
      updateBar.title = 'Opens the download page in your web browser.';
      updateBar.hidden = false;
    } else if (s.state === 'downloading') {
      updateBar.replaceChildren(`Downloading version ${prettyVersion(s.version)}${s.percent ? ` · ${s.percent}%` : '…'}`);
      updateBar.title = '';
      updateBar.hidden = false;
    } else updateBar.hidden = true;
  }
  window.e2k.update.onChange(showUpdate);
  window.e2k.update.state().then(showUpdate).catch(() => {});

  async function checkForUpdates() {
    // (A Linux copy the computer updates checks nothing online, so Offline mode doesn't matter there.)
    const now = await window.e2k.update.state().catch(() => ({}));
    if (isOffline() && !['system', 'installed'].includes(now.state)) return dialog('Check for Updates', 'You’re in Offline mode', ['Go online from the status bar to check for updates.']);
    setStatus('Checking for updates…', true);
    const s = await window.e2k.update.check().catch(() => ({ state: 'error' }));
    setIdle();
    showUpdate(s);
    const title = 'Check for Updates';
    if (s.self && ['available', 'ready', 'downloading'].includes(s.state)) return selfUpdateDialog(s);
    if (s.state === 'installed') dialog(title, 'Restart to finish updating', [
      `Your computer installed ${s.version ? `version ${prettyVersion(s.version)}` : 'a new version'} along with its other updates. Restart Encyclopedia 2000 to start using it.`],
      [['Restart Now', () => window.e2k.update.install(), true], ['Later']]);
    else if (s.state === 'system') dialog(title, 'Updates come from your computer', [
      `Encyclopedia 2000 updates along with your other apps, through your computer’s software updates (${s.kind === 'flatpak' ? 'Software, Discover, or Update Manager' : 'Update Manager or Software Updater'}). When a new version is installed, you’ll see Restart Now in the status bar.`]);
    else if (s.state === 'ready') dialog(title, 'An update is ready', [`Version ${prettyVersion(s.version)} has been downloaded. Restart Encyclopedia 2000 to finish installing it.`],
      [['Restart Now', () => window.e2k.update.install(), true], ['Later']]);
    else if (s.state === 'available' && s.kind === 'deb') {
      // Ubuntu's App Center won't replace an app that's already installed, so updating takes one command in a terminal.
      const cmd = `sudo apt install ~/Downloads/${s.file || `Encyclopedia-2000-${s.version}-linux-amd64.deb`}`;
      const copy = h('button', { class: 'bbtn', onclick: () => { navigator.clipboard.writeText(cmd).catch(() => {}); copy.textContent = 'Copied'; } }, 'Copy');
      dialog(title, 'A new version is available', [
        `Version ${prettyVersion(s.version)} is ready to download. Download the new .deb file, then open a terminal and run:`,
        h('p', { class: 'cmd' }, h('code', {}, cmd), copy),
        'Your settings and favorites are kept. (The App Center can’t update an app that’s already installed.)'],
      [['Download', () => window.e2k.update.install(), true], ['Later']]);
    } else if (s.state === 'available') dialog(title, 'A new version is available', [
      `Version ${prettyVersion(s.version)} is ready to download. This portable copy can’t update itself, so download the new version and use it in place of this one. Your settings and favorites carry over if you keep its “Encyclopedia 2000 Data” folder next to it.`],
      [['Download', () => window.e2k.update.install(), true], ['Later']]);
    else if (s.state === 'downloading') dialog(title, 'An update is on its way', [`Version ${prettyVersion(s.version)} is downloading. You’ll see a Restart Now button in the status bar when it’s ready.`]);
    else if (s.state === 'none') dialog(title, 'You’re up to date', [`Encyclopedia 2000 ${prettyVersion((await window.e2k.appInfo()).version)} is the newest version.`]);
    else if (s.state === 'dev') dialog(title, 'Updates aren’t available here', ['This copy of Encyclopedia 2000 is running from its source folder. Updates work in the installed app.']);
    else {
      // What went wrong, in a small Details line, so a problem can be reported exactly. A copy missing its update file
      // (Mac 0.4.1 and 0.4.2 shipped that way) can't ever check, so it says where to get a working one.
      const msg = s.message || '';
      const broken = /app-update\.yml/.test(msg);
      dialog(title, 'Couldn’t check for updates', [
        broken ? 'This copy of Encyclopedia 2000 can’t check for updates. Download the newest version from encyclopedia2000.com, and updates will work again.'
          : Wiki.connected() ? 'The update server didn’t respond. Please try again later.' : 'You’re offline. Connect to the internet and try again.',
        msg ? h('p', { class: 'fine' }, `Details: ${msg}`) : null].filter(Boolean),
      broken ? [['Open the Website', () => window.e2k.openExternal('https://encyclopedia2000.com'), true], ['Close']] : undefined);
    }
  }

  return { askAboutUpdates, checkForUpdates };
};
