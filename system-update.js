// Linux copies that the computer itself keeps up to date (from 0.6.1): the .deb installed with our apt repository
// (apt.encyclopedia2000.com, which the .deb adds when it's installed), and the Flatpak from Flathub. These never check
// GitHub or download anything themselves. They only notice when the system has installed a newer version while the app
// is open, and offer Restart Now ("Version 0.6.2 was installed"), because the running copy is still the old one.
// Help › Check for Updates explains that updates come with the computer's other updates.
const fs = require('fs');
const { spawn } = require('child_process');

const PACKAGE = 'encyclopedia-2000';
// Where the .deb's postinst writes the repository (build/linux/after-install.sh).
const APT_SOURCES = ['/etc/apt/sources.list.d/encyclopedia-2000.sources', '/etc/apt/sources.list.d/encyclopedia-2000.list'];
const DPKG_STATUS = '/var/lib/dpkg/status';
const EVERY = 10 * 60 * 1000;   // how often the apt copy looks at what's installed (a small local file; nothing is contacted)

// 'flatpak', 'apt', or null (everything else: Windows, the Mac, a .deb installed without the repository).
// E2K_FAKE_SYSTEM=apt or flatpak pretends, for tests.
function detect({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (env.E2K_FAKE_SYSTEM === 'apt' || env.E2K_FAKE_SYSTEM === 'flatpak') return env.E2K_FAKE_SYSTEM;
  if (platform !== 'linux') return null;
  if (env.FLATPAK_ID || exists('/.flatpak-info')) return 'flatpak';
  if (env.APPIMAGE) return null;
  return APT_SOURCES.some((f) => exists(f)) ? 'apt' : null;
}

// The installed version of our package in dpkg's status file, in the app's own form ("0.6.2~beta" → "0.6.2-beta"),
// or null if it isn't installed (or is being removed).
function debVersion(statusText, pkg = PACKAGE) {
  for (const block of String(statusText || '').split(/\n\s*\n/)) {
    if (!new RegExp(`^Package: ${pkg}$`, 'm').test(block)) continue;
    if (!/^Status: install ok installed$/m.test(block)) return null;
    const v = /^Version: (\S+)$/m.exec(block);
    return v ? v[1].replace(/^\d+:/, '').replace(/~/g, '-') : null;
  }
  return null;
}

// The Flatpak's version file (written at build time from the .deb: flatpak/com.encyclopedia2000.Encyclopedia2000.yml).
const FLATPAK_VERSION_FILE = '/app/share/encyclopedia-2000/version';

// Watches for a newer installed version and reports it with onInstalled({ version }). Returns { check, restart, stop };
// check() resolves to what's been found (or null).
// - apt: reads dpkg's status file (a small local file) every 10 minutes and at Check for Updates.
// - Flatpak: asks Flatpak's portal to run a tiny command in the newest installed version of the app
//   (flatpak-spawn --latest-version), which reads that version's version file. (The portal's own update monitor only
//   lasts as long as the D-Bus connection that asked for it, which a command-line tool can't hold.)
function watch(kind, { current, onInstalled, newer, statusFile = DPKG_STATUS, every = EVERY, latestFlatpak = flatpakLatest }) {
  let found = null, timer = null, busy = null;
  const report = (version) => { if (found) return; found = { version }; onInstalled(found); };

  const checkApt = async () => {
    let v = null;
    try { v = debVersion(fs.readFileSync(statusFile, 'utf8')); } catch { return found; }
    if (v && newer(v, current)) report(v);
    return found;
  };
  const checkFlatpak = () => {
    if (found) return Promise.resolve(found);
    if (!busy) busy = latestFlatpak().then((v) => { if (v && newer(v, current)) report(v); return found; }, () => found).finally(() => { busy = null; });
    return busy;
  };
  const check = kind === 'apt' ? checkApt : checkFlatpak;
  check();
  timer = setInterval(check, every);
  timer.unref?.();

  return {
    check,
    // Starts the new version, then quits this one (quit). The Flatpak asks the portal for the newest installed version
    // (a relaunch from inside would start the old one again); the pause lets this copy close first.
    restart(quit) {
      const { app } = require('electron');
      if (kind === 'flatpak' && !process.env.E2K_FAKE_SYSTEM) {
        // The portal's Spawn (flags 2: the latest version) returns as soon as the new copy has started, so nothing of
        // this copy stays behind (flatpak-spawn would wait for the new copy, keeping the old one's sandbox open). This
        // copy quits only once the call is answered: quitting closes its sandbox, which would cut the call off.
        let done = false;
        const finish = () => { if (!done) { done = true; quit(); } };
        try {
          const p = spawn('gdbus', ['call', '--session', '--dest', 'org.freedesktop.portal.Flatpak', '--object-path', '/org/freedesktop/portal/Flatpak',
            '--method', 'org.freedesktop.portal.Flatpak.Spawn', "b'/'", "[b'/app/bin/encyclopedia-2000']", '{}', '{}', '2', '{}'],
          { stdio: ['ignore', 'pipe', 'pipe'], env: plainEnv() });
          // What the portal said, for "Restart Now didn't start the new version" reports (in the app's data folder).
          let said = '';
          p.stdout.on('data', (d) => { said += d; });
          p.stderr.on('data', (d) => { said += d; });
          p.on('close', (code) => {
            try { fs.writeFileSync(require('path').join(app.getPath('userData'), 'last-restart.log'), `${new Date().toISOString()} gdbus ${code}: ${said}`); } catch {}
            finish();
          });
          p.on('error', finish);
        } catch { finish(); }
        return setTimeout(finish, 10000);
      } else app.relaunch();
      quit();
    },
    stop() { clearInterval(timer); },
  };
}

// Inside the Flatpak, Electron runs under zypak, which preloads itself (LD_PRELOAD) into everything the app starts;
// tools the app runs itself get the environment without it.
function plainEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'LD_PRELOAD' && !/^ZYPAK_/.test(k)));
}

// The newest installed version of this Flatpak ("0.6.2-beta"), or null.
function flatpakLatest() {
  return new Promise((resolve) => {
    let out = '';
    let p;
    try { p = spawn('flatpak-spawn', ['--latest-version', 'cat', FLATPAK_VERSION_FILE], { stdio: ['ignore', 'pipe', 'ignore'], env: plainEnv() }); } catch { return resolve(null); }
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, 15000);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', (code) => { clearTimeout(t); const v = out.trim(); resolve(code === 0 && /^\d+\.\d+\.\d+[\w.-]*$/.test(v) ? v : null); });
  });
}

module.exports = { detect, debVersion, watch, APT_SOURCES, PACKAGE, FLATPAK_VERSION_FILE };
