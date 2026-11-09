// Tools > Options: a tabbed settings dialog with OK, Cancel, and Apply.
// Changes are staged in `draft` and only saved on OK or Apply. "Clear" and "Reset" act immediately.
window.E2KOptions = (() => {
  const RENDERER_KEYS = ['theme', 'clock24', 'units', 'startupSound', 'startOn', 'clicks', 'voice', 'rate', 'fontScale', 'articleFont', 'animations', 'volume', 'muted',
    'dlSounds', 'dlVideos', 'dlSpoken', 'dlPictures'];

  // Scrolls an Options group (by its title, such as 'Units') into view, for links straight to one setting.
  function reveal(root, section) {
    if (!section) return;
    const g = [...root.querySelectorAll('.ogroup legend')].find((l) => l.textContent === section)?.parentElement;
    if (g) setTimeout(() => g.scrollIntoView({ block: 'nearest' }), 0);
  }

  async function open(api, tab, section) {
    const { h, store } = api;
    const openDlg = document.querySelector('.options');
    if (openDlg) { if (tab) [...openDlg.querySelectorAll('.otab')].find((b) => b.textContent === tab)?.click(); reveal(openDlg, section); return; }
    const main = await window.e2k.settings.get();

    const read = () => ({
      showSplash: main.showSplash,
      windowMode: main.windowMode,
      hardwareAcceleration: main.hardwareAcceleration !== false,
      autoUpdate: main.autoUpdate !== false,
      showNews: main.showNews !== false,
      autoInstall: main.autoInstall === true,
      theme: store.get('theme', 'bloom'),
      clock24: store.get('clock24', false),
      units: E2KUnits.system(),
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
      // What downloaded articles bring with them (Storage).
      dlSounds: store.get('dlSounds', true),
      dlVideos: store.get('dlVideos', false),
      dlSpoken: store.get('dlSpoken', false),
      dlPictures: store.get('dlPictures', 'reading'),
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
      // Linux's espeak-ng lists every language again with each of its voice variants ("English+Adam"), thousands in all; keep one per language.
      const voices = ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter((v) => !(/espeak/i.test(v.name) && v.name.includes('+')));
      voiceSel.replaceChildren(h('option', { value: '' }, window.e2k.platform === 'win32' ? 'Windows default voice' : 'System default voice'),
        ...voices.map((v) => h('option', { value: v.voiceURI }, `${v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '').replace(/ espeak-ng$/, '')} (${v.lang})`)));
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
    const sample = h('p', { class: 'osample' }, 'The Moon is Earth’s only natural satellite. It orbits at an average distance of ' + (E2KUnits.system() === 'imperial' ? '238,900 miles' : '384,400 km') + ', about 30 times the diameter of Earth.');
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
    const updateRecent = () => { const n = api.historyCount(); recentCount.textContent = n ? `${n} article${n === 1 ? '' : 's'} in your history.` : 'Your history is empty.'; };
    updateRecent();
    const privacy = h('div', { class: 'opane' },
      group('History',
        h('p', { class: 'onote' }, 'History lists the articles you’ve read, and stays on this computer. Its newest are Recently viewed, in My Articles and the Find box’s list. ', recentCount),
        h('div', { class: 'orow end' },
          h('button', { class: 'go', onclick: () => { close(); api.go('myarticles/history'); } }, 'Show History'),
          h('button', { class: 'go', onclick: () => api.clearHistory(updateRecent) }, 'Clear History…'))),
      group('Updates',
        main.portableSelf
          // The Windows portable (updater.js): checking only tells, unless it also downloads and installs by itself.
          ? [check('autoUpdate', 'Check for updates automatically', 'Checks the Encyclopedia 2000 page on GitHub once a day and tells you about new versions. Only GitHub is contacted, and nothing about you is sent. Notices about problems that need your attention come with it.'),
            h('div', { class: 'osub' }, check('autoInstall', 'Also update automatically', 'Downloads new versions to this drive by itself, and switches to them when you close Encyclopedia 2000. Otherwise you choose when: Download, then Restart Now or Update on Close.'))]
          : check('autoUpdate', 'Check for updates automatically', 'Downloads new versions from the Encyclopedia 2000 page on GitHub, and asks before restarting. Only GitHub is contacted, and nothing about you is sent. You can always use Help › Check for Updates. Notices about problems that need your attention come with it.')),
      group('News',
        check('showNews', 'Show news on the Home page', 'An occasional line above Explore about Encyclopedia 2000 itself, such as new editions. Checked at most once a day from encyclopedia2000.com; nothing about you is sent.')),
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

    // ---------- Storage ----------
    // What's on this computer (the offline library, downloaded articles, the free space), and what a downloaded article
    // brings with it.
    const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e7 ? `${Math.round(b / 1e6)} MB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);
    const bar = h('div', { class: 'sbar', role: 'img' });
    const legend = h('div', { class: 'slegend' });
    const libRow = h('div', { class: 'srow' });
    const dlRow = h('div', { class: 'srow' });
    async function fillStorage() {
      const [ls, list, free] = await Promise.all([window.e2k.library.state().catch(() => ({})), window.e2k.saved.list().catch(() => []), window.e2k.saved.free().catch(() => null)]);
      const lib = ls.current?.size || 0, dl = list.reduce((n, e) => n + (e.size || 0), 0), fr = free || 0;
      const total = lib + dl + fr || 1;
      // Drawn so even a small part shows.
      const w = (n) => (n ? Math.max(1.2, (n / total) * 100) : 0);
      bar.replaceChildren(h('span', { class: 'lib', style: `width:${w(lib)}%` }), h('span', { class: 'dl', style: `width:${w(dl)}%` }));
      bar.setAttribute('aria-label', `Offline library ${lib ? mb(lib) : 'none'}, downloaded articles ${mb(dl)}, free ${free == null ? 'unknown' : mb(fr)}`);
      legend.replaceChildren(h('span', {}, h('i', { class: 'lib' }), `Offline library ${lib ? mb(lib) : '(none)'}`), h('span', {}, h('i', { class: 'dl' }), `Downloaded articles ${mb(dl)}`),
        free == null ? null : h('span', {}, h('i', { class: 'fr' }), `Free on this drive ${mb(fr)}`));
      libRow.replaceChildren(h('div', {}, h('b', {}, 'Offline library'), h('small', {}, ls.current ? ls.current.label || 'Your library' : 'None yet. Download one to read everything without the internet.')),
        h('div', { class: 'btns' }, h('button', { class: 'go', onclick: () => { close(); E2KLibrary.open(window.E2K); } }, 'Offline Library…')));
      const cats = api.downloadedCategories();
      const inCat = cats.reduce((n, c) => n + c.n, 0);
      const desc = list.length ? `${list.length === 1 ? '1 article' : `${list.length} articles`}${cats.length ? `: ${cats.map((c) => `${c.name} (${c.n})`).join(', ')}${list.length > inCat ? `, and ${list.length - inCat} on their own` : ''}` : ''}` : 'None yet. An article’s Download for Offline button keeps a copy that opens without the internet.';
      dlRow.replaceChildren(h('div', {}, h('b', {}, 'Downloaded articles'), h('small', {}, desc)),
        h('div', { class: 'btns' }, h('button', { class: 'go', disabled: !list.length, onclick: () => { close(); api.go('myarticles/downloaded'); } }, 'Show…'),
          h('button', { class: 'go', disabled: !list.length, onclick: () => api.removeAllDownloads(fillStorage) }, 'Remove…')));
    }
    fillStorage();
    const storage = h('div', { class: 'opane ostore' },
      group('On this computer', bar, legend, libRow, dlRow),
      group('Videos and sounds in downloaded articles',
        check('dlSounds', 'Sounds', 'Pronunciations, music samples, animal calls. Usually under 1 MB each.'),
        check('dlVideos', 'Videos', 'Often 20–200 MB each. You can still choose them for one article in its Download menu.'),
        check('dlSpoken', 'Spoken recordings', 'Wikipedia’s narrated articles, which Read Aloud plays: often 10–50 MB.')),
      group('Pictures in downloaded articles', radios('dlPictures', 'o-pics', [['reading', 'Pictures at reading size'], ['none', 'Text only (no pictures, sounds, or videos)']]),
        h('p', { class: 'onote' }, 'For articles you download from now on. Download again to change one already downloaded.')));
    refreshers.push(() => {
      const none = draft.dlPictures === 'none';
      storage.querySelectorAll('.ocheck').forEach((c) => c.classList.toggle('off', none));
      storage.querySelectorAll('.ocheck input').forEach((i) => { i.disabled = none; });
      storage.querySelectorAll('.ocheck')[2].classList.toggle('off', none || !draft.dlSounds);
      storage.querySelectorAll('.ocheck input')[2].disabled = none || !draft.dlSounds;
    });

    // ---------- dialog shell ----------
    // ---------- Appearance ----------
    const picks = E2KThemes.list.map((t) => h('button', { type: 'button', class: 'theme-pick', title: t.blurb, onclick: () => set('theme', t.id) },
      h('img', { src: `themes/${t.id}.jpg`, alt: '' }), h('b', {}, t.name)));
    const themeNote = h('p', { class: 'onote' });
    refreshers.push(() => {
      picks.forEach((p, i) => p.classList.toggle('on', E2KThemes.list[i].id === draft.theme));
      themeNote.textContent = E2KThemes.list.find((t) => t.id === draft.theme)?.blurb || '';
    });
    const appearance = h('div', { class: 'opane' },
      group('Theme', h('div', { class: 'themes' }, picks), themeNote,
        h('p', { class: 'onote' }, 'Themes change the colors, the Home screen, and the startup screen. Articles always stay easy to read.')),
      group('Clock', radios('clock24', 'o-clock', [[false, '12-hour (9:30 PM)'], [true, '24-hour (21:30)']]),
        h('p', { class: 'onote' }, 'For the clock in the status bar, the World Clock, and sunrise and sunset times.')),
      group('Units', radios('units', 'o-units', [['metric', 'Metric (km, kg, °C)'], ['imperial', 'Imperial (miles, pounds, °F)']]),
        h('p', { class: 'onote' }, 'The default for the Solar System and World Explorer; each also has a Units menu to switch until you close the app. Facts in articles come from Wikipedia, which shows both.')));

    const TABS = [['Startup', startup], ['Appearance', appearance], ['Sound', sound], ['Reading', reading], ['Privacy', privacy], ['Storage', storage]];
    const tabBtns = TABS.map(([label], i) => h('button', { class: 'otab', role: 'tab', onclick: () => show(i) }, label));
    const body = h('div', { class: 'obody' });
    function show(i) {
      tabBtns.forEach((b, j) => b.classList.toggle('on', i === j));
      body.replaceChildren(TABS[i][1]);
    }

    async function apply() {
      const restart = draft.hardwareAcceleration !== (main.hardwareAcceleration !== false);
      await window.e2k.settings.set({ showSplash: draft.showSplash, windowMode: draft.windowMode, hardwareAcceleration: draft.hardwareAcceleration, autoUpdate: draft.autoUpdate, showNews: draft.showNews,
        ...(main.portableSelf ? { autoInstall: draft.autoInstall } : {}) });
      main.showSplash = draft.showSplash;
      main.windowMode = draft.windowMode;
      main.hardwareAcceleration = draft.hardwareAcceleration;
      main.autoUpdate = draft.autoUpdate;
      main.showNews = draft.showNews;
      main.autoInstall = draft.autoInstall;
      window.e2k.notice.refresh();
      window.e2k.update.settingsChanged();
      if (draft.units !== E2KUnits.system()) E2KUnits.clearPicks();
      ['theme', 'clock24', 'units', 'startupSound', 'startOn', 'clicks', 'voice', 'rate', 'articleFont', 'animations', 'dlSounds', 'dlVideos', 'dlSpoken', 'dlPictures'].forEach((k) => store.set(k, draft[k]));
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
    show(Math.max(0, TABS.findIndex(([label]) => label === tab)));
    reveal(ov, section);
    refresh();
    okBtn.focus();
  }

  return { open };
})();
