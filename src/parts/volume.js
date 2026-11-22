// Volume: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['volume'] = (A) => {
  'use strict';
  const { $, $$ } = A;
  const { keyText, syncMenu, setIdle, speechStop, closeMenus } = A.fn;

  const volBtn = $('#volbtn');
  const volPop = $('#volpop');
  const volRange = $('#volrange');
  const volMute = $('#volmute');
  function updateVolume() {
    syncMenu();
    const pct = Math.round(E2KAudio.getVolume() * 100);
    const muted = E2KAudio.isMuted();
    const ic = muted ? 'mute' : pct < 50 ? 'vol-low' : 'vol';
    [volBtn, volMute, ...$$('.mviewer .vb')].forEach((b) => b.querySelector('use').setAttribute('href', '#i-' + ic));
    $$('.mviewer .vr').forEach((r) => { r.value = pct; r.style.setProperty('--p', pct + '%'); r.classList.toggle('muted', muted); });
    $$('video, audio').forEach((m) => { m.volume = E2KAudio.level(); });
    volRange.value = pct;
    volRange.style.setProperty('--p', pct + '%');
    $('#volpct').textContent = muted ? 'Muted' : pct + '%';
    volBtn.title = muted ? 'Volume: muted' : `Volume: ${pct}%`;
    volMute.title = muted ? 'Unmute' : `Mute (${keyText('Ctrl+M')})`;
    volBtn.classList.toggle('on', !volPop.hidden);
    volPop.classList.toggle('muted', muted);
  }
  function toggleMute() {
    if (E2KAudio.isMuted()) {
      if (E2KAudio.getVolume() === 0) E2KAudio.setVolume(0.5);
      E2KAudio.setMuted(false);
    } else {
      E2KAudio.setMuted(true);
      speechStop();
    }
    updateVolume();
    setIdle(E2KAudio.isMuted() ? 'Sound muted' : `Volume ${Math.round(E2KAudio.getVolume() * 100)}%`);
  }
  function closeVolume() { volPop.hidden = true; updateVolume(); }
  volBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); closeMenus(); volPop.hidden = !volPop.hidden; updateVolume(); });
  volPop.addEventListener('mousedown', (e) => e.stopPropagation());
  document.addEventListener('mousedown', () => { if (!volPop.hidden) closeVolume(); });
  volRange.addEventListener('input', () => {
    E2KAudio.setVolume(volRange.value / 100);
    if (Number(volRange.value) === 0) speechStop();
    updateVolume();
  });
  volRange.addEventListener('change', () => { try { E2KAudio.click(); } catch {} });
  volMute.addEventListener('click', toggleMute);
  volBtn.addEventListener('wheel', (e) => {
    e.preventDefault();
    E2KAudio.setVolume(Math.round((E2KAudio.getVolume() + (e.deltaY < 0 ? 0.05 : -0.05)) * 20) / 20);
    updateVolume();
    setIdle(E2KAudio.isMuted() ? 'Sound muted' : `Volume ${Math.round(E2KAudio.getVolume() * 100)}%`);
  }, { passive: false });
  // (Drawn the first time at startup, in app.js, once its shortcut names are ready.)

  return { updateVolume, toggleMute, closeVolume };
};
