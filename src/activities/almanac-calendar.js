// Almanac Calendar: a month of moon phases, sunrise and sunset, the seasons, and daylight saving changes for any city,
// with highlights from Wikipedia's "On this day" for the chosen date. The sky is calculated on the computer.
(() => {
  const RAD = Math.PI / 180;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Traditional (North American) full moon names by month; the one nearest the September equinox is the Harvest Moon.
  const MOON_NAMES = ['Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon', 'Buck Moon', 'Sturgeon Moon', 'Corn Moon', 'Hunter’s Moon', 'Beaver Moon', 'Cold Moon'];
  const SYNODIC = 29.530588853;
  const jd = (ms) => ms / 864e5 + 2440587.5;
  const msOf = (j) => (j - 2440587.5) * 864e5;
  const noonUTC = (y, m, d) => Date.UTC(y, m, d, 12);

  // ---------- the Moon ----------
  // Exact times of the main phases (Meeus, "Astronomical Algorithms", chapter 49, without the small planetary terms;
  // good to within a few minutes). k counts lunations from January 2000: whole numbers are new moons, .25 first quarters,
  // .5 full moons, and .75 last quarters.
  function phaseTime(k) {
    const T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * RAD;
    const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * RAD;
    const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * RAD;
    const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * RAD;
    const sin = Math.sin, cos = Math.cos, q = ((k % 1) + 1) % 1;
    let j = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T * T * T;
    if (q === 0 || q === 0.5) {
      const full = q === 0.5;
      j += (full ? -0.40614 : -0.4072) * sin(Mp) + (full ? 0.17302 : 0.17241) * E * sin(M) + (full ? 0.01614 : 0.01608) * sin(2 * Mp)
        + (full ? 0.01043 : 0.01039) * sin(2 * F) + (full ? 0.00734 : 0.00739) * E * sin(Mp - M) - (full ? 0.00515 : 0.00514) * E * sin(Mp + M)
        + (full ? 0.00209 : 0.00208) * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
        - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om);
    } else {
      j += -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp) + 0.00804 * sin(2 * F)
        + 0.00454 * E * sin(Mp - M) + 0.00204 * E * E * sin(2 * M) - 0.0018 * sin(Mp - 2 * F) - 0.0007 * sin(Mp + 2 * F) - 0.0004 * sin(3 * Mp)
        - 0.00034 * E * sin(2 * Mp - M) + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F) - 0.00028 * E * E * sin(Mp + 2 * M)
        + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(Om);
      const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
      j += q === 0.25 ? W : -W;
    }
    return msOf(j) - 69e3; // Terrestrial Time to UTC, about 69 seconds
  }
  const PHASES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];
  // The main phases between two moments, as [{ name, ms }].
  function phasesBetween(a, b) {
    const k0 = Math.floor((jd(a) - 2451550.1) / SYNODIC) - 1, out = [];
    for (let k = k0; k <= k0 + Math.ceil((b - a) / 864e5 / SYNODIC) + 2; k++) {
      for (let i = 0; i < 4; i++) { const ms = phaseTime(k + i / 4); if (ms >= a && ms < b) out.push({ name: PHASES[i], ms }); }
    }
    return out;
  }
  // Days since the most recent new moon.
  function moonAge(ms) {
    let k = Math.floor((jd(ms) - 2451550.1) / SYNODIC) + 1;
    while (phaseTime(k) > ms) k--;
    return (ms - phaseTime(k)) / 864e5;
  }
  const lit = (age) => (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
  function phaseName(age) {
    const f = age / SYNODIC;
    if (f < 0.0339 || f >= 0.9661) return 'New Moon';
    if (f < 0.2161) return 'Waxing Crescent';
    if (f < 0.2839) return 'First Quarter';
    if (f < 0.4661) return 'Waxing Gibbous';
    if (f < 0.5339) return 'Full Moon';
    if (f < 0.7161) return 'Waning Gibbous';
    if (f < 0.7839) return 'Last Quarter';
    return 'Waning Crescent';
  }
  // A small moon drawing: the lit part over a dark disk. The Southern Hemisphere sees it mirrored.
  function moonIcon(svg, age, r, south) {
    const f = age / SYNODIC, waxing = f < 0.5, c = Math.cos(2 * Math.PI * f), rx = Math.abs(c) * r;
    const inner = waxing ? (c > 0 ? 0 : 1) : (c > 0 ? 1 : 0);
    const d = `M0,${-r} A${r},${r} 0 0 ${waxing ? 1 : 0} 0,${r} A${rx.toFixed(2)},${r} 0 0 ${inner} 0,${-r} Z`;
    return svg('svg', { viewBox: `${-r - 1} ${-r - 1} ${2 * r + 2} ${2 * r + 2}`, class: 'ac-moon' },
      svg('circle', { r, class: 'dark' }), svg('path', { d, class: 'lit', transform: south ? 'scale(-1 1)' : '' }));
  }

  // ---------- the Sun ----------
  // Sunrise, solar noon, and sunset (the standard "sunrise equation"; good to a minute or two). Returns times in ms, or a flag
  // for days when the Sun never sets or never rises.
  function sunTimes(y, m, d, lat, lon) {
    const n = Math.round(jd(noonUTC(y, m, d)) - 2451545 + 0.0008);
    const Js = n - lon / 360;
    const M = ((357.5291 + 0.98560028 * Js) % 360) * RAD;
    const C = 1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M);
    const L = ((M / RAD + C + 180 + 102.9372) % 360) * RAD;
    const transit = 2451545 + Js + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const dec = Math.asin(Math.sin(L) * Math.sin(23.4397 * RAD));
    const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
    const noon = msOf(transit);
    if (cosW > 1) return { noon, polar: 'night' };
    if (cosW < -1) return { noon, polar: 'day' };
    const w = Math.acos(cosW) / RAD / 360;
    return { noon, rise: msOf(transit - w), set: msOf(transit + w) };
  }

  // ---------- the seasons ----------
  // Equinoxes and solstices (Meeus's mean formulas, good to within a few hours for centuries around 2000).
  function seasons(year) {
    const Y = (year - 2000) / 1000;
    const poly = (c) => c.reduce((s, k, i) => s + k * Math.pow(Y, i), 0);
    return [
      ['March equinox', poly([2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057])],
      ['June solstice', poly([2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003])],
      ['September equinox', poly([2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078])],
      ['December solstice', poly([2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032])],
    ].map(([name, j]) => ({ name, ms: msOf(j) - 69e3 })); // the formulas give Terrestrial Time; subtract about 69 seconds
  }
  const SEASON_OF = { 'March equinox': ['spring', 'autumn'], 'June solstice': ['summer', 'winter'], 'September equinox': ['autumn', 'spring'], 'December solstice': ['winter', 'summer'] };

  // ---------- time zones ----------
  const fmt = (tz, opts) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
  const ymd = (tz, ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  function offsetOf(tz, ms) {
    const p = Object.fromEntries(fmt(tz, { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(ms).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 6e4) * 6e4) / 6e4);
  }
  // The moment a calendar day starts in a time zone (midnight there), in ms.
  const dayStart = (tz, y, m, d) => { const guess = Date.UTC(y, m, d); return guess - offsetOf(tz, guess + 12 * 36e5) * 6e4; };
  const clock = (tz, ms) => fmt(tz, E2KTime.opts()).format(ms);
  const span = (mins) => `${Math.floor(mins / 60)} hr ${Math.round(mins % 60)} min`;

  function mount(root, api) {
    const { h, svg } = api;
    root.classList.add('act', 'ac');
    const cities = (window.E2KActivities.cities || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const saved = api.store.get('almanacCity', '');
    let city = cities.find((c) => c.name === saved) || cities.find((c) => c.tz === here) || cities.find((c) => c.name === 'New York') || cities[0];
    const today = ymd(city.tz, Date.now()).split('-').map(Number);
    let year = today[0], month = today[1] - 1, sel = today[2];
    let token = 0;

    const title = h('h2', { class: 'ac-title' });
    const grid = h('div', { class: 'ac-grid' });
    const citySel = h('select', { class: 'ac-city', 'aria-label': 'City' }, cities.map((c) => h('option', { value: c.name }, `${c.name}, ${c.country}`)));
    citySel.value = city.name;
    citySel.addEventListener('change', () => { city = cities.find((c) => c.name === citySel.value) || city; api.store.set('almanacCity', city.name); draw(); });
    const step = (n) => { month += n; if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } sel = Math.min(sel, new Date(year, month + 1, 0).getDate()); draw(); };
    const card = h('div', { class: 'act-card ac-card' });
    root.append(
      h('div', { class: 'act-head' }, h('div', {}, h('h1', {}, 'Almanac Calendar'))),
      h('div', { class: 'ac-cal' },
        h('div', { class: 'ac-bar' },
          h('button', { class: 'act-chip', title: 'Previous month', onclick: () => step(-1) }, '‹'), title,
          h('button', { class: 'act-chip', title: 'Next month', onclick: () => step(1) }, '›'),
          h('button', { class: 'act-chip', onclick: () => { const t = ymd(city.tz, Date.now()).split('-').map(Number); year = t[0]; month = t[1] - 1; sel = t[2]; draw(); } }, 'Today'),
          h('span', { class: 'ac-for' }, 'Sky for'), citySel),
        h('div', { class: 'ac-dow' }, DAYS.map((d) => h('span', {}, d))),
        grid,
        h('div', { class: 'ac-key' }, 'Moon phases, sunrise, and sunset are calculated for the chosen city. Times are approximate.')),
      card);

    // Everything notable on each day of the month, for the grid and the card.
    function monthInfo() {
      const days = new Date(year, month + 1, 0).getDate();
      const marks = seasons(year).concat(seasons(year - 1), seasons(year + 1));
      const sept = seasons(year)[2].ms;
      const info = [];
      for (let d = 1; d <= days; d++) {
        const start = dayStart(city.tz, year, month, d), end = dayStart(city.tz, year, month, d + 1);
        const notes = [];
        const hit = phasesBetween(start, end)[0];
        const phase = hit ? hit.name : null;
        if (phase === 'Full Moon') {
          const near = Math.abs(start - sept) < 15 * 864e5;
          notes.push({ kind: 'moon', text: near ? 'Harvest Moon' : MOON_NAMES[month], at: hit.ms });
        }
        for (const s of marks) if (s.ms >= start && s.ms < end) notes.push({ kind: 'season', text: s.name, s });
        const o1 = offsetOf(city.tz, start + 1), o2 = offsetOf(city.tz, end - 1);
        if (o1 !== o2) notes.push({ kind: 'dst', text: o2 > o1 ? 'Clocks go forward' : 'Clocks go back', mins: o2 - o1 });
        info.push({ d, start, end, phase, age: moonAge(start + (end - start) / 2), notes });
      }
      return info;
    }

    function draw() {
      title.textContent = `${MONTHS[month]} ${year}`;
      const info = monthInfo();
      const first = new Date(year, month, 1).getDay();
      const todayKey = ymd(city.tz, Date.now());
      const south = city.lat < 0;
      grid.replaceChildren(
        ...Array.from({ length: first }, () => h('div', { class: 'ac-day blank' })),
        ...info.map((x) => {
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
          const tag = x.notes[0] || (x.phase && x.phase !== 'Full Moon' ? { kind: 'phase', text: x.phase } : null);
          return h('button', {
            class: 'ac-day' + (x.d === sel ? ' sel' : '') + (key === todayKey ? ' today' : '') + (x.phase === 'Full Moon' ? ' full' : ''),
            onclick: () => { sel = x.d; draw(); },
          }, h('b', {}, String(x.d)), moonIcon(svg, x.age, 9, south), tag ? h('span', { class: 'ac-tag ' + tag.kind }, tag.text) : null);
        }));
      showDay(info[sel - 1]);
    }

    function showDay(x) {
      const t = ++token;
      const date = new Date(Date.UTC(year, month, x.d, 12));
      const sun = sunTimes(year, month, x.d, city.lat, city.lon);
      const prev = sunTimes(year, month, x.d - 1, city.lat, city.lon);
      const len = sun.rise ? (sun.set - sun.rise) / 6e4 : sun.polar === 'day' ? 1440 : 0;
      const prevLen = prev.rise ? (prev.set - prev.rise) / 6e4 : prev.polar === 'day' ? 1440 : 0;
      const change = Math.round(len - prevLen);
      const row = (k, v) => h('tr', {}, h('td', {}, k), h('td', {}, v));
      const sunRows = sun.polar
        ? [row('Sun', sun.polar === 'day' ? 'Up all day (midnight sun)' : 'Below the horizon all day (polar night)')]
        : [row('Sunrise', clock(city.tz, sun.rise)), row('Sunset', clock(city.tz, sun.set)), row('Solar noon', clock(city.tz, sun.noon)),
          row('Daylight', `${span(len)}${change ? ` (${change > 0 ? '+' : '−'}${Math.abs(change)} min)` : ''}`)];
      // The next season after this day.
      const next = seasons(year).concat(seasons(year + 1)).find((s) => s.ms >= x.start);
      const [n, s] = SEASON_OF[next.name];
      const days = Math.round((next.ms - x.start) / 864e5);
      const seasonText = days === 0 ? `Today is the ${next.name}: the first day of ${city.lat < 0 ? s : n} in ${city.name}.`
        : `${days} ${days === 1 ? 'day' : 'days'} until the ${next.name} (${fmt(city.tz, { month: 'long', day: 'numeric' }).format(next.ms)}), when ${city.lat < 0 ? s : n} begins in ${city.name}.`;
      const notes = x.notes.filter((k) => k.kind !== 'season').map((k) => h('p', { class: 'ac-note' },
        k.kind === 'moon' ? `Full moon at ${clock(city.tz, k.at)}: the ${k.text}.` : k.kind === 'dst' ? `${k.text} one hour for daylight saving time in ${city.name}.` : k.text));
      const otd = h('div', { class: 'ac-otd' }, h('div', { class: 'ac-loading' }, 'Loading events from Wikipedia…'));
      card.replaceChildren(h('div', { class: 'act-cb' },
        h('small', {}, fmt('UTC', { weekday: 'long' }).format(date).toUpperCase()),
        h('h2', {}, `${MONTHS[month]} ${x.d}, ${year}`),
        h('div', { class: 'ac-moonrow' }, moonIcon(svg, x.age, 22, city.lat < 0),
          h('div', {}, h('b', {}, x.phase || phaseName(x.age)), h('span', {}, `${Math.round(lit(x.age) * 100)}% lit · ${x.age.toFixed(1)} days since the new moon`))),
        notes,
        h('table', { class: 'act-facts' }, sunRows),
        h('p', { class: 'ac-season' }, seasonText),
        h('div', { class: 'wc-lh' }, 'On this day in history'),
        otd));
      api.setCrumbs([`${MONTHS[month]} ${x.d}`]);
      Wiki.onThisDay(date, 'selected').then((r) => {
        if (t !== token) return;
        const events = (r.selected || []).slice(0, 4);
        otd.replaceChildren(...events.map((e) => {
          const page = e.pages?.[0];
          return h('button', { class: 'ac-ev', onclick: () => page && api.openArticle(page.titles?.normalized || page.title) },
            h('b', {}, String(e.year)), h('span', {}, e.text));
        }));
        if (!events.length) otd.replaceChildren(h('div', { class: 'ac-loading' }, 'No events listed for this date.'));
      }).catch(() => { if (t === token) otd.replaceChildren(h('div', { class: 'ac-loading' }, Wiki.connected() ? 'Couldn’t load events right now.' : 'Events need an internet connection.')); });
    }

    draw();
    api.setIdle('Almanac Calendar');
    return () => { token++; };
  }

  function art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 200 120', class: 'ac-art' });
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
      const age = ((r * 7 + c) * 1.4) % SYNODIC, f = age / SYNODIC, k = Math.cos(2 * Math.PI * f), rx = Math.abs(k) * 6;
      const waxing = f < 0.5, inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
      const x = 30 + c * 23.5, y = 34 + r * 28;
      cells.push(`<rect x="${x - 10}" y="${y - 12}" width="21" height="25" rx="2" fill="#0a183c" fill-opacity=".55" stroke="#9fb4e6" stroke-opacity=".3"/>
        <g transform="translate(${x} ${y + 2})"><circle r="6" fill="#1b2a52"/><path d="M0,-6 A6,6 0 0 ${waxing ? 1 : 0} 0,6 A${rx.toFixed(2)},6 0 0 ${inner} 0,-6Z" fill="#f4ecd0"/></g>`);
    }
    s.innerHTML = cells.join('');
    return s;
  }

  E2KActivities.register({
    id: 'almanac',
    name: 'Almanac Calendar',
    category: 'Science',
    blurb: 'A month of moon phases, sunrise and sunset, the seasons, and full moon names for any city, with history from each day.',
    art, mount,
  });
})();
