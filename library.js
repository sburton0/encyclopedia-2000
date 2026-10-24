// The offline library: Kiwix library files (ZIM) that let articles, pictures, and search work without internet.
// - Opens the installed library at startup and serves it at e2k-zim://lib/<namespace>/<path> (following redirects).
// - Reads Kiwix's catalog for the packs below, downloads one through Kiwix's mirrors, checks it piece by piece,
//   and swaps it in when it's done (one Wikipedia library at a time; the old one stays usable until then).
// - Remembers the library, its folder, and any unfinished download in userData/library.json.
// The page talks to it over IPC (library:*), and hears about changes and progress on 'library:update'.
// Development settings: E2K_ZIM=<file.zim> opens that file instead; E2K_LIBRARY_TEST=1 adds a tiny test pack.
const { app, protocol, ipcMain, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const Zim = require('./zim-reader');

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'e2k-zim', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const CATALOG = 'https://opds.library.kiwix.org/catalog/v2/entries';
const UA = `Encyclopedia 2000/${app.getVersion()} (+https://encyclopedia2000.com)`;
// The packs offered, smallest content last within each size; `covers` lists packs whose articles it includes.
const PACKS = [
  { id: 'top_maxi', name: 'wikipedia_en_top', flavour: 'maxi', label: 'Essentials', recommended: true,
    desc: 'The best 220,000 articles, with images.', covers: ['top_nopic'] },
  { id: 'top_nopic', name: 'wikipedia_en_top', flavour: 'nopic', label: 'Essentials, text only', desc: 'The same 220,000 articles, without images.', covers: [] },
  { id: 'all_nopic', name: 'wikipedia_en_all', flavour: 'nopic', label: 'Everything, text only', desc: 'All 7 million articles, without images.', covers: ['top_nopic'] },
  { id: 'all_maxi', name: 'wikipedia_en_all', flavour: 'maxi', label: 'Everything', desc: 'All 7 million articles, with images.',
    covers: ['top_maxi', 'top_nopic', 'all_nopic'] },
];
// E2K_LIBRARY_TEST=1 adds the tiny Ray Charles library (3 MB); E2K_LIBRARY_TEST=<catalog name> adds another, such as
// wikipedia_en_knots (18 MB).
const testName = () => (process.env.E2K_LIBRARY_TEST === '1' ? 'wikipedia_en_ray-charles' : process.env.E2K_LIBRARY_TEST);
const packs = () => (process.env.E2K_LIBRARY_TEST ? [...PACKS, { id: 'test', name: testName(), flavour: 'maxi', label: `Test: ${testName()}`,
  desc: 'A small library for testing downloads.', covers: [] }] : PACKS);
const DAY = 24 * 3600 * 1000, MONTH = 30 * DAY;

// ---------- state ----------
let lib = null;            // the open library (a Zim), or null
let override = '';         // E2K_ZIM, if set
let move = null;           // the library being copied to a folder on another drive (see chooseDir)
let missing = false;       // the installed library can't be read (on a drive that was disconnected, or moved or deleted)
let watch = null;          // while it's missing, checks every few seconds whether it's back
let state = { dir: '', current: null, download: null, catalog: null, checked: 0 };
// state.current:  { pack, file, date, size }      the installed library
// state.download: { pack, file, url, date, size, pieces, done, status }   status: downloading | paused | error
// state.moving:   the unfinished copy of a move, deleted at the next start if the app closed mid-move
const stateFile = () => path.join(app.getPath('userData'), 'library.json');
// A folder inside the app's data folder is saved relative to it, so a portable copy on a USB drive keeps finding its
// library when the drive gets a different letter.
const dataDir = () => app.getPath('userData');
const libDir = () => (state.dir ? path.resolve(dataDir(), state.dir) : path.join(dataDir(), 'Library'));
const storeDir = (dir) => { const rel = path.relative(dataDir(), dir); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : dir; };
function save() { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...state, catalog: undefined }, null, 2)); } catch {} }
function load() { try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) }; } catch {} }

function openFile(file) {
  dailies.clear(); featuredHere = null;
  previews.clear();
  if (lib) { try { lib.close(); } catch {} lib = null; }
  try { lib = new Zim(file); } catch (e) { console.error('Offline library could not be opened:', e.message); return false; }
  // A read that fails (its drive was disconnected) means the library is missing, until it can be opened again.
  const read = lib.read.bind(lib);
  lib.read = (pos, len) => { try { return read(pos, len); } catch (e) { lost(); throw e; } };
  return true;
}
// The installed library can't be found. Nothing switches to Online by itself: the page says what happened, and the
// library opens again on its own when its file is back (a drive plugged in again, or the file put back).
function lost() {
  if (override || !state.current) return;
  if (lib) { try { lib.close(); } catch {} lib = null; }
  dailies.clear(); featuredHere = null; previews.clear();
  if (!missing) { missing = true; setImmediate(() => broadcast()); }
  if (!watch) {
    watch = setInterval(() => {
      if (!state.current) return found();
      const file = path.join(libDir(), state.current.file);
      if (fs.existsSync(file) && openFile(file)) { found(); broadcast(); }
    }, 3000);
  }
}
function found() { missing = false; if (watch) { clearInterval(watch); watch = null; } }
// While a library is open, check every few seconds that its file is still there, so unplugging its drive shows in
// the status bar right away instead of at the next read.
function watchPresence() {
  setInterval(() => {
    if (lib && !override && state.current && !fs.existsSync(path.join(libDir(), state.current.file))) lost();
  }, 3000).unref();
}
function broadcast(extra) {
  const s = { ...publicState(), ...extra };
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('library:update', s);
}

// ---------- reading ----------
const toPath = (title) => String(title).trim().replace(/ /g, '_');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function find(title) {
  if (!lib) return null;
  for (const p of new Set([toPath(title), cap(toPath(title))])) {
    const e = lib.resolve(lib.find('C', p));
    if (e && e.mime === 'text/html') return { path: e.path, title: e.title };
  }
  return null;
}
// Suggestions for what's been typed. The title list is case-sensitive, so it's searched as typed, with a capital
// first letter, and in title case. Many matches are redirects to other articles ("Los Angeles 1932" leads to "1932
// Summer Olympics"), so results are ranked: an exact match first, then articles whose own title starts with what was
// typed (shortest first), then articles reached only through a redirect, then partial-phrase matches (below).
function titles(q, limit = 8, deep = false) {
  if (!lib || !String(q).trim()) return [];
  const t = String(q).trim(), lower = t.toLowerCase(), best = new Map();
  for (const v of new Set([t, cap(t), t.replace(/\b\w/g, (c) => c.toUpperCase())])) {
    for (const e of lib.titleEntries(v, limit * 4)) {
      const r = lib.resolve(e);
      if (!r || r.mime !== 'text/html' || r.path === 'index') continue;
      const own = r.title.toLowerCase();
      const rank = own === lower || e.title.toLowerCase() === lower ? 0 : own.startsWith(lower) ? 1 : 2;
      const item = { title: r.title, path: r.path, rank, key: rank === 2 ? e.title : r.title };
      const had = best.get(r.path);
      if (!had || rank < had.rank) best.set(r.path, item);
    }
  }
  // Too few? Search with fewer words ("Los Angeles" for "Los Angeles Olympics") and keep the results that also contain
  // the other words in their title or a redirect's name, or (on the results page, since it reads each article) in
  // their first sentence.
  const words = t.split(/\s+/);
  for (let k = words.length - 1; k >= 1 && best.size < limit; k--) {
    const start = words.slice(0, k).join(' '), rest = words.slice(k).map((w) => w.toLowerCase());
    const has = (text) => rest.every((w) => text.toLowerCase().includes(w));
    const later = [];
    for (const v of new Set([start, cap(start), start.replace(/\b\w/g, (c) => c.toUpperCase())])) {
      for (const e of lib.titleEntries(v, 400)) {
        const r = lib.resolve(e);
        if (!r || r.mime !== 'text/html' || r.path === 'index' || best.has(r.path)) continue;
        if (has(r.title + ' ' + e.title)) best.set(r.path, { title: r.title, path: r.path, rank: 3, key: r.title });
        else if (deep && later.length < 60) later.push(r);
      }
    }
    for (const r of later) {
      if (best.size >= limit) break;
      if (!best.has(r.path) && has(preview(r.path).extract)) best.set(r.path, { title: r.title, path: r.path, rank: 4, key: r.title });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank || (a.rank === 1 ? a.key.length - b.key.length : 0) || a.key.localeCompare(b.key))
    .slice(0, limit).map(({ title, path: p }) => ({ title, path: p, ...preview(p) }));
}
// An article's lead picture (the infobox's, or the first figure's) as an e2k-zim: address, and its first sentence,
// for search results and suggestions. Read from the article itself, so they're remembered per article.
const previews = new Map();
const decode = (t) => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
function preview(articlePath) {
  if (previews.has(articlePath)) return previews.get(articlePath);
  let thumb = '', extract = '';
  try {
    const e = lib.resolve(lib.find('C', articlePath));
    const html = e ? lib.content(e).toString('utf8') : '';
    // The lead picture: the first one in the infobox (or else the article) that's a real picture shown at a decent
    // size. Infoboxes also hold small icons (a "current season" baseball, rating stars) and signatures.
    const start = Math.max(0, html.indexOf('class="infobox')), body = html.slice(start);
    // The image sits in a file frame (an inline <span> or a captioned <figure>), sometimes inside a link or an extra
    // <span> (it varies between libraries).
    for (const m of body.matchAll(/<(?:span|figure)[^>]*typeof="mw:File[^"]*"[^>]*>\s*(?:<(?:a|span)\b[^>]*>\s*)*(<img[^>]+>)/g)) {
      const img = m[1], w = +((/\swidth="(\d+)"/.exec(img) || [])[1] || 0), h = +((/\sheight="(\d+)"/.exec(img) || [])[1] || 0);
      if (w < 60 || h < 60 || /infobox-signature/.test(m[0])) continue;
      const src = (/src="([^"]+)"/.exec(img) || [])[1];
      if (!src || /^(data:|https?:)/.test(src)) continue;
      // The HTML has the name URL-encoded ("Schr%C3%B6dinger"), but the library stores it plain ("Schrödinger"),
      // so it's decoded before being encoded once for the URL.
      let rel = src.replace(/&amp;/g, '&');
      try { rel = decodeURIComponent(rel); } catch {}
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(articlePath), rel));
      if (!lib.find('C', p)) continue;   // some libraries leave out large images (animated GIFs): try the next one
      thumb = 'e2k-zim://lib/C/' + p.split('/').map(encodeURIComponent).join('/');
      break;
    }
    // The first real paragraph of the lead (not inside a table or box), without footnote marks or styles.
    const lead = html.slice(html.indexOf('mw-parser-output'));
    for (const m of lead.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = decode(m[1].replace(/<style[\s\S]*?<\/style>/g, '').replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<[^>]+>/g, '')).replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
      if (text.length < 40) continue;
      const end = text.slice(30).search(/[.!?](\s|$)/);
      extract = end >= 0 ? text.slice(0, 30 + end + 1) : text;
      if (extract.length > 220) extract = extract.slice(0, 217).replace(/\s+\S*$/, '') + '…';
      break;
    }
  } catch {}
  const r = { thumb, extract };
  previews.set(articlePath, r);
  if (previews.size > 500) previews.delete(previews.keys().next().value);
  return r;
}
function random() {
  if (!lib) return null;
  const n = lib.titleList().length;
  for (let k = 0; k < 50; k++) {
    const e = lib.resolve(lib.entry(lib.titleIdx(Math.floor(Math.random() * n))));
    if (e && e.mime === 'text/html' && e.path !== 'index') return { title: e.title, path: e.path };
  }
  return null;
}

// Home's picks for a day while offline: Today's discovery (an article with a picture and a real first paragraph) and
// the picture for the circle (an article's photo big enough to fill it, since most library pictures are small). Both
// come from Wikipedia's Featured Articles in the library (src/data/featured.json), as Wikipedia's own Home does
// online; a library with none of them (a small test library) uses any article. The same all day, a new pair each day.
const dailies = new Map();
let featuredHere = null;   // the library's featured articles, as entries (a promise)
// Long lookups pause now and then, so the app stays responsive meanwhile (the startup screen loads through the same
// process, and in Offline mode Home asks for today's picks as the app starts).
const breather = () => new Promise((r) => setImmediate(r));
function featuredInLibrary() {
  if (!featuredHere) {
    featuredHere = (async () => {
      const mine = lib, found = [];
      let list = [];
      try { list = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'data', 'featured.json'), 'utf8')); } catch {}
      for (let i = 0; i < list.length; i++) {
        if (i % 200 === 199) { await breather(); if (lib !== mine) return []; }
        const e = lib.resolve(lib.find('C', toPath(list[i])));
        if (e && e.mime === 'text/html') found.push(e);
      }
      return found;
    })();
  }
  return featuredHere;
}
// Text-only libraries (Kiwix's "nopic") have no pictures at all.
const hasPictures = () => !/(^|;)_pictures:no(;|$)/.test(lib.meta('Tags') || '');
function imageSize(b) {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  }
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}
// The biggest roughly square photo among the article's first few pictures (the ones about the subject), at least 300
// pixels on its short side, or ''. Photos only (JPEGs): drawings, diagrams, maps, flags, logos, and seals make a poor
// picture of the day.
function bigPicture(articlePath) {
  const html = lib.content(lib.resolve(lib.find('C', articlePath))).toString('utf8');
  let best = '', bestSide = 299;
  for (const m of [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].slice(0, 4)) {
    if (/^(data:|https?:)/.test(m[1]) || !/\.jpe?g$/i.test(m[1]) || /map|locat|flag|logo|seal|coat_of_arms|emblem|signature|diagram|chart/i.test(m[1])) continue;
    let rel = m[1].replace(/&amp;/g, '&');
    try { rel = decodeURIComponent(rel); } catch {}
    const p = path.posix.normalize(path.posix.join(path.posix.dirname(articlePath), rel));
    const e = lib.resolve(lib.find('C', p));
    const size = e && imageSize(lib.content(e));
    if (!size) continue;
    const [w, h] = size, side = Math.min(w, h);
    if (side > bestSide && w / h < 1.8 && h / w < 1.8) { best = p; bestSide = side; }
  }
  return best ? 'e2k-zim://lib/C/' + best.split('/').map(encodeURIComponent).join('/') : '';
}
function daily(key) {
  if (!lib) return null;
  if (!dailies.has(key)) dailies.set(key, dailyPicks(key));
  return dailies.get(key);
}
async function dailyPicks(key) {
  // Numbers that look random but are the same for the same day (a hash of the date feeding mulberry32).
  let seed = [...key].reduce((h, c) => { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); return (h << 13) | (h >>> 19); }, 1779033703);
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mine = lib, fa = await featuredInLibrary(), n = lib.titleList().length, pics = hasPictures();
  const pick = fa.length ? () => fa[Math.floor(next() * fa.length)]
    : () => { const e = lib.resolve(lib.entry(lib.titleIdx(Math.floor(next() * n)))); return e && e.mime === 'text/html' && e.path !== 'index' ? e : null; };
  let disc = null, pic = null;
  // Today's discovery has a picture when the library has pictures; the center picture needs a library with pictures.
  for (let k = 0; k < 300 && !disc; k++) {
    if (k % 10 === 9) { await breather(); if (lib !== mine) return null; }
    const e = pick(), pv = e && preview(e.path);
    if (pv && (pv.thumb || !pics) && pv.extract.length >= 80) disc = { title: e.title, path: e.path };
  }
  for (let k = 0; k < 300 && !pic && pics; k++) {
    if (k % 10 === 9) { await breather(); if (lib !== mine) return null; }
    const e = pick();
    if (!e || (disc && e.path === disc.path)) continue;
    let src = '';
    try { src = bigPicture(e.path); } catch {}
    if (src) pic = { title: e.title, path: e.path, src };
  }
  return { disc, pic };
}

// ---------- the catalog ----------
async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === 'text' ? res.text() : res;
}
// The latest edition of each pack: its file, date, size, and where Kiwix's mirror list for it is.
async function fetchCatalog() {
  const out = {};
  for (const name of [...new Set(packs().map((p) => p.name))]) {
    const xml = await get(`${CATALOG}?name=${encodeURIComponent(name)}&lang=eng&count=20`);
    for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
      const tag = (k) => (new RegExp(`<${k}[^>]*>([\\s\\S]*?)</${k}>`).exec(e) || [])[1] || '';
      const link = (/<link [^>]*rel="http:\/\/opds-spec\.org\/acquisition\/open-access"[^>]*\/>/.exec(e) || [])[0] || '';
      const url = (/href="([^"]+)"/.exec(link) || [])[1], size = +((/length="(\d+)"/.exec(link) || [])[1] || 0);
      const pack = packs().find((p) => p.name === tag('name') && p.flavour === tag('flavour'));
      if (pack && url) out[pack.id] = { url, size, date: tag('updated').slice(0, 10), file: url.split('/').pop().replace(/\.meta4$/, '') };
    }
  }
  state.catalog = out;
  state.checked = Date.now();
  save();
  return out;
}

// ---------- downloading ----------
// Kiwix's .meta4 file lists the mirrors (nearest first), the file's size and SHA-256, and a SHA-1 for each piece.
async function meta4(url) {
  const x = await get(url);
  const urls = [...x.matchAll(/<url[^>]*priority="(\d+)"[^>]*>([^<]+)<\/url>/g)].sort((a, b) => a[1] - b[1]).map((m) => m[2].trim());
  const pm = /<pieces length="(\d+)" type="sha-1">([\s\S]*?)<\/pieces>/.exec(x);
  return { urls, size: +(/<size>(\d+)<\/size>/.exec(x) || [])[1],
    pieceLength: pm ? +pm[1] : 0, pieces: pm ? [...pm[2].matchAll(/<hash>([0-9a-f]+)<\/hash>/g)].map((m) => m[1]) : [] };
}

let job = null;   // the running download: { abort, speed, eta }
// Creates the folder if it's missing. A drive's root (D:\) already exists, and Windows refuses to "create" it.
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
// Free space where the library goes: asks the folder, or the nearest folder above it that exists.
// The drive's whole size, for telling "too small" apart from "too full".
function driveSize(dir) {
  let d = path.resolve(dir);
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  try { const s = fs.statfsSync(d); return s.blocks * s.bsize; } catch { return 0; }
}
function freeSpace(dir) {
  if (process.env.E2K_FAKE_FREE) return +process.env.E2K_FAKE_FREE;   // development: pretend this much is free
  let d = path.resolve(dir);
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch { return 0; }
}
// What a folder allows, found by creating a scratch file there and sizing it just past 4 GB (nothing is written),
// then deleting it: { write } is false when files can't be created there at all (the root of C:, for
// example), and { big } is false on drives formatted FAT32, which can't hold a file over 4 GB. Remembered per folder.
const probeCache = new Map();
function probeDir(dir) {
  if (probeCache.has(dir)) return probeCache.get(dir);
  const probe = path.join(dir, '.e2k-size-check');
  let r;
  try {
    ensureDir(dir);
    const fd = fs.openSync(probe, 'w');
    // Sized back to nothing before it's closed: exFAT drives fill a sized file with zeros when it's closed, which took
    // about 10 minutes on a USB stick (and locked the drive meanwhile).
    try { fs.ftruncateSync(fd, 4 * 1024 ** 3 + 1); fs.ftruncateSync(fd, 0); r = { write: true, big: true }; }
    // Sizing fails on FAT32; on a drive with under about 4 GB free it fails too, but that's a space problem, which
    // the free-space check reports.
    catch { r = { write: true, big: freeSpace(dir) < 4.3e9 }; }
    finally { fs.closeSync(fd); }
  } catch { r = { write: false, big: true }; }
  finally { try { fs.unlinkSync(probe); } catch {} }
  probeCache.set(dir, r);
  return r;
}
const bigFilesOk = (dir) => probeDir(dir).big;
const writable = (dir) => probeDir(dir).write;
// Whether a pack can go where the library is saved, checking the most basic problem first: a drive too small for it
// at all, then a FAT32 drive (which can't hold a file over 4 GB, though reformatting would fix that), then not enough
// free space right now. Also reports what would fit, so the dialog can suggest a smaller library.
function spaceCheck(packId) {
  const c = state.catalog?.[packId]; if (!c) return { ok: false, reason: 'catalog' };
  const dir = libDir(), total = process.env.E2K_FAKE_FREE ? Math.max(+process.env.E2K_FAKE_FREE, 8e9) : driveSize(dir);
  if (!writable(dir)) return { ok: false, noWrite: true, size: c.size };
  const free = freeSpace(dir), fat32 = !bigFilesOk(dir), old = state.current ? state.current.size || 0 : 0;
  const have = state.download?.pack === packId ? (state.download.done || 0) * (state.download.pieceLength || 0) : 0;
  // A little room to spare: 5% of the pack, between 200 MB and 1 GB.
  const spare = (n) => Math.min(1e9, Math.max(2e8, n * 0.05));
  const need = Math.max(0, c.size - have) + spare(c.size);
  const fits = packs().filter((p) => { const s = state.catalog?.[p.id]?.size; return s && s + spare(s) <= free + old && !(fat32 && s > 4 * 1024 ** 3); })
    .map((p) => p.id);
  const info = { need, free, total, fat32, size: c.size, fits };
  if (total && c.size + spare(c.size) > total) return { ok: false, tooSmall: true, ...info };
  if (fat32 && c.size > 4 * 1024 ** 3) return { ok: false, ...info };
  return { ok: free >= need, ...info, freeIfRemoved: free + old, canRemoveOld: !!state.current && free + old >= need };
}

async function startDownload(packId, { removeOld = false } = {}) {
  if (job || move || missing) return { error: 'busy' };
  const c = state.catalog?.[packId] || (await fetchCatalog())[packId];
  if (!c) return { error: 'This pack isn’t in Kiwix’s catalog right now.' };
  const sp = spaceCheck(packId);
  if (sp.noWrite) return { error: 'Encyclopedia 2000 can’t save files in this folder. Choose another with Change…' };
  if (sp.tooSmall) return { error: 'too-small', ...sp };
  if (sp.fat32 && c.size > 4 * 1024 ** 3) return { error: 'fat32', ...sp };
  if (!sp.ok && !(removeOld && sp.canRemoveOld)) return { error: 'space', ...sp };
  if (removeOld && !sp.ok) removeCurrent();
  if (!state.download || state.download.pack !== packId || state.download.file !== c.file) {
    state.download = { pack: packId, file: c.file, url: c.url, date: c.date, size: c.size, done: 0, status: 'downloading' };
  }
  state.download.status = 'downloading';
  state.download.resume = false;
  save(); broadcast();
  run().catch((e) => { if (state.download) { state.download.status = 'error'; state.download.error = e.message; } job = null; save(); broadcast(); });
  return { ok: true };
}

async function run() {
  const d = state.download, m = await meta4(d.url);
  d.size = m.size; d.pieceLength = m.pieceLength || 4 * 1024 * 1024;
  const nPieces = Math.ceil(m.size / d.pieceLength);
  ensureDir(libDir());
  const part = path.join(libDir(), d.file + '.part');
  if (!fs.existsSync(part)) { fs.writeFileSync(part, ''); d.done = 0; }
  const fd = fs.openSync(part, 'r+');
  const ac = new AbortController();
  job = { abort: () => ac.abort(), speed: 0, eta: 0, samples: [] };
  let mirror = 0, failures = 0;
  try {
    while (d.done < nPieces) {
      if (ac.signal.aborted) return;
      // Ask for up to 16 pieces at a time from the current mirror.
      const first = d.done, last = Math.min(nPieces, first + 16) - 1;
      const start = first * d.pieceLength, end = Math.min(m.size, (last + 1) * d.pieceLength) - 1;
      try {
        await fetchRange(m.urls[mirror], start, end, ac, (buf, pieceIdx) => {
          if (m.pieces.length) {
            const sha = crypto.createHash('sha1').update(buf).digest('hex');
            if (sha !== m.pieces[pieceIdx]) throw new Error(`piece ${pieceIdx} failed its check`);
          }
          fs.writeSync(fd, buf, 0, buf.length, pieceIdx * d.pieceLength);
          d.done = pieceIdx + 1;
          if (d.done % 8 === 0) save();
          progress(buf.length);
        }, first, d.pieceLength);
        failures = 0;
      } catch (e) {
        if (ac.signal.aborted) return;
        // Move to the next mirror; give up after every mirror has failed several times.
        mirror = (mirror + 1) % m.urls.length;
        if (++failures > m.urls.length * 3) throw new Error('The download kept failing. Check your connection and try again.');
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally { fs.closeSync(fd); save(); }
  await finish(part);
}

// Streams bytes start..end, handing back each complete piece (index from firstPiece) as it arrives.
async function fetchRange(url, start, end, ac, onPiece, firstPiece, pieceLength) {
  // A mirror that sends nothing for 30 seconds is dropped (only this request), so the next one can be tried.
  let stall;
  const local = new AbortController();
  const arm = () => { clearTimeout(stall); stall = setTimeout(() => local.abort(), 30000); };
  const onAbort = () => local.abort();
  ac.signal.addEventListener('abort', onAbort, { once: true });
  arm();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` }, signal: local.signal });
    if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
    let pending = [], have = 0, piece = firstPiece;
    for await (const chunk of res.body) {
      arm();
      pending.push(Buffer.from(chunk)); have += chunk.length;
      let size = Math.min(pieceLength, end + 1 - piece * pieceLength);
      while (have >= size && size > 0) {
        const all = Buffer.concat(pending), buf = all.subarray(0, size);
        onPiece(Buffer.from(buf), piece);
        const rest = all.subarray(size); pending = rest.length ? [rest] : []; have = rest.length;
        piece++; size = Math.min(pieceLength, end + 1 - piece * pieceLength);
      }
    }
  } finally { clearTimeout(stall); ac.signal.removeEventListener('abort', onAbort); }
}

let lastSent = 0;
function progress(bytes) {
  const now = Date.now();
  job.samples.push([now, bytes]);
  job.samples = job.samples.filter(([t]) => now - t < 8000);
  const span = Math.max(1, (now - job.samples[0][0]) / 1000);
  job.speed = job.samples.reduce((a, [, b]) => a + b, 0) / span;
  const left = Math.max(0, state.download.size - state.download.done * state.download.pieceLength);
  job.eta = job.speed > 0 ? Math.max(0, left / job.speed) : 0;
  if (now - lastSent > 400) { lastSent = now; broadcast(); }
}

async function finish(part) {
  const d = state.download, file = path.join(libDir(), d.file);
  fs.renameSync(part, file);
  const old = state.current && path.join(libDir(), state.current.file);
  if (!override) openFile(file);
  state.current = { pack: d.pack, file: d.file, date: d.date, size: d.size };
  state.download = null; job = null;
  if (old && old !== file) { try { fs.unlinkSync(old); } catch {} }
  save(); broadcast();
}

function pause() { if (job) { job.abort(); job = null; } if (state.download) { state.download.status = 'paused'; state.download.resume = false; } save(); broadcast(); }
// Quitting mid-download: pause it, and pick it up again automatically next time the app opens.
// Quitting mid-move stops it; the library stays where it was.
function pauseForQuit() { if (job) { job.abort(); job = null; } if (state.download) { state.download.status = 'paused'; state.download.resume = true; } cancelMove(); save(); }
const busy = () => !!(move || (job && state.download && state.download.status === 'downloading'));
function quitInfo() {
  if (move) { const p = packs().find((x) => x.id === state.current.pack); return { moving: true, label: p ? p.label : state.current.file, received: move.copied, size: move.size }; }
  const d = state.download, p = d && packs().find((x) => x.id === d.pack);
  return d && { label: p ? p.label : d.file, received: Math.min(d.size || 0, (d.done || 0) * (d.pieceLength || 0)), size: d.size };
}
// Starts an unfinished download again: one that was interrupted by quitting (or by the app closing unexpectedly).
function resumeInterrupted() {
  const d = state.download;
  if (!d || job || d.status === 'error' || (d.status === 'paused' && !d.resume)) return;
  d.status = 'downloading'; d.resume = false; save(); broadcast();
  run().catch((e) => { if (state.download) { state.download.status = 'error'; state.download.error = e.message; } job = null; save(); broadcast(); });
}
function cancel() {
  if (job) { job.abort(); job = null; }
  if (state.download) { try { fs.unlinkSync(path.join(libDir(), state.download.file + '.part')); } catch {} }
  state.download = null; save(); broadcast();
}
function removeCurrent() {
  if (!state.current || move) return;
  if (lib && !override) { try { lib.close(); } catch {} lib = null; }
  try { fs.unlinkSync(path.join(libDir(), state.current.file)); } catch {}
  // Forgetting a missing library: a new download goes to the app's own folder, not a drive that isn't there.
  if (missing) { found(); if (!fs.existsSync(libDir())) state.dir = ''; }
  state.current = null; save(); broadcast();
}

async function chooseDir(win) {
  // A download writes into the folder, so the folder stays put until it's done (the window says so).
  if (move || state.download) return publicState();
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the offline library', defaultPath: libDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return publicState();
  const dir = r.filePaths[0];
  if (path.resolve(dir) === path.resolve(libDir())) return publicState();
  // Somewhere files can't be created (the root of C:, for example): say so instead of choosing it.
  probeCache.delete(dir);
  if (!writable(dir)) return { ...publicState(), error: `Encyclopedia 2000 can’t save files in ${dir}. Choose a folder inside it, such as Documents.` };
  if (!state.current) { state.dir = storeDir(dir); save(); broadcast(); return publicState(); }
  // A missing library: the folder chosen should be where it is now.
  if (missing) {
    const file = path.join(dir, state.current.file);
    if (!fs.existsSync(file) || !openFile(file)) return { ...publicState(), error: `That folder doesn’t have your library (${state.current.file}). Choose the folder it’s in, or use Forget… to download it again.` };
    state.dir = storeDir(dir); save(); found(); broadcast();
    return publicState();
  }
  // Move the installed library along with the setting, so it keeps working. On the same drive that's an instant
  // rename; to another drive it's a copy, which runs in the background (see startMove).
  const from = path.join(libDir(), state.current.file), to = path.join(dir, state.current.file);
  let sameDrive = false;
  try { sameDrive = fs.statSync(from).dev === fs.statSync(dir).dev; } catch {}
  if (sameDrive) {
    if (lib && !override) { try { lib.close(); } catch {} lib = null; }
    try { fs.renameSync(from, to); } catch { if (!override) openFile(from); return { ...publicState(), error: 'The library couldn’t be moved there.' }; }
    state.dir = storeDir(dir); save();
    if (!override) openFile(to);
    broadcast();
    return publicState();
  }
  // The most basic problem first, as for downloads: a drive too small for the library at all (reformatting a FAT32
  // drive wouldn't help), then FAT32, then not enough free space right now.
  const total = driveSize(dir), gb = (n) => `${(n / 1e9).toFixed(1)} GB`;
  if (total && total < (state.current.size || 0) + 1e8) return { ...publicState(), error: `That drive is too small for your library (your library is ${gb(state.current.size)}; the drive holds ${gb(total)}).` };
  // An installed library over 4 GB can't go on a FAT32 drive; say so before copying anything.
  if ((state.current.size || 0) > 4 * 1024 ** 3 && !bigFilesOk(dir)) {
    return { ...publicState(), error: 'Your library is over 4 GB, and that drive can’t hold files that big (it’s formatted FAT32, common on USB sticks). Choose another drive, or reformat this one as exFAT.' };
  }
  if (freeSpace(dir) < (state.current.size || 0) + 1e8) return { ...publicState(), error: 'There isn’t enough free space on that drive for your library.' };
  startMove(from, to, dir);
  return publicState();
}

// Copies the library to another drive without holding up the app (a big library on a slow drive can take an hour).
// Articles keep coming from the old copy until the new one is complete. The copy goes to a ".moving" file, which
// becomes the library only at the end, so a failed or cancelled move leaves nothing half-done behind.
function startMove(from, to, dir) {
  const tmp = to + '.moving';
  const size = state.current.size || fs.statSync(from).size;
  const ac = new AbortController();
  move = { dir, size, copied: 0, speed: 0, eta: 0, samples: [], cancelled: false, abort: () => ac.abort() };
  state.moving = tmp; save();
  let lastSentMove = 0;
  const count = new Transform({
    transform(chunk, _enc, cb) {
      const now = Date.now();
      move.copied += chunk.length;
      move.samples.push([now, chunk.length]);
      move.samples = move.samples.filter(([t]) => now - t < 8000);
      move.speed = move.samples.reduce((a, [, b]) => a + b, 0) / Math.max(1, (now - move.samples[0][0]) / 1000);
      move.eta = move.speed > 0 ? Math.max(0, (move.size - move.copied) / move.speed) : 0;
      if (now - lastSentMove > 400) { lastSentMove = now; broadcast(); }
      cb(null, chunk);
    },
  });
  broadcast();
  pipeline(fs.createReadStream(from, { highWaterMark: 4 * 1024 * 1024 }), count, fs.createWriteStream(tmp), { signal: ac.signal }).then(() => {
    fs.renameSync(tmp, to);
    state.dir = storeDir(dir); state.moving = null; move = null; save();
    if (!override) openFile(to);   // closes the old copy, so it can be deleted
    try { fs.unlinkSync(from); } catch {}
    broadcast();
  }).catch(() => {
    const cancelled = move && move.cancelled;
    try { fs.unlinkSync(tmp); } catch {}
    state.moving = null; move = null; save();
    broadcast(cancelled ? {} : { moveError: 'The library couldn’t be moved there (the drive may have been unplugged or filled up). It’s still in its old folder.' });
  });
}
function cancelMove() {
  if (!move) return;
  move.cancelled = true; move.abort();
}

// The number of articles: the library's own count of pages (its title list also holds redirects).
function articleCount() {
  const m = /(?:^|;)text\/html=(\d+)/.exec(lib.meta('Counter') || '');
  return m ? +m[1] : lib.titleList().length;
}

// The open library's name and size (null if it can't be read).
function openInfo() {
  try { return lib ? { title: lib.meta('Title'), date: lib.meta('Date'), articles: articleCount() } : null; } catch { return null; }
}
function publicState() {
  const d = state.download;
  return {
    // Each pack's fit on the current drive (see spaceCheck), so the dialog can grey out the ones that can't go there.
    packs: packs().map(({ id, label, desc, recommended, covers }) => ({ id, label, desc, recommended, covers, ...(state.catalog?.[id] || {}),
      fit: state.catalog?.[id] && !(state.current && state.current.pack === id) ? spaceCheck(id) : null })),
    current: state.current, override: override ? path.basename(override) : '',
    open: openInfo(),
    missing: missing ? { where: libDir() } : null,
    move: move && { to: move.dir, copied: move.copied, size: move.size, speed: move.speed, eta: move.eta },
    download: d && { ...d, url: undefined, received: Math.min(d.size || 0, (d.done || 0) * (d.pieceLength || 0)), speed: job ? job.speed : 0, eta: job ? job.eta : 0 },
    dir: libDir(), free: freeSpace(libDir()), checked: state.checked,
    update: state.current && state.catalog?.[state.current.pack] && state.catalog[state.current.pack].file !== state.current.file ? state.catalog[state.current.pack] : null,
  };
}

function setup({ offline = () => false } = {}) {
  load();
  // A move that the app closed in the middle of: its unfinished copy is deleted (the library never left its folder).
  if (state.moving) { try { fs.unlinkSync(state.moving); } catch {} state.moving = null; save(); }
  override = process.env.E2K_ZIM || '';
  if (override) openFile(override);
  else if (state.current && !openFile(path.join(libDir(), state.current.file))) lost();
  watchPresence();
  // A download that was running when the app last closed (quit mid-download, or closed unexpectedly) carries on a few
  // seconds after startup; one the user paused stays paused.
  if (state.download && state.download.status === 'downloading') state.download.resume = true;
  if (state.download && state.download.resume) { state.download.status = 'paused'; setTimeout(resumeInterrupted, 4000); }
  protocol.handle('e2k-zim', (req) => {
    if (!lib) return new Response('No offline library', { status: 404 });
    const [ns, ...rest] = decodeURIComponent(new URL(req.url).pathname).slice(1).split('/');
    try {
      const e = lib.resolve(lib.find(ns, rest.join('/')));
      if (!e) return new Response('Not in the library', { status: 404 });
      return new Response(lib.content(e), { headers: { 'content-type': e.mime || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    } catch { return new Response('The offline library can’t be read', { status: 404 }); }   // its drive was disconnected (see lost)
  });
  ipcMain.handle('library:info', () => { try { return lib ? { title: lib.meta('Title'), date: lib.meta('Date'), language: lib.meta('Language'), articles: articleCount() } : null; } catch { return null; } });
  // A library that can't be read (its drive was disconnected) answers like no library at all; see lost().
  const orNone = (fn, none = null) => (...a) => { try { return fn(...a); } catch { return none; } };
  ipcMain.handle('library:find', (_e, title) => orNone(find)(title));
  ipcMain.handle('library:titles', (_e, q, limit, deep) => orNone(titles, [])(q, limit, deep));
  ipcMain.handle('library:random', () => orNone(random)());
  ipcMain.handle('library:daily', async (_e, key) => { try { return await daily(key); } catch { return null; } });
  ipcMain.handle('library:state', () => publicState());
  // Kiwix asks apps to go easy on its catalog (every Kiwix reader uses it), so the Offline Library window reuses what
  // it fetched in the last day instead of asking each time it opens. (Requests are compressed, as Kiwix asks.)
  ipcMain.handle('library:catalog', async () => { try { if (!state.catalog || Date.now() - (state.checked || 0) > DAY) await fetchCatalog(); return publicState(); } catch (e) { return { ...publicState(), error: 'Kiwix’s catalog couldn’t be reached. Check your connection.' }; } });
  ipcMain.handle('library:download', (_e, packId, opts) => startDownload(packId, opts));
  ipcMain.handle('library:space', (_e, packId) => spaceCheck(packId));
  ipcMain.handle('library:pause', () => { pause(); return publicState(); });
  ipcMain.handle('library:cancel', () => { cancel(); return publicState(); });
  ipcMain.handle('library:remove', () => { removeCurrent(); return publicState(); });
  ipcMain.handle('library:cancel-move', () => { cancelMove(); return publicState(); });
  ipcMain.handle('library:choose-dir', (e) => chooseDir(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('library:open-dir', () => shell.openPath(libDir()));
  // Check for new editions at most once a month, quietly: only with a library installed, and never in Offline mode
  // (people who don't use the offline library never contact Kiwix).
  if (state.current && !offline() && Date.now() - (state.checked || 0) > MONTH) setTimeout(() => { if (!offline()) fetchCatalog().then(broadcast, () => {}); }, 15000);
}

module.exports = { setup, busy, pauseForQuit, quitInfo };
