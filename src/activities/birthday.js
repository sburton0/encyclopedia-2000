// The Day You Were Born: pick a birthday to see your age, the news that day, famous people who share it, and other events on that date.
(() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const cache = new Map(); // "7-20" -> { births, events }

  async function dayData(m, d) {
    const key = `${m}-${d}`;
    if (!cache.has(key)) {
      const date = new Date(2000, m - 1, d);
      // Offline, Wikipedia's birthday lists aren't available; the date's saved highlights stand in for its events.
      cache.set(key, Promise.all([Wiki.onThisDay(date, 'births'), Wiki.onThisDay(date, 'events')])
        .then(([b, e]) => (b.offline ? { offline: true, births: [], events: e.selected || [] } : { births: b.births || [], events: e.events || [] }))
        .catch((err) => { cache.delete(key); throw err; }));
    }
    return cache.get(key);
  }

  const daysIn = (m, y) => new Date(y || 2000, m, 0).getDate();
  const titleOf = (p) => (p.titles?.normalized || p.title || '').replace(/_/g, ' ');
  // "American actor (born 1969)" -> "American actor"
  const plainDesc = (s) => (s || '').replace(/\s*\((born |b\. )?\d+(\s*[–-]\s*\d+)?\)$/, '');

  function mount(root, api) {
    const { h } = api;
    root.classList.add('act');
    const saved = api.store.get('birthday', null);
    let tab = 'births';
    let token = 0;

    const month = h('select', { 'aria-label': 'Month' }, MONTHS.map((n, i) => h('option', { value: i + 1 }, n)));
    const day = h('select', { 'aria-label': 'Day' });
    const year = h('input', { 'aria-label': 'Year', placeholder: 'Year', maxlength: 4, inputmode: 'numeric' });
    const fillDays = () => {
      const keep = Number(day.value) || 1;
      const n = daysIn(Number(month.value), Number(year.value) || 2000);
      day.replaceChildren(...Array.from({ length: n }, (_, i) => h('option', { value: i + 1 }, String(i + 1))));
      day.value = String(Math.min(keep, n));
    };
    month.addEventListener('change', fillDays);
    year.addEventListener('change', fillDays);
    year.addEventListener('keydown', (e) => { if (e.key === 'Enter') show(); });
    const now = new Date();
    month.value = String(saved?.m || now.getMonth() + 1);
    fillDays();
    day.value = String(saved?.d || now.getDate());
    year.value = saved?.y ? String(saved.y) : '';

    const left = h('div', { class: 'act-panel bd-left' });
    const tabs = h('div', { class: 'bd-tabs' },
      h('button', { 'data-tab': 'births', onclick: () => setTab('births') }, 'Famous Birthdays'),
      h('button', { 'data-tab': 'events', onclick: () => setTab('events') }, 'On This Day in History'));
    const list = h('div', { class: 'act-scroll' });
    root.append(
      h('div', { class: 'act-head' },
        h('div', {}, h('h1', {}, 'The Day You Were Born')),
        h('div', { class: 'bd-pick' }, 'Your birthday', month, day, year, h('button', { class: 'go', onclick: () => show() }, 'Show Me'))),
      h('div', { class: 'bd-body' }, left, h('div', { class: 'act-panel' }, tabs, list)));

    let data = null, Y = 0;
    function setTab(t) {
      tab = t;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      drawList();
    }

    function drawList() {
      list.scrollTop = 0;
      if (!data) return;
      if (tab === 'births') {
        // A dozen famous birthdays spread across the centuries, newest first, people with portraits only.
        const pool = data.births.filter((b) => b.pages?.[0]?.thumbnail).sort((a, b) => a.year - b.year);
        const n = Math.min(12, pool.length);
        const people = Array.from({ length: n }, (_, i) => pool[Math.floor(i * pool.length / n)]).reverse();
        list.replaceChildren(people.length ? h('div', { class: 'bd-grid' }, people.map((b) => {
          const p = b.pages[0];
          const desc = plainDesc(p.description);
          return h('button', { class: 'bd-person', title: titleOf(p), onclick: () => api.openArticle(titleOf(p)) },
            h('i', { style: `background-image:url('${p.thumbnail.source}')` }),
            h('div', {}, h('b', {}, titleOf(p).replace(/ \(.*\)$/, '')), h('span', {}, desc ? `${desc}, born ${b.year}` : `Born ${b.year}`)));
        })) : h('p', { class: 'act-note' }, data.offline ? 'Famous birthdays come from Wikipedia, so they need the internet. The On This Day in History tab has this date’s highlights.' : 'No famous birthdays found for this date.'));
      } else {
        const evs = data.events.filter((e) => e !== headlineOf()).sort((a, b) => b.year - a.year);
        list.replaceChildren(...evs.map((e) => {
          const t = e.pages?.[0] ? titleOf(e.pages[0]) : '';
          return h('button', { class: 'bd-ev', disabled: !t, title: t ? `Read about ${t}` : null, onclick: () => t && api.openArticle(t) },
            h('em', {}, e.year < 0 ? `${-e.year} BC` : String(e.year)), h('div', {}, e.text));
        }));
      }
    }
    const headlineOf = () => data?.events.find((e) => e.year === Y) || null;

    function intro(msg) {
      left.replaceChildren(h('div', { class: 'bd-date' }, h('small', {}, 'WELCOME')),
        h('p', { class: 'bd-line' }, msg || 'Choose the month, day, and year you were born, then click Show Me to see what was happening that day and who shares your birthday.'));
    }

    async function show() {
      const m = Number(month.value), d = Number(day.value), y = Number(year.value);
      const thisYear = new Date().getFullYear();
      if (!/^\d{3,4}$/.test(year.value.trim()) || y < 100 || y > thisYear) {
        intro(year.value.trim() ? `Please enter a year between 100 and ${thisYear}.` : null);
        year.focus();
        return;
      }
      const born = new Date(2000, m - 1, d);
      born.setFullYear(y);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (born > today) { intro('That date hasn’t happened yet. Please choose a date in the past.'); return; }
      api.store.set('birthday', { m, d, y });
      Y = y;
      const my = ++token;
      const days = Math.round((today - born) / 864e5);
      let next = new Date(today.getFullYear(), m - 1, Math.min(d, daysIn(m, today.getFullYear())));
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, Math.min(d, daysIn(m, today.getFullYear() + 1)));
      const toNext = Math.round((next - today) / 864e5);
      const age = today.getFullYear() - y - (today < new Date(today.getFullYear(), m - 1, d) ? 1 : 0);
      const weekday = born.toLocaleDateString('en-US', { weekday: 'long' });
      const headline = h('div', { class: 'bd-headline', hidden: true });
      left.replaceChildren(
        h('div', { class: 'bd-date' }, h('small', {}, 'YOU WERE BORN ON'), h('div', { class: 'wd' }, weekday),
          h('div', { class: 'big' }, `${MONTHS[m - 1]} ${d}`), h('div', { class: 'yr' }, String(y))),
        h('p', { class: 'bd-line' },
          'You are ', h('b', {}, `${age} ${age === 1 ? 'year' : 'years'} old`), ' and have been on Earth for ', h('b', {}, `${days.toLocaleString('en-US')} days`), '. ',
          toNext === 0 ? h('b', {}, 'Happy birthday!') : ['Your next birthday is in ', h('b', {}, `${toNext} ${toNext === 1 ? 'day' : 'days'}`), `, on a ${next.toLocaleDateString('en-US', { weekday: 'long' })}.`]),
        headline);
      list.replaceChildren(h('p', { class: 'act-note' }, 'Looking through the encyclopedia…'));
      api.setStatus('Looking up your birthday…', true);
      try {
        const got = await dayData(m, d);
        if (my !== token) return;
        data = got;
        const top = headlineOf();
        if (top) {
          const t = top.pages?.[0] ? titleOf(top.pages[0]) : '';
          headline.replaceChildren(h('small', {}, 'THE DAY YOU WERE BORN'), h('p', {}, top.text),
            t ? h('button', { class: 'go', onclick: () => api.openArticle(t) }, 'Read more ›') : null);
          headline.hidden = false;
        }
        drawList();
        api.setIdle(`${MONTHS[m - 1]} ${d}, ${y}`);
      } catch {
        if (my !== token) return;
        list.replaceChildren(h('p', { class: 'act-note' }, Wiki.connected() ? 'Couldn’t reach Wikipedia. Please try again.' : 'You’re offline, so this date can’t be looked up.'));
        api.setIdle();
      }
    }

    setTab('births');
    if (saved) show(); else intro();
    return () => { token++; };
  }

  function art(api) {
    const { h } = api;
    return h('div', { class: 'bd-art' }, h('small', {}, 'JULY'), h('b', {}, '20'), h('span', {}, '1969'));
  }

  E2KActivities.register({
    id: 'birthday',
    name: 'The Day You Were Born',
    category: 'History',
    blurb: 'Enter your birthday to see what happened that day, how many days you’ve been alive, and which famous people share your birthday.',
    art, mount,
  });
})();
