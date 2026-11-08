// The lab agent: runs on each test machine, on its desktop, and runs test jobs there (the app needs a real desktop,
// which an SSH session doesn't have). The PC's lab runner (run.js) hands it jobs over SSH. See mockups/lab/test-lab-plan.md.
//
// It lives in ~/e2k-lab, outside the app's code (~/e2k), because a job switches that code to other branches, which
// may not have this file. Started with the desktop (set up by the setup scripts or "npm run lab -- agent").
//
//   node e2k-lab/agent.js              run: watch ~/e2k-lab/jobs and run each job in turn
//   node e2k-lab/agent.js status       this machine's state, as JSON (used by "npm run lab -- status")
//   node e2k-lab/agent.js submit <b64> queue a job (base64 JSON: { id, kind: "test", branch, args, runner })
//                                      runner: a script in tools/test or tools/lab (default tools/test/run.js)
//   node e2k-lab/agent.js job <id>     a job's state, as JSON
//   node e2k-lab/agent.js log <id> <n> a job's log from byte n
//   node e2k-lab/agent.js cancel <id>  stop a job
// Only the PC's key can reach these (SSH); the agent itself listens to nothing on the network.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const VERSION = 2;
const HOME = os.homedir();
const LAB = path.join(HOME, 'e2k-lab');
const JOBS = path.join(LAB, 'jobs');
const REPO = path.join(HOME, 'e2k');
const BEAT = path.join(LAB, 'agent.json');
const WIN = process.platform === 'win32';
fs.mkdirSync(JOBS, { recursive: true });

const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { fs.writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 1)); fs.renameSync(`${f}.tmp`, f); };
const jobFile = (id, ext) => path.join(JOBS, `${id}.${ext}`);
const safeId = (id) => (/^[\w.-]{1,80}$/.test(id || '') ? id : null);
const rel = (p) => path.relative(HOME, p).split(path.sep).join('/');
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// Whether the test stick's two partitions are present.
function stick() {
  const names = ['E2K-TEST', 'E2K-FAT32'];
  try {
    if (WIN) {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-Volume).FileSystemLabel -join "|"'], { encoding: 'utf8' });
      return names.every((n) => out.split('|').map((s) => s.trim()).includes(n));
    }
    if (process.platform === 'darwin') return names.every((n) => fs.existsSync(`/Volumes/${n}`));
    return names.every((n) => fs.existsSync(`/dev/disk/by-label/${n}`));
  } catch { return false; }
}
function osName() {
  try {
    if (WIN) return execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).Caption + " " + (Get-CimInstance Win32_OperatingSystem).BuildNumber'], { encoding: 'utf8' }).trim();
    if (process.platform === 'darwin') return `macOS ${execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()}`;
    return (fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]*)/m) || [])[1] || 'Linux';
  } catch { return process.platform; }
}

// --- Commands from the runner ----------------------------------------------------------------------------------------
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'status') {
  const beat = readJSON(BEAT);
  let code = {};
  try { code = { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('log', '-1', '--format=%h %s').slice(0, 90), version: readJSON(path.join(REPO, 'package.json'), {}).version }; } catch {}
  const queued = fs.readdirSync(JOBS).filter((f) => f.endsWith('.job')).length;
  console.log(JSON.stringify({
    name: os.hostname(), os: osName(), node: process.version, uptimeHours: Math.round(os.uptime() / 360) / 10,
    memoryGB: Math.round(os.totalmem() / 1e8) / 10, freeMemoryGB: Math.round(os.freemem() / 1e8) / 10,
    agent: beat && Date.now() - beat.beat < 30000 ? { version: beat.version, running: beat.running || null } : null,
    agentVersionHere: VERSION, queued, stick: stick(), code,
  }));
  process.exit(0);
}
if (cmd === 'submit') {
  const job = JSON.parse(Buffer.from(a1, 'base64').toString('utf8'));
  if (!safeId(job.id) || job.kind !== 'test') { console.error('bad job'); process.exit(2); }
  writeJSON(jobFile(job.id, 'state'), { id: job.id, state: 'queued', queued: Date.now() });
  writeJSON(jobFile(job.id, 'job'), job);
  console.log(JSON.stringify({ ok: true, id: job.id }));
  process.exit(0);
}
if (cmd === 'job') { console.log(JSON.stringify(readJSON(jobFile(safeId(a1), 'state'), { state: 'unknown' }))); process.exit(0); }
if (cmd === 'log') {
  const f = jobFile(safeId(a1), 'log'); const from = Number(a2) || 0;
  let text = '';
  try { const fd = fs.openSync(f, 'r'); const size = fs.fstatSync(fd).size; const b = Buffer.alloc(Math.max(0, size - from)); fs.readSync(fd, b, 0, b.length, from); fs.closeSync(fd); text = b.toString('utf8'); } catch {}
  process.stdout.write(text);
  process.exit(0);
}
if (cmd === 'cancel') { if (safeId(a1)) fs.writeFileSync(jobFile(a1, 'cancel'), ''); console.log('{"ok":true}'); process.exit(0); }
if (cmd) { console.error(`unknown command: ${cmd}`); process.exit(2); }

// --- The agent itself ------------------------------------------------------------------------------------------------
// One agent per machine: a second copy (started twice) leaves at once.
const LOCK = path.join(LAB, 'agent.lock');
const other = readJSON(LOCK);
if (other && other.pid !== process.pid) {
  try { process.kill(other.pid, 0); const b = readJSON(BEAT); if (b && Date.now() - b.beat < 30000) process.exit(0); } catch {}
}
writeJSON(LOCK, { pid: process.pid });
const agentLog = fs.createWriteStream(path.join(LAB, 'agent.log'), { flags: 'a' });
const note = (m) => agentLog.write(`${new Date().toISOString()} ${m}\n`);
note(`agent ${VERSION} started (pid ${process.pid})`);

let running = null;   // { id, child }
const beat = () => { try { writeJSON(BEAT, { version: VERSION, pid: process.pid, beat: Date.now(), running: running && running.id }); } catch {} };
beat(); setInterval(beat, 10000);

// Runs a command, appending its output to the job's log; resolves with its exit code.
function run(id, exe, args, opts = {}) {
  return new Promise((resolve) => {
    const out = fs.openSync(jobFile(id, 'log'), 'a');
    fs.writeSync(out, `$ ${exe} ${args.join(' ')}\n`);
    // npm.cmd needs the Windows shell; nothing else goes through it (Node's own path has a space in it).
    const child = spawn(exe, args, { cwd: REPO, stdio: ['ignore', out, out], shell: WIN && /\.cmd$/.test(exe), detached: !WIN, ...opts });
    running.child = child;
    child.on('error', (e) => { fs.writeSync(out, `${e.message}\n`); });
    child.on('close', (code) => { fs.closeSync(out); running.child = null; resolve(code == null ? 1 : code); });
  });
}
function killTree(child) {
  try {
    if (WIN) execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {}
}

async function runJob(job) {
  const id = job.id;
  const state = { id, state: 'running', started: Date.now(), step: '' };
  const set = (k) => { Object.assign(state, k); writeJSON(jobFile(id, 'state'), state); };
  running = { id, child: null }; beat();
  note(`job ${id}: ${job.branch || 'main'} ${(job.args || []).join(' ')}`);
  try {
    const cancelled = () => fs.existsSync(jobFile(id, 'cancel'));
    const step = async (name, exe, args) => {
      if (cancelled()) throw new Error('cancelled');
      set({ step: name });
      const code = await run(id, exe, args);
      if (cancelled()) throw new Error('cancelled');
      return code;
    };
    // The code: the branch as it is on GitHub (what's pushed is what's tested).
    const branch = /^[\w./-]+$/.test(job.branch || '') ? job.branch : 'main';
    if (await step('getting the code', 'git', ['fetch', '--prune', 'origin'])) throw new Error('git fetch failed');
    if (await step('getting the code', 'git', ['checkout', '-f', '-B', 'lab-run', `origin/${branch}`])) throw new Error(`no branch "${branch}" on GitHub`);
    set({ commit: git('log', '-1', '--format=%h %s').slice(0, 90), version: readJSON(path.join(REPO, 'package.json'), {}).version });
    // The app's parts, when the lock file changed since they were last installed.
    const lock = fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8');
    const stamp = path.join(REPO, 'node_modules', '.lab-lock');
    const hash = require('crypto').createHash('sha1').update(lock).digest('hex');
    const electronOk = fs.existsSync(path.join(REPO, 'node_modules', 'electron', 'dist'));
    if (!electronOk || readJSON(stamp, {}).hash !== hash) {
      if (await step('installing the app\'s parts', WIN ? 'npm.cmd' : 'npm', ['ci'])) throw new Error('npm ci failed');
      if (await step('installing Electron', process.execPath, ['node_modules/electron/install.js'])) throw new Error('installing Electron failed');
      writeJSON(stamp, { hash });
    }
    // The tests themselves; run.js prints where its report is.
    const logBefore = fs.statSync(jobFile(id, 'log')).size;
    const runner = /^tools\/(test|lab)\/[\w-]+\.js$/.test(job.runner || '') ? job.runner : 'tools/test/run.js';
    const code = await step('testing', process.execPath, [runner, ...(job.args || [])]);
    const tail = fs.readFileSync(jobFile(id, 'log'), 'utf8').slice(logBefore);
    const m = tail.match(/(\d+) of (\d+) passed\. Report: (.+report\.md)/);
    set({ state: 'done', finished: Date.now(), exitCode: code, step: '',
      passed: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null, results: m ? rel(path.dirname(m[3].trim())) : null });
  } catch (e) {
    set({ state: e.message === 'cancelled' ? 'cancelled' : 'failed', finished: Date.now(), error: e.message, step: '' });
  }
  note(`job ${id}: ${state.state}`);
  running = null; beat();
}

// Watches for cancels while a job runs, and picks up the next job when idle.
async function loop() {
  for (;;) {
    if (!running) {
      const next = fs.readdirSync(JOBS).filter((f) => f.endsWith('.job')).sort()[0];
      if (next) {
        const job = readJSON(path.join(JOBS, next));
        fs.renameSync(path.join(JOBS, next), path.join(JOBS, next.replace(/\.job$/, '.taken')));
        if (job) runJob(job);
      }
    } else if (running.child && fs.existsSync(jobFile(running.id, 'cancel'))) killTree(running.child);
    // Old jobs (a week) are tidied away.
    for (const f of fs.readdirSync(JOBS)) {
      try { if (Date.now() - fs.statSync(path.join(JOBS, f)).mtimeMs > 7 * 86400000) fs.unlinkSync(path.join(JOBS, f)); } catch {}
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
loop();
