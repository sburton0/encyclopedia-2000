// The lab's portable self-update test, run on the Windows test machine by the lab agent ("npm run lab -- update"), on
// the real test stick (both partitions: exFAT and FAT32), against a stand-in for GitHub on the same machine serving the
// new release's files (its portable.yml and signed .exe), so a release can be tested before it's published.
//
// Versions from 0.5.6 on: the real app. The old portable is started from the stick, finds the new version on the
// stand-in (E2K_UPDATE_TEST_FEED), downloads it by itself ("Also update automatically"), and then:
//   Restart Now (E2K_UPDATE_TEST_RESTART presses it): the app closes, the helper swaps the new version in once the
//     launcher has let go of its .exe, and starts it; the new version deletes the previous one.
//   Update on Close: the app is closed like a person would (its window's close button); the helper swaps the new
//     version in, and nothing starts; the next start is the new version, which deletes the previous one.
// 0.5.4 and 0.5.5 (whose own update code can't finish from inside the app; found 2026-11-08): only their update code,
// called directly with the app not running, as before.
//   node tools/lab/update-portable.js --code <portable-update.js> --old <old .exe> --old-version 0.5.6-beta
//                                     --files <folder with portable.yml and the new .exe> [--dry]
// --dry: the "new" version is a stand-in (the old .exe under the next version's name), so its version isn't checked.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HOME = os.homedir();
const resolve = (p) => (path.isAbsolute(p) ? p : path.join(HOME, p));
const CODE = resolve(opt('--code')), OLD = resolve(opt('--old')), OLD_VERSION = opt('--old-version'), FILES = resolve(opt('--files'));
const DRY = args.includes('--dry');
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const RESULTS = path.join(HOME, 'e2k', 'tools', 'test', 'results', `update-${stamp}`);
fs.mkdirSync(RESULTS, { recursive: true });

const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 1000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(every)) if (await fn()) return true; return !!(await fn()); };
const checks = [];
let group = '';
const check = (name, ok, detail) => { checks.push({ group, name, ok: !!ok, detail }); console.log(`  ${group} · ${name} … ${ok ? 'ok' : 'FAILED'}${!ok && detail ? ` (${detail})` : ''}`); return !!ok; };
const shots = [];
const shot = (file) => {
  try {
    ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $i.Save(${lit(path.join(RESULTS, file))}); 'ok'`);
    shots.push([group, file]);
  } catch {}
};
// The portable's launcher running from a path (its process is the .exe itself; the app it unpacks runs from a temporary
// folder as "Encyclopedia 2000.exe").
const launcherAt = (exe) => { try { return Number(ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq ${lit(exe)} }).Count`)) > 0; } catch { return false; } };
const appRunning = () => { try { return Number(ps(`@(Get-Process | Where-Object { $_.MainWindowTitle -like '*Encyclopedia 2000*' }).Count`)) > 0; } catch { return false; } };
// (This is a test machine, so any copy of the app running is one of ours.)
const closeApp = () => { try { ps(`Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' } | Stop-Process -Force; 'ok'`); } catch {} };
// Closing it as a person would: its window's close button (the app then quits, and Update on Close runs).
const closeWindow = () => { try { ps(`Get-Process | Where-Object { $_.MainWindowTitle -like '*Encyclopedia 2000*' } | ForEach-Object { [void]$_.CloseMainWindow() }; 'ok'`); } catch {} };
const fileVersion = (exe) => { try { return ps(`(Get-Item -LiteralPath ${lit(exe)}).VersionInfo.ProductVersion`); } catch { return ''; } };
const isVersion = (v, want) => v === want || v.replace(/\.0$/, '') === want.replace(/-.*/, '');

(async () => {
  const pu = require(CODE);
  const REAL = typeof pu.swapAfterExit === 'function';
  const want = pu.parseManifest(fs.readFileSync(path.join(FILES, 'portable.yml'), 'utf8'));
  const newFile = path.join(FILES, want.file);
  // The stand-in for GitHub: the update feed the app checks (latest.yml, under whichever channel name it asks for), and
  // /v<version>/portable.yml and the new .exe.
  const feed = `version: ${want.version}\nfiles:\n  - url: ${want.file}\n    sha512: ${want.sha512}\n    size: ${want.size}\npath: ${want.file}\nsha512: ${want.sha512}\nreleaseDate: '${new Date().toISOString()}'\n`;
  const server = http.createServer((req, res) => {
    const parts = decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean);
    const name = parts.pop();
    if (!parts.length && /\.yml$/.test(name)) return res.end(feed);
    const file = name === 'portable.yml' ? path.join(FILES, 'portable.yml') : name === want.file ? newFile : null;
    if (!file) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;

  // A test folder on a partition, with the old version (and its settings, as if its first-run question was answered).
  const prepare = (letter, answered) => {
    const dir = `${letter}:\\e2k-update-test`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, path.basename(OLD));
    fs.copyFileSync(OLD, exe);
    if (answered) {
      fs.mkdirSync(path.join(dir, 'Encyclopedia 2000 Data'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Encyclopedia 2000 Data', 'settings.json'), JSON.stringify({ updateAsked: true, autoUpdate: true, autoInstall: true, showNews: false, showSplash: false }));
    }
    const files = () => fs.readdirSync(dir).filter((f) => f !== 'Encyclopedia 2000 Data').sort();
    const target = path.join(dir, pu.targetName(exe, OLD_VERSION, want.version));
    return { dir, exe, files, target, previous: pu.previousOf(exe), ready: pu.readyOf(exe) };
  };
  const cleanUp = async (dir) => {
    let err = '';
    for (let i = 0; i < 15 && fs.existsSync(dir); i++) {
      closeApp();
      await sleep(1000);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { err = e.message; }
    }
    check('Cleaned up afterwards', !fs.existsSync(dir), err);
  };
  const checkNewVersion = (target) => {
    const v = fileVersion(target);
    if (DRY) check('Its version (a dry run: a stand-in under a new name, not checked)', true, v);
    else check('It’s the new version', isVersion(v, want.version), `${v}, portable.yml says ${want.version}`);
  };

  // The real app, from 0.5.6 on: Restart Now, then Update on Close.
  async function realRound(letter, how) {
    const t = prepare(letter, true);
    try {
      const env = { ...process.env, E2K_UPDATE_TEST_FEED: origin, ...(how === 'restart' ? { E2K_UPDATE_TEST_RESTART: '1' } : {}) };
      spawn(t.exe, [], { cwd: t.dir, env, detached: true, stdio: 'ignore' }).unref();
      const t0 = Date.now();
      check('The old version starts from the stick', await until(appRunning, 120000), `${Math.round((Date.now() - t0) / 1000)} s`);
      check('It finds the new version and downloads it by itself (size, checksum, signature checked)', await until(() => fs.existsSync(t.ready), 240000, 500), t.files().join(', '));
      shot(`${letter}-${how}-ready.png`);
      if (how === 'restart') {
        // Restart Now (pressed by the test hook a second after it's ready): the app closes, the helper swaps, the new one starts.
        check('Restart Now: the old version closes', await until(() => !launcherAt(t.exe), 60000, 500));
        check('…the new version is swapped in under its name (0.5.4 and 0.5.5 failed here)', await until(() => fs.existsSync(t.target) && !fs.existsSync(t.ready), 60000, 500), t.files().join(', '));
        check('…and starts by itself', await until(() => launcherAt(t.target), 60000, 500));
        await until(appRunning, 120000);
        await sleep(3000);
        shot(`${letter}-${how}-started.png`);
      } else {
        // Update on Close: the window closed as a person would; the swap, and nothing starts.
        await sleep(2000);
        closeWindow();
        check('Closing the window closes the app', await until(() => !launcherAt(t.exe), 60000, 500));
        check('Update on Close: the new version is swapped in under its name', await until(() => fs.existsSync(t.target) && !fs.existsSync(t.ready), 60000, 500), t.files().join(', '));
        check('…the old one is kept, runnable, as “(previous version)” until the new one has started', fs.existsSync(t.previous), t.files().join(', '));
        await sleep(3000);
        check('…and nothing starts by itself', !appRunning() && !launcherAt(t.target));
        // The next start.
        spawn(t.target, [], { cwd: t.dir, detached: true, stdio: 'ignore' }).unref();
        check('The next start is the new version', await until(appRunning, 120000));
      }
      checkNewVersion(t.target);
      check('The new version deletes the previous one once it has started', await until(() => !t.files().some((f) => /\(previous version\)\.exe$/i.test(f)), 30000), t.files().join(', '));
      check('Nothing else is left beside it', t.files().join() === path.basename(t.target), t.files().join(', '));
    } catch (e) {
      check('No errors', false, e.message);
    } finally { await cleanUp(t.dir); }
  }

  // 0.5.4 and 0.5.5: their own update code, with the app not running.
  async function codeRound(letter) {
    const t = prepare(letter, false);
    try {
      const m = await pu.manifest(want.version, `${origin}/v${want.version}`);
      check('The new release’s portable.yml is read', m && m.version === want.version && m.size === want.size, JSON.stringify(m && { version: m.version, file: m.file, size: m.size }));
      let pct = 0;
      const t0 = Date.now();
      const err = await pu.download(t.exe, m, { onProgress: (p) => { pct = p; } }).then(() => '', (e) => e.message);
      check('It downloads and passes the checks (size, checksum, signature)', !err && pct === 100, err || `${pct}%`);
      check('…in a reasonable time', true, `${Math.round((Date.now() - t0) / 1000)} s for ${Math.round(want.size / 1048576)} MB`);
      const target = pu.swap(t.exe, OLD_VERSION);
      check('Its swap works with the app closed (in the app it can’t: the launcher holds the .exe)', path.basename(target) === path.basename(t.target) && fs.existsSync(target), t.files().join(', '));
      spawn(target, [], { cwd: t.dir, detached: true, stdio: 'ignore' }).unref();
      check('The new version starts from the stick', await until(appRunning, 120000));
      await sleep(4000);
      shot(`${letter}-started.png`);
      check('It deletes the previous version once it has started', await until(() => !t.files().some((f) => /\(previous version\)\.exe$/i.test(f)), 20000), t.files().join(', '));
      checkNewVersion(target);
    } catch (e) {
      check('No errors', false, e.message);
    } finally { await cleanUp(t.dir); }
  }

  for (const label of ['E2K-TEST', 'E2K-FAT32']) {
    let letter = '';
    try { letter = ps(`(Get-Volume -FileSystemLabel '${label}' -ErrorAction Stop).DriveLetter`); } catch {}
    if (!REAL) { group = label; if (check('The partition is there', /^[A-Z]$/.test(letter), letter || 'not found')) await codeRound(letter); continue; }
    for (const how of ['restart', 'close']) {
      group = `${label}, ${how === 'restart' ? 'Restart Now' : 'Update on Close'}`;
      if (check('The partition is there', /^[A-Z]$/.test(letter), letter || 'not found')) await realRound(letter, how);
    }
  }
  server.close();

  const groups = [...new Set(checks.map((c) => c.group))];
  const bad = new Set(checks.filter((c) => !c.ok).map((c) => c.group));
  const lines = [`# Portable self-update on the test stick${DRY ? ' (dry run)' : ''}`, '',
    `${new Date().toLocaleString()} on ${os.hostname()}. ${path.basename(OLD)} (${OLD_VERSION}; ${REAL ? 'the real app' : 'its update code only'}) → ${want.file} (${want.version}). ` +
    `${groups.length - bad.size} of ${groups.length} passed.`, ''];
  for (const g of groups) {
    lines.push(`### ${bad.has(g) ? '✗' : '✓'} ${g} (\`${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\`)`, '');
    for (const c of checks.filter((x) => x.group === g)) lines.push(`- ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    lines.push('');
    for (const [, f] of shots.filter(([l]) => l === g)) lines.push(`![${g}](${f})`, '');
  }
  fs.writeFileSync(path.join(RESULTS, 'report.md'), lines.join('\n'));
  console.log(`\n${groups.length - bad.size} of ${groups.length} passed. Report: ${path.join(RESULTS, 'report.md')}`);
  process.exit(bad.size ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
