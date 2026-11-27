// Errors: moved out of app.js, which gives it its helpers (see "parts" there).
window.E2KParts = window.E2KParts || {};
E2KParts['errors'] = (A) => {
  'use strict';
  const { h } = A;
  const { route, setIdle, isOffline, go, reload, mount, live, shell, bandBtn, setOffline, libChanged } = A.fn;

  // The library can't be found (its drive was disconnected, or it was moved or deleted): where it was, and what to do.
  const missingBox = () => h('div', { class: 'errbox' },
    h('b', {}, 'Your offline library can’t be found'),
    `${A.libMissing.label} isn’t in ${A.libMissing.where}. If it’s on a drive that was disconnected, reconnect it and the library will open again on its own. You can also find it or download it again in ${A.TOOLS} Offline Library.`,
    h('div', {}, bandBtn('Offline Library…', () => E2KLibrary.open(A.E2K)), navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null));
  function showError(err, name, arg, token) {
    if (isOffline()) {
      // First, whether the library itself just went missing (its drive was disconnected, say).
      window.e2k.library.state().then(libChanged, () => {}).finally(() => { if (live(token)) offlineError(err, arg, token); });
      return;
    }
    onlineError(err, name, arg, token);
  }
  function offlineError(err, arg, token) {
    // Media's pictures offline, with a library that has none (a text-only library).
    if (err.noPictures && A.hasLib) {
      const pg = shell({ title: 'Picture of the Day', railTitle: '', wide: true });
      pg.text.append(h('div', { class: 'errbox' },
        h('b', {}, 'Your offline library has no pictures'),
        `Text-only libraries leave out pictures to save space. The Picture of the Day comes back when you’re online, or with a library that includes pictures (${A.TOOLS} Offline Library).`,
        h('div', {}, navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null)));
      mount(pg.root, token);
      setIdle('Offline mode');
      return;
    }
    if (A.libMissing) {
      const pg = shell({ title: 'Offline library not found', railTitle: '', wide: true });
      pg.text.append(missingBox());
      mount(pg.root, token);
      setIdle('Offline mode');
      return;
    }
    // Offline mode: the page needs the internet, or the article isn't in the library. For a missing article, related
    // ones that are in the library follow (see relatedInLibrary).
    const onlyDownloads = !A.hasLib && A.hasDownloads;
    const pg = shell({ title: !err.notInLibrary ? 'Offline mode' : onlyDownloads ? 'Not downloaded' : 'Not in the offline library', railTitle: '', wide: true });
    const related = h('p', { class: 'inlib', hidden: true });
    pg.text.append(h('div', { class: 'errbox' },
      h('b', {}, !err.notInLibrary ? 'This page needs the internet' : onlyDownloads ? `“${arg}” isn’t downloaded` : `“${arg}” isn’t in the offline library`),
      onlyDownloads ? 'You’re in Offline mode, so only the articles you’ve downloaded are available.'
        : A.hasDownloads ? 'You’re in Offline mode, so only the offline library and the articles you’ve downloaded are available.'
          : 'You’re in Offline mode, so only the offline library is available.',
      related,
      h('div', {}, navigator.onLine ? bandBtn('Go online', () => setOffline(false)) : null)));
    mount(pg.root, token);
    setIdle('Offline mode');
    if (err.notInLibrary && A.hasLib) relatedInLibrary(arg).then((titles) => {
      if (!titles.length || !live(token)) return;
      related.append(h('b', {}, 'In your library:'), ' ', ...titles.flatMap((t, i) => [i ? ' · ' : null,
        h('a', { href: '#', 'data-title': t }, t)]).filter(Boolean));
      related.hidden = false;
    });
  }
  // Up to four articles in the library related to a title that isn't: the library's titles starting with shorter and
  // shorter versions of it ("Apollo 11 lunar sample display" → "Apollo 11 lunar sample" → … → "Apollo 11").
  async function relatedInLibrary(title) {
    const words = String(title).split(/\s+/), found = [];
    for (let n = words.length - 1; n >= 1 && found.length < 4; n--) {
      const hits = await window.e2k.library.titles(words.slice(0, n).join(' '), 6).catch(() => []);
      for (const hit of hits) if (!found.includes(hit.title) && hit.title.toLowerCase() !== title.toLowerCase() && found.length < 4) found.push(hit.title);
    }
    return found;
  }
  function onlineError(err, name, arg, token) {
    const offline = !Wiki.connected();
    const notFound = err.status === 404;
    const pg = shell({ title: notFound ? 'Article not found' : 'Something went wrong', railTitle: '', wide: true });
    pg.text.append(h('div', { class: 'errbox' },
      h('b', {}, offline ? 'You’re offline' : notFound ? `There’s no article called “${arg}”` : 'This page couldn’t be loaded'),
      offline ? 'Encyclopedia 2000 retrieves its articles from Wikipedia, so it needs an internet connection.'
        : notFound ? 'Try searching for it instead.' : `Wikipedia didn’t respond as expected (${err.message}).`,
      h('div', {}, notFound
        ? bandBtn(`Search for “${arg}”`, () => go(route('search', arg), { replace: true }))
        : bandBtn('Try again', () => reload()))));
    mount(pg.root, token);
    setIdle(offline ? 'Offline' : 'Error: ' + err.message);
  }

  return { showError, relatedInLibrary };
};
