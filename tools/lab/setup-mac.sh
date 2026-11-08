#!/bin/bash
# Sets up a Mac (macOS Sonoma, here through OpenCore Legacy Patcher) as the lab's Mac test computer ("e2k-mac"); see
# mockups/lab/test-lab-plan.md. Run it signed in as "e2k", in Terminal on the Mac itself (not over SSH), from the setup
# stick made by make-setup-stick.ps1 on the PC:   bash setup-mac.sh        (or "bash setup-mac.sh --check")
# It asks for e2k's password (for sudo, and for automatic sign-in), then goes through each step, skipping what's
# already done, so it can be run again at any time. macOS keeps some choices for a person to click (letting RustDesk
# see and control the screen, Remote Login if a script may not turn it on); for those it opens the right settings page,
# says what to click, and waits.
#
# Written for the bash 3.2 that comes with macOS, and needs nothing installed first.
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$HOME/.local/state/e2k-lab"; mkdir -p "$STATE"

# --- Settings (lab-settings.json beside this script, or in the app's code) ------------------------------------------
SETTINGS=""
for f in "$HERE/lab-settings.json" "$HOME/e2k/tools/lab/lab-settings.json"; do [ -z "$SETTINGS" ] && [ -f "$f" ] && SETTINGS="$f"; done
[ -n "$SETTINGS" ] || { echo "lab-settings.json is missing: make the setup stick again with make-setup-stick.ps1."; exit 1; }
setting() { plutil -extract "$1" raw -o - "$SETTINGS"; }
ACCOUNT="$(setting account)"; NAME="$(setting machines.darwin)"; REPO_URL="$(setting repo)"
W="$(setting screen.width)"; H="$(setting screen.height)"
MAIN="$(setting stick.main)"; FAT="$(setting stick.fat32)"; FATGB="$(setting stick.fat32SizeGB)"
REPO="$HOME/e2k"
[ "$(id -un)" = "$ACCOUNT" ] || { echo "Sign in as \"$ACCOUNT\" and run this again (signed in as \"$(id -un)\")."; exit 1; }

say()  { printf '%s\n' "$*"; }
note() { printf '          %s\n' "$*"; }
wait_enter() { local x; read -rp "          Press Enter when that's done: " x; }
PW=""
ask_password() {   # e2k's password, checked, kept only in memory while this runs
  [ -n "$PW" ] && return 0
  local i
  for i in 1 2 3; do
    read -rsp "The password of $ACCOUNT (not shown or saved in a file): " PW; echo
    dscl . -authonly "$ACCOUNT" "$PW" >/dev/null 2>&1 && return 0
    say "  That password was not accepted. Try again."; PW=""
  done
  return 1
}

# --- The steps: NAME, a test (is it done?) and a way to do it --------------------------------------------------------
# A do_ function may set RESULT to "restart" (done, after a restart) or "later: <why>" (can't be done yet).
STEPS=()
step() { STEPS+=("$1|$2|$3"); }

t_sudo() { sudo -n -k true 2>/dev/null; }   # -k: not fooled by a password typed in the last few minutes
d_sudo() {
  echo "$ACCOUNT ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/e2k-lab >/dev/null &&
  sudo chmod 440 /etc/sudoers.d/e2k-lab && sudo visudo -cf /etc/sudoers.d/e2k-lab >/dev/null ||
  { sudo rm -f /etc/sudoers.d/e2k-lab; return 1; }
}
step "Admin commands without a password prompt (for remote jobs)" t_sudo d_sudo

t_name() { [ "$(scutil --get LocalHostName 2>/dev/null)" = "$NAME" ] && [ "$(scutil --get ComputerName 2>/dev/null)" = "$NAME" ]; }
d_name() { sudo scutil --set ComputerName "$NAME" && sudo scutil --set LocalHostName "$NAME" && sudo scutil --set HostName "$NAME"; }
step "Machine named $NAME" t_name d_name

t_login() {
  [ "$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" = "$ACCOUNT" ] && [ -f /etc/kcpassword ] &&
  sysadminctl -screenLock status 2>&1 | grep -qi 'off'
}
d_login() {
  if [ "$(fdesetup isactive 2>/dev/null)" = "true" ]; then
    open "x-apple.systempreferences:com.apple.preference.security?FileVault"
    RESULT="later: turn off FileVault (System Settings > Privacy & Security > FileVault; it takes a while), then run this again"; return 0
  fi
  ask_password || { RESULT="later: the password was not accepted"; return 0; }
  # macOS's automatic sign-in: the account in loginwindow's settings, its password lightly encoded in /etc/kcpassword.
  E2K_PW="$PW" perl -e '
    my @k = (125, 137, 82, 35, 210, 188, 221, 234, 163, 185, 31);
    my $p = $ENV{E2K_PW}; my $n = (int(length($p) / 12) + 1) * 12; my $o = "";
    for my $i (0 .. $n - 1) { my $c = $i < length($p) ? ord(substr($p, $i, 1)) : 0; $o .= chr($c ^ $k[$i % 11]); }
    print $o;' | sudo tee /etc/kcpassword >/dev/null &&
  sudo chown root:wheel /etc/kcpassword && sudo chmod 600 /etc/kcpassword &&
  sudo defaults write /Library/Preferences/com.apple.loginwindow autoLoginUser "$ACCOUNT" &&
  sysadminctl -screenLock off -password "$PW" >/dev/null 2>&1   # no password after sleep or the screensaver
}
step "Signs in as $ACCOUNT automatically; no password after sleep or the screensaver" t_login d_login

t_sleep() {
  pmset -g custom 2>/dev/null | awk '/AC Power/{a=1} a && $1=="sleep"{print $2; exit}' | grep -qx 0 &&
  [ "$(defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null)" = "0" ]
}
d_sleep() {
  sudo pmset -a sleep 0 disksleep 0 displaysleep 30 powernap 0 standby 0 autorestart 1 womp 1 &&
  defaults -currentHost write com.apple.screensaver idleTime -int 0
}
step "Never sleeps, no screensaver (the display turns off after 30 minutes; starts again after a power cut)" t_sleep d_sleep

SU=/Library/Preferences/com.apple.SoftwareUpdate
t_updates() {
  [ "$(defaults read $SU AutomaticallyInstallMacOSUpdates 2>/dev/null)" = "0" ] && [ "$(defaults read $SU AutomaticDownload 2>/dev/null)" = "0" ]
}
d_updates() {
  sudo defaults write $SU AutomaticallyInstallMacOSUpdates -bool false &&
  sudo defaults write $SU AutomaticDownload -bool false &&
  sudo defaults write $SU CriticalUpdateInstall -bool true   # security data files still update
}
step "macOS updates only by hand (an update can undo OpenCore Legacy Patcher's patches)" t_updates d_updates

t_spotlight() { mdutil -s / 2>/dev/null | grep -q 'disabled'; }
d_spotlight() { sudo mdutil -a -i off >/dev/null; }
step "Spotlight indexing off (on an old Mac it slows test runs and makes their timings uneven)" t_spotlight d_spotlight

t_clt() { xcode-select -p >/dev/null 2>&1 && [ -x /usr/bin/git ] && /usr/bin/git --version >/dev/null 2>&1; }
d_clt() {
  note "Installing Apple's Command Line Tools (Git and more) through Software Update: often 5-15 minutes"
  local flag=/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress label
  touch "$flag"
  label=$(softwareupdate -l 2>/dev/null | sed -n 's/^\* Label: \(Command Line Tools.*\)$/\1/p' | sort -V | tail -1)
  if [ -z "$label" ]; then rm -f "$flag"; xcode-select --install 2>/dev/null
    RESULT="later: click Install in the window that opened, then run this again"; return 0; fi
  sudo softwareupdate -i "$label" --verbose; local r=$?; rm -f "$flag"; return $r
}
step "Apple's Command Line Tools (Git)" t_clt d_clt

t_node() { [ -x /usr/local/bin/node ] && [ "$(/usr/local/bin/node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; }
d_node() {
  local ver f tmp
  ver=$(curl -fsSL https://nodejs.org/dist/index.json |
    perl -ne 'if (/"version":"(v[\d.]+)"[^}]*"lts":"/) { print $1; exit }') || return 1
  [ -n "$ver" ] || { say "  Couldn't find the current Node.js version"; return 1; }
  f="node-$ver-darwin-x64.tar.gz"; tmp=$(mktemp -d)
  note "Downloading $f from nodejs.org"
  curl -fsSL -o "$tmp/$f" "https://nodejs.org/dist/$ver/$f" && curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$ver/SHASUMS256.txt" &&
  (cd "$tmp" && grep "  $f\$" SHASUMS256.txt | shasum -a 256 -c -s -) || { rm -rf "$tmp"; say "  Node.js download or checksum failed"; return 1; }
  sudo mkdir -p /usr/local && sudo tar -xzf "$tmp/$f" -C /usr/local --strip-components 1 --exclude CHANGELOG.md --exclude README.md --exclude LICENSE
  local r=$?; rm -rf "$tmp"; hash -r; return $r
}
step "Node.js (current long-term version, from nodejs.org)" t_node d_node
export PATH="/usr/local/bin:$PATH"

# Remote Login (SSH). macOS may refuse to let a script turn it on (it needs Full Disk Access); then it's one switch.
SSHD_CONF=/etc/ssh/sshd_config.d/10-e2k-lab.conf   # read before macOS's own 100-macos.conf, so these win
t_ssh() { grep -qs 'e2k-lab' "$HOME/.ssh/authorized_keys" && [ -f "$SSHD_CONF" ] && nc -z -G 2 127.0.0.1 22 >/dev/null 2>&1; }
d_ssh() {
  local key=""
  [ -f "$HERE/e2k-lab-key.pub" ] && key="$(tr -d '\r' < "$HERE/e2k-lab-key.pub" | head -1)"
  [ -n "$key" ] || read -rp "The PC's public key (one line, from make-setup-stick.ps1): " key
  local re='^ssh-(ed25519|rsa) [^ ]+ e2k-lab'
  [[ "$key" =~ $re ]] || { RESULT="later: no valid PC key (e2k-lab-key.pub on the setup stick)"; return 0; }
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  grep -qsF "$key" "$HOME/.ssh/authorized_keys" || echo "$key" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\n' | sudo tee "$SSHD_CONF" >/dev/null
  if ! nc -z -G 2 127.0.0.1 22 >/dev/null 2>&1; then
    sudo systemsetup -f -setremotelogin on >/dev/null 2>&1 || true
    sleep 2
  fi
  if ! nc -z -G 2 127.0.0.1 22 >/dev/null 2>&1; then
    open "x-apple.systempreferences:com.apple.Sharing-Settings.extension"
    note "In the Sharing settings that opened, turn on Remote Login (\"Allow access for: Only these users\" with e2k is fine)."
    wait_enter
  fi
  nc -z -G 2 127.0.0.1 22 >/dev/null 2>&1 || { RESULT="later: Remote Login is still off"; return 0; }
}
step "SSH (Remote Login): on, only the PC's key" t_ssh d_ssh

# RustDesk isn't in the App Store: its own GitHub release, checked against GitHub's published checksum.
RD=/Applications/RustDesk.app
t_rd() { [ -d "$RD" ]; }
d_rd() {
  local info url name sum tmp mnt
  info=$(curl -fsSL -H 'User-Agent: e2k-lab-setup' https://api.github.com/repos/rustdesk/rustdesk/releases/latest |
    perl -0777 -ne 'while (/"name":\s*"(rustdesk-[\d.]+-x86_64\.dmg)".*?"digest":\s*"sha256:([0-9a-f]+)".*?"browser_download_url":\s*"([^"]+)"/sg) { print "$3 $1 $2"; exit }') || return 1
  read -r url name sum <<<"$info"
  [ -n "$url" ] && [ -n "$sum" ] || { RESULT="later: couldn't find the Mac download (with its checksum) in the latest RustDesk release"; return 0; }
  tmp=$(mktemp -d); note "Downloading $name from github.com/rustdesk/rustdesk"
  curl -fsSL -o "$tmp/$name" "$url" && echo "$sum  $tmp/$name" | shasum -a 256 -c -s - || { rm -rf "$tmp"; say "  RustDesk download or checksum failed"; return 1; }
  mnt="$tmp/mnt"; mkdir -p "$mnt"
  hdiutil attach -nobrowse -quiet -mountpoint "$mnt" "$tmp/$name" && sudo cp -R "$mnt/RustDesk.app" /Applications/ ; local r=$?
  hdiutil detach -quiet "$mnt" 2>/dev/null; rm -rf "$tmp"; return $r
}
step "RustDesk installed (from its GitHub release)" t_rd d_rd

# Letting RustDesk see and control the screen, and its settings, are clicks macOS keeps for a person.
t_rdset() { [ -f "$STATE/rustdesk-set-up" ]; }
d_rdset() {
  [ -d "$RD" ] || { RESULT="later: needs RustDesk"; return 0; }
  open -a "$RD"; sleep 3
  note "RustDesk is open. In it:"
  note " 1. Follow its prompts to allow Screen Recording and Accessibility (and Input Monitoring if asked),"
  note "    switching each on in System Settings > Privacy & Security. Reopen RustDesk if it asks."
  note " 2. If it offers to install or start its service, do (it asks for e2k's password)."
  note " 3. Settings (the ... next to your ID) > Security > Unlock security settings, then:"
  note "    - Password: \"Use permanent password\", set one (at least 8 characters); you type it when connecting"
  note "    - \"Accept sessions via password\""
  note "    - tick \"Enable direct IP access\""
  note "    - leave \"Lock after session end\" unticked"
  wait_enter
  touch "$STATE/rustdesk-set-up"
}
step "RustDesk: allowed to see and control the screen; permanent password, direct connections" t_rdset d_rdset

t_screen() { system_profiler SPDisplaysDataType 2>/dev/null | grep -qE "Resolution: ${W} x ${H}( |$)"; }
d_screen() {
  open "x-apple.systempreferences:com.apple.Displays-Settings.extension"
  RESULT="later: choose ${W} x ${H} in Displays (Show all resolutions), if the display offers it (is the HDMI dummy plug in?)"
}
step "Screen is ${W}x${H} (the desk monitor's size)" t_screen d_screen

t_repo() { [ -d "$REPO/.git" ]; }
d_repo() { t_clt || { RESULT="later: needs Git"; return 0; }; git clone "$REPO_URL" "$REPO"; }
step "The app's code in $REPO" t_repo d_repo

t_parts() { [ -d "$REPO/node_modules/electron/dist/Electron.app" ]; }
d_parts() {
  t_node || { RESULT="later: needs Node.js"; return 0; }
  [ -f "$REPO/package.json" ] || { RESULT="later: needs the app's code"; return 0; }
  (cd "$REPO" && npm ci && node node_modules/electron/install.js)
}
step "The app's parts (npm ci, Electron)" t_parts d_parts

t_quick() { [ -f "$STATE/quick-test-passed" ]; }
d_quick() {
  t_parts || { RESULT="later: needs the app's parts"; return 0; }
  (cd "$REPO" && node tools/test/run.js --only home) || { say "  The quick test failed: see the report in $REPO/tools/test/results"; return 1; }
  touch "$STATE/quick-test-passed"
}
step "A quick test passes (Home loads)" t_quick d_quick

AGENT_PLIST="$HOME/Library/LaunchAgents/com.encyclopedia2000.lab-agent.plist"
t_agent() { [ -f "$AGENT_PLIST" ]; }
d_agent() {
  [ -f "$REPO/tools/lab/agent.js" ] || { RESULT="later: the lab agent is not built yet; run this again once it is"; return 0; }
  mkdir -p "$(dirname "$AGENT_PLIST")"
  cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.encyclopedia2000.lab-agent</string>
  <key>ProgramArguments</key><array><string>/usr/local/bin/node</string><string>$REPO/tools/lab/agent.js</string></array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
EOF
  launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST" 2>/dev/null || launchctl load "$AGENT_PLIST"
}
step "The lab agent starts with the desktop" t_agent d_agent

t_stick() {
  diskutil info "/Volumes/$MAIN" 2>/dev/null | grep -q 'File System Personality: *ExFAT' &&
  diskutil info "/Volumes/$FAT" 2>/dev/null | grep -q 'File System Personality: *MS-DOS FAT32'
}
disk_of() { diskutil info "$1" 2>/dev/null | sed -n 's/^ *Part of Whole: *//p'; }   # the disk a volume is on
d_stick() {
  # Never the stick this script runs from, nor any holding the "E2K Lab Setup" folder, and only USB disks.
  local skip="" d v disks=""
  skip="$skip $(disk_of "$(df "$HERE" | awk 'NR==2{print $1}')")"
  for v in /Volumes/*; do [ -d "$v/E2K Lab Setup" ] && skip="$skip $(disk_of "$v")"; done
  for d in $(diskutil list external physical | sed -n 's|^/dev/\(disk[0-9]*\).*|\1|p'); do
    diskutil info "$d" | grep -q 'Protocol: *USB' || continue
    case " $skip " in *" $d "*) continue ;; esac
    disks="$disks $d"
  done
  disks=$(echo $disks)
  [ -n "$disks" ] || { RESULT="later: plug in a stick for testing (not the setup stick) and run this again"; return 0; }
  echo
  for d in $disks; do
    note "$d: $(diskutil info "$d" | sed -n 's/^ *Device \/ Media Name: *//p'), $(diskutil info "$d" | sed -n 's/^ *Disk Size: *\([^(]*\).*/\1/p' | xargs), now holding: $(diskutil list "$d" | awk 'NR>3{for(i=3;i<NF-2;i++) printf "%s ", $i; print ""}' | xargs)"
  done
  case "$disks" in *" "*) read -rp "          Which one becomes the test stick (for example disk4)? " d ;; *) d=$disks ;; esac
  case " $disks " in *" $d "*) ;; *) RESULT="later: no such disk"; return 0 ;; esac
  local bytes; bytes=$(diskutil info "$d" | sed -n 's/.*Disk Size:.*(\([0-9]*\) Bytes).*/\1/p')
  [ "${bytes:-0}" -ge 16000000000 ] || { RESULT="later: that stick is smaller than 16 GB"; return 0; }
  say "          Everything on $d will be erased."
  local ans; read -rp "          Type ERASE to format it, or press Enter to skip: " ans
  [ "$ans" = "ERASE" ] || { RESULT="later: skipped (nothing was changed)"; return 0; }
  sudo diskutil partitionDisk "$d" MBR "MS-DOS FAT32" "$FAT" "${FATGB}G" ExFAT "$MAIN" R || return 1
  for v in "/Volumes/$MAIN" "/Volumes/$FAT"; do sudo mdutil -i off -d "$v" >/dev/null 2>&1; done
  return 0
}
step "Test stick: $MAIN (exFAT) and $FAT (FAT32, $FATGB GB)" t_stick d_stick

# --- Run them --------------------------------------------------------------------------------------------------------
G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
echo; say "${C}Setting up $NAME$([ $CHECK = 1 ] && echo ' (check only: nothing is changed)')${N}"; echo
if [ $CHECK = 0 ] && ! t_sudo; then say "Your password (for admin commands; asked once):"; sudo -v || exit 1; fi
restart=0; left=0; failed=0
for s in "${STEPS[@]}"; do
  IFS='|' read -r name t d <<<"$s"
  if $t >/dev/null 2>&1; then say "  ${G}[ok]${N}    $name"; continue; fi
  if [ $CHECK = 1 ]; then say "  [to do] $name"; left=$((left+1)); continue; fi
  say "  ...     $name"; RESULT=""
  if $d; then
    case "$RESULT" in
      restart) restart=1; say "  ${G}[done]${N}  $name (after a restart)" ;;
      later:*) left=$((left+1)); say "  ${Y}[later]${N} $name: ${RESULT#later: }" ;;
      *) if $t >/dev/null 2>&1; then say "  ${G}[done]${N}  $name"; else restart=1; say "  ${G}[done]${N}  $name (may need a restart to show)"; fi ;;
    esac
  else failed=$((failed+1)); say "  ${R}[error]${N} $name"; fi
done
PW=""

echo
[ $failed -gt 0 ] && say "${R}$failed step(s) failed; fix them and run this again.${N}"
[ $left -gt 0 ] && say "${Y}$left step(s) still to do: run this again when they're ready.${N}"
[ $restart = 1 ] && say "${C}Restart the Mac (it signs in by itself), then run this again to confirm.${N}"
[ $failed = 0 ] && [ $left = 0 ] && [ $restart = 0 ] && say "${G}$NAME is ready.${N}"
# The address to reserve in the router, so it never changes.
dev=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
if [ -n "$dev" ]; then
  echo; say "${C}Reserve this machine's address in the router (http://192.168.1.254 > Home Network > IP Allocation):${N}"
  say "  Address: $(ipconfig getifaddr "$dev")   Network card ID: $(ifconfig "$dev" | awk '$1=="ether"{print $2; exit}')"
fi
echo
