// Passport: flags and capitals of the world. A trip to a continent is 8 questions; 6 right earns its stamp. All six
// stamps open the World Tour (12 questions from everywhere). Countries and continents are World Explorer's
// (world/map-data.js); capitals and flag pictures ship with the app (passport-data.js, flags/; tools/make-passport.mjs),
// so it works offline.
(() => {
  const W = 1024;
  const H = 610;
  const KEY = 'passport';
  const REGIONS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  const INK = { Africa: '#b05c0c', Asia: '#b83232', Europe: '#2f5fc4', 'North America': '#1f7a50', 'South America': '#7a42c0', Oceania: '#137f8a', World: '#9a7310' };
  const TRIP = 8;
  const PASS = 6;
  const TOUR = 12;
  const TOUR_PASS = 9;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fresh = () => ({ points: 0, streak: 0, best: 0, stamps: {}, trips: {}, met: [], tour: null });
  const load = (api) => Object.assign(fresh(), api.store.get(KEY, {}));
  const stampCount = (st) => REGIONS.filter((r) => st.stamps[r]).length;
  const rank = (st) => (st.tour ? 'World Ambassador' : ['Tourist', 'Traveler', 'Traveler', 'Explorer', 'Explorer', 'Globetrotter', 'Globetrotter'][stampCount(st)]);
  const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle([...a]).slice(0, n);
  const fmt = (n) => n.toLocaleString('en-US');

  // The data is loaded the first time the game opens (the map is large).
  const script = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
  let ready = null;
  const loadData = () => (ready ||= Promise.all([
    window.E2KWorldMap ? null : script('world/map-data.js'),
    window.E2KPassportData ? null : script('games/passport-data.js'),
  ]).then(() => {
    const M = window.E2KWorldMap, D = window.E2KPassportData;
    // Sovereign states only (the data leaves territories out).
    const all = M.countries.filter((c) => D[c.id]).map((c) => ({ ...c, name: D[c.id].n || c.name, region: (c.regions || [])[0], flag: !!D[c.id].f, caps: D[c.id].cap }))
      .filter((c) => REGIONS.includes(c.region));
    return { M, all, byId: new Map(all.map((c) => [c.id, c])) };
  }));

  // ---------- questions ----------
  // whose: a flag, which country? · flagof: which of four flags is X's? · cap: X's capital? · capof: X is whose capital?
  function makeTrip(data, region, n) {
    const pool = data.all.filter((c) => region === 'World' || c.region === region);
    const kinds = shuffle(['whose', 'cap', 'flagof', 'capof', 'whose', 'cap', 'flagof', 'capof', 'whose', 'cap', 'whose', 'cap']).slice(0, n);
    const used = new Set();
    const qs = [];
    for (const kind0 of kinds) {
      let kind = kind0;
      const fits = (c) => !used.has(c.id) && ((kind === 'whose' || kind === 'flagof') ? c.flag : c.caps.length);
      let options = pool.filter(fits);
      if (!options.length) { kind = kind === 'whose' || kind === 'flagof' ? 'cap' : 'whose'; options = pool.filter(fits); }
      if (!options.length) continue;
      const c = options[Math.floor(Math.random() * options.length)];
      used.add(c.id);
      // Wrong answers come from the same continent, so the choices look alike.
      const near = data.all.filter((o) => o.id !== c.id && o.region === c.region);
      let choices;
      if (kind === 'cap') {
        const mine = new Set(c.caps.map((k) => k[0]));
        const others = pick(near.filter((o) => o.caps.length && !mine.has(o.caps[0][0])), 3).map((o) => o.caps[0]);
        choices = shuffle([c.caps[0], ...others]);
        qs.push({ kind, id: c.id, choices, answer: choices.indexOf(c.caps[0]) });
        continue;
      }
      const others = pick(near.filter((o) => (kind === 'capof' ? o.caps.length : o.flag)), 3).map((o) => o.id);
      choices = shuffle([c.id, ...others]);
      qs.push({ kind, id: c.id, choices, answer: choices.indexOf(c.id) });
    }
    return { qs, i: 0, right: 0, given: [] };
  }

  // ---------- drawing ----------
  // A continent from the map's countries; `mark` lights one country (a ring too, for the smallest).
  function continent(api, data, region, { fill, mark = null, markFill = '#fff', cls = '' } = {}) {
    const { svg } = api;
    const { M } = data;
    const view = region === 'World' ? [0, 20, 1000, 460] : M.views[region];
    const p = 6;
    const s = svg('svg', { viewBox: `${view[0] - p} ${view[1] - p} ${view[2] + 2 * p} ${view[3] + 2 * p}`, class: cls, 'aria-hidden': 'true' });
    // Every place on the map, territories included, so the continent's outline is whole.
    for (const c of M.countries) {
      if (region !== 'World' && !(c.regions || []).includes(region)) continue;
      s.append(svg('path', { d: c.d, fill: c.id === mark ? markFill : fill, ...(c.id === mark ? { stroke: '#fff', 'stroke-width': view[2] / 300 } : {}) }));
    }
    const m = mark && data.byId.get(mark);
    if (m && m.box[2] < view[2] / 40 && m.box[3] < view[3] / 40) {
      s.append(svg('circle', { cx: m.c[0], cy: m.c[1], r: view[2] / 28, fill: 'none', stroke: markFill, 'stroke-width': view[2] / 160 }));
    }
    return s;
  }
  const flagImg = (api, c, alt = '') => api.h('img', { src: `games/flags/${c.id}.png`, alt, draggable: 'false' });

  function stamp(api, data, region, date, line) {
    const { h } = api;
    return h('div', { class: 'pp-stamp', style: `--ink:${INK[region]}` },
      region === 'World' ? globe(api) : continent(api, data, region, { fill: INK[region] }),
      h('div', {}, h('b', {}, region === 'World' ? 'World Tour' : region), h('small', {}, date), h('small', {}, line)));
  }
  function globe(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2, 'aria-hidden': 'true', class: 'pp-globe' });
    s.append(svg('circle', { cx: 12, cy: 12, r: 10 }), svg('ellipse', { cx: 12, cy: 12, rx: 4.5, ry: 10 }), svg('path', { d: 'M2 12h20M4 7h16M4 17h16' }));
    return s;
  }
  const PLANE = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z';
  function plane(api, cls = '') {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' });
    s.append(svg('path', { d: PLANE, fill: 'currentColor' }));
    return s;
  }

  function mount(root, api) {
    const { h, svg } = api;
    let st = load(api);
    let data = null;
    let gen = 0;
    let keys = null;
    const save = () => api.store.set(KEY, st);
    const sfx = (k) => api.sfx(k);

    root.classList.add('pp');
    const holder = h('div', { class: 'pp-holder' });
    root.append(holder);
    const fit = () => { const c = root.querySelector('.pp-canvas'); if (c) c.style.setProperty('--s', Math.min(api.maxCanvas || 9, root.clientWidth / W, root.clientHeight / H)); };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    // Typing in the Find box (or any field) never answers.
    const onKey = (e) => { if (keys && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest?.('input, textarea, select, [contenteditable]') && !document.querySelector('.overlay')) keys(e); };
    document.addEventListener('keydown', onKey);

    function show(...content) {
      const canvas = h('div', { class: 'pp-canvas' }, ...content);
      holder.replaceChildren(canvas);
      fit();
      return canvas;
    }

    // ---------- the passport ----------
    function passport() {
      gen++;
      keys = null;
      api.setCrumbs([]);
      const n = stampCount(st);
      const slot = (r) => {
        const s = st.stamps[r];
        const trip = st.trips[r];
        const open = () => start(r);
        if (s) {
          return h('button', { class: 'pp-slot done', onclick: open, 'aria-label': `${r}: stamped ${s.date}, ${s.right} of ${TRIP} right. Play again` },
            stamp(api, data, r, s.date, `${s.right} OF ${TRIP} ✓`));
        }
        const done = trip ? trip.i : 0;
        return h('button', { class: 'pp-slot', onclick: open, 'aria-label': `${r}: ${done} of ${TRIP} questions${done ? ', continue' : ''}` },
          h('div', { class: 'ghost' }, continent(api, data, r, { fill: '#8a6d45' })),
          h('div', { class: 'lbl' }, h('div', { class: 'nm' }, r),
            h('div', { class: 'bar' }, h('i', { style: `width:${(done / TRIP) * 100}%` })),
            h('div', { class: 'pr' }, `${done} of ${TRIP} · `, h('span', { class: 'go2' }, done ? 'Continue ›' : 'Visit ›'))));
      };
      const tourOpen = n === REGIONS.length;
      const tour = st.tour
        ? h('button', { class: 'pp-tour done', onclick: () => start('World') }, stamp(api, data, 'World', st.tour.date, `${st.tour.right} OF ${TOUR} ✓`),
          h('div', {}, h('b', {}, 'World Tour complete'), 'You’ve been everywhere. Fly it again any time.'))
        : h('button', { class: 'pp-tour' + (tourOpen ? ' open' : ''), onclick: () => (tourOpen ? start('World') : api.dialog('Passport', 'The World Tour isn’t open yet',
          [`Earn all six continent stamps, and the World Tour opens: ${TOUR} questions from every continent at once.`])) },
        plane(api, 'ic'), h('div', {}, h('b', {}, 'World Tour'),
          tourOpen ? `Every stamp earned. The final journey is ready: ${TOUR} questions from everywhere. Board ›`
            : 'Earn all six stamps to unlock the final journey: every continent at once.'));
      show(
        h('div', { class: 'pp-title' }, h('h1', {}, 'Passport'), h('p', {}, 'Flags and capitals of the world. Earn a stamp for every continent.')),
        h('div', { class: 'pp-btns' },
          h('button', { class: 'bbtn', onclick: () => api.go('activities') }, '‹ Activities'),
          h('button', { class: 'bbtn', onclick: howTo }, 'How to Play'),
          h('button', { class: 'bbtn', onclick: reset }, 'New Passport')),
        h('div', { class: 'pp-book' },
          h('section', { class: 'pp-page l', 'aria-label': 'Your passport' },
            h('div', { class: 'emb' }, globe(api)),
            h('p', { class: 'rank' }, rank(st)), h('p', { class: 'rank-l' }, 'Rank'),
            h('dl', { class: 'rows' },
              h('dt', {}, 'Points'), h('dd', {}, fmt(st.points)),
              h('dt', {}, 'Stamps'), h('dd', {}, `${n} of 6`),
              h('dt', {}, 'Countries met'), h('dd', {}, `${st.met.length} of ${data.all.length}`),
              h('dt', {}, 'Best streak'), h('dd', {}, st.best === 1 ? '1 in a row' : `${st.best} in a row`)),
            h('div', { class: 'mrz', 'aria-hidden': 'true' }, `P<E2K<<${rank(st).toUpperCase().replace(/ /g, '<')}`.padEnd(44, '<'), h('br'), `FLAGS<AND<CAPITALS<<${String(st.met.length).padStart(4, '0')}`.padEnd(44, '<'))),
          h('section', { class: 'pp-page r', 'aria-label': 'Stamps' },
            h('h2', {}, 'Stamps'),
            h('div', { class: 'slots' }, REGIONS.map(slot)),
            tour)));
    }

    function howTo() {
      api.dialog('Passport', 'How to play', [
        `Choose a continent for a trip of ${TRIP} questions about its flags and capitals: whose flag is shown, which flag belongs to a country, a country’s capital, or whose capital a city is.`,
        `Get ${PASS} of the ${TRIP} right to earn the continent’s stamp. You can take a trip again to do better.`,
        'Right answers in a row build a streak worth bonus points. Press 1 to 4 to answer from the keyboard.',
        `Earn all six stamps to open the World Tour: ${TOUR} questions from every continent.`,
      ]);
    }
    function reset() {
      api.dialog('Passport', 'Start a new passport?', ['This clears your stamps, points, and countries met so you can travel again from the beginning.'],
        [['Start Over', () => { st = fresh(); save(); passport(); }], ['Cancel']]);
    }

    // ---------- a trip ----------
    function start(region) {
      if (!st.trips[region] || st.trips[region].i >= st.trips[region].qs.length) {
        st.trips[region] = makeTrip(data, region, region === 'World' ? TOUR : TRIP);
        save();
      }
      question(region);
    }

    function question(region) {
      const my = ++gen;
      const trip = st.trips[region];
      const total = trip.qs.length;
      const q = trip.qs[trip.i];
      const c = data.byId.get(q.id);
      if (!c) { trip.i++; save(); return trip.i < total ? question(region) : finish(region); }
      api.setCrumbs([region === 'World' ? 'World Tour' : region], passport);
      const name = (id) => data.byId.get(id)?.name || id;

      // The trip so far: a dot for each question, a plane at the next.
      const route = svg('svg', { viewBox: '0 0 944 30', class: 'pp-route', 'aria-hidden': 'true' });
      const step = 924 / (total - 1);
      for (let i = 0; i < total; i++) {
        const x = 10 + i * step;
        const been = i < trip.i;
        if (i < total - 1) route.append(svg('path', { d: `M${x + 8} 15h${step - 16}`, stroke: been && i < trip.i - 1 ? '#f0a830' : 'rgba(255,255,255,.32)', 'stroke-width': 2, 'stroke-dasharray': been && i < trip.i - 1 ? '' : '4 6' }));
        const ok = trip.given?.[i];
        route.append(svg('circle', { cx: x, cy: 15, r: been ? 7 : 5, fill: been ? (ok ? '#f0a830' : '#8899a6') : 'rgba(255,255,255,.28)' }));
      }
      const px = 10 + trip.i * step;
      const pl = svg('g', { transform: `translate(${px - 12} 3) rotate(90 12 12)`, fill: '#fff' });
      pl.append(svg('path', { d: PLANE }));
      route.append(pl);

      const kicker = `${region === 'World' ? 'WORLD TOUR' : region.toUpperCase()} · QUESTION ${trip.i + 1} OF ${total}`;
      const titles = { whose: 'Whose flag is this?', flagof: 'Find the flag', cap: 'Name the capital', capof: 'Whose capital?' };
      const prompts = {
        whose: 'Which country flies this flag?',
        flagof: `Which is the flag of ${c.name}?`,
        cap: `What is the capital of ${c.name}?`,
        capof: `${c.caps[0]?.[0]} is the capital of which country?`,
      };
      const score = h('b', {}, fmt(st.points));
      const streak = h('span', { class: 'streak' + (st.streak > 1 ? '' : ' none') }, `Streak ×${st.streak}`);
      const head = h('div', { class: 'pp-qhead' },
        h('div', { class: 'reg' }, region === 'World' ? globe(api) : continent(api, data, region, { fill: 'rgba(255,255,255,.85)' })),
        h('div', {}, h('small', {}, kicker), h('h1', {}, titles[q.kind])),
        h('div', { class: 'sc' }, score, ' ', h('span', {}, 'points'), streak));

      // The left card: the flag, or the country on its continent (whose capital: lit only once answered).
      const mapCard = (lit) => h('div', { class: 'mapbox' }, continent(api, data, c.region, { fill: '#b9c7b4', mark: lit ? c.id : null, markFill: INK[c.region] }));
      let card;
      if (q.kind === 'whose') card = h('div', { class: 'pp-card' }, flagImg(api, c, 'The flag to name'), h('div', { class: 'cap' }, `Flag № ${trip.i + 1}`));
      else card = h('div', { class: 'pp-card map' }, mapCard(q.kind !== 'capof'), h('div', { class: 'cap' }, q.kind === 'capof' ? c.region : `${c.name} · ${c.region}`));

      const prompt = h('p', { class: 'prompt', tabindex: -1 }, prompts[q.kind]);
      const label = (ch) => (q.kind === 'cap' ? ch[0] : name(ch));
      const buttons = q.choices.map((ch, i) => {
        if (q.kind === 'flagof') {
          const o = data.byId.get(ch);
          return h('button', { class: 'pp-flagch', onclick: () => choose(i), 'aria-label': `Flag ${i + 1}` }, h('kbd', {}, String(i + 1)), o ? flagImg(api, o) : null, h('span', { class: 'mk' }));
        }
        return h('button', { class: 'pp-ch', onclick: () => choose(i) }, h('kbd', {}, String(i + 1)), h('span', {}, label(ch)), h('span', { class: 'mk' }));
      });
      const feedback = h('div', { class: 'pp-feedback', role: 'status' });
      const ask = h('div', { class: 'pp-ask' + (q.kind === 'flagof' ? ' flags' : '') }, prompt, h('div', { class: 'chs' }, buttons), feedback);
      const canvas = show(head, h('div', { class: 'pp-routebox' }, route), card, ask,
        h('button', { class: 'bbtn pp-back', onclick: passport }, '‹ Passport'));
      prompt.focus({ preventScroll: true });
      keys = (e) => { const n = Number(e.key); if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) { e.preventDefault(); buttons[n - 1].click(); } };

      function choose(i) {
        if (my !== gen) return;
        keys = null;
        const ok = i === q.answer;
        buttons.forEach((b, j) => {
          b.disabled = true;
          // Marked by more than color: a check on the right answer, a cross on a wrong pick.
          const what = q.kind === 'flagof' ? `Flag of ${name(q.choices[j])}` : label(q.choices[j]);
          if (j === q.answer) { b.classList.add('right'); b.querySelector('.mk').textContent = '✓'; b.setAttribute('aria-label', `${what}, correct answer`); }
          else if (j === i) { b.classList.add('wrong'); b.querySelector('.mk').textContent = '✗'; b.setAttribute('aria-label', `${what}, your answer, wrong`); }
          else { b.classList.add('dim'); if (q.kind === 'flagof') b.setAttribute('aria-label', what); }
          if (q.kind === 'flagof') b.append(h('span', { class: 'fn' }, name(q.choices[j])));
        });
        trip.given = trip.given || [];
        trip.given[trip.i] = ok;
        let pts = 0;
        if (ok) {
          st.streak++;
          pts = Math.min(200, 100 + 25 * (st.streak - 1));
          st.points += pts;
          st.best = Math.max(st.best, st.streak);
          trip.right++;
          if (!st.met.includes(c.id)) st.met.push(c.id);
          sfx('correct');
        } else {
          st.streak = 0;
          sfx('wrong');
        }
        trip.i++;
        save();
        score.textContent = fmt(st.points);
        streak.textContent = `Streak ×${st.streak}`;
        streak.classList.toggle('none', st.streak < 2);
        if (q.kind === 'capof') card.querySelector('.mapbox').replaceWith(mapCard(true));
        // One line about the answer, and its article.
        const cap = c.caps[0];
        const right = q.kind === 'cap' ? q.choices[q.answer][0] : name(q.choices[q.answer]);
        const line = q.kind === 'whose' || q.kind === 'flagof'
          ? (cap ? `That’s the flag of ${c.name}, whose capital is ${cap[0]}.` : `That’s the flag of ${c.name}.`)
          : `${cap[0]} is the capital of ${c.name}.`;
        const learn = q.kind === 'cap' || q.kind === 'capof' ? [cap[0], cap[1]] : [c.name, c.title];
        const last = trip.i >= total;
        const next = h('button', { class: 'go', onclick: () => (last ? finish(region) : question(region)) }, last ? 'Finish the Trip ›' : 'Next Question ›');
        feedback.append(
          h('b', { class: ok ? 'ok' : 'no' }, ok ? (st.streak > 1 ? `Right! +${pts} (streak ×${st.streak})` : `Right! +${pts}`) : `Not quite. The answer is ${right}.`),
          h('p', {}, line, ' ', h('button', { class: 'pp-lnk', onclick: () => api.openArticle(learn[1]) }, `Read about ${learn[0]} ›`)),
          next);
        api.announce(`${feedback.firstChild.textContent} ${line}`);
        next.focus({ preventScroll: true });
        keys = (e) => { if (e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); next.click(); } };
        void canvas;
      }
    }

    function finish(region) {
      gen++;
      keys = null;
      const trip = st.trips[region];
      const total = trip.qs.length;
      const pass = region === 'World' ? TOUR_PASS : PASS;
      const got = trip.right >= pass;
      const old = region === 'World' ? st.tour : st.stamps[region];
      delete st.trips[region];
      if (got && (!old || trip.right > old.right)) {
        const rec = { date: today(), right: trip.right };
        if (region === 'World') st.tour = rec; else st.stamps[region] = rec;
      }
      save();
      passport();
      const canvas = holder.querySelector('.pp-canvas');
      const close = () => passport();
      const n = stampCount(st);
      let body;
      if (got) {
        const first = !old;
        if (region === 'World') { try { E2KAudio.jingle({ volume: 0.5 }); } catch {} } else sfx('medal');
        body = [
          h('div', { class: 'big' }, stamp(api, data, region, (region === 'World' ? st.tour : st.stamps[region]).date, `${Math.max(trip.right, old?.right || 0)} OF ${total} ✓`)),
          h('small', { style: `color:${INK[region]}` }, region === 'World' ? 'WORLD TOUR' : `${region.toUpperCase()} STAMP`),
          h('h2', {}, region === 'World' ? 'World Ambassador!' : first ? 'Stamped!' : old && trip.right > old.right ? 'A better stamp!' : 'Stamped again'),
          h('p', { class: 'pts' }, `${trip.right} of ${total} right`),
          h('p', {}, region === 'World' ? `You’ve flown the whole world: ${fmt(st.points)} points and ${st.met.length} countries met. Your best streak was ${st.best} in a row.`
            : n === REGIONS.length ? 'All six stamps! The World Tour is open: twelve questions from every continent.'
              : `You know ${region}’s flags and capitals. ${n} of 6 stamps: ${6 - n === 1 ? 'one more' : `${['', '', 'two', 'three', 'four', 'five'][6 - n]} more`} to open the World Tour.`),
        ];
      } else {
        body = [
          h('div', { class: 'big none' }, plane(api, 'pl')),
          h('small', {}, region === 'World' ? 'WORLD TOUR' : region.toUpperCase()),
          h('h2', {}, 'Trip over'),
          h('p', { class: 'pts' }, `${trip.right} of ${total} right`),
          h('p', {}, `${old ? 'Your stamp stays as it was. ' : ''}${pass} right ${old ? 'would have improved it' : `earns the ${region === 'World' ? 'World Tour' : 'stamp'}`}. Every trip asks different questions.`),
        ];
      }
      const again = h('button', { class: 's', onclick: () => start(region) }, 'Fly Again');
      const back = h('button', { class: 'p', onclick: close }, 'Back to the Passport');
      const box = h('div', { class: 'pp-award', role: 'dialog', 'aria-modal': 'true', 'aria-label': got ? 'Stamp earned' : 'Trip over' }, ...body,
        h('div', { class: 'ab' }, back, again,
          region !== 'World' ? h('button', { class: 's', onclick: () => api.openArticle(region) }, `Read about ${region}`) : null));
      canvas.append(h('div', { class: 'pp-scrim', onclick: close }), box);
      back.focus();
      keys = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    }

    show(h('div', { class: 'pp-loading' }, 'Unpacking your passport…'));
    loadData().then((d) => {
      data = d;
      if (!root.isConnected) return;
      // The world, faintly, behind everything.
      const world = svg('svg', { class: 'pp-world', viewBox: '0 0 1000 500', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
      for (const c of d.M.countries) world.append(svg('path', { d: c.d }));
      root.prepend(world);
      passport();
    })
      .catch(() => show(h('div', { class: 'pp-loading' }, 'Passport couldn’t load its map. Try opening it again.')));

    return () => {
      gen++;
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
    };
  }

  // The card in Activities: a passport page with two stamps.
  function art(api) {
    const { h } = api;
    return h('div', { class: 'pp-art', 'aria-hidden': 'true' },
      h('div', { class: 'pg' },
        h('i', { class: 'st', style: '--ink:#2f5fc4;--rot:-8deg;left:16%;top:18%' }, 'EUROPE'),
        h('i', { class: 'st', style: '--ink:#7a42c0;--rot:6deg;left:46%;top:48%' }, 'SOUTH AMERICA'),
        h('i', { class: 'st round', style: '--ink:#b05c0c;--rot:-14deg;left:60%;top:10%' }, 'AFRICA')));
  }
  function progress(api) {
    const st = load(api);
    if (st.tour) return `World Ambassador · ${fmt(st.points)} points`;
    const n = stampCount(st);
    return n ? `${n} of 6 stamps · ${fmt(st.points)} points` : (st.points ? `${fmt(st.points)} points` : 'New game');
  }

  E2KGames.register({
    id: 'passport',
    name: 'Passport',
    blurb: 'Flags and capitals of the world. Take a trip to each continent, earn its stamp, and open the World Tour. Works offline.',
    art, progress, mount,
  });
})();
