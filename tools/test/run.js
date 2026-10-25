// Automated app tests: starts the real app once per scenario (scenarios.js), each with its own fresh profile, and
// writes a report with every check and screenshot to tools/test/results/<date and time>/report.md.
//   npm run test:app                      every scenario (about 5–10 minutes; needs an internet connection)
//   npm run test:app -- --only home,move  just those
//   npm run test:app -- --group offline   one group ("general", "offline library", "reading offline")
//   npm run test:app -- --list            list the scenarios
// Some scenarios download small libraries from Kiwix (3 and 18 MB). Runs on Windows, Mac, and Linux.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const scenarios = require('./scenarios.js');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

if (args.includes('--list')) {
  let g = '';
  for (const s of scenarios) { if (s.group !== g) console.log(`\n${(g = s.group)}`); console.log(`  ${s.name.padEnd(22)} ${s.title}`); }
  process.exit(0);
}
let chosen = scenarios;
if (opt('--only')) {
  const want = opt('--only').split(',');
  // A restart scenario needs the one before it; a scenario needing the test library needs "download".
  const add = new Set(want);
  for (const s of scenarios) if (add.has(s.name)) { if (s.reuse) add.add(s.reuse); if (s.needs === 'fixture') add.add('download'); }
  chosen = scenarios.filter((s) => add.has(s.name));
}
chosen = chosen.filter((s) => !s.only || s.only === process.platform);
if (opt('--group')) chosen = chosen.filter((s) => s.group.toLowerCase() === opt('--group').toLowerCase() || s.name === 'download');

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const RESULTS = path.join(__dirname, 'results', stamp);
const FIXTURES = path.join(RESULTS, 'fixtures');
fs.mkdirSync(RESULTS, { recursive: true });

// A tiny app folder whose package.json gives the runner the app's real name and version.
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const APPDIR = path.join(RESULTS, '.app');
fs.mkdirSync(APPDIR, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'runner.js'), path.join(APPDIR, 'runner.js'));
fs.writeFileSync(path.join(APPDIR, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName || pkg.build?.productName, version: pkg.version, main: 'runner.js' }));

const fixture = () => { try { return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fixture.json'), 'utf8')); } catch { return null; } };
function ctxFor(profile) {
  return {
    profile, fixtures: FIXTURES,
    // A library.json for the test library, with its file copied into dir (or nowhere, for a missing library).
    fixtureIn(dir) {
      const f = fixture();
      if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(FIXTURES, f.file), path.join(dir, f.file)); }
      return { dir: dir || '', current: f, download: null, checked: 0 };
    },
  };
}

function runOne(s) {
  return new Promise((resolve) => {
    const out = path.join(RESULTS, s.name);
    fs.mkdirSync(out, { recursive: true });
    const profile = s.reuse ? path.join(RESULTS, s.reuse, 'profile') : path.join(out, 'profile');
    if (!s.reuse) {
      fs.mkdirSync(profile, { recursive: true });
      const files = s.setup ? s.setup(ctxFor(profile)) : {};
      fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ showSplash: false, autoUpdate: false, ...files.settings }));
      if (files.library) fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify(files.library));
    }
    const env = {
      ...process.env, E2K_PROFILE: profile, E2K_MUTE: '1', E2K_NOSPLASH: '1', E2K_SIZE: '1260x900', E2K_ROUTE: s.route || 'home',
      E2K_TEST_APP: REPO, E2K_TEST_OUT: out, E2K_TEST_SCENARIO: s.name, E2K_TEST_FIXTURES: FIXTURES,
      E2K_TEST_SWITCHES: (s.switches || []).join('|'), ...s.env,
    };
    for (const k of ['E2K_CAPTURE', 'E2K_EVAL', 'E2K_ZIM']) delete env[k];
    const electron = require(path.join(REPO, 'node_modules', 'electron'));
    // On Linux (WSL, CI), Electron's sandbox helper usually isn't set up for a development copy.
    const child = spawn(electron, [APPDIR, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const kill = setTimeout(() => child.kill(), 200000);
    child.on('exit', () => {
      clearTimeout(kill);
      fs.writeFileSync(path.join(out, 'app.log'), log);
      let r;
      try { r = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')); } catch { r = { name: s.name, checks: [], shots: [], consoleErrors: [], error: 'the app quit without a result (see app.log)' }; }
      try { if (s.after) s.after(ctxFor(profile)); } catch (e) { r.error = r.error || `after: ${e.message}`; }
      resolve(r);
    });
  });
}

(async () => {
  const results = [];
  const t0 = Date.now();
  for (const s of chosen) {
    if (s.needs === 'fixture' && !fixture()) {
      results.push({ s, r: { checks: [], shots: [], consoleErrors: [], skipped: 'needs the test library, which "download" didn\'t save' } });
      console.log(`- ${s.name}: skipped (no test library)`);
      continue;
    }
    process.stdout.write(`  ${s.name} … `);
    const r = await runOne(s);
    results.push({ s, r });
    const fail = r.error || r.checks.some((c) => c.ok === false);
    console.log(fail ? `FAILED${r.error ? ` (${r.error.split('\n')[0]})` : ''}` : r.checks.some((c) => c.ok === null) ? 'skipped some' : 'ok');
    for (const c of r.checks.filter((c) => c.ok === false)) console.log(`      ✗ ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  }

  // The report: a summary, then every scenario with its checks and screenshots.
  const pass = (c) => (c.ok === true ? '✓' : c.ok === false ? '✗' : '–');
  const failed = results.filter(({ r }) => r.error || r.checks.some((c) => c.ok === false));
  const lines = [`# Encyclopedia 2000 ${pkg.version}: automated test results`, '',
    `${new Date().toLocaleString()} on ${process.platform} (${process.arch}), ${Math.round((Date.now() - t0) / 1000)} seconds. ` +
    `${results.length - failed.length} of ${results.length} scenarios passed.`, ''];
  let group = '';
  for (const { s, r } of results) {
    if (s.group !== group) lines.push(`## ${(group = s.group)}`, '');
    const bad = r.error || r.checks.some((c) => c.ok === false);
    lines.push(`### ${bad ? '✗' : '✓'} ${s.title} (\`${s.name}\`)`, '');
    if (r.skipped) lines.push(`Skipped: ${r.skipped}`, '');
    for (const c of r.checks) lines.push(`- ${pass(c)} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    if (r.error) lines.push(`- ✗ Error: ${r.error.split('\n')[0]}`);
    const errs = [...new Set(r.consoleErrors)].filter((e) => !/Failed to fetch|ERR_NAME_NOT_RESOLVED|net::ERR/.test(e));
    if (errs.length) lines.push(`- Console errors: ${errs.slice(0, 3).map((e) => `\`${e.slice(0, 160)}\``).join('; ')}`);
    lines.push('');
    for (const f of r.shots) lines.push(`![${f}](${s.name}/${f})`);
    if (r.shots.length) lines.push('');
  }
  fs.writeFileSync(path.join(RESULTS, 'report.md'), lines.join('\n'));
  fs.rmSync(APPDIR, { recursive: true, force: true });
  console.log(`\n${results.length - failed.length} of ${results.length} passed. Report: ${path.join(RESULTS, 'report.md')}`);
  process.exit(failed.length ? 1 : 0);
})();
