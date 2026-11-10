// Builds Animal Sounds' data (npm run animals): for each animal, its recording from Wikimedia Commons cut to the loudest
// stretch (up to 8 seconds), evened out and saved small (Opus); its article's picture at 330 pixels; and the credits.
// Writes src/activities/animals/<id>.ogg and <id>.jpg, and src/activities/animal-sounds-data.js.
// Only public domain, CC0, CC BY and CC BY-SA recordings and pictures are used. Needs ffmpeg on the PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'activities', 'animals');
const CACHE = join(tmpdir(), 'e2k-animals-cache');
const UA = 'Encyclopedia2000/0.6 (https://github.com/sburton0/encyclopedia-2000; animal sounds data)';
const MAX = 8;      // seconds kept from each recording
const BARS = 64;    // waveform bars

// [habitat, id, name, article, kind, Commons file, line about the sound, options]
// options: at (start, seconds; otherwise the loudest stretch), len, by (the credit, when Commons' author field doesn't name one), picBy (the same for the picture), pic (a Commons file for the picture instead of the article's).
const ANIMALS = [
  ['Oceans', 'humpback', 'Humpback whale', 'Humpback whale', 'Song', 'Humpback-Whale-Song-and-Foraging-Behavior-on-an-Antarctic-Feeding-Ground-pone.0051214.s001.oga', 'Male humpbacks sing long, repeating songs, and the males of a population all sing much the same song, changing it slowly over the years.'],
  ['Oceans', 'bluewhale', 'Blue whale', 'Blue whale', 'Call', 'Blue Whale NE Pacific.ogg', 'Blue whales make some of the loudest and lowest sounds of any animal, many of them too low for people to hear.', { by: 'NOAA' }],
  ['Oceans', 'orca', 'Orca', 'Orca', 'Calls', 'Killer whale simple.ogg', 'Each orca family group, or pod, has its own set of calls, a little like a local accent.', { by: 'National Park Service' }],
  ['Oceans', 'beluga', 'Beluga whale', 'Beluga whale', 'Whistles', 'Beluga vocalizations.ogg', 'Belugas whistle, click and chirp so much that sailors called them “sea canaries.”', { by: 'NOAA', picBy: 'Javier Yaya Tur' }],
  ['Oceans', 'beardedseal', 'Bearded seal', 'Bearded seal', 'Trill', 'Svalbard Sample for Wiki.ogg', 'In spring, male bearded seals sing long, falling trills under the Arctic ice.'],

  ['Rainforests', 'howler', 'Howler monkey', 'Howler monkey', 'Howl', 'Howler monkey.ogg', 'Howler monkeys are among the loudest land animals: their calls carry about 5 kilometres (3 miles) through the forest.'],
  ['Rainforests', 'gibbon', 'Lar gibbon', 'Lar gibbon', 'Song', 'Lar Gibbon hoots.ogg', 'Lar gibbon pairs sing together most mornings, telling the neighbors whose part of the forest it is.'],
  ['Rainforests', 'chimp', 'Chimpanzee', 'Chimpanzee', 'Pant-hoot', 'Pant-hoot call made by a male chimpanzee.ogg', 'Chimpanzees “pant-hoot” to call to others far away, and each chimp’s call is a little different.'],
  ['Rainforests', 'siamang', 'Siamang', 'Siamang', 'Song', 'Black-gibbons-sumatra-2022.ogg', 'A siamang’s throat sac swells up like a balloon, making its loud calls even louder.'],
  ['Rainforests', 'indri', 'Indri', 'Indri', 'Song', 'Roep Indri Indri.ogg', 'Indris, among the largest living lemurs, sing together in family groups, and their songs carry across the forests of Madagascar.'],

  ['Grasslands', 'lion', 'Lion', 'Lion', 'Roar', 'Lionroar.wav', 'A lion’s roar can be heard up to 8 kilometres (5 miles) away.'],
  ['Grasslands', 'hyena', 'Spotted hyena', 'Spotted hyena', 'Whoops', 'Spotted Hyaena (Crocuta crocuta) (W1CDR0000381 BD12).ogg', 'Spotted hyenas whoop to call their clan together, and other hyenas can tell from the sound who is calling.', { by: 'British Library' }],
  ['Grasslands', 'cheetah', 'Cheetah', 'Cheetah', 'Chirps', 'Acoustic-Structure-and-Contextual-Use-of-Calls-by-Captive-Male-and-Female-Cheetahs-(Acinonyx-pone.0158546.s001.oga', 'Cheetahs can’t roar. Instead they chirp, purr and growl, and a chirp sounds almost like a bird.'],
  ['Grasslands', 'coyote', 'Coyote', 'Coyote', 'Howls', 'Pack of coyotes howling.ogg', 'Coyotes howl and yip together, and a few coyotes can sound like many more.'],

  ['Forests', 'wolf', 'Gray wolf', 'Wolf', 'Howl', 'Wolf howls.ogg', 'Wolves howl to find each other and to warn other packs away; a howl can carry for about 10 kilometres (6 miles).', { by: 'U.S. Fish and Wildlife Service' }],
  ['Forests', 'elk', 'Elk', 'Elk', 'Bugle', 'American Elk Bugling.ogg', 'In autumn, bull elk “bugle”: a call that starts low, rises to a high whistle, and ends in grunts.'],
  ['Forests', 'moose', 'Moose', 'Moose', 'Calls', 'Moose mate.ogg', 'In the autumn mating season, bull moose grunt and cows give long, moaning calls.'],
  ['Forests', 'fox', 'Red fox', 'Red fox', 'Scream', 'FuchsSchreit.mp3', 'Red foxes have many calls; their eerie scream is heard most in winter, the mating season.'],
  ['Forests', 'tiger', 'Tiger', 'Tiger', 'Growl', '439280 schots angry-tiger.wav', 'Tigers roar to tell other tigers where they are, and greet friends with a soft, snorting “chuff.”'],
  ['Forests', 'reddeer', 'Red deer', 'Red deer', 'Roar', 'Red Deer (Cervus elaphus) (W1CDR0001424 BD3).ogg', 'In autumn, red deer stags roar to show off, and the deepest roars tend to come from the biggest stags.', { by: 'British Library' }],

  ['Birds', 'kookaburra', 'Laughing kookaburra', 'Laughing kookaburra', 'Laugh', 'LaughingKookaburra.ogg', 'Kookaburra families “laugh” together, often at dawn and dusk, to mark their territory.'],
  ['Birds', 'loon', 'Common loon', 'Common loon', 'Yodel', 'Loon yodel.ogg', 'Only male loons yodel: it’s the call that defends the lake where they nest.'],
  ['Birds', 'eagle', 'Bald eagle', 'Bald eagle', 'Call', 'Bald Eagle Yellowstone National Park.ogg', 'The bald eagle has a surprisingly thin, high, chattering call. Films often use a red-tailed hawk’s scream instead.'],
  ['Birds', 'peacock', 'Indian peafowl', 'Indian peafowl', 'Call', 'Indian Peafowl.ogg', 'Peacocks give loud, honking calls, especially before the monsoon rains.'],
  ['Birds', 'crane', 'Sandhill crane', 'Sandhill crane', 'Call', 'Grus canadensis Denali National Park.ogg', 'A sandhill crane’s long, coiled windpipe gives its rattling call the power to carry for kilometres.'],
  ['Birds', 'owl', 'Great horned owl', 'Great horned owl', 'Hoots', 'Bubo virginianus - Great Horned Owl XC450919.mp3', 'Great horned owls hoot deep and soft, and a pair often hoots back and forth in a duet.'],
  ['Birds', 'cardinal', 'Northern cardinal', 'Northern cardinal', 'Song', 'Cardinalis cardinalis cardinalis - Northern Cardinal - XC112830.ogg', 'Unlike most songbirds, female northern cardinals sing too, sometimes from the nest.'],
  ['Birds', 'goose', 'Canada goose', 'Canada goose', 'Honks', 'Branta canadensis.ogg', 'Canada geese honk to one another as they fly in their V formation.', { by: 'National Park Service' }],
  ['Birds', 'cuckoo', 'Common cuckoo', 'Common cuckoo', 'Call', 'Cuculus canorus.ogg', 'The cuckoo’s two-note call gave the bird its name in many languages.'],

  ['Farms', 'rooster', 'Rooster', 'Chicken', 'Crow', 'Kukuriku.flac', 'Roosters crow at dawn and on and off all day, and the top rooster of a flock usually crows first.'],
  ['Farms', 'horse', 'Horse', 'Horse', 'Neigh', 'Wiehern.ogg', 'A horse’s neigh, or whinny, can tell other horses who it is and how it’s feeling.', { picBy: 'François Marchal' }],
  ['Farms', 'sheep', 'Sheep', 'Sheep', 'Bleat', 'Sheep bleating.ogg', 'A ewe and her lamb know each other’s bleats, even in a crowded flock.'],
  ['Farms', 'cow', 'Cow', 'Cattle', 'Moo', 'Mudchute cow 1.ogg', 'Cows moo to keep in touch with their calves and herd, and a mother and calf know each other’s voices.'],
  ['Farms', 'dog', 'Dog', 'Dog', 'Bark', 'A dog making noises and barking.flac', 'Dogs bark far more than wolves do, a habit that grew as they lived alongside people.'],

  ['Bugs and frogs', 'cicada', 'Cicada', 'Cicada', 'Song', 'Cicadas in Greece.ogg', 'Male cicadas sing by clicking drum-like plates on their sides called tymbals; some are as loud as a lawnmower.'],
  ['Bugs and frogs', 'peeper', 'Spring peeper', 'Spring peeper', 'Chorus', 'Springpeepers.ogg', 'Spring peepers are tiny frogs, about as long as a paper clip, but a pond full of them can be heard far away.'],
  ['Bugs and frogs', 'cricket', 'Field cricket', 'Cricket (insect)', 'Chirps', 'Field cricket Gryllus pennsylvanicus.ogg', 'Crickets chirp by rubbing their wings together, and they chirp faster when it’s warm.'],
  ['Bugs and frogs', 'katydid', 'Bush cricket', 'Tettigoniidae', 'Song', 'Tettigonia viridissima - sound.ogg', 'Bush crickets, or katydids, sing at night by rubbing their wings together. Their ears are on their front legs.'],
  ['Bugs and frogs', 'bee', 'Honey bee', 'Honey bee', 'Buzz', 'Buzzing bees.ogg', 'A honey bee’s buzz comes from its wings, beating about 230 times a second.'],
].map(([habitat, id, name, article, kind, file, line, opt = {}]) => ({ habitat, id, name, article, kind, file, line, ...opt }));

const HABITATS = ['Oceans', 'Rainforests', 'Grasslands', 'Forests', 'Birds', 'Farms', 'Bugs and frogs'];
const FREE = /^(public domain|pd|cc0|cc[ -]by(-sa)?[ -]\d(\.\d)?)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(host, params) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: 2, ...params });
  for (let k = 0; k < 5; k++) {
    await sleep(300 + k * 2000);
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      return JSON.parse(await r.text());
    } catch (e) { console.error('  retrying:', e.message); }
  }
  throw new Error('Wikimedia API failed: ' + u);
}
async function download(url, path) {
  if (existsSync(path)) return;
  for (let k = 0; k < 5; k++) {
    await sleep(300 + k * 3000);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) { writeFileSync(path, Buffer.from(await r.arrayBuffer())); return; }
    console.error('  retrying download:', r.status, url);
  }
  throw new Error('Download failed: ' + url);
}
const strip = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function fileInfo(file, width) {
  const j = await api('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', titles: 'File:' + file, iiprop: 'url|size|extmetadata', ...(width ? { iiurlwidth: width } : {}) });
  const ii = j.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) throw new Error('Not on Commons: ' + file);
  const m = ii.extmetadata || {};
  const license = strip(m.LicenseShortName?.value) || '?';
  let artist = strip(m.Artist?.value) || strip(m.Credit?.value) || 'Unknown';
  if (artist.length > 60) artist = artist.slice(0, 57).replace(/\s+\S*$/, '') + '…';
  return { url: ii.url, thumb: ii.thumburl, license, artist, duration: ii.duration };
}

const ffmpeg = (args, opts = {}) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 30, ...opts });

// The loudest stretch of up to MAX seconds (by energy in quarter-second steps), unless an animal gives its own start.
function choose(src, a) {
  const pcm = ffmpeg(['-i', src, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const dur = s.length / 8000;
  const len = Math.min(a.len || MAX, dur);
  if (a.at != null) return { at: a.at, len };
  const step = 2000, e = [];
  for (let i = 0; i < s.length; i += step) { let t = 0; for (let k = i; k < Math.min(s.length, i + step); k++) t += s[k] * s[k]; e.push(t); }
  const win = Math.max(1, Math.round(len * 4));
  let best = 0, bestAt = 0, sum = 0;
  for (let i = 0; i < e.length; i++) { sum += e[i]; if (i >= win) sum -= e[i - win]; if (i >= win - 1 && sum > best) { best = sum; bestAt = i - win + 1; } }
  return { at: Math.max(0, Math.min(bestAt / 4, dur - len)), len };
}
function peaks(path) {
  const pcm = ffmpeg(['-i', path, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const per = s.length / BARS, out = [];
  for (let b = 0; b < BARS; b++) { let m = 0; for (let k = Math.floor(b * per); k < Math.floor((b + 1) * per); k++) m = Math.max(m, Math.abs(s[k])); out.push(m); }
  const top = Math.max(...out) || 1;
  return { peaks: out.map((v) => Math.round((v / top) * 100) / 100), seconds: Math.round((s.length / 8000) * 10) / 10 };
}

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const data = [];
for (const a of ANIMALS) {
  console.log(a.name);
  // The recording
  const rec = await fileInfo(a.file);
  if ((rec.artist.match(/,/g) || []).length >= 2) rec.artist = rec.artist.split(',')[0] + ' et al.';   // a paper's authors
  if (a.by) rec.artist = a.by;
  rec.artist = rec.artist.replace(/User:/gi, '');
  if (/^unknown|copyright/i.test(rec.artist)) throw new Error(`${a.file}: no author to credit (give a "by")`);
  if (!FREE.test(rec.license)) throw new Error(`${a.file}: ${rec.license} isn't a license we ship`);
  const src = join(CACHE, a.id + '-' + a.file.replace(/[^\w.-]+/g, '_'));
  await download(rec.url, src);
  const { at, len } = choose(src, a);
  const fade = Math.min(0.25, len / 6);
  const ogg = join(OUT, a.id + '.ogg');
  ffmpeg(['-ss', at.toFixed(2), '-t', len.toFixed(2), '-i', src, '-ac', '1', '-ar', '48000',
    '-af', `afade=t=in:d=${fade},afade=t=out:st=${(len - fade).toFixed(2)}:d=${fade},loudnorm=I=-18:TP=-1.5:LRA=11`,
    '-c:a', 'libopus', '-b:a', '40k', '-map_metadata', '-1', ogg]);
  const wave = peaks(ogg);
  // The picture: the article's own, unless one is given
  let picFile = a.pic;
  if (!picFile) {
    const j = await api('en.wikipedia.org', { action: 'query', prop: 'pageimages', piprop: 'name', titles: a.article, redirects: 1 });
    picFile = j.query?.pages?.[0]?.pageimage;
  }
  let pic = null;
  if (picFile) {
    const p = await fileInfo(picFile.replace(/_/g, ' '), 330).catch(() => null);
    if (p && FREE.test(p.license) && p.thumb) {
      const raw = join(CACHE, a.id + '-pic' + (p.thumb.match(/\.\w+$/)?.[0] || '.jpg'));
      await download(p.thumb, raw);
      ffmpeg(['-i', raw, '-vf', 'scale=330:-2', '-q:v', '5', join(OUT, a.id + '.jpg')]);
      const who = a.picBy || p.artist.replace(/User:/gi, '').replace(/^Photo by:\s*/i, '').replace(/ from .*$/, '').replace(/ - \S+\.\w+$/, '');
      pic = { artist: /^unknown/i.test(who) ? '' : who, license: p.license };
    } else console.warn('  no free picture:', picFile, p?.license);
  }
  data.push({
    id: a.id, name: a.name, habitat: a.habitat, article: a.article, kind: a.kind, line: a.line,
    seconds: wave.seconds, peaks: wave.peaks, pic: !!pic,
    credit: { file: a.file, artist: rec.artist, license: rec.license, ...(pic ? { picArtist: pic.artist, picLicense: pic.license } : {}) },
  });
  console.log(`  ${rec.license} · ${rec.artist} · ${at.toFixed(1)}s + ${len.toFixed(1)}s${pic ? '' : ' · no picture'}`);
}

const js = `// Animal Sounds' animals (made by tools/make-animals.mjs from Wikimedia Commons; don't edit by hand).\n` +
  `window.E2KAnimalData = ${JSON.stringify({ habitats: HABITATS, animals: data }, null, 0).replace(/},{"id"/g, '},\n{"id"')};\n`;
writeFileSync(join(ROOT, 'src', 'activities', 'animal-sounds-data.js'), js);
const size = readdirSync(OUT).reduce((t, f) => t + readFileSync(join(OUT, f)).length, 0) + js.length;
console.log(`${data.length} animals, ${(size / 1048576).toFixed(2)} MB`);
