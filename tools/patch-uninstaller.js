// Lets the Windows build work with Smart App Control on. To make the uninstaller, electron-builder builds a small
// unsigned installer and runs it, and Smart App Control refuses to run unsigned programs ("spawn UNKNOWN"); signing that
// program first breaks the uninstaller. On macOS electron-builder instead reads the uninstaller straight out of that
// program (UninstallerReader), which needs nothing to run, so this makes Windows do the same.
// `npm run dist` and `npm run release` run this first. It edits electron-builder's file in node_modules (npm ci and
// updates undo it, so it runs every time) and does nothing if it's already done.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
const run = 'await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });';
const read = 'await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath); // patched by tools/patch-uninstaller.js';
let src = fs.readFileSync(file, 'utf8');
if (src.includes(read)) process.exit(0);
// An earlier hand edit, from the 0.5 build.
src = src.replace(/\/\/ e2k: read the uninstaller[^\n]*\n\s*await nsisUtil_1\.UninstallerReader\.exec\(installerPath, uninstallerPath\);/, read);
if (!src.includes(read)) {
  if (!src.includes(run)) {
    console.error('patch-uninstaller: electron-builder has changed; check NsisTarget.js by hand (see this file).');
    process.exit(1);
  }
  src = src.replace(run, read);
}
fs.writeFileSync(file, src);
console.log('patch-uninstaller: the uninstaller is read out of the stub, not run (Smart App Control).');
