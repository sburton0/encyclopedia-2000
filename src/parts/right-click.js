// Right-click menu: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['right-click'] = (A) => {
  'use strict';
  const { $, h } = A;
  const { originalOf, route, setStatus, setIdle, isOffline, go, openArticle, linkFrom, toTop, paneCtx, printable, runCmd, closeMenus, menuItems, subKeys, menuKeys } = A.fn;

  // What's offered depends on what was clicked: selected text, a link, a picture, a text box, or the page itself.
  // It's drawn like the menu bar's menus, at the same fixed size as other apps' right-click menus.
  function closeCtx() {
    if (!A.ctxMenu) return;
    const had = A.ctxMenu.contains(document.activeElement);
    A.ctxMenu.remove(); A.ctxMenu = null;
    if (had && A.ctxReturn?.isConnected) A.ctxReturn.focus({ preventScroll: true });
  }
  async function savePicture(img) {
    const shown = img.currentSrc || img.src;
    setStatus('Saving the picture…', true);
    // The main process downloads it (the page's security policy only lets it read pictures, not download them): the
    // full picture where there is one (articles show smaller copies), else the one on screen.
    const urls = [...new Set([isOffline() ? '' : originalOf(shown), shown].filter(Boolean))];
    const r = await window.e2k.savePicture(urls).catch(() => 'failed');
    setIdle(r === 'saved' ? 'Picture saved' : r === 'canceled' ? A.statusIdle : 'Couldn’t save the picture');
  }
  function viewPicture(img) {
    // Pictures that open when clicked open the same way; any other picture opens on its own.
    if (img.closest('a[data-file]') || img.onclick) img.click();
    else A.lightbox(img.currentSrc || img.src, img.alt || '');
  }
  function selectAll() {
    if (document.activeElement?.matches?.('input, textarea')) document.activeElement.blur();
    const t = A.articleText();
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
      groups.push([['Back', 'back', 'Alt+Left', null, A.nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, A.nav.idx >= A.nav.stack.length - 1],
        ...(A.current?.content ? [['Back to the Top', () => toTop(A.current.content), 'Home']] : [])]);
      groups.push([['Select All', selectAll, 'Ctrl+A'], ...(A.findable() ? [['Find in Article…', 'find', 'Ctrl+F']] : [])]);
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
    const page = A.current?.content || $('#view');
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
    A.ctxMenu = box;
    A.ctxReturn = document.activeElement;
    // Opened from the keyboard (the menu key or Shift+F10), the first item takes focus. Opened by the mouse, focus stays
    // where it was (a text box keeps its selection for Cut and Copy), and the arrow keys still reach the menu.
    if (e.button !== 2) $('.mi', box)?.focus({ preventScroll: true });
    // At the pointer, kept inside the window: it opens leftward or upward when there's no room.
    const w = box.offsetWidth, ht = box.offsetHeight;
    box.style.left = Math.max(2, e.clientX + w > innerWidth - 2 ? e.clientX - w : e.clientX) + 'px';
    box.style.top = Math.max(2, e.clientY + ht > innerHeight - 2 ? e.clientY - ht : e.clientY) + 'px';
  });
  document.addEventListener('keydown', (e) => {
    if (!A.ctxMenu) return;
    if (subKeys(e)) return;
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeCtx(); } else menuKeys(A.ctxMenu, e);
  }, true);
  document.addEventListener('mousedown', closeCtx);
  addEventListener('blur', closeCtx);
  addEventListener('resize', closeCtx);
  document.addEventListener('wheel', closeCtx, { passive: true });

  return { closeCtx };
};
