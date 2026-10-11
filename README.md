# Encyclopedia 2000

A nostalgic, early-2000s style desktop encyclopedia for Windows. Articles, pictures, and history come live from Wikipedia.

## Running it

Requires [Node.js](https://nodejs.org/) 20 or later.

```
npm run setup
npm start
```

`npm run setup` installs Electron and downloads its runtime. After that, `npm start` is all you need.

To launch it like a regular program, run `npm run shortcut` once. It adds **Encyclopedia 2000** to the Start menu with its icon; right-click it there and choose **Pin to taskbar**. If you move the project folder, run it again.

The app icon lives in `src/icon.svg` (detailed) and `src/icon-small.svg` (simplified for 16 to 24 px). After editing either one, run `npm run icons` to rebuild `build/icon.ico` and the PNG sizes.

The World Explorer map lives in `src/world/map-data.js`, generated from Natural Earth country shapes (public domain) and Wikidata (CC0). Run `npm run map` to rebuild it; it needs an internet connection.

## What's in the demo

- **Splash screen** with an animated bloom and a startup jingle synthesized live with the Web Audio API (no audio files). Click or press a key to skip.
- **Home screen**: Picture of the Day at the center, sections orbiting it, today's featured article, and an almanac of events from this date.
- **Articles**: full Wikipedia articles restyled with a contents rail, related articles, lead picture, and quick facts from the infobox. Links open inside the app; external links open in your browser.
- **Find**: suggestions as you type, full-text search results, and a dropdown of recently viewed articles.
- **Media**: the Picture of the Day for the past week.
- **Timeline**: highlights, events, births, deaths, and holidays for today's date.
- **Articles (Explore)**: eight random articles; shuffle for more.
- **Options** (Tools → Options…, or Ctrl+,): skip the startup screen or its sound, choose which page to start on, remember the window size, set the volume, click sounds, and Read Aloud voice and speed, change the text size and article font, turn off animations, clear the recently viewed list, or reset everything.
- **Volume** button at the right end of the toolbar: one setting for the startup sound, clicks, game sounds, and Read Aloud, with a mute button (also **View → Mute** or Ctrl+M). Scroll over the button to adjust it.
- **Print Preview** (the toolbar's Print button, File → Print Preview, or Ctrl+P): see the printed pages, choose paper size, orientation, and whether to include pictures, then print or save as PDF. File → Print… (Ctrl+Shift+P) goes straight to the print dialog.
- **Favorites**, **Read Aloud** (Windows text-to-speech), text size, Back and Forward (also Alt+Left and Alt+Right, or mouse side buttons).
- **Games**: a games page with **Star Chart**, a trivia game. Light the stars of six topic constellations (History, Science, Geography, Nature, Arts, People) by answering questions generated live from Wikipedia, earn a medallion for each, then take on the Pole Star. Progress is saved.
- **World Explorer**: a clickable map of 237 countries and territories, with region filters, search, and Random Country. Each country's card shows its flag, capital, population, area, languages, currency, and government, live from Wikidata.

## Project layout

| Path | Purpose |
| --- | --- |
| `main.js` | Electron main process: splash and main windows, window controls, link safety |
| `preload.js` | The small, safe bridge the pages use to talk to the main process |
| `src/index.html`, `src/styles.css`, `src/app.js` | The main window: chrome, menus, toolbar, and every view |
| `src/splash.*` | The splash screen |
| `src/preview.*` | The Print Preview window |
| `src/options.js` | The Options dialog (Tools → Options) |
| `src/audio.js` | Synthesized startup jingle (pad, birdsong, and flute), click sounds, and game sounds |
| `src/wiki.js` | Wikipedia REST API client |
| `src/bloom.js` | Draws the bloom artwork |
| `src/trivia.js` | Question engine shared by all games: topics, subject lists, question types |
| `src/games/registry.js` | Where games register themselves |
| `src/games/starchart.js`, `src/games/games.css` | The Star Chart game and the games styles |
| `mockups/` | Design mockups from each round (`all-options.html` shows them all) |

## Adding a game

1. Create `src/games/<name>.js` and call `E2KGames.register({ id, name, blurb, mount, art, progress })`. See the comment in `src/games/registry.js` for what each field does.
2. Add a `<script>` tag for it in `src/index.html` after `games/registry.js`.
3. In `mount(root, api)`, draw into `root` and return a cleanup function. `api` (window.E2K) gives you DOM helpers, saved storage, sounds, dialogs, and `openArticle`. `E2KTrivia.make(topicId)` returns a ready-made multiple-choice question.

The game then appears on the Games page automatically, and its route is `game/<id>`.

## License

The code is released under the [MIT License](LICENSE). The "Encyclopedia 2000" name and the Book in Bloom icon are not covered by it; see [TRADEMARKS.md](TRADEMARKS.md). Forks are welcome under their own name and icon.

## Content and licensing

Article text comes from Wikipedia under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every article page credits and links its source. Pictures come from Wikimedia Commons under their own licenses, shown on the Media page. Encyclopedia 2000 is an independent project and isn't affiliated with the Wikimedia Foundation or Microsoft.

## Development tips

- **F12** opens the developer tools.
- Set `E2K_ROUTE` to open straight to a view without the splash, for example `article/Apollo%2011`, `search/moon`, `gallery`, `onthisday`, or `explore`.
- Set `E2K_PROFILE` to a folder to run with a separate profile, so tests don't touch your real favorites or game progress.
- Set `E2K_CAPTURE=shot.png` (plus `E2K_DELAY` in ms, and `E2K_CAPTURE_WIN=splash` for the splash) to save a screenshot and quit. `E2K_MUTE=1` silences the jingle.
