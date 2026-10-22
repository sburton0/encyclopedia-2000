// World Explorer: a clickable map of the world's countries, with a fact card for the one you pick.
// The map comes from map-data.js (built by tools/make-map.mjs). Facts come live from Wikidata, summaries from Wikipedia.
window.E2KWorld = (() => {
  const REGIONS = ['All', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  // Each region's Wikidata item (for its area and population); the Wikipedia article has the same name.
  const CONTINENTS = { Africa: 'Q15', Asia: 'Q48', Europe: 'Q46', 'North America': 'Q49', 'South America': 'Q18', Oceania: 'Q55643' };
  const MIN_W = 40; // narrowest the view can zoom to, in map units (the whole map is 1000 wide)
  const TINY = 10; // countries smaller than this (width + height, in map units) also get a dot, so they can be clicked

  // Remembered while the app is open, so coming back from an article finds the map as you left it.
  const state = { sel: null, region: 'All', view: null };
  const facts = {}; // Wikidata facts by item id
  const summaries = {};

  // ---------- data ----------
  async function loadFacts(id) {
    if (facts[id]) return facts[id];
    // Current values only (no end date), named by their English Wikipedia article where there is one, otherwise their English label.
    const en = (v, l) => `OPTIONAL { ?c p:${v} ?${l}s. ?${l}s ps:${v} ?${l}x; a wikibase:BestRank. FILTER NOT EXISTS { ?${l}s pq:P582 [] }
      ?${l}x rdfs:label ?${l}l FILTER(LANG(?${l}l) = "en")
      OPTIONAL { ?${l}a schema:about ?${l}x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?${l}t }
      BIND(COALESCE(?${l}t, ?${l}l) AS ?${l}) }`;
    const query = `SELECT
      (SAMPLE(?flag) AS ?flag) (GROUP_CONCAT(DISTINCT ?cap; separator="|") AS ?capital)
      (GROUP_CONCAT(DISTINCT ?lang; separator="|") AS ?langs) (GROUP_CONCAT(DISTINCT ?cur; separator="|") AS ?currency)
      (GROUP_CONCAT(DISTINCT ?gov; separator="|") AS ?govs) (SAMPLE(?area) AS ?areaKm)
      (GROUP_CONCAT(DISTINCT CONCAT(STR(?pop), "@", STR(COALESCE(?popT, ""))); separator="|") AS ?pops)
      WHERE {
        VALUES ?c { wd:${id} }
        OPTIONAL { ?c wdt:P41 ?flag }
        ${en('P36', 'cap')} ${en('P37', 'lang')} ${en('P38', 'cur')} ${en('P122', 'gov')}
        OPTIONAL { ?c p:P2046/psn:P2046/wikibase:quantityAmount ?area }
        OPTIONAL { ?c p:P1082 ?ps. ?ps ps:P1082 ?pop; a wikibase:BestRank. OPTIONAL { ?ps pq:P585 ?popT } }
      }`;
    const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const b = (await res.json()).results.bindings[0] || {};
    const list = (k) => (b[k]?.value ? [...new Set(b[k].value.split('|').filter(Boolean).map(english))] : []);
    // The most recent population figure.
    const pops = list('pops').map((p) => { const [n, t] = p.split('@'); return { n: Number(n), year: t ? new Date(t).getUTCFullYear() : 0 }; })
      .filter((p) => p.n > 0).sort((a, z) => z.year - a.year);
    return (facts[id] = {
      flag: b.flag?.value ? b.flag.value.replace(/^http:/, 'https:') + '?width=320' : '',
      capital: list('capital'),
      languages: list('langs'),
      currency: list('currency'),
      government: list('govs'),
      area: b.areaKm ? Number(b.areaKm.value) / 1e6 : 0, // Wikidata's normalized areas are in square meters
      population: pops[0] || null,
    });
  }
  async function loadSummary(title) {
    if (!summaries[title]) summaries[title] = await Wiki.summary(title);
    return summaries[title];
  }

  // Article titles made readable: "French language" is "French", "Georgia (country)" is "Georgia".
  // A few names Wikipedia uses aren't the ones English speakers know.
  const KNOWN_AS = { Putonghua: 'Mandarin Chinese' };
  function english(name) {
    const n = name.replace(/ \(.*\)$/, '').replace(/ language$/, '');
    return KNOWN_AS[n] || n;
  }

  // ---------- formatting ----------
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function people(p) {
    if (!p) return '';
    const n = p.n >= 1e9 ? `${(p.n / 1e9).toFixed(2)} billion` : p.n >= 1e6 ? `${(p.n / 1e6).toFixed(1)} million` : p.n.toLocaleString('en-US');
    return p.year ? `${n} (${p.year})` : n;
  }
  // In the chosen units, with the other in parentheses: "357,022 km² (137,847 sq mi)" or the reverse.
  function areaText(km) {
    if (!km) return '';
    const metric = `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-US')} km²`;
    const mi = km / 2.58999, imperial = `${mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString('en-US')} sq mi`;
    return E2KUnits.in('world').imperial() ? `${imperial} (${metric})` : `${metric} (${imperial})`;
  }
  const join = (xs, n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? ', and others' : '');

  // ---------- the screen ----------
  function mount(root, api) {
    const { h, svg } = api;
    const M = window.E2KWorldMap;
    const byId = Object.fromEntries(M.countries.map((c) => [c.id, c]));
    let disposed = false;
    let cardToken = 0;

    // Map
    const vb = state.view ? { ...state.view } : { x: 0, y: 0, w: M.w, h: M.h };
    const map = svg('svg', { class: 'wx-svg', viewBox: '' });
    const world = svg('g');
    world.append(svg('path', { class: 'wx-grid', d: M.grid }), svg('path', { class: 'wx-inert', d: M.inert }));
    const paths = {}, dots = {};
    for (const c of M.countries) {
      paths[c.id] = svg('path', { class: 'wx-cty', d: c.d, 'data-id': c.id });
      world.append(paths[c.id]);
    }
    const dotLayer = svg('g');
    for (const c of M.countries) {
      if (c.box[2] + c.box[3] < TINY) {
        dots[c.id] = svg('circle', { class: 'wx-dot', cx: c.c[0], cy: c.c[1], r: 2, 'data-id': c.id });
        dotLayer.append(dots[c.id]);
      }
    }
    world.append(dotLayer);
    map.append(world);

    const tip = h('div', { class: 'wx-tip', hidden: true });
    const holder = h('div', { class: 'wx-map' }, map, tip);

    // Header: title, search, regions
    const input = h('input', { placeholder: 'Find a country', spellcheck: 'false', autocomplete: 'off' });
    const sugBox = h('div', { class: 'wx-sug', hidden: true });
    const regionBtns = REGIONS.map((r) => h('button', { class: 'wx-chip', onclick: () => chooseRegion(r) }, r));
    const card = h('div', { class: 'wx-card' });
    // Units for this activity (see E2KUnits.menu); switching redraws the card.
    const unitMenu = E2KUnits.menu(h, api.icon, 'world', () => { if (state.sel) showCard(byId[state.sel]); else showHome(); });
    const el = h('div', { class: 'wx' },
      h('div', { class: 'wx-head' },
        h('div', {}, h('h1', {}, 'Countries of the World')),
        h('div', { class: 'wx-find' }, h('div', { class: 'wx-field' }, input, sugBox), h('button', { class: 'go', onclick: () => findBest() }, 'Go'))),
      h('div', { class: 'wx-regions' }, regionBtns,
        h('button', { class: 'wx-chip rnd', title: 'Pick a country at random', onclick: () => randomCountry() }, api.icon('dice'), 'Random Country')),
      holder,
      h('div', { class: 'wx-zoom' },
        h('button', { title: 'Zoom in', onclick: () => zoomBy(1 / 1.6) }, '+'),
        h('button', { title: 'Zoom out', onclick: () => zoomBy(1.6) }, '−')),
      h('div', { class: 'wx-hint' }, 'Click a country to learn about it. Scroll to zoom, drag to move.'),
      h('div', { class: 'wx-units' }, unitMenu),
      card);
    root.append(el);

    // ---------- view (zoom and pan) ----------
    let anim = 0;
    function clamp(v) {
      const w = Math.min(M.w, Math.max(MIN_W, v.w));
      const hh = w * (M.h / M.w);
      return { w, h: hh, x: Math.min(M.w - w * 0.5, Math.max(-w * 0.5, v.x)), y: Math.min(M.h - hh * 0.5, Math.max(-hh * 0.5, v.y)) };
    }
    function apply() {
      map.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      const k = vb.w / M.w;
      for (const d of Object.values(dots)) d.setAttribute('r', Math.max(0.35, 2.4 * k));
      state.view = { ...vb };
    }
    function setView(v, animate = true) {
      const to = clamp(v);
      cancelAnimationFrame(anim);
      if (!animate || document.documentElement.classList.contains('no-anim')) { Object.assign(vb, to); apply(); return; }
      const from = { ...vb }, t0 = performance.now(), dur = 420;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        for (const k of ['x', 'y', 'w', 'h']) vb[k] = from[k] + (to[k] - from[k]) * e;
        apply();
        if (p < 1 && !disposed) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const toMap = (cx, cy) => {
      const pt = new DOMPoint(cx, cy).matrixTransform(map.getScreenCTM().inverse());
      return [pt.x, pt.y];
    };
    function zoomBy(f, at) {
      const [px, py] = at || [vb.x + vb.w / 2, vb.y + vb.h / 2];
      const w = Math.min(M.w, Math.max(MIN_W, vb.w * f));
      const s = w / vb.w;
      setView({ x: px - (px - vb.x) * s, y: py - (py - vb.y) * s, w }, !at);
    }
    // Frame a box with some margin, never closer than a small country deserves.
    function frame([x, y, w, hh], margin = 2.2) {
      const fw = Math.max(MIN_W * 1.5, w * margin, hh * margin * (M.w / M.h));
      setView({ x: x + w / 2 - fw / 2, y: y + hh / 2 - (fw * M.h / M.w) / 2, w: fw });
    }

    map.addEventListener('wheel', (e) => {
      e.preventDefault();
      cancelAnimationFrame(anim);
      zoomBy(e.deltaY > 0 ? 1.25 : 0.8, toMap(e.clientX, e.clientY));
    }, { passive: false });

    let drag = null;
    map.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cancelAnimationFrame(anim);
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, scale: vb.w / map.getBoundingClientRect().width };
      map.setPointerCapture(e.pointerId);
    });
    map.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; map.classList.add('dragging'); tip.hidden = true; }
        if (drag.moved) { Object.assign(vb, clamp({ ...vb, x: drag.vx - dx * drag.scale, y: drag.vy - dy * drag.scale })); apply(); }
        return;
      }
      hover(e);
    });
    map.addEventListener('pointerup', (e) => {
      const d = drag;
      drag = null;
      map.classList.remove('dragging');
      if (d && !d.moved) {
        const id = e.target.dataset?.id || document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset?.id)?.dataset.id;
        if (id) select(id);
      }
    });
    map.addEventListener('pointerleave', () => { tip.hidden = true; setHover(null); });

    // ---------- hover ----------
    let hovered = null;
    function setHover(id) {
      if (hovered === id) return;
      if (hovered) { paths[hovered]?.classList.remove('hov'); dots[hovered]?.classList.remove('hov'); }
      hovered = id;
      if (id) { paths[id].classList.add('hov'); dots[id]?.classList.add('hov'); }
    }
    function hover(e) {
      const id = e.target.dataset?.id;
      setHover(id || null);
      if (!id) { tip.hidden = true; return; }
      const r = holder.getBoundingClientRect();
      tip.textContent = byId[id].name;
      tip.hidden = false;
      // Pointer positions are in screen pixels; the tip is placed in the page's own (possibly zoomed) pixels.
      const z = r.width / holder.offsetWidth || 1;
      tip.style.left = `${(e.clientX - r.left) / z + 14}px`;
      tip.style.top = `${(e.clientY - r.top) / z - 10}px`;
    }

    // ---------- regions ----------
    function setRegion(r, zoom = true) {
      state.region = r;
      regionBtns.forEach((b) => b.classList.toggle('on', b.textContent === r));
      for (const c of M.countries) {
        const dim = r !== 'All' && !c.regions.includes(r);
        paths[c.id].classList.toggle('dim', dim);
        dots[c.id]?.classList.toggle('dim', dim);
      }
      if (zoom) r === 'All' ? setView({ x: 0, y: 0, w: M.w }) : frame(M.views[r], 1.08);
    }
    // Choosing a region zooms to it and shows the region's card (or the welcome card for All).
    function chooseRegion(r) {
      clearSel();
      setRegion(r);
      showHome();
    }
    // The card for when no country is picked.
    function showHome() {
      api.setIdle();
      if (state.region === 'All') { api.setCrumbs([]); showIntro(); }
      else { api.setCrumbs([state.region], () => chooseRegion('All')); showRegion(state.region); }
    }

    // ---------- selection and the card ----------
    function select(id, { zoom = false } = {}) {
      const c = byId[id];
      if (!c) return;
      if (state.sel) { paths[state.sel]?.classList.remove('sel'); dots[state.sel]?.classList.remove('sel'); }
      state.sel = id;
      paths[id].classList.add('sel');
      dots[id]?.classList.add('sel');
      // Keep the selected country on top so its outline isn't hidden by its neighbors.
      paths[id].parentNode.insertBefore(paths[id], dotLayer);
      if (zoom) frame(c.box);
      // Inside a region, the trail goes World Explorer › Africa › Kenya, and Africa leads back to the region's card.
      const inRegion = state.region !== 'All' && c.regions.includes(state.region);
      api.setCrumbs(inRegion ? [{ label: state.region, run: () => deselect() }, c.name] : [c.name], () => chooseRegion('All'));
      api.setIdle(c.name);
      showCard(c);
    }
    function clearSel() {
      if (state.sel) { paths[state.sel]?.classList.remove('sel'); dots[state.sel]?.classList.remove('sel'); }
      state.sel = null;
    }
    function deselect() {
      clearSel();
      if (state.region !== 'All') frame(M.views[state.region], 1.08);
      showHome();
    }

    async function showRegion(r) {
      const token = ++cardToken;
      card.classList.remove('intro');
      const list = M.countries.filter((c) => c.regions.includes(r));
      const pic = h('div', { class: 'wx-flag' }, h('div', { class: 'wx-flag-ph' }));
      const rows = h('table', { class: 'wx-facts' },
        h('tr', {}, h('td', {}, 'Area'), h('td', { class: 'wx-area' }, '…')),
        h('tr', {}, h('td', {}, 'Population'), h('td', { class: 'wx-pop' }, '…')),
        h('tr', {}, h('td', {}, 'Countries'), h('td', {}, `${list.length} countries and territories`)));
      const desc = h('div', { class: 'desc' });
      const sum = h('p', { class: 'wx-sum short' });
      card.replaceChildren(pic,
        h('div', { class: 'wx-cb' },
          h('small', {}, r === 'Oceania' ? 'REGION' : 'CONTINENT'),
          h('h2', {}, r), desc, rows, sum,
          h('div', { class: 'wx-acts' }, h('button', { class: 'go', onclick: () => api.openArticle(r) }, `Read about ${r} ›`)),
          h('h3', { class: 'wx-lh' }, 'Countries and territories'),
          h('div', { class: 'wx-list' }, list.map((c) => h('button', {
            title: c.name,
            onclick: () => select(c.id, { zoom: true }),
            onmouseenter: () => setHover(c.id),
            onmouseleave: () => setHover(null),
          }, c.name)))));

      loadSummary(r).then((s) => {
        if (token !== cardToken) return;
        // Skip a description that only repeats the label above ("Continent").
        desc.textContent = s.description && s.description.toLowerCase() !== (r === 'Oceania' ? 'region' : 'continent') ? cap(s.description) : '';
        sum.textContent = s.extract || '';
        const src = s.thumbnail?.source;
        if (src) { const img = h('img', { class: 'globe', src, alt: '' }); img.onerror = () => img.remove(); pic.replaceChildren(img); }
      }).catch(() => {});
      try {
        const f = await loadFacts(CONTINENTS[r]);
        if (token !== cardToken || disposed) return;
        rows.querySelector('.wx-area').textContent = areaText(f.area) || '—';
        rows.querySelector('.wx-pop').textContent = people(f.population) || '—';
      } catch {
        if (token === cardToken) rows.querySelectorAll('.wx-area, .wx-pop').forEach((td) => { td.textContent = '—'; });
      }
    }

    function showIntro() {
      cardToken++;
      card.classList.add('intro');
      const counts = REGIONS.slice(1).map((r) => [r, M.countries.filter((c) => c.regions.includes(r)).length]);
      card.replaceChildren(
        h('div', { class: 'wx-cb' },
          h('small', {}, 'WELCOME'),
          h('h2', {}, 'Explore the world'),
          h('p', { class: 'wx-lead' }, `Click any of the ${M.countries.length} countries and territories on the map to see its flag, capital, population, and more.`),
          h('table', { class: 'wx-facts' }, counts.map(([r, n]) => h('tr', {}, h('td', {}, r), h('td', {}, `${n} countries and territories`)))),
          h('p', { class: 'wx-lead' }, 'Choose a region above to zoom in on it, or try Random Country to be surprised.')));
    }

    async function showCard(c) {
      const token = ++cardToken;
      card.classList.remove('intro');
      const flag = h('div', { class: 'wx-flag' }, h('div', { class: 'wx-flag-ph' }));
      const rows = h('table', { class: 'wx-facts' }, h('tr', {}, h('td', { colspan: 2, class: 'wx-loading' }, 'Looking up the facts…')));
      const desc = h('div', { class: 'desc' });
      const sum = h('p', { class: 'wx-sum' });
      card.replaceChildren(flag,
        h('div', { class: 'wx-cb' },
          h('small', {}, c.regions.join(' · ').toUpperCase() || 'TERRITORY'),
          h('h2', {}, c.name), desc, rows, sum,
          h('div', { class: 'wx-acts' }, h('button', { class: 'go', onclick: () => api.openArticle(c.title) }, 'Read the full article ›'))));

      loadSummary(c.title).then((s) => {
        if (token !== cardToken) return;
        desc.textContent = s.description ? cap(s.description) : '';
        sum.textContent = s.extract || '';
      }).catch(() => { if (token === cardToken) sum.textContent = ''; });

      try {
        const f = await loadFacts(c.id);
        if (token !== cardToken || disposed) return;
        if (f.flag) {
          const img = h('img', { src: f.flag, alt: `Flag of ${c.name}` });
          img.onerror = () => img.remove();
          flag.replaceChildren(img);
        } else flag.replaceChildren(h('div', { class: 'wx-flag-ph none' }, 'No flag on record'));
        const row = (k, v) => (v ? h('tr', {}, h('td', {}, k), h('td', {}, v)) : null);
        const list = [
          row(f.capital.length > 1 ? 'Capitals' : 'Capital', join(f.capital)),
          row('Population', people(f.population)),
          row('Area', areaText(f.area)),
          row(f.languages.length > 1 ? 'Languages' : 'Language', join(f.languages, 4)),
          row('Currency', join(f.currency, 2)),
          row('Government', cap(join(f.government.map((g) => g.charAt(0).toLowerCase() + g.slice(1)), 2))),
        ].filter(Boolean);
        rows.replaceChildren(...(list.length ? list : [h('tr', {}, h('td', { colspan: 2, class: 'wx-loading' }, 'No facts on record for this place.'))]));
      } catch {
        if (token !== cardToken) return;
        flag.replaceChildren(h('div', { class: 'wx-flag-ph none' }));
        rows.replaceChildren(h('tr', {}, h('td', { colspan: 2, class: 'wx-loading' }, api.offline && api.offline() ? 'The facts come from Wikidata, so they need the internet.' : 'Couldn’t reach Wikidata for the facts.')));
      }
    }

    // ---------- search ----------
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function matches(q) {
      const n = norm(q.trim());
      if (!n) return [];
      const starts = [], has = [];
      for (const c of M.countries) {
        const a = norm(c.name), t = norm(c.title);
        if (a.startsWith(n) || t.startsWith(n)) starts.push(c);
        else if (a.includes(n) || t.includes(n)) has.push(c);
      }
      return [...starts, ...has].slice(0, 8);
    }
    let sugSel = -1, sugList = [];
    function showSug() {
      sugList = matches(input.value);
      sugSel = -1;
      sugBox.replaceChildren(...sugList.map((c, i) => h('div', {
        class: 'wx-si', onmousedown: (e) => { e.preventDefault(); pick(c); }, onmouseenter: () => mark(i),
      }, c.name, h('span', {}, c.regions[0] || ''))));
      sugBox.hidden = !sugList.length || !input.value.trim();
    }
    function mark(i) { sugSel = i; [...sugBox.children].forEach((n, j) => n.classList.toggle('sel', j === i)); }
    function pick(c) {
      input.value = '';
      sugBox.hidden = true;
      input.blur();
      if (state.region !== 'All' && !c.regions.includes(state.region)) setRegion('All', false);
      select(c.id, { zoom: true });
    }
    function findBest() {
      const c = sugList[sugSel] || matches(input.value)[0];
      if (c) pick(c);
      else if (input.value.trim()) api.setIdle(`No country matches “${input.value.trim()}”`);
    }
    input.addEventListener('input', showSug);
    input.addEventListener('blur', () => { sugBox.hidden = true; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && sugList.length) { e.preventDefault(); mark((sugSel + 1) % sugList.length); }
      else if (e.key === 'ArrowUp' && sugList.length) { e.preventDefault(); mark((sugSel - 1 + sugList.length) % sugList.length); }
      else if (e.key === 'Enter') { e.preventDefault(); findBest(); }
      else if (e.key === 'Escape') { sugBox.hidden = true; }
    });

    function randomCountry() {
      const pool = M.countries.filter((c) => c.id !== state.sel && (state.region === 'All' || c.regions.includes(state.region)));
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (c) select(c.id, { zoom: true });
    }

    // ---------- start ----------
    setRegion(state.region, false);
    apply();
    if (state.sel && byId[state.sel]) select(state.sel);
    else showHome();

    return () => { disposed = true; cancelAnimationFrame(anim); cardToken++; };
  }

  return { mount };
})();
