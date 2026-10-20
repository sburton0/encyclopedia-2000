// The Solar System: an animated orrery with the planets where they really are, and a fact card for each world.
(() => {
  // name, article, kind, distance (AU), distance (km), diameter (km), mass (Earths), year, day, moons, color, size on screen,
  // mean longitude at 1 Jan 2000 (degrees), orbital period (days). Moon counts are as of 2025.
  const PLANETS = [
    ['Mercury', 'Mercury (planet)', 'Rocky planet', 0.387, 57.9e6, 4879, 0.055, '88 Earth days', '176 Earth days, sunrise to sunrise', 0, '#b9b2a8', 4, 252.25, 87.969],
    ['Venus', 'Venus', 'Rocky planet', 0.723, 108.2e6, 12104, 0.815, '225 Earth days', '117 Earth days, sunrise to sunrise', 0, '#e8c98a', 6, 181.98, 224.701],
    ['Earth', 'Earth', 'Rocky planet', 1, 149.6e6, 12742, 1, '365.25 days', '24 hours', 1, '#4f8fe0', 6.5, 100.46, 365.256],
    ['Mars', 'Mars', 'Rocky planet', 1.524, 227.9e6, 6779, 0.107, '687 Earth days', '24 hours 40 minutes', 2, '#d0663a', 5, 355.45, 686.98],
    ['Jupiter', 'Jupiter', 'Gas giant', 5.203, 778.5e6, 139820, 317.8, '11.9 Earth years', '9 hours 56 minutes', 97, '#d9b38a', 15, 34.40, 4332.59],
    ['Saturn', 'Saturn', 'Gas giant', 9.537, 1.43e9, 116460, 95.2, '29.4 Earth years', '10 hours 34 minutes', 274, '#e6cf98', 13, 49.94, 10759.22],
    ['Uranus', 'Uranus', 'Ice giant', 19.19, 2.87e9, 50724, 14.5, '84 Earth years', '17 hours 14 minutes', 29, '#9fdde6', 9.5, 313.23, 30688.5],
    ['Neptune', 'Neptune', 'Ice giant', 30.07, 4.50e9, 49244, 17.1, '165 Earth years', '16 hours 6 minutes', 16, '#5a7fe0', 9, 304.88, 60182],
  ].map(([name, article, kind, au, distKm, diam, mass, year, day, moons, color, r, L0, period]) => ({ name, article, kind, au, distKm, diam, mass, year, day, moons, color, r, L0, period }));
  const SUN = { name: 'Sun', article: 'Sun', kind: 'Star' };
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const SPEEDS = [['1 day/sec', 1], ['1 month/sec', 30.44], ['1 year/sec', 365.25]];
  const W = 900, H = 640, CX = 450, CY = 330;
  // Orbits on a compressed (square-root) scale so the inner planets don't vanish next to Neptune; tilted for a little depth.
  const rad = (au) => 44 + Math.sqrt(au) * 58;
  const TILT = 0.62;
  const summaries = new Map();
  const summary = (t) => { if (!summaries.has(t)) summaries.set(t, Wiki.summary(t).catch((e) => { summaries.delete(t); throw e; })); return summaries.get(t); };

  function light(au) {
    const min = au * 499.005 / 60; // light takes 499 seconds to cross 1 AU
    if (min < 60) return `${Math.round(min)} minutes`;
    const hr = Math.floor(min / 60), m = Math.round(min % 60);
    return `${hr} ${hr === 1 ? 'hour' : 'hours'}${m ? ` ${m} minutes` : ''}`;
  }
  function compare(p) {
    if (p.name === 'Earth') return 'The only world known to support life.';
    const v = Math.pow(p.diam / 12742, 3);
    if (v > 1.5) return `You could fit about ${Math.round(v).toLocaleString('en-US')} Earths inside ${p.name}.`;
    if (v > 0.8) return `${p.name} is almost the same size as Earth.`;
    return `Earth is about ${Math.round(1 / v)} times the size of ${p.name}.`;
  }

  function mount(root, api) {
    const { h, svg } = api;
    const U = E2KUnits.in('solar');   // formatting in this activity's units (version.js loads after the activities)
    root.classList.add('act', 'ss');
    let simDays = (Date.now() - J2000) / 864e5;
    let speed = 30.44;
    let playing = !document.documentElement.classList.contains('no-anim');
    let selected = null;
    let raf = 0, last = 0, disposed = false, cardToken = 0;

    // ---------- the orrery ----------
    const map = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', class: 'ss-svg' });
    const defs = svg('defs');
    defs.innerHTML = `<radialGradient id="ss-sun" cx="50%" cy="50%"><stop offset="0" stop-color="#fff8d8"/><stop offset=".35" stop-color="#ffd27a"/><stop offset=".7" stop-color="#f5a623" stop-opacity=".7"/><stop offset="1" stop-color="#f5a623" stop-opacity="0"/></radialGradient>
      <radialGradient id="ss-shade" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`;
    map.append(defs);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 170; i++) map.append(svg('circle', { cx: rnd() * W, cy: rnd() * H, r: rnd() * 0.9 + 0.2, fill: '#fff', opacity: rnd() * 0.6 + 0.15 }));

    const orbits = {}, bodies = {};
    for (const p of PLANETS) {
      const R = rad(p.au);
      orbits[p.name] = svg('ellipse', { cx: CX, cy: CY, rx: R, ry: R * TILT, class: 'ss-orbit' });
      map.append(orbits[p.name]);
    }
    const sunG = svg('g', { class: 'ss-body', 'data-name': 'Sun' },
      svg('circle', { cx: CX, cy: CY, r: 48, fill: 'url(#ss-sun)' }), svg('circle', { cx: CX, cy: CY, r: 17, fill: '#fff3c4' }),
      svg('text', { x: CX, y: CY + 40, class: 'ss-lbl', 'text-anchor': 'middle' }, 'Sun'));
    map.append(sunG);
    bodies.Sun = { g: sunG };
    for (const p of PLANETS) {
      const g = svg('g', { class: 'ss-body', 'data-name': p.name });
      const ring = svg('circle', { r: p.r + 7, class: 'ss-ring' });
      const parts = [ring];
      if (p.name === 'Saturn') parts.push(svg('ellipse', { rx: p.r * 2.1, ry: p.r * 0.6, fill: 'none', stroke: '#e6cf98', 'stroke-width': 2.5, opacity: 0.8, transform: 'rotate(-18)' }));
      parts.push(svg('circle', { r: p.r, fill: p.color }), svg('circle', { r: p.r, fill: 'url(#ss-shade)' }), svg('circle', { r: Math.max(14, p.r + 6), class: 'ss-hit' }));
      const body = svg('g', {}, ...parts);
      const label = svg('text', { y: p.r + 15, class: 'ss-lbl', 'text-anchor': 'middle' }, p.name);
      g.append(body, label);
      map.append(g);
      bodies[p.name] = { g, label };
    }
    map.addEventListener('click', (e) => {
      const g = e.target.closest('.ss-body');
      if (g) select(g.dataset.name);
    });

    function place() {
      for (const p of PLANETS) {
        const R = rad(p.au);
        const L = (p.L0 + 360 * simDays / p.period) * Math.PI / 180;
        const x = CX + R * Math.cos(L), y = CY - R * TILT * Math.sin(L);
        bodies[p.name].g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      dateEl.textContent = 'Showing the planets where they are on ' + new Date(J2000 + simDays * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '. Distances are not to scale.';
    }
    function tick(t) {
      if (disposed) return;
      if (playing) {
        if (last) simDays += speed * Math.min(0.1, (t - last) / 1000);
        last = t;
        place();
        raf = requestAnimationFrame(tick);
      }
    }
    function setPlaying(on) {
      playing = on;
      playBtn.classList.toggle('paused', !on);
      playBtn.title = on ? 'Pause' : 'Play';
      cancelAnimationFrame(raf);
      last = 0;
      if (on) raf = requestAnimationFrame(tick);
    }

    // ---------- controls ----------
    const dateEl = h('div', { class: 'ss-date' });
    // Both labels share one spot so the button is always as wide as the longer one, and the row doesn't shift.
    const playBtn = h('button', { class: 'act-chip ss-play', onclick: () => setPlaying(!playing) }, h('span', { class: 'p' }, '❚❚ Pause'), h('span', { class: 'r' }, '▶ Play'));
    const speedBtns = SPEEDS.map(([label, v]) => h('button', { class: 'act-chip', onclick: () => { speed = v; speedBtns.forEach((b, i) => b.classList.toggle('on', SPEEDS[i][1] === v)); if (!playing) setPlaying(true); } }, label));
    speedBtns[1].classList.add('on');
    const card = h('div', { class: 'act-card ss-card' });
    // Units for this activity (see E2KUnits.menu); switching redraws the card.
    const unitMenu = E2KUnits.menu(h, api.icon, 'solar', () => { if (selected) select(selected); });
    root.append(
      h('div', { class: 'ss-map' }, map),
      h('div', { class: 'act-head ss-head' }, h('div', {}, h('h1', {}, 'The Solar System'), dateEl)),
      h('div', { class: 'ss-ctl' }, playBtn, h('span', { class: 'lbl' }, 'Speed'), speedBtns,
        h('button', { class: 'act-chip', style: 'margin-left:10px', onclick: () => { simDays = (Date.now() - J2000) / 864e5; place(); } }, 'Today')),
      h('div', { class: 'ss-units' }, unitMenu),
      card);

    // ---------- the card ----------
    function select(name) {
      const p = PLANETS.find((x) => x.name === name) || SUN;
      if (selected) { orbits[selected]?.classList.remove('sel'); bodies[selected]?.g.classList.remove('sel'); }
      selected = p.name;
      orbits[p.name]?.classList.add('sel');
      bodies[p.name].g.classList.add('sel');
      api.setCrumbs([p.name], () => select('Earth'));
      const token = ++cardToken;
      const pic = h('div', { class: 'ss-pic' });
      const desc = h('div', { class: 'desc' });
      const sum = h('p', { class: 'act-sum' });
      const row = (k, v) => h('tr', {}, h('td', {}, k), h('td', {}, v));
      const facts = p === SUN
        ? [row('Type', 'Yellow dwarf star'), row('Diameter', U.length(1392700)), row('Mass', '333,000 × Earth'), row('Age', 'About 4.6 billion years'), row('Surface', `About ${U.temp(5500)}`)]
        : [row('Distance from Sun', `${U.far(p.distKm)} (${p.au} AU)`), row('Diameter', U.length(p.diam)), row('Mass', p.mass === 1 ? (U.imperial() ? '1.32 × 10²⁵ lb' : '5.97 × 10²⁴ kg') : `${p.mass} × Earth`),
          row('Year', p.year), row('Day', p.day), row('Moons', p.moons ? `${p.moons} known` : 'None')];
      const notes = p === SUN
        ? ['Over 99.8% of the Solar System’s mass is in the Sun.', 'Its light takes about 8 minutes to reach Earth.']
        : [compare(p), `Sunlight takes ${light(p.au)} to reach ${p.name}.`];
      card.replaceChildren(pic,
        h('div', { class: 'act-cb' },
          h('small', {}, p === SUN ? 'STAR' : `PLANET · ${p.kind.toUpperCase()}`), h('h2', {}, p.name), desc,
          h('table', { class: 'act-facts' }, facts),
          notes.map((n) => h('p', { class: 'ss-note' }, n)),
          sum,
          h('button', { class: 'go', onclick: () => api.openArticle(p.article) }, `Read about ${p === SUN ? 'the Sun' : p.name} ›`)));
      summary(p.article).then((s) => {
        if (token !== cardToken) return;
        desc.textContent = s.description ? s.description.charAt(0).toUpperCase() + s.description.slice(1) : '';
        sum.textContent = s.extract || '';
        if (s.thumbnail?.source) pic.style.backgroundImage = `url('${s.thumbnail.source}')`;
      }).catch(() => {});
      api.setIdle(p.name);
    }

    place();
    setPlaying(playing);
    select('Earth');
    return () => { disposed = true; cancelAnimationFrame(raf); cardToken++; };
  }

  function art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 200 120', class: 'ss-art' });
    s.innerHTML = `<defs><radialGradient id="ss-art-sun"><stop offset="0" stop-color="#fff8d8"/><stop offset=".4" stop-color="#ffd27a"/><stop offset="1" stop-color="#f5a623" stop-opacity="0"/></radialGradient></defs>
      ${[28, 46, 66, 90].map((r) => `<ellipse cx="100" cy="60" rx="${r}" ry="${r * 0.55}" fill="none" stroke="#9fb4e6" stroke-opacity=".35"/>`).join('')}
      <circle cx="100" cy="60" r="18" fill="url(#ss-art-sun)"/><circle cx="100" cy="60" r="7" fill="#fff3c4"/>
      <circle cx="124" cy="48" r="3" fill="#e8c98a"/><circle cx="62" cy="72" r="4" fill="#4f8fe0"/><circle cx="160" cy="70" r="7" fill="#d9b38a"/>
      <circle cx="30" cy="48" r="6" fill="#e6cf98"/><ellipse cx="30" cy="48" rx="12" ry="3.5" fill="none" stroke="#e6cf98" transform="rotate(-18 30 48)"/>`;
    return s;
  }

  E2KActivities.register({
    id: 'solar-system',
    name: 'The Solar System',
    category: 'Science',
    blurb: 'Watch the planets circle the Sun in an animated model, and click any world to compare its size, its day and year, and its moons.',
    art, mount,
  });
})();
