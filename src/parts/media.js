// Media: an article's pictures, videos, and sounds: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts.media = (A) => {
  'use strict';
  const { $$, h, icon } = A;
  const { strip, decodeHtml, https, bg, setIdle, live, railLink, railSection, closeOverlays, speechStop, updateVolume, toggleMute } = A.fn;

  // Everything comes from Wikimedia Commons. Videos and sounds load only when opened, and follow the app's volume.
  const clock = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
  };
  const noUtm = (u) => https(u || '').replace(/\?utm_[^#]*$/, '');
  const fileName = (file) => file.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
  const KIND = { image: 'Picture', video: 'Video', audio: 'Sound' };

  // The best WebM version up to 720p (Chromium no longer plays Ogg Theora video).
  function videoSource(sources) {
    const webm = sources.filter((s) => /webm/.test(s.mime)).map((s) => {
      const url = noUtm(s.url);
      return { url, px: Number(/\.(\d+)p\.[\w.]*webm$/.exec(url)?.[1] || s.height) || 0 };
    }).sort((a, b) => b.px - a.px);
    return (webm.find((s) => s.px <= 720) || webm[webm.length - 1])?.url || '';
  }
  function creditOf(ii) {
    const md = ii?.extmetadata || {};
    let artist = decodeHtml(strip(md.Artist?.value || '')).replace(/\s+/g, ' ').trim();
    if (artist.length > 90) artist = artist.slice(0, 88) + '…';
    return [artist, md.LicenseShortName?.value, 'From Wikimedia Commons'].filter(Boolean).join(' · ');
  }

  // The article's media in page order. Recordings that read the whole article aloud are left out (they belong
  // with Read Aloud), and so are the small icons Wikipedia keeps out of its own galleries.
  async function articleMedia(title) {
    const items = [], spoken = [];
    for (const it of (await Wiki.mediaList(title)).items || []) {
      const caption = (it.caption?.text || '').trim();
      if (it.type === 'audio' && it.audio_type === 'spoken') spoken.push({ file: it.title });
      if (it.type === 'image') {
        if (!it.showInGallery || !it.srcset?.length) continue;
        const src = it.srcset.map((s) => noUtm(s.src));
        items.push({ type: 'image', file: it.title, caption, thumb: src[0], large: src[src.length - 1] });
      } else if (it.type === 'video' || (it.type === 'audio' && it.audio_type !== 'spoken')) {
        // A downloaded article's sounds come with their details (it.info: the downloaded copy, its length and credit).
        items.push({ type: it.type, file: it.title, caption, sources: it.sources || [], info: it.info || null });
      }
    }
    const av = items.filter((m) => m.type !== 'image');
    // The others' details from Commons. Without them (offline, say) those videos and sounds are left out.
    const ask = av.filter((m) => !m.info), info = {};
    for (let i = 0; i < ask.length; i += 50) {
      try { Object.assign(info, await Wiki.fileInfo(ask.slice(i, i + 50).map((m) => m.file))); } catch {}
    }
    for (const m of av) {
      const ii = m.info || info[m.file];
      delete m.info;
      if (!ii) continue;
      m.duration = ii.duration || 0;
      m.credit = creditOf(ii);
      if (m.type === 'video') {
        m.thumb = noUtm(ii.thumburl);
        m.src = videoSource(m.sources);
      } else {
        const url = noUtm(ii.url);
        // MIDI files can't play directly, but Commons keeps an MP3 of each one.
        m.src = /midi/.test(ii.mime) ? url.replace(/\/commons\/(\w\/\w\w)\/([^/]+)$/, '/commons/transcoded/$1/$2/$2.mp3') : url;
      }
    }
    const out = items.filter((m) => m.type === 'image' || m.src);
    out.spoken = await narrationOf(spoken).catch(() => []);
    return out;
  }

  // A volunteer's recording of the whole article (Spoken Wikipedia), in its parts: where to play each one, how long
  // it is, who read it, and when.
  async function narrationOf(parts) {
    if (!parts.length) return [];
    parts.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
    const info = await Wiki.fileInfo(parts.map((p) => p.file));
    const out = [];
    for (const p of parts) {
      const ii = info[p.file];
      if (!ii?.url) continue;
      const md = ii.extmetadata || {};
      const artist = decodeHtml(strip(md.Artist?.value || '')).replace(/\s+/g, ' ').trim();
      const reader = /Speaker:\s*(.+?)(?:\s+Authors of the article.*)?$/i.exec(artist)?.[1] || (artist.length < 40 && !/author/i.test(artist) ? artist : '');
      const ym = /(\d{4})-(\d{2})/.exec(strip(md.DateTimeOriginal?.value || '')) || /(\d{4})-(\d{2})/.exec(ii.timestamp || '');
      const when = ym ? new Date(+ym[1], +ym[2] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
      out.push({ file: p.file, src: noUtm(ii.url), duration: ii.duration || 0, reader, when });
    }
    return out;
  }

  // Bars that suggest a sound's waveform. They aren't its real shape, but each file gets its own.
  function waveform(seed, n = 14) {
    let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const w = h('span', { class: 'wave' });
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      w.append(h('i', { style: `height:${25 + ((x >>> 16) % 76)}%` }));
    }
    return w;
  }
  function mediaTile(m, onclick) {
    const label = m.caption || fileName(m.file);
    return h('button', { class: 'mt ' + m.type, style: m.type === 'audio' ? null : bg(m.thumb), title: label, onclick },
      m.type === 'audio' ? [waveform(m.file), h('span', { class: 'lbl' }, label)] : null,
      m.type === 'image' ? null : h('b', {}, (m.type === 'video' ? '▶︎ ' : '♪︎ ') + clock(m.duration)));
  }

  // The Media box in an article's rail: counts, nine tiles, and "See all".
  async function mediaBox(mediaP, token) {
    const items = await mediaP;
    if (!live(token)) return null;
    const of = (type) => items.filter((m) => m.type === type);
    const [pictures, videos, sounds] = [of('image'), of('video'), of('audio')];
    if (!videos.length && !sounds.length && pictures.length < 2) return null;
    // Up to two videos and two sounds go in fixed places among the pictures, so they're easy to spot.
    const featured = [videos[0], sounds[0], videos[1], sounds[1], videos[2], sounds[2], videos[3], sounds[3]].filter(Boolean).slice(0, 4);
    const mixed = [];
    for (let i = 0, p = 0, f = 0; i < 9; i++) {
      const m = ([0, 1, 6, 8].includes(i) && featured[f] ? featured[f++] : pictures[p++] || featured[f++]);
      if (m) mixed.push(m);
    }
    // The counts double as filters when there's more than one kind: click one to show only that kind, again for all.
    const kinds = [['image', pictures, 'picture', 'pictures'], ['video', videos, 'video', 'videos'], ['audio', sounds, 'sound', 'sounds']]
      .filter(([, list]) => list.length);
    const grid = h('div', { class: 'mbox' });
    const all = railLink('', null, 'sub mall');
    let only = null;
    const counts = kinds.map(([type, list, one, many]) => {
      const label = [h('b', {}, list.length), ' ' + (list.length === 1 ? one : many)];
      if (kinds.length < 2) return h('span', {}, label);
      return h('button', { title: `Show only ${many}`, onclick: () => show(only === type ? null : type) }, label);
    });
    function show(type) {
      only = type;
      counts.forEach((c, i) => {
        c.classList.toggle('on', kinds[i][0] === type);
        if (c.tagName === 'BUTTON') c.title = kinds[i][0] === type ? 'Show everything' : `Show only ${kinds[i][3]}`;
      });
      const list = type ? items.filter((m) => m.type === type) : items;
      const [, , one, many] = kinds.find(([t]) => t === type) || [, , 'item', 'items'];
      grid.replaceChildren(...(type ? list.slice(0, 9) : mixed).map((m) => mediaTile(m, () => mediaViewer(list, list.indexOf(m), true))));
      all.textContent = `See all ${list.length} ${type ? (list.length === 1 ? one : many) : ''} ›`.replace('  ', ' ');
      all.onclick = () => mediaViewer(list, 0);
    }
    show(null);
    return railSection('Media', `${items.length} items`, [h('div', { class: 'mcount' }, counts), grid, all]);
  }

  // Connects a video or sound to a play button, progress bar, and times. Only one thing plays at a time, and
  // playing stops Read Aloud. Returns a function that plays or pauses it.
  function wireMedia(el, { pb, bar, fill, cur, tot, duration = 0, onState }) {
    el.volume = E2KAudio.level();
    const len = () => (isFinite(el.duration) && el.duration) || duration;
    const tick = () => { cur.textContent = clock(el.currentTime); fill.style.width = len() ? (100 * el.currentTime / len()) + '%' : '0'; };
    const state = () => {
      const playing = !el.paused && !el.ended;
      pb.querySelector('use').setAttribute('href', '#i-' + (playing ? 'pause' : 'play'));
      pb.title = playing ? 'Pause' : 'Play';
      onState?.(playing);
    };
    const toggle = () => { if (el.paused || el.ended) el.play().catch(() => {}); else el.pause(); };
    const seek = (e) => {
      const r = bar.getBoundingClientRect();
      if (len()) el.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * len();
    };
    pb.addEventListener('click', toggle);
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seek(e); });
    bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) seek(e); });
    el.addEventListener('timeupdate', tick);
    el.addEventListener('loadedmetadata', () => { if (len()) tot.textContent = clock(len()); });
    el.addEventListener('play', () => { speechStop(); $$('video, audio').forEach((o) => { if (o !== el) o.pause(); }); state(); });
    el.addEventListener('pause', state);
    el.addEventListener('ended', state);
    tot.textContent = clock(duration);
    tick();
    state();
    return toggle;
  }
  // The volume control for media players: a mute button and a slider, kept in step with the toolbar's volume.
  function volControl() {
    const range = h('input', { type: 'range', class: 'vr', min: 0, max: 100, title: 'Volume' });
    range.addEventListener('input', () => { E2KAudio.setVolume(range.value / 100); updateVolume(); });
    range.addEventListener('keydown', (e) => e.stopPropagation());
    return [h('button', { class: 'vb', onclick: () => toggleMute() }, icon('vol')), range];
  }
  const playerParts = () => {
    const fill = h('i');
    return { pb: h('button', { class: 'pb' }, icon('play')), fill, bar: h('div', { class: 'bar' }, fill), cur: h('span', {}, '0:00'), tot: h('span', {}, '0:00') };
  };

  // A small sound player for the article text: play, title, progress, and times.
  function soundPlayer({ file = '', dur = 0, label = '', src = '[]' }) {
    const au = h('audio', { preload: 'none' });
    try { for (const [u, type] of JSON.parse(src)) au.append(h('source', { src: noUtm(u), type })); } catch {}
    const name = label || fileName(file);
    const parts = playerParts();
    const box = h('div', { class: 'aud' }, parts.pb,
      h('div', { class: 'info' }, h('b', { title: name }, name), parts.bar, h('div', { class: 'tm' }, parts.cur, parts.tot)), au);
    wireMedia(au, { ...parts, duration: Number(dur) || 0, onState: (on) => box.classList.toggle('playing', on) });
    au.addEventListener('error', () => { box.classList.add('err'); parts.pb.title = 'This sound can’t be played right now.'; }, true);
    return box;
  }

  // The 🔊 button by an article's title: plays a recording of how the subject's name is said.
  // The language of a pronunciation recording, from its file name: "De-Albert Einstein.oga" (German),
  // "LL-Q1860 (eng)-Speaker-Word.wav" (Lingua Libre; English), or "Paris Pronunciation in French.ogg". '' if unknown.
  function recordingLanguage(file) {
    const f = String(file || '').replace(/_/g, ' ');
    const named = /(?:^|\s)in ([A-Z][a-z]+)\b/.exec(f)?.[1];
    if (named) return named;
    const code = (/^LL-Q\d+ \(([a-z]{2,3})\)/i.exec(f) || /^([a-z]{2,3})(?:-[a-z]{2})?-/i.exec(f))?.[1]?.toLowerCase();
    if (!code) return '';
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code === 'eng' ? 'en' : code); } catch { return ''; }
  }
  function pronButton(name, { src, file }) {
    const lang = recordingLanguage(file);
    const au = h('audio', { preload: 'none', src });
    const btn = h('button', { class: 'pron', title: lang && lang !== 'English' ? `Hear “${name}” said in ${lang}` : `Hear how “${name}” is pronounced`, onclick: () => {
      au.volume = E2KAudio.level();
      if (E2KAudio.isMuted()) setIdle('Sound is muted. Turn up the volume to hear the pronunciation.');
      au.currentTime = 0;
      au.play().catch(() => setIdle('The pronunciation can’t be played right now.'));
    } }, icon('vol'), au);
    au.addEventListener('play', () => { speechStop(); $$('video, audio').forEach((o) => { if (o !== au) o.pause(); }); btn.classList.add('on'); });
    au.addEventListener('pause', () => btn.classList.remove('on'));
    au.addEventListener('ended', () => btn.classList.remove('on'));
    return btn;
  }

  // Brings the article's video and sound placeholders (made in cleanArticle) to life. Videos open in the viewer.
  const sameFile = (a, b) => a.replace(/^(File|Image):/i, '').replace(/_/g, ' ') === b.replace(/^(File|Image):/i, '').replace(/_/g, ' ');
  function mediaSlots(root, mediaP) {
    root.querySelectorAll('.vslot').forEach((s) => {
      const { file, dur, poster, src } = s.dataset;
      const caption = s.closest('figure')?.querySelector('figcaption')?.textContent.trim() || '';
      const open = async () => {
        const items = await mediaP.catch(() => []);
        const i = items.findIndex((m) => sameFile(m.file, file));
        if (i >= 0) mediaViewer(items, i, true);
        else if (src) mediaViewer([{ type: 'video', file, caption, thumb: poster, src, duration: Number(dur) || 0 }], 0, true);
      };
      const name = caption || (file || '').replace(/^(File|Image):/i, '').replace(/\.\w{3,4}$/, '').replace(/_/g, ' ');
      s.replaceWith(h('button', { class: 'vthumb', title: 'Play video', 'aria-label': name ? 'Play video: ' + name : 'Play video', onclick: open },
        poster ? h('img', { src: poster, alt: name, loading: 'lazy' }) : null,
        h('span', { class: 'play' }, icon('play')),
        Number(dur) ? h('span', { class: 'dur' }, clock(dur)) : null));
    });
    root.querySelectorAll('.aslot').forEach((s) => s.replaceWith(soundPlayer(s.dataset)));
  }

  // The viewer: one picture, video, or sound at a time, with a strip of the article's other media.
  function mediaViewer(items, start, autoplay = false) {
    closeOverlays();
    let at = -1, toggle = null;
    const kind = h('span', { class: 'vt' });
    const pos = h('span', { class: 'pos' });
    const stage = h('div', { class: 'mstage' });
    const controls = h('div', { class: 'ctl' });
    const credit = h('div', { class: 'credit' });
    const strip = h('div', { class: 'mstrip' }, items.map((m, i) => mediaTile(m, () => show(i, true))));
    const prev = h('button', { class: 'nav prev', title: 'Previous', onclick: () => show(at - 1) }, '‹');
    const next = h('button', { class: 'nav next', title: 'Next', onclick: () => show(at + 1) }, '›');
    const ov = h('div', { class: 'overlay mview', onmousedown: (e) => { if (e.target === ov) ov.remove(); } },
      h('div', { class: 'mviewer', role: 'dialog' },
        h('div', { class: 'dt' }, kind, pos, h('button', { class: 'x', title: 'Close', onclick: () => ov.remove() }, '✕')),
        h('div', { class: 'stagewrap' }, stage, prev, next), controls, credit, strip));

    function show(i, play = false) {
      if (i < 0 || i >= items.length) return;
      at = i;
      const m = items[i];
      const label = m.caption || fileName(m.file);
      kind.textContent = `${KIND[m.type]} · ${label}`;
      kind.title = label;
      pos.textContent = `${i + 1} of ${items.length}`;
      prev.hidden = i === 0;
      next.hidden = i === items.length - 1;
      [...strip.children].forEach((t, j) => t.classList.toggle('on', j === i));
      strip.children[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      stage.className = 'mstage ' + m.type;
      stage.replaceChildren();
      controls.replaceChildren();
      toggle = null;
      if (m.type === 'image') {
        stage.append(h('img', { src: m.large, alt: label }));
      } else {
        const el = h(m.type, { src: m.src, preload: play ? 'auto' : 'none', poster: m.type === 'video' ? m.thumb : null });
        const parts = playerParts();
        controls.append(parts.pb, parts.cur, parts.bar, parts.tot, ...volControl());
        // Only the one on screen: a video left behind for the next one pauses as it goes, and says so after the next one
        // has started, which would bring back the Play button over it.
        toggle = wireMedia(el, { ...parts, duration: m.duration, onState: (on) => { if (el.isConnected) stage.classList.toggle('playing', on); } });
        el.addEventListener('error', () => stage.append(h('div', { class: 'merr' }, 'This file can’t be played right now.')));
        const big = h('button', { class: 'big', title: 'Play', onclick: toggle }, icon('play'));
        if (m.type === 'video') {
          el.addEventListener('click', toggle);
          stage.append(el, big);
        } else if (m.art) {
          // The article's picture, over a soft, darkened copy of itself; the waveform and the title beneath it.
          stage.classList.add('art');
          const pic = h('img', { class: 'cover', src: m.art, alt: '' });
          pic.addEventListener('error', () => stage.classList.remove('art'));
          stage.append(h('div', { class: 'coverbg', style: bg(m.art) }), pic, waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
        } else {
          stage.append(waveform(m.file, 48), h('div', { class: 'lbl' }, label), big, el);
        }
        if (play) el.play().catch(() => {});
      }
      controls.hidden = !toggle;
      updateVolume();
      credit.textContent = m.credit || '';
      if (m.credit === undefined) {
        m.credit = '';
        Wiki.fileInfo([m.file]).then((info) => { m.credit = creditOf(info[m.file]); if (items[at] === m) credit.textContent = m.credit; }, () => {});
      }
    }

    const onKey = (e) => {
      if (!ov.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
      else if (e.key === ' ' && toggle && !e.target.closest('button')) { e.preventDefault(); toggle(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.append(ov);
    show(start, autoplay);
  }

  return { clock, noUtm, fileName, videoSource, creditOf, articleMedia, waveform, mediaBox, wireMedia, volControl, playerParts, soundPlayer, recordingLanguage, pronButton, sameFile, mediaSlots, mediaViewer };
};
