// Downloaded articles ("Download for Offline"): a copy of an article kept in the data folder, so it opens without the
// internet. Only what the user asks for is downloaded (favorites stay bookmarks). Each article is stored as Wikipedia
// sent it (its page, its summary, its list of pictures), with the picture addresses changed to the downloaded copies,
// so the article view shows it exactly like an article from Wikipedia. Served to the page at
// e2k-saved://a/<key>/<file> (the address is registered in main.js). On the portable, the data folder is next to the
// .exe, so downloads travel with it.
//   <data>/Downloaded/index.json            every downloaded article: { key, title, canonical, aliases, desc, thumb, size, at, pictures, textOnly }
//   <data>/Downloaded/<key>/summary.json    Wikipedia's summary (lead picture: the downloaded copy)
//   <data>/Downloaded/<key>/article.html    Wikipedia's page (pictures: the downloaded copies)
//   <data>/Downloaded/<key>/media.json      the article's pictures (videos and sounds come later)
//   <data>/Downloaded/<key>/files/<n>       the pictures; types.json says what each one is
// Downloading is polite to Wikipedia: a few requests at a time, and when Wikipedia answers "too many requests" (429)
// or is briefly unavailable (503), it waits as long as Wikipedia asks before trying again.
const { app, protocol, ipcMain, session, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REST = 'https://en.wikipedia.org/api/rest_v1/page/';
const dir = () => path.join(app.getPath('userData'), 'Downloaded');
const indexFile = () => path.join(dir(), 'index.json');
const keyOf = (canonical) => crypto.createHash('sha1').update(String(canonical)).digest('hex').slice(0, 16);
const norm = (t) => String(t || '').replace(/_/g, ' ').trim().toLowerCase();
const enc = (t) => encodeURIComponent(String(t).replace(/ /g, '_'));
const local = (key, file) => `e2k-saved://a/${key}/${file}`;
// Less free space than this on the drive, and nothing more is downloaded.
const MIN_FREE = 200 * 1024 * 1024;
// A picture bigger than this (nearly always an animation: Wikipedia keeps animated GIFs animated even as thumbnails,
// some over 6 MB) isn't downloaded; it still shows from Wikipedia when online, like a video would.
const MAX_PICTURE = 1.5 * 1024 * 1024;

let index = { articles: {} };
let offline = () => false;
const active = new Map();   // key or title → { title, done, total } while downloading

function load() {
  try { index = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { index = { articles: {} }; }
  if (!index || typeof index.articles !== 'object') index = { articles: {} };
}
function save() {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = indexFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(index));
  fs.renameSync(tmp, indexFile());
}
// A downloaded article by title: the title it was downloaded under, Wikipedia's own, or one that led to it.
function entryFor(title) {
  const n = norm(title);
  if (!n) return null;
  return Object.values(index.articles).find((a) => a.aliases.some((x) => norm(x) === n)) || null;
}
const publicEntry = (a) => (a ? { key: a.key, title: a.title, desc: a.desc, thumb: a.thumb, size: a.size, at: a.at, pictures: a.pictures, textOnly: !!a.textOnly } : null);
function tell() {
  const s = state();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('downloads:update', s);
}
const state = () => ({ count: Object.keys(index.articles).length, size: Object.values(index.articles).reduce((n, a) => n + (a.size || 0), 0),
  active: [...active.values()].map((x) => ({ ...x })) });

// ---------- fetching, politely ----------
const MAX = 3;
let running = 0;
const queue = [];
async function slot(fn) {
  while (running >= MAX) await new Promise((r) => queue.push(r));
  running++;
  try { return await fn(); } finally { running--; const next = queue.shift(); if (next) next(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, as = 'json') {
  for (let i = 0; ; i++) {
    if (offline()) throw Object.assign(new Error('Offline mode is on'), { offline: true });
    let r;
    try { r = await slot(() => session.defaultSession.fetch(url)); } catch (e) { if (i < 2) { await sleep(1500 * (i + 1)); continue; } throw e; }
    if ((r.status === 429 || r.status === 503) && i < 5) {
      const wait = Math.min(Number(r.headers.get('retry-after')) || 2 ** (i + 1), 60);
      await sleep(wait * 1000);
      continue;
    }
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    if (as === 'json') return r.json();
    if (as === 'text') return r.text();
    return { type: (r.headers.get('content-type') || 'application/octet-stream').split(';')[0], data: Buffer.from(await r.arrayBuffer()) };
  }
}

// ---------- downloading an article ----------
// Wikimedia's pictures: upload.wikimedia.org, and its thumbnails, which may come from thumb.wikimedia.org.
const isUpload = (u) => /^(https?:)?\/\/(upload|thumb)\.wikimedia\.org\//.test(u);
const abs = (u) => (u.startsWith('//') ? 'https:' + u : u).replace(/&amp;/g, '&');
async function freeSpace() {
  try { const s = await fs.promises.statfs(app.getPath('userData')); return s.bavail * s.bsize; } catch { return Infinity; }
}

// Downloads an article (with its pictures, or as text only) and replaces any earlier copy. Resolves to its entry.
async function download(title, { textOnly = false } = {}) {
  title = String(title || '').trim();
  if (!title) throw new Error('No article');
  if (offline()) throw Object.assign(new Error('Offline mode is on'), { offline: true });
  if (await freeSpace() < MIN_FREE) throw Object.assign(new Error('There isn’t enough free space on this drive'), { space: true });
  const job = { title, done: 0, total: 3 };
  active.set(title, job);
  tell();
  const tmp = path.join(dir(), `.part-${process.pid}-${Date.now()}`);
  try {
    const sum = await get(`${REST}summary/${enc(title)}?redirect=true`);
    const canonical = sum.titles?.canonical || title.replace(/ /g, '_');
    const name = sum.titles?.normalized || sum.title || title;
    const key = keyOf(canonical);
    job.title = name; job.done = 1; tell();
    const html = await get(`${REST}html/${enc(canonical)}?redirect=true`, 'text');
    job.done = 2; tell();
    const media = await get(`${REST}media-list/${enc(canonical)}?redirect=true`).catch(() => ({ items: [] }));
    job.done = 3; tell();

    // The pictures: each address once, numbered in the order met.
    const files = new Map();
    const fileFor = (u) => { const a = abs(u); if (!files.has(a)) files.set(a, String(files.size)); return local(key, 'files/' + files.get(a)); };
    let page = html;
    if (textOnly) {
      page = page.replace(/<img\b[^>]*>/gi, (tag) => (/\ssrc="(?:https?:)?\/\/(upload|thumb)\.wikimedia\.org\//i.test(tag) ? '' : tag));
    } else {
      page = page.replace(/<img\b[^>]*>/gi, (tag) => tag
        .replace(/\s(srcset|data-src)="[^"]*"/gi, '')
        .replace(/\ssrc="([^"]+)"/i, (m, u) => (isUpload(u) ? ` src="${fileFor(u)}"` : m)));
    }
    const lead = !textOnly && sum.thumbnail?.source && isUpload(sum.thumbnail.source) ? fileFor(sum.thumbnail.source) : '';
    const summary = { ...sum, downloaded: true };
    if (lead) {
      summary.thumbnail = { ...sum.thumbnail, source: lead };
      // The original can be huge: the downloaded thumbnail stands in for it (width 0: the app then shows it as is).
      summary.originalimage = { source: lead, width: 0, height: 0 };
    } else { delete summary.thumbnail; delete summary.originalimage; }
    const items = (media.items || []).filter((m) => m.type === 'image' && !textOnly).map((m) => {
      const first = (m.srcset || [])[0];
      if (!first || !isUpload(first.src)) return null;
      const src = fileFor(first.src);
      return { ...m, srcset: [{ src, scale: '1x' }], original: undefined };
    }).filter(Boolean);

    job.total = 3 + files.size; tell();
    fs.mkdirSync(path.join(tmp, 'files'), { recursive: true });
    const types = {};
    const tooBig = new Map();   // file number → its address on Wikipedia
    let pictures = 0;
    await Promise.all([...files].map(async ([url, n]) => {
      try {
        const r = await get(url, 'raw');
        if (!/^image\//.test(r.type)) throw new Error('not a picture');
        if (r.data.length > MAX_PICTURE) { tooBig.set(n, url); throw new Error('too big'); }
        fs.writeFileSync(path.join(tmp, 'files', n), r.data);
        types[n] = r.type;
        pictures++;
      } catch { /* a picture that can't be downloaded is left out; the article still opens */ }
      job.done++; tell();
    }));
    // The pictures left out because they're too big point back to Wikipedia.
    for (const [n, url] of tooBig) {
      const mine = local(key, 'files/' + n);
      page = page.split(`"${mine}"`).join(`"${url.replace(/&/g, '&amp;')}"`);
      for (const it of items) if (it.srcset[0].src === mine) it.srcset = [{ src: url, scale: '1x' }];
    }
    fs.writeFileSync(path.join(tmp, 'files', 'types.json'), JSON.stringify(types));
    fs.writeFileSync(path.join(tmp, 'summary.json'), JSON.stringify(summary));
    fs.writeFileSync(path.join(tmp, 'article.html'), page);
    fs.writeFileSync(path.join(tmp, 'media.json'), JSON.stringify({ ...media, items }));
    const size = sizeOf(tmp);
    // In place of any earlier copy.
    const final = path.join(dir(), key);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
    const before = index.articles[key];
    const aliases = [...new Set([...(before ? before.aliases : []), title, name, canonical.replace(/_/g, ' ')])];
    index.articles[key] = { key, title: name, canonical, aliases, desc: sum.description || '', thumb: lead, size, at: new Date().toISOString(), pictures, textOnly: !!textOnly };
    save();
    return publicEntry(index.articles[key]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    active.delete(title);
    tell();
  }
}
function sizeOf(p) {
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    n += e.isDirectory() ? sizeOf(q) : fs.statSync(q).size;
  }
  return n;
}
// Deletes a downloaded copy (only the copy: a favorite stays a favorite).
function remove(title) {
  const a = entryFor(title);
  if (!a) return false;
  fs.rmSync(path.join(dir(), a.key), { recursive: true, force: true });
  delete index.articles[a.key];
  save();
  tell();
  return true;
}

// ---------- serving them to the page ----------
const TYPES = { '.json': 'application/json', '.html': 'text/html; charset=utf-8' };
function serve(req) {
  const u = new URL(req.url);
  const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if (u.host !== 'a' || !/^[0-9a-f]{16}$/.test(parts[0] || '') || parts.some((p) => p === '..' || p.includes('\\'))) return new Response('Not found', { status: 404 });
  const file = path.join(dir(), ...parts);
  if (!file.startsWith(dir() + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const data = fs.readFileSync(file);
    let type = TYPES[path.extname(file)] || 'application/octet-stream';
    if (parts[1] === 'files') {
      try { type = JSON.parse(fs.readFileSync(path.join(dir(), parts[0], 'files', 'types.json'), 'utf8'))[parts[2]] || type; } catch {}
    }
    return new Response(data, { headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
  } catch { return new Response('Not downloaded', { status: 404 }); }
}

function setup(opts = {}) {
  if (opts.offline) offline = opts.offline;
  load();
  // Leftovers of downloads that were interrupted (the app closed in the middle).
  try { for (const f of fs.readdirSync(dir())) if (f.startsWith('.part-')) fs.rmSync(path.join(dir(), f), { recursive: true, force: true }); } catch {}
  protocol.handle('e2k-saved', serve);
  ipcMain.handle('downloads:find', (_e, title) => { const a = entryFor(title); return a ? { key: a.key, title: a.title } : null; });
  ipcMain.handle('downloads:get', (_e, title) => publicEntry(entryFor(title)));
  ipcMain.handle('downloads:list', () => Object.values(index.articles).map(publicEntry).sort((a, b) => (a.at < b.at ? 1 : -1)));
  ipcMain.handle('downloads:state', () => state());
  ipcMain.handle('downloads:download', async (_e, title, opts) => {
    try { return { ok: true, entry: await download(title, opts || {}) }; }
    catch (e) { return { ok: false, offline: !!e.offline, space: !!e.space, error: e.message }; }
  });
  ipcMain.handle('downloads:remove', (_e, title) => remove(title));
}

module.exports = { setup, download, remove, entryFor };
