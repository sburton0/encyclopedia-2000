// Signs Windows files with Azure Artifact Signing (formerly Trusted Signing), using your Azure CLI sign-in.
// electron-builder calls this for every .exe it builds (see "signtoolOptions" in package.json).
//
// One-time setup on the build computer:
//   1. Install the Azure CLI (winget install -e --id Microsoft.AzureCLI) and run `az login`.
//   2. Install Microsoft's signing tools: in PowerShell, `Install-Module -Name TrustedSigning -Scope CurrentUser`,
//      then run `Invoke-TrustedSigning` once (it downloads signtool and the Azure signing library to
//      %LOCALAPPDATA%\TrustedSigning; it's fine if it then fails asking for .NET).
// No passwords or keys are stored in the project. Set E2K_SKIP_SIGNING=1 to build unsigned (for quick local tests).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENDPOINT = 'https://cus.codesigning.azure.net';
const ACCOUNT = 'encyclopedia2000';
const PROFILE = 'encyclopedia2000';
const TIMESTAMP = 'http://timestamp.acs.microsoft.com';

// Newest copy of a file under a versioned folder, e.g. ...\Microsoft.Trusted.Signing.Client.1.0.95\bin\x64\Azure.CodeSigning.Dlib.dll
function findTool(dir, relative) {
  const root = path.join(process.env.LOCALAPPDATA || '', 'TrustedSigning', dir);
  const versions = fs.existsSync(root) ? fs.readdirSync(root).sort().reverse() : [];
  for (const v of versions) {
    const file = relative(path.join(root, v));
    if (file && fs.existsSync(file)) return file;
  }
  throw new Error(`Couldn't find ${dir} in ${root}. See the setup steps at the top of tools/sign.js.`);
}

function sign(files) {
  files = [].concat(files);
  if (process.env.E2K_SKIP_SIGNING) return;
  const dlib = findTool('Microsoft.Trusted.Signing.Client', (v) => path.join(v, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll'));
  const signtool = findTool('Microsoft.Windows.SDK.BuildTools', (v) => {
    const bin = path.join(v, 'bin');
    const sdk = fs.existsSync(bin) && fs.readdirSync(bin).sort().reverse()[0];
    return sdk && path.join(bin, sdk, 'x64', 'signtool.exe');
  });

  // Use only the Azure CLI sign-in, so a stray environment variable or cached account can't be picked up instead.
  const metadata = {
    Endpoint: ENDPOINT,
    CodeSigningAccountName: ACCOUNT,
    CertificateProfileName: PROFILE,
    ExcludeCredentials: ['EnvironmentCredential', 'WorkloadIdentityCredential', 'ManagedIdentityCredential', 'SharedTokenCacheCredential',
      'VisualStudioCredential', 'VisualStudioCodeCredential', 'AzurePowerShellCredential', 'AzureDeveloperCliCredential', 'InteractiveBrowserCredential'],
  };
  const metaFile = path.join(os.tmpdir(), `e2k-sign-${process.pid}.json`);
  fs.writeFileSync(metaFile, JSON.stringify(metadata));

  // Make sure the Azure CLI can be found even in a terminal opened before it was installed.
  const env = { ...process.env, PATH: `${process.env.PATH};C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin` };
  try {
    execFileSync(signtool, ['sign', '/v', '/fd', 'SHA256', '/tr', TIMESTAMP, '/td', 'SHA256',
      '/d', 'Encyclopedia 2000', '/du', 'https://github.com/sburton0/encyclopedia-2000',
      '/dlib', dlib, '/dmdf', metaFile, ...files], { stdio: 'inherit', env });
  } finally {
    fs.rmSync(metaFile, { force: true });
  }
}

// electron-builder passes { path, ... }; running `node tools/sign.js <file>` signs one file by hand.
module.exports = async (configuration) => sign(configuration.path);
module.exports.signFiles = sign; // not "sign": electron-builder would call that instead of the default export
if (require.main === module) sign(process.argv.slice(2).map((f) => path.resolve(f)));
