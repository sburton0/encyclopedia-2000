// Saves Lifelines' ready-made sets to src/activities/lifelines-data.js, so they work offline: each person's birth and
// death years (Wikidata, CC0), name and description (Wikipedia), and a small portrait (src/activities/lifelines/, public
// domain or CC0 pictures only; anyone else is shown without one offline). The sets are read from lifelines.js.
// Part of npm run offline-data. Needs ffmpeg on the PATH.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Encyclopedia2000/0.6 (https://github.com/sburton0/encyclopedia-2000; lifelines build script)';
const OUT = path.join(ROOT, 'src/activities/lifelines');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = fs.readFileSync(path.join(ROOT, 'src/activities/lifelines.js'), 'utf8');
const SETS = Function(`return ${src.slice(src.indexOf('const SETS = [') + 'const SETS = '.length, src.indexOf('];', src.indexOf('const SETS = [')) + 1)}`)();
const titles = [...new Set(SETS.flatMap(([, people]) => people))];

async function json(url, opts = {}) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (r.ok) return r.json();
    if (tries >= 5) throw new Error(`${url}: HTTP ${r.status}`);
    await sleep(2000 * (tries + 1));
  }
}
// "Physicist and astronomer (1564–1642)" -> "Physicist and astronomer", as lifelines.js shows it.
const plainDesc = (s) => { const d = (s || '').replace(/\s*\(.*?\)\s*/g, ' ').split(/[,;]/)[0].trim(); return d.charAt(0).toUpperCase() + d.slice(1); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2k-lifelines-'));
const people = {};
let pictures = 0;
for (const t of titles) {
  const s = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}?redirect=true`);
  const q = s.wikibase_item;
  const rows = (await json('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: 'query=' + encodeURIComponent(`SELECT ?b ?d WHERE { OPTIONAL { wd:${q} wdt:P569 ?b } OPTIONAL { wd:${q} wdt:P570 ?d } }`),
  })).results.bindings;
  // The earliest date given, as lifelines.js does (Wikidata gives years in astronomical numbering: 0 = 1 BC).
  const yr = (k) => { const ys = rows.map((r) => r[k]?.value).filter(Boolean).map((v) => parseInt(v.match(/^(-?\d+)/)[1], 10)); return ys.length ? Math.min(...ys) : null; };
  const title = s.titles?.normalized || s.title || t;
  const p = { title, name: title.replace(/ \(.*\)$/, ''), role: plainDesc(s.description), thumb: '', born: yr('b'), died: yr('d') };
  // The portrait, if it's public domain or CC0.
  // The file's name from its address (for a big picture that's a /thumb/…/<file>/<width>px-<file> address).
  const parts = (s.originalimage?.source || '').split('?')[0].split('/');
  const file = parts.length > 1 && decodeURIComponent(parts.includes('thumb') ? parts[parts.length - 2] : parts[parts.length - 1]);
  if (file) {
    const info = await json('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: 2, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: 160, titles: 'File:' + file }));
    const ii = info.query?.pages?.[0]?.imageinfo?.[0];
    const lic = ii?.extmetadata?.LicenseShortName?.value || '';
    if (ii?.thumburl && /^(public domain|pd|cc0)/i.test(lic)) {
      const id = title.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      const raw = path.join(tmp, id + path.extname(new URL(ii.thumburl).pathname));
      const r = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
      fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', 'scale=96:-2', '-q:v', '5', path.join(OUT, id + '.jpg')]);
      p.thumb = `activities/lifelines/${id}.jpg`;
      pictures++;
    } else console.warn(`  ${title}: no free portrait (${lic || 'none'})`);
  }
  people[t] = p;
  console.log(`${title}: ${p.born}–${p.died ?? ''}`);
  await sleep(300);
}
const saved = new Date().toISOString().slice(0, 10);
const js = `// Made by tools/make-lifelines.mjs from Wikidata (CC0) and Wikipedia (CC BY-SA); portraits public domain or CC0.\n` +
  `// Lifelines' ready-made sets, for when the app is offline. Keyed by the title in lifelines.js's SETS.\n` +
  `window.E2KLifelinesData = ${JSON.stringify({ saved, people })};\n`;
fs.writeFileSync(path.join(ROOT, 'src/activities/lifelines-data.js'), js);
const bytes = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) + js.length;
console.log(`${titles.length} people, ${pictures} portraits, ${Math.round(bytes / 1024)} KB`);
