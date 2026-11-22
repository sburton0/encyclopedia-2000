// What's new: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['whats-new'] = (A) => {
  'use strict';
  const { h, store } = A;
  const { setIdle, dialog } = A.fn;

  // Shown once after updating to a new feature release (0.2, 0.3, and so on), and any time from Help › What's New.
  // New installs skip it, and bug-fix releases don't change it.
  const WHATS_NEW = {
    version: '0.6',
    name: '0.6 Beta',
    // Three features, each with a close-up picture (whatsnew/, 480×300, shown at half size so they're sharp on
    // high-DPI screens; made from the real app, see mockups/whats-new/), then the rest in a short list.
    pictures: [
      ['whatsnew/download.jpg', 'An article’s Download for Offline menu', 'Download for Offline', 'Save articles with their pictures and sounds to read anywhere.'],
      ['whatsnew/myarticles.jpg', 'The My Articles pane, with favorites in folders', 'My Articles', `Favorites in folders, downloads, and History, all in one place (${A.MAC ? '⌘I' : 'Ctrl+I'}).`],
      ['whatsnew/passport.jpg', 'Passport, with three continent stamps', 'Passport and Animal Sounds', 'New in Activities, beside Star Chart. Star the ones you like.'],
    ],
    also: ['Every activity works offline.', 'A new toolbar: Browse, Media, Activities, My Articles, then History and Random.', 'Links to part of an article open at that part.'],
  };
  const RELEASES_URL = 'https://github.com/sburton0/encyclopedia-2000/releases/latest';
  const featureVersion = (v) => (v || '').split(/[.-]/).slice(0, 2).join('.');
  function whatsNew() {
    if (document.querySelector('.dialog.whatsnew')) return;
    dialog('What’s New', `What’s new in version ${WHATS_NEW.name}`, [
      h('div', { class: 'wnpics' }, WHATS_NEW.pictures.map(([src, alt, name, line]) =>
        h('figure', {}, h('img', { src, alt }), h('figcaption', {}, h('b', {}, name), h('span', {}, line))))),
      h('div', { class: 'wnalso' }, h('b', {}, 'Also new'), h('ul', {}, WHATS_NEW.also.map((t) => h('li', {}, t)))),
    ], [['See All Changes…', () => { window.e2k.openExternal(RELEASES_URL); setIdle('Opened in your web browser'); }], ['Close', null, true]]);
    document.querySelector('.overlay:last-child .dialog').classList.add('whatsnew');
  }
  async function maybeWhatsNew() {
    const { version } = await window.e2k.appInfo().catch(() => ({}));
    if (featureVersion(version) !== WHATS_NEW.version || store.get('whatsNewSeen', '') === WHATS_NEW.version) return;
    store.set('whatsNewSeen', WHATS_NEW.version);
    if (!A.firstRun) setTimeout(whatsNew, 1200);
  }

  return { whatsNew, maybeWhatsNew };
};
