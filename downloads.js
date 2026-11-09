// Downloaded articles ("Download for Offline"): a copy of an article kept in the data folder, so it opens without the
// internet. Only what the user asks for is downloaded (favorites stay bookmarks). Each article is stored as Wikipedia
// sent it (its page, its summary, its list of pictures), with the picture addresses changed to the downloaded copies,
// so the article view shows it exactly like an article from Wikipedia. Served to the page at
// e2k-saved://a/<key>/<file> (the address is registered in main.js). On the portable, the data folder is next to the
// .exe, so downloads travel with it.
//   <data>/Downloaded/index.json            every downloaded article: { key, title, canonical, aliases, desc, thumb, size, at, pictures, textOnly }
//   <data>/Downloaded/<key>/summary.json    Wikipedia's summary (lead picture: the downloaded copy)
//   <data>/Downloaded/<key>/article.html    Wikipedia's page (pictures: the downloaded copies)
//   <data>/Downloaded/<key>/media.json      the article's pictures and sounds; each downloaded sound carries its file
//                                           details from Commons (info), so it plays without asking Commons
//   <data>/Downloaded/<key>/files/<n>       the pictures and sounds; types.json says what each one is
// Sounds are downloaded as the MP3 Commons makes of each one. Videos only when asked for ("with its videos too"), as
// one WebM each up to 480p; otherwise only their still pictures. Recordings of the whole article read aloud (Spoken
// Wikipedia) aren't downloaded. What isn't downloaded still plays from Wikimedia Commons when online.
// Downloading is polite to Wikipedia: a few requests at a time, and when Wikipedia answers "too many requests" (429)
// or is briefly unavailable (503), it waits as long as Wikipedia asks before trying again.
const { app, protocol, ipcMain, session, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

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
// A sound bigger than this (over about 20 minutes) isn't downloaded either; it still plays from Commons when online.
const MAX_SOUND = 20 * 1024 * 1024;
// Videos are downloaded only when asked for; one bigger than this (about an hour at 480p) isn't.
const MAX_VIDEO = 400 * 1024 * 1024;
const API = 'https://en.wikipedia.org/w/api.php';

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
const publicEntry = (a) => (a ? { key: a.key, title: a.title, desc: a.desc, thumb: a.thumb, size: a.size, at: a.at, pictures: a.pictures, sounds: a.sounds || 0, videos: a.videos || 0, videoSize: a.videoSize || 0, withVideos: !!a.withVideos, textOnly: !!a.textOnly } : null);
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
// as: 'json', 'text', 'raw' ({ type, data }), 'head' (the size only), or { file, accept, max }: written straight to
// that file (for videos), resolving to { type, size }.
async function get(url, as = 'json') {
  for (let i = 0; ; i++) {
    if (offline()) throw Object.assign(new Error('Offline mode is on'), { offline: true });
    let r;
    try {
      if (typeof as === 'object') {
        // A big file holds its turn until it's on the disk.
        return await slot(async () => {
          const res = await session.defaultSession.fetch(url);
          if (res.status === 429 || res.status === 503 || !res.ok) return Promise.reject(Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, retry: Number(res.headers.get('retry-after')) || 0 }));
          const type = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0];
          const len = Number(res.headers.get('content-length')) || 0;
          if (as.accept && !as.accept.test(type)) { res.body?.cancel(); throw new Error('not the right kind of file'); }
          if (as.max && len > as.max) { res.body?.cancel(); throw Object.assign(new Error('too big'), { big: true }); }
          if (await freeSpace() < MIN_FREE + len) { res.body?.cancel(); throw Object.assign(new Error('not enough free space'), { big: true }); }
          await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(as.file));
          return { type, size: fs.statSync(as.file).size };
        });
      }
      r = await slot(() => session.defaultSession.fetch(url, as === 'head' ? { method: 'HEAD' } : undefined));
    } catch (e) {
      if ((e.status === 429 || e.status === 503) && i < 5) { await sleep(Math.min(e.retry || 2 ** (i + 1), 60) * 1000); continue; }
      if (e.status || e.big || e.message === 'not the right kind of file') throw e;
      if (i < 2) { await sleep(1500 * (i + 1)); continue; }
      throw e;
    }
    if ((r.status === 429 || r.status === 503) && i < 5) {
      const wait = Math.min(Number(r.headers.get('retry-after')) || 2 ** (i + 1), 60);
      await sleep(wait * 1000);
      continue;
    }
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    if (as === 'head') return Number(r.headers.get('content-length')) || 0;
    if (as === 'json') return r.json();
    if (as === 'text') return r.text();
    return { type: (r.headers.get('content-type') || 'application/octet-stream').split(';')[0], data: Buffer.from(await r.arrayBuffer()) };
  }
}

// ---------- downloading an article ----------
// Wikimedia's pictures: upload.wikimedia.org, and its thumbnails, which may come from thumb.wikimedia.org.
const isUpload = (u) => /^(https?:)?\/\/(upload|thumb)\.wikimedia\.org\//.test(u);
const abs = (u) => (u.startsWith('//') ? 'https:' + u : u).replace(/&amp;/g, '&');
// A file's title as the media list and the page both name it ("File:Moonlight_1st.ogg", "./File:Moonlight%201st.ogg").
const fileKey = (t) => { let s = String(t || '').replace(/^\.\//, ''); try { s = decodeURIComponent(s); } catch {} return s.replace(/_/g, ' ').replace(/^(File|Image):/i, '').trim(); };
// Commons' details for sounds and videos (address, type, length, credit, a still picture), the same the app asks for
// when it plays one online.
async function commonsInfo(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const r = await get(`${API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|size|mime|timestamp|extmetadata`
      + `&iiextmetadatafilter=Artist|LicenseShortName|DateTimeOriginal|ImageDescription&iiurlwidth=480&titles=${encodeURIComponent(batch.join('|'))}`).catch(() => null);
    if (!r) continue;
    const names = Object.fromEntries((r.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const p of r.query?.pages || []) if (p.imageinfo?.[0]) out[names[p.title] || p.title] = p.imageinfo[0];
  }
  return out;
}
async function freeSpace() {
  try { const s = await fs.promises.statfs(app.getPath('userData')); return s.bavail * s.bsize; } catch { return Infinity; }
}

// The version of a video to download: the largest WebM up to 480p (the smallest WebM if none is), which plays well on
// older computers and keeps a few minutes of video to tens of megabytes. Sources from the media list ({ url, mime,
// height }) or the page's <source> tags ({ src, type, data-height }).
const VIDEO_P = 480;
function videoPick(sources) {
  const webm = (sources || []).map((s) => {
    const url = s.url || s.src || '';
    return { url, h: Number(/\.(\d+)p\.[\w.]*webm$/.exec(url)?.[1] || s.height) || 0, webm: /webm/.test(s.mime || s.type || '') };
  }).filter((s) => s.webm && isUpload(s.url)).sort((a, b) => b.h - a.h);
  return webm.find((s) => s.h && s.h <= VIDEO_P) || webm[webm.length - 1] || null;
}
const sourcesIn = (inner) => [...inner.matchAll(/<source\b[^>]*>/gi)].map(([s]) => ({
  src: /\ssrc="([^"]+)"/i.exec(s)?.[1] || '', type: (/\stype="([^"]*)"/i.exec(s) || /\stype='([^']*)'/i.exec(s))?.[1] || '', height: /\sdata-height="(\d+)"/i.exec(s)?.[1] || '' }));

// An article's videos and about how much downloading them adds (asked when the download menu opens). Kept a while.
const videoSizes = new Map();
async function videos(title) {
  const k = norm(title), hit = videoSizes.get(k);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
  const media = await get(`${REST}media-list/${enc(title)}?redirect=true`);
  const picks = (media.items || []).filter((m) => m.type === 'video').map((m) => videoPick(m.sources)).filter(Boolean);
  const sizes = await Promise.all(picks.map((p) => get(abs(p.url), 'head').catch(() => 0)));
  const v = { count: picks.length, size: sizes.reduce((a, b) => a + b, 0) };
  videoSizes.set(k, { at: Date.now(), v });
  return v;
}

// Downloads an article (with its pictures and sounds; with its videos too if asked; or as text only) and replaces any
// earlier copy. Resolves to its entry.
async function download(title, { textOnly = false, videos: withVideos = false } = {}) {
  title = String(title || '').trim();
  if (!title) throw new Error('No article');
  if (offline()) throw Object.assign(new Error('Offline mode is on'), { offline: true });
  if (await freeSpace() < MIN_FREE) throw Object.assign(new Error('There isn’t enough free space on this drive'), { space: true });
  if (textOnly) withVideos = false;
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

    // The pictures, sounds, and videos: each address once, numbered in the order met, with what kind it is. (A sound
    // may have a second address to try: the original file, if Commons has no MP3 of it.)
    const files = new Map(), kind = new Map(), fallback = new Map();
    const fileFor = (u, k = 'picture') => {
      const a = abs(u);
      if (!files.has(a)) files.set(a, String(files.size));
      if (!kind.has(files.get(a))) kind.set(files.get(a), k);
      return local(key, 'files/' + files.get(a));
    };
    let page = html;
    if (textOnly) {
      page = page.replace(/<img\b[^>]*>/gi, (tag) => (/\ssrc="(?:https?:)?\/\/(upload|thumb)\.wikimedia\.org\//i.test(tag) ? '' : tag));
    } else {
      page = page.replace(/<img\b[^>]*>/gi, (tag) => tag
        .replace(/\s(srcset|data-src)="[^"]*"/gi, '')
        .replace(/\ssrc="([^"]+)"/i, (m, u) => (isUpload(u) ? ` src="${fileFor(u)}"` : m)));
    }

    // The sounds: the media list's, except recordings of the whole article read aloud.
    const items0 = media.items || [];
    const spoken = new Set(items0.filter((m) => m.type === 'audio' && m.audio_type === 'spoken').map((m) => fileKey(m.title)));
    const soundAt = new Map(), videoAt = new Map();   // file title → its downloaded copy
    if (!textOnly) {
      // The sound players in the text: one source each, the MP3 (or Ogg) Wikipedia offers.
      page = page.replace(/<audio\b([^>]*)>([\s\S]*?)<\/audio>/gi, (whole, attrs, inner) => {
        const file = fileKey(/\sresource="([^"]*)"/i.exec(attrs)?.[1] || '');
        if (!file || spoken.has(file)) return whole;
        const sources = sourcesIn(inner);
        const pick = sources.find((s) => isUpload(s.src) && /mpeg|ogg|opus/.test(s.type)) || sources.find((s) => isUpload(s.src));
        if (!pick) return whole;
        const mine = soundAt.get(file) || fileFor(pick.src, 'sound');
        soundAt.set(file, mine);
        return `<audio${attrs}><source src="${mine}" type="${pick.type}"/></audio>`;
      });
      // The pronunciation buttons (🔊 by a name): the recording's address is in the button's settings.
      page = page.replace(/data-ooui='([^']*PhonosButton[^']*)'/g, (whole) => whole.replace(/"href":"([^"]+)"/, (m, href) => {
        const u = href.replace(/\\\//g, '/');
        return isUpload(u) ? `"href":"${fileFor(u, 'sound').replace(/\//g, '\\/')}"` : m;
      }));
      // The videos in the text: their still pictures always; the video itself (one WebM) only when asked for.
      page = page.replace(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi, (whole, attrs, inner) => {
        const a = attrs.replace(/\sposter="([^"]+)"/i, (m, u) => (isUpload(u) ? ` poster="${fileFor(u)}"` : m));
        const file = fileKey(/\sresource="([^"]*)"/i.exec(attrs)?.[1] || '');
        const pick = withVideos && file ? videoPick(sourcesIn(inner)) : null;
        if (!pick) return `<video${a}>${inner}</video>`;
        const mine = videoAt.get(file) || fileFor(pick.url, 'video');
        videoAt.set(file, mine);
        return `<video${a}><source src="${mine}" type="video/webm" data-height="${pick.h}"/></video>`;
      });
    }
    const sounds = textOnly ? [] : items0.filter((m) => m.type === 'audio' && !spoken.has(fileKey(m.title)));
    const vids = withVideos ? items0.filter((m) => m.type === 'video' && videoPick(m.sources)) : [];
    const info = sounds.length || vids.length ? await commonsInfo([...sounds, ...vids].map((m) => m.title)) : {};
    for (const m of sounds) {
      const ii = info[m.title];
      if (!ii?.url) continue;
      const original = abs(ii.url);
      const mp3 = /^audio\/mpeg$/.test(ii.mime) ? original : original.replace(/\/commons\/(\w\/\w\w)\/([^/]+)$/, '/commons/transcoded/$1/$2/$2.mp3');
      if (!soundAt.has(fileKey(m.title))) soundAt.set(fileKey(m.title), fileFor(mp3, 'sound'));
      const n = soundAt.get(fileKey(m.title)).split('/').pop();
      if (mp3 !== original && !/midi/.test(ii.mime)) fallback.set(n, original);
    }
    for (const m of vids) if (!videoAt.has(fileKey(m.title))) videoAt.set(fileKey(m.title), fileFor(videoPick(m.sources).url, 'video'));
    const lead = !textOnly && sum.thumbnail?.source && isUpload(sum.thumbnail.source) ? fileFor(sum.thumbnail.source) : '';
    const summary = { ...sum, downloaded: true };
    if (lead) {
      summary.thumbnail = { ...sum.thumbnail, source: lead };
      // The original can be huge: the downloaded thumbnail stands in for it (width 0: the app then shows it as is).
      summary.originalimage = { source: lead, width: 0, height: 0 };
    } else { delete summary.thumbnail; delete summary.originalimage; }
    // The media list: pictures, sounds, and (when asked for) videos point to their downloaded copies, each sound and
    // video with its details from Commons (info); the rest stay as they are, to play from Commons when online.
    const originals = new Map();   // a video's item → the item as Wikipedia sent it, if the video can't be downloaded
    const items = items0.map((m) => {
      if (m.type === 'image') {
        const first = (m.srcset || [])[0];
        if (textOnly || !first || !isUpload(first.src)) return null;
        return { ...m, srcset: [{ src: fileFor(first.src), scale: '1x' }], original: undefined };
      }
      const ii = info[m.title];
      if (m.type === 'audio' && ii && soundAt.has(fileKey(m.title))) return { ...m, info: { ...ii, url: soundAt.get(fileKey(m.title)) } };
      if (m.type === 'video' && ii && videoAt.has(fileKey(m.title))) {
        const mine = videoAt.get(fileKey(m.title)), h = videoPick(m.sources).h;
        const it = { ...m, sources: [{ url: mine, mime: 'video/webm', height: h }], info: { ...ii, url: mine, thumburl: ii.thumburl && isUpload(ii.thumburl) ? fileFor(ii.thumburl) : '' } };
        originals.set(it, m);
        return it;
      }
      return m;
    }).filter(Boolean);

    job.total = 3 + files.size; tell();
    fs.mkdirSync(path.join(tmp, 'files'), { recursive: true });
    const types = {};
    const missed = new Map();   // file number → its address on Wikipedia, for those that weren't downloaded
    const count = { picture: 0, sound: 0, video: 0 };
    let videoSize = 0;
    const ACCEPT = { picture: /^image\//, sound: /^(audio\/|application\/ogg)/, video: /^(video\/|application\/ogg)/ };
    const LIMIT = { picture: MAX_PICTURE, sound: MAX_SOUND, video: MAX_VIDEO };
    await Promise.all([...files].map(async ([url, n]) => {
      const k = kind.get(n), file = path.join(tmp, 'files', n);
      const fetchOne = async (u) => {
        // Videos go straight to the disk (they can be big); the rest are small enough to check first.
        if (k === 'video') return get(u, { file, accept: ACCEPT.video, max: LIMIT.video });
        const r = await get(u, 'raw');
        if (!ACCEPT[k].test(r.type)) throw new Error('not the right kind of file');
        if (r.data.length > LIMIT[k]) throw Object.assign(new Error('too big'), { big: true });
        fs.writeFileSync(file, r.data);
        return { type: r.type, size: r.data.length };
      };
      try {
        let r;
        try { r = await fetchOne(url); } catch (e) { if (e.big || !fallback.has(n)) throw e; r = await fetchOne(fallback.get(n)); }
        types[n] = r.type;
        count[k]++;
        if (k === 'video') videoSize += r.size;
      } catch { fs.rmSync(file, { force: true }); missed.set(n, fallback.get(n) || url); /* left out; the article still opens */ }
      job.done++; tell();
    }));
    // What wasn't downloaded (too big, or Wikipedia didn't send it) points back to Wikipedia, to show or play online.
    for (const [n, url] of missed) {
      const mine = local(key, 'files/' + n);
      page = page.split(`"${mine}"`).join(`"${url.replace(/&/g, '&amp;')}"`).split(`"${mine.replace(/\//g, '\\/')}"`).join(`"${url.replace(/\//g, '\\/')}"`);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.srcset?.[0]?.src === mine) it.srcset = [{ src: url, scale: '1x' }];
        if (it.info?.url === mine) { if (originals.has(it)) items[i] = originals.get(it); else delete it.info; }
        else if (it.info?.thumburl === mine) it.info.thumburl = url;
      }
    }
    // Each downloaded sound's type is the one Commons sent (an MP3, usually, not the original's).
    for (const it of items) if (it.info && it.type === 'audio') it.info.mime = types[it.info.url.split('/').pop()] || it.info.mime;
    page = page.replace(/<source src="(e2k-saved:\/\/a\/[0-9a-f]+\/files\/(\d+))" type="[^"]*"\/>/g, (m, mine, n) => (types[n] ? `<source src="${mine}" type="${types[n]}"/>` : m));
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
    index.articles[key] = { key, title: name, canonical, aliases, desc: sum.description || '', thumb: lead, size, at: new Date().toISOString(),
      pictures: count.picture, sounds: count.sound, videos: count.video, videoSize, withVideos: !!withVideos, textOnly: !!textOnly };
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
    const size = fs.statSync(file).size;
    let type = TYPES[path.extname(file)] || 'application/octet-stream';
    if (parts[1] === 'files') {
      try { type = JSON.parse(fs.readFileSync(path.join(dir(), parts[0], 'files', 'types.json'), 'utf8'))[parts[2]] || type; } catch {}
    }
    const headers = { 'content-type': type, 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' };
    // Videos and sounds are read a part at a time (to start playing, and to jump ahead), straight from the disk.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    if (range && size) {
      let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206,
        headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
    }
    if (size > 8 * 1024 * 1024) return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { ...headers, 'content-length': String(size) } });
    return new Response(fs.readFileSync(file), { headers });
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
  ipcMain.handle('downloads:videos', (_e, title) => videos(title).catch(() => null));
  ipcMain.handle('downloads:free', async () => { const n = await freeSpace(); return Number.isFinite(n) ? n : null; });
}

module.exports = { setup, download, remove, entryFor };
