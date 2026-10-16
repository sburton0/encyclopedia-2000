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

window.E2KVersion = {
  pretty(v = '') {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta(?:\.(\d+))?)?/.exec(v);
    if (!m) return v;
    const base = m[3] === '0' ? `${m[1]}.${m[2]}` : `${m[1]}.${m[2]}.${m[3]}`;
    return /-beta/.test(v) ? `${base} Beta${m[4] && m[4] !== '1' ? ' ' + m[4] : ''}` : base;
  },
};
