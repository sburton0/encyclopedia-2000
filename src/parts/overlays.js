// Overlays: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['overlays'] = (A) => {
  'use strict';
  const { $$, h } = A;
  const { focusScreen } = A.fn;

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
    `Version ${A.prettyVersion((await window.e2k.appInfo().catch(() => ({}))).version)}.`,
    'Articles and pictures come live from Wikipedia and Wikimedia Commons, written by volunteers and shared under Creative Commons licenses.',
    'Offline libraries are Wikipedia as packaged by Kiwix (kiwix.org), a nonprofit that makes Wikipedia available offline, downloaded through mirrors run by volunteers around the world.',
    'Encyclopedia 2000 is an independent project. It isn’t affiliated with the Wikimedia Foundation, Kiwix, or Microsoft.',
    h('p', { class: 'support' }, 'Encyclopedia 2000 is free because Wikipedia is. If you find it useful, please consider supporting the Wikimedia Foundation, the nonprofit that runs Wikipedia.'),
  ], [['Donate…', () => A.donate()], ['OK', null, true]]);

  return { closeOverlays, topOverlay, dialog, about };
};
