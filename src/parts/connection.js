// Connection: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['connection'] = (A) => {
  'use strict';
  const { $, h, icon, store } = A;
  const { announce, isOffline, updateNet, reload } = A.fn;

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
    // Also for a library file someone already has (a Kiwix .zim they downloaded themselves): a Reddit user, 2026-11-22,
    // had one and was only offered a download.
    A.dialog('Encyclopedia 2000', 'Offline mode needs an offline library', ['Download one to read Wikipedia without the internet, or use a library file (.zim) you already have. You can keep reading online meanwhile.'],
      [['Not now'], ['Use my file…', () => { store.set('offlineWhenReady', 'now'); E2KLibrary.open(A.E2K, { openFile: true }); }],
        ['Download one…', () => { store.set('offlineWhenReady', true); E2KLibrary.open(A.E2K); }, true]]);
  }
  // Offline mode on or off from the keyboard (Ctrl+Shift+O) or Tools › Offline Mode.
  function toggleOffline() {
    if (isOffline()) setOffline(false);
    else if (A.hasLib || A.libMissing || A.hasDownloads) setOffline(true);
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
      opt(off, 'Offline', has || !A.hasDownloads ? 'Only the offline library. Nothing loads from the internet.' : 'Only your downloaded articles. Nothing loads from the internet.',
        () => (has || A.libMissing || A.hasDownloads ? setOffline(true) : (closeNet(), askDownload()))),
      h('hr'),
      h('div', { class: 'cb mi' + (off || !has ? ' dis' : ''), role: 'menuitemcheckbox', tabindex: -1, 'aria-checked': String(first.checked),
        ...(off || !has ? { 'aria-disabled': 'true' } : {}), onclick: (e) => { if (e.target !== first) { e.preventDefault(); if (!first.disabled) first.click(); } } }, first,
        h('span', {}, 'Use the offline library first, even when online', h('span', { class: 's' }, has ? 'Faster; uses less data.' : 'Needs an offline library.'))),
      h('hr'),
      has ? h('div', { class: 'lib' }, 'Offline library: ', h('b', {}, name), ` · ${st.open.articles.toLocaleString('en-US')} articles`)
        : A.libMissing ? h('div', { class: 'lib' }, 'Offline library: ', h('b', {}, A.libMissing.label), ' · can’t be found') : null,
      h('div', { class: 'lnk mi', role: 'menuitem', tabindex: -1, onclick: () => { closeNet(); E2KLibrary.open(A.E2K); } }, icon('book'), has || A.libMissing ? 'Manage offline library…' : 'Download offline library…'));
    first.tabIndex = -1;
    first.setAttribute('aria-hidden', 'true');
    first.addEventListener('change', () => first.closest('.cb').setAttribute('aria-checked', String(first.checked)));
    netPop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeNet(); } else A.menuKeys(netPop, e);
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
    const wasMissing = !!A.libMissing;
    A.hasLib = !!(s && s.open);
    A.libMissing = s && s.missing ? { label: s.current ? s.current.label : 'Your offline library', where: s.missing.where } : null;
    A.downloadsKnown.then(() => { if (!A.hasLib && !A.libMissing && !A.hasDownloads && isOffline()) setOffline(false); });
    updateNet();
    if (wasMissing && A.hasLib && (isOffline() || A.nav.stack[A.nav.idx] === 'home')) reload();
    if (A.hasLib && !s.download && store.get('offlineWhenReady', false)) {
      const now = store.get('offlineWhenReady', false) === 'now';   // a file just chosen for Offline mode: no need to ask again
      store.set('offlineWhenReady', false);
      if (isOffline()) return;
      if (now) { setOffline(true); return; }
      A.dialog('Encyclopedia 2000', 'Your offline library is ready',
        [`${s.current ? s.current.label : s.open.title} · ${s.open.articles.toLocaleString('en-US')} articles. Switch to Offline mode now? You can switch back any time from the status bar.`],
        [['Stay online'], ['Switch to Offline', () => setOffline(true), true]]);
    }
  }
  if (window.e2k.library) {
    window.e2k.library.onUpdate(libChanged);
    window.e2k.library.state().then(libChanged).catch(() => {});
  }

  return { closeNet, setOffline, toggleOffline, libChanged };
};
