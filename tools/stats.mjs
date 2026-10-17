// Download statistics for Encyclopedia 2000, from GitHub's per-file download counts.
//
// What each file's count means:
//   latest.yml / latest-mac.yml / latest-linux.yml   update checks: every running copy fetches these at start and every 6 hours
//   Portable…exe, …dmg, …deb                         new downloads (these are never fetched by the updater)
//   …-mac.zip                                        Mac automatic updates (the Mac updater only uses the .zip)
//   Installer…exe                                    Windows new downloads AND automatic updates together
//   Installer…exe.blockmap                           fetched only by the Windows updater, so it estimates Windows updates;
//                                                    Windows new downloads ≈ installer − blockmap
// GitHub only keeps running totals, so .github/workflows/download-stats.yml saves a snapshot every day (stats branch).
//
//   npm run stats                 a summary per release
//   node tools/stats.mjs --json   one snapshot as JSON (used by the daily workflow)
const res = await fetch('https://api.github.com/repos/sburton0/encyclopedia-2000/releases?per_page=100', {
  headers: { 'User-Agent': 'encyclopedia-2000-stats', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
});
if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
const releases = (await res.json()).filter((r) => !r.draft);

function kind(name) {
  if (/^latest\.yml$/.test(name)) return 'checkWindows';
  if (/^latest-mac\.yml$/.test(name)) return 'checkMac';
  if (/^latest-linux\.yml$/.test(name)) return 'checkLinux';
  if (/Installer.*\.exe\.blockmap$/.test(name)) return 'winUpdaterBlockmap';
  if (/Installer.*\.exe$/.test(name)) return 'winInstaller';
  if (/Portable.*\.exe$/.test(name)) return 'winPortable';
  if (/\.dmg$/.test(name)) return 'mac';
  if (/-mac\.zip$/.test(name)) return 'macUpdate';
  if (/\.deb$/.test(name)) return 'linux';
  return null;
}

// Per release: raw counts for each kind, and the derived numbers.
export function summarize(rel) {
  const c = {};
  for (const a of rel.assets) { const k = kind(a.name); if (k) c[k] = (c[k] || 0) + a.download_count; }
  const winUpdates = Math.min(c.winUpdaterBlockmap || 0, c.winInstaller || 0);
  const winNew = (c.winInstaller || 0) - winUpdates;
  return {
    version: rel.tag_name, published: (rel.published_at || '').slice(0, 10),
    downloads: { windowsInstaller: winNew, windowsPortable: c.winPortable || 0, mac: c.mac || 0, linux: c.linux || 0 },
    updates: { windows: winUpdates, mac: c.macUpdate || 0 },
    checks: { windows: c.checkWindows || 0, mac: c.checkMac || 0, linux: c.checkLinux || 0 },
    raw: c,
  };
}

const rows = releases.map(summarize);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ date: new Date().toISOString().slice(0, 10), releases: rows }));
} else {
  if (!rows.length) console.log('No releases yet.');
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  for (const r of rows) {
    console.log(`\n${r.version}, published ${r.published}`);
    console.log(`  New downloads  ${String(sum(r.downloads)).padStart(5)}   Windows installer ${r.downloads.windowsInstaller} (estimate) · portable ${r.downloads.windowsPortable} · Mac ${r.downloads.mac} · Linux ${r.downloads.linux}`);
    console.log(`  Updates        ${String(sum(r.updates)).padStart(5)}   Windows ${r.updates.windows} (estimate) · Mac ${r.updates.mac}`);
    console.log(`  Update checks  ${String(sum(r.checks)).padStart(5)}   Windows ${r.checks.windows} · Mac ${r.checks.mac} · Linux ${r.checks.linux}`);
  }
  console.log('\nUpdate checks count check-ins (each running copy checks at start and every 6 hours), not people.');
}
