// The lab runner, on the PC: runs things on the three test machines (Windows, Mac, Linux) over SSH and gathers the
// results into one report. See mockups/lab/test-lab-plan.md.
//   npm run lab -- status                       which machines are up, their system, code, agent and test stick
//   npm run lab -- test                         the full test suite on all three
//   npm run lab -- test --on mac,linux          only those machines (win, mac, linux)
//   npm run lab -- test --branch release-0.5.5  a branch as it is on GitHub (what's pushed is what's tested)
//   npm run lab -- test --only home,move        anything else goes to the test runner (--only, --group)
//   npm run lab -- agent                        install or update the lab agent on each machine, and start it
// Results: tools/test/results/lab-<date and time>/summary.md, with each machine's own report beside it.
// Uses the PC's lab key (~/.ssh/e2k-lab, made by make-setup-stick.ps1); the machines accept nothing else.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LAB = __dirname;
const REPO = path.resolve(LAB, '..', '..');
const SETTINGS = JSON.parse(fs.readFileSync(path.join(LAB, 'lab-settings.json'), 'utf8'));
const KEY = path.join(os.homedir(), '.ssh', 'e2k-lab');
const ALIAS = { win: 'win32', windows: 'win32', mac: 'darwin', macos: 'darwin', linux: 'linux' };
const SHORT = { win32: 'win', darwin: 'mac', linux: 'linux' };
const MACHINES = Object.keys(SETTINGS.machines).map((p) => ({ platform: p, short: SHORT[p], name: SETTINGS.machines[p], addr: SETTINGS.addresses[p] }));

const args = process.argv.slice(2);
const command = args.shift() || 'status';
const takeOpt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const tty = process.stdout.isTTY;
const color = (c, s) => (tty ? `\x1b[${c}m${s}\x1b[0m` : s);
const green = (s) => color(32, s), red = (s) => color(31, s), yellow = (s) => color(33, s), dim = (s) => color(90, s);

// --- SSH -------------------------------------------------------------------------------------------------------------
const SSH_OPTS = ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'LogLevel=ERROR'];
function exec(exe, argv, input, timeout = 120000) {
  return new Promise((resolve) => {
    const child = spawn(exe, argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => child.kill(), timeout);
    child.on('error', (e) => { err += e.message; });
    child.on('close', (code) => {
      clearTimeout(t);
      err = err.split('\n').filter((l) => l.trim() && !/^\*\*|post-quantum|store now, decrypt later|openssh\.com\/pq/.test(l)).join('\n');
      resolve({ code: code == null ? 1 : code, out, err });
    });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}
const ssh = (m, cmd, input, timeout) => exec('ssh', [...SSH_OPTS, `e2k@${m.addr}`, cmd], input, timeout);
const scpTo = (m, local, remote) => exec('scp', [...SSH_OPTS, local, `e2k@${m.addr}:${remote}`]);
const scpFrom = (m, remote, local) => exec('scp', [...SSH_OPTS, '-r', `e2k@${m.addr}:${remote}`, local], null, 600000);
// The agent's commands (the SSH session starts in the home folder on all three).
// Node's full path on the Mac and Linux, where an SSH session's PATH may not include /usr/local/bin.
const NODE = { win32: 'node', darwin: '/usr/local/bin/node', linux: '/usr/local/bin/node' };
const agentCmd = (m, ...a) => ssh(m, `${NODE[m.platform]} e2k-lab/agent.js ${a.join(' ')}`);
const notInstalled = (text) => /MODULE_NOT_FOUND|Cannot find module/.test(text);
const parse = (s) => { try { return JSON.parse(s.trim().split('\n').pop()); } catch { return null; } };

function chosen() {
  const on = takeOpt('--on');
  if (!on) return MACHINES;
  const want = on.split(',').map((s) => ALIAS[s.trim().toLowerCase()] || s.trim());
  const bad = want.filter((p) => !SETTINGS.machines[p]);
  if (bad.length) { console.error(`Unknown machine: ${bad.join(', ')} (use win, mac, linux)`); process.exit(2); }
  return MACHINES.filter((m) => want.includes(m.platform));
}

// --- status ----------------------------------------------------------------------------------------------------------
async function status() {
  const ms = chosen();
  const rows = await Promise.all(ms.map(async (m) => {
    const r = await agentCmd(m, 'status');
    const s = r.code === 0 ? parse(r.out) : null;
    const text = `${r.err}\n${r.out}`;
    return { m, s, missing: !s && notInstalled(text), err: s ? null : text.trim().split('\n')[0] || 'no answer' };
  }));
  console.log('');
  for (const { m, s, err, missing } of rows) {
    console.log(`${m.name.padEnd(10)} ${m.addr.padEnd(14)} ${s || missing ? green('up') : red('not reachable')}`);
    if (missing) { console.log(`  ${yellow('The lab agent isn\'t installed:')} npm run lab -- agent`); continue; }
    if (!s) { console.log(`  ${dim(err)}`); continue; }
    console.log(`  ${s.os}, Node ${s.node}, ${s.memoryGB} GB memory (${s.freeMemoryGB} free), up ${s.uptimeHours} h`);
    console.log(`  Code: ${s.code.version || '?'} on ${s.code.branch || '?'}: ${s.code.commit || '?'}`);
    const agent = s.agent ? green(`running${s.agent.running ? `, on job ${s.agent.running}` : ''}`) : red('not running (npm run lab -- agent)');
    console.log(`  Agent: ${agent}${s.agent && s.agent.version !== s.agentVersionHere ? yellow(' (an older version is running)') : ''}${s.queued ? `, ${s.queued} queued` : ''}`);
    console.log(`  Test stick: ${s.stick ? green('in') : yellow('not found')}`);
  }
  console.log('');
}

// --- agent: install or update it, and start it ----------------------------------------------------------------------
const START = {
  win32: `$ErrorActionPreference = 'Stop'
$t = 'E2K lab agent'; $node = (Get-Command node).Source; $agent = "$HOME\\e2k-lab\\agent.js"; $u = "$env:COMPUTERNAME\\e2k"
# A hidden console, so no window sits on the desktop during tests.
$act = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\conhost.exe" -Argument "--headless \`"$node\`" \`"$agent\`"" -WorkingDirectory $HOME
$trig = New-ScheduledTaskTrigger -AtLogOn -User $u
$prin = New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $t -Action $act -Trigger $trig -Principal $prin -Settings $set -Force | Out-Null
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'e2k-lab.agent\\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName $t
'started'`,
  darwin: `set -e
P="$HOME/Library/LaunchAgents/com.encyclopedia2000.lab-agent.plist"; mkdir -p "$(dirname "$P")"
cat > "$P" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.encyclopedia2000.lab-agent</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/node</string><string>$HOME/e2k-lab/agent.js</string></array>
  <key>WorkingDirectory</key><string>$HOME</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
EOF
U=$(id -u)
launchctl bootout "gui/$U/com.encyclopedia2000.lab-agent" 2>/dev/null || true
pkill -f 'e2k-lab/agent.js' 2>/dev/null || true
launchctl bootstrap "gui/$U" "$P" 2>/dev/null || sudo -n launchctl asuser "$U" sudo -n -u "$(id -un)" launchctl bootstrap "gui/$U" "$P"
echo started`,
  linux: `set -e
D="$HOME/.config/autostart/e2k-lab-agent.desktop"; mkdir -p "$(dirname "$D")"
printf '[Desktop Entry]\\nType=Application\\nName=E2K lab agent\\nExec=/usr/local/bin/node %s/e2k-lab/agent.js\\n' "$HOME" > "$D"
pkill -f 'e2k-lab/agent.js' 2>/dev/null || true
U=$(id -u)
DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$U/bus" XDG_RUNTIME_DIR="/run/user/$U" \\
  setsid nohup /usr/local/bin/node "$HOME/e2k-lab/agent.js" >/dev/null 2>&1 < /dev/null &
echo started`,
};
async function agent() {
  const ms = chosen();
  await Promise.all(ms.map(async (m) => {
    const mk = m.platform === 'win32' ? await ssh(m, 'New-Item -ItemType Directory -Force e2k-lab | Out-Null') : await ssh(m, 'mkdir -p e2k-lab');
    if (mk.code) return console.log(`${m.name}: ${red('not reachable')} ${dim(mk.err)}`);
    const cp = await scpTo(m, path.join(LAB, 'agent.js'), 'e2k-lab/agent.js');
    if (cp.code) return console.log(`${m.name}: ${red('copying the agent failed')} ${dim(cp.err)}`);
    const r = m.platform === 'win32'
      ? await ssh(m, `powershell -NoProfile -EncodedCommand ${Buffer.from(START.win32, 'utf16le').toString('base64')}`)
      : await ssh(m, 'bash -s', START[m.platform]);
    if (r.code) return console.log(`${m.name}: ${red('starting the agent failed')} ${dim(r.err || r.out)}`);
    // It's running once it writes its heartbeat.
    for (let i = 0; i < 15; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const s = parse((await agentCmd(m, 'status')).out);
      if (s && s.agent) return console.log(`${m.name}: ${green('agent running')} (version ${s.agent.version})`);
    }
    console.log(`${m.name}: ${red('the agent didn\'t start')} (see e2k-lab/agent.log on that machine)`);
  }));
}

// --- test ------------------------------------------------------------------------------------------------------------
async function test() {
  const ms = chosen();
  const branch = takeOpt('--branch') || 'main';
  const testArgs = args.slice();
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const id = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  const OUT = path.join(REPO, 'tools', 'test', 'results', `lab-${stamp}`);
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nTesting ${branch} on ${ms.map((m) => m.name).join(', ')}${testArgs.length ? ` (${testArgs.join(' ')})` : ''}. Ctrl+C stops them.\n`);
  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(130);
    stopping = true; console.log(yellow('\nStopping the tests on each machine...'));
    await Promise.all(ms.map((m) => agentCmd(m, 'cancel', id)));
  });

  const results = await Promise.all(ms.map(async (m) => {
    const tag = dim(`[${m.short}]`.padEnd(8));
    const say = (s) => console.log(`${tag}${s}`);
    const sr = await agentCmd(m, 'status');
    const st = parse(sr.out);
    if (!st) { say(red(notInstalled(sr.err) ? 'the lab agent isn\'t installed (npm run lab -- agent)' : 'not reachable')); return { m, state: 'unreachable' }; }
    if (!st.agent) { say(red('the lab agent isn\'t running (npm run lab -- agent)')); return { m, state: 'no agent', os: st.os }; }
    const job = Buffer.from(JSON.stringify({ id, kind: 'test', branch, args: testArgs })).toString('base64');
    if ((await agentCmd(m, 'submit', job)).code) { say(red('couldn\'t hand over the job')); return { m, state: 'failed', os: st.os }; }
    let offset = 0, step = '', state = {}, misses = 0, partial = '';
    for (;;) {
      await new Promise((res) => setTimeout(res, 4000));
      const js = parse((await agentCmd(m, 'job', id)).out);
      if (!js) { if (++misses > 15) { say(red('lost contact')); return { m, state: 'lost', os: st.os }; } continue; }
      misses = 0; state = js;
      if (js.step && js.step !== step) { step = js.step; say(dim(`${step}...`)); }
      const log = await agentCmd(m, 'log', id, offset);
      if (log.code === 0 && log.out) {
        offset += Buffer.byteLength(log.out, 'utf8');
        // Whole lines only: "home … " is written before its result.
        const lines = (partial + log.out).split(/\r?\n/);
        partial = lines.pop();
        for (const line of lines) {
          // Only the test runner's own lines (one per scenario, its failures, and the total).
          if (/^\s{2}\S.* … |^\s+✗ |passed\. Report:|^- \S+: skipped/.test(line)) say(line.replace(/ Report: .*/, '').replace(/FAILED/, red('FAILED')).replace(/… ok$/, `… ${green('ok')}`));
        }
      }
      if (['done', 'failed', 'cancelled'].includes(js.state)) break;
    }
    if (state.state !== 'done') { say(red(`${state.state}${state.error ? `: ${state.error}` : ''}`)); return { m, ...state, os: st.os }; }
    // The machine's report and screenshots.
    const local = path.join(OUT, m.short);
    if (state.results) {
      const cp = await scpFrom(m, state.results, local);
      if (cp.code) say(yellow(`couldn't copy the report: ${cp.err}`));
    }
    return { m, ...state, os: st.os, local };
  }));

  // One summary for all three.
  const lines = [`# Lab test run: ${new Date().toLocaleString()}`, '', `Branch \`${branch}\`${testArgs.length ? `, \`${testArgs.join(' ')}\`` : ''}.`, '',
    '| Machine | System | Code | Result | Report |', '|---|---|---|---|---|'];
  const failures = [];
  for (const r of results) {
    const reportFile = r.local && path.join(r.local, 'report.md');
    const has = reportFile && fs.existsSync(reportFile);
    const result = r.state !== 'done' ? `✗ ${r.state}${r.error ? ` (${r.error})` : ''}` : r.total == null ? '✗ no result' : `${r.passed === r.total ? '✓' : '✗'} ${r.passed} of ${r.total} passed`;
    lines.push(`| ${r.m.name} | ${r.os || ''} | ${r.version || ''} ${r.commit ? `\`${r.commit.split(' ')[0]}\`` : ''} | ${result} | ${has ? `[report](${r.m.short}/report.md)` : ''} |`);
    if (has) {
      const bad = fs.readFileSync(reportFile, 'utf8').split('\n').filter((l) => l.startsWith('### ✗')).map((l) => `- ${l.slice(6)}`);
      if (bad.length) failures.push(`### ${r.m.name}`, '', ...bad.map((l) => l.replace(/\(`([\w-]+)`\)$/, `([\`$1\`](${r.m.short}/report.md))`)), '');
    }
  }
  if (failures.length) lines.push('', '## Failures', '', ...failures);
  fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
  const allOk = results.every((r) => r.state === 'done' && r.total != null && r.passed === r.total);
  console.log(`\n${allOk ? green('All passed.') : red('Not all passed.')} Summary: ${path.join(OUT, 'summary.md')}\n`);
  process.exit(allOk ? 0 : 1);
}

const COMMANDS = { status, test, agent };
if (!COMMANDS[command]) {
  console.error(`Unknown command "${command}". Commands: ${Object.keys(COMMANDS).join(', ')} (install, usb, update and downloads come later).`);
  process.exit(2);
}
if (!fs.existsSync(KEY)) { console.error(`The PC's lab key is missing (${KEY}): run tools/lab/make-setup-stick.ps1 once.`); process.exit(2); }
COMMANDS[command]().catch((e) => { console.error(e); process.exit(1); });
