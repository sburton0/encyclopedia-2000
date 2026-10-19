// Turns the package version into the name people see: "0.1.1-beta" reads as "0.1.1 Beta", "0.1.0-beta.2" as
// "0.1 Beta 2", "0.2.0" as "0.2", and "1.0.0" as "1.0". Shared by the main window and the startup screen.
// Clock times follow the 12-hour or 24-hour setting in Tools > Options > Appearance (saved as e2k.clock24).
window.E2KTime = {
  is24() { try { return JSON.parse(localStorage.getItem('e2k.clock24') || 'false') === true; } catch { return false; } },
  // Intl options for showing a time: "9:30 PM" or "21:30". Pass seconds: true to include seconds.
  opts({ seconds = false } = {}) {
    const h24 = this.is24();
    return { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: h24 ? 'h23' : 'h12' };
  },
};

// Units. The default is the Metric or Imperial setting in Tools > Options > Appearance (saved as e2k.units); until
// someone chooses, the computer's regional format decides (the US, Liberia, and Myanmar get Imperial). Inside the
// Solar System and World Explorer, a Units menu can switch just that activity until the app closes.
window.E2KUnits = {
  system() {
    try { const v = JSON.parse(localStorage.getItem('e2k.units')); if (v === 'metric' || v === 'imperial') return v; } catch {}
    const locale = (window.e2k && window.e2k.systemLocale) || navigator.language || '';
    return /[-_](US|LR|MM)$/i.test(locale) ? 'imperial' : 'metric';
  },
  // Per-activity choices for this session only; cleared when the default changes.
  picks: {},
  clearPicks() { this.picks = {}; },
  // Formatting for one activity: E2KUnits.in('solar').length(12742) gives "12,742 km" or "7,918 mi".
  in(id) {
    const imp = () => (this.picks[id] || this.system()) === 'imperial';
    return {
      imperial: imp,
      length: (km) => `${Math.round(imp() ? km / 1.609344 : km).toLocaleString('en-US')} ${imp() ? 'mi' : 'km'}`,
      // "57.9 million km" or "36.0 million mi"
      far: (km) => {
        const v = imp() ? km / 1.609344 : km, u = imp() ? 'mi' : 'km';
        return v >= 1e9 ? `${(v / 1e9).toFixed(2)} billion ${u}` : `${(v / 1e6).toFixed(1)} million ${u}`;
      },
      // "5,500 °C" or "9,900 °F", rounded to the nearest 100 like the figures it shows
      temp: (c) => `${(Math.round((imp() ? c * 9 / 5 + 32 : c) / 100) * 100).toLocaleString('en-US')} °${imp() ? 'F' : 'C'}`,
    };
  },
  // The "Units: Metric ▴" button and its menu (opening upward): Metric and Imperial, the default marked, and
  // "Change default…". onChange runs after a switch so the activity can redraw.
  menu(h, icon, id, onChange) {
    const NAMES = { metric: 'Metric', imperial: 'Imperial' };
    const current = () => this.picks[id] || this.system();
    const label = h('span');
    const pop = h('div', { class: 'unit-pop', role: 'menu', hidden: true });
    const btn = h('button', { class: 'unit-btn', title: 'Choose units for this activity', 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); pop.hidden ? open() : close(); } }, label);
    const wrap = h('div', { class: 'unit-menu' }, btn, pop);
    const away = (e) => { if (!wrap.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { pop.hidden = true; document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc, true); };
    const open = () => {
      const def = this.system();
      pop.replaceChildren(
        ...['metric', 'imperial'].map((v) => h('button', { class: 'ui' + (v === current() ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(v === current()),
          onclick: () => { if (v === def) delete this.picks[id]; else this.picks[id] = v; close(); show(); onChange(); } },
          h('i', { class: 'rb' }), NAMES[v], v === def ? h('em', {}, ' (Default)') : null)),
        h('hr'),
        h('button', { class: 'ui', role: 'menuitem', onclick: () => { close(); window.E2KOptions.open(window.E2K, 'Appearance', 'Units'); } },
          icon('gear'), 'Change default…'));
      pop.hidden = false;
      document.addEventListener('mousedown', away, true);
      document.addEventListener('keydown', esc, true);
    };
    const show = () => { label.textContent = `Units: ${NAMES[current()]} ▴`; };
    show();
    return wrap;
  },
};

window.E2KVersion = {
  pretty(v = '') {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta(?:\.(\d+))?)?/.exec(v);
    if (!m) return v;
    const base = m[3] === '0' ? `${m[1]}.${m[2]}` : `${m[1]}.${m[2]}.${m[3]}`;
    return /-beta/.test(v) ? `${base} Beta${m[4] && m[4] !== '1' ? ' ' + m[4] : ''}` : base;
  },
};
