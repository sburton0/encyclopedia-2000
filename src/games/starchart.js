// Star Chart: light the stars of six topic constellations by answering questions, then face the Pole Star.
(() => {
  const W = 1024;
  const H = 610;
  const ORDER = ['history', 'science', 'geography', 'nature', 'arts', 'people'];
  const RING = { history: [512, 122], science: [798, 218], geography: [798, 408], nature: [512, 500], arts: [226, 408], people: [226, 218] };
  const NAMES = { history: 'The Hourglass', science: 'The Flask', geography: 'The Compass', nature: 'The Leaf', arts: 'The Lyre', people: 'The Crown', pole: 'The Pole Star' };
  const TOPIC = { history: 'History', science: 'Science', geography: 'Geography', nature: 'Nature', arts: 'Arts', people: 'People', pole: 'Final challenge' };
  const COLORS = { history: '#f5a623', science: '#6fd3ff', geography: '#45d1c5', nature: '#8ee06a', arts: '#ff7eb6', people: '#b693ff', pole: '#fff4c8' };
  const pent = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    return [0.5 + 0.48 * Math.cos(a), 0.52 + 0.48 * Math.sin(a)];
  });
  // Star positions (0..1 within the constellation's box), in the order they light, plus the lines between them.
  const SHAPES = {
    history: { stars: [[0.25, 0.08], [0.75, 0.08], [0.5, 0.5], [0.25, 0.92], [0.75, 0.92]], edges: [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4]] },
    science: { stars: [[0.4, 0.05], [0.6, 0.05], [0.4, 0.38], [0.6, 0.38], [0.12, 0.92], [0.88, 0.92]], edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]] },
    geography: { stars: [[0.5, 0.02], [0.95, 0.5], [0.5, 0.98], [0.05, 0.5], [0.5, 0.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] },
    nature: { stars: [[0.5, 0.02], [0.84, 0.36], [0.68, 0.76], [0.5, 0.98], [0.32, 0.76], [0.16, 0.36], [0.5, 0.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]] },
    arts: { stars: [[0.15, 0.08], [0.08, 0.55], [0.33, 0.92], [0.67, 0.92], [0.92, 0.55], [0.85, 0.08]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
    people: { stars: [[0.08, 0.92], [0.08, 0.3], [0.3, 0.62], [0.5, 0.08], [0.7, 0.62], [0.92, 0.3], [0.92, 0.92]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] },
    pole: { stars: [pent[0], pent[2], pent[4], pent[1], pent[3]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  };
  const ICONS = {
    history: 'M6 2h12v2c0 3-2.5 5-4.5 6 2 1 4.5 3 4.5 6v2h1v2H5v-2h1v-2c0-3 2.5-5 4.5-6C8.5 9 6 7 6 4z',
    science: 'M9 2h6v2h-1v5l5.2 9.2A2 2 0 0 1 17.5 21h-11a2 2 0 0 1-1.7-2.8L10 9V4H9z',
    geography: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6zM16.5 7.5l-3 6-6 3 3-6z',
    nature: 'M20 3C10 3 4 8 4 15c0 2 .6 3.6 1.5 5L4 21.5 5.5 23l1.6-1.6c1.3.8 2.9 1.1 4.4 1.1C18 22.5 21 15 20 3zM7.5 19.5c2-4 5-7 9-9-3 2.5-5.5 5.5-7.5 9.5z',
    arts: 'M7 3C5 6 5 11 8 14v4H6v2h12v-2h-2v-4c3-3 3-8 1-11l-1.5 1c1.5 2.5 1.2 6-1.5 8.5V6h-4v6.5C7.3 10 7 6.5 8.5 4z',
    people: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
    pole: 'M12 1l2.5 8.5L23 12l-8.5 2.5L12 23l-2.5-8.5L1 12l8.5-2.5z',
  };
  // Every star in the sky, the Pole Star's five included (36 in the constellations + 5 = 41).
  const TOTAL = ORDER.reduce((n, id) => n + SHAPES[id].stars.length, 0) + SHAPES.pole.stars.length;
  const KEY = 'starchart';
  const fresh = () => ({ lit: {}, score: 0, streak: 0, best: 0, pole: 0, done: false });
  const load = (api) => Object.assign(fresh(), api.store.get(KEY, {}));
  const starsLit = (st) => ORDER.reduce((n, id) => n + Math.min(st.lit[id] || 0, SHAPES[id].stars.length), 0) + Math.min(st.pole || 0, SHAPES.pole.stars.length);
  const complete = (st, id) => (id === 'pole' ? st.pole : st.lit[id] || 0) >= SHAPES[id].stars.length;
  const rank = (st) => (st.done ? 'Master Astronomer' : ['Stargazer', 'Navigator', 'Cartographer', 'Astronomer'][Math.min(3, Math.floor(starsLit(st) / 9))]);

  function drawConst(svg, id, lit, x, y, w, h, o = {}) {
    const sh = SHAPES[id];
    const col = COLORS[id];
    const g = svg('g');
    const P = sh.stars.map(([u, v]) => [x + u * w, y + v * h]);
    sh.edges.forEach(([a, b]) => {
      const d = `M${P[a][0]} ${P[a][1]} L${P[b][0]} ${P[b][1]}`;
      if (a < lit && b < lit) {
        const isNew = o.justLit !== undefined && (a === o.justLit || b === o.justLit);
        g.append(svg('path', { d, stroke: col, 'stroke-width': o.big ? 2.2 : 1.4, 'stroke-opacity': 0.9, pathLength: 1, class: isNew ? 'sc-draw' : '', filter: 'url(#sc-glow)' }));
      } else {
        g.append(svg('path', { d, stroke: '#9fb4e6', 'stroke-opacity': 0.22, 'stroke-width': 1, 'stroke-dasharray': '3 5' }));
      }
    });
    P.forEach(([px, py], i) => {
      if (i < lit) {
        const pop = i === o.justLit ? 'sc-pop' : '';
        g.append(svg('circle', { cx: px, cy: py, r: o.big ? 15 : 7, fill: col, opacity: 0.3, filter: 'url(#sc-blur)', class: pop }));
        g.append(svg('circle', { cx: px, cy: py, r: o.big ? 5.5 : 3.4, fill: '#fff', class: pop }));
      } else {
        g.append(svg('circle', { cx: px, cy: py, r: o.big ? 3.5 : 2.3, fill: '#b9c8ee', opacity: 0.6 }));
        if (o.next && i === lit) g.append(svg('circle', { cx: px, cy: py, r: o.big ? 13 : 7, fill: 'none', stroke: col, 'stroke-width': 1.6, class: 'sc-next' }));
      }
    });
    return g;
  }

  function defs(svg) {
    return svg('svg', { width: 0, height: 0, style: 'position:absolute' }, svg('defs', {},
      // userSpaceOnUse: a percentage region would collapse to nothing for perfectly horizontal or vertical lines.
      svg('filter', { id: 'sc-glow', filterUnits: 'userSpaceOnUse', x: -100, y: -100, width: 1224, height: 810 },
        svg('feGaussianBlur', { stdDeviation: 2.2, result: 'b' }), svg('feMerge', {}, svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' }))),
      svg('filter', { id: 'sc-blur', x: '-80%', y: '-80%', width: '260%', height: '260%' }, svg('feGaussianBlur', { stdDeviation: 4 })),
      svg('pattern', { id: 'sc-dust', width: 71, height: 53, patternUnits: 'userSpaceOnUse' },
        svg('circle', { cx: 6, cy: 9, r: 0.8, fill: '#fff', opacity: 0.55 }), svg('circle', { cx: 41, cy: 33, r: 0.6, fill: '#fff', opacity: 0.4 }),
        svg('circle', { cx: 60, cy: 6, r: 1, fill: '#cfe0ff', opacity: 0.45 }), svg('circle', { cx: 24, cy: 47, r: 0.7, fill: '#fff', opacity: 0.3 })),
      ...Object.entries(ICONS).map(([id, d]) => svg('symbol', { id: 'sc-i-' + id, viewBox: '0 0 24 24' }, svg('path', { d, 'fill-rule': 'evenodd' })))));
  }

  function mount(root, api) {
    const { h, svg } = api;
    let st = load(api);
    let gen = 0;
    let disposed = false;
    let prefetch = null;
    const save = () => api.store.set(KEY, st);
    const sfx = (k) => api.sfx(k);

    root.classList.add('sc');
    root.append(defs(svg));
    const holder = h('div', { class: 'sc-holder' });
    root.append(holder);
    const fit = () => { const c = root.querySelector('.sc-canvas'); if (c) c.style.setProperty('--s', Math.min(api.maxCanvas || 9, root.clientWidth / W, root.clientHeight / H)); };
    const ro = new ResizeObserver(fit);
    ro.observe(root);

    function sky(nebulaX, nebulaY, scale, opacity) {
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}` });
      const neb = svg('g', { transform: `translate(${nebulaX} ${nebulaY})`, filter: 'url(#soft)', opacity });
      makeBloom(neb, scale);
      s.append(neb, svg('circle', { cx: nebulaX, cy: nebulaY, r: 160 * scale, fill: 'url(#core)', filter: 'url(#softer)', opacity: opacity * 1.6 }),
        svg('rect', { width: W, height: H, fill: 'url(#sc-dust)' }));
      return s;
    }
    function show(canvas) {
      holder.replaceChildren(canvas);
      fit();
    }

    // ---------- the whole sky ----------
    function overview() {
      gen++;
      api.setCrumbs([]);
      const s = sky(512, 315, 0.95, 0.17);
      s.append(svg('ellipse', { cx: 512, cy: 315, rx: 286, ry: 193, fill: 'none', stroke: '#9fb4e6', 'stroke-opacity': 0.16, 'stroke-dasharray': '2 6' }));

      ORDER.forEach((id) => {
        const [cx, cy] = RING[id];
        const n = Math.min(st.lit[id] || 0, SHAPES[id].stars.length);
        const done = complete(st, id);
        const g = svg('g', { class: 'sc-const' });
        g.append(svg('rect', { x: cx - 100, y: cy - 64, width: 200, height: 160, rx: 12, class: 'sc-hit' }));
        g.append(svg('ellipse', { cx, cy: cy - 4, rx: 82, ry: 62, fill: COLORS[id], class: 'sc-halo' + (done ? ' done' : ''), filter: 'url(#softer)' }));
        g.append(drawConst(svg, id, n, cx - 55, cy - 50, 110, 90, { next: !done }));
        g.append(svg('text', { x: cx, y: cy + 62, class: 'sc-lbl' }, NAMES[id]));
        g.append(svg('text', { x: cx, y: cy + 77, class: 'sc-topic', fill: COLORS[id] }, TOPIC[id].toUpperCase()));
        g.append(svg('text', { x: cx, y: cy + 92, class: 'sc-prog' }, done ? '✓ Charted' : `${n} of ${SHAPES[id].stars.length} stars`));
        g.addEventListener('click', () => constellation(id));
        s.append(g);
      });

      const unlocked = ORDER.every((id) => complete(st, id));
      const pole = svg('g', { class: 'sc-pole' + (unlocked ? ' open' : '') + (st.done ? ' done' : '') });
      pole.append(svg('circle', { cx: 512, cy: 300, r: 60, fill: 'url(#core)', filter: 'url(#softer)', class: 'sc-pole-glow' }),
        svg('use', { href: '#sc-i-pole', x: 482, y: 270, width: 60, height: 60, fill: '#fff', class: 'sc-pole-star' }),
        svg('text', { x: 512, y: 358, class: 'sc-lbl' }, 'The Pole Star'),
        svg('text', { x: 512, y: 374, class: 'sc-prog' }, st.done ? '✓ Charted' : unlocked ? 'The final challenge awaits' : 'Chart all six constellations to unlock'));
      pole.addEventListener('click', () => {
        if (unlocked) constellation('pole');
        else api.dialog('Star Chart', 'The Pole Star is still hidden', ['Chart all six constellations around it, and the Pole Star will open for a final challenge.']);
      });
      s.append(pole);

      const canvas = h('div', { class: 'sc-canvas' }, s,
        h('div', { class: 'sc-title' }, h('h1', {}, 'Star Chart'),
          h('p', {}, 'Answer questions to light each star. Chart all six constellations to reach the Pole Star.')),
        hud());
      show(canvas);
    }

    function hud() {
      const medals = h('div', { class: 'sc-medals' }, ORDER.map((id) => h('i', {
        title: `${TOPIC[id]}: ${complete(st, id) ? 'medallion earned' : 'not yet charted'}`,
        style: complete(st, id) ? `background:${COLORS[id]};box-shadow:0 0 8px ${COLORS[id]}` : '',
      })));
      return h('div', { class: 'sc-hud' },
        h('div', { class: 'sc-rank' }, rank(st)),
        h('div', { class: 'sc-score' }, String(st.score), h('span', {}, ' points')),
        h('div', { class: 'sc-count' }, `${starsLit(st)} of ${TOTAL} stars charted`),
        medals,
        h('div', { class: 'sc-btns' },
          h('button', { class: 'bbtn', onclick: () => api.go('games') }, '‹ All Games'),
          h('button', { class: 'bbtn', onclick: howTo }, 'How to Play'),
          h('button', { class: 'bbtn', onclick: resetChart }, 'New Chart')));
    }

    function howTo() {
      api.dialog('Star Chart', 'How to play', [
        'Choose a constellation. Each one covers a topic: History, Science, Geography, Nature, Arts, or People.',
        'Answer a question correctly to light the next star. A wrong answer leaves the star dark, and you get a new question to try.',
        'Correct answers in a row build a streak worth bonus points. Light every star in a constellation to earn its medallion.',
        'Earn all six medallions to unlock the Pole Star at the center for the final challenge.',
      ]);
    }
    function resetChart() {
      api.dialog('Star Chart', 'Start a new chart?', ['This clears your stars, medallions, and score so you can play again from the beginning.'],
        [['Start Over', () => { st = fresh(); save(); overview(); }], ['Cancel']]);
    }

    // ---------- one constellation, with the question panel ----------
    function constellation(id) {
      const my = ++gen;
      api.setCrumbs([NAMES[id]], overview);
      const total = SHAPES[id].stars.length;
      const litOf = () => (id === 'pole' ? st.pole : st.lit[id] || 0);
      const s = sky(290, 330, 0.75, 0.15);
      let drawing = drawConst(svg, id, litOf(), 70, 120, 440, 420, { big: true, next: true });
      s.append(drawing);

      const progress = h('div', { class: 'sc-cprog' });
      const updateProgress = () => { progress.textContent = complete(st, id) ? 'Every star is lit' : `${litOf()} of ${total} stars lit · streak ${st.streak}`; };
      updateProgress();
      const panel = h('div', { class: 'sc-panel' });
      const canvas = h('div', { class: 'sc-canvas' }, s,
        h('div', { class: 'sc-chead' },
          h('button', { class: 'bbtn', onclick: () => overview() }, '‹ Star Chart'),
          h('small', { style: `color:${COLORS[id]}` }, TOPIC[id].toUpperCase()), h('h1', {}, NAMES[id]), progress),
        h('div', { class: 'sc-mini' }, h('b', {}, String(st.score)), ' points'),
        panel);
      show(canvas);

      if (complete(st, id)) {
        panel.replaceChildren(h('div', { class: 'sc-q-kicker' }, 'CHARTED'), h('div', { class: 'sc-q-prompt' }, `You’ve lit every star in ${NAMES[id]}.`),
          h('p', { class: 'sc-fact' }, 'Choose another constellation to keep exploring the sky.'),
          h('div', { class: 'sc-actions' }, h('button', { class: 'go', onclick: () => overview() }, 'Back to the Star Chart')));
        return;
      }

      const topicArg = id === 'pole' ? 'any' : id;
      const fetchQ = () => E2KTrivia.make(topicArg).catch(() => null);

      async function next() {
        panel.replaceChildren(h('div', { class: 'sc-loading' }, 'Consulting the stars…'));
        let q = prefetch && prefetch.id === id ? await prefetch.p : null;
        prefetch = null;
        if (!q) q = await fetchQ();
        if (disposed || my !== gen) return;
        if (!q) {
          panel.replaceChildren(h('div', { class: 'sc-q-kicker' }, 'CLOUDY SKIES'),
            h('div', { class: 'sc-q-prompt' }, 'The question couldn’t be loaded.'),
            h('p', { class: 'sc-fact' }, 'Star Chart draws its questions from Wikipedia, so it needs an internet connection.'),
            h('div', { class: 'sc-actions' }, h('button', { class: 'go', onclick: next }, 'Try Again')));
          return;
        }
        prefetch = { id, p: fetchQ() };
        ask(q);
      }

      function ask(q) {
        let answered = false;
        const buttons = q.choices.map((c, i) => h('button', { class: 'sc-choice', onclick: () => choose(i) }, h('i', {}, 'ABCD'[i]), h('span', {}, c)));
        const feedback = h('div', { class: 'sc-feedback' });
        panel.replaceChildren(...[
          h('div', { class: 'sc-q-kicker' }, q.kicker.toUpperCase()),
          h('div', { class: 'sc-q-prompt' }, q.prompt),
          q.image ? h('div', { class: 'sc-q-img', style: `background-image:url("${q.image}")` }) : null,
          q.detail ? h('div', { class: 'sc-q-detail' }, E2KTrivia.passage(q.detail, h)) : null,
          h('div', { class: 'sc-choices' }, buttons),
          feedback,
        ].filter(Boolean));

        function choose(i) {
          if (answered) return;
          answered = true;
          const ok = i === q.answer;
          buttons.forEach((b, j) => {
            b.disabled = true;
            if (j === q.answer) b.classList.add('right');
            else if (j === i) b.classList.add('wrong');
            else b.classList.add('dim');
          });
          let finished = false;
          if (ok) {
            st.streak++;
            const pts = Math.min(200, 100 + 25 * (st.streak - 1));
            st.score += pts;
            st.best = Math.max(st.best, st.streak);
            const n = litOf();
            if (id === 'pole') st.pole = n + 1; else st.lit[id] = n + 1;
            finished = complete(st, id);
            if (id === 'pole' && finished) st.done = true;
            const redrawn = drawConst(svg, id, n + 1, 70, 120, 440, 420, { big: true, next: true, justLit: n });
            drawing.replaceWith(redrawn);
            drawing = redrawn;
            sfx(finished ? 'medal' : 'correct');
            feedback.append(h('b', { class: 'ok' }, st.streak > 1 ? `Correct! +${pts} (streak ×${st.streak})` : `Correct! +${pts}`));
          } else {
            st.streak = 0;
            sfx('wrong');
            feedback.append(h('b', { class: 'no' }, `Not quite. The answer is “${q.choices[q.answer]}.”`));
          }
          save();
          updateProgress();
          canvas.querySelector('.sc-mini b').textContent = String(st.score);
          feedback.append(h('p', { class: 'sc-fact' }, q.fact || ''));
          const actions = h('div', { class: 'sc-actions' },
            q.learn ? h('button', { class: 'bbtn', onclick: () => api.openArticle(q.learn) }, `Read about ${E2KTrivia.display(q.learn)} ›`) : null,
            finished
              ? h('button', { class: 'go', onclick: () => (id === 'pole' ? victory() : medal(id)) }, id === 'pole' ? 'Claim the Sky' : 'Claim Medallion')
              : h('button', { class: 'go', onclick: next }, ok ? 'Next Star ›' : 'Try Another ›'));
          feedback.append(actions);
          actions.querySelector('.go').focus();
        }
      }
      next();
    }

    function medallion(id) {
      return h('div', { class: 'sc-medallion', style: `--c:${COLORS[id]}` },
        h('div', { class: 'face' }, svg('svg', { viewBox: '0 0 24 24' }, svg('use', { href: '#sc-i-' + id }))));
    }

    function overlay(...content) {
      const ov = h('div', { class: 'overlay sc-ov' }, h('div', { class: 'sc-award' }, ...content));
      document.body.append(ov);
      return ov;
    }

    function medal(id) {
      const ov = overlay(medallion(id),
        h('small', { style: `color:${COLORS[id]}` }, `${TOPIC[id].toUpperCase()} MEDALLION`),
        h('h2', {}, `You’ve charted ${NAMES[id]}!`),
        h('p', {}, ORDER.every((x) => complete(st, x))
          ? 'All six constellations are charted. The Pole Star has appeared at the center of the sky.'
          : `${ORDER.filter((x) => complete(st, x)).length} of 6 medallions earned. Keep going to unlock the Pole Star.`),
        h('button', { class: 'go', onclick: () => { ov.remove(); overview(); } }, 'Return to the Star Chart'));
      ov.querySelector('.go').focus();
    }

    function victory() {
      try { E2KAudio.jingle({ volume: 0.5 }); } catch {}
      const ov = overlay(medallion('pole'),
        h('small', {}, 'MASTER ASTRONOMER'),
        h('h2', {}, 'The whole sky is yours'),
        h('p', {}, `You charted all ${TOTAL} stars, the Pole Star’s included, with ${st.score} points. Your best streak was ${st.best} in a row.`),
        h('div', { class: 'sc-actions' },
          h('button', { class: 'go', onclick: () => { ov.remove(); st = fresh(); save(); overview(); } }, 'Start a New Chart'),
          h('button', { class: 'go', onclick: () => { ov.remove(); overview(); } }, 'Admire the Sky')));
    }

    overview();
    return () => {
      disposed = true;
      gen++;
      ro.disconnect();
      document.querySelectorAll('.sc-ov').forEach((o) => o.remove());
    };
  }

  function art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 300 150', preserveAspectRatio: 'xMidYMid slice' });
    s.append(defs(svg).firstChild);
    s.append(svg('rect', { width: 300, height: 150, fill: 'url(#sc-dust)' }),
      drawConst(svg, 'people', 5, 30, 30, 100, 85, { next: true }),
      drawConst(svg, 'history', 5, 175, 22, 90, 100, {}),
      svg('use', { href: '#sc-i-pole', x: 138, y: 58, width: 26, height: 26, fill: '#fff4c8', opacity: 0.9 }));
    return s;
  }

  function progress(api) {
    const st = load(api);
    if (st.done) return `Sky complete · ${st.score} points`;
    const n = starsLit(st);
    return n ? `${n} of ${TOTAL} stars charted · ${st.score} points` : 'New game';
  }

  E2KGames.register({
    id: 'starchart',
    name: 'Star Chart',
    blurb: 'Light the stars of six constellations, one topic each, by answering questions drawn from the encyclopedia. Earn every medallion to face the Pole Star.',
    art, progress, mount,
  });
})();
