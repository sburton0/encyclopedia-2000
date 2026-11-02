// Notices to everyone who uses the app: one news item for Home and one important notice for a banner on every screen,
// read from encyclopedia2000.com/notice.json (posted by editing that file in the website). Checked once a day (every few
// hours while a notice is showing, so one taken down goes quickly), never in Offline mode, and not at all with both "Check for updates automatically" (which covers the important
// notice) and "Show news on the Home page" turned off. The request sends nothing but itself. The Windows portable checks
// nothing until its first-run question is answered, and Don't Check there turns news off too (main.js, app.js).
// Anything the app doesn't expect (HTML, a link to another site, a broken file) means nothing is shown. The text is
// only ever shown as plain text. E2K_NOTICE_FILE reads a local file instead, for previewing a notice before posting it.
const fs = require('fs');
const path = require('path');

const URL = 'https://encyclopedia2000.com/notice.json';
const DAY = 24 * 60 * 60 * 1000;
const SOON = 3 * 60 * 60 * 1000;

// Whether it's time to check again: once a day while nothing is shown, but at every start and every few hours while a
// notice is on screen, so one that's taken down (or corrected) goes away within hours, not a day.
function due(checked, showing, now, starting) {
  if (!checked) return true;
  if (showing) return starting || now - checked >= SOON;
  return now - checked >= DAY;
}

// Links may only go to the website or the app's GitHub page.
function safeLink(link) {
  if (!link || typeof link !== 'object') return null;
  const { label, url } = link;
  if (typeof label !== 'string' || !label.trim() || label.length > 40 || /[<>]/.test(label)) return undefined;
  let u;
  try { u = new globalThis.URL(url); } catch { return undefined; }
  const ok = u.protocol === 'https:' && (/^(www\.)?encyclopedia2000\.com$/.test(u.hostname)
    || (u.hostname === 'github.com' && /^\/sburton0\/encyclopedia-2000(\/|$)/.test(u.pathname)));
  return ok ? { label: label.trim(), url: u.href } : undefined;
}
// One item, if it's well formed and meant for this copy (its platform, its version, and before its end date).
function item(x, { platform, version, today, satisfies }) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.id !== 'string' || !/^[\w.-]{1,64}$/.test(x.id)) return null;
  if (typeof x.text !== 'string' || !x.text.trim() || x.text.length > 200 || /[<>]/.test(x.text)) return null;
  const link = x.link == null ? null : safeLink(x.link);
  if (link === undefined) return null;
  if (x.until != null && !(typeof x.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.until) && today <= x.until)) return null;
  if (x.platforms != null && !(Array.isArray(x.platforms) && x.platforms.includes(platform))) return null;
  if (x.versions != null) { try { if (!satisfies(version, x.versions)) return null; } catch { return null; } }
  return { id: x.id, text: x.text.trim(), link };
}
// What this copy shows from a notice file: { news, important }, either of them null.
function pick(file, env, { news = true, important = true } = {}) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) return { news: null, important: null };
  return { news: news ? item(file.news, env) : null, important: important ? item(file.important, env) : null };
}

function setup({ getWindows, settings }) {
  const { app, ipcMain } = require('electron');
  const semver = require('semver');   // comes with electron-updater
  const env = () => ({ platform: process.platform, version: app.getVersion(), today: new Date().toISOString().slice(0, 10),
    // Every version is a beta: "0.5.4-beta" counts as 0.5.4, so "<0.5.4" means the versions before it.
    satisfies: (v, range) => semver.satisfies(semver.coerce(v).version, range) });
  const cacheFile = path.join(app.getPath('userData'), 'notice.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  const wants = () => {
    const s = settings();
    return { news: s.showNews !== false, important: s.autoUpdate !== false };
  };
  const current = () => (settings().offlineMode ? { news: null, important: null } : pick(cache.file, env(), wants()));
  const send = () => { for (const w of getWindows()) if (!w.isDestroyed()) w.webContents.send('notice', current()); };

  let starting = true;   // the first check after starting
  async function check() {
    const w = wants();
    if (process.env.E2K_NOTICE_FILE) {
      try { cache = { file: JSON.parse(fs.readFileSync(process.env.E2K_NOTICE_FILE, 'utf8')) }; } catch { cache = {}; }
      return send();
    }
    const c = current();
    if (settings().offlineMode || (!w.news && !w.important) || !due(cache.checked, !!(c.news || c.important), Date.now(), starting)) return;
    starting = false;
    try {
      const res = await fetch(URL, { headers: { 'User-Agent': 'Encyclopedia 2000' }, cache: 'no-store' });
      let file = null;
      if (res.ok) { try { file = JSON.parse(await res.text()); } catch {} }
      else if (res.status !== 404) return;   // try again later
      cache = { checked: Date.now(), file };
      try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch {}
      send();
    } catch {}   // no connection: try again later
  }
  ipcMain.handle('notice:get', () => current());
  // Turning the switches or Offline mode on or off shows (or hides) what's already known straight away.
  ipcMain.on('notice:refresh', () => { send(); check(); });
  setTimeout(check, process.env.E2K_NOTICE_FILE ? 1000 : 10 * 1000);
  setInterval(check, SOON).unref();
}

module.exports = { setup, pick, item, safeLink, due };
