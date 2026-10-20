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
const Zim = require('./zim-reader');

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'e2k-zim', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const CATALOG = 'https://opds.library.kiwix.org/catalog/v2/entries';
const UA = `Encyclopedia 2000/${app.getVersion()} (+https://encyclopedia2000.com)`;
// The packs offered, smallest content last within each size; `covers` lists packs whose articles it includes.
const PACKS = [
  { id: 'top_maxi', name: 'wikipedia_en_top', flavour: 'maxi', label: 'Essentials', recommended: true,
    desc: 'The best 50,000 Wikipedia articles, with pictures. The best place to start.', covers: ['top_nopic'] },
  { id: 'top_nopic', name: 'wikipedia_en_top', flavour: 'nopic', label: 'Essentials, text only', desc: 'The same 50,000 articles without pictures, for smaller drives.', covers: [] },
  { id: 'all_nopic', name: 'wikipedia_en_all', flavour: 'nopic', label: 'Everything, text only', desc: 'All of English Wikipedia, about 7 million articles, without pictures.', covers: ['top_nopic'] },
  { id: 'all_maxi', name: 'wikipedia_en_all', flavour: 'maxi', label: 'Everything', desc: 'All of English Wikipedia, about 7 million articles, with pictures. Needs a lot of space.',
    covers: ['top_maxi', 'top_nopic', 'all_nopic'] },
];
// E2K_LIBRARY_TEST=1 adds the tiny Ray Charles library (3 MB); E2K_LIBRARY_TEST=<catalog name> adds another, such as
// wikipedia_en_knots (18 MB).
const testName = () => (process.env.E2K_LIBRARY_TEST === '1' ? 'wikipedia_en_ray-charles' : process.env.E2K_LIBRARY_TEST);
const packs = () => (process.env.E2K_LIBRARY_TEST ? [...PACKS, { id: 'test', name: testName(), flavour: 'maxi', label: `Test: ${testName()}`,
  desc: 'A small library for testing downloads.', covers: [] }] : PACKS);
const MONTH = 30 * 24 * 3600 * 1000;

// ---------- state ----------
let lib = null;            // the open library (a Zim), or null
let override = '';         // E2K_ZIM, if set
let state = { dir: '', current: null, download: null, catalog: null, checked: 0 };
// state.current:  { pack, file, date, size }      the installed library
// state.download: { pack, file, url, date, size, pieces, done, status }   status: downloading | paused | error
const stateFile = () => path.join(app.getPath('userData'), 'library.json');
// A folder inside the app's data folder is saved relative to it, so a portable copy on a USB drive keeps finding its
// library when the drive gets a different letter.
const dataDir = () => app.getPath('userData');
const libDir = () => (state.dir ? path.resolve(dataDir(), state.dir) : path.join(dataDir(), 'Library'));
const storeDir = (dir) => { const rel = path.relative(dataDir(), dir); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : dir; };
function save() { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...state, catalog: undefined }, null, 2)); } catch {} }
function load() { try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) }; } catch {} }

function openFile(file) {
  previews.clear();
  if (lib) { try { lib.close(); } catch {} lib = null; }
  try { lib = new Zim(file); return true; } catch (e) { console.error('Offline library could not be opened:', e.message); return false; }
}
function broadcast() {
  const s = publicState();
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
// typed (shortest first), then articles reached only through a redirect.
function titles(q, limit = 8) {
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
    const box = /class="infobox[\s\S]*?<img[^>]+>/.exec(html) || /<figure[\s\S]*?<img[^>]+>/.exec(html);
    const img = box && /<img[^>]+>/.exec(box[0])[0], src = img && (/src="([^"]+)"/.exec(img) || [])[1];
    const w = img && +((/width="(\d+)"/.exec(img) || [])[1] || 100);
    if (src && w >= 40 && !/^(data:|https?:)/.test(src)) {
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(articlePath), src));
      thumb = 'e2k-zim://lib/C/' + p.split('/').map(encodeURIComponent).join('/');
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
function freeSpace(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return 0; }
}
// Room for the new pack (minus what's already downloaded), keeping the old one until the new one is done, plus 1 GB.
// Drives formatted FAT32 (common on USB sticks) can't hold a file over 4 GB. Find out by sizing a scratch file just
// past 4 GB (instant on other file systems, nothing is written) and deleting it.
function bigFilesOk(dir) {
  const probe = path.join(dir, '.e2k-size-check');
  try { fs.mkdirSync(dir, { recursive: true }); const fd = fs.openSync(probe, 'w'); try { fs.ftruncateSync(fd, 4 * 1024 ** 3 + 1); } finally { fs.closeSync(fd); } return true; }
  catch { return false; } finally { try { fs.unlinkSync(probe); } catch {} }
}
function spaceCheck(packId) {
  const c = state.catalog?.[packId]; if (!c) return { ok: false, reason: 'catalog' };
  if (c.size > 4 * 1024 ** 3 && !bigFilesOk(libDir())) return { ok: false, fat32: true, size: c.size };
  const have = state.download?.pack === packId ? (state.download.done || 0) * (state.download.pieceLength || 0) : 0;
  const need = Math.max(0, c.size - have) + 1e9, free = freeSpace(libDir());
  const old = state.current ? state.current.size || 0 : 0;
  return { ok: free >= need, need, free, freeIfRemoved: free + old, canRemoveOld: !!state.current && free + old >= need };
}

async function startDownload(packId, { removeOld = false } = {}) {
  if (job) return { error: 'busy' };
  const c = state.catalog?.[packId] || (await fetchCatalog())[packId];
  if (!c) return { error: 'This pack isn’t in Kiwix’s catalog right now.' };
  const sp = spaceCheck(packId);
  if (sp.fat32) return { error: 'fat32', ...sp };
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
  fs.mkdirSync(libDir(), { recursive: true });
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
function pauseForQuit() { if (job) { job.abort(); job = null; } if (state.download) { state.download.status = 'paused'; state.download.resume = true; } save(); }
const downloading = () => !!(job && state.download && state.download.status === 'downloading');
function quitInfo() {
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
  if (!state.current) return;
  if (lib && !override) { try { lib.close(); } catch {} lib = null; }
  try { fs.unlinkSync(path.join(libDir(), state.current.file)); } catch {}
  state.current = null; save(); broadcast();
}

async function chooseDir(win) {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the offline library', defaultPath: libDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return publicState();
  const dir = r.filePaths[0];
  if (path.resolve(dir) === path.resolve(libDir())) return publicState();
  // Move the installed library along with the setting, so it keeps working.
  if (state.current && !job) {
    const from = path.join(libDir(), state.current.file), to = path.join(dir, state.current.file);
    if (lib && !override) { try { lib.close(); } catch {} lib = null; }
    try { fs.renameSync(from, to); } catch { try { fs.copyFileSync(from, to); fs.unlinkSync(from); } catch (e) { if (!override) openFile(from); return { ...publicState(), error: 'The library couldn’t be moved there.' }; } }
    state.dir = storeDir(dir);
    if (!override) openFile(to);
  } else state.dir = storeDir(dir);
  save(); broadcast();
  return publicState();
}

function publicState() {
  const d = state.download;
  return {
    packs: packs().map(({ id, label, desc, recommended, covers }) => ({ id, label, desc, recommended, covers, ...(state.catalog?.[id] || {}) })),
    current: state.current, override: override ? path.basename(override) : '',
    open: lib ? { title: lib.meta('Title'), date: lib.meta('Date'), articles: lib.titleList().length } : null,
    download: d && { ...d, url: undefined, received: Math.min(d.size || 0, (d.done || 0) * (d.pieceLength || 0)), speed: job ? job.speed : 0, eta: job ? job.eta : 0 },
    dir: libDir(), free: freeSpace(libDir()), checked: state.checked,
    update: state.current && state.catalog?.[state.current.pack] && state.catalog[state.current.pack].file !== state.current.file ? state.catalog[state.current.pack] : null,
  };
}

function setup() {
  load();
  override = process.env.E2K_ZIM || '';
  if (override) openFile(override);
  else if (state.current) openFile(path.join(libDir(), state.current.file));
  // A download that was running when the app last closed (quit mid-download, or closed unexpectedly) carries on a few
  // seconds after startup; one the user paused stays paused.
  if (state.download && state.download.status === 'downloading') state.download.resume = true;
  if (state.download && state.download.resume) { state.download.status = 'paused'; setTimeout(resumeInterrupted, 4000); }
  protocol.handle('e2k-zim', (req) => {
    if (!lib) return new Response('No offline library', { status: 404 });
    const [ns, ...rest] = decodeURIComponent(new URL(req.url).pathname).slice(1).split('/');
    const e = lib.resolve(lib.find(ns, rest.join('/')));
    if (!e) return new Response('Not in the library', { status: 404 });
    return new Response(lib.content(e), { headers: { 'content-type': e.mime || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  ipcMain.handle('library:info', () => (lib ? { title: lib.meta('Title'), date: lib.meta('Date'), language: lib.meta('Language'), articles: lib.titleList().length } : null));
  ipcMain.handle('library:find', (_e, title) => find(title));
  ipcMain.handle('library:titles', (_e, q, limit) => titles(q, limit));
  ipcMain.handle('library:random', () => random());
  ipcMain.handle('library:state', () => publicState());
  ipcMain.handle('library:catalog', async () => { try { await fetchCatalog(); return publicState(); } catch (e) { return { ...publicState(), error: 'Kiwix’s catalog couldn’t be reached. Check your connection.' }; } });
  ipcMain.handle('library:download', (_e, packId, opts) => startDownload(packId, opts));
  ipcMain.handle('library:space', (_e, packId) => spaceCheck(packId));
  ipcMain.handle('library:pause', () => { pause(); return publicState(); });
  ipcMain.handle('library:cancel', () => { cancel(); return publicState(); });
  ipcMain.handle('library:remove', () => { removeCurrent(); return publicState(); });
  ipcMain.handle('library:choose-dir', (e) => chooseDir(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('library:open-dir', () => shell.openPath(libDir()));
  // Check for new editions at most once a month, quietly.
  if (Date.now() - (state.checked || 0) > MONTH) setTimeout(() => fetchCatalog().then(broadcast, () => {}), 15000);
}

module.exports = { setup, downloading, pauseForQuit, quitInfo };
