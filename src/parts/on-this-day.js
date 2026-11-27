// On this day: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['on-this-day'] = (A) => {
  'use strict';
  const { h } = A;
  const { bg, longDate, setStatus, setIdle, openArticle, linkFrom, mount, live, shell, railLink, loading } = A.fn;

  async function viewOnThisDay(token) {
    const pg = shell({ title: `On this day: ${longDate()}`, desc: 'Events, births, and deaths from across history', railTitle: 'Categories', wide: true });
    pg.text.append(loading('Consulting the almanac…'));
    if (!mount(pg.root, token)) return;
    setStatus('Consulting the almanac…', true);
    const data = await Wiki.onThisDay(new Date());
    if (!live(token)) return;
    const cats = [['selected', 'Highlights'], ['events', 'Events'], ['births', 'Births'], ['deaths', 'Deaths'], ['holidays', 'Holidays']]
      .filter(([k]) => (data[k] || []).length);
    const list = h('div', { class: 'tl' });
    const links = cats.map(([k, label], i) => {
      const b = railLink(label, () => show(i));
      b.append(h('span', { class: 'n' }, String(data[k].length)));
      return b;
    });
    function show(i) {
      const [k] = cats[i];
      links.forEach((l, j) => l.classList.toggle('on', j === i));
      list.replaceChildren(...data[k].map((o) => {
        const page = (o.pages || []).find((p) => p.thumbnail) || (o.pages || [])[0];
        const t = page ? page.titles?.normalized || page.title : null;
        // An event without an article (offline, when the library doesn't have it) is plain text.
        return h(t ? 'button' : 'div', t ? { class: 'tl-item', onclick: () => openArticle(t, linkFrom()) } : { class: 'tl-item nolink', title: data.offline ? 'Not in your offline library' : '' },
          h('div', { class: 'yr' }, o.year !== undefined ? String(o.year) : '•'),
          h('div', { class: 'tx' }, o.text, t ? h('small', {}, t + ' ›') : null),
          page?.thumbnail ? h('i', { class: 'th', style: bg(page.thumbnail.source) }) : null);
      }));
      pg.content.scrollTo({ top: 0 });
    }
    pg.railIn.append(...links);
    pg.text.replaceChildren(list);
    show(0);
    setIdle();
  }

  return { viewOnThisDay };
};
