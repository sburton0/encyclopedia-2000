// The lab's timing of the Windows portable's start, on the Windows test machine (the 2011 Mac mini), run by the lab agent
// ("npm run lab -- portable-start"). The portable .exe is a launcher that unpacks the whole app to a temporary folder at
// every start before the app itself can open; on an old PC that takes many seconds. From 0.6 it shows a picture
// meanwhile (electron-builder's portable.splashImage). For each build given (the release, and a test build without the
// picture) and each place (the test stick's exFAT partition, and the internal drive), it starts the portable three
// times (the first with a fresh data folder beside it, so the app opens on its first-run question), and records, from
// the moment it's started, every window that appears: the launcher's (its picture, and the installer-style "Setup:
// Installing" window), and the app's own (its startup screen, then its main window), each with when it was first and
// last seen, polled every 50 ms. A screenshot 1.5 s in shows what's on screen while it unpacks.
//   node tools/lab/portable-start.js --builds <folder with one subfolder per build, each holding one portable .exe>
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HOME = os.homedir();
const resolve = (p) => (path.isAbsolute(p) ? p : path.join(HOME, p));
const BUILDS = resolve(opt('--builds'));
const RUNS = Number(opt('--runs') || 3);
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const RESULTS = path.join(HOME, 'e2k', 'tools', 'test', 'results', `portable-start-${stamp}`);
fs.mkdirSync(RESULTS, { recursive: true });

const ps = (cmd, timeout = 60000) => execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 1 << 24 }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = () => { try { ps(`Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' } | Stop-Process -Force; 'ok'`); } catch {} };

// One start, watched from inside one PowerShell process (starting a new one per poll would take longer than the poll).
// Prints JSON: every visible top-level window of the launcher and the app, with its title and when it was first and
// last seen (ms after the start), and when the app's main window had been up for 2 s (the end), or a timeout.
const WATCH = (exe, shotFile) => `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Wins {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
  public static List<string> List() {
    var o = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      RECT r; GetWindowRect(h, out r);
      if (r.R - r.L < 50 || r.B - r.T < 50) return true;
      o.Add(pid + "|" + h + "|" + (r.R - r.L) + "x" + (r.B - r.T) + "|" + sb.ToString());
      return true; }, IntPtr.Zero);
    return o;
  }
}
'@
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$names = @{}
$seen = @{}
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath ${lit(exe)} -WorkingDirectory ${lit(path.dirname(exe))} -PassThru
$shot = $false; $mainSince = -1; $end = 'timeout'
while ($sw.ElapsedMilliseconds -lt 120000) {
  $t = $sw.ElapsedMilliseconds
  $procs = @{}
  Get-Process | Where-Object { $_.ProcessName -like 'Encyclopedia*' } | ForEach-Object { $procs[[string]$_.Id] = $_.ProcessName }
  $main = $false
  foreach ($w in [Wins]::List()) {
    $f = $w.Split('|', 4)
    if (-not $procs.ContainsKey($f[0])) { continue }
    $k = $f[1]
    if (-not $seen.ContainsKey($k)) { $seen[$k] = @{ proc = $procs[$f[0]]; size = $f[2]; title = $f[3]; first = $t; last = $t } }
    else { $seen[$k].last = $t; if ($f[3]) { $seen[$k].title = $f[3] } }
    if ($procs[$f[0]] -eq 'Encyclopedia 2000' -and $f[3] -like '*Encyclopedia 2000*') { $main = $true }
  }
  if ($main) { if ($mainSince -lt 0) { $mainSince = $t } elseif ($t - $mainSince -gt 2000) { $end = 'main'; break } }
  if (-not $shot -and $t -ge 1500) {
    $shot = $true
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $i.Save(${lit(shotFile)})
  }
  Start-Sleep -Milliseconds 50
}
$dpi = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
@{ end = $end; mainAt = $mainSince; screenWidth = $dpi; windows = @($seen.Values | ForEach-Object { [pscustomobject]$_ } | Sort-Object first) } | ConvertTo-Json -Depth 4 -Compress
`;

(async () => {
  const builds = fs.readdirSync(BUILDS).filter((d) => fs.statSync(path.join(BUILDS, d)).isDirectory());
  let stick = '';
  try { stick = ps(`(Get-Volume -FileSystemLabel 'E2K-TEST' -ErrorAction Stop).DriveLetter`); } catch {}
  const places = [['the internal drive', path.join(HOME, 'e2k-lab', 'portable-start', 'run')]];
  if (/^[A-Z]$/.test(stick)) places.unshift(['the test stick (exFAT)', `${stick}:\\e2k-portable-start`]);
  const rows = [], lines = [];
  for (const build of builds) {
    const exeName = fs.readdirSync(path.join(BUILDS, build)).find((f) => /\.exe$/i.test(f));
    for (const [place, dir] of places) {
      kill();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const exe = path.join(dir, exeName);
      fs.copyFileSync(path.join(BUILDS, build, exeName), exe);
      for (let run = 1; run <= RUNS; run++) {
        kill();
        await sleep(4000);
        const shotFile = path.join(RESULTS, `${build}-${place.replace(/\W+/g, '-')}-${run}.png`);
        let r;
        try { r = JSON.parse(ps(WATCH(exe, shotFile), 180000)); } catch (e) { r = { end: 'error', error: e.message.slice(0, 300), windows: [] }; }
        const ws = (Array.isArray(r.windows) ? r.windows : [r.windows]).filter(Boolean);
        const launcher = ws.filter((w) => w.proc !== 'Encyclopedia 2000'), app = ws.filter((w) => w.proc === 'Encyclopedia 2000');
        const row = {
          build, place, run, end: r.end,
          picture: launcher.length ? Math.min(...launcher.map((w) => w.first)) : null,
          pictureGone: launcher.length ? Math.max(...launcher.map((w) => w.last)) : null,
          appFirst: app.length ? Math.min(...app.map((w) => w.first)) : null,
          appMain: r.mainAt >= 0 ? r.mainAt : null,
          windows: ws.map((w) => `${w.proc === 'Encyclopedia 2000' ? 'app' : 'launcher'} "${w.title}" ${w.size} ${w.first}–${w.last} ms`),
        };
        rows.push(row);
        console.log(`  ${build} · ${place} · run ${run}: picture ${row.picture ?? '—'} ms, gone ${row.pictureGone ?? '—'} ms, app window ${row.appFirst ?? '—'} ms, main window ${row.appMain ?? '—'} ms (${r.end})`);
        kill();
      }
      await sleep(3000);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const s = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
  lines.push('# The portable\'s start', '', `${new Date().toLocaleString()} on ${os.hostname()} (${os.cpus()[0].model}), ${RUNS} starts each; the first with a fresh data folder (the first-run question).`, '',
    '| Build | Where | Run | Picture appears | Picture gone | App\'s first window | Main window |', '|---|---|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.build} | ${r.place} | ${r.run} | ${s(r.picture)} | ${s(r.pictureGone)} | ${s(r.appFirst)} | ${s(r.appMain)}${r.end === 'main' ? '' : ` (${r.end})`} |`);
  lines.push('', '## Every window seen', '');
  for (const r of rows) lines.push(`- **${r.build}, ${r.place}, run ${r.run}:** ${r.windows.join('; ') || 'none'}`);
  lines.push('', '## 1.5 s after starting', '');
  for (const f of fs.readdirSync(RESULTS).filter((f) => f.endsWith('.png'))) lines.push(`![${f}](${f})`, '');
  fs.writeFileSync(path.join(RESULTS, 'report.md'), lines.join('\n'));
  fs.writeFileSync(path.join(RESULTS, 'timings.json'), JSON.stringify(rows, null, 1));
  const ok = rows.length && rows.every((r) => r.end === 'main');
  console.log(`\n${ok ? rows.length : rows.filter((r) => r.end === 'main').length} of ${rows.length} passed. Report: ${path.join(RESULTS, 'report.md')}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
