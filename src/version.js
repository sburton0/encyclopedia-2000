// Turns the package version into the name people see: "0.1.1-beta" reads as "0.1.1 Beta", "0.1.0-beta.2" as
// "0.1 Beta 2", "0.2.0" as "0.2", and "1.0.0" as "1.0". Shared by the main window and the startup screen.
window.E2KVersion = {
  pretty(v = '') {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta(?:\.(\d+))?)?/.exec(v);
    if (!m) return v;
    const base = m[3] === '0' ? `${m[1]}.${m[2]}` : `${m[1]}.${m[2]}.${m[3]}`;
    return /-beta/.test(v) ? `${base} Beta${m[4] && m[4] !== '1' ? ' ' + m[4] : ''}` : base;
  },
};
