// World Clock: the world map with day and night shading that follows the Sun, and clocks for cities you choose.
// Times come from the computer's own clock and time-zone data; nothing is fetched except the map, which ships with the app.
(() => {
  // name, country, latitude, longitude, IANA time zone
  const CITIES = [
    ['Honolulu', 'United States', 21.31, -157.86, 'Pacific/Honolulu'],
    ['Anchorage', 'United States', 61.22, -149.9, 'America/Anchorage'],
    ['Vancouver', 'Canada', 49.28, -123.12, 'America/Vancouver'],
    ['Los Angeles', 'United States', 34.05, -118.24, 'America/Los_Angeles'],
    ['San Francisco', 'United States', 37.77, -122.42, 'America/Los_Angeles'],
    ['Seattle', 'United States', 47.61, -122.33, 'America/Los_Angeles'],
    ['Denver', 'United States', 39.74, -104.99, 'America/Denver'],
    ['Phoenix', 'United States', 33.45, -112.07, 'America/Phoenix'],
    ['Mexico City', 'Mexico', 19.43, -99.13, 'America/Mexico_City'],
    ['Chicago', 'United States', 41.88, -87.63, 'America/Chicago'],
    ['Dallas', 'United States', 32.78, -96.8, 'America/Chicago'],
    ['Houston', 'United States', 29.76, -95.37, 'America/Chicago'],
    ['Toronto', 'Canada', 43.65, -79.38, 'America/Toronto'],
    ['New York', 'United States', 40.71, -74.01, 'America/New_York'],
    ['Washington, D.C.', 'United States', 38.9, -77.04, 'America/New_York'],
    ['Miami', 'United States', 25.76, -80.19, 'America/New_York'],
    ['Havana', 'Cuba', 23.11, -82.37, 'America/Havana'],
    ['Bogotá', 'Colombia', 4.71, -74.07, 'America/Bogota'],
    ['Lima', 'Peru', -12.05, -77.04, 'America/Lima'],
    ['Santiago', 'Chile', -33.45, -70.67, 'America/Santiago'],
    ['Buenos Aires', 'Argentina', -34.6, -58.38, 'America/Argentina/Buenos_Aires'],
    ['São Paulo', 'Brazil', -23.55, -46.63, 'America/Sao_Paulo'],
    ['Rio de Janeiro', 'Brazil', -22.91, -43.17, 'America/Sao_Paulo'],
    ['Reykjavík', 'Iceland', 64.15, -21.94, 'Atlantic/Reykjavik'],
    ['Dublin', 'Ireland', 53.35, -6.26, 'Europe/Dublin'],
    ['London', 'United Kingdom', 51.51, -0.13, 'Europe/London'],
    ['Lisbon', 'Portugal', 38.72, -9.14, 'Europe/Lisbon'],
    ['Madrid', 'Spain', 40.42, -3.7, 'Europe/Madrid'],
    ['Paris', 'France', 48.86, 2.35, 'Europe/Paris'],
    ['Amsterdam', 'Netherlands', 52.37, 4.9, 'Europe/Amsterdam'],
    ['Berlin', 'Germany', 52.52, 13.4, 'Europe/Berlin'],
    ['Rome', 'Italy', 41.9, 12.5, 'Europe/Rome'],
    ['Stockholm', 'Sweden', 59.33, 18.07, 'Europe/Stockholm'],
    ['Warsaw', 'Poland', 52.23, 21.01, 'Europe/Warsaw'],
    ['Athens', 'Greece', 37.98, 23.73, 'Europe/Athens'],
    ['Istanbul', 'Turkey', 41.01, 28.98, 'Europe/Istanbul'],
    ['Kyiv', 'Ukraine', 50.45, 30.52, 'Europe/Kyiv'],
    ['Moscow', 'Russia', 55.76, 37.62, 'Europe/Moscow'],
    ['Cairo', 'Egypt', 30.04, 31.24, 'Africa/Cairo'],
    ['Lagos', 'Nigeria', 6.52, 3.38, 'Africa/Lagos'],
    ['Nairobi', 'Kenya', -1.29, 36.82, 'Africa/Nairobi'],
    ['Johannesburg', 'South Africa', -26.2, 28.05, 'Africa/Johannesburg'],
    ['Cape Town', 'South Africa', -33.92, 18.42, 'Africa/Johannesburg'],
    ['Casablanca', 'Morocco', 33.57, -7.59, 'Africa/Casablanca'],
    ['Jerusalem', 'Israel', 31.77, 35.21, 'Asia/Jerusalem'],
    ['Riyadh', 'Saudi Arabia', 24.71, 46.68, 'Asia/Riyadh'],
    ['Dubai', 'United Arab Emirates', 25.2, 55.27, 'Asia/Dubai'],
    ['Tehran', 'Iran', 35.69, 51.39, 'Asia/Tehran'],
    ['Karachi', 'Pakistan', 24.86, 67.0, 'Asia/Karachi'],
    ['New Delhi', 'India', 28.61, 77.21, 'Asia/Kolkata'],
    ['Mumbai', 'India', 19.08, 72.88, 'Asia/Kolkata'],
    ['Kathmandu', 'Nepal', 27.72, 85.32, 'Asia/Kathmandu'],
    ['Dhaka', 'Bangladesh', 23.81, 90.41, 'Asia/Dhaka'],
    ['Bangkok', 'Thailand', 13.76, 100.5, 'Asia/Bangkok'],
    ['Jakarta', 'Indonesia', -6.21, 106.85, 'Asia/Jakarta'],
    ['Singapore', 'Singapore', 1.35, 103.82, 'Asia/Singapore'],
    ['Hong Kong', 'China', 22.32, 114.17, 'Asia/Hong_Kong'],
    ['Beijing', 'China', 39.9, 116.41, 'Asia/Shanghai'],
    ['Shanghai', 'China', 31.23, 121.47, 'Asia/Shanghai'],
    ['Manila', 'Philippines', 14.6, 120.98, 'Asia/Manila'],
    ['Taipei', 'Taiwan', 25.03, 121.57, 'Asia/Taipei'],
    ['Seoul', 'South Korea', 37.57, 126.98, 'Asia/Seoul'],
    ['Tokyo', 'Japan', 35.68, 139.69, 'Asia/Tokyo'],
    ['Perth', 'Australia', -31.95, 115.86, 'Australia/Perth'],
    ['Darwin', 'Australia', -12.46, 130.84, 'Australia/Darwin'],
    ['Brisbane', 'Australia', -27.47, 153.03, 'Australia/Brisbane'],
    ['Sydney', 'Australia', -33.87, 151.21, 'Australia/Sydney'],
    ['Melbourne', 'Australia', -37.81, 144.96, 'Australia/Melbourne'],
    ['Auckland', 'New Zealand', -36.85, 174.76, 'Pacific/Auckland'],
    ['Fiji', 'Fiji', -18.14, 178.44, 'Pacific/Fiji'],
  ].map(([name, country, lat, lon, tz]) => ({ name, country, lat, lon, tz }));
  window.E2KActivities.cities = CITIES; // shared with the Almanac Calendar
  const DEFAULTS = ['Los Angeles', 'New York', 'São Paulo', 'London', 'Paris', 'Cairo', 'Dubai', 'New Delhi', 'Beijing', 'Tokyo', 'Sydney'];
  const RAD = Math.PI / 180;

  // ---------- the map's projection ----------
  // Natural Earth, with the same scale and position tools/make-map.mjs used to draw the country outlines.
  function project(proj, lon, lat) {
    const l = lon * RAD, p = lat * RAD, p2 = p * p, p4 = p2 * p2;
    const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
    const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    return [proj.translate[0] + proj.scale * x, proj.translate[1] - proj.scale * y];
  }
  const pathOf = (proj, pts) => 'M' + pts.map(([lon, lat]) => project(proj, lon, lat).map((n) => n.toFixed(1)).join(',')).join('L') + 'Z';

  // ---------- where the Sun is ----------
  // The point on Earth with the Sun directly overhead (a standard low-precision formula, good to a fraction of a degree).
  function subsolar(date) {
    const n = date.getTime() / 864e5 + 2440587.5 - 2451545;
    const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, eps = (23.439 - 0.0000004 * n) * RAD;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    let lon = ra - gmst * 15;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec / RAD, lon };
  }
  // The night side of the Earth, as a ring of longitude/latitude points: the day-night line, then around the dark pole.
  function nightRing(sun) {
    const dec = (Math.abs(sun.lat) < 0.1 ? (sun.lat < 0 ? -0.1 : 0.1) : sun.lat) * RAD;
    const edge = (lon) => Math.atan(-Math.cos((lon - sun.lon) * RAD) / Math.tan(dec)) / RAD;
    const pole = dec > 0 ? -90 : 90;
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 2) pts.push([lon, edge(lon)]);
    const e = edge(180), w = edge(-180);
    for (let i = 1; i <= 12; i++) pts.push([180, e + (pole - e) * i / 12]);
    for (let lon = 180; lon >= -180; lon -= 4) pts.push([lon, pole]);
    for (let i = 11; i >= 1; i--) pts.push([-180, w + (pole - w) * i / 12]);
    return pts;
  }
  // How high the Sun is in a city's sky, in degrees (negative means night).
  function sunAltitude(sun, lat, lon) {
    const d = sun.lat * RAD, p = lat * RAD, H = (lon - sun.lon) * RAD;
    return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) / RAD;
  }

  // ---------- time-zone helpers ----------
  const fmt = (tz, opts) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
  const timeIn = (tz, d) => fmt(tz, E2KTime.opts()).format(d);
  // Minutes ahead of UTC for a time zone at a given moment (handles daylight saving time).
  function offsetOf(tz, d) {
    const parts = Object.fromEntries(fmt(tz, { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(d).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
    return Math.round((asUTC - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  }
  const utcLabel = (m) => `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? ':' + String(Math.abs(m) % 60).padStart(2, '0') : ''}`;
  function relLabel(diff, dayShift) {
    const hrs = Math.abs(diff) / 60;
    const n = Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1).replace(/\.0$/, '');
    const when = dayShift > 0 ? 'Tomorrow' : dayShift < 0 ? 'Yesterday' : 'Today';
    return diff === 0 ? `${when}, same time` : `${when}, ${n} ${hrs === 1 ? 'hour' : 'hours'} ${diff > 0 ? 'ahead' : 'behind'}`;
  }
  // "2026-10-15": sorts correctly, so comparing two of these tells which city is a day ahead.
  // Whether a time zone is on daylight saving (summer) time right now: its offset is ahead of its winter offset.
  function onDST(tz, d) {
    const y = d.getUTCFullYear();
    const jan = offsetOf(tz, new Date(Date.UTC(y, 0, 1))), jul = offsetOf(tz, new Date(Date.UTC(y, 6, 1)));
    return jan !== jul && offsetOf(tz, d) === Math.max(jan, jul);
  }
  const zoneName = (tz, d) => fmt(tz, { timeZoneName: 'long' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value || '';
  const dayKey = (tz, d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

  function mount(root, api) {
    const { h, svg } = api;
    root.classList.add('act', 'wc');
    let disposed = false, timer = 0;
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    let picked = api.store.get('worldClock', null);
    if (!Array.isArray(picked)) picked = DEFAULTS.slice();
    const save = () => api.store.set('worldClock', picked);

    const mapBox = h('div', { class: 'wc-map' }, h('div', { class: 'wc-loading' }, 'Loading the map…'));
    const card = h('div', { class: 'act-card wc-card' });
    root.append(
      h('div', { class: 'act-head' }, h('div', {}, h('h1', {}, 'World Clock'))),
      mapBox,
      h('div', { class: 'wc-hint' }, 'The shaded side of the Earth is in night right now. Click a city to add or remove its clock. Scroll to zoom, drag to move.'),
      card);

    // ---------- the right-hand card ----------
    const bigTime = h('div', { class: 'wc-big' });
    const bigDate = h('div', { class: 'wc-date' });
    const bigZone = h('div', { class: 'wc-zone' });
    const face = svg('svg', { viewBox: '0 0 100 100', class: 'wc-face' });
    face.innerHTML = '<circle cx="50" cy="50" r="46" class="rim"/>' +
      Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="9" x2="50" y2="${i % 3 ? 14 : 17}" transform="rotate(${i * 30} 50 50)" class="tick"/>`).join('') +
      '<line x1="50" y1="50" x2="50" y2="27" class="hr"/><line x1="50" y1="50" x2="50" y2="16" class="mn"/><line x1="50" y1="56" x2="50" y2="12" class="sc"/><circle cx="50" cy="50" r="2.6" class="pin"/>';
    const hands = { hr: face.querySelector('.hr'), mn: face.querySelector('.mn'), sc: face.querySelector('.sc') };
    const list = h('div', { class: 'wc-list' });
    const addInput = h('input', { class: 'wc-add', placeholder: 'Add a city, such as Cairo', spellcheck: 'false' });
    const sug = h('div', { class: 'wc-sug', hidden: true });
    const restoreBtn = h('button', { class: 'wc-restore', onclick: () => { picked = DEFAULTS.slice(); save(); drawList(); drawDots(); } }, 'Restore default cities');
    card.append(h('div', { class: 'act-cb' },
      h('small', {}, 'YOUR TIME'),
      h('div', { class: 'wc-top' }, face, h('div', {}, bigTime, bigDate, bigZone)),
      h('div', { class: 'wc-lh' }, 'Around the world'),
      list,
      h('div', { class: 'wc-addrow' }, addInput, sug),
      restoreBtn));

    function toggle(name) {
      picked = picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name];
      save();
      drawList();
      drawDots();
    }
    function drawList() {
      const now = new Date();
      const myOff = offsetOf(here, now), myDay = dayKey(here, now);
      const sun = subsolar(now);
      list.replaceChildren(...picked.map((name) => CITIES.find((c) => c.name === name)).filter(Boolean).map((c) => {
        const off = offsetOf(c.tz, now);
        const dk = dayKey(c.tz, now);
        const shift = dk === myDay ? 0 : dk > myDay ? 1 : -1;
        const day = sunAltitude(sun, c.lat, c.lon) > -0.83;
        return h('div', { class: 'wc-row' + (day ? ' day' : ' night') },
          h('i', { class: 'wc-sky', title: day ? 'Daytime' : 'Nighttime' }, day ? '☀' : '☾'),
          h('div', { class: 'wc-city' }, h('b', {}, c.name,
            onDST(c.tz, now) ? h('em', { class: 'wc-dst', title: `${c.name} is on daylight saving time: clocks are one hour ahead of standard time.` }, 'DST') : ''),
            h('span', {}, relLabel(off - myOff, shift))),
          h('div', { class: 'wc-t' }, timeIn(c.tz, now)),
          h('button', { class: 'wc-x', title: `Remove ${c.name}`, onclick: () => toggle(c.name) }, '×'));
      }));
      // Only offer the reset when the list differs from the defaults.
      restoreBtn.hidden = picked.length === DEFAULTS.length && DEFAULTS.every((n) => picked.includes(n));
      if (!picked.length) list.append(h('div', { class: 'wc-empty' }, 'Add a city below, or click one on the map.'));
    }
    function tickClock() {
      const now = new Date();
      const parts = Object.fromEntries(fmt(here, { hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now).map((p) => [p.type, +p.value || 0]));
      const s = parts.second, m = parts.minute + s / 60, hr = (parts.hour % 12) + m / 60;
      hands.sc.setAttribute('transform', `rotate(${s * 6} 50 50)`);
      hands.mn.setAttribute('transform', `rotate(${m * 6} 50 50)`);
      hands.hr.setAttribute('transform', `rotate(${hr * 30} 50 50)`);
      bigTime.textContent = fmt(here, E2KTime.opts({ seconds: true })).format(now);
      bigDate.textContent = fmt(here, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
      const city = here.split('/').pop().replace(/_/g, ' ');
      const dst = onDST(here, now);
      bigZone.replaceChildren(`${zoneName(here, now) || city + ' time'} · ${utcLabel(offsetOf(here, now))}`,
        dst ? h('span', { class: 'wc-dst', title: 'Clocks here are set one hour ahead for daylight saving time.' }, 'Daylight saving time') : '');
      if (s === 0) { drawList(); drawNight(); }
    }

    // ---------- adding cities ----------
    let matches = [], sel = -1;
    function showSug() {
      const q = addInput.value.trim().toLowerCase();
      matches = q ? CITIES.filter((c) => !picked.includes(c.name) && (c.name.toLowerCase().includes(q) || c.country.toLowerCase().startsWith(q))).slice(0, 6) : [];
      sel = matches.length ? 0 : -1;
      sug.replaceChildren(...matches.map((c, i) => h('div', { class: 'wc-si' + (i === sel ? ' sel' : ''), onmousedown: (e) => { e.preventDefault(); pick(c); } },
        c.name, h('span', {}, c.country))));
      if (q && !matches.length) sug.append(h('div', { class: 'wc-si none' }, 'No matching city'));
      sug.hidden = !q;
    }
    function pick(c) { addInput.value = ''; sug.hidden = true; if (!picked.includes(c.name)) toggle(c.name); }
    addInput.addEventListener('input', showSug);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); sel = (sel + 1) % matches.length; showSug2(); }
      else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); sel = (sel - 1 + matches.length) % matches.length; showSug2(); }
      else if (e.key === 'Enter' && matches[sel]) pick(matches[sel]);
      else if (e.key === 'Escape') { sug.hidden = true; e.stopPropagation(); }
    });
    addInput.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
    const showSug2 = () => [...sug.children].forEach((el, i) => el.classList.toggle('sel', i === sel));

    // ---------- the map ----------
    let night = null, sunDot = null, dots = null, proj = null, tip = null, map = null, M = null;
    const vb = { x: 0, y: 0, w: 1000, h: 500 };
    const k = () => vb.w / M.w; // how far zoomed out (1 = the whole map)
    function drawNight() {
      if (!night) return;
      const sun = subsolar(new Date());
      night.setAttribute('d', pathOf(proj, nightRing(sun)));
      const [x, y] = project(proj, sun.lon, sun.lat);
      sunDot.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${Math.max(0.35, k()).toFixed(3)})`);
    }
    function drawDots() {
      if (!dots) return;
      dots.replaceChildren(...CITIES.map((c) => {
        const [x, y] = project(proj, c.lon, c.lat);
        const on = picked.includes(c.name);
        const g = svg('g', { class: 'wc-dot' + (on ? ' on' : ''), 'data-name': c.name, 'data-x': x, 'data-y': y },
          svg('circle', { r: 8, class: 'hit' }), svg('circle', { r: on ? 3.2 : 2 }));
        if (on) g.append(svg('text', { x: 6, y: 4, class: 'wc-lbl' }, c.name));
        g.addEventListener('mouseenter', () => { if (drag?.moved) return; tip.textContent = `${c.name} · ${timeIn(c.tz, new Date())}`; tip.hidden = false; place(g); });
        g.addEventListener('mouseleave', () => { tip.hidden = true; });
        return g;
      }));
      scaleDots();
    }
    // Dots, labels, and the Sun stay the same size on screen at any zoom.
    function scaleDots() {
      if (!dots) return;
      const s = Math.max(0.35, k()).toFixed(3);
      for (const g of dots.children) g.setAttribute('transform', `translate(${(+g.dataset.x).toFixed(1)} ${(+g.dataset.y).toFixed(1)}) scale(${s})`);
      drawNight();
    }

    // ---------- zoom and pan (the same feel as World Explorer) ----------
    const MIN_W = 60;
    let anim = 0, drag = null;
    function clamp(v) {
      const w = Math.min(M.w, Math.max(MIN_W, v.w)), hh = w * (M.h / M.w);
      return { w, h: hh, x: Math.min(M.w - w * 0.5, Math.max(-w * 0.5, v.x)), y: Math.min(M.h - hh * 0.5, Math.max(-hh * 0.5, v.y)) };
    }
    function apply() {
      map.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      // Keep the day-night edge equally soft at any zoom (a fixed blur would smear across the whole view when zoomed in).
      map.querySelector('#wc-soft feGaussianBlur')?.setAttribute('stdDeviation', (4 * k()).toFixed(2));
      scaleDots();
    }
    function setView(v, animate = true) {
      const to = clamp(v);
      cancelAnimationFrame(anim);
      if (!animate || document.documentElement.classList.contains('no-anim')) { Object.assign(vb, to); apply(); return; }
      const from = { ...vb }, t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - p, 3);
        for (const key of ['x', 'y', 'w', 'h']) vb[key] = from[key] + (to[key] - from[key]) * e;
        apply();
        if (p < 1 && !disposed) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const toMap = (cx, cy) => { const pt = new DOMPoint(cx, cy).matrixTransform(map.getScreenCTM().inverse()); return [pt.x, pt.y]; };
    function zoomBy(f, at) {
      const [px, py] = at || [vb.x + vb.w / 2, vb.y + vb.h / 2];
      const w = Math.min(M.w, Math.max(MIN_W, vb.w * f)), s2 = w / vb.w;
      setView({ x: px - (px - vb.x) * s2, y: py - (py - vb.y) * s2, w }, !at);
    }
    function wire() {
      map.addEventListener('wheel', (e) => { e.preventDefault(); cancelAnimationFrame(anim); zoomBy(e.deltaY > 0 ? 1.25 : 0.8, toMap(e.clientX, e.clientY)); }, { passive: false });
      map.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        cancelAnimationFrame(anim);
        drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, scale: vb.w / map.getBoundingClientRect().width };
        map.setPointerCapture(e.pointerId);
      });
      map.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; map.classList.add('dragging'); tip.hidden = true; }
        if (drag.moved) { Object.assign(vb, clamp({ ...vb, x: drag.vx - dx * drag.scale, y: drag.vy - dy * drag.scale })); apply(); }
      });
      map.addEventListener('pointerup', (e) => {
        const d = drag;
        drag = null;
        map.classList.remove('dragging');
        if (d && !d.moved) {
          const g = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest?.('.wc-dot')).find(Boolean);
          if (g) { tip.hidden = true; toggle(g.dataset.name); }
        }
      });
    }
    function place(g) {
      const r = g.getBoundingClientRect(), b = mapBox.getBoundingClientRect();
      tip.style.left = (r.left - b.left + r.width / 2) + 'px';
      tip.style.top = (r.top - b.top - 8) + 'px';
    }
    async function loadMap() {
      if (!window.E2KWorldMap) {
        await new Promise((resolve, reject) => document.head.append(h('script', { src: 'world/map-data.js', onload: resolve, onerror: reject })));
      }
      if (disposed) return;
      M = window.E2KWorldMap;
      proj = M.proj;
      Object.assign(vb, { x: 0, y: 0, w: M.w, h: M.h });
      map = svg('svg', { viewBox: `0 0 ${M.w} ${M.h}`, class: 'wc-svg', preserveAspectRatio: 'xMidYMid meet' });
      // The map leaves out Antarctica and the far Arctic, so the ocean and the night shading stop where the map does.
      const outline = [];
      for (let lat = -60; lat <= 84; lat += 4) outline.push([-180, lat]);
      for (let lon = -180; lon <= 180; lon += 6) outline.push([lon, 84]);
      for (let lat = 84; lat >= -60; lat -= 4) outline.push([180, lat]);
      for (let lon = 180; lon >= -180; lon -= 6) outline.push([lon, -60]);
      const defs = svg('defs');
      defs.innerHTML = `<clipPath id="wc-clip"><path d="${pathOf(proj, outline)}"/></clipPath>
        <filter id="wc-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="4"/></filter>
        <radialGradient id="wc-sun"><stop offset="0" stop-color="#fff8d8"/><stop offset=".4" stop-color="#ffd27a"/><stop offset="1" stop-color="#f5a623" stop-opacity="0"/></radialGradient>`;
      night = svg('path', { class: 'wc-night', filter: 'url(#wc-soft)' });
      sunDot = svg('g', { class: 'wc-sundot' }, svg('circle', { r: 14, fill: 'url(#wc-sun)' }), svg('circle', { r: 4.5, fill: '#fff3c4' }));
      dots = svg('g');
      map.append(defs,
        svg('path', { d: pathOf(proj, outline), class: 'wc-ocean' }),
        svg('path', { d: M.grid, class: 'wx-grid' }),
        svg('g', {}, M.inert ? svg('path', { d: M.inert, class: 'wc-land' }) : null, ...M.countries.map((c) => svg('path', { d: c.d, class: 'wc-land' }))),
        svg('g', { 'clip-path': 'url(#wc-clip)' }, night),
        sunDot, dots);
      tip = h('div', { class: 'wx-tip', hidden: true });
      mapBox.replaceChildren(h('div', { class: 'wc-map-in' }, map), tip,
        h('div', { class: 'wx-zoom wc-zoom' },
          h('button', { title: 'Zoom in', onclick: () => zoomBy(1 / 1.6) }, '+'),
          h('button', { title: 'Zoom out', onclick: () => zoomBy(1.6) }, '−')));
      wire();
      drawNight();
      drawDots();
    }

    drawList();
    tickClock();
    timer = setInterval(tickClock, 1000);
    loadMap().catch(() => { if (!disposed) mapBox.replaceChildren(h('div', { class: 'wc-loading' }, 'The map couldn’t be loaded.')); });
    api.setIdle('World Clock');
    return () => { disposed = true; clearInterval(timer); };
  }

  function art(api) {
    const { svg } = api;
    const s = svg('svg', { viewBox: '0 0 200 120', class: 'wc-art' });
    s.innerHTML = `<defs><linearGradient id="wc-art-n" x1="0" x2="1"><stop offset="0" stop-color="#050c1e" stop-opacity="0"/><stop offset=".25" stop-color="#050c1e" stop-opacity=".75"/><stop offset=".75" stop-color="#050c1e" stop-opacity=".75"/><stop offset="1" stop-color="#050c1e" stop-opacity="0"/></linearGradient></defs>
      <ellipse cx="100" cy="60" rx="88" ry="46" fill="#1d4f8f"/>
      <path d="M40 40 q14 -10 28 -2 q8 10 -4 18 q-12 4 -16 16 q-10 -6 -12 -16 z M92 30 q20 -6 38 2 q10 8 4 18 q-10 2 -14 14 q-8 8 -18 2 q-6 -14 -10 -20 z M140 66 q14 -4 22 6 q-4 10 -16 10 q-8 -6 -6 -16 z" fill="#cfe0f5" opacity=".85"/>
      <path d="M118 14 C 104 40 104 80 118 106 L 188 106 L 188 14 Z" fill="url(#wc-art-n)"/>
      <circle cx="52" cy="66" r="5" fill="#ffd27a"/><circle cx="52" cy="66" r="11" fill="#ffd27a" opacity=".25"/>
      <g transform="translate(160 30)"><circle r="17" fill="#0f2250" stroke="#cfe0f5" stroke-width="2"/><line y2="-11" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x2="8" y2="4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>`;
    return s;
  }

  E2KActivities.register({
    id: 'world-clock',
    name: 'World Clock',
    category: 'Geography',
    blurb: 'See where it’s day and night right now on a live map of the world, and keep clocks for the cities you care about.',
    art, mount,
  });
})();
