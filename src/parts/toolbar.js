// Toolbar: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['toolbar'] = (A) => {
  'use strict';
  const { $, store } = A;
  const { syncMenu, setStatus, setIdle, setFontScale, go, back, fwd, reload, openArticle, todayFeed, orb, shortcuts, toggleOffline } = A.fn;

  function updateToolbar() {
    syncMenu();
    const btn = (c) => $(`.tbtn[data-cmd="${c}"]`);
    btn('back').disabled = A.nav.idx <= 0;
    btn('fwd').disabled = A.nav.idx >= A.nav.stack.length - 1;
    btn('speak').disabled = !A.current;
    btn('print').disabled = !printable();
    const fav = A.isFav();
    btn('speak').classList.toggle('on', A.speaking);
    btn('speak').title = A.speaking ? 'Stop reading' : 'Read Aloud';
    btn('favpane').classList.toggle('on', !A.fpane.hidden);
    A.drawFavPane();
    if (A.current?.favBtn) {
      A.current.favBtn.lastChild.textContent = fav ? 'In Favorites' : 'Add to Favorites';
      A.current.favBtn.classList.toggle('on', fav);
      A.current.speakBtn.lastChild.textContent = A.speaking ? 'Stop Reading' : 'Read Aloud';
      A.current.speakBtn.classList.toggle('on', A.speaking);
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
    fav: A.toggleFav,
    donate: () => A.donate(),
    feedback: () => A.feedback(),
    privacy: () => window.e2k.openExternal('https://github.com/sburton0/encyclopedia-2000/blob/main/PRIVACY.md'),
    updates: () => A.checkForUpdates(),
    whatsnew: () => A.whatsNew(),
    shortcuts: () => shortcuts(),
    favpane: () => A.toggleFavPane(),
    myfavs: () => go('myarticles/favorites'),
    mydl: () => go('myarticles/downloaded'),
    myhist: () => go('myarticles/history'),
    manage: () => A.manageMenu($('.tbtn[data-cmd="manage"]')),
    speak: A.toggleSpeak,
    // Through the main process: the page's own copy command doesn't reliably reach the clipboard.
    copy: () => window.e2k.win('copy'),
    // Print is turned off on screens without a printable page; the keyboard shortcuts quietly do nothing there.
    print: () => { if (printable()) window.e2k.printPreview(); },
    printNow: () => { if (printable()) window.e2k.win('print'); },
    // Ctrl+F searches the article on screen; anywhere else (Home, games) it goes to the Find box, like Ctrl+E.
    find: () => (A.findable() ? A.openFind() : runCmd('search')),
    search: () => { A.closeFind(); $('#q').focus(); $('#q').select(); },
    bigger: () => setFontScale(store.get('fontScale', 1) + 0.1),
    smaller: () => setFontScale(store.get('fontScale', 1) - 0.1),
    normal: () => setFontScale(1),
    mute: () => A.toggleMute(),
    world: () => orb('world').run(),
    activities: () => orb('activities').run(),
    about: A.about,
    options: () => E2KOptions.open(A.E2K),
    library: () => E2KLibrary.open(A.E2K),
    offline: () => toggleOffline(),
    themes: () => E2KOptions.open(A.E2K, 'Appearance'),
    exit: () => window.e2k.win('close'),
  };
  // Articles and the other reading pages can be printed; the home screen and games can't.
  const printable = () => !!A.view.querySelector('.page');
  const runCmd = (c) => { syncMenu(); return typeof c === 'function' ? c() : COMMANDS[c] && COMMANDS[c](); };
  $('#feedback-link').addEventListener('click', (e) => { e.preventDefault(); A.feedback(); });
  const supportLink = $('#support');
  supportLink.addEventListener('click', (e) => { e.preventDefault(); A.donate(); });
  supportLink.addEventListener('mouseover', () => setStatus('Donate to Wikipedia, or tip the developer'));
  supportLink.addEventListener('mouseout', () => setStatus(A.statusIdle));

  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tbtn');
    if (b && !b.disabled) runCmd(b.dataset.cmd);
  });

  return { updateToolbar, printable, runCmd };
};
