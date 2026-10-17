// Signs the NSIS plugin DLLs that electron-builder packs into the Windows installer and portable .exe.
// The installer unpacks them to a temp folder and loads them while it runs; Windows Smart App Control blocks unsigned DLLs,
// which stopped the 0.3 installer partway ("Part of this app has been blocked ... SpiderBanner.dll").
// `npm run dist` and `npm run release` run this first. It signs any unsigned plugin in electron-builder's download cache
// (%LOCALAPPDATA%\electron-builder\Cache), so later builds pick up the signed copies. If the cache doesn't exist yet
// (a new build computer), run `npm run dist` once, then run it again so the plugins are signed.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sign } = require('./sign');

const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
const found = [];
function walk(dir) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.dll$/i.test(e.name) && /[\/]plugins[\/]x86-unicode[\/]/i.test(p)) found.push(p);
  }
}
for (const name of fs.existsSync(cache) ? fs.readdirSync(cache) : []) if (/^nsis/i.test(name)) walk(path.join(cache, name));

if (!found.length) {
  console.warn('sign-nsis-plugins: no NSIS plugins found in the electron-builder cache yet. Build once, then build again.');
  process.exit(0);
}
// Ask PowerShell which of them aren't signed yet, so a rebuild doesn't re-sign everything.
const list = path.join(require('os').tmpdir(), `e2k-plugins-${process.pid}.txt`);
fs.writeFileSync(list, found.join('\n'));
const unsigned = execFileSync('powershell', ['-NoProfile', '-Command',
  `Get-Content -LiteralPath '${list}' | Where-Object { (Get-AuthenticodeSignature -LiteralPath $_).Status -ne 'Valid' }`], { encoding: 'utf8' })
  .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
fs.rmSync(list, { force: true });
if (!unsigned.length) { console.log(`sign-nsis-plugins: all ${found.length} NSIS plugins are already signed.`); process.exit(0); }
console.log(`sign-nsis-plugins: signing ${unsigned.length} of ${found.length} NSIS plugins...`);
sign(unsigned);
