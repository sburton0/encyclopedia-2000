(() => {
  const pref = (k, d) => { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const muted = new URLSearchParams(location.search).get('mute') === '1' || E2KAudio.isMuted() || !pref('startupSound', true);
  if (!pref('animations', true)) document.body.classList.add('no-anim');

  makeBloom(document.getElementById('petals'), 0.56, { animate: true });
  // The chosen theme recolors the sky and, for every theme but Bloom, replaces the bloom with its own scene.
  E2KThemes.apply(E2KThemes.read());
  const sky = E2KThemes.palette().b0;
  document.querySelectorAll('#sb0 stop').forEach((s, i) => s.setAttribute('stop-color', sky[i]));
  document.querySelectorAll('#shade stop').forEach((s) => s.setAttribute('stop-color', sky[2]));
  E2KThemes.splashArt(document.querySelector('svg.bg'));
  if (!muted) setTimeout(() => { try { E2KAudio.jingle({ volume: 0.55 }); } catch {} }, 150);

  if (window.e2k && window.e2k.appInfo) window.e2k.appInfo().then((i) => { document.getElementById('ver').textContent = `Version ${E2KVersion.pretty(i.version)}`; }).catch(() => {});
  const status = document.getElementById('status');
  [[1500, 'Connecting to Wikipedia…'], [3100, 'Gathering today’s discoveries…'], [4900, 'Ready']]
    .forEach(([t, msg]) => setTimeout(() => { status.textContent = msg; }, t));

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    document.body.classList.add('out');
    E2KAudio.fadeOut(0.45);
    setTimeout(() => window.e2k && window.e2k.splashDone(), 480);
  }
  const timer = setTimeout(finish, 6000);

  // The first time someone skips, offer to skip the startup screen from now on.
  let asking = false;
  function skip(e) {
    if (done || asking) return;
    if (pref('skipAsked', false) || !window.e2k) { finish(); return; }
    e.preventDefault();
    asking = true;
    clearTimeout(timer);
    try { localStorage.setItem('e2k.skipAsked', 'true'); } catch {}
    const answer = async (always) => {
      if (always) { try { await window.e2k.settings.set({ showSplash: false }); } catch {} }
      ov.remove();
      finish();
    };
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dialog" role="dialog" aria-labelledby="skip-h">
      <div class="dt"><img src="icon-small.svg" alt="">Encyclopedia 2000</div>
      <div class="db"><img src="icon.svg" alt=""><div>
        <h2 id="skip-h">Skip the startup screen every time?</h2>
        <p>Encyclopedia 2000 can open straight to the main window from now on.</p>
        <p>You can change this anytime in Tools › Options.</p>
      </div></div>
      <div class="df"><button class="go" data-a="yes">Always Skip</button><button class="go" data-a="no">Keep Showing</button></div>
    </div>`;
    ov.querySelector('[data-a="yes"]').onclick = () => answer(true);
    ov.querySelector('[data-a="no"]').onclick = () => answer(false);
    ov.addEventListener('keydown', (k) => { if (k.key === 'Escape') answer(false); });
    document.body.append(ov);
    ov.querySelector('.go').focus();
  }
  addEventListener('mousedown', skip);
  addEventListener('keydown', skip);
})();
