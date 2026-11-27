// My Articles pane: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['my-articles-pane'] = (A) => {
  'use strict';
  const { $, $$, h, svg, icon, store } = A;
  const { winIcon, keyText, route, setStatus, setIdle, isOffline, go, openArticle, mb, dlWith, downloadTitle, dlCats, catDownloaded, deleteCategory, refreshMyPage, updateToolbar, runCmd, menuItems } = A.fn;

  // Opens over any screen from the toolbar's My Articles button, the Favorites menu, or Ctrl+I: Favorites (in folders),
  // Downloaded, and Recently viewed, each searchable. A click outside closes it, unless it's pinned: then it sits beside
  // the page and stays open. Its edge can be dragged to make it wider (remembered).
  const fpane = $('#fpane');
  const stage = $('.stage');
  const FAVS_SHOWN = 8;
  let dlShowAll = false, paneQuery = '', paneReturn = null, dragKey = null, dragKeys = null;
  const paneWidth = () => Math.min(480, Math.max(220, store.get('paneWidth', 250)));
  const pinned = () => !!store.get('panePinned', false);
  stage.style.setProperty('--fpw', paneWidth() + 'px');
  // A downloaded copy, or the download in progress, of an article.
  const dlEntry = (t) => A.dlIndex.get(t.toLowerCase());
  const dlJob = (t) => A.downloadJobs.find((j) => A.sameTitle(j.title, t));
  async function loadDownloaded() {
    A.dlList = await A.saved.list().catch(() => []);
    A.dlIndex = new Map(A.dlList.map((e) => [e.title.toLowerCase(), e]));
    A.dlLoaded = true;
    drawFavPane();
    refreshMyPage();
  }
  const MARK_GET = '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6v5.4M5.5 7.7 8 10.2l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
  const MARK_DONE = '<circle cx="8" cy="8" r="7" fill="#3fb36a"/><path d="M4.4 8.3l2.4 2.4 4.8-5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  const markSvg = (inner) => { const s = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.innerHTML = inner; return s; };
  // An article's download state at the right of its row: the green check (downloaded), a ring (downloading), or a
  // button that downloads it.
  function markFor(t) {
    const job = dlJob(t);
    if (job) {
      const pct = Math.round((job.done / Math.max(job.total, 1)) * 100);
      return h('span', { class: 'mark ring', role: 'img', 'aria-label': `Downloading, ${pct}%`, title: `Downloading… ${pct}%`, 'data-mark': t },
        markSvg(`<circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/><circle cx="8" cy="8" r="6" fill="none" stroke="#7fd18b" stroke-width="2" stroke-dasharray="${(pct / 100 * 37.7).toFixed(1)} 40" transform="rotate(-90 8 8)"/>`));
    }
    const e = dlEntry(t);
    if (e) return h('span', { class: 'mark done', role: 'img', 'aria-label': 'Downloaded', title: `Downloaded · ${mb(e.size)}. It opens without the internet.`, 'data-mark': t }, markSvg(MARK_DONE));
    return h('button', { class: 'mark get', title: `Download “${t}”`, 'aria-label': `Download ${t}`, 'data-mark': t, onclick: () => downloadTitle(t) }, markSvg(MARK_GET));
  }
  // Progress redraws only the marks, so nothing else in the pane moves (or loses the keyboard focus).
  function refreshMarks() {
    for (const m of $$('[data-mark]')) {
      const t = m.dataset.mark, next = markFor(t);
      if (next.className !== m.className || next.title !== m.title) {
        const had = m === document.activeElement;
        m.replaceWith(next);
        if (had) (next.matches('button') ? next : next.closest('.frow')?.querySelector('.lnk'))?.focus();
      }
    }
  }
  // The words searched for, marked in a title.
  function marked(t) {
    const q = paneQuery.toLowerCase(), k = q ? t.toLowerCase().indexOf(q) : -1;
    return k < 0 ? [t] : [t.slice(0, k), h('mark', {}, t.slice(k, k + q.length)), t.slice(k + q.length)];
  }
  // A row for an article: its title (opens it), then its download state, then (Recently viewed) ✕ to remove it.
  function artRow(key, t, { star = false, level = 0, mark = true, remove = null } = {}) {
    const row = h('div', { class: 'frow' + (A.current && A.sameTitle(t, A.current.title) ? ' here' : ''), 'data-key': key, style: `--lv:${level}`, draggable: 'true' },
      h('button', { class: 'lnk' + (star ? '' : ' plain'), title: t, onclick: () => openArticle(t) }, star ? icon('star') : null, h('span', { class: 't' }, marked(t))),
      mark ? markFor(t) : null,
      remove ? h('button', { class: 'rx', title: `Remove “${t}” from Recently viewed`, 'aria-label': `Remove ${t} from Recently viewed`, onclick: remove }, '✕') : null);
    dragFrom(row, key);
    return row;
  }
  // group(), on the My Articles page, gives the keys of the ticked rows: dragging one of them takes them all.
  function dragFrom(row, key, group) {
    row.addEventListener('dragstart', (e) => {
      const g = group?.() || [];
      dragKey = key;
      dragKeys = g.length > 1 && g.includes(key) ? g : [key];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragKeys.map((k) => k.slice(2)).join('\n'));
      if (dragKeys.length > 1) {
        // The picture under the pointer says how many are going.
        const tag = h('div', { class: 'dragn' }, `${dragKeys.length} articles`);
        document.body.append(tag);
        e.dataTransfer.setDragImage(tag, 12, 12);
        setTimeout(() => tag.remove(), 0);
      }
    });
    row.addEventListener('dragend', () => { dragKey = null; dragKeys = null; $$('.drop').forEach((x) => x.classList.remove('drop')); });
  }
  // Dropping on a folder (or the Favorites heading, for the top level) moves a favorite or folder there; an article
  // from Downloaded or Recently viewed becomes a favorite in it.
  function dropOn(el, folderId) {
    const fits = (k) => /^[dr]:/.test(k) || (k !== 'f:' + folderId && A.canMove(k, folderId));
    const ok = () => dragKey && (dragKeys || [dragKey]).some(fits);
    el.addEventListener('dragover', (e) => { if (!ok()) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop'); });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop');
      const key = dragKey, keys = (dragKeys || [key]).filter(fits);
      if (!key || !ok()) return;
      const to = A.folderAt(A.favs(), folderId)?.node.folder;
      if (keys.length > 1) {
        let n = 0;
        for (const k of keys) {
          if (/^[dr]:/.test(k)) { if (!A.isFavTitle(k.slice(2))) { A.addFav(k.slice(2), dlEntry(k.slice(2))?.desc || A.infoOf(k.slice(2))?.desc || '', folderId); n++; } else if (A.moveFav('a:' + k.slice(2), folderId)) n++; }
          else if (A.moveFav(k, folderId)) n++;
        }
        A.myPage?.st.sel.clear();
        refreshMyPage();
        setIdle(`${/^[dr]:/.test(key) ? 'Added' : 'Moved'} ${n === 1 ? '1 article' : `${n} articles`} to ${to ? `the folder “${to}”` : 'Favorites'}`);
      } else if (/^[dr]:/.test(key)) { A.addFav(key.slice(2), dlEntry(key.slice(2))?.desc || '', folderId); setIdle(`Added “${key.slice(2)}” to ${to ? `the folder “${to}”` : 'Favorites'}`); }
      else if (A.moveFav(key, folderId)) setIdle(`Moved to ${to ? `the folder “${to}”` : 'Favorites (no folder)'}`);
    });
  }
  function folderRow(n, level) {
    const key = 'f:' + n.id;
    const count = A.favCount(n);
    const name = A.renaming === n.id
      ? h('input', { class: 'ren', value: n.folder, 'aria-label': 'Folder name', maxlength: '80',
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = n.folder; e.target.blur(); } },
        onblur: (e) => { A.renaming = null; A.renameFolder(n.id, e.target.value); drawFavPane(); focusRow(key); },
        onclick: (e) => e.stopPropagation(), onmousedown: (e) => e.stopPropagation() })
      : h('span', { class: 't' }, marked(n.folder));
    const row = h('button', { class: 'fold', 'data-key': key, style: `--lv:${level}`, draggable: A.renaming === n.id ? 'false' : 'true', 'aria-expanded': String(!!n.open),
      title: `${n.folder}: ${count === 1 ? '1 favorite' : `${count} favorites`}`,
      onclick: () => { if (A.renaming === n.id) return; A.setFolderOpen(n.id, !n.open); drawFavPane(); } },
    h('span', { class: 'tw', 'aria-hidden': 'true' }, n.open ? '▼' : '▶'), icon('folder'), name, h('span', { class: 'c' }, String(count)));
    dragFrom(row, key);
    dropOn(row, n.id);
    return row;
  }
  // A downloaded category in the pane: a stack of pages, with how many of its articles are downloaded.
  function catRow(c, n) {
    const busy = dlQueue.filter((x) => x.label === c.name).length;
    return h('button', { class: 'fold grp', 'data-key': 'c:' + c.name, 'aria-expanded': String(!!c.open),
      title: `${c.name}: a Wikipedia category, ${n === 1 ? '1 article' : `${n} articles`} downloaded${busy ? `, ${busy} to go` : ''}`,
      onclick: () => { store.set('dlCategories', dlCats().map((x) => (x.name === c.name ? { ...x, open: !x.open } : x))); drawFavPane(); } },
    h('span', { class: 'tw', 'aria-hidden': 'true' }, c.open ? '▼' : '▶'), icon('stack'), h('span', { class: 't' }, marked(c.name)), h('span', { class: 'c' }, busy ? `${n}/${n + busy}` : String(n)));
  }
  function favRows(list, level = 0) {
    return list.flatMap((n) => (n.items ? [folderRow(n, level), ...(n.open ? favRows(n.items, level + 1) : [])] : [artRow('a:' + n.title, n.title, { star: true, level })]));
  }
  const paneHead = (title, extra) => h('h4', { class: 'wb' }, h('span', {}, title), extra ? h('span', { class: 'hbtns' }, extra) : null);
  const found = (n) => h('span', { class: 'hc' }, n ? `${n} found` : 'None found');
  function drawFavPane() {
    if (fpane.hidden) return;
    if (!fpane.firstChild) buildPane();
    if (A.renaming && $('input.ren', fpane)) return;
    const focusedKey = fpane.contains(document.activeElement) && document.activeElement.closest('[data-key]')?.dataset.key;
    const root = A.favs();
    const recent = A.recentTitles();
    const q = paneQuery.toLowerCase();
    const body = [];
    if (q) {
      // Searching: the favorites that match, each under the folder it's in; then the downloaded and recently viewed ones.
      const hits = [];
      A.walkFavs(root, (n, path) => { if (n.title && n.title.toLowerCase().includes(q)) hits.push({ n, where: path.map((p) => p.folder).join(' › ') }); });
      body.push(paneHead('Favorites', found(hits.length)));
      let last = null;
      for (const { n, where } of hits) {
        if (where && where !== last) body.push(h('span', { class: 'path' }, where));
        last = where;
        body.push(artRow('a:' + n.title, n.title, { star: true }));
      }
      const dl = A.dlList.filter((e) => e.title.toLowerCase().includes(q));
      body.push(h('hr'), paneHead('Downloaded', found(dl.length)), ...dl.map((e) => artRow('d:' + e.title, e.title, { mark: false })));
      const rv = recent.filter((t) => t.toLowerCase().includes(q));
      body.push(h('hr'), paneHead('Recently viewed', found(rv.length)), ...rv.map((t) => artRow('r:' + t, t, { remove: () => removeRecent(t) })));
    } else {
      if (A.current) {
        const fav = A.isFav();
        body.push(h('div', { class: 'addrow' },
          h('button', { class: 'add', title: fav ? 'Remove from Favorites (Ctrl+D)' : 'Add to Favorites (Ctrl+D)', onclick: () => A.toggleFav() },
            icon('star'), h('span', {}, fav ? `Remove “${A.current.title}” from Favorites` : `Add “${A.current.title}” to Favorites`)),
          h('button', { class: 'addto', title: fav ? 'Move it to a folder' : 'Add it to a folder', 'aria-label': fav ? 'Move it to a folder' : 'Add it to a folder', 'aria-haspopup': 'menu',
            onclick: (e) => { const t = A.current.title, d = A.current.desc; folderPicker(e.currentTarget.parentElement, t, (id) => { const f = A.addFav(t, d, id); setIdle(`${fav ? 'Moved' : 'Added'} “${t}” to ${f ? `the folder “${f}”` : 'Favorites'}`); }); } }, '▾')));
      }
      const titles = A.favTitles(root);
      const missing = titles.filter((t) => !dlEntry(t) && !dlJob(t));
      const head = paneHead('Favorites', [h('button', { class: 'newf', title: 'Make a folder for favorites', onclick: () => { A.renaming = A.newFolder(); drawFavPane(); } }, 'New folder'),
        A.dlLoaded && missing.length ? h('button', { class: 'newf', title: 'Download the favorites that aren’t downloaded yet', onclick: () => downloadAllDialog(titles, null) }, 'Download all') : null]);
      dropOn(head, null);
      body.push(head);
      if (root.length) body.push(...favRows(root));
      else body.push(h('div', { class: 'note' }, 'Open an article and click “Add to Favorites” to keep it here.'));
      if (A.dlList.length) {
        const total = A.dlList.reduce((n, e) => n + (e.size || 0), 0);
        // Downloaded categories first, as groups (closed until opened), then the articles downloaded on their own.
        const groups = dlCats().map((c) => ({ c, got: catDownloaded(c) })).filter((g) => g.got.length || dlQueue.some((x) => x.label === g.c.name));
        const inGroup = new Set(groups.flatMap((g) => g.got.map((t) => t.toLowerCase())));
        const loose = A.dlList.filter((e) => !inGroup.has(e.title.toLowerCase()));
        const shown = dlShowAll ? loose : loose.slice(0, FAVS_SHOWN);
        body.push(h('hr'), paneHead('Downloaded', h('span', { class: 'hc' }, mb(total))),
          ...groups.flatMap((g) => [catRow(g.c, g.got.length), ...(g.c.open ? g.got.map((t) => artRow('d:' + t, t, { mark: false, level: 1 })) : [])]),
          ...shown.map((e) => artRow('d:' + e.title, e.title, { mark: false })),
          loose.length > FAVS_SHOWN ? h('button', { class: 'more', onclick: () => { dlShowAll = !dlShowAll; drawFavPane(); } }, dlShowAll ? 'Show fewer' : `Show all (${loose.length})`) : null,
          h('div', { class: 'savednote' }, markSvg(MARK_DONE), 'Downloaded articles open without the internet.'));
      }
      if (recent.length) {
        body.push(h('hr'), paneHead('Recently viewed', h('button', { class: 'newf', title: 'Clear the list of recently viewed articles', onclick: clearRecent }, 'Clear all')),
          ...recent.map((t) => artRow('r:' + t, t, { remove: () => removeRecent(t) })));
      }
    }
    $('.fb', fpane).replaceChildren(...body.filter(Boolean));
    if (A.renaming) { const r = $('input.ren', fpane); if (r) { r.focus(); r.select(); r.scrollIntoView({ block: 'nearest' }); } }
    else if (focusedKey) focusRow(focusedKey);
  }
  function focusRow(key) {
    const row = $$('[data-key]', fpane).find((r) => r.dataset.key === key);
    (row?.matches('button') ? row : row?.querySelector('.lnk'))?.focus({ preventScroll: true });
  }
  // The pane's fixed parts: the title bar (pin, close), the search box, the list, the footer, and the edge to drag.
  function buildPane() {
    const find = h('input', { type: 'search', placeholder: 'Search favorites and downloads', 'aria-label': 'Search favorites and downloads', spellcheck: 'false',
      oninput: (e) => { paneQuery = e.target.value.trim(); drawFavPane(); },
      onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; paneQuery = ''; drawFavPane(); } } });
    const pin = h('button', { class: 'pin', onclick: () => setPinned(!pinned()) }, icon('pin'));
    const grip = h('div', { class: 'fgrip', title: 'Drag to make the pane wider or narrower', 'aria-hidden': 'true' });
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const x0 = e.clientX, w0 = paneWidth();
      document.body.classList.add('resizing');
      const move = (ev) => { const w = Math.min(480, Math.max(220, w0 + ev.clientX - x0)); stage.style.setProperty('--fpw', w + 'px'); store.set('paneWidth', w); };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.classList.remove('resizing'); if (pinned()) dispatchEvent(new Event('resize')); };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
    fpane.append(
      h('div', { class: 'fh' }, icon('books'), h('span', {}, 'My Articles'), pin,
        h('button', { class: 'exp', title: 'Open as a page (Ctrl+B)', 'aria-label': 'Open My Articles as a page', onclick: () => { if (!pinned()) toggleFavPane(false); go('myarticles/favorites'); } }, icon('expand')),
        h('button', { title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => toggleFavPane(false) }, winIcon('close'))),
      h('div', { class: 'pfind' }, icon('search'), find),
      h('div', { class: 'fb' }),
      h('div', { class: 'ff' }, h('span', {}, `${keyText('Ctrl+I')} opens and closes this pane`),
        h('button', { class: 'more open', onclick: () => { if (!pinned()) toggleFavPane(false); go('myarticles/favorites'); } }, 'Open as a page ›')),
      grip);
    drawPin();
  }
  function drawPin() {
    const b = $('.fh .pin', fpane);
    if (b) { b.title = pinned() ? 'Unpin: close the pane when clicking outside it' : 'Pin: keep the pane open beside the page'; b.setAttribute('aria-pressed', String(pinned())); b.classList.toggle('on', pinned()); }
    stage.classList.toggle('pinned', pinned() && !fpane.hidden);
  }
  function setPinned(on) {
    store.set('panePinned', on);
    drawPin();
    dispatchEvent(new Event('resize'));
  }
  function toggleFavPane(open = fpane.hidden) {
    if (open && fpane.hidden) paneReturn = document.activeElement;
    fpane.hidden = !open;
    if (!open) { dlShowAll = false; A.renaming = null; }
    else if (!A.dlLoaded) loadDownloaded();
    const wasPinned = stage.classList.contains('pinned');
    drawPin();
    if (wasPinned !== stage.classList.contains('pinned')) dispatchEvent(new Event('resize'));
    updateToolbar();
    // Opened, the keyboard is in its search box; closed, it goes back where it was.
    if (open) $('.pfind input', fpane)?.focus({ preventScroll: true });
    if (!open && fpane.contains(document.activeElement)) (paneReturn?.isConnected && paneReturn !== document.body ? paneReturn : $('.tbtn[data-cmd="favpane"]')).focus({ preventScroll: true });
  }
  // A click anywhere else closes the pane (unless pinned): not on its own button, a menu, a dialog, or a scroll bar.
  document.addEventListener('mousedown', (e) => {
    if (fpane.hidden || pinned() || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element) || fpane.contains(t) || t.closest('.tbtn[data-cmd="favpane"], .menu, .overlay, #menubar, .rmenu')) return;
    if (t.clientWidth && e.offsetX > t.clientWidth) return;
    toggleFavPane(false);
  }, true);
  // Recently viewed is the newest of History: removing one removes it from History; Clear all clears History.
  const removeRecent = (t) => A.removeHistory(t);
  const clearRecent = () => A.clearHistoryDialog();
  // A menu of folders under a button or row: where to add (or move) a favorite. The folder it's in now is checked.
  function folderPicker(anchor, title, onPick) {
    A.closeCtx();
    const root = A.favs();
    const at = title && A.favAt(root, title);
    const inId = at ? (at.path.length ? at.path[at.path.length - 1].id : '') : undefined;
    const items = [['Favorites (no folder)', () => onPick(null), '', inId === undefined ? null : inId === '']];
    const sub = [];
    A.walkFavs(root, (n, path) => { if (n.items) sub.push([' '.repeat(path.length) + n.folder, () => onPick(n.id), '', inId === undefined ? null : inId === n.id]); });
    if (sub.length) items.push('-', ...sub);
    items.push('-', ['New folder…', () => { const id = A.newFolder(null); onPick(id); A.renaming = id; drawFavPane(); }]);
    const box = h('div', { class: 'menu ctx', role: 'menu', 'aria-label': 'Folders', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() });
    menuItems(box, items, (cmd) => { A.closeCtx(); runCmd(cmd); });
    document.body.append(box);
    A.ctxMenu = box;
    A.ctxReturn = document.activeElement;
    const r = anchor.getBoundingClientRect();
    box.style.minWidth = Math.round(r.width) + 'px';
    box.style.left = Math.max(2, Math.min(r.left, innerWidth - box.offsetWidth - 2)) + 'px';
    box.style.top = (r.bottom + box.offsetHeight + 2 > innerHeight ? Math.max(2, r.top - box.offsetHeight - 2) : r.bottom + 2) + 'px';
    $('.mi', box)?.focus({ preventScroll: true });
  }
  // The right-click menu of a row in the pane.
  function paneCtx(row, e) {
    const key = row.dataset.key, kind = key[0], v = key.slice(2);
    if (kind === 'c') {
      const c = dlCats().find((x) => x.name === v);
      if (!c) return [];
      return [[c.open ? 'Close' : 'Open', () => { store.set('dlCategories', dlCats().map((x) => (x.name === v ? { ...x, open: !x.open } : x))); drawFavPane(); }],
        ['Show on the Downloaded page', () => go(route('myarticles', 'downloaded/cat:' + v))], '-',
        ['Download Again', () => queueDownloads(c.titles, { label: v })],
        ['Delete Downloads…', () => deleteCategory(v), '', null, !catDownloaded(c).length]];
    }
    if (kind === 'f') {
      const root = A.favs(), f = A.folderAt(root, v);
      if (!f) return [];
      const titles = A.favTitles(f.node.items);
      return [[f.node.open ? 'Close' : 'Open', () => { A.setFolderOpen(v, !f.node.open); drawFavPane(); }], '-',
        ['Rename', () => { A.renaming = v; drawFavPane(); }],
        ['New Folder Inside', () => { A.renaming = A.newFolder(v); drawFavPane(); }, '', null, f.path.length + 2 > A.FOLDER_DEPTH],
        ['Move To…', () => folderPickerFor(row, key)],
        ...(row.closest('.myart') ? [] : [['Show in My Articles', () => showInMyArticles(key)]]), '-',
        ['Download Folder…', () => downloadAllDialog(titles, f.node.folder), '', null, !titles.length || titles.every((t) => dlEntry(t))], '-',
        ['Delete Folder', () => A.deleteFolder(v)]];
    }
    const e2 = dlEntry(v), fav = A.isFavTitle(v);
    return [['Open', () => openArticle(v)], '-',
      e2 ? ['Delete Download', () => deleteDownload(v)] : ['Download', () => downloadTitle(v), '', null, !!dlJob(v)],
      '-',
      fav ? ['Move To…', () => folderPickerFor(row, 'a:' + v)] : ['Add to Favorites', () => { A.addFav(v, e2?.desc || ''); setIdle(`Added “${v}” to Favorites`); }],
      ...(fav ? [['Remove from Favorites', () => { A.removeFav(v); setIdle(`Removed “${v}” from Favorites`); }]] : []),
      ...(kind === 'r' ? [[row.closest('.myart') ? 'Remove from History' : 'Remove from Recently Viewed', () => removeRecent(v)]] : []),
      ...(row.closest('.myart') ? [] : ['-', ['Show in My Articles', () => showInMyArticles(key)]])];
  }
  // Opens the My Articles page where a row of the pane lives (a favorite in its folder, a folder in the one around it,
  // a download in Downloaded, a recent article in History), with it in view, focused, and lit for a moment.
  function showInMyArticles(key) {
    const kind = key[0], v = key.slice(2);
    let r = 'myarticles/favorites/all';
    if (kind === 'a') { const at = A.favAt(A.favs(), v); r = 'myarticles/favorites/' + (at?.path.length ? at.path[at.path.length - 1].id : 'loose'); }
    else if (kind === 'f') r = 'myarticles/favorites/' + v;   // the folder itself (it's lit in the rail)
    else if (kind === 'd') r = 'myarticles/downloaded';
    else if (kind === 'r') r = 'myarticles/history';
    A.showKey = kind === 'f' ? null : key;
    if (!pinned()) toggleFavPane(false);
    go(r);
  }
  function folderPickerFor(row, key) {
    if (key.startsWith('a:')) return folderPicker(row, key.slice(2), (id) => { if (A.moveFav(key, id)) setIdle(`Moved “${key.slice(2)}”`); });
    // A folder: the folders it can go into.
    A.closeCtx();
    const root = A.favs();
    const items = [['Favorites (no folder)', () => A.moveFav(key, null), '', null, !A.canMove(key, null)]];
    A.walkFavs(root, (n, path) => { if (n.items) items.push([' '.repeat(path.length) + n.folder, () => A.moveFav(key, n.id), '', null, !A.canMove(key, n.id) || 'f:' + n.id === key]); });
    const box = h('div', { class: 'menu ctx', role: 'menu', 'aria-label': 'Move to', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() });
    menuItems(box, items, (cmd) => { A.closeCtx(); runCmd(cmd); });
    document.body.append(box);
    A.ctxMenu = box;
    A.ctxReturn = document.activeElement;
    const r = row.getBoundingClientRect();
    box.style.left = r.left + 'px';
    box.style.top = Math.min(r.bottom + 2, innerHeight - box.offsetHeight - 2) + 'px';
    $('.mi:not(.disabled)', box)?.focus({ preventScroll: true });
  }
  async function deleteDownload(t) {
    await A.saved.remove(t);
    setIdle(`Deleted the download of “${t}”.`);
    if (A.current?.dl) A.current.dl.refresh();
  }
  // Download all (or a folder): how many aren't downloaded yet, about how big, and the free space. They download one
  // after another in the background, with the progress in the status bar.
  async function downloadAllDialog(titles, folder) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading articles needs the internet.'); return; }
    const todo = titles.filter((t) => !dlEntry(t) && !dlJob(t) && !dlQueue.some((x) => A.sameTitle(x.t, t)));
    if (!todo.length) { setIdle(folder ? `Everything in “${folder}” is downloaded.` : 'All your favorites are downloaded.'); return; }
    const sizes = A.dlList.map((e) => (e.size || 0) - (e.videoSize || 0)).filter((n) => n > 0 && !isNaN(n));
    const each = sizes.length >= 3 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 2.5e6;
    const need = todo.length * each;
    const free = (await A.saved.free().catch(() => null)) ?? Infinity;
    const fits = free === Infinity || need + 200e6 < free;
    const n = todo.length;
    A.dialog(folder ? 'Download Folder' : 'Download All Favorites', folder ? `Download the folder “${folder}”?` : 'Download your favorites?', [
      `${n === titles.length ? (n === 1 ? (folder ? 'The favorite in it isn’t' : 'It isn’t') : `${folder ? 'The' : 'Your'} ${n} favorites${folder ? ' in it' : ''} aren’t`)
        : `${n} of ${folder ? 'the' : 'your'} ${titles.length} favorites${folder ? ' in it' : ''} ${n === 1 ? 'isn’t' : 'aren’t'}`} downloaded yet. Downloading lets you read ${n === 1 ? 'it' : 'them'} without the internet.`,
      h('div', { class: 'space' }, h('span', {}, 'Download size'), h('b', {}, `About ${mb(need)}`), h('span', {}, 'Free space on this drive'), h('b', {}, free === Infinity ? 'Unknown' : mb(free))),
      fits ? 'With their pictures and sounds. Videos aren’t included (an article’s Download menu offers them).' : 'There isn’t enough free space on this drive for them.',
      fits ? 'It continues in the background; the status bar shows how far along it is.' : null,
    ].filter(Boolean), fits ? [[`Download ${n === 1 ? '1 Article' : `${n} Articles`}`, () => queueDownloads(todo), true], ['Cancel']] : [['OK', null, true]], { cls: 'dlall' });
  }
  // Articles to download one after another (Download all, a folder, a category): { t, opts, label }.
  let dlQueue = [], dlQueueBusy = false, dlQueueDone = 0, dlQueueTotal = 0, dlQueueFailed = 0;
  function queueDownloads(titles, { opts = {}, label = '' } = {}) {
    for (const t of titles) if (!dlQueue.some((x) => A.sameTitle(x.t, t))) { dlQueue.push({ t, opts, label }); dlQueueTotal++; }
    if (!dlQueueBusy) runQueue();
  }
  async function runQueue() {
    dlQueueBusy = true;
    let stop = '';
    while (dlQueue.length) {
      const { t, opts, label } = dlQueue[0];
      setStatus(`Downloading ${label ? `“${label}”` : 'articles'}: ${dlQueueDone + 1} of ${dlQueueTotal} (“${t}”)…`, true);
      const r = await dlWith(t, opts).catch(() => ({ ok: false }));
      dlQueue.shift();
      if (r.ok) dlQueueDone++;
      else if (r.space || r.offline) { stop = r.space ? 'there isn’t enough free space on this drive' : 'Offline mode is on'; break; }
      else dlQueueFailed++;
    }
    setIdle(stop ? `Downloaded ${dlQueueDone} of ${dlQueueTotal} articles, then stopped: ${stop}.`
      : `Downloaded ${dlQueueDone === 1 ? '1 article' : `${dlQueueDone} articles`}${dlQueueFailed ? `; ${dlQueueFailed} couldn’t be downloaded (check your connection and try again)` : ''}. They open without the internet.`);
    dlQueue = []; dlQueueBusy = false; dlQueueDone = 0; dlQueueTotal = 0; dlQueueFailed = 0;
    if (A.current?.dl) A.current.dl.refresh();
  }

  return { fpane, pinned, dlEntry, dlJob, loadDownloaded, markFor, refreshMarks, dragFrom, dropOn, drawFavPane, toggleFavPane, folderPicker, paneCtx, downloadAllDialog, queueDownloads };
};
