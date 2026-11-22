// Gallery: Picture of the Day, Media of the Day (videos and sounds), and Featured Sounds: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts.gallery = (A) => {
  'use strict';
  const { h, icon } = A;
  const { strip, decodeHtml, bg, sized, longDate, route, setStatus, setIdle, isOffline, go, openArticle, setCrumbs, mount, live, todayFeed, shell, bandBtn, railLink, loading, lightbox, updateVolume } = A.fn;

  const GALLERY_TABS = [['picture', 'Picture', 'film'], ['video', 'Video', 'play'], ['sound', 'Sound', 'vol']];
  const weekDays = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; });
  const dayName = (d, i) => (i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  // Plain text from a bit of wikitext: links and {{w|…}} become their words; other templates and formatting go.
  const wikiText = (w) => decodeHtml(String(w || '')
    .replace(/\{\{w\|[^}|]*\|([^}]+)\}\}/g, '$1').replace(/\{\{w\|([^}]+)\}\}/g, '$1')
    .replace(/\[\[:?(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:\S+ ([^\]]+)\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/<[^>]+>/g, ''))
    .replace(/^(?:Category|File):/gm, '').replace(/\s+/g, ' ').trim();

  async function viewGallery(tab, token) {
    if (!GALLERY_TABS.some(([id]) => id === tab)) tab = 'picture';
    const tabs = h('div', { class: 'mtabs', role: 'tablist' }, GALLERY_TABS.map(([id, label, ic]) =>
      h('button', { class: id === tab ? 'on' : '', role: 'tab', 'aria-selected': String(id === tab),
        onclick: () => { if (id !== tab) go(id === 'picture' ? 'gallery' : route('gallery', id), { replace: true }); } }, icon(ic), label)));
    if (tab === 'video') return viewMotd(tabs, token);
    if (tab === 'sound') return viewSounds(tabs, token);

    const pg = shell({ title: 'Picture of the Day', desc: 'Featured images from Wikimedia Commons', railTitle: 'This week', wide: true, tools: [tabs] });
    const holder = h('div', { class: 'potd' }, loading('Loading pictures…'));
    const stripEl = h('div', { class: 'strip' });
    pg.text.append(holder, stripEl);
    if (!mount(pg.root, token)) return;
    setStatus('Loading pictures…', true);
    // Each day appears as soon as it arrives, so one slow day doesn't hold up the rest. Today's picture shows first.
    const days = weekDays();
    const pics = days.map(() => null);
    const tiles = days.map((d, i) => h('button', { disabled: true, onclick: () => { picked = true; show(i); } }, h('i'), i === 0 ? 'Today' : longDate(d)));
    const railBtns = days.map((d, i) => railLink(dayName(d, i), () => { picked = true; show(i); }));
    railBtns.forEach((b) => { b.disabled = true; });
    stripEl.append(...tiles);
    pg.railIn.append(...railBtns);
    let shown = -1, picked = false;
    function show(i) {
      if (!pics[i]) return;
      shown = i;
      const { date, img } = pics[i];
      const full = img.fromLibrary ? img.thumbnail.source : sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 1280);
      const caption = strip(img.description?.text) || strip(img.title);
      // Offline, each day's picture comes from an article in the offline library, not from Wikimedia Commons.
      holder.replaceChildren(
        h('figure', {}, h('img', { src: full, alt: caption, onclick: () => lightbox(full, caption) })),
        h('div', { class: 'desc' }, caption),
        img.fromLibrary
          ? h('div', { class: 'credit' }, `${longDate(date)} · From your offline library`, bandBtn(`Read about ${img.title}`, () => openArticle(img.title)))
          : h('div', { class: 'credit' },
            `${longDate(date)} · ${strip(img.artist?.text) || 'Unknown artist'} · ${img.license?.type || ''}`,
            img.file_page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(img.file_page), 'ext') : null));
      tiles.forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      pg.content.scrollTo({ top: 0 });
    }
    await Promise.allSettled(days.map(async (d, i) => {
      const img = (await (i === 0 ? todayFeed() : Wiki.featured(d)).catch(() => null))?.image;
      if (!live(token)) return;
      if (!img) { tiles[i].remove(); railBtns[i].remove(); return; }
      if (img.fromLibrary) pg.root.querySelector('.band .desc').textContent = 'Pictures from your offline library (the Picture of the Day comes back when you’re online)';
      pics[i] = { date: d, img };
      tiles[i].disabled = railBtns[i].disabled = false;
      tiles[i].firstChild.style.cssText = bg(img.thumbnail?.source);
      if (!picked && (shown < 0 || i < shown)) show(i);
    }));
    if (!live(token)) return;
    if (!pics.some(Boolean)) throw Object.assign(new Error('No pictures available'), { noPictures: isOffline() || !Wiki.connected() });
    setIdle();
  }

  // A video or sound that plays right on the page, with the viewer's controls.
  function inlinePlayer(m) {
    const label = m.caption || A.fileName(m.file);
    const stage = h('div', { class: 'mstage ' + m.type });
    const el = h(m.type, { src: m.src, preload: 'none', poster: m.type === 'video' ? m.thumb : null });
    const parts = A.playerParts();
    const controls = h('div', { class: 'ctl' }, parts.pb, parts.cur, parts.bar, parts.tot, ...A.volControl());
    const toggle = A.wireMedia(el, { ...parts, duration: m.duration, onState: (on) => stage.classList.toggle('playing', on) });
    el.addEventListener('error', () => stage.append(h('div', { class: 'merr' }, 'This file can’t be played right now.')));
    const big = h('button', { class: 'big', title: 'Play', onclick: toggle }, icon('play'));
    if (m.type === 'video') { el.addEventListener('click', toggle); stage.append(el, big); }
    else stage.append(A.waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
    return h('div', { class: 'mviewer inline' }, stage, controls);
  }
  // A file from videoInfo as something inlinePlayer can play.
  function playable(file, ii, extra = {}) {
    const audio = /^audio\//.test(ii.mime) || (!ii.width && !ii.height);
    const derivs = (ii.derivatives || []).map((d) => ({ url: d.src, mime: d.type || '', height: d.height }));
    const src = audio ? A.noUtm((ii.derivatives || []).find((d) => /mpeg|ogg|opus/.test(d.type || ''))?.src || ii.url) : A.videoSource(derivs) || A.noUtm(ii.url);
    return { type: audio ? 'audio' : 'video', file, src, thumb: audio ? '' : A.noUtm(ii.thumburl), duration: ii.duration || 0,
      credit: A.creditOf(ii), page: ii.descriptionurl, ...extra };
  }
  const mediaTileBg = (m) => (m.type === 'video' ? bg(m.thumb) : '');

  // Media of the Day: a video (now and then a sound) picked by Wikimedia Commons for each day.
  async function viewMotd(tabs, token) {
    const pg = shell({ title: 'Media of the Day', desc: 'A video or sound chosen each day by Wikimedia Commons', railTitle: 'This week', wide: true, tools: [tabs] });
    pg.text.append(loading('Loading videos…'));
    if (!mount(pg.root, token)) return;
    setCrumbs(['Media of the Day']);
    setStatus('Loading videos…', true);
    const days = weekDays();
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pages = await Wiki.commonsPages(days.flatMap((d) => [`Template:Motd/${ymd(d)}`, `Template:Motd/${ymd(d)} (en)`]));
    const week = days.map((d) => ({
      date: d,
      file: /\|\s*1=([^|}]+)/.exec(pages[`Template:Motd/${ymd(d)}`] || '')?.[1]?.trim(),
      caption: wikiText(/\|\s*1=([\s\S]*?)\|\s*2=/.exec(pages[`Template:Motd/${ymd(d)} (en)`] || '')?.[1] || ''),
    })).filter((w) => w.file);
    if (!week.length) throw new Error('No media of the day available');
    const info = await Wiki.videoInfo(week.map((w) => 'File:' + w.file));
    if (!live(token)) return;
    const items = week.filter((w) => info['File:' + w.file]).map((w) => playable('File:' + w.file, info['File:' + w.file], { date: w.date, caption: w.caption }));
    if (!items.length) throw new Error('No media of the day available');
    const holder = h('div', { class: 'potd motd' });
    const tiles = items.map((m, i) => h('button', { onclick: () => show(i) },
      h('i', { class: m.type, style: mediaTileBg(m) }, h('b', {}, (m.type === 'video' ? '▶︎ ' : '♪︎ ') + A.clock(m.duration))),
      days.indexOf(m.date) === 0 ? 'Today' : longDate(m.date)));
    const railBtns = items.map((m, i) => railLink(dayName(m.date, days.indexOf(m.date)), () => show(i)));
    function show(i) {
      const m = items[i];
      holder.replaceChildren(inlinePlayer(m),
        m.caption ? h('div', { class: 'desc' }, m.caption) : null,
        h('div', { class: 'credit' }, [longDate(m.date), m.credit.replace(/ · From Wikimedia Commons$/, '')].filter(Boolean).join(' · '),
          m.page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(m.page), 'ext') : null));
      tiles.forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      updateVolume();
      pg.content.scrollTo({ top: 0 });
    }
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(holder, h('div', { class: 'strip' }, tiles));
    show(0);
    setIdle();
  }

  // Featured Sounds: recordings picked by Wikimedia Commons, in its collections. The large player shows a sound of
  // the day, chosen in turn from the whole list.
  const AUDIO_FILE = /\.(ogg|oga|opus|flac|wav|mp3|mid|midi)$/i;
  async function viewSounds(tabs, token) {
    const pg = shell({ title: 'Featured Sounds', desc: 'Music, speeches, and historic recordings chosen by Wikimedia Commons', railTitle: 'Collections', wide: true, tools: [tabs] });
    pg.text.append(loading('Loading sounds…'));
    if (!mount(pg.root, token)) return;
    setCrumbs(['Featured Sounds']);
    setStatus('Loading sounds…', true);
    const NAMES = ['Historical recordings', 'Music', 'Field recordings', 'Other'];
    const pages = await Wiki.commonsPages(NAMES.map((n) => `Commons:Featured sounds/${n}`));
    const collections = NAMES.map((name) => ({
      name,
      sounds: (pages[`Commons:Featured sounds/${name}`] || '').split('\n').map((l) => /^\s*(?:File|Image):([^|]+?)\s*(?:\|(.*))?$/.exec(l))
        .filter((m) => m && AUDIO_FILE.test(m[1])).map((m) => ({ file: 'File:' + m[1], label: (m[2] || '').trim() })),
    })).filter((c) => c.sounds.length);
    if (!collections.length) throw new Error('No featured sounds available');
    const all = collections.flatMap((c) => c.sounds);
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
    const today = all[dayOfYear % all.length];
    const hero = h('div', { class: 'potd sotd' });
    const listHead = h('h3', { class: 'mlist-h' });
    const list = h('div', { class: 'mlist' });
    const infoCache = {};
    const infoFor = async (files) => {
      const need = files.filter((f) => !(f in infoCache));
      for (let i = 0; i < need.length; i += 50) Object.assign(infoCache, await Wiki.videoInfo(need.slice(i, i + 50)));
      return infoCache;
    };
    const titleOf = (s) => s.label || A.fileName(s.file).replace(/^\d+,\d+\s+/, '');
    const descOf = (ii) => {
      const d = decodeHtml(strip(ii?.extmetadata?.ImageDescription?.value || '')).replace(/\s+/g, ' ').trim();
      return d.length > 320 ? d.slice(0, 317).replace(/\s+\S*$/, '') + '…' : d;
    };
    const railBtns = collections.map((c, i) => {
      const b = railLink(c.name, () => showCollection(i));
      b.append(h('span', { class: 'n' }, String(c.sounds.length)));
      return b;
    });
    async function showCollection(i) {
      const c = collections[i];
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      listHead.textContent = c.name;
      list.replaceChildren(loading('Loading sounds…'));
      const inf = await infoFor(c.sounds.map((s) => s.file));
      if (!live(token)) return;
      list.replaceChildren(...c.sounds.filter((s) => inf[s.file]).map((s) => {
        const p = playable(s.file, inf[s.file]);
        return A.soundPlayer({ file: s.file, dur: p.duration, label: titleOf(s), src: JSON.stringify([[p.src]]) });
      }));
      updateVolume();
    }
    const inf = await infoFor([today.file]);
    if (!live(token)) return;
    if (inf[today.file]) {
      const m = playable(today.file, inf[today.file], { caption: titleOf(today) });
      const desc = descOf(inf[today.file]);
      hero.append(h('div', { class: 'eyebrow' }, 'Sound of the day'), inlinePlayer(m),
        desc ? h('div', { class: 'desc' }, desc) : null,
        h('div', { class: 'credit' }, m.credit.replace(/ · From Wikimedia Commons$/, ''),
          m.page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(m.page), 'ext') : null));
    }
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(hero, listHead, list);
    await showCollection(Math.max(0, collections.findIndex((c) => c.sounds.includes(today))));
    setIdle();
  }

  return { viewGallery };
};
