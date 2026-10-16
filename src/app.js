(() => {
  'use strict';

  // ---------- helpers ----------
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }
  function svg(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  }
  const icon = (id) => svg('svg', { class: 'ic' }, svg('use', { href: '#i-' + id }));
  // Minimize, maximize, restore, and close, drawn in thin lines like the Windows caption buttons.
  const WIN_ICONS = { min: 'M0 5.5h10', max: 'M.5.5h9v9h-9z', restore: 'M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z', close: 'M.5.5l9 9M9.5.5l-9 9' };
  const winIcon = (k) => svg('svg', { class: 'wi' + (k === 'close' ? ' x' : ''), viewBox: '0 0 10 10' }, svg('path', { d: WIN_ICONS[k] }));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('e2k.' + k, JSON.stringify(v)); } catch {} syncMenu(); },
  };

  // A brand-new install has nothing saved yet. Checked before anything is saved, for What's New below.
  const firstRun = (() => { try { return !Object.keys(localStorage).some((k) => k.startsWith('e2k.')); } catch { return false; } })();

  // ---------- platform ----------
  // Menus and tooltips name Windows shortcuts. macOS uses Command instead, and avoids the shortcuts it reserves
  // (Command-H hides the app and Command-M minimizes it).
  const MAC = window.e2k.platform === 'darwin';
  const MAC_KEYS = { 'Ctrl+H': 'Cmd+Shift+H', 'Ctrl+M': 'Cmd+Shift+M', 'Alt+Left': 'Cmd+[', 'Alt+Right': 'Cmd+]', F5: 'Cmd+R', 'Alt+F4': '' };
  const macKey = (k) => (k in MAC_KEYS ? MAC_KEYS[k] : k.replace('Ctrl+', 'Cmd+'));
  // How a shortcut is written for people: "Ctrl+H" on Windows and Linux, "⇧⌘H" on macOS.
  const keyText = (k) => {
    if (!MAC || !k) return k;
    const m = macKey(k);
    return (m.includes('Shift+') ? '⇧' : '') + (m.includes('Cmd+') ? '⌘' : '') + m.replace(/^(Cmd\+|Shift\+)+/, '');
  };

  // On macOS the menus live in the menu bar at the top of the screen. The page sends them to the main process
  // whenever something they show changes, such as Back becoming available or a new favorite.
  let menuIds = [];
  let menuSent = '';
  let menuTimer = 0;
  function macMenus() {
    const ids = [];
    const item = ([label, cmd, key, checked, disabled]) => {
      ids.push(cmd);
      return { label, id: ids.length - 1, key: key ? macKey(key) : '', checked: checked == null ? undefined : !!checked, disabled: !!disabled || !cmd };
    };
    const conv = (items) => items.map((it) => (it === '-' ? '-' : item(it)));
    const m = Object.fromEntries(menus());
    const file = m.File.filter((it) => it[1] !== 'exit');
    if (file[file.length - 1] === '-') file.pop();
    const template = [
      { label: 'Encyclopedia 2000', items: [item(['About Encyclopedia 2000', 'about']), '-', item(['Options…', 'options', 'Ctrl+,']), item(['Themes…', 'themes']), '-',
        { role: 'services' }, '-', { role: 'hide', label: 'Hide Encyclopedia 2000' }, { role: 'hideOthers' }, { role: 'unhide' }, '-', { role: 'quit', label: 'Quit Encyclopedia 2000' }] },
      { label: 'File', items: [...conv(file), '-', { role: 'close' }] },
      { label: 'Edit', items: [{ role: 'undo' }, { role: 'redo' }, '-', { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, '-', item(['Find an Article', 'find', 'Ctrl+F'])] },
      ...['View', 'Go', 'Favorites', 'Features'].map((label) => ({ label, items: conv(m[label]) })),
      { role: 'windowMenu' },
      { label: 'Help', items: conv(m.Help.filter((it) => it[1] !== 'about')) },
    ];
    return { ids, template };
  }
  function syncMenu() {
    if (!MAC || menuTimer) return;
    menuTimer = setTimeout(() => {
      menuTimer = 0;
      const { ids, template } = macMenus();
      const sent = JSON.stringify(template);
      if (sent === menuSent) return;
      menuSent = sent;
      menuIds = ids;
      window.e2k.setMenu(template);
    });
  }
  if (MAC) window.e2k.onMenu((id) => runCmd(menuIds[id]));
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '');
  const decodeHtml = (s) => { const ta = document.createElement('textarea'); ta.innerHTML = s || ''; return ta.value; };
  const https = (u) => (u && u.startsWith('//') ? 'https:' + u : u);
  const bg = (url) => (url ? `background-image:url("${String(url).replace(/"/g, '%22')}")` : '');
  const bigThumb = (url, px = 1280) => (url && /\/\d+px-/.test(url) ? url.replace(/\/\d+px-/, `/${px}px-`) : url);
  const originalOf = (thumb) => (thumb && thumb.includes('/thumb/') ? thumb.replace('/thumb/', '/').replace(/\/[^/]+$/, '') : thumb);
  // Wikimedia won't upscale, so only request a larger thumbnail when the original is wider than that.
  const sized = (thumb, original, width, px) => (width > px ? bigThumb(thumb, px) : original || thumb);
  const longDate = (d = new Date()) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const route = (name, arg) => (arg === undefined ? name : `${name}/${encodeURIComponent(arg)}`);

  // ---------- state ----------
  const view = $('#view');
  const nav = { stack: [], from: [], idx: -1 };
  let renderToken = 0;
  let current = null; // the article on screen: { title, desc, thumb }
  let speaking = false;
  let feedCache = null;
  let gameCleanup = null;

  // ---------- status bar ----------
  const statusEl = $('#status');
  let statusIdle = 'Ready';
  function setStatus(msg, busy = false) {
    statusEl.textContent = msg;
    $('.statusbar').classList.toggle('busy', busy);
  }
  function setIdle(msg = 'Ready') { statusIdle = msg; setStatus(msg); }
  function updateNet() {
    $('#netdot').classList.toggle('off', !navigator.onLine);
    $('#net').textContent = navigator.onLine ? 'Online' : 'Offline';
  }
  addEventListener('online', updateNet);
  addEventListener('offline', updateNet);
  updateNet();
  const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('en-US', E2KTime.opts()); };
  tick();
  setInterval(tick, 15000);

  // ---------- sound ----------
  const soundOn = () => !E2KAudio.isMuted();
  document.addEventListener('click', (e) => {
    if (soundOn() && store.get('clicks', true) && e.target.closest('.tbtn:not(:disabled), .go, .orb, .bbtn, .mi:not(.disabled), .card, .dial, .pt-el, .pt-fam, .wx-chip, .wx-si, .act-chip')) {
      try { E2KAudio.click(); } catch {}
    }
  }, true);

  // ---------- text size ----------
  function setFontScale(s) {
    s = Math.min(1.5, Math.max(0.8, Math.round(s * 100) / 100));
    store.set('fontScale', s);
    document.documentElement.style.setProperty('--fs', s);
  }
  setFontScale(store.get('fontScale', 1));

  // Article font and animations, from Options.
  let clockShown = null;
  function applyPrefs() {
    const before = E2KThemes.current();
    E2KThemes.apply(store.get('theme', 'bloom'));
    // A new theme redraws the screen you're on, since its artwork is drawn when a screen opens.
    // So does switching between 12-hour and 24-hour time, so every clock on the screen updates at once.
    const clock = E2KTime.is24();
    if ((E2KThemes.current() !== before || (clockShown !== null && clock !== clockShown)) && nav.idx >= 0) setTimeout(() => reload(), 0);
    clockShown = clock;
    if (typeof tick === 'function') tick();
    document.documentElement.dataset.font = store.get('articleFont', 'serif');
    document.documentElement.classList.toggle('no-anim', !store.get('animations', true));
  }
  applyPrefs();

  // ---------- navigation ----------
  // Each history entry can remember the trail it was opened from (see "location bar" below).
  function go(r, { replace = false, from = null } = {}) {
    if (replace && nav.idx >= 0) { nav.stack[nav.idx] = r; nav.from[nav.idx] = from || nav.from[nav.idx]; }
    else {
      nav.stack = nav.stack.slice(0, nav.idx + 1);
      nav.from = nav.from.slice(0, nav.idx + 1);
      nav.stack.push(r);
      nav.from.push(from);
      nav.idx++;
    }
    render(r);
  }
  const back = () => { if (nav.idx > 0) render(nav.stack[--nav.idx]); };
  const fwd = () => { if (nav.idx < nav.stack.length - 1) render(nav.stack[++nav.idx]); };
  const reload = () => render(nav.stack[nav.idx] || 'home');
  // Articles opened without a trail (Find box, Favorites, Home) sit under Articles.
  const openArticle = (title, from = null) => go(route('article', title), { from });

  // ---------- location bar ----------
  // A trail is a list of steps: { label, r } links to a route, { label, run } calls a function, { label } is plain text.
  const crumbsEl = $('#crumbs');
  const titleEl = $('.titlebar .tt');
  const SECTIONS = { explore: 'Articles', gallery: 'Media', onthisday: 'Timeline', world: 'World Explorer', games: 'Games', activities: 'Activities' };
  let crumbs = { trail: [], sub: [], onRoot: null };

  function baseTrail(r, from) {
    const [name, ...rest] = r.split('/');
    const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
    const home = { label: 'Home', r: 'home' };
    if (SECTIONS[name]) return [home, { label: SECTIONS[name], r: name }];
    if (name === 'random') return [home, { label: 'Random article' }];
    if (name === 'search') return [home, { label: 'Search' }, { label: `“${arg}”`, r }];
    if (name === 'article') return [...(from || [home, { label: 'Articles', r: 'explore' }]), { label: arg, r }];
    if (name === 'game') return [home, { label: 'Games', r: 'games' }, { label: E2KGames.get(arg)?.name || arg, r }];
    if (name === 'activity') return [home, { label: 'Activities', r: 'activities' }, { label: E2KActivities.get(arg)?.name || arg, r }];
    return [home];
  }
  const fullTrail = () => [...crumbs.trail, ...crumbs.sub.map((s) => (typeof s === 'string' ? { label: s } : s))];

  // The trail an article inherits when opened from this screen. Links between articles replace the last step.
  function linkFrom() {
    const r = nav.stack[nav.idx] || 'home';
    if (r === 'home') return null;
    if (r.startsWith('article/')) return crumbs.trail.slice(0, -1);
    // Steps inside a game or activity become plain text: their actions only work while it's on screen.
    return [...crumbs.trail, ...crumbs.sub.map((s) => ({ label: typeof s === 'string' ? s : s.label }))];
  }

  // Clicking a step returns to that screen: back through history if it's there, otherwise as a new page.
  function jumpTo(r) {
    for (let i = nav.idx - 1; i >= 0; i--) {
      if (nav.stack[i] === r) { nav.idx = i; render(r); return; }
    }
    go(r);
  }

  function drawCrumbs() {
    const steps = fullTrail();
    const here = steps[steps.length - 1];
    crumbsEl.hidden = steps.length < 2;
    titleEl.textContent = document.title = steps.length < 2 ? 'Encyclopedia 2000' : `${here.label} – Encyclopedia 2000`;
    const parts = [h('span', { class: 'lbl' }, 'LOCATION'), h('img', { src: 'icon-small.svg', alt: '' })];
    steps.forEach((s, i) => {
      if (i === steps.length - 1) { parts.push(h('span', { class: 'here', title: s.label }, s.label)); return; }
      // The game or activity step takes you back to its start screen when you're deeper inside it.
      const isRoot = crumbs.onRoot && i === crumbs.trail.length - 1;
      const act = isRoot ? crumbs.onRoot : s.run || (s.r ? () => jumpTo(s.r) : null);
      parts.push(act ? h('a', { href: '#', title: s.label, onclick: (e) => { e.preventDefault(); act(); } }, s.label) : h('span', { class: 'step' }, s.label),
        h('span', { class: 'sep' }, '›'));
    });
    crumbsEl.replaceChildren(...parts);
    // Light the toolbar button for the section this page belongs to.
    const section = steps[1]?.r;
    $$('.tbtn[data-cmd="explore"], .tbtn[data-cmd="gallery"], .tbtn[data-cmd="onthisday"]').forEach((b) => b.classList.toggle('on', b.dataset.cmd === section));
  }

  function setTrail(r) {
    crumbs = { trail: baseTrail(r, nav.from[nav.idx]), sub: [], onRoot: null };
    drawCrumbs();
  }
  // Rename the current step, e.g. when an article's real title differs from the link that opened it.
  function setHere(label) {
    crumbs.trail[crumbs.trail.length - 1].label = label;
    drawCrumbs();
  }
  // Games and activities report where they are inside themselves: setCrumbs(['The Flask'], backToStart).
  // A step can also be { label, run } to make it clickable.
  function setCrumbs(sub = [], onRoot = null) {
    crumbs.sub = sub;
    crumbs.onRoot = sub.length ? onRoot : null;
    drawCrumbs();
  }

  function mount(el, token) {
    if (token !== renderToken) return false;
    el.classList.add('fade-in');
    view.replaceChildren(el);
    updateToolbar();
    return true;
  }
  const live = (token) => token === renderToken;

  async function render(r) {
    const token = ++renderToken;
    const [name, ...rest] = r.split('/');
    const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
    if (gameCleanup) { try { gameCleanup(); } catch {} gameCleanup = null; }
    speechStop();
    closeMenus();
    hideSuggest();
    current = null;
    updateToolbar();
    setTrail(r);
    try {
      switch (name) {
        case 'article': await viewArticle(arg, token); break;
        case 'search': await viewSearch(arg, token); break;
        case 'explore': await viewExplore(token); break;
        case 'gallery': await viewGallery(token); break;
        case 'onthisday': await viewOnThisDay(token); break;
        case 'random': await viewRandom(token); break;
        case 'games': viewGames(token); break;
        case 'game': viewGame(arg, token); break;
        case 'activities': viewActivities(token); break;
        case 'activity': viewActivity(arg, token); break;
        case 'world': await viewWorld(token); break;
        default: viewHome(token);
      }
    } catch (err) {
      if (live(token)) showError(err, name, arg, token);
    }
  }

  // ---------- data ----------
  async function todayFeed() {
    const key = new Date().toDateString();
    if (feedCache && feedCache.key === key) return feedCache.data;
    const data = await Wiki.featured(new Date());
    feedCache = { key, data };
    return data;
  }

  // ---------- home ----------
  // Screens drawn as a fixed picture (Home, and games and activities that scale to fit) stop growing at this size,
  // so in a big window they don't dwarf the toolbar; the background fills the rest.
  const MAX_CANVAS = 1.4;
  // The Explore shelf on the home screen, in display order.
  const ORBS = [
    { id: 'articles', label: 'Articles', icon: 'book', bg: '#cdeeff,#2a86d6 55%,#0b3570', run: () => go('explore') },
    { id: 'media', label: 'Media', icon: 'film', bg: '#ffe2d2,#e0612a 55%,#6a2008', run: () => go('gallery') },
    { id: 'timeline', label: 'Timeline', icon: 'clock', bg: '#fff6d0,#e2a21e 55%,#6b4a05', run: () => go('onthisday') },
    { id: 'world', label: 'World Explorer', icon: 'globe', bg: '#d6ffe0,#2fae5a 55%,#0b4a22', run: () => go('world') },
    { id: 'games', label: 'Games', icon: 'gamepad', bg: '#f2dcff,#9a4ad8 55%,#3c0c6a', run: () => go('games') },
    { id: 'activities', label: 'Activities', icon: 'puzzle', bg: '#ffd9e8,#d83a7a 55%,#5c0a2c', run: () => go('activities') },
  ];
  const orb = (id) => ORBS.find((o) => o.id === id);

  function viewHome(token) {
    // The theme's artwork fills the whole window behind the canvas (see fitHome), so square and very wide windows don't
    // show plain bands around it.
    const art = svg('svg', { class: 'home-art', viewBox: '0 0 1024 610', preserveAspectRatio: 'none' });

    const dial = h('button', { class: 'dial', title: 'Picture of the Day', onclick: () => go('gallery') });
    const dialCap = h('span', {}, 'Loading…');
    const discThumb = h('button', { class: 'thumb', style: 'padding:0' });
    const discTitle = h('b', {}, 'Loading today’s discovery…');
    const discText = h('p');
    const discMore = h('button', { class: 'more' }, 'Read the full article ›');
    const almList = h('div', { class: 'list' }, h('div', { class: 'muted' }, 'Loading…'));

    const canvas = h('div', { class: 'home-canvas' },
      h('div', { class: 'brand' }, h('small', {}, 'Encyclopedia'), h('div', { class: 'y' }, '2000'), h('div', { class: 'tag' }, 'THE WORLD OF KNOWLEDGE')),
      dial,
      h('div', { class: 'dialcap' }, h('b', {}, 'PICTURE OF THE DAY'), h('br'), dialCap),
      h('nav', { class: 'shelf', 'aria-label': 'Explore' }, h('small', {}, 'EXPLORE'),
        h('div', { class: 'row' }, ORBS.map((o, i) => h('button', { class: 'orb', onclick: o.run },
          h('i', { style: `--orb-bg:radial-gradient(circle at 40% 30%,${o.bg});${E2KThemes.orbStyle(i)}` }, svg('svg', {}, svg('use', { href: '#i-' + o.icon }))), o.label)))),
      h('div', { class: 'panel disc' }, h('h3', {}, 'Today’s discovery'),
        h('div', { class: 'row' }, discThumb, h('div', {}, discTitle, discText)), discMore),
      h('div', { class: 'panel alm' }, h('h3', {}, 'Almanac'), h('div', { class: 'd' }, longDate().toUpperCase()), almList,
        h('button', { class: 'more', onclick: () => go('onthisday') }, 'See all of today’s events ›')),
    );
    if (!mount(h('div', { class: 'home' }, art, canvas), token)) return;
    fitHome();
    setStatus('Gathering today’s discoveries…', true);

    todayFeed().then((d) => {
      if (!live(token)) return;
      const img = d.image || {};
      dial.style.cssText = bg(sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 500));
      dialCap.textContent = strip(img.description?.text) || strip(img.title) || '';

      const tfa = d.tfa;
      if (tfa) {
        const t = tfa.titles?.normalized || tfa.title;
        discThumb.style.cssText = 'padding:0;' + bg(tfa.thumbnail?.source);
        discTitle.textContent = t;
        discText.textContent = tfa.extract || '';
        discMore.onclick = discThumb.onclick = () => openArticle(t);
      } else {
        discTitle.textContent = 'No featured article today';
      }

      almList.replaceChildren(...(d.onthisday || []).slice(0, 6).map((o) => {
        const page = (o.pages || [])[0];
        return h('button', { class: 'ev', title: page ? page.titles?.normalized : '', onclick: () => (page ? openArticle(page.titles?.normalized || page.title) : go('onthisday')) },
          h('b', {}, String(o.year)), h('div', {}, o.text));
      }));
      setIdle();
    }).catch((err) => {
      if (!live(token)) return;
      discTitle.textContent = navigator.onLine ? 'Today’s content couldn’t be loaded.' : 'You’re offline.';
      discText.textContent = 'Encyclopedia 2000 retrieves its articles from Wikipedia. Check your internet connection, then press F5 to try again.';
      almList.replaceChildren(h('div', { class: 'muted' }, 'Unavailable'));
      dialCap.textContent = '';
      setIdle('Couldn’t reach Wikipedia (' + err.message + ')');
    });
  }

  let homeBox = '';
  function fitHome() {
    const c = $('.home-canvas');
    if (!c) return;
    const vw = view.clientWidth, vh = view.clientHeight;
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
  new ResizeObserver(fitHome).observe(view);

  // ---------- page shell ----------
  function shell({ title = '', desc = '', railTitle = '', wide = false, tools = [] }) {
    const railArt = svg('svg', { viewBox: '0 0 230 600', preserveAspectRatio: 'xMidYMax slice' });
    E2KThemes.railArt(railArt);

    const bandArt = svg('svg', { viewBox: '0 0 800 96', preserveAspectRatio: 'xMaxYMid slice' });
    bandArt.append(svg('rect', { width: 800, height: 96, fill: 'url(#b0)' }));
    E2KThemes.bandArt(bandArt, 720, 64, 0.3);

    const railIn = h('div', { class: 'in' }, railTitle ? h('h4', {}, railTitle) : null);
    const h1 = h('h1', {}, title);
    const dsc = h('div', { class: 'desc' }, desc);
    const toolsEl = h('div', { class: 'tools' }, tools);
    const text = h('div', { class: 'text' });
    const media = h('aside', { class: 'media' });
    const content = h('div', { class: 'content' + (wide ? ' wide' : '') }, text, wide ? null : media);
    const root = h('div', { class: 'page' },
      h('aside', { class: 'rail' }, railArt, railIn),
      h('section', { class: 'art' },
        h('header', { class: 'band' }, bandArt, h('div', { class: 't' }, h1, dsc), toolsEl),
        content));
    return {
      root, railIn, text, media, content, toolsEl,
      setTitle(t, d) { h1.textContent = t; h1.title = t; dsc.textContent = d || ''; },
    };
  }
  const bandBtn = (label, onclick, ic) => h('button', { class: 'bbtn', onclick }, ic ? icon(ic) : null, label);
  const railLink = (label, onclick, cls = '') => h('button', { class: 'lnk ' + cls, onclick }, label);
  const loading = (msg) => h('div', { class: 'loading' }, msg);

  // ---------- article ----------
  const DROP_SECTIONS = /^(references|notes|citations|sources|bibliography|further reading|external links|footnotes|works cited|notes and references|references and notes|explanatory notes)$/i;
  const SKIP_NS = /^(File|Image|Special|Help|Wikipedia|Template|Template talk|Category|Portal|Talk|User|User talk|Draft|Module|MediaWiki|Book|TimedText):/i;

  function cleanArticle(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    body.querySelectorAll([
      'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'audio', 'video',
      '.mw-editsection', '.navbox', '.navbox-styles', '.vertical-navbox', '.sidebar', '.ambox', '.ombox', '.tmbox', '.mbox-small',
      '.sistersitebox', '.side-box', '.noprint', '.mw-empty-elt', 'sup.reference', '.mw-references-wrap', '.reflist',
      '.shortdescription', '.portalbox', '.metadata', '.mw-kartographer-maplink', '.ext-phonos',
    ].join(',')).forEach((n) => n.remove());

    body.querySelectorAll('h2').forEach((h2) => {
      if (DROP_SECTIONS.test(h2.textContent.trim())) (h2.closest('section') || h2).remove();
    });

    // Infobox -> quick facts
    const facts = [];
    let infoImg = null;
    const ib = body.querySelector('table.infobox');
    if (ib) {
      const im = ib.querySelector('img');
      if (im) infoImg = https(im.getAttribute('src'));
      for (const tr of ib.querySelectorAll('tr')) {
        const th = tr.querySelector('th');
        const td = tr.querySelector('td');
        if (!th || !td) continue;
        const k = th.textContent.replace(/\s+/g, ' ').trim();
        const cell = td.cloneNode(true);
        cell.querySelectorAll('br').forEach((br) => br.replaceWith('; '));
        cell.querySelectorAll('li, div, p').forEach((el) => el.append('; '));
        let v = cell.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').replace(/(\s*;\s*)+/g, '; ').replace(/^[;\s]+|[;\s]+$/g, '').trim();
        if (!k || !v || k.length > 40) continue;
        if (v.length > 90) v = v.slice(0, 87) + '…';
        facts.push([k, v]);
        if (facts.length >= 10) break;
      }
      ib.remove();
    }

    for (const el of body.querySelectorAll('*')) {
      for (const a of [...el.attributes]) if (/^on/i.test(a.name) || a.name === 'srcset') el.removeAttribute(a.name);
    }
    body.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src) img.setAttribute('src', https(src));
      img.setAttribute('loading', 'lazy');
    });

    const related = [];
    body.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const rel = a.getAttribute('rel') || '';
      if (href.startsWith('./') || rel.includes('mw:WikiLink')) {
        const raw = href.replace(/^\.\//, '').split('#')[0].split('?')[0];
        let t;
        try { t = decodeURIComponent(raw).replace(/_/g, ' '); } catch { t = raw.replace(/_/g, ' '); }
        if (/^(File|Image):/i.test(t)) {
          a.setAttribute('href', '#');
          a.dataset.file = t;
        } else if (!t || SKIP_NS.test(t) || a.classList.contains('new') || href.includes('redlink=1')) {
          a.replaceWith(...a.childNodes);
        } else {
          a.setAttribute('href', '#');
          a.dataset.title = t;
          a.removeAttribute('title');
          if (related.length < 8 && !related.includes(t) && !a.closest('figure, table') && !/^\d+$/.test(t)) related.push(t);
        }
      } else if (/^(https?:)?\/\//.test(href)) {
        a.dataset.ext = https(href);
        a.setAttribute('href', '#');
      } else if (!href.startsWith('#')) {
        a.replaceWith(...a.childNodes);
      }
    });

    const firstP = [...body.querySelectorAll('p')].find((p) => p.textContent.trim().length > 60);
    if (firstP) firstP.classList.add('lede');

    const toc = [...body.querySelectorAll('h2')].map((h2, i) => {
      if (!h2.id) h2.id = 'sec-' + i;
      return { id: h2.id, label: h2.textContent.trim() };
    });
    return { nodes: [...body.childNodes], facts, toc, related, infoImg };
  }

  async function viewArticle(title, token) {
    const favBtn = bandBtn('Add to Favorites', () => toggleFav(), 'star');
    const speakBtn = bandBtn('Read Aloud', () => toggleSpeak(), 'read');
    const wikiBtn = bandBtn('View on Wikipedia', null, 'ext');
    const pg = shell({ title, railTitle: 'In this article', tools: [speakBtn, favBtn, wikiBtn] });
    pg.text.append(loading('Retrieving article…'));
    if (!mount(pg.root, token)) return;
    setStatus(`Retrieving “${title}”…`, true);

    const sum = await Wiki.summary(title);
    if (!live(token)) return;
    const name = sum.titles?.normalized || title;
    const canon = sum.titles?.canonical || name.replace(/ /g, '_');
    pg.setTitle(name, sum.description);
    setHere(name);
    wikiBtn.onclick = () => window.e2k.openExternal(Wiki.pageUrl(canon));

    const html = await Wiki.html(canon);
    if (!live(token)) return;
    const { nodes, facts, toc, related, infoImg } = cleanArticle(html);

    current = { title: name, desc: sum.description || '', thumb: sum.thumbnail?.source || '', favBtn, speakBtn };
    addRecent(name);
    store.set('lastArticle', name);

    const attrib = h('div', { class: 'attrib' },
      'This article uses material from the Wikipedia article ', h('a', { href: '#', 'data-ext': Wiki.pageUrl(canon) }, `“${name}”`),
      ', which is released under the Creative Commons Attribution-ShareAlike 4.0 License. Retrieved ', new Date().toLocaleDateString('en-US'), '.');
    pg.text.replaceChildren(...nodes, attrib);

    // contents rail
    const tocLinks = [railLink('Introduction', () => pg.content.scrollTo({ top: 0, behavior: 'smooth' }), 'on')];
    toc.forEach(({ id, label }) => tocLinks.push(railLink(label, () => {
      const target = pg.text.querySelector('#' + CSS.escape(id));
      if (target) pg.content.scrollTo({ top: target.offsetTop - pg.content.offsetTop - 10, behavior: 'smooth' });
    })));
    pg.railIn.append(...tocLinks);
    if (related.length) {
      pg.railIn.append(h('hr'), h('h4', {}, 'Related articles'), ...related.map((t) => railLink(t, () => openArticle(t, linkFrom()), 'sub')));
    }
    pg.content.addEventListener('scroll', () => {
      const y = pg.content.scrollTop + 40;
      let active = 0;
      toc.forEach(({ id }, i) => {
        const el = pg.text.querySelector('#' + CSS.escape(id));
        if (el && el.offsetTop - pg.content.offsetTop <= y) active = i + 1;
      });
      tocLinks.forEach((l, i) => l.classList.toggle('on', i === active));
    }, { passive: true });

    // picture and quick facts
    const lead = sum.originalimage?.source || sum.thumbnail?.source || infoImg;
    if (lead) {
      const ow = sum.originalimage?.width || 0;
      const shown = sum.thumbnail?.source ? sized(sum.thumbnail.source, lead, ow, 500) : lead;
      const large = sum.thumbnail?.source ? sized(sum.thumbnail.source, lead, ow, 1280) : lead;
      pg.media.append(h('div', { class: 'frame' }, h('img', { src: shown, alt: name, onclick: () => lightbox(large, name) })),
        h('div', { class: 'cap' }, sum.description ? `${name}, ${sum.description}` : name));
    }
    const factsBox = h('div', { class: 'facts' }, h('h6', {}, 'Quick facts'));
    facts.forEach(([k, v]) => factsBox.append(h('div', { class: 'r' }, h('span', {}, k), h('span', {}, v))));
    factsBox.append(
      h('div', { class: 'r' }, h('span', {}, 'Source'), h('span', {}, 'Wikipedia')),
      h('div', { class: 'r' }, h('span', {}, 'License'), h('span', {}, 'CC BY-SA 4.0')));
    pg.media.append(factsBox);

    updateToolbar();
    setIdle(sum.type === 'disambiguation' ? `“${name}” may refer to several subjects` : 'Done');
  }

  // link handling inside article text (and anywhere else data-* links appear)
  view.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.title) openArticle(a.dataset.title, linkFrom());
    else if (a.dataset.ext) window.e2k.openExternal(a.dataset.ext);
    else if (a.dataset.file) {
      const img = a.querySelector('img');
      if (img) {
        const fw = Number(img.getAttribute('data-file-width')) || 0;
        lightbox(sized(img.src, originalOf(img.src), fw, 1280), img.closest('figure')?.querySelector('figcaption')?.textContent || '');
      }
    } else if ((a.getAttribute('href') || '').startsWith('#') && a.getAttribute('href').length > 1) {
      const t = view.querySelector('#' + CSS.escape(a.getAttribute('href').slice(1)));
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    }
  });
  view.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.title) setStatus('Article: ' + a.dataset.title);
    else if (a.dataset.ext) setStatus('Opens in your web browser: ' + a.dataset.ext);
  });
  view.addEventListener('mouseout', (e) => { if (e.target.closest('a')) setStatus(statusIdle); });

  // ---------- search ----------
  async function viewSearch(q, token) {
    const pg = shell({ title: `Results for “${q}”`, railTitle: 'Search', wide: true });
    pg.text.append(loading('Searching…'));
    if (!mount(pg.root, token)) return;
    setStatus('Searching…', true);
    const [res, spelling] = await Promise.all([Wiki.searchPages(q), Wiki.spelling(q)]);
    if (!live(token)) return;
    const pages = res.pages || [];
    // Wikipedia suggests a spelling for almost every search ("moon" gets "mount"), so only offer it when no
    // result's title matches what was typed.
    const norm = (s) => s.toLowerCase().replace(/[\s_]+/g, ' ').trim();
    const didYouMean = spelling && norm(spelling) !== norm(q) && !pages.some((p) => norm(p.title) === norm(q))
      ? spelling.charAt(0).toUpperCase() + spelling.slice(1) : '';
    const suggest = didYouMean ? h('p', { class: 'dym' }, 'Did you mean ',
      h('button', { onclick: () => go(route('search', didYouMean), { replace: true }) }, didYouMean), '?') : null;
    pg.railIn.append(h('div', { class: 'note' }, pages.length ? `${pages.length} best matches for “${q}”.` : 'No matches found.'),
      h('hr'), railLink(`Search Wikipedia for “${q}”`, () => window.e2k.openExternal(`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&fulltext=1`), 'sub'));
    if (!pages.length) {
      pg.text.replaceChildren(...(suggest ? [suggest] : []), h('div', { class: 'errbox' }, h('b', {}, 'No articles found'), `Nothing matched “${q}”. Check the spelling, or try a broader subject.`));
    } else {
      pg.text.replaceChildren(...(suggest ? [suggest] : []), h('div', { class: 'results' }, pages.map((p) => {
        const ex = h('p');
        const parts = (p.excerpt || '').split(/<span class="searchmatch">|<\/span>/);
        parts.forEach((part, i) => {
          const txt = decodeHtml(part);
          ex.append(i % 2 ? h('strong', {}, txt) : txt);
        });
        return h('button', { class: 'res', onclick: () => openArticle(p.title, linkFrom()) },
          h('i', { class: 'th', style: bg(https(p.thumbnail?.url)) }),
          h('div', {}, h('b', {}, p.title), p.description ? h('span', {}, p.description) : null, ex));
      })));
    }
    setIdle(`${pages.length} results`);
  }

  async function viewRandom(token) {
    setStatus('Finding a random article…', true);
    const s = await Wiki.random();
    if (!live(token)) return;
    go(route('article', s.titles?.normalized || s.title), { replace: true });
  }

  // ---------- explore ----------
  async function viewExplore(token) {
    const pg = shell({
      title: 'Explore the encyclopedia', desc: 'Eight articles chosen at random. Shuffle for more.',
      railTitle: 'Browse', wide: true, tools: [bandBtn('Shuffle', () => reload(), 'shuffle')],
    });
    pg.railIn.append(
      railLink('Today’s featured article', () => runCmd('featured')),
      railLink('Random article', () => go('random')),
      railLink('Picture of the Day', () => go('gallery')),
      railLink('On this day', () => go('onthisday')));
    const recent = store.get('recent', []);
    if (recent.length) pg.railIn.append(h('hr'), h('h4', {}, 'Recently viewed'), ...recent.map((t) => railLink(t, () => openArticle(t, linkFrom()), 'sub')));
    const grid = h('div', { class: 'cards' }, Array.from({ length: 8 }, () => h('div', { class: 'card ghost' })));
    pg.text.append(grid);
    if (!mount(pg.root, token)) return;
    setStatus('Picking articles…', true);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => Wiki.random()));
    if (!live(token)) return;
    const pages = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!pages.length) throw new Error('No articles returned');
    grid.replaceChildren(...pages.map((s) => {
      const t = s.titles?.normalized || s.title;
      return h('button', { class: 'card', onclick: () => openArticle(t) },
        h('div', { class: 'ph', style: bg(s.thumbnail?.source) }),
        h('div', { class: 'b' }, h('b', {}, t), s.description ? h('span', {}, s.description) : null, h('p', {}, s.extract || '')));
    }));
    setIdle();
  }

  // ---------- gallery ----------
  async function viewGallery(token) {
    const pg = shell({ title: 'Picture of the Day', desc: 'Featured images from Wikimedia Commons', railTitle: 'This week', wide: true });
    pg.text.append(loading('Loading pictures…'));
    if (!mount(pg.root, token)) return;
    setStatus('Loading pictures…', true);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; });
    const feeds = await Promise.allSettled(days.map((d, i) => (i === 0 ? todayFeed() : Wiki.featured(d))));
    if (!live(token)) return;
    const pics = feeds.map((f, i) => (f.status === 'fulfilled' && f.value.image ? { date: days[i], img: f.value.image } : null)).filter(Boolean);
    if (!pics.length) throw new Error('No pictures available');

    const holder = h('div', { class: 'potd' });
    const stripEl = h('div', { class: 'strip' });
    const railBtns = [];
    function show(i) {
      const { date, img } = pics[i];
      const full = sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 1280);
      const caption = strip(img.description?.text) || strip(img.title);
      holder.replaceChildren(
        h('figure', {}, h('img', { src: full, alt: caption, onclick: () => lightbox(full, caption) })),
        h('div', { class: 'desc' }, caption),
        h('div', { class: 'credit' },
          `${longDate(date)} · ${strip(img.artist?.text) || 'Unknown artist'} · ${img.license?.type || ''}`,
          img.file_page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(img.file_page), 'ext') : null));
      [...stripEl.children].forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      pg.content.scrollTo({ top: 0 });
    }
    pics.forEach((p, i) => {
      stripEl.append(h('button', { onclick: () => show(i) }, h('i', { style: bg(p.img.thumbnail?.source) }), i === 0 ? 'Today' : longDate(p.date)));
      railBtns.push(railLink(i === 0 ? 'Today' : p.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), () => show(i)));
    });
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(holder, stripEl);
    show(0);
    setIdle();
  }

  // ---------- on this day ----------
  async function viewOnThisDay(token) {
    const pg = shell({ title: `On this day: ${longDate()}`, desc: 'Events, births, and deaths from across history', railTitle: 'Categories', wide: true });
    pg.text.append(loading('Consulting the almanac…'));
    if (!mount(pg.root, token)) return;
    setStatus('Consulting the almanac…', true);
    const data = await Wiki.onThisDay(new Date());
    if (!live(token)) return;
    const cats = [['selected', 'Highlights'], ['events', 'Events'], ['births', 'Births'], ['deaths', 'Deaths'], ['holidays', 'Holidays']]
      .filter(([k]) => (data[k] || []).length);
    const list = h('div', { class: 'tl' });
    const links = cats.map(([k, label], i) => {
      const b = railLink(label, () => show(i));
      b.append(h('span', { class: 'n' }, String(data[k].length)));
      return b;
    });
    function show(i) {
      const [k] = cats[i];
      links.forEach((l, j) => l.classList.toggle('on', j === i));
      list.replaceChildren(...data[k].map((o) => {
        const page = (o.pages || []).find((p) => p.thumbnail) || (o.pages || [])[0];
        const t = page ? page.titles?.normalized || page.title : null;
        return h('button', { class: 'tl-item', onclick: () => (t ? openArticle(t, linkFrom()) : null) },
          h('div', { class: 'yr' }, o.year !== undefined ? String(o.year) : '•'),
          h('div', { class: 'tx' }, o.text, t ? h('small', {}, t + ' ›') : null),
          page?.thumbnail ? h('i', { class: 'th', style: bg(page.thumbnail.source) }) : null);
      }));
      pg.content.scrollTo({ top: 0 });
    }
    pg.railIn.append(...links);
    pg.text.replaceChildren(list);
    show(0);
    setIdle();
  }

  // ---------- games ----------
  function viewGames(token) {
    const pg = shell({ title: 'Games', desc: 'Play and learn with challenges drawn from the encyclopedia', railTitle: 'Games', wide: true });
    const games = E2KGames.list;
    pg.railIn.append(...games.map((g) => railLink(g.name, () => go(route('game', g.id)))),
      h('hr'), h('div', { class: 'note' }, 'More games are on the way.'));
    pg.text.append(h('div', { class: 'gcards' },
      games.map((g) => h('button', { class: 'gcard', onclick: () => go(route('game', g.id)) },
        h('div', { class: 'gart' }, g.art ? g.art(E2K) : null),
        h('div', { class: 'gb' }, h('b', {}, g.name), h('p', {}, g.blurb),
          h('div', { class: 'gfoot' }, h('span', { class: 'gprog' }, g.progress ? g.progress(E2K) : ''), h('span', { class: 'gplay' }, 'Play ›')))))));
    mount(pg.root, token);
    setIdle();
  }

  function viewGame(id, token) {
    const game = E2KGames.get(id);
    if (!game) throw Object.assign(new Error('Game not found'), { status: 404 });
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    gameCleanup = game.mount(root, E2K) || null;
    setIdle(game.name);
  }

  // ---------- activities ----------
  let activityFilter = 'All';
  function viewActivities(token) {
    const pg = shell({ title: 'Activities', desc: 'Interactive tools and explorations', railTitle: 'Activities', wide: true });
    // Grouped by subject (see E2KActivities.categories); activities without a category go in "More".
    const groups = [...E2KActivities.categories, 'More']
      .map((cat) => [cat, E2KActivities.list.filter((a) => (E2KActivities.categories.includes(a.category) ? a.category : 'More') === cat)])
      .filter(([, items]) => items.length);
    const open = (a) => go(a.route || route('activity', a.id));
    const card = (a) => h('button', { class: 'gcard', onclick: () => open(a) },
      h('div', { class: 'gart' }, a.art ? a.art(E2K) : null),
      h('div', { class: 'gb' }, h('b', {}, a.name), h('p', {}, a.blurb), h('div', { class: 'gfoot' }, h('span', { class: 'gprog' }, ''), h('span', { class: 'gplay' }, 'Open ›'))));
    const sections = groups.map(([cat, items], i) => {
      pg.railIn.append(...(i ? [h('hr')] : []), h('h4', {}, cat), ...items.map((a) => railLink(a.name, () => open(a), 'sub')));
      const sec = h('section', { class: 'act-group', 'data-cat': cat }, h('h3', {}, cat, h('span', {}, `${items.length} ${items.length === 1 ? 'activity' : 'activities'}`)),
        h('div', { class: 'gcards' }, items.map(card)));
      pg.text.append(sec);
      return sec;
    });
    // Subject buttons in the header, styled like World Explorer's region buttons. The choice is kept for the session.
    const chips = ['All', ...groups.map(([cat]) => cat)].map((cat) => h('button', { class: 'wx-chip', onclick: () => filter(cat) }, cat));
    function filter(cat) {
      activityFilter = cat;
      chips.forEach((c) => c.classList.toggle('on', c.textContent === cat));
      sections.forEach((sec) => { sec.hidden = cat !== 'All' && sec.dataset.cat !== cat; });
    }
    pg.toolsEl.append(...chips);
    filter(groups.some(([cat]) => cat === activityFilter) ? activityFilter : 'All');
    mount(pg.root, token);
    setIdle();
  }

  function viewActivity(id, token) {
    const activity = E2KActivities.get(id);
    if (!activity) throw Object.assign(new Error('Activity not found'), { status: 404 });
    if (activity.route) return go(activity.route, { replace: true });
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    gameCleanup = activity.mount(root, E2K) || null;
    setIdle(activity.name);
  }

  // ---------- World Explorer ----------
  // The map data is large, so it's only loaded the first time the World Explorer opens.
  const loadScript = (src) => new Promise((resolve, reject) => {
    document.head.append(h('script', { src, onload: resolve, onerror: () => reject(new Error('Couldn’t load ' + src)) }));
  });
  async function viewWorld(token) {
    if (!window.E2KWorldMap) {
      setStatus('Loading the map…', true);
      await loadScript('world/map-data.js');
      if (!live(token)) return;
    }
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    setIdle();
    gameCleanup = E2KWorld.mount(root, E2K) || null;
  }

  // ---------- errors ----------
  function showError(err, name, arg, token) {
    const offline = !navigator.onLine;
    const notFound = err.status === 404;
    const pg = shell({ title: notFound ? 'Article not found' : 'Something went wrong', railTitle: '', wide: true });
    pg.text.append(h('div', { class: 'errbox' },
      h('b', {}, offline ? 'You’re offline' : notFound ? `There’s no article called “${arg}”` : 'This page couldn’t be loaded'),
      offline ? 'Encyclopedia 2000 retrieves its articles from Wikipedia, so it needs an internet connection.'
        : notFound ? 'Try searching for it instead.' : `Wikipedia didn’t respond as expected (${err.message}).`,
      h('div', {}, notFound
        ? bandBtn(`Search for “${arg}”`, () => go(route('search', arg), { replace: true }))
        : bandBtn('Try again', () => reload()))));
    mount(pg.root, token);
    setIdle(offline ? 'Offline' : 'Error: ' + err.message);
  }

  // ---------- overlays ----------
  function closeOverlays() { $$('.overlay').forEach((o) => o.remove()); }

  // Every dialog can be moved by its title bar, and always keeps the title bar on screen.
  document.addEventListener('mousedown', (e) => {
    const bar = e.button === 0 && e.target.closest('.dialog .dt');
    if (!bar) return;
    e.preventDefault();
    const box = bar.parentElement;
    const [x0, y0] = (box.dataset.drag || '0,0').split(',').map(Number);
    const r = box.getBoundingClientRect();
    const left = r.left - x0, top = r.top - y0;
    const sx = e.clientX, sy = e.clientY;
    const move = (m) => {
      const x = Math.min(Math.max(x0 + m.clientX - sx, 40 - r.width - left), innerWidth - 40 - left);
      const y = Math.min(Math.max(y0 + m.clientY - sy, -top), innerHeight - bar.offsetHeight - top);
      box.dataset.drag = `${x},${y}`;
      box.style.transform = `translate(${x}px, ${y}px)`;
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  function dialog(title, heading, paragraphs, buttons = [['OK']]) {
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) ov.remove(); } });
    ov.append(h('div', { class: 'dialog', role: 'dialog' },
      h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), title),
      h('div', { class: 'db' }, h('img', { src: 'icon.svg', alt: '' }),
        h('div', {}, h('h2', {}, heading), paragraphs.map((p) => (p instanceof Node ? p : h('p', {}, p))))),
      h('div', { class: 'df' }, buttons.map(([label, fn, isDefault]) => h('button', { class: 'go' + (isDefault ? ' default' : ''), onclick: () => { ov.remove(); fn && fn(); } }, label)))));
    document.body.append(ov);
    (ov.querySelector('.df .go.default') || ov.querySelector('.df .go')).focus();
  }
  const about = async () => dialog('About Encyclopedia 2000', 'Encyclopedia 2000', [
    `Version ${prettyVersion((await window.e2k.appInfo().catch(() => ({}))).version)}.`,
    'Articles and pictures come live from Wikipedia and Wikimedia Commons, written by volunteers and shared under Creative Commons licenses.',
    'Encyclopedia 2000 is an independent project. It isn’t affiliated with the Wikimedia Foundation or Microsoft.',
    h('p', { class: 'support' }, 'Encyclopedia 2000 is free because Wikipedia is. If you find it useful, please consider supporting the Wikimedia Foundation, the nonprofit that runs Wikipedia.'),
  ], [['Donate…', () => donate()], ['OK', null, true]]);
  // ---------- what's new ----------
  // Shown once after updating to a new feature release (0.2, 0.3, and so on), and any time from Help › What's New.
  // New installs skip it, and bug-fix releases don't change it.
  const WHATS_NEW = {
    version: '0.2',
    name: '0.2 Beta',
    items: [
      ['Themes', `Give Encyclopedia 2000 a new look, from Aurora and Ocean to Library and Classic Gray. Find them under ${MAC ? 'Encyclopedia 2000' : 'Tools'} › Themes.`],
      ['Now on Mac and Linux', 'Share Encyclopedia 2000 with friends on any computer. Downloads are at encyclopedia2000.com.'],
      ['Fixes and improvements', 'Drag any dialog by its title bar, plus smaller fixes throughout.'],
    ],
  };
  const RELEASES_URL = 'https://github.com/sburton0/encyclopedia-2000/releases/latest';
  const featureVersion = (v) => (v || '').split(/[.-]/).slice(0, 2).join('.');
  function whatsNew() {
    if (document.querySelector('.dialog.whatsnew')) return;
    dialog('What’s New', `What’s new in version ${WHATS_NEW.name}`, [
      'Thanks for updating. Here’s what’s new:',
      h('ul', { class: 'wn' }, WHATS_NEW.items.map(([b, t]) => h('li', {}, h('b', {}, b), t))),
    ], [['See All Changes…', () => { window.e2k.openExternal(RELEASES_URL); setIdle('Opened in your web browser'); }], ['Close', null, true]]);
    document.querySelector('.overlay:last-child .dialog').classList.add('whatsnew');
  }
  async function maybeWhatsNew() {
    const { version } = await window.e2k.appInfo().catch(() => ({}));
    if (featureVersion(version) !== WHATS_NEW.version || store.get('whatsNewSeen', '') === WHATS_NEW.version) return;
    store.set('whatsNewSeen', WHATS_NEW.version);
    if (!firstRun) setTimeout(whatsNew, 1200);
  }

  // ---------- feedback ----------
  // Both choices open in the web browser; the app itself sends nothing.
  // The Discord address forwards to the server's invite (a Cloudflare redirect rule), so the invite can change without an app update.
  const DISCORD_URL = 'https://discord.encyclopedia2000.com';
  const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfCzlaWDSgLJfiaTmDzbbJ9dW2yQLKUjwxtbEqByurrhiARYg/viewform';
  const FORM_FIELDS = { version: 'entry.286759181', windows: 'entry.1837651922' };
  const prettyVersion = (v) => E2KVersion.pretty(v);
  async function feedback() {
    if (document.querySelector('.dialog.feedback')) return;
    const info = await window.e2k.appInfo().catch(() => ({ version: '', windows: '' }));
    const line = `Encyclopedia 2000 ${prettyVersion(info.version)} (${info.version}) · ${info.windows}`;
    const form = `${FORM_URL}?usp=pp_url&${FORM_FIELDS.version}=${encodeURIComponent(info.version)}&${FORM_FIELDS.windows}=${encodeURIComponent(info.windows)}`;
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) ov.remove(); } });
    const go = (url) => { window.e2k.openExternal(url); ov.remove(); setIdle('Opened in your web browser'); };
    const copyBtn = h('button', { onclick: () => {
      navigator.clipboard.writeText(line).then(() => { copyBtn.textContent = 'Copied'; }, () => { copyBtn.textContent = 'Copy failed'; });
    } }, 'Copy');
    ov.append(h('div', { class: 'dialog feedback', role: 'dialog', 'aria-label': 'Send Feedback' },
      h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Send Feedback'),
      h('div', { class: 'db' }, h('img', { src: 'icon.svg', alt: '' }),
        h('div', {},
          h('h2', {}, 'Help shape the Beta'),
          h('p', {}, 'Found a problem, or have an idea? We’d love to hear it. Both choices open in your web browser.'),
          h('div', { class: 'fbopts' },
            h('button', { class: 'fbopt', onclick: () => go(DISCORD_URL) }, h('i', { style: 'background:#5865f2' }, 'D'),
              h('div', {}, h('b', {}, 'Join the Discord'), h('span', {}, 'Report bugs, share ideas and screenshots, and see what’s coming next.'))),
            h('button', { class: 'fbopt', onclick: () => go(form) }, h('i', { style: 'background:#2a86d6' }, '✎'),
              h('div', {}, h('b', {}, 'Send feedback without an account'), h('span', {}, 'A short form. Your app and system versions are filled in for you.')))),
          h('div', { class: 'fbver' }, 'Your versions', h('code', {}, line), copyBtn))),
      h('div', { class: 'df' }, h('button', { class: 'go', onclick: () => ov.remove() }, 'Close'))));
    document.body.append(ov);
    ov.querySelector('.fbopt').focus();
  }

  // ---------- updates ----------
  // The installed app downloads new versions in the background (updater.js); the status bar offers to restart when one is ready.
  const updateBar = $('#updatebar');
  function showUpdate(s) {
    if (s.state === 'ready') {
      updateBar.replaceChildren(`Version ${prettyVersion(s.version)} is ready`, h('button', { onclick: () => window.e2k.update.install() }, 'Restart Now'));
      updateBar.title = 'Restart Encyclopedia 2000 to finish updating. Otherwise the update installs the next time you close it.';
      updateBar.hidden = false;
    } else if (s.state === 'available') {
      updateBar.replaceChildren(`Version ${prettyVersion(s.version)} is available`, h('button', { onclick: () => window.e2k.update.install() }, 'Download'));
      updateBar.title = 'Opens the download page in your web browser.';
      updateBar.hidden = false;
    } else if (s.state === 'downloading') {
      updateBar.replaceChildren(`Downloading version ${prettyVersion(s.version)}${s.percent ? ` · ${s.percent}%` : '…'}`);
      updateBar.title = '';
      updateBar.hidden = false;
    } else updateBar.hidden = true;
  }
  window.e2k.update.onChange(showUpdate);
  window.e2k.update.state().then(showUpdate).catch(() => {});

  async function checkForUpdates() {
    setStatus('Checking for updates…', true);
    const s = await window.e2k.update.check().catch(() => ({ state: 'error' }));
    setIdle();
    showUpdate(s);
    const title = 'Check for Updates';
    if (s.state === 'ready') dialog(title, 'An update is ready', [`Version ${prettyVersion(s.version)} has been downloaded. Restart Encyclopedia 2000 to finish installing it.`],
      [['Restart Now', () => window.e2k.update.install(), true], ['Later']]);
    else if (s.state === 'available') dialog(title, 'A new version is available', [s.kind === 'deb'
      ? `Version ${prettyVersion(s.version)} is ready to download. Download the new .deb file and open it to install it over this one. Your settings and favorites are kept.`
      : `Version ${prettyVersion(s.version)} is ready to download. This portable copy can’t update itself, so download the new version and use it in place of this one. Your settings and favorites carry over if you keep its “Encyclopedia 2000 Data” folder next to it.`],
      [['Download', () => window.e2k.update.install(), true], ['Later']]);
    else if (s.state === 'downloading') dialog(title, 'An update is on its way', [`Version ${prettyVersion(s.version)} is downloading. You’ll see a Restart Now button in the status bar when it’s ready.`]);
    else if (s.state === 'none') dialog(title, 'You’re up to date', [`Encyclopedia 2000 ${prettyVersion((await window.e2k.appInfo()).version)} is the newest version.`]);
    else if (s.state === 'dev') dialog(title, 'Updates aren’t available here', ['This copy of Encyclopedia 2000 is running from its source folder. Updates work in the installed app.']);
    else dialog(title, 'Couldn’t check for updates', [navigator.onLine ? 'The update server didn’t respond. Please try again later.' : 'You’re offline. Connect to the internet and try again.']);
  }

  // ---------- donate ----------
  // One dialog for both kinds of donation, opened from the status bar, Help › Donate, and About. Both open in the browser.
  // The tip address forwards to the developer's Ko-fi page (a Cloudflare redirect rule), so it can change without an app update.
  const WIKIPEDIA_DONATE_URL = 'https://donate.wikimedia.org/';
  const TIP_URL = 'https://donate.encyclopedia2000.com';
  function donate() {
    if (document.querySelector('.dialog.donate')) return;
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) ov.remove(); } });
    const go = (url) => { window.e2k.openExternal(url); ov.remove(); setIdle('Opened in your web browser'); };
    ov.append(h('div', { class: 'dialog feedback donate', role: 'dialog', 'aria-label': 'Donate' },
      h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Donate'),
      h('div', { class: 'db' }, h('img', { src: 'icon.svg', alt: '' }),
        h('div', {},
          h('h2', {}, 'Keep the encyclopedia going'),
          h('p', {}, 'Encyclopedia 2000 is free, with no ads. If you enjoy it, you can help in two ways. Both open in your web browser.'),
          h('div', { class: 'fbopts' },
            h('button', { class: 'fbopt', onclick: () => go(WIKIPEDIA_DONATE_URL) }, h('i', { class: 'wp' }, 'W'),
              h('div', {}, h('b', {}, 'Donate to Wikipedia'), h('span', {}, 'Volunteers write every article, and the nonprofit Wikimedia Foundation keeps Wikipedia running.'))),
            h('button', { class: 'fbopt', onclick: () => go(TIP_URL) }, h('i', { class: 'tip' }, '♥'),
              h('div', {}, h('b', {}, 'Tip the developer'), h('span', {}, 'Encyclopedia 2000 is made by one independent developer. Tips help pay for new features, code signing, and the website.')))),
          h('p', { class: 'fine' }, 'Tips go to the developer through Ko-fi, not to Wikipedia.'))),
      h('div', { class: 'df' }, h('button', { class: 'go', onclick: () => ov.remove() }, 'Close'))));
    document.body.append(ov);
    ov.querySelector('.fbopt').focus();
  }

  function lightbox(src, caption) {
    if (!src) return;
    const ov = h('div', { class: 'overlay lightbox', onclick: () => ov.remove() }, h('img', { src, alt: caption || '' }), caption ? h('div', {}, caption) : null);
    document.body.append(ov);
  }

  // ---------- favorites, recent, read aloud ----------
  const favs = () => store.get('favorites', []);
  const isFav = () => !!current && favs().some((f) => f.title === current.title);
  function toggleFav() {
    if (!current) return;
    const list = favs();
    const i = list.findIndex((f) => f.title === current.title);
    if (i >= 0) { list.splice(i, 1); setIdle(`Removed “${current.title}” from Favorites`); }
    else { list.unshift({ title: current.title, desc: current.desc }); setIdle(`Added “${current.title}” to Favorites`); }
    store.set('favorites', list.slice(0, 50));
    updateToolbar();
  }
  function addRecent(title) {
    const list = store.get('recent', []).filter((t) => t !== title);
    list.unshift(title);
    store.set('recent', list.slice(0, 12));
  }

  function toggleSpeak() {
    if (speaking) return speechStop();
    const text = $('.page .text');
    if (!current || !text || !('speechSynthesis' in window)) return;
    if (E2KAudio.isMuted()) { setIdle('Sound is muted. Turn up the volume to hear Read Aloud.'); return; }
    // Many Linux systems come without a text-to-speech voice, and speaking then does nothing at all.
    if (window.e2k.platform === 'linux' && !speechSynthesis.getVoices().length) {
      dialog('Read Aloud', 'No voices are installed', [
        'Read Aloud uses your computer’s text-to-speech voices, and none were found.',
        'On Ubuntu and Debian, install them with “sudo apt install speech-dispatcher espeak-ng”, then restart Encyclopedia 2000.']);
      return;
    }
    const parts = [current.title + '.']
      .concat($$('p, h2, h3, li', text).filter((el) => !el.closest('table, figure, .attrib')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
      .filter(Boolean).slice(0, 150);
    speechSynthesis.cancel();
    speaking = true;
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.volume = Math.sqrt(E2KAudio.level()); // speech volume is already perceptual, so use the slider position
      u.rate = store.get('rate', 1);
      const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === store.get('voice', ''));
      if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = () => { speaking = false; updateToolbar(); };
      speechSynthesis.speak(u);
    });
    setIdle('Reading aloud. Press the Read Aloud button again to stop.');
    updateToolbar();
  }
  function speechStop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (speaking) { speaking = false; setIdle(); }
    updateToolbar();
  }

  // ---------- Favorites pane ----------
  // Opens over any screen from the toolbar's Favorites button, the Favorites menu, or Ctrl+I.
  const fpane = $('#fpane');
  let favsExpanded = false;
  const FAVS_SHOWN = 8;
  function drawFavPane() {
    if (fpane.hidden) return;
    const list = favs();
    const recent = store.get('recent', []);
    const here = current?.title;
    const fav = isFav();
    const shown = favsExpanded ? list : list.slice(0, FAVS_SHOWN);
    const lnk = (t, starred) => h('button', { class: 'lnk' + (starred ? '' : ' plain') + (t === here ? ' here' : ''), title: t, onclick: () => openArticle(t) },
      starred ? icon('star') : null, t);
    fpane.replaceChildren(
      h('div', { class: 'fh' }, icon('favs'), h('span', {}, 'Favorites'), h('button', { title: 'Close (Esc)', onclick: () => toggleFavPane(false) }, winIcon('close'))),
      h('div', { class: 'fb' },
        here ? h('button', { class: 'add', title: fav ? 'Remove from Favorites' : 'Add to Favorites', onclick: () => toggleFav() }, icon('star'), h('span', {}, fav ? `Remove “${here}” from Favorites` : `Add “${here}” to Favorites`)) : null,
        h('h4', {}, 'Favorites'),
        list.length ? shown.map((f) => lnk(f.title, true)) : h('div', { class: 'note' }, 'Open an article and click “Add to Favorites” to save it here.'),
        list.length > FAVS_SHOWN ? h('button', { class: 'more', onclick: () => { favsExpanded = !favsExpanded; drawFavPane(); } }, favsExpanded ? 'Show fewer' : `Show all (${list.length})`) : null,
        ...(recent.length ? [h('hr'), h('h4', {}, 'Recently viewed'), ...recent.map((t) => lnk(t, false))] : [])),
      h('div', { class: 'ff' }, `${keyText('Ctrl+I')} opens and closes this pane`));
  }
  function toggleFavPane(open = fpane.hidden) {
    fpane.hidden = !open;
    if (!open) favsExpanded = false;
    updateToolbar();
  }

  // ---------- toolbar ----------
  function updateToolbar() {
    syncMenu();
    const btn = (c) => $(`.tbtn[data-cmd="${c}"]`);
    btn('back').disabled = nav.idx <= 0;
    btn('fwd').disabled = nav.idx >= nav.stack.length - 1;
    btn('speak').disabled = !current;
    btn('print').disabled = !printable();
    const fav = isFav();
    btn('speak').classList.toggle('on', speaking);
    btn('speak').title = speaking ? 'Stop reading' : 'Read Aloud';
    btn('favpane').classList.toggle('on', !fpane.hidden);
    drawFavPane();
    if (current?.favBtn) {
      current.favBtn.lastChild.textContent = fav ? 'In Favorites' : 'Add to Favorites';
      current.favBtn.classList.toggle('on', fav);
      current.speakBtn.lastChild.textContent = speaking ? 'Stop Reading' : 'Read Aloud';
      current.speakBtn.classList.toggle('on', speaking);
    }
  }

  const COMMANDS = {
    back, fwd, reload,
    home: () => go('home'),
    explore: () => go('explore'),
    gallery: () => go('gallery'),
    onthisday: () => go('onthisday'),
    random: () => go('random'),
    featured: () => todayFeed().then((d) => d.tfa && openArticle(d.tfa.titles?.normalized || d.tfa.title)).catch(() => setIdle('Couldn’t load today’s featured article')),
    fav: toggleFav,
    donate: () => donate(),
    feedback: () => feedback(),
    privacy: () => window.e2k.openExternal('https://github.com/sburton0/encyclopedia-2000/blob/main/PRIVACY.md'),
    updates: () => checkForUpdates(),
    whatsnew: () => whatsNew(),
    favpane: () => toggleFavPane(),
    speak: toggleSpeak,
    copy: () => document.execCommand('copy'),
    // Print is turned off on screens without a printable page; the keyboard shortcuts quietly do nothing there.
    print: () => { if (printable()) window.e2k.printPreview(); },
    printNow: () => { if (printable()) window.e2k.win('print'); },
    find: () => { $('#q').focus(); $('#q').select(); },
    bigger: () => setFontScale(store.get('fontScale', 1) + 0.1),
    smaller: () => setFontScale(store.get('fontScale', 1) - 0.1),
    normal: () => setFontScale(1),
    mute: () => toggleMute(),
    world: () => orb('world').run(),
    games: () => go('games'),
    activities: () => orb('activities').run(),
    about,
    options: () => E2KOptions.open(E2K),
    themes: () => E2KOptions.open(E2K, 'Appearance'),
    exit: () => window.e2k.win('close'),
  };
  // Articles and the other reading pages can be printed; the home screen and games can't.
  const printable = () => !!view.querySelector('.page');
  const runCmd = (c) => { syncMenu(); return typeof c === 'function' ? c() : COMMANDS[c] && COMMANDS[c](); };
  $('#feedback-link').addEventListener('click', (e) => { e.preventDefault(); feedback(); });
  const supportLink = $('#support');
  supportLink.addEventListener('click', (e) => { e.preventDefault(); donate(); });
  supportLink.addEventListener('mouseover', () => setStatus('Donate to Wikipedia, or tip the developer'));
  supportLink.addEventListener('mouseout', () => setStatus(statusIdle));

  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tbtn');
    if (b && !b.disabled) runCmd(b.dataset.cmd);
  });

  // ---------- menus ----------
  function menus() {
    const f = favs();
    return [
      ['File', [['Home', 'home', 'Ctrl+H'], ['Random Article', 'random'], '-', ['Print Preview…', 'print', 'Ctrl+P', null, !printable()], ['Print…', 'printNow', 'Ctrl+Shift+P', null, !printable()], '-', ['Exit', 'exit', 'Alt+F4']]],
      ['Edit', [['Copy', 'copy', 'Ctrl+C'], ['Find an Article', 'find', 'Ctrl+F']]],
      ['View', [['Larger Text', 'bigger', 'Ctrl+='], ['Smaller Text', 'smaller', 'Ctrl+-'], ['Normal Text Size', 'normal', 'Ctrl+0'], '-',
        ['Refresh', 'reload', 'F5'], '-', ['Mute', 'mute', 'Ctrl+M', E2KAudio.isMuted()]]],
      ['Go', [['Back', 'back', 'Alt+Left', null, nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, nav.idx >= nav.stack.length - 1], ['Home', 'home'], '-',
        ['Today’s Featured Article', 'featured'], ['On This Day', 'onthisday'], ['Picture of the Day', 'gallery'], ['Random Article', 'random']]],
      ['Favorites', [['Favorites Pane', 'favpane', 'Ctrl+I', !fpane.hidden], [isFav() ? 'Remove from Favorites' : 'Add to Favorites', 'fav', '', null, !current], '-',
        ...(f.length ? f.map((x) => [x.title, () => openArticle(x.title)]) : [['(No favorites yet)', null, '', null, true]])]],
      ['Features', [['Articles', 'explore'], ['World Explorer', 'world'], ['Media', 'gallery'], ['Timeline', 'onthisday'], ['Games', 'games'], ['Activities', 'activities']]],
      ['Tools', [['Themes…', 'themes'], '-', ['Options…', 'options', 'Ctrl+,']]],
      ['Help', [['What’s New', 'whatsnew'], ['Send Feedback…', 'feedback'], ['Check for Updates…', 'updates'], ['Donate…', 'donate'], '-', ['Privacy Policy', 'privacy'], ['About Encyclopedia 2000', 'about']]],
    ];
  }
  const menubar = $('#menubar');
  let openMenu = null;
  function closeMenus() {
    $$('.menu', menubar).forEach((m) => m.remove());
    $$('.m.open', menubar).forEach((m) => m.classList.remove('open'));
    openMenu = null;
  }
  function showMenu(top, index) {
    closeMenus();
    openMenu = index;
    top.classList.add('open');
    const [, items] = menus()[index];
    const box = h('div', { class: 'menu' });
    items.forEach((it) => {
      if (it === '-') return box.append(h('div', { class: 'msep' }));
      const [label, cmd, key, checked, disabled] = it;
      box.append(h('div', {
        class: 'mi' + (checked ? ' checked' : '') + (disabled ? ' disabled' : ''),
        onmousedown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); if (disabled || !cmd) return; closeMenus(); runCmd(cmd); },
      }, h('span', {}, label), h('span', { class: 'k' }, key || '')));
    });
    top.append(box);
  }
  menus().forEach(([label], i) => {
    const top = h('div', { class: 'm' }, label);
    top.addEventListener('mousedown', (e) => { e.stopPropagation(); openMenu === i ? closeMenus() : showMenu(top, i); });
    top.addEventListener('mouseenter', () => { if (openMenu !== null && openMenu !== i) showMenu(top, i); });
    menubar.append(top);
  });
  document.addEventListener('mousedown', () => closeMenus());

  // ---------- search box ----------
  const q = $('#q');
  const sug = $('#suggest');
  let sugItems = [];
  let sugSel = -1;
  let sugTimer = 0;
  let sugToken = 0;

  function hideSuggest() { sug.hidden = true; sugItems = []; sugSel = -1; }
  function showSuggest(items, emptyMsg) {
    sugItems = items;
    sugSel = -1;
    sug.replaceChildren(...(items.length ? items.map((it, i) => h('div', {
      class: 'si',
      onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); pick(i); },
      onmouseenter: () => highlight(i),
    }, h('i', { class: 'th', style: bg(it.thumb) }), h('div', {}, h('b', {}, it.title), it.desc ? h('span', {}, it.desc) : null))) : [h('div', { class: 'empty' }, emptyMsg || 'No suggestions')]));
    sug.hidden = false;
  }
  function highlight(i) {
    sugSel = i;
    [...sug.children].forEach((c, j) => c.classList.toggle('sel', j === i));
  }
  function pick(i) {
    const it = sugItems[i];
    if (!it) return;
    q.value = it.title;
    hideSuggest();
    q.blur();
    openArticle(it.title);
  }
  // Enter and the Search button show the results page. Enter opens a suggestion only if one was picked with the arrow keys.
  function submit({ fromButton = false } = {}) {
    if (!fromButton && sugSel >= 0) return pick(sugSel);
    const v = q.value.trim();
    if (!v) return q.focus();
    hideSuggest();
    q.blur();
    go(route('search', v));
  }
  q.addEventListener('input', () => {
    clearTimeout(sugTimer);
    const v = q.value.trim();
    if (!v) return hideSuggest();
    sugTimer = setTimeout(async () => {
      const t = ++sugToken;
      try {
        const r = await Wiki.searchTitles(v);
        if (t !== sugToken || document.activeElement !== q) return;
        showSuggest((r.pages || []).map((p) => ({ title: p.title, desc: p.description, thumb: https(p.thumbnail?.url) })), 'No matching articles');
      } catch {}
    }, 180);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); highlight((sugSel + 1) % sugItems.length); }
    else if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); highlight((sugSel - 1 + sugItems.length) % sugItems.length); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') hideSuggest();
  });
  q.addEventListener('blur', () => setTimeout(hideSuggest, 120));
  $('#go').addEventListener('click', () => submit({ fromButton: true }));
  $('#qdd').addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sug.hidden) return hideSuggest();
    q.focus();
    showSuggest(store.get('recent', []).map((t) => ({ title: t, desc: 'Recently viewed' })), 'No recently viewed articles');
  });

  // ---------- volume ----------
  const volBtn = $('#volbtn');
  const volPop = $('#volpop');
  const volRange = $('#volrange');
  const volMute = $('#volmute');
  function updateVolume() {
    syncMenu();
    const pct = Math.round(E2KAudio.getVolume() * 100);
    const muted = E2KAudio.isMuted();
    const ic = muted ? 'mute' : pct < 50 ? 'vol-low' : 'vol';
    [volBtn, volMute].forEach((b) => b.querySelector('use').setAttribute('href', '#i-' + ic));
    volRange.value = pct;
    volRange.style.setProperty('--p', pct + '%');
    $('#volpct').textContent = muted ? 'Muted' : pct + '%';
    volBtn.title = muted ? 'Volume: muted' : `Volume: ${pct}%`;
    volMute.title = muted ? 'Unmute' : `Mute (${keyText('Ctrl+M')})`;
    volBtn.classList.toggle('on', !volPop.hidden);
    volPop.classList.toggle('muted', muted);
  }
  function toggleMute() {
    if (E2KAudio.isMuted()) {
      if (E2KAudio.getVolume() === 0) E2KAudio.setVolume(0.5);
      E2KAudio.setMuted(false);
    } else {
      E2KAudio.setMuted(true);
      speechStop();
    }
    updateVolume();
    setIdle(E2KAudio.isMuted() ? 'Sound muted' : `Volume ${Math.round(E2KAudio.getVolume() * 100)}%`);
  }
  function closeVolume() { volPop.hidden = true; updateVolume(); }
  volBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); closeMenus(); volPop.hidden = !volPop.hidden; updateVolume(); });
  volPop.addEventListener('mousedown', (e) => e.stopPropagation());
  document.addEventListener('mousedown', () => { if (!volPop.hidden) closeVolume(); });
  volRange.addEventListener('input', () => {
    E2KAudio.setVolume(volRange.value / 100);
    if (Number(volRange.value) === 0) speechStop();
    updateVolume();
  });
  volRange.addEventListener('change', () => { try { E2KAudio.click(); } catch {} });
  volMute.addEventListener('click', toggleMute);
  volBtn.addEventListener('wheel', (e) => {
    e.preventDefault();
    E2KAudio.setVolume(Math.round((E2KAudio.getVolume() + (e.deltaY < 0 ? 0.05 : -0.05)) * 20) / 20);
    updateVolume();
    setIdle(E2KAudio.isMuted() ? 'Sound muted' : `Volume ${Math.round(E2KAudio.getVolume() * 100)}%`);
  }, { passive: false });
  updateVolume();

  // ---------- window controls ----------
  $$('[data-win]').forEach((b) => b.addEventListener('click', () => window.e2k.win(b.dataset.win)));
  window.e2k.onMaximized((max) => {
    const b = $('#maxbtn');
    b.replaceChildren(winIcon(max ? 'restore' : 'max'));
    b.title = max ? 'Restore Down' : 'Maximize';
  });
  window.e2k.onFullscreen((on) => document.documentElement.classList.toggle('fullscreen', on));
  // Tooltips name shortcuts the Windows way; show the macOS ones there instead.
  if (MAC) $$('[title]').forEach((el) => { el.title = el.title.replace(/\(((?:Ctrl|Alt)\+[^)]+)\)$/, (_, k) => `(${keyText(k)})`); });
  $('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('.wc')) window.e2k.win('max'); });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Escape') { closeMenus(); hideSuggest(); closeOverlays(); closeVolume(); if (!fpane.hidden) toggleFavPane(false); return; }
    if (MAC) return; // macOS shortcuts come from the menu bar.
    if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); fwd(); }
    else if (k === 'F5') { e.preventDefault(); reload(); }
    else if (e.ctrlKey && e.shiftKey && k.toLowerCase() === 'p') { e.preventDefault(); runCmd('printNow'); }
    else if (e.ctrlKey && !e.shiftKey) {
      const map = { i: 'favpane', p: 'print', f: 'find', h: 'home', m: 'mute', ',': 'options', '=': 'bigger', '+': 'bigger', '-': 'smaller', '0': 'normal' };
      const c = map[k.toLowerCase()];
      if (c) { e.preventDefault(); runCmd(c); }
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 3) back();
    if (e.button === 4) fwd();
  });

  // ---------- API for games ----------
  const E2K = window.E2K = {
    h, svg, icon, store, route, go, maxCanvas: MAX_CANVAS,
    openArticle: (t) => openArticle(t, linkFrom()),
    setCrumbs,
    setIdle, setStatus, setFontScale, applyPrefs, updateVolume, speechStop,
    dialog: (...args) => dialog(...args),
    soundOn: () => soundOn(),
    sfx: (kind) => { if (soundOn()) { try { E2KAudio.sfx(kind); } catch {} } },
  };

  // ---------- start ----------
  // Where to start: a route from the command line (for testing), otherwise the "Start on" option.
  const startOn = store.get('startOn', 'home');
  const last = store.get('lastArticle', '');
  if (location.hash.length > 1) go(location.hash.slice(1));
  else if (startOn === 'last' && last) go(route('article', last));
  else if (startOn === 'random') go('random');
  else if (startOn === 'featured') { go('home'); runCmd('featured'); }
  else go('home');
  maybeWhatsNew();
})();
