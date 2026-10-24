# Encyclopedia 2000

[![Download for Windows, Mac, and Linux](https://img.shields.io/badge/Download-Windows%20%C2%B7%20Mac%20%C2%B7%20Linux-f5a623?style=for-the-badge)](https://encyclopedia2000.com/#download)
[![Join the Discord](https://img.shields.io/badge/Join%20the-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.encyclopedia2000.com)

A free desktop encyclopedia for Windows, Mac, and Linux, inspired by the CD-ROM reference software of the early 2000s and powered by today's Wikipedia. Articles, pictures, and history come live from Wikipedia, or from an offline library you download, so it works without an internet connection too.

**Version 0.5 is a public beta.** Your feedback shapes what comes next.

## Download

Get the newest version from [encyclopedia2000.com](https://encyclopedia2000.com/#download) or the [Releases page](https://github.com/sburton0/encyclopedia-2000/releases/latest). Choose **one** file for your computer:

| Computer | File | Notes |
| --- | --- | --- |
| **Windows** | **Encyclopedia-2000-Installer-….exe** | Recommended. Installs like a normal app, with Start menu and desktop shortcuts and **automatic updates**. Installs in a few seconds; no administrator rights needed. |
| Windows | **Encyclopedia-2000-Portable-….exe** | Nothing to install. Run it from any folder or a USB stick; it keeps its data in a folder next to itself. It tells you when a new version is out, but you download it yourself. |
| **Mac** | **Encyclopedia-2000-….dmg** | Open it and drag Encyclopedia 2000 to Applications. Updates automatically. For Apple Silicon and Intel Macs. (On version 0.4.1 or 0.4.2? Those can't update themselves, so download 0.5 once; updates are automatic again after that.) |
| **Linux** | **Encyclopedia-2000-…-linux-amd64.deb** | For Ubuntu, Debian, Linux Mint, and similar (64-bit). Open it with your software installer, or run `sudo apt install ./` followed by the file name. It tells you when a new version is out; install updates the same way with `sudo apt install`. |

Requires Windows 10 or 11 (64-bit), macOS 13 Ventura or later, or 64-bit Linux, and an internet connection or an offline library (2.7 GB to 127 GB of disk space, depending on the library). On Linux, Read Aloud needs text-to-speech voices; if none are installed, run `sudo apt install speech-dispatcher espeak-ng`.

## Feedback

Use **Help → Send Feedback** in the app, join the [Discord](https://discord.encyclopedia2000.com), or [send feedback without an account](https://docs.google.com/forms/d/e/1FAIpQLSfCzlaWDSgLJfiaTmDzbbJ9dW2yQLKUjwxtbEqByurrhiARYg/viewform).

## Privacy

Encyclopedia 2000 collects no personal information and has no ads or accounts. Your favorites, settings, game progress, and offline library stay on your computer. The app connects only to Wikipedia, Wikimedia Commons, Wikidata, and wikimedia.org to fetch what you ask for, to GitHub to check for updates (you can turn that off in Tools → Options → Privacy), and, only if you use the offline library, to Kiwix and its download mirrors. In **Offline mode** it loads nothing from the internet at all. Read the full [privacy policy](PRIVACY.md).

## Features

- **Offline Library** (Tools → Offline Library): download Wikipedia from [Kiwix](https://kiwix.org) and read, search, and explore without an internet connection. Choose the best 220,000 articles with pictures (7 GB) or text only (2.7 GB), or all of Wikipedia (53 GB text only, 127 GB with pictures). Downloads come through Kiwix's mirrors, are checked piece by piece, can be paused, and resume after the app closes. Save the library to any folder or drive; it can be moved later, and a library on a drive that's unplugged opens again by itself when the drive is back.
- **Online or Offline** (the light in the status bar): **Offline mode** loads nothing from the internet and reads everything from the library; **Use the offline library first** reads from the library even when online (faster, less data). If the internet drops, articles in the library keep working. Offline, the Home screen picks today's discovery and picture from the library, and the Almanac and Timeline use highlights that ship with the app.
- **Splash screen** with an animated bloom and a startup jingle synthesized live with the Web Audio API (no audio files). Click or press a key to skip.
- **Home screen**: Picture of the Day at the center, today's featured article, an almanac of events from this date, and the Explore shelf of sections.
- **Articles**: full Wikipedia articles restyled with a contents rail, related articles, lead picture, and quick facts from the infobox, at Wikipedia's reading width. Links open inside the app; external links open in your browser.
- **Videos and sounds**: articles play their videos and sounds on the page. The **Media box** in each article's rail shows every picture, video, and sound, with filters, and opens them in a full-size **viewer** with its own controls and credits. A 🔊 button by the title plays the name's pronunciation when Wikipedia has a recording.
- **Find in Article** (Ctrl+F) highlights every match on the page; **Help → Keyboard Shortcuts** (Ctrl+/) lists every shortcut.
- **Find**: suggestions as you type, full-text search results with "Did you mean…?" spelling suggestions, and a dropdown of recently viewed articles.
- **Media**: the Picture of the Day for the past week, Wikimedia Commons' **Media of the Day** (a video chosen each day), and **Featured Sounds**: famous speeches, historic recordings, and music.
- **Timeline**: highlights, events, births, deaths, and holidays for today's date.
- **Articles (Explore)**: eight random articles; shuffle for more.
- **Options** (Tools → Options…, or Ctrl+,): skip the startup screen or its sound, choose which page to start on, remember the window size, set the volume, click sounds, and Read Aloud voice and speed, change the text size and article font, choose metric or imperial units (the Solar System and World Explorer can also switch on their own), turn off animations, clear the recently viewed list, or reset everything.
- **Themes** (Tools → Themes): Bloom, Aurora, Sunset, CD-ROM, Ocean, Library, and Classic Gray. Each changes the colors, the Home screen artwork and Explore buttons, and the startup screen.
- **Volume** button at the right end of the toolbar: one setting for the startup sound, clicks, game sounds, and Read Aloud, with a mute button (also **View → Mute** or Ctrl+M). Scroll over the button to adjust it.
- **Print Preview** (the toolbar's Print button, File → Print Preview, or Ctrl+P): see the printed pages, choose paper size, orientation, and whether to include pictures, then print or save as PDF. File → Print… (Ctrl+Shift+P) goes straight to the print dialog.
- **Favorites** in a pane that opens over any screen (Ctrl+I), a **location bar** showing where you are, **Read Aloud** (using your computer's text-to-speech voices, or a Wikipedia volunteer's recorded narration when the article has one), text size, Back and Forward (also Alt+Left and Alt+Right, or mouse side buttons).
- **Games**: a games page with **Star Chart**, a trivia game. Light the stars of six topic constellations (History, Science, Geography, Nature, Arts, People) by answering questions generated live from Wikipedia, earn a medallion for each, then take on the Pole Star. Progress is saved.
- **World Explorer**: a clickable map of 237 countries and territories, with region filters, search, and Random Country. Each country's card shows its flag, capital, population, area, languages, currency, and government, live from Wikidata. Choosing a region shows its area, population, and a clickable list of its countries.
- **Activities**:
  - **Periodic Table**: all 118 elements, colored by family, with a details card for each.
  - **The Day You Were Born**: enter a birthday to see your age in days, the news that day, famous people who share the birthday, and other events on that date.
  - **The Solar System**: an animated model with the planets where they really are, and a fact card for the Sun and each planet.
  - **Lifelines**: famous lives side by side on one timeline, with ready-made sets or anyone you add; point at a year to see who was alive and how old they were.
  - **World Clock**: a world map with day and night following the Sun, and clocks for the cities you choose.
  - **Almanac Calendar**: a month of moon phases, sunrise and sunset, seasons, and daylight saving changes for any city, with Wikipedia's "On this day" for each date.

## What's next

Planned for future versions:

- **Reading:** saved articles, a full history of visited articles, more languages, notes and favorites folders, and search improvements
- **Offline:** opening a library file directly (for a library on a USB stick), and every game and activity working offline
- **Look and feel:** a refreshed toolbar, a new Nebula theme, and a new logo
- **Content:** more games and activities, and better Star Chart questions
- **Platforms:** accessibility improvements, the Microsoft Store, and Flathub for Linux

## Building from source

Requires [Node.js](https://nodejs.org/) 20 or later.

```
npm run setup
npm start
```

`npm run setup` installs Electron and downloads its runtime. After that, `npm start` is all you need.

To launch it like a regular program, run `npm run shortcut` once. It adds **Encyclopedia 2000** to the Start menu with its icon; right-click it there and choose **Pin to taskbar**. If you move the project folder, run it again.

To build the Windows installer and portable version, run `npm run dist`; the files appear in `dist/`. On a Mac, `npm run dist:mac` builds the macOS disk image (for Apple Silicon and Intel), and `npm run dist:linux` builds the Linux .deb package on a Mac or Linux. The `release`, `release:mac`, and `release:linux` scripts build and publish to a GitHub release (they need a `GH_TOKEN`).

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
| `src/wiki.js` | Wikipedia REST API client, and the offline library's articles, search, and daily picks |
| `library.js` | The offline library in the main process: Kiwix's catalog, downloads through mirrors, moving, and serving the library at `e2k-zim://` |
| `zim-reader.js` | Reads Kiwix library files (ZIM) in plain JavaScript |
| `src/library-ui.js` | The Offline Library window (Tools → Offline Library) |
| `src/kinds.js` | Picks an icon for search results without a picture (person, place, team, film, music) |
| `src/activities/` | The activities (Periodic Table, The Day You Were Born, Solar System, Lifelines, World Clock, Almanac Calendar) |
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

Encyclopedia 2000 is free software, licensed under the [GNU General Public License v3.0 or later](LICENSE). You can use, study, share, and change it; if you distribute a modified version, you must share its source code under the same license.

The "Encyclopedia 2000" name and the Book in Bloom icon are not covered by the license; see [TRADEMARKS.md](TRADEMARKS.md). Forks are welcome under their own name and icon.

## Content and licensing

Article text comes from Wikipedia under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every article page credits and links its source. Pictures come from Wikimedia Commons under their own licenses, shown on the Media page. Offline libraries are made by [Kiwix](https://kiwix.org), a nonprofit that packages Wikipedia for offline use, and their articles are under CC BY-SA too. Encyclopedia 2000 is an independent project and isn't affiliated with the Wikimedia Foundation, Kiwix, or Microsoft.

## Development tips

- **F12** opens the developer tools.
- Set `E2K_ROUTE` to open straight to a view without the splash, for example `article/Apollo%2011`, `search/moon`, `gallery`, `onthisday`, or `explore`.
- Set `E2K_PROFILE` to a folder to run with a separate profile, so tests don't touch your real favorites or game progress.
- Set `E2K_ZIM` to a Kiwix library file to open it instead of the installed library, or `E2K_LIBRARY_TEST=1` to add a tiny test library (3 MB) to the Offline Library window (or a catalog name, such as `wikipedia_en_physics`).
- Set `E2K_CAPTURE=shot.png` (plus `E2K_DELAY` in ms, and `E2K_CAPTURE_WIN=splash` for the splash) to save a screenshot and quit. `E2K_MUTE=1` silences the jingle.
