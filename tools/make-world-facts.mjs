// Builds World Explorer's saved facts (npm run world-facts), so a country's card works offline: capital, population,
// area, languages, currency, and government from Wikidata (CC0), its Wikipedia description and the first two sentences of
// its summary (CC BY-SA), for every country and territory on the map and the six continents. Flags: Passport's
// (src/games/flags/, the sovereign states) plus the territories', saved to src/world/flags/.
// Writes src/world/facts-data.js. Online, the app still asks Wikidata first; these are what it shows offline.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Encyclopedia2000/0.6 (https://github.com/sburton0/encyclopedia-2000; world facts build script)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/world/map-data.js'), 'utf8'), ctx);
const countries = ctx.window.E2KWorldMap.countries;
const CONTINENTS = { Africa: 'Q15', Asia: 'Q48', Europe: 'Q46', 'North America': 'Q49', 'South America': 'Q18', Oceania: 'Q55643' };

async function sparql(query) {
  for (let tries = 0; tries < 5; tries++) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
      body: 'query=' + encodeURIComponent(query),
    });
    if (res.ok) return (await res.json()).results.bindings;
    console.warn(`  Wikidata ${res.status}, retrying`);
    await sleep(4000 * (tries + 1));
  }
  throw new Error('Wikidata kept failing');
}

// The same query as World Explorer's (src/world/world.js loadFacts), for many places at once.
const en = (v, l) => `OPTIONAL { ?c p:${v} ?${l}s. ?${l}s ps:${v} ?${l}x; a wikibase:BestRank. FILTER NOT EXISTS { ?${l}s pq:P582 [] }
  ?${l}x rdfs:label ?${l}l FILTER(LANG(?${l}l) = "en")
  OPTIONAL { ?${l}a schema:about ?${l}x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?${l}t }
  BIND(COALESCE(?${l}t, ?${l}l) AS ?${l}) }`;
const KNOWN_AS = { Putonghua: 'Mandarin Chinese' };
const english = (name) => { const n = name.replace(/ \(.*\)$/, '').replace(/ language$/, ''); return KNOWN_AS[n] || n; };

async function factsFor(ids) {
  const rows = await sparql(`SELECT ?c
    (SAMPLE(?flag) AS ?flag) (GROUP_CONCAT(DISTINCT ?cap; separator="|") AS ?capital)
    (GROUP_CONCAT(DISTINCT ?lang; separator="|") AS ?langs) (GROUP_CONCAT(DISTINCT ?cur; separator="|") AS ?currency)
    (GROUP_CONCAT(DISTINCT ?gov; separator="|") AS ?govs) (SAMPLE(?area) AS ?areaKm)
    (GROUP_CONCAT(DISTINCT CONCAT(STR(?pop), "@", STR(COALESCE(?popT, ""))); separator="|") AS ?pops)
    WHERE {
      VALUES ?c { ${ids.map((id) => 'wd:' + id).join(' ')} }
      OPTIONAL { ?c wdt:P41 ?flag }
      ${en('P36', 'cap')} ${en('P37', 'lang')} ${en('P38', 'cur')} ${en('P122', 'gov')}
      OPTIONAL { ?c p:P2046/psn:P2046/wikibase:quantityAmount ?area }
      OPTIONAL { ?c p:P1082 ?ps. ?ps ps:P1082 ?pop; a wikibase:BestRank. OPTIONAL { ?ps pq:P585 ?popT } }
    } GROUP BY ?c`);
  const out = {};
  for (const b of rows) {
    const id = b.c.value.split('/').pop();
    const list = (k) => (b[k]?.value ? [...new Set(b[k].value.split('|').filter(Boolean).map(english))] : []);
    const pops = list('pops').map((p) => { const [n, t] = p.split('@'); return { n: Number(n), year: t ? new Date(t).getUTCFullYear() : 0 }; })
      .filter((p) => p.n > 0).sort((a, z) => z.year - a.year);
    out[id] = {
      flagFile: b.flag?.value ? decodeURIComponent(b.flag.value.split('/').pop()) : '',
      capital: list('capital'), languages: list('langs'), currency: list('currency'), government: list('govs'),
      area: b.areaKm ? Math.round(Number(b.areaKm.value) / 1e4) / 100 : 0,   // km², from square meters
      population: pops[0] || null,
    };
  }
  return out;
}

// The first two sentences of each place's summary (TextExtracts does the splitting).
async function summaries(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const u = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', formatversion: 2, prop: 'extracts|description', exintro: 1, explaintext: 1, exsentences: 2, redirects: 1, titles: batch.join('|'),
    });
    let j = null;
    for (let tries = 0; tries < 5 && !j; tries++) {
      try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); j = await r.json(); } catch { await sleep(3000 * (tries + 1)); }
    }
    const back = new Map(batch.map((t) => [t, t]));
    for (const n of j.query.normalized || []) back.set(n.to, back.get(n.from) || n.from);
    for (const r of j.query.redirects || []) back.set(r.to, back.get(r.from) || r.from);
    for (const p of j.query.pages) {
      const t = back.get(p.title) || p.title;
      if (p.extract) out[t] = { d: p.description || '', x: p.extract.replace(/\s+/g, ' ').trim() };
    }
    await sleep(300);
  }
  return out;
}

async function getFlag(id, file, out) {
  if (fs.existsSync(out)) return true;
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`;
  for (let tries = 0; tries < 4; tries++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok && /image\/png/.test(res.headers.get('content-type') || '')) { fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); return true; }
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (tries + 1)); continue; }
    console.warn(`  no flag for ${id} (${res.status} ${file})`);
    return false;
  }
  return false;
}

// ---------- build ----------
const ids = [...countries.map((c) => c.id), ...Object.values(CONTINENTS)];
const facts = {};
for (let i = 0; i < ids.length; i += 40) {
  Object.assign(facts, await factsFor(ids.slice(i, i + 40)));
  process.stdout.write(`facts ${Math.min(i + 40, ids.length)}/${ids.length}\r`);
  await sleep(1000);
}
console.log();
const missing = ids.filter((id) => !facts[id]);
if (missing.length) console.warn('No facts for', missing.join(' '));

const titles = [...countries.map((c) => c.title), ...Object.keys(CONTINENTS)];
const sums = await summaries(titles);
console.log(`summaries ${Object.keys(sums).length}/${titles.length}`);

// Flags: Passport's for the sovereign states; the rest here.
const passportFlags = path.join(ROOT, 'src/games/flags');
const worldFlags = path.join(ROOT, 'src/world/flags');
fs.mkdirSync(worldFlags, { recursive: true });
const keep = new Set();
let territory = 0;
for (const c of countries) {
  const f = facts[c.id];
  if (!f) continue;
  if (fs.existsSync(path.join(passportFlags, c.id + '.png'))) f.flag = 'games/flags';
  else if (f.flagFile && await getFlag(c.id, f.flagFile, path.join(worldFlags, c.id + '.png'))) { f.flag = 'world/flags'; keep.add(c.id + '.png'); territory++; }
}
for (const f of fs.readdirSync(worldFlags)) if (!keep.has(f)) fs.rmSync(path.join(worldFlags, f));
for (const f of Object.values(facts)) delete f.flagFile;

const saved = new Date().toISOString().slice(0, 10);
const js = `// Generated by tools/make-world-facts.mjs from Wikidata (CC0) and Wikipedia (CC BY-SA). Do not edit by hand.\n` +
  `// World Explorer's facts and summaries as of ${saved}, shown when Wikidata or Wikipedia can't be reached.\n` +
  `window.E2KWorldFacts = ${JSON.stringify({ saved, facts, summaries: sums })};\n`;
fs.writeFileSync(path.join(ROOT, 'src/world/facts-data.js'), js);
const flagBytes = fs.readdirSync(worldFlags).reduce((t, f) => t + fs.statSync(path.join(worldFlags, f)).size, 0);
console.log(`${Object.keys(facts).length} places, ${territory} territory flags (${Math.round(flagBytes / 1024)} KB), facts-data.js ${Math.round(js.length / 1024)} KB`);
