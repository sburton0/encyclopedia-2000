// World Explorer: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['world-explorer'] = (A) => {
  'use strict';
  const { h } = A;
  const { setStatus, setIdle, mount, focusScreen, live } = A.fn;

  // The map data is large, so it's only loaded the first time the World Explorer opens.
  const loadScript = (src) => new Promise((resolve, reject) => {
    document.head.append(h('script', { src, onload: resolve, onerror: () => reject(new Error('Couldn’t load ' + src)) }));
  });
  async function viewWorld(token) {
    if (!window.E2KWorldMap) {
      setStatus('Loading the map…', true);
      await loadScript('world/map-data.js');
      if (!live(token)) return;
    }
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    setIdle();
    A.gameCleanup = E2KWorld.mount(root, A.E2K) || null;
    focusScreen(root);
  }

  return { viewWorld };
};
