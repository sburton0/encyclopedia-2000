// The portable version updating itself where it is (a USB stick), on Windows, as the user chooses (see selfUpdate in
// updater.js). The new version downloads beside the .exe under a name that can't be run by double-clicking, and is
// used only once its size, its checksum (portable.yml, published with each Windows release by
// tools/portable-manifest.js), and its code signature (Scott Burton) all check out.
// Swapping is two renames (Windows lets a running .exe be renamed, not deleted): the current .exe becomes
// "… (previous version).exe", which still runs if anything goes wrong, and the new one takes its place. The previous
// version is deleted once the new one has started (removePrevious). Every function takes the .exe's path, so the tests
// can drive it.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RELEASES = 'https://github.com/sburton0/encyclopedia-2000/releases/download';
const PUBLISHER = 'Scott Burton';

const pendingOf = (exe) => path.join(path.dirname(exe), 'Encyclopedia 2000 update.download');
const readyOf = (exe) => path.join(path.dirname(exe), 'Encyclopedia 2000 update.ready');
const infoOf = (exe) => path.join(path.dirname(exe), 'Encyclopedia 2000 update.json');
const previousOf = (exe) => path.join(path.dirname(exe), `${path.basename(exe, '.exe')} (previous version).exe`);

// portable.yml: a few "key: value" lines (version, file, sha512, size).
function parseManifest(text) {
  const m = {};
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^'(.*)'$/, '$1');
  }
  return m.file && m.sha512 && +m.size ? { version: m.version, file: m.file, sha512: m.sha512, size: +m.size } : null;
}
// The release's manifest, or null if it has none (releases before 0.5.4: the app then links to the download page).
async function manifest(version, base = `${RELEASES}/v${version}`) {
  const res = await fetch(`${base}/portable.yml`, { headers: { 'User-Agent': 'Encyclopedia 2000' } });
  if (!res.ok) return null;
  const m = parseManifest(await res.text());
  return m && { ...m, url: `${base}/${encodeURIComponent(m.file)}` };
}

// Whether the .exe's folder can take the update: false on a locked stick or a DVD.
function writable(exe) {
  const probe = path.join(path.dirname(exe), '.e2k-write-check');
  try { fs.writeFileSync(probe, ''); fs.unlinkSync(probe); return true; } catch { return false; }
}
function freeSpace(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return Infinity; } }

// The new version's file name: the same as this one's, unless this one's name has its version in it
// ("Encyclopedia-2000-Portable-0.5.4-beta.exe"), which then gets the new version's.
function targetName(exe, current, next) {
  const base = path.basename(exe);
  return current && base.includes(current) ? base.replace(current, next) : base;
}

function signedBy(file) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).trim();
    const [status, subject] = out.split('|');
    return status === 'Valid' && new RegExp(`(^|, )CN=${PUBLISHER}(,|$)`).test(subject || '');
  } catch { return false; }
}
// Why a downloaded file can't be used, or '' if it can.
function check(file, m, { signature = true } = {}) {
  let size = -1;
  try { size = fs.statSync(file).size; } catch {}
  if (size !== m.size) return 'The download is incomplete.';
  const sha = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
  if (sha !== m.sha512) return 'The download didn’t match the published version.';
  if (signature && !signedBy(file)) return 'The download isn’t signed by Scott Burton, the publisher of Encyclopedia 2000.';
  return '';
}

// Downloads and checks the new version. Resolves when it's ready to swap in; rejects with a message for the user.
// Nothing beside the .exe changes until the download is complete and checked; a failed one is deleted.
async function download(exe, m, { onProgress = () => {}, signal, signature = true } = {}) {
  if (!writable(exe)) throw new Error('This drive can’t be written to.');
  if (freeSpace(path.dirname(exe)) < m.size + 20 * 1024 * 1024) throw new Error(`There isn’t enough free space on this drive (the update needs ${Math.ceil(m.size / 1048576)} MB).`);
  const pending = pendingOf(exe);
  try {
    const res = await fetch(m.url, { headers: { 'User-Agent': 'Encyclopedia 2000' }, signal });
    if (!res.ok) throw new Error(`The download failed (HTTP ${res.status}).`);
    const fd = fs.openSync(pending, 'w');
    let got = 0, last = -1;
    try {
      for await (const chunk of res.body) {
        fs.writeSync(fd, chunk);
        got += chunk.length;
        const pct = Math.floor((100 * got) / m.size);
        if (pct !== last) { last = pct; onProgress(Math.min(100, pct)); }
      }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    const why = check(pending, m, { signature });
    if (why) throw new Error(why);
    fs.renameSync(pending, readyOf(exe));
    fs.writeFileSync(infoOf(exe), JSON.stringify({ version: m.version, file: m.file, sha512: m.sha512, size: m.size }));
    return readyOf(exe);
  } catch (e) {
    try { fs.unlinkSync(pending); } catch {}
    if (signal && signal.aborted) throw new Error('cancelled');
    // A stick pulled out mid-download shows up as a write or read error.
    throw new Error(/^(The |There )/.test(e.message) ? e.message : 'The drive was disconnected, or the download stopped, before the new version finished downloading.');
  }
}

// A downloaded update waiting for Restart Now, checked again (it may have been on the stick for months): its details,
// or null (a damaged one is deleted).
function ready(exe, { signature = true } = {}) {
  let info;
  try { info = JSON.parse(fs.readFileSync(infoOf(exe), 'utf8')); } catch { return null; }
  if (!fs.existsSync(readyOf(exe)) || check(readyOf(exe), info, { signature })) { discard(exe); return null; }
  return info;
}
function discard(exe) {
  for (const f of [readyOf(exe), pendingOf(exe), infoOf(exe)]) { try { fs.unlinkSync(f); } catch {} }
}

// Restart Now: swaps the new version in, and returns the path to start. Checked once more first. If the second rename
// fails, the first is undone, so the current version always keeps its name or a runnable one.
function swap(exe, current, { signature = true } = {}) {
  const info = ready(exe, { signature });
  if (!info) throw new Error('The downloaded update is missing or damaged. Check for updates to download it again.');
  const target = path.join(path.dirname(exe), targetName(exe, current, info.version));
  const previous = previousOf(exe);
  try { fs.unlinkSync(previous); } catch {}
  fs.renameSync(exe, previous);
  try { fs.renameSync(readyOf(exe), target); } catch (e) { try { fs.renameSync(previous, exe); } catch {} throw e; }
  try { fs.unlinkSync(infoOf(exe)); } catch {}
  return target;
}

// At each start, an unfinished download from a run that was closed partway is deleted.
function cleanupPending(exe) { try { fs.unlinkSync(pendingOf(exe)); } catch {} }
// Once the new version has started and drawn its first screen, the previous one is deleted (its launcher may take a
// moment to quit). Until then it stays beside it, still runnable, in case the new version doesn't start.
// The previous one is named after the old .exe: the same name as this one's, or, when the name has the version in it
// ("Encyclopedia-2000-Portable-0.5.4-beta.exe"), the old version's name ("…-0.5.4-beta (previous version).exe"), so
// with current (this version) given, any version in that place counts.
function previousFiles(exe, current) {
  const own = previousOf(exe);
  const found = fs.existsSync(own) ? [own] : [];
  const stem = path.basename(exe, '.exe');
  if (!current || !stem.includes(current)) return found;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const i = stem.indexOf(current);
  const re = new RegExp(`^${esc(stem.slice(0, i))}\\d[\\w.-]*${esc(stem.slice(i + current.length))} \\(previous version\\)\\.exe$`, 'i');
  let names = [];
  try { names = fs.readdirSync(path.dirname(exe)); } catch {}
  for (const f of names) { const full = path.join(path.dirname(exe), f); if (re.test(f) && !found.includes(full)) found.push(full); }
  return found;
}
function removePrevious(exe, { current, tries = 10, every = 1000 } = {}) {
  for (const previous of previousFiles(exe, current)) {
    let n = 0;
    const attempt = () => { try { fs.unlinkSync(previous); } catch { if (++n < tries) setTimeout(attempt, every).unref?.(); } };
    attempt();
  }
}

module.exports = { parseManifest, manifest, writable, targetName, check, download, ready, discard, swap, cleanupPending, removePrevious, previousFiles, previousOf, readyOf, pendingOf };
