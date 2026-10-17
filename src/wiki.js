// Thin client for the public Wikipedia / Wikimedia REST APIs.
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

  return {
    featured: (date) =>
      get(`${BASE}/api/rest_v1/feed/featured/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    onThisDay: (date, type = 'all') =>
      get(`${BASE}/api/rest_v1/feed/onthisday/${type}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    summary: (title) => get(`${BASE}/api/rest_v1/page/summary/${enc(title)}?redirect=true`),
    html: (title) => get(`${BASE}/api/rest_v1/page/html/${enc(title)}?redirect=true`, 'text'),
    // Every picture, video, and sound in an article, in the order they appear.
    mediaList: (title) => get(`${BASE}/api/rest_v1/page/media-list/${enc(title)}?redirect=true`),
    // Size, length, file address, a still picture, and the credit for up to 50 files ("File:…" titles).
    fileInfo: (files) => info(files, 'imageinfo', 'ii', ''),
    // The same, plus the versions Commons has converted each video or sound into (smaller sizes, WebM, MP3).
    videoInfo: (files) => info(files, 'videoinfo', 'vi', '|derivatives'),
    // The current text of pages on Wikimedia Commons, by title (Media of the Day, the featured sounds lists).
    commonsPages: (titles) => get(`${COMMONS}/w/api.php?action=query&format=json&formatversion=2&origin=*&prop=revisions&rvprop=content&rvslots=main`
      + `&titles=${encodeURIComponent(titles.join('|'))}`)
      .then((r) => Object.fromEntries((r.query?.pages || []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content || '']))),
    random: () => get(`${BASE}/api/rest_v1/page/random/summary`),
    searchTitles: (q) => get(`${BASE}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`),
    searchPages: (q) => get(`${BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=20`),
    // Wikipedia's spelling suggestion for a search ("napolean" -> "napoleon"), or '' if it has none.
    spelling: (q) => get(`${BASE}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srinfo=suggestion&srprop=&srlimit=1&format=json&formatversion=2&origin=*`)
      .then((r) => r.query?.searchinfo?.suggestion || '', () => ''),
    pageUrl: (title) => `${BASE}/wiki/${enc(title)}`,
  };
})();
