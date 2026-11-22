// Feedback: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['feedback'] = (A) => {
  'use strict';
  const { h } = A;
  const { setIdle } = A.fn;

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

  return { prettyVersion, feedback };
};
