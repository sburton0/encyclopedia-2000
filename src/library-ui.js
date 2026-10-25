// Tools > Offline Library: download Wikipedia from Kiwix to read, search, and explore without internet.
// The work happens in the main process (library.js); this dialog shows its state, which arrives on library:update.
window.E2KLibrary = (() => {
  const GB = 1e9;
  const size = (b) => (!b ? '0 MB' : b >= 10 * GB ? `${Math.round(b / GB)} GB` : b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
  const edition = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');
  const left = (s) => (s < 90 ? 'less than 2 minutes left' : s < 3600 ? `about ${Math.round(s / 60)} minutes left` : `about ${(s / 3600).toFixed(s < 36000 ? 1 : 0)} hours left`);
  // Shortens a path in the middle to fit a width, like classic Windows: the drive, "…", and as many of the last
  // folders as fit ("C:\Users\…\Wikipedia\Library").
  function fitPath(full, el) {
    const cs = getComputedStyle(el), room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const g = fitPath.ctx || (fitPath.ctx = document.createElement('canvas').getContext('2d'));
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (room <= 0 || g.measureText(full).width <= room) return full;
    const sep = full.includes('\\') ? '\\' : '/', parts = full.split(sep).filter(Boolean);
    const head = full.startsWith(sep) ? '' : parts.shift();
    for (let keep = parts.length - 1; keep >= 1; keep--) {
      const t = `${head}${sep}…${sep}${parts.slice(-keep).join(sep)}`;
      if (g.measureText(t).width <= room) return t;
    }
    return `${head}${sep}…${sep}${parts[parts.length - 1] || ''}`;   // still too long: the box's own "…" trims the end
  }
  const pref = (k, d) => { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };

  let dlg = null;   // the open dialog's redraw function

  async function open(api) {
    const { h, dialog } = api;
    const L = window.e2k.library;
    if (document.querySelector('.dialog.offline')) return;
    let st = await L.state();

    const status = h('div', { class: 'status' });
    const list = h('div', { class: 'packs' });
    const err = h('p', { class: 'oerr', hidden: true });
    const dirCode = h('code');
    const whereLbl = h('span', {}, 'Library folder');
    const changeBtn = h('button', { class: 'go', onclick: async () => { st = await L.chooseDir(); showErr(st.error || ''); draw(); fitUp(); } }, 'Change…');
    const whereNote = h('p', { class: 'wherenote', hidden: true }, 'To change the folder, cancel the download or let it finish.');
    const portableNote = h('p', { class: 'wherenote', hidden: true }, 'This portable copy is in a folder it can’t save to, so it keeps its settings and library on this computer instead.');
    const freeTxt = h('span');
    const first = h('input', { type: 'checkbox', checked: pref('libraryFirst', false), onchange: () => { localStorage.setItem('e2k.libraryFirst', JSON.stringify(first.checked)); picChoice(); api.updateNet && api.updateNet(); } });
    // Under "library first": sharp pictures from the internet when connected, or the library's own (smaller) pictures.
    const pic = (value, label) => {
      const r = h('input', { type: 'radio', name: 'libpics', value, checked: pref('libraryPictures', 'online') === value, onchange: () => localStorage.setItem('e2k.libraryPictures', JSON.stringify(value)) });
      return h('label', { class: 'opt sub' }, r, h('span', {}, label));
    };
    const pics = h('div', { class: 'subopts' },
      pic('online', 'Load high-resolution images from the internet when connected (recommended)'),
      pic('library', 'Use the library’s images only (lower resolution; nothing is loaded from the internet)'));
    const picChoice = () => { pics.classList.toggle('off', !first.checked); pics.querySelectorAll('input').forEach((i) => { i.disabled = !first.checked; }); };
    picChoice();

    const ov = h('div', { class: 'overlay' },
      h('div', { class: 'dialog offline', role: 'dialog', 'aria-label': 'Offline Library' },
        h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Offline Library'),
        h('div', { class: 'ob' },
          h('p', { class: 'intro' }, 'Download Wikipedia to this computer to read, search, and explore without an internet connection.'),
          status, list, err,
          h('div', { class: 'where' }, whereLbl, dirCode, changeBtn, freeTxt), whereNote, portableNote,
          h('div', { class: 'opts' },
            h('label', { class: 'opt' }, first, h('span', {}, 'Use the offline library first, even when online (faster; uses less data)')), pics),
          h('div', { class: 'kiwix' },
            h('span', {}, 'Library files come from ', h('b', {}, 'Kiwix'), ', a nonprofit that packages Wikipedia for offline use, through mirrors run by volunteers around the world.'),
            h('button', { class: 'go', onclick: () => window.e2k.openExternal('https://donate.kiwix.org/') }, '♥ Support Kiwix')),
          h('p', { class: 'fine' }, 'Images in offline libraries are lower resolution than online. Downloads come from download.kiwix.org and its mirrors. Articles are under CC BY-SA.')),
        h('div', { class: 'df' }, h('button', { class: 'go', onclick: () => close() }, 'Close'))));
    const close = () => { dlg = null; ov.remove(); };
    const showErr = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };

    // The installed library's pack; a Wikipedia library that isn't one of them (the user's own file) gets one of its own.
    const packOf = (id) => st.packs.find((p) => p.id === id)
      || (st.current && st.current.pack === id ? { id, label: st.current.label, desc: '', covers: [] } : undefined);
    const own = () => !!(st.current && st.current.own);
    // Open library file…: the user's own Kiwix file, used where it is.
    const haveRow = h('div', { class: 'have' }, h('span', {}, 'Already have a Wikipedia library file from Kiwix?'),
      h('button', { class: 'go', onclick: () => openLibFile() }, 'Open library file…'));
    // With a library installed, only it (and any download in progress) shows; Change library… reveals the rest.
    let showAll = false;
    function draw() {
      const cur = st.current && packOf(st.current.pack), d = st.download, mv = st.move;
      // the status box
      const dot = (c) => h('span', { class: 'dotc', style: `background:${c};box-shadow:0 0 6px ${c}` });
      if (st.missing && cur) {
        status.replaceChildren(dot('#e8a33a'), h('span', {}, h('b', {}, `${cur.label} can’t be found.`),
          ` It isn’t in ${st.missing.where}. If it’s on a drive that was disconnected, reconnect it and it will open again on its own. If you moved it, choose its new folder with Change…`));
      } else if (mv && cur) status.replaceChildren(dot('#4fa3ff'), h('span', {}, h('b', {}, `Moving ${cur.label} to its new folder.`), ' Its articles keep working while it moves.'));
      else if (st.override) status.replaceChildren(dot('#4fa3ff'), h('span', {}, h('b', {}, 'Using a test library: '), st.override + '.'));
      else if (cur && st.open) {
        status.replaceChildren(dot('#5fbf6a'), h('span', {}, h('b', {}, `${cur.label} is installed.`), ' Its articles work without internet.',
          st.update ? h('span', { class: 'upd' }, ` A newer edition (${edition(st.update.date)}) is available.`) : null));
      } else status.replaceChildren(dot('#8f9dbd'), h('span', {}, h('b', {}, 'No offline library yet.'), ' Articles load from Wikipedia while you’re online.'));
      // the packs
      const visible = !st.current || showAll ? [...st.packs] : st.packs.filter((p) => p.id === st.current.pack || (d && d.pack === p.id));
      if (cur && !st.packs.some((p) => p.id === cur.id)) visible.push(cur);
      // The installed library first; everything else (including a pack that's downloading) keeps its place in the list.
      const rank = (p) => (st.current && p.id === st.current.pack ? 0 : 1);
      visible.sort((a, b) => rank(a) - rank(b));
      const toggle = st.current ? h('button', { class: 'linkbtn', onclick: () => { showAll = !showAll; draw(); } }, showAll ? 'Hide other libraries' : '') : null;
      list.replaceChildren(...visible.map((p) => {
        const tags = [], acts = [];
        let desc = p.desc, extra = null, why = null;
        if (st.current && st.current.pack === p.id && st.missing) {
          // Missing: find it with Change… below, or Forget it (then every pack can be downloaded again).
          tags.push(h('span', { class: 'tag miss' }, 'NOT FOUND'));
          desc = `${edition(st.current.date)} edition · was in ${st.missing.where}`;
          acts.push(h('button', { class: 'go', onclick: () => forget(p) }, 'Forget…'));
        } else if (st.current && st.current.pack === p.id && mv) {
          // Moving to another drive: progress like a download's, and Cancel (the library stays where it was).
          tags.push(h('span', { class: 'tag ok' }, 'INSTALLED'));
          desc = `${edition(st.current.date)} edition · ${size(st.current.size)} on this computer`;
          const pct = mv.size ? Math.min(100, (100 * mv.copied) / mv.size) : 0;
          acts.push(h('button', { class: 'go', onclick: async () => { st = await L.cancelMove(); draw(); } }, 'Cancel'));
          extra = [h('div', { class: 'bar' }, h('i', { style: `width:${pct.toFixed(1)}%` })),
            h('div', { class: 'prog' }, h('span', {}, `Moving… ${size(mv.copied) || '0 MB'} of ${size(mv.size)} (${Math.floor(pct)}%)`),
              h('span', {}, mv.speed ? `${size(mv.speed)}/s · ${left(mv.eta)}` : ''))];
        } else if (st.current && st.current.pack === p.id) {
          tags.push(h('span', { class: 'tag ok' }, 'INSTALLED'));
          if (own()) tags.push(h('span', { class: 'tag inc' }, 'YOUR FILE'));
          desc = `${edition(st.current.date)} edition · ${size(st.current.size)} · ${!own() ? 'on this computer' : st.current.pack === 'other' ? st.current.file : 'your own file'}`;
          if (st.update && !d) acts.push(h('button', { class: 'go primary', onclick: () => start(p) }, 'Update'));
          if (!showAll) acts.push(h('button', { class: 'go', onclick: () => { showAll = true; draw(); } }, 'Change library…'));
          acts.push(h('button', { class: 'go', onclick: () => remove(p), disabled: !!(d && d.status === 'downloading') }, own() ? 'Stop using…' : 'Remove…'));
        } else if (d && d.pack === p.id) {
          const pct = d.size ? Math.min(100, (100 * d.received) / d.size) : 0;
          acts.push(h('span', { class: 'size' }, size(d.size || p.size)));
          if (d.status === 'downloading') acts.push(h('button', { class: 'go', onclick: async () => { st = await L.pause(); draw(); } }, 'Pause'));
          else acts.push(h('button', { class: 'go primary', onclick: () => start(p, true) }, 'Resume'));
          acts.push(h('button', { class: 'go', onclick: () => cancel(p) }, 'Cancel'));
          const what = d.status === 'downloading' ? 'Downloading…' : d.status === 'error' ? 'Stopped.' : 'Paused.';
          extra = [h('div', { class: 'bar' }, h('i', { style: `width:${pct.toFixed(1)}%` })),
            h('div', { class: 'prog' }, h('span', {}, `${what} ${size(d.received) || '0 MB'} of ${size(d.size)} (${Math.floor(pct)}%)`),
              h('span', {}, d.status === 'downloading' && d.speed ? `${size(d.speed)}/s · ${left(d.eta)}` : d.status === 'error' ? d.error || '' : ''))];
        } else {
          const covered = cur && cur.covers.includes(p.id);
          if (covered) tags.push(h('span', { class: 'tag inc' }, 'INCLUDED IN YOUR LIBRARY'));
          if (covered) desc = `${cur.label} already has ${/nopic/.test(p.id) && !/nopic/.test(cur.id) ? 'these articles (with images).' : 'all of these articles.'}`;
          if (p.recommended && !st.current) tags.push(h('span', { class: 'tag' }, 'RECOMMENDED'));
          // The size's line is always there (blank until Kiwix's catalog answers), so the button doesn't move when it arrives.
          acts.push(h('span', { class: 'size' }, p.size ? size(p.size) : ''));
          const busy = (d && d.status === 'downloading') || !!mv;
          // A pack that can't go on this drive is greyed out, with the reason in red (one that would fit once the
          // current library is removed stays clickable, and asks first).
          const f = p.fit, blocked = f && !f.ok && !f.canRemoveOld;
          if (blocked) {
            why = h('p', { class: 'why' }, f.noWrite ? 'Can’t save files in this folder. Choose another with Change…'
              : f.tooSmall ? `Too big for this drive (it holds ${size(f.total)}).`
              : f.fat32 && f.size > 4 * 1024 ** 3 ? 'FAT32 drives can’t hold files over 4 GB. Reformat as exFAT or use another drive.'
                : `Needs ${size(f.need)} free; ${size(f.free)} is free here.`);
          }
          acts.push(st.current
            ? h('button', { class: 'go quiet', disabled: busy || !p.url || blocked, onclick: () => start(p) }, 'Switch to this…')
            : h('button', { class: 'go primary', disabled: busy || !p.url || blocked, onclick: () => start(p) }, 'Download'));
        }
        const off = p.fit && !p.fit.ok && !p.fit.canRemoveOld && !(st.current && st.current.pack === p.id) && !(d && d.pack === p.id);
        return h('div', { class: 'pack' + (p.recommended && !st.current && !off ? ' rec' : '') + (off ? ' off' : '') + (d && d.pack === p.id ? ' dl' : '') + (mv && st.current && st.current.pack === p.id ? ' dl' : '') },
          // The text lines in their own column, evenly spaced; the size and button in theirs; each centered in the box.
          h('div', { class: 'txt' }, h('h3', {}, p.label, ...tags), h('p', {}, desc), why), h('div', { class: 'acts' }, acts), ...(extra || []));
      }), ...((!st.current || showAll) && !mv && !st.override ? [haveRow] : []), ...(toggle && showAll ? [toggle] : []));
      haveRow.querySelector('button').disabled = !!d;
      // One line: a long path is shortened in the middle, with the whole path on hover.
      // While a library downloads, its folder can't change; while one moves, the row shows where it's going.
      whereLbl.textContent = mv ? 'Moving to' : 'Library folder';
      const shown = mv ? mv.to : st.dir;
      // On a Mac or Linux, the home folder is written "~", so a shortened path still says where it starts.
      const home = st.home && shown.startsWith(st.home + '/') ? '~' + shown.slice(st.home.length) : shown;
      dirCode.textContent = fitPath(home, dirCode);
      dirCode.title = shown;
      changeBtn.disabled = !!(d || mv);
      whereNote.hidden = !d;
      portableNote.hidden = !st.portableFallback;
      freeTxt.textContent = !mv && !st.missing && st.free ? `${size(st.free)} free` : '';
    }
    dlg = (s) => { st = s; if (s.moveError) showErr(s.moveError); draw(); fitUp(); };

    // What switching packs means, before anything is downloaded or removed.
    // Resolves true to go ahead, false to cancel, or { keepOld } when the library being replaced is the user's own file,
    // which is deleted only if they say so.
    function confirmSwitch(p) {
      const cur = packOf(st.current.pack);
      if (cur && own()) {
        const heading = st.current.pack === p.id ? `Update ${p.label}?` : `Switch to ${p.label}?`;
        const what = st.current.pack === p.id ? `The ${edition(st.update && st.update.date)} edition` : p.label;
        return new Promise((res) => dialog('Offline Library', heading,
          [`${what} will download to the same folder. When it’s done, should your old file (${st.current.file}, ${size(st.current.size)}) be deleted?`],
          [['Delete it when done', () => res({ keepOld: false }), true], ['Keep it', () => res({ keepOld: true })], ['Cancel', () => res(false)]]));
      }
      if (!cur || st.current.pack === p.id) return Promise.resolve(true);
      const pics = !/nopic/.test(cur.id) && /nopic/.test(p.id);
      let heading, body;
      if (cur.covers.includes(p.id)) {
        heading = `Switch to ${p.label}?`;
        body = [pics ? `${p.label} has ${/all/.test(p.id) === /all/.test(cur.id) ? 'the same articles' : 'fewer articles'} without images.` : `Your library will have fewer articles: ${p.label} instead of ${cur.label}.`,
          `${cur.label} (${size(st.current.size)}) will be removed once ${p.label} finishes downloading. Until then, ${cur.label} stays available.`];
      } else if (p.covers.includes(cur.id)) {
        heading = `Download ${p.label}?`;
        body = [`${p.label} includes all the articles in ${cur.label}.`, `When it finishes downloading, ${cur.label} (${size(st.current.size)}) will be removed to save space.`];
      } else {
        heading = `Switch to ${p.label}?`;
        body = [`${cur.label} (${size(st.current.size)}) will be removed once ${p.label} finishes downloading. Until then, ${cur.label} stays available.`];
      }
      return new Promise((res) => dialog('Offline Library', heading, body, [[heading.replace('?', ''), () => res(true), true], ['Cancel', () => res(false)]]));
    }
    async function start(p, resume = false) {
      const ok = !resume && st.current ? await confirmSwitch(p) : true;
      if (!ok) return;
      const keepOld = !!(ok && ok.keepOld);
      let r = await L.download(p.id, { keepOld });
      // Suggest the biggest library that does fit this drive, if any.
      const alt = r.fits && st.packs.filter((x) => r.fits.includes(x.id) && x.id !== p.id).sort((a, b) => b.size - a.size)[0];
      const orAlt = alt ? `, or pick ${alt.label} (${size(alt.size)})` : '';
      if (r.error === 'too-small') return showErr(`${p.label} is ${size(r.size)}, which is too big for this drive (it holds ${size(r.total)}). Choose a bigger drive with Change…${orAlt}.`);
      if (r.error === 'fat32') return showErr(`${p.label} is ${size(r.size)}, and this drive can’t hold files over 4 GB (it’s formatted FAT32, common on USB sticks). Choose another drive with Change…, reformat this one as exFAT${orAlt}.`);
      if (r.error === 'space') {
        const cur = st.current && packOf(st.current.pack);
        if (r.canRemoveOld && cur) {
          const ok = await new Promise((res) => dialog('Offline Library', 'Not enough space', [
            `There isn’t enough space to keep ${cur.label} while ${p.label} downloads (it needs ${size(r.need)}; ${size(r.free)} is free).`,
            `Remove ${cur.label} now? You’ll have only your saved articles until the download finishes.`],
          [[`Remove ${cur.label} and download`, () => res(true), true], ['Cancel', () => res(false)]]));
          if (!ok) return;
          r = await L.download(p.id, { removeOld: true, keepOld });
        } else return showErr(`${p.label} needs ${size(r.need)} free, and ${size(r.free)} is free here. Free up space, or choose another drive with Change…`);
      }
      // The error stays up until there's a new outcome, so clicking again doesn't make it flash.
      showErr(r.error && r.error !== 'busy' ? r.error : '');
      st = await L.state(); draw(); fitUp();
    }
    async function cancel(p) {
      const ok = await new Promise((res) => dialog('Offline Library', 'Cancel the download?', [`The part of ${p.label} downloaded so far will be deleted.`],
        [['Cancel download', () => res(true)], ['Keep downloading', () => res(false), true]]));
      if (ok) { st = await L.cancel(); draw(); }
    }
    async function forget(p) {
      const ok = await new Promise((res) => dialog('Offline Library', `Forget ${p.label}?`,
        [`Encyclopedia 2000 will stop looking for it in ${st.missing.where}. If you find it later, choose its folder with Change… to use it again.`,
          'Until you download a new library, articles load from Wikipedia, so the app goes back online.'],
        [['Forget', () => res(true)], ['Cancel', () => res(false), true]]));
      if (ok) { st = await L.remove(); showErr(''); draw(); fitUp(); }
    }
    async function openLibFile() {
      let r = await L.openFile();
      if (r.confirm) {
        const c = r.confirm;
        const ok = await new Promise((res) => dialog('Offline Library', `Use your file instead of ${c.old}?`,
          [`${c.old} (${size(c.oldSize)}), which Encyclopedia 2000 downloaded, will be deleted to save space.`],
          [['Use my file', () => res(true), true], ['Cancel', () => res(false)]]));
        if (!ok) return;
        r = await L.useFile(c.file);
      }
      st = r; showErr(r.error || ''); if (!r.error) showAll = false; draw(); fitUp();
    }
    async function remove(p) {
      if (own()) {
        const ok = await new Promise((res) => dialog('Offline Library', `Stop using ${p.label}?`,
          [`Your file stays in ${st.dir}. Articles will load from Wikipedia again, and only your saved articles will work offline.`],
          [['Stop using', () => res(true)], ['Cancel', () => res(false), true]]));
        if (ok) { st = await L.remove(); draw(); fitUp(); }
        return;
      }
      const ok = await new Promise((res) => dialog('Offline Library', `Remove ${p.label}?`,
        [`This frees ${size(st.current.size)}. Articles will load from Wikipedia again, and only your saved articles will work offline.`],
        [['Remove', () => res(true)], ['Cancel', () => res(false), true]]));
      if (ok) { st = await L.remove(); draw(); }
    }

    document.body.append(ov);
    draw();
    // Pin the dialog's top edge where it first appears, so it grows and shrinks at the bottom (an error, a download's
    // progress, the other packs) instead of re-centering and jumping around the screen.
    // If it grows past the bottom of the window, it moves up just enough to fit (never back down while open).
    const box = ov.querySelector('.dialog.offline');
    let top = Math.max(20, Math.round(box.getBoundingClientRect().top));
    ov.style.alignItems = 'flex-start';
    const place = () => { box.style.marginTop = top + 'px'; box.style.maxHeight = `calc(100vh - ${top + 20}px)`; };
    const fitUp = () => {
      const natural = box.querySelector('.ob').scrollHeight + box.offsetHeight - box.querySelector('.ob').clientHeight;
      const room = innerHeight - 20 - natural;
      if (room < top) { top = Math.max(20, room); place(); }
    };
    place();
    fitUp();
    // Fresh sizes and editions from Kiwix's catalog.
    L.catalog().then((s) => { if (dlg) { if (s.error && !s.packs.some((p) => p.size)) showErr(s.error); dlg(s); } });
  }

  // Keep the open dialog (and the rest of the app) up to date.
  if (window.e2k && window.e2k.library) window.e2k.library.onUpdate((s) => { if (dlg) dlg(s); });
  // Closing the app mid-download or mid-move: say what happens, with Keep downloading (or Keep moving) as the default.
  if (window.e2k && window.e2k.library) window.e2k.library.onConfirmQuit((info) => {
    if (!window.E2K || document.querySelector('.dialog.quitdl')) return;
    const pct = info && info.size ? Math.floor((100 * info.received) / info.size) : 0;
    if (info.moving) {
      E2K.dialog('Encyclopedia 2000', 'Your offline library is still moving', [
        `${info.label} is ${pct}% moved (${size(info.received) || '0 MB'} of ${size(info.size)}). If you quit now, the move stops, and your library stays where it was.`],
      [['Keep moving', null, true], ['Quit anyway', () => window.e2k.library.quit()]]);
    } else E2K.dialog('Encyclopedia 2000', 'Your offline library is still downloading', [
      `${info.label} is ${pct}% done (${size(info.received) || '0 MB'} of ${size(info.size)}). If you quit now, the download will pick up where it left off next time you open Encyclopedia 2000.`],
    [['Keep downloading', null, true], ['Quit anyway', () => window.e2k.library.quit()]]);
    document.querySelector('.overlay:last-of-type .dialog')?.classList.add('quitdl');
  });
  return { open };
})();
