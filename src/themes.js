// Themes: each one recolors the app (see themes.css) and draws its own artwork for the Home screen, the page bands and rails,
// the startup screen, and the Explore shelf buttons. Used by the main window and the startup screen.
window.E2KThemes = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  // A fixed sequence, so stars and bubbles land in the same places every time.
  // Gradients are defined inside each drawing, so they don't vanish when another screen that defined them goes away.
  const has = (g, id) => !!(g.ownerSVGElement || g).querySelector('#' + id);
  const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const LIST = [
    { id: 'bloom', name: 'Bloom', blurb: 'The original: a glowing bloom on night blue.' },
    { id: 'aurora', name: 'Aurora', blurb: 'Northern lights, stars, and planets.' },
    { id: 'sunset', name: 'Sunset', blurb: 'A warm evening sky over desert dunes.' },
    { id: 'disc', name: 'CD-ROM', blurb: 'Silver chrome and a rainbow disc.' },
    { id: 'ocean', name: 'Ocean', blurb: 'Light rays and bubbles under the sea.' },
    { id: 'library', name: 'Library', blurb: 'Wood, parchment, and shelves of books.' },
    { id: 'classic', name: 'Classic Gray', blurb: 'The plain gray look of Windows 98.' },
  ];
  const ids = LIST.map((t) => t.id);

  // Gradient colors shared by all the artwork, set on the page's <defs> when a theme is applied.
  const PALETTE = {
    bloom: { b0: ['#4f78c4', '#25458a', '#0f2250'], pet: ['#cfe0ff', '#fff'], core: ['#fff', '#dbe8ff', '#9db8ff'], arc: '#9fc0ff' },
    aurora: { b0: ['#2a6a8a', '#123a5a', '#06142a'], pet: ['#b8ffe8', '#e0fff6'], core: ['#fff', '#c8ffe8', '#5ee6b0'], arc: '#7fe8c8' },
    sunset: { b0: ['#e07a4a', '#8a3058', '#3a1a4a'], pet: ['#ffd8b0', '#fff2e0'], core: ['#fff6d8', '#ffd27a', '#ff8a3d'], arc: '#ffc08a' },
    disc: { b0: ['#6a7488', '#3a4252', '#1a1e28'], pet: ['#dde4f0', '#fff'], core: ['#fff', '#e6ecf5', '#9aa3b5'], arc: '#c9d2e3' },
    ocean: { b0: ['#2a9fc8', '#0f5f86', '#063450'], pet: ['#c8f2ff', '#fff'], core: ['#fff', '#d2f6ff', '#7fe0ff'], arc: '#a8ecff' },
    library: { b0: ['#8a5a32', '#5a3418', '#2e1a0c'], pet: ['#f0d8a8', '#fff4dc'], core: ['#fff4dc', '#f0d8a8', '#c9a45c'], arc: '#e0c690' },
    classic: { b0: ['#1084d0', '#0a4a9a', '#000080'], pet: ['#c0c0c0', '#fff'], core: ['#fff', '#dfdfdf', '#c0c0c0'], arc: '#c0c0c0' },
  };

  // Explore shelf buttons, one style per theme; the six entries match the shelf order.
  const ORB = {
    aurora: [['#7fc8ff', '#1a4a8a'], ['#ff9a6b', '#7a2c14'], ['#ffd27a', '#8a5a10'], ['#7fe8a6', '#14603a'], ['#d8b8ff', '#4a2a8a'], ['#ff8fb8', '#7a1c44']]
      .map(([a, b]) => `--planet: repeating-linear-gradient(-18deg, rgba(255,255,255,.1) 0 4px, rgba(0,0,0,.08) 4px 9px), radial-gradient(circle at 35% 30%, ${a}, ${b} 80%); --glow: ${a}88`),
    sunset: [['#ffe08a', '#ff9a4d', '#d84f5a', '#5a1f4a'], ['#ffc46b', '#ff7a4d', '#c43f5a', '#4a1a46'], ['#ffd27a', '#ffa04d', '#e0603a', '#6a2440'],
      ['#ffb86b', '#ff6f5c', '#b83a6a', '#3a1a4a'], ['#ffd98a', '#ff8f6b', '#c84a7a', '#4a1f5a'], ['#ffe6a0', '#ffb25c', '#e86a3a', '#7a2a36']]
      .map(([a, b, c, d]) => `--tile: linear-gradient(${a} 0%, ${b} 45%, ${c} 75%, ${d} 100%)`),
    disc: ['#2a86d6', '#e0612a', '#e2a21e', '#2fae5a', '#9a4ad8', '#d83a7a'].map((c) => `--label: ${c}`),
    ocean: ['#4fb8ff', '#ff8a5c', '#ffd25c', '#5cdc8a', '#b48cff', '#ff6fa8'].map((c) => `--tint: ${c}aa`),
    library: [['#5a8ad6', '#2a5aa6', '#14305a'], ['#e07a4a', '#b0461a', '#5a1f08'], ['#e6b84a', '#b0861a', '#5a4008'], ['#5ab07a', '#2a7a4a', '#0f3a20'],
      ['#a87ad6', '#6a3aa6', '#2e1450'], ['#d65a7a', '#a62a4a', '#50101f']].map(([a, b, c]) => `--wax-hi: ${a}; --wax: ${b}; --wax-lo: ${c}`),
    classic: ['#000080', '#800000', '#808000', '#008000', '#800080', '#c00060'].map((c) => `--ico: ${c}`),
  };

  const read = () => { try { const v = JSON.parse(localStorage.getItem('e2k.theme')); return ids.includes(v) ? v : 'bloom'; } catch { return 'bloom'; } };
  let current = read();

  function recolor(doc = document) {
    const p = PALETTE[current];
    const set = (id, colors) => { const g = doc.getElementById(id); if (g) [...g.querySelectorAll('stop')].forEach((s, i) => colors[i] && s.setAttribute('stop-color', colors[i])); };
    set('b0', p.b0);
    const pet = doc.getElementById('pet');
    if (pet) { const s = pet.querySelectorAll('stop'); s[1]?.setAttribute('stop-color', p.pet[0]); s[2]?.setAttribute('stop-color', p.pet[1]); }
    set('core', p.core);
    const arc = doc.getElementById('arcfade');
    if (arc) arc.querySelectorAll('stop').forEach((s) => s.setAttribute('stop-color', p.arc));
  }

  function apply(id = read()) {
    current = ids.includes(id) ? id : 'bloom';
    document.documentElement.dataset.theme = current;
    recolor();
  }

  // ---------- artwork pieces ----------
  function stars(g, rnd, n, w, h, max = 1.1) {
    for (let i = 0; i < n; i++) g.append(el('circle', { cx: rnd() * w, cy: rnd() * h, r: rnd() * max + .25, fill: '#fff', opacity: rnd() * .7 + .15 }));
  }
  function auroraRibbons(g, w, y0, k = 1) {
    const sky = el('g', { filter: 'url(#softer)', opacity: '.8' });
    [[110, '#5ee6b0', 46], [160, '#4fb8ff', 28], [70, '#b08cff', 22]].forEach(([y, c, sw]) => {
      const Y = y0 + y * k, A = 80 * k;
      sky.append(el('path', { d: `M -40 ${Y} C ${w * .2} ${Y - A} ${w * .37} ${Y + A} ${w * .55} ${Y - 10 * k} S ${w * .88} ${Y - A} ${w + 60} ${Y + 20 * k}`,
        fill: 'none', stroke: c, 'stroke-width': sw * k, 'stroke-linecap': 'round', opacity: '.55' }));
    });
    g.append(sky);
  }
  function ringedPlanet(g, cx, cy, r) {
    const id = 'pl' + Math.round(cx) + Math.round(cy);
    const defs = el('defs');
    defs.innerHTML = `<radialGradient id="${id}-body" cx="32%" cy="30%" r="80%"><stop offset="0" stop-color="#f6e2c4"/><stop offset=".45" stop-color="#d9a77a"/><stop offset="1" stop-color="#8a5636"/></radialGradient>
      <radialGradient id="${id}-shade" cx="28%" cy="26%" r="95%"><stop offset=".5" stop-color="#0a1426" stop-opacity="0"/><stop offset=".78" stop-color="#0a1426" stop-opacity=".55"/><stop offset="1" stop-color="#050a16" stop-opacity=".92"/></radialGradient>
      <linearGradient id="${id}-ring" x1="0" x2="1"><stop offset="0" stop-color="#e9dcc6" stop-opacity=".15"/><stop offset=".3" stop-color="#f3e6cf" stop-opacity=".75"/><stop offset=".7" stop-color="#cdb898" stop-opacity=".6"/><stop offset="1" stop-color="#e9dcc6" stop-opacity=".1"/></linearGradient>
      <clipPath id="${id}-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <clipPath id="${id}-front"><rect x="${cx - r * 2}" y="${cy}" width="${r * 4}" height="${r * 2}"/></clipPath>`;
    g.append(defs);
    const P = el('g', { transform: `rotate(-16 ${cx} ${cy})` });
    const ring = (front) => { const rg = el('g', front ? { 'clip-path': `url(#${id}-front)` } : {});
      rg.append(el('ellipse', { cx, cy, rx: r * 1.87, ry: r * .37, fill: 'none', stroke: `url(#${id}-ring)`, 'stroke-width': r * .17 }));
      rg.append(el('ellipse', { cx, cy, rx: r * 1.57, ry: r * .28, fill: 'none', stroke: `url(#${id}-ring)`, 'stroke-width': r * .07, opacity: '.7' })); return rg; };
    P.append(el('circle', { cx, cy, r: r * 1.13, fill: '#8fb8ff', opacity: '.18', filter: 'url(#soft)' }), ring(false), el('circle', { cx, cy, r, fill: `url(#${id}-body)` }));
    const bands = el('g', { 'clip-path': `url(#${id}-clip)`, opacity: '.35' });
    [[-.53, .1, '#fff3dc'], [-.33, .17, '#a8623a'], [-.07, .08, '#f3dcc0'], [.17, .2, '#b8774a'], [.47, .1, '#e8c9a4'], [.7, .13, '#9a5a36']]
      .forEach(([y, sw, c]) => bands.append(el('path', { d: `M ${cx - r * 1.1} ${cy + y * r} Q ${cx} ${cy + y * r + r * .1} ${cx + r * 1.1} ${cy + y * r}`, fill: 'none', stroke: c, 'stroke-width': sw * r, 'stroke-linecap': 'round' })));
    P.append(bands, el('circle', { cx, cy, r, fill: `url(#${id}-shade)` }), el('circle', { cx, cy, r, fill: 'none', stroke: '#cfe0ff', 'stroke-opacity': '.25', 'stroke-width': 1 }), ring(true));
    g.append(P);
  }
  function nebula(g, cx, cy, rx, ry, color, o) {
    const id = 'neb' + color.slice(1);
    if (!has(g, id)) {
      const defs = el('defs');
      defs.innerHTML = `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${o}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
      g.append(defs);
    }
    g.append(el('ellipse', { cx, cy, rx, ry, fill: `url(#${id})`, filter: 'url(#softer)' }));
  }
  function sun(g, cx, cy, r, stripes = true) {
    g.append(el('circle', { cx, cy, r: r * 1.3, fill: '#ffcf6b', opacity: '.35', filter: 'url(#softer)' }), el('circle', { cx, cy, r, fill: '#ffd98a', opacity: '.55' }));
    if (stripes) for (let i = 0; i < 9; i++) g.append(el('rect', { x: cx - r, y: cy + r * .23 + i * r * .08, width: r * 2, height: (3 + i * .6) * r / 175, fill: '#c8553d', opacity: '.35' }));
  }
  function dunes(g, w, h) {
    [[.77, '#7a2f4a', .7], [.85, '#4a1d3c', .85]].forEach(([f, c, o], i) => {
      const y = h * f;
      g.append(el('path', { d: `M 0 ${y} C ${w * .18} ${y - 40} ${w * .33} ${y + 30} ${w * .51 + i * 100} ${y - 10} S ${w * .84} ${y - 50} ${w} ${y} L ${w} ${h} L 0 ${h} Z`, fill: c, opacity: o }));
    });
  }
  function cd(g, cx, cy, R, spin) {
    if (!has(g, 'cd-silver')) {
      const defs = el('defs');
      defs.innerHTML = `<radialGradient id="cd-silver"><stop offset=".2" stop-color="#2a2f3a"/><stop offset=".22" stop-color="#cfd5e0"/><stop offset=".6" stop-color="#9aa3b5"/><stop offset="1" stop-color="#e3e7ee"/></radialGradient>
        <linearGradient id="cd-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fb5" stop-opacity=".55"/><stop offset=".3" stop-color="#ffe066" stop-opacity=".45"/><stop offset=".55" stop-color="#6fffd2" stop-opacity=".45"/><stop offset=".8" stop-color="#7a8bff" stop-opacity=".55"/><stop offset="1" stop-color="#ff6fb5" stop-opacity=".4"/></linearGradient>`;
      g.append(defs);
    }
    const d = el('g', spin ? { class: 'cd-spin', style: `transform-origin: ${cx}px ${cy}px` } : {});
    d.append(el('circle', { cx, cy, r: R, fill: 'url(#cd-silver)', opacity: '.92' }), el('circle', { cx, cy, r: R, fill: 'url(#cd-rainbow)' }));
    for (let r = R * .9; r < R; r += R * .025) d.append(el('circle', { cx, cy, r, fill: 'none', stroke: '#fff', 'stroke-opacity': '.12' }));
    g.append(d);
  }
  function rays(g, w, h, n) {
    const rg = el('g', { opacity: '.22', filter: 'url(#soft)' });
    for (let i = 0; i < n; i++) { const x = w * (.12 + i * .1); rg.append(el('path', { d: `M ${x} -10 L ${x + w * .04} -10 L ${x + w * .16} ${h + 30} L ${x + w * .06} ${h + 30} Z`, fill: '#cff4ff' })); }
    g.append(rg);
    g.append(el('path', { d: `M 0 ${h * .03} C ${w * .12} ${h * .007} ${w * .21} ${h * .05} ${w * .33} ${h * .026} S ${w * .57} ${h * .003} ${w * .68} ${h * .03} S ${w * .9} ${h * .052} ${w} ${h * .023}`, fill: 'none', stroke: '#e0faff', 'stroke-opacity': '.35', 'stroke-width': 3 }));
  }
  function bubbles(g, rnd, n, w, y0, h, rise) {
    for (let i = 0; i < n; i++) {
      const r = rnd() * 7 + 2;
      const b = el('circle', { cx: rnd() * w, cy: y0 + rnd() * h, r, fill: 'rgba(220,245,255,.08)', stroke: '#e0faff', 'stroke-opacity': '.45' });
      if (rise) { b.setAttribute('class', 'bubble'); b.style.animationDelay = (rnd() * -6).toFixed(2) + 's'; b.style.animationDuration = (4 + rnd() * 4).toFixed(2) + 's'; }
      g.append(b);
    }
  }
  function bookshelf(g, rnd, w, y, h) {
    g.append(el('rect', { x: 0, y: y + h, width: w, height: 8, fill: '#2e1a0c', opacity: '.8' }));
    let x = 0;
    while (x < w) {
      const bw = 10 + rnd() * 16, bh = h * (.65 + rnd() * .35);
      const c = ['#7a2414', '#2f4a2a', '#2a3a5a', '#6b4a14', '#4a2a3a'][Math.floor(rnd() * 5)];
      g.append(el('rect', { x, y: y + h - bh, width: bw - 2, height: bh, fill: c, opacity: '.55' }));
      x += bw;
    }
  }

  // ---------- the Home screen (1024 × 610) ----------
  // The art is drawn in the Home canvas's own units, so it lines up with the Picture of the Day and the panels. `box` is the
  // part of that space the window shows: wider or taller than 1024 × 610 when the window's shape differs, so backgrounds
  // (stars, rays, shelves, dunes) are drawn out to the edges instead of stopping at the canvas.
  function homeArt(art, box = { x: 0, y: 0, w: 1024, h: 610 }) {
    const rnd = seeded(7);
    const W = 1024, H = 610;
    const { x: X, y: Y, w: BW, h: BH } = box;
    const area = (w, h) => Math.max(1, (w * h) / (W * H)); // keeps star and bubble density steady as the area grows
    const across = (fn) => { const g = el('g', { transform: `translate(${X} ${Y})` }); fn(g); art.append(g); };
    switch (current) {
      case 'bloom': {
        const bloom = el('g', { transform: 'translate(563 158)', filter: 'url(#soft)' });
        makeBloom(bloom, 1);
        art.append(bloom, el('circle', { cx: 563, cy: 158, r: 150, fill: 'url(#core)', filter: 'url(#softer)' }),
          el('path', { d: 'M 360 -40 C 200 150 220 450 420 700', fill: 'none', stroke: 'url(#arcfade)', 'stroke-opacity': '.22', 'stroke-width': '1.5' }),
          el('path', { d: 'M 770 -40 C 930 150 910 450 710 700', fill: 'none', stroke: 'url(#arcfade)', 'stroke-opacity': '.18', 'stroke-width': '1.5' }));
        break;
      }
      case 'aurora':
        across((g) => stars(g, rnd, Math.round(160 * area(BW, BH)), BW, BH, 1.2));
        nebula(art, 820, 420, 260, 150, '#b06bff', .55);
        nebula(art, 300, 380, 200, 120, '#ff6fae', .35);
        across((g) => auroraRibbons(g, BW, -Y));
        ringedPlanet(art, 380, 74, 30);
        break;
      case 'sunset':
        sun(art, 563, 170, 175);
        // The dunes keep their height on the canvas and run out to both sides and down to the bottom of the window.
        [[.77, '#7a2f4a', .7], [.85, '#4a1d3c', .85]].forEach(([f, c, o], i) => {
          const y = H * f, x0 = X, w = BW, bottom = Y + BH;
          art.append(el('path', { d: `M ${x0} ${y} C ${x0 + w * .18} ${y - 40} ${x0 + w * .33} ${y + 30} ${x0 + w * .51 + i * 100} ${y - 10} S ${x0 + w * .84} ${y - 50} ${x0 + w} ${y} L ${x0 + w} ${bottom} L ${x0} ${bottom} Z`, fill: c, opacity: o }));
        });
        break;
      case 'disc':
        cd(art, 563, 158, 158);
        break;
      case 'ocean':
        across((g) => rays(g, BW, BH, Math.max(9, Math.round(9 * BW / W))));
        across((g) => bubbles(g, rnd, Math.round(40 * area(BW, BH)), BW, Math.max(0, 120 - Y), BH - Math.max(0, 120 - Y), false));
        break;
      case 'library': {
        // The original three shelves, then more shelves stacked above and below to fill a taller window.
        const g = el('g', { transform: `translate(${X} 0)` });
        bookshelf(g, rnd, BW, -8, 76);
        bookshelf(g, rnd, BW, 76, 78);
        bookshelf(g, rnd, BW, 560, 50);
        for (let y = -8 - 86; y + 86 > Y; y -= 86) bookshelf(g, rnd, BW, y, 78);
        for (let y = 618; y < Y + BH; y += 86) bookshelf(g, rnd, BW, y, 78);
        art.append(g);
        break;
      }
      default: // classic: a plain desktop
    }
  }

  // ---------- page bands (800 × 96, art at the right) and rails (230 × 600, art at the bottom) ----------
  function bandArt(s, cx, cy, size) {
    const rnd = seeded(11);
    switch (current) {
      case 'bloom': {
        const b = el('g', { transform: `translate(${cx} ${cy})`, filter: 'url(#soft)' });
        makeBloom(b, size);
        s.append(b, el('circle', { cx, cy, r: 180 * size, fill: 'url(#core)', filter: 'url(#softer)', opacity: '.8' }));
        break;
      }
      case 'aurora': stars(s, rnd, 40, 800, 96); auroraRibbons(s, 800, -40, .5); break;
      case 'sunset': sun(s, cx, cy, 300 * size, false); break;
      case 'disc': cd(s, cx, cy, 260 * size); break;
      case 'ocean': rays(s, 800, 96, 9); bubbles(s, rnd, 10, 800, 10, 80, false); break;
      case 'library': bookshelf(s, rnd, 800, 0, 88); break;
      default:
    }
  }
  function railArt(s) {
    const rnd = seeded(5);
    switch (current) {
      case 'bloom': { const rb = el('g', { transform: 'translate(205 565)', filter: 'url(#soft)', opacity: '.55' }); makeBloom(rb, 0.6); s.append(rb); break; }
      case 'aurora': stars(s, rnd, 50, 230, 600); break;
      case 'sunset': dunes(s, 230, 600); break;
      case 'disc': { const g = el('g', { opacity: '.35' }); cd(g, 205, 565, 120); s.append(g); break; }
      case 'ocean': bubbles(s, rnd, 14, 230, 300, 300, false); break;
      case 'library': { const g = el('g', { opacity: '.6' }); bookshelf(g, rnd, 230, 530, 62); s.append(g); break; }
      default:
    }
  }

  // ---------- the startup screen (640 × 400, centered on 320, 150) ----------
  // Bloom keeps the original animated bloom; other themes hide it and draw their own scene.
  function splashArt(svg) {
    if (current === 'bloom') return false;
    const rnd = seeded(3);
    const g = el('g', { class: 'theme-art' });
    switch (current) {
      case 'aurora': stars(g, rnd, 90, 640, 400); auroraRibbons(g, 640, -10, .7); ringedPlanet(g, 520, 70, 18); break;
      case 'sunset': sun(g, 320, 150, 120); dunes(g, 640, 400); break;
      case 'disc': cd(g, 320, 150, 112, true); break;
      case 'ocean': rays(g, 640, 400, 9); bubbles(g, rnd, 26, 640, 60, 340, true); break;
      case 'library': bookshelf(g, rnd, 640, -6, 70); bookshelf(g, rnd, 640, 330, 62); break;
      default:
    }
    // Draw the scene just above the sky, below the title shading.
    const petals = svg.querySelector('#petals');
    let top = petals; while (top && top.parentNode !== svg) top = top.parentNode;
    svg.insertBefore(g, top || null);
    return true;
  }

  const orbStyle = (i) => (ORB[current] ? ORB[current][i] || '' : '');

  return { list: LIST, palette: (id = current) => PALETTE[id], current: () => current, read, apply, recolor, homeArt, bandArt, railArt, splashArt, orbStyle };
})();
