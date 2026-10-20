// The offline library: opens a Kiwix library file (ZIM) and serves it to the page.
// - e2k-zim://lib/<namespace>/<path> returns an entry's content (articles, pictures, styles), following redirects.
// - IPC: library:info, library:find (title -> article path), library:titles (title suggestions), library:random.
// For now the development setting E2K_ZIM=<file.zim> chooses the file; the Offline Library dialog will replace it.
const { protocol, ipcMain } = require('electron');
const path = require('path');
const Zim = require('./zim-reader');

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'e2k-zim', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let lib = null;   // the open library, or null
let file = '';

function open(zimPath) {
  try { lib = new Zim(zimPath); file = zimPath; } catch (e) { lib = null; file = ''; console.error('Offline library could not be opened:', e.message); }
}

// Titles are stored with underscores and, like Wikipedia, a capital first letter.
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
// Suggestions for what's been typed: the title list is case-sensitive, so try it as typed, with a capital first
// letter, and in title case, then merge.
function titles(q, limit = 8) {
  if (!lib || !q.trim()) return [];
  const t = q.trim(), variants = new Set([t, cap(t), t.replace(/\b\w/g, (c) => c.toUpperCase())]);
  const seen = new Set(), out = [];
  for (const v of variants) {
    for (const e of lib.titleEntries(v, limit * 2)) {
      const r = lib.resolve(e);
      if (!r || r.mime !== 'text/html' || seen.has(r.path)) continue;
      seen.add(r.path); out.push({ title: r.title, path: r.path });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
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

function setup(zimPath) {
  if (zimPath) open(zimPath);
  protocol.handle('e2k-zim', (req) => {
    if (!lib) return new Response('No offline library', { status: 404 });
    const [ns, ...rest] = decodeURIComponent(new URL(req.url).pathname).slice(1).split('/');
    const e = lib.resolve(lib.find(ns, rest.join('/')));
    if (!e) return new Response('Not in the library', { status: 404 });
    return new Response(lib.content(e), { headers: { 'content-type': e.mime || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  ipcMain.handle('library:info', () => (lib ? {
    file: path.basename(file), title: lib.meta('Title'), date: lib.meta('Date'), language: lib.meta('Language'), articles: lib.titleList().length,
  } : null));
  ipcMain.handle('library:find', (_e, title) => find(title));
  ipcMain.handle('library:titles', (_e, q, limit) => titles(q, limit));
  ipcMain.handle('library:random', () => random());
}

module.exports = { setup };
