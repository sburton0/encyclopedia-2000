// The automated test scenarios. Each one starts the real app with its own fresh profile (or the profile a previous
// scenario left behind, for "restart" tests), drives it, and records checks and screenshots. run.js runs them.
//   name:        what to pass to `npm run test:app -- --only <name>`
//   route:       the page the app opens on (E2K_ROUTE)
//   setup(ctx):  files for the profile before the app starts: { library, settings } (library.json and settings.json)
//   reuse:       start from the profile another scenario left (a restart)
//   needs:       'fixture' when the scenario needs the small test library that "download" saves
//   env:         extra environment (E2K_LIBRARY_TEST=1 adds the tiny Ray Charles library, 3 MB)
//   only:        a platform ('win32', 'darwin', 'linux') when the scenario only applies there
//   run(t):      the test; t is described in runner.js
//   after(ctx):  runs in run.js once the app has quit
// The offline library has had the most problems, so most scenarios are about it: downloading, pausing, resuming after a
// quit, cancelling, moving, a library going missing and coming back, no connection, and Offline mode.
const fs = require('fs');
const path = require('path');

const KNOTS = 'wikipedia_en_knots';            // 18 MB: big enough to pause or quit partway (Ray Charles is one piece)
const label = (q) => `[...document.querySelectorAll('.offline .packs button, .dialog .go')].find((b) => b.textContent.trim() === ${JSON.stringify(q)})`;
const openLibrary = async (t) => { await t.js('E2KLibrary.open(E2K);'); await t.waitFor('document.querySelector(".offline .status")'); await t.sleep(1200); };
const libFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

// Waits for a download to show progress, then calls act(); returns false if it finished before that (a very fast
// connection), so the caller can skip instead of failing.
async function whenPartway(t, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await t.lib();
    if (s.current && !s.download) return false;
    if (s.download && s.download.received > 0 && s.download.received < s.download.size) return true;
    await t.sleep(40);
  }
  return false;
}
async function waitInstalled(t, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await t.lib();
    if (s.current && !s.download) return s;
    if (s.download && s.download.status === 'error') return s;
    await t.sleep(300);
  }
  return t.lib();
}

module.exports = [
  // ---------- general ----------
  {
    name: 'home', group: 'General', title: 'Home loads online',
    route: 'home',
    async run(t) {
      t.check('Almanac events appear', await t.waitFor('document.querySelectorAll(".home .alm .ev").length >= 3', 20000));
      t.check('Today\'s discovery has an article', await t.waitFor('(document.querySelector(".home")?.innerText || "").includes("Read the full article")', 15000));
      t.check('The light says Online', /Online/.test(await t.net()), await t.net());
      await t.shot('home');
    },
  },
  {
    name: 'article', group: 'General', title: 'An article (Apollo 11)',
    route: 'article/Apollo%2011',
    async run(t) {
      t.check('The article opens', await t.waitFor('/Apollo 11/.test(document.querySelector("h1")?.textContent || "") && document.querySelectorAll(".page .text p").length > 5', 20000));
      t.check('Quick facts are filled in', await t.waitFor('document.querySelectorAll(".facts .r").length >= 4', 8000));
      t.check('The Media box lists pictures', await t.waitFor('document.querySelectorAll(".mbox .mt").length >= 3', 10000));
      await t.shot('article');
      await t.command('Find in Article…', 'f');
      t.check('The find bar opens', await t.waitFor('document.querySelector(".findbar input")', 4000));
      await t.js('const i = document.querySelector(".findbar input"); i.value = "moon"; i.dispatchEvent(new Event("input", { bubbles: true }));');
      t.check('Find in Article highlights matches', await t.waitFor('document.querySelectorAll("mark.fh").length > 3', 4000));
      await t.shot('find-in-article');
    },
  },
  {
    name: 'search', group: 'General', title: 'Search results',
    route: 'search/moon',
    async run(t) {
      t.check('Results appear', await t.waitFor('document.querySelectorAll(".res").length >= 5', 20000));
      await t.shot('search');
    },
  },
  {
    name: 'themes', group: 'General', title: 'Every theme on Home',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelectorAll(".home .alm .ev").length >= 3', 20000);
      for (const id of ['bloom', 'aurora', 'sunset', 'disc', 'ocean', 'library', 'classic']) {
        await t.js(`localStorage.setItem('e2k.theme', JSON.stringify('${id}')); E2K.applyPrefs();`);
        await t.sleep(1500);
        await t.shot(`theme-${id}`);
      }
      await t.js(`localStorage.setItem('e2k.theme', JSON.stringify('bloom')); E2K.applyPrefs();`);
    },
  },
  {
    name: 'activities', group: 'General', title: 'Games and activities open',
    route: 'home',
    async run(t) {
      const routes = [['game/starchart', 'Star Chart'], ['activity/periodic-table', 'Periodic Table'], ['activity/solar-system', 'Solar System'],
        ['activity/birthday', 'The Day You Were Born'], ['activity/lifelines', 'Lifelines'], ['activity/world-clock', 'World Clock'],
        ['activity/almanac', 'Almanac Calendar'], ['world', 'World Explorer']];
      for (const [r, name] of routes) {
        await t.js(`E2K.go(${JSON.stringify(r)});`);
        await t.sleep(2500);
        const len = await t.js('return (document.querySelector("#view")?.innerText || "").length;');
        t.check(`${name} opens`, len > 100, `${len} characters on the page`);
        await t.shot(r.replace(/\//g, '-'));
      }
    },
  },
  {
    name: 'print-preview', group: 'General', title: 'Print Preview opens',
    route: 'article/Mount%20Everest',
    async run(t) {
      await t.waitFor('document.querySelectorAll(".page .text p").length > 3', 20000);
      await t.command('Print Preview…', 'p');
      let preview = null;
      for (let i = 0; i < 40 && !preview; i++) { await t.sleep(250); preview = t.windows().find((w) => w !== t.win); }
      t.check('The Print Preview window opens', !!preview);
      if (preview) { await t.sleep(3000); await t.shot('print-preview', preview); preview.close(); }
    },
  },
  {
    name: 'whats-new', group: 'General', title: 'What\'s New after an update, once',
    route: 'home',
    async run(t) {
      const ver = await t.js('return (await window.e2k.appInfo()).version;');
      // As if the last version seen was 0.4: What's New shows after the page loads again.
      await t.js(`localStorage.setItem('e2k.whatsNewSeen', JSON.stringify('0.4'));`);
      t.win.webContents.reload();
      const shown = await t.waitFor('document.querySelector(".dialog.whatsnew")', 10000);
      const text = shown ? await t.js('return document.querySelector(".dialog.whatsnew").innerText;') : '';
      t.check('What\'s New shows after an update', shown);
      t.check('It names this version', text.includes(ver.split('.').slice(0, 2).join('.')), `${ver}: ${text.slice(0, 80)}`);
      await t.shot('whats-new');
      t.win.webContents.reload();
      await t.sleep(4000);
      t.check('It doesn\'t show again', !(await t.js('return !!document.querySelector(".dialog.whatsnew");')));
    },
  },

  // ---------- offline library: downloading ----------
  {
    name: 'library-window', group: 'Offline library', title: 'The Offline Library window and Kiwix\'s catalog',
    route: 'home', env: { E2K_LIBRARY_TEST: '1' },
    async run(t) {
      await openLibrary(t);
      t.check('Kiwix\'s catalog loads (every pack has a size)', await t.waitFor('[...document.querySelectorAll(".offline .pack .size")].filter((e) => /GB|MB/.test(e.textContent)).length >= 5', 20000));
      const text = await t.js('return document.querySelector(".offline").innerText;');
      t.check('Essentials is described as 220,000 articles', text.includes('220,000'));
      t.check('No library yet', /No offline library yet/.test(text));
      t.check('The Support Kiwix button is there', text.includes('Support Kiwix'));
      await t.shot('offline-library');
    },
  },
  {
    name: 'download', group: 'Offline library', title: 'Download a library (Ray Charles, 3 MB) and read from it',
    route: 'home', env: { E2K_LIBRARY_TEST: '1' },
    async run(t) {
      await openLibrary(t);
      await t.waitFor(`${label('Download')} && document.querySelectorAll('.offline .pack .size').length >= 5`, 20000);
      const r = await t.js('return await window.e2k.library.download("test");');
      t.check('The download starts', !r.error, r.error || '');
      const s = await waitInstalled(t);
      t.check('It finishes and installs', s.current && s.current.pack === 'test', s.download ? `${s.download.status} ${s.download.error || ''}` : '');
      if (!s.current) return;
      const file = path.join(s.dir, s.current.file);
      t.check('The file is complete', fs.existsSync(file) && fs.statSync(file).size === s.current.size, `${fs.existsSync(file) ? fs.statSync(file).size : 'missing'} of ${s.current.size}`);
      t.check('No partial file is left', !libFiles(s.dir).some((f) => f.endsWith('.part')));
      t.check('The library opens', s.open && s.open.articles > 0, JSON.stringify(s.open));
      t.check('Its article is found', !!(await t.js('return await window.e2k.library.find("Ray Charles");')));
      await t.shot('installed');
      t.result = s;
    },
    after(ctx) {
      // Keep the library for the scenarios that need one (saves downloading it again and again).
      const lib = JSON.parse(fs.readFileSync(path.join(ctx.profile, 'library.json'), 'utf8'));
      if (!lib.current) return;
      const dir = lib.dir ? path.resolve(ctx.profile, lib.dir) : path.join(ctx.profile, 'Library');
      fs.mkdirSync(ctx.fixtures, { recursive: true });
      fs.copyFileSync(path.join(dir, lib.current.file), path.join(ctx.fixtures, lib.current.file));
      fs.writeFileSync(path.join(ctx.fixtures, 'fixture.json'), JSON.stringify(lib.current));
    },
  },
  {
    name: 'pause', group: 'Offline library', title: 'Pause a download, quit, and start again: it stays paused',
    route: 'home', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      await openLibrary(t);
      await t.waitFor('document.querySelectorAll(".offline .pack .size").length >= 5', 20000);
      await t.js('window.e2k.library.download("test");');
      if (!(await whenPartway(t))) return t.skip('Paused partway', 'the download finished before it could be paused (fast connection)');
      await t.js('await window.e2k.library.pause();');
      const s = await t.lib();
      t.check('It pauses', s.download && s.download.status === 'paused', s.download && s.download.status);
      await t.shot('paused');
    },
  },
  {
    name: 'pause-restart', group: 'Offline library', title: '…after the restart: still paused, then Resume finishes it',
    route: 'home', reuse: 'pause', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      let s = await t.lib();
      if (!s.download) return t.skip('Still paused', 'nothing was paused (see "pause")');
      await t.sleep(6000);                    // an interrupted download would resume after 4 seconds; a paused one mustn't
      s = await t.lib();
      t.check('It stays paused', s.download && s.download.status === 'paused', s.download && s.download.status);
      await openLibrary(t);
      await t.shot('still-paused');
      await t.js('window.e2k.library.download("test");');
      s = await waitInstalled(t);
      t.check('Resume finishes it', s.current && !s.download);
      t.check('No partial file is left', !libFiles(s.dir).some((f) => f.endsWith('.part')));
    },
  },
  {
    name: 'interrupt', group: 'Offline library', title: 'The app closes mid-download (like a crash)…',
    route: 'home', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      await openLibrary(t);
      await t.waitFor('document.querySelectorAll(".offline .pack .size").length >= 5', 20000);
      await t.js('window.e2k.library.download("test");');
      if (!(await whenPartway(t))) return t.skip('Closed partway', 'the download finished first (fast connection)');
      t.check('The app closed partway through', true);
      t.crash();
    },
  },
  {
    name: 'interrupt-restart', group: 'Offline library', title: '…and picks up where it left off by itself',
    route: 'home', reuse: 'interrupt', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      let s = await t.lib();
      if (!s.download) return t.skip('Resumes by itself', 'nothing was interrupted (see "interrupt")');
      const resumed = await t.waitFor('(async () => { const s = await window.e2k.library.state(); return s.download && s.download.status === "downloading" || s.current; })()', 12000);
      t.check('It resumes by itself within a few seconds', resumed);
      s = await waitInstalled(t);
      t.check('It finishes', s.current && !s.download, s.download && s.download.status);
      t.check('No partial file is left', !libFiles(s.dir).some((f) => f.endsWith('.part')));
    },
  },
  {
    name: 'cancel', group: 'Offline library', title: 'Cancel a download',
    route: 'home', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      await openLibrary(t);
      await t.waitFor('document.querySelectorAll(".offline .pack .size").length >= 5', 20000);
      await t.js('window.e2k.library.download("test");');
      if (!(await whenPartway(t))) return t.skip('Cancelled partway', 'the download finished first (fast connection)');
      t.check('Change… is greyed out during the download', await t.js('return [...document.querySelectorAll(".offline .where button")][0].disabled && !document.querySelector(".wherenote").hidden;'));
      const tops = await t.js('return [...document.querySelectorAll(".offline .pack.dl .acts button")].map((b) => Math.round(b.getBoundingClientRect().top));');
      t.check('Pause and Cancel are side by side', tops.length === 2 && Math.abs(tops[0] - tops[1]) <= 2, tops.join(', '));
      await t.shot('downloading');
      await t.js('await window.e2k.library.cancel();');
      await t.sleep(500);
      const s = await t.lib();
      t.check('The download is gone', !s.download);
      t.check('Its partial file is deleted', !libFiles(s.dir).some((f) => f.endsWith('.part')), libFiles(s.dir).join(', '));
    },
  },
  {
    name: 'low-space', group: 'Offline library', title: 'Not enough space: packs greyed out with the reason',
    route: 'home', env: { E2K_LIBRARY_TEST: '1', E2K_FAKE_FREE: String(3e9) },
    async run(t) {
      await openLibrary(t);
      await t.waitFor('document.querySelectorAll(".offline .pack .size").length >= 5', 20000);
      await t.sleep(800);
      const off = await t.js('return [...document.querySelectorAll(".offline .pack.off")].map((p) => p.querySelector(".why")?.textContent || "");');
      t.check('Packs that don\'t fit are greyed out', off.length >= 2, `${off.length} greyed`);
      t.check('Each says why', off.every((w) => /Needs|Too big/.test(w)), off.join(' / '));
      await t.shot('low-space');
    },
  },
  {
    name: 'unwritable', group: 'Offline library', title: 'A folder files can\'t be saved in is refused',
    route: 'home',
    env: { E2K_LIBRARY_TEST: '1', E2K_TEST_CHOOSE_DIR: process.platform === 'win32' ? 'C:\\' : '/' },
    async run(t) {
      await openLibrary(t);
      const r = await t.js('return await window.e2k.library.chooseDir();');
      t.check('It says files can\'t be saved there', /can’t save files/.test(r.error || ''), r.error || 'no error');
    },
  },

  // ---------- offline library: moving ----------
  {
    name: 'move', group: 'Offline library', title: 'Move the library to another folder on the same drive',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')) }),
    async run(t) {
      const to = path.join(t.profile, 'Moved here');
      fs.mkdirSync(to, { recursive: true });
      process.env.E2K_TEST_CHOOSE_DIR = to;  // read by library.js in this process
      const before = await t.lib();
      const r = await t.js('return await window.e2k.library.chooseDir();');
      t.check('No error', !r.error, r.error || '');
      t.check('The folder is the new one', path.resolve(r.dir) === path.resolve(to), r.dir);
      t.check('The file moved', fs.existsSync(path.join(to, before.current.file)) && !fs.existsSync(path.join(before.dir, before.current.file)));
      t.check('The library still opens', !!r.open && !!(await t.js('return await window.e2k.library.find("Ray Charles");')));
    },
  },
  {
    name: 'move-copy', group: 'Offline library', title: 'Move to another drive (copied in the background)',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1', E2K_TEST_COPY_MOVE: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')) }),
    async run(t) {
      const to = path.join(t.profile, 'Other drive');
      fs.mkdirSync(to, { recursive: true });
      process.env.E2K_TEST_CHOOSE_DIR = to;
      const before = await t.lib();
      await openLibrary(t);
      await t.js('window.e2k.library.chooseDir();');
      const ok = await t.waitFor('(async () => { const s = await window.e2k.library.state(); return !s.move && s.dir.endsWith("Other drive"); })()', 30000);
      const s = await t.lib();
      t.check('The move finishes', ok, s.dir);
      t.check('The library is in the new folder, and the old copy is gone', fs.existsSync(path.join(to, before.current.file)) && !fs.existsSync(path.join(before.dir, before.current.file)));
      t.check('No temporary copy is left', !libFiles(to).some((f) => f.endsWith('.moving')));
      t.check('The library still opens', !!s.open);
      await t.shot('moved');
    },
  },
  {
    name: 'move-fail', group: 'Offline library', title: 'A move that fails leaves the library where it was',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1', E2K_TEST_COPY_MOVE: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')) }),
    async run(t) {
      const to = path.join(t.profile, 'Blocked');
      const before = await t.lib();
      fs.mkdirSync(path.join(to, before.current.file + '.moving'), { recursive: true });   // a folder in the way of the copy
      process.env.E2K_TEST_CHOOSE_DIR = to;
      await openLibrary(t);
      await t.js('window.e2k.library.chooseDir();');
      const shown = await t.waitFor('/couldn’t be moved/.test(document.querySelector(".offline .oerr")?.textContent || "")', 15000);
      const s = await t.lib();
      t.check('It says the library couldn\'t be moved', shown);
      t.check('The library stays where it was, and still opens', path.resolve(s.dir) === path.resolve(before.dir) && !!s.open);
      await t.shot('move-failed');
    },
  },

  // ---------- offline library: missing ----------
  {
    name: 'missing-at-launch', group: 'Offline library', title: 'Start with the library\'s drive missing, then Forget it',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: { ...ctx.fixtureIn(null), dir: path.join(ctx.profile, 'Unplugged drive') }, settings: { offlineMode: true } }),
    async run(t) {
      t.check('The light says the library can\'t be found', await t.waitFor('/Library not found/.test(document.getElementById("net").textContent)', 8000), await t.net());
      t.check('Offline mode stays on', await t.js('return window.e2k.net.offline();'));
      t.check('Home says the library can\'t be found', await t.waitFor('/can’t be found/.test(document.querySelector(".home")?.innerText || "")', 10000));
      await t.shot('home-missing');
      await openLibrary(t);
      const text = await t.js('return document.querySelector(".offline").innerText;');
      t.check('The window says it can\'t be found, with Forget…', /can’t be found/.test(text) && /NOT FOUND/.test(text) && /Forget…/.test(text));
      await t.shot('window-missing');
      await t.js(`${label('Forget…')}.click();`);
      await t.sleep(400);
      await t.js(`${label('Forget')}.click();`);
      await t.sleep(800);
      const s = await t.lib();
      t.check('Forget leaves no library', !s.current && !s.missing);
      t.check('…and the app goes back online', !(await t.js('return window.e2k.net.offline();')), await t.net());
    },
  },
  {
    name: 'unplug', group: 'Offline library', title: 'The library\'s drive is unplugged and plugged back in',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'USB stick')), settings: { offlineMode: true } }),
    async run(t) {
      const s = await t.lib();
      const file = path.join(s.dir, s.current.file);
      await t.sleep(1500);
      fs.renameSync(file, file + '.away');
      t.check('Unplugged: the light shows it within a few seconds', await t.waitFor('/Library not found/.test(document.getElementById("net").textContent)', 8000), await t.net());
      await t.shot('unplugged');
      fs.renameSync(file + '.away', file);
      t.check('Plugged back in: it opens again by itself', await t.waitFor('(async () => { const s = await window.e2k.library.state(); return !!s.open && !s.missing; })()', 10000));
      t.check('The light is back to Offline', await t.waitFor('document.getElementById("net").textContent.trim() === "Offline"', 4000), await t.net());
    },
  },
  {
    name: 'found-elsewhere', group: 'Offline library', title: 'A missing library found in another folder with Change…',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => {
      ctx.fixtureIn(path.join(ctx.profile, 'Moved by hand'));
      return { library: { ...ctx.fixtureIn(null), dir: path.join(ctx.profile, 'Where it was') } };
    },
    async run(t) {
      process.env.E2K_TEST_CHOOSE_DIR = path.join(t.profile, 'Moved by hand');
      t.check('It starts out missing', !!(await t.lib()).missing);
      const r = await t.js('return await window.e2k.library.chooseDir();');
      t.check('Change… finds it there', !r.missing && !!r.open && r.dir.endsWith('Moved by hand'), r.error || r.dir);
    },
  },

  {
    name: 'open-file', group: 'Offline library', title: 'Open library file…: use your own file where it is, then Stop using it',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'My Kiwix files')); return {}; },
    async run(t) {
      const mine = path.join(t.profile, 'My Kiwix files'), before = await t.lib();
      const file = libFiles(mine).find((f) => f.endsWith('.zim'));
      process.env.E2K_TEST_OPEN_FILE = path.join(mine, file);  // read by library.js in this process
      await openLibrary(t);
      t.check('No library yet, with Open library file…', !!(await t.js(`return !!${label('Open library file…')};`)));
      await t.js(`${label('Open library file…')}.click();`);
      t.check('It\'s installed', await t.waitFor('(async () => !!(await window.e2k.library.state()).open)()', 8000));
      const s = await t.lib();
      t.check('It\'s marked as your own file', !!(s.current && s.current.own));
      t.check('It\'s used where it is (the folder is yours; nothing copied)', path.resolve(s.dir) === path.resolve(mine) && !libFiles(before.dir).some((f) => f.endsWith('.zim')), s.dir);
      t.check('Its article is found', !!(await t.js('return await window.e2k.library.find("Ray Charles");')));
      const text = await t.js('return document.querySelector(".offline").innerText;');
      t.check('The window shows YOUR FILE and Stop using…', /YOUR FILE/.test(text) && /Stop using…/.test(text) && !/Remove…/.test(text));
      t.check('The folder is labeled Library folder', /Library folder/.test(text));
      await t.shot('your-file');
      await t.js(`${label('Stop using…')}.click();`);
      await t.sleep(400);
      await t.js(`${label('Stop using')}.click();`);
      await t.sleep(800);
      const after = await t.lib();
      t.check('Stop using leaves no library', !after.current && !after.open);
      t.check('…and your file is still there', fs.existsSync(path.join(mine, file)));
      t.check('…and downloads go back to the app\'s folder', path.resolve(after.dir) === path.resolve(before.dir), after.dir);
    },
  },
  {
    name: 'open-file-replace', group: 'Offline library', title: 'Open your own file instead of a library the app downloaded (asks first)',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'My Kiwix files')); return { library: ctx.fixtureIn(path.join(ctx.profile, 'Library')) }; },
    async run(t) {
      const mine = path.join(t.profile, 'My Kiwix files'), before = await t.lib();
      const old = path.join(before.dir, before.current.file);
      process.env.E2K_TEST_OPEN_FILE = path.join(mine, before.current.file);
      await openLibrary(t);
      await t.js(`${label('Change library…')}.click();`);
      await t.sleep(300);
      await t.js(`${label('Open library file…')}.click();`);
      t.check('It asks first', await t.waitFor(`!!${label('Use my file')}`, 4000), await t.js('return document.querySelector(".dialog:not(.offline) h2")?.textContent || "";'));
      await t.sleep(400);
      await t.shot('asks');
      await t.js(`${label('Use my file')}.click();`);
      t.check('Your file is used', await t.waitFor('(async () => { const s = await window.e2k.library.state(); return !!(s.current && s.current.own && s.open); })()', 8000));
      t.check('The downloaded copy is deleted', !fs.existsSync(old));
      t.check('Your file is still there', fs.existsSync(path.join(mine, before.current.file)));
    },
  },
  {
    name: 'open-file-bad', group: 'Offline library', title: 'A file that isn\'t a library is refused',
    route: 'home', env: { E2K_LIBRARY_TEST: '1' },
    async run(t) {
      const bad = path.join(t.profile, 'notes.zim');
      fs.writeFileSync(bad, 'Not a library.');
      process.env.E2K_TEST_OPEN_FILE = bad;
      await openLibrary(t);
      await t.js(`${label('Open library file…')}.click();`);
      t.check('It says why', await t.waitFor('/can’t be opened as a library/.test(document.querySelector(".offline .oerr")?.textContent || "")', 4000));
      t.check('Nothing changes', !(await t.lib()).current);
      await t.shot('refused');
    },
  },
  {
    name: 'other-library', group: 'Offline library', title: 'A Wikipedia library that isn\'t one of the four gets its own row',
    // Without E2K_LIBRARY_TEST the Ray Charles library isn't one of the packs.
    route: 'home', needs: 'fixture',
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'My Kiwix files')); return {}; },
    async run(t) {
      const mine = path.join(t.profile, 'My Kiwix files');
      process.env.E2K_TEST_OPEN_FILE = path.join(mine, libFiles(mine).find((f) => f.endsWith('.zim')));
      await openLibrary(t);
      await t.js(`${label('Open library file…')}.click();`);
      t.check('It\'s installed', await t.waitFor('(async () => !!(await window.e2k.library.state()).open)()', 8000));
      const s = await t.lib();
      t.check('It\'s named from the file', s.current && s.current.pack === 'other' && s.current.label === 'Wikipedia: Ray Charles', JSON.stringify(s.current));
      await t.sleep(500);
      const text = await t.js('return document.querySelector(".offline").innerText;');
      t.check('The window shows its row, installed', /Wikipedia: Ray Charles is installed/.test(text) && /INSTALLED/.test(text) && /Change library…/.test(text), text.slice(0, 300));
      await t.shot('other-library');
    },
  },
  ...[['update-own-delete', 'Delete it when done', false], ['update-own-keep', 'Keep it', true]].map(([name, answer, kept]) => ({
    name, group: 'Offline library', title: `Update your own file to a newer edition: “${answer}”`,
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    // Your own copy of an older edition (the test library under an earlier date), so an update is offered.
    setup: (ctx) => {
      const mine = path.join(ctx.profile, 'My Kiwix files'), f = ctx.fixtureIn(mine).current;
      const older = f.file.replace(/_\d{4}-\d{2}\.zim$/, '_2020-01.zim');
      fs.renameSync(path.join(mine, f.file), path.join(mine, older));
      return { library: { dir: mine, current: { ...f, file: older, date: '2020-01-01', own: true }, download: null, checked: 0 } };
    },
    async run(t) {
      const before = await t.lib(), old = path.join(before.dir, before.current.file);
      await openLibrary(t);
      t.check('An update is offered', await t.waitFor(`!!${label('Update')}`, 20000));
      await t.js(`${label('Update')}.click();`);
      t.check('It asks about your old file', await t.waitFor(`!!${label(answer)}`, 4000));
      await t.sleep(400);
      await t.shot('asks');
      await t.js(`${label(answer)}.click();`);
      const s = await waitInstalled(t);
      t.check('The new edition is installed', !!(s.current && !/2020-01/.test(s.current.file) && s.open), JSON.stringify(s.current));
      t.check(kept ? 'Your old file is kept' : 'Your old file is deleted', fs.existsSync(old) === kept);
    },
  })),
  {
    name: 'folder-has-library', group: 'Offline library', title: 'Change… picks a folder that already has a library: it\'s used',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'Old library')); return {}; },
    async run(t) {
      process.env.E2K_TEST_CHOOSE_DIR = path.join(t.profile, 'Old library');
      const r = await t.js('return await window.e2k.library.chooseDir();');
      t.check('The library in it is used', !!(r.current && r.open) && r.dir.endsWith('Old library'), r.error || JSON.stringify(r.current));
    },
  },

  {
    name: 'portable-readonly', group: 'Offline library', title: 'The portable version in a folder it can’t save to',
    route: 'home', env: { E2K_LIBRARY_TEST: '1', PORTABLE_EXECUTABLE_DIR: process.platform === 'win32' ? process.env.WINDIR : '/' },
    async run(t) {
      const s = await t.lib();
      t.check('It falls back to the computer’s app-data folder', s.portableFallback === true);
      await openLibrary(t);
      t.check('The Offline Library window says so', await t.js('return !document.querySelectorAll(".offline .wherenote")[1].hidden && /can’t save to/.test(document.querySelector(".offline").innerText);'));
      await t.shot('portable-fallback');
    },
  },

  // ---------- macOS ----------
  {
    name: 'mac-wording', group: 'General', title: 'Mac: menu names, shortcut style, and paths', only: 'darwin',
    route: 'home', env: { E2K_LIBRARY_TEST: '1' },
    async run(t) {
      await t.js(`localStorage.setItem('e2k.whatsNewSeen', JSON.stringify('0.4'));`);
      t.win.webContents.reload();
      await t.waitFor('document.querySelector(".dialog.whatsnew")', 10000);
      const wn = await t.js('return document.querySelector(".dialog.whatsnew")?.innerText || "";');
      t.check('What’s New says Encyclopedia 2000 › Offline Library, not Tools', /Encyclopedia 2000 › Offline Library/.test(wn) && !/Tools ›/.test(wn));
      t.check('…and ⌘F', /⌘F/.test(wn));
      await t.js('document.querySelector(".dialog.whatsnew .go:last-child")?.click();');
      await t.command('Keyboard Shortcuts', '/');
      await t.waitFor('document.querySelector(".dialog.keys")', 4000);
      const keys = await t.js('return [...document.querySelectorAll(".dialog.keys kbd")].map((k) => k.textContent);');
      if (keys.length) {
        t.check('Shortcuts are written the Mac way (⇧⌘P, ⌘F)', keys.includes('⇧⌘P') && keys.includes('⌘F'), keys.slice(0, 8).join(' '));
        t.check('No "+" between keys', !(await t.js('return [...document.querySelectorAll(".dialog.keys .kplus")].some((k) => k.textContent.trim() === "+");')));
        await t.shot('shortcuts');
      } else t.skip('Shortcuts dialog', 'couldn’t open it from the test (macOS shortcuts come from the menu bar)');
      await openLibrary(t);
      const where = await t.js('return document.querySelector(".offline .where code").textContent;');
      t.check('The library folder starts with ~', where.startsWith('~/'), where);
    },
  },

  // ---------- reading offline ----------
  {
    name: 'no-connection', group: 'Reading offline', title: 'No connection (while Windows still says online): the library takes over',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    switches: ['host-resolver-rules=MAP * ~NOTFOUND'],
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')) }),
    async run(t) {
      await t.js('E2K.openArticle("Ray Charles");');
      t.check('An article opens from the library', await t.waitFor('/Ray Charles/.test(document.querySelector("h1")?.textContent || "") && document.querySelector(".page .text p")', 15000));
      t.check('The light says No connection · Library', await t.waitFor('/No connection · Library/.test(document.getElementById("net").textContent)', 5000), await t.net());
      await t.shot('no-connection');
      await t.js('const q = document.getElementById("q"); q.focus(); q.value = "ray"; q.dispatchEvent(new Event("input", { bubbles: true }));');
      t.check('Find suggests articles from the library', await t.waitFor('document.querySelectorAll("#suggest .si").length >= 1', 8000));
    },
  },
  {
    name: 'offline-mode', group: 'Reading offline', title: 'Offline mode loads nothing from the internet',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')), settings: { offlineMode: true } }),
    async run(t) {
      const count = await t.countNetwork();
      t.check('The light says Offline', /^Offline$/.test((await t.net()).trim()), await t.net());
      await t.js('E2K.go("home");');
      t.check('Home picks from the library', await t.waitFor('/FROM YOUR OFFLINE LIBRARY|Today’s discovery/.test(document.querySelector(".home")?.innerText || "")', 15000));
      await t.shot('home-offline');
      await t.js('E2K.openArticle("Ray Charles");');
      t.check('An article opens from the library', await t.waitFor('/Ray Charles/.test(document.querySelector("h1")?.textContent || "") && document.querySelector(".page .text p")', 15000));
      await t.shot('article-offline');
      for (const r of ['game/starchart', 'activity/solar-system', 'activity/periodic-table', 'gallery']) { await t.js(`E2K.go(${JSON.stringify(r)});`); await t.sleep(2500); }
      const net = count();
      t.check('Nothing came from the internet', net.n === 0, net.n ? `${net.n}: ${net.urls.join(' ')}` : '');
    },
  },
  {
    name: 'not-in-library', group: 'Reading offline', title: 'An article that isn’t in the library links to related ones that are',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')), settings: { offlineMode: true } }),
    async run(t) {
      await t.js('E2K.openArticle("Ray Charles fan club");');
      t.check('It says the article isn’t in the library', await t.waitFor('/isn’t in the offline library/.test(document.querySelector(".errbox")?.innerText || "")', 10000));
      t.check('Related articles in the library are listed', await t.waitFor('document.querySelectorAll(".errbox .inlib a").length >= 1', 8000));
      t.check('The old search button is gone', !(await t.js('return /Search the offline library/.test(document.querySelector(".errbox").innerText);')));
      await t.sleep(800);                     // the page fades in
      await t.shot('not-in-library');
      const first = await t.js('const a = document.querySelector(".errbox .inlib a"); a.click(); return a.textContent;');
      t.check('A related article opens', await t.waitFor('(document.querySelector("h1")?.textContent || "").trim() === ' + JSON.stringify(first), 10000), first);
    },
  },
  {
    name: 'offline-mode-restart', group: 'Reading offline', title: '…and Offline mode is remembered after a restart',
    route: 'home', reuse: 'offline-mode', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    async run(t) {
      t.check('Still in Offline mode', /^Offline$/.test((await t.net()).trim()), await t.net());
    },
  },
];
