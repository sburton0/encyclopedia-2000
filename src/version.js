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

// Units follow the Metric or Imperial setting in Tools > Options > Appearance, also switchable inside the Solar System
// and World Explorer (saved as e2k.units). Until someone chooses, the computer's regional format decides: the US,
// Liberia, and Myanmar get Imperial, everyone else Metric.
window.E2KUnits = {
  system() {
    try { const v = JSON.parse(localStorage.getItem('e2k.units')); if (v === 'metric' || v === 'imperial') return v; } catch {}
    const locale = (window.e2k && window.e2k.systemLocale) || navigator.language || '';
    return /[-_](US|LR|MM)$/i.test(locale) ? 'imperial' : 'metric';
  },
  set(system) { try { localStorage.setItem('e2k.units', JSON.stringify(system)); } catch {} },
  imperial() { return this.system() === 'imperial'; },
  // "12,742 km" or "7,918 mi"
  length(km) { const v = this.imperial() ? km / 1.609344 : km; return `${Math.round(v).toLocaleString('en-US')} ${this.imperial() ? 'mi' : 'km'}`; },
  // "57.9 million km" or "36.0 million mi"
  far(km) {
    const v = this.imperial() ? km / 1.609344 : km, u = this.imperial() ? 'mi' : 'km';
    return v >= 1e9 ? `${(v / 1e9).toFixed(2)} billion ${u}` : `${(v / 1e6).toFixed(1)} million ${u}`;
  },
  // "5,500 °C" or "9,900 °F", rounded to the nearest 100 like the figures it shows
  temp(c) { const v = this.imperial() ? c * 9 / 5 + 32 : c; return `${(Math.round(v / 100) * 100).toLocaleString('en-US')} °${this.imperial() ? 'F' : 'C'}`; },
};

window.E2KVersion = {
  pretty(v = '') {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta(?:\.(\d+))?)?/.exec(v);
    if (!m) return v;
    const base = m[3] === '0' ? `${m[1]}.${m[2]}` : `${m[1]}.${m[2]}.${m[3]}`;
    return /-beta/.test(v) ? `${base} Beta${m[4] && m[4] !== '1' ? ' ' + m[4] : ''}` : base;
  },
};
