// Builds the data for Passport, the flag and capitals game: src/games/passport-data.js (each country's capital and
// whether it has a flag picture) and src/games/flags/<Wikidata id>.png (small flag pictures from Wikimedia Commons).
// The countries and continents are World Explorer's (src/world/map-data.js); capitals and flags come from Wikidata (CC0)
// and Commons (flags are public domain or freely licensed). Shipped with the app, so the game works offline.
// Run with: npm run passport   (needs an internet connection; pictures already downloaded are kept)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/world/map-data.js'), 'utf8'), ctx);
const countries = ctx.window.E2KWorldMap.countries;
const FLAGS = path.join(root, 'src/games/flags');
fs.mkdirSync(FLAGS, { recursive: true });

const UA = 'Encyclopedia2000/0.6 (https://github.com/sburton0/encyclopedia-2000; passport build script)';
async function sparql(query) {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  return (await res.json()).results.bindings;
}

// Today's capitals (statements without an end date; the preferred one first) and the flag picture.
const ids = countries.map((c) => `wd:${c.id}`).join(' ');
const rows = await sparql(`SELECT ?c ?cap ?capLabel ?article ?rank ?flag WHERE {
  VALUES ?c { ${ids} }
  OPTIONAL { ?c p:P36 ?st. ?st ps:P36 ?cap; wikibase:rank ?rank. FILTER NOT EXISTS { ?st pq:P582 [] } FILTER(?rank != wikibase:DeprecatedRank)
    OPTIONAL { ?article schema:about ?cap; schema:isPartOf <https://en.wikipedia.org/>. } }
  OPTIONAL { ?c wdt:P41 ?flag }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`);
// Sovereign states only: Passport asks about countries, so territories (Puerto Rico, Bermuda, Åland…) are left out.
const sovereign = new Set((await sparql(`SELECT ?c WHERE { VALUES ?c { ${ids} } ?c wdt:P31 wd:Q3624078. FILTER NOT EXISTS { ?c wdt:P576 [] } }`))
  .map((b) => b.c.value.split('/').pop()));
// The map's Denmark is the country itself; Wikidata's sovereign state is the Kingdom of Denmark (with Greenland and the Faroes).
for (const c of countries) if (c.name === 'Denmark') sovereign.add(c.id);
// Shorter everyday names for the questions.
const NAME_FIX = { 'Kingdom of the Netherlands': 'Netherlands' };
const info = {};
for (const b of rows) {
  const id = b.c.value.split('/').pop();
  const it = info[id] ||= { caps: [], flag: '' };
  if (b.flag && !it.flag) it.flag = decodeURIComponent(b.flag.value.split('/').pop());
  if (b.cap && b.article && !/^Q\d+$/.test(b.capLabel.value)) {
    const title = decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
    const name = b.capLabel.value;
    const preferred = b.rank.value.endsWith('PreferredRank');
    if (!it.caps.some((c) => c.title === title)) it.caps[preferred ? 'unshift' : 'push']({ name, title });
  }
}

async function getFlag(id, file) {
  const out = path.join(FLAGS, `${id}.png`);
  if (fs.existsSync(out)) return true;
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`;
  for (let tries = 0; tries < 4; tries++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok && /image\/png/.test(res.headers.get('content-type') || '')) { fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); return true; }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (tries + 1))); continue; }
    console.warn(`  no flag for ${id} (${res.status} ${file})`);
    return false;
  }
  return false;
}

// Where Wikidata has no current capital, or lists several in no useful order: [name, article] first.
const CAP_FIX = {
  'Antigua and Barbuda': ["St. John's", "St. John's, Antigua and Barbuda"],
  'Nicaragua': ['Managua', 'Managua'],
  'South Africa': ['Pretoria', 'Pretoria'],
};
const out = {};
let flags = 0;
for (const c of countries) {
  const it = info[c.id] || { caps: [], flag: '' };
  if (!sovereign.has(c.id)) { fs.rmSync(path.join(FLAGS, `${c.id}.png`), { force: true }); continue; }
  const hasFlag = it.flag ? await getFlag(c.id, it.flag) : false;
  if (hasFlag) flags++;
  // [capital, its article] pairs; a city-state's capital is itself, which makes no question.
  const caps = it.caps.filter((k) => { const n = c.name.toLowerCase(), k2 = k.name.toLowerCase(); return n !== k2 && !n.startsWith(k2 + ' '); });
  const fix = CAP_FIX[c.name];
  if (fix) { const i = caps.findIndex((k) => k.title === fix[1]); if (i >= 0) caps.splice(i, 1); caps.unshift({ name: fix[0], title: fix[1] }); }
  if (!sovereign.has(c.id)) continue;
  out[c.id] = { f: hasFlag ? 1 : 0, cap: caps.map((k) => [k.name, k.title]), ...(NAME_FIX[c.name] ? { n: NAME_FIX[c.name] } : {}) };
}
if (process.env.DEBUG) for (const n of process.env.DEBUG.split(',')) { const c = countries.find((x) => x.name === n); console.log(n, c ? JSON.stringify(info[c.id]) : "not on the map"); }
const states = countries.filter((c) => out[c.id]);
const missing = states.filter((c) => !out[c.id].cap.length).map((c) => c.name);
fs.writeFileSync(path.join(root, 'src/games/passport-data.js'),
  `// Generated by tools/make-passport.mjs from Wikidata (CC0). Do not edit by hand.\n// Capitals ([name, article], the main one first) and whether a flag picture is in src/games/flags/.\nwindow.E2KPassportData = ${JSON.stringify(out)};\n`);
const size = fs.readdirSync(FLAGS).reduce((n, f) => n + fs.statSync(path.join(FLAGS, f)).size, 0);
console.log(`${states.length} sovereign states of ${countries.length} places, ${flags} flags (${(size / 1e6).toFixed(2)} MB), ${states.length - missing.length} with a capital for questions.`);
console.log(`Left out: ${countries.filter((c) => !out[c.id]).map((c) => c.name).join(', ')}`);
console.log(`No capital question: ${missing.join(', ')}`);
