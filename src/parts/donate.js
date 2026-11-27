// Donate: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['donate'] = (A) => {
  'use strict';
  const { h } = A;
  const { setIdle } = A.fn;

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

  return { donate, lightbox };
};
