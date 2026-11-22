// My Articles page: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['my-articles-page'] = (A) => {
  'use strict';
  const { $, $$, h, icon, store } = A;
  const { bg, route, setIdle, go, openArticle, setCrumbs, mount, shell, bandBtn, railLink, mb, runCmd, menuItems } = A.fn;

  // One page for Favorites (the folders in its rail), Downloaded, and History: route "myarticles/<view>[/<folder>]".
  // Opened from the toolbar's My Articles arrow (Manage), the pane's ⤢, the Favorites menu, Ctrl+B and Ctrl+Y.
  // Rows: a check box (for the selection bar), the picture, title and description, the download state, and ✕.
  const MY_VIEWS = { favorites: 'Favorites', downloaded: 'Downloaded', history: 'History' };
  const HISTORY_PAGE = 150;
  // Pictures and descriptions an article row is missing, looked up a few at a time and kept (keepInfo).
  const infoWant = new Set();
  let infoBusy = 0;
  function wantInfo(t) {
    if (A.infoOf(t) || infoWant.has(t)) return;
    infoWant.add(t);
    pumpInfo();
  }
  function pumpInfo() {
    while (infoBusy < 4 && infoWant.size) {
      const t = infoWant.values().next().value;
      infoWant.delete(t);
      infoBusy++;
      Wiki.summary(t).then((s) => {
        A.keepInfo(t, s.description || '', s.thumbnail?.source || '');
        for (const r of $$('.myart .mrow[data-title]')) if (A.sameTitle(r.dataset.title, t)) fillInfo(r, t);
      }, () => A.keepInfo(t, '', '')).finally(() => { infoBusy--; pumpInfo(); });
    }
  }
  function fillInfo(row, t) {
    const i = A.infoOf(t) || A.dlEntry(t);
    if (!i) return;
    const th = $('.th', row), d = $('.md', row);
    if (th && i.thumb && !th.style.backgroundImage) { th.style.cssText = bg(i.thumb); th.classList.remove('ph'); th.replaceChildren(); }
    if (d && !d.textContent) d.textContent = i.desc || '';
  }
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  function dayLabel(ms) {
    if (!ms) return 'Earlier';
    const d = A.dayStart(ms), today = A.dayStart(Date.now());
    return d === today ? 'Today' : d === A.dayStart(today - 1) ? 'Yesterday' : fmtDay(ms);
  }

  function viewMyArticles(arg, token) {
    const cut = arg.indexOf('/');
    const view0 = cut < 0 ? arg : arg.slice(0, cut), sub = cut < 0 ? '' : arg.slice(cut + 1);   // a category's name can have a slash
    const view = MY_VIEWS[view0] ? view0 : 'favorites';
    const pg = shell({ title: MY_VIEWS[view], wide: true });
    pg.root.classList.add('myart');
    const st = { view, sub: view === 'favorites' ? sub || 'all' : sub, query: '', sel: new Set(), shown: HISTORY_PAGE, sort: store.get('dlSort', 'date') };
    const find = h('input', { type: 'search', class: 'msearch', spellcheck: 'false',
      placeholder: view === 'history' ? 'Search your history' : view === 'downloaded' ? 'Search your downloads' : 'Search your favorites',
      'aria-label': view === 'history' ? 'Search your history' : view === 'downloaded' ? 'Search your downloads' : 'Search your favorites',
      oninput: (e) => { st.query = e.target.value.trim().toLowerCase(); st.sel.clear(); draw(); },
      onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; st.query = ''; draw(); } } });
    const tools = view === 'favorites'
      ? [find, bandBtn('New Folder', () => { const id = A.newFolder(A.folderAt(A.favs(), st.sub) ? st.sub : null); if (id) { A.renaming = id; st.renaming = id; draw(); } }, 'folder'),
        bandBtn('Download All', () => A.downloadAllDialog(A.favTitles(st.sub && A.folderAt(A.favs(), st.sub) ? A.folderAt(A.favs(), st.sub).node.items : A.favs()), A.folderAt(A.favs(), st.sub)?.node.folder || null), 'download')]
      : view === 'history' ? [find, bandBtn('Clear History…', () => A.clearHistoryDialog())]
        : [find];
    pg.toolsEl.append(...tools);
    A.myPage = { root: pg.root, st, draw };
    if (!mount(pg.root, token)) return;
    if (!A.dlLoaded) A.loadDownloaded();
    draw();
    if (A.showKey) {
      const k = A.showKey;
      A.showKey = null;
      // Downloads may still be loading: wait for the row a moment.
      const find = (n) => {
        const el = $$('[data-key]', pg.root).find((x) => x.dataset.key === k && !x.closest('.rail'));
        if (!el) { if (n < 20 && pg.root.isConnected) setTimeout(() => find(n + 1), 100); return; }
        el.scrollIntoView({ block: 'center' });
        (el.matches('button') ? el : el.querySelector('.mlink'))?.focus({ preventScroll: true });
        el.classList.add('shown');
        setTimeout(() => el.classList.remove('shown'), 2000);
      };
      find(0);
    }
    setIdle(view === 'history' ? `History: ${A.history().length === 1 ? '1 article' : `${A.history().length} articles`}` : A.statusIdle);

    function go2(v, s = '') { go(route('myarticles', s ? `${v}/${s}` : v)); }
    function draw() {
      const y = pg.content.scrollTop;
      const focused = pg.root.contains(document.activeElement) && document.activeElement !== find && document.activeElement.closest('[data-key]')?.dataset.key;
      const root = A.favs(), hist = A.history();
      // The rail: the three views, then what belongs to the one on screen.
      const nav = Object.entries(MY_VIEWS).map(([v, label]) => {
        const n = v === 'favorites' ? A.favTitles(root).length : v === 'downloaded' ? A.dlList.length : hist.length;
        const b = railLink(label, () => go2(v));
        b.classList.toggle('on', v === view);
        if (v === view) b.setAttribute('aria-current', 'page');
        b.append(h('span', { class: 'n' }, String(n)));
        return b;
      });
      const rail = [h('h4', {}, 'My Articles'), ...nav, h('hr')];
      if (view === 'favorites') rail.push(...favRail(root));
      else if (view === 'history') rail.push(...historyRail(hist));
      else rail.push(...downloadedRail());
      pg.railIn.replaceChildren(...rail);
      // The band and the list; for someone new, what will gather here and how.
      if (!root.length && !hist.length && !A.dlList.length && A.dlLoaded && !st.query) drawWelcome();
      else if (view === 'favorites') drawFavorites(root);
      else if (view === 'history') drawHistory(hist);
      else drawDownloaded();
      pg.content.scrollTop = y;
      if (st.renaming) { const r = $('input.ren', pg.root); if (r) { r.focus(); r.select(); } }
      else if (focused) { const el = $$('[data-key]', pg.root).find((r) => r.dataset.key === focused); (el?.matches('button') ? el : el?.querySelector('.mlink, .lnk'))?.focus({ preventScroll: true }); }
    }

    function drawWelcome() {
      pg.text.replaceChildren(h('div', { class: 'mwelcome' },
        h('div', { class: 'big', 'aria-hidden': 'true' }, icon('books')),
        h('h2', {}, 'Your articles will gather here'),
        h('p', {}, 'Your favorites, downloaded articles, and reading history will appear here.'),
        h('div', { class: 'how' },
          icon('star'), h('div', {}, h('b', {}, 'Add to Favorites'), ' on any article keeps it here. Folders keep them in order.'),
          icon('download'), h('div', {}, h('b', {}, 'Download for Offline'), ' keeps a copy that opens without the internet.'),
          icon('history'), h('div', {}, h('b', {}, 'History'), ' lists every article you read, by day. It stays on this computer.')),
        h('button', { class: 'go', onclick: () => runCmd('search') }, 'Find an Article')));
    }

    // ----- Favorites -----
    function favRail(root) {
      const out = [h('h4', {}, 'Folders')];
      const link = (key, label, n, level, node) => {
        const on = st.sub === key;
        if (node && st.renaming === node.id) {
          return h('div', { class: 'lnk mfold', style: `--lv:${level}` }, h('span', { class: 'tw' }), icon('folder'),
            h('input', { class: 'ren', value: node.folder, 'aria-label': 'Folder name', maxlength: '80',
              onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = node.folder; e.target.blur(); } },
              onblur: (e) => { st.renaming = null; A.renaming = null; A.renameFolder(node.id, e.target.value); draw(); } }));
        }
        const b = h('button', { class: 'lnk mfold' + (on ? ' on' : ''), style: `--lv:${level}`, 'data-key': node ? 'f:' + node.id : null, onclick: () => go2('favorites', key) },
          node && node.items.some((x) => x.items)
            ? h('span', { class: 'tw', role: 'button', 'aria-label': node.open ? 'Close' : 'Open', onclick: (e) => { e.stopPropagation(); A.setFolderOpen(node.id, !node.open); draw(); } }, node.open ? '▼' : '▶')
            : h('span', { class: 'tw' }),
          icon('folder'), h('span', { class: 't' }, label), h('span', { class: 'n' }, String(n)));
        if (on) b.setAttribute('aria-current', 'true');
        if (node) { A.dragFrom(b, 'f:' + node.id); A.dropOn(b, node.id); }
        else if (key === 'loose') A.dropOn(b, null);
        return b;
      };
      out.push(link('all', 'All favorites', A.favTitles(root).length, 0));
      const walk = (list, level) => { for (const n of list) if (n.items) { out.push(link(n.id, n.folder, A.favCount(n), level, n)); if (n.open) walk(n.items, level + 1); } };
      walk(root, 0);
      out.push(link('loose', 'Not in a folder', root.filter((n) => n.title).length, 0));
      out.push(h('p', { class: 'mnote' }, 'Drag articles onto a folder to move them. Right-click a folder to rename, download, or delete it.'));
      return out;
    }
    function drawFavorites(root) {
      const f = A.folderAt(root, st.sub);
      if (st.sub !== 'all' && st.sub !== 'loose' && !f) st.sub = 'all';
      const titles = A.favTitles(root), folders = (() => { let n = 0; A.walkFavs(root, (x) => { if (x.items) n++; }); return n; })();
      const done = titles.filter((t) => A.dlEntry(t)).length;
      pg.setTitle(f ? f.node.folder : 'Favorites', `${titles.length === 1 ? '1 article' : `${titles.length} articles`}${folders ? ` in ${folders === 1 ? '1 folder' : `${folders} folders`}` : ''} · ${done} downloaded`);
      setCrumbs(f ? [...f.path.map((p) => ({ label: p.folder, run: () => go2('favorites', p.id) })), f.node.folder] : st.sub === 'loose' ? ['Not in a folder'] : []);
      let items;          // [{ folder } | { title, where }]
      if (st.query) {
        items = [];
        A.walkFavs(root, (n, path) => { if (n.title && n.title.toLowerCase().includes(st.query)) items.push({ title: n.title, where: path.map((p) => p.folder).join(' › ') }); });
      } else if (f) items = f.node.items.map((n) => (n.items ? { folder: n } : { title: n.title }));
      else if (st.sub === 'loose') items = root.filter((n) => n.title).map((n) => ({ title: n.title }));
      else { items = []; A.walkFavs(root, (n, path) => { if (n.title) items.push({ title: n.title, where: path.map((p) => p.folder).join(' › ') }); }); }
      const arts = items.filter((i) => i.title);
      const nf = items.length - arts.length;
      const head = h('div', { class: 'mhead' }, h('b', {}, st.query ? 'Found' : f ? f.node.folder : st.sub === 'loose' ? 'Not in a folder' : 'All favorites'),
        h('span', {}, `${arts.length === 1 ? '1 article' : `${arts.length} articles`}${nf ? `, ${nf === 1 ? '1 folder' : `${nf} folders`}` : ''}`));
      const rows = items.map((i) => (i.folder ? folderTile(i.folder) : artPageRow('a:' + i.title, i.title, { where: st.sub === 'all' || st.query ? i.where : '', remove: () => { A.removeFav(i.title); setIdle(`Removed “${i.title}” from Favorites`); } })));
      const empty = !items.length ? h('div', { class: 'mempty' }, st.query ? 'No favorites match.' : f ? 'This folder is empty. Drag favorites onto it in the list at the left, or use Move to….' : 'Open an article and click “Add to Favorites” to keep it here.') : null;
      pg.text.replaceChildren(head, selectionBar('favorites'), ...rows, empty || '');
    }
    function folderTile(n) {
      const c = A.favCount(n), names = A.favTitles(n.items).slice(0, 3);
      const key = 'f:' + n.id;
      const row = h('div', { class: 'mrow folder', 'data-key': key, draggable: 'true' },
        h('span', { class: 'chk' }),
        h('i', { class: 'th fold' }, icon('folder')),
        h('div', { class: 'mtx' },
          st.renaming === n.id
            ? h('input', { class: 'ren', value: n.folder, 'aria-label': 'Folder name', maxlength: '80',
              onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.target.value = n.folder; e.target.blur(); } },
              onblur: (e) => { st.renaming = null; A.renaming = null; A.renameFolder(n.id, e.target.value); draw(); } })
            : h('button', { class: 'mlink', onclick: () => go2('favorites', n.id) }, n.folder),
          h('span', { class: 'md' }, `Folder · ${c === 1 ? '1 article' : `${c} articles`}${names.length ? `: ${names.join(', ')}${c > 3 ? ', …' : ''}` : ''}`)));
      A.dragFrom(row, key);
      A.dropOn(row, n.id);
      return row;
    }
    // ----- Downloaded -----
    function downloadedRail() {
      const total = A.dlList.reduce((n, e) => n + (e.size || 0), 0);
      const sortBtn = (k, label) => { const b = railLink(label, () => { st.sort = k; store.set('dlSort', k); draw(); }); b.classList.toggle('on', st.sort === k); return b; };
      const cats = A.dlCats().filter((c) => A.catDownloaded(c).length);
      const catBtn = (k, label, n, ic) => { const b = railLink('', () => go2('downloaded', k)); b.replaceChildren(icon(ic), h('span', { class: 't' }, label), h('span', { class: 'n' }, String(n))); b.classList.add('mfold'); b.classList.toggle('on', (st.sub || 'all') === k); if (k.startsWith('cat:')) b.dataset.key = 'c:' + k.slice(4); return b; };
      const inCat = new Set(cats.flatMap((c) => A.catDownloaded(c).map((t) => t.toLowerCase())));
      const catRail = cats.length ? [h('h4', {}, 'Categories'), catBtn('all', 'All downloaded', A.dlList.length, 'download'),
        ...cats.map((c) => catBtn('cat:' + c.name, c.name, A.catDownloaded(c).length, 'stack')),
        catBtn('loose', 'Not in a category', A.dlList.filter((e) => !inCat.has(e.title.toLowerCase())).length, 'download'), h('hr')] : [];
      return [...catRail, h('h4', {}, 'Sort by'), sortBtn('date', 'Date downloaded'), sortBtn('size', 'Size'), sortBtn('name', 'Name'), h('hr'),
        h('p', { class: 'mstat' }, h('b', {}, String(A.dlList.length)), ` ${A.dlList.length === 1 ? 'article' : 'articles'}, ${mb(total)}`),
        h('p', { class: 'mnote' }, 'Downloaded articles open without the internet. Deleting a download keeps the article in your favorites.')];
    }
    function drawDownloaded() {
      const total = A.dlList.reduce((n, e) => n + (e.size || 0), 0);
      pg.setTitle('Downloaded', `${A.dlList.length === 1 ? '1 article' : `${A.dlList.length} articles`} · ${mb(total)} · They open without the internet`);
      setCrumbs([]);
      const sub = st.sub || 'all';
      const cat = sub.startsWith('cat:') ? A.dlCats().find((c) => c.name === sub.slice(4)) : null;
      const inCat = new Set(A.dlCats().flatMap((c) => A.catDownloaded(c).map((t) => t.toLowerCase())));
      let list = A.dlList.filter((e) => (!st.query || e.title.toLowerCase().includes(st.query))
        && (cat ? cat.titles.some((t) => A.sameTitle(t, e.title)) : sub === 'loose' ? !inCat.has(e.title.toLowerCase()) : true));
      if (cat) {
        setCrumbs([cat.name]);
        pg.setTitle(cat.name, `A Wikipedia category · ${list.length === 1 ? '1 article' : `${list.length} articles`} downloaded · ${mb(list.reduce((n, e) => n + (e.size || 0), 0))}`);
      }
      list = [...list].sort(st.sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : st.sort === 'name' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => (a.at < b.at ? 1 : -1));
      const head = h('div', { class: 'mhead' }, h('b', {}, st.query ? 'Found' : cat ? cat.name : sub === 'loose' ? 'Not in a category' : 'Downloaded'), h('span', {}, `${list.length === 1 ? '1 article' : `${list.length} articles`}`),
        cat ? h('button', { class: 'go mcatdel', onclick: () => A.deleteCategory(cat.name) }, 'Delete Downloads…') : null);
      const rows = list.map((e) => artPageRow('d:' + e.title, e.title, { mark: false, extra: h('span', { class: 'msize' }, `${mb(e.size || 0)} · ${new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`),
        remove: () => deleteDownloads([e.title]), removeLabel: `Delete the download of “${e.title}”` }));
      pg.text.replaceChildren(head, selectionBar('downloaded'), ...rows,
        !list.length ? h('div', { class: 'mempty' }, st.query ? 'No downloaded articles match.' : 'No downloaded articles yet. Open an article and click “Download for Offline” to read it without the internet.') : '');
    }
    // ----- History -----
    function historyRail(hist) {
      const today = A.dayStart(Date.now()), week = today - 6 * 864e5;
      const jump = (label, test) => {
        const b = railLink(label, () => {
          const i = hist.findIndex(test);
          if (i < 0) return;
          if (i >= st.shown) { st.shown = i + HISTORY_PAGE; draw(); }
          const g = $$('.mday', pg.root).find((x) => Number(x.dataset.at) <= (hist[i].at ? A.dayStart(hist[i].at) : 0));
          g?.scrollIntoView({ block: 'start', behavior: store.get('animations', true) ? 'smooth' : 'instant' });
        });
        if (!hist.some(test)) { b.disabled = true; b.classList.add('off'); }
        return b;
      };
      const thisWeek = hist.filter((e) => e.at >= week).length;
      return [h('h4', {}, 'History'),
        jump('Today', (e) => e.at >= today), jump('Yesterday', (e) => e.at >= today - 864e5 && e.at < today),
        jump('This week', (e) => e.at >= week && e.at < today - 864e5), jump('Earlier', (e) => e.at < week), h('hr'),
        h('p', { class: 'mstat' }, h('b', {}, String(thisWeek)), ` ${thisWeek === 1 ? 'article' : 'articles'} this week`, h('br'), h('b', {}, String(hist.length)), ` ${hist.length === 1 ? 'article' : 'articles'} in all`),
        h('hr'), h('h4', {}, 'Options'),
        railLink(store.get('historyPaused', false) ? 'Resume history' : 'Pause history', () => {
          const p = !store.get('historyPaused', false);
          store.set('historyPaused', p);
          setIdle(p ? 'History is paused: articles you read aren’t added to it' : 'History is on again');
          draw();
        }),
        store.get('historyPaused', false) ? h('p', { class: 'mnote warn' }, 'History is paused: articles you read aren’t added.') : null,
        h('p', { class: 'mnote' }, 'History stays on this computer.')].filter(Boolean);
    }
    function drawHistory(hist) {
      pg.setTitle('History', 'Every article you’ve read, newest first');
      setCrumbs([]);
      const list = st.query ? hist.filter((e) => e.t.toLowerCase().includes(st.query)) : hist;
      const shown = list.slice(0, st.shown);
      // Whole days: the page doesn't stop in the middle of one.
      let end = shown.length;
      while (end < list.length && end > 0 && A.dayStart(list[end].at || 0) === A.dayStart(list[end - 1].at || 0)) end++;
      const out = [selectionBar('history')];
      let day = null;
      for (const e of list.slice(0, end)) {
        const d = e.at ? A.dayStart(e.at) : 0;
        if (d !== day) {
          day = d;
          const n = list.filter((x) => (x.at ? A.dayStart(x.at) : 0) === d).length;
          out.push(h('div', { class: 'mhead mday', 'data-at': String(d) }, h('b', {}, dayLabel(e.at)), h('span', {}, n === 1 ? '1 article' : `${n} articles`)));
        }
        out.push(artPageRow('r:' + e.t, e.t, { lead: h('span', { class: 'mtime' }, e.at ? fmtTime(e.at) : ''), star: A.isFavTitle(e.t), key2: `${e.t}@${e.at}`,
          remove: () => { A.removeHistory(e.t); setIdle(`Removed “${e.t}” from History`); }, removeLabel: `Remove “${e.t}” from History` }));
      }
      if (end < list.length) out.push(h('button', { class: 'go mmore', onclick: () => { st.shown += HISTORY_PAGE; draw(); } }, 'Show Earlier Days'));
      if (!list.length) out.push(h('div', { class: 'mempty' }, st.query ? 'Nothing in your history matches.' : store.get('historyPaused', false) ? 'History is paused.' : 'Articles you read will be listed here.'));
      pg.text.replaceChildren(...out);
    }
    // ----- rows and the selection bar -----
    function artPageRow(key, t, { lead = null, star = false, mark = true, where = '', extra = null, remove = null, removeLabel = '', key2 = '' } = {}) {
      const i = A.infoOf(t) || A.dlEntry(t);
      if (!i) wantInfo(t);
      const selKey = key2 || key;
      const box = h('input', { type: 'checkbox', 'aria-label': `Select ${t}`, checked: st.sel.has(selKey),
        onchange: (e) => { if (e.target.checked) st.sel.add(selKey); else st.sel.delete(selKey); row.classList.toggle('sel', e.target.checked); updateSel(); } });
      const row = h('div', { class: 'mrow' + (st.sel.has(selKey) ? ' sel' : ''), 'data-key': key, 'data-title': t, draggable: 'true' },
        h('label', { class: 'chk' }, box),
        lead,
        i?.thumb ? h('i', { class: 'th', style: bg(i.thumb) }) : h('i', { class: 'th ph' }, icon('book')),
        h('div', { class: 'mtx' }, h('button', { class: 'mlink', title: t, onclick: () => openArticle(t) }, t),
          h('span', { class: 'md' }, i?.desc || ''), where ? h('span', { class: 'mwhere' }, icon('folder'), where) : null),
        extra,
        star ? h('span', { class: 'mstar', title: 'In Favorites', role: 'img', 'aria-label': 'In Favorites' }, icon('star')) : null,
        mark ? A.markFor(t) : null,
        remove ? h('button', { class: 'rx', title: removeLabel || `Remove “${t}” from Favorites`, 'aria-label': removeLabel || `Remove ${t} from Favorites`, onclick: remove }, '✕') : null);
      A.dragFrom(row, key, () => (st.sel.has(selKey) ? [...st.sel].map((k) => (st.view === 'history' ? 'r:' + k.replace(/@\d+$/, '') : k)) : null));
      return row;
    }
    // The selection bar follows the ticked rows (kept at the top of the list).
    function updateSel() {
      const old = $('.msel', pg.text), bar = selectionBar(st.view);
      if (old) { if (bar) old.replaceWith(bar); else old.remove(); }
      else if (bar) { const head = $('.mhead', pg.text); if (head && st.view !== 'history') head.after(bar); else pg.text.prepend(bar); }
    }
    // The selected rows' titles (History rows are "title@time").
    const selTitles = () => [...new Set([...st.sel].map((k) => k.replace(/^[adr]:/, '').replace(/@\d+$/, '')))];
    function selectionBar(kind) {
      const n = st.sel.size;
      if (!n) return '';
      const titles = selTitles();
      const btn = (label, fn) => h('button', { class: 'go', onclick: fn }, label);
      const notDl = titles.filter((t) => !A.dlEntry(t) && !A.dlJob(t));
      const acts = kind === 'favorites' ? [
        btn('Move to…', (e) => movePicker(e.currentTarget, titles)),
        notDl.length ? btn('Download', () => { A.queueDownloads(notDl); st.sel.clear(); draw(); }) : null,
        btn('Remove from Favorites', () => { const r = A.favs(); for (const t of titles) { const a = A.favAt(r, t); if (a) a.list.splice(a.i, 1); } st.sel.clear(); A.saveFavs(r); setIdle(`Removed ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} articles`} from Favorites`); }),
      ] : kind === 'downloaded' ? [
        btn('Delete Downloads…', () => deleteDownloads(titles)),
        titles.some((t) => !A.isFavTitle(t)) ? btn('Add to Favorites', () => { for (const t of titles) if (!A.isFavTitle(t)) A.addFav(t, A.infoOf(t)?.desc || ''); st.sel.clear(); draw(); setIdle('Added to Favorites'); }) : null,
      ] : [
        notDl.length ? btn('Download', () => { A.queueDownloads(notDl); st.sel.clear(); draw(); }) : null,
        btn('Remove from History', () => { const keys = new Set([...st.sel].map((k) => k.slice(2))); store.set('history', A.history().filter((e) => !keys.has(`${e.t}@${e.at}`))); st.sel.clear(); A.historyChanged(); }),
      ];
      return h('div', { class: 'msel', role: 'toolbar', 'aria-label': 'Selected articles' }, h('b', { role: 'status' }, `${n} selected`), ...acts.filter(Boolean),
        h('button', { class: 'go clr', onclick: () => { st.sel.clear(); draw(); } }, 'Clear selection'));
    }
    function movePicker(anchor, titles) {
      A.folderPicker(anchor, null, (id) => {
        for (const t of titles) A.moveFav('a:' + t, id);
        st.sel.clear();
        const to = A.folderAt(A.favs(), id)?.node.folder;
        setIdle(`Moved ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} articles`} to ${to ? `“${to}”` : 'Favorites (no folder)'}`);
        draw();
      });
    }
    function deleteDownloads(titles) {
      const es = titles.map(A.dlEntry).filter(Boolean);
      if (!es.length) return;
      const size = es.reduce((n, e) => n + (e.size || 0), 0), favN = es.filter((e) => A.isFavTitle(e.title)).length;
      const go3 = async () => {
        for (const e of es) await A.saved.remove(e.title);
        st.sel.clear();
        setIdle(`Deleted ${es.length === 1 ? `the download of “${es[0].title}”` : `${es.length} downloads`}, freeing ${mb(size)}.`);
        if (A.current?.dl) A.current.dl.refresh();
      };
      if (es.length === 1) return go3();
      A.dialog('Delete Downloads', `Delete ${es.length} downloads?`, [`This frees ${mb(size)} on this computer. The articles still open when you’re online.`,
        favN ? `${favN === 1 ? 'The favorite among them stays a favorite' : `The ${favN} favorites among them stay favorites`}, with the download button again.` : null].filter(Boolean),
      [['Delete Downloads', go3, true], ['Cancel']]);
    }
  }
  // Redraws the page when favorites, downloads, or history change elsewhere (the pane, an article's buttons).
  function refreshMyPage() {
    if (A.myPage && A.myPage.root.isConnected && !A.myPage.st.renaming) A.myPage.draw();
  }
  // The toolbar's My Articles arrow: Manage.
  function manageMenu(anchor) {
    A.closeCtx();
    const box = h('div', { class: 'menu ctx manage', role: 'menu', 'aria-label': 'Manage', tabindex: -1, onmousedown: (ev) => ev.stopPropagation() },
      h('div', { class: 'mh', 'aria-hidden': 'true' }, 'Manage'));
    menuItems(box, [['Favorites…', 'myfavs', 'Ctrl+B'], ['Downloaded Articles…', 'mydl'], ['History…', 'myhist', 'Ctrl+Y']], (cmd) => { A.closeCtx(); runCmd(cmd); });
    document.body.append(box);
    A.ctxMenu = box;
    A.ctxReturn = document.activeElement;
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.min(r.left, innerWidth - box.offsetWidth - 2) + 'px';
    box.style.top = (r.bottom + 1) + 'px';
    $('.mi', box)?.focus({ preventScroll: true });
  }

  return { viewMyArticles, refreshMyPage, manageMenu };
};
