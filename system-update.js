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

// Watches for a newer installed version and reports it with onInstalled({ version }) (version is null for the Flatpak,
// whose portal doesn't say). Returns { check, restart, stop }.
function watch(kind, { current, onInstalled, newer, statusFile = DPKG_STATUS, every = EVERY }) {
  let found = null, timer = null, monitor = null;
  const report = (version) => { if (found) return; found = { version }; onInstalled(found); };

  const checkApt = () => {
    let v = null;
    try { v = debVersion(fs.readFileSync(statusFile, 'utf8')); } catch { return found; }
    if (v && newer(v, current)) report(v);
    return found;
  };

  if (kind === 'apt') {
    checkApt();
    timer = setInterval(checkApt, every);
    timer.unref?.();
  } else if (kind === 'flatpak' && !process.env.E2K_FAKE_SYSTEM) {
    // The Flatpak portal tells a running app when a newer version of it has been installed (UpdateAvailable).
    monitor = flatpakMonitor(() => report(null));
  }

  return {
    check: () => (kind === 'apt' ? checkApt() : found),
    // Starts the new version, then quits this one (quit). The Flatpak asks the portal for the newest installed version
    // (a relaunch from inside would start the old one again); the pause lets this copy close first.
    restart(quit) {
      const { app } = require('electron');
      if (kind === 'flatpak' && !process.env.E2K_FAKE_SYSTEM) {
        try {
          const cmd = process.env.FLATPAK_ID ? `/app/bin/${process.env.E2K_FLATPAK_COMMAND || 'encyclopedia-2000'}` : process.execPath;
          spawn('flatpak-spawn', ['--latest-version', 'sh', '-c', `sleep 2; exec "${cmd}"`], { detached: true, stdio: 'ignore' }).unref();
        } catch {}
      } else app.relaunch();
      quit();
    },
    stop() { clearInterval(timer); try { monitor?.kill(); } catch {} },
  };
}

// gdbus (part of the Flatpak runtime) asks the portal for an update monitor, then listens for its UpdateAvailable signal.
function flatpakMonitor(onUpdate) {
  let mon = null;
  try {
    const call = spawn('gdbus', ['call', '--session', '--dest', 'org.freedesktop.portal.Flatpak', '--object-path', '/org/freedesktop/portal/Flatpak',
      '--method', 'org.freedesktop.portal.Flatpak.CreateUpdateMonitor', '{}'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    call.stdout.on('data', (d) => { out += d; });
    call.on('error', () => {});
    call.on('close', () => {
      const handle = /objectpath '([^']+)'/.exec(out)?.[1] || /'(\/org\/freedesktop\/portal\/Flatpak\/update_monitor\/[^']+)'/.exec(out)?.[1];
      if (!handle) return;
      mon = spawn('gdbus', ['monitor', '--session', '--dest', 'org.freedesktop.portal.Flatpak', '--object-path', handle], { stdio: ['ignore', 'pipe', 'ignore'] });
      mon.on('error', () => {});
      mon.stdout.on('data', (d) => { if (/UpdateAvailable/.test(String(d))) onUpdate(); });
    });
  } catch {}
  return { kill: () => mon?.kill() };
}

module.exports = { detect, debVersion, watch, APT_SOURCES, PACKAGE };
