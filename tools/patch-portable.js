// Keeps the Windows portable's picture up until the app's first window shows. electron-builder's portable launcher
// (templates/nsis/portable.nsi) unpacks the app, takes its picture (portable.splashImage) down, and only then starts the
// app; on an old PC the app takes another ~12 s to show a window (lab, 2026-11-15), with nothing on screen meanwhile.
// Patched, the launcher starts the app first and takes the picture down when the app says it has shown a window (it
// writes the file named in E2K_LAUNCHER_SHOWN: see main.js), when the app exits, or after 2 minutes, whichever is first.
// `npm run dist` and `npm run release` run this first. It edits electron-builder's file in node_modules (npm ci and
// updates undo it, so it runs every time) and does nothing if it's already done.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'portable.nsi');
const MARK = '; e2k: patched by tools/patch-portable.js';
const original = `  !ifdef SPLASH_IMAGE
    BgImage::Destroy
  !endif

	ExecWait "$INSTDIR\\\${APP_EXECUTABLE_FILENAME} $R0" $0
  SetErrorLevel $0`;
const patched = `  ${MARK}
  !ifdef SPLASH_IMAGE
    ; The app writes this file once it has shown a window; the picture stays up until then.
    System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("E2K_LAUNCHER_SHOWN", "$PLUGINSDIR\\shown").r0'
    StrCpy $9 '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" $R0'
    System::Alloc 128
    Pop $2
    System::Call "*$2(i 68)"
    System::Alloc 32
    Pop $3
    System::Call 'kernel32::CreateProcessW(p 0, w r9, p 0, p 0, i 0, i 0, p 0, p 0, p r2, p r3) i .r4'
    StrCmp $4 0 e2k_fallback
    System::Call "*$3(p .r5, p .r6)"
    StrCpy $7 0
    e2k_wait:
      IfFileExists "$PLUGINSDIR\\shown" e2k_shown
      System::Call 'kernel32::WaitForSingleObject(p r5, i 100) i .r8'
      StrCmp $8 0 e2k_shown
      IntOp $7 $7 + 1
      IntCmp $7 1200 e2k_shown e2k_wait e2k_shown
    e2k_shown:
    BgImage::Destroy
    System::Call 'kernel32::WaitForSingleObject(p r5, i -1)'
    System::Call 'kernel32::GetExitCodeProcess(p r5, *i .r0)'
    System::Call 'kernel32::CloseHandle(p r5)'
    System::Call 'kernel32::CloseHandle(p r6)'
    Goto e2k_done
    e2k_fallback:
    BgImage::Destroy
    ExecWait "$INSTDIR\\\${APP_EXECUTABLE_FILENAME} $R0" $0
    e2k_done:
    System::Free $2
    System::Free $3
  !else
    ExecWait "$INSTDIR\\\${APP_EXECUTABLE_FILENAME} $R0" $0
  !endif
  SetErrorLevel $0`;

let src = fs.readFileSync(file, 'utf8');
if (src.includes(MARK)) process.exit(0);
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const want = original.replace(/\n/g, nl);
if (src.split(want).length !== 2) {
  console.error('patch-portable: electron-builder has changed; check templates/nsis/portable.nsi by hand (see this file).');
  process.exit(1);
}
fs.writeFileSync(file, src.replace(want, patched.replace(/\n/g, nl)));
console.log('patch-portable: the portable\'s picture stays up until the app shows a window.');
