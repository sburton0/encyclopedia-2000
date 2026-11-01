// electron-builder's afterAllArtifactBuild hook (see package.json): writes portable.yml beside the Windows portable
// .exe (its name, size, and SHA-512, the way latest.yml lists the installer) and has it published with the release.
// The portable version reads it to update itself on a USB stick (portable-update.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = async (result) => {
  const exe = (result.artifactPaths || []).find((f) => /-Portable-.+\.exe$/.test(f));
  if (!exe) return [];
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(exe)).digest('base64');
  const out = path.join(path.dirname(exe), 'portable.yml');
  fs.writeFileSync(out, [`version: ${require('../package.json').version}`,
    `file: ${path.basename(exe)}`, `sha512: ${sha512}`, `size: ${fs.statSync(exe).size}`, ''].join('\n'));
  return [out];
};
