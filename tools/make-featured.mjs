// Saves the titles of Wikipedia's Featured Articles (the ones its reviewers judged among the best) to
// src/data/featured.json. Offline, Home picks Today's discovery and its picture from the ones in the offline library,
// as Wikipedia's own Home does online. Run before a release (npm run offline-data) to refresh it.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = { headers: { 'User-Agent': 'Encyclopedia 2000 build tool (+https://encyclopedia2000.com)' } };
const titles = [];
let cont = '';
do {
  const r = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtitle=Category:Featured_articles'
    + `&cmnamespace=0&cmlimit=500${cont ? '&cmcontinue=' + encodeURIComponent(cont) : ''}`, UA)).json();
  titles.push(...r.query.categorymembers.map((m) => m.title));
  cont = r.continue?.cmcontinue;
} while (cont);
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/featured.json', JSON.stringify(titles.sort()));
console.log(`Saved ${titles.length} featured articles`);
