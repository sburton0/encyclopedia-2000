// Builds src/world/map-data.js, the World Explorer's map and country list.
// Shapes: Natural Earth country outlines (public domain, via world-atlas).
// Names, articles, and continents: Wikidata (CC0), matched by ISO 3166-1 numeric code.
// Run with: npm run map   (needs an internet connection)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const topo = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/world-atlas/countries-50m.json'), 'utf8'));
const features = feature(topo, topo.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');

// Shapes with no ISO code of their own: map them to a Wikidata item, merge them into a country, or leave them unclickable.
const NO_CODE = {
  'Somaliland': 'Q34754',
  'Kosovo': 'Q1246',
  'N. Cyprus': 'Q23681',
  'Indian Ocean Ter.': '036', // Christmas Island and the Cocos Islands, shown with Australia
  'Siachen Glacier': null, // disputed; drawn but not clickable
};

// Wikidata continents, folded into the six region buttons.
const REGIONS = {
  Q15: 'Africa', Q48: 'Asia', Q46: 'Europe', Q49: 'North America', Q18: 'South America', Q538: 'Oceania', Q55643: 'Oceania', Q3960: 'Oceania',
};
// Places Wikidata leaves without a continent.
const REGION_FIX = { '248': 'Europe', '260': 'Africa', '334': 'Oceania', '239': 'South America', '086': 'Asia', '581': 'Oceania' };

// The map is drawn into a 1000 x 500 box. Antarctica is left out to give the inhabited world more room.
const W = 1000, H = 500;
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'FeatureCollection', features });
const draw = geoPath(projection).digits(1);

// ---------- Wikidata ----------
const UA = 'Encyclopedia2000/0.1 (https://github.com/sburton0/encyclopedia-2000; map build script)';
async function sparql(query) {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  return (await res.json()).results.bindings;
}
const SELECT = `?c ?label ?article ?links (GROUP_CONCAT(DISTINCT STRAFTER(STR(?cont), "entity/")) AS ?conts)`;
const BODY = `
  FILTER NOT EXISTS { ?c wdt:P576 [] }
  ?c wikibase:sitelinks ?links; rdfs:label ?label. FILTER(LANG(?label) = "en")
  ?article schema:about ?c; schema:isPartOf <https://en.wikipedia.org/>.
  OPTIONAL { ?c wdt:P30 ?cont }`;

const byCode = {};
for (const b of await sparql(`SELECT ?code ${SELECT} WHERE { ?c wdt:P299 ?code. ${BODY} } GROUP BY ?code ?c ?label ?article ?links`)) {
  const prev = byCode[b.code.value];
  if (!prev || +b.links.value > +prev.links.value) byCode[b.code.value] = b; // several items can share a code; keep the best-known one
}
const byQid = {};
const extra = Object.values(NO_CODE).filter((v) => v && v.startsWith('Q'));
for (const b of await sparql(`SELECT ${SELECT} WHERE { VALUES ?c { ${extra.map((q) => 'wd:' + q).join(' ')} } ${BODY} } GROUP BY ?c ?label ?article ?links`)) {
  byQid[b.c.value.split('/').pop()] = b;
}

// ---------- countries ----------
const groups = new Map(); // key -> { info, features }
const inert = [];
for (const f of features) {
  let key = f.id;
  if (!key) {
    if (!(f.properties.name in NO_CODE)) throw new Error(`No code or mapping for ${f.properties.name}`);
    key = NO_CODE[f.properties.name];
  }
  if (!key) { inert.push(f); continue; }
  const info = key.startsWith('Q') ? byQid[key] : byCode[key];
  if (!info) { console.warn(`No Wikidata match for ${f.properties.name} (${key}); drawn but not clickable`); inert.push(f); continue; }
  if (!groups.has(key)) groups.set(key, { info, features: [] });
  groups.get(key).features.push(f);
}

// The country's largest piece: its middle is where markers go, and its bounds are what the map zooms to.
function mainPiece(fs) {
  let best = null, area = -1;
  for (const f of fs) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) {
      const g = { type: 'Polygon', coordinates: p };
      const a = draw.area(g);
      if (a > area) { area = a; best = g; }
    }
  }
  const [[x0, y0], [x1, y1]] = draw.bounds(best);
  return { c: [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)], box: [Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0)] };
}

const missingRegion = [];
const countries = [...groups].map(([key, { info, features: fs }]) => {
  const fc = { type: 'FeatureCollection', features: fs };
  const main = mainPiece(fs);
  let regions = [...new Set((info.conts?.value || '').split(' ').map((q) => REGIONS[q]).filter(Boolean))];
  if (key in REGION_FIX) regions = REGION_FIX[key] ? [REGION_FIX[key]] : [];
  if (!regions.length && REGION_FIX[key] !== null) missingRegion.push(`${info.label.value} (${key})`);
  const title = decodeURIComponent(info.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
  // The everyday name: Wikidata's label or the article title, whichever is shorter ("China", not "People's Republic of China").
  const plain = title.replace(/ \(.*\)$/, '');
  const name = plain.length < info.label.value.length ? plain : info.label.value;
  return {
    id: info.c.value.split('/').pop(),
    name,
    title,
    regions,
    d: draw(fc),
    c: main.c,
    box: main.box,
  };
}).sort((a, b) => a.name.localeCompare(b.name));
if (missingRegion.length) console.warn('No region for: ' + missingRegion.join(', '));

const graticule = [];
for (let lon = -180; lon <= 180; lon += 30) graticule.push({ type: 'LineString', coordinates: Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]) });
for (let lat = -60; lat <= 90; lat += 30) graticule.push({ type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) });

// What each region button zooms to: the bounds of the region's landmasses (islands too small to matter are skipped).
// A piece counts toward a region only if it lies inside that region's rough box, given as [west, south, east, north] in degrees,
// so France's French Guiana doesn't stretch Europe across the Atlantic.
const REGION_BOXES = {
  Africa: [-20, -36, 53, 38], Asia: [25, -11, 150, 56], Europe: [-25, 34, 45, 72],
  'North America': [-170, 6, -10, 84], 'South America': [-85, -56, -33, 13], Oceania: [110, -48, 180, 2],
};
const views = {};
for (const [r, [w, s, e, n]] of Object.entries(REGION_BOXES)) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [, { info, features: fs }] of groups) {
    const regions = (info.conts?.value || '').split(' ').map((q) => REGIONS[q]);
    if (!regions.includes(r)) continue;
    for (const f of fs) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polys) {
        const g = { type: 'Polygon', coordinates: p };
        if (draw.area(g) < 1) continue;
        const [[a, b], [c, d]] = draw.bounds(g);
        const [lon, lat] = geoCentroid(g);
        if (lon < w || lon > e || lat < s || lat > n) continue;
        x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
      }
    }
  }
  views[r] = [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)];
}

const data = {
  w: W, h: H, views,
  // The projection's scale and center, so other screens (such as the World Clock) can place points on the same map.
  proj: { scale: +projection.scale().toFixed(4), translate: projection.translate().map((n) => +n.toFixed(4)) },
  grid: draw({ type: 'GeometryCollection', geometries: graticule }),
  inert: draw({ type: 'FeatureCollection', features: inert }) || '',
  countries,
};
const file = path.join(root, 'src/world/map-data.js');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file,
  '// Generated by tools/make-map.mjs from Natural Earth (public domain) and Wikidata (CC0). Do not edit by hand.\n' +
  `window.E2KWorldMap = ${JSON.stringify(data)};\n`);
console.log(`${countries.length} countries, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
