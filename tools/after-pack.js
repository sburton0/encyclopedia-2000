// electron-builder's afterPack hook: removes what Electron ships for its own demo, which has no place in the release.
// From electron-builder 26.15 on, a Windows build from a local Electron (`-c.electronDist=node_modules/electron/dist`, see
// `npm run dist`) copies that folder as it is, including Electron's default app (resources/default_app.asar, the
// "Welcome to Electron" page shown when no app is found) and its version file; 26.0 left both out. The app never runs
// them (it has its own app.asar), so this only keeps the program folder as it was. Runs before signing.
const fs = require('fs');
const path = require('path');

module.exports = async (context) => {
  const out = context.appOutDir;
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(out, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(out, 'resources');
  for (const file of [path.join(resources, 'default_app.asar'), path.join(out, 'version')]) {
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      console.log(`  • after-pack: removed ${path.relative(out, file)} (Electron's own, not the app's)`);
    }
  }
};
