// Downloading articles (Download for Offline): moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['downloads'] = (A) => {
  'use strict';
  const { $, h, icon, store } = A;
  const { setStatus, setIdle, isOffline, go } = A.fn;

  // The article's Download for Offline button: the main part downloads it (with its pictures); the arrow opens a menu
  // (as text only, download again, delete the download). While downloading it shows how far along it is; once
  // downloaded it says so. The copy is made by the main process (downloads.js) and opens without the internet.
  const saved = window.e2k.saved;
  const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e7 ? `${Math.round(b / 1e6)} MB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);
  function downloadButton() {
    const main = h('button', { class: 'bbtn dmain', onclick: () => (dl.entry ? downloadMenu(dl) : startDownload(dl)) }, icon('download'), h('span', {}, 'Download for Offline'));
    const arrow = h('button', { class: 'bbtn darrow', title: 'More download choices', 'aria-label': 'More download choices', 'aria-haspopup': 'menu', onclick: () => downloadMenu(dl) }, '▾');
    const dl = { el: h('span', { class: 'bsplit' }, main, arrow), main, arrow, entry: null,
      async refresh() {
        if (!A.current || A.current.dl !== dl) return;
        dl.entry = await saved.get(A.current.title).catch(() => null);
        dl.draw();
      },
      draw() {
        const job = A.current && A.current.dl === dl && A.downloadJobs.find((j) => j.title.toLowerCase() === A.current.title.toLowerCase());
        const label = main.querySelector('span');
        main.classList.toggle('on', !!dl.entry && !job);
        if (job) label.textContent = `Downloading… ${Math.round((job.done / Math.max(job.total, 1)) * 100)}%`;
        else label.textContent = dl.entry ? 'Downloaded' : 'Download for Offline';
        main.title = dl.entry ? `Downloaded ${new Date(dl.entry.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · ${mb(dl.entry.size)}. It opens without the internet.`
          : `Download this article (${whatComes().replace(/^W/, 'w').replace(/^A/, 'a')}), so it opens without the internet`;
      } };
    return dl;
  }
  async function startDownload(dl, opts = {}) {
    if (!A.current) return;
    await downloadTitle(A.current.title, opts);
    if (A.current && A.current.dl === dl) dl.refresh();
  }
  // What a downloaded article brings with it, from Options › Storage; a choice made for one download goes over it.
  const downloadDefaults = () => ({ textOnly: store.get('dlPictures', 'reading') === 'none', sounds: store.get('dlSounds', true) !== false,
    videos: store.get('dlVideos', false) === true, spoken: store.get('dlSpoken', false) === true });
  const dlWith = (title, opts = {}) => saved.download(title, { ...downloadDefaults(), ...opts });
  // What "Download this article" brings, in words.
  function whatComes() {
    const d = downloadDefaults();
    if (d.textOnly) return 'As text only (Options › Storage)';
    const extra = [d.sounds ? 'sounds' : '', d.videos ? 'videos' : '', d.spoken ? 'its spoken recording' : ''].filter(Boolean);
    return `With its pictures${extra.length ? (extra.length === 1 ? ` and ${extra[0]}` : `, ${extra.slice(0, -1).join(', ')}, and ${extra[extra.length - 1]}`) : ''}`;
  }
  // Downloads one article (from its button, or the My Articles pane), telling how it went in the status bar.
  async function downloadTitle(title, opts = {}) {
    if (isOffline()) { setIdle('Offline mode is on. Downloading an article needs the internet.'); return; }
    setStatus(`Downloading “${title}”…`, true);
    const r = await dlWith(title, opts);
    if (r.ok) setIdle(`Downloaded “${r.entry.title}”${r.entry.videos ? ` with its ${r.entry.videos === 1 ? 'video' : 'videos'}` : ''} (${mb(r.entry.size)}). It opens without the internet.`);
    else if (r.space) setIdle(`“${title}” wasn’t downloaded: there isn’t enough free space on this drive.`);
    else if (r.offline) setIdle('Offline mode is on. Downloading an article needs the internet.');
    else setIdle(`“${title}” couldn’t be downloaded. Check your connection and try again.`);
    if (A.current?.dl && A.sameTitle(A.current.title, title)) A.current.dl.refresh();
  }
  function downloadMenu(dl) {
    if ($('.rmenu')) { $('.rmenu').remove(); return; }
    const item = (ic, title, sub, fn) => h('button', { class: 'ri', role: 'menuitem', onclick: () => { menu.remove(); fn(); } },
      h('span', { class: 'rio' }, icon(ic)), h('span', {}, h('b', {}, title), h('span', { class: 's' }, sub)));
    const e = dl.entry;
    // Videos are downloaded only on request. The choice shows once the article is known to have some, with their size.
    const videoItem = (!e || !e.textOnly) && !(e && e.withVideos) && !(!e && downloadDefaults().videos) ? item('film', e ? 'Download again with its videos' : 'Download it with its videos too',
      'Checking how big they are…', () => startDownload(dl, { videos: true })) : null;
    if (videoItem) {
      videoItem.hidden = true;
      saved.videos(A.current.title).then((v) => {
        if (!v || !v.count) return;
        videoItem.querySelector('.s').textContent = `${v.count === 1 ? 'Its video' : `Its ${v.count} videos`}${v.size ? `, about ${mb(v.size)} more` : ''}. Videos play without the internet too.`;
        videoItem.hidden = false;
      }, () => {});
    }
    const menu = h('div', { class: 'rmenu', role: 'menu', 'aria-label': 'Download' }, ...[...(e ? [
      item('download', 'Download again', `Updates your copy (${mb(e.size)}, downloaded ${new Date(e.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}) to Wikipedia’s current version.`,
        () => startDownload(dl, { textOnly: e.textOnly, videos: e.withVideos })),
      videoItem,
      e.withVideos ? item('film', 'Download again without its videos', `Frees ${mb(e.videoSize)}. The videos still play when you’re online.`, () => startDownload(dl)) : null,
      item('delete', 'Delete download', 'Removes the copy from this computer. A favorite stays a favorite.', async () => {
        await saved.remove(A.current.title);
        setIdle(`Deleted the download of “${A.current.title}”.`);
        dl.refresh();
      }),
    ] : [
      item('download', 'Download this article', `${whatComes()}, so it opens without the internet.`, () => startDownload(dl)),
      videoItem,
      item('book', 'Download it as text only', 'Smaller: the text without its pictures.', () => startDownload(dl, { textOnly: true })),
    ]), item('folder', 'Download a category…', 'Articles like this one: pick one of its Wikipedia categories.', () => A.categoryDialog(A.current.title)),
      item('books', 'Downloaded articles…', 'Every article you’ve downloaded, on the My Articles page.', () => go('myarticles/downloaded'))].filter(Boolean));
    const r = dl.el.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 310)) + 'px';
    document.body.append(menu);
    const away = (ev) => { if (!menu.contains(ev.target) && !dl.el.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', away, true); } };
    document.addEventListener('mousedown', away, true);
    menu.querySelector('.ri').focus();
  }
  // Progress from the main process: the button of the article on screen follows it.
  // Known before the library's state is looked at (libChanged), so Offline mode isn't ended at startup for want of a library.
  const downloadsKnown = saved.state().then((s) => { A.hasDownloads = !!(s && s.count); }, () => {});
  let dlSum = '';
  saved.onUpdate((s) => {
    A.hasDownloads = !!s.count;
    A.downloadJobs = s.active || [];
    if (A.current && A.current.dl) { if (!A.downloadJobs.length) A.current.dl.refresh(); else A.current.dl.draw(); }
    // The My Articles pane: its marks follow the progress; its lists reload when a download is added or removed.
    const sum = `${s.count}/${s.size}`;
    if (sum !== dlSum) { dlSum = sum; if (A.dlLoaded || A.dlCats().length) A.loadDownloaded(); }
    A.refreshMarks();
  });

  return { saved, mb, downloadButton, downloadDefaults, dlWith, downloadTitle, downloadsKnown };
};
