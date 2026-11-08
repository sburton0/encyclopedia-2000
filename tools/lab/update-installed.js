// The lab's test of an installed copy updating itself (the Windows installer's copy, or the Mac app in /Applications), run on
// the test machine by the lab agent ("npm run lab -- update-installed"), against a stand-in for GitHub on the same machine
// that serves the new release's files, so a release can be tested before it's published. The old version is the real app,
// installed the way a person would (the released installer, or the Mac zip), and is pointed at the stand-in by editing its
// resources/app-update.yml (provider "generic", with GitHub's one-range-per-request downloads and, on Windows, the same
// signature check); the update itself puts the release's own app-update.yml back, which is checked.
// Two rounds, each from a fresh install of the old version with a favorite saved:
//   Restart Now: the app downloads the update by itself, Restart Now is pressed (through the page, as its button does);
//     the app closes, the new version is installed and starts by itself.
//   Update on Close: the app downloads it by itself and is closed like a person would; the new version is installed, and
//     the next start is the new version.
// Both: the new version keeps the favorite and the settings. The stand-in's log shows whether the download was partial
// (a differential download: only the changed parts, by range requests) or the whole file.
//   node tools/lab/update-installed.js --old-dir <folder with the old installer .exe or Mac .zip>
//                                      --files <folder with latest.yml or latest-mac.yml, the new file, the blockmaps>
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HOME = os.homedir();
const resolve = (p) => (path.isAbsolute(p) ? p : path.join(HOME, p));
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
if (!WIN && !MAC) { console.log('Only on Windows and macOS (the Linux .deb doesn\'t update itself).'); process.exit(2); }
const OLD_DIR = resolve(opt('--old-dir')), FILES = resolve(opt('--files'));
const OLD_RE = WIN ? /^Encyclopedia-2000-Installer-(.+)\.exe$/ : /^Encyclopedia-2000-(.+)-mac\.zip$/;
const oldName = fs.readdirSync(OLD_DIR).find((f) => OLD_RE.test(f));
if (!oldName) { console.log(`No old ${WIN ? 'installer' : 'Mac zip'} in ${OLD_DIR}`); process.exit(2); }
const OLD = path.join(OLD_DIR, oldName), OLD_VERSION = oldName.match(OLD_RE)[1];
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const RESULTS = path.join(HOME, 'e2k', 'tools', 'test', 'results', `update-installed-${stamp}`);
fs.mkdirSync(RESULTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 1000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(every)) if (await fn()) return true; return !!(await fn()); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const checks = [];
let group = '';
const check = (name, ok, detail) => { checks.push({ group, name, ok: !!ok, detail }); console.log(`  ${group} · ${name} … ${ok ? 'ok' : 'FAILED'}${!ok && detail ? ` (${detail})` : ''}`); return !!ok; };
const sh = (cmd, timeout = 120000) => execFileSync(WIN ? 'powershell' : '/bin/bash', WIN ? ['-NoProfile', '-NonInteractive', '-Command', cmd] : ['-c', cmd], { encoding: 'utf8', windowsHide: true, timeout }).trim();
const lit = (s) => (WIN ? `'${String(s).replace(/'/g, "''")}'` : `'${String(s).replace(/'/g, "'\\''")}'`);

// --- The platform ------------------------------------------------------------------------------------------------------
const LOCAL = process.env.LOCALAPPDATA || '';
const P = WIN ? {
  exe: path.join(LOCAL, 'Programs', 'encyclopedia-2000', 'Encyclopedia 2000.exe'),
  yml: path.join(LOCAL, 'Programs', 'encyclopedia-2000', 'resources', 'app-update.yml'),
  data: path.join(process.env.APPDATA || '', 'encyclopedia-2000'),
  pending: path.join(LOCAL, 'encyclopedia-2000-updater', 'pending'),
} : {
  app: '/Applications/Encyclopedia 2000.app',
  exe: '/Applications/Encyclopedia 2000.app/Contents/MacOS/Encyclopedia 2000',
  yml: '/Applications/Encyclopedia 2000.app/Contents/Resources/app-update.yml',
  data: path.join(HOME, 'Library', 'Application Support', 'encyclopedia-2000'),
  pending: path.join(HOME, 'Library', 'Caches', 'encyclopedia-2000-updater', 'pending'),
};
const version = () => {
  try {
    return WIN ? sh(`(Get-Item -LiteralPath ${lit(P.exe)}).VersionInfo.ProductVersion`)
      : sh(`defaults read ${lit(path.join(P.app, 'Contents', 'Info'))} CFBundleShortVersionString`);
  } catch { return ''; }
};
const isVersion = (v, want) => !!v && (v === want || v.replace(/\.0$/, '') === want.replace(/-.*/, ''));
const running = () => {
  try {
    return WIN ? Number(sh(`@(Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' }).Count`)) > 0
      : sh(`pgrep -f ${lit(P.exe)} || true`).length > 0;
  } catch { return false; }
};
const windowUp = () => {
  try {
    return WIN ? Number(sh(`@(Get-Process | Where-Object { $_.MainWindowTitle -like '*Encyclopedia 2000*' }).Count`)) > 0 : running();
  } catch { return false; }
};
const kill = () => { try { sh(WIN ? `Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' } | Stop-Process -Force; 'ok'` : `pkill -f ${lit(P.exe)}; true`); } catch {} };
// Closing it as a person would (its window's close button on Windows, Quit on the Mac): the app quits, and the update
// installs on the way out.
const close = () => {
  try { sh(WIN ? `Get-Process | Where-Object { $_.MainWindowTitle -like '*Encyclopedia 2000*' } | ForEach-Object { [void]$_.CloseMainWindow() }; 'ok'` : `osascript -e 'quit app "Encyclopedia 2000"'`); } catch {}
};
const signature = () => {
  try {
    return WIN ? sh(`$s=Get-AuthenticodeSignature -LiteralPath ${lit(P.exe)}; "$($s.Status) $($s.SignerCertificate.Subject)"`)
      : sh(`codesign --verify --deep --strict ${lit(P.app)} 2>&1 && spctl -a -vv ${lit(P.app)} 2>&1 | tr '\\n' ' '`);
  } catch (e) { return String(e.stdout || e.message); }
};
const signedOk = (s) => (WIN ? /^Valid .*Scott Burton/.test(s) : /accepted/.test(s) && /Notarized Developer ID/.test(s));
async function installOld() {
  kill();
  await sleep(2000);
  if (WIN) {
    // The released installer, silently, as electron-updater runs one (the same per-user install).
    execFileSync(OLD, ['/S'], { timeout: 300000, windowsHide: true });
    await sleep(3000);
  } else {
    fs.rmSync(P.app, { recursive: true, force: true });
    sh(`ditto -x -k ${lit(OLD)} /Applications`, 300000);
  }
  kill();
  // Only the downloaded update goes; the installer's own copy beside it (Windows) is what a partial download builds on.
  fs.rmSync(P.pending, { recursive: true, force: true });
}

// The app, started directly (so the test's settings reach it; on the Mac, `open` would drop them).
function start(env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('E2K_')));
  spawn(P.exe, [], { env: { ...clean, ...env }, detached: true, stdio: 'ignore', cwd: path.dirname(P.exe) }).unref();
}
// The app's test hook: runs a script in the page after a delay, writes its result, and quits.
async function hook(js, name, delay = 15000) {
  const out = path.join(RESULTS, `${name}.json`);
  fs.rmSync(out, { force: true });
  start({ E2K_CAPTURE: path.join(RESULTS, `${name}.png`), E2K_EVAL: js, E2K_EVAL_OUT: out, E2K_DELAY: String(delay), E2K_MUTE: '1' });
  await until(() => fs.existsSync(out), delay + 180000);
  await until(() => !running(), 60000);
  return readJson(out);
}
const FAV = [{ title: 'Lab test favorite', desc: 'Saved before the update' }];
const SET_FAV = `localStorage.setItem('e2k.favorites', ${JSON.stringify(JSON.stringify(FAV))}); localStorage.getItem('e2k.favorites')`;
const GET = `({ favorites: localStorage.getItem('e2k.favorites'), agent: navigator.userAgent })`;
// Waits until the update is downloaded, then presses Restart Now (what its button does); after a restart into the new
// version (which on Windows inherits these settings) it finds nothing to update and just reports.
const RESTART_NOW = `(async () => {
  const end = Date.now() + 15 * 60 * 1000;
  let s = await e2k.update.state();
  while (Date.now() < end && !['ready', 'none', 'error'].includes(s.state)) { await new Promise((r) => setTimeout(r, 1000)); s = await e2k.update.state(); }
  if (s.state === 'ready') e2k.update.install();
  return { state: s.state, version: s.version, agent: navigator.userAgent };
})()`;
const agentVersion = (a) => ((a || '').match(/encyclopedia-?2000\/(\S+)/i) || [])[1] || '';

// --- The stand-in for GitHub -------------------------------------------------------------------------------------------
const feedFile = fs.readdirSync(FILES).find((f) => (WIN ? /^latest\.yml$/ : /^latest-mac\.yml$/).test(f));
if (!feedFile) { console.log(`No ${WIN ? 'latest.yml' : 'latest-mac.yml'} in ${FILES}`); process.exit(2); }
const feed = fs.readFileSync(path.join(FILES, feedFile), 'utf8');
const NEW_VERSION = (feed.match(/^version:\s*(.+)$/m) || [])[1].trim();
const NEW_FILE = (feed.match(/^path:\s*(.+)$/m) || [])[1].trim();
const log = [];
const server = http.createServer((req, res) => {
  const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
  const entry = { method: req.method, name, range: req.headers.range || '', status: 200, bytes: 0 };
  log.push(entry);
  // Any channel's feed (latest.yml, beta.yml, latest-mac.yml…) is the new release's.
  if (/\.yml$/.test(name)) { const b = Buffer.from(feed); entry.bytes = b.length; return res.end(b); }
  const file = path.join(FILES, name);
  if (!name || !fs.existsSync(file)) { entry.status = 404; res.statusCode = 404; return res.end(); }
  const size = fs.statSync(file).size;
  const m = /^bytes=(\d+)-(\d*)$/.exec(entry.range);
  if (m) {
    const from = Number(m[1]), to = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    entry.status = 206;
    entry.bytes = to - from + 1;
    res.writeHead(206, { 'Content-Range': `bytes ${from}-${to}/${size}`, 'Content-Length': entry.bytes, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(file, { start: from, end: to }).pipe(res);
  }
  if (entry.range) { entry.status = 416; res.statusCode = 416; return res.end(); }   // GitHub sends one range per request too
  entry.bytes = size;
  res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const releaseYml = () => { try { return fs.readFileSync(P.yml, 'utf8'); } catch { return ''; } };
  const pointAtStandIn = () => {
    const publisher = (releaseYml().match(/^publisherName:[\s\S]*?(?=^\S|$(?![\s\S]))/m) || [''])[0];
    fs.writeFileSync(P.yml, `provider: generic\nurl: ${origin}\nuseMultipleRangeRequest: false\nupdaterCacheDirName: encyclopedia-2000-updater\n${publisher}`);
  };
  const newSize = fs.statSync(path.join(FILES, NEW_FILE)).size;
  const download = () => {
    const got = log.filter((e) => e.name === NEW_FILE && e.method === 'GET');
    const ranges = got.filter((e) => e.status === 206).length, bytes = got.reduce((n, e) => n + e.bytes, 0);
    return { ranges, bytes, whole: got.some((e) => e.status === 200), text: `${(bytes / 1048576).toFixed(1)} of ${(newSize / 1048576).toFixed(1)} MB${ranges ? ` in ${ranges} ranges` : ''}` };
  };

  for (const how of ['Restart Now', 'Update on Close']) {
    group = how;
    log.length = 0;
    try {
      await installOld();
      check(`${OLD_VERSION} installed`, isVersion(version(), OLD_VERSION), version());
      const original = releaseYml();
      check('…it updates from GitHub (its app-update.yml)', /provider: github/.test(original), original.replace(/\n/g, ' '));
      check('A favorite saved', (await hook(SET_FAV, `${how}-favorite`)) === JSON.stringify(FAV));
      const settings0 = readJson(path.join(P.data, 'settings.json')) || {};
      pointAtStandIn();
      const t0 = Date.now();
      if (how === 'Restart Now') {
        const out = path.join(RESULTS, 'restart-now.json');
        fs.rmSync(out, { force: true });
        start({ E2K_CAPTURE: path.join(RESULTS, 'restart-now.png'), E2K_EVAL: RESTART_NOW, E2K_EVAL_OUT: out, E2K_DELAY: '3000', E2K_EVAL_WAIT: '30000', E2K_MUTE: '1' });
        const ready = await until(() => (readJson(out) || {}).state === 'ready', 16 * 60 * 1000, 2000);
        check(`It finds ${NEW_VERSION} and downloads it by itself`, ready, `${Math.round((Date.now() - t0) / 1000)} s, ${JSON.stringify(readJson(out))}`);
        check('…a partial download (only the changed parts)', download().ranges > 0 && !download().whole, download().text);
        console.log(`    downloaded ${download().text}`);
        check(`Restart Now: ${NEW_VERSION} is installed`, await until(() => isVersion(version(), NEW_VERSION), 300000, 2000), version());
        if (WIN) {
          // The new version starts by itself with the same test settings, finds nothing new, and reports from the new version.
          check('…and starts by itself', await until(() => isVersion(agentVersion((readJson(out) || {}).agent), NEW_VERSION), 180000, 2000), JSON.stringify(readJson(out)));
        } else {
          check('…and starts by itself', await until(running, 120000, 2000));
          await sleep(5000);
        }
        await until(() => !running(), 90000);
        close();
        await until(() => !running(), 30000);
        kill();
      } else {
        start();
        check('It starts', await until(windowUp, 120000));
        const info = path.join(P.pending, 'update-info.json');
        const got = await until(() => ((readJson(info) || {}).fileName || '').includes(NEW_VERSION), 16 * 60 * 1000, 2000);
        check(`It finds ${NEW_VERSION} and downloads it by itself`, got, `${Math.round((Date.now() - t0) / 1000)} s, ${JSON.stringify(readJson(info))}`);
        check('…a partial download (only the changed parts)', download().ranges > 0 && !download().whole, download().text);
        console.log(`    downloaded ${download().text}`);
        // (On the Mac, electron-updater then hands the download to Squirrel.Mac, which fetches it once more, locally.)
        await sleep(MAC ? 20000 : 5000);
        close();
        check(`Closing it installs ${NEW_VERSION}`, await until(() => isVersion(version(), NEW_VERSION) && !running(), 300000, 2000), version());
        await sleep(3000);
      }
      check('…signed as released', signedOk(signature()), signature());
      check('…with the release\'s own app-update.yml again (GitHub)', /provider: github/.test(releaseYml()) && !releaseYml().includes('127.0.0.1'), releaseYml().replace(/\n/g, ' '));
      const after = await hook(GET, `${how}-after`);
      check(`The next start is ${NEW_VERSION}, and the favorite is kept`, after && isVersion(agentVersion(after.agent), NEW_VERSION) && after.favorites === JSON.stringify(FAV), JSON.stringify(after));
      const settings1 = readJson(path.join(P.data, 'settings.json')) || {};
      check('Settings kept', Object.keys(settings0).filter((k) => !['bounds', 'maximized'].includes(k)).every((k) => JSON.stringify(settings0[k]) === JSON.stringify(settings1[k])), JSON.stringify(settings1));
    } catch (e) {
      check('Ran to the end', false, e.message);
    }
    fs.writeFileSync(path.join(RESULTS, `${how}-requests.json`), JSON.stringify(log, null, 1));
    kill();
  }
  server.close();

  const groups = [...new Set(checks.map((c) => c.group))];
  const bad = new Set(checks.filter((c) => !c.ok).map((c) => c.group));
  const passed = groups.length - bad.size;
  const md = [`# Installed update: ${path.basename(OLD)} (${OLD_VERSION}) → ${NEW_FILE} (${NEW_VERSION})`, '',
    `${new Date().toLocaleString()} on ${os.hostname()}, ${os.platform()} ${os.release()}.`, '', `${passed} of ${groups.length} passed.`, ''];
  for (const g of groups) {
    md.push(`### ${bad.has(g) ? '✗' : '✓'} ${g}`, '');
    for (const c of checks.filter((x) => x.group === g)) md.push(`- ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    md.push('');
  }
  fs.writeFileSync(path.join(RESULTS, 'report.md'), md.join('\n'));
  console.log(`  ${passed} of ${groups.length} passed. Report: ${RESULTS}`);
  process.exit(bad.size ? 1 : 0);
})().catch((e) => { console.log(`  FAILED: ${e.stack}`); process.exit(1); });
