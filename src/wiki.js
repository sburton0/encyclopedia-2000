// Thin client for the public Wikipedia / Wikimedia REST APIs, and for the offline library (library.js in the main
// process). Articles, summaries, search, and random articles come from the library when one is installed and has the
// article: first if "Use the offline library first" is on or the computer is offline, otherwise when Wikipedia fails.
window.Wiki = (() => {
  const BASE = 'https://en.wikipedia.org';
  const COMMONS = 'https://commons.wikimedia.org';
  const enc = (title) => encodeURIComponent(String(title).replace(/ /g, '_'));
  const pad = (n) => String(n).padStart(2, '0');

  // Whether the internet can be reached. Windows keeps reporting "online" after Wi-Fi or the cable goes while a virtual
  // network adapter (WSL, Hyper-V, a VPN) is still up, so a request that can't reach Wikipedia at all also counts as no
  // connection, until a check every 15 seconds gets through. ('e2k-connection' fires on window when it changes.)
  let down = false, probe = null;
  const connected = () => navigator.onLine && !down;
  function setDown(v) {
    if (down === v) return;
    down = v;
    if (v && !probe) {
      probe = setInterval(() => {
        if (offlineMode()) return;   // Offline mode sends nothing; going online checks again on the next request
        fetch(`${BASE}/w/api.php?action=query&format=json&origin=*`, { cache: 'no-store' }).then(() => setDown(false), () => {});
      }, 15000);
    }
    if (!v && probe) { clearInterval(probe); probe = null; }
    dispatchEvent(new Event('e2k-connection'));
  }
  addEventListener('online', () => setDown(false));

  async function get(url, as = 'json') {
    let res;
    try { res = await fetch(url); } catch (e) { if (!offlineMode()) setDown(true); throw e; }
    setDown(false);
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
  // Offline mode (the status bar's connection menu): only the library, and nothing from the internet.
  const offlineMode = () => !!(window.e2k && window.e2k.net && window.e2k.net.offline());
  const libraryFirst = () => offlineMode() || pref('libraryFirst', false) || !connected();
  const libUrl = (p) => LIB + p.split('/').map(encodeURIComponent).join('/');
  // A library installed, swapped, or removed: forget what's cached about the old one.
  if (lib && lib.onUpdate) lib.onUpdate(() => { libInfo = undefined; pages.clear(); });

  // Sharp pictures: with "library first" on and the computer online, library articles can swap their pictures for
  // Wikipedia's full-size versions (the library keeps small copies). Off when the user picks the library's pictures
  // only, and in Offline mode.
  const sharp = () => pref('libraryFirst', false) && pref('libraryPictures', 'online') === 'online' && connected() && !offlineMode();
  // The same picture on Wikipedia, by its file name, at a standard thumbnail width. The library names a picture after
  // its file (an SVG drawing as "Name.svg.png", a comma as "%2C"), and Special:FilePath finds it on Commons or, for
  // pictures like team logos, on English Wikipedia.
  const WIDTHS = [250, 330, 500, 960, 1280];
  function sharpUrl(libSrc, px) {
    let name = libSrc.split('/').pop();
    try { name = decodeURIComponent(decodeURIComponent(name)); } catch { try { name = decodeURIComponent(name); } catch {} }
    name = name.replace(/\.svg\.png$/i, '.svg');
    const w = WIDTHS.find((x) => x >= px) || WIDTHS[WIDTHS.length - 1];
    return `${BASE}/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;
  }

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
  // Text-only libraries keep each picture's place with a blank drawing the same size (with the picture's name in it,
  // when it has one). Those leave an empty box, so they go, with the figure, gallery entry, or infobox row around them.
  const placeholder = (img) => { const s = img.getAttribute('src') || ''; return s.startsWith('data:image/svg+xml') && s.includes('fill%3D%22transparent%22'); };
  function dropPlaceholders(root) {
    root.querySelectorAll('img').forEach((img) => {
      if (!root.contains(img) || !placeholder(img)) return;
      const box = img.closest('figure, li.gallerybox, td.infobox-image, .thumb');
      if (box && box.matches('td.infobox-image')) (box.closest('tr') || box).remove();
      else (box || img.closest('[typeof^="mw:File"]') || img).remove();
    });
    root.querySelectorAll('ul.gallery').forEach((g) => { if (!g.querySelector('li')) g.remove(); });
  }
  // The library's page is a whole Wikipedia page; the article view wants just the Parsoid body, with pictures and
  // links pointing where the app expects them.
  async function libHtml(found) {
    const doc = await libPage(found), out = doc.querySelector('.mw-parser-output').cloneNode(true), base = libUrl(found.path);
    const hi = sharp();
    dropPlaceholders(out);
    out.querySelectorAll('img[src]').forEach((img) => {
      const src = new URL(img.getAttribute('src'), base).href;
      img.setAttribute('src', src); img.removeAttribute('srcset');
      if (hi && +img.getAttribute('width') >= 60) img.dataset.sharp = sharpUrl(src, 2 * +img.getAttribute('width'));
    });
    out.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href'); if (!/^(#|[a-z][a-z0-9+.-]*:|\/\/|\.\/)/i.test(h)) a.setAttribute('href', './' + h); });
    return `<!doctype html><html><head></head><body>${out.innerHTML}</body></html>`;
  }
  // A summary in the same shape as Wikipedia's: the title, the first real paragraph, and the lead picture.
  // (The library has no short descriptions.)
  async function libSummary(found) {
    const doc = await libPage(found), base = libUrl(found.path);
    const p = [...doc.querySelectorAll('.mw-parser-output > section > p, .mw-parser-output > p')].find((x) => x.textContent.trim().length > 40);
    // The lead picture: the first real picture shown at a decent size, in the infobox if there is one. Infoboxes also
    // hold small icons (a "current season" baseball, rating stars) and signatures, which this skips.
    const big = (i) => !placeholder(i) && +i.getAttribute('width') >= 60 && +i.getAttribute('height') >= 60 && i.closest('[typeof^="mw:File"]') && !i.closest('.infobox-signature');
    const img = [...doc.querySelectorAll('.infobox img')].find(big) || [...doc.querySelectorAll('.mw-parser-output img')].find(big);
    // Without the styles some paragraphs carry inline (pronunciation labels) and footnote marks ("[1]", "[a]").
    const para = p && p.cloneNode(true);
    if (para) para.querySelectorAll('style, link, sup.reference, sup.mw-ref, .mw-ref').forEach((x) => x.remove());
    const extract = para ? para.textContent.replace(/\[(\d+|[a-z])\]/g, '').replace(/\s+/g, ' ').trim() : '';
    return { titles: { normalized: found.title, canonical: found.path }, title: found.title, description: '', extract, fromLibrary: true,
      thumbnail: img ? { source: new URL(img.getAttribute('src'), base).href, sharp: sharp() ? sharpUrl(img.getAttribute('src'), 500) : '' } : undefined };
  }
  // The article's pictures, in the shape of Wikipedia's media list (the library has no videos or sounds).
  async function libMedia(found) {
    const doc = await libPage(found), base = libUrl(found.path);
    return { items: [...doc.querySelectorAll('.mw-parser-output figure')].map((fig) => {
      const img = fig.querySelector('img');
      if (!img || placeholder(img) || (+img.getAttribute('width') || 100) < 60) return null;
      const src = new URL(img.getAttribute('src'), base).href;
      // The viewer shows the last size listed, so with sharp pictures it gets Wikipedia's large one.
      const sizes = sharp() ? [{ src }, { src: sharpUrl(src, 1280) }] : [{ src }];
      return { type: 'image', title: 'File:' + decodeURIComponent(src.split('/').pop()), showInGallery: true, srcset: sizes, caption: { text: fig.querySelector('figcaption')?.textContent || '' } };
    }).filter(Boolean) };
  }
  // Runs online() or the library version for an article, following the rules above.
  async function article(title, online, offline) {
    const found = (await library()) ? await lib.find(title).catch(() => null) : null;
    if (!found && offlineMode()) throw Object.assign(new Error('Not in the offline library'), { notInLibrary: true });
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
  const libTitles = async (q, n, deep) => (await lib.titles(q, n, deep)).map((t) => ({ title: t.title, description: '', excerpt: esc(t.extract || ''), thumbnail: t.thumb ? { url: t.thumb } : null }));

  // ---------- Home and the almanac offline ----------
  // Offline (or in Offline mode, or when Wikipedia can't be reached), Home's feeds come from the library's picks for
  // the day and the "On this day" highlights saved with the app (data/onthisday.js, loaded when first needed), in the
  // same shapes as Wikipedia's. An event links to its article only if the library has it.
  let saved;
  const savedDays = () => saved || (saved = new Promise((resolve) => {
    if (window.E2K_ONTHISDAY) return resolve(window.E2K_ONTHISDAY);
    const s = document.createElement('script');
    s.src = 'data/onthisday.js';
    s.onload = () => resolve(window.E2K_ONTHISDAY || null);
    s.onerror = () => { saved = null; resolve(null); };
    document.head.append(s);
  }));
  async function savedDay(date) {
    const d = await savedDays(), rows = (d && d.days[`${pad(date.getMonth() + 1)}-${pad(date.getDate())}`]) || [];
    const has = await library();
    return Promise.all(rows.map(async ([year, text, title]) => {
      const found = has && title ? await lib.find(title).catch(() => null) : null;
      return { year, text, pages: found ? [{ title: found.title, titles: { normalized: found.title } }] : [] };
    }));
  }
  async function offlineFeatured(date) {
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const pick = (await library()) ? await lib.daily(key).catch(() => null) : null;
    const tfa = pick && pick.disc ? await libSummary(pick.disc).catch(() => null) : null;
    const image = pick && pick.pic ? { title: pick.pic.title, fromLibrary: true, thumbnail: { source: pick.pic.src } } : null;
    return { offline: true, tfa, image, onthisday: await savedDay(date) };
  }
  async function feed(online, offline) {
    if (offlineMode() || !connected()) return offline();
    try { return await online(); } catch (e) { return offline(); }
  }

  // Swaps each picture marked with a sharp version once that version has loaded, as it scrolls into view. A picture
  // that can't be loaded keeps the library's copy.
  function sharpen(root) {
    const imgs = [...root.querySelectorAll('img[data-sharp]')];
    if (!imgs.length) return;
    const swap = (img) => { const pre = new Image(); pre.onload = () => { img.src = pre.src; }; pre.src = img.dataset.sharp; delete img.dataset.sharp; };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); swap(e.target); } }), { rootMargin: '600px' });
    imgs.forEach((img) => io.observe(img));
  }

  return {
    library,
    sharpen,
    connected,
    featured: (date) => feed(() => get(`${BASE}/api/rest_v1/feed/featured/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
      () => offlineFeatured(date)),
    onThisDay: (date, type = 'all') => feed(() => get(`${BASE}/api/rest_v1/feed/onthisday/${type}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
      async () => ({ offline: true, selected: await savedDay(date) })),
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
    searchPages: (q) => search(() => get(`${BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=20`), async () => ({ pages: await libTitles(q, 20, true) })),
    // Wikipedia's spelling suggestion for a search ("napolean" -> "napoleon"), or '' if it has none.
    spelling: (q) => (libraryFirst() ? Promise.resolve('') : get(`${BASE}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srinfo=suggestion&srprop=&srlimit=1&format=json&formatversion=2&origin=*`)
      .then((r) => r.query?.searchinfo?.suggestion || '', () => '')),
    pageUrl: (title) => `${BASE}/wiki/${enc(title)}`,
  };
})();
