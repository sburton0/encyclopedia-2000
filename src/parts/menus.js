// Menus: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['menus'] = (A) => {
  'use strict';
  const { $, $$, h } = A;
  const { keyText, isOffline, openArticle, printable, runCmd, closeNet } = A.fn;

  // The favorites in the Favorites menu, each folder's name above its own (indented), up to 40 lines.
  // The favorites in the Favorites menu: each folder a submenu, up to 40 in a menu.
  function favMenu(list) {
    const out = list.slice(0, 40).map((n) => (n.items
      ? [n.folder, { sub: n.items.length ? favMenu(n.items) : [['(Empty)', null, '', null, true]] }]
      : [n.title, () => openArticle(n.title)]));
    if (list.length > 40) out.push('-', [`All ${list.length}…`, 'myfavs']);
    return out;
  }
  function menus() {
    const f = A.favs();
    return [
      ['File', [['Home', 'home', 'Ctrl+H'], ['Random Article', 'random'], '-', ['Print Preview…', 'print', 'Ctrl+P', null, !printable()], ['Print…', 'printNow', 'Ctrl+Shift+P', null, !printable()], '-', ['Exit', 'exit', 'Alt+F4']]],
      ['Edit', [['Copy', 'copy', 'Ctrl+C'], '-', ['Find in Article…', 'find', 'Ctrl+F', null, !A.findable()], ['Find an Article', 'search', 'Ctrl+E']]],
      ['View', [['Larger Text', 'bigger', 'Ctrl+='], ['Smaller Text', 'smaller', 'Ctrl+-'], ['Normal Text Size', 'normal', 'Ctrl+0'], '-',
        ['Refresh', 'reload', 'F5'], ['Full Screen', 'fullscreen', 'F11', document.documentElement.classList.contains('fullscreen')], '-',
        ['Mute', 'mute', 'Ctrl+M', E2KAudio.isMuted()]]],
      ['Go', [['Back', 'back', 'Alt+Left', null, A.nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, A.nav.idx >= A.nav.stack.length - 1], ['Home', 'home'], '-',
        ['Today’s Featured Article', 'featured'], ['On This Day', 'onthisday'], ['Picture of the Day', 'gallery'], ['Random Article', 'random'], '-', ['History', 'myhist', 'Ctrl+Y']]],
      ['Favorites', [['My Articles', 'favpane', 'Ctrl+I', !A.fpane.hidden], [A.isFav() ? 'Remove from Favorites' : 'Add to Favorites', 'fav', 'Ctrl+D', null, !A.current], '-',
        ['Manage', { sub: [['Favorites…', 'myfavs', 'Ctrl+B'], ['Downloaded Articles…', 'mydl'], ['History…', 'myhist', 'Ctrl+Y']] }], '-',
        ...(f.length ? favMenu(f) : [['(No favorites yet)', null, '', null, true]])]],
      // Numbered in the order of Home's Explore shelf.
      ['Features', [['Browse', 'explore', 'Ctrl+1'], ['Media', 'gallery', 'Ctrl+2'], ['Timeline', 'onthisday', 'Ctrl+3'], ['World Explorer', 'world', 'Ctrl+4'], ['Activities', 'activities', 'Ctrl+5']]],
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
  // An item is [label, command, shortcut, checked, disabled]; a command of { sub: [items] } opens a submenu to the
  // side (on hover, a click, Enter, or the right arrow; the left arrow or Escape closes it again).
  function menuItems(box, items, run) {
    items.forEach((it) => {
      if (it === '-') return box.append(h('div', { class: 'msep', role: 'separator' }));
      const [label, cmd, key, checked, disabled] = it;
      const sub = cmd && typeof cmd === 'object' ? cmd.sub : null;   // (a string's .sub is an old HTML method)
      const off = disabled || !cmd || (sub && !sub.length);
      let hover = 0;
      const mi = h('div', {
        class: 'mi' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + (sub ? ' sub' : ''),
        role: checked == null ? 'menuitem' : 'menuitemcheckbox', tabindex: -1,
        ...(checked == null ? {} : { 'aria-checked': String(!!checked) }), ...(off ? { 'aria-disabled': 'true' } : {}),
        ...(sub ? { 'aria-haspopup': 'menu', 'aria-expanded': 'false' } : {}),
        // preventDefault keeps the selection, for Copy.
        onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); },
        onmousemove: (e) => {
          if (e.target.closest('.mi') !== mi) return;
          if (box.contains(document.activeElement) && document.activeElement !== mi) mi.focus();
          // Another item closes the submenu that's open; a submenu's own item opens it after a moment.
          for (const o of box.children) if (o !== mi && o.classList.contains('sub')) closeSub(o);
          if (sub && !off && !mi.querySelector('.subm')) { clearTimeout(hover); hover = setTimeout(() => { if (mi.matches(':hover')) openSub(mi, sub, run, false); }, 180); }
        },
        onclick: (e) => {
          e.stopPropagation();
          if (e.target.closest('.mi') !== mi || off) return;
          if (sub) { if (!mi.querySelector('.subm')) openSub(mi, sub, run, e.detail === 0); return; }
          run(cmd);
        },
      }, h('span', {}, label), sub ? h('span', { class: 'arr', 'aria-hidden': 'true' }, '▶') : h('span', { class: 'k' }, keyText(key) || ''));
      if (key) mi.setAttribute('aria-keyshortcuts', key.split(' or ')[0].replace('Ctrl', A.MAC ? 'Meta' : 'Control'));
      box.append(mi);
    });
  }
  function openSub(mi, sub, run, focusFirst) {
    for (const o of mi.parentElement.children) if (o !== mi && o.classList.contains('sub')) closeSub(o);
    if (mi.querySelector('.subm')) return;
    const child = h('div', { class: 'menu subm', role: 'menu', 'aria-label': mi.firstChild.textContent });
    menuItems(child, sub, run);
    mi.append(child);
    mi.setAttribute('aria-expanded', 'true');
    // To the right, or to the left when there's no room; kept inside the window from below.
    const r = mi.getBoundingClientRect();
    if (r.right + child.offsetWidth > innerWidth - 2) child.classList.add('left');
    const over = r.top - 4 + child.offsetHeight - (innerHeight - 2);
    if (over > 0) child.style.top = `${-4 - over}px`;
    if (focusFirst) $('.mi', child)?.focus();
  }
  function closeSub(mi) {
    const c = [...mi.children].find((x) => x.classList.contains('subm'));
    if (!c) return;
    const had = c.contains(document.activeElement);
    c.remove();
    mi.setAttribute('aria-expanded', 'false');
    if (had) mi.focus();
  }
  // The right arrow opens a submenu; the left arrow or Escape inside one closes it. True when the key was used.
  function subKeys(e) {
    const mi = document.activeElement?.closest?.('.mi');
    if (!mi) return false;
    if ((e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && mi.classList.contains('sub'))) && mi.classList.contains('sub') && mi.getAttribute('aria-disabled') !== 'true') {
      if (mi.querySelector('.subm')) $('.subm .mi', mi)?.focus(); else mi.click();
      if (!mi.querySelector('.subm')) return false;
      $('.subm .mi', mi)?.focus();
    } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && mi.parentElement.classList.contains('subm')) {
      closeSub(mi.parentElement.parentElement);
    } else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  // Up, Down, Home, End, Enter, and Space inside a menu. True when the key was used.
  function menuKeys(box, e) {
    if (subKeys(e)) return true;
    const inner = document.activeElement?.closest?.('.menu');
    if (inner && box.contains(inner)) box = inner;
    const list = [...box.children].filter((c) => c.classList.contains('mi'));
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
    if (A.MAC) return;
    A.closeCtx();
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
    if (inMenu && subKeys(e)) return;
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
    if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && !A.MAC) {
      e.preventDefault();
      if (menubar.contains(document.activeElement)) leaveMenubar(); else enterMenubar();
    }
  }, true);
  addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || !altAlone || A.MAC) return;
    altAlone = false;
    e.preventDefault();
    if (menubar.contains(document.activeElement)) leaveMenubar(); else if (!A.topOverlay()) enterMenubar();
  }, true);
  addEventListener('mousedown', () => { altAlone = false; }, true);
  addEventListener('blur', () => { altAlone = false; });
  document.addEventListener('mousedown', () => closeMenus());

  return { menus, closeMenus, menuItems, subKeys, menuKeys };
};
