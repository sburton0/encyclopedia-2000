# The Flatpak (Flathub)

App id `com.encyclopedia2000.Encyclopedia2000`. The manifest repackages the released .deb on Flathub's Electron base
app; the app sees `FLATPAK_ID` and leaves updates to Flatpak (`system-update.js`): Check for Updates says updates come
from the computer, and when Flatpak installs a newer version while the app is open, the status bar offers Restart Now
(the newest version is found and started through Flatpak's portal).

Files: the manifest (`.yml`), the launcher (`encyclopedia-2000.sh`, through zypak), the desktop file, and the AppStream
metainfo (Flathub's page: description, screenshots from encyclopedia2000.com/images, releases).

## At each release

1. In the manifest, set the .deb's `url` to the new release and its `sha256` (`sha256sum` of the .deb).
2. In the metainfo, add a `<release version="…" date="…">` at the top of `<releases>`.
3. On Flathub (once it's listed): the same two changes as a pull request to github.com/flathub/com.encyclopedia2000.Encyclopedia2000.
   Flathub builds it, and copies update within a day or so.

## First submission to Flathub (after 0.6.1 is released)

- Fill in the real 0.6.1 url, sha256 and release date.
- Check the content rating (`content_rating`): articles come from Wikipedia, so Flathub may ask for more than "none".
- Run Flathub's linter: `flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest com.encyclopedia2000.Encyclopedia2000.yml`
  and `… appstream com.encyclopedia2000.Encyclopedia2000.metainfo.xml`.
- Submit through github.com/flathub/flathub (a pull request to its `new-pr` branch), following its current instructions.
- Verify the app on Flathub with the website: Flathub gives a token to put at
  `https://encyclopedia2000.com/.well-known/org.flathub.VerifiedApps.txt`.

## Testing

`tools/lab/flatpak/run.sh` on the Linux lab machine: builds 0.6.1 from a test .deb, opens it, has Flatpak update it to
0.6.2 underneath it, checks the messages, then presses Restart Now (8 checks; passed 2026-11-20 on Mint 22.3).
