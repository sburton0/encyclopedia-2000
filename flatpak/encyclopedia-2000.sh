#!/bin/sh
# Starts Encyclopedia 2000 inside the Flatpak; zypak gives Chromium's sandbox a way to work inside Flatpak's.
export TMPDIR="${XDG_RUNTIME_DIR}/app/${FLATPAK_ID}"
exec zypak-wrapper /app/main/encyclopedia-2000 "$@"
