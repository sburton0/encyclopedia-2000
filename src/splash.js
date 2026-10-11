(() => {
  const pref = (k, d) => { try { const v = localStorage.getItem('e2k.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const muted = new URLSearchParams(location.search).get('mute') === '1' || E2KAudio.isMuted() || !pref('startupSound', true);
  if (!pref('animations', true)) document.body.classList.add('no-anim');

  makeBloom(document.getElementById('petals'), 0.56, { animate: true });
  if (!muted) setTimeout(() => { try { E2KAudio.jingle({ volume: 0.55 }); } catch {} }, 150);

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
  setTimeout(finish, 6000);
  addEventListener('mousedown', finish);
  addEventListener('keydown', finish);
})();
