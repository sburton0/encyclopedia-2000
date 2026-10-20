// Saves Wikipedia's "On this day" highlights for every date of the year to src/data/onthisday.js, for the Almanac and
// the Timeline when the app is offline. (A script, since the page's security policy lets it load scripts but not fetch
// its own files.) Run before a release (npm run offline-data) to refresh them.
// Each date keeps [year, text, article title] for its highlights; the whole year is about 1 MB.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'Encyclopedia 2000 build tool (+https://encyclopedia2000.com)';
const pad = (n) => String(n).padStart(2, '0');
const dates = [];
for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1)) dates.push(`${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`);

async function day(md) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${md}`, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const j = await r.json();
      return (j.selected || []).map((o) => [o.year, o.text, (o.pages || [])[0]?.titles?.normalized || (o.pages || [])[0]?.title || '']);
    }
    if (tries >= 4) throw new Error(`${md}: HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 2000 * (tries + 1)));
  }
}

const out = {};
let next = 0;
// A few at a time, to go easy on Wikipedia's servers.
await Promise.all([0, 1, 2].map(async () => {
  while (next < dates.length) {
    const md = dates[next++];
    out[md.replace('/', '-')] = await day(md);
    if (Object.keys(out).length % 30 === 0) console.log(`${Object.keys(out).length} of ${dates.length}`);
  }
}));
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
mkdirSync('src/data', { recursive: true });
const json = JSON.stringify({ saved: new Date().toISOString().slice(0, 10), days: sorted });
writeFileSync('src/data/onthisday.js', `// Made by tools/make-onthisday.mjs. Wikipedia's "On this day" highlights, CC BY-SA.
window.E2K_ONTHISDAY = ${json};
`);
console.log(`Saved ${dates.length} dates, ${Math.round(json.length / 1024)} KB`);
