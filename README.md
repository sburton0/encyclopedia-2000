# Encyclopedia 2000

A free desktop encyclopedia for Windows, inspired by the CD-ROM reference software of the early 2000s and powered by today's Wikipedia. Articles, pictures, and history come live from Wikipedia.

**Version 0.1 is a public beta.** Your feedback shapes what comes next.

## Download

Get the newest version from the [Releases page](https://github.com/sburton0/encyclopedia-2000/releases/latest). There are two versions; choose **one**:

| File | Choose this if… |
| --- | --- |
| **Encyclopedia-2000-Setup-….exe** | You want it installed like a normal app, with Start menu and desktop shortcuts and **automatic updates**. Installs in a few seconds; no administrator rights needed. |
| **Encyclopedia-2000-Portable-….exe** | You'd rather not install anything. Run it from any folder or a USB stick; it keeps its data in a folder next to itself. It tells you when a new version is out, but you download it yourself. |

Requires Windows 10 or 11 (64-bit) and an internet connection.

**"Windows protected your PC"?** Encyclopedia 2000 isn't code-signed yet, so Windows SmartScreen may warn you. Click **More info → Run anyway**.

## Feedback

Use **Help → Send Feedback** in the app, join the [Discord](https://discord.encyclopedia2000.com), or [send feedback without an account](https://docs.google.com/forms/d/e/1FAIpQLSfCzlaWDSgLJfiaTmDzbbJ9dW2yQLKUjwxtbEqByurrhiARYg/viewform).

## Privacy

Encyclopedia 2000 collects no personal information and has no ads or accounts. Your favorites, settings, and game progress stay on your computer. The app connects only to Wikipedia and Wikidata to fetch what you ask for, and to GitHub to check for updates (you can turn that off in Tools → Options → Privacy).

## Features

- **Splash screen** with an animated bloom and a startup jingle synthesized live with the Web Audio API (no audio files). Click or press a key to skip.
- **Home screen**: Picture of the Day at the center, today's featured article, an almanac of events from this date, and the Explore shelf of sections.
- **Articles**: full Wikipedia articles restyled with a contents rail, related articles, lead picture, and quick facts from the infobox. Links open inside the app; external links open in your browser.
- **Find**: suggestions as you type, full-text search results, and a dropdown of recently viewed articles.
- **Media**: the Picture of the Day for the past week.
- **Timeline**: highlights, events, births, deaths, and holidays for today's date.
- **Articles (Explore)**: eight random articles; shuffle for more.
- **Options** (Tools → Options…, or Ctrl+,): skip the startup screen or its sound, choose which page to start on, remember the window size, set the volume, click sounds, and Read Aloud voice and speed, change the text size and article font, turn off animations, clear the recently viewed list, or reset everything.
- **Volume** button at the right end of the toolbar: one setting for the startup sound, clicks, game sounds, and Read Aloud, with a mute button (also **View → Mute** or Ctrl+M). Scroll over the button to adjust it.
- **Print Preview** (the toolbar's Print button, File → Print Preview, or Ctrl+P): see the printed pages, choose paper size, orientation, and whether to include pictures, then print or save as PDF. File → Print… (Ctrl+Shift+P) goes straight to the print dialog.
- **Favorites** in a pane that opens over any screen (Ctrl+I), a **location bar** showing where you are, **Read Aloud** (Windows text-to-speech), text size, Back and Forward (also Alt+Left and Alt+Right, or mouse side buttons).
- **Games**: a games page with **Star Chart**, a trivia game. Light the stars of six topic constellations (History, Science, Geography, Nature, Arts, People) by answering questions generated live from Wikipedia, earn a medallion for each, then take on the Pole Star. Progress is saved.
- **World Explorer**: a clickable map of 237 countries and territories, with region filters, search, and Random Country. Each country's card shows its flag, capital, population, area, languages, currency, and government, live from Wikidata. Choosing a region shows its area, population, and a clickable list of its countries.
- **Activities**:
  - **Periodic Table**: all 118 elements, colored by family, with a details card for each.
  - **The Day You Were Born**: enter a birthday to see your age in days, the news that day, famous people who share the birthday, and other events on that date.
  - **The Solar System**: an animated model with the planets where they really are, and a fact card for the Sun and each planet.
  - **Lifelines**: famous lives side by side on one timeline, with ready-made sets or anyone you add; point at a year to see who was alive and how old they were.

## What's next

Planned for future versions:

- **Reading:** offline reading, more languages, a full history, notes and favorites folders, and search improvements
- **Look and sound:** themes, pronunciations and spoken articles, and videos in Media
- **Content:** more games and activities, and better Star Chart questions
- **Platforms:** accessibility improvements, macOS and Linux versions, and the Microsoft Store

## Building from source

Requires [Node.js](https://nodejs.org/) 20 or later.

```
npm run setup
npm start
```

`npm run setup` installs Electron and downloads its runtime. After that, `npm start` is all you need.

To launch it like a regular program, run `npm run shortcut` once. It adds **Encyclopedia 2000** to the Start menu with its icon; right-click it there and choose **Pin to taskbar**. If you move the project folder, run it again.

To build the Windows installer and portable version, run `npm run dist`; the files appear in `dist/`. `npm run release` builds them and publishes a GitHub release (it needs a `GH_TOKEN`).

The app icon lives in `src/icon.svg` (detailed) and `src/icon-small.svg` (simplified for 16 to 24 px). After editing either one, run `npm run icons` to rebuild `build/icon.ico` and the PNG sizes.

The World Explorer map lives in `src/world/map-data.js`, generated from Natural Earth country shapes (public domain) and Wikidata (CC0). Run `npm run map` to rebuild it; it needs an internet connection.

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
