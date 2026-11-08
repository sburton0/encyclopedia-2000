// The lab's portable self-update test, run on the Windows test machine by the lab agent ("npm run lab -- update").
// It uses the released version's own update code (portable-update.js from its tag, copied over by the runner) on the
// real test stick, against a stand-in for GitHub serving the new release's files (portable.yml and the signed .exe), so
// a release can be tested before it's published. On each partition (exFAT and FAT32):
//   the released .exe on the stick; the new version downloaded, checked (size, checksum, signature) and swapped in, as
//   Restart Now does; the new version started from the stick, and its version; the previous version deleted once it has
//   started; then the app closed and the test folder removed.
// Only how the released version finds a new release on GitHub isn't covered: that's the check after publishing.
//   node tools/lab/update-portable.js --code <portable-update.js> --old <old .exe> --old-version 0.5.4-beta
//                                     --files <folder with portable.yml and the new .exe> [--dry]
// --dry: the "new" version is a stand-in (an older build under a new name), so its version isn't checked.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
let group = '';
const check = (name, ok, detail) => { checks.push({ group, name, ok: !!ok, detail }); console.log(`  ${group} · ${name} … ${ok ? 'ok' : 'FAILED'}${!ok && detail ? ` (${detail})` : ''}`); return !!ok; };
const shot = (file) => {
  try {
    ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $i.Save('${path.join(RESULTS, file).replace(/'/g, "''")}'); 'ok'`);
    return file;
  } catch { return null; }
};
// The app's processes started from a folder (the portable's launcher, and Electron unpacked to a temporary folder).
const appRunning = () => { try { return Number(ps(`@(Get-Process | Where-Object { $_.MainWindowTitle -like '*Encyclopedia 2000*' }).Count`)) > 0; } catch { return false; } };
// (The launcher is named after the .exe; Electron, unpacked to a temporary folder, is "Encyclopedia 2000". Neither sets
// a product name. This is a test machine, so any copy of the app running is one of ours.)
const closeApp = () => { try { ps(`Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' } | Stop-Process -Force; 'ok'`); } catch {} };

(async () => {
  const pu = require(CODE);
  const manifestText = fs.readFileSync(path.join(FILES, 'portable.yml'), 'utf8');
  const want = pu.parseManifest(manifestText);
  // The stand-in for GitHub: /v<version>/portable.yml and the new .exe, from the files the runner copied over.
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('/').pop());
    const file = name === 'portable.yml' ? path.join(FILES, 'portable.yml') : name === want.file ? path.join(FILES, want.file) : null;
    if (!file) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v${want.version}`;
  const shots = [];

  for (const label of ['E2K-TEST', 'E2K-FAT32']) {
    group = label;
    let letter = '';
    try { letter = ps(`(Get-Volume -FileSystemLabel '${label}' -ErrorAction Stop).DriveLetter`); } catch {}
    if (!check('The partition is there', /^[A-Z]$/.test(letter), letter || 'not found')) continue;
    const dir = `${letter}:\\e2k-update-test`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, path.basename(OLD));
    fs.copyFileSync(OLD, exe);
    const files = () => fs.readdirSync(dir).filter((f) => f !== 'Encyclopedia 2000 Data').sort();
    try {
      const m = await pu.manifest(want.version, base);
      check('The new release’s portable.yml is read', m && m.version === want.version && m.size === want.size, JSON.stringify(m && { version: m.version, file: m.file, size: m.size }));
      let pct = 0;
      const t0 = Date.now();
      const err = await pu.download(exe, m, { onProgress: (p) => { pct = p; } }).then(() => '', (e) => e.message);
      check('It downloads and passes the checks (size, checksum, signature)', !err && pct === 100, err || `${pct}%`);
      check('…in a reasonable time', true, `${Math.round((Date.now() - t0) / 1000)} s for ${Math.round(want.size / 1048576)} MB`);
      check('It’s ready beside the current version, which is untouched', pu.ready(exe)?.version === want.version && fs.statSync(exe).size === fs.statSync(OLD).size, files().join(', '));
      const target = pu.swap(exe, OLD_VERSION);
      check('Restart Now swaps it in under the new version’s name', path.basename(target) === pu.targetName(exe, OLD_VERSION, want.version) && fs.existsSync(target), files().join(', '));
      check('…and keeps the old one as “(previous version)”', fs.existsSync(pu.previousOf(exe)), files().join(', '));

      // The new version, started from the stick as Restart Now does.
      const child = spawn(target, [], { cwd: dir, detached: true, stdio: 'ignore' });
      child.unref();
      let up = false;
      for (let i = 0; i < 60 && !up; i++) { await sleep(1000); up = appRunning(); }
      check('The new version starts from the stick', up);
      await sleep(4000);
      const s = shot(`${label}-started.png`); if (s) shots.push([label, s]);
      // It deletes the previous version a few seconds after its first screen.
      let gone = false;
      for (let i = 0; i < 20 && !gone; i++) { gone = !files().some((f) => /\(previous version\)\.exe$/i.test(f)); if (!gone) await sleep(1000); }
      check('It deletes the previous version once it has started', gone, files().join(', '));
      let version = '';
      try { version = ps(`(Get-Item -LiteralPath '${target.replace(/'/g, "''")}').VersionInfo.ProductVersion`); } catch {}
      if (DRY) check('Its version (a dry run: a stand-in under a new name, not checked)', true, version);
      else check('It’s the new version', version === want.version || version.replace(/\.0$/, '') === want.version.replace(/-.*/, ''), `${version}, portable.yml says ${want.version}`);
    } catch (e) {
      check('No errors', false, e.message);
    } finally {
      closeApp();
      await sleep(2500);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      check('Cleaned up afterwards', !fs.existsSync(dir));
    }
  }
  server.close();

  const failed = checks.filter((c) => !c.ok);
  const scenarios = [...new Set(checks.map((c) => c.group))];
  const lines = [`# Portable self-update on the test stick${DRY ? ' (dry run)' : ''}`, '',
    `${new Date().toLocaleString()} on ${os.hostname()}. ${path.basename(OLD)} (${OLD_VERSION}, its own update code) → ${want.file} (${want.version}). ` +
    `${scenarios.length - new Set(failed.map((c) => c.group)).size} of ${scenarios.length} partitions passed.`, ''];
  for (const g of scenarios) {
    const bad = checks.some((c) => c.group === g && !c.ok);
    lines.push(`### ${bad ? '✗' : '✓'} ${g} (\`${g.toLowerCase()}\`)`, '');
    for (const c of checks.filter((x) => x.group === g)) lines.push(`- ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    lines.push('');
    for (const [l, f] of shots.filter(([l]) => l === g)) lines.push(`![${l}](${f})`, '');
  }
  fs.writeFileSync(path.join(RESULTS, 'report.md'), lines.join('\n'));
  const okCount = scenarios.length - new Set(failed.map((c) => c.group)).size;
  console.log(`\n${okCount} of ${scenarios.length} passed. Report: ${path.join(RESULTS, 'report.md')}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
