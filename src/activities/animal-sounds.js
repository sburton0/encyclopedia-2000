// Animal Sounds: listen to animals by habitat, or play Who's Calling? (10 sounds; pick the animal from four).
// The recordings and pictures ship with the app (activities/animals/, animal-sounds-data.js; tools/make-animals.mjs),
// so it all works offline. Each is credited on screen.
(() => {
  const W = 1024;
  const H = 610;
  const KEY = 'animalSounds';
  const ROUND = 10;
  const COLORS = { Oceans: '#2a7fb8', Rainforests: '#2f9a5a', Grasslands: '#c98a2a', Forests: '#5f8a3a', Birds: '#c2533a', Farms: '#a0703a', 'Bugs and frogs': '#7a5ab8' };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // "gray wolf", "honey bee", but "Canada goose" and "Indian peafowl"
  const lower = (a) => a.name.replace(/^(?!Canada|Indian)\w/, (c) => c.toLowerCase());
  const the = (a) => `the ${lower(a)}`;
  const an = (a) => `${/^[aeiou]/i.test(a.name) ? 'an' : 'a'} ${lower(a)}`;

  const script = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
  // Where the player was, kept while the app is open: reading an animal's article and coming Back (or Forward) returns to the same
  // animal in Listen, or the same question of a round (answered or not) with the same score. Opening it any other way
  // starts fresh.
  let resume = null;
  let ready = null;
  const loadData = () => (ready ||= (window.E2KAnimalData ? Promise.resolve() : script('activities/animal-sounds-data.js')).then(() => window.E2KAnimalData));

  function hills(api) {
    const s = api.svg('svg', { class: 'as-hills', viewBox: '0 0 1000 240', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    s.innerHTML = `<path d="M0 150 C120 100 220 130 330 110 S560 60 700 105 S900 90 1000 70 V240 H0z" fill="#1d4b4a" opacity=".55"/>
      <path d="M0 190 C160 150 300 180 430 160 S700 130 820 165 S950 150 1000 140 V240 H0z" fill="#0f2f33" opacity=".8"/>
      <path d="M0 220 C200 200 380 225 560 205 S860 200 1000 195 V240 H0z" fill="#081c20"/>`;
    return s;
  }

  function mount(root, api) {
    const { h, svg } = api;
    let st = Object.assign({ best: 0, habitat: 'Oceans' }, api.store.get(KEY, {}));
    const save = () => api.store.set(KEY, st);
    let data = null;
    let keys = null;
    let gen = 0;
    let raf = 0;
    let disposed = false;

    root.classList.add('as');
    const holder = h('div', { class: 'as-holder' });
    root.append(hills(api), holder);
    const fit = () => { const c = root.querySelector('.as-canvas'); if (c) c.style.setProperty('--s', Math.min(api.maxCanvas || 9, root.clientWidth / W, root.clientHeight / H)); };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    const onKey = (e) => { if (keys && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest?.('input, textarea, select, [contenteditable]') && !document.querySelector('.overlay')) keys(e); };
    document.addEventListener('keydown', onKey);
    function show(...content) {
      const canvas = h('div', { class: 'as-canvas' }, ...content);
      holder.replaceChildren(canvas);
      fit();
      return canvas;
    }

    // ---------- the player: one <audio>, and a waveform that lights up as it plays ----------
    // The app sets every <audio>'s volume when the volume changes, so this one follows the toolbar's volume and mute.
    const audio = h('audio', { preload: 'auto', class: 'as-audio' });
    root.append(audio);
    let current = null;      // the animal loaded in the player
    let onState = () => {};  // the screen's way of showing play/pause
    let waves = [];          // waveforms showing the current animal
    const progress = () => {
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      for (const w of waves) {
        const lit = audio.ended ? 0 : Math.round(p * w.bars.length);
        w.bars.forEach((b, i) => b.classList.toggle('lit', i < lit));
        if (w.time) w.time.textContent = `${clock(audio.paused && !audio.currentTime ? 0 : audio.currentTime)} / ${clock(audio.duration || current?.seconds || 0)}`;
      }
      if (!audio.paused) raf = requestAnimationFrame(progress);
    };
    const playing = () => !audio.paused && !audio.ended;
    function play(a) {
      if (current !== a) { current = a; audio.src = `activities/animals/${a.id}.ogg`; }
      else audio.currentTime = 0;
      audio.volume = E2KAudio.level();
      api.speechStop?.();
      document.querySelectorAll('video, audio').forEach((o) => { if (o !== audio) o.pause(); });
      audio.play().catch(() => {});
      if (E2KAudio.isMuted()) api.setStatus('The sound is turned off. Turn it on with the volume button in the status bar.');
    }
    function toggle(a) { if (current === a && playing()) audio.pause(); else play(a); }
    const stop = () => { audio.pause(); cancelAnimationFrame(raf); };
    audio.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(progress); onState(); });
    audio.addEventListener('pause', () => { progress(); onState(); });
    audio.addEventListener('ended', () => { progress(); onState(); });

    function wave(a, n = a.peaks.length) {
      const s = svg('svg', { viewBox: `0 0 ${n * 6} 48`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const bars = [];
      for (let i = 0; i < n; i++) {
        const v = a.peaks[Math.floor((i / n) * a.peaks.length)] || 0;
        const ht = 4 + v * 40;
        const r = svg('rect', { x: i * 6, y: 24 - ht / 2, width: 3.4, height: ht, rx: 1.5 });
        bars.push(r);
        s.append(r);
      }
      return { el: s, bars };
    }
    const credit = (a) => h('div', { class: 'as-cr' },
      h('div', {}, `Sound: ${a.credit.artist} · ${a.credit.license}`),
      a.credit.picLicense ? h('div', {}, `Picture: ${a.credit.picArtist ? a.credit.picArtist + ' · ' : ''}${a.credit.picLicense}`) : null);
    const pic = (a, cls = 'ph') => h('div', { class: cls, style: a.pic ? `background-image:url('activities/animals/${a.id}.jpg')` : '', role: 'img', 'aria-label': a.name });

    // ---------- Listen ----------
    function listen(chosen) {
      gen++;
      keys = null;
      api.setCrumbs([]);
      api.setIdle('Animal Sounds');
      const hab = st.habitat;
      const animals = data.animals.filter((a) => a.habitat === hab);
      let sel = chosen && animals.includes(chosen) ? chosen : (current && animals.includes(current) ? current : animals[0]);
      const keep = () => { resume = { screen: 'listen', sel: sel.id }; };
      const habs = data.habitats.map((name) => {
        const n = data.animals.filter((a) => a.habitat === name).length;
        return h('button', { class: name === hab ? 'on' : '', 'aria-pressed': String(name === hab), onclick: () => { st.habitat = name; save(); stop(); listen(); } },
          h('i', { style: `background:${COLORS[name]}` }), name, h('span', {}, String(n)));
      });
      const now = h('div', { class: 'as-now' });
      const cards = animals.map((a) => {
        const pl = h('i', { class: 'pl', 'aria-hidden': 'true' }, '▶');
        const c = h('button', { class: 'as-card', 'data-id': a.id, 'aria-label': `${a.name}, ${a.kind.toLowerCase()}, ${Math.round(a.seconds)} seconds` },
          pic(a), h('b', {}, a.name), h('span', {}, `${a.kind} · ${clock(a.seconds)}`), pl);
        c.onclick = () => { if (sel === a) toggle(a); else { sel = a; keep(); nowPanel(); play(a); } };
        c.pl = pl;
        return c;
      });
      function nowPanel() {
        const w = wave(sel);
        const time = h('span', { class: 't' }, `0:00 / ${clock(sel.seconds)}`);
        const pb = h('button', { class: 'pb', onclick: () => toggle(sel), 'aria-label': `Play the ${sel.name.toLowerCase()}’s ${sel.kind.toLowerCase()}` }, '▶');
        waves = current === sel ? [{ ...w, time }] : [];
        w.pb = pb;
        now.replaceChildren(pic(sel),
          h('div', { class: 'tx' },
            h('small', { class: 'np' }, 'LISTEN'), h('h2', {}, `${sel.name} · ${sel.kind.toLowerCase()}`),
            h('div', { class: 'as-wave' }, pb, w.el, time),
            h('p', {}, sel.line, ' ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); stop(); api.openArticle(sel.article); } }, `Read about ${the(sel)} ›`)),
            credit(sel)));
        nowPanel.w = { ...w, time };
        onState();
      }
      onState = () => {
        const on = playing();
        if (current === sel) waves = [nowPanel.w];
        else waves = [];
        const np = now.querySelector('.np');
        if (np) np.textContent = current === sel && on ? 'NOW PLAYING' : 'LISTEN';
        const pb = now.querySelector('.pb');
        if (pb) { pb.textContent = current === sel && on ? '❚❚' : '▶'; pb.setAttribute('aria-label', `${current === sel && on ? 'Pause' : 'Play'} the ${sel.name.toLowerCase()}’s ${sel.kind.toLowerCase()}`); }
        cards.forEach((c) => {
          const a = animals.find((x) => x.id === c.dataset.id);
          c.classList.toggle('on', a === sel);
          c.pl.textContent = a === current && on ? '❚❚' : '▶';
        });
        progress();
      };
      show(
        h('div', { class: 'as-title' }, h('h1', {}, 'Animal Sounds'), h('p', {}, 'Hear the calls of the wild, from whales to crickets.')),
        h('div', { class: 'as-btns' },
          h('button', { class: 'bbtn', onclick: () => { stop(); resume = null; api.go('activities'); } }, '‹ Activities'),
          h('button', { class: 'bbtn hot', onclick: () => { stop(); round(); } }, 'Who’s Calling? ›')),
        h('div', { class: 'as-hab', role: 'group', 'aria-label': 'Habitats' }, habs,
          h('div', { class: 'all' }, `${data.animals.length} animals · every sound works offline`)),
        now,
        h('div', { class: 'as-grid' + (animals.length > 5 ? ' two' : ''), role: 'group', 'aria-label': hab }, cards));
      keep();
      nowPanel();
    }

    // ---------- Who's Calling? ----------
    function round() {
      const qs = shuffle([...data.animals]).slice(0, ROUND);
      question({ qs, i: 0, right: 0 });
    }
    // r: { qs (the round's animals), i, right, ch (this question's four choices, by id), picked (the answer, by id) }.
    // restored: coming Back to it, so its sound doesn't start by itself and an answer isn't scored again.
    function question(r, restored = false) {
      const my = ++gen;
      stop();
      if (current) audio.currentTime = 0;
      resume = { screen: 'round', r };
      api.setCrumbs(['Who’s Calling?'], () => { stop(); listen(); });
      const a = r.qs[r.i];
      r.ch ||= shuffle([a, ...shuffle(data.animals.filter((x) => x !== a)).slice(0, 3)]).map((x) => x.id);
      const choices = r.ch.map((id) => data.animals.find((x) => x.id === id));
      let answered = false;
      const w = wave(a, 80);
      const time = h('span', { class: 't' }, `0:00 / ${clock(a.seconds)}`);
      const pb = h('button', { class: 'pb', onclick: () => toggle(a), 'aria-label': 'Play the sound again' }, '▶');
      const head = h('h2', {}, 'Who makes this sound?');
      const score = h('div', { class: 'as-score' }, h('b', {}, String(r.right)), ` of ${r.i} right`);
      const fb = h('div', { class: 'as-fb', hidden: true });
      const cards = choices.map((c, k) => h('button', { class: 'as-card', onclick: () => answer(c) },
        h('kbd', {}, String(k + 1)), pic(c), h('b', {}, c.name), h('span', {}, c.habitat)));
      waves = [{ ...w, time }];
      onState = () => { pb.textContent = current === a && playing() ? '❚❚' : answered ? '↻' : '▶'; progress(); };
      function answer(c, again = false) {
        if (answered || my !== gen) return;
        answered = true;
        const ok = c === a;
        if (!again) {
          r.picked = c.id;
          if (ok) r.right++;
          api.sfx(ok ? 'correct' : 'wrong');
        }
        cards.forEach((el, k) => {
          el.disabled = true;
          el.classList.add(choices[k] === a ? 'right' : choices[k] === c ? 'wrong' : 'dim');
        });
        head.textContent = `It’s ${an(a)}!`;
        score.replaceChildren(h('b', {}, String(r.right)), ` of ${r.i + 1} right`);
        const last = r.i + 1 >= ROUND;
        const next = h('button', { class: 'bbtn hot', onclick: () => { stop(); if (last) finish(r); else { r.i++; r.ch = r.picked = null; question(r); } } }, last ? 'See Your Score ›' : 'Next Sound ›');
        fb.replaceChildren(h('b', { class: ok ? 'ok' : 'no' }, ok ? 'Right!' : 'Not quite.'),
          h('div', { class: 'tx' }, h('p', {}, a.line, ' ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); stop(); api.openArticle(a.article); } }, `Read about ${the(a)} ›`)), credit(a)),
          next);
        fb.hidden = false;
        if (!again) api.announce(`${ok ? 'Right!' : 'Not quite.'} It’s ${an(a)}. ${a.line}`);
        next.focus();
        keys = (e) => { if (e.key === 'Enter' && (e.target === next || !e.target.closest?.('a, button'))) { e.preventDefault(); next.click(); } };
        onState();
      }
      show(
        h('div', { class: 'as-title' }, h('h1', {}, 'Who’s Calling?'), h('p', {}, 'Listen, then pick the animal.')),
        score,
        h('div', { class: 'as-q' }, h('small', {}, `SOUND ${r.i + 1} OF ${ROUND}`), head,
          h('div', { class: 'as-big as-wave' }, pb, w.el, time)),
        h('div', { class: 'as-ch', role: 'group', 'aria-label': 'Choices' }, cards),
        fb,
        h('div', { class: 'as-btns' }, h('button', { class: 'bbtn', onclick: () => { stop(); listen(); } }, '‹ Animal Sounds')));
      keys = (e) => {
        const k = Number(e.key);
        if (k >= 1 && k <= 4) { e.preventDefault(); answer(choices[k - 1]); }
        else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); toggle(a); }
      };
      pb.focus();
      if (r.picked) answer(choices.find((c) => c.id === r.picked), true);
      // A short pause, so the sound doesn't start on top of the click that opened the question.
      else if (!restored) setTimeout(() => { if (my === gen && !disposed) play(a); }, 350);
      onState();
    }
    function finish(r) {
      gen++;
      resume = null;
      keys = null;
      waves = [];
      onState = () => {};
      const best = r.right > st.best;
      if (best) { st.best = r.right; save(); }
      api.sfx(r.right >= 7 ? 'medal' : 'correct');
      const msg = r.right === ROUND ? 'A perfect round! You know your animals.' : r.right >= 7 ? 'Great ears!' : r.right >= 4 ? 'Nicely done. Try another round?' : 'Every round gets easier. Try another?';
      const again = h('button', { class: 'bbtn hot', onclick: round }, 'Play Again');
      show(
        h('div', { class: 'as-title' }, h('h1', {}, 'Who’s Calling?')),
        h('div', { class: 'as-end' },
          h('small', {}, 'ROUND OVER'),
          h('div', { class: 'big' }, h('b', {}, String(r.right)), ` of ${ROUND}`),
          h('p', {}, msg),
          h('p', { class: 'best' }, best && r.right ? 'Your best round yet!' : `Your best round: ${st.best} of ${ROUND}`),
          h('div', { class: 'row' }, again, h('button', { class: 'bbtn', onclick: () => listen() }, '‹ Animal Sounds'))));
      api.setCrumbs(['Who’s Calling?'], () => listen());
      api.announce(`${r.right} of ${ROUND} right. ${msg}`);
      again.focus();
    }

    show(h('div', { class: 'as-loading' }, 'Loading the animals…'));
    loadData().then((d) => {
      if (disposed) return;
      data = d;
      const back = api.cameBack() ? resume : null;   // opened afresh (from Activities, say): start fresh
      if (back?.screen === 'round') question(back.r, true);
      else listen(back && data.animals.find((a) => a.id === back.sel));
    }, (e) => {
      if (!disposed) show(h('div', { class: 'as-loading' }, 'Animal Sounds couldn’t be loaded. ' + e.message));
    });
    return () => { disposed = true; gen++; stop(); audio.removeAttribute('src'); ro.disconnect(); document.removeEventListener('keydown', onKey); };
  }

  function art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 200 120', class: 'as-art', style: 'width:100%;height:100%' });
    const bars = Array.from({ length: 22 }, (_, i) => { const ht = 8 + Math.abs(Math.sin(i * 0.9) * 26 + Math.sin(i * 2.3) * 10); return `<rect x="${44 + i * 5.5}" y="${52 - ht / 2}" width="3" height="${ht}" rx="1.5" fill="${i < 12 ? '#f0a830' : 'rgba(255,255,255,.45)'}"/>`; }).join('');
    s.innerHTML = `<defs><linearGradient id="as-art-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2a3a"/><stop offset=".6" stop-color="#2e6a6a"/><stop offset="1" stop-color="#c98a4a"/></linearGradient></defs>
      <rect width="200" height="120" fill="url(#as-art-sky)"/>
      <path d="M0 88 C40 72 70 84 110 76 S170 66 200 72 V120 H0z" fill="#0f2f33"/><path d="M0 104 C60 96 120 108 200 98 V120 H0z" fill="#081c20"/>
      ${bars}<circle cx="30" cy="52" r="12" fill="#f0a830"/><path d="M26 45 L37 52 L26 59z" fill="#2a1a00"/>`;
    return s;
  }

  E2KActivities.register({
    id: 'animal-sounds',
    name: 'Animal Sounds',
    category: 'Science',
    blurb: 'Hear the calls of the wild, from whale songs to crickets, then guess who’s calling in a 10-sound round. Works offline.',
    art, mount,
  });
})();
