// Favorites, recent, read aloud: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['favorites'] = (A) => {
  'use strict';
  const { store } = A;
  const { setIdle, refreshMyPage, updateToolbar } = A.fn;

  // Favorites are a tree: a favorite is { title, desc }; a folder is { folder: name, id, open, items }, up to three
  // levels deep. A list saved before folders (0.5) is the same tree without any. Folders come first in each list; a new
  // favorite goes below them.
  const favs = () => store.get('favorites', []);
  const FOLDER_DEPTH = 3;
  function walkFavs(list, fn, path = []) {
    for (const n of list) {
      if (fn(n, path) === false) return false;
      if (n.items && walkFavs(n.items, fn, [...path, n]) === false) return false;
    }
  }
  const favTitles = (list = favs()) => { const out = []; walkFavs(list, (n) => { if (n.title) out.push(n.title); }); return out; };
  // Where a favorite or folder is: its list, its place in it, and the folders it's in.
  function locate(root, test) {
    let at = null;
    walkFavs(root, (n, path) => { if (!test(n)) return; at = { node: n, path, list: path.length ? path[path.length - 1].items : root }; return false; });
    if (at) at.i = at.list.indexOf(at.node);
    return at;
  }
  const sameTitle = (a, b) => a.toLowerCase() === b.toLowerCase();
  const favAt = (root, title) => locate(root, (n) => n.title && sameTitle(n.title, title));
  const folderAt = (root, id) => (id ? locate(root, (n) => n.items && n.id === id) : null);
  const isFavTitle = (t) => !!favAt(favs(), t);
  const isFav = () => !!A.current && isFavTitle(A.current.title);
  const afterFolders = (list) => { let i = 0; while (i < list.length && list[i].items) i++; return i; };
  function saveFavs(root) { store.set('favorites', root); updateToolbar(); refreshMyPage(); }
  // Adds a favorite (or moves one already there) into a folder, or the top level. Returns the folder's name.
  function addFav(title, desc = '', folderId = null) {
    const root = favs();
    const old = favAt(root, title);
    const node = old ? old.node : { title, desc };
    if (old) old.list.splice(old.i, 1);
    const f = folderAt(root, folderId);
    if (f) f.node.open = true;
    const list = f ? f.node.items : root;
    list.splice(afterFolders(list), 0, node);
    saveFavs(root);
    return f ? f.node.folder : null;
  }
  function removeFav(title) {
    const root = favs();
    const at = favAt(root, title);
    if (at) { at.list.splice(at.i, 1); saveFavs(root); }
  }
  function toggleFav() {
    if (!A.current) return;
    if (isFav()) { removeFav(A.current.title); setIdle(`Removed “${A.current.title}” from Favorites`); }
    else { addFav(A.current.title, A.current.desc); setIdle(`Added “${A.current.title}” to Favorites`); }
    updateToolbar();
  }
  // Folders: a new one is called "New folder" (renamed in place), after the folders already in its list.
  const levelsIn = (n) => (n.items ? 1 + Math.max(0, ...n.items.map(levelsIn)) : 0);
  const favCount = (n) => { let c = 0; walkFavs(n.items || [], (x) => { if (x.title) c++; }); return c; };
  function newFolder(parentId = null) {
    const root = favs();
    const p = folderAt(root, parentId);
    if (p && p.path.length + 2 > FOLDER_DEPTH) return null;
    const list = p ? p.node.items : root;
    const names = new Set(list.filter((n) => n.items).map((n) => n.folder.toLowerCase()));
    let name = 'New folder';
    for (let k = 2; names.has(name.toLowerCase()); k++) name = `New folder (${k})`;
    const node = { folder: name, id: Math.random().toString(36).slice(2, 10), open: true, items: [] };
    if (p) p.node.open = true;
    list.splice(afterFolders(list), 0, node);
    saveFavs(root);
    return node.id;
  }
  function renameFolder(id, name) {
    const root = favs();
    const f = folderAt(root, id);
    name = name.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (f && name && name !== f.node.folder) { f.node.folder = name; saveFavs(root); }
  }
  function setFolderOpen(id, open) {
    const root = favs();
    const f = folderAt(root, id);
    if (f) { f.node.open = open; store.set('favorites', root); }
  }
  // Moves a favorite ('a:' and its title) or a folder ('f:' and its id) into a folder (null: the top level). A folder
  // can't go inside itself, and the result can't be more than three levels deep.
  function canMove(key, folderId) {
    if (!key.startsWith('f:')) return true;
    const root = favs();
    const f = folderAt(root, key.slice(2));
    if (!f) return false;
    if (!folderId) return true;
    if (folderId === f.node.id || locate(f.node.items, (n) => n.id === folderId)) return false;
    const to = folderAt(root, folderId);
    return !!to && to.path.length + 1 + levelsIn(f.node) <= FOLDER_DEPTH;
  }
  function moveFav(key, folderId) {
    if (!canMove(key, folderId)) return false;
    const root = favs();
    const at = key.startsWith('f:') ? folderAt(root, key.slice(2)) : favAt(root, key.slice(2));
    if (!at) return false;
    at.list.splice(at.i, 1);
    const to = folderAt(root, folderId);
    if (to) to.node.open = true;
    const list = to ? to.node.items : root;
    list.splice(at.node.items ? afterFolders(list) : list.length, 0, at.node);
    saveFavs(root);
    return true;
  }
  function deleteFolder(id) {
    const root = favs();
    const f = folderAt(root, id);
    if (!f) return;
    const n = favCount(f.node), name = f.node.folder;
    const go = () => { const r = favs(); const g = folderAt(r, id); if (g) { g.list.splice(g.i, 1); saveFavs(r); setIdle(`Deleted the folder “${name}”`); } };
    if (!f.node.items.length) return go();
    A.dialog('Delete Folder', `Delete the folder “${name}”?`, [
      n ? `The ${n === 1 ? 'favorite' : `${n} favorites`} in it will be removed from Favorites too.` : 'The folders in it will be deleted too.',
      'Downloaded articles stay downloaded.'], [['Delete Folder', go, true], ['Cancel']]);
  }

  return { favs, FOLDER_DEPTH, walkFavs, favTitles, sameTitle, favAt, folderAt, isFavTitle, isFav, afterFolders, saveFavs, addFav, removeFav, toggleFav, favCount, newFolder, renameFolder, setFolderOpen, canMove, moveFav, deleteFolder };
};
