// Keyboard shortcuts: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['shortcuts'] = (A) => {
  'use strict';
  const { $$, h } = A;
  const { keyText } = A.fn;

  // Help › Keyboard Shortcuts (Ctrl+/): every shortcut in groups, as keycaps. Listed the Windows way and turned into
  // the macOS keys there (⌘ for Ctrl, Cmd+[ for Back, and so on), the same as the menus.
  const SHORTCUTS = [
    [['Finding', [['Find in this article', 'Ctrl+F'], ['Find an article', 'Ctrl+E'], ['Next match', 'Enter'], ['Previous match', 'Shift+Enter']]],
      ['Moving around', [['Home', 'Ctrl+H'], ['Back', 'Alt+Left'], ['Forward', 'Alt+Right'], ['Top of the article', A.MAC ? 'Home' : 'Home or Ctrl+Home'], ['Refresh', 'F5']]],
      ['Going places', [['Browse', 'Ctrl+1'], ['Media', 'Ctrl+2'], ['Timeline', 'Ctrl+3'], ['World Explorer', 'Ctrl+4'], ['Activities', 'Ctrl+5'],
        ...(A.MAC ? [] : [['Menu bar', 'Alt or F10']])]],
      ['Reading', [['Larger text', 'Ctrl+='], ['Smaller text', 'Ctrl+-'], ['Normal text size', 'Ctrl+0'], ['Copy', 'Ctrl+C']]]],
    [['Printing', [['Print Preview', 'Ctrl+P'], ['Print', 'Ctrl+Shift+P']]],
      ['Offline', [['Offline Library', 'Ctrl+Shift+L'], ['Offline mode on or off', 'Ctrl+Shift+O']]],
      ['My Articles', [['My Articles pane', 'Ctrl+I'], ['Add to Favorites', 'Ctrl+D'], ['Manage favorites', 'Ctrl+B'], ['History', 'Ctrl+Y']]],
      ['Sound', [['Mute', 'Ctrl+M']]],
      ['Pictures and videos', [['Previous / next', 'Left or Right'], ['Play / pause', 'Space']]],
      ['Encyclopedia 2000', [['Options', 'Ctrl+,'], ['Keyboard shortcuts', 'Ctrl+/'], ['Close a window or menu', 'Esc'], A.MAC ? ['Quit', 'Cmd+Q'] : ['Exit', 'Alt+F4']]]],
  ];
  const CAP = { Left: '←', Right: '→', Cmd: A.MAC ? '⌘' : 'Cmd', Shift: A.MAC ? '⇧' : 'Shift', Alt: A.MAC ? '⌥' : 'Alt' };
  function shortcuts() {
    // On macOS a shortcut is written as one key cap the Mac way ("⇧⌘H"); elsewhere as keys joined by "+" ("Ctrl" + "H").
    const caps = (combo) => (A.MAC ? [h('kbd', {}, keyText(combo).replace(/^(.*?)(Left|Right)$/, (_, m, k) => m + CAP[k]))]
      : combo.split('+').flatMap((k, i) => [i ? h('span', { class: 'kplus' }, '+') : null, h('kbd', {}, CAP[k] || k)]).filter(Boolean));
    const row = ([label, combo]) => h('div', { class: 'kr' }, h('span', {}, label),
      h('span', {}, combo.split(' or ').flatMap((c, i) => [i ? h('span', { class: 'kplus' }, ' or ') : null, ...caps(c)]).filter(Boolean)));
    const cols = h('div', { class: 'kcols' }, SHORTCUTS.map((col) => h('div', {}, col.map(([title, rows]) => h('div', {}, h('h3', {}, title), rows.map(row))))));
    A.dialog('Keyboard Shortcuts', 'Keyboard shortcuts', [cols]);
    $$('.overlay .dialog').at(-1).classList.add('keys');
  }

  return { shortcuts };
};
