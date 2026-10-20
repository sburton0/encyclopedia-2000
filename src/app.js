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
      { label: 'Encyclopedia 2000', items: [item(['About Encyclopedia 2000', 'about']), '-', item(['Options…', 'options', 'Ctrl+,']), item(['Offline Library…', 'library']), item(['Themes…', 'themes']), '-',
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
    // So does switching between 12-hour and 24-hour time, so every clock on the screen updates at once, and switching
    // between metric and imperial units.
    const clock = E2KTime.is24() + E2KUnits.system();
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
        case 'gallery': await viewGallery(arg, token); break;
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
  function shell({ title = '', desc = '', railTitle = '', wide = false, tools = [], article = false }) {
    const railArt = svg('svg', { viewBox: '0 0 230 600', preserveAspectRatio: 'xMidYMax slice' });
    E2KThemes.railArt(railArt);

    const bandArt = svg('svg', { viewBox: '0 0 800 96', preserveAspectRatio: 'xMaxYMid slice' });
    bandArt.append(svg('rect', { width: 800, height: 96, fill: 'url(#b0)' }));
    E2KThemes.bandArt(bandArt, 720, 64, 0.3);

    const railIn = h('div', { class: 'in' }, railTitle ? h('h4', {}, railTitle) : null);
    const h1 = h('h1', {}, title);
    const dsc = h('div', { class: 'desc' }, desc);
    const toolsEl = h('div', { class: 'tools' }, tools);
    const titleRow = h('div', { class: 'trow' }, h1);
    const tEl = h('div', { class: 't' }, titleRow, dsc);
    const band = h('header', { class: 'band' + (article ? ' article' : '') }, bandArt, tEl, toolsEl);
    // An article's title is centered in the space between the bottom of its buttons and the bottom of the header.
    if (article) new ResizeObserver(() => band.style.setProperty('--tools-bottom', (toolsEl.offsetTop + toolsEl.offsetHeight) + 'px')).observe(toolsEl);
    const text = h('div', { class: 'text' });
    const media = h('aside', { class: 'media' });
    // In an article the picture column floats at the top right, so the text widens to the full width below it.
    const flow = article ? h('div', { class: 'flow' }, media, text) : null;
    const content = article
      ? h('div', { class: 'content article' }, flow)
      : h('div', { class: 'content' + (wide ? ' wide' : '') }, text, wide ? null : media);
    // The article's title and buttons line up with the edges of its text.
    if (article) {
      const align = new ResizeObserver(() => {
        const f = flow.getBoundingClientRect(), b = band.getBoundingClientRect();
        band.style.setProperty('--flow-left', (f.left - b.left) + 'px');
        band.style.setProperty('--flow-right', (b.right - f.right) + 'px');
      });
      align.observe(flow);
      align.observe(content);
    }
    const root = h('div', { class: 'page' },
      h('aside', { class: 'rail' }, railArt, railIn),
      h('section', { class: 'art' },
        band,
        content));
    return {
      root, railIn, text, media, content, toolsEl, titleRow,
      setTitle(t, d) { h1.textContent = t; h1.title = t; dsc.textContent = d || ''; band.classList.toggle('no-desc', !d); },
    };
  }
  const bandBtn = (label, onclick, ic) => h('button', { class: 'bbtn', onclick }, ic ? icon(ic) : null, label);
  const railLink = (label, onclick, cls = '') => h('button', { class: 'lnk ' + cls, onclick }, label);
  const loading = (msg) => h('div', { class: 'loading' }, msg);
  // A rail section that folds from its heading, showing a short summary while it's closed. Whether each section
  // is open is remembered across articles.
  function railSection(title, summary, kids) {
    const isShut = () => store.get('railShut', []).includes(title);
    const head = h('h4', { class: 'fold', role: 'button', tabindex: 0 }, title, h('span', { class: 'n' }, summary));
    const body = h('div', { class: 'rbody' }, kids);
    const show = (shut) => { body.hidden = shut; head.classList.toggle('shut', shut); head.setAttribute('aria-expanded', String(!shut)); };
    const toggle = () => {
      const shut = !body.hidden;
      show(shut);
      store.set('railShut', [...store.get('railShut', []).filter((t) => t !== title), ...(shut ? [title] : [])]);
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    show(isShut());
    return h('section', { class: 'rsec' }, head, body);
  }

  // ---------- article ----------
  const DROP_SECTIONS = /^(references|notes|citations|sources|bibliography|further reading|external links|footnotes|works cited|notes and references|references and notes|explanatory notes)$/i;
  const SKIP_NS = /^(File|Image|Special|Help|Wikipedia|Template|Template talk|Category|Portal|Talk|User|User talk|Draft|Module|MediaWiki|Book|TimedText):/i;

  function cleanArticle(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    // A recording of the subject's name, from the introduction or a footnote it points to (many articles keep the
    // pronunciation there). An English recording is preferred; otherwise the first one, which is often the name said
    // in its own language (German for Einstein, Japanese for Tokyo).
    const firstH2 = body.querySelector('h2');
    const inLead = (el) => !firstH2 || !(el.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_PRECEDING);
    const leadNotes = new Set([...body.querySelectorAll('sup.reference a[href*="#cite_note-"]')].filter(inLead)
      .map((a) => a.getAttribute('href').split('#')[1]));
    const recordings = [];
    for (const ph of body.querySelectorAll('.ext-phonos')) {
      if (!inLead(ph) && !leadNotes.has(ph.closest('li[id^="cite_note-"]')?.id)) continue;
      let o = null;
      try { o = JSON.parse(ph.querySelector('[data-ooui]')?.getAttribute('data-ooui') || 'null'); } catch {}
      if (o?.href) recordings.push({ src: https(o.href), file: o.data?.file || '' });
    }
    const pron = recordings.find((r) => recordingLanguage(r.file) === 'English') || recordings[0] || null;
    // Videos become a still picture with a play button, and sounds a small player (mediaSlots brings both to life).
    // "Listen" boxes keep their headings and descriptions.
    const fileOf = (el) => { const r = (el.getAttribute('resource') || '').replace(/^\.\//, ''); try { return decodeURIComponent(r); } catch { return r; } };
    const slot = (tag, cls, data) => { const s = doc.createElement(tag); s.className = cls; Object.assign(s.dataset, data); return s; };
    body.querySelectorAll('video').forEach((v) => v.replaceWith(slot('span', 'vslot', {
      file: fileOf(v), dur: v.getAttribute('data-durationhint') || '', poster: https(v.getAttribute('poster') || ''),
      src: videoSource([...v.querySelectorAll('source')].map((s) => ({ url: s.getAttribute('src') || '', mime: s.getAttribute('type') || '', height: s.getAttribute('data-height') }))),
    })));
    const audioSlot = (au, label) => slot('div', 'aslot', {
      file: fileOf(au), dur: au.getAttribute('data-durationhint') || '', label,
      src: JSON.stringify([...au.querySelectorAll('source')].map((s) => [s.getAttribute('src') || '', s.getAttribute('type') || ''])),
    });
    // The little speaker picture beside each "Listen" box is decoration, not one of the article's pictures.
    const decor = new Set();
    body.querySelectorAll('.listen img[resource]').forEach((img) => decor.add(fileOf(img)));
    body.querySelectorAll('.listen').forEach((box) => {
      const out = doc.createElement('div');
      out.className = 'sounds';
      const head = box.querySelector('.listen-header');
      if (head) { const h6 = doc.createElement('h6'); h6.append(...head.childNodes); out.append(h6); }
      for (const ha of box.querySelectorAll('.haudio')) {
        const au = ha.querySelector('audio');
        if (!au) continue;
        out.append(audioSlot(au, ha.querySelector('.listen-file-header')?.textContent.trim() || ''));
        const d = ha.querySelector('.description');
        if (d?.textContent.trim()) { const p = doc.createElement('div'); p.className = 'adesc'; p.append(...d.childNodes); out.append(p); }
      }
      if (out.querySelector('.aslot')) box.replaceWith(out);
    });
    body.querySelectorAll('audio').forEach((au) => (au.closest('span[typeof^="mw:File"]') || au).replaceWith(audioSlot(au, '')));
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
      // Links to other wikis (Wiktionary, Wikiquote…) are marked as wiki links too, but have full web addresses.
      if ((href.startsWith('./') || rel.includes('mw:WikiLink')) && !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(href)) {
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
    return { nodes: [...body.childNodes], facts, toc, related, infoImg, pron, decor };
  }

  async function viewArticle(title, token) {
    const favBtn = bandBtn('Add to Favorites', () => toggleFav(), 'star');
    const speakBtn = bandBtn('Read Aloud', () => toggleSpeak(), 'read');
    const wikiBtn = bandBtn('View on Wikipedia', null, 'ext');
    const pg = shell({ title, tools: [speakBtn, favBtn, wikiBtn], article: true });
    pg.text.append(loading('Retrieving article…'));
    if (!mount(pg.root, token)) return;
    setStatus(`Retrieving “${title}”…`, true);

    // Ask for the summary and the article together; the article only waits on its own download.
    const htmlP = Wiki.html(title);
    htmlP.catch(() => {});
    const sum = await Wiki.summary(title);
    if (!live(token)) return;
    const name = sum.titles?.normalized || title;
    const canon = sum.titles?.canonical || name.replace(/ /g, '_');
    pg.setTitle(name, sum.description);
    setHere(name);
    wikiBtn.onclick = () => window.e2k.openExternal(Wiki.pageUrl(canon));

    const html = await htmlP;
    if (!live(token)) return;
    const { nodes, facts, toc, related, infoImg, pron, decor } = cleanArticle(html);
    if (pron) pg.titleRow.append(pronButton(name, pron));

    current = { title: name, desc: sum.description || '', thumb: sum.thumbnail?.source || '', favBtn, speakBtn };
    addRecent(name);
    store.set('lastArticle', name);

    const attrib = h('div', { class: 'attrib' },
      'This article uses material from the Wikipedia article ', h('a', { href: '#', 'data-ext': Wiki.pageUrl(canon) }, `“${name}”`),
      ', which is released under the Creative Commons Attribution-ShareAlike 4.0 License. Retrieved ', new Date().toLocaleDateString('en-US'), '.');
    pg.text.replaceChildren(...nodes, attrib);
    Wiki.sharpen(pg.text);
    // Sounds often have no caption of their own, so borrow the title the article's "Listen" box gives them.
    const soundNames = [...pg.text.querySelectorAll('.aslot')].map((s) => [s.dataset.file, s.dataset.label]).filter(([, l]) => l);
    const mediaP = articleMedia(canon).then((items) => {
      for (const m of items) if (!m.caption) m.caption = soundNames.find(([f]) => sameFile(f, m.file))?.[1] || '';
      const kept = items.filter((m) => ![...decor].some((f) => sameFile(f, m.file)));
      kept.spoken = items.spoken;
      return kept;
    });
    mediaP.catch(() => {});
    current.media = mediaP;
    mediaP.then((items) => { if (current?.media === mediaP) current.spoken = items.spoken || []; }, () => {});
    current.content = pg.content;
    mediaSlots(pg.text, mediaP);

    // contents rail
    const tocLinks = [railLink('Introduction', () => pg.content.scrollTo({ top: 0, behavior: 'smooth' }), 'on')];
    toc.forEach(({ id, label }) => tocLinks.push(railLink(label, () => {
      const target = pg.text.querySelector('#' + CSS.escape(id));
      if (target) pg.content.scrollTo({ top: target.offsetTop - pg.content.offsetTop - 10, behavior: 'smooth' });
    })));
    const tocSec = railSection('In this article', `${tocLinks.length} sections`, tocLinks);
    pg.railIn.append(tocSec);
    if (related.length) {
      pg.railIn.append(railSection('Related articles', `${related.length} articles`, related.map((t) => railLink(t, () => openArticle(t, linkFrom()), 'sub'))));
    }
    mediaBox(mediaP, token).then((box) => { if (box && live(token)) tocSec.after(box); }, () => {});
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
      // Offline libraries often keep only a small copy of the lead picture (Essentials stores many logos at 100 px).
      // Rather than stretch it to fill the frame, show it at up to 1.5 times its real size, centered.
      const leadImg = h('img', { src: shown, alt: name, onclick: () => lightbox(large, name),
        onload: () => {
          leadImg.classList.remove('small'); leadImg.style.width = '';
          if (leadImg.naturalWidth * 1.5 < leadImg.clientWidth) { leadImg.classList.add('small'); leadImg.style.width = leadImg.naturalWidth * 1.5 + 'px'; }
        } });
      // A library picture with a sharp version on Wikipedia: show the library's copy now, then swap (and enlarge the sharp one).
      if (sum.thumbnail?.sharp) {
        const hi = sum.thumbnail.sharp, pre = new Image();
        pre.onload = () => { leadImg.src = hi; leadImg.onclick = () => lightbox(hi.replace(/width=\d+/, 'width=1280'), name); };
        pre.src = hi;
      }
      pg.media.append(h('div', { class: 'frame' }, leadImg),
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
        // Pictures open in the media viewer, with the rest of the article's media; the plain lightbox is the fallback.
        const fw = Number(img.getAttribute('data-file-width')) || 0;
        const plain = () => lightbox(sized(img.src, originalOf(img.src), fw, 1280), img.closest('figure')?.querySelector('figcaption')?.textContent || '');
        (current?.media || Promise.reject()).then((items) => {
          const i = items.findIndex((m) => sameFile(m.file, a.dataset.file));
          if (i >= 0) mediaViewer(items, i); else plain();
        }, plain);
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

  // ---------- gallery: Picture of the Day, Media of the Day (videos and sounds), and Featured Sounds ----------
  const GALLERY_TABS = [['picture', 'Picture', 'film'], ['video', 'Video', 'play'], ['sound', 'Sound', 'vol']];
  const weekDays = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; });
  const dayName = (d, i) => (i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  // Plain text from a bit of wikitext: links and {{w|…}} become their words; other templates and formatting go.
  const wikiText = (w) => decodeHtml(String(w || '')
    .replace(/\{\{w\|[^}|]*\|([^}]+)\}\}/g, '$1').replace(/\{\{w\|([^}]+)\}\}/g, '$1')
    .replace(/\[\[:?(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:\S+ ([^\]]+)\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/<[^>]+>/g, ''))
    .replace(/^(?:Category|File):/gm, '').replace(/\s+/g, ' ').trim();

  async function viewGallery(tab, token) {
    if (!GALLERY_TABS.some(([id]) => id === tab)) tab = 'picture';
    const tabs = h('div', { class: 'mtabs', role: 'tablist' }, GALLERY_TABS.map(([id, label, ic]) =>
      h('button', { class: id === tab ? 'on' : '', role: 'tab', 'aria-selected': String(id === tab),
        onclick: () => { if (id !== tab) go(id === 'picture' ? 'gallery' : route('gallery', id), { replace: true }); } }, icon(ic), label)));
    if (tab === 'video') return viewMotd(tabs, token);
    if (tab === 'sound') return viewSounds(tabs, token);

    const pg = shell({ title: 'Picture of the Day', desc: 'Featured images from Wikimedia Commons', railTitle: 'This week', wide: true, tools: [tabs] });
    const holder = h('div', { class: 'potd' }, loading('Loading pictures…'));
    const stripEl = h('div', { class: 'strip' });
    pg.text.append(holder, stripEl);
    if (!mount(pg.root, token)) return;
    setStatus('Loading pictures…', true);
    // Each day appears as soon as it arrives, so one slow day doesn't hold up the rest. Today's picture shows first.
    const days = weekDays();
    const pics = days.map(() => null);
    const tiles = days.map((d, i) => h('button', { disabled: true, onclick: () => { picked = true; show(i); } }, h('i'), i === 0 ? 'Today' : longDate(d)));
    const railBtns = days.map((d, i) => railLink(dayName(d, i), () => { picked = true; show(i); }));
    railBtns.forEach((b) => { b.disabled = true; });
    stripEl.append(...tiles);
    pg.railIn.append(...railBtns);
    let shown = -1, picked = false;
    function show(i) {
      if (!pics[i]) return;
      shown = i;
      const { date, img } = pics[i];
      const full = sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 1280);
      const caption = strip(img.description?.text) || strip(img.title);
      holder.replaceChildren(
        h('figure', {}, h('img', { src: full, alt: caption, onclick: () => lightbox(full, caption) })),
        h('div', { class: 'desc' }, caption),
        h('div', { class: 'credit' },
          `${longDate(date)} · ${strip(img.artist?.text) || 'Unknown artist'} · ${img.license?.type || ''}`,
          img.file_page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(img.file_page), 'ext') : null));
      tiles.forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      pg.content.scrollTo({ top: 0 });
    }
    await Promise.allSettled(days.map(async (d, i) => {
      const img = (await (i === 0 ? todayFeed() : Wiki.featured(d)).catch(() => null))?.image;
      if (!live(token)) return;
      if (!img) { tiles[i].remove(); railBtns[i].remove(); return; }
      pics[i] = { date: d, img };
      tiles[i].disabled = railBtns[i].disabled = false;
      tiles[i].firstChild.style.cssText = bg(img.thumbnail?.source);
      if (!picked && (shown < 0 || i < shown)) show(i);
    }));
    if (!live(token)) return;
    if (!pics.some(Boolean)) throw new Error('No pictures available');
    setIdle();
  }

  // A video or sound that plays right on the page, with the viewer's controls.
  function inlinePlayer(m) {
    const label = m.caption || fileName(m.file);
    const stage = h('div', { class: 'mstage ' + m.type });
    const el = h(m.type, { src: m.src, preload: 'none', poster: m.type === 'video' ? m.thumb : null });
    const parts = playerParts();
    const controls = h('div', { class: 'ctl' }, parts.pb, parts.cur, parts.bar, parts.tot, ...volControl());
    const toggle = wireMedia(el, { ...parts, duration: m.duration, onState: (on) => stage.classList.toggle('playing', on) });
    el.addEventListener('error', () => stage.append(h('div', { class: 'merr' }, 'This file can’t be played right now.')));
    const big = h('button', { class: 'big', title: 'Play', onclick: toggle }, icon('play'));
    if (m.type === 'video') { el.addEventListener('click', toggle); stage.append(el, big); }
    else stage.append(waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
    return h('div', { class: 'mviewer inline' }, stage, controls);
  }
  // A file from videoInfo as something inlinePlayer can play.
  function playable(file, ii, extra = {}) {
    const audio = /^audio\//.test(ii.mime) || (!ii.width && !ii.height);
    const derivs = (ii.derivatives || []).map((d) => ({ url: d.src, mime: d.type || '', height: d.height }));
    const src = audio ? noUtm((ii.derivatives || []).find((d) => /mpeg|ogg|opus/.test(d.type || ''))?.src || ii.url) : videoSource(derivs) || noUtm(ii.url);
    return { type: audio ? 'audio' : 'video', file, src, thumb: audio ? '' : noUtm(ii.thumburl), duration: ii.duration || 0,
      credit: creditOf(ii), page: ii.descriptionurl, ...extra };
  }
  const mediaTileBg = (m) => (m.type === 'video' ? bg(m.thumb) : '');

  // Media of the Day: a video (now and then a sound) picked by Wikimedia Commons for each day.
  async function viewMotd(tabs, token) {
    const pg = shell({ title: 'Media of the Day', desc: 'A video or sound chosen each day by Wikimedia Commons', railTitle: 'This week', wide: true, tools: [tabs] });
    pg.text.append(loading('Loading videos…'));
    if (!mount(pg.root, token)) return;
    setCrumbs(['Media of the Day']);
    setStatus('Loading videos…', true);
    const days = weekDays();
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pages = await Wiki.commonsPages(days.flatMap((d) => [`Template:Motd/${ymd(d)}`, `Template:Motd/${ymd(d)} (en)`]));
    const week = days.map((d) => ({
      date: d,
      file: /\|\s*1=([^|}]+)/.exec(pages[`Template:Motd/${ymd(d)}`] || '')?.[1]?.trim(),
      caption: wikiText(/\|\s*1=([\s\S]*?)\|\s*2=/.exec(pages[`Template:Motd/${ymd(d)} (en)`] || '')?.[1] || ''),
    })).filter((w) => w.file);
    if (!week.length) throw new Error('No media of the day available');
    const info = await Wiki.videoInfo(week.map((w) => 'File:' + w.file));
    if (!live(token)) return;
    const items = week.filter((w) => info['File:' + w.file]).map((w) => playable('File:' + w.file, info['File:' + w.file], { date: w.date, caption: w.caption }));
    if (!items.length) throw new Error('No media of the day available');
    const holder = h('div', { class: 'potd motd' });
    const tiles = items.map((m, i) => h('button', { onclick: () => show(i) },
      h('i', { class: m.type, style: mediaTileBg(m) }, h('b', {}, (m.type === 'video' ? '▶︎ ' : '♪︎ ') + clock(m.duration))),
      days.indexOf(m.date) === 0 ? 'Today' : longDate(m.date)));
    const railBtns = items.map((m, i) => railLink(dayName(m.date, days.indexOf(m.date)), () => show(i)));
    function show(i) {
      const m = items[i];
      holder.replaceChildren(inlinePlayer(m),
        m.caption ? h('div', { class: 'desc' }, m.caption) : null,
        h('div', { class: 'credit' }, [longDate(m.date), m.credit.replace(/ · From Wikimedia Commons$/, '')].filter(Boolean).join(' · '),
          m.page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(m.page), 'ext') : null));
      tiles.forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      updateVolume();
      pg.content.scrollTo({ top: 0 });
    }
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(holder, h('div', { class: 'strip' }, tiles));
    show(0);
    setIdle();
  }

  // Featured Sounds: recordings picked by Wikimedia Commons, in its collections. The large player shows a sound of
  // the day, chosen in turn from the whole list.
  const AUDIO_FILE = /\.(ogg|oga|opus|flac|wav|mp3|mid|midi)$/i;
  async function viewSounds(tabs, token) {
    const pg = shell({ title: 'Featured Sounds', desc: 'Music, speeches, and historic recordings chosen by Wikimedia Commons', railTitle: 'Collections', wide: true, tools: [tabs] });
    pg.text.append(loading('Loading sounds…'));
    if (!mount(pg.root, token)) return;
    setCrumbs(['Featured Sounds']);
    setStatus('Loading sounds…', true);
    const NAMES = ['Historical recordings', 'Music', 'Field recordings', 'Other'];
    const pages = await Wiki.commonsPages(NAMES.map((n) => `Commons:Featured sounds/${n}`));
    const collections = NAMES.map((name) => ({
      name,
      sounds: (pages[`Commons:Featured sounds/${name}`] || '').split('\n').map((l) => /^\s*(?:File|Image):([^|]+?)\s*(?:\|(.*))?$/.exec(l))
        .filter((m) => m && AUDIO_FILE.test(m[1])).map((m) => ({ file: 'File:' + m[1], label: (m[2] || '').trim() })),
    })).filter((c) => c.sounds.length);
    if (!collections.length) throw new Error('No featured sounds available');
    const all = collections.flatMap((c) => c.sounds);
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
    const today = all[dayOfYear % all.length];
    const hero = h('div', { class: 'potd sotd' });
    const listHead = h('h3', { class: 'mlist-h' });
    const list = h('div', { class: 'mlist' });
    const infoCache = {};
    const infoFor = async (files) => {
      const need = files.filter((f) => !(f in infoCache));
      for (let i = 0; i < need.length; i += 50) Object.assign(infoCache, await Wiki.videoInfo(need.slice(i, i + 50)));
      return infoCache;
    };
    const titleOf = (s) => s.label || fileName(s.file).replace(/^\d+,\d+\s+/, '');
    const descOf = (ii) => {
      const d = decodeHtml(strip(ii?.extmetadata?.ImageDescription?.value || '')).replace(/\s+/g, ' ').trim();
      return d.length > 320 ? d.slice(0, 317).replace(/\s+\S*$/, '') + '…' : d;
    };
    const railBtns = collections.map((c, i) => {
      const b = railLink(c.name, () => showCollection(i));
      b.append(h('span', { class: 'n' }, String(c.sounds.length)));
      return b;
    });
    async function showCollection(i) {
      const c = collections[i];
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      listHead.textContent = c.name;
      list.replaceChildren(loading('Loading sounds…'));
      const inf = await infoFor(c.sounds.map((s) => s.file));
      if (!live(token)) return;
      list.replaceChildren(...c.sounds.filter((s) => inf[s.file]).map((s) => {
        const p = playable(s.file, inf[s.file]);
        return soundPlayer({ file: s.file, dur: p.duration, label: titleOf(s), src: JSON.stringify([[p.src]]) });
      }));
      updateVolume();
    }
    const inf = await infoFor([today.file]);
    if (!live(token)) return;
    if (inf[today.file]) {
      const m = playable(today.file, inf[today.file], { caption: titleOf(today) });
      const desc = descOf(inf[today.file]);
      hero.append(h('div', { class: 'eyebrow' }, 'Sound of the day'), inlinePlayer(m),
        desc ? h('div', { class: 'desc' }, desc) : null,
        h('div', { class: 'credit' }, m.credit.replace(/ · From Wikimedia Commons$/, ''),
          m.page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(m.page), 'ext') : null));
    }
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(hero, listHead, list);
    await showCollection(Math.max(0, collections.findIndex((c) => c.sounds.includes(today))));
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
    version: '0.4',
    name: '0.4 Beta',
    items: [
      ['Videos and sounds', 'Watch videos and hear sounds right in articles, and browse every picture, video, and sound in the new Media box.'],
      ['Hear it spoken', 'Hear how a subject’s name is pronounced, and listen to recordings read by Wikipedia volunteers in Read Aloud.'],
      ['Media of the Day', 'Media now has Video and Sound tabs, with a video chosen each day and famous recordings to explore.'],
      ['Fixes and improvements', 'Articles fill the window with slightly larger text, pages load faster, and updating on Linux is easier.'],
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
    else if (s.state === 'available' && s.kind === 'deb') {
      // Ubuntu's App Center won't replace an app that's already installed, so updating takes one command in a terminal.
      const cmd = `sudo apt install ~/Downloads/${s.file || `Encyclopedia-2000-${s.version}-linux-amd64.deb`}`;
      const copy = h('button', { class: 'bbtn', onclick: () => { navigator.clipboard.writeText(cmd).catch(() => {}); copy.textContent = 'Copied'; } }, 'Copy');
      dialog(title, 'A new version is available', [
        `Version ${prettyVersion(s.version)} is ready to download. Download the new .deb file, then open a terminal and run:`,
        h('p', { class: 'cmd' }, h('code', {}, cmd), copy),
        'Your settings and favorites are kept. (The App Center can’t update an app that’s already installed.)'],
      [['Download', () => window.e2k.update.install(), true], ['Later']]);
    } else if (s.state === 'available') dialog(title, 'A new version is available', [
      `Version ${prettyVersion(s.version)} is ready to download. This portable copy can’t update itself, so download the new version and use it in place of this one. Your settings and favorites carry over if you keep its “Encyclopedia 2000 Data” folder next to it.`],
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

  // ---------- media: an article's pictures, videos, and sounds ----------
  // Everything comes from Wikimedia Commons. Videos and sounds load only when opened, and follow the app's volume.
  const clock = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
  };
  const noUtm = (u) => https(u || '').replace(/\?utm_[^#]*$/, '');
  const fileName = (file) => file.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
  const KIND = { image: 'Picture', video: 'Video', audio: 'Sound' };

  // The best WebM version up to 720p (Chromium no longer plays Ogg Theora video).
  function videoSource(sources) {
    const webm = sources.filter((s) => /webm/.test(s.mime)).map((s) => {
      const url = noUtm(s.url);
      return { url, px: Number(/\.(\d+)p\.[\w.]*webm$/.exec(url)?.[1] || s.height) || 0 };
    }).sort((a, b) => b.px - a.px);
    return (webm.find((s) => s.px <= 720) || webm[webm.length - 1])?.url || '';
  }
  function creditOf(ii) {
    const md = ii?.extmetadata || {};
    let artist = decodeHtml(strip(md.Artist?.value || '')).replace(/\s+/g, ' ').trim();
    if (artist.length > 90) artist = artist.slice(0, 88) + '…';
    return [artist, md.LicenseShortName?.value, 'From Wikimedia Commons'].filter(Boolean).join(' · ');
  }

  // The article's media in page order. Recordings that read the whole article aloud are left out (they belong
  // with Read Aloud), and so are the small icons Wikipedia keeps out of its own galleries.
  async function articleMedia(title) {
    const items = [], spoken = [];
    for (const it of (await Wiki.mediaList(title)).items || []) {
      const caption = (it.caption?.text || '').trim();
      if (it.type === 'audio' && it.audio_type === 'spoken') spoken.push({ file: it.title });
      if (it.type === 'image') {
        if (!it.showInGallery || !it.srcset?.length) continue;
        const src = it.srcset.map((s) => noUtm(s.src));
        items.push({ type: 'image', file: it.title, caption, thumb: src[0], large: src[src.length - 1] });
      } else if (it.type === 'video' || (it.type === 'audio' && it.audio_type !== 'spoken')) {
        items.push({ type: it.type, file: it.title, caption, sources: it.sources || [] });
      }
    }
    const av = items.filter((m) => m.type !== 'image');
    for (let i = 0; i < av.length; i += 50) {
      const batch = av.slice(i, i + 50);
      const info = await Wiki.fileInfo(batch.map((m) => m.file));
      for (const m of batch) {
        const ii = info[m.file];
        if (!ii) continue;
        m.duration = ii.duration || 0;
        m.credit = creditOf(ii);
        if (m.type === 'video') {
          m.thumb = noUtm(ii.thumburl);
          m.src = videoSource(m.sources);
        } else {
          const url = noUtm(ii.url);
          // MIDI files can't play directly, but Commons keeps an MP3 of each one.
          m.src = /midi/.test(ii.mime) ? url.replace(/\/commons\/(\w\/\w\w)\/([^/]+)$/, '/commons/transcoded/$1/$2/$2.mp3') : url;
        }
      }
    }
    const out = items.filter((m) => m.type === 'image' || m.src);
    out.spoken = await narrationOf(spoken).catch(() => []);
    return out;
  }

  // A volunteer's recording of the whole article (Spoken Wikipedia), in its parts: where to play each one, how long
  // it is, who read it, and when.
  async function narrationOf(parts) {
    if (!parts.length) return [];
    parts.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
    const info = await Wiki.fileInfo(parts.map((p) => p.file));
    const out = [];
    for (const p of parts) {
      const ii = info[p.file];
      if (!ii?.url) continue;
      const md = ii.extmetadata || {};
      const artist = decodeHtml(strip(md.Artist?.value || '')).replace(/\s+/g, ' ').trim();
      const reader = /Speaker:\s*(.+?)(?:\s+Authors of the article.*)?$/i.exec(artist)?.[1] || (artist.length < 40 && !/author/i.test(artist) ? artist : '');
      const ym = /(\d{4})-(\d{2})/.exec(strip(md.DateTimeOriginal?.value || '')) || /(\d{4})-(\d{2})/.exec(ii.timestamp || '');
      const when = ym ? new Date(+ym[1], +ym[2] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
      out.push({ file: p.file, src: noUtm(ii.url), duration: ii.duration || 0, reader, when });
    }
    return out;
  }

  // Bars that suggest a sound's waveform. They aren't its real shape, but each file gets its own.
  function waveform(seed, n = 14) {
    let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const w = h('span', { class: 'wave' });
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      w.append(h('i', { style: `height:${25 + ((x >>> 16) % 76)}%` }));
    }
    return w;
  }
  function mediaTile(m, onclick) {
    const label = m.caption || fileName(m.file);
    return h('button', { class: 'mt ' + m.type, style: m.type === 'audio' ? null : bg(m.thumb), title: label, onclick },
      m.type === 'audio' ? [waveform(m.file), h('span', { class: 'lbl' }, label)] : null,
      m.type === 'image' ? null : h('b', {}, (m.type === 'video' ? '▶︎ ' : '♪︎ ') + clock(m.duration)));
  }

  // The Media box in an article's rail: counts, nine tiles, and "See all".
  async function mediaBox(mediaP, token) {
    const items = await mediaP;
    if (!live(token)) return null;
    const of = (type) => items.filter((m) => m.type === type);
    const [pictures, videos, sounds] = [of('image'), of('video'), of('audio')];
    if (!videos.length && !sounds.length && pictures.length < 2) return null;
    // Up to two videos and two sounds go in fixed places among the pictures, so they're easy to spot.
    const featured = [videos[0], sounds[0], videos[1], sounds[1], videos[2], sounds[2], videos[3], sounds[3]].filter(Boolean).slice(0, 4);
    const mixed = [];
    for (let i = 0, p = 0, f = 0; i < 9; i++) {
      const m = ([0, 1, 6, 8].includes(i) && featured[f] ? featured[f++] : pictures[p++] || featured[f++]);
      if (m) mixed.push(m);
    }
    // The counts double as filters when there's more than one kind: click one to show only that kind, again for all.
    const kinds = [['image', pictures, 'picture', 'pictures'], ['video', videos, 'video', 'videos'], ['audio', sounds, 'sound', 'sounds']]
      .filter(([, list]) => list.length);
    const grid = h('div', { class: 'mbox' });
    const all = railLink('', null, 'sub mall');
    let only = null;
    const counts = kinds.map(([type, list, one, many]) => {
      const label = [h('b', {}, list.length), ' ' + (list.length === 1 ? one : many)];
      if (kinds.length < 2) return h('span', {}, label);
      return h('button', { title: `Show only ${many}`, onclick: () => show(only === type ? null : type) }, label);
    });
    function show(type) {
      only = type;
      counts.forEach((c, i) => {
        c.classList.toggle('on', kinds[i][0] === type);
        if (c.tagName === 'BUTTON') c.title = kinds[i][0] === type ? 'Show everything' : `Show only ${kinds[i][3]}`;
      });
      const list = type ? items.filter((m) => m.type === type) : items;
      const [, , one, many] = kinds.find(([t]) => t === type) || [, , 'item', 'items'];
      grid.replaceChildren(...(type ? list.slice(0, 9) : mixed).map((m) => mediaTile(m, () => mediaViewer(list, list.indexOf(m), true))));
      all.textContent = `See all ${list.length} ${type ? (list.length === 1 ? one : many) : ''} ›`.replace('  ', ' ');
      all.onclick = () => mediaViewer(list, 0);
    }
    show(null);
    return railSection('Media', `${items.length} items`, [h('div', { class: 'mcount' }, counts), grid, all]);
  }

  // Connects a video or sound to a play button, progress bar, and times. Only one thing plays at a time, and
  // playing stops Read Aloud. Returns a function that plays or pauses it.
  function wireMedia(el, { pb, bar, fill, cur, tot, duration = 0, onState }) {
    el.volume = E2KAudio.level();
    const len = () => (isFinite(el.duration) && el.duration) || duration;
    const tick = () => { cur.textContent = clock(el.currentTime); fill.style.width = len() ? (100 * el.currentTime / len()) + '%' : '0'; };
    const state = () => {
      const playing = !el.paused && !el.ended;
      pb.querySelector('use').setAttribute('href', '#i-' + (playing ? 'pause' : 'play'));
      pb.title = playing ? 'Pause' : 'Play';
      onState?.(playing);
    };
    const toggle = () => { if (el.paused || el.ended) el.play().catch(() => {}); else el.pause(); };
    const seek = (e) => {
      const r = bar.getBoundingClientRect();
      if (len()) el.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * len();
    };
    pb.addEventListener('click', toggle);
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seek(e); });
    bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) seek(e); });
    el.addEventListener('timeupdate', tick);
    el.addEventListener('loadedmetadata', () => { if (len()) tot.textContent = clock(len()); });
    el.addEventListener('play', () => { speechStop(); $$('video, audio').forEach((o) => { if (o !== el) o.pause(); }); state(); });
    el.addEventListener('pause', state);
    el.addEventListener('ended', state);
    tot.textContent = clock(duration);
    tick();
    state();
    return toggle;
  }
  // The volume control for media players: a mute button and a slider, kept in step with the toolbar's volume.
  function volControl() {
    const range = h('input', { type: 'range', class: 'vr', min: 0, max: 100, title: 'Volume' });
    range.addEventListener('input', () => { E2KAudio.setVolume(range.value / 100); updateVolume(); });
    range.addEventListener('keydown', (e) => e.stopPropagation());
    return [h('button', { class: 'vb', onclick: () => toggleMute() }, icon('vol')), range];
  }
  const playerParts = () => {
    const fill = h('i');
    return { pb: h('button', { class: 'pb' }, icon('play')), fill, bar: h('div', { class: 'bar' }, fill), cur: h('span', {}, '0:00'), tot: h('span', {}, '0:00') };
  };

  // A small sound player for the article text: play, title, progress, and times.
  function soundPlayer({ file = '', dur = 0, label = '', src = '[]' }) {
    const au = h('audio', { preload: 'none' });
    try { for (const [u, type] of JSON.parse(src)) au.append(h('source', { src: noUtm(u), type })); } catch {}
    const name = label || fileName(file);
    const parts = playerParts();
    const box = h('div', { class: 'aud' }, parts.pb,
      h('div', { class: 'info' }, h('b', { title: name }, name), parts.bar, h('div', { class: 'tm' }, parts.cur, parts.tot)), au);
    wireMedia(au, { ...parts, duration: Number(dur) || 0, onState: (on) => box.classList.toggle('playing', on) });
    au.addEventListener('error', () => { box.classList.add('err'); parts.pb.title = 'This sound can’t be played right now.'; }, true);
    return box;
  }

  // The 🔊 button by an article's title: plays a recording of how the subject's name is said.
  // The language of a pronunciation recording, from its file name: "De-Albert Einstein.oga" (German),
  // "LL-Q1860 (eng)-Speaker-Word.wav" (Lingua Libre; English), or "Paris Pronunciation in French.ogg". '' if unknown.
  function recordingLanguage(file) {
    const f = String(file || '').replace(/_/g, ' ');
    const named = /(?:^|\s)in ([A-Z][a-z]+)\b/.exec(f)?.[1];
    if (named) return named;
    const code = (/^LL-Q\d+ \(([a-z]{2,3})\)/i.exec(f) || /^([a-z]{2,3})(?:-[a-z]{2})?-/i.exec(f))?.[1]?.toLowerCase();
    if (!code) return '';
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code === 'eng' ? 'en' : code); } catch { return ''; }
  }
  function pronButton(name, { src, file }) {
    const lang = recordingLanguage(file);
    const au = h('audio', { preload: 'none', src });
    const btn = h('button', { class: 'pron', title: lang && lang !== 'English' ? `Hear “${name}” said in ${lang}` : `Hear how “${name}” is pronounced`, onclick: () => {
      au.volume = E2KAudio.level();
      if (E2KAudio.isMuted()) setIdle('Sound is muted. Turn up the volume to hear the pronunciation.');
      au.currentTime = 0;
      au.play().catch(() => setIdle('The pronunciation can’t be played right now.'));
    } }, icon('vol'), au);
    au.addEventListener('play', () => { speechStop(); $$('video, audio').forEach((o) => { if (o !== au) o.pause(); }); btn.classList.add('on'); });
    au.addEventListener('pause', () => btn.classList.remove('on'));
    au.addEventListener('ended', () => btn.classList.remove('on'));
    return btn;
  }

  // Brings the article's video and sound placeholders (made in cleanArticle) to life. Videos open in the viewer.
  const sameFile = (a, b) => a.replace(/^(File|Image):/i, '').replace(/_/g, ' ') === b.replace(/^(File|Image):/i, '').replace(/_/g, ' ');
  function mediaSlots(root, mediaP) {
    root.querySelectorAll('.vslot').forEach((s) => {
      const { file, dur, poster, src } = s.dataset;
      const caption = s.closest('figure')?.querySelector('figcaption')?.textContent.trim() || '';
      const open = async () => {
        const items = await mediaP.catch(() => []);
        const i = items.findIndex((m) => sameFile(m.file, file));
        if (i >= 0) mediaViewer(items, i, true);
        else if (src) mediaViewer([{ type: 'video', file, caption, thumb: poster, src, duration: Number(dur) || 0 }], 0, true);
      };
      s.replaceWith(h('button', { class: 'vthumb', title: 'Play video', onclick: open },
        poster ? h('img', { src: poster, alt: caption, loading: 'lazy' }) : null,
        h('span', { class: 'play' }, icon('play')),
        Number(dur) ? h('span', { class: 'dur' }, clock(dur)) : null));
    });
    root.querySelectorAll('.aslot').forEach((s) => s.replaceWith(soundPlayer(s.dataset)));
  }

  // The viewer: one picture, video, or sound at a time, with a strip of the article's other media.
  function mediaViewer(items, start, autoplay = false) {
    closeOverlays();
    let at = -1, toggle = null;
    const kind = h('span', { class: 'vt' });
    const pos = h('span', { class: 'pos' });
    const stage = h('div', { class: 'mstage' });
    const controls = h('div', { class: 'ctl' });
    const credit = h('div', { class: 'credit' });
    const strip = h('div', { class: 'mstrip' }, items.map((m, i) => mediaTile(m, () => show(i, true))));
    const prev = h('button', { class: 'nav prev', title: 'Previous', onclick: () => show(at - 1) }, '‹');
    const next = h('button', { class: 'nav next', title: 'Next', onclick: () => show(at + 1) }, '›');
    const ov = h('div', { class: 'overlay mview', onmousedown: (e) => { if (e.target === ov) ov.remove(); } },
      h('div', { class: 'mviewer', role: 'dialog' },
        h('div', { class: 'dt' }, kind, pos, h('button', { class: 'x', title: 'Close', onclick: () => ov.remove() }, '✕')),
        h('div', { class: 'stagewrap' }, stage, prev, next), controls, credit, strip));

    function show(i, play = false) {
      if (i < 0 || i >= items.length) return;
      at = i;
      const m = items[i];
      const label = m.caption || fileName(m.file);
      kind.textContent = `${KIND[m.type]} · ${label}`;
      kind.title = label;
      pos.textContent = `${i + 1} of ${items.length}`;
      prev.hidden = i === 0;
      next.hidden = i === items.length - 1;
      [...strip.children].forEach((t, j) => t.classList.toggle('on', j === i));
      strip.children[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      stage.className = 'mstage ' + m.type;
      stage.replaceChildren();
      controls.replaceChildren();
      toggle = null;
      if (m.type === 'image') {
        stage.append(h('img', { src: m.large, alt: label }));
      } else {
        const el = h(m.type, { src: m.src, preload: play ? 'auto' : 'none', poster: m.type === 'video' ? m.thumb : null });
        const parts = playerParts();
        controls.append(parts.pb, parts.cur, parts.bar, parts.tot, ...volControl());
        toggle = wireMedia(el, { ...parts, duration: m.duration, onState: (on) => stage.classList.toggle('playing', on) });
        el.addEventListener('error', () => stage.append(h('div', { class: 'merr' }, 'This file can’t be played right now.')));
        const big = h('button', { class: 'big', title: 'Play', onclick: toggle }, icon('play'));
        if (m.type === 'video') {
          el.addEventListener('click', toggle);
          stage.append(el, big);
        } else {
          stage.append(waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
        }
        if (play) el.play().catch(() => {});
      }
      controls.hidden = !toggle;
      updateVolume();
      credit.textContent = m.credit || '';
      if (m.credit === undefined) {
        m.credit = '';
        Wiki.fileInfo([m.file]).then((info) => { m.credit = creditOf(info[m.file]); if (items[at] === m) credit.textContent = m.credit; }, () => {});
      }
    }

    const onKey = (e) => {
      if (!ov.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
      else if (e.key === ' ' && toggle && !e.target.closest('button')) { e.preventDefault(); toggle(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.append(ov);
    show(start, autoplay);
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

  // Read Aloud: when the article has a volunteer's recorded narration, ask which to use; otherwise use the computer voice.
  function toggleSpeak() {
    if (speaking) return speechStop();
    if (current?.spoken?.length) return readAloudMenu();
    speakComputer();
  }
  function readAloudMenu() {
    if ($('.rmenu')) { $('.rmenu').remove(); return; }
    const parts = current.spoken;
    const length = parts.reduce((a, p) => a + p.duration, 0);
    const hrs = Math.floor(length / 3600), mins = Math.round((length % 3600) / 60);
    const long = hrs ? `${hrs} hr ${mins} min` : `${Math.max(1, mins)} min`;
    const when = parts[0].when ? ` in ${parts[0].when}` : '';
    const item = (ic, title, sub, fn) => h('button', { class: 'ri', onclick: () => { menu.remove(); fn(); } },
      h('span', { class: 'rio' }, icon(ic)), h('span', {}, h('b', {}, title), h('span', { class: 's' }, sub)));
    const menu = h('div', { class: 'rmenu', role: 'menu' },
      item('read', 'Computer voice', 'Reads the article as it is today, using your computer’s voice.', speakComputer),
      item('mic', 'Recorded narration', `Read by a Wikipedia volunteer${when} · ${long}. The article may have changed since.`, () => playNarration(parts)));
    const anchor = current.speakBtn;
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 310)) + 'px';
    document.body.append(menu);
    const away = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', away, true); } };
    document.addEventListener('mousedown', away, true);
    menu.querySelector('.ri').focus();
  }

  // The narration plays in a bar at the top of the article, across all of its parts as if they were one recording.
  let narration = null;
  function playNarration(parts) {
    speechStop();
    if (!current?.content?.isConnected) return;
    if (E2KAudio.isMuted()) setIdle('Sound is muted. Turn up the volume to hear the narration.');
    const total = parts.reduce((a, p) => a + p.duration, 0);
    const offset = (i) => parts.slice(0, i).reduce((a, p) => a + p.duration, 0);
    const au = h('audio', { preload: 'auto' });
    let at = 0;
    const { pb, bar, fill, cur, tot } = playerParts();
    const partLbl = h('span');
    const reader = [parts[0].reader, parts[0].when].filter(Boolean).join(' · ') || 'Read by a Wikipedia volunteer';
    const el = h('div', { class: 'nbar' }, pb,
      h('div', { class: 'who' }, h('b', {}, 'Recorded narration', partLbl), h('span', {}, reader)),
      cur, bar, tot, h('button', { class: 'x', title: 'Stop the narration', onclick: () => speechStop() }, '✕'), au);
    const load = (i, t = 0, play = true) => {
      at = i;
      au.src = parts[i].src;
      partLbl.textContent = parts.length > 1 ? ` · part ${i + 1} of ${parts.length}` : '';
      if (t) au.addEventListener('loadedmetadata', () => { au.currentTime = t; }, { once: true });
      au.volume = E2KAudio.level();
      if (play) au.play().catch(() => setIdle('The narration can’t be played right now.'));
    };
    const tick = () => {
      const now = offset(at) + au.currentTime;
      cur.textContent = clock(now);
      fill.style.width = total ? (100 * now / total) + '%' : '0';
    };
    const state = () => {
      const playing = !au.paused && !au.ended;
      pb.querySelector('use').setAttribute('href', '#i-' + (playing ? 'pause' : 'play'));
      pb.title = playing ? 'Pause' : 'Play';
    };
    const seek = (e) => {
      const r = bar.getBoundingClientRect();
      const target = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)) * total;
      let i = 0;
      while (i < parts.length - 1 && target >= offset(i + 1)) i++;
      if (i === at) au.currentTime = target - offset(i); else load(i, target - offset(i), !au.paused);
      tick();
    };
    pb.addEventListener('click', () => { if (au.paused) au.play().catch(() => {}); else au.pause(); });
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seek(e); });
    bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) seek(e); });
    au.addEventListener('timeupdate', tick);
    au.addEventListener('play', () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      $$('video, audio').forEach((o) => { if (o !== au) o.pause(); });
      state();
    });
    au.addEventListener('pause', state);
    au.addEventListener('ended', () => { if (at < parts.length - 1) load(at + 1); else speechStop(); });
    tot.textContent = clock(total);
    current.content.before(el);
    narration = { au, el };
    speaking = true;
    load(0);
    tick();
    state();
    setIdle('Playing the recorded narration. Press Stop Reading or ✕ to stop.');
    updateToolbar();
  }

  function speakComputer() {
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
    if (narration) { narration.au.pause(); narration.el.remove(); narration = null; }
    $$('.rmenu').forEach((m) => m.remove());
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
    library: () => E2KLibrary.open(E2K),
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
      ['Tools', [['Offline Library…', 'library'], ['Themes…', 'themes'], '-', ['Options…', 'options', 'Ctrl+,']]],
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
    [volBtn, volMute, ...$$('.mviewer .vb')].forEach((b) => b.querySelector('use').setAttribute('href', '#i-' + ic));
    $$('.mviewer .vr').forEach((r) => { r.value = pct; r.style.setProperty('--p', pct + '%'); r.classList.toggle('muted', muted); });
    $$('video, audio').forEach((m) => { m.volume = E2KAudio.level(); });
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
