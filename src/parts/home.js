// Home: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['home'] = (A) => {
  'use strict';
  const { $, h, svg, icon } = A;
  const { strip, bg, sized, longDate, setStatus, setIdle, isOffline, go, openArticle, mount, live, todayFeed } = A.fn;

  // Screens drawn as a fixed picture (Home, and games and activities that scale to fit) stop growing at this size,
  // so in a big window they don't dwarf the toolbar; the background fills the rest.
  const MAX_CANVAS = 1.4;
  // The Explore shelf on the home screen, in display order.
  const ORBS = [
    { id: 'articles', label: 'Browse', icon: 'book', bg: '#cdeeff,#2a86d6 55%,#0b3570', run: () => go('explore') },
    { id: 'media', label: 'Media', icon: 'film', bg: '#ffe2d2,#e0612a 55%,#6a2008', run: () => go('gallery') },
    { id: 'timeline', label: 'Timeline', icon: 'hourglass', bg: '#fff6d0,#e2a21e 55%,#6b4a05', run: () => go('onthisday') },
    { id: 'world', label: 'World Explorer', icon: 'globe', bg: '#d6ffe0,#2fae5a 55%,#0b4a22', run: () => go('world') },
    { id: 'activities', label: 'Activities', icon: 'puzzle', bg: '#ffd9e8,#d83a7a 55%,#5c0a2c', run: () => go('activities') },
    { id: 'myarticles', label: 'My Articles', icon: 'books', bg: '#d4fbf6,#1fa39a 55%,#08433f', run: () => go('myarticles/favorites') },
  ];
  const orb = (id) => ORBS.find((o) => o.id === id);

  function viewHome(token) {
    // The theme's artwork fills the whole window behind the canvas (see fitHome), so square and very wide windows don't
    // show plain bands around it.
    const art = svg('svg', { class: 'home-art', viewBox: '0 0 1024 610', preserveAspectRatio: 'none' });

    const dial = h('button', { class: 'dial', title: 'Picture of the Day', onclick: () => go('gallery') });
    const dialHd = h('b', {}, 'PICTURE OF THE DAY');
    const dialCap = h('span', {}, 'Loading…');
    const discThumb = h('button', { class: 'thumb', style: 'padding:0', 'aria-label': 'Today’s discovery' });
    const discTitle = h('b', {}, 'Loading today’s discovery…');
    const discText = h('p');
    const discMore = h('button', { class: 'more' }, 'Read the full article ›');
    const discHead = h('h3', {}, 'Today’s discovery');
    const discAll = h('button', { class: 'more savedlink', hidden: true, onclick: () => go('myarticles/downloaded') });
    const almList = h('div', { class: 'list' }, h('div', { class: 'muted' }, 'Loading…'));

    const canvas = h('div', { class: 'home-canvas' },
      h('div', { class: 'brand' }, h('h1', {}, h('small', {}, 'Encyclopedia'), ' ', h('span', { class: 'y' }, '2000')), h('div', { class: 'tag' }, 'THE WORLD OF KNOWLEDGE')),
      dial,
      h('div', { class: 'dialcap' }, dialHd, h('br'), dialCap),
      h('nav', { class: 'shelf', 'aria-label': 'Explore' }, h('small', {}, 'EXPLORE'),
        h('div', { class: 'row' }, ORBS.map((o, i) => h('button', { class: 'orb', onclick: o.run },
          h('i', { style: `--orb-bg:radial-gradient(circle at 40% 30%,${o.bg});${E2KThemes.orbStyle(i)}` }, svg('svg', {}, svg('use', { href: '#i-' + o.icon }))), o.label)))),
      h('div', { class: 'panel disc' }, discHead,
        h('div', { class: 'row' }, discThumb, h('div', {}, discTitle, discText)), discMore, discAll),
      h('div', { class: 'panel alm' }, h('h3', {}, 'Almanac'), h('div', { class: 'd' }, longDate().toUpperCase()), almList,
        h('button', { class: 'more', onclick: () => go('onthisday') }, 'See all of today’s events ›')),
    );
    if (!mount(h('div', { class: 'home' }, art, canvas), token)) return;
    A.showNews(canvas);
    fitHome();
    setStatus('Gathering today’s discoveries…', true);

    // Offline with downloaded articles: one of them in place of today's discovery (a different one each day), and a
    // link to them all.
    async function fromDownloads() {
      const list = await A.saved.list().catch(() => []);
      if (!list.length || !live(token)) return false;
      const e = list[Math.floor(Date.now() / 864e5) % list.length];
      const sum = await Wiki.summary(e.title).catch(() => null);
      if (!live(token)) return true;
      discHead.textContent = 'From your downloaded articles';
      discThumb.style.cssText = 'padding:0;' + bg(sum?.thumbnail?.source || e.thumb);
      discTitle.textContent = e.title;
      discText.textContent = sum?.extract || e.desc || '';
      discMore.textContent = 'Read it ›';
      discMore.onclick = discThumb.onclick = () => openArticle(e.title);
      discThumb.setAttribute('aria-label', `Read about ${e.title}`);
      discAll.replaceChildren(icon('download'), list.length === 1 ? 'Your downloaded article ›' : `All ${list.length} downloaded articles ›`);
      discAll.hidden = false;
      return true;
    }

    todayFeed().then(async (d) => {
      if (!live(token)) return;
      const img = d.image || {};
      dial.style.cssText = bg(img.fromLibrary ? img.thumbnail.source : sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 500));
      dialCap.textContent = strip(img.description?.text) || strip(img.title) || '';
      // Offline, the circle shows a picture from an article in the library, and opens that article.
      if (img.fromLibrary) {
        dialHd.textContent = 'FROM YOUR OFFLINE LIBRARY';
        dial.title = img.title;
        dial.onclick = () => openArticle(img.title);
      } else if (d.offline) dialCap.textContent = 'Back when you’re online';

      const tfa = d.tfa;
      if (d.offline && await fromDownloads()) {
        if (!live(token)) return;
      } else if (tfa) {
        const t = tfa.titles?.normalized || tfa.title;
        discThumb.style.cssText = 'padding:0;' + bg(tfa.thumbnail?.source);
        discTitle.textContent = t;
        discText.textContent = tfa.extract || '';
        discMore.onclick = discThumb.onclick = () => openArticle(t);
        discThumb.setAttribute('aria-label', `Read about ${t}`);
      } else if (d.offline && A.libMissing) {
        discTitle.textContent = 'Your offline library can’t be found.';
        discText.textContent = `${A.libMissing.label} isn’t in ${A.libMissing.where}. If it’s on a drive that was disconnected, reconnect it and the library will open again on its own.`;
        discMore.textContent = 'Offline Library…';
        discMore.onclick = () => E2KLibrary.open(A.E2K);
      } else if (d.offline) {
        // Offline without a library: the almanac still works, from the highlights saved with the app.
        discTitle.textContent = Wiki.connected() && !isOffline() ? 'Wikipedia couldn’t be reached.' : 'You’re offline.';
        discText.textContent = `With an offline library, you can keep reading without the internet. Download one from ${A.TOOLS} Offline Library.`;
        discMore.textContent = 'Offline Library…';
        discMore.onclick = () => E2KLibrary.open(A.E2K);
      } else {
        discTitle.textContent = 'No featured article today';
      }

      // Offline, an event links to its article only if the library has it: those come first (then by year), and the
      // others are plain text.
      let events = d.onthisday || [];
      if (d.offline) events = [...events.filter((o) => o.pages.length), ...events.filter((o) => !o.pages.length)].slice(0, 6).sort((a, b) => b.year - a.year);
      almList.replaceChildren(...events.slice(0, 6).map((o) => {
        const page = (o.pages || [])[0];
        if (!page && d.offline) return h('div', { class: 'ev nolink', title: 'Not in your offline library' }, h('b', {}, String(o.year)), h('div', {}, o.text));
        return h('button', { class: 'ev', title: page ? page.titles?.normalized : '', onclick: () => (page ? openArticle(page.titles?.normalized || page.title) : go('onthisday')) },
          h('b', {}, String(o.year)), h('div', {}, o.text));
      }));
      setIdle(d.offline ? (isOffline() ? 'Offline mode' : 'Offline') : 'Ready');
    }).catch(async (err) => {
      if (!live(token)) return;
      if (!Wiki.connected() || isOffline()) {
        almList.replaceChildren(h('div', { class: 'muted' }, 'Unavailable'));
        dialCap.textContent = '';
        if (await fromDownloads()) { setIdle(isOffline() ? 'Offline mode: your downloaded articles still open' : 'No connection: your downloaded articles still open'); return; }
        if (!live(token)) return;
      }
      discTitle.textContent = isOffline() ? 'You’re in Offline mode.' : Wiki.connected() ? 'Today’s content couldn’t be loaded.' : 'You’re offline.';
      discText.textContent = isOffline() ? 'Today’s discovery, the picture of the day, and the almanac come from Wikipedia. Go online from the status bar to see them.'
        : 'Encyclopedia 2000 retrieves its articles from Wikipedia. Check your internet connection, then press F5 to try again.';
      almList.replaceChildren(h('div', { class: 'muted' }, 'Unavailable'));
      dialCap.textContent = '';
      setIdle('Couldn’t reach Wikipedia (' + err.message + ')');
    });
  }

  let homeBox = '';
  function fitHome() {
    const c = $('.home-canvas');
    if (!c) return;
    const vw = A.view.clientWidth, vh = A.view.clientHeight;
    const s = Math.min(MAX_CANVAS, vw / 1024, vh / 610);
    c.style.setProperty('--s', s);
    // The part of the canvas's 1024 × 610 space the window shows; the artwork is drawn out to its edges.
    const art = $('.home-art');
    if (!art || !s) return;
    const w = vw / s, hh = vh / s;
    const box = { x: 512 - w / 2, y: 305 - hh / 2, w, h: hh };
    art.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    const key = [E2KThemes.current(), Math.round(box.w), Math.round(box.h)].join(',');
    if (key === homeBox && art.childNodes.length) return;
    homeBox = key;
    art.replaceChildren();
    E2KThemes.homeArt(art, box);
  }
  new ResizeObserver(fitHome).observe(A.view);

  return { MAX_CANVAS, orb, viewHome, fitHome };
};
