// Makes build/portable-splash.bmp (npm run portable-splash): the picture the Windows portable .exe shows while it
// unpacks itself (electron-builder's portable.splashImage), which can take 20 seconds on an old PC. It's the app's own
// startup screen (src/splash.html), still and in the default theme, with "Starting Encyclopedia 2000…" as its status.
// Run it again if the startup screen changes. An Electron script: electron tools/make-portable-splash.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'portable-splash.bmp');
const W = 640, H = 400;

// A 24-bit BMP from Electron's BGRA bitmap (rows bottom-up, each padded to 4 bytes).
function bmp(bgra) {
  const row = Math.ceil((W * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * H);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18);
  buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * H, 34);
  for (let y = 0; y < H; y++) {
    const o = 54 + (H - 1 - y) * row;
    for (let x = 0; x < W; x++) bgra.copy(buf, o + x * 3, (y * W + x) * 4, (y * W + x) * 4 + 3);
  }
  return buf;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(ROOT, 'src', 'splash.html'));
  await win.webContents.executeJavaScript(`
    document.body.classList.add('no-anim');
    // A copy of the status line, so the screen's own timed messages go to the old one.
    const old = document.getElementById('status'), st = old.cloneNode();
    old.replaceWith(st);
    st.textContent = 'Starting Encyclopedia 2000…';
    document.querySelector('.bar').style.visibility = 'hidden';
    document.querySelector('.foot span:last-child').textContent = 'Getting things ready. This can take a moment.';
    0`);
  await new Promise((r) => setTimeout(r, 1500));
  const img = (await win.webContents.capturePage()).resize({ width: W, height: H });
  fs.writeFileSync(OUT, bmp(img.toBitmap()));
  console.log(`Saved ${path.relative(ROOT, OUT)} (${W}×${H})`);
  app.quit();
});
