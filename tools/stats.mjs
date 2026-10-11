// Prints download counts for each GitHub release of Encyclopedia 2000.
// latest.yml is fetched by installed copies whenever they check for updates, so its count is a rough measure of use.
// Run with: npm run stats
const res = await fetch('https://api.github.com/repos/sburton0/encyclopedia-2000/releases', { headers: { 'User-Agent': 'encyclopedia-2000-stats' } });
if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
const releases = await res.json();
if (!releases.length) console.log('No releases yet.');
for (const r of releases) {
  console.log(`\n${r.tag_name}${r.prerelease ? ' (pre-release)' : ''}${r.draft ? ' (draft)' : ''}, published ${(r.published_at || '').slice(0, 10) || 'not yet'}`);
  for (const a of r.assets) {
    const label = /(Setup|Installer).*\.exe$/.test(a.name) ? 'installer downloads' : /Portable.*\.exe$/.test(a.name) ? 'portable downloads' : a.name === 'latest.yml' ? 'update checks' : null;
    if (label) console.log(`  ${String(a.download_count).padStart(7)}  ${label}  (${a.name})`);
  }
}
