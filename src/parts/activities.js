// Activities: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['activities'] = (A) => {
  'use strict';
  const { h } = A;
  const { setIdle, go, mount, focusScreen, shell, railLink } = A.fn;

  function viewActivities(token) {
    const pg = shell({ title: 'Activities', desc: 'Games, interactive tools, and explorations', wide: true });
    const open = (a) => go(A.routeOf(a));
    const card = (a) => {
      const r = A.routeOf(a);
      const on = A.isStarred(r);
      return h('div', { class: 'gwrap' },
        h('button', { class: 'gcard', onclick: () => open(a) },
          h('div', { class: 'gart' }, a.art ? a.art(A.E2K) : null),
          h('div', { class: 'gb' }, h('b', {}, a.name), h('p', {}, a.blurb), h('div', { class: 'gfoot' },
            h('span', { class: 'gprog' }, a.game && a.progress ? a.progress(A.E2K) : ''), h('span', { class: 'gplay' }, a.game ? 'Play ›' : 'Open ›')))),
        h('button', { class: 'gstar' + (on ? ' on' : ''), 'data-r': r, 'aria-pressed': String(on), 'aria-label': `Star ${a.name}`, title: on ? 'Unstar' : 'Star',
          onclick: (e) => { const y = e.currentTarget.getBoundingClientRect().top; A.setStar(r, !on); draw(r, y); } }, on ? '★' : '☆'));
    };
    const count = (cat, n) => (cat === 'Games' ? `${n} ${n === 1 ? 'game' : 'games'}` : `${n} ${n === 1 ? 'activity' : 'activities'}`);
    let sections = [], chips = [];
    function filter(cat) {
      A.activityFilter = cat;
      chips.forEach((c) => c.classList.toggle('on', c.dataset.cat === cat));
      sections.forEach((sec) => { sec.hidden = cat !== 'All' && sec.dataset.cat !== cat; });
    }
    // Starred first, then Games, then the activities grouped by subject (see E2KActivities.categories); activities
    // without a category go in "More". Drawn again when a star changes (focus goes back to that star).
    function draw(focusStar, keepY) {
      const games = E2KGames.list.map((g) => ({ ...g, game: true }));
      const all = [...games, ...E2KActivities.list];
      const stars = A.starred().map((r) => all.find((a) => A.routeOf(a) === r)).filter(Boolean);
      const groups = [['Starred', stars], ['Games', games], ...[...E2KActivities.categories, 'More']
        .map((cat) => [cat, E2KActivities.list.filter((a) => (E2KActivities.categories.includes(a.category) ? a.category : 'More') === cat)])]
        .filter(([, items]) => items.length);
      const label = (cat) => (cat === 'Starred' ? '★ Starred' : cat);
      pg.railIn.replaceChildren();
      pg.text.replaceChildren();
      sections = groups.map(([cat, items], i) => {
        pg.railIn.append(...(i ? [h('hr')] : []), h('h4', {}, label(cat)), ...items.map((a) => railLink(a.name, () => open(a), 'sub')));
        const sec = h('section', { class: 'act-group' + (cat === 'Starred' ? ' starred' : ''), 'data-cat': cat },
          h('h3', { 'aria-level': 2 }, label(cat), h('span', {}, count(cat, items.length))),
          h('div', { class: 'gcards' }, items.map(card)));
        pg.text.append(sec);
        return sec;
      });
      // Subject buttons in the header, styled like World Explorer's region buttons. The choice is kept for the session.
      chips = ['All', ...groups.map(([cat]) => cat)].map((cat) => h('button', { class: 'wx-chip', 'data-cat': cat, onclick: () => filter(cat) }, label(cat)));
      pg.toolsEl.replaceChildren(...chips);
      filter(groups.some(([cat]) => cat === A.activityFilter) ? A.activityFilter : 'All');
      if (focusStar) {
        // The same card's star (in its subject's section, not the Starred row, which may have just changed).
        const btns = [...pg.text.querySelectorAll(`.gstar[data-r="${CSS.escape(focusStar)}"]`)];
        const b = btns.find((x) => !x.closest('.starred')) || btns[0];
        if (b && keepY != null) {
          let sc = b.parentElement;
          while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
          if (sc) sc.scrollTop += b.getBoundingClientRect().top - keepY;
        }
        b?.focus({ preventScroll: true });
      }
    }
    draw();
    mount(pg.root, token);
    setIdle();
  }

  function viewActivity(id, token) {
    const activity = E2KActivities.get(id);
    if (!activity) throw Object.assign(new Error('Activity not found'), { status: 404 });
    if (activity.route) return go(activity.route, { replace: true });
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    A.gameCleanup = activity.mount(root, A.E2K) || null;
    focusScreen(root);
    setIdle(activity.name);
  }

  return { viewActivities, viewActivity };
};
