// Periodic Table activity: all 118 elements, colored by family, with a details card and a live Wikipedia summary.
(() => {
  // Families: [key label, color, singular name for the details card]
  const FAMILY = {
    alkali: ['Alkali metals', '#ff8a7a', 'Alkali metal'],
    alkaline: ['Alkaline earth metals', '#ffb866', 'Alkaline earth metal'],
    transition: ['Transition metals', '#ffd97a', 'Transition metal'],
    post: ['Post-transition metals', '#b8e494', 'Post-transition metal'],
    metalloid: ['Metalloids', '#66d6c3', 'Metalloid'],
    nonmetal: ['Other nonmetals', '#86c8ff', 'Nonmetal'],
    halogen: ['Halogens', '#a3b1ff', 'Halogen'],
    noble: ['Noble gases', '#cdb4ff', 'Noble gas'],
    lanthanide: ['Lanthanides', '#ffa8cc', 'Lanthanide'],
    actinide: ['Actinides', '#f5b0f0', 'Actinide'],
    unknown: ['Unknown properties', '#c2c9d4', 'Unknown chemical properties'],
  };

  // number symbol name mass family. Masses in [brackets] are the most stable isotope of an element with no standard atomic weight.
  const RAW = `1 H Hydrogen 1.008 nonmetal|2 He Helium 4.0026 noble|3 Li Lithium 6.94 alkali|4 Be Beryllium 9.0122 alkaline|5 B Boron 10.81 metalloid
|6 C Carbon 12.011 nonmetal|7 N Nitrogen 14.007 nonmetal|8 O Oxygen 15.999 nonmetal|9 F Fluorine 18.998 halogen|10 Ne Neon 20.180 noble
|11 Na Sodium 22.990 alkali|12 Mg Magnesium 24.305 alkaline|13 Al Aluminium 26.982 post|14 Si Silicon 28.085 metalloid|15 P Phosphorus 30.974 nonmetal
|16 S Sulfur 32.06 nonmetal|17 Cl Chlorine 35.45 halogen|18 Ar Argon 39.95 noble|19 K Potassium 39.098 alkali|20 Ca Calcium 40.078 alkaline
|21 Sc Scandium 44.956 transition|22 Ti Titanium 47.867 transition|23 V Vanadium 50.942 transition|24 Cr Chromium 51.996 transition|25 Mn Manganese 54.938 transition
|26 Fe Iron 55.845 transition|27 Co Cobalt 58.933 transition|28 Ni Nickel 58.693 transition|29 Cu Copper 63.546 transition|30 Zn Zinc 65.38 transition
|31 Ga Gallium 69.723 post|32 Ge Germanium 72.630 metalloid|33 As Arsenic 74.922 metalloid|34 Se Selenium 78.971 nonmetal|35 Br Bromine 79.904 halogen
|36 Kr Krypton 83.798 noble|37 Rb Rubidium 85.468 alkali|38 Sr Strontium 87.62 alkaline|39 Y Yttrium 88.906 transition|40 Zr Zirconium 91.224 transition
|41 Nb Niobium 92.906 transition|42 Mo Molybdenum 95.95 transition|43 Tc Technetium [98] transition|44 Ru Ruthenium 101.07 transition|45 Rh Rhodium 102.91 transition
|46 Pd Palladium 106.42 transition|47 Ag Silver 107.87 transition|48 Cd Cadmium 112.41 transition|49 In Indium 114.82 post|50 Sn Tin 118.71 post
|51 Sb Antimony 121.76 metalloid|52 Te Tellurium 127.60 metalloid|53 I Iodine 126.90 halogen|54 Xe Xenon 131.29 noble|55 Cs Caesium 132.91 alkali
|56 Ba Barium 137.33 alkaline|57 La Lanthanum 138.91 lanthanide|58 Ce Cerium 140.12 lanthanide|59 Pr Praseodymium 140.91 lanthanide|60 Nd Neodymium 144.24 lanthanide
|61 Pm Promethium [145] lanthanide|62 Sm Samarium 150.36 lanthanide|63 Eu Europium 151.96 lanthanide|64 Gd Gadolinium 157.25 lanthanide|65 Tb Terbium 158.93 lanthanide
|66 Dy Dysprosium 162.50 lanthanide|67 Ho Holmium 164.93 lanthanide|68 Er Erbium 167.26 lanthanide|69 Tm Thulium 168.93 lanthanide|70 Yb Ytterbium 173.05 lanthanide
|71 Lu Lutetium 174.97 lanthanide|72 Hf Hafnium 178.49 transition|73 Ta Tantalum 180.95 transition|74 W Tungsten 183.84 transition|75 Re Rhenium 186.21 transition
|76 Os Osmium 190.23 transition|77 Ir Iridium 192.22 transition|78 Pt Platinum 195.08 transition|79 Au Gold 196.97 transition|80 Hg Mercury 200.59 transition
|81 Tl Thallium 204.38 post|82 Pb Lead 207.2 post|83 Bi Bismuth 208.98 post|84 Po Polonium [209] post|85 At Astatine [210] halogen
|86 Rn Radon [222] noble|87 Fr Francium [223] alkali|88 Ra Radium [226] alkaline|89 Ac Actinium [227] actinide|90 Th Thorium 232.04 actinide
|91 Pa Protactinium 231.04 actinide|92 U Uranium 238.03 actinide|93 Np Neptunium [237] actinide|94 Pu Plutonium [244] actinide|95 Am Americium [243] actinide
|96 Cm Curium [247] actinide|97 Bk Berkelium [247] actinide|98 Cf Californium [251] actinide|99 Es Einsteinium [252] actinide|100 Fm Fermium [257] actinide
|101 Md Mendelevium [258] actinide|102 No Nobelium [259] actinide|103 Lr Lawrencium [266] actinide|104 Rf Rutherfordium [267] transition|105 Db Dubnium [268] transition
|106 Sg Seaborgium [269] transition|107 Bh Bohrium [270] transition|108 Hs Hassium [269] transition|109 Mt Meitnerium [278] unknown|110 Ds Darmstadtium [281] unknown
|111 Rg Roentgenium [282] unknown|112 Cn Copernicium [285] unknown|113 Nh Nihonium [286] unknown|114 Fl Flerovium [289] unknown|115 Mc Moscovium [290] unknown
|116 Lv Livermorium [293] unknown|117 Ts Tennessine [294] unknown|118 Og Oganesson [294] unknown`;

  const ARTICLE = { Hg: 'Mercury (element)' };

  // Grid position: columns 1-18, rows 1-7, plus rows 8-9 for the lanthanides and actinides.
  function place(z) {
    if (z === 1) return [1, 1];
    if (z === 2) return [18, 1];
    const blocks = [[3, 10, 2], [11, 18, 3]];
    for (const [a, b, row] of blocks) if (z >= a && z <= b) return [z - a < 2 ? z - a + 1 : z - a + 11, row];
    if (z <= 36) return [z - 18, 4];
    if (z <= 54) return [z - 36, 5];
    if (z >= 57 && z <= 71) return [z - 54, 8];
    if (z >= 89 && z <= 103) return [z - 86, 9];
    const base = z <= 86 ? 54 : 86;
    const row = z <= 86 ? 6 : 7;
    const n = z - base; // 1..32
    return [n <= 2 ? n : n - 14, row];
  }
  function block(z, col, row) {
    if (row >= 8) return 'f';
    if (col <= 2 || z === 2) return 's';
    if (col >= 13) return 'p';
    return 'd';
  }

  const ELEMENTS = RAW.split('|').map((s) => s.trim()).filter(Boolean).map((line) => {
    const [n, sym, name, mass, fam] = line.split(' ');
    const z = Number(n);
    const [col, row] = place(z);
    const period = row >= 8 ? (row === 8 ? 6 : 7) : row;
    const group = row >= 8 ? null : col;
    return { z, sym, name, mass, fam, col, row, period, group, block: block(z, col, row), article: ARTICLE[sym] || name };
  });

  // Layout on a 1024 x 610 canvas that scales to fit.
  const W = 1024, H = 610, X0 = 30, Y0 = 74, P = 46, S = 43, F_GAP = 16;
  const x = (col) => X0 + (col - 1) * P;
  const y = (row) => (row <= 7 ? Y0 + (row - 1) * P : Y0 + 7 * P + F_GAP + (row - 8) * P);

  function mount(root, api) {
    const { h } = api;
    let selected = null;
    let filter = null;
    let disposed = false;
    const summaries = new Map();
    root.classList.add('pt');

    const tiles = new Map();
    const tileFor = (el) => {
      const b = h('button', {
        class: 'pt-el', title: `${el.name} (${el.z})`,
        style: `left:${x(el.col)}px;top:${y(el.row)}px;--c:${FAMILY[el.fam][1]}`,
        onclick: () => select(el), onmouseenter: () => showCard(el, true), onmouseleave: () => showCard(selected, false),
      }, h('i', {}, String(el.z)), h('b', {}, el.sym));
      tiles.set(el.z, b);
      return b;
    };
    const ph = (label, row, fam) => h('div', { class: 'pt-ph', style: `left:${x(3)}px;top:${y(row)}px;--c:${FAMILY[fam][1]}` }, label);

    // Details card, in the gap above the transition metals.
    const card = h('div', { class: 'pt-card', style: `left:${x(3)}px;top:${Y0}px;width:${10 * P - 3}px;height:${3 * P - 3}px` });

    const key = h('div', { class: 'pt-key', style: `left:${x(18) + P + 8}px;top:${Y0}px` },
      h('small', {}, 'KEY'),
      Object.entries(FAMILY).map(([fam, [label, color]]) => h('button', { class: 'pt-fam', 'data-fam': fam, onclick: () => setFilter(fam) },
        h('i', { style: `background:${color}` }), label)),
      h('button', { class: 'pt-fam all', onclick: () => setFilter(null) }, 'Show all'));

    const canvas = h('div', { class: 'pt-canvas' },
      h('div', { class: 'pt-head' }, h('h1', {}, 'Periodic Table')),
      card,
      ELEMENTS.map(tileFor),
      ph('57–71', 6, 'lanthanide'), ph('89–103', 7, 'actinide'),
      key,
      h('p', { class: 'pt-hint', style: `left:${X0}px;top:${y(9) + P + 12}px` },
        'Point at an element to preview it, and click to learn more. Click a family in the key to highlight it.'));
    root.append(h('div', { class: 'pt-holder' }, canvas));
    const fit = () => canvas.style.setProperty('--s', Math.min(api.maxCanvas || 9, root.clientWidth / W, root.clientHeight / H));
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();

    function setFilter(fam) {
      filter = filter === fam ? null : fam;
      ELEMENTS.forEach((el) => tiles.get(el.z).classList.toggle('dim', !!filter && el.fam !== filter));
      key.querySelectorAll('.pt-fam[data-fam]').forEach((b) => b.classList.toggle('on', b.dataset.fam === filter));
      canvas.querySelectorAll('.pt-ph').forEach((p, i) => p.classList.toggle('dim', !!filter && filter !== (i ? 'actinide' : 'lanthanide')));
    }

    function select(el) {
      selected = el;
      tiles.forEach((t) => t.classList.remove('sel'));
      tiles.get(el.z).classList.add('sel');
      showCard(el, false);
      if (!summaries.has(el.z)) {
        summaries.set(el.z, Wiki.summary(el.article).catch(() => null));
      }
      summaries.get(el.z).then((s) => { if (!disposed && selected === el) fillSummary(el, s); });
    }

    function showCard(el, preview) {
      if (!el) {
        card.replaceChildren(h('div', { class: 'pt-intro' },
          h('b', {}, 'The building blocks of everything'),
          h('p', {}, 'Every substance on Earth is made from these 118 elements. Each one is a different kind of atom, arranged by its atomic number: the number of protons in its center.')));
        return;
      }
      const [, color, famName] = FAMILY[el.fam];
      card.replaceChildren(
        h('div', { class: 'pt-big', style: `--c:${color}` }, h('i', {}, String(el.z)), h('b', {}, el.sym), h('span', {}, el.name), h('small', {}, el.mass)),
        h('div', { class: 'pt-info' },
          h('h2', {}, el.name),
          h('div', { class: 'pt-tags' },
            h('span', { class: 'chip', style: `--c:${color}` }, famName),
            h('span', {}, el.group ? `Group ${el.group} · Period ${el.period}` : `Period ${el.period} · ${el.block}-block`),
            // Every isotope of technetium, promethium, and element 84 onward is radioactive; from americium (95) on, they only exist when made in labs.
            el.z >= 95 ? h('span', {}, 'Synthetic: made in laboratories') : (el.z >= 84 || el.z === 43 || el.z === 61) ? h('span', {}, 'Radioactive') : null),
          h('p', { class: 'pt-sum' }, preview ? 'Click to read about it.' : 'Loading…'),
          preview ? null : h('button', { class: 'bbtn pt-read', onclick: () => api.openArticle(el.article) }, `Read about ${el.name} ›`)));
      if (!preview && summaries.has(el.z)) summaries.get(el.z).then((s) => { if (!disposed && selected === el) fillSummary(el, s); });
    }

    function fillSummary(el, s) {
      const p = card.querySelector('.pt-sum');
      if (!p) return;
      let parts = s && s.extract ? s.extract.split(/(?<=[.!?])\s+(?=[A-Z])/) : [];
      // The opening sentence usually just restates the symbol and atomic number shown on the tile.
      if (parts.length > 1 && /chemical element/i.test(parts[0])) parts = parts.slice(1);
      const text = parts.length ? parts.slice(0, 2).join(' ').replace(/^It (is|was|has) /, `${el.name} $1 `) : 'The summary couldn’t be loaded. Check your internet connection.';
      p.textContent = text;
    }

    showCard(null, false);
    return () => { disposed = true; ro.disconnect(); };
  }

  function art(api) {
    const { h } = api;
    const sample = [[1, 1, 'H', 'nonmetal'], [2, 1, 'He', 'noble'], [1, 2, 'Li', 'alkali'], [2, 2, 'Be', 'alkaline'], [3, 2, 'Fe', 'transition'],
      [4, 2, 'Cu', 'transition'], [5, 2, 'C', 'nonmetal'], [6, 2, 'O', 'nonmetal'], [3, 1, 'Au', 'transition'], [4, 1, 'Si', 'metalloid'], [5, 1, 'Cl', 'halogen'], [6, 1, 'Ne', 'noble']];
    return h('div', { class: 'pt-art' }, sample.map(([c, r, sym, fam]) => h('i', { style: `grid-column:${c};grid-row:${r};--c:${FAMILY[fam][1]}` }, sym)));
  }

  E2KActivities.register({
    id: 'periodic-table',
    name: 'Periodic Table',
    category: 'Science',
    blurb: 'Explore all 118 chemical elements, colored by family, with details and a summary of each one from the encyclopedia.',
    art, mount,
  });
})();
