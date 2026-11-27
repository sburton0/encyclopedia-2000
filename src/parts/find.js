// Find in Article (Ctrl+F) on an article: a bar under the title band finds a word in the article's text (not the rail
// or menus). Every match is highlighted; the current one stands out and scrolls into view. Enter and Shift+Enter (or
// ‹ ›) step through them; Esc or ✕ closes the bar and takes the highlights away. Moved out of app.js, which gives it
// its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts.find = ({ h, $ }) => {
  function articleText() { return $('#view .content.article .text'); }
  function findable() { return !!articleText(); }
  let findBar = null, findMarks = [], findAt = -1, findTimer = 0;
  function clearMarks() {
    const parents = new Set();
    findMarks.forEach((m) => { if (m.isConnected) { parents.add(m.parentNode); m.replaceWith(m.textContent); } });
    parents.forEach((p) => p.normalize());
    findMarks = []; findAt = -1;
  }
  function placeFind() {
    const band = $('#view .band');
    if (!findBar || !band) return;
    const r = band.getBoundingClientRect();
    const right = parseFloat(getComputedStyle(band).getPropertyValue('--flow-right')) || 22;
    findBar.style.top = r.bottom + 'px';
    findBar.style.left = Math.max(r.left + 8, r.right - right - findBar.offsetWidth) + 'px';
  }
  function showMatch(i) {
    if (!findMarks.length) return;
    findAt = (i + findMarks.length) % findMarks.length;
    findMarks.forEach((m, j) => m.classList.toggle('cur', j === findAt));
    findMarks[findAt].scrollIntoView({ block: 'center' });
  }
  function runFind() {
    clearMarks();
    const text = articleText(), q = findBar.querySelector('input').value;
    const count = findBar.querySelector('.n');
    findBar.classList.remove('none');
    if (!text || !q.trim()) { count.textContent = ''; return; }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => (n.parentElement.closest('style, script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const v = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(v)) continue;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(v))) {
        frag.append(v.slice(last, m.index));
        findMarks.push(frag.appendChild(h('mark', { class: 'fh' }, m[0])));
        last = m.index + m[0].length;
      }
      frag.append(v.slice(last));
      node.replaceWith(frag);
    }
    if (!findMarks.length) { count.textContent = 'No matches'; findBar.classList.add('none'); return; }
    // Start at the first match below the top of what's on screen, so finding doesn't jump back to the beginning.
    const top = $('#view .band').getBoundingClientRect().bottom;
    const first = findMarks.findIndex((m) => m.getBoundingClientRect().top >= top);
    showMatch(first < 0 ? 0 : first);
    count.textContent = `${findAt + 1} of ${findMarks.length}`;
  }
  function step(d) {
    if (!findMarks.length) return;
    showMatch(findAt + d);
    findBar.querySelector('.n').textContent = `${findAt + 1} of ${findMarks.length}`;
  }
  function openFind() {
    // Text selected in the article becomes the search, as in a browser.
    const sel = String(getSelection() || '').trim();
    if (!findBar) {
      const input = h('input', { 'aria-label': 'Find in article', spellcheck: 'false',
        oninput: () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 150); },
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findTimer); if (!findMarks.length) runFind(); else step(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
        } });
      findBar = h('div', { class: 'findbar', role: 'search' },
        h('label', {}, 'Find in article'), input, h('span', { class: 'n', 'aria-live': 'polite' }),
        h('button', { title: 'Previous (Shift+Enter)', 'aria-label': 'Previous match', onclick: () => step(-1) }, '‹'),
        h('button', { title: 'Next (Enter)', 'aria-label': 'Next match', onclick: () => step(1) }, '›'),
        h('button', { class: 'x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => closeFind() }, '✕'));
      document.body.append(findBar);
    }
    placeFind();
    const input = findBar.querySelector('input');
    if (sel && sel.length < 80 && !sel.includes('\n')) { input.value = sel; runFind(); }
    input.focus(); input.select();
  }
  function closeFind() {
    if (!findBar) return;
    clearTimeout(findTimer);
    clearMarks();
    findBar.remove(); findBar = null;
  }
  addEventListener('resize', placeFind);

  return { articleText, findable, openFind, closeFind };
};
