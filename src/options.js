// Tools > Options: a tabbed settings dialog with OK, Cancel, and Apply.
// Changes are staged in `draft` and only saved on OK or Apply. "Clear" and "Reset" act immediately.
window.E2KOptions = (() => {
  const RENDERER_KEYS = ['startupSound', 'startOn', 'clicks', 'voice', 'rate', 'fontScale', 'articleFont', 'animations', 'volume', 'muted'];

  async function open(api) {
    const { h, store } = api;
    if (document.querySelector('.options')) return;
    const main = await window.e2k.settings.get();

    const read = () => ({
      showSplash: main.showSplash,
      windowMode: main.windowMode,
      hardwareAcceleration: main.hardwareAcceleration !== false,
      startupSound: store.get('startupSound', true),
      startOn: store.get('startOn', 'home'),
      volume: Math.round(E2KAudio.getVolume() * 100),
      muted: E2KAudio.isMuted() && E2KAudio.getVolume() > 0,
      clicks: store.get('clicks', true),
      voice: store.get('voice', ''),
      rate: store.get('rate', 1),
      fontScale: store.get('fontScale', 1),
      articleFont: store.get('articleFont', 'serif'),
      animations: store.get('animations', true),
    });
    let draft = read();
    let saved = JSON.stringify(draft);

    // ---------- small controls ----------
    const refreshers = [];
    const refresh = () => { refreshers.forEach((f) => f()); applyBtn.disabled = JSON.stringify(draft) === saved; };
    const set = (k, v) => { draft[k] = v; refresh(); };

    function check(key, label, note) {
      const input = h('input', { type: 'checkbox', onchange: () => set(key, input.checked) });
      refreshers.push(() => { input.checked = !!draft[key]; });
      return h('label', { class: 'ocheck' }, input, h('span', { class: 'box' }), h('span', {}, h('b', {}, label), note ? h('small', {}, note) : null));
    }
    function radios(key, name, choices) {
      return h('div', { class: 'oradios' }, choices.map(([value, label]) => {
        const input = h('input', { type: 'radio', name, onchange: () => set(key, value) });
        refreshers.push(() => { input.checked = draft[key] === value; });
        return h('label', { class: 'oradio' }, input, h('span', { class: 'dot' }), label);
      }));
    }
    function slider(key, min, max, step, fmt) {
      const input = h('input', { type: 'range', class: 'oslider', min, max, step, oninput: () => set(key, Number(input.value)) });
      const out = h('span', { class: 'oval' });
      refreshers.push(() => {
        input.value = draft[key];
        input.style.setProperty('--p', ((draft[key] - min) / (max - min)) * 100 + '%');
        out.textContent = fmt(draft[key]);
      });
      return [input, out];
    }
    const group = (title, ...kids) => h('fieldset', { class: 'ogroup' }, h('legend', {}, title), ...kids);

    // ---------- Startup ----------
    const startup = h('div', { class: 'opane' },
      group('When Encyclopedia 2000 opens',
        check('showSplash', 'Show the startup screen', 'The bloom, logo, and loading bar before the main window.'),
        check('startupSound', 'Play the startup sound', 'The jingle that plays with the startup screen.')),
      h('div', { class: 'ocols' },
        group('Start on', radios('startOn', 'o-starton', [
          ['home', 'The Home screen'], ['last', 'The last article I read'], ['featured', 'Today’s featured article'], ['random', 'A random article']])),
        group('Window', radios('windowMode', 'o-window', [
          ['remember', 'Remember size and position'], ['maximized', 'Always open maximized'], ['default', 'Open at the standard size']]))),
      group('Display',
        check('hardwareAcceleration', 'Use hardware acceleration', 'Draws the screen with your graphics card. Turn off if windows flicker, go black, or show blank areas. Takes effect the next time Encyclopedia 2000 starts.')));
    refreshers.push(() => startup.querySelectorAll('.ocheck')[1].classList.toggle('off', !draft.showSplash));

    // ---------- Sound ----------
    const muteBtn = h('button', { class: 'tbtn', title: 'Mute', onclick: () => {
      if (draft.muted || draft.volume === 0) { draft.muted = false; if (draft.volume === 0) draft.volume = 50; } else draft.muted = true;
      refresh();
    } }, api.svg('svg', { class: 'ic' }, api.svg('use', { href: '#i-vol' })));
    const [volSlider, volOut] = slider('volume', 0, 100, 1, (v) => (draft.muted ? 'Muted' : v + '%'));
    volSlider.addEventListener('input', () => { if (draft.muted) { draft.muted = false; refresh(); } });
    refreshers.push(() => {
      const off = draft.muted || draft.volume === 0;
      muteBtn.querySelector('use').setAttribute('href', '#i-' + (off ? 'mute' : draft.volume < 50 ? 'vol-low' : 'vol'));
      muteBtn.title = off ? 'Unmute' : 'Mute';
      volSlider.classList.toggle('muted', off);
    });

    const voiceSel = h('select', { class: 'oselect', onchange: () => set('voice', voiceSel.value) });
    function fillVoices() {
      const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
      voiceSel.replaceChildren(h('option', { value: '' }, 'Windows default voice'),
        ...voices.map((v) => h('option', { value: v.voiceURI }, `${v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '')} (${v.lang})`)));
      voiceSel.value = draft.voice;
    }
    fillVoices();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = fillVoices;
    refreshers.push(() => { voiceSel.value = draft.voice; });
    const [rateSlider, rateOut] = slider('rate', 0.6, 1.6, 0.1, (v) => (Math.abs(v - 1) < 0.05 ? 'Normal' : v.toFixed(1) + '×'));
    const testBtn = h('button', { class: 'go', onclick: () => {
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('This is how Encyclopedia 2000 sounds when it reads an article aloud.');
      u.rate = draft.rate;
      const level = draft.muted ? 0 : (draft.volume / 100);
      u.volume = level;
      const v = speechSynthesis.getVoices().find((x) => x.voiceURI === draft.voice);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } }, 'Test');

    const sound = h('div', { class: 'opane' },
      group('Volume', h('div', { class: 'orow' }, muteBtn, volSlider, volOut),
        h('p', { class: 'onote' }, 'For the startup sound, clicks, game sounds, and Read Aloud. The same as the volume button in the toolbar.'),
        check('clicks', 'Play click sounds', 'A soft tick when you press buttons and menu items.')),
      group('Read Aloud',
        h('div', { class: 'orow' }, h('span', { class: 'olabel' }, 'Voice'), voiceSel),
        h('div', { class: 'orow' }, h('span', { class: 'olabel' }, 'Speed'), rateSlider, rateOut),
        h('div', { class: 'orow end' }, testBtn)));

    // ---------- Reading ----------
    const sample = h('p', { class: 'osample' }, 'The Moon is Earth’s only natural satellite. It orbits at an average distance of 384,400 km, about 30 times the diameter of Earth.');
    const [sizeSlider, sizeOut] = slider('fontScale', 0.8, 1.5, 0.1, (v) => Math.round(v * 100) + '%');
    refreshers.push(() => {
      sample.style.fontSize = 15 * draft.fontScale + 'px';
      sample.dataset.font = draft.articleFont;
    });
    const reading = h('div', { class: 'opane' },
      group('Articles',
        h('div', { class: 'orow' }, h('span', { class: 'olabel' }, 'Text size'), sizeSlider, sizeOut),
        h('div', { class: 'orow top' }, h('span', { class: 'olabel' }, 'Font'),
          radios('articleFont', 'o-font', [['serif', 'Classic serif (Georgia)'], ['sans', 'Clean sans-serif (Segoe UI)']])),
        sample),
      group('Motion', check('animations', 'Play animations', 'The startup bloom, screen fades, and game effects. Turn off for a calmer, faster feel.')));

    // ---------- Privacy ----------
    const recentCount = h('span');
    const updateRecent = () => { const n = store.get('recent', []).length; recentCount.textContent = n ? `${n} article${n === 1 ? '' : 's'} in your list.` : 'Your list is empty.'; };
    updateRecent();
    const privacy = h('div', { class: 'opane' },
      group('Recently viewed',
        h('p', { class: 'onote' }, 'The Find box’s drop-down list remembers the last articles you opened. ', recentCount),
        h('div', { class: 'orow end' }, h('button', { class: 'go', onclick: () => {
          store.set('recent', []);
          store.set('lastArticle', '');
          updateRecent();
          api.setIdle('Recently viewed list cleared');
        } }, 'Clear Recently Viewed'))),
      group('Reset',
        h('p', { class: 'onote' }, 'Put every option back the way it was when you first installed Encyclopedia 2000. Your favorites and game progress aren’t affected.'),
        h('div', { class: 'orow end' }, h('button', { class: 'go', onclick: () => {
          api.dialog('Options', 'Reset all settings?', ['Every option returns to its default. Favorites and game progress stay as they are.'],
            [['Reset', async () => {
              RENDERER_KEYS.forEach((k) => { try { localStorage.removeItem('e2k.' + k); } catch {} });
              E2KAudio.setVolume(1);
              E2KAudio.setMuted(false);
              const m = await window.e2k.settings.set({ reset: true });
              Object.assign(main, m);
              api.setFontScale(1);
              api.applyPrefs();
              api.updateVolume();
              draft = read();
              saved = JSON.stringify(draft);
              refresh();
              api.setIdle('All settings reset');
            }], ['Cancel']]);
        } }, 'Reset All Settings…'))));

    // ---------- dialog shell ----------
    const TABS = [['Startup', startup], ['Sound', sound], ['Reading', reading], ['Privacy', privacy]];
    const tabBtns = TABS.map(([label], i) => h('button', { class: 'otab', role: 'tab', onclick: () => show(i) }, label));
    const body = h('div', { class: 'obody' });
    function show(i) {
      tabBtns.forEach((b, j) => b.classList.toggle('on', i === j));
      body.replaceChildren(TABS[i][1]);
    }

    async function apply() {
      const restart = draft.hardwareAcceleration !== (main.hardwareAcceleration !== false);
      await window.e2k.settings.set({ showSplash: draft.showSplash, windowMode: draft.windowMode, hardwareAcceleration: draft.hardwareAcceleration });
      main.showSplash = draft.showSplash;
      main.windowMode = draft.windowMode;
      main.hardwareAcceleration = draft.hardwareAcceleration;
      ['startupSound', 'startOn', 'clicks', 'voice', 'rate', 'articleFont', 'animations'].forEach((k) => store.set(k, draft[k]));
      api.setFontScale(draft.fontScale);
      E2KAudio.setVolume(draft.volume / 100);
      E2KAudio.setMuted(draft.muted);
      api.applyPrefs();
      api.updateVolume();
      if (draft.muted || draft.volume === 0) api.speechStop();
      saved = JSON.stringify(draft);
      refresh();
      api.setIdle(restart ? 'Options saved. Restart Encyclopedia 2000 to change hardware acceleration.' : 'Options saved');
    }
    const close = () => { if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = null; } ov.remove(); };
    const okBtn = h('button', { class: 'go', onclick: async () => { await apply(); close(); } }, 'OK');
    const cancelBtn = h('button', { class: 'go', onclick: close }, 'Cancel');
    const applyBtn = h('button', { class: 'go', onclick: apply }, 'Apply');

    const ov = h('div', { class: 'overlay' },
      h('div', { class: 'dialog options', role: 'dialog', 'aria-label': 'Options' },
        h('div', { class: 'dt' }, h('img', { src: 'icon-small.svg', alt: '' }), 'Options'),
        h('div', { class: 'otabs', role: 'tablist' }, tabBtns),
        body,
        h('div', { class: 'df' }, okBtn, cancelBtn, applyBtn)));
    document.body.append(ov);
    show(0);
    refresh();
    okBtn.focus();
  }

  return { open };
})();
