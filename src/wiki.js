// Thin client for the public Wikipedia / Wikimedia REST APIs.
window.Wiki = (() => {
  const BASE = 'https://en.wikipedia.org';
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

  return {
    featured: (date) =>
      get(`${BASE}/api/rest_v1/feed/featured/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    onThisDay: (date, type = 'all') =>
      get(`${BASE}/api/rest_v1/feed/onthisday/${type}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`),
    summary: (title) => get(`${BASE}/api/rest_v1/page/summary/${enc(title)}?redirect=true`),
    html: (title) => get(`${BASE}/api/rest_v1/page/html/${enc(title)}?redirect=true`, 'text'),
    random: () => get(`${BASE}/api/rest_v1/page/random/summary`),
    searchTitles: (q) => get(`${BASE}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`),
    searchPages: (q) => get(`${BASE}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=20`),
    pageUrl: (title) => `${BASE}/wiki/${enc(title)}`,
  };
})();
