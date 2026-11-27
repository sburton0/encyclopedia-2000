// Starred activities: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['starred'] = (A) => {
  'use strict';
  const { store } = A;
  const { route, setIdle, announce, drawCrumbs } = A.fn;

  // Games and activities can be starred (on their cards, or with the location bar's Star button inside them); starred
  // ones are listed first on the Activities page, in the order they were starred. Kept by route ("game/passport",
  // "activity/animal-sounds", "world").
  const starred = () => store.get('starred', []).filter((r) => starTarget(r));
  function starTarget(r) {
    const [kind, id] = r.split('/');
    if (kind === 'game') return E2KGames.get(id) || null;
    if (kind === 'activity') return E2KActivities.get(id) || null;
    return E2KActivities.list.find((a) => a.route === r) || null;
  }
  const routeOf = (a) => (a.game ? route('game', a.id) : a.route || route('activity', a.id));
  const isStarred = (r) => store.get('starred', []).includes(r);
  function setStar(r, on) {
    const list = store.get('starred', []).filter((x) => x !== r);
    if (on) list.push(r);
    store.set('starred', list);
    const name = starTarget(r)?.name || '';
    setIdle(on ? `Starred ${name}` : `Unstarred ${name}`);
    announce(on ? `${name} starred` : `${name} unstarred`);
    drawCrumbs();
  }

  return { starred, starTarget, routeOf, isStarred, setStar };
};
