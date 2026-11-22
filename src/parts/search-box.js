// Search box: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['search-box'] = (A) => {
  'use strict';
  const { $, h, svg, icon } = A;
  const { https, bg, route, isOffline, go, openArticle, recentTitles, setOffline } = A.fn;

  const q = $('#q');
  const sug = $('#suggest');
  let sugItems = [];
  let sugSel = -1;
  let sugTimer = 0;
  let sugToken = 0;
  // Clicking into the box selects what's there, so a new search can be typed straight away (like a browser's address
  // bar); a click while it's already active places the cursor as usual. Tabbing in selects it too.
  let qClickFocus = false;
  q.addEventListener('mousedown', () => { qClickFocus = document.activeElement !== q; });
  q.addEventListener('focus', () => q.select());
  q.addEventListener('mouseup', (e) => { if (qClickFocus) { e.preventDefault(); qClickFocus = false; } });

  function hideSuggest() { sug.hidden = true; sugItems = []; sugSel = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }
  function showSuggest(items, emptyMsg) {
    sugItems = items;
    sugSel = -1;
    sug.replaceChildren(...(items.length ? items.map((it, i) => h('div', {
      class: 'si' + (it.action ? ' act' : ''), id: 'sug-' + i, role: 'option', 'aria-selected': 'false',
      onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); pick(i); },
      onmouseenter: () => highlight(i),
    }, it.action ? h('i', { class: 'th' }, icon(it.icon)) : it.thumb || it.desc === 'Recently viewed' ? h('i', { class: 'th', style: bg(it.thumb) }) : h('i', { class: 'th ph' }, E2KKinds.icon(svg, it.desc)), h('div', {}, h('b', {}, it.title), it.desc ? h('span', {}, it.desc) : null))) : [h('div', { class: 'empty', role: 'option', 'aria-disabled': 'true' }, emptyMsg || 'No suggestions')]));
    sug.hidden = false;
    q.setAttribute('aria-expanded', 'true');
    q.removeAttribute('aria-activedescendant');
  }
  function highlight(i) {
    sugSel = i;
    [...sug.children].forEach((c, j) => { c.classList.toggle('sel', j === i); if (c.id) c.setAttribute('aria-selected', String(j === i)); });
    q.setAttribute('aria-activedescendant', 'sug-' + i);
  }
  function pick(i) {
    const it = sugItems[i];
    if (!it) return;
    if (it.action) return it.action();
    q.value = it.title;
    hideSuggest();
    q.blur();
    openArticle(it.title);
  }
  // Enter and the Search button show the results page. Enter opens a suggestion only if one was picked with the arrow keys.
  function submit({ fromButton = false } = {}) {
    if (!fromButton && sugSel >= 0) return pick(sugSel);
    const v = q.value.trim();
    if (!v) return q.focus();
    hideSuggest();
    q.blur();
    go(route('search', v));
  }
  q.addEventListener('input', () => {
    clearTimeout(sugTimer);
    const v = q.value.trim();
    if (!v) return hideSuggest();
    sugTimer = setTimeout(async () => {
      const t = ++sugToken;
      try {
        const r = await Wiki.searchTitles(v);
        if (t !== sugToken || document.activeElement !== q) return;
        const items = (r.pages || []).map((p) => ({ title: p.title, desc: p.description, thumb: https(p.thumbnail?.url) }));
        // In Offline mode only the library is searched; the last row goes back online and searches again.
        if (isOffline() && navigator.onLine) {
          items.push({ title: 'Go online to search all of Wikipedia', desc: 'You’re in Offline mode. Only the offline library is searched.', icon: 'globe',
            action: () => { setOffline(false); q.dispatchEvent(new Event('input')); } });
        }
        showSuggest(items, 'No matching articles');
      } catch {}
    }, 180);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); highlight((sugSel + 1) % sugItems.length); }
    else if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); highlight((sugSel - 1 + sugItems.length) % sugItems.length); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') hideSuggest();
  });
  q.addEventListener('blur', () => setTimeout(hideSuggest, 120));
  $('#go').addEventListener('click', () => submit({ fromButton: true }));
  $('#qdd').addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sug.hidden) return hideSuggest();
    q.focus();
    showSuggest(recentTitles().map((t) => ({ title: t, desc: 'Recently viewed' })), 'No recently viewed articles');
  });

  return { hideSuggest };
};
