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

  const MAC = window.e2k.platform === 'darwin';
  const view = $('#view');

  // ---------- state ----------
  // (view, the page area, is set at the top, since parts use it as they start.)
  const nav = { stack: [], from: [], scroll: [], idx: -1 };
  let renderToken = 0;
  let current = null; // the article on screen: { title, desc, thumb }
  let speaking = false;
  let feedCache = null;
  let gameCleanup = null;
  let activityFilter = 'All';   // Activities' subject filter (the location bar's menu sets it too)
  let ctxMenu = null, ctxReturn = null;   // the open right-click menu, and where focus goes when it closes
  let renaming = null, showKey = null;   // My Articles: the folder being renamed; the row to show after drawing
  let myPage = null;   // the My Articles page, while it's open
  let dlList = [], dlIndex = new Map(), dlLoaded = false;   // the downloaded articles (and by title), once read
  let downloadJobs = [];   // articles downloading now

  // ---------- parts ----------
  // Parts of the app in their own files (src/parts/*.js, loaded before this one). Each is a function given this table
  // (A) of shared helpers; it returns what the rest of the app uses from it. Functions defined further down this file,
  // or in another part, are reached through A.fn, which looks them up only when called (see the end of this file).
  const A = { h, svg, $, $$, icon, store };
  A.fn = new Proxy({}, { get: (_, name) => (...args) => {
    const f = A[name];
    if (typeof f !== 'function') throw new Error(`${String(name)} isn't ready yet (called through A.fn before it's set)`);
    return f(...args);
  } });
  // Values the parts read from this file, looked up when read (so they're always current).
  Object.defineProperties(A, {
    strip: { get: () => strip },
    decodeHtml: { get: () => decodeHtml },
    https: { get: () => https },
    bg: { get: () => bg },
    setIdle: { get: () => setIdle },
    live: { get: () => live },
    railLink: { get: () => railLink },
    railSection: { get: () => railSection },
    sized: { get: () => sized },
    longDate: { get: () => longDate },
    route: { get: () => route },
    setStatus: { get: () => setStatus },
    isOffline: { get: () => isOffline },
    go: { get: () => go },
    openArticle: { get: () => openArticle },
    setCrumbs: { get: () => setCrumbs },
    mount: { get: () => mount },
    todayFeed: { get: () => todayFeed },
    shell: { get: () => shell },
    bandBtn: { get: () => bandBtn },
    loading: { get: () => loading },
    E2K: { get: () => E2K },
    firstRun: { get: () => firstRun },
    MAC: { get: () => MAC },
    keyText: { get: () => keyText },
    syncMenu: { get: () => syncMenu },
    linkFrom: { get: () => linkFrom },
    reload: { get: () => reload },
    TOOLS: { get: () => TOOLS },
    hasLib: { get: () => hasLib, set: (v) => { hasLib = v; } },
    hasDownloads: { get: () => hasDownloads, set: (v) => { hasDownloads = v; } },
    libMissing: { get: () => libMissing, set: (v) => { libMissing = v; } },
    focusScreen: { get: () => focusScreen },
    originalOf: { get: () => originalOf },
    toTop: { get: () => toTop },
    nav: { get: () => nav },
    current: { get: () => current, set: (v) => { current = v; } },
    ctxMenu: { get: () => ctxMenu, set: (v) => { ctxMenu = v; } },
    ctxReturn: { get: () => ctxReturn, set: (v) => { ctxReturn = v; } },
    statusIdle: { get: () => statusIdle, set: (v) => { statusIdle = v; } },
    speaking: { get: () => speaking, set: (v) => { speaking = v; } },
    winIcon: { get: () => winIcon },
    renaming: { get: () => renaming, set: (v) => { renaming = v; } },
    showKey: { get: () => showKey, set: (v) => { showKey = v; } },
    myPage: { get: () => myPage, set: (v) => { myPage = v; } },
    dlList: { get: () => dlList, set: (v) => { dlList = v; } },
    dlIndex: { get: () => dlIndex, set: (v) => { dlIndex = v; } },
    dlLoaded: { get: () => dlLoaded, set: (v) => { dlLoaded = v; } },
    downloadJobs: { get: () => downloadJobs, set: (v) => { downloadJobs = v; } },
    setFontScale: { get: () => setFontScale },
    back: { get: () => back },
    fwd: { get: () => fwd },
    view: { get: () => view },
    announce: { get: () => announce },
    updateNet: { get: () => updateNet },
    drawCrumbs: { get: () => drawCrumbs },
    gameCleanup: { get: () => gameCleanup, set: (v) => { gameCleanup = v; } },
    activityFilter: { get: () => activityFilter, set: (v) => { activityFilter = v; } },
  });
  const part = (name) => Object.assign(A, window.E2KParts[name](A));
  const { articleText, findable, openFind, closeFind } = part('find');
  // The other parts start further down, where their code was before it moved (so the app's setup runs in the same
  // order); their functions are reached through A.fn, so they can be called from anywhere once their part has started.
  const {
    clock, noUtm, fileName, videoSource, creditOf, articleMedia, waveform, mediaBox, wireMedia, volControl,
    playerParts, soundPlayer, recordingLanguage, pronButton, sameFile, mediaSlots, mediaViewer, viewGallery,
    askAboutUpdates, checkForUpdates, showNews, whatsNew, maybeWhatsNew, prettyVersion, feedback, donate, lightbox,
    hideSuggest, updateVolume, toggleMute, closeVolume, viewOnThisDay, viewExplore, showError, relatedInLibrary,
    closeOverlays, topOverlay, dialog, about, closeCtx, favs, walkFavs, favTitles, sameTitle, favAt, folderAt,
    isFavTitle, isFav, afterFolders, saveFavs, addFav, removeFav, toggleFav, favCount, newFolder, renameFolder,
    setFolderOpen, canMove, moveFav, deleteFolder, history, dayStart, recentTitles, infoOf, keepInfo, addRecent,
    removeHistory, clearHistoryDialog, historyChanged, toggleSpeak, speechStop, pinned, dlEntry, dlJob,
    loadDownloaded, markFor, refreshMarks, dragFrom, dropOn, drawFavPane, toggleFavPane, folderPicker, paneCtx,
    downloadAllDialog, queueDownloads, dlCats, categoryDialog, removeAllDownloads, catDownloaded, deleteCategory,
    viewMyArticles, refreshMyPage, manageMenu, updateToolbar, printable, runCmd, menus, closeMenus, menuItems,
    subKeys, menuKeys, closeNet, setOffline, toggleOffline, libChanged, mb, downloadButton, downloadDefaults, dlWith,
    downloadTitle, starred, starTarget, routeOf, isStarred, setStar, viewActivities, viewActivity, viewGame,
    viewWorld, shortcuts, orb, viewHome, fitHome,
  } = A.fn;

  // A brand-new install has nothing saved yet. Checked before anything is saved, for What's New below.
  const firstRun = (() => { try { return !Object.keys(localStorage).some((k) => k.startsWith('e2k.')); } catch { return false; } })();

  // ---------- platform ----------
  // Menus and tooltips name Windows shortcuts. macOS uses Command instead, and avoids the shortcuts it reserves
  // (Command-H hides the app and Command-M minimizes it). MAC is set at the top, since parts use it as they start.
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
      if (cmd && typeof cmd === 'object' && cmd.sub) return { label, items: conv(cmd.sub) };
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
  const SECTIONS = { explore: 'Browse', gallery: 'Media', onthisday: 'Timeline', world: 'World Explorer', activities: 'Activities' };
  let crumbs = { trail: [], sub: [], onRoot: null };

  function baseTrail(r, from) {
    const [name, ...rest] = r.split('/');
    const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
    const home = { label: 'Home', r: 'home' };
    if (SECTIONS[name]) return [home, { label: SECTIONS[name], r: name }];
    if (name === 'random') return [home, { label: 'Random article' }];
    if (name === 'search') return [home, { label: 'Search' }, { label: `“${arg}”`, r }];
    if (name === 'article') return [...(from || [home, { label: 'Browse', r: 'explore' }]), { label: splitSection(arg)[0], r }];
    if (name === 'game') return [home, { label: 'Activities', r: 'activities' }, { label: E2KGames.get(arg)?.name || arg, r }];
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
    // Inside a game or activity: its Star button at the right end.
    const r = nav.stack[nav.idx] || '';
    const target = r !== 'activities' && starTarget(r);
    if (target) {
      const on = isStarred(r);
      parts.push(h('button', { class: 'cstar' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': `Star ${target.name}`,
        title: on ? `Unstar ${target.name} (it’s listed first in Activities)` : `Star ${target.name}, to list it first in Activities`,
        onclick: () => setStar(r, !on) }, h('i', { 'aria-hidden': 'true' }, on ? '★' : '☆'), on ? 'Starred' : 'Star'));
    }
    crumbsEl.replaceChildren(...parts);
    // Light the toolbar button for the section this page belongs to.
    const section = steps[1]?.r === 'myarticles/favorites' && steps[2]?.r === 'myarticles/history' ? 'myhist' : steps[1]?.r;
    $$('.tbtn[data-cmd="explore"], .tbtn[data-cmd="gallery"], .tbtn[data-cmd="activities"], .tbtn[data-cmd="myhist"]').forEach((b) => b.classList.toggle('on', b.dataset.cmd === section));
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

  let cameBack = false;   // this screen was opened with Back or Forward (games use it to return to where the player was)
  async function render(r, restore = false) {
    const token = ++renderToken;
    cameBack = restore;
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
        case 'games': activityFilter = 'All'; go('activities', { replace: true }); break;
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

  const { MAX_CANVAS } = part('home');   // src/parts/home.js

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

  const { saved, downloadsKnown } = part('downloads');   // src/parts/downloads.js

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

  part('explore');   // src/parts/explore.js
  part('gallery');   // src/parts/gallery.js
  part('on-this-day');   // src/parts/on-this-day.js
  part('games');   // src/parts/games.js
  part('starred');   // src/parts/starred.js
  part('activities');   // src/parts/activities.js
  part('world-explorer');   // src/parts/world-explorer.js
  part('errors');   // src/parts/errors.js
  part('overlays');   // src/parts/overlays.js
  part('shortcuts');   // src/parts/shortcuts.js
  part('whats-new');   // src/parts/whats-new.js
  part('feedback');   // src/parts/feedback.js
  part('notices');   // src/parts/notices.js
  part('updates');   // src/parts/updates.js
  part('donate');   // src/parts/donate.js
  part('media');   // src/parts/media.js
  const { FOLDER_DEPTH } = part('favorites');   // src/parts/favorites.js
  part('history');   // src/parts/history.js
  const { fpane } = part('my-articles-pane');   // src/parts/my-articles-pane.js
  part('download-category');   // src/parts/download-category.js
  part('my-articles-page');   // src/parts/my-articles-page.js
  part('toolbar');   // src/parts/toolbar.js
  part('menus');   // src/parts/menus.js
  part('right-click');   // src/parts/right-click.js
  part('search-box');   // src/parts/search-box.js
  part('connection');   // src/parts/connection.js
  part('volume');   // src/parts/volume.js

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
    else if (e.ctrlKey && !e.shiftKey && !e.altKey && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); runCmd(['explore', 'gallery', 'onthisday', 'world', 'activities'][e.code.slice(5) - 1]); }
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
    cameBack: () => cameBack,
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
  updateVolume();   // the volume control's first look (src/parts/volume.js)
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
