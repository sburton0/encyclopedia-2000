// The automated tests' Electron entry point: starts the real app (main.js) and runs one scenario from scenarios.js
// against its main window, then writes result.json and the screenshots to E2K_TEST_OUT and quits. run.js starts it
// once per scenario; it isn't meant to be run by hand.
const { app, BrowserWindow, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const REPO = process.env.E2K_TEST_APP;
const OUT = process.env.E2K_TEST_OUT;
const scenario = require(path.join(REPO, 'tools', 'test', 'scenarios.js')).find((s) => s.name === process.env.E2K_TEST_SCENARIO);
// Chromium switches a scenario asks for (for example, every address failing, as with no connection).
for (const sw of (process.env.E2K_TEST_SWITCHES || '').split('|').filter(Boolean)) {
  const i = sw.indexOf('=');
  app.commandLine.appendSwitch(i < 0 ? sw : sw.slice(0, i), i < 0 ? undefined : sw.slice(i + 1));
}

const result = { name: scenario.name, checks: [], shots: [], consoleErrors: [], error: null };
let finished = false;
function finish(code = 0) {
  if (finished) return;
  finished = true;
  try { fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2)); } catch {}
  app.exit(code);
}
setTimeout(() => { result.error = 'timed out'; finish(); }, Number(process.env.E2K_TEST_TIMEOUT || 150000));

let started = false;
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (e, ...legacy) => {
    const level = e.level ?? legacy[0], message = e.message ?? legacy[1];
    if (level === 'error' || level === 3) result.consoleErrors.push(String(message).slice(0, 300));
  });
  win.once('ready-to-show', () => {
    if (started || win.getBounds().width < 900) return;   // the startup screen is the small window
    started = true;
    run(win).catch((err) => { result.error = String(err && err.stack || err); }).finally(() => finish());
  });
});

async function run(win) {
  const wc = win.webContents;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t = {
    win, app, fs, path, sleep,
    profile: process.env.E2K_PROFILE,
    fixtures: process.env.E2K_TEST_FIXTURES,
    out: OUT,
    platform: process.platform,
    // Runs page code (the body of an async function) and returns its result.
    js: (code) => wc.executeJavaScript(`(async () => { ${code} })()`),
    async waitFor(code, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { if (await t.js(`return !!(await (${code}));`)) return true; } catch {}   // code may be a promise
        await sleep(150);
      }
      return false;
    },
    check(name, ok, detail = '') { result.checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); return !!ok; },
    skip(name, why) { result.checks.push({ name, ok: null, detail: why }); },
    async shot(name, w = win) {
      const img = await w.webContents.capturePage();
      const file = `${String(result.shots.length + 1).padStart(2, '0')}-${name}.png`;
      fs.writeFileSync(path.join(OUT, file), img.toPNG());
      result.shots.push(file);
    },
    net: () => t.js(`return document.getElementById('net').textContent;`),
    // Clicks an item in the menu bar by its label (on macOS the menus live there, and the page ignores Ctrl+ keys).
    menu(label) {
      const find = (items) => { for (const i of items || []) { if (i.label === label) return i; const sub = i.submenu && find(i.submenu.items); if (sub) return sub; } return null; };
      const item = find(Menu.getApplicationMenu()?.items);
      if (item) item.click();
      return !!item;
    },
    // A command the way people reach it: from the menu bar on a Mac, or with its keyboard shortcut elsewhere.
    async command(macLabel, key, mods = { ctrlKey: true }) {
      if (process.platform === 'darwin') return t.menu(macLabel);
      await t.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ...${JSON.stringify(mods)}, bubbles: true }));`);
      return true;
    },
    lib: () => t.js('return await window.e2k.library.state();'),
    windows: () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()),
    // Ends the app at once, without saving or asking: like the computer losing power.
    crash() { result.crashed = true; finish(); },
    // Counts the responses that came from the internet, from now on.
    async countNetwork() {
      let n = 0; const urls = [];
      wc.debugger.attach('1.3');
      wc.debugger.on('message', (_e, method, p) => {
        if (method === 'Network.responseReceived' && /^https?:/.test(p.response.url)) { n++; urls.push(p.response.url); }
      });
      await wc.debugger.sendCommand('Network.enable');
      return () => ({ n, urls: urls.slice(0, 5) });
    },
  };
  await t.waitFor('window.E2K && document.querySelector("#net")', 30000);
  await sleep(800);
  await scenario.run(t);
}

require(path.join(REPO, 'main.js'));
