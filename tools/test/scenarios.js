// The automated test scenarios. Each one starts the real app with its own fresh profile (or the profile a previous
// scenario left behind, for "restart" tests), drives it, and records checks and screenshots. run.js runs them.
//   name:        what to pass to `npm run test:app -- --only <name>`
//   route:       the page the app opens on (E2K_ROUTE)
//   setup(ctx):  files for the profile before the app starts: { library, settings } (library.json and settings.json)
//   reuse:       start from the profile another scenario left (a restart)
//   needs:       'fixture' when the scenario needs the small test library that "download" saves
//   env:         extra environment (E2K_LIBRARY_TEST=1 adds the tiny Ray Charles library, 3 MB), or a function of the
//                profile's folder that returns it
//   only:        a platform ('win32', 'darwin', 'linux') when the scenario only applies there
//   run(t):      the test; t is described in runner.js
//   after(ctx):  runs in run.js once the app has quit
// The offline library has had the most problems, so most scenarios are about it: downloading, pausing, resuming after a
// quit, cancelling, moving, a library going missing and coming back, no connection, and Offline mode.
const fs = require('fs');
const path = require('path');
const os = require('os');
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
      t.check('The article opens', await t.waitFor('/Apollo 11/.test(document.querySelector("h1")?.textContent || "") && document.querySelectorAll(".page .text p").length > 5', 40000));
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
      const opened = (title) => t.waitFor(`${pageOf(title)}?.querySelectorAll(".text p").length > 5`, 40000);
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
    name: 'articles-page', group: 'General', title: 'Articles: eight random articles fill in together, in under 3 seconds (one slow pick doesn’t hold up the rest, and the picks aren’t sent one after another), each picture at the top of its card',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 15000);
      const times = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        // Shuffle draws a new grid; the old one is marked so the wait can't count its cards.
        await t.js(i ? 'document.querySelector(".cards").dataset.old = 1; document.querySelector(".tools .bbtn").click();' : 'E2K.go("explore")');
        await t.waitFor('document.querySelectorAll(".cards:not([data-old]) .card:not(.ghost)").length === 8', 15000);
        times.push(Date.now() - t0);
      }
      t.check('Eight cards each time, with different articles', await t.js('const ts = [...document.querySelectorAll(".cards .card b")].map((b) => b.textContent); return ts.length === 8 && new Set(ts).size === 8;'));
      t.check('The cards fill in within 3 seconds', times.every((ms) => ms < 3000), times.map((ms) => `${ms} ms`).join(', '));
      // A card stretched to the tallest in its row keeps its picture at the top, with no white gap above it.
      const gaps = await t.js('return [...document.querySelectorAll(".cards .card")].map((c) => Math.round(c.querySelector(".ph").getBoundingClientRect().top - c.getBoundingClientRect().top));');
      t.check('Every picture sits at the top of its card', gaps.every((g) => g <= 1), `gaps above the pictures: ${gaps.join(', ')} px`);
      await t.shot('articles');
    },
  },
  {
    name: 'floating-boxes', group: 'General', title: 'Boxes Wikipedia floats beside the text (an album’s review scores) float in the article, with the text beside them',
    route: 'article/Phoenix (Pedro the Lion album)',
    async run(t) {
      const page = pageOf('Phoenix (Pedro the Lion album)');
      t.check('The article opens', await t.waitFor(`/fifth studio album/.test(${page}?.querySelector(".text")?.textContent || "")`, 20000));
      await t.sleep(800);
      const r = await t.js(`const p = ${page}, box = [...p.querySelectorAll('.text table.floatright')].find((t) => /Professional ratings/.test(t.innerText));
        if (!box) return null;
        const lead = [...p.querySelectorAll('.text p')].find((x) => /fifth studio album/.test(x.textContent)), b = box.getBoundingClientRect(), l = lead.getBoundingClientRect();
        return { float: getComputedStyle(box).float, boxRight: Math.round(b.right), leadLeft: Math.round(l.left), leadTop: Math.round(l.top), boxTop: Math.round(b.top), boxBottom: Math.round(b.bottom), textRight: Math.round(p.querySelector('.text').getBoundingClientRect().right) };`);
      if (!r) return t.skip('The ratings box floats', 'Wikipedia no longer puts a ratings box in this article');
      t.check('The ratings box floats right', r.float === 'right' && r.boxRight >= r.textRight - 4, JSON.stringify(r));
      t.check('…and the opening paragraph runs beside it, not below it', r.leadTop < r.boxBottom, JSON.stringify(r));
      await t.shot('ratings-box');
    },
  },
  {
    name: 'right-click', group: 'General', title: 'The right-click menu: on the page, selected text, a link, a picture, and the Find box; Edit › Copy',
    route: 'article/Moon',
    async run(t) {
      const opened = (title) => t.waitFor(`${pageOf(title)}?.querySelectorAll(".text p").length > 5`, 40000);
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
      t.check('The article opens', await t.waitFor(`${pageOf('Michael Jackson')}?.querySelectorAll(".text p").length > 5`, 40000));
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
    name: 'games-in-activities', group: 'General', title: 'Games are part of Activities (first, with their own button); Home’s shelf has My Articles; someone new sees what My Articles is for',
    route: 'home',
    async run(t) {
      await t.js('E2K.go("activities");');
      await t.waitFor('document.querySelector(".act-group")', 10000);
      const info = await t.js(`const g = [...document.querySelectorAll(".act-group")];
        return { first: g[0]?.dataset.cat, head: g[0]?.querySelector("h3")?.innerText, cards: g[0]?.querySelectorAll(".gcard").length, play: g[0]?.querySelector(".gplay")?.textContent,
          chips: [...document.querySelectorAll(".band .wx-chip")].map((c) => c.textContent), rail: [...document.querySelectorAll(".page .rail h4")].map((x) => x.textContent).filter((x) => x !== "Activities")[0],
          desc: document.querySelector(".band .desc")?.textContent };`);
      t.check('Games come first on the Activities page, with Play ›', info.first === 'Games' && info.cards >= 1 && info.play === 'Play ›' && /\d+ games?/.test(info.head), JSON.stringify(info));
      t.check('Games has a button in the header and leads the rail', info.chips[1] === 'Games' && info.rail === 'Games', JSON.stringify(info));
      t.check('The subtitle names games', /^Games, /.test(info.desc), info.desc);
      await t.sleep(1500);
      await t.shot('activities-games');
      await t.js('[...document.querySelectorAll(".band .wx-chip")].find((c) => c.textContent === "Games").click();');
      t.check('The Games button shows only games', await t.js('return [...document.querySelectorAll(".act-group")].filter((s) => !s.hidden).map((s) => s.dataset.cat).join() === "Games";'));
      await t.js('[...document.querySelectorAll(".band .wx-chip")].find((c) => c.textContent === "All").click();');
      await t.js('document.querySelector(".act-group[data-cat=Games] .gcard").click();');
      t.check('A game opens under Activities in the location bar', await t.waitFor('/Activities/.test(document.getElementById("crumbs").innerText) && /Star Chart/.test(document.getElementById("crumbs").innerText)', 8000),
        await t.js('return document.getElementById("crumbs").innerText;'));
      await t.js('[...document.querySelectorAll(".sc-btns .bbtn")].find((b) => /Activities/.test(b.textContent))?.click();');
      t.check('Star Chart’s ‹ Activities button goes back to Activities', await t.waitFor('document.querySelector(".act-group[data-cat=Games]")', 8000));
      await t.js('E2K.go("games");');
      t.check('The old Games page forwards to Activities', await t.waitFor('document.querySelector(".act-group[data-cat=Games]") && document.querySelector(".band h1")?.textContent === "Activities"', 8000));
      t.check('The Activities button’s tooltip gives Ctrl+5', await t.js(`return document.querySelector('.tbtn[data-cmd=activities]').title.includes('Ctrl+5');`));
      // Home's shelf: My Articles where Games was.
      await t.js('E2K.go("home");');
      await t.waitFor('document.querySelector(".home .shelf .orb")', 10000);
      const orbs = await t.js('return [...document.querySelectorAll(".home .shelf .orb")].map((o) => o.textContent.trim());');
      t.check('Home’s shelf has My Articles and no Games', orbs.includes('My Articles') && !orbs.includes('Games'), JSON.stringify(orbs));
      // Someone new: nothing saved, downloaded, or read yet.
      await t.js(`localStorage.removeItem('e2k.favorites'); localStorage.removeItem('e2k.history'); localStorage.removeItem('e2k.recent');`);
      t.win.webContents.reload();
      await t.waitFor('document.querySelector(".home .shelf .orb")', 15000);
      await t.js('[...document.querySelectorAll(".home .shelf .orb")].find((o) => o.textContent.trim() === "My Articles").click();');
      const welcome = await t.waitFor('document.querySelector(".myart .mwelcome")', 8000);
      t.check('The My Articles orb opens My Articles, and someone new sees what gathers there', welcome && await t.js('return /Your articles will gather here/.test(document.querySelector(".myart .mwelcome").innerText);'));
      await t.sleep(1500);
      await t.shot('my-articles-welcome');
      await t.js('document.querySelector(".myart .mwelcome .go").click();');
      t.check('Find an Article goes to the Find box', await t.waitFor('document.activeElement?.id === "q"', 3000));
      const bad = await t.axe();
      t.check('No serious accessibility problems on the welcome', !bad.length, bad.join('; '));
    },
  },
  {
    name: 'passport', group: 'General', title: 'Passport (flags and capitals): a trip of 8 answered from the keyboard earns a stamp; a bad trip doesn’t; progress is kept; it’s in Activities; its pictures are on this computer',
    route: 'activities',
    async run(t) {
      await t.waitFor('document.querySelector(".act-group[data-cat=Games]")', 10000);
      t.check('Passport is in Activities’ Games, beside Star Chart', await t.js('return [...document.querySelectorAll(".act-group[data-cat=Games] .gcard b")].map((b) => b.textContent).join() === "Star Chart,Passport";'));
      await t.js('[...document.querySelectorAll(".act-group[data-cat=Games] .gcard")].find((c) => /Passport/.test(c.textContent)).click();');
      t.check('It opens on the passport: rank, six stamp spaces, the World Tour closed', await t.waitFor('document.querySelectorAll(".pp-slot").length === 6 && document.querySelector(".pp-page .rank")?.textContent === "Tourist" && !document.querySelector(".pp-tour.open")', 15000));
      const places = await t.js('const D = window.E2KPassportData; return window.E2KWorldMap.countries.filter((c) => D[c.id]).map((c) => c.name);');
      t.check('Only countries: no territories (Puerto Rico, Bermuda, Greenland), but Denmark, Kosovo, and Vatican City', places.length >= 193 && places.length <= 200
        && !['Puerto Rico', 'Bermuda', 'Greenland', 'Åland'].some((n) => places.includes(n)) && ['Denmark', 'Kosovo', 'Vatican City'].every((n) => places.includes(n)), `${places.length} places`);
      t.check('The location bar says Passport', /Passport/.test(await t.js('return document.getElementById("crumbs").innerText;')));
      let bad = await t.axe();
      t.check('The passport: no serious accessibility problems', !bad.length, bad.join('; '));
      // Europe, all right, by the number keys.
      const answer = (region) => `const t = JSON.parse(localStorage.getItem("e2k.passport")).trips[${JSON.stringify(region)}]; return t ? t.qs[t.i].answer : -1;`;
      await t.js('[...document.querySelectorAll(".pp-slot")].find((b) => /Europe/.test(b.getAttribute("aria-label"))).click();');
      await t.waitFor('document.querySelector(".pp-ask .prompt")', 5000);
      t.check('A trip starts with focus on the question', await t.js('return document.activeElement?.classList.contains("prompt");'));
      const kinds = new Set();
      for (let i = 0; i < 8; i++) {
        await t.waitFor('document.querySelector(".pp-ask .prompt") && !document.querySelector(".pp-ch:disabled, .pp-flagch:disabled")', 5000);
        kinds.add(await t.js('return document.querySelector(".pp-flagch") ? "flags" : document.querySelector(".pp-card img") ? "flag" : "map";'));
        if (i === 2) { bad = await t.axe(); t.check('A question: no serious accessibility problems', !bad.length, bad.join('; ')); }
        const a = await t.js(answer('Europe'));
        await t.js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "${a + 1}", bubbles: true }));`);
        await t.waitFor('document.querySelector(".pp-feedback .go")', 3000);
        if (i === 3) {
          await t.shot('passport-answered');
          const before = await t.js('return [document.querySelector(".pp-qhead small").textContent, document.querySelector(".pp-feedback").innerText, document.querySelector(".pp-qhead .sc b").textContent, document.querySelectorAll(".pp-canvas .right, .pp-canvas .wrong").length].join("|");');
          await t.js('document.querySelector(".pp-feedback .pp-lnk").click();');
          await t.waitFor('document.querySelector(".content.article") && !document.querySelector(".pp-canvas")', 15000);
          await t.command('Back', 'ArrowLeft', { altKey: true });
          await t.waitFor('document.querySelector(".pp-feedback .go")', 15000);
          const after = await t.js('return [document.querySelector(".pp-qhead small").textContent, document.querySelector(".pp-feedback").innerText, document.querySelector(".pp-qhead .sc b").textContent, document.querySelectorAll(".pp-canvas .right, .pp-canvas .wrong").length].join("|");');
          t.check('Read about…, then Back: the same question, answered, with the same points (nothing scored twice)', before === after && /QUESTION 4 OF 8/.test(after), after);
          t.check('…and the trip is still on question 5 next', await t.js('return JSON.parse(localStorage.getItem("e2k.passport")).trips.Europe.i === 4;'));
        }
        await t.js('document.querySelector(".pp-feedback .go").click();');
      }
      t.check('The trip mixes kinds of question', kinds.size >= 2, [...kinds].join());
      t.check('8 of 8 earns Europe’s stamp', await t.waitFor('document.querySelector(".pp-award") && /Stamped!/.test(document.querySelector(".pp-award").innerText) && /8 of 8 right/.test(document.querySelector(".pp-award").innerText)', 5000),
        await t.js('return document.querySelector(".pp-award")?.innerText || "";'));
      await t.sleep(800);
      await t.shot('passport-stamped');
      await t.js('document.querySelector(".pp-award .ab .p").click();');
      t.check('The stamp is in the passport, and the rank is Traveler', await t.waitFor('document.querySelector(".pp-slot.done .pp-stamp") && document.querySelector(".pp-page .rank")?.textContent === "Traveler"', 3000));
      // Asia, all wrong.
      await t.js('[...document.querySelectorAll(".pp-slot")].find((b) => /Asia/.test(b.getAttribute("aria-label"))).click();');
      for (let i = 0; i < 8; i++) {
        await t.waitFor('document.querySelector(".pp-ask .prompt") && !document.querySelector(".pp-ch:disabled, .pp-flagch:disabled")', 5000);
        const a = await t.js(answer('Asia'));
        await t.js(`document.querySelectorAll(".pp-ch, .pp-flagch")[${(a + 1) % 4}].click();`);
        await t.waitFor('document.querySelector(".pp-feedback .go")', 3000);
        if (i === 0) t.check('A wrong answer is marked, with the right one shown', await t.js('return !!document.querySelector(".pp-ch.wrong, .pp-flagch.wrong") && !!document.querySelector(".pp-ch.right, .pp-flagch.right") && /Not quite/.test(document.querySelector(".pp-feedback").innerText);'));
        await t.js('document.querySelector(".pp-feedback .go").click();');
      }
      t.check('0 of 8: the trip is over without a stamp', await t.waitFor('/Trip over/.test(document.querySelector(".pp-award")?.innerText || "")', 5000));
      await t.js('document.querySelector(".pp-award .ab .p").click();');
      // Halfway through a trip, then away and back: it continues.
      await t.js('[...document.querySelectorAll(".pp-slot")].find((b) => /Africa/.test(b.getAttribute("aria-label"))).click();');
      for (let i = 0; i < 3; i++) {
        await t.waitFor('document.querySelector(".pp-ask .prompt") && !document.querySelector(".pp-ch:disabled, .pp-flagch:disabled")', 5000);
        await t.js(`document.querySelectorAll(".pp-ch, .pp-flagch")[0].click();`);
        await t.waitFor('document.querySelector(".pp-feedback .go")', 3000);
        await t.js('document.querySelector(".pp-feedback .go").click();');
      }
      t.check('Every picture comes from the app itself, not the internet', await t.js('return [...document.querySelectorAll(".pp-canvas img")].every((i) => i.src.startsWith("file:") || !/^https?:/.test(i.src));'));
      t.win.webContents.reload();
      await t.waitFor('window.E2K && document.querySelector("#view")', 15000);
      await t.js('E2K.go("game/passport");');
      await t.waitFor('document.querySelector(".pp-book")', 15000);
      const after = await t.js('return { africa: [...document.querySelectorAll(".pp-slot")].find((b) => /Africa/.test(b.getAttribute("aria-label")))?.getAttribute("aria-label"), stamps: document.querySelectorAll(".pp-slot.done").length };');
      t.check('After a restart the stamp is kept, and Africa continues at question 4', after.stamps === 1 && /3 of 8 questions, continue/.test(after.africa || ''), JSON.stringify(after));
      await t.js('E2K.go("activities");');
      // A trip saved before territories were left out (Puerto Rico Q1183, Bermuda Q23635) is repaired on opening.
      await t.js(`const st = JSON.parse(localStorage.getItem("e2k.passport"));
        st.trips["North America"] = { i: 0, right: 0, given: [], qs: [{ kind: "flagof", id: "Q1183", choices: ["Q1183", "Q23635", "Q30", "Q16"], answer: 0 },
          { kind: "whose", id: "Q16", choices: ["Q16", "Q1183", "Q30", "Q96"], answer: 0 }] };
        localStorage.setItem("e2k.passport", JSON.stringify(st));`);
      await t.js('E2K.go("game/passport");');
      await t.waitFor('document.querySelector(".pp-book")', 15000);
      await t.js('[...document.querySelectorAll(".pp-slot")].find((b) => /North America/.test(b.getAttribute("aria-label"))).click();');
      await t.waitFor('document.querySelector(".pp-ask .prompt")', 5000);
      await t.waitFor('[...document.querySelectorAll(".pp-canvas img")].every((i) => i.complete)', 5000);
      const fixed = await t.js(`const t = JSON.parse(localStorage.getItem("e2k.passport")).trips["North America"]; const D = window.E2KPassportData;
        return { all: t.qs.every((q) => D[q.id] && (q.kind === "cap" || q.choices.every((c) => D[c]))), imgs: [...document.querySelectorAll(".pp-canvas img")].every((i) => i.complete && i.naturalWidth > 0), n: t.qs.length };`);
      t.check('An old trip naming territories gets new questions, every flag showing', fixed.all && fixed.imgs && fixed.n === 2, JSON.stringify(fixed));
      await t.js('E2K.go("activities");');
      t.check('Its card in Activities shows the progress', await t.waitFor('[...document.querySelectorAll(".gcard")].some((c) => /Passport/.test(c.textContent) && /1 of 6 stamps/.test(c.textContent))', 5000));
    },
  },
  {
    name: 'animal-sounds', group: 'General', title: 'Animal Sounds: it’s in Activities’ Nature; habitats switch; a sound plays with its waveform, line, and credits; a round of Who’s Calling? from the keyboard; every sound and picture is on this computer',
    route: 'activities',
    async run(t) {
      await t.waitFor('document.querySelector(".act-group[data-cat=Nature]")', 10000);
      t.check('Animal Sounds is in Activities under Nature', await t.js('return [...document.querySelectorAll(".act-group[data-cat=Nature] .gcard b")].some((b) => b.textContent === "Animal Sounds");'));
      await t.js('[...document.querySelectorAll(".act-group[data-cat=Nature] .gcard")].find((c) => /Animal Sounds/.test(c.textContent)).click();');
      t.check('It opens on Listen: seven habitats, Oceans first, with its animals', await t.waitFor('document.querySelectorAll(".as-hab button").length === 7 && document.querySelector(".as-hab button.on")?.textContent.startsWith("Oceans") && document.querySelectorAll(".as-grid .as-card").length === 5', 15000));
      t.check('The location bar says Animal Sounds', /Animal Sounds/.test(await t.js('return document.getElementById("crumbs").innerText;')));
      const D = await t.js('const D = window.E2KAnimalData; return { n: D.animals.length, credited: D.animals.every((a) => a.credit.artist && a.credit.license && a.line && a.article), licenses: [...new Set(D.animals.flatMap((a) => [a.credit.license, a.credit.picLicense]).filter(Boolean))] };');
      t.check('Every animal has a line, an article, and a credited recording', D.n >= 35 && D.credited, `${D.n} animals`);
      t.check('Only public domain, CC0, CC BY and CC BY-SA', D.licenses.every((l) => /^(Public domain|CC0|CC BY(-SA)? \d(\.\d)?)$/.test(l)), D.licenses.join(', '));
      const ids = await t.js('return window.E2KAnimalData.animals.map((a) => a.id);');
      const dir = path.join(__dirname, '..', '..', 'src', 'activities', 'animals');
      const missing = ids.flatMap((id) => [id + '.ogg', id + '.jpg']).filter((f) => !fs.existsSync(path.join(dir, f))).length;
      t.check('Every sound and picture ships with the app', missing === 0, `${missing} missing`);
      let bad = await t.axe();
      t.check('Listen: no serious accessibility problems', !bad.length, bad.join('; '));
      // Birds: nine animals in two rows; playing one lights its waveform.
      await t.js('[...document.querySelectorAll(".as-hab button")].find((b) => b.textContent.startsWith("Birds")).click();');
      t.check('Birds shows nine animals', await t.waitFor('document.querySelectorAll(".as-grid.two .as-card").length === 9', 3000));
      await t.js('document.querySelectorAll(".as-grid .as-card")[1].click();');
      t.check('A card plays its sound: Now Playing, pause on its card, the waveform lit', await t.waitFor('document.querySelector(".as-audio").currentTime > 0.5 && document.querySelector(".as-now .np").textContent === "NOW PLAYING" && document.querySelector(".as-card.on .pl").textContent === "❚❚" && document.querySelectorAll(".as-now rect.lit").length > 3', 6000));
      t.check('Now Playing names it, with its line, the article link, and the credits', await t.js('const n = document.querySelector(".as-now").innerText; return /Common loon · yodel/.test(n) && /Read about the common loon/.test(n) && /Sound: .+ · CC BY-SA/.test(n) && /Picture: /.test(n);'));
      t.check('The sound follows the app’s volume', await t.js('return Math.abs(document.querySelector(".as-audio").volume - E2KAudio.level()) < 0.01;'));
      await t.shot('animal-sounds-listen');
      await t.js('document.querySelector(".as-now .pb").click();');
      t.check('The play button pauses it', await t.waitFor('document.querySelector(".as-audio").paused && document.querySelector(".as-now .np").textContent === "LISTEN"', 2000));
      t.check('The habitat is remembered', await t.js('return JSON.parse(localStorage.getItem("e2k.animalSounds")).habitat === "Birds";'));
      await t.js('document.querySelector(".as-now a").click();');
      await t.waitFor('document.querySelector(".content.article") && !document.querySelector(".as-canvas")', 15000);
      await t.command('Back', 'ArrowLeft', { altKey: true });
      t.check('Read about the common loon, then Back: Listen, still on the loon', await t.waitFor('/Common loon/.test(document.querySelector(".as-now h2")?.textContent || "") && document.querySelector(".as-card.on b")?.textContent === "Common loon"', 15000));
      // Who's Calling?: ten sounds, the first eight right by the number keys, then two wrong.
      await t.js('document.querySelector(".as-btns .hot").click();');
      for (let i = 0; i < 10; i++) {
        // The new sound playing (the last one is paused when a question opens, so this never catches it).
        await t.waitFor('document.querySelectorAll(".as-ch .as-card:not(:disabled)").length === 4 && !document.querySelector(".as-audio").paused && document.querySelector(".as-audio").currentTime > 0', 6000);
        if (i === 0) {
          t.check('A question plays its sound by itself, with four animals to choose from', await t.js('return !document.querySelector(".as-audio").paused && /SOUND 1 OF 10/.test(document.querySelector(".as-q small").textContent);'));
          bad = await t.axe();
          t.check('A question: no serious accessibility problems', !bad.length, bad.join('; '));
        }
        const right = await t.js('const id = document.querySelector(".as-audio").src.match(/animals\\/(\\w+)\\.ogg/)[1]; const name = window.E2KAnimalData.animals.find((a) => a.id === id).name; return [...document.querySelectorAll(".as-ch .as-card b")].findIndex((b) => b.textContent === name);');
        const pick = i < 8 ? right : (right + 1) % 4;
        await t.js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "${pick + 1}", bubbles: true }));`);
        await t.waitFor('!document.querySelector(".as-fb").hidden', 3000);
        if (i === 0) t.check('Right: marked ✓, with its line, article link, and credits; Next Sound has focus', await t.js('const f = document.querySelector(".as-fb").innerText; return !!document.querySelector(".as-card.right") && /Right!/.test(f) && /Read about the /.test(f) && /Sound: /.test(f) && document.activeElement === document.querySelector(".as-fb .bbtn");'));
        if (i === 4) {
          const state = 'return [document.querySelector(".as-q small").textContent, document.querySelector(".as-q h2").textContent, document.querySelector(".as-score").innerText, [...document.querySelectorAll(".as-ch .as-card")].map((c) => c.className + c.querySelector("b").textContent).join()].join("|");';
          const before = await t.js(state);
          await t.js('document.querySelector(".as-fb a").click();');
          await t.waitFor('document.querySelector(".content.article") && !document.querySelector(".as-canvas")', 15000);
          await t.command('Back', 'ArrowLeft', { altKey: true });
          await t.waitFor('!document.querySelector(".as-fb")?.hidden', 15000);
          const after = await t.js(state);
          t.check('Read about…, then Back: the same sound, answered, the same choices and score', before === after && /SOUND 5 OF 10/.test(after), after);
          t.check('…and the sound doesn’t start by itself', await t.js('return document.querySelector(".as-audio").paused;'));
        }
        if (i === 8) {
          t.check('Wrong: the pick is marked ✗ and the right animal ✓', await t.js('return !!document.querySelector(".as-card.wrong") && !!document.querySelector(".as-card.right") && /Not quite/.test(document.querySelector(".as-fb").innerText);'));
          await t.shot('animal-sounds-answered');
        }
        t.check(`After sound ${i + 1}, the score is right`, await t.js(`return document.querySelector(".as-score").innerText.replace(/\\s+/g, " ").trim() === "${Math.min(i + 1, 8)} of ${i + 1} right";`));
        await t.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));');
      }
      t.check('The round ends at 8 of 10, saved as the best round', await t.waitFor('/8\\s*of 10/.test(document.querySelector(".as-end")?.innerText || "")', 3000)
        && await t.js('return JSON.parse(localStorage.getItem("e2k.animalSounds")).best === 8;'));
      await t.js('[...document.querySelectorAll(".as-end .bbtn")].find((b) => /Animal Sounds/.test(b.textContent)).click();');
      t.check('Back to Listen, still on Birds', await t.waitFor('document.querySelector(".as-hab button.on")?.textContent.startsWith("Birds")', 3000));
      // Mid-round, then away by the toolbar and in again from Activities: a fresh start on Listen, not the old round.
      await t.js('document.querySelector(".as-btns .hot").click();');
      await t.waitFor('document.querySelector(".as-ch")', 3000);
      await t.js('E2K.go("activities");');
      await t.waitFor('document.querySelector(".act-group[data-cat=Nature]")', 5000);
      await t.js('[...document.querySelectorAll(".act-group[data-cat=Nature] .gcard")].find((c) => /Animal Sounds/.test(c.textContent)).click();');
      t.check('Opened again from Activities, it starts on Listen', await t.waitFor('document.querySelector(".as-hab") && !document.querySelector(".as-ch")', 5000));
      // Leaving stops the sound.
      await t.js('document.querySelectorAll(".as-grid .as-card")[0].click();');
      await t.waitFor('!document.querySelector(".as-audio").paused', 3000);
      await t.js('E2K.go("home");');
      t.check('Leaving Animal Sounds stops the sound', await t.waitFor('!document.querySelector(".as-audio")', 3000) && await t.js('return ![...document.querySelectorAll("audio")].some((a) => !a.paused);'));
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
      // On a fast connection the last bytes can arrive between "partway" and the pause.
      if (s.current && !s.download) return t.skip('Paused partway', 'the download finished before the pause reached it (fast connection)');
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
      // The window redraws on the download's next progress report, a moment later on a slow computer.
      t.check('Change… is greyed out during the download', await t.waitFor('[...document.querySelectorAll(".offline .where button")][0]?.disabled && !document.querySelector(".wherenote").hidden', 3000));
      await t.waitFor('document.querySelectorAll(".offline .pack.dl .acts button").length === 2', 3000);
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
    name: 'usb-library', group: 'Offline library', title: 'USB edition: a library beside the portable app is used at the first start, saved relative to the drive; Stop using…',
    route: 'home', needs: 'fixture', env: (profile) => ({ E2K_LIBRARY_TEST: '1', PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick') }),
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, '..', 'stick')); return {}; },
    async run(t) {
      const s = await t.lib();
      t.check('The library beside the app is in use', !!(s.current && s.open), JSON.stringify(s.current));
      t.check('…where it is, as the user’s own file (Stop using… never deletes it)', s.current?.own === true && path.resolve(s.dir) === path.resolve(t.profile, '..', 'stick'), s.dir);
      const saved = JSON.parse(fs.readFileSync(path.join(t.profile, 'library.json'), 'utf8'));
      t.check('Its folder is saved relative to the app, so a new drive letter doesn’t lose it', saved.dir && !path.isAbsolute(saved.dir), saved.dir);
      t.check('Its article is found', !!(await t.js('return await window.e2k.library.find("Ray Charles");')));
      await openLibrary(t);
      await t.shot('usb-library');
      const r = await t.js('return await window.e2k.library.remove();');
      t.check('Stop using… leaves the file on the drive', !r.current && fs.existsSync(path.join(t.profile, '..', 'stick', s.current.file)));
    },
  },
  {
    name: 'usb-library-restart', group: 'Offline library', title: '…after the restart: the library the user stopped using isn’t picked up again',
    route: 'home', reuse: 'usb-library', env: (profile) => ({ E2K_LIBRARY_TEST: '1', PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick') }),
    async run(t) {
      const s = await t.lib();
      t.check('No library is in use', !s.current, JSON.stringify(s.current));
    },
  },
  {
    name: 'library-folder-at-start', group: 'Offline library', title: 'Portable: a library already in its library folder is used at the first start (the installed app doesn’t look)',
    route: 'home', needs: 'fixture', env: (profile) => ({ E2K_LIBRARY_TEST: '1', PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick') }),
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'Library')); fs.mkdirSync(path.join(ctx.profile, '..', 'stick'), { recursive: true }); return {}; },
    async run(t) {
      const s = await t.lib();
      t.check('The library in the library folder is in use', !!(s.current && s.open) && path.resolve(s.dir) === path.resolve(t.profile, 'Library'), JSON.stringify({ dir: s.dir, current: s.current }));
    },
  },
  {
    name: 'installed-no-nearby', group: 'Offline library', title: 'The installed app doesn’t pick up a library left in its library folder',
    route: 'home', needs: 'fixture', env: { E2K_LIBRARY_TEST: '1' },
    setup: (ctx) => { ctx.fixtureIn(path.join(ctx.profile, 'Library')); return {}; },
    async run(t) {
      const s = await t.lib();
      t.check('No library is in use', !s.current, JSON.stringify(s.current));
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

  // ---------- notices from encyclopedia2000.com ----------
  {
    name: 'notices', group: 'General', title: 'News on Home and an important banner from a notice file; closing them, the one-time hint, and its link to Options',
    route: 'home', env: (profile) => ({ E2K_NOTICE_FILE: path.join(profile, 'notice-test.json') }),
    setup: (ctx) => {
      fs.writeFileSync(path.join(ctx.profile, 'notice-test.json'), JSON.stringify({
        news: { id: 'test-news', text: 'The USB Offline Edition is here: all of Wikipedia on a stick.', link: { label: 'Learn more ›', url: 'https://encyclopedia2000.com/usb' } },
        important: { id: 'test-important', text: 'Version 0.5.5 fixes a problem updating the portable version.', link: { label: 'Get the Fix', url: 'https://github.com/sburton0/encyclopedia-2000/releases/latest' } },
      }));
      return { settings: { autoUpdate: true } };   // the important notice comes with update checks
    },
    async run(t) {
      t.check('The news shows above Explore', await t.waitFor('/USB Offline Edition/.test(document.querySelector(".home .news")?.textContent || "")', 8000));
      const news = await t.js('const n = document.querySelector(".home .news"), s = document.querySelector(".home .shelf").getBoundingClientRect(), r = n.getBoundingClientRect(); return { link: n.querySelector(".more")?.textContent, above: r.bottom <= s.top, label: n.getAttribute("aria-label") };');
      t.check('…with its link, in the gap above Explore, as a named region', news.link === 'Learn more ›' && news.above && news.label === 'News', JSON.stringify(news));
      t.check('…and Tab reaches it before Explore (it comes first in the page)', await t.js('return !!(document.querySelector(".home .news").compareDocumentPosition(document.querySelector(".home .shelf")) & Node.DOCUMENT_POSITION_FOLLOWING);'));
      t.check('The important notice shows under the toolbar', await t.js('return /fixes a problem/.test(document.getElementById("notice")?.textContent || "") && document.getElementById("notice").nextElementSibling?.classList.contains("stage");'));
      await t.sleep(600);                     // the news fades in
      await t.shot('notices-home');
      await t.js('E2K.openArticle("Moon");');
      await t.waitFor(`${pageOf('Moon')}`, 20000);
      t.check('The important notice stays on other screens; news is only on Home', await t.js('return !!document.getElementById("notice") && !document.querySelector(".news");'));
      await t.js('E2K.go("home");');
      await t.waitFor('document.querySelector(".home .news")', 8000);
      // Closing the news: it goes, and the hint takes its place once, with a link to Options › Privacy › News.
      await t.js('document.querySelector(".home .news .x").click();');
      await t.sleep(400);
      const hint = await t.js('const h = document.querySelector(".home .newshint"); return { news: !!document.querySelector(".home .news"), text: h?.textContent || "", role: h?.getAttribute("role") };');
      t.check('Closing the news shows where it can be turned off, in its place', !hint.news && /You can turn off news anytime in Options/.test(hint.text) && hint.role === 'status', JSON.stringify(hint));
      await t.shot('news-hint');
      await t.js('document.querySelector(".home .newshint a").click();');
      await t.waitFor('document.querySelector(".options")', 4000);
      await t.sleep(600);                     // the hint fades out
      const opt = await t.js(`const tab = document.querySelector(".options .otab.on")?.textContent; const g = [...document.querySelectorAll(".options .ogroup")].find((g) => g.querySelector("legend")?.textContent === "News");
        return { tab, news: !!g, checked: g?.querySelector("input")?.checked, hint: !!document.querySelector(".home .newshint") };`);
      t.check('Its Options link opens Privacy, at Show news (on), and the hint goes', opt.tab === 'Privacy' && opt.news && opt.checked === true && !opt.hint, JSON.stringify(opt));
      await t.shot('options-news');
      await t.js(`[...document.querySelectorAll(".options .go")].find((b) => b.textContent === "Cancel").click();`);
      await t.js('document.querySelector("#notice .nx").click();');
      t.check('Closing the important notice removes it', !(await t.js('return !!document.getElementById("notice");')));
    },
  },
  {
    name: 'notices-restart', group: 'General', title: '…after a restart: closed notices stay closed, and the hint isn’t shown again',
    route: 'home', reuse: 'notices', env: (profile) => ({ E2K_NOTICE_FILE: path.join(profile, 'notice-test.json') }),
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(2500);
      t.check('Neither notice comes back', !(await t.js('return !!(document.querySelector(".home .news") || document.getElementById("notice"));')));
      // A new news item (a new id) does show, and closing it now just closes it.
      const file = path.join(t.profile, 'notice-test.json');
      fs.writeFileSync(file, JSON.stringify({ news: { id: 'test-news-2', text: 'Encyclopedia 2000 is on Discord.' } }));
      await t.js('window.e2k.notice.refresh();');
      t.check('A new news item shows (no link is fine)', await t.waitFor('/on Discord/.test(document.querySelector(".home .news")?.textContent || "") && !document.querySelector(".home .news .more")', 5000));
      await t.js('document.querySelector(".home .news .x").click();');
      await t.sleep(400);
      t.check('Closing it again doesn’t show the hint a second time', !(await t.js('return !!document.querySelector(".home .newshint") || !!document.querySelector(".home .news");')));
    },
  },
  {
    name: 'notices-rules', group: 'General', title: 'Notice rules: HTML, other sites, past dates, other platforms and versions are ignored; Show news off and Offline mode hide them',
    route: 'home', env: (profile) => ({ E2K_NOTICE_FILE: path.join(profile, 'notice-test.json') }),
    setup: (ctx) => { fs.writeFileSync(path.join(ctx.profile, 'notice-test.json'), JSON.stringify({ news: { id: 'n1', text: 'News for this copy.' }, important: { id: 'i1', text: 'Important for this copy.' } })); return { settings: { autoUpdate: true } }; },
    async run(t) {
      const { pick, due } = require(path.join(process.env.E2K_TEST_APP, 'notices.js'));
      const H = 3600 * 1000, now = Date.now();
      t.check('With nothing showing, it checks once a day', due(now - 23 * H, false, now, true) === false && due(now - 25 * H, false, now, false) === true);
      t.check('With a notice showing, it checks at every start and every 3 hours (a removal goes quickly)', due(now - 1 * H, true, now, true) === true && due(now - 1 * H, true, now, false) === false && due(now - 4 * H, true, now, false) === true);
      t.check('Never checked: it checks', due(0, false, now, false) === true);
      const semver = require(path.join(process.env.E2K_TEST_APP, 'node_modules', 'semver'));
      const env = { platform: 'win32', version: '0.5.4-beta', today: '2026-11-01', satisfies: (v, r) => semver.satisfies(semver.coerce(v).version, r) };
      const one = (x) => pick({ news: { id: 'a', text: 'Hello.', ...x } }, env).news;
      t.check('A plain item is shown', one({})?.text === 'Hello.');
      t.check('Text with HTML is ignored', one({ text: 'Hi <b>there</b>' }) === null);
      t.check('A link to another site is ignored', one({ link: { label: 'Go', url: 'https://example.com/' } }) === null);
      t.check('A plain-http link is ignored', one({ link: { label: 'Go', url: 'http://encyclopedia2000.com/' } }) === null);
      t.check('A link to someone else’s GitHub is ignored', one({ link: { label: 'Go', url: 'https://github.com/someone/else' } }) === null);
      t.check('Links to the website and the app’s GitHub page are allowed', !!one({ link: { label: 'Go', url: 'https://encyclopedia2000.com/usb' } }) && !!one({ link: { label: 'Go', url: 'https://github.com/sburton0/encyclopedia-2000/releases' } }));
      t.check('After its end date it isn’t shown', one({ until: '2026-10-31' }) === null && !!one({ until: '2026-11-01' }));
      t.check('Only on the platforms it names', one({ platforms: ['linux'] }) === null && !!one({ platforms: ['win32', 'darwin'] }));
      t.check('Only for the versions it names (0.5.4 Beta counts as 0.5.4)', one({ versions: '<0.5.4' }) === null && !!one({ versions: '<=0.5.4' }) && !!one({ versions: '<0.6' }) && one({ versions: 'nonsense!!' }) === null);
      t.check('A broken file shows nothing', JSON.stringify(pick('oops', env)) === '{"news":null,"important":null}' && JSON.stringify(pick(null, env)) === '{"news":null,"important":null}');
      t.check('An id that isn’t simple is ignored', one({ id: '<x>' }) === null && one({ id: '' }) === null);
      // In the app: both show; Show news off hides the news; Offline mode hides both.
      t.check('Both show in the app', await t.waitFor('document.querySelector(".home .news") && document.getElementById("notice")', 8000));
      await t.js('await window.e2k.settings.set({ showNews: false }); window.e2k.notice.refresh();');
      t.check('Show news off: no news, the important notice stays', await t.waitFor('!document.querySelector(".home .news") && document.getElementById("notice")', 4000));
      await t.js('await window.e2k.settings.set({ showNews: true, autoUpdate: false }); window.e2k.notice.refresh();');
      t.check('Update checks off: no important notice, news is back', await t.waitFor('document.querySelector(".home .news") && !document.getElementById("notice")', 4000));
      await t.js('await window.e2k.settings.set({ autoUpdate: true }); window.e2k.notice.refresh();');
      await t.waitFor('document.getElementById("notice")', 4000);
      await t.js('window.e2k.net.setOffline(true); window.e2k.notice.refresh();');
      t.check('Offline mode hides both', await t.waitFor('!document.querySelector(".home .news") && !document.getElementById("notice")', 4000));
      await t.js('window.e2k.net.setOffline(false); window.e2k.notice.refresh();');
      t.check('…and they come back online', await t.waitFor('document.querySelector(".home .news") && document.getElementById("notice")', 4000));
    },
  },

  // ---------- USB edition: the portable version updating itself ----------
  {
    name: 'portable-update', group: 'USB edition', title: 'Portable self-update: download, checks, swap, and cleanup; a stick pulled out, a bad download, a read-only drive, a damaged update, a failed swap',
    route: 'home',
    async run(t) {
      const http = require('http'), crypto = require('crypto');
      const pu = require(path.join(process.env.E2K_TEST_APP, 'portable-update.js'));
      // A stand-in for GitHub's release files: portable.yml and the new version (random bytes), or a broken copy.
      const body = crypto.randomBytes(3 * 1024 * 1024), sha512 = crypto.createHash('sha512').update(body).digest('base64');
      let mode = 'good';
      const server = http.createServer((req, res) => {
        if (req.url.endsWith('/portable.yml')) return res.end(`version: 0.5.5-beta\nfile: Encyclopedia-2000-Portable-0.5.5-beta.exe\nsha512: ${sha512}\nsize: ${body.length}\n`);
        res.writeHead(200, { 'content-length': body.length });
        if (mode === 'cut') { res.write(body.subarray(0, body.length / 2)); return setTimeout(() => res.destroy(), 50); }
        res.end(mode === 'bad' ? crypto.randomBytes(body.length) : body);
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const base = `http://127.0.0.1:${server.address().port}/v0.5.5-beta`;
      try {
        const m = await pu.manifest('0.5.5-beta', base);
        t.check('The release’s portable.yml is read', m && m.size === body.length && m.sha512 === sha512 && m.url.endsWith('/Encyclopedia-2000-Portable-0.5.5-beta.exe'), JSON.stringify(m));
        const stick = path.join(t.out, 'stick'), exe = path.join(stick, 'Encyclopedia-2000-Portable-0.5.4-beta.exe');
        fs.mkdirSync(stick, { recursive: true });
        fs.writeFileSync(exe, 'old version');
        const left = () => fs.readdirSync(stick).sort();
        const opts = { signature: false };   // the stand-in isn't signed; the signature check is tested below

        // A stick pulled out partway, and a download that doesn't match: an error, and nothing left behind.
        for (const [how, want] of [['cut', /disconnected|stopped/], ['bad', /didn’t match/]]) {
          mode = how;
          const err = await pu.download(exe, m, opts).then(() => '', (e) => e.message);
          t.check(`${how === 'cut' ? 'A download cut off partway' : 'A download that doesn’t match'} fails, and leaves only the current version`, want.test(err) && left().join() === path.basename(exe), `${err} · ${left().join(', ')}`);
        }
        // A good download: ready, and offered again later (checked again), but nothing swapped yet.
        mode = 'good';
        let pct = 0;
        await pu.download(exe, m, { ...opts, onProgress: (p) => { pct = p; } });
        t.check('A good download is ready beside the current version, which is untouched', fs.existsSync(pu.readyOf(exe)) && fs.readFileSync(exe, 'utf8') === 'old version' && pct === 100, left().join(', '));
        t.check('…and the ready update can’t be started by double-clicking (no .exe name)', !/\.exe$/.test(pu.readyOf(exe)));
        t.check('…and is found again at the next start', pu.ready(exe, opts)?.version === '0.5.5-beta');
        const plain = path.join(stick, 'Encyclopedia 2000.exe');
        // The swap itself is done by a PowerShell helper after the app has closed (Windows only, like the portable).
        if (process.platform === 'win32') {
          const until = async (fn, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end; await t.sleep(250)) if (fn()) return true; return !!fn(); };
          // Restart Now while the portable's launcher still holds its .exe (a process that has it open without sharing
          // it for renaming, like the real launcher): nothing changes until it lets go, then the swap.
          const { spawn } = require('child_process');
          const holder = spawn('powershell', ['-NoProfile', '-Command', `$f = [IO.File]::Open('${exe.replace(/'/g, "''")}', 'Open', 'Read', 'Read'); 'held'; Start-Sleep 4; $f.Close()`], { windowsHide: true });
          await new Promise((r) => holder.stdout.once('data', r));
          const target = pu.swapAfterExit(exe, '0.5.4-beta', { ...opts, wait: 30 });
          t.check('Restart Now names the new version after itself', path.basename(target) === 'Encyclopedia-2000-Portable-0.5.5-beta.exe', target);
          await t.sleep(2000);
          t.check('While the launcher still holds the .exe, nothing changes (0.5.4 and 0.5.5 failed here, “EBUSY”)', fs.readFileSync(exe, 'utf8') === 'old version' && fs.existsSync(pu.readyOf(exe)) && !fs.existsSync(target), left().join(', '));
          await until(() => fs.existsSync(target) && !fs.existsSync(pu.readyOf(exe)));
          t.check('Once it lets go, the new version is swapped in under its name', fs.existsSync(target) && fs.readFileSync(target).equals(body), left().join(', '));
          t.check('…and the old version is kept, runnable, as “(previous version)”', fs.readFileSync(pu.previousOf(exe), 'utf8') === 'old version');
          t.check('…and the helper’s script is gone from the temporary folder', await until(() => !fs.readdirSync(os.tmpdir()).some((f) => f.startsWith(`encyclopedia-2000-update-${process.pid}-`)), 5000));
          // From here on it's the new version doing the work, from its own path and name (as the real one does).
          pu.cleanupPending(target);
          t.check('At the next start, before the new version has started, the previous one is still there', fs.existsSync(pu.previousOf(exe)));
          pu.removePrevious(target, { current: '0.5.5-beta' });
          t.check('Once the new version has started, the previous one is deleted (named after the old version)', left().join() === path.basename(target), left().join(', '));

          // A copy named without a version keeps its name.
          fs.writeFileSync(plain, 'plain old');
          await pu.download(plain, m, opts);
          const t2 = pu.swapAfterExit(plain, '0.5.4-beta', opts);
          await until(() => !fs.existsSync(pu.readyOf(plain)));
          t.check('A copy named “Encyclopedia 2000.exe” keeps its name', t2 === plain && fs.readFileSync(plain).equals(body));
          pu.removePrevious(t2, { current: '0.5.5-beta' });
          t.check('…and its previous version is deleted too', !fs.existsSync(pu.previousOf(plain)));

          // A swap whose second step fails puts the current version back.
          fs.writeFileSync(exe, 'old version');
          await pu.download(exe, m, opts);
          fs.rmSync(target, { force: true });
          fs.mkdirSync(target);                // a folder where the new version would go: the rename fails
          pu.swapAfterExit(exe, '0.5.4-beta', opts);
          await until(() => false, 4000);
          t.check('A swap that fails halfway puts the current version back under its name', fs.readFileSync(exe, 'utf8') === 'old version' && !fs.existsSync(pu.previousOf(exe)) && fs.existsSync(pu.readyOf(exe)), left().join(', '));
          fs.rmSync(target, { recursive: true, force: true });
          pu.discard(exe);
        } else t.skip('Restart Now and Update on Close (the swap)', 'Windows only, like the portable');

        // Months later: an update that was damaged on the stick isn't used, and is deleted.
        fs.writeFileSync(plain, 'plain old');
        await pu.download(plain, m, opts);
        fs.appendFileSync(pu.readyOf(plain), 'x');
        t.check('A downloaded update damaged since is not offered, and is deleted', pu.ready(plain, opts) === null && !fs.existsSync(pu.readyOf(plain)));
        const err = (() => { try { pu.swapAfterExit(plain, '0.5.4-beta', opts); return ''; } catch (e) { return e.message; } })();
        t.check('…and Restart Now then changes nothing', /missing or damaged/.test(err) && fs.readFileSync(plain, 'utf8') === 'plain old', err);

        // A drive that can't be written to (Windows' own folder stands in for a locked stick).
        if (process.platform === 'win32') {
          const ro = path.join(process.env.WINDIR, 'Encyclopedia 2000.exe');
          const e2 = await pu.download(ro, m, opts).then(() => '', (e) => e.message);
          t.check('On a drive it can’t write to, nothing is downloaded', !pu.writable(ro) && /can’t be written/.test(e2), e2);
        }
        // The signature: the stand-in (unsigned) is refused; a real signed release passes, if one is built here.
        await pu.download(plain, m, opts);
        t.check('An unsigned download is refused', /isn’t signed by Scott Burton/.test(pu.check(pu.readyOf(plain), m)));
        pu.discard(plain);
        t.check('Discard deletes a downloaded update', !fs.existsSync(pu.readyOf(plain)) && !fs.existsSync(path.join(stick, 'Encyclopedia 2000 update.json')));
        const dist = path.join(process.env.E2K_TEST_APP, 'dist');
        const signed = fs.existsSync(dist) && fs.readdirSync(dist).find((f) => /-Portable-.+\.exe$/.test(f));
        if (signed && process.platform === 'win32') {
          const b = fs.readFileSync(path.join(dist, signed));
          t.check('A signed release passes every check', pu.check(path.join(dist, signed), { size: b.length, sha512: crypto.createHash('sha512').update(b).digest('base64') }) === '', signed);
        } else t.skip('A signed release passes every check', 'no signed portable build in dist');
      } finally { server.close(); }
    },
  },
  {
    name: 'portable-update-window', group: 'USB edition', title: 'Portable self-update in the window: Download and ✕, downloading, Restart Now and Update on Close, a failure told; other copies unchanged',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(1000);
      const send = async (s) => { t.win.webContents.send('update', s); await t.sleep(250); };
      const bar = () => t.js('const b = document.getElementById("updatebar"); return b.hidden ? "" : [...b.childNodes].map((n) => n.textContent).join(" | ");');
      const dlg = () => t.js('return document.querySelector(".overlay .dialog")?.innerText || "";');
      const buttons = () => t.js('return [...document.querySelectorAll(".overlay .dialog .df .go")].map((b) => b.textContent);');
      const press = (label) => t.js(`[...document.querySelectorAll(".overlay .dialog .go")].find((b) => b.textContent === ${JSON.stringify(label)})?.click();`);
      // The installed app, and a portable copy whose release has no portable.yml, are exactly as before.
      await send({ state: 'available', version: '0.5.5-beta', kind: 'portable', file: '' });
      t.check('A copy that can’t update itself still offers Download (the website)', /is available \| Download$/.test(await bar()), await bar());
      await send({ state: 'ready', version: '0.5.5-beta' });
      t.check('The installed app’s ready message is as before (Restart Now only)', /is ready \| Restart Now$/.test(await bar()), await bar());
      await send({ state: 'downloading', version: '0.5.5-beta', percent: 42 });
      t.check('…and its downloading message', /^Downloading version .* 42%$/.test(await bar()), await bar());
      // The portable version.
      const avail = { state: 'available', version: '0.5.5-beta', kind: 'portable', self: true, size: 98 * 1048576, readonly: false };
      await send(avail);
      t.check('Portable: Download and ✕ in the status bar', /is available \| Download \| ✕$/.test(await bar()), await bar());
      await send({ state: 'downloading', version: '0.5.5-beta', percent: 42, self: true });
      t.check('Downloading shows its progress (no buttons, like the installed app)', /^Downloading version .* 42%$/.test(await bar()), await bar());
      await send({ state: 'ready', version: '0.5.5-beta', self: true });
      t.check('Ready: Restart Now and Update on Close', /is ready \| Restart Now \| Update on Close$/.test(await bar()), await bar());
      await t.shot('portable-ready');
      await send({ state: 'ready', version: '0.5.5-beta', self: true, onQuit: true });
      t.check('After Update on Close, the notice goes away', (await bar()) === '');
      // ✕ hides the notice until the next version.
      await send(avail);
      await t.js('document.querySelector("#updatebar .ux").click();');
      t.check('✕ hides the notice', (await bar()) === '');
      await send(avail);
      t.check('…and it stays hidden for that version', (await bar()) === '');
      await send({ ...avail, version: '0.5.6-beta' });
      t.check('…but the next version shows again', /0\.5\.6 Beta is available/.test(await bar()), await bar());
      // A failure is told, and says nothing changed.
      await send({ ...avail, version: '0.5.6-beta', failed: 'The drive was disconnected, or the download stopped, before the new version finished downloading.' });
      const f = await dlg();
      t.check('A failure is told, and says nothing has changed', /couldn’t be finished/.test(f) && /Nothing has changed/.test(f), f.slice(0, 200));
      await press('OK');
      // A read-only drive: Download explains and offers the download page.
      await send({ ...avail, version: '0.5.6-beta', readonly: true });
      await t.js('[...document.querySelectorAll("#updatebar button")].find((b) => b.textContent === "Download").click();');
      await t.sleep(300);
      const ro = await dlg();
      t.check('On a read-only drive, Download explains and offers the download page', /can’t be updated/.test(ro) && /Open the Download Page/.test(ro), ro.slice(0, 200));
      await press('Not Now');
    },
  },
  {
    name: 'portable-first-run', group: 'USB edition', only: 'win32', title: 'Portable first run: the update question with its checkbox; the answer goes to Options; asked once',
    route: 'home',
    env: (profile) => ({ PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick'), PORTABLE_EXECUTABLE_FILE: path.join(profile, '..', 'stick', 'Encyclopedia 2000.exe'), E2K_TEST_SELF_UPDATE: '1', E2K_NOTICE_FILE: path.join(profile, 'notice-test.json') }),
    setup: (ctx) => {
      fs.mkdirSync(path.join(ctx.profile, '..', 'stick'), { recursive: true });
      fs.writeFileSync(path.join(ctx.profile, 'notice-test.json'), JSON.stringify({ news: { id: 'first-run-news', text: 'News for the first-run test.' } }));
      return { settings: { autoUpdate: true } };
    },
    async run(t) {
      const ask = await t.waitFor('/Check for updates automatically\\?/.test(document.querySelector(".overlay .dialog")?.innerText || "")', 8000);
      t.check('The portable asks about updates on its first run', ask);
      if (!ask) return;
      const d = await t.js(`const d = document.querySelector('.overlay .dialog'), l = d.querySelector('.askauto span'), r = l.getBoundingClientRect();
        return { text: d.innerText, buttons: [...d.querySelectorAll('.df .go')].map((b) => b.textContent), oneLine: r.height < 24, inside: r.right <= d.getBoundingClientRect().right - 8, checked: d.querySelector('.askauto input').checked };`);
      t.check('…saying news comes with it, with Help › Check for Updates mentioned, and Check for Updates / Don’t Check', /news and important notices/.test(d.text) && /Help › Check for Updates/.test(d.text) && d.buttons.join() === 'Check for Updates,Don’t Check', JSON.stringify(d.buttons));
      t.check('…and the checkbox on one line, inside the window, unticked', d.oneLine && d.inside && d.checked === false, JSON.stringify(d));
      await t.sleep(400);                     // the window fades in
      await t.shot('first-run-question');
      t.check('No update check happens until it’s answered', (await t.js('return (await window.e2k.settings.get()).updateAsked;')) === false);
      t.check('…and no news either: nothing is contacted before the answer', !(await t.js('return !!document.querySelector(".home .news");')));
      await t.js(`document.querySelector('.overlay .dialog .askauto input').click(); [...document.querySelectorAll('.overlay .dialog .go')].find((b) => b.textContent === 'Check for Updates').click();`);
      await t.sleep(500);
      const s = await t.js('return await window.e2k.settings.get();');
      t.check('Check for Updates with the box ticked: checks on, update automatically on, answered', s.autoUpdate === true && s.autoInstall === true && s.updateAsked === true, JSON.stringify(s));
      t.check('…and news is on: the news shows', s.showNews !== false && await t.waitFor('document.querySelector(".home .news")', 5000));
      await t.js('E2KOptions.open(E2K, "Privacy", "Updates");');
      await t.waitFor('document.querySelector(".options")', 4000);
      const o = await t.js(`const g = [...document.querySelectorAll('.options .ogroup')].find((g) => g.querySelector('legend')?.textContent === 'Updates');
        return [...g.querySelectorAll('label')].map((l) => l.querySelector('b').textContent + '=' + l.querySelector('input').checked);`);
      t.check('Options › Privacy shows both, as answered', o.join() === 'Check for updates automatically=true,Also update automatically=true', o.join());
      await t.shot('first-run-options');
    },
  },
  {
    name: 'portable-first-run-restart', group: 'USB edition', only: 'win32', title: '…after a restart: not asked again',
    route: 'home', reuse: 'portable-first-run',
    env: (profile) => ({ PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick'), PORTABLE_EXECUTABLE_FILE: path.join(profile, '..', 'stick', 'Encyclopedia 2000.exe'), E2K_TEST_SELF_UPDATE: '1' }),
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(2500);
      t.check('The question isn’t asked again', !(await t.js('return /Check for updates automatically/.test(document.querySelector(".overlay .dialog")?.innerText || "");')));
    },
  },
  {
    name: 'portable-first-run-closed', group: 'USB edition', only: 'win32', title: 'Portable first run: a click outside leaves the question open; Escape counts as Don’t Check; the installed app never asks',
    route: 'home',
    env: (profile) => ({ PORTABLE_EXECUTABLE_DIR: path.join(profile, '..', 'stick'), PORTABLE_EXECUTABLE_FILE: path.join(profile, '..', 'stick', 'Encyclopedia 2000.exe'), E2K_TEST_SELF_UPDATE: '1', E2K_NOTICE_FILE: path.join(profile, 'notice-test.json') }),
    setup: (ctx) => {
      fs.mkdirSync(path.join(ctx.profile, '..', 'stick'), { recursive: true });
      fs.writeFileSync(path.join(ctx.profile, 'notice-test.json'), JSON.stringify({ news: { id: 'first-run-news', text: 'News for the first-run test.' } }));
      return { settings: { autoUpdate: true } };
    },
    async run(t) {
      await t.waitFor('document.querySelector(".overlay .dialog.askupdate")', 8000);
      // A click outside it (Scott, 2026-11-08: it used to close as Don't Check, and never asked again).
      await t.js(`const ov = document.querySelector('.overlay.stay'); for (const type of ['mousedown', 'mouseup', 'click']) ov.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));`);
      await t.sleep(500);
      const before = await t.js('return await window.e2k.settings.get();');
      t.check('A click outside leaves the question open, unanswered, with focus still in it',
        (await t.js('return !!document.querySelector(".overlay .dialog.askupdate") && !!document.activeElement.closest(".dialog.askupdate");')) && before.updateAsked === false, JSON.stringify(before));
      await t.js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));`);
      await t.sleep(500);
      const s = await t.js('return await window.e2k.settings.get();');
      t.check('Escape closes it as Don’t Check (checks off, answered)', s.autoUpdate === false && s.updateAsked === true && !(await t.js('return !!document.querySelector(".overlay .dialog.askupdate");')), JSON.stringify(s));
      t.check('Don’t Check turns news off too: nothing is contacted', s.showNews === false && !(await t.js('return !!document.querySelector(".home .news");')), JSON.stringify(s));
    },
  },

  {
    name: 'portable-check-ready', group: 'USB edition', title: 'Portable: Help › Check for Updates with an update downloaded offers Restart Now, Update on Close, and Delete Update',
    route: 'home', env: { E2K_FAKE_UPDATE: 'ready', E2K_FAKE_SELF: '1' },
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(800);
      await t.js('E2K.command("updates");');
      await t.waitFor('document.querySelector(".overlay .dialog")', 4000);
      const b = await t.js('return [...document.querySelectorAll(".overlay .dialog .df .go")].map((b) => b.textContent);');
      t.check('Restart Now, Update on Close, Delete Update', b.join() === 'Restart Now,Update on Close,Delete Update', b.join());
      t.check('The status bar shows Restart Now and Update on Close', await t.js('const b = document.getElementById("updatebar").innerText; return b.includes("Restart Now") && b.includes("Update on Close");'));
    },
  },
  {
    name: 'portable-check-available', group: 'USB edition', title: 'Portable: Help › Check for Updates with a new version offers Download, Download from Website…, and Later',
    route: 'home', env: { E2K_FAKE_UPDATE: 'available', E2K_FAKE_KIND: 'portable', E2K_FAKE_SELF: '1' },
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(800);
      await t.js('E2K.command("updates");');
      await t.waitFor('document.querySelector(".overlay .dialog")', 4000);
      const d = await t.js('const d = document.querySelector(".overlay .dialog"); return { b: [...d.querySelectorAll(".df .go")].map((b) => b.textContent), text: d.innerText };');
      t.check('Download, Download from Website…, Later, with the size and the manual route', d.b.join() === 'Download,Download from Website…,Later' && /98 MB/.test(d.text) && /Encyclopedia 2000 Data/.test(d.text), d.b.join());
      await t.shot('portable-check-available');
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
      // The heading of a section at the top of the article's scrolling area (within a few lines), not at the very top.
      const at = (heading) => `(() => { const c = document.querySelector(".content.article"); const h = c && [...c.querySelectorAll("h2, h3")].find((x) => x.textContent.trim() === ${JSON.stringify(heading)});
        if (!h) return false; const d = h.getBoundingClientRect().top - c.getBoundingClientRect().top; return c.scrollTop > 100 && d > -5 && d < 80; })()`;
      const where = 'return (() => { const c = document.querySelector(".content.article"); return c ? `scrolled ${Math.round(c.scrollTop)}` : "no article"; })();';
      t.check('…at the section it leads to', await t.waitFor(at('The real-life Eleanor Rigby'), 8000), await t.js(where));
      t.check('…with the focus on that section’s heading (read by screen readers)',
        await t.js('return document.activeElement?.textContent?.trim() === "The real-life Eleanor Rigby";'), await t.js('return document.activeElement?.outerHTML.slice(0, 120) || "";'));
      await t.sleep(2500);                    // pictures above it load (it stays at the section)
      t.check('…and stays there while the pictures above it load', await t.js('return ' + at('The real-life Eleanor Rigby') + ';'), await t.js(where));
      await t.js('E2K.openArticle("Here We Go Again (Nancy Sinatra song)");');
      t.check('Another such page opens its article at its section', await t.waitFor('document.querySelector(".band h1")?.textContent === "Here We Go Again (Ray Charles song)"', 15000)
        && await t.waitFor(at('Nancy Sinatra version'), 8000), await t.js(where));
      // A link to a section ("Eleanor Rigby#The_real-life_Eleanor_Rigby") opens the article there; the plain title at the top.
      await t.js('E2K.openArticle("Eleanor Rigby#The_real-life_Eleanor_Rigby");');
      t.check('A link to a section of an article opens it at that section', await t.waitFor('document.querySelector(".band h1")?.textContent === "Eleanor Rigby"', 15000)
        && await t.waitFor(at('The real-life Eleanor Rigby'), 8000), await t.js(where));
      t.check('…and the location bar names the article, not the section',
        await t.js('return document.querySelector("#crumbs .here")?.textContent === "Eleanor Rigby";'), await t.js('return document.querySelector("#crumbs .here")?.textContent || "";'));
      await t.js('E2K.openArticle("Eleanor Rigby");');
      t.check('The article on its own opens at the top', await t.waitFor('document.querySelector(".band h1")?.textContent === "Eleanor Rigby" && document.querySelectorAll(".content.article .text p").length > 3', 15000)
        && await t.js('await new Promise((r) => setTimeout(r, 800)); return document.querySelector(".content.article").scrollTop < 5;'), await t.js(where));
      // A link in the article to one of its own sections scrolls there, without opening the article again.
      const opened = await t.js('return performance.getEntriesByName("article:start").length;');
      await t.js('const a = document.createElement("a"); a.href = "#"; a.dataset.title = "Eleanor Rigby"; a.dataset.section = "The_real-life_Eleanor_Rigby"; a.id = "e2k-test-link"; a.textContent = "link"; document.querySelector(".content.article .text").prepend(a); a.click();');
      t.check('A link to a section of the article you’re reading just scrolls to it', await t.waitFor(at('The real-life Eleanor Rigby'), 5000)
        && await t.js(`return performance.getEntriesByName("article:start").length === ${opened};`), await t.js(where));
      await t.js('document.getElementById("e2k-test-link")?.remove();');
    },
  },
  // ---------- downloaded articles ----------
  {
    name: 'download-article', group: 'Downloaded articles', title: 'Download for Offline: an article downloads with its pictures, and opens in Offline mode without the internet',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Io (moon)");');
      t.check('The article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Io (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000));
      const button = 'return document.querySelector(".bsplit .dmain")?.textContent || "";';
      t.check('Its button says Download for Offline', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Download for Offline"', 5000), await t.js(button));
      await t.js('document.querySelector(".bsplit .dmain").click();');
      t.check('Downloading, the button shows how far along it is', await t.waitFor('/Downloading…|Downloaded/.test(document.querySelector(".bsplit .dmain")?.textContent || "")', 10000), await t.js(button));
      t.check('…then says Downloaded', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Downloaded"', 120000), await t.js(button));
      t.check('…and the status bar says it opens without the internet', /Downloaded “Io \(moon\)” \([\d.]+ MB\)\. It opens without the internet\./.test(await t.js('return document.getElementById("status").textContent;')),
        await t.js('return document.getElementById("status").textContent;'));
      const entry = await t.js('return await window.e2k.saved.get("Io (moon)");');
      t.check('The copy has its pictures', entry && entry.pictures >= 5 && entry.size > 100000, JSON.stringify(entry));
      // Offline mode, with no offline library: the downloaded article still opens, with its pictures, from this computer.
      await t.js('window.e2k.net.setOffline(true); E2K.updateNet();');
      const count = await t.countNetwork();
      await t.js('E2K.go("home"); setTimeout(() => E2K.openArticle("Io (moon)"), 300);');
      t.check('In Offline mode it opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Io (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 20000),
        await t.js('return document.querySelector(".errbox")?.innerText || document.querySelector(".band h1")?.textContent || "";'));
      await t.sleep(2500);
      // (Pictures further down load as the article scrolls, so each one's copy is read directly.)
      const pics = await t.js(`const imgs = [...document.querySelectorAll('.content.article img')].filter((i) => i.src.startsWith('e2k-saved:'));
        const ok = await Promise.all(imgs.map((i) => fetch(i.src).then((r) => r.ok && (r.headers.get('content-type') || '').startsWith('image/'), () => false)));
        return { all: document.querySelectorAll('.content.article img').length, local: imgs.length, readable: ok.filter(Boolean).length,
          lead: document.querySelector('.media .frame img')?.src || '', leadShown: document.querySelector('.media .frame img')?.naturalWidth > 0 };`);
      t.check('…with its pictures, from this computer', pics.local >= 5 && pics.readable === pics.local && pics.lead.startsWith('e2k-saved:') && pics.leadShown, JSON.stringify(pics));
      const net = count();
      t.check('Nothing came from the internet', net.n === 0, net.n ? `${net.n}: ${net.urls.join(' ')}` : '');
      await t.shot('downloaded-offline');
      await t.js('E2K.openArticle("Mars");');
      t.check('An article that isn’t downloaded says so', await t.waitFor('/“Mars” isn’t downloaded/.test(document.querySelector(".errbox")?.innerText || "")', 10000),
        await t.js('return document.querySelector(".errbox")?.innerText || "";'));
    },
  },
  {
    name: 'download-button-hover', group: 'Downloaded articles', title: 'The Download for Offline button is one control: hovering either part outlines all of it',
    route: 'article/Io (moon)',
    async run(t) {
      t.check('The article opens', await t.waitFor('document.querySelector(".bsplit .dmain") && document.querySelectorAll(".content.article .text p").length > 3', 40000));
      const look = `const s = (sel) => { const e = document.querySelector(sel), c = getComputedStyle(e); return { border: c.borderTopColor, color: c.color }; };
        return { main: s('.bsplit .dmain'), arrow: s('.bsplit .darrow') };`;
      const box = (sel) => t.js(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
      const at = await box('.bsplit .dmain');
      await t.hover(at.x, at.y);
      const onMain = await t.js(look);
      t.check('Hovering the main part outlines the arrow too', onMain.main.border === onMain.arrow.border, JSON.stringify(onMain));
      t.check('…and only the main part lights up', onMain.main.color !== onMain.arrow.color, JSON.stringify(onMain));
      await t.shot('hover-main');
      const ar = await box('.bsplit .darrow');
      await t.hover(ar.x, ar.y);
      const onArrow = await t.js(look);
      t.check('Hovering the arrow outlines the main part too, and only the arrow lights up', onArrow.main.border === onArrow.arrow.border && onArrow.main.color !== onArrow.arrow.color, JSON.stringify(onArrow));
      await t.shot('hover-arrow');
    },
  },
  {
    name: 'download-offline-restart', group: 'Downloaded articles', title: '…and with downloaded articles but no offline library, Offline mode stays on after a restart',
    route: 'article/Io (moon)', reuse: 'download-article',
    async run(t) {
      t.check('Still in Offline mode', /^Offline$/.test((await t.net()).trim()), await t.net());
      t.check('The downloaded article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Io (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 20000),
        await t.js('return document.querySelector(".errbox")?.innerText || "";'));
    },
  },
  {
    name: 'download-text-delete', group: 'Downloaded articles', title: 'An article downloads as text only, and Delete download removes the copy',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Ganymede (moon)");');
      t.check('The article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Ganymede (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000));
      await t.js('document.querySelector(".bsplit .darrow").click();');
      t.check('The arrow opens the download choices', await t.waitFor('/Download it as text only/.test(document.querySelector(".rmenu")?.innerText || "")', 3000));
      await t.shot('download-menu');
      await t.js('[...document.querySelectorAll(".rmenu .ri")].find((b) => /text only/.test(b.textContent)).click();');
      t.check('…as text only', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Downloaded"', 60000));
      const entry = await t.js('return await window.e2k.saved.get("Ganymede (moon)");');
      t.check('The copy has no pictures', entry && entry.textOnly && entry.pictures === 0, JSON.stringify(entry));
      await t.js('document.querySelector(".bsplit .darrow").click();');
      await t.waitFor('/Delete download/.test(document.querySelector(".rmenu")?.innerText || "")', 3000);
      await t.js('[...document.querySelectorAll(".rmenu .ri")].find((b) => /Delete download/.test(b.textContent)).click();');
      t.check('Delete download removes the copy', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Download for Offline"', 5000)
        && !(await t.js('return await window.e2k.saved.get("Ganymede (moon)");')));
    },
  },
  {
    name: 'my-articles-folders', group: 'My Articles', title: 'My Articles pane: favorites from 0.5 carry over; folders are made, renamed, filled, searched, and deleted',
    route: 'home',
    async run(t) {
      // Favorites as 0.5 saved them (a plain list), and a few recently viewed.
      await t.js(`localStorage.setItem('e2k.favorites', JSON.stringify([{ title: 'Moon', desc: 'Earth’s natural satellite' }, { title: 'Ray Charles', desc: '' }]));
        localStorage.setItem('e2k.recent', JSON.stringify(['Jupiter', 'Saturn']));`);
      await t.js('E2K.openArticle("Europa (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Europa (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000);
      t.check('The toolbar button is called My Articles', await t.js('return document.querySelector(".tbtn[data-cmd=favpane]").textContent.trim() === "My Articles";'));
      await t.command('My Articles', 'i');
      t.check('Ctrl+I opens the pane, titled My Articles', await t.waitFor('!document.getElementById("fpane").hidden && document.querySelector("#fpane .fh span")?.textContent === "My Articles"', 3000));
      const rows = () => t.js('return [...document.querySelectorAll("#fpane .fb [data-key]")].map((r) => r.dataset.key);');
      t.check('The favorites saved before folders are there, and Recently viewed', JSON.stringify(await rows()) === JSON.stringify(['a:Moon', 'a:Ray Charles', 'r:Europa (moon)', 'r:Jupiter', 'r:Saturn']), JSON.stringify(await rows()));
      t.check('Each favorite shows a button to download it', await t.js('return document.querySelectorAll("#fpane [data-key^=\'a:\'] button.mark.get").length === 2;'));
      // New folder: named in place.
      await t.js('[...document.querySelectorAll("#fpane .newf")].find((b) => b.textContent === "New folder").click();');
      t.check('New folder asks for its name in place', await t.waitFor('document.activeElement?.matches("#fpane input.ren") && document.activeElement.value === "New folder"', 2000));
      await t.js('document.activeElement.value = "Space";');
      await t.key('Enter');
      t.check('…and keeps the name typed', await t.waitFor('document.querySelector("#fpane .fold .t")?.textContent === "Space"', 2000));
      const space = await t.js('return JSON.parse(localStorage.getItem("e2k.favorites")).find((n) => n.items)?.id;');
      t.check('The folder comes before the favorites', (await rows())[0] === 'f:' + space, JSON.stringify(await rows()));
      // The arrow beside Add to Favorites: add this article straight into the folder.
      await t.js('document.querySelector("#fpane .addto").click();');
      t.check('The arrow beside Add offers the folders', await t.waitFor('[...document.querySelectorAll(".menu.ctx .mi")].some((m) => m.textContent.trim() === "Space")', 2000));
      await t.js('[...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.trim() === "Space").click();');
      t.check('…and adds the article to that folder', await t.waitFor(`JSON.parse(localStorage.getItem("e2k.favorites"))[0].items.some((n) => n.title === "Europa (moon)")`, 2000));
      t.check('The article’s Add to Favorites button says it’s in Favorites', await t.js('return [...document.querySelectorAll(".band .bbtn")].some((b) => b.textContent === "In Favorites");'));
      // Right-click › Move To… a favorite into the folder.
      const ctx = async (key) => t.js(`const r = [...document.querySelectorAll("#fpane [data-key]")].find((x) => x.dataset.key === ${JSON.stringify(key)}); const b = r.getBoundingClientRect();
        r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 5, button: 2 })); return true;`);
      const pick = (label) => t.js(`const m = [...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(label)})); if (m) m.click(); return !!m;`);
      await ctx('a:Moon');
      t.check('A favorite’s right-click menu offers Move To…', await pick('Move To…'));
      t.check('…which lists the folders', await t.waitFor('[...document.querySelectorAll(".menu.ctx .mi")].some((m) => m.textContent.trim() === "Space")', 2000));
      await pick('Space');
      t.check('…and moves it there', await t.waitFor(`JSON.parse(localStorage.getItem("e2k.favorites"))[0].items.map((n) => n.title).join() === "Europa (moon),Moon"`, 2000),
        await t.js('return localStorage.getItem("e2k.favorites");'));
      t.check('The folder shows how many favorites it holds', await t.js('return document.querySelector("#fpane .fold .c").textContent === "2";'));
      // A folder inside it, then the third level is the deepest.
      await ctx('f:' + space);
      await pick('New Folder Inside');
      await t.waitFor('document.activeElement?.matches("#fpane input.ren")', 2000);
      await t.js('document.activeElement.value = "Moons";');
      await t.key('Enter');
      const moons = await t.js('return JSON.parse(localStorage.getItem("e2k.favorites"))[0].items.find((n) => n.items)?.id;');
      t.check('A folder can hold folders', !!moons && await t.waitFor('[...document.querySelectorAll("#fpane .fold .t")].map((x) => x.textContent).join() === "Space,Moons"', 2000));
      await ctx('f:' + moons);
      await pick('New Folder Inside');
      await t.waitFor('document.activeElement?.matches("#fpane input.ren")', 2000);
      await t.key('Enter');
      const third = await t.js('return JSON.parse(localStorage.getItem("e2k.favorites"))[0].items[0].items.find((n) => n.items)?.id;');
      await ctx('f:' + third);
      t.check('Three levels is the deepest: no New Folder Inside on the third', await t.js('return [...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.includes("New Folder Inside"))?.classList.contains("disabled");'));
      await t.key('Escape');
      // Closing a folder hides what's in it, and is remembered.
      await t.js(`[...document.querySelectorAll("#fpane .fold")].find((f) => f.dataset.key === "f:${space}").click();`);
      t.check('Clicking a folder closes it', await t.waitFor('!document.querySelector("#fpane [data-key=\'a:Moon\']") && document.querySelector("#fpane .fold").getAttribute("aria-expanded") === "false"', 2000));
      // Search: matches in closed folders too, under their folder's name, with the words marked.
      await t.js('const i = document.querySelector("#fpane .pfind input"); i.focus(); i.value = "moon"; i.dispatchEvent(new Event("input"));');
      const s = await t.js('return { text: document.querySelector("#fpane .fb").innerText, marks: document.querySelectorAll("#fpane .fb mark").length };');
      t.check('Searching finds favorites in folders, under the folder’s name', /Favorites\s*2 found/.test(s.text) && /Space\s*\n\s*Europa \(moon\)\s*\n\s*Moon/.test(s.text) && s.marks >= 3, JSON.stringify(s));
      t.check('…and in Recently viewed', /Recently viewed\s*1 found/.test(s.text), s.text);
      await t.shot('search');
      await t.js('const i = document.querySelector("#fpane .pfind input"); i.value = ""; i.dispatchEvent(new Event("input"));');
      // Ctrl+D removes and adds the article on screen.
      await t.command('Remove from Favorites', 'd');
      t.check('Ctrl+D removes the article on screen from Favorites', await t.waitFor('!JSON.stringify(JSON.parse(localStorage.getItem("e2k.favorites"))).includes("Europa (moon)")', 2000));
      await t.command('Add to Favorites', 'd');
      t.check('…and adds it again, at the top level below the folders', await t.waitFor('JSON.parse(localStorage.getItem("e2k.favorites"))[1]?.title === "Europa (moon)"', 2000),
        await t.js('return localStorage.getItem("e2k.favorites");'));
      await t.shot('folders');
      t.check('No serious accessibility problems in the pane', !(await t.axe()).some((v) => /#fpane/.test(v)), JSON.stringify(await t.axe()));
      // Deleting a folder with favorites in it asks first.
      await ctx('f:' + space);
      await pick('Delete Folder');
      t.check('Deleting a folder with favorites asks first, saying they go too', await t.waitFor('/The favorite in it will be removed/.test(document.querySelector(".overlay .dialog")?.innerText || "")', 2000),
        await t.js('return document.querySelector(".overlay .dialog")?.innerText || "";'));
      await t.js('[...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Delete Folder").click();');
      t.check('…and removes it', await t.waitFor('JSON.stringify(JSON.parse(localStorage.getItem("e2k.favorites")).map((n) => n.title || n.folder)) === JSON.stringify(["Europa (moon)", "Ray Charles"])', 2000),
        await t.js('return localStorage.getItem("e2k.favorites");'));
    },
  },
  {
    name: 'my-articles-close-pin', group: 'My Articles', title: 'My Articles pane: a click outside closes it; pinned, it sits beside the page and stays open; its width can be dragged',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Europa (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Europa (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000);
      const open = () => t.js('return !document.getElementById("fpane").hidden;');
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      t.check('The toolbar button opens the pane', await t.waitFor('!document.getElementById("fpane").hidden', 2000));
      t.check('…with the keyboard focus in its search box', await t.js('return document.activeElement === document.querySelector("#fpane .pfind input");'));
      const fb = await t.js('const r = document.querySelector("#fpane .fb").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };');
      await t.click(fb.x, fb.y);
      t.check('A click inside it doesn’t close it', await open());
      const page = await t.js('const r = document.querySelector(".content.article").getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + 200 };');
      await t.click(page.x, page.y);
      t.check('A click on the page closes it', !(await open()));
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      await t.waitFor('!document.getElementById("fpane").hidden', 2000);
      await t.key('Escape');
      t.check('Escape closes it', !(await open()));
      t.check('…and the focus goes back where it was', (await t.focused()).where !== 'none' && !(await t.js('return document.getElementById("fpane").contains(document.activeElement);')));
      // Pinned: beside the page, not over it.
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      await t.waitFor('!document.getElementById("fpane").hidden', 2000);
      await t.js('document.querySelector("#fpane .pin").click();');
      const side = await t.js('const p = document.getElementById("fpane").getBoundingClientRect(), v = document.getElementById("view").getBoundingClientRect(); return { pane: Math.round(p.right), view: Math.round(v.left), pressed: document.querySelector("#fpane .pin").getAttribute("aria-pressed") };');
      t.check('Pinned, the page moves over beside it', Math.abs(side.view - side.pane) <= 2 && side.pressed === 'true', JSON.stringify(side));
      const page2 = await t.js('const r = document.querySelector(".content.article").getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + 200 };');
      await t.click(page2.x, page2.y);
      t.check('…and a click on the page leaves it open', await open());
      await t.key('Escape');
      t.check('…and so does Escape', await open());
      await t.shot('pinned');
      // Its edge drags wider, within limits, and is remembered.
      const g = await t.js('const r = document.querySelector("#fpane .fgrip").getBoundingClientRect(); return { x: r.left + 3, y: r.top + 300 };');
      await t.js(`const g = document.querySelector("#fpane .fgrip");
        g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ${g.x}, clientY: ${g.y}, button: 0 }));
        dispatchEvent(new MouseEvent('mousemove', { clientX: ${g.x + 90}, clientY: ${g.y} }));
        dispatchEvent(new MouseEvent('mouseup', { clientX: ${g.x + 90}, clientY: ${g.y} }));`);
      const w = await t.js('return { w: Math.round(document.getElementById("fpane").getBoundingClientRect().width), saved: localStorage.getItem("e2k.paneWidth") };');
      t.check('Dragging its edge makes it wider (and it’s remembered)', Math.abs(w.w - 340) <= 2 && w.saved === '340', JSON.stringify(w));
      await t.js(`const g = document.querySelector("#fpane .fgrip");
        g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 340, clientY: 300, button: 0 }));
        dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 300 }));
        dispatchEvent(new MouseEvent('mouseup', { clientX: 900, clientY: 300 }));`);
      t.check('…up to 480 pixels', await t.js('return Math.round(document.getElementById("fpane").getBoundingClientRect().width) === 480;'));
      // The pane, pinned, stays pinned the next time.
      await t.js('location.reload();');
      await t.waitFor('document.querySelector(".tbtn[data-cmd=favpane]")', 20000);
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      t.check('Pinned is remembered', await t.waitFor('!document.getElementById("fpane").hidden && document.querySelector(".stage").classList.contains("pinned") && Math.round(document.getElementById("fpane").getBoundingClientRect().width) === 480', 3000));
      await t.js('document.querySelector("#fpane .pin").click();');
      t.check('Unpinned, the page is under it again', await t.js('return !document.querySelector(".stage").classList.contains("pinned") && Math.round(document.getElementById("view").getBoundingClientRect().left) === 0;'));
    },
  },
  {
    name: 'my-articles-downloads', group: 'My Articles', title: 'My Articles pane: each favorite’s download state (download it from there), Downloaded, Download all, and Recently viewed’s ✕ and Clear all',
    route: 'home',
    async run(t) {
      await t.js(`localStorage.setItem('e2k.favorites', JSON.stringify([{ folder: 'Moons', id: 'm1', open: true, items: [{ title: 'Deimos (moon)' }, { title: 'Phobos (moon)' }] }, { title: 'Callisto (moon)' }]));
        localStorage.setItem('e2k.recent', JSON.stringify(['Jupiter', 'Saturn']));`);
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      await t.waitFor('document.querySelector("#fpane [data-key=\'a:Deimos (moon)\'] .mark")', 5000);
      t.check('Download all is offered while some favorites aren’t downloaded', await t.js('return [...document.querySelectorAll("#fpane .newf")].some((b) => b.textContent === "Download all");'));
      await t.js('document.querySelector("#fpane [data-key=\'a:Deimos (moon)\'] button.mark").click();');
      t.check('A favorite’s download button downloads it, showing a ring meanwhile, then the check', await t.waitFor('document.querySelector("#fpane [data-key=\'a:Deimos (moon)\'] .mark.done")', 60000));
      t.check('It’s listed under Downloaded', await t.waitFor('document.querySelector("#fpane [data-key=\'d:Deimos (moon)\']")', 5000));
      t.check('…with the space downloads use', await t.js('return /Downloaded\\s*[\\d.]+ (MB|GB)/.test(document.querySelector("#fpane .fb").innerText);'));
      // Download Folder…: the confirmation, with the count, the size, and the free space.
      await t.js(`const r = document.querySelector("#fpane [data-key='f:m1']"); const b = r.getBoundingClientRect();
        r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 5, button: 2 }));
        [...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.startsWith("Download Folder")).click();`);
      await t.waitFor('document.querySelector(".overlay .dialog.dlall")', 5000);
      const d = await t.js('return document.querySelector(".overlay .dialog.dlall")?.innerText || "";');
      t.check('Download Folder… asks first, with how many, about how big, and the free space', /1 of the 2 favorites in it isn’t downloaded yet/.test(d || '') && /Download size\s*About/.test(d) && /Free space on this drive/.test(d) && /Download 1 Article/.test(d), d);
      await t.shot('download-folder');
      await t.js('[...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Download 1 Article").click();');
      t.check('…then downloads it in the background, with the status bar telling how far along', await t.waitFor('/Downloading articles: 1 of 1/.test(document.getElementById("status").textContent)', 5000)
        && await t.waitFor('document.querySelector("#fpane [data-key=\'a:Phobos (moon)\'] .mark.done") && /Downloaded 1 article/.test(document.getElementById("status").textContent)', 90000),
        await t.js('return document.getElementById("status").textContent;'));
      // Recently viewed: ✕ removes one; Clear all asks, then clears.
      await t.js('document.querySelector("#fpane [data-key=\'r:Saturn\'] .rx").click();');
      t.check('✕ removes an article from Recently viewed (and History)', await t.waitFor('!document.querySelector("#fpane [data-key=\'r:Saturn\']") && JSON.parse(localStorage.getItem("e2k.history")).map((e) => e.t).join() === "Jupiter"', 2000),
        await t.js('return localStorage.getItem("e2k.history");'));
      await t.js('[...document.querySelectorAll("#fpane .newf")].find((b) => b.textContent === "Clear all").click();');
      t.check('Clear all asks first: the last hour, today, or everything', await t.waitFor('/Clear your history/.test(document.querySelector(".overlay .dialog")?.innerText || "") && document.querySelectorAll(".overlay input[name=clearh]").length === 3', 2000));
      await t.js('document.querySelector(".overlay input[value=all]").click(); [...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Clear History").click();');
      t.check('…then clears the list', await t.waitFor('localStorage.getItem("e2k.history") === "[]" && !document.querySelector("#fpane [data-key^=\'r:\']")', 2000));
      // Delete Download from the right-click menu.
      await t.js(`const r = document.querySelector("#fpane [data-key='d:Deimos (moon)']"); const b = r.getBoundingClientRect();
        r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 5, button: 2 }));
        [...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.startsWith("Delete Download")).click();`);
      t.check('Delete Download removes the copy; the favorite gets its download button back', await t.waitFor('!document.querySelector("#fpane [data-key=\'d:Deimos (moon)\']") && document.querySelector("#fpane [data-key=\'a:Deimos (moon)\'] button.mark.get")', 5000));
      for (const x of ['Deimos (moon)', 'Phobos (moon)']) await t.js(`await window.e2k.saved.remove(${JSON.stringify(x)}); return true;`);
    },
  },
  {
    name: 'my-articles-show-drag', group: 'My Articles', title: 'Show in My Articles (the pane’s right-click menu) opens the page at the row, lit; dragging ticked rows moves them all',
    route: 'home',
    async run(t) {
      await t.js(`localStorage.setItem('e2k.favorites', JSON.stringify([{ folder: 'Space', id: 'sp', open: true, items: [{ title: 'Saturn' }, { title: 'Mars' }] },
        { folder: 'Moons', id: 'mo', open: true, items: [] }, { title: 'Moon' }, { title: 'Io (moon)' }, { title: 'Europa (moon)' }]));`);
      t.win.webContents.reload();
      await t.waitFor('document.querySelector(".home")', 15000);
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      await t.waitFor('document.querySelector("#fpane [data-key=\'a:Mars\']")', 5000);
      const ctx = (key) => `const r = document.querySelector("#fpane [data-key='${key}']"); const b = r.getBoundingClientRect();
        r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 5, button: 2 }));
        return [...document.querySelectorAll(".menu.ctx .mi")].map((m) => m.textContent.trim());`;
      const items = await t.js(ctx('a:Mars'));
      t.check('A favorite’s right-click menu has Show in My Articles', items.some((x) => x.startsWith('Show in My Articles')), JSON.stringify(items));
      await t.js('[...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.startsWith("Show in My Articles")).click();');
      t.check('…which opens its folder on the page, with the row lit and focused, and the pane closed', await t.waitFor(`document.querySelector(".myart .mhead b")?.textContent === "Space" && document.querySelector(".myart .mrow.shown[data-key='a:Mars']")
        && document.activeElement?.closest(".mrow")?.dataset.key === "a:Mars" && document.getElementById("fpane").hidden`, 6000),
        await t.js('return JSON.stringify({ h1: document.querySelector(".myart .band h1")?.textContent, head: document.querySelector(".myart .mhead b")?.textContent, shown: !!document.querySelector(".myart .mrow.shown"), focus: document.activeElement?.outerHTML.slice(0, 80), pane: document.getElementById("fpane").hidden });'));
      await t.sleep(300);
      await t.shot('show-in-my-articles');
      // A folder goes to the folder itself.
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      await t.waitFor('document.querySelector("#fpane [data-key=\'f:mo\']")', 5000);
      await t.js(ctx('f:mo'));
      await t.js('[...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.startsWith("Show in My Articles")).click();');
      t.check('A folder’s Show in My Articles opens that folder', await t.waitFor('document.querySelector(".myart .mhead b")?.textContent === "Moons"', 6000));
      // Dragging several ticked rows onto a folder moves them all.
      await t.js('E2K.go("myarticles/favorites/loose");');
      await t.waitFor('document.querySelector(".myart .mrow[data-key=\'a:Io (moon)\']")', 6000);
      await t.js(`for (const k of ['a:Io (moon)', 'a:Europa (moon)']) document.querySelector('.myart .mrow[data-key="' + k + '"] input[type=checkbox]').click();`);
      const moved = await t.js(`const dt = new DataTransfer();
        const from = document.querySelector('.myart .mrow[data-key="a:Io (moon)"]');
        const to = [...document.querySelectorAll('.myart .rail .mfold')].find((x) => x.textContent.includes('Moons'));
        from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const text = dt.getData('text/plain');
        to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        return text;`);
      t.check('Dragging a ticked row carries all the ticked rows', moved === 'Io (moon)\nEuropa (moon)', JSON.stringify(moved));
      t.check('…and dropping them on a folder moves them all there', await t.waitFor(`JSON.parse(localStorage.getItem("e2k.favorites")).find((n) => n.id === "mo").items.map((n) => n.title).join() === "Io (moon),Europa (moon)"`, 3000),
        await t.js('return localStorage.getItem("e2k.favorites");'));
      t.check('…saying so in the status bar, with the selection cleared', await t.waitFor('/Moved 2 articles to the folder “Moons”/.test(document.getElementById("status").textContent) && !document.querySelector(".myart .msel")', 3000),
        await t.js('return document.getElementById("status").textContent;'));
      t.check('Moon is the only favorite left outside a folder', await t.js('return JSON.parse(localStorage.getItem("e2k.favorites")).filter((n) => n.title).map((n) => n.title).join() === "Moon";'));
    },
  },
  {
    name: 'my-articles-page', group: 'My Articles', title: 'My Articles page: Favorites with its folders, the selection bar (Move to…, Remove), and the toolbar’s Manage menu',
    route: 'home',
    async run(t) {
      await t.js(`localStorage.setItem('e2k.favorites', JSON.stringify([{ folder: 'Space', id: 'sp', open: true, items: [{ title: 'Saturn' }, { title: 'Mars' }] }, { title: 'Moon' }]));`);
      // The toolbar's arrow: Manage.
      await t.js('document.querySelector(".tbtn[data-cmd=manage]").click();');
      t.check('The arrow beside My Articles opens Manage: Favorites, Downloaded Articles, History',
        await t.waitFor('[...document.querySelectorAll(".menu.manage .mi")].map((m) => m.firstChild.textContent).join("|") === "Favorites…|Downloaded Articles…|History…"', 2000));
      await t.shot('manage-menu');
      await t.js('[...document.querySelectorAll(".menu.manage .mi")][0].click();');
      t.check('Favorites… opens the page', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "Favorites"', 5000));
      t.check('…with the location bar at My Articles › Favorites', await t.js('return /My Articles\\s*›\\s*Favorites$/.test(document.getElementById("crumbs").innerText.trim());'),
        await t.js('return document.getElementById("crumbs").innerText;'));
      t.check('The rail lists the views with counts, and the folders', await t.js(`const r = document.querySelector(".myart .rail").innerText;
        return /Favorites\\s*3/.test(r) && /All favorites\\s*3/.test(r) && /Space\\s*2/.test(r) && /Not in a folder\\s*1/.test(r);`), await t.js('return document.querySelector(".myart .rail").innerText;'));
      t.check('All favorites lists every favorite, with its folder', await t.js(`return [...document.querySelectorAll(".myart .mrow .mlink")].map((b) => b.textContent).join() === "Saturn,Mars,Moon"
        && /Space/.test(document.querySelector('.myart .mrow[data-title="Saturn"] .mwhere')?.textContent || "");`));
      t.check('Pictures and descriptions are filled in', await t.waitFor('document.querySelectorAll(".myart .mrow .th:not(.ph)").length === 3 && [...document.querySelectorAll(".myart .mrow .md")].every((d) => d.textContent)', 20000));
      // A folder from the rail.
      await t.js('[...document.querySelectorAll(".myart .rail .mfold")].find((b) => b.textContent.includes("Space")).click();');
      t.check('A folder in the rail shows what’s in it', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "Space" && document.querySelectorAll(".myart .mrow").length === 2', 5000));
      t.check('…and the location bar adds it', await t.js('return /Favorites\\s*›\\s*Space/.test(document.getElementById("crumbs").innerText);'), await t.js('return document.getElementById("crumbs").innerText;'));
      // Select both, then Move to… the top level.
      await t.js('document.querySelectorAll(".myart .mrow .chk input").forEach((c) => c.click());');
      t.check('Ticking keeps the keyboard where it was (the list isn’t redrawn)', await t.js('return document.querySelectorAll(".myart .mrow.sel").length === 2;'));
      t.check('Ticking rows shows the selection bar', await t.waitFor('/2 selected/.test(document.querySelector(".myart .msel")?.innerText || "")', 2000));
      await t.sleep(1000);
      await t.shot('selected');
      await t.js('[...document.querySelectorAll(".myart .msel .go")].find((b) => b.textContent === "Move to…").click();');
      await t.waitFor('document.querySelector(".menu.ctx .mi")', 2000);
      await t.js('[...document.querySelectorAll(".menu.ctx .mi")].find((m) => m.textContent.trim() === "Favorites (no folder)").click();');
      t.check('Move to… moves them', await t.waitFor(`(() => { const f = JSON.parse(localStorage.getItem("e2k.favorites")); return f[0].items.length === 0 && f.filter((n) => n.title).length === 3; })()`, 2000),
        await t.js('return localStorage.getItem("e2k.favorites");'));
      t.check('…and the folder’s page updates', await t.waitFor('!document.querySelector(".myart .mrow") && /empty/.test(document.querySelector(".myart .mempty")?.textContent || "")', 2000));
      // ✕ removes one; New Folder in the band.
      await t.js('[...document.querySelectorAll(".myart .rail .mfold")].find((b) => b.textContent.includes("Not in a folder")).click();');
      await t.waitFor('document.querySelectorAll(".myart .mrow").length === 3', 3000);
      await t.js('document.querySelector(\'.myart .mrow[data-title="Moon"] .rx\').click();');
      t.check('✕ removes a favorite', await t.waitFor('!document.querySelector(\'.myart .mrow[data-title="Moon"]\') && !localStorage.getItem("e2k.favorites").includes("Moon")', 2000));
      await t.js('[...document.querySelectorAll(".myart .band .bbtn")].find((b) => b.textContent === "New Folder").click();');
      t.check('New Folder makes one, named in place', await t.waitFor('document.activeElement?.matches(".myart input.ren")', 2000));
      await t.js('document.activeElement.value = "Planets";');
      await t.key('Enter');
      t.check('…which appears in the rail', await t.waitFor('[...document.querySelectorAll(".myart .rail .mfold .t")].some((x) => x.textContent === "Planets")', 2000));
      // Search
      await t.js('const i = document.querySelector(".myart .msearch"); i.value = "sat"; i.dispatchEvent(new Event("input"));');
      t.check('Search finds favorites', await t.waitFor('[...document.querySelectorAll(".myart .mrow .mlink")].map((b) => b.textContent).join() === "Saturn"', 2000));
      await t.sleep(800);
      const axePage = await t.axe();
      t.check('No serious accessibility problems on the page', !axePage.length, JSON.stringify(axePage));
      await t.command('Manage Favorites…', 'b');
      t.check('Ctrl+B opens it too', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "Favorites"', 3000));
    },
  },
  {
    name: 'my-articles-history', group: 'My Articles', title: 'History: every article read, by day with times; ✕, Clear History (last hour, today, everything), and Pause history',
    route: 'home',
    async run(t) {
      // 0.5's recently viewed (no times), then History as this version keeps it.
      await t.js(`localStorage.setItem('e2k.recent', JSON.stringify(['Moon', 'Mars']));`);
      await t.js('E2K.openArticle("Europa (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Europa (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000);
      const hist = await t.js('return JSON.parse(localStorage.getItem("e2k.history"));');
      t.check('0.5’s recently viewed carries into History, the article just read on top', hist.map((e) => e.t).join() === 'Europa (moon),Moon,Mars' && hist[0].at > 0 && hist[1].at === 0, JSON.stringify(hist));
      // Days: today, yesterday, three days ago, and earlier.
      await t.js(`const now = Date.now(), d = new Date(); d.setHours(0, 0, 0, 0); const today = d.getTime();
        const h = JSON.parse(localStorage.getItem('e2k.history'));
        h.splice(1, 0, { t: 'Jupiter', at: now - 120000 }, { t: 'Saturn', at: today - 3600e3 }, { t: 'Venus', at: today - 3 * 864e5 + 3600e3 });
        localStorage.setItem('e2k.history', JSON.stringify(h));`);
      await t.command('History…', 'y');
      t.check('Ctrl+Y opens History', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "History"', 5000));
      const days = await t.js('return [...document.querySelectorAll(".myart .mday b")].map((b) => b.textContent);');
      t.check('Grouped by day: Today, Yesterday, the weekday, Earlier', days.length === 4 && days[0] === 'Today' && days[1] === 'Yesterday' && /day, /.test(days[2]) && days[3] === 'Earlier', JSON.stringify(days));
      t.check('Each with the time it was read', await t.js('return /\\d:\\d\\d [AP]M/.test(document.querySelector(".myart .mrow .mtime").textContent);'));
      t.check('The rail says how many', await t.js('return /5\\s*articles this week/.test(document.querySelector(".myart .rail").innerText) || /4\\s*articles this week/.test(document.querySelector(".myart .rail").innerText);'),
        await t.js('return document.querySelector(".myart .rail").innerText;'));
      await t.sleep(1000);
      await t.shot('history');
      // ✕
      await t.js('document.querySelector(\'.myart .mrow[data-title="Venus"] .rx\').click();');
      t.check('✕ removes an article from History', await t.waitFor('!document.querySelector(\'.myart .mrow[data-title="Venus"]\') && !localStorage.getItem("e2k.history").includes("Venus")', 2000));
      // Clear History: the last hour only.
      await t.js('[...document.querySelectorAll(".myart .band .bbtn")].find((b) => b.textContent === "Clear History…").click();');
      await t.waitFor('document.querySelector(".overlay .dialog.clearh")', 2000);
      await t.js('[...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Clear History").click();');
      t.check('Clear History › The last hour clears only that', await t.waitFor('JSON.parse(localStorage.getItem("e2k.history")).map((e) => e.t).join() === "Saturn,Moon,Mars"', 2000),
        await t.js('return localStorage.getItem("e2k.history");'));
      // Pause history: reading doesn't add to it.
      await t.js('[...document.querySelectorAll(".myart .rail .lnk")].find((b) => b.textContent === "Pause history").click();');
      t.check('Pause history says it’s paused', await t.waitFor('/History is paused/.test(document.querySelector(".myart .rail").innerText)', 2000));
      await t.js('E2K.openArticle("Callisto (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Callisto (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000);
      await t.sleep(1500);
      t.check('…and an article read meanwhile isn’t added', !(await t.js('return localStorage.getItem("e2k.history").includes("Callisto");')));
      await t.js('E2K.go("myarticles/history");');
      await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "History"', 5000);
      await t.js('[...document.querySelectorAll(".myart .rail .lnk")].find((b) => b.textContent === "Resume history").click();');
      await t.js('E2K.openArticle("Io (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Io (moon)"', 40000);
      t.check('Resumed, reading adds again', await t.waitFor('JSON.parse(localStorage.getItem("e2k.history"))[0]?.t === "Io (moon)"', 5000), await t.js('return localStorage.getItem("e2k.history");'));
    },
  },
  {
    name: 'download-category', group: 'Downloaded articles', title: 'Download a Category: the article’s categories with counts and sizes; a small one downloads as a group, into a Favorites folder, and is deleted as one',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Europa (moon)");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Europa (moon)" && document.querySelectorAll(".content.article .text p").length > 3', 40000);
      await t.js('document.querySelector(".bsplit .darrow").click();');
      await t.waitFor('/Download a category/.test(document.querySelector(".rmenu")?.innerText || "")', 3000);
      await t.js('[...document.querySelectorAll(".rmenu .ri")].find((b) => /Download a category/.test(b.textContent)).click();');
      t.check('Download a category… lists the article’s categories, with how many articles and about how big', await t.waitFor('document.querySelectorAll(".dialog.savecat .scr").length >= 3', 20000)
        && await t.js('return [...document.querySelectorAll(".dialog.savecat .scr")].every((r) => /\\d article/.test(r.innerText));'),
        await t.js('return document.querySelector(".dialog.savecat")?.innerText || "";'));
      t.check('Big ones say only the 200 most read are downloaded, or that they’re too big', await t.js(`return [...document.querySelectorAll(".dialog.savecat .scr")].filter((r) => /([\\d,]+) article/.exec(r.innerText) && Number(/([\\d,]+) article/.exec(r.innerText)[1].replace(/,/g, "")) > 200)
        .every((r) => /200 most read|Too big/.test(r.innerText));`));
      // The smallest category with a few articles.
      const pick = await t.js(`const rows = [...document.querySelectorAll(".dialog.savecat .scr")].map((r) => ({ r, n: Number(/([\\d,]+) article/.exec(r.innerText)[1].replace(/,/g, "")) }));
        const c = rows.find((x) => x.n >= 2 && x.n <= 6); if (!c) return null; c.r.querySelector("input").click(); return { name: c.r.querySelector("b").textContent, n: c.n };`);
      t.check('A small category can be picked', !!pick, JSON.stringify(pick));
      if (!pick) return;
      t.check('The button says how many', await t.js(`return document.querySelector(".dialog.savecat .go.default").textContent === "Download ${pick.n} Articles";`),
        await t.js('return document.querySelector(".dialog.savecat .go.default").textContent;'));
      await t.js('document.querySelectorAll(".dialog.savecat .scopts input[type=checkbox]")[2].click();');
      t.check('Also add them to a Favorites folder: a new one named after the category', await t.js(`return document.querySelector(".dialog.savecat select").selectedOptions[0].textContent === "New folder “${pick.name}”";`));
      await t.sleep(900);
      await t.shot('category-dialog');
      await t.js('document.querySelector(".dialog.savecat .go.default").click();');
      t.check('The articles download one after another, the status bar telling how far along', await t.waitFor(`/Downloading “${pick.name}”: \\d+ of|^Downloaded \\d+ articles/.test(document.getElementById("status").textContent)`, 20000),
        await t.js('return document.getElementById("status").textContent;'));
      t.check('…until all are downloaded', await t.waitFor(`/^Downloaded \\d+ articles/.test(document.getElementById("status").textContent)`, 240000),
        await t.js('return document.getElementById("status").textContent;'));
      const cat = await t.js(`return JSON.parse(localStorage.getItem("e2k.dlCategories"))[0];`);
      t.check('The category is kept, with its articles', cat?.name === pick.name && cat.titles.length === pick.n, JSON.stringify(cat));
      t.check('…and they’re favorites in a folder named after it', await t.js(`const f = JSON.parse(localStorage.getItem("e2k.favorites")).find((n) => n.folder === ${JSON.stringify(pick.name)}); return !!f && f.items.length === ${pick.n};`));
      // The pane: the category as a group under Downloaded.
      await t.js('document.querySelector(".tbtn[data-cmd=favpane]").click();');
      t.check('The pane shows it under Downloaded as one group, with the count', await t.waitFor(`(() => { const g = [...document.querySelectorAll("#fpane .fold.grp")].find((b) => b.dataset.key === ${JSON.stringify('c:' + pick.name)}); return g && g.querySelector(".c").textContent === "${pick.n}"; })()`, 5000));
      await t.js(`[...document.querySelectorAll("#fpane .fold.grp")].find((b) => b.dataset.key === ${JSON.stringify('c:' + pick.name)}).click();`);
      t.check('…which opens to show its articles', await t.waitFor(`document.querySelectorAll("#fpane [data-key^='d:']").length >= ${pick.n}`, 2000));
      await t.sleep(900);
      await t.shot('pane-group');
      // The page: Categories in the rail.
      await t.js('E2K.go("myarticles/downloaded");');
      t.check('The Downloaded page lists it under Categories', await t.waitFor(`[...document.querySelectorAll(".myart .rail .mfold")].some((b) => b.textContent.includes(${JSON.stringify(pick.name)}))`, 5000));
      await t.js(`[...document.querySelectorAll(".myart .rail .mfold")].find((b) => b.textContent.includes(${JSON.stringify(pick.name)})).click();`);
      t.check('…and shows its articles', await t.waitFor(`document.querySelector(".myart .band h1")?.textContent === ${JSON.stringify(pick.name)} && document.querySelectorAll(".myart .mrow").length === ${pick.n}`, 5000));
      await t.js('document.querySelector(".myart .mcatdel").click();');
      t.check('Delete Downloads… asks first', await t.waitFor('/Delete the downloads of/.test(document.querySelector(".overlay .dialog")?.innerText || "")', 2000));
      await t.js('[...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Delete Downloads").click();');
      t.check('…then deletes them all; the favorites stay', await t.waitFor(`(await window.e2k.saved.list()).length === 0`, 15000)
        && await t.js(`return JSON.parse(localStorage.getItem("e2k.favorites")).find((n) => n.folder === ${JSON.stringify(pick.name)})?.items.length === ${pick.n};`));
      // Over 200 articles: the 200 most read, from Wikipedia's page views.
      const views = await t.js('return await Wiki.pageviews(["Moon", "Io (moon)"]);');
      t.check('Page views can be read (for picking the 200 most read)', views.Moon > views['Io (moon)'] && views['Io (moon)'] > 0, JSON.stringify(views));
    },
  },
  {
    name: 'options-storage', group: 'Downloaded articles', title: 'Options › Storage: the space used and free, Show and Remove for downloads, and what a downloaded article brings (no sounds; spoken recordings)',
    route: 'home',
    async run(t) {
      const first = await t.js('return await window.e2k.saved.download("Deimos (moon)");');
      t.check('An article is downloaded to begin with', first?.ok, JSON.stringify(first));
      await t.js('E2KOptions.open(E2K, "Storage");');
      t.check('Options has a Storage tab', await t.waitFor('[...document.querySelectorAll(".options .otab.on")].some((b) => b.textContent === "Storage")', 3000));
      t.check('It shows the space downloaded articles use, and the free space', await t.waitFor('/Downloaded articles [\\d.]+ (MB|GB)/.test(document.querySelector(".ostore .slegend")?.innerText || "") && /Free on this drive/.test(document.querySelector(".ostore .slegend").innerText)', 5000),
        await t.js('return document.querySelector(".ostore")?.innerText || "";'));
      t.check('…and how many articles are downloaded', await t.js('return /1 article/.test(document.querySelectorAll(".ostore .srow")[1].innerText);'));
      const boxes = () => t.js('return [...document.querySelectorAll(".ostore .ocheck input")].map((i) => i.checked);');
      t.check('Sounds come with downloaded articles; videos and spoken recordings don’t', JSON.stringify(await boxes()) === '[true,false,false]', JSON.stringify(await boxes()));
      await t.sleep(600);
      await t.shot('storage');
      // No sounds.
      await t.js('document.querySelectorAll(".ostore .ocheck input")[0].click(); [...document.querySelectorAll(".options .df .go")].find((b) => b.textContent === "OK").click();');
      t.check('The choice is saved', await t.waitFor('localStorage.getItem("e2k.dlSounds") === "false"', 3000));
      await t.js('E2K.openArticle("Worcestershire sauce");');
      await t.waitFor('document.querySelector(".band h1")?.textContent === "Worcestershire sauce" && document.querySelector(".bsplit .dmain")?.title', 40000);
      t.check('The Download button says what comes', await t.js('return /with its pictures\\)/.test(document.querySelector(".bsplit .dmain")?.title || "");'),
        await t.js('return (document.querySelector(".band h1")?.textContent || "-") + " | " + (document.querySelector(".bsplit .dmain")?.title || "-") + " | " + !!document.querySelector(".overlay");'));
      await t.js('document.querySelector(".bsplit .dmain").click();');
      await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Downloaded"', 60000);
      const sauce = await t.js('return await window.e2k.saved.get("Worcestershire sauce");');
      t.check('Without sounds, an article’s pronunciation isn’t downloaded', sauce && sauce.sounds === 0 && sauce.noSounds && sauce.pictures > 0, JSON.stringify(sauce));
      // Sounds and spoken recordings.
      await t.js('localStorage.setItem("e2k.dlSounds", "true"); localStorage.setItem("e2k.dlSpoken", "true");');
      const whale = await t.js('return await new Promise((r) => { E2K.downloadTitle("Humpback whale").then(async () => r(await window.e2k.saved.get("Humpback whale"))); });');
      t.check('With spoken recordings, the article read aloud downloads too', whale && whale.spoken >= 1, JSON.stringify(whale));
      // Remove… everything.
      await t.js('E2KOptions.open(E2K, "Storage");');
      await t.waitFor('/3 articles/.test(document.querySelectorAll(".ostore .srow")[1]?.innerText || "")', 5000);
      await t.js('[...document.querySelectorAll(".ostore .srow .go")].find((b) => b.textContent === "Remove…").click();');
      t.check('Remove… asks first', await t.waitFor('/Remove all downloaded articles/.test([...document.querySelectorAll(".overlay .dialog")].pop()?.innerText || "")', 3000));
      await t.js('[...document.querySelectorAll(".overlay .go")].find((b) => b.textContent === "Remove All").click();');
      t.check('…then removes them all, and the tab updates', await t.waitFor('(await window.e2k.saved.list()).length === 0 && /None yet/.test(document.querySelectorAll(".ostore .srow")[1]?.innerText || "")', 15000));
      // Privacy: History.
      await t.js('[...document.querySelectorAll(".options .otab")].find((b) => b.textContent === "Privacy").click();');
      t.check('Privacy’s History says how many articles it holds', await t.js('return /\\d+ articles? in your history/.test(document.querySelector(".options .obody").innerText);'),
        await t.js('return document.querySelector(".options .obody").innerText;'));
    },
  },
  {
    name: 'home-offline-downloads', group: 'Downloaded articles', title: 'Offline, Home shows one of your downloaded articles in place of today’s discovery, with a link to them all',
    route: 'home',
    async run(t) {
      for (const x of ['Deimos (moon)', 'Phobos (moon)']) await t.js(`return (await window.e2k.saved.download(${JSON.stringify(x)})).ok;`);
      await t.command('Offline Mode', 'O', { ctrlKey: true, shiftKey: true });
      await t.js('E2K.go("home");');
      t.check('Offline, Home’s panel is “From your downloaded articles”', await t.waitFor('document.querySelector(".home .disc h3")?.textContent === "From your downloaded articles"', 15000),
        await t.js('return document.querySelector(".home .disc")?.innerText || "";'));
      t.check('…with one of them, its picture and its opening', await t.waitFor('/^(Deimos|Phobos) \\(moon\\)$/.test(document.querySelector(".home .disc .row b").textContent) && document.querySelector(".home .disc .row p").textContent.length > 40', 5000));
      t.check('…and a link to them all', await t.js('return document.querySelector(".home .disc .savedlink")?.textContent === "All 2 downloaded articles ›";'));
      await t.sleep(800);
      await t.shot('home-offline');
      const title = await t.js('return document.querySelector(".home .disc .row b").textContent;');
      await t.js('[...document.querySelectorAll(".home .disc .more")].find((b) => b.textContent === "Read it ›").click();');
      t.check('Read it › opens it (from its copy)', await t.waitFor(`document.querySelector(".band h1")?.textContent === ${JSON.stringify(title)}`, 15000));
      await t.js('E2K.go("home");');
      await t.waitFor('document.querySelector(".home .disc .savedlink:not([hidden])")', 15000);
      await t.js('document.querySelector(".home .disc .savedlink").click();');
      t.check('The link opens the Downloaded page', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "Downloaded"', 5000));
      await t.command('Offline Mode', 'O', { ctrlKey: true, shiftKey: true });
      for (const x of ['Deimos (moon)', 'Phobos (moon)']) await t.js(`await window.e2k.saved.remove(${JSON.stringify(x)}); return true;`);
    },
  },
  {
    name: 'menu-submenus', group: 'My Articles', title: 'The Favorites menu: Manage ▸ and each folder ▸ open as submenus, by mouse and by keyboard',
    route: 'home', only: 'win32',
    async run(t) {
      await t.js(`localStorage.setItem('e2k.favorites', JSON.stringify([{ folder: 'Space', id: 'sp', open: true, items: [{ title: 'Moon' }, { folder: 'Moons', id: 'mo', items: [{ title: 'Io (moon)' }] }] }, { title: 'Saturn' }]));`);
      const openFav = () => t.js(`const m = [...document.querySelectorAll("#menubar .m")].find((x) => x.firstChild.textContent === "Favorites");
        m.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return true;`);
      const items = (sel = '#menubar .menu') => t.js(`const b = document.querySelector(${JSON.stringify(sel)}); return b ? [...b.children].filter((c) => c.classList.contains("mi")).map((c) => c.firstChild.textContent + (c.classList.contains("sub") ? " ▸" : "")) : null;`);
      await openFav();
      const top = await items();
      t.check('The Favorites menu: My Articles, Add to Favorites, Manage ▸, then the folders ▸ and favorites', JSON.stringify(top) === JSON.stringify(['My Articles', 'Add to Favorites', 'Manage ▸', 'Space ▸', 'Saturn']), JSON.stringify(top));
      // The mouse: hovering Manage opens it.
      const r = await t.js('const m = [...document.querySelectorAll("#menubar .menu > .mi")].find((x) => x.firstChild.textContent === "Manage"); const b = m.getBoundingClientRect(); return { x: b.left + 30, y: b.top + b.height / 2 };');
      await t.hover(r.x, r.y);
      await t.hover(r.x + 4, r.y);
      t.check('Hovering Manage opens its submenu', await t.waitFor('[...(document.querySelector("#menubar .menu .subm")?.children || [])].map((c) => c.firstChild.textContent).join("|") === "Favorites…|Downloaded Articles…|History…"', 2000));
      await t.shot('manage-submenu');
      await t.js('[...document.querySelectorAll("#menubar .subm .mi")].find((m) => m.firstChild.textContent === "History…").click();');
      t.check('…and its History… opens History', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "History"', 5000));
      // The keyboard: F10, to Favorites, down to Space, right into it, down to Moons, right into that, Enter.
      await t.key('F10');
      for (let i = 0; i < 4; i++) await t.key('Right');
      await t.key('Down');
      for (let i = 0; i < 3; i++) await t.key('Down');
      t.check('The arrows reach a folder', (await t.focused()).text.startsWith('Space'), JSON.stringify(await t.focused()));
      await t.key('Right');
      t.check('→ opens it, on its first item', (await t.focused()).text === 'Moon', JSON.stringify(await t.focused()));
      await t.key('Left');
      t.check('← closes it, back on the folder', (await t.focused()).text.startsWith('Space') && !(await t.js('return !!document.querySelector("#menubar .subm");')), JSON.stringify(await t.focused()));
      await t.key('Right');
      await t.key('Down');
      await t.key('Right');
      t.check('A folder inside a folder opens the same way', (await t.focused()).text === 'Io (moon)', JSON.stringify(await t.focused()));
      await t.key('Enter');
      t.check('Enter opens the favorite', await t.waitFor('document.querySelector(".band h1")?.textContent === "Io (moon)"', 30000));
      t.check('…and the menus close', !(await t.js('return !!document.querySelector("#menubar .menu");')));
    },
  },
  {
    name: 'download-sounds', group: 'Downloaded articles', title: 'A downloaded article’s sounds and pronunciation play offline; a recording of the whole article read aloud isn’t downloaded',
    route: 'home',
    async run(t) {
      // Humpback whale: a whale's song, and a recording of the article read aloud. Worcestershire sauce: how it's said.
      const whale = await t.js('return await window.e2k.saved.download("Humpback whale");');
      t.check('Humpback whale downloads with its sound', whale?.ok && whale.entry.sounds >= 1, JSON.stringify(whale));
      const sauce = await t.js('return await window.e2k.saved.download("Worcestershire sauce");');
      t.check('Worcestershire sauce downloads with its pronunciation', sauce?.ok && sauce.entry.sounds >= 1, JSON.stringify(sauce));
      const media = await t.js(`const m = await fetch("e2k-saved://a/${whale?.entry?.key}/media.json").then((r) => r.json());
        return m.items.filter((i) => i.type === 'audio').map((i) => ({ title: i.title, kind: i.audio_type, url: i.info?.url || '', mime: i.info?.mime || '', dur: i.info?.duration || 0 }));`);
      const song = media.find((m) => m.kind !== 'spoken'), read = media.find((m) => m.kind === 'spoken');
      t.check('The sound’s details are kept with it (a downloaded MP3, its length)', song && song.url.startsWith('e2k-saved:') && song.mime === 'audio/mpeg' && song.dur > 10, JSON.stringify(media));
      t.check('The article read aloud isn’t downloaded', read && !read.url, JSON.stringify(read));

      await t.js('window.e2k.net.setOffline(true); E2K.updateNet();');
      const count = await t.countNetwork();
      const plays = (sel) => t.js(`const a = document.querySelector(${JSON.stringify(sel)});
        if (!a) return { found: false };
        const src = a.currentSrc || a.querySelector('source')?.src || a.src;
        a.preload = 'auto'; a.load();
        const ok = await new Promise((r) => { a.addEventListener('loadedmetadata', () => r(true), { once: true }); a.addEventListener('error', () => r(false), { once: true }); setTimeout(() => r(false), 8000); });
        return { found: true, src: (a.currentSrc || src).slice(0, 60), ok, duration: Math.round(a.duration || 0) };`);
      await t.js('E2K.openArticle("Humpback whale");');
      t.check('In Offline mode Humpback whale opens with its sound player', await t.waitFor('document.querySelector(".band h1")?.textContent === "Humpback whale" && document.querySelector(".content.article .aud audio")', 20000),
        await t.js('return document.querySelector(".errbox")?.innerText || "";'));
      const p = await plays('.content.article .aud audio');
      t.check('…and the sound plays from this computer', p.ok && p.src.startsWith('e2k-saved:') && p.duration > 10, JSON.stringify(p));
      t.check('The article’s Media list has the sound too (for the media viewer)', await t.waitFor('[...document.querySelectorAll("button, a")].some((b) => /^\\s*1 sound\\s*$/.test(b.textContent))', 8000),
        await t.js('return [...document.querySelectorAll("button, a")].map((b) => b.textContent.trim()).filter((x) => /^\\d+ (picture|video|sound)/.test(x)).join(", ");'));
      await t.js('[...document.querySelectorAll(".mbox button")].find((b) => /♪/.test(b.textContent))?.click();');
      const cov = await t.js(`await new Promise((r) => setTimeout(r, 1500)); const img = document.querySelector('.mview .mstage.audio.art img.cover');
        return { src: (img?.src || '').slice(0, 40), shown: img?.naturalWidth || 0 };`);
      t.check('In the viewer the sound shows the article’s picture, from the downloaded copy', cov.src.startsWith('e2k-saved:') && cov.shown > 0, JSON.stringify(cov));
      await t.js('document.querySelector(".mview")?.remove();');
      await t.shot('sound-offline');
      await t.js('E2K.openArticle("Worcestershire sauce");');
      t.check('Worcestershire sauce opens with its pronunciation button', await t.waitFor('document.querySelector(".band h1")?.textContent === "Worcestershire sauce" && document.querySelector(".pron audio")', 20000),
        await t.js('return document.querySelector(".errbox")?.innerText || document.querySelector(".band h1")?.textContent || "";'));
      const q = await plays('.pron audio');
      t.check('…and the pronunciation plays from this computer', q.ok && q.src.startsWith('e2k-saved:'), JSON.stringify(q));
      const net = count();
      t.check('Nothing came from the internet', net.n === 0, net.n ? `${net.n}: ${net.urls.join(' ')}` : '');
    },
  },
  {
    name: 'download-videos', group: 'Downloaded articles', title: 'An article downloads with its videos when asked (with their size first); they play offline; downloading again without them frees the space',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Humpback whale");');
      t.check('The article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Humpback whale" && document.querySelectorAll(".content.article .text p").length > 3', 40000));
      const menuText = 'return document.querySelector(".rmenu")?.innerText || "";';
      await t.js('document.querySelector(".bsplit .darrow").click();');
      t.check('The download choices offer its videos, with their size', await t.waitFor('/Download it with its videos too\\s+Its 2 videos, about [\\d.]+ MB more/.test(document.querySelector(".rmenu")?.innerText || "")', 15000), await t.js(menuText));
      await t.shot('videos-choice');
      await t.js('[...document.querySelectorAll(".rmenu .ri")].find((b) => /with its videos too/.test(b.textContent)).click();');
      t.check('…and it downloads with them', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Downloaded"', 180000),
        await t.js('return document.querySelector(".bsplit .dmain")?.textContent || "";'));
      t.check('The status bar says so', /Downloaded “Humpback whale” with its videos \([\d.]+ MB\)/.test(await t.js('return document.getElementById("status").textContent;')),
        await t.js('return document.getElementById("status").textContent;'));
      const withV = await t.js('return await window.e2k.saved.get("Humpback whale");');
      t.check('The copy has both videos', withV && withV.videos === 2 && withV.withVideos && withV.videoSize > 500000, JSON.stringify(withV));

      await t.js('window.e2k.net.setOffline(true); E2K.updateNet();');
      const count = await t.countNetwork();
      await t.js('E2K.go("home"); setTimeout(() => E2K.openArticle("Humpback whale"), 300);');
      t.check('In Offline mode it opens with its videos’ still pictures', await t.waitFor('document.querySelector(".band h1")?.textContent === "Humpback whale" && [...document.querySelectorAll(".content.article .vthumb img")].length === 2', 20000)
        && await t.js('return [...document.querySelectorAll(".content.article .vthumb img")].every((i) => i.src.startsWith("e2k-saved:"));'),
        await t.js('return [...document.querySelectorAll(".content.article .vthumb img")].map((i) => i.src.slice(0, 50)).join(" ") || document.querySelector(".errbox")?.innerText || "";'));
      t.check('The article’s Media list has the videos', await t.waitFor('[...document.querySelectorAll("button, a")].some((b) => /^\\s*2 videos\\s*$/.test(b.textContent))', 8000),
        await t.js('return [...document.querySelectorAll("button, a")].map((b) => b.textContent.trim()).filter((x) => /^\\d+ (picture|video|sound)/.test(x)).join(", ");'));
      await t.js('document.querySelector(".content.article .vthumb").click();');
      t.check('A video opens in the viewer', await t.waitFor('document.querySelector(".mview video")', 8000));
      // It plays from this computer, and jumping ahead works (the copy is read a part at a time).
      const v = await t.js(`const v = document.querySelector('.mview video'); v.muted = true;
        const meta = v.readyState >= 1 || await new Promise((r) => { v.addEventListener('loadedmetadata', () => r(true), { once: true }); v.addEventListener('error', () => r(false), { once: true }); setTimeout(() => r(false), 10000); });
        if (!meta) return { src: v.currentSrc.slice(0, 50), ok: false, err: v.error?.code || 0 };
        const to = v.duration / 2;
        const seeked = await new Promise((r) => { v.addEventListener('seeked', () => r(true), { once: true }); setTimeout(() => r(false), 8000); v.currentTime = to; });
        const frame = seeked && await new Promise((r) => { if (v.readyState >= 2) return r(true); v.addEventListener('loadeddata', () => r(true), { once: true }); setTimeout(() => r(v.readyState >= 2), 5000); });
        return { src: v.currentSrc.slice(0, 50), ok: true, duration: Math.round(v.duration), at: Math.round(v.currentTime), seeked, frame, height: v.videoHeight };`);
      t.check('…and plays from this computer, at 480p or less', v.ok && v.src.startsWith('e2k-saved:') && v.duration > 20 && v.height > 0 && v.height <= 480, JSON.stringify(v));
      t.check('…and jumping ahead works', v.seeked && v.frame && v.at >= v.duration / 2 - 1, JSON.stringify(v));
      await t.sleep(800);   // the viewer has faded in
      await t.shot('video-offline');
      const net = count();
      t.check('Nothing came from the internet', net.n === 0, net.n ? `${net.n}: ${net.urls.join(' ')}` : '');
      await t.key('Escape');
      await t.js('document.querySelector(".mview")?.remove();');

      // Online again: downloading again without the videos frees their space.
      await t.js('window.e2k.net.setOffline(false); E2K.updateNet();');
      await t.js('document.querySelector(".bsplit .darrow").click();');
      t.check('Once downloaded with them, the choices offer to download it again without them', await t.waitFor('/Download again without its videos\\s+Frees [\\d.]+ MB/.test(document.querySelector(".rmenu")?.innerText || "")', 5000)
        && !/Download again with its videos/.test(await t.js(menuText)), await t.js(menuText));
      await t.js('[...document.querySelectorAll(".rmenu .ri")].find((b) => /without its videos/.test(b.textContent)).click();');
      await t.waitFor('/Downloading/.test(document.querySelector(".bsplit .dmain")?.textContent || "")', 5000);
      t.check('…which does', await t.waitFor('document.querySelector(".bsplit .dmain")?.textContent === "Downloaded"', 120000));
      const without = await t.js('return await window.e2k.saved.get("Humpback whale");');
      t.check('…and the copy is smaller, with its pictures and sound but no videos', without && without.videos === 0 && !without.withVideos && without.sounds >= 1 && without.size < withV.size - withV.videoSize / 2,
        JSON.stringify({ before: withV?.size, after: without?.size, videos: without?.videos }));
      await t.js('document.querySelector(".bsplit .darrow").click();');
      t.check('…and offers its videos again', await t.waitFor('/Download again with its videos\\s+Its 2 videos/.test(document.querySelector(".rmenu")?.innerText || "")', 15000), await t.js(menuText));
    },
  },
  {
    name: 'sound-cover', group: 'Reading', title: 'A sound in the media viewer shows its article’s picture, like a record cover',
    route: 'home',
    async run(t) {
      await t.js('E2K.openArticle("Florence Nightingale");');
      t.check('The article opens with its sound in the Media list', await t.waitFor('document.querySelector(".band h1")?.textContent === "Florence Nightingale" && [...document.querySelectorAll(".mbox button")].some((b) => /♪/.test(b.textContent))', 40000));
      await t.js('[...document.querySelectorAll(".mbox button")].find((b) => /♪/.test(b.textContent)).click();');
      t.check('The sound opens in the viewer', await t.waitFor('document.querySelector(".mview .mstage.audio")', 8000));
      const cover = `const s = document.querySelector('.mview .mstage.audio'), img = s?.querySelector('img.cover');
        if (img && !img.complete) await new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 8000); });
        const lead = document.querySelector('.media .frame img');
        return { art: s?.classList.contains('art'), src: img?.src || '', shown: img?.naturalWidth || 0, alt: img?.alt, lead: lead?.src || '',
          wave: !!s?.querySelector('.wave'), label: s?.querySelector('.lbl')?.textContent || '' };`;
      const c = await t.js(cover);
      t.check('…with the article’s picture (her portrait), shown', c.art && c.shown > 200 && /Nightingale/i.test(decodeURIComponent(c.src)), JSON.stringify(c));
      t.check('…and the waveform and title under it (the picture is decoration: alt "")', c.wave && c.label && c.alt === '', JSON.stringify(c));
      // Opened from the Media list, it starts playing at once.
      t.check('It plays', await t.waitFor('document.querySelector(".mview .mstage.audio.playing")', 8000));
      await t.sleep(800);
      await t.shot('sound-cover');
      await t.js('document.querySelector(".mview")?.remove();');
    },
  },
  {
    name: 'viewer-portrait', group: 'Reading', title: 'In a tall window (a portrait monitor), the media viewer uses the height for pictures and sounds',
    route: 'home', size: '980x1742',
    async run(t) {
      await t.js('E2K.openArticle("Florence Nightingale");');
      t.check('The article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Florence Nightingale" && [...document.querySelectorAll(".mbox .mt.audio")].length', 40000));
      await t.js('document.querySelector(".mbox .mt.audio").click();');
      await t.waitFor('(() => { const i = document.querySelector(".mview img.cover"); return i && i.complete && i.naturalWidth; })()', 10000);
      const m = await t.js(`const st = document.querySelector('.mview .mstage').getBoundingClientRect(), img = document.querySelector('.mview img.cover').getBoundingClientRect(),
        v = document.querySelector('.mview .mviewer').getBoundingClientRect();
        return { stageW: Math.round(st.width), stageH: Math.round(st.height), picH: Math.round(img.height), viewerBottom: Math.round(v.bottom), win: innerHeight };`);
      t.check('The sound’s stage is taller than wide, and its picture large', m.stageH > m.stageW && m.picH > 600, JSON.stringify(m));
      t.check('…and the whole viewer still fits in the window', m.viewerBottom <= m.win, JSON.stringify(m));
      await t.sleep(600);
      await t.shot('viewer-portrait');
      await t.js('document.querySelector(".mview")?.remove();');
      // A wide window keeps the wide stage.
      t.win.setSize(1260, 900); await t.sleep(600);
      await t.js('document.querySelector(".mbox .mt.audio").click();');
      await t.waitFor('document.querySelector(".mview .mstage")', 5000);
      const w = await t.js('const r = document.querySelector(".mview .mstage").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };');
      t.check('In a wide window it stays wide (16:9)', Math.abs(w.w / w.h - 16 / 9) < 0.05, JSON.stringify(w));
    },
  },
  {
    name: 'toolbar-refresh', group: 'General', title: 'The toolbar: Browse, Media, Activities, then Random and History as icons; it fits the narrowest window, and the section on screen lights up',
    route: 'home', size: '980x700',
    async run(t) {
      // On a display with other scaling the window can open wider than asked; set it again so it's 980 pixels.
      if (t.win.getContentSize()[0] !== 980) { t.win.setContentSize(980, 700); await t.sleep(800); }
      const order = await t.js(`return [...document.querySelectorAll("#toolbar .tbtn, #toolbar .tsep")].map((b) => b.classList.contains("tsep") ? "|" : (b.textContent.trim() || b.getAttribute("aria-label")));`);
      const want = ['Browse', 'Media', 'Activities', '|', 'Random article', 'History'];
      const i = order.indexOf('Browse');
      t.check('Browse · Media · Activities | Random · History', i >= 0 && JSON.stringify(order.slice(i, i + 6)) === JSON.stringify(want), JSON.stringify(order));
      t.check('Timeline isn’t on the toolbar (it’s on Home and in the Features menu)', !order.includes('Timeline'));
      t.check('The icon buttons have tooltips with their shortcuts', await t.js('return document.querySelector(".tbtn[data-cmd=myhist]").title === "History (Ctrl+Y)";'));
      const fit = await t.js(`const tb = document.getElementById("toolbar"), f = document.getElementById("field").getBoundingClientRect();
        const last = [...tb.querySelectorAll(".tbtn")].filter((b) => b.offsetParent).pop().getBoundingClientRect();
        const els = [...tb.children].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).filter((r) => r.width);
        const overlaps = els.slice(1).filter((r, k) => r.left < els[k].right - 1).length;
        const twoLines = [...tb.querySelectorAll(".tbtn.lbl")].filter((b) => b.offsetParent && b.getBoundingClientRect().height > 30).map((b) => b.textContent);
        return { inner: innerWidth, overflow: tb.scrollWidth > tb.clientWidth, lastRight: Math.round(last.right), field: Math.round(f.width), twoLines, overlaps };`);
      t.check('At the narrowest window (980 pixels) everything fits on one line, with room for the Find box', fit.inner <= 990 && !fit.overflow && fit.lastRight <= fit.inner && fit.field >= 150 && !fit.twoLines.length && !fit.overlaps, JSON.stringify(fit));
      await t.shot('toolbar-980');
      await t.js('document.querySelector(".tbtn[data-cmd=myhist]").click();');
      t.check('History opens History, and its button lights up', await t.waitFor('document.querySelector(".myart .band h1")?.textContent === "History" && document.querySelector(".tbtn[data-cmd=myhist]").classList.contains("on")', 5000));
      await t.js('document.querySelector(".tbtn[data-cmd=activities]").click();');
      t.check('Activities lights up on its page', await t.waitFor('document.querySelector(".tbtn[data-cmd=activities]").classList.contains("on") && !document.querySelector(".tbtn[data-cmd=myhist]").classList.contains("on")', 5000));
      await t.js('document.querySelector(".tbtn[data-cmd=explore]").click();');
      t.check('Browse opens the Browse page, named so in the location bar', await t.waitFor('document.querySelector(".band h1")?.textContent === "Browse the encyclopedia" && document.querySelector("#crumbs .here")?.textContent === "Browse"', 8000));
      await t.js('document.querySelector(".tbtn[data-cmd=random]").click();');
      t.check('Random opens a random article, under Browse', await t.waitFor('document.querySelector(".content.article") && /Browse/.test(document.getElementById("crumbs").innerText)', 30000));
    },
  },
  {
    name: 'random-from-home', group: 'Reading', title: 'Random from Home: Home stays whole (no location bar squeezing it) until the article opens',
    route: 'home',
    async run(t) {
      t.check('Home is up, with no location bar', await t.waitFor('document.querySelector("#view .home") && document.getElementById("crumbs").hidden', 20000));
      // Every frame from the click until the article is up: is Home ever shown with the location bar above it?
      await t.js(`window.__squeezed = 0; window.__frames = 0;
        const watch = () => { window.__frames++;
          if (document.querySelector('#view .home') && !document.getElementById('crumbs').hidden) window.__squeezed++;
          if (!document.querySelector('.band h1')) requestAnimationFrame(watch); };
        requestAnimationFrame(watch);
        document.querySelector('.tbtn[data-cmd="random"]').click();`);
      t.check('A random article opens', await t.waitFor('document.querySelector(".band h1") && document.querySelectorAll(".content.article .text p").length > 0', 40000));
      const r = await t.js('return { squeezed: window.__squeezed, frames: window.__frames, here: document.querySelector("#crumbs .here")?.textContent || "" };');
      t.check('Home was never shown squeezed under the location bar', r.squeezed === 0 && r.frames > 1, JSON.stringify(r));
      t.check('…and the location bar names the article', r.here && r.here === (await t.js('return document.querySelector(".band h1").textContent;')), JSON.stringify(r));
    },
  },
  {
    name: 'section-redirect-online', group: 'Reading', title: 'A title that redirects to a section of another article opens it at that section (online)',
    route: 'home',
    async run(t) {
      // On Wikipedia, "Michael Jackson's finances" redirects to Michael Jackson › Earnings.
      await t.js('E2K.openArticle("Michael Jackson\'s finances");');
      t.check('The article opens', await t.waitFor('document.querySelector(".band h1")?.textContent === "Michael Jackson" && document.querySelectorAll(".content.article .text p").length > 3', 40000),
        await t.js('return document.querySelector(".band h1")?.textContent || document.querySelector(".errbox")?.innerText || "";'));
      t.check('…at the section the redirect leads to', await t.waitFor(`(() => { const c = document.querySelector(".content.article"); const h = [...c.querySelectorAll("h2, h3")].find((x) => x.textContent.trim() === "Earnings");
        if (!h) return false; const d = h.getBoundingClientRect().top - c.getBoundingClientRect().top; return c.scrollTop > 100 && d > -5 && d < 80; })()`, 15000),
        await t.js('return `scrolled ${Math.round(document.querySelector(".content.article")?.scrollTop || 0)}`;'));
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
    name: 'keyboard-places', group: 'Accessibility', title: 'Focus starts in the search box; Ctrl+1–5 and Ctrl+H open each section with focus on its heading; Ctrl+Shift+L, Ctrl+Shift+O, and the shortcut list',
    route: 'home',
    async run(t) {
      await t.waitFor('document.querySelector(".home")', 10000);
      await t.sleep(1000);
      const mac = t.platform === 'darwin';
      // At launch focus starts in the search box, which keeps NVDA from reading the whole Home screen aloud.
      t.check('At launch, focus is in the search box', await t.js('return document.activeElement?.id === "q";'), JSON.stringify(await t.focused()));
      // Each section, and the heading it opens on.
      const places = [['Browse', 'Browse the encyclopedia'], ['Media', 'Picture of the Day'], ['Timeline', 'On this day'], ['World Explorer', 'Countries of the World'],
        ['Activities', 'Activities']];
      for (const [i, [name, heading]] of places.entries()) {
        if (mac) t.menu(name); else await t.key(String(i + 1), ['control']);
        const there = await t.waitFor(`document.activeElement?.matches('h1, h2, h3') && document.querySelector('#view').contains(document.activeElement)
          && document.activeElement.textContent.startsWith(${JSON.stringify(heading)})`, 12000);
        t.check(`${mac ? `Features › ${name}` : `Ctrl+${i + 1}`} opens ${name}, with focus on its heading`, there,
          await t.js('return (document.activeElement?.tagName || "") + " " + (document.activeElement?.textContent || "").trim().slice(0, 40);'));
      }
      if (mac) t.menu('Home'); else await t.key('h', ['control']);
      const home = await t.waitFor(`document.activeElement?.matches('.home h1') && document.activeElement.textContent === 'Encyclopedia 2000'`, 8000);
      t.check(`${mac ? 'File › Home' : 'Ctrl+H'} goes Home, with focus on its heading (Encyclopedia 2000)`, home,
        await t.js('return (document.activeElement?.tagName || "") + " " + (document.activeElement?.textContent || "").trim().slice(0, 40);'));
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
        await t.sleep(600);                   // drawn before the screenshot (a Mac draws the window a moment later)
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
    name: 'keyboard-right-click', group: 'Accessibility', title: 'Shift+F10 opens the right-click menu: on the heading, a link, selected text, and with nothing focused',
    route: 'article/Moon',
    async run(t) {
      if (t.platform === 'darwin') return t.skip('Shift+F10', 'Macs have no menu key, and Shift+F10 isn’t a shortcut there');
      t.check('The article opens', await t.waitFor(`${pageOf('Moon')}?.querySelectorAll(".text p").length > 5`, 40000));
      await t.sleep(800);
      // Shift+F10 the way the keyboard sends it (the menu key does the same, but can't be sent this way). Returns the
      // menu's items, what has focus, and whether the menu is in the window.
      const open = async (prep) => {
        await t.js(`document.querySelector('.menu.ctx') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ${prep}`);
        await t.key('F10', ['shift']);
        await t.sleep(200);
        return t.js(`const m = document.querySelector('.menu.ctx'); if (!m) return { items: [] };
          const r = m.getBoundingClientRect(), v = document.getElementById('view').getBoundingClientRect();
          return { items: [...m.querySelectorAll('.mi')].map((i) => i.firstChild.textContent), focus: document.activeElement.closest('.menu.ctx') ? 'menu' : document.activeElement.tagName,
            onPage: r.left >= v.left && r.top >= v.top };`);
      };
      const page = pageOf('Moon');
      let m = await open(`${page}.querySelector('h1').focus();`);
      t.check('On the article’s heading: the page’s menu, with focus on its first item', m.items.includes('Back to the Top') && m.focus === 'menu', JSON.stringify(m));
      m = await open(`${page}.querySelector('.text a[data-title]').focus();`);
      t.check('On a link: Open, Open on Wikipedia, Copy Link', ['Open', 'Open on Wikipedia', 'Copy Link'].every((l) => m.items.includes(l)), JSON.stringify(m));
      m = await open('document.activeElement.blur(); getSelection().removeAllRanges();');
      t.check('With nothing focused: the page’s menu, over the page', m.items.includes('Back to the Top') && m.onPage && m.focus === 'menu', JSON.stringify(m));
      m = await open(`document.activeElement.blur(); const p = ${page}.querySelector('.text p'); const r = document.createRange();
        r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 3); getSelection().removeAllRanges(); getSelection().addRange(r);`);
      t.check('With text selected: Copy and Look Up, over the page', m.items.includes('Copy') && m.items.some((l) => l.startsWith('Look Up')) && m.onPage, JSON.stringify(m));
      await t.shot('keyboard-right-click');
      await t.key('Escape');
      t.check('Escape closes it', !(await t.js('return !!document.querySelector(".menu.ctx");')));
      // An article opened from the search box with the keyboard.
      await t.js('document.getElementById("q").focus();');
      for (const c of 'Sun') await t.key(c, c === 'S' ? ['shift'] : []);
      await t.key('Enter');
      await t.waitFor('document.querySelector(".page .results a, .page .result a")', 15000);
      const where = await t.focused();
      m = await open('');
      t.check('After a search from the keyboard: a menu opens', m.items.length > 0, JSON.stringify({ ...m, before: where }));
    },
  },
  {
    name: 'download-quiet', group: 'Accessibility', title: 'Packs are named groups; Download moves focus to Pause; during a download only the progress changes, focus stays put, the bar moves in whole percents',
    route: 'home', env: { E2K_LIBRARY_TEST: KNOTS },
    async run(t) {
      await openLibrary(t);
      await t.waitFor('document.querySelectorAll(".offline .pack .size").length >= 5', 20000);
      // A real download, paused partway; then progress updates like the app's own, sent to the window (the test
      // library downloads in a few seconds, in only three or four steps).
      // Each pack is a group named after it, so a screen reader says which pack a button is in.
      const groups = await t.js(`return [...document.querySelectorAll('.offline .pack')].map((p) => [p.getAttribute('role'), p.getAttribute('aria-label')]);`);
      t.check('Each pack is a group named after it', groups.length >= 5 && groups.every(([r, n]) => r === 'group' && n), JSON.stringify(groups.slice(0, 3)));
      // Space on the test pack's Download button (Enter does the same, but its keypress can't be sent this way): focus moves to its Pause button, not the first button in the window.
      const inTest = (b) => `[...document.querySelectorAll('.offline .pack')].find((p) => p.dataset.pack === 'test')?.querySelector('.acts button:not(:disabled)')?.textContent.trim() === ${JSON.stringify(b)}`;
      await t.js(`[...document.querySelectorAll('.offline .pack')].find((p) => p.dataset.pack === 'test').querySelector('.acts button.primary').focus();`);
      await t.key('Space');
      await t.waitFor(inTest('Pause'), 8000);
      const f = await t.js('const e = document.activeElement; return { text: e.textContent.trim(), pack: e.closest(".pack")?.dataset.pack };');
      t.check('Download from the keyboard: focus goes to that pack’s Pause button', f.text === 'Pause' && f.pack === 'test', JSON.stringify(f));
      if (!(await whenPartway(t))) return t.skip('Download partway', 'the download finished too quickly to pause (fast connection)');
      const paused = await t.js('return await window.e2k.library.pause();');
      const d = paused.download;
      if (!d || d.status !== 'paused') return t.skip('Download partway', 'it finished before it could be paused');
      let sent = 0;
      const send = (status = 'downloading') => {
        const received = Math.min(d.size - 1, d.received + ++sent * 40000);
        // Like the app's own: the free space, and how much more each pack needs, go down as it downloads.
        const less = (n) => (typeof n === 'number' ? n - sent * 40000 : n);
        const packs = paused.packs.map((p) => (p.fit ? { ...p, fit: { ...p.fit, need: less(p.fit.need), free: less(p.fit.free) } } : p));
        t.win.webContents.send('library:update', { ...paused, packs, free: less(paused.free), download: { ...d, status, received, speed: 1e6 + sent * 1000, eta: 30 - sent } });
      };
      send();
      if (!(await t.waitFor(`${label('Pause')} && document.querySelector('.offline .prog span')`, 3000))) {
        return t.check('The download shows Pause and its progress', false, await t.js('return document.querySelector(".offline .packs").innerText.slice(0, 300);'));
      }
      // Focus on Pause, then watch the window as the progress goes on.
      await t.js(`const ov = document.querySelector('.offline').closest('.overlay'); ${label('Pause')}.focus();
        window.__q = { pause: ${label('Pause')}, bar: ov.querySelector('.bar[role="progressbar"]'), text: ov.querySelector('.prog span').textContent, other: [], values: [] };
        new MutationObserver((rs) => { for (const r of rs) {
          const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          if (r.attributeName === 'aria-valuenow') window.__q.values.push(el.getAttribute('aria-valuenow'));
          else if (!el.closest('.bar, .prog, .where > span:last-child')) window.__q.other.push((el.className || el.tagName) + ' ' + r.type);
        } }).observe(ov, { subtree: true, childList: true, attributes: true, characterData: true });`);
      for (let i = 0; i < 20; i++) { send(); await t.sleep(60); }
      await t.sleep(200);
      const q = await t.js(`const q = window.__q, ov = document.querySelector('.offline').closest('.overlay');
        return { samePause: q.pause.isConnected && document.activeElement === q.pause, sameBar: q.bar.isConnected,
          moved: ov.querySelector('.prog span').textContent !== q.text, other: q.other.slice(0, 5), values: q.values };`);
      t.check('Nothing in the window but the progress changed', q.other.length === 0, q.other.join(', '));
      t.check('Focus stayed on the same Pause button', q.samePause);
      t.check('The progress bar is the same one, and its line moved on', q.sameBar && q.moved, JSON.stringify(q));
      const nums = q.values.map(Number);
      t.check('The bar’s value changed in whole percents only, each one once', nums.length > 0 && nums.length < 20 && nums.every((n, i) => Number.isInteger(n) && (i === 0 || n > nums[i - 1])), q.values.join(', '));
      // Pausing is a real change: the window is redrawn with Resume.
      send('paused');
      t.check('Paused, it shows Resume, and focus moves to it', await t.waitFor(`${label('Resume')} && document.activeElement === ${label('Resume')}`, 3000),
        await t.js('return document.activeElement.textContent.trim();'));
      await t.js('await window.e2k.library.cancel();');
    },
  },
  {
    name: 'accessibility-checks', group: 'Accessibility', title: 'axe-core finds no serious problems on the main screens and windows; pictures have names; Star Chart marks answers',
    route: 'home',
    async run(t) {
      const screens = [['home', '.home .alm .ev'], ['article/Moon', '.page .text p'], ['search/apollo', '.results .res'], ['explore', '.page'], ['gallery', '.page'],
        ['onthisday', '.tl-item'], ['activities', '.act-group'], ['myarticles/favorites', '.myart .mwelcome, .myart .mhead'], ['world', '#view canvas, #view svg'], ['activity/periodic-table', '#view h1, #view h2']];
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
