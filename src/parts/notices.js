// Notices: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts.notices = (A) => {
  'use strict';
  const { $, h, store } = A;
  const { go, fitHome } = A.fn;

  // From encyclopedia2000.com (notices.js): a news item on Home, above Explore, and an important notice as a banner
  // under the toolbar on every screen. Each is shown until it's closed, then never again. The first time news is
  // closed, a line in its place says where news can be turned off, and fades away by itself.
  let notices = { news: null, important: null };
  const noticeSeen = (id) => store.get('noticeSeen', []).includes(id);
  const closeNotice = (id) => store.set('noticeSeen', [...store.get('noticeSeen', []), id].slice(-50));
  // A link opens the website in the browser, or (link.route) a screen in the app, which also closes the notice.
  const noticeLink = (link, cls, done) => (link ? h('button', { class: cls, onclick: () => {
    if (!link.route) return window.e2k.openExternal(link.url);
    done();
    go(link.route);
  } }, link.label) : null);
  function showBanner() {
    $('#notice')?.remove();
    const n = notices.important;
    if (!n || noticeSeen(n.id)) return;
    const close = () => { closeNotice(n.id); bar.remove(); fitHome(); };
    const bar = h('div', { class: 'notice', id: 'notice', role: 'region', 'aria-label': 'Important notice' },
      h('span', { class: 'ni', 'aria-hidden': 'true' }, '!'), h('span', { class: 'nt' }, n.text), noticeLink(n.link, 'nl', close),
      h('button', { class: 'nx', title: 'Close', 'aria-label': 'Close notice', onclick: close }, '✕'));
    $('.stage').before(bar);
    fitHome();
  }
  function showNews(canvas = $('.home-canvas')) {
    if (!canvas) return;
    canvas.querySelector('.news')?.remove();
    const n = notices.news;
    if (!n || noticeSeen(n.id)) return;
    const strip = h('div', { class: 'news', role: 'region', 'aria-label': 'News' },
      h('small', {}, 'NEWS'), h('span', { title: n.text }, n.text), noticeLink(n.link, 'more', () => { closeNotice(n.id); strip.remove(); }),
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
      h('span', {}, 'You can turn off news anytime in ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); hide(); E2KOptions.open(A.E2K, 'Privacy', 'News'); } }, 'Options'), '.'),
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

  return { showNews };
};
