// Renders src/icon.svg and src/icon-small.svg into PNGs and a multi-size Windows .ico in build/.
// Run with: npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const RENDER = 512;
// The simplified artwork is used at small sizes, where the detailed one turns to mush.
const SIZES = [[16, 'small'], [20, 'small'], [24, 'small'], [32, 'full'], [40, 'full'], [48, 'full'], [64, 'full'], [128, 'full'], [256, 'full']];

async function render(file) {
  const win = new BrowserWindow({
    width: RENDER, height: RENDER, show: false, transparent: true, frame: false, useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  const html = `<html><body style="margin:0;background:transparent"><img style="display:block;width:${RENDER}px;height:${RENDER}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
  const painted = new Promise((resolve) => win.webContents.once('paint', () => setTimeout(resolve, 300)));
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await painted;
  const img = await win.webContents.capturePage();
  win.destroy();
  return img;
}

// ICO container with PNG-compressed entries (supported since Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(([size, data], i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(([, d]) => d)]);
}

// Keep running between render windows (Electron otherwise quits when the last window closes).
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const full = await render('icon.svg');
  const small = await render('icon-small.svg');
  const pngs = SIZES.map(([size, kind]) => {
    const png = (kind === 'small' ? small : full).resize({ width: size, height: size, quality: 'best' }).toPNG();
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png);
    return [size, png];
  });
  fs.writeFileSync(path.join(OUT, 'icon.png'), full.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(pngs));
  console.log('Wrote build/icon.ico, build/icon.png, and build/icon-<size>.png');
  app.quit();
});
