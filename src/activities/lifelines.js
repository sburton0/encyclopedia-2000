// Lifelines: people's lifespans as bars on one timeline, so you can see who was alive at the same time.
// Birth and death dates come from Wikidata; portraits and descriptions from Wikipedia.
(() => {
  const SETS = [
    ['Surprising Overlaps', ['Galileo Galilei', 'William Shakespeare', 'Isaac Newton', 'Gottfried Wilhelm Leibniz', 'Johann Sebastian Bach', 'George Frideric Handel', 'Benjamin Franklin', 'Wolfgang Amadeus Mozart']],
    ['Scientific Revolution', ['Nicolaus Copernicus', 'Galileo Galilei', 'Johannes Kepler', 'René Descartes', 'Robert Boyle', 'Isaac Newton', 'Gottfried Wilhelm Leibniz', 'Edmond Halley']],
    ['Great Composers', ['Antonio Vivaldi', 'Johann Sebastian Bach', 'George Frideric Handel', 'Joseph Haydn', 'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven', 'Franz Schubert', 'Frédéric Chopin']],
    ['U.S. Founders', ['Benjamin Franklin', 'George Washington', 'John Adams', 'Thomas Jefferson', 'John Jay', 'James Madison', 'Alexander Hamilton']],
    ['Ancient Greece', ['Pythagoras', 'Hippocrates', 'Socrates', 'Plato', 'Aristotle', 'Alexander the Great', 'Euclid', 'Archimedes']],
    ['Inventors', ['James Watt', 'Alexander Graham Bell', 'Thomas Edison', 'Nikola Tesla', 'Guglielmo Marconi', 'Wilbur Wright', 'Orville Wright', 'Henry Ford']],
  ];
  const COLORS = ['#9fd3ff', '#ffd27a', '#b5e8a6', '#f2b8d6', '#cdb4ff', '#ffb866', '#86e0d0', '#ff9f8f'];
  const MAX = 14;
  const people = new Map(); // title -> person, or a promise while loading

  // Wikidata gives years in astronomical numbering (0 = 1 BC), which makes ages easy to subtract.
  const yearText = (y) => (y <= 0 ? `${1 - y} BC` : String(y));
  // "583–491 BC" rather than "583 BC–491 BC".
  const lifespan = (p) => (p.born <= 0 && p.died <= 0 ? `${1 - p.born}–${1 - p.died} BC` : `${yearText(p.born)}–${yearText(p.died)}`);
  const plainDesc = (s) => {
    const d = (s || '').replace(/\s*\(.*?\)\s*/g, ' ').split(/[,;]/)[0].trim();
    return d.charAt(0).toUpperCase() + d.slice(1);
  };

  async function lookup(title) {
    if (people.has(title)) return people.get(title);
    const p = (async () => {
      const s = await Wiki.summary(title);
      const q = s.wikibase_item;
      if (!q) throw Object.assign(new Error('no item'), { why: 'none' });
      const query = `SELECT ?b ?d WHERE { OPTIONAL { wd:${q} wdt:P569 ?b } OPTIONAL { wd:${q} wdt:P570 ?d } }`;
      const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()).results.bindings;
      const yr = (k) => {
        const ys = rows.map((r) => r[k]?.value).filter(Boolean).map((v) => parseInt(v.match(/^(-?\d+)/)[1], 10));
        return ys.length ? Math.min(...ys) : null;
      };
      const born = yr('b');
      if (born === null) throw Object.assign(new Error('no birth date'), { why: 'nodate' });
      return {
        title: s.titles?.normalized || s.title || title,
        name: (s.titles?.normalized || s.title || title).replace(/ \(.*\)$/, ''),
        role: plainDesc(s.description),
        thumb: s.thumbnail?.source || '',
        born,
        died: yr('d'),
      };
    })();
    people.set(title, p);
    try { const v = await p; people.set(title, v); return v; } catch (e) { people.delete(title); throw e; }
  }

  function mount(root, api) {
    const { h } = api;
    root.classList.add('act', 'll');
    let list = []; // people on the chart, in order
    let selected = null;
    let year = null; // the year being pointed at
    let token = 0;
    const thisYear = new Date().getFullYear();

    // ---------- header ----------
    const input = h('input', { placeholder: 'Add a person, such as Cleopatra', spellcheck: 'false', autocomplete: 'off' });
    const sug = h('div', { class: 'act-sug', hidden: true });
    const setBtns = SETS.map(([name]) => h('button', { class: 'act-chip', onclick: () => loadSet(name) }, name));
    const chart = h('div', { class: 'act-panel ll-chart' });
    const foot = h('div', { class: 'act-panel ll-foot' });
    root.append(
      h('div', { class: 'act-head' },
        h('div', {}, h('h1', {}, 'Lifelines')),
        h('div', { class: 'll-add' }, h('div', { class: 'act-field' }, input, sug), h('button', { class: 'go', onclick: () => addTyped() }, 'Add'))),
      h('div', { class: 'll-sets' }, h('span', {}, 'Try a set:'), setBtns, h('button', { class: 'act-chip clr', onclick: () => { list = []; selected = null; markSet(null); save(); draw(); } }, 'Clear All')),
      chart, foot);

    const save = () => api.store.set('lifelines', list.map((p) => p.title));
    const markSet = (name) => setBtns.forEach((b) => b.classList.toggle('on', b.textContent === name));

    async function loadTitles(titles, setName = null) {
      const my = ++token;
      markSet(setName);
      chart.replaceChildren(h('p', { class: 'act-note' }, 'Looking up their lives…'));
      api.setStatus('Looking up dates in Wikidata…', true);
      const got = await Promise.all(titles.map((t) => lookup(t).catch(() => null)));
      if (my !== token) return;
      list = got.filter(Boolean);
      selected = list[0] || null;
      year = null;
      // Dates come from Wikidata, which needs the internet; say so instead of showing an empty chart.
      if (!list.length && api.offline && api.offline()) {
        chart.replaceChildren(h('p', { class: 'act-note' }, 'Lifelines looks up birth and death dates on Wikidata, so it needs the internet. Go online from the status bar to use it.'));
        api.setIdle('Lifelines needs the internet');
        return;
      }
      save();
      draw();
      api.setIdle(list.length ? `${list.length} ${list.length === 1 ? 'person' : 'people'} on the chart` : 'Ready');
    }
    const loadSet = (name) => loadTitles(SETS.find(([n]) => n === name)[1], name);

    async function add(title) {
      input.value = '';
      sug.hidden = true;
      if (list.some((p) => p.title === title)) { api.setIdle(`${title} is already on the chart`); return; }
      if (list.length >= MAX) { api.setIdle(`The chart holds up to ${MAX} people. Remove someone first.`); return; }
      api.setStatus(`Looking up ${title}…`, true);
      try {
        const p = await lookup(title);
        if (list.some((x) => x.title === p.title)) { api.setIdle(`${p.name} is already on the chart`); return; }
        list.push(p);
        selected = p;
        markSet(null);
        save();
        draw();
        api.setIdle(`Added ${p.name}`);
      } catch (e) {
        api.setIdle(e.why === 'nodate' || e.why === 'none' ? `There’s no birth date on record for “${title}”. Lifelines works with people.`
          : api.offline && api.offline() ? 'Lifelines needs the internet to look up dates' : 'Couldn’t look that up. Please try again.');
      }
    }

    // ---------- suggestions ----------
    let sugTimer = 0, sugList = [], sugSel = -1;
    input.addEventListener('input', () => {
      clearTimeout(sugTimer);
      const q = input.value.trim();
      if (!q) { sug.hidden = true; return; }
      sugTimer = setTimeout(async () => {
        try {
          const res = await Wiki.searchTitles(q);
          if (input.value.trim() !== q) return;
          sugList = (res.pages || []).slice(0, 6);
          sugSel = -1;
          sug.replaceChildren(...sugList.map((p, i) => h('div', {
            class: 'act-si', onmousedown: (e) => { e.preventDefault(); add(p.title); }, onmouseenter: () => mark(i),
          }, h('b', {}, p.title), p.description ? h('span', {}, p.description) : null)));
          sug.hidden = !sugList.length;
        } catch {}
      }, 180);
    });
    const mark = (i) => { sugSel = i; [...sug.children].forEach((n, j) => n.classList.toggle('sel', j === i)); };
    function addTyped() {
      const pick = sugList[sugSel] || sugList.find((p) => p.title.toLowerCase() === input.value.trim().toLowerCase());
      if (pick) add(pick.title);
      else if (input.value.trim()) add(input.value.trim());
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && sugList.length) { e.preventDefault(); mark((sugSel + 1) % sugList.length); }
      else if (e.key === 'ArrowUp' && sugList.length) { e.preventDefault(); mark((sugSel - 1 + sugList.length) % sugList.length); }
      else if (e.key === 'Enter') { e.preventDefault(); addTyped(); }
      else if (e.key === 'Escape') sug.hidden = true;
    });
    input.addEventListener('blur', () => { sug.hidden = true; });

    // ---------- the chart ----------
    let span = { y0: 0, y1: 1 };
    const endOf = (p) => (p.died === null ? thisYear : p.died);
    function niceSpan() {
      const lo = Math.min(...list.map((p) => p.born)), hi = Math.max(...list.map(endOf));
      const range = Math.max(20, hi - lo);
      const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => range / s <= 10) || 1000;
      // Ticks land on round years as people read them: 500 BC, 400 BC… AD 100, 200 (there's no year zero).
      const round = (y) => (y <= 0 ? (1 - y) % step === 0 : y === 1 || y % step === 0);
      let y0 = lo, y1 = hi;
      while (!round(y0)) y0--;
      while (!round(y1)) y1++;
      const ticks = [];
      for (let y = y0; y <= y1; y++) if (round(y)) ticks.push(y);
      return { y0, y1, ticks };
    }
    const pct = (y) => ((y - span.y0) / (span.y1 - span.y0)) * 100;

    function draw() {
      if (!list.length) {
        chart.replaceChildren(h('p', { class: 'act-note' }, 'Add people with the box above, or try one of the sets.'));
        foot.replaceChildren(h('div', {}, h('small', {}, 'HOW IT WORKS'), 'Each bar is one lifetime. Point at the timeline to see who was alive in that year, and how old they were.'));
        return;
      }
      span = niceSpan();
      const ticks = [];
      const label = (y) => (span.y0 <= 0 && y > 0 ? `AD ${y}` : yearText(y));
      for (const y of span.ticks) ticks.push(h('div', { class: 'll-tick' + (y === span.y1 ? ' end' : ''), style: `left:${pct(y)}%` }, h('span', {}, label(y))));
      const marker = h('div', { class: 'll-mark', hidden: true }, h('b'));
      const axis = h('div', { class: 'll-axis' }, ticks, marker);
      const rows = h('div', { class: 'll-rows' }, list.map((p, i) => {
        const end = endOf(p);
        const age = end - p.born;
        const bar = h('div', {
          class: 'll-bar' + (p === selected ? ' sel' : '') + (p.died === null ? ' alive' : ''),
          style: `left:${pct(p.born)}%;width:${Math.max(0.6, pct(end) - pct(p.born))}%;--c:${COLORS[i % COLORS.length]}`,
          title: `${p.name}: ${yearText(p.born)}–${p.died === null ? 'present' : yearText(p.died)}`,
        }, h('em', {}, p.died === null ? `born ${yearText(p.born)} · age ${age}` : `${lifespan(p)} · age ${age}`));
        return h('div', { class: 'll-row' + (p === selected ? ' sel' : ''), onclick: () => { selected = p; draw(); } },
          h('div', { class: 'll-who' }, h('i', { style: p.thumb ? `background-image:url('${p.thumb}')` : '' }),
            h('div', {}, h('b', { title: p.title }, p.name), h('span', {}, p.role))),
          h('div', { class: 'll-lane' }, bar),
          h('button', { class: 'll-x', title: `Remove ${p.name}`, onclick: (e) => { e.stopPropagation(); list = list.filter((x) => x !== p); if (selected === p) selected = list[0] || null; markSet(null); save(); draw(); } }, '×'));
      }));
      chart.replaceChildren(axis, rows);
      // Labels too long for their bar sit just to the right of it instead.
      rows.querySelectorAll('.ll-bar').forEach((bar) => {
        const w = bar.firstChild.offsetWidth;
        if (w <= bar.clientWidth - 10) return;
        // ...or to the left, if there's no room on the right.
        bar.classList.add(bar.offsetLeft + bar.offsetWidth + w + 12 > bar.parentNode.clientWidth ? 'out-left' : 'out');
      });

      // Point at the chart to pick a year.
      chart.onmousemove = (e) => {
        const r = axis.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) return;
        const y = Math.round(span.y0 + ((e.clientX - r.left) / r.width) * (span.y1 - span.y0));
        if (y === year && !marker.hidden) return;
        year = y;
        marker.hidden = false;
        marker.style.left = `${pct(y)}%`;
        marker.firstChild.textContent = yearText(y);
        describe();
      };
      if (year !== null && year >= span.y0 && year <= span.y1) {
        marker.hidden = false;
        marker.style.left = `${pct(year)}%`;
        marker.firstChild.textContent = yearText(year);
      }
      describe();
    }

    // The sentence under the chart: who was alive in the chosen year, and how old.
    function describe() {
      const read = selected ? h('button', { class: 'go', onclick: () => api.openArticle(selected.title) }, `Read about ${selected.name} ›`) : null;
      if (year === null) {
        foot.replaceChildren(h('div', {}, h('small', {}, 'COMPARE LIVES'), 'Point at the timeline to see who was alive in any year, and how old they were. Click a person to select them.'), read);
        return;
      }
      const B = (p) => h('b', {}, p.name);
      const alive = list.filter((p) => p.born < year && year < endOf(p) + (p.died === null ? 1 : 0));
      const bornNow = list.filter((p) => p.born === year);
      const diedNow = list.filter((p) => p.died === year);
      const parts = [];
      const joinNames = (ps, tail) => { ps.forEach((p, i) => { parts.push(B(p)); if (i < ps.length - 2) parts.push(', '); else if (i === ps.length - 2) parts.push(ps.length > 2 ? ', and ' : ' and '); }); parts.push(tail); };
      // Group living people by age so the sentence reads naturally ("Bach and Handel were 31").
      const byAge = new Map();
      for (const p of alive) { const a = year - p.born; if (!byAge.has(a)) byAge.set(a, []); byAge.get(a).push(p); }
      const groups = [...byAge].sort((a, b) => b[0] - a[0]);
      groups.forEach(([a, ps], i) => {
        joinNames(ps, ` ${ps.length > 1 ? 'were' : 'was'} ${a}`);
        parts.push(i < groups.length - 1 ? (i === groups.length - 2 ? ', and ' : ', ') : '. ');
      });
      if (bornNow.length) joinNames(bornNow, ` ${bornNow.length > 1 ? 'were' : 'was'} born that year. `);
      if (diedNow.length) joinNames(diedNow, ` died that year. `);
      const later = list.filter((p) => p.born > year).sort((a, b) => a.born - b.born)[0];
      if (later) parts.push(later.name, ` wasn’t born for another ${later.born - year} ${later.born - year === 1 ? 'year' : 'years'}.`);
      if (!alive.length && !bornNow.length && !diedNow.length && !later) parts.push('Everyone on the chart had died by then.');
      foot.replaceChildren(h('div', {}, h('small', {}, `IN ${yearText(year)}`), parts), read);
    }

    const saved = api.store.get('lifelines', null);
    if (saved && saved.length) loadTitles(saved);
    else loadSet(SETS[0][0]);
    return () => { token++; clearTimeout(sugTimer); };
  }

  function art(api) {
    const { h } = api;
    const bars = [[6, 52, '#9fd3ff'], [20, 70, '#ffd27a'], [34, 58, '#b5e8a6'], [44, 84, '#f2b8d6'], [58, 90, '#cdb4ff']];
    return h('div', { class: 'll-art' }, bars.map(([a, b, c]) => h('i', { style: `margin-left:${a}%;width:${b - a}%;--c:${c}` })));
  }

  E2KActivities.register({
    id: 'lifelines',
    name: 'Lifelines',
    category: 'History',
    blurb: 'See famous lives side by side on one timeline. Did Newton and Bach live at the same time? Point at any year to find out.',
    art, mount,
  });
})();
