// Thin client for the public Wikipedia / Wikimedia REST APIs, and for the offline library (library.js in the main
// process). Articles, summaries, search, and random articles come from the library when one is installed and has the
// article: first if "Use the offline library first" is on or the computer is offline, otherwise when Wikipedia fails.
window.Wiki = (() => {
  const BASE = 'https://en.wikipedia.org';
  const COMMONS = 'https://commons.wikimedia.org';
  const enc = (title) => encodeURIComponent(String(title).replace(/ /g, '_'));
  const pad = (n) => String(n).padStart(2, '0');

  async function get(url, as = 'json') {
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return as === 'text' ? res.text() : res.json();
  }

  function info(files, prop, pre, extra) {
    return get(`${BASE}/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=${prop}`
      + `&${pre}prop=url|size|mime|timestamp|extmetadata${extra}&${pre}extmetadatafilter=Artist|LicenseShortName|DateTimeOriginal|ImageDescription&${pre}urlwidth=480`
      + `&titles=${encodeURIComponent(files.join('|'))}`)
      .then((r) => {
        const names = Object.fromEntries((r.query?.normalized || []).map((n) => [n.to, n.from]));
        return Object.fromEntries((r.query?.pages || []).map((p) => [names[p.title] || p.title, p[prop]?.[0] || null]));
      });
  }

  // ---------- the offline library ----------
  const LIB = 'e2k-zim://lib/C/';
  const lib = window.e2k && window.e2k.library;
  let libInfo;   // undefined until asked, then the library's details or null
  const library = async () => (libInfo !== undefined ? libInfo : (libInfo = lib ? await lib.info().catch(() => null) : null));
  const pref = (k, d) => { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const libraryFirst = () => pref('libraryFirst', false) || !navigator.onLine;
  const libUrl = (p) => LIB + p.split('/').map(encodeURIComponent).join('/');
  // A library installed, swapped, or removed: forget what's cached about the old one.
  if (lib && lib.onUpdate) lib.onUpdate(() => { libInfo = undefined; pages.clear(); });

  // Library pages, parsed once per article (the article and its summary are asked for together).
  const pages = new Map();
  function libPage(found) {
    if (!pages.has(found.path)) {
      pages.set(found.path, fetch(libUrl(found.path)).then((r) => { if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status }); return r.text(); })
        .then((t) => new DOMParser().parseFromString(t, 'text/html')));
      if (pages.size > 6) pages.delete(pages.keys().next().value);
    }
    return pages.get(found.path);
  }
  // The library's page is a whole Wikipedia page; the article view wants just the Parsoid body, with pictures and
  // links pointing where the app expects them.
  async function libHtml(found) {
    const doc = await libPage(found), out = doc.querySelector('.mw-parser-output').cloneNode(true), base = libUrl(found.path);
    out.querySelectorAll('img[src]').forEach((img) => { img.setAttribute('src', new URL(img.getAttribute('src'), base).href); img.removeAttribute('srcset'); });
    out.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href'); if (!/^(#|[a-z][a-z0-9+.-]*:|\/\/|\.\/)/i.test(h)) a.setAttribute('href', './' + h); });
    return `<!doctype html><html><head></head><body>${out.innerHTML}</body></html>`;
  }
  // A summary in the same shape as Wikipedia's: the title, the first real paragraph, and the lead picture.
  // (The library has no short descriptions.)
  async function libSummary(found) {
    const doc = await libPage(found), base = libUrl(found.path);
    const p = [...doc.querySelectorAll('.mw-parser-output > section > p, .mw-parser-output > p')].find((x) => x.textContent.trim().length > 40);
    const img = doc.querySelector('.infobox img, .mw-parser-output figure img');
    const extract = p ? p.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim() : '';
    return { titles: { normalized: found.title, canonical: found.path }, title: found.title, description: '', extract, fromLibrary: true,
      thumbnail: img ? { source: new URL(img.getAttribute('src'), base).href } : undefined };
  }
  // The article's pictures, in the shape of Wikipedia's media list (the library has no videos or sounds).
  async function libMedia(found) {
    const doc = await libPage(found), base = libUrl(found.path);
    return { items: [...doc.querySelectorAll('.mw-parser-output figure')].map((fig) => {
      const img = fig.querySelector('img');
      if (!img || (+img.getAttribute('width') || 100) < 60) return null;
      const src = new URL(img.getAttribute('src'), base).href;
      return { type: 'image', title: 'File:' + decodeURIComponent(src.split('/').pop()), showInGallery: true, srcset: [{ src }], caption: { text: fig.querySelector('figcaption')?.textContent || '' } };
    }).filter(Boolean) };
  }
  // Runs online() or the library version for an article, following the rules above.
  async function article(title, online, offline) {
    const found = (await library()) ? await lib.find(title).catch(() => null) : null;
    if (!found) return online();
    if (libraryFirst()) return offline(found);
    try { return await online(); } catch (e) { return offline(found); }
  }
  async function search(online, offline) {
    if (!(await library())) return online();
    if (libraryFirst()) return offline();
    try { return await online(); } catch (e) { return offline(); }
  }
  // Offline results get the article's first sentence as their snippet (escaped, since the results page reads it as HTML).
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const libTitles = async (q, n) => (await lib.titles(q, n)).map((t) => ({ title: t.title, description: '', excerpt: esc(t.extract || ''), thumbnail: t.thumb ? { url: t.thumb } : null }));

  return {
    library,
    featured: (date) =>
      get(`${BASE}/api/rest_v1/feed/featured/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    onThisDay: (date, type = 'all') =>
      get(`${BASE}/api/rest_v1/feed/onthisday/${type}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    summary: (title) => article(title, () => get(`${BASE}/api/rest_v1/page/summary/${enc(title)}?redirect=true`), libSummary),
    html: (title) => article(title, () => get(`${BASE}/api/rest_v1/page/html/${enc(title)}?redirect=true`, 'text'), libHtml),
    // Every picture, video, and sound in an article, in the order they appear.
    mediaList: (title) => article(title, () => get(`${BASE}/api/rest_v1/page/media-list/${enc(title)}?redirect=true`), libMedia),
    // Size, length, file address, a still picture, and the credit for up to 50 files ("File:…" titles).
    fileInfo: (files) => info(files, 'imageinfo', 'ii', ''),
    // The same, plus the versions Commons has converted each video or sound into (smaller sizes, WebM, MP3).
    videoInfo: (files) => info(files, 'videoinfo', 'vi', '|derivatives'),
    // The current text of pages on Wikimedia Commons, by title (Media of the Day, the featured sounds lists).
    commonsPages: (titles) => get(`${COMMONS}/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=revisions&rvprop=content&rvslots=main`
      + `&titles=${encodeURIComponent(titles.join('|'))}`)
      .then((r) => Object.fromEntries((r.query?.pages || []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content || '']))),
    random: () => search(() => get(`${BASE}/api/rest_v1/page/random/summary`), async () => { const r = await lib.random(); if (!r) throw new Error('The library is empty'); return libSummary(r); }),
    searchTitles: (q) => search(() => get(`${BASE}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`), async () => ({ pages: await libTitles(q, 8) })),
    // Offline, results are titles that start with what was typed (the library's word search isn't readable here yet).
    searchPages: (q) => search(() => get(`${BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=20`), async () => ({ pages: await libTitles(q, 20) })),
    // Wikipedia's spelling suggestion for a search ("napolean" -> "napoleon"), or '' if it has none.
    spelling: (q) => (libraryFirst() ? Promise.resolve('') : get(`${BASE}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srinfo=suggestion&srprop=&srlimit=1&format=json&formatversion=2&origin=*`)
      .then((r) => r.query?.searchinfo?.suggestion || '', () => '')),
    pageUrl: (title) => `${BASE}/wiki/${enc(title)}`,
  };
})();
