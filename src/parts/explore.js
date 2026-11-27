// Explore: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['explore'] = (A) => {
  'use strict';
  const { h } = A;
  const { bg, setStatus, setIdle, go, reload, openArticle, linkFrom, mount, live, shell, bandBtn, railLink, recentTitles, runCmd } = A.fn;

  async function viewExplore(token) {
    const pg = shell({
      title: 'Browse the encyclopedia', desc: 'Eight articles chosen at random. Shuffle for more.',
      wide: true, tools: [bandBtn('Shuffle', () => reload(), 'shuffle')],
    });
    pg.railIn.append(
      railLink('Today’s featured article', () => runCmd('featured')),
      railLink('Random article', () => go('random')),
      railLink('Picture of the Day', () => go('gallery')),
      railLink('On this day', () => go('onthisday')));
    const recent = recentTitles();
    if (recent.length) pg.railIn.append(h('hr'), h('h4', {}, 'Recently viewed'), ...recent.map((t) => railLink(t, () => openArticle(t, linkFrom()), 'sub')));
    const grid = h('div', { class: 'cards' }, Array.from({ length: 8 }, () => h('div', { class: 'card ghost' })));
    pg.text.append(grid);
    if (!mount(pg.root, token)) return;
    setStatus('Picking articles…', true);
    // Sixteen random articles in one request (Wikipedia refuses bursts of single random requests). The eight kept are
    // the ones with opening text and a picture where there are enough, shown in their random order (so the pictures
    // aren't all in one row). Offline, they come from the library.
    const ghosts = [...grid.children], seen = new Set();
    let picks = [];
    try { picks = await Wiki.randomMany(16); } catch {}
    if (!live(token)) return;
    const score = (s) => (s.thumbnail?.source ? 2 : 0) + (s.extract || s.description ? 1 : 0);
    const keep = new Set(picks.map((s, i) => [s, i]).sort((a, b) => score(b[0]) - score(a[0]) || a[1] - b[1]).slice(0, 8).map(([s]) => s));
    picks = picks.filter((s) => keep.has(s));
    let filled = 0;
    const waiting = new Map();
    for (const s of picks) {
      const t = s.titles?.normalized || s.title;
      if (filled >= 8 || !t || seen.has(t)) continue;
      seen.add(t);
      const p = h('p', { class: s.extract ? '' : 'wait' }, s.extract || '');
      if (!s.extract) waiting.set(t, p);
      ghosts[filled++].replaceWith(h('button', { class: 'card', onclick: () => openArticle(t) },
        h('div', { class: 'ph', style: bg(s.thumbnail?.source) }),
        h('div', { class: 'b' }, h('b', {}, t), s.description ? h('span', {}, s.description) : null, p)));
    }
    if (!filled) throw new Error('No articles returned');
    ghosts.slice(filled).forEach((g) => g.remove());
    setIdle();
    // The cards show at once; their opening text follows in one more request.
    if (waiting.size) {
      const text = await Wiki.openings([...waiting.keys()]);
      for (const [t, p] of waiting) { p.textContent = text[t] || ''; p.classList.remove('wait'); }
    }
  }

  return { viewExplore };
};
