// The Mac release build, run on the Mac build machine (the M2) by the lab agent ("npm run lab -- build-mac"), in the
// signed-in desktop session, where the keychain is unlocked for signing and notarizing. In the machine's own copy of
// the code (~/e2k-build), on the branch the runner asked for:
//   the test suite (unless --skip-tests); the release script (mac-release.sh, outside the repository: builds,
//   signs, notarizes, staples, and writes latest-mac.yml); the checks from the Mac handoff notes (signature,
//   notarization and stapling, Gatekeeper, both chips, latest-mac.yml matching the files); and, only with
//   --upload <tag>, the files uploaded to that GitHub draft, then their sizes checked there.
//   node tools/lab/build-mac.js --script <release script, from the home folder> [--skip-tests] [--upload v0.5.5-beta]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HOME = os.homedir();
const REPO = process.cwd();
const SCRIPT = path.join(HOME, opt('--script') || 'Documents/e2k-mac-tools/mac-release.sh');
const UPLOAD = opt('--upload');
const ENV = { ...process.env, REPO, PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}` };
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const RESULTS = path.join(REPO, 'tools', 'test', 'results', `build-${stamp}`);
fs.mkdirSync(RESULTS, { recursive: true });
const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const DIST = path.join(REPO, 'dist');
const FILES = [`Encyclopedia-2000-${version}.dmg`, `Encyclopedia-2000-${version}.dmg.blockmap`, `Encyclopedia-2000-${version}-mac.zip`,
  `Encyclopedia-2000-${version}-mac.zip.blockmap`, 'latest-mac.yml'];
const APP = path.join(DIST, 'mac-universal', 'Encyclopedia 2000.app');

const checks = [];
let group = '';
const check = (name, ok, detail) => { checks.push({ group, name, ok: !!ok, detail }); console.log(`  ${group} · ${name} … ${ok ? 'ok' : 'FAILED'}${!ok && detail ? ` (${String(detail).slice(0, 200)})` : ''}`); return !!ok; };
const run = (exe, a, opts = {}) => new Promise((resolve) => {   // output goes to the job's log as it comes
  const child = spawn(exe, a, { cwd: REPO, env: ENV, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let out = '';
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { out += d; process.stdout.write(d); });
  child.on('close', (code) => resolve({ code, out }));
  child.on('error', (e) => resolve({ code: 1, out: e.message }));
});
const sh = (exe, a) => { try { return { ok: true, out: execFileSync(exe, a, { env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || e.message }; } };
const sha512 = (f) => crypto.createHash('sha512').update(fs.readFileSync(f)).digest('base64');

(async () => {
  console.log(`Building ${version} in ${REPO}`);
  // 1. The tests.
  group = 'Tests';
  if (args.includes('--skip-tests')) check('Skipped (--skip-tests)', true);
  else {
    const r = await run(process.execPath, ['tools/test/run.js']);
    const m = r.out.match(/(\d+) of (\d+) passed\./);
    check('The test suite passes', r.code === 0, m ? `${m[1]} of ${m[2]}` : 'no result');
    if (m) check(`${m[1]} of ${m[2]} scenarios`, m[1] === m[2]);
  }

  // 2. The build: the release script, unattended (kept awake by caffeinate).
  group = 'Build';
  fs.rmSync(DIST, { recursive: true, force: true });
  const t0 = Date.now();
  const b = await run('/usr/bin/caffeinate', ['-i', SCRIPT]);
  check('The release script finishes (build, sign, notarize, staple)', b.code === 0, `exit ${b.code}, ${Math.round((Date.now() - t0) / 60000)} min`);
  for (const f of FILES) check(`${f} is there`, fs.existsSync(path.join(DIST, f)));
  check('The app is there', fs.existsSync(APP));

  // 3. The checks from the handoff notes.
  group = 'Checks';
  if (fs.existsSync(APP)) {
    const cs = sh('codesign', ['--verify', '--deep', '--strict', '--verbose=2', APP]);
    check('The app’s signature is valid (codesign --verify --deep --strict)', cs.ok, cs.out.trim().split('\n').pop());
    const st = sh('xcrun', ['stapler', 'validate', APP]);
    check('The app is notarized and stapled', st.ok, st.out.trim().split('\n').pop());
    const sp = sh('spctl', ['-a', '-vv', APP]);
    check('Gatekeeper accepts the app as notarized', sp.ok && /Notarized Developer ID/.test(sp.out), sp.out.trim());
    const bin = path.join(APP, 'Contents', 'MacOS', 'Encyclopedia 2000');
    const li = sh('lipo', ['-archs', bin]);
    check('Universal: both Apple silicon and Intel', /arm64/.test(li.out) && /x86_64/.test(li.out), li.out.trim());
  }
  const dmg = path.join(DIST, FILES[0]);
  if (fs.existsSync(dmg)) {
    const st = sh('xcrun', ['stapler', 'validate', dmg]);
    check('The .dmg is notarized and stapled', st.ok, st.out.trim().split('\n').pop());
    const sp = sh('spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', dmg]);
    check('Gatekeeper accepts the .dmg', sp.ok && /accepted/.test(sp.out), sp.out.trim());
  }
  const yml = path.join(DIST, 'latest-mac.yml');
  if (fs.existsSync(yml)) {
    const text = fs.readFileSync(yml, 'utf8');
    check('latest-mac.yml has this version', new RegExp(`^version: ${version.replace(/\./g, '\\.')}$`, 'm').test(text), (text.match(/^version: .*$/m) || [''])[0]);
    for (const m of text.matchAll(/- url: (.+)\n\s+sha512: (.+)\n\s+size: (\d+)/g)) {
      const f = path.join(DIST, m[1].trim());
      const ok = fs.existsSync(f) && fs.statSync(f).size === Number(m[3]) && sha512(f) === m[2].trim();
      check(`latest-mac.yml matches ${m[1].trim()} (size and checksum)`, ok);
    }
  }

  // 4. Only when asked: the files to the GitHub draft, then their sizes there.
  if (UPLOAD) {
    group = 'Upload';
    const ready = checks.every((c) => c.ok);
    if (!check('Everything above passed, so it’s safe to upload', ready)) console.log('Not uploading.');
    else {
      const up = await run('/usr/local/bin/gh', ['release', 'upload', UPLOAD, '--clobber', ...FILES.map((f) => path.join(DIST, f))]);
      check(`Uploaded to ${UPLOAD}`, up.code === 0, up.out.trim().split('\n').pop());
      const v = sh('/usr/local/bin/gh', ['release', 'view', UPLOAD, '--json', 'assets', '--jq', '.assets[] | .name + " " + (.size|tostring)']);
      const sizes = Object.fromEntries(v.out.trim().split('\n').map((l) => l.split(' ')));
      for (const f of FILES) check(`${f} on GitHub has the right size`, Number(sizes[f]) === fs.statSync(path.join(DIST, f)).size, sizes[f]);
    }
  }

  const groups = [...new Set(checks.map((c) => c.group))];
  const bad = new Set(checks.filter((c) => !c.ok).map((c) => c.group));
  const lines = [`# Mac build of ${version}`, '', `${new Date().toLocaleString()} on ${os.hostname()}. ${groups.length - bad.size} of ${groups.length} parts passed.`, ''];
  for (const g of groups) {
    lines.push(`### ${bad.has(g) ? '✗' : '✓'} ${g} (\`${g.toLowerCase()}\`)`, '');
    for (const c of checks.filter((x) => x.group === g)) lines.push(`- ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(RESULTS, 'report.md'), lines.join('\n'));
  console.log(`\n${groups.length - bad.size} of ${groups.length} passed. Report: ${path.join(RESULTS, 'report.md')}`);
  process.exit(bad.size ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
