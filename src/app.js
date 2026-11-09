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
  // Where Options and the Offline Library are, in text: the Tools menu, or on macOS the Encyclopedia 2000 menu.
  const TOOLS = MAC ? 'Encyclopedia 2000 ›' : 'Tools ›';

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
      { label: 'Encyclopedia 2000', items: [item(['About Encyclopedia 2000', 'about']), '-', item(['Options…', 'options', 'Ctrl+,']), item(['Offline Library…', 'library', 'Ctrl+Shift+L']), item(['Offline Mode', 'offline', 'Ctrl+Shift+O', isOffline()]), item(['Themes…', 'themes']), '-',
        { role: 'services' }, '-', { role: 'hide', label: 'Hide Encyclopedia 2000' }, { role: 'hideOthers' }, { role: 'unhide' }, '-', { role: 'quit', label: 'Quit Encyclopedia 2000' }] },
      { label: 'File', items: [...conv(file), '-', { role: 'close' }] },
      { label: 'Edit', items: [{ role: 'undo' }, { role: 'redo' }, '-', { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, '-', item(['Find in Article…', 'find', 'Ctrl+F', null, !findable()]), item(['Find an Article', 'search', 'Ctrl+E'])] },
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
  // A thumbnail's original. Thumbnails may come from thumb.wikimedia.org, but the originals are only on
  // upload.wikimedia.org (the same address on thumb.wikimedia.org leads to the Commons home page).
  const originalOf = (thumb) => (thumb && thumb.includes('/thumb/')
    ? thumb.replace('/thumb/', '/').replace(/\/[^/]+$/, '').replace('//thumb.wikimedia.org/', '//upload.wikimedia.org/') : thumb);
  // Wikimedia won't upscale, so only request a larger thumbnail when the original is wider than that.
  const sized = (thumb, original, width, px) => (width > px ? bigThumb(thumb, px) : original || thumb);
  const longDate = (d = new Date()) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const route = (name, arg) => (arg === undefined ? name : `${name}/${encodeURIComponent(arg)}`);
  // An article route's title can name a section: "Moon#Orbit" (Wikipedia titles never contain "#"). [title, section].
  const splitSection = (arg) => { const i = arg.indexOf('#'); return i < 0 ? [arg, ''] : [arg.slice(0, i), arg.slice(i + 1)]; };

  // ---------- state ----------
  const view = $('#view');
  const nav = { stack: [], from: [], scroll: [], idx: -1 };
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
  // Screen readers read out what's put here (search results, Offline mode, Star Chart's answers). Cleared first, so the
  // same words twice are read twice.
  const announcer = $('#announce');
  function announce(msg) {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 60);
  }
  // The connection light: Online (green), Online with the library first (blue), Offline mode (grey), or no connection
  // (amber, reading from the library; red without one). It opens the connection menu (below).
  const isOffline = () => window.e2k.net.offline();
  let hasLib = false;
  // Downloaded articles (Download for Offline): with some, Offline mode has something to read even without a library.
  let hasDownloads = false;
  let libMissing = null;   // the installed library can't be found: { label, where }
  function updateNet() {
    const [color, label] = isOffline() ? (libMissing ? ['amber', 'Offline · Library not found'] : ['grey', 'Offline'])
      : !Wiki.connected() ? (hasLib ? ['amber', 'No connection · Library'] : ['red', 'No connection'])
      : hasLib && store.get('libraryFirst', false) ? ['blue', 'Online · Library first'] : ['green', 'Online'];
    $('#netdot').className = 'dot ' + color;
    $('#net').textContent = label;
    $('#netbtn').setAttribute('aria-label', `Connection: ${label}`);
    syncMenu();
  }
  addEventListener('online', updateNet);
  addEventListener('offline', updateNet);
  addEventListener('e2k-connection', updateNet);
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
  // Each history entry remembers how far down its page was scrolled, so Back, Forward, and a redraw (a new theme)
  // return there. A page opened fresh starts at the top.
  function saveScroll() { if (nav.idx >= 0) nav.scroll[nav.idx] = view.querySelector('.content')?.scrollTop || 0; }
  function go(r, { replace = false, from = null } = {}) {
    saveScroll();
    if (replace && nav.idx >= 0) { nav.stack[nav.idx] = r; nav.from[nav.idx] = from || nav.from[nav.idx]; nav.scroll[nav.idx] = 0; }
    else {
      nav.stack = nav.stack.slice(0, nav.idx + 1);
      nav.from = nav.from.slice(0, nav.idx + 1);
      nav.scroll = nav.scroll.slice(0, nav.idx + 1);
      nav.stack.push(r);
      nav.from.push(from);
      nav.scroll.push(0);
      nav.idx++;
    }
    render(r);
  }
  const back = () => { if (nav.idx > 0) { saveScroll(); nav.idx--; render(nav.stack[nav.idx], true); } };
  const fwd = () => { if (nav.idx < nav.stack.length - 1) { saveScroll(); nav.idx++; render(nav.stack[nav.idx], true); } };
  const reload = () => { saveScroll(); render(nav.stack[nav.idx] || 'home', true); };
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
    if (name === 'article') return [...(from || [home, { label: 'Articles', r: 'explore' }]), { label: splitSection(arg)[0], r }];
    if (name === 'game') return [home, { label: 'Games', r: 'games' }, { label: E2KGames.get(arg)?.name || arg, r }];
    if (name === 'activity') return [home, { label: 'Activities', r: 'activities' }, { label: E2KActivities.get(arg)?.name || arg, r }];
    if (name === 'myarticles') { const v = arg.split('/')[0]; return [home, { label: 'My Articles', r: 'myarticles/favorites' }, { label: { downloaded: 'Downloaded', history: 'History' }[v] || 'Favorites', r: 'myarticles/' + (v || 'favorites') }]; }
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
      if (nav.stack[i] === r) { saveScroll(); nav.idx = i; render(r, true); return; }
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

  let drawn = false;
  function mount(el, token) {
    if (token !== renderToken) return false;
    el.classList.add('fade-in');
    view.replaceChildren(el);
    updateToolbar();
    focusScreen(el);
    // The first screen is up: a portable that just updated can now delete its previous version (updater.js).
    if (!drawn) { drawn = true; window.e2k.update.started(); }
    return true;
  }
  // A new screen takes focus on its heading, so a screen reader reads where you are and the next Tab is the screen's
  // first control. Not while you're typing or in a window, and nothing shows for mouse users.
  // At launch, Home starts in the search box instead: NVDA reads a newly loaded window aloud from the focus to the end
  // (its "Automatic Say All on page load") unless the focus is in a text box, and a search can be typed straight away.
  // The search box doesn't count as typing: a search moves focus out of it, so focus there is just where it started.
  let launching = true;
  function focusScreen(el = view) {
    const a = document.activeElement;
    if (a && a !== document.body && (a.matches('input:not(#q), textarea, select') || a.closest('.overlay, .netpop, .menu, #menubar'))) return;
    const first = launching;
    launching = false;
    if (first && el.classList.contains('home')) return $('#q').focus();
    const head = el.querySelector('h1') || el.querySelector('h2, h3');
    if (!head) return;
    head.tabIndex = -1;
    head.classList.add('landing');
    head.focus({ preventScroll: true });
  }
  const live = (token) => token === renderToken;

  async function render(r, restore = false) {
    const token = ++renderToken;
    const y = restore ? nav.scroll[nav.idx] || 0 : 0;
    const [name, ...rest] = r.split('/');
    const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
    if (gameCleanup) { try { gameCleanup(); } catch {} gameCleanup = null; }
    speechStop();
    closeMenus();
    hideSuggest();
    closeFind();
    current = null;
    updateToolbar();
    // Random shows nothing of its own: the screen stays as it is (the status bar says it's finding one) until the
    // article opens. Showing its location bar early would squeeze Home in the meantime.
    if (name !== 'random') setTrail(r);
    try {
      switch (name) {
        case 'article': await viewArticle(arg, token, restore); break;
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
        case 'myarticles': viewMyArticles(arg, token); break;
        default: viewHome(token);
      }
      if (y && live(token)) restoreScroll(y, token);
    } catch (err) {
      if (live(token)) { if (name === 'random') setTrail(r); showError(err, name, arg, token); }
    }
  }
  // The top of a page: a quick glide, or a jump with animations off (Options).
  const toTop = (c) => { stopRestore(); c.scrollTo({ top: 0, behavior: store.get('animations', true) ? 'smooth' : 'instant' }); };
  let stopRestore = () => {};
  // Scrolls back to where the page was, and keeps it there for a few seconds while pictures load and push the text
  // down, until the reader scrolls themselves.
  function restoreScroll(y, token) {
    const c = view.querySelector('.content');
    if (!c) return;
    const put = () => c.scrollTo({ top: y, behavior: 'instant' });
    put();
    const watch = new ResizeObserver(() => { if (live(token)) put(); });
    [...c.children].forEach((el) => watch.observe(el));
    const stop = () => { watch.disconnect(); ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((e) => removeEventListener(e, stop, true)); };
    stopRestore = stop;
    ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, stop, true));
    setTimeout(stop, 5000);
  }

  // ---------- data ----------
  // Today's feed, kept for the day: Wikipedia's, or the offline library's picks when offline (kept apart, so going
  // offline doesn't show Wikipedia's pictures, which Offline mode can't load).
  async function todayFeed() {
    const key = new Date().toDateString() + (isOffline() || !Wiki.connected() ? ' offline' : '');
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
    const dialHd = h('b', {}, 'PICTURE OF THE DAY');
    const dialCap = h('span', {}, 'Loading…');
    const discThumb = h('button', { class: 'thumb', style: 'padding:0', 'aria-label': 'Today’s discovery' });
    const discTitle = h('b', {}, 'Loading today’s discovery…');
    const discText = h('p');
    const discMore = h('button', { class: 'more' }, 'Read the full article ›');
    const almList = h('div', { class: 'list' }, h('div', { class: 'muted' }, 'Loading…'));

    const canvas = h('div', { class: 'home-canvas' },
      h('div', { class: 'brand' }, h('h1', {}, h('small', {}, 'Encyclopedia'), ' ', h('span', { class: 'y' }, '2000')), h('div', { class: 'tag' }, 'THE WORLD OF KNOWLEDGE')),
      dial,
      h('div', { class: 'dialcap' }, dialHd, h('br'), dialCap),
      h('nav', { class: 'shelf', 'aria-label': 'Explore' }, h('small', {}, 'EXPLORE'),
        h('div', { class: 'row' }, ORBS.map((o, i) => h('button', { class: 'orb', onclick: o.run },
          h('i', { style: `--orb-bg:radial-gradient(circle at 40% 30%,${o.bg});${E2KThemes.orbStyle(i)}` }, svg('svg', {}, svg('use', { href: '#i-' + o.icon }))), o.label)))),
      h('div', { class: 'panel disc' }, h('h3', {}, 'Today’s discovery'),
        h('div', { class: 'row' }, discThumb, h('div', {}, discTitle, discText)), discMore),
      h('div', { class: 'panel alm' }, h('h3', {}, 'Almanac'), h('div', { class: 'd' }, longDate().toUpperCase()), almList,
        h('button', { class: 'more', onclick: () => go('onthisday') }, 'See all of today’s events ›')),
    );
    if (!mount(h('div', { class: 'home' }, art, canvas), token)) return;
    showNews(canvas);
    fitHome();
    setStatus('Gathering today’s discoveries…', true);

    todayFeed().then((d) => {
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
      if (tfa) {
        const t = tfa.titles?.normalized || tfa.title;
        discThumb.style.cssText = 'padding:0;' + bg(tfa.thumbnail?.source);
        discTitle.textContent = t;
        discText.textContent = tfa.extract || '';
        discMore.onclick = discThumb.onclick = () => openArticle(t);
        discThumb.setAttribute('aria-label', `Read about ${t}`);
      } else if (d.offline && libMissing) {
        discTitle.textContent = 'Your offline library can’t be found.';
        discText.textContent = `${libMissing.label} isn’t in ${libMissing.where}. If it’s on a drive that was disconnected, reconnect it and the library will open again on its own.`;
        discMore.textContent = 'Offline Library…';
        discMore.onclick = () => E2KLibrary.open(E2K);
      } else if (d.offline) {
        // Offline without a library: the almanac still works, from the highlights saved with the app.
        discTitle.textContent = Wiki.connected() && !isOffline() ? 'Wikipedia couldn’t be reached.' : 'You’re offline.';
        discText.textContent = `With an offline library, you can keep reading without the internet. Download one from ${TOOLS} Offline Library.`;
        discMore.textContent = 'Offline Library…';
        discMore.onclick = () => E2KLibrary.open(E2K);
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
    }).catch((err) => {
      if (!live(token)) return;
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
    const media = h('div', { class: 'media' });
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
      h('div', { class: 'rail' }, railArt, railIn),
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
    const btn = h('span', { class: 'fb', role: 'button', tabindex: 0 }, title, h('span', { class: 'n' }, summary));
    const head = h('h4', { class: 'fold', 'aria-level': 2 }, btn);
    const body = h('div', { class: 'rbody' }, kids);
    const show = (shut) => { body.hidden = shut; head.classList.toggle('shut', shut); btn.setAttribute('aria-expanded', String(!shut)); };
    const toggle = () => {
      const shut = !body.hidden;
      show(shut);
      store.set('railShut', [...store.get('railShut', []).filter((t) => t !== title), ...(shut ? [title] : [])]);
    };
    head.addEventListener('click', toggle);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
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
      if (head) { const h6 = doc.createElement('h6'); h6.setAttribute('role', 'heading'); h6.setAttribute('aria-level', '3'); h6.append(...head.childNodes); out.append(h6); }
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
        // Footnote marks ("[1]", "[a]") and hidden styles go; superscript numbers stay superscript ("km²", not "km2");
        // and a one-letter code linked in parentheses ("Crewed lunar landing (G)", NASA's mission type) is dropped.
        cell.querySelectorAll('sup.reference, .mw-ref, style, .noprint').forEach((el) => el.remove());
        // Coordinates come in three forms (degrees, decimal, and a hidden one for maps); keep the readable first one.
        cell.querySelectorAll('.geo-nondefault, .geo-multi-punct, .geo-dec, [style*="display:none"]').forEach((el) => el.remove());
        const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '−': '⁻' };
        cell.querySelectorAll('sup').forEach((el) => { if (/^[0-9\-−]{1,3}$/.test(el.textContent)) el.replaceWith([...el.textContent].map((c) => SUP[c]).join('')); });
        cell.querySelectorAll('a').forEach((el) => {
          const prev = el.previousSibling, next = el.nextSibling;
          if (/^[A-Z]$/.test(el.textContent) && prev?.nodeType === 3 && /\($/.test(prev.nodeValue) && next?.nodeType === 3 && /^\)/.test(next.nodeValue)) {
            prev.nodeValue = prev.nodeValue.replace(/\s*\($/, ''); next.nodeValue = next.nodeValue.slice(1); el.remove();
          }
        });
        cell.querySelectorAll('br').forEach((br) => br.replaceWith('; '));
        cell.querySelectorAll('li, div, p').forEach((el) => el.append('; '));
        let v = cell.textContent.replace(/\[(\d+|[a-z])\]/g, '').replace(/\s+/g, ' ').replace(/(\s*;\s*)+/g, '; ').replace(/^[;\s]+|[;\s]+$/g, '').trim();
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
        const [raw, frag = ''] = href.replace(/^\.\//, '').split('?')[0].split('#');
        let t;
        try { t = decodeURIComponent(raw).replace(/_/g, ' '); } catch { t = raw.replace(/_/g, ' '); }
        // A link to a section of an article ("Moon#Orbit") opens it there.
        if (frag) { try { a.dataset.section = decodeURIComponent(frag); } catch { a.dataset.section = frag; } }
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

    // Pictures without a description are named for screen readers by their caption, or else their file's name (so a
    // picture that's a link isn't read out as just "link").
    body.querySelectorAll('img').forEach((img) => {
      if ((img.getAttribute('alt') || '').trim()) return;
      const cap = img.closest('figure')?.querySelector('figcaption')?.textContent.trim();
      const file = img.closest('a[data-file]')?.dataset.file || decodeURIComponent((img.getAttribute('resource') || '').split('/').pop() || '');
      const name = cap || file.replace(/^(File|Image):/i, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' ').trim()
        || (img.getAttribute('usemap') ? 'Timeline chart' : 'Picture');
      img.setAttribute('alt', name.length > 150 ? name.slice(0, 148) + '…' : name);
    });

    const firstP = [...body.querySelectorAll('p')].find((p) => p.textContent.trim().length > 60);
    if (firstP) firstP.classList.add('lede');

    const toc = [...body.querySelectorAll('h2')].map((h2, i) => {
      if (!h2.id) h2.id = 'sec-' + i;
      return { id: h2.id, label: h2.textContent.trim() };
    });
    return { nodes: [...body.childNodes], facts, toc, related, infoImg, pron, decor };
  }

  // ---------- downloading articles (Download for Offline) ----------
  // The article's Download for Offline button: the main part downloads it (with its pictures); the arrow opens a menu
  // (as text only, download again, delete the download). While downloading it shows how far along it is; once
  // downloaded it says so. The copy is made by the main process (downloads.js) and opens without the internet.
  const saved = window.e2k.saved;
  const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e7 ? `${Math.round(b / 1e6)} MB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);
  let downloadJobs = [];
  function downloadButton() {
    const main = h('button', { class: 'bbtn dmain', onclick: () => (dl.entry ? downloadMenu(dl) : startDownload(dl)) }, icon('download'), h('span', {}, 'Download for Offline'));
    const arrow = h('button', { class: 'bbtn darrow', title: 'More download choices', 'aria-label': 'More download choices', 'aria-haspopup': 'menu', onclick: () => downloadMenu(dl) }, '▾');
    const dl = { el: h('span', { class: 'bsplit' }, main, arrow), main, arrow, entry: null,
      async refresh() {
        if (!current || current.dl !== dl) return;
        dl.entry = await saved.get(current.title).catch(() => null);
        dl.draw();
      },
      draw() {
        const job = current && current.dl === dl && downloadJobs.find((j) => j.title.toLowerCase() === current.title.toLowerCase());
        const label = main.querySelector('span');
        main.classList.toggle('on', !!dl.entry && !job);
        if (job) label.textContent = `Downloading… ${Math.round((job.done / Math.max(job.total, 1)) * 100)}%`;
        else label.textContent = dl.entry ? 'Downloaded' : 'Download for Offline';
        main.title = dl.entry ? `Downloaded ${new Date(dl.entry.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · ${mb(dl.entry.size)}. It opens without the internet.`
          : `Download this article (${whatComes().replace(/^W/, 'w').replace(/^A/, 'a')}), so it opens without the internet`;
      } };
    return dl;
  }
  async function startDownload(dl, opts = {}) {
    if (!current) return;
    await downloadTitle(current.title, opts);
    if (current && current.dl === dl) dl.refresh();
  }
  // What a downloaded article brings with it, from Options › Storage; a choice made for one download goes over it.
  const downloadDefaults = () => ({ textOnly: store.get('dlPictures', 'reading') === 'none', sounds: store.get('dlSounds', true) !== false,
    videos: store.get('dlVideos', false) === true, spoken: store.get('dlSpoken', false) === true });
  const dlWith = (title, opts = {}) => saved.download(title, { ...downloadDefaults(), ...opts });
  // What "Download this article" brings, in words.
  function whatComes() {
    const d = downloadDefaults();
    if (d.textOnly) return 'As text only (Options › Storage)';
    const extra = [d.sounds ? 'sounds' : '', d.videos ? 'videos' : '', d.spoken ? 'its spoken recording' : ''].filter(Boolean);
    return `With its pictures${extra.length ? (extra.length === 1 ? ` and ${extra[0]}` : `, ${extra.slice(0, -1).join(', ')}, and ${extra[extra.length - 1]}`) : ''}`;
  }
  // Downloads one article (from its button, or the My Articles pane), telling how it went in the status bar.
  async function downloadTitle(title, opts = {}) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading an article needs the internet.'); return; }
    setStatus(`Downloading “${title}”…`, true);
    const r = await dlWith(title, opts);
    if (r.ok) setIdle(`Downloaded “${r.entry.title}”${r.entry.videos ? ` with its ${r.entry.videos === 1 ? 'video' : 'videos'}` : ''} (${mb(r.entry.size)}). It opens without the internet.`);
    else if (r.space) setIdle(`“${title}” wasn’t downloaded: there isn’t enough free space on this drive.`);
    else if (r.offline) setIdle('Offline mode is on. Downloading an article needs the internet.');
    else setIdle(`“${title}” couldn’t be downloaded. Check your connection and try again.`);
    if (current?.dl && sameTitle(current.title, title)) current.dl.refresh();
  }
  function downloadMenu(dl) {
    if ($('.rmenu')) { $('.rmenu').remove(); return; }
    const item = (ic, title, sub, fn) => h('button', { class: 'ri', role: 'menuitem', onclick: () => { menu.remove(); fn(); } },
      h('span', { class: 'rio' }, icon(ic)), h('span', {}, h('b', {}, title), h('span', { class: 's' }, sub)));
    const e = dl.entry;
    // Videos are downloaded only on request. The choice shows once the article is known to have some, with their size.
    const videoItem = (!e || !e.textOnly) && !(e && e.withVideos) && !(!e && downloadDefaults().videos) ? item('film', e ? 'Download again with its videos' : 'Download it with its videos too',
      'Checking how big they are…', () => startDownload(dl, { videos: true })) : null;
    if (videoItem) {
      videoItem.hidden = true;
      saved.videos(current.title).then((v) => {
        if (!v || !v.count) return;
        videoItem.querySelector('.s').textContent = `${v.count === 1 ? 'Its video' : `Its ${v.count} videos`}${v.size ? `, about ${mb(v.size)} more` : ''}. Videos play without the internet too.`;
        videoItem.hidden = false;
      }, () => {});
    }
    const menu = h('div', { class: 'rmenu', role: 'menu', 'aria-label': 'Download' }, ...[...(e ? [
      item('download', 'Download again', `Updates your copy (${mb(e.size)}, downloaded ${new Date(e.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}) to Wikipedia’s current version.`,
        () => startDownload(dl, { textOnly: e.textOnly, videos: e.withVideos })),
      videoItem,
      e.withVideos ? item('film', 'Download again without its videos', `Frees ${mb(e.videoSize)}. The videos still play when you’re online.`, () => startDownload(dl)) : null,
      item('delete', 'Delete download', 'Removes the copy from this computer. A favorite stays a favorite.', async () => {
        await saved.remove(current.title);
        setIdle(`Deleted the download of “${current.title}”.`);
        dl.refresh();
      }),
    ] : [
      item('download', 'Download this article', `${whatComes()}, so it opens without the internet.`, () => startDownload(dl)),
      videoItem,
      item('book', 'Download it as text only', 'Smaller: the text without its pictures.', () => startDownload(dl, { textOnly: true })),
    ]), item('folder', 'Download a category…', 'Articles like this one: pick one of its Wikipedia categories.', () => categoryDialog(current.title)),
      item('books', 'Downloaded articles…', 'Every article you’ve downloaded, on the My Articles page.', () => go('myarticles/downloaded'))].filter(Boolean));
    const r = dl.el.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 310)) + 'px';
    document.body.append(menu);
    const away = (ev) => { if (!menu.contains(ev.target) && !dl.el.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', away, true); } };
    document.addEventListener('mousedown', away, true);
    menu.querySelector('.ri').focus();
  }
  // Progress from the main process: the button of the article on screen follows it.
  // Known before the library's state is looked at (libChanged), so Offline mode isn't ended at startup for want of a library.
  const downloadsKnown = saved.state().then((s) => { hasDownloads = !!(s && s.count); }, () => {});
  let dlSum = '';
  saved.onUpdate((s) => {
    hasDownloads = !!s.count;
    downloadJobs = s.active || [];
    if (current && current.dl) { if (!downloadJobs.length) current.dl.refresh(); else current.dl.draw(); }
    // The My Articles pane: its marks follow the progress; its lists reload when a download is added or removed.
    const sum = `${s.count}/${s.size}`;
    if (sum !== dlSum) { dlSum = sum; if (dlLoaded || dlCats().length) loadDownloaded(); }
    refreshMarks();
  });

  // ---------- sections ----------
  // An article can be opened at a section: "Moon#Orbit" (see splitSection). The section is an anchor, usually a
  // heading's id ("The_real-life_Eleanor_Rigby"); failing that, a heading with that text.
  function sectionIn(root, sec) {
    for (const id of new Set([sec, sec.replace(/ /g, '_'), sec.replace(/_/g, ' ')])) {
      const el = id && root.querySelector('#' + CSS.escape(id));
      if (el) return el;
    }
    const want = sec.replace(/_/g, ' ').trim().toLowerCase();
    return [...root.querySelectorAll('h2, h3, h4, h5, h6')].find((x) => x.textContent.trim().toLowerCase() === want) || null;
  }
  // Scrolls the article to a section, and keeps it there for a few seconds while pictures above it load and push it
  // down, until the reader scrolls themselves. Focus moves to its heading (for screen readers) unless it's been moved
  // on already. False if the article has no such section (it then stays at the top).
  function goToSection(pg, sec, token) {
    const el = sectionIn(pg.text, sec);
    if (!el) return false;
    const c = pg.content, block = el.closest('.mw-heading') || el;
    const put = () => c.scrollTo({ top: block.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 10, behavior: 'instant' });
    stopRestore();
    put();
    const watch = new ResizeObserver(() => { if (live(token)) put(); });
    [...c.children].forEach((x) => watch.observe(x));
    const stop = () => { watch.disconnect(); ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((e) => removeEventListener(e, stop, true)); };
    stopRestore = stop;
    ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, stop, true));
    setTimeout(stop, 5000);
    const head = el.matches('h2, h3, h4, h5, h6') ? el : block.querySelector('h2, h3, h4, h5, h6');
    const a = document.activeElement;
    if (head && (!a || a === document.body || a.classList.contains('landing'))) {
      head.tabIndex = -1;
      head.classList.add('landing');
      head.focus({ preventScroll: true });
    }
    return true;
  }

  async function viewArticle(arg, token, restore = false) {
    const [title, askedSection] = splitSection(arg);
    const favBtn = bandBtn('Add to Favorites', () => toggleFav(), 'star');
    const speakBtn = bandBtn('Read Aloud', () => toggleSpeak(), 'read');
    const wikiBtn = bandBtn('View on Wikipedia', null, 'ext');
    const dl = downloadButton();
    const pg = shell({ title, tools: [speakBtn, dl.el, favBtn, wikiBtn], article: true });
    pg.text.append(loading('Retrieving article…'));
    if (!mount(pg.root, token)) return;
    setStatus(`Retrieving “${title}”…`, true);
    // Timing marks for each step (read by tools/test; nothing is recorded or sent).
    const mark = (step) => performance.mark('article:' + step, { detail: title });
    mark('start');

    // Ask for the summary and the article together; the article only waits on its own download.
    const htmlP = Wiki.html(title);
    htmlP.catch(() => {});
    const sum = await Wiki.summary(title);
    mark('summary');
    if (!live(token)) return;
    const name = sum.titles?.normalized || title;
    const canon = sum.titles?.canonical || name.replace(/ /g, '_');
    pg.setTitle(name, sum.description);
    setHere(name);
    wikiBtn.onclick = () => window.e2k.openExternal(Wiki.pageUrl(canon));

    const html = await htmlP;
    mark('html');
    if (!live(token)) return;
    const { nodes, facts, toc, related, infoImg, pron, decor } = cleanArticle(html);
    mark('cleaned');
    if (pron) pg.titleRow.append(pronButton(name, pron));

    current = { title: name, desc: sum.description || '', thumb: sum.thumbnail?.source || '', favBtn, speakBtn, dl };
    dl.refresh();
    addRecent(name);
    store.set('lastArticle', name);

    const attrib = h('div', { class: 'attrib' },
      'This article uses material from the Wikipedia article ', h('a', { href: '#', 'data-ext': Wiki.pageUrl(canon) }, `“${name}”`),
      ', which is released under the Creative Commons Attribution-ShareAlike 4.0 License. Retrieved ', new Date().toLocaleDateString('en-US'), '.');
    pg.text.replaceChildren(...nodes, attrib);
    mark('inserted');
    requestAnimationFrame(() => setTimeout(() => mark('painted'), 0));
    Wiki.sharpen(pg.text);
    // Sounds often have no caption of their own, so borrow the title the article's "Listen" box gives them.
    const soundNames = [...pg.text.querySelectorAll('.aslot')].map((s) => [s.dataset.file, s.dataset.label]).filter(([, l]) => l);
    const mediaP = articleMedia(canon).then((items) => {
      for (const m of items) if (!m.caption) m.caption = soundNames.find(([f]) => sameFile(f, m.file))?.[1] || '';
      const kept = items.filter((m) => ![...decor].some((f) => sameFile(f, m.file)));
      kept.spoken = items.spoken;
      // A sound shows the article's picture in the viewer, like a record's cover (Brahms's face while he plays).
      const art = sum.thumbnail?.source ? sized(sum.thumbnail.source, sum.originalimage?.source || sum.thumbnail.source, sum.originalimage?.width || 0, 1280) : '';
      if (art) for (const m of kept) if (m.type === 'audio') m.art = art;
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
    // Back to the top: a small button at the bottom right, once the article has been scrolled down a screen or so.
    const topBtn = h('button', { class: 'totop', title: 'Back to the top (Home)', 'aria-label': 'Back to the top', onclick: () => toTop(pg.content) },
      svg('svg', { viewBox: '0 0 16 16' }, svg('path', { d: 'M8 3 2.5 8.6h3.6V13h3.8V8.6h3.6z' })));
    pg.content.after(topBtn);
    pg.content.addEventListener('scroll', () => {
      const c = pg.content;
      topBtn.style.setProperty('--bar', (c.offsetWidth - c.clientWidth) + 'px');
      topBtn.classList.toggle('show', c.scrollTop > c.clientHeight * 1.5);
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
    const factsBox = h('div', { class: 'facts' }, h('h6', { role: 'heading', 'aria-level': 2 }, 'Quick facts'));
    facts.forEach(([k, v]) => factsBox.append(h('div', { class: 'r' }, h('span', {}, k), h('span', {}, v))));
    factsBox.append(
      h('div', { class: 'r' }, h('span', {}, 'Source'), h('span', {}, 'Wikipedia')),
      h('div', { class: 'r' }, h('span', {}, 'License'), h('span', {}, 'CC BY-SA 4.0')));
    pg.media.append(factsBox);

    // Opened at a section: a link to one ("Moon#Orbit"), a library page that only leads to a section of this article,
    // or (online) a title that redirects to one. Back and Forward return to where the page was instead (render).
    if (!restore) {
      const sec = askedSection || sum.section || '';
      if (sec) goToSection(pg, sec, token);
      else if (!sum.fromLibrary && name.replace(/_/g, ' ').toLowerCase() !== title.replace(/_/g, ' ').trim().toLowerCase()) {
        Wiki.redirectSection(title).then((s) => { if (s && live(token) && pg.content.scrollTop < 5) goToSection(pg, s, token); });
      }
    }

    updateToolbar();
    setIdle(sum.type === 'disambiguation' ? `“${name}” may refer to several subjects` : 'Done');
    mark('done');
  }

  // link handling inside article text (and anywhere else data-* links appear)
  view.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.title) {
      const sec = a.dataset.section || '';
      // A section of the article that's open: just go there.
      if (sec && current && current.title.toLowerCase() === a.dataset.title.toLowerCase() && current.content) {
        if (goToSection({ text: current.content.querySelector('.text') || current.content, content: current.content }, sec, renderToken)) return;
      }
      openArticle(sec ? `${a.dataset.title}#${sec}` : a.dataset.title, linkFrom());
    } else if (a.dataset.ext) window.e2k.openExternal(a.dataset.ext);
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
    if (a.dataset.title) setStatus('Article: ' + a.dataset.title + (a.dataset.section ? ` › ${a.dataset.section.replace(/_/g, ' ')}` : ''));
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
    // Searched only the library: Offline mode, no connection, or "Use the offline library first".
    const libOnly = hasLib && (isOffline() || !Wiki.connected() || store.get('libraryFirst', false));
    pg.railIn.append(h('div', { class: 'note' }, pages.length ? `${pages.length} best matches for “${q}”.` : libOnly ? 'No matches in the offline library.' : 'No matches found.'),
      h('hr'), railLink(`Search Wikipedia for “${q}”`, () => window.e2k.openExternal(`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&fulltext=1`), 'sub'));
    if (!pages.length && libOnly) {
      // The library only finds titles that start with what was typed, so suggest articles it has that start with part
      // of it ("Apollo 11 lunar sample display" → "Apollo 11").
      const related = h('p', { class: 'inlib', hidden: true });
      pg.text.replaceChildren(h('div', { class: 'errbox' },
        h('b', {}, 'No matches in the offline library'),
        `Nothing in the offline library matched “${q}”. `
          + (isOffline() ? 'You’re in Offline mode, so only the offline library is searched.'
            : !Wiki.connected() ? 'There’s no internet connection, so only the offline library is searched.'
            : 'You’re using the offline library first, so only the offline library is searched.'),
        related,
        h('div', {}, isOffline() && navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null)));
      relatedInLibrary(q).then((titles) => {
        if (!titles.length || !live(token)) return;
        related.append(h('b', {}, 'In your library:'), ' ', ...titles.flatMap((t, i) => [i ? ' · ' : null,
          h('a', { href: '#', 'data-title': t }, t)]).filter(Boolean));
        related.hidden = false;
      });
    } else if (!pages.length) {
      pg.text.replaceChildren(...(suggest ? [suggest] : []), h('div', { class: 'errbox' }, h('b', {}, 'No articles found'), `Nothing matched “${q}”. Check the spelling, or try a broader subject.`));
    } else {
      pg.text.replaceChildren(...(suggest ? [suggest] : []), h('div', { class: 'results' }, pages.map((p) => {
        const ex = h('p');
        const parts = (p.excerpt || '').split(/<span class="searchmatch">|<\/span>/);
        parts.forEach((part, i) => {
          const txt = decodeHtml(part);
          ex.append(i % 2 ? h('strong', {}, txt) : txt);
        });
        // No free picture (a logo or poster Wikipedia leaves out): an icon for the kind of subject instead of a blank.
        return h('button', { class: 'res', onclick: () => openArticle(p.title, linkFrom()) },
          p.thumbnail?.url ? h('i', { class: 'th', style: bg(https(p.thumbnail.url)) }) : h('i', { class: 'th ph' }, E2KKinds.icon(svg, p.description)),
          h('div', {}, h('b', {}, p.title), p.description ? h('span', {}, p.description) : null, ex));
      })));
    }
    setIdle(`${pages.length} results`);
    announce(pages.length ? `${pages.length} results for ${q}.` : `No results for ${q}.`);
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
    const recent = recentTitles();
    if (recent.length) pg.railIn.append(h('hr'), h('h4', {}, 'Recently viewed'), ...recent.map((t) => railLink(t, () => openArticle(t, linkFrom()), 'sub')));
    const grid = h('div', { class: 'cards' }, Array.from({ length: 8 }, () => h('div', { class: 'card ghost' })));
    pg.text.append(grid);
    if (!mount(pg.root, token)) return;
    setStatus('Picking articles…', true);
    // Twelve picks are asked for at once, and each card fills in as its article arrives; the first eight win.
    // Wikipedia builds the summary of an article it hasn't sent lately on the spot (up to a few seconds),
    // so one slow pick no longer holds up the page.
    const ghosts = [...grid.children], seen = new Set();
    let filled = 0, settled = 0;
    await new Promise((done) => {
      for (let i = 0; i < 12; i++) {
        Wiki.random().then((s) => {
          const t = s.titles?.normalized || s.title;
          if (!live(token) || filled >= 8 || seen.has(t)) return;
          seen.add(t);
          ghosts[filled++].replaceWith(h('button', { class: 'card', onclick: () => openArticle(t) },
            h('div', { class: 'ph', style: bg(s.thumbnail?.source) }),
            h('div', { class: 'b' }, h('b', {}, t), s.description ? h('span', {}, s.description) : null, h('p', {}, s.extract || ''))));
          if (filled === 8) done();
        }, () => {}).finally(() => { if (++settled === 12) done(); });
      }
    });
    if (!live(token)) return;
    if (!filled) throw new Error('No articles returned');
    ghosts.slice(filled).forEach((g) => g.remove());
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
      const full = img.fromLibrary ? img.thumbnail.source : sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 1280);
      const caption = strip(img.description?.text) || strip(img.title);
      // Offline, each day's picture comes from an article in the offline library, not from Wikimedia Commons.
      holder.replaceChildren(
        h('figure', {}, h('img', { src: full, alt: caption, onclick: () => lightbox(full, caption) })),
        h('div', { class: 'desc' }, caption),
        img.fromLibrary
          ? h('div', { class: 'credit' }, `${longDate(date)} · From your offline library`, bandBtn(`Read about ${img.title}`, () => openArticle(img.title)))
          : h('div', { class: 'credit' },
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
      if (img.fromLibrary) pg.root.querySelector('.band .desc').textContent = 'Pictures from your offline library (the Picture of the Day comes back when you’re online)';
      pics[i] = { date: d, img };
      tiles[i].disabled = railBtns[i].disabled = false;
      tiles[i].firstChild.style.cssText = bg(img.thumbnail?.source);
      if (!picked && (shown < 0 || i < shown)) show(i);
    }));
    if (!live(token)) return;
    if (!pics.some(Boolean)) throw Object.assign(new Error('No pictures available'), { noPictures: isOffline() || !Wiki.connected() });
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
        // An event without an article (offline, when the library doesn't have it) is plain text.
        return h(t ? 'button' : 'div', t ? { class: 'tl-item', onclick: () => openArticle(t, linkFrom()) } : { class: 'tl-item nolink', title: data.offline ? 'Not in your offline library' : '' },
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
    focusScreen(root);
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
      const sec = h('section', { class: 'act-group', 'data-cat': cat }, h('h3', { 'aria-level': 2 }, cat, h('span', {}, `${items.length} ${items.length === 1 ? 'activity' : 'activities'}`)),
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
    focusScreen(root);
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
    focusScreen(root);
  }

  // ---------- errors ----------
  // The library can't be found (its drive was disconnected, or it was moved or deleted): where it was, and what to do.
  const missingBox = () => h('div', { class: 'errbox' },
    h('b', {}, 'Your offline library can’t be found'),
    `${libMissing.label} isn’t in ${libMissing.where}. If it’s on a drive that was disconnected, reconnect it and the library will open again on its own. You can also find it or download it again in ${TOOLS} Offline Library.`,
    h('div', {}, bandBtn('Offline Library…', () => E2KLibrary.open(E2K)), navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null));
  function showError(err, name, arg, token) {
    if (isOffline()) {
      // First, whether the library itself just went missing (its drive was disconnected, say).
      window.e2k.library.state().then(libChanged, () => {}).finally(() => { if (live(token)) offlineError(err, arg, token); });
      return;
    }
    onlineError(err, name, arg, token);
  }
  function offlineError(err, arg, token) {
    // Media's pictures offline, with a library that has none (a text-only library).
    if (err.noPictures && hasLib) {
      const pg = shell({ title: 'Picture of the Day', railTitle: '', wide: true });
      pg.text.append(h('div', { class: 'errbox' },
        h('b', {}, 'Your offline library has no pictures'),
        `Text-only libraries leave out pictures to save space. The Picture of the Day comes back when you’re online, or with a library that includes pictures (${TOOLS} Offline Library).`,
        h('div', {}, navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null)));
      mount(pg.root, token);
      setIdle('Offline mode');
      return;
    }
    if (libMissing) {
      const pg = shell({ title: 'Offline library not found', railTitle: '', wide: true });
      pg.text.append(missingBox());
      mount(pg.root, token);
      setIdle('Offline mode');
      return;
    }
    // Offline mode: the page needs the internet, or the article isn't in the library. For a missing article, related
    // ones that are in the library follow (see relatedInLibrary).
    const onlyDownloads = !hasLib && hasDownloads;
    const pg = shell({ title: !err.notInLibrary ? 'Offline mode' : onlyDownloads ? 'Not downloaded' : 'Not in the offline library', railTitle: '', wide: true });
    const related = h('p', { class: 'inlib', hidden: true });
    pg.text.append(h('div', { class: 'errbox' },
      h('b', {}, !err.notInLibrary ? 'This page needs the internet' : onlyDownloads ? `“${arg}” isn’t downloaded` : `“${arg}” isn’t in the offline library`),
      onlyDownloads ? 'You’re in Offline mode, so only the articles you’ve downloaded are available.'
        : hasDownloads ? 'You’re in Offline mode, so only the offline library and the articles you’ve downloaded are available.'
          : 'You’re in Offline mode, so only the offline library is available.',
      related,
      h('div', {}, navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null)));
    mount(pg.root, token);
    setIdle('Offline mode');
    if (err.notInLibrary && hasLib) relatedInLibrary(arg).then((titles) => {
      if (!titles.length || !live(token)) return;
      related.append(h('b', {}, 'In your library:'), ' ', ...titles.flatMap((t, i) => [i ? ' · ' : null,
        h('a', { href: '#', 'data-title': t }, t)]).filter(Boolean));
      related.hidden = false;
    });
  }
  // Up to four articles in the library related to a title that isn't: the library's titles starting with shorter and
  // shorter versions of it ("Apollo 11 lunar sample display" → "Apollo 11 lunar sample" → … → "Apollo 11").
  async function relatedInLibrary(title) {
    const words = String(title).split(/\s+/), found = [];
    for (let n = words.length - 1; n >= 1 && found.length < 4; n--) {
      const hits = await window.e2k.library.titles(words.slice(0, n).join(' '), 6).catch(() => []);
      for (const hit of hits) if (!found.includes(hit.title) && hit.title.toLowerCase() !== title.toLowerCase() && found.length < 4) found.push(hit.title);
    }
    return found;
  }
  function onlineError(err, name, arg, token) {
    const offline = !Wiki.connected();
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
  function closeOverlays() { $$('.overlay:not(.stay)').forEach((o) => o.remove()); }
  // Every window (dialogs, the Offline Library, Options, the media viewer, Star Chart's awards) keeps focus inside
  // itself while it's open, is named for screen readers by its title, and gives focus back to what opened it.
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const topOverlay = () => $$('.overlay').at(-1) || null;
  const focusables = (box) => $$(FOCUSABLE, box).filter((e) => e.getClientRects().length && !e.closest('[hidden]'));
  const openers = new WeakMap();
  let lastFocus = null;
  // The last thing focused in a window, so focus can come back to it when the window redraws (the Offline Library
  // does as a download goes on).
  let inWindow = '';
  const focusKey = (e) => `${e.tagName}|${e.className}|${(e.textContent || '').trim().slice(0, 40)}`;
  document.addEventListener('focusin', (e) => { if (e.target.closest?.('.overlay')) inWindow = focusKey(e.target); else lastFocus = e.target; });
  function refocus(ov) {
    const a = document.activeElement;
    if (ov !== topOverlay() || (a && a !== document.body && a.isConnected)) return;
    const list = focusables(ov);
    (list.find((e) => focusKey(e) === inWindow) || list[0] || ov.querySelector('[role="dialog"]'))?.focus({ preventScroll: true });
  }
  new MutationObserver((records) => {
    for (const r of records) {
      for (const ov of r.addedNodes) {
        if (!(ov instanceof HTMLElement) || !ov.classList.contains('overlay')) continue;
        openers.set(ov, lastFocus);
        // A picture opened on its own is just the picture: the overlay itself is the window.
        const box = ov.querySelector('[role="dialog"]') || (ov.firstElementChild?.tagName === 'DIV' ? ov.firstElementChild : ov);
        if (!box.getAttribute('role')) box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        if (!box.hasAttribute('tabindex')) box.tabIndex = -1;
        const name = box.querySelector('.dt, h2');
        if (!box.getAttribute('aria-label') && !box.getAttribute('aria-labelledby')) {
          if (name) { name.id ||= 'dlg-' + Math.random().toString(36).slice(2, 8); box.setAttribute('aria-labelledby', name.id); }
          else box.setAttribute('aria-label', box.querySelector('img')?.alt || 'Picture');
        }
        setTimeout(() => { if (ov.isConnected && !ov.contains(document.activeElement)) (focusables(ov)[0] || box)?.focus?.(); }, 0);
        new MutationObserver(() => setTimeout(() => refocus(ov), 0)).observe(ov, { childList: true, subtree: true });
      }
      for (const ov of r.removedNodes) {
        if (!(ov instanceof HTMLElement) || !ov.classList.contains('overlay')) continue;
        const back = openers.get(ov);
        setTimeout(() => {
          if (topOverlay() || (document.activeElement && document.activeElement !== document.body)) return;
          if (back?.isConnected) back.focus({ preventScroll: true }); else focusScreen();
        }, 0);
      }
    }
  }).observe(document.body, { childList: true });
  document.addEventListener('keydown', (e) => {
    const ov = topOverlay();
    if (e.key !== 'Tab' || !ov) return;
    const list = focusables(ov);
    if (!list.length) { e.preventDefault(); return; }
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); list.at(-1).focus(); }
    else if (!e.shiftKey && (i === -1 || i === list.length - 1)) { e.preventDefault(); list[0].focus(); }
  });
  document.addEventListener('focusin', (e) => {
    const ov = topOverlay();
    if (ov && !ov.contains(e.target) && !e.target.closest?.('.menu.ctx')) (focusables(ov)[0] || ov.querySelector('[role="dialog"]'))?.focus();
  });

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

  // A click outside closes a dialog, except a question that needs an answer ("stay": only its buttons close it, and the
  // click doesn't take the keyboard focus out of it).
  function dialog(title, heading, paragraphs, buttons = [['OK']], { stay = false, cls = '' } = {}) {
    const ov = h('div', { class: 'overlay' + (stay ? ' stay' : ''), onmousedown: (e) => { if (e.target !== ov) return; if (stay) e.preventDefault(); else ov.remove(); } });
    ov.append(h('div', { class: 'dialog' + (cls ? ' ' + cls : ''), role: 'dialog' },
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
    'Offline libraries are Wikipedia as packaged by Kiwix (kiwix.org), a nonprofit that makes Wikipedia available offline, downloaded through mirrors run by volunteers around the world.',
    'Encyclopedia 2000 is an independent project. It isn’t affiliated with the Wikimedia Foundation, Kiwix, or Microsoft.',
    h('p', { class: 'support' }, 'Encyclopedia 2000 is free because Wikipedia is. If you find it useful, please consider supporting the Wikimedia Foundation, the nonprofit that runs Wikipedia.'),
  ], [['Donate…', () => donate()], ['OK', null, true]]);
  // ---------- keyboard shortcuts ----------
  // Help › Keyboard Shortcuts (Ctrl+/): every shortcut in groups, as keycaps. Listed the Windows way and turned into
  // the macOS keys there (⌘ for Ctrl, Cmd+[ for Back, and so on), the same as the menus.
  const SHORTCUTS = [
    [['Finding', [['Find in this article', 'Ctrl+F'], ['Find an article', 'Ctrl+E'], ['Next match', 'Enter'], ['Previous match', 'Shift+Enter']]],
      ['Moving around', [['Home', 'Ctrl+H'], ['Back', 'Alt+Left'], ['Forward', 'Alt+Right'], ['Top of the article', MAC ? 'Home' : 'Home or Ctrl+Home'], ['Refresh', 'F5']]],
      ['Going places', [['Articles', 'Ctrl+1'], ['Media', 'Ctrl+2'], ['Timeline', 'Ctrl+3'], ['World Explorer', 'Ctrl+4'], ['Games', 'Ctrl+5'], ['Activities', 'Ctrl+6'],
        ...(MAC ? [] : [['Menu bar', 'Alt or F10']])]],
      ['Reading', [['Larger text', 'Ctrl+='], ['Smaller text', 'Ctrl+-'], ['Normal text size', 'Ctrl+0'], ['Copy', 'Ctrl+C']]]],
    [['Printing', [['Print Preview', 'Ctrl+P'], ['Print', 'Ctrl+Shift+P']]],
      ['Offline', [['Offline Library', 'Ctrl+Shift+L'], ['Offline mode on or off', 'Ctrl+Shift+O']]],
      ['My Articles', [['My Articles pane', 'Ctrl+I'], ['Add to Favorites', 'Ctrl+D'], ['Manage favorites', 'Ctrl+B'], ['History', 'Ctrl+Y']]],
      ['Sound', [['Mute', 'Ctrl+M']]],
      ['Pictures and videos', [['Previous / next', 'Left or Right'], ['Play / pause', 'Space']]],
      ['Encyclopedia 2000', [['Options', 'Ctrl+,'], ['Keyboard shortcuts', 'Ctrl+/'], ['Close a window or menu', 'Esc'], MAC ? ['Quit', 'Cmd+Q'] : ['Exit', 'Alt+F4']]]],
  ];
  const CAP = { Left: '←', Right: '→', Cmd: MAC ? '⌘' : 'Cmd', Shift: MAC ? '⇧' : 'Shift', Alt: MAC ? '⌥' : 'Alt' };
  function shortcuts() {
    // On macOS a shortcut is written as one key cap the Mac way ("⇧⌘H"); elsewhere as keys joined by "+" ("Ctrl" + "H").
    const caps = (combo) => (MAC ? [h('kbd', {}, keyText(combo).replace(/^(.*?)(Left|Right)$/, (_, m, k) => m + CAP[k]))]
      : combo.split('+').flatMap((k, i) => [i ? h('span', { class: 'kplus' }, '+') : null, h('kbd', {}, CAP[k] || k)]).filter(Boolean));
    const row = ([label, combo]) => h('div', { class: 'kr' }, h('span', {}, label),
      h('span', {}, combo.split(' or ').flatMap((c, i) => [i ? h('span', { class: 'kplus' }, ' or ') : null, ...caps(c)]).filter(Boolean)));
    const cols = h('div', { class: 'kcols' }, SHORTCUTS.map((col) => h('div', {}, col.map(([title, rows]) => h('div', {}, h('h3', {}, title), rows.map(row))))));
    dialog('Keyboard Shortcuts', 'Keyboard shortcuts', [cols]);
    $$('.overlay .dialog').at(-1).classList.add('keys');
  }

  // ---------- what's new ----------
  // Shown once after updating to a new feature release (0.2, 0.3, and so on), and any time from Help › What's New.
  // New installs skip it, and bug-fix releases don't change it.
  const WHATS_NEW = {
    version: '0.5',
    name: '0.5 Beta',
    items: [
      ['Offline Library', `Download Wikipedia to your computer and read and search it without the internet. Open ${TOOLS} Offline Library to choose a library.`],
      ['Online or Offline', 'Click the light in the status bar to go offline, or to read from your library first even when you’re online.'],
      ['Find in Article', `Press ${MAC ? '⌘F' : 'Ctrl+F'} to find a word on the page. Help › Keyboard Shortcuts lists the rest.`],
      ['Fixes and improvements', 'Search results without a picture show an icon for the kind of subject, and railway route diagrams draw correctly.'],
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

  // ---------- notices ----------
  // From encyclopedia2000.com (notices.js): a news item on Home, above Explore, and an important notice as a banner
  // under the toolbar on every screen. Each is shown until it's closed, then never again. The first time news is
  // closed, a line in its place says where news can be turned off, and fades away by itself.
  let notices = { news: null, important: null };
  const noticeSeen = (id) => store.get('noticeSeen', []).includes(id);
  const closeNotice = (id) => store.set('noticeSeen', [...store.get('noticeSeen', []), id].slice(-50));
  const noticeLink = (link, cls) => (link ? h('button', { class: cls, onclick: () => window.e2k.openExternal(link.url) }, link.label) : null);
  function showBanner() {
    $('#notice')?.remove();
    const n = notices.important;
    if (!n || noticeSeen(n.id)) return;
    const bar = h('div', { class: 'notice', id: 'notice', role: 'region', 'aria-label': 'Important notice' },
      h('span', { class: 'ni', 'aria-hidden': 'true' }, '!'), h('span', { class: 'nt' }, n.text), noticeLink(n.link, 'nl'),
      h('button', { class: 'nx', title: 'Close', 'aria-label': 'Close notice', onclick: () => { closeNotice(n.id); bar.remove(); fitHome(); } }, '✕'));
    $('.stage').before(bar);
    fitHome();
  }
  function showNews(canvas = $('.home-canvas')) {
    if (!canvas) return;
    canvas.querySelector('.news')?.remove();
    const n = notices.news;
    if (!n || noticeSeen(n.id)) return;
    const strip = h('div', { class: 'news', role: 'region', 'aria-label': 'News' },
      h('small', {}, 'NEWS'), h('span', { title: n.text }, n.text), noticeLink(n.link, 'more'),
      h('button', { class: 'x', title: 'Close', 'aria-label': 'Close news', onclick: () => {
        closeNotice(n.id);
        strip.classList.add('gone');
        setTimeout(() => { strip.remove(); if (!store.get('newsHintShown', false)) newsHint(canvas); }, 150);
      } }, '✕'));
    // Before Explore in the page, so Tab reaches it where it's seen (above Explore), not after the Almanac.
    canvas.insertBefore(strip, canvas.querySelector('.shelf'));
  }
  // Where news can be turned off, once: in the news strip's place, until it fades (not while pointed at or focused).
  function newsHint(canvas) {
    store.set('newsHintShown', true);
    let timer = 0;
    const hide = () => { clearTimeout(timer); hint.classList.add('gone'); setTimeout(() => hint.remove(), 400); };
    const later = () => { clearTimeout(timer); timer = setTimeout(hide, 8000); };
    const hint = h('div', { class: 'newshint', role: 'status' },
      h('span', {}, 'You can turn off news anytime in ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); hide(); E2KOptions.open(E2K, 'Privacy', 'News'); } }, 'Options'), '.'),
      h('button', { class: 'x', title: 'Close', 'aria-label': 'Close', onclick: () => hide() }, '✕'));
    hint.addEventListener('mouseenter', () => clearTimeout(timer));
    hint.addEventListener('focusin', () => clearTimeout(timer));
    hint.addEventListener('mouseleave', later);
    hint.addEventListener('focusout', later);
    canvas.insertBefore(hint, canvas.querySelector('.shelf'));
    later();
  }
  window.e2k.notice.onChange((n) => { notices = n || notices; showBanner(); showNews(); });
  window.e2k.notice.get().then((n) => { notices = n || notices; showBanner(); showNews(); }).catch(() => {});

  // ---------- updates ----------
  // The installed app downloads new versions in the background (updater.js); the status bar offers to restart when one is ready.
  const updateBar = $('#updatebar');
  // The Windows portable updates itself on its drive, as the user chose on its first run (updater.js): Download (unless
  // it downloads by itself), then Restart Now or Update on Close. ✕ hides a version's notice until the next one.
  // Everything else (the installed app, Mac, Linux) is handled after this, as before.
  const releasePage = (version) => window.e2k.openExternal(`https://github.com/sburton0/encyclopedia-2000/releases/tag/v${version}`);
  function showSelfUpdate(s) {
    const v = prettyVersion(s.version);
    let shown = true;
    if (s.state === 'available' && store.get('updateHidden', '') !== s.version) {
      updateBar.replaceChildren(`Version ${v} is available`, h('button', { onclick: () => selfDownload(s) }, 'Download'),
        h('button', { class: 'ux', title: 'Hide until the next version', 'aria-label': 'Hide until the next version',
          onclick: () => { store.set('updateHidden', s.version); updateBar.hidden = true; } }, '✕'));
      updateBar.title = 'Downloads the new version to this drive, next to this one. Nothing is installed on this computer.';
    } else if (s.state === 'downloading') {
      updateBar.replaceChildren(`Downloading version ${v} · ${s.percent || 0}%`);
      updateBar.title = '';
    } else if (s.state === 'ready' && !s.onQuit) {
      updateBar.replaceChildren(`Version ${v} is ready`, h('button', { onclick: () => window.e2k.update.install() }, 'Restart Now'),
        h('button', { onclick: () => window.e2k.update.installOnQuit() }, 'Update on Close'));
      updateBar.title = 'Restart Now starts the new version; Update on Close switches to it when you close Encyclopedia 2000.';
    } else shown = false;
    updateBar.hidden = !shown;
    if (s.failed) dialog('Update Encyclopedia 2000', 'The update couldn’t be finished', [s.failed,
      'Nothing has changed: the version you have still works. You can try again from the status bar.']);
  }
  function readOnlyDrive(s) {
    dialog('Update Encyclopedia 2000', 'This drive can’t be updated', [
      'Encyclopedia 2000 is running from a drive it can’t save to (it may be locked, or a DVD).',
      `To update, download version ${prettyVersion(s.version)} from the website and copy it onto a drive you can write to.`],
    [['Open the Download Page', () => window.e2k.update.install(), true], ['Not Now']]);
  }
  const selfDownload = (s) => (s.readonly ? readOnlyDrive(s) : window.e2k.update.download());
  // Help › Check for Updates on the portable: the same choices as the status bar, plus the website and deleting a
  // downloaded update.
  function selfUpdateDialog(s) {
    const title = 'Check for Updates', v = prettyVersion(s.version);
    if (s.state === 'available' && s.readonly) return readOnlyDrive(s);
    if (s.state === 'available') {
      return dialog(title, 'A new version is available', [
        `Version ${v} is ready to download (${Math.ceil((s.size || 0) / 1048576)} MB). It downloads to this drive, next to the version you’re using, and nothing is installed on this computer.`,
        h('p', { class: 'fine' }, 'Or download it yourself from the website and use it in place of this copy. Keep the “Encyclopedia 2000 Data” folder next to it to keep your settings.')],
      [['Download', () => selfDownload(s), true], ['Download from Website…', () => releasePage(s.version)], ['Later']]);
    }
    if (s.state === 'ready') {
      return dialog(title, 'An update is ready', [
        `Version ${v} is downloaded and saved on this drive, next to the version you’re using.`,
        'Restart now to start using it, or it takes this version’s place when you close Encyclopedia 2000. If you’d rather not have it, delete it.'],
      [['Restart Now', () => window.e2k.update.install(), true], ['Update on Close', () => window.e2k.update.installOnQuit()], ['Delete Update', () => window.e2k.update.discard()]]);
    }
    return dialog(title, 'An update is on its way', [`Version ${v} is downloading. Restart Now appears in the status bar when it’s ready.`]);
  }
  // The portable's first run (and its first run of 0.5.4): whether to check for updates, and whether to download and
  // install them by itself. Only its buttons answer it (Escape is Don't Check, which also turns news off); a click outside
  // does nothing. If it goes away unanswered some other way, nothing is saved, nothing is contacted, and it asks again
  // at the next start (Scott, 2026-11-08: a click outside used to count as Don't Check, and it never asked again).
  async function askAboutUpdates() {
    const main = await window.e2k.settings.get().catch(() => ({}));
    if (!main.portableSelf || main.updateAsked) return;
    const esc = (e) => {
      if (e.key !== 'Escape' || !ov.isConnected) return;
      e.preventDefault(); e.stopImmediatePropagation();
      ov.querySelector('.df .go:not(.default)').click();   // Don't Check
    };
    const answer = async (on) => {
      document.removeEventListener('keydown', esc, true);
      // Don't Check means the app contacts nothing by itself: news goes off too (it can be turned on in Options).
      await window.e2k.settings.set({ autoUpdate: on, autoInstall: on && auto.checked, updateAsked: true, ...(on ? {} : { showNews: false }) });
      window.e2k.update.settingsChanged();
      window.e2k.notice.refresh();
      if (on) window.e2k.update.check().then(showUpdate).catch(() => {});
    };
    const auto = h('input', { type: 'checkbox' });
    dialog('Encyclopedia 2000', 'Check for updates automatically?', [
      'Once a day, along with news and important notices. You can also check anytime in Help › Check for Updates.',
      h('label', { class: 'askauto' }, auto, h('span', {}, 'Also update automatically')),
      h('p', { class: 'fine' }, 'You can change this anytime in Options.'),
    ], [['Check for Updates', () => answer(true), true], ['Don’t Check', () => answer(false)]], { stay: true });
    const ov = $$('.overlay').at(-1);
    ov.querySelector('.dialog').classList.add('askupdate');
    document.addEventListener('keydown', esc, true);
  }

  function showUpdate(s) {
    if (s.self) return showSelfUpdate(s);
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
    if (isOffline()) return dialog('Check for Updates', 'You’re in Offline mode', ['Go online from the status bar to check for updates.']);
    setStatus('Checking for updates…', true);
    const s = await window.e2k.update.check().catch(() => ({ state: 'error' }));
    setIdle();
    showUpdate(s);
    const title = 'Check for Updates';
    if (s.self && ['available', 'ready', 'downloading'].includes(s.state)) return selfUpdateDialog(s);
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
    else {
      // What went wrong, in a small Details line, so a problem can be reported exactly. A copy missing its update file
      // (Mac 0.4.1 and 0.4.2 shipped that way) can't ever check, so it says where to get a working one.
      const msg = s.message || '';
      const broken = /app-update\.yml/.test(msg);
      dialog(title, 'Couldn’t check for updates', [
        broken ? 'This copy of Encyclopedia 2000 can’t check for updates. Download the newest version from encyclopedia2000.com, and updates will work again.'
          : Wiki.connected() ? 'The update server didn’t respond. Please try again later.' : 'You’re offline. Connect to the internet and try again.',
        msg ? h('p', { class: 'fine' }, `Details: ${msg}`) : null].filter(Boolean),
      broken ? [['Open the Website', () => window.e2k.openExternal('https://encyclopedia2000.com'), true], ['Close']] : undefined);
    }
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
        // A downloaded article's sounds come with their details (it.info: the downloaded copy, its length and credit).
        items.push({ type: it.type, file: it.title, caption, sources: it.sources || [], info: it.info || null });
      }
    }
    const av = items.filter((m) => m.type !== 'image');
    // The others' details from Commons. Without them (offline, say) those videos and sounds are left out.
    const ask = av.filter((m) => !m.info), info = {};
    for (let i = 0; i < ask.length; i += 50) {
      try { Object.assign(info, await Wiki.fileInfo(ask.slice(i, i + 50).map((m) => m.file))); } catch {}
    }
    for (const m of av) {
      const ii = m.info || info[m.file];
      delete m.info;
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
      const name = caption || (file || '').replace(/^(File|Image):/i, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' ');
      s.replaceWith(h('button', { class: 'vthumb', title: 'Play video', 'aria-label': name ? 'Play video: ' + name : 'Play video', onclick: open },
        poster ? h('img', { src: poster, alt: name, loading: 'lazy' }) : null,
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
        // Only the one on screen: a video left behind for the next one pauses as it goes, and says so after the next one
        // has started, which would bring back the Play button over it.
        toggle = wireMedia(el, { ...parts, duration: m.duration, onState: (on) => { if (el.isConnected) stage.classList.toggle('playing', on); } });
        el.addEventListener('error', () => stage.append(h('div', { class: 'merr' }, 'This file can’t be played right now.')));
        const big = h('button', { class: 'big', title: 'Play', onclick: toggle }, icon('play'));
        if (m.type === 'video') {
          el.addEventListener('click', toggle);
          stage.append(el, big);
        } else if (m.art) {
          // The article's picture, over a soft, darkened copy of itself; the waveform and the title beneath it.
          stage.classList.add('art');
          const pic = h('img', { class: 'cover', src: m.art, alt: '' });
          pic.addEventListener('error', () => stage.classList.remove('art'));
          stage.append(h('div', { class: 'coverbg', style: bg(m.art) }), pic, waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
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
  // Favorites are a tree: a favorite is { title, desc }; a folder is { folder: name, id, open, items }, up to three
  // levels deep. A list saved before folders (0.5) is the same tree without any. Folders come first in each list; a new
  // favorite goes below them.
  const favs = () => store.get('favorites', []);
  const FOLDER_DEPTH = 3;
  function walkFavs(list, fn, path = []) {
    for (const n of list) {
      if (fn(n, path) === false) return false;
      if (n.items && walkFavs(n.items, fn, [...path, n]) === false) return false;
    }
  }
  const favTitles = (list = favs()) => { const out = []; walkFavs(list, (n) => { if (n.title) out.push(n.title); }); return out; };
  // Where a favorite or folder is: its list, its place in it, and the folders it's in.
  function locate(root, test) {
    let at = null;
    walkFavs(root, (n, path) => { if (!test(n)) return; at = { node: n, path, list: path.length ? path[path.length - 1].items : root }; return false; });
    if (at) at.i = at.list.indexOf(at.node);
    return at;
  }
  const sameTitle = (a, b) => a.toLowerCase() === b.toLowerCase();
  const favAt = (root, title) => locate(root, (n) => n.title && sameTitle(n.title, title));
  const folderAt = (root, id) => (id ? locate(root, (n) => n.items && n.id === id) : null);
  const isFavTitle = (t) => !!favAt(favs(), t);
  const isFav = () => !!current && isFavTitle(current.title);
  const afterFolders = (list) => { let i = 0; while (i < list.length && list[i].items) i++; return i; };
  function saveFavs(root) { store.set('favorites', root); updateToolbar(); refreshMyPage(); }
  // Adds a favorite (or moves one already there) into a folder, or the top level. Returns the folder's name.
  function addFav(title, desc = '', folderId = null) {
    const root = favs();
    const old = favAt(root, title);
    const node = old ? old.node : { title, desc };
    if (old) old.list.splice(old.i, 1);
    const f = folderAt(root, folderId);
    if (f) f.node.open = true;
    const list = f ? f.node.items : root;
    list.splice(afterFolders(list), 0, node);
    saveFavs(root);
    return f ? f.node.folder : null;
  }
  function removeFav(title) {
    const root = favs();
    const at = favAt(root, title);
    if (at) { at.list.splice(at.i, 1); saveFavs(root); }
  }
  function toggleFav() {
    if (!current) return;
    if (isFav()) { removeFav(current.title); setIdle(`Removed “${current.title}” from Favorites`); }
    else { addFav(current.title, current.desc); setIdle(`Added “${current.title}” to Favorites`); }
    updateToolbar();
  }
  // Folders: a new one is called "New folder" (renamed in place), after the folders already in its list.
  const levelsIn = (n) => (n.items ? 1 + Math.max(0, ...n.items.map(levelsIn)) : 0);
  const favCount = (n) => { let c = 0; walkFavs(n.items || [], (x) => { if (x.title) c++; }); return c; };
  function newFolder(parentId = null) {
    const root = favs();
    const p = folderAt(root, parentId);
    if (p && p.path.length + 2 > FOLDER_DEPTH) return null;
    const list = p ? p.node.items : root;
    const names = new Set(list.filter((n) => n.items).map((n) => n.folder.toLowerCase()));
    let name = 'New folder';
    for (let k = 2; names.has(name.toLowerCase()); k++) name = `New folder (${k})`;
    const node = { folder: name, id: Math.random().toString(36).slice(2, 10), open: true, items: [] };
    if (p) p.node.open = true;
    list.splice(afterFolders(list), 0, node);
    saveFavs(root);
    return node.id;
  }
  function renameFolder(id, name) {
    const root = favs();
    const f = folderAt(root, id);
    name = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (f && name && name !== f.node.folder) { f.node.folder = name; saveFavs(root); }
  }
  function setFolderOpen(id, open) {
    const root = favs();
    const f = folderAt(root, id);
    if (f) { f.node.open = open; store.set('favorites', root); }
  }
  // Moves a favorite ('a:' and its title) or a folder ('f:' and its id) into a folder (null: the top level). A folder
  // can't go inside itself, and the result can't be more than three levels deep.
  function canMove(key, folderId) {
    if (!key.startsWith('f:')) return true;
    const root = favs();
    const f = folderAt(root, key.slice(2));
    if (!f) return false;
    if (!folderId) return true;
    if (folderId === f.node.id || locate(f.node.items, (n) => n.id === folderId)) return false;
    const to = folderAt(root, folderId);
    return !!to && to.path.length + 1 + levelsIn(f.node) <= FOLDER_DEPTH;
  }
  function moveFav(key, folderId) {
    if (!canMove(key, folderId)) return false;
    const root = favs();
    const at = key.startsWith('f:') ? folderAt(root, key.slice(2)) : favAt(root, key.slice(2));
    if (!at) return false;
    at.list.splice(at.i, 1);
    const to = folderAt(root, folderId);
    if (to) to.node.open = true;
    const list = to ? to.node.items : root;
    list.splice(at.node.items ? afterFolders(list) : list.length, 0, at.node);
    saveFavs(root);
    return true;
  }
  function deleteFolder(id) {
    const root = favs();
    const f = folderAt(root, id);
    if (!f) return;
    const n = favCount(f.node), name = f.node.folder;
    const go = () => { const r = favs(); const g = folderAt(r, id); if (g) { g.list.splice(g.i, 1); saveFavs(r); setIdle(`Deleted the folder “${name}”`); } };
    if (!f.node.items.length) return go();
    dialog('Delete Folder', `Delete the folder “${name}”?`, [
      n ? `The ${n === 1 ? 'favorite' : `${n} favorites`} in it will be removed from Favorites too.` : 'The folders in it will be deleted too.',
      'Downloaded articles stay downloaded.'], [['Delete Folder', go, true], ['Cancel']]);
  }
  // ---------- history ----------
  // Every article read, newest first: { t: title, at: time }, once a day per article (reading it again the same day
  // moves it to the top). Recently viewed is its newest twelve. The list from before history (0.5's twelve recent
  // titles) carries over with no times, under Earlier. History can be paused (Options on the History page).
  const HISTORY_MAX = 5000;
  function history() {
    let list = store.get('history', null);
    if (!list) { list = store.get('recent', []).map((t) => ({ t, at: 0 })); store.set('history', list); }
    return list;
  }
  const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function recentTitles(n = 12) {
    const seen = new Set(), out = [];
    for (const e of history()) { const k = e.t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e.t); if (out.length >= n) break; } }
    return out;
  }
  // What's known of an article for lists: its short description and picture, kept from when it was last open (or
  // looked up when a list needs it).
  const INFO_MAX = 3000;
  const infoOf = (t) => store.get('articleInfo', {})[t.toLowerCase()] || null;
  function keepInfo(t, desc, thumb) {
    const all = store.get('articleInfo', {});
    const k = t.toLowerCase();
    if (all[k] && all[k].desc === desc && all[k].thumb === thumb) return;
    delete all[k];
    all[k] = { desc: desc || '', thumb: thumb || '' };
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - INFO_MAX))) delete all[old];
    store.set('articleInfo', all);
  }
  function addRecent(title) {
    if (current) keepInfo(title, current.desc, current.thumb);
    if (store.get('historyPaused', false)) return;
    const now = Date.now(), today = dayStart(now);
    const list = history().filter((e) => !(sameTitle(e.t, title) && e.at >= today));
    list.unshift({ t: title, at: now });
    store.set('history', list.slice(0, HISTORY_MAX));
  }
  function removeHistory(title) {
    store.set('history', history().filter((e) => !sameTitle(e.t, title)));
    historyChanged();
  }
  // Clear History: the last hour, today, or everything (Recently viewed too: they're the same list).
  function clearHistoryDialog() {
    let pick = 'hour';
    const opt = (v, label) => h('label', { class: 'cradio' }, h('input', { type: 'radio', name: 'clearh', value: v, checked: v === pick, onchange: () => { pick = v; } }), label);
    dialog('Clear History', 'Clear your history?', [
      h('div', { class: 'cradios', role: 'radiogroup', 'aria-label': 'What to clear' }, opt('hour', 'The last hour'), opt('today', 'Today'), opt('all', 'Everything')),
      'Recently viewed in My Articles is cleared too. Favorites and downloaded articles stay as they are.',
    ], [['Clear History', () => {
      const since = pick === 'all' ? -Infinity : pick === 'today' ? dayStart(Date.now()) : Date.now() - 3600e3;
      store.set('history', pick === 'all' ? [] : history().filter((e) => e.at < since));
      historyChanged();
      setIdle(pick === 'all' ? 'Cleared your history' : pick === 'today' ? 'Cleared today’s history' : 'Cleared the last hour of history');
    }, true], ['Cancel']], { cls: 'clearh' });
  }
  function historyChanged() { drawFavPane(); refreshMyPage(); }

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

  // ---------- My Articles pane ----------
  // Opens over any screen from the toolbar's My Articles button, the Favorites menu, or Ctrl+I: Favorites (in folders),
  // Downloaded, and Recently viewed, each searchable. A click outside closes it, unless it's pinned: then it sits beside
  // the page and stays open. Its edge can be dragged to make it wider (remembered).
  const fpane = $('#fpane');
  const stage = $('.stage');
  const FAVS_SHOWN = 8;
  let dlShowAll = false, paneQuery = '', renaming = null, paneReturn = null, dragKey = null;
  let dlList = [], dlIndex = new Map(), dlLoaded = false;
  const paneWidth = () => Math.min(480, Math.max(220, store.get('paneWidth', 250)));
  const pinned = () => !!store.get('panePinned', false);
  stage.style.setProperty('--fpw', paneWidth() + 'px');
  // A downloaded copy, or the download in progress, of an article.
  const dlEntry = (t) => dlIndex.get(t.toLowerCase());
  const dlJob = (t) => downloadJobs.find((j) => sameTitle(j.title, t));
  async function loadDownloaded() {
    dlList = await saved.list().catch(() => []);
    dlIndex = new Map(dlList.map((e) => [e.title.toLowerCase(), e]));
    dlLoaded = true;
    drawFavPane();
    refreshMyPage();
  }
  const MARK_GET = '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6v5.4M5.5 7.7 8 10.2l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
  const MARK_DONE = '<circle cx="8" cy="8" r="7" fill="#3fb36a"/><path d="M4.4 8.3l2.4 2.4 4.8-5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  const markSvg = (inner) => { const s = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.innerHTML = inner; return s; };
  // An article's download state at the right of its row: the green check (downloaded), a ring (downloading), or a
  // button that downloads it.
  function markFor(t) {
    const job = dlJob(t);
    if (job) {
      const pct = Math.round((job.done / Math.max(job.total, 1)) * 100);
      return h('span', { class: 'mark ring', role: 'img', 'aria-label': `Downloading, ${pct}%`, title: `Downloading… ${pct}%`, 'data-mark': t },
        markSvg(`<circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/><circle cx="8" cy="8" r="6" fill="none" stroke="#7fd18b" stroke-width="2" stroke-dasharray="${(pct / 100 * 37.7).toFixed(1)} 40" transform="rotate(-90 8 8)"/>`));
    }
    const e = dlEntry(t);
    if (e) return h('span', { class: 'mark done', role: 'img', 'aria-label': 'Downloaded', title: `Downloaded · ${mb(e.size)}. It opens without the internet.`, 'data-mark': t }, markSvg(MARK_DONE));
    return h('button', { class: 'mark get', title: `Download “${t}”`, 'aria-label': `Download ${t}`, 'data-mark': t, onclick: () => downloadTitle(t) }, markSvg(MARK_GET));
  }
  // Progress redraws only the marks, so nothing else in the pane moves (or loses the keyboard focus).
  function refreshMarks() {
    for (const m of $$('[data-mark]')) {
      const t = m.dataset.mark, next = markFor(t);
      if (next.className !== m.className || next.title !== m.title) {
        const had = m === document.activeElement;
        m.replaceWith(next);
        if (had) (next.matches('button') ? next : next.closest('.frow')?.querySelector('.lnk'))?.focus();
      }
    }
  }
  // The words searched for, marked in a title.
  function marked(t) {
    const q = paneQuery.toLowerCase(), k = q ? t.toLowerCase().indexOf(q) : -1;
    return k < 0 ? [t] : [t.slice(0, k), h('mark', {}, t.slice(k, k + q.length)), t.slice(k + q.length)];
  }
  // A row for an article: its title (opens it), then its download state, then (Recently viewed) ✕ to remove it.
  function artRow(key, t, { star = false, level = 0, mark = true, remove = null } = {}) {
    const row = h('div', { class: 'frow' + (current && sameTitle(t, current.title) ? ' here' : ''), 'data-key': key, style: `--lv:${level}`, draggable: 'true' },
      h('button', { class: 'lnk' + (star ? '' : ' plain'), title: t, onclick: () => openArticle(t) }, star ? icon('star') : null, h('span', { class: 't' }, marked(t))),
      mark ? markFor(t) : null,
      remove ? h('button', { class: 'rx', title: `Remove “${t}” from Recently viewed`, 'aria-label': `Remove ${t} from Recently viewed`, onclick: remove }, '✕') : null);
    dragFrom(row, key);
    return row;
  }
  function dragFrom(row, key) {
    row.addEventListener('dragstart', (e) => { dragKey = key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key.slice(2)); });
    row.addEventListener('dragend', () => { dragKey = null; $$('.drop').forEach((x) => x.classList.remove('drop')); });
  }
  // Dropping on a folder (or the Favorites heading, for the top level) moves a favorite or folder there; an article
  // from Downloaded or Recently viewed becomes a favorite in it.
  function dropOn(el, folderId) {
    const ok = () => dragKey && (/^[dr]:/.test(dragKey) || (dragKey !== 'f:' + folderId && canMove(dragKey, folderId)));
    el.addEventListener('dragover', (e) => { if (!ok()) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop'); });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop');
      const key = dragKey;
      if (!key || !ok()) return;
      const to = folderAt(favs(), folderId)?.node.folder;
      if (/^[dr]:/.test(key)) { addFav(key.slice(2), dlEntry(key.slice(2))?.desc || '', folderId); setIdle(`Added “${key.slice(2)}” to ${to ? `the folder “${to}”` : 'Favorites'}`); }
      else if (moveFav(key, folderId)) setIdle(`Moved to ${to ? `the folder “${to}”` : 'Favorites (no folder)'}`);
    });
  }
  function folderRow(n, level) {
    const key = 'f:' + n.id;
    const count = favCount(n);
    const name = renaming === n.id
      ? h('input', { class: 'ren', value: n.folder, 'aria-label': 'Folder name', maxlength: '80',
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = n.folder; e.target.blur(); } },
        onblur: (e) => { renaming = null; renameFolder(n.id, e.target.value); drawFavPane(); focusRow(key); },
        onclick: (e) => e.stopPropagation(), onmousedown: (e) => e.stopPropagation() })
      : h('span', { class: 't' }, marked(n.folder));
    const row = h('button', { class: 'fold', 'data-key': key, style: `--lv:${level}`, draggable: renaming === n.id ? 'false' : 'true', 'aria-expanded': String(!!n.open),
      title: `${n.folder}: ${count === 1 ? '1 favorite' : `${count} favorites`}`,
      onclick: () => { if (renaming === n.id) return; setFolderOpen(n.id, !n.open); drawFavPane(); } },
    h('span', { class: 'tw', 'aria-hidden': 'true' }, n.open ? '▼' : '▶'), icon('folder'), name, h('span', { class: 'c' }, String(count)));
    dragFrom(row, key);
    dropOn(row, n.id);
    return row;
  }
  // A downloaded category in the pane: a stack of pages, with how many of its articles are downloaded.
  function catRow(c, n) {
    const busy = dlQueue.filter((x) => x.label === c.name).length;
    return h('button', { class: 'fold grp', 'data-key': 'c:' + c.name, 'aria-expanded': String(!!c.open),
      title: `${c.name}: a Wikipedia category, ${n === 1 ? '1 article' : `${n} articles`} downloaded${busy ? `, ${busy} to go` : ''}`,
      onclick: () => { store.set('dlCategories', dlCats().map((x) => (x.name === c.name ? { ...x, open: !x.open } : x))); drawFavPane(); } },
    h('span', { class: 'tw', 'aria-hidden': 'true' }, c.open ? '▼' : '▶'), icon('stack'), h('span', { class: 't' }, marked(c.name)), h('span', { class: 'c' }, busy ? `${n}/${n + busy}` : String(n)));
  }
  function favRows(list, level = 0) {
    return list.flatMap((n) => (n.items ? [folderRow(n, level), ...(n.open ? favRows(n.items, level + 1) : [])] : [artRow('a:' + n.title, n.title, { star: true, level })]));
  }
  const paneHead = (title, extra) => h('h4', { class: 'wb' }, h('span', {}, title), extra ? h('span', { class: 'hbtns' }, extra) : null);
  const found = (n) => h('span', { class: 'hc' }, n ? `${n} found` : 'None found');
  function drawFavPane() {
    if (fpane.hidden) return;
    if (!fpane.firstChild) buildPane();
    if (renaming && $('input.ren', fpane)) return;
    const focusedKey = fpane.contains(document.activeElement) && document.activeElement.closest('[data-key]')?.dataset.key;
    const root = favs();
    const recent = recentTitles();
    const q = paneQuery.toLowerCase();
    const body = [];
    if (q) {
      // Searching: the favorites that match, each under the folder it's in; then the downloaded and recently viewed ones.
      const hits = [];
      walkFavs(root, (n, path) => { if (n.title && n.title.toLowerCase().includes(q)) hits.push({ n, where: path.map((p) => p.folder).join(' › ') }); });
      body.push(paneHead('Favorites', found(hits.length)));
      let last = null;
      for (const { n, where } of hits) {
        if (where && where !== last) body.push(h('span', { class: 'path' }, where));
        last = where;
        body.push(artRow('a:' + n.title, n.title, { star: true }));
      }
      const dl = dlList.filter((e) => e.title.toLowerCase().includes(q));
      body.push(h('hr'), paneHead('Downloaded', found(dl.length)), ...dl.map((e) => artRow('d:' + e.title, e.title, { mark: false })));
      const rv = recent.filter((t) => t.toLowerCase().includes(q));
      body.push(h('hr'), paneHead('Recently viewed', found(rv.length)), ...rv.map((t) => artRow('r:' + t, t, { remove: () => removeRecent(t) })));
    } else {
      if (current) {
        const fav = isFav();
        body.push(h('div', { class: 'addrow' },
          h('button', { class: 'add', title: fav ? 'Remove from Favorites (Ctrl+D)' : 'Add to Favorites (Ctrl+D)', onclick: () => toggleFav() },
            icon('star'), h('span', {}, fav ? `Remove “${current.title}” from Favorites` : `Add “${current.title}” to Favorites`)),
          h('button', { class: 'addto', title: fav ? 'Move it to a folder' : 'Add it to a folder', 'aria-label': fav ? 'Move it to a folder' : 'Add it to a folder', 'aria-haspopup': 'menu',
            onclick: (e) => { const t = current.title, d = current.desc; folderPicker(e.currentTarget.parentElement, t, (id) => { const f = addFav(t, d, id); setIdle(`${fav ? 'Moved' : 'Added'} “${t}” to ${f ? `the folder “${f}”` : 'Favorites'}`); }); } }, '▾')));
      }
      const titles = favTitles(root);
      const missing = titles.filter((t) => !dlEntry(t) && !dlJob(t));
      const head = paneHead('Favorites', [h('button', { class: 'newf', title: 'Make a folder for favorites', onclick: () => { renaming = newFolder(); drawFavPane(); } }, 'New folder'),
        dlLoaded && missing.length ? h('button', { class: 'newf', title: 'Download the favorites that aren’t downloaded yet', onclick: () => downloadAllDialog(titles, null) }, 'Download all') : null]);
      dropOn(head, null);
      body.push(head);
      if (root.length) body.push(...favRows(root));
      else body.push(h('div', { class: 'note' }, 'Open an article and click “Add to Favorites” to keep it here.'));
      if (dlList.length) {
        const total = dlList.reduce((n, e) => n + (e.size || 0), 0);
        // Downloaded categories first, as groups (closed until opened), then the articles downloaded on their own.
        const groups = dlCats().map((c) => ({ c, got: catDownloaded(c) })).filter((g) => g.got.length || dlQueue.some((x) => x.label === g.c.name));
        const inGroup = new Set(groups.flatMap((g) => g.got.map((t) => t.toLowerCase())));
        const loose = dlList.filter((e) => !inGroup.has(e.title.toLowerCase()));
        const shown = dlShowAll ? loose : loose.slice(0, FAVS_SHOWN);
        body.push(h('hr'), paneHead('Downloaded', h('span', { class: 'hc' }, mb(total))),
          ...groups.flatMap((g) => [catRow(g.c, g.got.length), ...(g.c.open ? g.got.map((t) => artRow('d:' + t, t, { mark: false, level: 1 })) : [])]),
          ...shown.map((e) => artRow('d:' + e.title, e.title, { mark: false })),
          loose.length > FAVS_SHOWN ? h('button', { class: 'more', onclick: () => { dlShowAll = !dlShowAll; drawFavPane(); } }, dlShowAll ? 'Show fewer' : `Show all (${loose.length})`) : null,
          h('div', { class: 'savednote' }, markSvg(MARK_DONE), 'Downloaded articles open without the internet.'));
      }
      if (recent.length) {
        body.push(h('hr'), paneHead('Recently viewed', h('button', { class: 'newf', title: 'Clear the list of recently viewed articles', onclick: clearRecent }, 'Clear all')),
          ...recent.map((t) => artRow('r:' + t, t, { remove: () => removeRecent(t) })));
      }
    }
    $('.fb', fpane).replaceChildren(...body.filter(Boolean));
    if (renaming) { const r = $('input.ren', fpane); if (r) { r.focus(); r.select(); r.scrollIntoView({ block: 'nearest' }); } }
    else if (focusedKey) focusRow(focusedKey);
  }
  function focusRow(key) {
    const row = $$('[data-key]', fpane).find((r) => r.dataset.key === key);
    (row?.matches('button') ? row : row?.querySelector('.lnk'))?.focus({ preventScroll: true });
  }
  // The pane's fixed parts: the title bar (pin, close), the search box, the list, the footer, and the edge to drag.
  function buildPane() {
    const find = h('input', { type: 'search', placeholder: 'Search favorites and downloads', 'aria-label': 'Search favorites and downloads', spellcheck: 'false',
      oninput: (e) => { paneQuery = e.target.value.trim(); drawFavPane(); },
      onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; paneQuery = ''; drawFavPane(); } } });
    const pin = h('button', { class: 'pin', onclick: () => setPinned(!pinned()) }, icon('pin'));
    const grip = h('div', { class: 'fgrip', title: 'Drag to make the pane wider or narrower', 'aria-hidden': 'true' });
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const x0 = e.clientX, w0 = paneWidth();
      document.body.classList.add('resizing');
      const move = (ev) => { const w = Math.min(480, Math.max(220, w0 + ev.clientX - x0)); stage.style.setProperty('--fpw', w + 'px'); store.set('paneWidth', w); };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.classList.remove('resizing'); if (pinned()) dispatchEvent(new Event('resize')); };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
    fpane.append(
      h('div', { class: 'fh' }, icon('books'), h('span', {}, 'My Articles'), pin,
        h('button', { class: 'exp', title: 'Open as a page (Ctrl+B)', 'aria-label': 'Open My Articles as a page', onclick: () => { if (!pinned()) toggleFavPane(false); go('myarticles/favorites'); } }, icon('expand')),
        h('button', { title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => toggleFavPane(false) }, winIcon('close'))),
      h('div', { class: 'pfind' }, icon('search'), find),
      h('div', { class: 'fb' }),
      h('div', { class: 'ff' }, h('span', {}, `${keyText('Ctrl+I')} opens and closes this pane`),
        h('button', { class: 'more open', onclick: () => { if (!pinned()) toggleFavPane(false); go('myarticles/favorites'); } }, 'Open as a page ›')),
      grip);
    drawPin();
  }
  function drawPin() {
    const b = $('.fh .pin', fpane);
    if (b) { b.title = pinned() ? 'Unpin: close the pane when clicking outside it' : 'Pin: keep the pane open beside the page'; b.setAttribute('aria-pressed', String(pinned())); b.classList.toggle('on', pinned()); }
    stage.classList.toggle('pinned', pinned() && !fpane.hidden);
  }
  function setPinned(on) {
    store.set('panePinned', on);
    drawPin();
    dispatchEvent(new Event('resize'));
  }
  function toggleFavPane(open = fpane.hidden) {
    if (open && fpane.hidden) paneReturn = document.activeElement;
    fpane.hidden = !open;
    if (!open) { dlShowAll = false; renaming = null; }
    else if (!dlLoaded) loadDownloaded();
    const wasPinned = stage.classList.contains('pinned');
    drawPin();
    if (wasPinned !== stage.classList.contains('pinned')) dispatchEvent(new Event('resize'));
    updateToolbar();
    // Opened, the keyboard is in its search box; closed, it goes back where it was.
    if (open) $('.pfind input', fpane)?.focus({ preventScroll: true });
    if (!open && fpane.contains(document.activeElement)) (paneReturn?.isConnected && paneReturn !== document.body ? paneReturn : $('.tbtn[data-cmd="favpane"]')).focus({ preventScroll: true });
  }
  // A click anywhere else closes the pane (unless pinned): not on its own button, a menu, a dialog, or a scroll bar.
  document.addEventListener('mousedown', (e) => {
    if (fpane.hidden || pinned() || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element) || fpane.contains(t) || t.closest('.tbtn[data-cmd="favpane"], .menu, .overlay, #menubar, .rmenu')) return;
    if (t.clientWidth && e.offsetX > t.clientWidth) return;
    toggleFavPane(false);
  }, true);
  // Recently viewed is the newest of History: removing one removes it from History; Clear all clears History.
  const removeRecent = (t) => removeHistory(t);
  const clearRecent = () => clearHistoryDialog();
  // A menu of folders under a button or row: where to add (or move) a favorite. The folder it's in now is checked.
  function folderPicker(anchor, title, onPick) {
    closeCtx();
    const root = favs();
    const at = title && favAt(root, title);
    const inId = at ? (at.path.length ? at.path[at.path.length - 1].id : '') : undefined;
    const items = [['Favorites (no folder)', () => onPick(null), '', inId === undefined ? null : inId === '']];
    const sub = [];
    walkFavs(root, (n, path) => { if (n.items) sub.push([' '.repeat(path.length) + n.folder, () => onPick(n.id), '', inId === undefined ? null : inId === n.id]); });
    if (sub.length) items.push('-', ...sub);
    items.push('-', ['New folder…', () => { const id = newFolder(null); onPick(id); renaming = id; drawFavPane(); }]);
    const box = h('div', { class: 'menu ctx', role: 'menu', 'aria-label': 'Folders', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() });
    menuItems(box, items, (cmd) => { closeCtx(); runCmd(cmd); });
    document.body.append(box);
    ctxMenu = box;
    ctxReturn = document.activeElement;
    const r = anchor.getBoundingClientRect();
    box.style.minWidth = Math.round(r.width) + 'px';
    box.style.left = Math.max(2, Math.min(r.left, innerWidth - box.offsetWidth - 2)) + 'px';
    box.style.top = (r.bottom + box.offsetHeight + 2 > innerHeight ? Math.max(2, r.top - box.offsetHeight - 2) : r.bottom + 2) + 'px';
    $('.mi', box)?.focus({ preventScroll: true });
  }
  // The right-click menu of a row in the pane.
  function paneCtx(row, e) {
    const key = row.dataset.key, kind = key[0], v = key.slice(2);
    if (kind === 'c') {
      const c = dlCats().find((x) => x.name === v);
      if (!c) return [];
      return [[c.open ? 'Close' : 'Open', () => { store.set('dlCategories', dlCats().map((x) => (x.name === v ? { ...x, open: !x.open } : x))); drawFavPane(); }],
        ['Show on the Downloaded page', () => go(route('myarticles', 'downloaded/cat:' + v))], '-',
        ['Download Again', () => queueDownloads(c.titles, { label: v })],
        ['Delete Downloads…', () => deleteCategory(v), '', null, !catDownloaded(c).length]];
    }
    if (kind === 'f') {
      const root = favs(), f = folderAt(root, v);
      if (!f) return [];
      const titles = favTitles(f.node.items);
      return [[f.node.open ? 'Close' : 'Open', () => { setFolderOpen(v, !f.node.open); drawFavPane(); }], '-',
        ['Rename', () => { renaming = v; drawFavPane(); }],
        ['New Folder Inside', () => { renaming = newFolder(v); drawFavPane(); }, '', null, f.path.length + 2 > FOLDER_DEPTH],
        ['Move To…', () => folderPickerFor(row, key)], '-',
        ['Download Folder…', () => downloadAllDialog(titles, f.node.folder), '', null, !titles.length || titles.every((t) => dlEntry(t))], '-',
        ['Delete Folder', () => deleteFolder(v)]];
    }
    const e2 = dlEntry(v), fav = isFavTitle(v);
    return [['Open', () => openArticle(v)], '-',
      e2 ? ['Delete Download', () => deleteDownload(v)] : ['Download', () => downloadTitle(v), '', null, !!dlJob(v)],
      '-',
      fav ? ['Move To…', () => folderPickerFor(row, 'a:' + v)] : ['Add to Favorites', () => { addFav(v, e2?.desc || ''); setIdle(`Added “${v}” to Favorites`); }],
      ...(fav ? [['Remove from Favorites', () => { removeFav(v); setIdle(`Removed “${v}” from Favorites`); }]] : []),
      ...(kind === 'r' ? [[row.closest('.myart') ? 'Remove from History' : 'Remove from Recently Viewed', () => removeRecent(v)]] : [])];
  }
  function folderPickerFor(row, key) {
    if (key.startsWith('a:')) return folderPicker(row, key.slice(2), (id) => { if (moveFav(key, id)) setIdle(`Moved “${key.slice(2)}”`); });
    // A folder: the folders it can go into.
    closeCtx();
    const root = favs();
    const items = [['Favorites (no folder)', () => moveFav(key, null), '', null, !canMove(key, null)]];
    walkFavs(root, (n, path) => { if (n.items) items.push([' '.repeat(path.length) + n.folder, () => moveFav(key, n.id), '', null, !canMove(key, n.id) || 'f:' + n.id === key]); });
    const box = h('div', { class: 'menu ctx', role: 'menu', 'aria-label': 'Move to', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() });
    menuItems(box, items, (cmd) => { closeCtx(); runCmd(cmd); });
    document.body.append(box);
    ctxMenu = box;
    ctxReturn = document.activeElement;
    const r = row.getBoundingClientRect();
    box.style.left = r.left + 'px';
    box.style.top = Math.min(r.bottom + 2, innerHeight - box.offsetHeight - 2) + 'px';
    $('.mi:not(.disabled)', box)?.focus({ preventScroll: true });
  }
  async function deleteDownload(t) {
    await saved.remove(t);
    setIdle(`Deleted the download of “${t}”.`);
    if (current?.dl) current.dl.refresh();
  }
  // Download all (or a folder): how many aren't downloaded yet, about how big, and the free space. They download one
  // after another in the background, with the progress in the status bar.
  async function downloadAllDialog(titles, folder) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading articles needs the internet.'); return; }
    const todo = titles.filter((t) => !dlEntry(t) && !dlJob(t) && !dlQueue.some((x) => sameTitle(x.t, t)));
    if (!todo.length) { setIdle(folder ? `Everything in “${folder}” is downloaded.` : 'All your favorites are downloaded.'); return; }
    const sizes = dlList.map((e) => (e.size || 0) - (e.videoSize || 0)).filter((n) => n > 0 && !isNaN(n));
    const each = sizes.length >= 3 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 2.5e6;
    const need = todo.length * each;
    const free = (await saved.free().catch(() => null)) ?? Infinity;
    const fits = free === Infinity || need + 200e6 < free;
    const n = todo.length;
    dialog(folder ? 'Download Folder' : 'Download All Favorites', folder ? `Download the folder “${folder}”?` : 'Download your favorites?', [
      `${n === titles.length ? (n === 1 ? (folder ? 'The favorite in it isn’t' : 'It isn’t') : `${folder ? 'The' : 'Your'} ${n} favorites${folder ? ' in it' : ''} aren’t`)
        : `${n} of ${folder ? 'the' : 'your'} ${titles.length} favorites${folder ? ' in it' : ''} ${n === 1 ? 'isn’t' : 'aren’t'}`} downloaded yet. Downloading lets you read ${n === 1 ? 'it' : 'them'} without the internet.`,
      h('div', { class: 'space' }, h('span', {}, 'Download size'), h('b', {}, `About ${mb(need)}`), h('span', {}, 'Free space on this drive'), h('b', {}, free === Infinity ? 'Unknown' : mb(free))),
      fits ? 'With their pictures and sounds. Videos aren’t included (an article’s Download menu offers them).' : 'There isn’t enough free space on this drive for them.',
      fits ? 'It continues in the background; the status bar shows how far along it is.' : null,
    ].filter(Boolean), fits ? [[`Download ${n === 1 ? '1 Article' : `${n} Articles`}`, () => queueDownloads(todo), true], ['Cancel']] : [['OK', null, true]], { cls: 'dlall' });
  }
  // Articles to download one after another (Download all, a folder, a category): { t, opts, label }.
  let dlQueue = [], dlQueueBusy = false, dlQueueDone = 0, dlQueueTotal = 0, dlQueueFailed = 0;
  function queueDownloads(titles, { opts = {}, label = '' } = {}) {
    for (const t of titles) if (!dlQueue.some((x) => sameTitle(x.t, t))) { dlQueue.push({ t, opts, label }); dlQueueTotal++; }
    if (!dlQueueBusy) runQueue();
  }
  async function runQueue() {
    dlQueueBusy = true;
    let stop = '';
    while (dlQueue.length) {
      const { t, opts, label } = dlQueue[0];
      setStatus(`Downloading ${label ? `“${label}”` : 'articles'}: ${dlQueueDone + 1} of ${dlQueueTotal} (“${t}”)…`, true);
      const r = await dlWith(t, opts).catch(() => ({ ok: false }));
      dlQueue.shift();
      if (r.ok) dlQueueDone++;
      else if (r.space || r.offline) { stop = r.space ? 'there isn’t enough free space on this drive' : 'Offline mode is on'; break; }
      else dlQueueFailed++;
    }
    setIdle(stop ? `Downloaded ${dlQueueDone} of ${dlQueueTotal} articles, then stopped: ${stop}.`
      : `Downloaded ${dlQueueDone === 1 ? '1 article' : `${dlQueueDone} articles`}${dlQueueFailed ? `; ${dlQueueFailed} couldn’t be downloaded (check your connection and try again)` : ''}. They open without the internet.`);
    dlQueue = []; dlQueueBusy = false; dlQueueDone = 0; dlQueueTotal = 0; dlQueueFailed = 0;
    if (current?.dl) current.dl.refresh();
  }

  // ---------- Download a Category ----------
  // The article's Wikipedia categories, each with how many articles and about how big; the chosen one's articles download
  // one after another (over 200: its 200 most read; over 2,000 it's too big). Downloaded categories are kept as groups
  // (dlCategories: { name, titles, at, open }) under Downloaded, and can also go into a Favorites folder.
  const CAT_MAX = 200, CAT_TOO_BIG = 2000;
  const dlCats = () => store.get('dlCategories', []);
  const avgSize = () => {
    const sizes = dlList.map((e) => (e.size || 0) - (e.videoSize || 0)).filter((n) => n > 0 && !Number.isNaN(n));
    return sizes.length >= 3 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 2.5e6;
  };
  async function categoryDialog(title) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading a category needs the internet.'); return; }
    setStatus(`Finding the categories “${title}” is in…`, true);
    let cats;
    try { cats = await Wiki.categories(title); } catch { setIdle('Couldn’t get the article’s categories. Check your connection and try again.'); return; }
    setIdle();
    if (!cats.length) { setIdle(`“${title}” isn’t in any categories that can be downloaded.`); return; }
    cats.sort((a, b) => a.count - b.count);
    const each = avgSize();
    const n = (c) => Math.min(c.count, CAT_MAX);
    let pick = cats.find((c) => c.count > 1 && c.count <= CAT_TOO_BIG) || cats[0];
    const radios = cats.map((c) => {
      const big = c.count > CAT_TOO_BIG;
      const input = h('input', { type: 'radio', name: 'cat', value: c.name, checked: c === pick, disabled: big, onchange: () => { pick = c; update(); } });
      return h('label', { class: 'scr' + (big ? ' off' : '') }, input, h('b', {}, c.name),
        h('span', { class: 'n' }, `${c.count.toLocaleString()} article${c.count === 1 ? '' : 's'}${big ? '' : ` · ${mb(n(c) * each)}`}`),
        big ? h('small', {}, `Too big to download (over ${CAT_TOO_BIG.toLocaleString()} articles). Try a smaller category.`)
          : c.count > CAT_MAX ? h('small', {}, `Over ${CAT_MAX} articles: downloads the ${CAT_MAX} most read.`) : null);
    });
    const pics = h('input', { type: 'checkbox', checked: !downloadDefaults().textOnly, onchange: () => update() });
    const vids = h('input', { type: 'checkbox', checked: downloadDefaults().videos });
    const toFav = h('input', { type: 'checkbox', onchange: () => update() });
    const folderSel = h('select', { 'aria-label': 'Favorites folder' });
    const picsLabel = h('span', {});
    const list = h('div', { class: 'scl', role: 'radiogroup', 'aria-label': 'Categories' }, radios);
    const btn = () => $('.overlay .dialog.savecat .df .go.default');
    function update() {
      picsLabel.textContent = `Pictures and sounds (about ${mb(n(pick) * each)}; text only: about ${mb(n(pick) * 6e4)})`;
      vids.disabled = !pics.checked;
      // The folder: a new one named after the category, or one that's there.
      const want = folderSel.value;
      const opts = [['new', `New folder “${pick.name}”`]];
      walkFavs(favs(), (x, path) => { if (x.items) opts.push([x.id, '\u2003'.repeat(path.length) + x.folder]); });
      folderSel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v }, l)));
      folderSel.value = opts.some(([v]) => v === want) ? want : 'new';
      folderSel.disabled = !toFav.checked;
      const b = btn();
      if (b) b.textContent = `Download ${n(pick) === 1 ? '1 Article' : `${n(pick)} Articles`}`;
    }
    update();
    dialog('Download a Category', 'Download the articles in a category', [
      `“${title}” is in these Wikipedia categories. Pick one to download its articles, so they open without the internet.`,
      list,
      h('div', { class: 'scopts' },
        h('label', {}, pics, picsLabel),
        h('label', {}, vids, h('span', {}, 'Videos too (often 20–200 MB each)')),
        h('label', {}, toFav, h('span', {}, 'Also add them to a Favorites folder: '), folderSel)),
      h('p', { class: 'scnote' }, 'Downloading continues in the background; the status bar shows how far along it is. They appear under Downloaded in My Articles (Ctrl+I).'),
    ], [['Download', () => startCategory(pick, { textOnly: !pics.checked, videos: pics.checked && vids.checked }, toFav.checked ? folderSel.value : null), true], ['Cancel']], { cls: 'savecat' });
    update();
    $('.overlay .dialog.savecat input[name=cat]:checked')?.focus();
  }
  async function startCategory(cat, opts, folder) {
    setStatus(`Getting the articles in “${cat.name}”…`, true);
    let titles;
    try {
      titles = await Wiki.categoryMembers(cat.name, CAT_TOO_BIG);
      if (titles.length > CAT_MAX) {
        setStatus(`Finding the ${CAT_MAX} most read articles in “${cat.name}”…`, true);
        const views = await Wiki.pageviews(titles);
        titles = [...titles].sort((a, b) => (views[b] || 0) - (views[a] || 0)).slice(0, CAT_MAX);
      }
    } catch { setIdle(`Couldn’t get the articles in “${cat.name}”. Check your connection and try again.`); return; }
    if (!titles.length) { setIdle(`“${cat.name}” has no articles to download.`); return; }
    // Kept as a group under Downloaded (the same category again replaces it).
    store.set('dlCategories', [{ name: cat.name, titles, at: Date.now(), open: false }, ...dlCats().filter((c) => c.name !== cat.name)]);
    if (folder) {
      const root = favs();
      let f = folder !== 'new' && folderAt(root, folder);
      if (!f) {
        const id = Math.random().toString(36).slice(2, 10);
        root.splice(afterFolders(root), 0, { folder: cat.name.slice(0, 80), id, open: false, items: [] });
        f = folderAt(root, id);
      }
      for (const t of titles) { const old = favAt(root, t); if (old) old.list.splice(old.i, 1); }
      f = folderAt(root, f.node.id);
      f.node.items.push(...titles.map((t) => ({ title: t })));
      saveFavs(root);
    }
    queueDownloads(titles.filter((t) => !dlEntry(t) || (opts.videos && !dlEntry(t).withVideos)), { opts, label: cat.name });
    drawFavPane();
    refreshMyPage();
  }
  // Options › Storage › Remove…: every downloaded article, after asking.
  async function removeAllDownloads(done) {
    const list = await saved.list().catch(() => []);
    if (!list.length) return;
    const size = list.reduce((n, e) => n + (e.size || 0), 0);
    const favN = list.filter((e) => isFavTitle(e.title)).length;
    dialog('Remove Downloaded Articles', 'Remove all downloaded articles?', [
      `${list.length === 1 ? '1 article' : `${list.length} articles`}, ${mb(size)}. They still open when you’re online.`,
      favN ? `${favN === 1 ? 'The favorite among them stays a favorite' : `The ${favN} favorites among them stay favorites`}.` : null].filter(Boolean),
    [['Remove All', async () => {
      for (const e of list) await saved.remove(e.title);
      store.set('dlCategories', []);
      setIdle(`Removed ${list.length === 1 ? '1 downloaded article' : `${list.length} downloaded articles`}, freeing ${mb(size)}.`);
      if (current?.dl) current.dl.refresh();
      drawFavPane();
      refreshMyPage();
      done && done();
    }, true], ['Cancel']]);
  }
  // A downloaded category's articles that are downloaded now.
  const catDownloaded = (c) => c.titles.filter((t) => dlEntry(t));
  function deleteCategory(name) {
    const c = dlCats().find((x) => x.name === name);
    if (!c) return;
    const es = catDownloaded(c).map(dlEntry);
    const size = es.reduce((n, e) => n + (e.size || 0), 0);
    const go4 = async () => {
      store.set('dlCategories', dlCats().filter((x) => x.name !== name));
      for (const e of es) await saved.remove(e.title);
      setIdle(`Deleted the downloads of “${name}” (${es.length === 1 ? '1 article' : `${es.length} articles`}), freeing ${mb(size)}.`);
      if (current?.dl) current.dl.refresh();
      drawFavPane();
      refreshMyPage();
    };
    dialog('Delete Downloads', `Delete the downloads of “${name}”?`, [
      `${es.length === 1 ? '1 article' : `${es.length} articles`}, ${mb(size)}. They still open when you’re online. Favorites among them stay favorites.`],
    [['Delete Downloads', go4, true], ['Cancel']]);
  }

  // ---------- My Articles page ----------
  // One page for Favorites (the folders in its rail), Downloaded, and History: route "myarticles/<view>[/<folder>]".
  // Opened from the toolbar's My Articles arrow (Manage), the pane's ⤢, the Favorites menu, Ctrl+B and Ctrl+Y.
  // Rows: a check box (for the selection bar), the picture, title and description, the download state, and ✕.
  let myPage = null;
  const MY_VIEWS = { favorites: 'Favorites', downloaded: 'Downloaded', history: 'History' };
  const HISTORY_PAGE = 150;
  // Pictures and descriptions an article row is missing, looked up a few at a time and kept (keepInfo).
  const infoWant = new Set();
  let infoBusy = 0;
  function wantInfo(t) {
    if (infoOf(t) || infoWant.has(t)) return;
    infoWant.add(t);
    pumpInfo();
  }
  function pumpInfo() {
    while (infoBusy < 4 && infoWant.size) {
      const t = infoWant.values().next().value;
      infoWant.delete(t);
      infoBusy++;
      Wiki.summary(t).then((s) => {
        keepInfo(t, s.description || '', s.thumbnail?.source || '');
        for (const r of $$('.myart .mrow[data-title]')) if (sameTitle(r.dataset.title, t)) fillInfo(r, t);
      }, () => keepInfo(t, '', '')).finally(() => { infoBusy--; pumpInfo(); });
    }
  }
  function fillInfo(row, t) {
    const i = infoOf(t) || dlEntry(t);
    if (!i) return;
    const th = $('.th', row), d = $('.md', row);
    if (th && i.thumb && !th.style.backgroundImage) { th.style.cssText = bg(i.thumb); th.classList.remove('ph'); th.replaceChildren(); }
    if (d && !d.textContent) d.textContent = i.desc || '';
  }
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  function dayLabel(ms) {
    if (!ms) return 'Earlier';
    const d = dayStart(ms), today = dayStart(Date.now());
    return d === today ? 'Today' : d === dayStart(today - 1) ? 'Yesterday' : fmtDay(ms);
  }

  function viewMyArticles(arg, token) {
    const cut = arg.indexOf('/');
    const view0 = cut < 0 ? arg : arg.slice(0, cut), sub = cut < 0 ? '' : arg.slice(cut + 1);   // a category's name can have a slash
    const view = MY_VIEWS[view0] ? view0 : 'favorites';
    const pg = shell({ title: MY_VIEWS[view], wide: true });
    pg.root.classList.add('myart');
    const st = { view, sub: view === 'favorites' ? sub || 'all' : sub, query: '', sel: new Set(), shown: HISTORY_PAGE, sort: store.get('dlSort', 'date') };
    const find = h('input', { type: 'search', class: 'msearch', spellcheck: 'false',
      placeholder: view === 'history' ? 'Search your history' : view === 'downloaded' ? 'Search your downloads' : 'Search your favorites',
      'aria-label': view === 'history' ? 'Search your history' : view === 'downloaded' ? 'Search your downloads' : 'Search your favorites',
      oninput: (e) => { st.query = e.target.value.trim().toLowerCase(); st.sel.clear(); draw(); },
      onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; st.query = ''; draw(); } } });
    const tools = view === 'favorites'
      ? [find, bandBtn('New Folder', () => { const id = newFolder(folderAt(favs(), st.sub) ? st.sub : null); if (id) { renaming = id; st.renaming = id; draw(); } }, 'folder'),
        bandBtn('Download All', () => downloadAllDialog(favTitles(st.sub && folderAt(favs(), st.sub) ? folderAt(favs(), st.sub).node.items : favs()), folderAt(favs(), st.sub)?.node.folder || null), 'download')]
      : view === 'history' ? [find, bandBtn('Clear History…', () => clearHistoryDialog())]
        : [find];
    pg.toolsEl.append(...tools);
    myPage = { root: pg.root, st, draw };
    if (!mount(pg.root, token)) return;
    if (!dlLoaded) loadDownloaded();
    draw();
    setIdle(view === 'history' ? `History: ${history().length === 1 ? '1 article' : `${history().length} articles`}` : statusIdle);

    function go2(v, s = '') { go(route('myarticles', s ? `${v}/${s}` : v)); }
    function draw() {
      const y = pg.content.scrollTop;
      const focused = pg.root.contains(document.activeElement) && document.activeElement !== find && document.activeElement.closest('[data-key]')?.dataset.key;
      const root = favs(), hist = history();
      // The rail: the three views, then what belongs to the one on screen.
      const nav = Object.entries(MY_VIEWS).map(([v, label]) => {
        const n = v === 'favorites' ? favTitles(root).length : v === 'downloaded' ? dlList.length : hist.length;
        const b = railLink(label, () => go2(v));
        b.classList.toggle('on', v === view);
        if (v === view) b.setAttribute('aria-current', 'page');
        b.append(h('span', { class: 'n' }, String(n)));
        return b;
      });
      const rail = [h('h4', {}, 'My Articles'), ...nav, h('hr')];
      if (view === 'favorites') rail.push(...favRail(root));
      else if (view === 'history') rail.push(...historyRail(hist));
      else rail.push(...downloadedRail());
      pg.railIn.replaceChildren(...rail);
      // The band and the list.
      if (view === 'favorites') drawFavorites(root);
      else if (view === 'history') drawHistory(hist);
      else drawDownloaded();
      pg.content.scrollTop = y;
      if (st.renaming) { const r = $('input.ren', pg.root); if (r) { r.focus(); r.select(); } }
      else if (focused) { const el = $$('[data-key]', pg.root).find((r) => r.dataset.key === focused); (el?.matches('button') ? el : el?.querySelector('.mlink, .lnk'))?.focus({ preventScroll: true }); }
    }

    // ----- Favorites -----
    function favRail(root) {
      const out = [h('h4', {}, 'Folders')];
      const link = (key, label, n, level, node) => {
        const on = st.sub === key;
        if (node && st.renaming === node.id) {
          return h('div', { class: 'lnk mfold', style: `--lv:${level}` }, h('span', { class: 'tw' }), icon('folder'),
            h('input', { class: 'ren', value: node.folder, 'aria-label': 'Folder name', maxlength: '80',
              onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = node.folder; e.target.blur(); } },
              onblur: (e) => { st.renaming = null; renaming = null; renameFolder(node.id, e.target.value); draw(); } }));
        }
        const b = h('button', { class: 'lnk mfold' + (on ? ' on' : ''), style: `--lv:${level}`, 'data-key': node ? 'f:' + node.id : null, onclick: () => go2('favorites', key) },
          node && node.items.some((x) => x.items)
            ? h('span', { class: 'tw', role: 'button', 'aria-label': node.open ? 'Close' : 'Open', onclick: (e) => { e.stopPropagation(); setFolderOpen(node.id, !node.open); draw(); } }, node.open ? '▼' : '▶')
            : h('span', { class: 'tw' }),
          icon('folder'), h('span', { class: 't' }, label), h('span', { class: 'n' }, String(n)));
        if (on) b.setAttribute('aria-current', 'true');
        if (node) { dragFrom(b, 'f:' + node.id); dropOn(b, node.id); }
        else if (key === 'loose') dropOn(b, null);
        return b;
      };
      out.push(link('all', 'All favorites', favTitles(root).length, 0));
      const walk = (list, level) => { for (const n of list) if (n.items) { out.push(link(n.id, n.folder, favCount(n), level, n)); if (n.open) walk(n.items, level + 1); } };
      walk(root, 0);
      out.push(link('loose', 'Not in a folder', root.filter((n) => n.title).length, 0));
      out.push(h('p', { class: 'mnote' }, 'Drag articles onto a folder to move them. Right-click a folder to rename, download, or delete it.'));
      return out;
    }
    function drawFavorites(root) {
      const f = folderAt(root, st.sub);
      if (st.sub !== 'all' && st.sub !== 'loose' && !f) st.sub = 'all';
      const titles = favTitles(root), folders = (() => { let n = 0; walkFavs(root, (x) => { if (x.items) n++; }); return n; })();
      const done = titles.filter((t) => dlEntry(t)).length;
      pg.setTitle(f ? f.node.folder : 'Favorites', `${titles.length === 1 ? '1 article' : `${titles.length} articles`}${folders ? ` in ${folders === 1 ? '1 folder' : `${folders} folders`}` : ''} · ${done} downloaded`);
      setCrumbs(f ? [...f.path.map((p) => ({ label: p.folder, run: () => go2('favorites', p.id) })), f.node.folder] : st.sub === 'loose' ? ['Not in a folder'] : []);
      let items;          // [{ folder } | { title, where }]
      if (st.query) {
        items = [];
        walkFavs(root, (n, path) => { if (n.title && n.title.toLowerCase().includes(st.query)) items.push({ title: n.title, where: path.map((p) => p.folder).join(' › ') }); });
      } else if (f) items = f.node.items.map((n) => (n.items ? { folder: n } : { title: n.title }));
      else if (st.sub === 'loose') items = root.filter((n) => n.title).map((n) => ({ title: n.title }));
      else { items = []; walkFavs(root, (n, path) => { if (n.title) items.push({ title: n.title, where: path.map((p) => p.folder).join(' › ') }); }); }
      const arts = items.filter((i) => i.title);
      const nf = items.length - arts.length;
      const head = h('div', { class: 'mhead' }, h('b', {}, st.query ? 'Found' : f ? f.node.folder : st.sub === 'loose' ? 'Not in a folder' : 'All favorites'),
        h('span', {}, `${arts.length === 1 ? '1 article' : `${arts.length} articles`}${nf ? `, ${nf === 1 ? '1 folder' : `${nf} folders`}` : ''}`));
      const rows = items.map((i) => (i.folder ? folderTile(i.folder) : artPageRow('a:' + i.title, i.title, { where: st.sub === 'all' || st.query ? i.where : '', remove: () => { removeFav(i.title); setIdle(`Removed “${i.title}” from Favorites`); } })));
      const empty = !items.length ? h('div', { class: 'mempty' }, st.query ? 'No favorites match.' : f ? 'This folder is empty. Drag favorites onto it in the list at the left, or use Move to….' : 'Open an article and click “Add to Favorites” to keep it here.') : null;
      pg.text.replaceChildren(head, selectionBar('favorites'), ...rows, empty || '');
    }
    function folderTile(n) {
      const c = favCount(n), names = favTitles(n.items).slice(0, 3);
      const key = 'f:' + n.id;
      const row = h('div', { class: 'mrow folder', 'data-key': key, draggable: 'true' },
        h('span', { class: 'chk' }),
        h('i', { class: 'th fold' }, icon('folder')),
        h('div', { class: 'mtx' },
          st.renaming === n.id
            ? h('input', { class: 'ren', value: n.folder, 'aria-label': 'Folder name', maxlength: '80',
              onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = n.folder; e.target.blur(); } },
              onblur: (e) => { st.renaming = null; renaming = null; renameFolder(n.id, e.target.value); draw(); } })
            : h('button', { class: 'mlink', onclick: () => go2('favorites', n.id) }, n.folder),
          h('span', { class: 'md' }, `Folder · ${c === 1 ? '1 article' : `${c} articles`}${names.length ? `: ${names.join(', ')}${c > 3 ? ', …' : ''}` : ''}`)));
      dragFrom(row, key);
      dropOn(row, n.id);
      return row;
    }
    // ----- Downloaded -----
    function downloadedRail() {
      const total = dlList.reduce((n, e) => n + (e.size || 0), 0);
      const sortBtn = (k, label) => { const b = railLink(label, () => { st.sort = k; store.set('dlSort', k); draw(); }); b.classList.toggle('on', st.sort === k); return b; };
      const cats = dlCats().filter((c) => catDownloaded(c).length);
      const catBtn = (k, label, n, ic) => { const b = railLink('', () => go2('downloaded', k)); b.replaceChildren(icon(ic), h('span', { class: 't' }, label), h('span', { class: 'n' }, String(n))); b.classList.add('mfold'); b.classList.toggle('on', (st.sub || 'all') === k); if (k.startsWith('cat:')) b.dataset.key = 'c:' + k.slice(4); return b; };
      const inCat = new Set(cats.flatMap((c) => catDownloaded(c).map((t) => t.toLowerCase())));
      const catRail = cats.length ? [h('h4', {}, 'Categories'), catBtn('all', 'All downloaded', dlList.length, 'download'),
        ...cats.map((c) => catBtn('cat:' + c.name, c.name, catDownloaded(c).length, 'stack')),
        catBtn('loose', 'Not in a category', dlList.filter((e) => !inCat.has(e.title.toLowerCase())).length, 'download'), h('hr')] : [];
      return [...catRail, h('h4', {}, 'Sort by'), sortBtn('date', 'Date downloaded'), sortBtn('size', 'Size'), sortBtn('name', 'Name'), h('hr'),
        h('p', { class: 'mstat' }, h('b', {}, String(dlList.length)), ` ${dlList.length === 1 ? 'article' : 'articles'}, ${mb(total)}`),
        h('p', { class: 'mnote' }, 'Downloaded articles open without the internet. Deleting a download keeps the article in your favorites.')];
    }
    function drawDownloaded() {
      const total = dlList.reduce((n, e) => n + (e.size || 0), 0);
      pg.setTitle('Downloaded', `${dlList.length === 1 ? '1 article' : `${dlList.length} articles`} · ${mb(total)} · They open without the internet`);
      setCrumbs([]);
      const sub = st.sub || 'all';
      const cat = sub.startsWith('cat:') ? dlCats().find((c) => c.name === sub.slice(4)) : null;
      const inCat = new Set(dlCats().flatMap((c) => catDownloaded(c).map((t) => t.toLowerCase())));
      let list = dlList.filter((e) => (!st.query || e.title.toLowerCase().includes(st.query))
        && (cat ? cat.titles.some((t) => sameTitle(t, e.title)) : sub === 'loose' ? !inCat.has(e.title.toLowerCase()) : true));
      if (cat) {
        setCrumbs([cat.name]);
        pg.setTitle(cat.name, `A Wikipedia category · ${list.length === 1 ? '1 article' : `${list.length} articles`} downloaded · ${mb(list.reduce((n, e) => n + (e.size || 0), 0))}`);
      }
      list = [...list].sort(st.sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : st.sort === 'name' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => (a.at < b.at ? 1 : -1));
      const head = h('div', { class: 'mhead' }, h('b', {}, st.query ? 'Found' : cat ? cat.name : sub === 'loose' ? 'Not in a category' : 'Downloaded'), h('span', {}, `${list.length === 1 ? '1 article' : `${list.length} articles`}`),
        cat ? h('button', { class: 'go mcatdel', onclick: () => deleteCategory(cat.name) }, 'Delete Downloads…') : null);
      const rows = list.map((e) => artPageRow('d:' + e.title, e.title, { mark: false, extra: h('span', { class: 'msize' }, `${mb(e.size || 0)} · ${new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`),
        remove: () => deleteDownloads([e.title]), removeLabel: `Delete the download of “${e.title}”` }));
      pg.text.replaceChildren(head, selectionBar('downloaded'), ...rows,
        !list.length ? h('div', { class: 'mempty' }, st.query ? 'No downloaded articles match.' : 'No downloaded articles yet. Open an article and click “Download for Offline” to read it without the internet.') : '');
    }
    // ----- History -----
    function historyRail(hist) {
      const today = dayStart(Date.now()), week = today - 6 * 864e5;
      const jump = (label, test) => {
        const b = railLink(label, () => {
          const i = hist.findIndex(test);
          if (i < 0) return;
          if (i >= st.shown) { st.shown = i + HISTORY_PAGE; draw(); }
          const g = $$('.mday', pg.root).find((x) => Number(x.dataset.at) <= (hist[i].at ? dayStart(hist[i].at) : 0));
          g?.scrollIntoView({ block: 'start', behavior: store.get('animations', true) ? 'smooth' : 'instant' });
        });
        if (!hist.some(test)) { b.disabled = true; b.classList.add('off'); }
        return b;
      };
      const thisWeek = hist.filter((e) => e.at >= week).length;
      return [h('h4', {}, 'History'),
        jump('Today', (e) => e.at >= today), jump('Yesterday', (e) => e.at >= today - 864e5 && e.at < today),
        jump('This week', (e) => e.at >= week && e.at < today - 864e5), jump('Earlier', (e) => e.at < week), h('hr'),
        h('p', { class: 'mstat' }, h('b', {}, String(thisWeek)), ` ${thisWeek === 1 ? 'article' : 'articles'} this week`, h('br'), h('b', {}, String(hist.length)), ` ${hist.length === 1 ? 'article' : 'articles'} in all`),
        h('hr'), h('h4', {}, 'Options'),
        railLink(store.get('historyPaused', false) ? 'Resume history' : 'Pause history', () => {
          const p = !store.get('historyPaused', false);
          store.set('historyPaused', p);
          setIdle(p ? 'History is paused: articles you read aren’t added to it' : 'History is on again');
          draw();
        }),
        store.get('historyPaused', false) ? h('p', { class: 'mnote warn' }, 'History is paused: articles you read aren’t added.') : null,
        h('p', { class: 'mnote' }, 'History stays on this computer.')].filter(Boolean);
    }
    function drawHistory(hist) {
      pg.setTitle('History', 'Every article you’ve read, newest first');
      setCrumbs([]);
      const list = st.query ? hist.filter((e) => e.t.toLowerCase().includes(st.query)) : hist;
      const shown = list.slice(0, st.shown);
      // Whole days: the page doesn't stop in the middle of one.
      let end = shown.length;
      while (end < list.length && end > 0 && dayStart(list[end].at || 0) === dayStart(list[end - 1].at || 0)) end++;
      const out = [selectionBar('history')];
      let day = null;
      for (const e of list.slice(0, end)) {
        const d = e.at ? dayStart(e.at) : 0;
        if (d !== day) {
          day = d;
          const n = list.filter((x) => (x.at ? dayStart(x.at) : 0) === d).length;
          out.push(h('div', { class: 'mhead mday', 'data-at': String(d) }, h('b', {}, dayLabel(e.at)), h('span', {}, n === 1 ? '1 article' : `${n} articles`)));
        }
        out.push(artPageRow('r:' + e.t, e.t, { lead: h('span', { class: 'mtime' }, e.at ? fmtTime(e.at) : ''), star: isFavTitle(e.t), key2: `${e.t}@${e.at}`,
          remove: () => { removeHistory(e.t); setIdle(`Removed “${e.t}” from History`); }, removeLabel: `Remove “${e.t}” from History` }));
      }
      if (end < list.length) out.push(h('button', { class: 'go mmore', onclick: () => { st.shown += HISTORY_PAGE; draw(); } }, 'Show Earlier Days'));
      if (!list.length) out.push(h('div', { class: 'mempty' }, st.query ? 'Nothing in your history matches.' : store.get('historyPaused', false) ? 'History is paused.' : 'Articles you read will be listed here.'));
      pg.text.replaceChildren(...out);
    }
    // ----- rows and the selection bar -----
    function artPageRow(key, t, { lead = null, star = false, mark = true, where = '', extra = null, remove = null, removeLabel = '', key2 = '' } = {}) {
      const i = infoOf(t) || dlEntry(t);
      if (!i) wantInfo(t);
      const selKey = key2 || key;
      const box = h('input', { type: 'checkbox', 'aria-label': `Select ${t}`, checked: st.sel.has(selKey),
        onchange: (e) => { if (e.target.checked) st.sel.add(selKey); else st.sel.delete(selKey); row.classList.toggle('sel', e.target.checked); updateSel(); } });
      const row = h('div', { class: 'mrow' + (st.sel.has(selKey) ? ' sel' : ''), 'data-key': key, 'data-title': t, draggable: 'true' },
        h('label', { class: 'chk' }, box),
        lead,
        i?.thumb ? h('i', { class: 'th', style: bg(i.thumb) }) : h('i', { class: 'th ph' }, icon('book')),
        h('div', { class: 'mtx' }, h('button', { class: 'mlink', title: t, onclick: () => openArticle(t) }, t),
          h('span', { class: 'md' }, i?.desc || ''), where ? h('span', { class: 'mwhere' }, icon('folder'), where) : null),
        extra,
        star ? h('span', { class: 'mstar', title: 'In Favorites', role: 'img', 'aria-label': 'In Favorites' }, icon('star')) : null,
        mark ? markFor(t) : null,
        remove ? h('button', { class: 'rx', title: removeLabel || `Remove “${t}” from Favorites`, 'aria-label': removeLabel || `Remove ${t} from Favorites`, onclick: remove }, '✕') : null);
      dragFrom(row, key);
      return row;
    }
    // The selection bar follows the ticked rows (kept at the top of the list).
    function updateSel() {
      const old = $('.msel', pg.text), bar = selectionBar(st.view);
      if (old) { if (bar) old.replaceWith(bar); else old.remove(); }
      else if (bar) { const head = $('.mhead', pg.text); if (head && st.view !== 'history') head.after(bar); else pg.text.prepend(bar); }
    }
    // The selected rows' titles (History rows are "title@time").
    const selTitles = () => [...new Set([...st.sel].map((k) => k.replace(/^[adr]:/, '').replace(/@\d+$/, '')))];
    function selectionBar(kind) {
      const n = st.sel.size;
      if (!n) return '';
      const titles = selTitles();
      const btn = (label, fn) => h('button', { class: 'go', onclick: fn }, label);
      const notDl = titles.filter((t) => !dlEntry(t) && !dlJob(t));
      const acts = kind === 'favorites' ? [
        btn('Move to…', (e) => movePicker(e.currentTarget, titles)),
        notDl.length ? btn('Download', () => { queueDownloads(notDl); st.sel.clear(); draw(); }) : null,
        btn('Remove from Favorites', () => { const r = favs(); for (const t of titles) { const a = favAt(r, t); if (a) a.list.splice(a.i, 1); } st.sel.clear(); saveFavs(r); setIdle(`Removed ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} articles`} from Favorites`); }),
      ] : kind === 'downloaded' ? [
        btn('Delete Downloads…', () => deleteDownloads(titles)),
        titles.some((t) => !isFavTitle(t)) ? btn('Add to Favorites', () => { for (const t of titles) if (!isFavTitle(t)) addFav(t, infoOf(t)?.desc || ''); st.sel.clear(); draw(); setIdle('Added to Favorites'); }) : null,
      ] : [
        notDl.length ? btn('Download', () => { queueDownloads(notDl); st.sel.clear(); draw(); }) : null,
        btn('Remove from History', () => { const keys = new Set([...st.sel].map((k) => k.slice(2))); store.set('history', history().filter((e) => !keys.has(`${e.t}@${e.at}`))); st.sel.clear(); historyChanged(); }),
      ];
      return h('div', { class: 'msel', role: 'toolbar', 'aria-label': 'Selected articles' }, h('b', { role: 'status' }, `${n} selected`), ...acts.filter(Boolean),
        h('button', { class: 'go clr', onclick: () => { st.sel.clear(); draw(); } }, 'Clear selection'));
    }
    function movePicker(anchor, titles) {
      folderPicker(anchor, null, (id) => {
        for (const t of titles) moveFav('a:' + t, id);
        st.sel.clear();
        const to = folderAt(favs(), id)?.node.folder;
        setIdle(`Moved ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} articles`} to ${to ? `“${to}”` : 'Favorites (no folder)'}`);
        draw();
      });
    }
    function deleteDownloads(titles) {
      const es = titles.map(dlEntry).filter(Boolean);
      if (!es.length) return;
      const size = es.reduce((n, e) => n + (e.size || 0), 0), favN = es.filter((e) => isFavTitle(e.title)).length;
      const go3 = async () => {
        for (const e of es) await saved.remove(e.title);
        st.sel.clear();
        setIdle(`Deleted ${es.length === 1 ? `the download of “${es[0].title}”` : `${es.length} downloads`}, freeing ${mb(size)}.`);
        if (current?.dl) current.dl.refresh();
      };
      if (es.length === 1) return go3();
      dialog('Delete Downloads', `Delete ${es.length} downloads?`, [`This frees ${mb(size)} on this computer. The articles still open when you’re online.`,
        favN ? `${favN === 1 ? 'The favorite among them stays a favorite' : `The ${favN} favorites among them stay favorites`}, with the download button again.` : null].filter(Boolean),
      [['Delete Downloads', go3, true], ['Cancel']]);
    }
  }
  // Redraws the page when favorites, downloads, or history change elsewhere (the pane, an article's buttons).
  function refreshMyPage() {
    if (myPage && myPage.root.isConnected && !myPage.st.renaming) myPage.draw();
  }
  // The toolbar's My Articles arrow: Manage.
  function manageMenu(anchor) {
    closeCtx();
    const box = h('div', { class: 'menu ctx manage', role: 'menu', 'aria-label': 'Manage', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() },
      h('div', { class: 'mh', 'aria-hidden': 'true' }, 'Manage'));
    menuItems(box, [['Favorites…', 'myfavs', 'Ctrl+B'], ['Downloaded Articles…', 'mydl'], ['History…', 'myhist', 'Ctrl+Y']], (cmd) => { closeCtx(); runCmd(cmd); });
    document.body.append(box);
    ctxMenu = box;
    ctxReturn = document.activeElement;
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.min(r.left, innerWidth - box.offsetWidth - 2) + 'px';
    box.style.top = (r.bottom + 1) + 'px';
    $('.mi', box)?.focus({ preventScroll: true });
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
    shortcuts: () => shortcuts(),
    favpane: () => toggleFavPane(),
    myfavs: () => go('myarticles/favorites'),
    mydl: () => go('myarticles/downloaded'),
    myhist: () => go('myarticles/history'),
    manage: () => manageMenu($('.tbtn[data-cmd="manage"]')),
    speak: toggleSpeak,
    // Through the main process: the page's own copy command doesn't reliably reach the clipboard.
    copy: () => window.e2k.win('copy'),
    // Print is turned off on screens without a printable page; the keyboard shortcuts quietly do nothing there.
    print: () => { if (printable()) window.e2k.printPreview(); },
    printNow: () => { if (printable()) window.e2k.win('print'); },
    // Ctrl+F searches the article on screen; anywhere else (Home, games) it goes to the Find box, like Ctrl+E.
    find: () => (findable() ? openFind() : runCmd('search')),
    search: () => { closeFind(); $('#q').focus(); $('#q').select(); },
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
    offline: () => toggleOffline(),
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
  // The favorites in the Favorites menu, each folder's name above its own (indented), up to 40 lines.
  function favMenu(root) {
    const out = [];
    walkFavs(root, (n, path) => {
      if (out.length >= 40) return false;
      const pad = ' '.repeat(path.length);
      out.push(n.items ? [`${pad}${n.folder}`, null, '', null, true] : [pad + n.title, () => openArticle(n.title)]);
    });
    return out;
  }
  function menus() {
    const f = favs();
    return [
      ['File', [['Home', 'home', 'Ctrl+H'], ['Random Article', 'random'], '-', ['Print Preview…', 'print', 'Ctrl+P', null, !printable()], ['Print…', 'printNow', 'Ctrl+Shift+P', null, !printable()], '-', ['Exit', 'exit', 'Alt+F4']]],
      ['Edit', [['Copy', 'copy', 'Ctrl+C'], '-', ['Find in Article…', 'find', 'Ctrl+F', null, !findable()], ['Find an Article', 'search', 'Ctrl+E']]],
      ['View', [['Larger Text', 'bigger', 'Ctrl+='], ['Smaller Text', 'smaller', 'Ctrl+-'], ['Normal Text Size', 'normal', 'Ctrl+0'], '-',
        ['Refresh', 'reload', 'F5'], '-', ['Mute', 'mute', 'Ctrl+M', E2KAudio.isMuted()]]],
      ['Go', [['Back', 'back', 'Alt+Left', null, nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, nav.idx >= nav.stack.length - 1], ['Home', 'home'], '-',
        ['Today’s Featured Article', 'featured'], ['On This Day', 'onthisday'], ['Picture of the Day', 'gallery'], ['Random Article', 'random']]],
      ['Favorites', [['My Articles', 'favpane', 'Ctrl+I', !fpane.hidden], [isFav() ? 'Remove from Favorites' : 'Add to Favorites', 'fav', 'Ctrl+D', null, !current], '-',
        ['Manage Favorites…', 'myfavs', 'Ctrl+B'], ['Downloaded Articles…', 'mydl'], ['History…', 'myhist', 'Ctrl+Y'], '-',
        ...(f.length ? favMenu(f) : [['(No favorites yet)', null, '', null, true]])]],
      // Numbered in the order of Home's Explore shelf.
      ['Features', [['Articles', 'explore', 'Ctrl+1'], ['Media', 'gallery', 'Ctrl+2'], ['Timeline', 'onthisday', 'Ctrl+3'], ['World Explorer', 'world', 'Ctrl+4'], ['Games', 'games', 'Ctrl+5'], ['Activities', 'activities', 'Ctrl+6']]],
      ['Tools', [['Offline Library…', 'library', 'Ctrl+Shift+L'], ['Offline Mode', 'offline', 'Ctrl+Shift+O', isOffline()], '-', ['Themes…', 'themes'], '-', ['Options…', 'options', 'Ctrl+,']]],
      ['Help', [['Keyboard Shortcuts', 'shortcuts', 'Ctrl+/'], '-', ['What’s New', 'whatsnew'], ['Send Feedback…', 'feedback'], ['Check for Updates…', 'updates'], ['Donate…', 'donate'], '-', ['Privacy Policy', 'privacy'], ['About Encyclopedia 2000', 'about']]],
    ];
  }
  const menubar = $('#menubar');
  let openMenu = null;
  // Where focus goes back to when the keyboard leaves the menu bar.
  let menuReturn = null;
  const tops = () => $$('.m', menubar);
  function closeMenus() {
    $$('.menu', menubar).forEach((m) => m.remove());
    $$('.m.open', menubar).forEach((m) => { m.classList.remove('open'); m.setAttribute('aria-expanded', 'false'); });
    openMenu = null;
  }
  // A menu's items, for the menu bar and the right-click menu: [label, command, key, checked, disabled] or '-'.
  function menuItems(box, items, run) {
    items.forEach((it) => {
      if (it === '-') return box.append(h('div', { class: 'msep', role: 'separator' }));
      const [label, cmd, key, checked, disabled] = it;
      const off = disabled || !cmd;
      const mi = h('div', {
        class: 'mi' + (checked ? ' checked' : '') + (disabled ? ' disabled' : ''),
        role: checked == null ? 'menuitem' : 'menuitemcheckbox', tabindex: -1,
        ...(checked == null ? {} : { 'aria-checked': String(!!checked) }), ...(off ? { 'aria-disabled': 'true' } : {}),
        // preventDefault keeps the selection, for Copy.
        onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); },
        onmousemove: () => { if (box.contains(document.activeElement) && document.activeElement !== mi) mi.focus(); },
        onclick: (e) => { e.stopPropagation(); if (!off) run(cmd); },
      }, h('span', {}, label), h('span', { class: 'k' }, keyText(key) || ''));
      if (key) mi.setAttribute('aria-keyshortcuts', key.split(' or ')[0].replace('Ctrl', MAC ? 'Meta' : 'Control'));
      box.append(mi);
    });
  }
  // Up, Down, Home, End, Enter, and Space inside a menu. True when the key was used.
  function menuKeys(box, e) {
    const list = $$('.mi', box);
    const i = list.indexOf(document.activeElement);
    const to = (j) => list[(j + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') to(i + 1);
    else if (e.key === 'ArrowUp') to(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(-1);
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) list[i].click();
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  function showMenu(top, index, focus = '') {
    closeMenus();
    openMenu = index;
    top.classList.add('open');
    top.setAttribute('aria-expanded', 'true');
    const [label, items] = menus()[index];
    const box = h('div', { class: 'menu', role: 'menu', 'aria-label': label });
    menuItems(box, items, (cmd) => { leaveMenubar(); runCmd(cmd); });
    top.append(box);
    if (focus) $$('.mi', box).at(focus === 'last' ? -1 : 0)?.focus();
  }
  // The keyboard way in (Alt or F10): the first menu's name is chosen, and the arrows, Enter, and Escape work from there.
  function enterMenubar(index = 0, open = false) {
    if (MAC) return;
    closeCtx();
    closeNet();
    if (!menubar.contains(document.activeElement)) menuReturn = document.activeElement;
    const top = tops()[index];
    top.focus();
    if (open) showMenu(top, index, 'first');
  }
  function leaveMenubar() {
    const wasIn = menubar.contains(document.activeElement);
    closeMenus();
    const back = menuReturn;
    menuReturn = null;
    if (!wasIn) return;
    if (back?.isConnected && back !== document.body) back.focus({ preventScroll: true });
    else document.activeElement.blur();
  }
  menus().forEach(([label], i) => {
    const top = h('div', { class: 'm', role: 'menuitem', tabindex: -1, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, label);
    top.addEventListener('mousedown', (e) => { e.stopPropagation(); openMenu === i ? closeMenus() : showMenu(top, i); });
    top.addEventListener('mouseenter', () => { if (openMenu !== null && openMenu !== i) showMenu(top, i, menubar.contains(document.activeElement) ? 'first' : ''); });
    menubar.append(top);
  });
  menubar.addEventListener('keydown', (e) => {
    const list = tops();
    const top = e.target.closest('.m'), i = list.indexOf(top), inMenu = !!e.target.closest('.menu');
    const side = (d) => { const j = (i + d + list.length) % list.length; if (inMenu || openMenu !== null) showMenu(list[j], j, 'first'); else list[j].focus(); };
    if (e.key === 'ArrowRight') side(1);
    else if (e.key === 'ArrowLeft') side(-1);
    else if (e.key === 'Escape') { if (inMenu) { closeMenus(); top.focus(); } else leaveMenubar(); }
    else if (e.key === 'Tab') leaveMenubar();
    else if (inMenu) { menuKeys(top.querySelector('.menu'), e); return; }
    else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') showMenu(top, i, 'first');
    else if (e.key === 'ArrowUp') showMenu(top, i, 'last');
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  // Alt on its own (pressed and let go with nothing else) or F10 goes into the menu bar, and again comes out of it.
  let altAlone = false;
  addEventListener('keydown', (e) => {
    altAlone = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey && (altAlone || !e.repeat);
    if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && !MAC) {
      e.preventDefault();
      if (menubar.contains(document.activeElement)) leaveMenubar(); else enterMenubar();
    }
  }, true);
  addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || !altAlone || MAC) return;
    altAlone = false;
    e.preventDefault();
    if (menubar.contains(document.activeElement)) leaveMenubar(); else if (!topOverlay()) enterMenubar();
  }, true);
  addEventListener('mousedown', () => { altAlone = false; }, true);
  addEventListener('blur', () => { altAlone = false; });
  document.addEventListener('mousedown', () => closeMenus());

  // ---------- right-click menu ----------
  // What's offered depends on what was clicked: selected text, a link, a picture, a text box, or the page itself.
  // It's drawn like the menu bar's menus, at the same fixed size as other apps' right-click menus.
  let ctxMenu = null, ctxReturn = null;
  function closeCtx() {
    if (!ctxMenu) return;
    const had = ctxMenu.contains(document.activeElement);
    ctxMenu.remove(); ctxMenu = null;
    if (had && ctxReturn?.isConnected) ctxReturn.focus({ preventScroll: true });
  }
  async function savePicture(img) {
    const shown = img.currentSrc || img.src;
    setStatus('Saving the picture…', true);
    // The main process downloads it (the page's security policy only lets it read pictures, not download them): the
    // full picture where there is one (articles show smaller copies), else the one on screen.
    const urls = [...new Set([isOffline() ? '' : originalOf(shown), shown].filter(Boolean))];
    const r = await window.e2k.savePicture(urls).catch(() => 'failed');
    setIdle(r === 'saved' ? 'Picture saved' : r === 'canceled' ? statusIdle : 'Couldn’t save the picture');
  }
  function viewPicture(img) {
    // Pictures that open when clicked open the same way; any other picture opens on its own.
    if (img.closest('a[data-file]') || img.onclick) img.click();
    else lightbox(img.currentSrc || img.src, img.alt || '');
  }
  function selectAll() {
    if (document.activeElement?.matches?.('input, textarea')) document.activeElement.blur();
    const t = articleText();
    if (t) getSelection().selectAllChildren(t); else document.execCommand('selectAll');
  }
  function ctxItems(e) {
    const field = e.target.closest('input, textarea');
    if (field) {
      if (field.type && !/^(text|search|url|email|number)$/.test(field.type)) return [];
      const sel = field.selectionStart !== field.selectionEnd, ro = field.readOnly || field.disabled;
      // Cut, Copy, and Paste go through the main process: the page's own copy command doesn't reliably reach the clipboard.
      return [['Cut', () => { field.focus(); window.e2k.win('cut'); }, 'Ctrl+X', null, !sel || ro],
        ['Copy', () => { field.focus(); window.e2k.win('copy'); }, 'Ctrl+C', null, !sel],
        ['Paste', () => { field.focus(); window.e2k.win('paste'); }, 'Ctrl+V', null, ro], '-',
        ['Select All', () => { field.focus(); field.select(); }, 'Ctrl+A']];
    }
    const prow = e.target.closest('#fpane [data-key], .myart [data-key]');
    if (prow) return paneCtx(prow, e);
    const copyPic = ['Copy Picture', () => window.e2k.copyImageAt(Math.round(e.clientX), Math.round(e.clientY))];
    // An enlarged picture (the media viewer, or a picture opened on its own).
    const big = e.target.closest('.lightbox img, .mstage img');
    if (big) return [copyPic, ['Save Picture As…', () => savePicture(big)]];
    if (!e.target.closest('#view') || e.target.closest('.overlay, canvas')) return [];
    const groups = [];
    const words = String(getSelection() || '').replace(/\s+/g, ' ').trim();
    if (words) {
      const short = words.length > 30 ? words.slice(0, 28).trim() + '…' : words;
      groups.push([['Copy', 'copy', 'Ctrl+C'], ...(words.length <= 100 ? [[`Look Up “${short}”`, () => go(route('search', words))]] : [])]);
    }
    const a = e.target.closest('a'), img = e.target.closest('img');
    if (a?.dataset.title) {
      const url = Wiki.pageUrl(a.dataset.title.replace(/ /g, '_'));
      groups.push([['Open', () => openArticle(a.dataset.title, linkFrom())], ['Open on Wikipedia', () => window.e2k.openExternal(url)],
        ['Copy Link', () => window.e2k.copyText(url)]]);
    } else if (a?.dataset.ext) {
      groups.push([['Open in Web Browser', () => window.e2k.openExternal(a.dataset.ext)], ['Copy Link', () => window.e2k.copyText(a.dataset.ext)]]);
    }
    if (img) {
      groups.push([['View Picture', () => viewPicture(img)], copyPic,
        ['Save Picture As…', () => savePicture(img)]]);
    }
    if (!groups.length) {
      groups.push([['Back', 'back', 'Alt+Left', null, nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, nav.idx >= nav.stack.length - 1],
        ...(current?.content ? [['Back to the Top', () => toTop(current.content), 'Home']] : [])]);
      groups.push([['Select All', selectAll, 'Ctrl+A'], ...(findable() ? [['Find in Article…', 'find', 'Ctrl+F']] : [])]);
      if (printable()) groups.push([['Print Preview…', 'print', 'Ctrl+P'], ['Print…', 'printNow', 'Ctrl+Shift+P']]);
    } else groups.push([['Select All', selectAll, 'Ctrl+A']]);
    return groups.flatMap((g, i) => (i ? ['-', ...g] : g));
  }
  // Opened from the keyboard with nothing focused, Chromium aims the menu at the window's top-left corner, outside the
  // page. It's for the selected text instead (shown below it), or else for the page on screen.
  function ctxTarget(e) {
    if (e.button === 2 || document.activeElement !== document.body) return e;
    const sel = getSelection(), node = sel.rangeCount && !sel.isCollapsed ? sel.anchorNode : null;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (el?.closest('#view')) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      return { target: el, clientX: r.left, clientY: r.bottom };
    }
    const page = current?.content || $('#view');
    const r = page.getBoundingClientRect();
    return { target: page, clientX: r.left + 24, clientY: r.top + 24 };
  }
  document.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    closeMenus();
    closeCtx();
    const e = ctxTarget(ev);
    const items = ctxItems(e);
    if (!items.length) return;
    const box = h('div', { class: 'menu ctx', role: 'menu', 'aria-label': 'Shortcut menu', tabindex: -1,
      onmousedown: (ev) => ev.stopPropagation(), oncontextmenu: (ev) => { ev.preventDefault(); ev.stopPropagation(); } });
    // The items keep the selection (and the text box's cursor) where it was until the command runs.
    menuItems(box, items.map((it) => (it === '-' ? it : [it[0], it[1], it[2], null, it[4]])), (cmd) => { closeCtx(); runCmd(cmd); });
    document.body.append(box);
    ctxMenu = box;
    ctxReturn = document.activeElement;
    // Opened from the keyboard (the menu key or Shift+F10), the first item takes focus. Opened by the mouse, focus stays
    // where it was (a text box keeps its selection for Cut and Copy), and the arrow keys still reach the menu.
    if (e.button !== 2) $('.mi', box)?.focus({ preventScroll: true });
    // At the pointer, kept inside the window: it opens leftward or upward when there's no room.
    const w = box.offsetWidth, ht = box.offsetHeight;
    box.style.left = Math.max(2, e.clientX + w > innerWidth - 2 ? e.clientX - w : e.clientX) + 'px';
    box.style.top = Math.max(2, e.clientY + ht > innerHeight - 2 ? e.clientY - ht : e.clientY) + 'px';
  });
  document.addEventListener('keydown', (e) => {
    if (!ctxMenu) return;
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeCtx(); } else menuKeys(ctxMenu, e);
  }, true);
  document.addEventListener('mousedown', closeCtx);
  addEventListener('blur', closeCtx);
  addEventListener('resize', closeCtx);
  document.addEventListener('wheel', closeCtx, { passive: true });

  // ---------- search box ----------
  const q = $('#q');
  const sug = $('#suggest');
  let sugItems = [];
  let sugSel = -1;
  let sugTimer = 0;
  let sugToken = 0;
  // Clicking into the box selects what's there, so a new search can be typed straight away (like a browser's address
  // bar); a click while it's already active places the cursor as usual. Tabbing in selects it too.
  let qClickFocus = false;
  q.addEventListener('mousedown', () => { qClickFocus = document.activeElement !== q; });
  q.addEventListener('focus', () => q.select());
  q.addEventListener('mouseup', (e) => { if (qClickFocus) { e.preventDefault(); qClickFocus = false; } });

  function hideSuggest() { sug.hidden = true; sugItems = []; sugSel = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }
  function showSuggest(items, emptyMsg) {
    sugItems = items;
    sugSel = -1;
    sug.replaceChildren(...(items.length ? items.map((it, i) => h('div', {
      class: 'si' + (it.action ? ' act' : ''), id: 'sug-' + i, role: 'option', 'aria-selected': 'false',
      onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); pick(i); },
      onmouseenter: () => highlight(i),
    }, it.action ? h('i', { class: 'th' }, icon(it.icon)) : it.thumb || it.desc === 'Recently viewed' ? h('i', { class: 'th', style: bg(it.thumb) }) : h('i', { class: 'th ph' }, E2KKinds.icon(svg, it.desc)), h('div', {}, h('b', {}, it.title), it.desc ? h('span', {}, it.desc) : null))) : [h('div', { class: 'empty', role: 'option', 'aria-disabled': 'true' }, emptyMsg || 'No suggestions')]));
    sug.hidden = false;
    q.setAttribute('aria-expanded', 'true');
    q.removeAttribute('aria-activedescendant');
  }
  function highlight(i) {
    sugSel = i;
    [...sug.children].forEach((c, j) => { c.classList.toggle('sel', j === i); if (c.id) c.setAttribute('aria-selected', String(j === i)); });
    q.setAttribute('aria-activedescendant', 'sug-' + i);
  }
  function pick(i) {
    const it = sugItems[i];
    if (!it) return;
    if (it.action) return it.action();
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
        const items = (r.pages || []).map((p) => ({ title: p.title, desc: p.description, thumb: https(p.thumbnail?.url) }));
        // In Offline mode only the library is searched; the last row goes back online and searches again.
        if (isOffline() && navigator.onLine) {
          items.push({ title: 'Go online to search all of Wikipedia', desc: 'You’re in Offline mode. Only the offline library is searched.', icon: 'globe',
            action: () => { setOffline(false); q.dispatchEvent(new Event('input')); } });
        }
        showSuggest(items, 'No matching articles');
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
    showSuggest(recentTitles().map((t) => ({ title: t, desc: 'Recently viewed' })), 'No recently viewed articles');
  });

  // ---------- connection ----------
  // The status bar's connection menu: Online or Offline (remembered between launches), "library first", and the
  // offline library. Offline mode loads nothing from the internet; the main process refuses the window's requests too.
  const netBtn = $('#netbtn');
  let netPop = null;
  function closeNet() {
    if (!netPop) return;
    const had = netPop.contains(document.activeElement);
    netPop.remove(); netPop = null;
    netBtn.classList.remove('open');
    netBtn.setAttribute('aria-expanded', 'false');
    if (had) netBtn.focus({ preventScroll: true });
  }
  function setOffline(on) {
    closeNet();
    if (on === isOffline()) return;
    window.e2k.net.setOffline(on);
    window.e2k.notice.refresh();   // notices hide in Offline mode, and come back after
    updateNet();
    announce(on ? 'Offline mode is on. Only the offline library is used.' : 'Online.');
    reload();   // the page on screen comes again, from the right place
  }
  // Offline picked with no library: offer one. The app stays online meanwhile, and asks again once it's ready.
  function askDownload() {
    dialog('Encyclopedia 2000', 'Offline mode needs an offline library', ['Download one to read Wikipedia without the internet. You can keep reading online while it downloads.'],
      [['Not now'], ['Download offline library…', () => { store.set('offlineWhenReady', true); E2KLibrary.open(E2K); }, true]]);
  }
  // Offline mode on or off from the keyboard (Ctrl+Shift+O) or Tools › Offline Mode.
  function toggleOffline() {
    if (isOffline()) setOffline(false);
    else if (hasLib || libMissing || hasDownloads) setOffline(true);
    else askDownload();
  }
  async function openNet() {
    if (netPop) return closeNet();
    const st = await window.e2k.library.state().catch(() => null);
    if (netPop) return;
    const has = !!(st && st.open), off = isOffline();
    const name = st && st.override ? st.override : st && st.current ? st.current.label : st && st.open ? st.open.title : '';
    const opt = (on, title, sub, onpick) => h('div', { class: 'it mi' + (on ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(on), tabindex: -1, onclick: onpick },
      h('i', { class: 'rb' }), h('span', {}, h('b', {}, title), h('span', { class: 's' }, sub)));
    const first = h('input', { type: 'checkbox', checked: store.get('libraryFirst', false), disabled: off || !has,
      onchange: () => { store.set('libraryFirst', first.checked); updateNet(); } });
    netPop = h('div', { class: 'netpop', role: 'menu', 'aria-label': 'Connection', onmousedown: (e) => e.stopPropagation() },
      h('div', { class: 'hd' }, 'Connection'),
      !Wiki.connected() && !off ? h('div', { class: 'note' }, has ? 'No internet connection. Reading from the offline library until it’s back.' : 'No internet connection.') : null,
      opt(!off, 'Online', 'Uses the offline library when there’s no connection.', () => setOffline(false)),
      opt(off, 'Offline', has || !hasDownloads ? 'Only the offline library. Nothing loads from the internet.' : 'Only your downloaded articles. Nothing loads from the internet.',
        () => (has || libMissing || hasDownloads ? setOffline(true) : (closeNet(), askDownload()))),
      h('hr'),
      h('div', { class: 'cb mi' + (off || !has ? ' dis' : ''), role: 'menuitemcheckbox', tabindex: -1, 'aria-checked': String(first.checked),
        ...(off || !has ? { 'aria-disabled': 'true' } : {}), onclick: (e) => { if (e.target !== first) { e.preventDefault(); if (!first.disabled) first.click(); } } }, first,
        h('span', {}, 'Use the offline library first, even when online', h('span', { class: 's' }, has ? 'Faster; uses less data.' : 'Needs an offline library.'))),
      h('hr'),
      has ? h('div', { class: 'lib' }, 'Offline library: ', h('b', {}, name), ` · ${st.open.articles.toLocaleString('en-US')} articles`)
        : libMissing ? h('div', { class: 'lib' }, 'Offline library: ', h('b', {}, libMissing.label), ' · can’t be found') : null,
      h('div', { class: 'lnk mi', role: 'menuitem', tabindex: -1, onclick: () => { closeNet(); E2KLibrary.open(E2K); } }, icon('book'), has || libMissing ? 'Manage offline library…' : 'Download offline library…'));
    first.tabIndex = -1;
    first.setAttribute('aria-hidden', 'true');
    first.addEventListener('change', () => first.closest('.cb').setAttribute('aria-checked', String(first.checked)));
    netPop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeNet(); } else menuKeys(netPop, e);
    });
    document.body.append(netPop);
    netBtn.classList.add('open');
    netBtn.setAttribute('aria-expanded', 'true');
    // The choice that's on takes focus, so a screen reader reads where you are.
    $('.it.on', netPop)?.focus({ preventScroll: true });
    const r = netBtn.getBoundingClientRect(), pr = netPop.getBoundingClientRect();
    netPop.style.left = Math.max(6, Math.min(innerWidth - pr.width - 6, r.right - pr.width)) + 'px';
    netPop.style.top = (r.top - pr.height - 4) + 'px';
  }
  netBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); openNet(); });
  netBtn.addEventListener('keydown', (e) => { if (['Enter', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); openNet(); } });
  document.addEventListener('mousedown', closeNet);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNet(); });
  addEventListener('resize', closeNet);
  // The library comes and goes: the light follows it, Offline mode ends if it's removed, and a download that began
  // from picking Offline asks once, when it's done, whether to switch.
  // A library that can't be found keeps Offline mode on (the pages say what happened), and when it's back, the page on
  // screen comes again from it.
  function libChanged(s) {
    const wasMissing = !!libMissing;
    hasLib = !!(s && s.open);
    libMissing = s && s.missing ? { label: s.current ? s.current.label : 'Your offline library', where: s.missing.where } : null;
    downloadsKnown.then(() => { if (!hasLib && !libMissing && !hasDownloads && isOffline()) setOffline(false); });
    updateNet();
    if (wasMissing && hasLib && (isOffline() || nav.stack[nav.idx] === 'home')) reload();
    if (hasLib && !s.download && store.get('offlineWhenReady', false)) {
      store.set('offlineWhenReady', false);
      if (isOffline()) return;
      dialog('Encyclopedia 2000', 'Your offline library is ready',
        [`${s.current ? s.current.label : s.open.title} · ${s.open.articles.toLocaleString('en-US')} articles. Switch to Offline mode now? You can switch back any time from the status bar.`],
        [['Stay online'], ['Switch to Offline', () => setOffline(true), true]]);
    }
  }
  if (window.e2k.library) {
    window.e2k.library.onUpdate(libChanged);
    window.e2k.library.state().then(libChanged).catch(() => {});
  }

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

  // ---------- find in article ----------
  // Ctrl+F on an article: a bar under the title band finds a word in the article's text (not the rail or menus).
  // Every match is highlighted; the current one stands out and scrolls into view. Enter and Shift+Enter (or ‹ ›) step
  // through them; Esc or ✕ closes the bar and takes the highlights away.
  // (Function declarations and var, since the menus and the first page are built before this part of the file runs.)
  function articleText() { return $('#view .content.article .text'); }
  function findable() { return !!articleText(); }
  var findBar = null, findMarks = [], findAt = -1, findTimer = 0;
  function clearMarks() {
    const parents = new Set();
    findMarks.forEach((m) => { if (m.isConnected) { parents.add(m.parentNode); m.replaceWith(m.textContent); } });
    parents.forEach((p) => p.normalize());
    findMarks = []; findAt = -1;
  }
  function placeFind() {
    const band = $('#view .band');
    if (!findBar || !band) return;
    const r = band.getBoundingClientRect();
    const right = parseFloat(getComputedStyle(band).getPropertyValue('--flow-right')) || 22;
    findBar.style.top = r.bottom + 'px';
    findBar.style.left = Math.max(r.left + 8, r.right - right - findBar.offsetWidth) + 'px';
  }
  function showMatch(i) {
    if (!findMarks.length) return;
    findAt = (i + findMarks.length) % findMarks.length;
    findMarks.forEach((m, j) => m.classList.toggle('cur', j === findAt));
    findMarks[findAt].scrollIntoView({ block: 'center' });
  }
  function runFind() {
    clearMarks();
    const text = articleText(), q = findBar.querySelector('input').value;
    const count = findBar.querySelector('.n');
    findBar.classList.remove('none');
    if (!text || !q.trim()) { count.textContent = ''; return; }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => (n.parentElement.closest('style, script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const v = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(v)) continue;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(v))) {
        frag.append(v.slice(last, m.index));
        findMarks.push(frag.appendChild(h('mark', { class: 'fh' }, m[0])));
        last = m.index + m[0].length;
      }
      frag.append(v.slice(last));
      node.replaceWith(frag);
    }
    if (!findMarks.length) { count.textContent = 'No matches'; findBar.classList.add('none'); return; }
    // Start at the first match below the top of what's on screen, so finding doesn't jump back to the beginning.
    const top = $('#view .band').getBoundingClientRect().bottom;
    const first = findMarks.findIndex((m) => m.getBoundingClientRect().top >= top);
    showMatch(first < 0 ? 0 : first);
    count.textContent = `${findAt + 1} of ${findMarks.length}`;
  }
  function step(d) {
    if (!findMarks.length) return;
    showMatch(findAt + d);
    findBar.querySelector('.n').textContent = `${findAt + 1} of ${findMarks.length}`;
  }
  function openFind() {
    // Text selected in the article becomes the search, as in a browser.
    const sel = String(getSelection() || '').trim();
    if (!findBar) {
      const input = h('input', { 'aria-label': 'Find in article', spellcheck: 'false',
        oninput: () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 150); },
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findTimer); if (!findMarks.length) runFind(); else step(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
        } });
      findBar = h('div', { class: 'findbar', role: 'search' },
        h('label', {}, 'Find in article'), input, h('span', { class: 'n', 'aria-live': 'polite' }),
        h('button', { title: 'Previous (Shift+Enter)', 'aria-label': 'Previous match', onclick: () => step(-1) }, '‹'),
        h('button', { title: 'Next (Enter)', 'aria-label': 'Next match', onclick: () => step(1) }, '›'),
        h('button', { class: 'x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => closeFind() }, '✕'));
      document.body.append(findBar);
    }
    placeFind();
    const input = findBar.querySelector('input');
    if (sel && sel.length < 80 && !sel.includes('\n')) { input.value = sel; runFind(); }
    input.focus(); input.select();
  }
  function closeFind() {
    if (!findBar) return;
    clearTimeout(findTimer);
    clearMarks();
    findBar.remove(); findBar = null;
  }
  addEventListener('resize', placeFind);

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Escape') { closeFind(); closeMenus(); closeCtx(); hideSuggest(); closeOverlays(); closeVolume(); if (!fpane.hidden && !pinned()) toggleFavPane(false); return; }
    // Home (or Ctrl+Home) goes to the top of an article, unless you're typing.
    if (k === 'Home' && current?.content && !$('.overlay') && !e.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
      e.preventDefault();
      toTop(current.content);
      return;
    }
    if (MAC) return; // macOS shortcuts come from the menu bar.
    if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); fwd(); }
    else if (k === 'F5') { e.preventDefault(); reload(); }
    else if (e.ctrlKey && e.shiftKey && !e.altKey && { p: 1, l: 1, o: 1 }[k.toLowerCase()]) { e.preventDefault(); runCmd({ p: 'printNow', l: 'library', o: 'offline' }[k.toLowerCase()]); }
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); runCmd(['explore', 'gallery', 'onthisday', 'world', 'games', 'activities'][e.code.slice(5) - 1]); }
    else if (e.ctrlKey && !e.shiftKey) {
      const map = { i: 'favpane', d: 'fav', b: 'myfavs', y: 'myhist', p: 'print', f: 'find', e: 'search', '/': 'shortcuts', h: 'home', m: 'mute', ',': 'options', '=': 'bigger', '+': 'bigger', '-': 'smaller', '0': 'normal' };
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
    // For Options: History, and what's downloaded.
    historyCount: () => history().length,
    clearHistory: (done) => { clearHistoryDialog(); const ov = $$('.overlay').pop(); if (ov && done) new MutationObserver((_, mo) => { if (!ov.isConnected) { mo.disconnect(); done(); } }).observe(document.body, { childList: true }); },
    downloadedCategories: () => dlCats().map((c) => ({ name: c.name, n: catDownloaded(c).length })).filter((c) => c.n),
    removeAllDownloads,
    downloadTitle,
    openArticle: (t) => openArticle(t, linkFrom()),
    setCrumbs,
    setIdle, setStatus, setFontScale, applyPrefs, updateVolume, speechStop, updateNet, announce,
    // True when nothing can come from the internet: Offline mode, or no connection.
    offline: () => isOffline() || !Wiki.connected(),
    dialog: (...args) => dialog(...args),
    command: (cmd) => runCmd(cmd),   // a menu command by name (the tests use it)
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
  setTimeout(askAboutUpdates, 1500);
})();
