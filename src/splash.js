(() => {
  const muted = new URLSearchParams(location.search).get('mute') === '1' || (() => {
    try { return localStorage.getItem('e2k.sound') === 'false'; } catch { return false; }
  })();

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
