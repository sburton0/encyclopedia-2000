// Download a Category: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['download-category'] = (A) => {
  'use strict';
  const { $, h, store } = A;
  const { setStatus, setIdle, isOffline, mb, downloadDefaults, refreshMyPage } = A.fn;

  // The article's Wikipedia categories, each with how many articles and about how big; the chosen one's articles download
  // one after another (over 200: its 200 most read; over 2,000 it's too big). Downloaded categories are kept as groups
  // (dlCategories: { name, titles, at, open }) under Downloaded, and can also go into a Favorites folder.
  const CAT_MAX = 200, CAT_TOO_BIG = 2000;
  const dlCats = () => store.get('dlCategories', []);
  const avgSize = () => {
    const sizes = A.dlList.map((e) => (e.size || 0) - (e.videoSize || 0)).filter((n) => n > 0 && !Number.isNaN(n));
    return sizes.length >= 3 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 2.5e6;
  };
  async function categoryDialog(title) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading a category needs the internet.'); return; }
    setStatus(`Finding the categories “${title}” is in…`, true);
    let cats;
    try { cats = await Wiki.categories(title); } catch { setIdle('Couldn’t get the article’s categories. Check your connection and try again.'); return; }
    setIdle();
    if (!cats.length) { setIdle(`“${title}” isn’t in any categories that can be downloaded.`); return; }
    cats.sort((a, b) => a.count - b.count);
    const each = avgSize();
    const n = (c) => Math.min(c.count, CAT_MAX);
    let pick = cats.find((c) => c.count > 1 && c.count <= CAT_TOO_BIG) || cats[0];
    const radios = cats.map((c) => {
      const big = c.count > CAT_TOO_BIG;
      const input = h('input', { type: 'radio', name: 'cat', value: c.name, checked: c === pick, disabled: big, onchange: () => { pick = c; update(); } });
      return h('label', { class: 'scr' + (big ? ' off' : '') }, input, h('b', {}, c.name),
        h('span', { class: 'n' }, `${c.count.toLocaleString()} article${c.count === 1 ? '' : 's'}${big ? '' : ` · ${mb(n(c) * each)}`}`),
        big ? h('small', {}, `Too big to download (over ${CAT_TOO_BIG.toLocaleString()} articles). Try a smaller category.`)
          : c.count > CAT_MAX ? h('small', {}, `Over ${CAT_MAX} articles: downloads the ${CAT_MAX} most read.`) : null);
    });
    const pics = h('input', { type: 'checkbox', checked: !downloadDefaults().textOnly, onchange: () => update() });
    const vids = h('input', { type: 'checkbox', checked: downloadDefaults().videos });
    const toFav = h('input', { type: 'checkbox', onchange: () => update() });
    const folderSel = h('select', { 'aria-label': 'Favorites folder' });
    const picsLabel = h('span', {});
    const list = h('div', { class: 'scl', role: 'radiogroup', 'aria-label': 'Categories' }, radios);
    const btn = () => $('.overlay .dialog.savecat .df .go.default');
    function update() {
      picsLabel.textContent = `Pictures and sounds (about ${mb(n(pick) * each)}; text only: about ${mb(n(pick) * 6e4)})`;
      vids.disabled = !pics.checked;
      // The folder: a new one named after the category, or one that's there.
      const want = folderSel.value;
      const opts = [['new', `New folder “${pick.name}”`]];
      A.walkFavs(A.favs(), (x, path) => { if (x.items) opts.push([x.id, '\u2003'.repeat(path.length) + x.folder]); });
      folderSel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v }, l)));
      folderSel.value = opts.some(([v]) => v === want) ? want : 'new';
      folderSel.disabled = !toFav.checked;
      const b = btn();
      if (b) b.textContent = `Download ${n(pick) === 1 ? '1 Article' : `${n(pick)} Articles`}`;
    }
    update();
    A.dialog('Download a Category', 'Download the articles in a category', [
      `“${title}” is in these Wikipedia categories. Pick one to download its articles, so they open without the internet.`,
      list,
      h('div', { class: 'scopts' },
        h('label', {}, pics, picsLabel),
        h('label', {}, vids, h('span', {}, 'Videos too (often 20–200 MB each)')),
        h('label', {}, toFav, h('span', {}, 'Also add them to a Favorites folder: '), folderSel)),
      h('p', { class: 'scnote' }, 'Downloading continues in the background; the status bar shows how far along it is. They appear under Downloaded in My Articles (Ctrl+I).'),
    ], [['Download', () => startCategory(pick, { textOnly: !pics.checked, videos: pics.checked && vids.checked }, toFav.checked ? folderSel.value : null), true], ['Cancel']], { cls: 'savecat' });
    update();
    $('.overlay .dialog.savecat input[name=cat]:checked')?.focus();
  }
  async function startCategory(cat, opts, folder) {
    setStatus(`Getting the articles in “${cat.name}”…`, true);
    let titles;
    try {
      titles = await Wiki.categoryMembers(cat.name, CAT_TOO_BIG);
      if (titles.length > CAT_MAX) {
        setStatus(`Finding the ${CAT_MAX} most read articles in “${cat.name}”…`, true);
        const views = await Wiki.pageviews(titles);
        titles = [...titles].sort((a, b) => (views[b] || 0) - (views[a] || 0)).slice(0, CAT_MAX);
      }
    } catch { setIdle(`Couldn’t get the articles in “${cat.name}”. Check your connection and try again.`); return; }
    if (!titles.length) { setIdle(`“${cat.name}” has no articles to download.`); return; }
    // Kept as a group under Downloaded (the same category again replaces it).
    store.set('dlCategories', [{ name: cat.name, titles, at: Date.now(), open: false }, ...dlCats().filter((c) => c.name !== cat.name)]);
    if (folder) {
      const root = A.favs();
      let f = folder !== 'new' && A.folderAt(root, folder);
      if (!f) {
        const id = Math.random().toString(36).slice(2, 10);
        root.splice(A.afterFolders(root), 0, { folder: cat.name.slice(0, 80), id, open: false, items: [] });
        f = A.folderAt(root, id);
      }
      for (const t of titles) { const old = A.favAt(root, t); if (old) old.list.splice(old.i, 1); }
      f = A.folderAt(root, f.node.id);
      f.node.items.push(...titles.map((t) => ({ title: t })));
      A.saveFavs(root);
    }
    A.queueDownloads(titles.filter((t) => !A.dlEntry(t) || (opts.videos && !A.dlEntry(t).withVideos)), { opts, label: cat.name });
    A.drawFavPane();
    refreshMyPage();
  }
  // Options › Storage › Remove…: every downloaded article, after asking.
  async function removeAllDownloads(done) {
    const list = await A.saved.list().catch(() => []);
    if (!list.length) return;
    const size = list.reduce((n, e) => n + (e.size || 0), 0);
    const favN = list.filter((e) => A.isFavTitle(e.title)).length;
    A.dialog('Remove Downloaded Articles', 'Remove all downloaded articles?', [
      `${list.length === 1 ? '1 article' : `${list.length} articles`}, ${mb(size)}. They still open when you’re online.`,
      favN ? `${favN === 1 ? 'The favorite among them stays a favorite' : `The ${favN} favorites among them stay favorites`}.` : null].filter(Boolean),
    [['Remove All', async () => {
      for (const e of list) await A.saved.remove(e.title);
      store.set('dlCategories', []);
      setIdle(`Removed ${list.length === 1 ? '1 downloaded article' : `${list.length} downloaded articles`}, freeing ${mb(size)}.`);
      if (A.current?.dl) A.current.dl.refresh();
      A.drawFavPane();
      refreshMyPage();
      done && done();
    }, true], ['Cancel']]);
  }
  // A downloaded category's articles that are downloaded now.
  const catDownloaded = (c) => c.titles.filter((t) => A.dlEntry(t));
  function deleteCategory(name) {
    const c = dlCats().find((x) => x.name === name);
    if (!c) return;
    const es = catDownloaded(c).map(A.dlEntry);
    const size = es.reduce((n, e) => n + (e.size || 0), 0);
    const go4 = async () => {
      store.set('dlCategories', dlCats().filter((x) => x.name !== name));
      for (const e of es) await A.saved.remove(e.title);
      setIdle(`Deleted the downloads of “${name}” (${es.length === 1 ? '1 article' : `${es.length} articles`}), freeing ${mb(size)}.`);
      if (A.current?.dl) A.current.dl.refresh();
      A.drawFavPane();
      refreshMyPage();
    };
    A.dialog('Delete Downloads', `Delete the downloads of “${name}”?`, [
      `${es.length === 1 ? '1 article' : `${es.length} articles`}, ${mb(size)}. They still open when you’re online. Favorites among them stay favorites.`],
    [['Delete Downloads', go4, true], ['Cancel']]);
  }

  return { dlCats, categoryDialog, removeAllDownloads, catDownloaded, deleteCategory };
};
