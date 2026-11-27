// Games: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['games'] = (A) => {
  'use strict';
  const { h } = A;
  const { setIdle, mount, focusScreen } = A.fn;

  // Games are listed first on the Activities page; each game has its own screen.
  function viewGame(id, token) {
    const game = E2KGames.get(id);
    if (!game) throw Object.assign(new Error('Game not found'), { status: 404 });
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    A.gameCleanup = game.mount(root, A.E2K) || null;
    focusScreen(root);
    setIdle(game.name);
  }

  return { viewGame };
};
