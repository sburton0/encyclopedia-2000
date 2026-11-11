// Saves famous birthdays for every date of the year to src/data/birthdays.js, for The Day You Were Born when the app is
// offline: from Wikipedia's "On this day" births for each date, the 12 best-known people (by how many Wikipedias have an
// article about them, from Wikidata), each as [year, article title, description]. Part of npm run offline-data.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'Encyclopedia2000/0.6 (https://github.com/sburton0/encyclopedia-2000; birthdays build script)';
const KEEP = 12;
const pad = (n) => String(n).padStart(2, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dates = [];
for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1)) dates.push(`${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`);

async function births(md) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/births/${md}`, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const j = await r.json();
      return (j.births || []).map((b) => {
        const p = (b.pages || [])[0];
        return p && p.wikibase_item ? { year: b.year, title: (p.titles?.normalized || p.title || '').replace(/_/g, ' '), desc: p.description || '', q: p.wikibase_item } : null;
      }).filter(Boolean);
    }
    if (tries >= 5) throw new Error(`${md}: HTTP ${r.status}`);
    await sleep(2000 * (tries + 1));
  }
}
async function sitelinks(qs) {
  const out = {};
  for (let i = 0; i < qs.length; i += 250) {
    const ids = qs.slice(i, i + 250).map((q) => 'wd:' + q).join(' ');
    for (let tries = 0; ; tries++) {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
        body: 'query=' + encodeURIComponent(`SELECT ?c ?n WHERE { VALUES ?c { ${ids} } ?c wikibase:sitelinks ?n }`),
      });
      if (res.ok) { for (const b of (await res.json()).results.bindings) out[b.c.value.split('/').pop()] = Number(b.n.value); break; }
      if (tries >= 5) throw new Error(`Wikidata HTTP ${res.status}`);
      await sleep(4000 * (tries + 1));
    }
  }
  return out;
}
// "American actor (born 1969)" -> "American actor", as the app shows it.
const plainDesc = (s) => (s || '').replace(/\s*\((born |b\. )?\d+(\s*[–-]\s*\d+)?\)$/, '');

const out = {};
let next = 0;
await Promise.all([0, 1].map(async () => {
  while (next < dates.length) {
    const md = dates[next++];
    const list = await births(md);
    const n = await sitelinks([...new Set(list.map((b) => b.q))]);
    const seen = new Set();
    out[md.replace('/', '-')] = list.filter((b) => !seen.has(b.q) && seen.add(b.q))
      .sort((a, b) => (n[b.q] || 0) - (n[a.q] || 0)).slice(0, KEEP)
      .sort((a, b) => b.year - a.year)
      .map((b) => [b.year, b.title, plainDesc(b.desc)]);
    if (Object.keys(out).length % 30 === 0) console.log(`${Object.keys(out).length} of ${dates.length}`);
    await sleep(300);
  }
}));
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
mkdirSync('src/data', { recursive: true });
const json = JSON.stringify({ saved: new Date().toISOString().slice(0, 10), days: sorted });
writeFileSync('src/data/birthdays.js', `// Made by tools/make-birthdays.mjs. Famous birthdays from Wikipedia's "On this day" (CC BY-SA), ranked with Wikidata (CC0).
window.E2K_BIRTHDAYS = ${json};
`);
console.log(`Saved ${dates.length} dates, ${Math.round(json.length / 1024)} KB`);
