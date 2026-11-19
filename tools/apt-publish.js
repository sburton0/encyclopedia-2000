// Publishes a .deb to Encyclopedia 2000's apt repository (https://apt.encyclopedia2000.com, a Cloudflare R2 bucket), so
// copies installed from the .deb update with the computer's other updates (the .deb adds the repository when it's
// installed: build/linux/after-install.tpl).
//
//   npm run apt:publish -- dist/Encyclopedia-2000-0.6.1-beta-linux-amd64.deb          build, sign, upload, check
//   npm run apt:publish -- <deb> --dry                                                 build and sign into dist/apt only
//   options: --out <dir> (default dist/apt), --key <fingerprint>, --gpg <gpg.exe>, --gnupghome <dir> (a test keyring)
//
// What it makes (a "flat" Debian repository with one suite, "stable", and one component, "main"):
//   pool/main/e/encyclopedia-2000/<the .deb>
//   dists/stable/main/binary-amd64/Packages (and .gz)    the package's control fields, its file name, size and hashes
//   dists/stable/Release                                  the hashes of those index files
//   dists/stable/InRelease, Release.gpg                   Release, signed with the repository's key
//   encyclopedia-2000.asc                                 the public key, for anyone setting the repository up by hand
// Only the newest version is listed. Older .deb files stay in the bucket (they're small) but aren't offered.
//
// Signing uses Scott's key (in his Git Bash gpg; gpg asks for its passphrase in its own window). Uploading needs the
// bucket's API token, from Scott's password manager, in his own terminal, never in a file in the repository:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   (and R2_BUCKET, default encyclopedia2000-apt)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const KEY = '758EF5BAE98CBF7BB7BDF0F331881CBAA33D0E14';   // Encyclopedia 2000 (apt repository) <hello@encyclopedia2000.com>
const SITE = 'https://apt.encyclopedia2000.com';
const SUITE = 'stable', COMPONENT = 'main', ARCH = 'amd64';

// ---- reading a .deb: an ar archive holding control.tar.{xz,gz,zst} -------------------------------------------------
function arMembers(buf) {
  if (buf.toString('latin1', 0, 8) !== '!<arch>\n') throw new Error('Not a .deb (no ar header)');
  const out = {};
  for (let p = 8; p + 60 <= buf.length;) {
    const name = buf.toString('latin1', p, p + 16).trim().replace(/\/$/, '');
    const size = parseInt(buf.toString('latin1', p + 48, p + 58).trim(), 10);
    out[name] = buf.subarray(p + 60, p + 60 + size);
    p += 60 + size + (size % 2);
  }
  return out;
}
function untarFile(tar, want) {
  for (let p = 0; p + 512 <= tar.length;) {
    const name = tar.toString('latin1', p, p + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.toString('latin1', p + 124, p + 136).replace(/\0.*$/s, '').trim() || '0', 8);
    if (name.replace(/^\.\//, '') === want) return tar.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}
function xzDecompress(buf) {
  const xz = process.platform === 'win32' ? ['C:\\Program Files\\Git\\mingw64\\bin\\xz.exe', 'xz'] : ['xz'];
  for (const exe of xz) {
    const r = spawnSync(exe, ['-dc'], { input: buf, maxBuffer: 64 * 1048576 });
    if (r.status === 0) return r.stdout;
  }
  throw new Error('Couldn’t run xz to read the .deb’s control files');
}
function debControl(debBuf) {
  const m = arMembers(debBuf);
  const name = Object.keys(m).find((k) => /^control\.tar/.test(k));
  if (!name) throw new Error('The .deb has no control.tar');
  const tar = /\.xz$/.test(name) ? xzDecompress(m[name]) : /\.gz$/.test(name) ? zlib.gunzipSync(m[name]) : /\.tar$/.test(name) ? m[name] : null;
  if (!tar) throw new Error(`Can’t read ${name}`);
  const control = untarFile(tar, 'control');
  if (!control) throw new Error('The .deb’s control.tar has no control file');
  return control.toString('utf8');
}

// ---- the index files --------------------------------------------------------------------------------------------
const hash = (alg, b) => crypto.createHash(alg).update(b).digest('hex');
function packagesEntry(control, debBuf, filename) {
  const fields = control.replace(/\n+$/, '');
  if (!/^Package: /m.test(fields) || !/^Version: /m.test(fields)) throw new Error('The control file has no Package or Version');
  return `${fields}\nFilename: ${filename}\nSize: ${debBuf.length}\nMD5sum: ${hash('md5', debBuf)}\nSHA1: ${hash('sha1', debBuf)}\nSHA256: ${hash('sha256', debBuf)}\n`;
}
function releaseFile(files, date = new Date()) {
  const list = (alg) => Object.entries(files).map(([name, b]) => ` ${hash(alg, b)} ${String(b.length).padStart(10)} ${name}`).join('\n');
  return [
    'Origin: Encyclopedia 2000', 'Label: Encyclopedia 2000', `Suite: ${SUITE}`, `Codename: ${SUITE}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`, `Architectures: ${ARCH}`, `Components: ${COMPONENT}`,
    'Description: Encyclopedia 2000 (https://encyclopedia2000.com)',
    'MD5Sum:', list('md5'), 'SHA1:', list('sha1'), 'SHA256:', list('sha256'), '',
  ].join('\n');
}
// Everything but the signatures, as { 'path in the bucket': Buffer }.
function buildRepo(debBuf, debName, publicKey, date) {
  const control = debControl(debBuf);
  const pkg = /^Package: (\S+)$/m.exec(control)[1];
  const pool = `pool/${COMPONENT}/${pkg[0]}/${pkg}/${debName}`;
  const packages = Buffer.from(packagesEntry(control, debBuf, pool));
  const idx = `${COMPONENT}/binary-${ARCH}`;
  const index = { [`${idx}/Packages`]: packages, [`${idx}/Packages.gz`]: zlib.gzipSync(packages, { level: 9 }) };
  return {
    control, pool,
    files: {
      [pool]: debBuf,
      ...Object.fromEntries(Object.entries(index).map(([k, v]) => [`dists/${SUITE}/${k}`, v])),
      [`dists/${SUITE}/Release`]: Buffer.from(releaseFile(index, date)),
      'encyclopedia-2000.asc': publicKey,
    },
  };
}

// ---- uploading to R2 (S3's API, signed with AWS Signature Version 4) ------------------------------------------------
function sigv4({ method, host, path: p, region = 'auto', service = 's3', accessKey, secretKey, body, headers = {}, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = hash('sha256', body || '');
  const h = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) };
  const names = Object.keys(h).sort();
  const canonPath = p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
  const canonical = [method, canonPath, '', names.map((n) => `${n}:${h[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash('sha256', canonical)].join('\n');
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const kSign = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), service), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}` };
}
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { ...headers, ...(body ? { 'content-length': body.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const TYPES = { '.deb': 'application/vnd.debian.binary-package', '.gz': 'application/gzip', '.asc': 'application/pgp-keys', '.gpg': 'application/pgp-signature' };
async function put(cred, key, body) {
  const host = `${cred.account}.r2.cloudflarestorage.com`;
  const p = `/${cred.bucket}/${key}`;
  // The pool's files never change; the index files must be fresh, so they aren't cached for long.
  const headers = { 'content-type': TYPES[path.extname(key)] || 'text/plain; charset=utf-8', 'cache-control': key.startsWith('pool/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300' };
  const signed = sigv4({ method: 'PUT', host, path: p, accessKey: cred.id, secretKey: cred.secret, body, headers });
  const r = await request('PUT', `https://${host}${p}`, signed, body);
  if (r.status !== 200) throw new Error(`Upload of ${key} failed: HTTP ${r.status} ${r.body.toString().slice(0, 300)}`);
}

// ---- signing ------------------------------------------------------------------------------------------------------
function gpgExe(opt) {
  if (opt) return opt;
  const git = 'C:\\Program Files\\Git\\usr\\bin\\gpg.exe';
  return process.platform === 'win32' && fs.existsSync(git) ? git : 'gpg';
}
function sign(gpg, home, key, releasePath) {
  const base = [...(home ? ['--homedir', home] : []), '--batch', '--yes', '--local-user', key, '--digest-algo', 'SHA512'];
  // (gpg's own window asks for the passphrase; --batch only stops it asking questions in the terminal.)
  for (const [args, what] of [[['--clearsign', '-o', releasePath.replace(/Release$/, 'InRelease')], 'InRelease'], [['--armor', '--detach-sign', '-o', releasePath + '.gpg'], 'Release.gpg']]) {
    const r = spawnSync(gpg, [...base, ...args, releasePath], { stdio: ['inherit', 'inherit', 'pipe'] });
    if (r.status !== 0) throw new Error(`gpg couldn’t sign ${what}: ${String(r.stderr).trim()}`);
  }
}
function verify(gpg, keyring, dir) {
  // gpgv with only the repository's key: what apt does. (Run from Git's folder on Windows.)
  const gpgv = path.join(path.dirname(gpg), process.platform === 'win32' ? 'gpgv.exe' : 'gpgv');
  const exe = fs.existsSync(gpgv) ? gpgv : 'gpgv';
  for (const args of [['InRelease'], ['Release.gpg', 'Release']]) {
    const r = spawnSync(exe, ['--keyring', keyring, ...args.map((a) => path.join(dir, a))], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`The signature on ${args[0]} doesn’t check out: ${r.stderr}`);
  }
}

// ---- main -----------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
  const out = path.resolve(opt('--out') || path.join(REPO, 'dist', 'apt'));
  const key = opt('--key') || KEY;
  const gpg = gpgExe(opt('--gpg'));
  const home = opt('--gnupghome');
  const keyringOpt = opt('--keyring');
  const dry = flag('--dry');
  const deb = args[0];
  if (!deb || !/\.deb$/.test(deb) || !fs.existsSync(deb)) { console.error('Usage: npm run apt:publish -- <the .deb> [--dry]'); process.exit(2); }

  const cred = { account: process.env.R2_ACCOUNT_ID, id: process.env.R2_ACCESS_KEY_ID, secret: process.env.R2_SECRET_ACCESS_KEY, bucket: process.env.R2_BUCKET || 'encyclopedia2000-apt' };
  if (!dry && !(cred.account && cred.id && cred.secret)) {
    console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in this terminal first (from your password manager), or use --dry.');
    process.exit(2);
  }

  const publicKey = fs.readFileSync(path.join(REPO, 'build', 'linux', 'apt-key.asc'));
  const keyring = keyringOpt || path.join(REPO, 'build', 'linux', 'encyclopedia-2000-archive-keyring.gpg');
  const debBuf = fs.readFileSync(deb);
  const repo = buildRepo(debBuf, path.basename(deb), publicKey);
  console.log(`${/^Package: (.*)$/m.exec(repo.control)[1]} ${/^Version: (.*)$/m.exec(repo.control)[1]} → ${repo.pool}`);

  fs.rmSync(out, { recursive: true, force: true });
  for (const [k, v] of Object.entries(repo.files)) { fs.mkdirSync(path.dirname(path.join(out, k)), { recursive: true }); fs.writeFileSync(path.join(out, k), v); }
  const dists = path.join(out, 'dists', SUITE);
  console.log('Signing (gpg may ask for the signing key’s passphrase in its own window)…');
  sign(gpg, home, key, path.join(dists, 'Release'));
  verify(gpg, keyring, dists);
  console.log(`Built and signed in ${out}`);
  if (dry) return;

  // The .deb and the key first, then the indexes, then the signed Release files last: apt never sees an index that
  // points at a file that isn't there yet.
  const order = Object.keys(repo.files).filter((k) => !k.startsWith('dists/'))
    .concat(Object.keys(repo.files).filter((k) => k.startsWith('dists/') && !/Release$/.test(k)))
    .concat([`dists/${SUITE}/Release`, `dists/${SUITE}/Release.gpg`, `dists/${SUITE}/InRelease`]);
  for (const k of order) {
    process.stdout.write(`Uploading ${k}… `);
    await put(cred, k, fs.readFileSync(path.join(out, k)));
    console.log('done');
  }
  // What the world now sees.
  const live = await request('GET', `${SITE}/dists/${SUITE}/InRelease?check=${Date.now()}`, {});
  const same = live.status === 200 && live.body.equals(fs.readFileSync(path.join(dists, 'InRelease')));
  console.log(same ? `${SITE} is serving the new release.` : `Uploaded, but ${SITE} answered HTTP ${live.status} with ${same ? 'it' : 'something else'} (it may take a few minutes).`);
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { arMembers, untarFile, debControl, packagesEntry, releaseFile, buildRepo, sigv4 };
