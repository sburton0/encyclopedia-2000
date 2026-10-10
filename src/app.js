(() => {
  'use strict';

  // ---------- helpers ----------
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }
  function svg(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  }
  const icon = (id) => svg('svg', { class: 'ic' }, svg('use', { href: '#i-' + id }));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('e2k.' + k, JSON.stringify(v)); } catch {} },
  };
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '');
  const decodeHtml = (s) => { const ta = document.createElement('textarea'); ta.innerHTML = s || ''; return ta.value; };
  const https = (u) => (u && u.startsWith('//') ? 'https:' + u : u);
  const bg = (url) => (url ? `background-image:url("${String(url).replace(/"/g, '%22')}")` : '');
  const bigThumb = (url, px = 1280) => (url && /\/\d+px-/.test(url) ? url.replace(/\/\d+px-/, `/${px}px-`) : url);
  const originalOf = (thumb) => (thumb && thumb.includes('/thumb/') ? thumb.replace('/thumb/', '/').replace(/\/[^/]+$/, '') : thumb);
  // Wikimedia won't upscale, so only request a larger thumbnail when the original is wider than that.
  const sized = (thumb, original, width, px) => (width > px ? bigThumb(thumb, px) : original || thumb);
  const longDate = (d = new Date()) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const route = (name, arg) => (arg === undefined ? name : `${name}/${encodeURIComponent(arg)}`);

  // ---------- state ----------
  const view = $('#view');
  const nav = { stack: [], idx: -1 };
  let renderToken = 0;
  let current = null; // the article on screen: { title, desc, thumb }
  let speaking = false;
  let feedCache = null;
  let gameCleanup = null;

  // ---------- status bar ----------
  const statusEl = $('#status');
  let statusIdle = 'Ready';
  function setStatus(msg, busy = false) {
    statusEl.textContent = msg;
    $('.statusbar').classList.toggle('busy', busy);
  }
  function setIdle(msg = 'Ready') { statusIdle = msg; setStatus(msg); }
  function updateNet() {
    $('#netdot').classList.toggle('off', !navigator.onLine);
    $('#net').textContent = navigator.onLine ? 'Online' : 'Offline';
  }
  addEventListener('online', updateNet);
  addEventListener('offline', updateNet);
  updateNet();
  const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  tick();
  setInterval(tick, 15000);

  // ---------- sound ----------
  const soundOn = () => store.get('sound', true);
  document.addEventListener('click', (e) => {
    if (soundOn() && e.target.closest('.tbtn:not(:disabled), .go, .orb, .bbtn, .mi:not(.disabled), .card, .dial')) {
      try { E2KAudio.click(); } catch {}
    }
  }, true);

  // ---------- text size ----------
  function setFontScale(s) {
    s = Math.min(1.5, Math.max(0.8, Math.round(s * 100) / 100));
    store.set('fontScale', s);
    document.documentElement.style.setProperty('--fs', s);
  }
  setFontScale(store.get('fontScale', 1));

  // ---------- navigation ----------
  function go(r, { replace = false } = {}) {
    if (replace && nav.idx >= 0) nav.stack[nav.idx] = r;
    else {
      nav.stack = nav.stack.slice(0, nav.idx + 1);
      nav.stack.push(r);
      nav.idx++;
    }
    render(r);
  }
  const back = () => { if (nav.idx > 0) render(nav.stack[--nav.idx]); };
  const fwd = () => { if (nav.idx < nav.stack.length - 1) render(nav.stack[++nav.idx]); };
  const reload = () => render(nav.stack[nav.idx] || 'home');
  const openArticle = (title) => go(route('article', title));

  function mount(el, token) {
    if (token !== renderToken) return false;
    el.classList.add('fade-in');
    view.replaceChildren(el);
    return true;
  }
  const live = (token) => token === renderToken;

  async function render(r) {
    const token = ++renderToken;
    const [name, ...rest] = r.split('/');
    const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
    if (gameCleanup) { try { gameCleanup(); } catch {} gameCleanup = null; }
    speechStop();
    closeMenus();
    hideSuggest();
    current = null;
    updateToolbar();
    try {
      switch (name) {
        case 'article': await viewArticle(arg, token); break;
        case 'search': await viewSearch(arg, token); break;
        case 'explore': await viewExplore(token); break;
        case 'gallery': await viewGallery(token); break;
        case 'onthisday': await viewOnThisDay(token); break;
        case 'random': await viewRandom(token); break;
        case 'games': viewGames(token); break;
        case 'game': viewGame(arg, token); break;
        default: viewHome(token);
      }
    } catch (err) {
      if (live(token)) showError(err, name, arg, token);
    }
  }

  // ---------- data ----------
  async function todayFeed() {
    const key = new Date().toDateString();
    if (feedCache && feedCache.key === key) return feedCache.data;
    const data = await Wiki.featured(new Date());
    feedCache = { key, data };
    return data;
  }

  // ---------- home ----------
  const ORBS = [
    { label: 'Articles', icon: 'book', x: 528, y: 14, bg: '#cdeeff,#2a86d6 55%,#0b3570', run: () => go('explore') },
    { label: 'Atlas', icon: 'globe', x: 720, y: 94, bg: '#d6ffe0,#2fae5a 55%,#0b4a22', run: () => soon('World Atlas', 'Explore countries, cities, and landmarks on an interactive map of the world.') },
    { label: 'Media', icon: 'film', x: 714, y: 320, bg: '#ffe2d2,#e0612a 55%,#6a2008', run: () => go('gallery') },
    { label: 'Timeline', icon: 'clock', x: 528, y: 468, bg: '#fff6d0,#e2a21e 55%,#6b4a05', run: () => go('onthisday') },
    { label: 'Games', icon: 'star', x: 348, y: 382, bg: '#f2dcff,#9a4ad8 55%,#3c0c6a', run: () => go('games') },
    { label: 'Activities', icon: 'puzzle', x: 348, y: 84, bg: '#ffd9e8,#d83a7a 55%,#5c0a2c', run: () => soon('Activities', 'Hands-on explorations, puzzles, and interactive features.') },
  ];

  function viewHome(token) {
    const art = svg('svg', { viewBox: '0 0 1024 610' });
    const bloom = svg('g', { transform: 'translate(565 245)', filter: 'url(#soft)' });
    makeBloom(bloom, 1);
    art.append(
      bloom,
      svg('circle', { cx: 565, cy: 245, r: 150, fill: 'url(#core)', filter: 'url(#softer)' }),
      svg('path', { d: 'M 360 -40 C 200 150 220 450 420 700', fill: 'none', stroke: '#9fc0ff', 'stroke-opacity': '.22', 'stroke-width': '1.5' }),
      svg('path', { d: 'M 770 -40 C 930 150 910 450 710 700', fill: 'none', stroke: '#9fc0ff', 'stroke-opacity': '.18', 'stroke-width': '1.5' }),
    );

    const dial = h('button', { class: 'dial', title: 'Picture of the Day', onclick: () => go('gallery') });
    const dialCap = h('span', {}, 'Loading…');
    const discThumb = h('button', { class: 'thumb', style: 'padding:0' });
    const discTitle = h('b', {}, 'Loading today’s discovery…');
    const discText = h('p');
    const discMore = h('button', { class: 'more' }, 'Read the full article ›');
    const almList = h('div', { class: 'list' }, h('div', { class: 'muted' }, 'Loading…'));

    const canvas = h('div', { class: 'home-canvas' },
      art,
      h('div', { class: 'brand' }, h('small', {}, 'Encyclopedia'), h('div', { class: 'y' }, '20', h('b', {}, '00')), h('div', { class: 'tag' }, 'THE WORLD OF KNOWLEDGE')),
      dial,
      h('div', { class: 'dialcap' }, h('b', {}, 'PICTURE OF THE DAY'), h('br'), dialCap),
      ORBS.map((o) => h('button', { class: 'orb', style: `left:${o.x}px;top:${o.y}px`, onclick: o.run },
        h('i', { style: `background:radial-gradient(circle at 40% 30%,${o.bg})` }, svg('svg', {}, svg('use', { href: '#i-' + o.icon }))), o.label)),
      h('div', { class: 'panel disc' }, h('h3', {}, 'Today’s discovery'),
        h('div', { class: 'row' }, discThumb, h('div', {}, discTitle, discText)), discMore),
      h('div', { class: 'panel alm' }, h('h3', {}, 'Almanac'), h('div', { class: 'd' }, longDate().toUpperCase()), almList,
        h('button', { class: 'more', onclick: () => go('onthisday') }, 'See all of today’s events ›')),
    );
    if (!mount(h('div', { class: 'home' }, canvas), token)) return;
    fitHome();
    setStatus('Gathering today’s discoveries…', true);

    todayFeed().then((d) => {
      if (!live(token)) return;
      const img = d.image || {};
      dial.style.cssText = bg(sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 500));
      dialCap.textContent = strip(img.description?.text) || strip(img.title) || '';

      const tfa = d.tfa;
      if (tfa) {
        const t = tfa.titles?.normalized || tfa.title;
        discThumb.style.cssText = 'padding:0;' + bg(tfa.thumbnail?.source);
        discTitle.textContent = t;
        discText.textContent = tfa.extract || '';
        discMore.onclick = discThumb.onclick = () => openArticle(t);
      } else {
        discTitle.textContent = 'No featured article today';
      }

      almList.replaceChildren(...(d.onthisday || []).slice(0, 6).map((o) => {
        const page = (o.pages || [])[0];
        return h('button', { class: 'ev', title: page ? page.titles?.normalized : '', onclick: () => (page ? openArticle(page.titles?.normalized || page.title) : go('onthisday')) },
          h('b', {}, String(o.year)), h('div', {}, o.text));
      }));
      setIdle();
    }).catch((err) => {
      if (!live(token)) return;
      discTitle.textContent = navigator.onLine ? 'Today’s content couldn’t be loaded.' : 'You’re offline.';
      discText.textContent = 'Encyclopedia 2000 retrieves its articles from Wikipedia. Check your internet connection, then press F5 to try again.';
      almList.replaceChildren(h('div', { class: 'muted' }, 'Unavailable'));
      dialCap.textContent = '';
      setIdle('Couldn’t reach Wikipedia (' + err.message + ')');
    });
  }

  function fitHome() {
    const c = $('.home-canvas');
    if (c) c.style.setProperty('--s', Math.min(view.clientWidth / 1024, view.clientHeight / 610));
  }
  new ResizeObserver(fitHome).observe(view);

  // ---------- page shell ----------
  function shell({ kicker, title = '', desc = '', railTitle = '', wide = false, tools = [] }) {
    const railArt = svg('svg', { viewBox: '0 0 230 600', preserveAspectRatio: 'xMidYMax slice' });
    const rb = svg('g', { transform: 'translate(205 565)', filter: 'url(#soft)', opacity: '.55' });
    makeBloom(rb, 0.6);
    railArt.append(rb);

    const bandArt = svg('svg', { viewBox: '0 0 800 96', preserveAspectRatio: 'xMaxYMid slice' });
    const bb = svg('g', { transform: 'translate(720 64)', filter: 'url(#soft)' });
    makeBloom(bb, 0.3);
    bandArt.append(svg('rect', { width: 800, height: 96, fill: 'url(#b0)' }), bb,
      svg('circle', { cx: 720, cy: 64, r: 55, fill: 'url(#core)', filter: 'url(#softer)', opacity: '.8' }));

    const railIn = h('div', { class: 'in' }, railTitle ? h('h4', {}, railTitle) : null);
    const h1 = h('h1', {}, title);
    const dsc = h('div', { class: 'desc' }, desc);
    const toolsEl = h('div', { class: 'tools' }, tools);
    const text = h('div', { class: 'text' });
    const media = h('aside', { class: 'media' });
    const content = h('div', { class: 'content' + (wide ? ' wide' : '') }, text, wide ? null : media);
    const root = h('div', { class: 'page' },
      h('aside', { class: 'rail' }, railArt, railIn),
      h('section', { class: 'art' },
        h('header', { class: 'band' }, bandArt, h('div', { class: 't' }, h('small', {}, kicker), h1, dsc), toolsEl),
        content));
    return {
      root, railIn, text, media, content, toolsEl,
      setTitle(t, d) { h1.textContent = t; h1.title = t; dsc.textContent = d || ''; },
    };
  }
  const bandBtn = (label, onclick, ic) => h('button', { class: 'bbtn', onclick }, ic ? icon(ic) : null, label);
  const railLink = (label, onclick, cls = '') => h('button', { class: 'lnk ' + cls, onclick }, label);
  const loading = (msg) => h('div', { class: 'loading' }, msg);

  // ---------- article ----------
  const DROP_SECTIONS = /^(references|notes|citations|sources|bibliography|further reading|external links|footnotes|works cited|notes and references|references and notes|explanatory notes)$/i;
  const SKIP_NS = /^(File|Image|Special|Help|Wikipedia|Template|Template talk|Category|Portal|Talk|User|User talk|Draft|Module|MediaWiki|Book|TimedText):/i;

  function cleanArticle(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    body.querySelectorAll([
      'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'audio', 'video',
      '.mw-editsection', '.navbox', '.navbox-styles', '.vertical-navbox', '.sidebar', '.ambox', '.ombox', '.tmbox', '.mbox-small',
      '.sistersitebox', '.side-box', '.noprint', '.mw-empty-elt', 'sup.reference', '.mw-references-wrap', '.reflist',
      '.shortdescription', '.portalbox', '.metadata', '.mw-kartographer-maplink', '.ext-phonos',
    ].join(',')).forEach((n) => n.remove());

    body.querySelectorAll('h2').forEach((h2) => {
      if (DROP_SECTIONS.test(h2.textContent.trim())) (h2.closest('section') || h2).remove();
    });

    // Infobox -> quick facts
    const facts = [];
    let infoImg = null;
    const ib = body.querySelector('table.infobox');
    if (ib) {
      const im = ib.querySelector('img');
      if (im) infoImg = https(im.getAttribute('src'));
      for (const tr of ib.querySelectorAll('tr')) {
        const th = tr.querySelector('th');
        const td = tr.querySelector('td');
        if (!th || !td) continue;
        const k = th.textContent.replace(/\s+/g, ' ').trim();
        const cell = td.cloneNode(true);
        cell.querySelectorAll('br').forEach((br) => br.replaceWith('; '));
        cell.querySelectorAll('li, div, p').forEach((el) => el.append('; '));
        let v = cell.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').replace(/(\s*;\s*)+/g, '; ').replace(/^[;\s]+|[;\s]+$/g, '').trim();
        if (!k || !v || k.length > 40) continue;
        if (v.length > 90) v = v.slice(0, 87) + '…';
        facts.push([k, v]);
        if (facts.length >= 10) break;
      }
      ib.remove();
    }

    for (const el of body.querySelectorAll('*')) {
      for (const a of [...el.attributes]) if (/^on/i.test(a.name) || a.name === 'srcset') el.removeAttribute(a.name);
    }
    body.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src) img.setAttribute('src', https(src));
      img.setAttribute('loading', 'lazy');
    });

    const related = [];
    body.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const rel = a.getAttribute('rel') || '';
      if (href.startsWith('./') || rel.includes('mw:WikiLink')) {
        const raw = href.replace(/^\.\//, '').split('#')[0].split('?')[0];
        let t;
        try { t = decodeURIComponent(raw).replace(/_/g, ' '); } catch { t = raw.replace(/_/g, ' '); }
        if (/^(File|Image):/i.test(t)) {
          a.setAttribute('href', '#');
          a.dataset.file = t;
        } else if (!t || SKIP_NS.test(t) || a.classList.contains('new') || href.includes('redlink=1')) {
          a.replaceWith(...a.childNodes);
        } else {
          a.setAttribute('href', '#');
          a.dataset.title = t;
          a.removeAttribute('title');
          if (related.length < 8 && !related.includes(t) && !a.closest('figure, table') && !/^\d+$/.test(t)) related.push(t);
        }
      } else if (/^(https?:)?\/\//.test(href)) {
        a.dataset.ext = https(href);
        a.setAttribute('href', '#');
      } else if (!href.startsWith('#')) {
        a.replaceWith(...a.childNodes);
      }
    });

    const firstP = [...body.querySelectorAll('p')].find((p) => p.textContent.trim().length > 60);
    if (firstP) firstP.classList.add('lede');

    const toc = [...body.querySelectorAll('h2')].map((h2, i) => {
      if (!h2.id) h2.id = 'sec-' + i;
      return { id: h2.id, label: h2.textContent.trim() };
    });
    return { nodes: [...body.childNodes], facts, toc, related, infoImg };
  }

  async function viewArticle(title, token) {
    const favBtn = bandBtn('Add to Favorites', () => toggleFav(), 'star');
    const speakBtn = bandBtn('Read Aloud', () => toggleSpeak(), 'speak');
    const wikiBtn = bandBtn('View on Wikipedia', null, 'ext');
    const pg = shell({ kicker: 'ARTICLE', title, railTitle: 'In this article', tools: [speakBtn, favBtn, wikiBtn] });
    pg.text.append(loading('Retrieving article…'));
    if (!mount(pg.root, token)) return;
    setStatus(`Retrieving “${title}”…`, true);

    const sum = await Wiki.summary(title);
    if (!live(token)) return;
    const name = sum.titles?.normalized || title;
    const canon = sum.titles?.canonical || name.replace(/ /g, '_');
    pg.setTitle(name, sum.description);
    wikiBtn.onclick = () => window.e2k.openExternal(Wiki.pageUrl(canon));

    const html = await Wiki.html(canon);
    if (!live(token)) return;
    const { nodes, facts, toc, related, infoImg } = cleanArticle(html);

    current = { title: name, desc: sum.description || '', thumb: sum.thumbnail?.source || '', favBtn, speakBtn };
    addRecent(name);

    const attrib = h('div', { class: 'attrib' },
      'This article uses material from the Wikipedia article ', h('a', { href: '#', 'data-ext': Wiki.pageUrl(canon) }, `“${name}”`),
      ', which is released under the Creative Commons Attribution-ShareAlike 4.0 License. Retrieved ', new Date().toLocaleDateString('en-US'), '.');
    pg.text.replaceChildren(...nodes, attrib);

    // contents rail
    const tocLinks = [railLink('Introduction', () => pg.content.scrollTo({ top: 0, behavior: 'smooth' }), 'on')];
    toc.forEach(({ id, label }) => tocLinks.push(railLink(label, () => {
      const target = pg.text.querySelector('#' + CSS.escape(id));
      if (target) pg.content.scrollTo({ top: target.offsetTop - pg.content.offsetTop - 10, behavior: 'smooth' });
    })));
    pg.railIn.append(...tocLinks);
    if (related.length) {
      pg.railIn.append(h('hr'), h('h4', {}, 'Related articles'), ...related.map((t) => railLink(t, () => openArticle(t), 'sub')));
    }
    pg.content.addEventListener('scroll', () => {
      const y = pg.content.scrollTop + 40;
      let active = 0;
      toc.forEach(({ id }, i) => {
        const el = pg.text.querySelector('#' + CSS.escape(id));
        if (el && el.offsetTop - pg.content.offsetTop <= y) active = i + 1;
      });
      tocLinks.forEach((l, i) => l.classList.toggle('on', i === active));
    }, { passive: true });

    // picture and quick facts
    const lead = sum.originalimage?.source || sum.thumbnail?.source || infoImg;
    if (lead) {
      const ow = sum.originalimage?.width || 0;
      const shown = sum.thumbnail?.source ? sized(sum.thumbnail.source, lead, ow, 500) : lead;
      const large = sum.thumbnail?.source ? sized(sum.thumbnail.source, lead, ow, 1280) : lead;
      pg.media.append(h('div', { class: 'frame' }, h('img', { src: shown, alt: name, onclick: () => lightbox(large, name) })),
        h('div', { class: 'cap' }, sum.description ? `${name}, ${sum.description}` : name));
    }
    const factsBox = h('div', { class: 'facts' }, h('h6', {}, 'Quick facts'));
    facts.forEach(([k, v]) => factsBox.append(h('div', { class: 'r' }, h('span', {}, k), h('span', {}, v))));
    factsBox.append(
      h('div', { class: 'r' }, h('span', {}, 'Source'), h('span', {}, 'Wikipedia')),
      h('div', { class: 'r' }, h('span', {}, 'License'), h('span', {}, 'CC BY-SA 4.0')));
    pg.media.append(factsBox);

    updateToolbar();
    setIdle(sum.type === 'disambiguation' ? `“${name}” may refer to several subjects` : 'Done');
  }

  // link handling inside article text (and anywhere else data-* links appear)
  view.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.title) openArticle(a.dataset.title);
    else if (a.dataset.ext) window.e2k.openExternal(a.dataset.ext);
    else if (a.dataset.file) {
      const img = a.querySelector('img');
      if (img) {
        const fw = Number(img.getAttribute('data-file-width')) || 0;
        lightbox(sized(img.src, originalOf(img.src), fw, 1280), img.closest('figure')?.querySelector('figcaption')?.textContent || '');
      }
    } else if ((a.getAttribute('href') || '').startsWith('#') && a.getAttribute('href').length > 1) {
      const t = view.querySelector('#' + CSS.escape(a.getAttribute('href').slice(1)));
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    }
  });
  view.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.title) setStatus('Article: ' + a.dataset.title);
    else if (a.dataset.ext) setStatus('Opens in your web browser: ' + a.dataset.ext);
  });
  view.addEventListener('mouseout', (e) => { if (e.target.closest('a')) setStatus(statusIdle); });

  // ---------- search ----------
  async function viewSearch(q, token) {
    const pg = shell({ kicker: 'SEARCH', title: `Results for “${q}”`, railTitle: 'Search', wide: true });
    pg.text.append(loading('Searching…'));
    if (!mount(pg.root, token)) return;
    setStatus('Searching…', true);
    const res = await Wiki.searchPages(q);
    if (!live(token)) return;
    const pages = res.pages || [];
    pg.railIn.append(h('div', { class: 'note' }, pages.length ? `${pages.length} best matches for “${q}”.` : 'No matches found.'),
      h('hr'), railLink(`Search Wikipedia for “${q}”`, () => window.e2k.openExternal(`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&fulltext=1`), 'sub'));
    if (!pages.length) {
      pg.text.replaceChildren(h('div', { class: 'errbox' }, h('b', {}, 'No articles found'), `Nothing matched “${q}”. Check the spelling, or try a broader subject.`));
    } else {
      pg.text.replaceChildren(h('div', { class: 'results' }, pages.map((p) => {
        const ex = h('p');
        const parts = (p.excerpt || '').split(/<span class="searchmatch">|<\/span>/);
        parts.forEach((part, i) => {
          const txt = decodeHtml(part);
          ex.append(i % 2 ? h('strong', {}, txt) : txt);
        });
        return h('button', { class: 'res', onclick: () => openArticle(p.title) },
          h('i', { class: 'th', style: bg(https(p.thumbnail?.url)) }),
          h('div', {}, h('b', {}, p.title), p.description ? h('span', {}, p.description) : null, ex));
      })));
    }
    setIdle(`${pages.length} results`);
  }

  async function viewRandom(token) {
    setStatus('Finding a random article…', true);
    const s = await Wiki.random();
    if (!live(token)) return;
    go(route('article', s.titles?.normalized || s.title), { replace: true });
  }

  // ---------- explore ----------
  async function viewExplore(token) {
    const pg = shell({
      kicker: 'ARTICLES', title: 'Explore the encyclopedia', desc: 'Eight articles chosen at random. Shuffle for more.',
      railTitle: 'Browse', wide: true, tools: [bandBtn('Shuffle', () => reload(), 'shuffle')],
    });
    pg.railIn.append(
      railLink('Today’s featured article', () => runCmd('featured')),
      railLink('Random article', () => go('random')),
      railLink('Picture of the Day', () => go('gallery')),
      railLink('On this day', () => go('onthisday')));
    const recent = store.get('recent', []);
    if (recent.length) pg.railIn.append(h('hr'), h('h4', {}, 'Recently viewed'), ...recent.map((t) => railLink(t, () => openArticle(t), 'sub')));
    const grid = h('div', { class: 'cards' }, Array.from({ length: 8 }, () => h('div', { class: 'card ghost' })));
    pg.text.append(grid);
    if (!mount(pg.root, token)) return;
    setStatus('Picking articles…', true);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => Wiki.random()));
    if (!live(token)) return;
    const pages = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!pages.length) throw new Error('No articles returned');
    grid.replaceChildren(...pages.map((s) => {
      const t = s.titles?.normalized || s.title;
      return h('button', { class: 'card', onclick: () => openArticle(t) },
        h('div', { class: 'ph', style: bg(s.thumbnail?.source) }),
        h('div', { class: 'b' }, h('b', {}, t), s.description ? h('span', {}, s.description) : null, h('p', {}, s.extract || '')));
    }));
    setIdle();
  }

  // ---------- gallery ----------
  async function viewGallery(token) {
    const pg = shell({ kicker: 'MEDIA', title: 'Picture of the Day', desc: 'Featured images from Wikimedia Commons', railTitle: 'This week', wide: true });
    pg.text.append(loading('Loading pictures…'));
    if (!mount(pg.root, token)) return;
    setStatus('Loading pictures…', true);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; });
    const feeds = await Promise.allSettled(days.map((d, i) => (i === 0 ? todayFeed() : Wiki.featured(d))));
    if (!live(token)) return;
    const pics = feeds.map((f, i) => (f.status === 'fulfilled' && f.value.image ? { date: days[i], img: f.value.image } : null)).filter(Boolean);
    if (!pics.length) throw new Error('No pictures available');

    const holder = h('div', { class: 'potd' });
    const stripEl = h('div', { class: 'strip' });
    const railBtns = [];
    function show(i) {
      const { date, img } = pics[i];
      const full = sized(img.thumbnail?.source, img.image?.source, img.image?.width || 0, 1280);
      const caption = strip(img.description?.text) || strip(img.title);
      holder.replaceChildren(
        h('figure', {}, h('img', { src: full, alt: caption, onclick: () => lightbox(full, caption) })),
        h('div', { class: 'desc' }, caption),
        h('div', { class: 'credit' },
          `${longDate(date)} · ${strip(img.artist?.text) || 'Unknown artist'} · ${img.license?.type || ''}`,
          img.file_page ? bandBtn('View on Wikimedia Commons', () => window.e2k.openExternal(img.file_page), 'ext') : null));
      [...stripEl.children].forEach((b, j) => b.classList.toggle('on', j === i));
      railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      pg.content.scrollTo({ top: 0 });
    }
    pics.forEach((p, i) => {
      stripEl.append(h('button', { onclick: () => show(i) }, h('i', { style: bg(p.img.thumbnail?.source) }), i === 0 ? 'Today' : longDate(p.date)));
      railBtns.push(railLink(i === 0 ? 'Today' : p.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), () => show(i)));
    });
    pg.railIn.append(...railBtns);
    pg.text.replaceChildren(holder, stripEl);
    show(0);
    setIdle();
  }

  // ---------- on this day ----------
  async function viewOnThisDay(token) {
    const pg = shell({ kicker: 'TIMELINE', title: `On this day: ${longDate()}`, desc: 'Events, births, and deaths from across history', railTitle: 'Categories', wide: true });
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
        return h('button', { class: 'tl-item', onclick: () => (t ? openArticle(t) : null) },
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

  // ---------- games ----------
  function viewGames(token) {
    const pg = shell({ kicker: 'GAMES', title: 'Games', desc: 'Play and learn with challenges drawn from the encyclopedia', railTitle: 'Games', wide: true });
    const games = E2KGames.list;
    pg.railIn.append(...games.map((g) => railLink(g.name, () => go(route('game', g.id)))),
      h('hr'), h('div', { class: 'note' }, 'More games are on the way.'));
    pg.text.append(h('div', { class: 'gcards' },
      games.map((g) => h('button', { class: 'gcard', onclick: () => go(route('game', g.id)) },
        h('div', { class: 'gart' }, g.art ? g.art(E2K) : null),
        h('div', { class: 'gb' }, h('b', {}, g.name), h('p', {}, g.blurb),
          h('div', { class: 'gfoot' }, h('span', { class: 'gprog' }, g.progress ? g.progress(E2K) : ''), h('span', { class: 'gplay' }, 'Play ›'))))),
      E2KGames.upcoming.map((u) => h('div', { class: 'gcard soon' },
        h('div', { class: 'gart' }, u.icon ? svg('svg', { class: 'gicon' }, svg('use', { href: '#i-' + u.icon })) : null),
        h('div', { class: 'gb' }, h('b', {}, u.name), h('p', {}, u.blurb), h('div', { class: 'gfoot' }, h('span', { class: 'gprog' }, 'Coming soon')))))));
    mount(pg.root, token);
    setIdle();
  }

  function viewGame(id, token) {
    const game = E2KGames.get(id);
    if (!game) throw Object.assign(new Error('Game not found'), { status: 404 });
    const root = h('div', { class: 'game-root' });
    if (!mount(root, token)) return;
    gameCleanup = game.mount(root, E2K) || null;
    setIdle(game.name);
  }

  // ---------- errors ----------
  function showError(err, name, arg, token) {
    const offline = !navigator.onLine;
    const notFound = err.status === 404;
    const pg = shell({ kicker: 'NOTICE', title: notFound ? 'Article not found' : 'Something went wrong', railTitle: '', wide: true });
    pg.text.append(h('div', { class: 'errbox' },
      h('b', {}, offline ? 'You’re offline' : notFound ? `There’s no article called “${arg}”` : 'This page couldn’t be loaded'),
      offline ? 'Encyclopedia 2000 retrieves its articles from Wikipedia, so it needs an internet connection.'
        : notFound ? 'Try searching for it instead.' : `Wikipedia didn’t respond as expected (${err.message}).`,
      h('div', {}, notFound
        ? bandBtn(`Search for “${arg}”`, () => go(route('search', arg), { replace: true }))
        : bandBtn('Try again', () => reload()))));
    mount(pg.root, token);
    setIdle(offline ? 'Offline' : 'Error: ' + err.message);
  }

  // ---------- overlays ----------
  function closeOverlays() { $$('.overlay').forEach((o) => o.remove()); }

  function dialog(title, heading, paragraphs, buttons = [['OK']]) {
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) ov.remove(); } });
    ov.append(h('div', { class: 'dialog', role: 'dialog' },
      h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), title),
      h('div', { class: 'db' }, h('img', { src: 'icon.svg', alt: '' }),
        h('div', {}, h('h2', {}, heading), paragraphs.map((p) => h('p', {}, p)))),
      h('div', { class: 'df' }, buttons.map(([label, fn]) => h('button', { class: 'go', onclick: () => { ov.remove(); fn && fn(); } }, label)))));
    document.body.append(ov);
    ov.querySelector('.df .go').focus();
  }
  const soon = (name, blurb) => dialog('Encyclopedia 2000', name, [blurb, 'This feature is coming in a future edition of Encyclopedia 2000.']);
  const about = () => dialog('About Encyclopedia 2000', 'Encyclopedia 2000', [
    'Version 0.1 (demo edition).',
    'Articles and pictures come live from Wikipedia and Wikimedia Commons, written by volunteers and shared under Creative Commons licenses.',
    'Encyclopedia 2000 is an independent project. It isn’t affiliated with the Wikimedia Foundation or Microsoft.',
  ]);

  function lightbox(src, caption) {
    if (!src) return;
    const ov = h('div', { class: 'overlay lightbox', onclick: () => ov.remove() }, h('img', { src, alt: caption || '' }), caption ? h('div', {}, caption) : null);
    document.body.append(ov);
  }

  function soundPicker() {
    const saved = store.get('lead', 'flute');
    let chosen = saved;
    const rows = E2KAudio.LEAD_INFO.map(([id, name, desc]) => {
      const row = h('button', { class: 'pick' + (id === saved ? ' on' : ''), onclick: () => select(id) },
        h('span', { class: 'radio' }), h('span', { class: 'pt' }, h('b', {}, name), h('span', {}, desc)), h('span', { class: 'play' }, '▶'));
      row.dataset.id = id;
      return row;
    });
    function select(id) {
      chosen = id;
      rows.forEach((r) => r.classList.toggle('on', r.dataset.id === id));
      E2KAudio.jingle({ lead: id, volume: 0.55 });
    }
    const close = () => { E2KAudio.fadeOut(0.3); ov.remove(); };
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) close(); } });
    ov.append(h('div', { class: 'dialog picker', role: 'dialog' },
      h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Startup Sound'),
      h('div', { class: 'pb' }, h('p', {}, 'Every version keeps the same pad. Only the melody instrument changes. Click one to hear it.'), rows),
      h('div', { class: 'df' },
        h('button', { class: 'go', onclick: () => { store.set('lead', chosen); close(); setIdle(`Startup sound set to ${E2KAudio.LEAD_INFO.find((l) => l[0] === chosen)[1]}`); } }, 'Use This Sound'),
        h('button', { class: 'go', onclick: close }, 'Cancel'))));
    document.body.append(ov);
  }

  // ---------- favorites, recent, read aloud ----------
  const favs = () => store.get('favorites', []);
  const isFav = () => !!current && favs().some((f) => f.title === current.title);
  function toggleFav() {
    if (!current) return;
    const list = favs();
    const i = list.findIndex((f) => f.title === current.title);
    if (i >= 0) { list.splice(i, 1); setIdle(`Removed “${current.title}” from Favorites`); }
    else { list.unshift({ title: current.title, desc: current.desc }); setIdle(`Added “${current.title}” to Favorites`); }
    store.set('favorites', list.slice(0, 50));
    updateToolbar();
  }
  function addRecent(title) {
    const list = store.get('recent', []).filter((t) => t !== title);
    list.unshift(title);
    store.set('recent', list.slice(0, 12));
  }

  function toggleSpeak() {
    if (speaking) return speechStop();
    const text = $('.page .text');
    if (!current || !text || !('speechSynthesis' in window)) return;
    const parts = [current.title + '.']
      .concat($$('p, h2, h3, li', text).filter((el) => !el.closest('table, figure, .attrib')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
      .filter(Boolean).slice(0, 150);
    speechSynthesis.cancel();
    speaking = true;
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (i === parts.length - 1) u.onend = () => { speaking = false; updateToolbar(); };
      speechSynthesis.speak(u);
    });
    setIdle('Reading aloud. Press the Read Aloud button again to stop.');
    updateToolbar();
  }
  function speechStop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (speaking) { speaking = false; setIdle(); }
    updateToolbar();
  }

  // ---------- toolbar ----------
  function updateToolbar() {
    const btn = (c) => $(`.tbtn[data-cmd="${c}"]`);
    btn('back').disabled = nav.idx <= 0;
    btn('fwd').disabled = nav.idx >= nav.stack.length - 1;
    btn('fav').disabled = !current;
    btn('speak').disabled = !current;
    const fav = isFav();
    btn('fav').classList.toggle('on', fav);
    btn('fav').title = fav ? 'Remove from Favorites' : 'Add to Favorites';
    btn('speak').classList.toggle('on', speaking);
    btn('speak').title = speaking ? 'Stop reading' : 'Read Aloud';
    if (current?.favBtn) {
      current.favBtn.lastChild.textContent = fav ? 'In Favorites' : 'Add to Favorites';
      current.favBtn.classList.toggle('on', fav);
      current.speakBtn.lastChild.textContent = speaking ? 'Stop Reading' : 'Read Aloud';
      current.speakBtn.classList.toggle('on', speaking);
    }
  }

  const COMMANDS = {
    back, fwd, reload,
    home: () => go('home'),
    explore: () => go('explore'),
    gallery: () => go('gallery'),
    onthisday: () => go('onthisday'),
    random: () => go('random'),
    featured: () => todayFeed().then((d) => d.tfa && openArticle(d.tfa.titles?.normalized || d.tfa.title)).catch(() => setIdle('Couldn’t load today’s featured article')),
    fav: toggleFav,
    speak: toggleSpeak,
    copy: () => document.execCommand('copy'),
    print: () => window.e2k.win('print'),
    find: () => { $('#q').focus(); $('#q').select(); },
    bigger: () => setFontScale(store.get('fontScale', 1) + 0.1),
    smaller: () => setFontScale(store.get('fontScale', 1) - 0.1),
    normal: () => setFontScale(1),
    sound: () => { store.set('sound', !soundOn()); setIdle(soundOn() ? 'Sound effects on' : 'Sound effects off'); },
    atlas: () => ORBS[1].run(),
    games: () => go('games'),
    activities: () => ORBS[5].run(),
    about,
    startupSound: () => soundPicker(),
    exit: () => window.e2k.win('close'),
  };
  const runCmd = (c) => (typeof c === 'function' ? c() : COMMANDS[c] && COMMANDS[c]());
  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tbtn');
    if (b && !b.disabled) runCmd(b.dataset.cmd);
  });

  // ---------- menus ----------
  function menus() {
    const f = favs();
    return [
      ['File', [['Home', 'home', 'Ctrl+H'], ['Random Article', 'random'], '-', ['Print…', 'print', 'Ctrl+P'], '-', ['Exit', 'exit', 'Alt+F4']]],
      ['Edit', [['Copy', 'copy', 'Ctrl+C'], ['Find an Article', 'find', 'Ctrl+F']]],
      ['View', [['Larger Text', 'bigger', 'Ctrl+='], ['Smaller Text', 'smaller', 'Ctrl+-'], ['Normal Text Size', 'normal', 'Ctrl+0'], '-',
        ['Refresh', 'reload', 'F5'], '-', ['Sound Effects', 'sound', '', soundOn()], ['Startup Sound…', 'startupSound']]],
      ['Go', [['Back', 'back', 'Alt+Left', null, nav.idx <= 0], ['Forward', 'fwd', 'Alt+Right', null, nav.idx >= nav.stack.length - 1], ['Home', 'home'], '-',
        ['Today’s Featured Article', 'featured'], ['On This Day', 'onthisday'], ['Picture of the Day', 'gallery'], ['Random Article', 'random']]],
      ['Favorites', [[isFav() ? 'Remove from Favorites' : 'Add to Favorites', 'fav', '', null, !current], '-',
        ...(f.length ? f.map((x) => [x.title, () => openArticle(x.title)]) : [['(No favorites yet)', null, '', null, true]])]],
      ['Features', [['Articles', 'explore'], ['World Atlas', 'atlas'], ['Media', 'gallery'], ['Timeline', 'onthisday'], ['Games', 'games'], ['Activities', 'activities']]],
      ['Help', [['About Encyclopedia 2000', 'about']]],
    ];
  }
  const menubar = $('#menubar');
  let openMenu = null;
  function closeMenus() {
    $$('.menu', menubar).forEach((m) => m.remove());
    $$('.m.open', menubar).forEach((m) => m.classList.remove('open'));
    openMenu = null;
  }
  function showMenu(top, index) {
    closeMenus();
    openMenu = index;
    top.classList.add('open');
    const [, items] = menus()[index];
    const box = h('div', { class: 'menu' });
    items.forEach((it) => {
      if (it === '-') return box.append(h('div', { class: 'msep' }));
      const [label, cmd, key, checked, disabled] = it;
      box.append(h('div', {
        class: 'mi' + (checked ? ' checked' : '') + (disabled ? ' disabled' : ''),
        onmousedown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); if (disabled || !cmd) return; closeMenus(); runCmd(cmd); },
      }, h('span', {}, label), h('span', { class: 'k' }, key || '')));
    });
    top.append(box);
  }
  menus().forEach(([label], i) => {
    const top = h('div', { class: 'm' }, label);
    top.addEventListener('mousedown', (e) => { e.stopPropagation(); openMenu === i ? closeMenus() : showMenu(top, i); });
    top.addEventListener('mouseenter', () => { if (openMenu !== null && openMenu !== i) showMenu(top, i); });
    menubar.append(top);
  });
  document.addEventListener('mousedown', () => closeMenus());

  // ---------- search box ----------
  const q = $('#q');
  const sug = $('#suggest');
  let sugItems = [];
  let sugSel = -1;
  let sugTimer = 0;
  let sugToken = 0;

  function hideSuggest() { sug.hidden = true; sugItems = []; sugSel = -1; }
  function showSuggest(items, emptyMsg) {
    sugItems = items;
    sugSel = -1;
    sug.replaceChildren(...(items.length ? items.map((it, i) => h('div', {
      class: 'si',
      onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); pick(i); },
      onmouseenter: () => highlight(i),
    }, h('i', { class: 'th', style: bg(it.thumb) }), h('div', {}, h('b', {}, it.title), it.desc ? h('span', {}, it.desc) : null))) : [h('div', { class: 'empty' }, emptyMsg || 'No suggestions')]));
    sug.hidden = false;
  }
  function highlight(i) {
    sugSel = i;
    [...sug.children].forEach((c, j) => c.classList.toggle('sel', j === i));
  }
  function pick(i) {
    const it = sugItems[i];
    if (!it) return;
    q.value = it.title;
    hideSuggest();
    q.blur();
    openArticle(it.title);
  }
  function submit() {
    if (sugSel >= 0) return pick(sugSel);
    const v = q.value.trim();
    if (!v) return;
    const exact = sugItems.find((s) => s.title.toLowerCase() === v.toLowerCase());
    hideSuggest();
    q.blur();
    exact ? openArticle(exact.title) : go(route('search', v));
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
        showSuggest((r.pages || []).map((p) => ({ title: p.title, desc: p.description, thumb: https(p.thumbnail?.url) })), 'No matching articles');
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
  $('#go').addEventListener('click', submit);
  $('#qdd').addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sug.hidden) return hideSuggest();
    q.focus();
    showSuggest(store.get('recent', []).map((t) => ({ title: t, desc: 'Recently viewed' })), 'No recently viewed articles');
  });

  // ---------- window controls ----------
  $$('[data-win]').forEach((b) => b.addEventListener('click', () => window.e2k.win(b.dataset.win)));
  window.e2k.onMaximized((max) => {
    const b = $('#maxbtn');
    b.innerHTML = max ? '&#xE923;' : '&#xE922;';
    b.title = max ? 'Restore Down' : 'Maximize';
  });
  $('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('.wc')) window.e2k.win('max'); });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Escape') { closeMenus(); hideSuggest(); closeOverlays(); return; }
    if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); fwd(); }
    else if (k === 'F5') { e.preventDefault(); reload(); }
    else if (e.ctrlKey && !e.shiftKey) {
      const map = { p: 'print', f: 'find', h: 'home', '=': 'bigger', '+': 'bigger', '-': 'smaller', '0': 'normal' };
      const c = map[k.toLowerCase()];
      if (c) { e.preventDefault(); runCmd(c); }
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 3) back();
    if (e.button === 4) fwd();
  });

  // ---------- API for games ----------
  const E2K = window.E2K = {
    h, svg, icon, store, route, go,
    openArticle: (t) => openArticle(t),
    setIdle, setStatus,
    dialog: (...args) => dialog(...args),
    soundOn: () => soundOn(),
    sfx: (kind) => { if (soundOn()) { try { E2KAudio.sfx(kind); } catch {} } },
  };

  // ---------- start ----------
  const start = location.hash.slice(1) || 'home';
  go(start);
})();
