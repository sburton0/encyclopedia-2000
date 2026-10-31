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
// Whether a saved file is a picture (JPEG, PNG, GIF, WebP, or SVG), from its first bytes, and its size.
const savedPicture = (file) => {
  try { const b = fs.readFileSync(file); return { size: b.length, picture: /^(\xff\xd8\xff|\x89PNG|GIF8|RIFF....WEBP|<\?xml|<svg)/.test(b.subarray(0, 16).toString('latin1')) }; } catch { return { size: 0, picture: false }; }
};
// Waits for a saved file to appear.
const savedFile = async (t, file) => { for (let i = 0; i < 100 && !fs.existsSync(file); i++) await t.sleep(200); await t.sleep(300); return savedPicture(file); };

const KNOTS = 'wikipedia_en_knots';            // 18 MB: big enough to pause or quit partway (Ray Charles is one piece)
const label = (q) => `[...document.querySelectorAll('.offline .packs button, .dialog .go')].find((b) => b.textContent.trim() === ${JSON.stringify(q)})`;
const openLibrary = async (t) => { await t.js('E2KLibrary.open(E2K);'); await t.waitFor('document.querySelector(".offline .status")'); await t.sleep(1200); };
// The page showing an article (while one page fades into the next, both are in the window).
const pageOf = (title) => `[...document.querySelectorAll(".page")].find((p) => (p.querySelector("h1")?.textContent || "").trim() === ${JSON.stringify(title)})`;
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
    name: 'scroll-and-top', group: 'General', title: 'Back returns to where you were; the Top button and the Home key',
    route: 'article/Apollo%2011',
    async run(t) {
      const opened = (title) => t.waitFor(`${pageOf(title)}?.querySelectorAll(".text p").length > 5`, 20000);
      const top = () => t.js('return document.querySelector(".content.article").scrollTop;');
      t.check('The article opens', await opened('Apollo 11'));
      t.check('No Top button at the top', !(await t.js('return !!document.querySelector(".totop.show");')));
      await t.js('document.querySelector(".content.article").scrollTo({ top: 3000, behavior: "instant" });');
      t.check('The Top button appears after scrolling down', await t.waitFor('document.querySelector(".totop.show")', 3000));
      const gaps = await t.js(`const b = document.querySelector(".totop").getBoundingClientRect(), c = document.querySelector(".content.article"), r = c.getBoundingClientRect();
        return { right: Math.round(r.left + c.clientWidth - b.right), bottom: Math.round(r.bottom - b.bottom) };`);
      t.check('The same space below it as to its right', gaps.right === gaps.bottom, JSON.stringify(gaps));
      await t.sleep(400);
      await t.shot('top-button');
      await t.js('E2K.openArticle("Moon");');
      t.check('A link opens another article at the top', await opened('Moon') && (await top()) === 0);
      await t.command('Back', 'ArrowLeft', { altKey: true });
      t.check('Back returns to the first article', await opened('Apollo 11'));
      await t.sleep(1500);
      const y = await top();
      t.check('…where it was scrolled to', Math.abs(y - 3000) < 5, y);
      // With animations off (Options), so it jumps: a smooth scroll can stall while the test window is in the background.
      await t.js(`localStorage.setItem('e2k.animations', 'false');`);
      await t.js('document.querySelector(".totop").click();');
      t.check('The Top button goes to the top', await t.waitFor('document.querySelector(".content.article").scrollTop === 0', 4000),
        JSON.stringify(await t.js('return { y: document.querySelector(".content.article").scrollTop, pages: document.querySelectorAll(".page").length, tops: document.querySelectorAll(".totop").length, anim: localStorage.getItem("e2k.animations") };')));
      await t.js('document.querySelector(".content.article").scrollTo({ top: 2000, behavior: "instant" });');
      await t.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));');
      t.check('Home goes to the top', await t.waitFor('document.querySelector(".content.article").scrollTop === 0', 4000), await top());
      await t.js(`localStorage.setItem('e2k.theme', JSON.stringify('classic')); E2K.applyPrefs();`);
      await opened('Apollo 11');
      await t.sleep(1000);
      t.check('Classic: the subtitle isn’t cut off', await t.js('const d = document.querySelector(".band .desc"); return d.textContent.length > 0 && d.scrollHeight <= d.clientHeight;'));
    },
  },
  {
    name: 'article-speed', group: 'General', title: 'Articles come from Wikipedia’s ready copy (no Accept-Language header), and how long they take',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 15000);
      const wc = t.win.webContents;
      const sent = {};
      wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Network.enable');
      wc.debugger.on('message', (_e, m, p) => {
        if (m === 'Network.requestWillBeSentExtraInfo' && /en\.wikipedia\.org/.test(p.headers[':authority'] || p.headers.host || '')) {
          sent[p.headers[':path'] || ''] = Object.keys(p.headers).some((k) => k.toLowerCase() === 'accept-language');
        }
      });
      const times = [];
      for (const title of ['Moon', 'Cat', 'United States']) {
        await t.js(`performance.clearMarks(); E2K.openArticle(${JSON.stringify(title)});`);
        await t.waitFor('performance.getEntriesByName("article:done").length', 20000);
        times.push(`${title} ${Math.round(await t.js('const m = (n) => performance.getEntriesByName("article:" + n)[0]?.startTime; return m("done") - m("start");'))} ms`);
      }
      const pages = Object.entries(sent).filter(([p]) => p.includes('/page/html/'));
      t.check('Article requests to Wikipedia carry no Accept-Language header', pages.length >= 3 && pages.every(([, lang]) => !lang),
        pages.map(([p, lang]) => `${p.split('/').pop()}: ${lang ? 'sent' : 'none'}`).join(', '));
      t.check('Each article is ready within 3 seconds', times.every((x) => Number(x.split(' ').at(-2)) < 3000), times.join(', '));
    },
  },
  {
    name: 'right-click', group: 'General', title: 'The right-click menu: on the page, selected text, a link, a picture, and the Find box; Edit › Copy',
    route: 'article/Moon',
    async run(t) {
      const opened = (title) => t.waitFor(`${pageOf(title)}?.querySelectorAll(".text p").length > 5`, 20000);
      // Right-clicks the element the expression finds (at its middle, or at x, y), and returns the menu's items.
      const ctx = (el, at = '') => t.js(`const el = ${el}; const r = el.getBoundingClientRect();
        const [x, y] = ${at || '[r.left + r.width / 2, r.top + r.height / 2]'};
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));
        return [...document.querySelectorAll('.menu.ctx .mi')].map((m) => m.firstChild.textContent + (m.classList.contains('disabled') ? ' (off)' : ''));`);
      // Picks a menu item as a mouse does (mousedown, then click), which leaves the selection alone.
      const pick = (label) => t.js(`const m = [...document.querySelectorAll('.menu.ctx .mi')].find((m) => m.firstChild.textContent.startsWith(${JSON.stringify(label)}));
        m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); m.click();`);
      // Waits up to 2 seconds for the clipboard to hold this text.
      const clipped = async (want) => { for (let i = 0; i < 20; i++) { if (String(await t.clipText()).trim() === want) return true; await t.sleep(100); } return false; };
      const page = `${pageOf('Moon')}`;
      t.check('The article opens', await opened('Moon'));
      await t.sleep(800);
      const blank = await ctx(`${page}.querySelector('.content.article')`, '[r.left + 6, r.top + 120]');
      t.check('On the page: Back, Forward, Back to the Top, Select All, Find, Print',
        ['Back (off)', 'Forward (off)', 'Back to the Top', 'Select All', 'Find in Article…', 'Print Preview…', 'Print…'].every((l) => blank.includes(l)), blank.join(', '));
      const box = await t.js(`const m = document.querySelector('.menu.ctx'), r = m.getBoundingClientRect();
        return { size: getComputedStyle(m).fontSize, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };`);
      t.check('It’s the menus’ size (12 px), inside the window', box.size === '12px' && box.inside, JSON.stringify(box));
      await t.sleep(300);                     // drawn before the screenshot
      await t.shot('right-click-page');
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      t.check('Escape closes it', !(await t.js('return !!document.querySelector(".menu.ctx");')));

      // Selected text: Copy and Look Up, which searches for it.
      const words = await t.js(`const p = [...${page}.querySelectorAll('.text p')].find((p) => p.textContent.length > 200);
        const n = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().split(' ').length > 3);
        const s = n.textContent.indexOf(' ') + 1, w = n.textContent.slice(s).split(' ').slice(0, 2).join(' ');
        const r = document.createRange(); r.setStart(n, s); r.setEnd(n, s + w.length);
        getSelection().removeAllRanges(); getSelection().addRange(r); window.__sel = r; return w.trim();`);
      const text = await ctx(`${page}.querySelector('.text')`, '(() => { const b = window.__sel.getBoundingClientRect(); return [b.left + 2, b.top + 2]; })()');
      await t.sleep(300);
      t.check('On selected text: Copy and Look Up', text.includes('Copy') && text.includes(`Look Up “${words}”`), text.join(', '));
      await t.shot('right-click-text');
      t.setClip('');
      await pick('Copy');
      t.check('Copy copies the selected words', await clipped(words), await t.clipText());
      await ctx(`${page}.querySelector('.text')`, '(() => { const b = window.__sel.getBoundingClientRect(); return [b.left + 2, b.top + 2]; })()');
      await pick('Look Up');
      t.check('Look Up searches for the words', await t.waitFor(`document.querySelector('.band h1')?.textContent.includes(${JSON.stringify(words)})`, 15000));

      // A link: Open opens the article.
      await t.command('Back', 'ArrowLeft', { altKey: true });
      t.check('(Back to the article)', await opened('Moon'));
      await t.sleep(800);
      const link = `${pageOf('Moon')}.querySelector('.text p a[data-title]')`;
      const title = await t.js(`return ${link}.dataset.title;`);
      const onLink = await ctx(link);
      t.check('On a link: Open, Open on Wikipedia, Copy Link', ['Open', 'Open on Wikipedia', 'Copy Link'].every((l) => onLink.includes(l)), onLink.join(', '));
      await pick('Copy Link');
      t.check('Copy Link copies its Wikipedia address', await clipped(`https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`), await t.clipText());
      await ctx(link);
      await pick('Open');
      t.check('Open opens the linked article', await opened(title), title);

      // A picture: View Picture opens it.
      await t.command('Back', 'ArrowLeft', { altKey: true });
      await opened('Moon');
      await t.sleep(800);
      const onPic = await ctx(`${pageOf('Moon')}.querySelector('.media img')`);
      t.check('On a picture: View Picture, Copy Picture, Save Picture As…', ['View Picture', 'Copy Picture', 'Save Picture As…'].every((l) => onPic.includes(l)), onPic.join(', '));
      t.setClip('');
      await pick('Copy Picture');
      let pic = false;
      for (let i = 0; i < 30 && !pic; i++) { await t.sleep(100); pic = await t.clipImage(); }
      t.check('Copy Picture copies the picture', pic);
      // Save Picture As… downloads the full picture (the Save dialog is answered by the test).
      const saved = path.join(t.out, 'saved-lead.jpg');
      t.saveTo(saved);
      await ctx(`${pageOf('Moon')}.querySelector('.media img')`);
      await pick('Save Picture As…');
      const lead = await savedFile(t, saved);
      t.check('Save Picture As… saves the picture', lead.picture, JSON.stringify(lead));
      t.check('…the full picture, not the small copy', lead.size > 150000, lead.size);
      t.check('…suggesting the picture’s own name', /^[^/]+\.(jpe?g|png)$/i.test(t.saveAsked[0] || '') && !/px-/.test(t.saveAsked[0]), t.saveAsked[0]);
      t.check('…and says so', await t.waitFor('/Picture saved/.test(document.querySelector("#status")?.textContent || document.body.innerText)', 4000));
      await ctx(`${pageOf('Moon')}.querySelector('.media img')`);
      await pick('View Picture');
      t.check('View Picture opens it', await t.waitFor('document.querySelector(".overlay img")', 5000));
      // In the enlarged picture: Copy Picture and Save Picture As….
      await t.waitFor('document.querySelector(".overlay img")?.complete', 8000);
      const inViewer = await ctx(`document.querySelector('.overlay img')`);
      t.check('On an enlarged picture: Copy Picture, Save Picture As…', inViewer.join(', ') === 'Copy Picture, Save Picture As…', inViewer.join(', '));
      await t.sleep(300);
      await t.shot('right-click-enlarged');
      const saved2 = path.join(t.out, 'saved-enlarged.jpg');
      t.saveTo(saved2);
      await pick('Save Picture As…');
      const big = await savedFile(t, saved2);
      t.check('…and it saves', big.picture && big.size > 20000, JSON.stringify(big));
      t.check('The enlarged picture is still open', await t.js('return !!document.querySelector(".overlay img");'));
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      // The media viewer (a picture from the article's Media).
      await t.waitFor('!document.querySelector(".overlay")', 3000);
      await t.js(`${pageOf('Moon')}.querySelector('button.mt.image').click();`);
      if (await t.waitFor('document.querySelector(".mstage img")?.complete', 10000)) {
        const inMedia = await ctx(`document.querySelector('.mstage img')`);
        t.check('In the media viewer: Copy Picture, Save Picture As…', inMedia.join(', ') === 'Copy Picture, Save Picture As…', inMedia.join(', '));
        // Escape closes the menu first, then the viewer.
        await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
        t.check('Escape closes the menu and leaves the viewer open', await t.js('return !document.querySelector(".menu.ctx") && !!document.querySelector(".mviewer");'));
        await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
        await t.waitFor('!document.querySelector(".overlay")', 3000);
      } else t.check('The media viewer opens a picture', false, await t.js('return document.querySelector(".overlay")?.className || "no viewer";'));

      // The Find box: Cut and Copy are off with nothing selected.
      await t.js(`const q = document.querySelector('#q'); q.value = ''; q.blur();`);
      const field = await ctx(`document.querySelector('#q')`);
      t.check('In the Find box: Cut, Copy, Paste, Select All', ['Cut (off)', 'Copy (off)', 'Paste', 'Select All'].every((l) => field.includes(l)), field.join(', '));
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      const q = (code) => t.js(`const q = document.querySelector('#q'); ${code}`);
      await q(`q.focus(); q.value = 'hello world'; q.setSelectionRange(0, 5);`);
      await ctx(`document.querySelector('#q')`);
      await pick('Copy');
      t.check('Copy in the Find box', await clipped('hello'), await t.clipText());
      await q(`q.focus(); q.setSelectionRange(6, 11);`);
      await ctx(`document.querySelector('#q')`);
      await pick('Cut');
      t.check('Cut in the Find box', await clipped('world') && (await q('return q.value;')) === 'hello ', await q('return q.value;'));
      await ctx(`document.querySelector('#q')`);
      await pick('Paste');
      t.check('Paste in the Find box', await t.waitFor(`document.querySelector('#q').value === 'hello world'`, 3000), await q('return q.value;'));
      await ctx(`document.querySelector('#q')`);
      await pick('Select All');
      t.check('Select All in the Find box', (await q('return q.value.slice(q.selectionStart, q.selectionEnd);')) === 'hello world');
      // The menu bar's Edit › Copy (Windows and Linux; on a Mac it's the system's own).
      if (t.platform !== 'darwin') {
        await q(`q.value = ''; q.blur();`);
        await t.js(`const n = [...${page}.querySelectorAll('.text p')].find((p) => p.textContent.length > 200).firstChild;
          const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r);`);
        const want = (await t.js('return String(getSelection());')).trim();
        t.setClip('');
        await t.js(`const top = [...document.querySelectorAll('#menubar .m')].find((m) => m.firstChild.textContent === 'Edit');
          top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          const m = [...document.querySelectorAll('#menubar .menu .mi')].find((m) => m.firstChild.textContent === 'Copy');
          m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); m.click();`);
        t.check('Edit › Copy copies the selection', await clipped(want), await t.clipText());
      }

      await t.js(`localStorage.setItem('e2k.theme', JSON.stringify('classic')); E2K.applyPrefs();`);
      await opened('Moon');
      await t.sleep(1000);
      await ctx(`${pageOf('Moon')}.querySelector('.text p a[data-title]')`);
      await t.sleep(300);
      await t.shot('right-click-classic');
    },
  },
  {
    name: 'media-videos', group: 'General', title: 'The media viewer: going from one video to another, the Play button goes away',
    route: 'article/Michael%20Jackson',
    async run(t) {
      t.check('The article opens', await t.waitFor(`${pageOf('Michael Jackson')}?.querySelectorAll(".text p").length > 5`, 20000));
      const state = () => t.js(`const st = document.querySelector('.mstage'), v = st?.querySelector('video');
        return { playing: !!v && !v.paused, button: st?.classList.contains('playing') ? 'hidden' : 'shown' };`);
      t.check('Two videos in Media', await t.waitFor(`${pageOf('Michael Jackson')}.querySelectorAll('button.mt.video').length >= 2`, 15000));
      await t.js(`${pageOf('Michael Jackson')}.querySelector('button.mt.video').click();`);
      t.check('The first video plays', await t.waitFor(`!document.querySelector('.mstage video')?.paused`, 20000));
      await t.js(`document.querySelectorAll('.mviewer .mstrip button.mt.video')[1].click();`);
      t.check('The second video plays', await t.waitFor(`!document.querySelector('.mstage video')?.paused && document.querySelector('.mstage video').currentTime > 0.5`, 25000));
      await t.sleep(1000);
      const s = await state();
      t.check('…without the Play button over it', s.playing && s.button === 'hidden', JSON.stringify(s));
      await t.shot('second-video');
    },
  },
  {
    name: 'wikipedia-503', group: 'General', title: 'Wikipedia answers with a server error (503): the article still opens',
    route: 'home',
    async run(t) {
      // Wikipedia's article service fails the first time (then a second later it works), then always.
      await t.js(`const real = window.fetch; window.__html = { n: 0, mode: 'once' };
        window.fetch = (url, ...rest) => {
          if (String(url).includes('/api/rest_v1/page/html/')) {
            window.__html.n++;
            if (window.__html.mode === 'always' || window.__html.n === 1) return Promise.resolve(new Response('Service Temporarily Unavailable', { status: 503 }));
          }
          return real(url, ...rest);
        };`);
      const opened = (title) => t.waitFor(`${pageOf(title)}?.querySelectorAll(".text p").length > 5`, 25000);
      await t.js('E2K.openArticle("Moon");');
      t.check('One failure: it tries again and the article opens', await opened('Moon'));
      t.check('…after a second try', (await t.js('return window.__html.n;')) === 2, await t.js('return window.__html.n;'));
      await t.js(`window.__html.mode = 'always';`);
      await t.js('E2K.openArticle("Saturn");');
      t.check('Always failing: the article comes from Wikipedia’s other service', await opened('Saturn'));
      t.check('…with its sections', await t.js(`return ${pageOf('Saturn')}.querySelectorAll(".text h2").length >= 4;`));
      await t.sleep(800);                     // the page fades in
      await t.shot('article-after-503');
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
    name: 'right-click-offline', group: 'Reading offline', title: 'Save Picture As… with a picture from the offline library',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')), settings: { offlineMode: true } }),
    async run(t) {
      await t.js('E2K.openArticle("Ray Charles");');
      t.check('The article opens from the library', await t.waitFor('document.querySelector(".content.article .text p") && [...document.querySelectorAll(".content.article img")].some((i) => i.src.startsWith("e2k-zim:") && i.complete && i.naturalWidth > 50)', 15000));
      const saved = path.join(t.out, 'saved-offline');
      t.saveTo(saved);
      await t.js(`const img = [...document.querySelectorAll(".content.article img")].find((i) => i.src.startsWith("e2k-zim:") && i.naturalWidth > 50);
        const r = img.getBoundingClientRect();
        img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        const m = [...document.querySelectorAll('.menu.ctx .mi')].find((m) => m.firstChild.textContent === 'Save Picture As…');
        m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); m.click();`);
      const pic = await savedFile(t, saved);
      t.check('Save Picture As… saves the library’s picture', pic.picture && pic.size > 1000, JSON.stringify(pic) + ' ' + (t.saveAsked || []).join());
    },
  },
  {
    name: 'section-pages', group: 'Reading offline', title: 'Library pages that only lead to a section of another article aren’t listed or opened as articles',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')), settings: { offlineMode: true } }),
    async run(t) {
      // In the Ray Charles library, "Here We Go Again (Nancy Sinatra song)" and "(Norah Jones song)" are pages that lead
      // to sections of "Here We Go Again (Ray Charles song)"; "Eleanor Rigby (person)" to a section of "Eleanor Rigby".
      const found = await t.js('return (await window.e2k.library.titles("Here We Go Again", 8)).map((r) => r.title);');
      t.check('Suggestions list the article, not the pages leading to its sections',
        found.includes('Here We Go Again (Ray Charles song)') && !found.some((x) => /Sinatra|Norah/.test(x)), found.join(', '));
      const person = await t.js('return (await window.e2k.library.titles("Eleanor Rigby (person)", 8)).map((r) => r.title);');
      t.check('Typing such a page’s name suggests the article it leads to', person.join() === 'Eleanor Rigby', person.join(', '));
      await t.js('E2K.openArticle("Eleanor Rigby (person)");');
      t.check('Opening it opens the article', await t.waitFor('document.querySelector(".band h1")?.textContent === "Eleanor Rigby" && document.querySelectorAll(".content.article .text p").length > 3', 15000),
        await t.js('return document.querySelector(".band h1")?.textContent || document.querySelector(".errbox")?.innerText || "";'));
    },
  },
  {
    name: 'offline-search-none', group: 'Reading offline', title: 'An offline search with no matches suggests articles in the library',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => ({ library: ctx.fixtureIn(path.join(ctx.profile, 'Library')), settings: { offlineMode: true } }),
    async run(t) {
      await t.js('E2K.go(E2K.route("search", "Ray Charles fan club"));');
      t.check('It says the offline library has no match', await t.waitFor('/No matches in the offline library/.test(document.querySelector(".errbox")?.innerText || "")', 10000));
      t.check('…and that only the library is searched in Offline mode', await t.js('return /Offline mode/.test(document.querySelector(".errbox").innerText);'));
      t.check('Related articles in the library are listed', await t.waitFor('document.querySelectorAll(".errbox .inlib a").length >= 1', 8000));
      t.check('Go online is offered', await t.js('return [...document.querySelectorAll(".errbox .bbtn")].some((b) => b.textContent === "Go online");'));
      await t.sleep(800);                     // the page fades in
      await t.shot('offline-search-none');
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

  // ---------- accessibility ----------
  {
    name: 'keyboard-menus', group: 'Accessibility', title: 'The menu bar by keyboard (Alt, F10, arrows, Enter, Escape); windows keep focus inside',
    route: 'home',
    async run(t) {
      if (t.platform === 'darwin') return t.skip('The menu bar by keyboard', 'macOS has its own menu bar');
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(1500);
      const rightTo = async (n) => { for (let i = 0; i < n; i++) await t.key('Right'); };
      await t.key('Alt');
      let f = await t.focused();
      t.check('Alt chooses the first menu, File', f.where === 'menubar' && f.text === 'File', JSON.stringify(f));
      await rightTo(6);
      f = await t.focused();
      t.check('Right moves along the menus to Tools', f.text === 'Tools', JSON.stringify(f));
      await t.key('Down');
      f = await t.focused();
      t.check('Down opens Tools on its first item', f.where === 'menu' && f.text.startsWith('Offline Library'), JSON.stringify(f));
      t.check('Screen readers are told they’re menus', await t.js(`return document.getElementById('menubar').getAttribute('role') === 'menubar'
        && document.querySelector('#menubar .menu').getAttribute('role') === 'menu' && document.querySelector('#menubar .menu .mi').getAttribute('role') === 'menuitem';`));
      await t.sleep(300);
      await t.shot('menu-keyboard');
      await t.key('Right');
      f = await t.focused();
      t.check('Right in an open menu opens the next one (Help)', f.where === 'menu' && f.text.startsWith('Keyboard Shortcuts'), JSON.stringify(f));
      await t.key('Escape');
      f = await t.focused();
      t.check('Escape closes the menu and leaves its name chosen', f.where === 'menubar' && f.text === 'Help' && !(await t.js('return !!document.querySelector("#menubar .menu");')), JSON.stringify(f));
      await t.key('Escape');
      f = await t.focused();
      t.check('Escape again leaves the menu bar', f.where !== 'menubar' && f.where !== 'menu', JSON.stringify(f));
      await t.key('F10');
      t.check('F10 also chooses File', (await t.focused()).text === 'File');
      await t.key('Left');
      t.check('Left from File goes round to Help', (await t.focused()).text === 'Help');
      await t.key('F10');
      t.check('F10 again leaves the menu bar', (await t.focused()).where !== 'menubar');
      await t.key('Left', ['alt']);
      t.check('Alt with another key (Alt+Left for Back) doesn’t go into the menu bar', (await t.focused()).where !== 'menubar');
      // A command from the keyboard: Tools › Offline Library… opens its window, which keeps focus inside.
      await t.key('Alt'); await rightTo(6); await t.key('Enter'); await t.key('Enter');
      t.check('Enter on Tools › Offline Library… opens it', await t.waitFor('document.querySelector(".overlay .offline")', 6000));
      await t.sleep(1000);
      f = await t.focused();
      t.check('Focus is in the window', f.where === 'window', JSON.stringify(f));
      let out = 0;
      for (let i = 0; i < 25; i++) { await t.key('Tab'); if ((await t.focused()).where !== 'window') out++; }
      t.check('Tab stays inside it (25 presses)', out === 0, `${out} outside`);
      await t.key('Tab', ['shift']);
      t.check('…and Shift+Tab', (await t.focused()).where === 'window');
      await t.key('Escape');
      t.check('Escape closes it', await t.waitFor('!document.querySelector(".overlay")', 3000));
      // The same in the Classic theme.
      await t.js(`localStorage.setItem('e2k.theme', JSON.stringify('classic')); E2K.applyPrefs();`);
      await t.sleep(500);
      await t.key('Alt'); await rightTo(6); await t.key('Down');
      await t.sleep(300);
      await t.shot('menu-keyboard-classic');
      await t.key('Escape'); await t.key('Escape');
    },
  },
  {
    name: 'keyboard-places', group: 'Accessibility', title: 'Ctrl+1–6 open each section with focus on its heading; Ctrl+Shift+L, Ctrl+Shift+O, and the shortcut list',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(1000);
      const mac = t.platform === 'darwin';
      // Each section, and the heading it opens on.
      const places = [['Articles', 'Explore the encyclopedia'], ['Media', 'Picture of the Day'], ['Timeline', 'On this day'], ['World Explorer', 'Countries of the World'],
        ['Games', 'Games'], ['Activities', 'Activities']];
      for (const [i, [name, heading]] of places.entries()) {
        if (mac) t.menu(name); else await t.key(String(i + 1), ['control']);
        const there = await t.waitFor(`document.activeElement?.matches('h1, h2, h3') && document.querySelector('#view').contains(document.activeElement)
          && document.activeElement.textContent.startsWith(${JSON.stringify(heading)})`, 12000);
        t.check(`${mac ? `Features › ${name}` : `Ctrl+${i + 1}`} opens ${name}, with focus on its heading`, there,
          await t.js('return (document.activeElement?.tagName || "") + " " + (document.activeElement?.textContent || "").trim().slice(0, 40);'));
      }
      await t.command('Offline Library…', 'L', { ctrlKey: true, shiftKey: true });
      t.check(`${mac ? 'Offline Library…' : 'Ctrl+Shift+L'} opens the Offline Library`, await t.waitFor('document.querySelector(".overlay .offline")', 6000));
      t.check('…with focus in it', await t.waitFor('document.querySelector(".overlay").contains(document.activeElement)', 3000));
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      await t.sleep(400);
      await t.command('Offline Mode', 'O', { ctrlKey: true, shiftKey: true });
      t.check(`${mac ? 'Offline Mode' : 'Ctrl+Shift+O'} without a library offers to download one`, await t.waitFor('/needs an offline library/.test(document.querySelector(".overlay .dialog")?.innerText || "")', 4000));
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
      await t.sleep(400);
      await t.command('Keyboard Shortcuts', '/');
      await t.waitFor('document.querySelector(".dialog.keys")', 4000);
      if (await t.js('return !!document.querySelector(".dialog.keys");')) {
        const groups = await t.js('return [...document.querySelectorAll(".dialog.keys h3")].map((h) => h.textContent);');
        t.check('Keyboard Shortcuts lists Going places and Offline', groups.includes('Going places') && groups.includes('Offline'), groups.join(', '));
        t.check('…and has focus', await t.js('return document.querySelector(".overlay").contains(document.activeElement);'));
        await t.shot('shortcuts');
      } else t.skip('Keyboard Shortcuts', 'couldn’t open it from the test (macOS shortcuts come from the menu bar)');
    },
  },
  {
    name: 'keyboard-connection', group: 'Accessibility', title: 'The Online / Offline control by keyboard, and windows and menus in a contrast theme',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(1000);
      await t.js('document.getElementById("netbtn").focus();');
      await t.key('Enter');
      t.check('Enter on the status bar’s Online control opens its menu', await t.waitFor('document.querySelector(".netpop")', 3000));
      let f = await t.focused();
      t.check('Focus is on the choice that’s on (Online)', f.where === 'connection' && f.role === 'menuitemradio' && /^Online/.test(f.text), JSON.stringify(f));
      t.check('The control says its menu is open', await t.js('return document.getElementById("netbtn").getAttribute("aria-expanded") === "true";'));
      await t.key('Down');
      f = await t.focused();
      t.check('Down moves to Offline', /^Offline/.test(f.text), JSON.stringify(f));
      await t.key('Escape');
      f = await t.focused();
      t.check('Escape closes it, and focus goes back to the control', !(await t.js('return !!document.querySelector(".netpop");')) && f.text.startsWith('Connection'), JSON.stringify(f));
      await t.key('Enter'); await t.key('Down'); await t.key('Enter');
      t.check('Choosing Offline without a library offers to download one', await t.waitFor('/needs an offline library/.test(document.querySelector(".overlay .dialog")?.innerText || "")', 4000));
      f = await t.focused();
      t.check('…in a window that has focus', f.where === 'window', JSON.stringify(f));
      await t.key('Escape');
      await t.sleep(300);
      // A contrast theme (forced colors): menus and windows have solid backgrounds, not see-through ones.
      const solid = (sel) => t.js(`const c = getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor;
        return { c, ok: c !== 'transparent' && !/^rgba\\(.*, 0\\)$/.test(c) };`);
      await t.contrast(true);
      await t.js('document.getElementById("netbtn").focus();');
      await t.key('Enter');
      await t.sleep(400);
      let bg = await solid('.netpop');
      t.check('In a contrast theme the connection menu has a solid background', bg.ok, bg.c);
      await t.shot('connection-contrast');
      await t.key('Escape');
      await openLibrary(t);
      bg = await solid('.overlay .offline');
      t.check('…and so does the Offline Library', bg.ok, bg.c);
      await t.shot('library-contrast');
      await t.contrast(false);
    },
  },
  {
    name: 'accessibility-checks', group: 'Accessibility', title: 'axe-core finds no serious problems on the main screens and windows; pictures have names; Star Chart marks answers',
    route: 'home',
    async run(t) {
      const screens = [['home', '.home .alm .ev'], ['article/Moon', '.page .text p'], ['search/apollo', '.results .res'], ['explore', '.page'], ['gallery', '.page'],
        ['onthisday', '.tl-item'], ['games', '#view h1, #view h2'], ['activities', '.act-group'], ['world', '#view canvas, #view svg'], ['activity/periodic-table', '#view h1, #view h2']];
      for (const [route, ready] of screens) {
        await t.js(`E2K.go(${JSON.stringify(route)});`);
        await t.waitFor(`document.querySelector(${JSON.stringify(ready)})`, 15000);
        await t.sleep(2500);
        const bad = await t.axe();
        t.check(`${route}: no serious or critical problems`, !bad.length, bad.join('; '));
      }
      await t.js('E2K.go("article/Moon");');
      await t.waitFor('document.querySelectorAll(".page .text p").length > 5', 15000);
      await t.sleep(1500);
      const unnamed = await t.js('return [...document.querySelectorAll(".page .text img, .page .media img")].filter((i) => !(i.getAttribute("alt") || "").trim()).map((i) => i.src.split("/").pop());');
      t.check('Every picture in the Moon article has a name', !unnamed.length, unnamed.join(', '));
      const windows = [['Offline Library', 'E2KLibrary.open(E2K);'], ['Options', 'E2KOptions.open(E2K);'],
        ['Keyboard Shortcuts', 'document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true }));']];
      for (const [name, code] of windows) {
        if (name === 'Keyboard Shortcuts' && t.platform === 'darwin') t.menu('Keyboard Shortcuts'); else await t.js(code);
        await t.waitFor('document.querySelector(".overlay")', 5000);
        await t.sleep(1500);
        const bad = await t.axe();
        t.check(`${name} window: no serious or critical problems`, !bad.length, bad.join('; '));
        await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
        await t.sleep(400);
      }
      // Star Chart: the question takes focus; the answers are marked with ✓ and ✗, and the result is read out.
      await t.js('E2K.go("game/starchart");');
      await t.waitFor('document.querySelector(".sc-const")', 15000);
      await t.sleep(1500);
      await t.js('document.querySelector(".sc-const").dispatchEvent(new MouseEvent("click", { bubbles: true }));');
      t.check('Star Chart asks a question', await t.waitFor('document.querySelectorAll(".sc-choice").length >= 2', 20000));
      t.check('…and the question has focus', await t.waitFor('document.activeElement?.classList.contains("sc-q-prompt")', 3000));
      await t.js('const b = document.querySelectorAll(".sc-choice"); b[b.length - 1].click();');
      await t.sleep(400);
      const marks = await t.js('return { right: document.querySelector(".sc-choice.right i")?.textContent, wrong: document.querySelector(".sc-choice.wrong i")?.textContent || "", said: document.getElementById("announce").textContent };');
      t.check('The right answer shows ✓', marks.right === '✓', JSON.stringify(marks));
      t.check('A wrong pick shows ✗', marks.wrong === '' || marks.wrong === '✗', JSON.stringify(marks));
      t.check('The result is read out', /Correct|Not quite/.test(marks.said), marks.said);
      await t.shot('starchart-marks');
    },
  },
];
