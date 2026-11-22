// History: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['history'] = (A) => {
  'use strict';
  const { $, $$, h, icon, store } = A;
  const { setIdle, drawFavPane, refreshMyPage, updateToolbar } = A.fn;

  // Every article read, newest first: { t: title, at: time }, once a day per article (reading it again the same day
  // moves it to the top). Recently viewed is its newest twelve. The list from before history (0.5's twelve recent
  // titles) carries over with no times, under Earlier. History can be paused (Options on the History page).
  const HISTORY_MAX = 5000;
  function history() {
    let list = store.get('history', null);
    if (!list) { list = store.get('recent', []).map((t) => ({ t, at: 0 })); store.set('history', list); }
    return list;
  }
  const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function recentTitles(n = 12) {
    const seen = new Set(), out = [];
    for (const e of history()) { const k = e.t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e.t); if (out.length >= n) break; } }
    return out;
  }
  // What's known of an article for lists: its short description and picture, kept from when it was last open (or
  // looked up when a list needs it).
  const INFO_MAX = 3000;
  const infoOf = (t) => store.get('articleInfo', {})[t.toLowerCase()] || null;
  function keepInfo(t, desc, thumb) {
    const all = store.get('articleInfo', {});
    const k = t.toLowerCase();
    if (all[k] && all[k].desc === desc && all[k].thumb === thumb) return;
    delete all[k];
    all[k] = { desc: desc || '', thumb: thumb || '' };
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - INFO_MAX))) delete all[old];
    store.set('articleInfo', all);
  }
  function addRecent(title) {
    if (A.current) keepInfo(title, A.current.desc, A.current.thumb);
    if (store.get('historyPaused', false)) return;
    const now = Date.now(), today = dayStart(now);
    const list = history().filter((e) => !(A.sameTitle(e.t, title) && e.at >= today));
    list.unshift({ t: title, at: now });
    store.set('history', list.slice(0, HISTORY_MAX));
  }
  function removeHistory(title) {
    store.set('history', history().filter((e) => !A.sameTitle(e.t, title)));
    historyChanged();
  }
  // Clear History: the last hour, today, or everything (Recently viewed too: they're the same list).
  function clearHistoryDialog() {
    let pick = 'hour';
    const opt = (v, label) => h('label', { class: 'cradio' }, h('input', { type: 'radio', name: 'clearh', value: v, checked: v === pick, onchange: () => { pick = v; } }), label);
    A.dialog('Clear History', 'Clear your history?', [
      h('div', { class: 'cradios', role: 'radiogroup', 'aria-label': 'What to clear' }, opt('hour', 'The last hour'), opt('today', 'Today'), opt('all', 'Everything')),
      'Recently viewed in My Articles is cleared too. Favorites and downloaded articles stay as they are.',
    ], [['Clear History', () => {
      const since = pick === 'all' ? -Infinity : pick === 'today' ? dayStart(Date.now()) : Date.now() - 3600e3;
      store.set('history', pick === 'all' ? [] : history().filter((e) => e.at < since));
      historyChanged();
      setIdle(pick === 'all' ? 'Cleared your history' : pick === 'today' ? 'Cleared today’s history' : 'Cleared the last hour of history');
    }, true], ['Cancel']], { cls: 'clearh' });
  }
  function historyChanged() { drawFavPane(); refreshMyPage(); }

  // Read Aloud: when the article has a volunteer's recorded narration, ask which to use; otherwise use the computer voice.
  function toggleSpeak() {
    if (A.speaking) return speechStop();
    if (A.current?.spoken?.length) return readAloudMenu();
    speakComputer();
  }
  function readAloudMenu() {
    if ($('.rmenu')) { $('.rmenu').remove(); return; }
    const parts = A.current.spoken;
    const length = parts.reduce((a, p) => a + p.duration, 0);
    const hrs = Math.floor(length / 3600), mins = Math.round((length % 3600) / 60);
    const long = hrs ? `${hrs} hr ${mins} min` : `${Math.max(1, mins)} min`;
    const when = parts[0].when ? ` in ${parts[0].when}` : '';
    const item = (ic, title, sub, fn) => h('button', { class: 'ri', onclick: () => { menu.remove(); fn(); } },
      h('span', { class: 'rio' }, icon(ic)), h('span', {}, h('b', {}, title), h('span', { class: 's' }, sub)));
    const menu = h('div', { class: 'rmenu', role: 'menu' },
      item('read', 'Computer voice', 'Reads the article as it is today, using your computer’s voice.', speakComputer),
      item('mic', 'Recorded narration', `Read by a Wikipedia volunteer${when} · ${long}. The article may have changed since.`, () => playNarration(parts)));
    const anchor = A.current.speakBtn;
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 310)) + 'px';
    document.body.append(menu);
    const away = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', away, true); } };
    document.addEventListener('mousedown', away, true);
    menu.querySelector('.ri').focus();
  }

  // The narration plays in a bar at the top of the article, across all of its parts as if they were one recording.
  let narration = null;
  function playNarration(parts) {
    speechStop();
    if (!A.current?.content?.isConnected) return;
    if (E2KAudio.isMuted()) setIdle('Sound is muted. Turn up the volume to hear the narration.');
    const total = parts.reduce((a, p) => a + p.duration, 0);
    const offset = (i) => parts.slice(0, i).reduce((a, p) => a + p.duration, 0);
    const au = h('audio', { preload: 'auto' });
    let at = 0;
    const { pb, bar, fill, cur, tot } = A.playerParts();
    const partLbl = h('span');
    const reader = [parts[0].reader, parts[0].when].filter(Boolean).join(' · ') || 'Read by a Wikipedia volunteer';
    const el = h('div', { class: 'nbar' }, pb,
      h('div', { class: 'who' }, h('b', {}, 'Recorded narration', partLbl), h('span', {}, reader)),
      cur, bar, tot, h('button', { class: 'x', title: 'Stop the narration', onclick: () => speechStop() }, '✕'), au);
    const load = (i, t = 0, play = true) => {
      at = i;
      au.src = parts[i].src;
      partLbl.textContent = parts.length > 1 ? ` · part ${i + 1} of ${parts.length}` : '';
      if (t) au.addEventListener('loadedmetadata', () => { au.currentTime = t; }, { once: true });
      au.volume = E2KAudio.level();
      if (play) au.play().catch(() => setIdle('The narration can’t be played right now.'));
    };
    const tick = () => {
      const now = offset(at) + au.currentTime;
      cur.textContent = A.clock(now);
      fill.style.width = total ? (100 * now / total) + '%' : '0';
    };
    const state = () => {
      const playing = !au.paused && !au.ended;
      pb.querySelector('use').setAttribute('href', '#i-' + (playing ? 'pause' : 'play'));
      pb.title = playing ? 'Pause' : 'Play';
    };
    const seek = (e) => {
      const r = bar.getBoundingClientRect();
      const target = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)) * total;
      let i = 0;
      while (i < parts.length - 1 && target >= offset(i + 1)) i++;
      if (i === at) au.currentTime = target - offset(i); else load(i, target - offset(i), !au.paused);
      tick();
    };
    pb.addEventListener('click', () => { if (au.paused) au.play().catch(() => {}); else au.pause(); });
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seek(e); });
    bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) seek(e); });
    au.addEventListener('timeupdate', tick);
    au.addEventListener('play', () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      $$('video, audio').forEach((o) => { if (o !== au) o.pause(); });
      state();
    });
    au.addEventListener('pause', state);
    au.addEventListener('ended', () => { if (at < parts.length - 1) load(at + 1); else speechStop(); });
    tot.textContent = A.clock(total);
    A.current.content.before(el);
    narration = { au, el };
    A.speaking = true;
    load(0);
    tick();
    state();
    setIdle('Playing the recorded narration. Press Stop Reading or ✕ to stop.');
    updateToolbar();
  }

  function speakComputer() {
    const text = $('.page .text');
    if (!A.current || !text || !('speechSynthesis' in window)) return;
    if (E2KAudio.isMuted()) { setIdle('Sound is muted. Turn up the volume to hear Read Aloud.'); return; }
    // Many Linux systems come without a text-to-speech voice, and speaking then does nothing at all.
    if (window.e2k.platform === 'linux' && !speechSynthesis.getVoices().length) {
      A.dialog('Read Aloud', 'No voices are installed', [
        'Read Aloud uses your computer’s text-to-speech voices, and none were found.',
        'On Ubuntu and Debian, install them with “sudo apt install speech-dispatcher espeak-ng”, then restart Encyclopedia 2000.']);
      return;
    }
    const parts = [A.current.title + '.']
      .concat($$('p, h2, h3, li', text).filter((el) => !el.closest('table, figure, .attrib')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
      .filter(Boolean).slice(0, 150);
    speechSynthesis.cancel();
    A.speaking = true;
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.volume = Math.sqrt(E2KAudio.level()); // speech volume is already perceptual, so use the slider position
      u.rate = store.get('rate', 1);
      const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === store.get('voice', ''));
      if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = () => { A.speaking = false; updateToolbar(); };
      speechSynthesis.speak(u);
    });
    setIdle('Reading aloud. Press the Read Aloud button again to stop.');
    updateToolbar();
  }
  function speechStop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (narration) { narration.au.pause(); narration.el.remove(); narration = null; }
    $$('.rmenu').forEach((m) => m.remove());
    if (A.speaking) { A.speaking = false; setIdle(); }
    updateToolbar();
  }

  return { history, dayStart, recentTitles, infoOf, keepInfo, addRecent, removeHistory, clearHistoryDialog, historyChanged, toggleSpeak, speechStop };
};
