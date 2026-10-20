// Tools > Offline Library: download Wikipedia from Kiwix to read, search, and explore without internet.
// The work happens in the main process (library.js); this dialog shows its state, which arrives on library:update.
window.E2KLibrary = (() => {
  const GB = 1e9;
  const size = (b) => (!b ? '0 MB' : b >= 10 * GB ? `${Math.round(b / GB)} GB` : b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
  const edition = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');
  const left = (s) => (s < 90 ? 'less than 2 minutes left' : s < 3600 ? `about ${Math.round(s / 60)} minutes left` : `about ${(s / 3600).toFixed(s < 36000 ? 1 : 0)} hours left`);
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
    const freeTxt = h('span');
    const first = h('input', { type: 'checkbox', checked: pref('libraryFirst', false), onchange: () => { localStorage.setItem('e2k.libraryFirst', JSON.stringify(first.checked)); picChoice(); } });
    // Under "library first": sharp pictures from the internet when connected, or the library's own (smaller) pictures.
    const pic = (value, label) => {
      const r = h('input', { type: 'radio', name: 'libpics', value, checked: pref('libraryPictures', 'online') === value, onchange: () => localStorage.setItem('e2k.libraryPictures', JSON.stringify(value)) });
      return h('label', { class: 'opt sub' }, r, h('span', {}, label));
    };
    const pics = h('div', { class: 'subopts' },
      pic('online', 'Load high-resolution pictures from the internet when connected (recommended)'),
      pic('library', 'Use the library’s pictures only (lower resolution; nothing is loaded from the internet)'));
    const picChoice = () => { pics.classList.toggle('off', !first.checked); pics.querySelectorAll('input').forEach((i) => { i.disabled = !first.checked; }); };
    picChoice();

    const ov = h('div', { class: 'overlay' },
      h('div', { class: 'dialog offline', role: 'dialog', 'aria-label': 'Offline Library' },
        h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Offline Library'),
        h('div', { class: 'ob' },
          h('p', { class: 'intro' }, 'Download Wikipedia to this computer to read, search, and explore without an internet connection.'),
          status, list, err,
          h('div', { class: 'where' }, 'Save to', dirCode, h('button', { class: 'go', onclick: async () => { st = await L.chooseDir(); if (st.error) showErr(st.error); draw(); } }, 'Change…'), freeTxt),
          h('div', { class: 'opts' },
            h('label', { class: 'opt' }, first, h('span', {}, 'Use the offline library first, even when I’m online (faster; uses less data)')), pics),
          h('div', { class: 'kiwix' },
            h('span', {}, 'Library files come from ', h('b', {}, 'Kiwix'), ', a nonprofit that packages Wikipedia for offline use, through mirrors run by volunteers around the world.'),
            h('button', { class: 'go', onclick: () => window.e2k.openExternal('https://kiwix.org/en/donate/') }, '♥ Support Kiwix')),
          h('p', { class: 'fine' }, 'Pictures in offline libraries are lower resolution than online. Downloads come from download.kiwix.org and its mirrors. Articles are under CC BY-SA.')),
        h('div', { class: 'df' }, h('button', { class: 'go', onclick: () => close() }, 'Close'))));
    const close = () => { dlg = null; ov.remove(); };
    const showErr = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };

    const packOf = (id) => st.packs.find((p) => p.id === id);
    // With a library installed, only it (and any download in progress) shows; Change library… reveals the rest.
    let showAll = false;
    function draw() {
      const cur = st.current && packOf(st.current.pack), d = st.download;
      // the status box
      const dot = (c) => h('span', { class: 'dotc', style: `background:${c};box-shadow:0 0 6px ${c}` });
      if (st.override) status.replaceChildren(dot('#4fa3ff'), h('span', {}, h('b', {}, 'Using a test library: '), st.override + '.'));
      else if (cur && st.open) {
        status.replaceChildren(dot('#5fbf6a'), h('span', {}, h('b', {}, `${cur.label} is installed.`), ' Its articles work without internet.',
          st.update ? h('span', { class: 'upd' }, ` A newer edition (${edition(st.update.date)}) is available.`) : null));
      } else status.replaceChildren(dot('#8f9dbd'), h('span', {}, h('b', {}, 'No offline library yet.'), ' Articles load from Wikipedia while you’re online.'));
      // the packs
      const visible = !st.current || showAll ? [...st.packs] : st.packs.filter((p) => p.id === st.current.pack || (d && d.pack === p.id));
      // The installed library first, then any download, then the rest.
      const rank = (p) => (st.current && p.id === st.current.pack ? 0 : d && p.id === d.pack ? 1 : 2);
      visible.sort((a, b) => rank(a) - rank(b));
      const toggle = st.current ? h('button', { class: 'linkbtn', onclick: () => { showAll = !showAll; draw(); } }, showAll ? 'Hide other libraries' : '') : null;
      list.replaceChildren(...visible.map((p) => {
        const tags = [], acts = [];
        let desc = p.desc, extra = null;
        if (st.current && st.current.pack === p.id) {
          tags.push(h('span', { class: 'tag ok' }, 'INSTALLED'));
          desc = `${edition(st.current.date)} edition · ${size(st.current.size)} on this computer`;
          if (st.update && !d) acts.push(h('button', { class: 'go primary', onclick: () => start(p) }, 'Update'));
          if (!showAll) acts.push(h('button', { class: 'go', onclick: () => { showAll = true; draw(); } }, 'Change library…'));
          acts.push(h('button', { class: 'go', onclick: () => remove(p), disabled: !!(d && d.status === 'downloading') }, 'Remove…'));
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
          if (covered) desc = `${cur.label} already has ${/nopic/.test(p.id) && !/nopic/.test(cur.id) ? 'these articles (with pictures).' : 'all of these articles.'}`;
          if (p.recommended && !st.current) tags.push(h('span', { class: 'tag' }, 'RECOMMENDED'));
          if (p.size) acts.push(h('span', { class: 'size' }, size(p.size)));
          const busy = d && d.status === 'downloading';
          // A pack that can't go on this drive is greyed out, with the reason in red (one that would fit once the
          // current library is removed stays clickable, and asks first).
          const f = p.fit, blocked = f && !f.ok && !f.canRemoveOld;
          if (blocked) {
            extra = [h('p', { class: 'why' }, f.noWrite ? 'Can’t save files in this folder. Choose another with Change…'
              : f.tooSmall ? `Too big for this drive (it holds ${size(f.total)}).`
              : f.fat32 && f.size > 4 * 1024 ** 3 ? 'FAT32 drives can’t hold files over 4 GB. Reformat as exFAT or use another drive.'
                : `Needs ${size(f.need)} free; ${size(f.free)} is free here.`)];
          }
          acts.push(st.current
            ? h('button', { class: 'go quiet', disabled: busy || !p.url || blocked, onclick: () => start(p) }, 'Switch to this…')
            : h('button', { class: 'go primary', disabled: busy || !p.url || blocked, onclick: () => start(p) }, 'Download'));
        }
        const off = p.fit && !p.fit.ok && !p.fit.canRemoveOld && !(st.current && st.current.pack === p.id) && !(d && d.pack === p.id);
        return h('div', { class: 'pack' + (p.recommended && !st.current && !off ? ' rec' : '') + (off ? ' off' : '') + (d && d.pack === p.id ? ' dl' : '') },
          h('h3', {}, p.label, ...tags), h('div', { class: 'acts' }, acts), h('p', {}, desc), ...(extra || []));
      }), ...(toggle && showAll ? [toggle] : []));
      dirCode.textContent = st.dir;
      freeTxt.textContent = st.free ? `${size(st.free)} free` : '';
    }
    dlg = (s) => { st = s; draw(); fitUp(); };

    // What switching packs means, before anything is downloaded or removed.
    function confirmSwitch(p) {
      const cur = packOf(st.current.pack);
      if (!cur || st.current.pack === p.id) return Promise.resolve(true);
      const pics = !/nopic/.test(cur.id) && /nopic/.test(p.id);
      let heading, body;
      if (cur.covers.includes(p.id)) {
        heading = `Switch to ${p.label}?`;
        body = [pics ? `${p.label} has ${/all/.test(p.id) === /all/.test(cur.id) ? 'the same articles' : 'fewer articles'} without pictures.` : `Your library will have fewer articles: ${p.label} instead of ${cur.label}.`,
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
      if (!resume && st.current && !(await confirmSwitch(p))) return;
      let r = await L.download(p.id);
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
          r = await L.download(p.id, { removeOld: true });
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
    async function remove(p) {
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
  // Closing the app mid-download: say what happens, with Keep downloading as the default.
  if (window.e2k && window.e2k.library) window.e2k.library.onConfirmQuit((info) => {
    if (!window.E2K || document.querySelector('.dialog.quitdl')) return;
    const pct = info && info.size ? Math.floor((100 * info.received) / info.size) : 0;
    E2K.dialog('Encyclopedia 2000', 'Your offline library is still downloading', [
      `${info.label} is ${pct}% done (${size(info.received) || '0 MB'} of ${size(info.size)}). If you quit now, the download will pick up where it left off next time you open Encyclopedia 2000.`],
    [['Keep downloading', null, true], ['Quit anyway', () => window.e2k.library.quit()]]);
    document.querySelector('.overlay:last-of-type .dialog')?.classList.add('quitdl');
  });
  return { open };
})();
