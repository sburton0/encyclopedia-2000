#!/usr/bin/env bash
# Sets up a Linux Mint Xfce machine as the lab's Linux test computer ("e2k-linux"); see mockups/lab/test-lab-plan.md.
# Run it signed in as "e2k", in a terminal on the desktop (not over SSH), from the setup stick made by
# make-setup-stick.ps1 on the PC:   bash setup-linux.sh        (or "bash setup-linux.sh --check" to change nothing)
# It asks for e2k's password once (for sudo), then goes through each step below, skipping what's already done, so it can
# be run again at any time.
#
# The steps: admin commands without a password prompt for e2k; the machine name; signing in automatically; never
# locking (no screensaver lock, no lock on wake, sleep turned off) and no welcome window; swap on a 4 GB machine; the
# tools (SSH, Git, Orca, exFAT and FAT tools, the firewall); Node.js (official, checksum checked); RustDesk (official,
# checksum checked) with a permanent password and direct connections; SSH that takes only the PC's key; a firewall that
# lets SSH, RustDesk and network names in from this network only; the screen resolution; the app's code and parts; one
# quick test; the lab agent; and formatting the test stick (only after you type ERASE).
set -u
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$HOME/.local/state/e2k-lab"; mkdir -p "$STATE"

# --- Settings (lab-settings.json beside this script, or in the app's code) ------------------------------------------
SETTINGS=""
for f in "$HERE/lab-settings.json" "$HOME/e2k/tools/lab/lab-settings.json"; do [ -z "$SETTINGS" ] && [ -f "$f" ] && SETTINGS="$f"; done
[ -n "$SETTINGS" ] || { echo "lab-settings.json is missing: make the setup stick again with make-setup-stick.ps1."; exit 1; }
setting() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); [d:=d[k] for k in sys.argv[2].split('.')]; print(d)" "$SETTINGS" "$1"; }
ACCOUNT="$(setting account)"; NAME="$(setting machines.linux)"; REPO_URL="$(setting repo)"
W="$(setting screen.width)"; H="$(setting screen.height)"
MAIN="$(setting stick.main)"; FAT="$(setting stick.fat32)"; FATGB="$(setting stick.fat32SizeGB)"
REPO="$HOME/e2k"
[ "$(id -un)" = "$ACCOUNT" ] || { echo "Sign in as \"$ACCOUNT\" and run this again (signed in as \"$(id -un)\")."; exit 1; }

say()  { printf '%s\n' "$*"; }
note() { printf '          %s\n' "$*"; }
lan_net() { ip -o -f inet addr show scope global | awk '{print $4; exit}' | python3 -c 'import ipaddress,sys; print(ipaddress.ip_interface(sys.stdin.read().strip()).network)'; }
has_pkg() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
xset_prop() { # channel property type value: set an Xfce setting, creating it if needed
  xfconf-query -c "$1" -p "$2" -s "$4" 2>/dev/null || xfconf-query -c "$1" -p "$2" -n -t "$3" -s "$4"; }
xget() { xfconf-query -c "$1" -p "$2" 2>/dev/null; }

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

t_name() { [ "$(hostname)" = "$NAME" ]; }
d_name() {
  sudo hostnamectl set-hostname "$NAME" &&
  if grep -q '^127\.0\.1\.1' /etc/hosts; then sudo sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$NAME/" /etc/hosts
  else echo -e "127.0.1.1\t$NAME" | sudo tee -a /etc/hosts >/dev/null; fi
}
step "Machine named $NAME" t_name d_name

t_login() { grep -rqs "^autologin-user=$ACCOUNT\$" /etc/lightdm/; }
d_login() {
  sudo mkdir -p /etc/lightdm/lightdm.conf.d &&
  printf '[Seat:*]\nautologin-user=%s\nautologin-user-timeout=0\n' "$ACCOUNT" | sudo tee /etc/lightdm/lightdm.conf.d/70-e2k-lab.conf >/dev/null
}
step "Signs in as $ACCOUNT automatically" t_login d_login

LL="$HOME/.config/autostart/light-locker.desktop"
t_lock() {
  [ "$(xget xfce4-screensaver /lock/enabled)" = "false" ] && [ "$(xget xfce4-screensaver /saver/enabled)" = "false" ] &&
  [ "$(xget xfce4-power-manager /xfce4-power-manager/lock-screen-suspend-hibernate)" = "false" ] &&
  { [ ! -f /etc/xdg/autostart/light-locker.desktop ] || grep -q '^Hidden=true' "$LL" 2>/dev/null; } &&
  [ "$(systemctl is-enabled sleep.target 2>/dev/null)" = "masked" ] && [ -f "$HOME/.linuxmint/mintwelcome/norun.flag" ]
}
d_lock() {
  command -v xfconf-query >/dev/null || { RESULT="later: run this in a terminal on the Xfce desktop"; return 0; }
  xset_prop xfce4-screensaver /saver/enabled bool false
  xset_prop xfce4-screensaver /lock/enabled bool false
  xset_prop xfce4-session /shutdown/LockScreen bool false
  local p=/xfce4-power-manager
  xset_prop xfce4-power-manager $p/lock-screen-suspend-hibernate bool false
  xset_prop xfce4-power-manager $p/inactivity-on-ac uint 14     # 14 is "Never" for sleeping
  xset_prop xfce4-power-manager $p/blank-on-ac int 0
  xset_prop xfce4-power-manager $p/dpms-enabled bool true
  xset_prop xfce4-power-manager $p/dpms-on-ac-sleep uint 0
  xset_prop xfce4-power-manager $p/dpms-on-ac-off uint 30       # the display turns off after 30 minutes, no lock
  if [ -f /etc/xdg/autostart/light-locker.desktop ]; then
    mkdir -p "$(dirname "$LL")"; printf '[Desktop Entry]\nHidden=true\n' > "$LL"; pkill -x light-locker || true
  fi
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1
  mkdir -p "$HOME/.linuxmint/mintwelcome" && touch "$HOME/.linuxmint/mintwelcome/norun.flag"
}
step "Never locks or sleeps (the display turns off after 30 minutes, no password); no welcome window" t_lock d_lock

t_swap() {
  local mem swap; mem=$(awk '/^MemTotal/{print $2}' /proc/meminfo); swap=$(awk '/^SwapTotal/{print $2}' /proc/meminfo)
  [ "$mem" -ge 6000000 ] || [ "$swap" -ge 4000000 ]
}
d_swap() {
  sudo fallocate -l 4G /swapfile-e2k && sudo chmod 600 /swapfile-e2k && sudo mkswap /swapfile-e2k >/dev/null &&
  sudo swapon /swapfile-e2k && { grep -q '^/swapfile-e2k ' /etc/fstab || echo '/swapfile-e2k none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null; }
}
step "4 GB of swap (this machine has under 6 GB of memory)" t_swap d_swap

PKGS="openssh-server git curl ufw orca exfatprogs dosfstools x11-xserver-utils python3"
t_pkgs() { for p in $PKGS; do has_pkg "$p" || return 1; done; }
d_pkgs() { sudo apt-get update -q && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q $PKGS; }
step "Tools installed (SSH, Git, Orca, exFAT and FAT tools, the firewall)" t_pkgs d_pkgs

t_node() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; }
d_node() {
  local ver f tmp
  ver=$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c 'import json,sys; print(next(r["version"] for r in json.load(sys.stdin) if r["lts"]))') || return 1
  f="node-$ver-linux-x64.tar.xz"; tmp=$(mktemp -d)
  note "Downloading $f from nodejs.org"
  curl -fsSL -o "$tmp/$f" "https://nodejs.org/dist/$ver/$f" && curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$ver/SHASUMS256.txt" &&
  (cd "$tmp" && grep "  $f\$" SHASUMS256.txt | sha256sum -c --quiet -) || { rm -rf "$tmp"; say "  Node.js download or checksum failed"; return 1; }
  sudo tar -xJf "$tmp/$f" -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=README.md --exclude=LICENSE
  rm -rf "$tmp"; hash -r
}
step "Node.js (current long-term version, from nodejs.org)" t_node d_node

# RustDesk isn't in Mint's software sources: its own GitHub release, checked against GitHub's published checksum.
t_rd() { has_pkg rustdesk; }
d_rd() {
  local info url sum name tmp
  info=$(curl -fsSL -H 'User-Agent: e2k-lab-setup' https://api.github.com/repos/rustdesk/rustdesk/releases/latest | python3 -c '
import json,re,sys
for a in json.load(sys.stdin)["assets"]:
    if re.match(r"^rustdesk-[\d.]+-x86_64\.deb$", a["name"]):
        print(a["browser_download_url"], a["name"], (a.get("digest") or "").replace("sha256:", "")); break') || return 1
  read -r url name sum <<<"$info"
  [ -n "${url:-}" ] || { RESULT="later: no Linux package in the latest RustDesk release"; return 0; }
  [ -n "${sum:-}" ] || { say "  GitHub gave no checksum for $name; not installed"; return 1; }
  tmp=$(mktemp -d); note "Downloading $name from github.com/rustdesk/rustdesk"
  curl -fsSL -o "$tmp/$name" "$url" && echo "$sum  $tmp/$name" | sha256sum -c --quiet - || { rm -rf "$tmp"; say "  RustDesk download or checksum failed"; return 1; }
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$tmp/$name"; local r=$?; rm -rf "$tmp"; return $r
}
step "RustDesk installed (from its GitHub release)" t_rd d_rd

t_rdpw() { [ -f "$STATE/rustdesk-password-set" ]; }
d_rdpw() {
  command -v rustdesk >/dev/null || { RESULT="later: needs RustDesk"; return 0; }
  local a b i
  for i in 1 2 3; do
    read -rsp "A permanent RustDesk password for this machine (you type it when connecting; at least 8 characters): " a; echo
    read -rsp "The same password again: " b; echo
    [ "$a" = "$b" ] && [ ${#a} -ge 8 ] && break
    say "  They did not match, or it was shorter than 8 characters. Try again."; a=""
    [ $i -eq 3 ] && { RESULT="later: the passwords did not match"; return 0; }
  done
  sudo systemctl enable --now rustdesk >/dev/null 2>&1
  sudo rustdesk --password "$a" >/dev/null 2>&1; a=""; b=""
  sudo rustdesk --option direct-server Y >/dev/null 2>&1        # connect by address on this network, no outside server
  sudo rustdesk --option approve-mode password >/dev/null 2>&1  # the password is enough; nobody needs to click Accept
  touch "$STATE/rustdesk-password-set"
}
step "RustDesk: permanent password, direct connections" t_rdpw d_rdpw

SSHD_CONF=/etc/ssh/sshd_config.d/10-e2k-lab.conf
t_ssh() { grep -qs 'e2k-lab' "$HOME/.ssh/authorized_keys" && [ -f "$SSHD_CONF" ] && systemctl is-enabled ssh >/dev/null 2>&1; }
d_ssh() {
  has_pkg openssh-server || { RESULT="later: needs the tools"; return 0; }
  local key=""
  [ -f "$HERE/e2k-lab-key.pub" ] && key="$(tr -d '\r' < "$HERE/e2k-lab-key.pub" | head -1)"
  [ -n "$key" ] || read -rp "The PC's public key (one line, from make-setup-stick.ps1): " key
  local re='^ssh-(ed25519|rsa) [^ ]+ e2k-lab'
  [[ "$key" =~ $re ]] || { RESULT="later: no valid PC key (e2k-lab-key.pub on the setup stick)"; return 0; }
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  grep -qsF "$key" "$HOME/.ssh/authorized_keys" || echo "$key" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
  # No passwords over the network (files in sshd_config.d are read first, so these win).
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\n' | sudo tee "$SSHD_CONF" >/dev/null
  sudo systemctl enable --now ssh >/dev/null 2>&1; sudo systemctl restart ssh
}
step "SSH: on, only the PC's key" t_ssh d_ssh

t_fw() {
  local s; s=$(sudo -n ufw status 2>/dev/null) || return 1
  grep -q 'Status: active' <<<"$s" && grep -q '^22/tcp' <<<"$s" && grep -q '^21118/tcp' <<<"$s" && grep -q '^5353/udp' <<<"$s"
}
d_fw() {
  has_pkg ufw || { RESULT="later: needs the tools"; return 0; }
  local net; net=$(lan_net) || { RESULT="later: not connected to a network"; return 0; }
  note "Letting in SSH, RustDesk and network names from $net only"
  sudo ufw default deny incoming >/dev/null && sudo ufw default allow outgoing >/dev/null &&
  sudo ufw allow from "$net" to any port 22 proto tcp >/dev/null &&
  sudo ufw allow from "$net" to any port 21118 proto tcp >/dev/null &&
  sudo ufw allow from "$net" to any port 5353 proto udp >/dev/null &&   # so "e2k-linux.local" is found
  sudo ufw --force enable >/dev/null
}
step "Firewall: SSH, RustDesk and network names only from this network" t_fw d_fw

SCREEN_AUTOSTART="$HOME/.config/autostart/e2k-screen.desktop"
screen_out() { xrandr --query 2>/dev/null | awk '/ connected/{print $1; exit}'; }
t_screen() { xrandr --query 2>/dev/null | grep -qE "^ +${W}x${H} .*\*" && [ -f "$SCREEN_AUTOSTART" ]; }
d_screen() {
  local out; out=$(screen_out)
  [ -n "$out" ] || { RESULT="later: run this in a terminal on the desktop"; return 0; }
  xrandr --query | sed -n "/^$out /,/^[^ ]/p" | grep -qE "^ +${W}x${H} " ||
    { RESULT="later: the display doesn't offer ${W}x${H} (is the HDMI dummy plug in?)"; return 0; }
  xrandr --output "$out" --mode "${W}x${H}" &&
  mkdir -p "$(dirname "$SCREEN_AUTOSTART")" &&
  printf '[Desktop Entry]\nType=Application\nName=E2K lab screen size\nExec=xrandr --output %s --mode %sx%s\n' "$out" "$W" "$H" > "$SCREEN_AUTOSTART"
}
step "Screen is ${W}x${H} (the desk monitor's size)" t_screen d_screen

t_repo() { [ -d "$REPO/.git" ]; }
d_repo() { command -v git >/dev/null || { RESULT="later: needs Git"; return 0; }; git clone "$REPO_URL" "$REPO"; }
step "The app's code in $REPO" t_repo d_repo

t_parts() { [ -x "$REPO/node_modules/electron/dist/electron" ]; }
d_parts() {
  t_node || { RESULT="later: needs Node.js"; return 0; }
  [ -f "$REPO/package.json" ] || { RESULT="later: needs the app's code"; return 0; }
  (cd "$REPO" && npm ci && node node_modules/electron/install.js)
}
step "The app's parts (npm ci, Electron)" t_parts d_parts

t_quick() { [ -f "$STATE/quick-test-passed" ]; }
d_quick() {
  t_parts || { RESULT="later: needs the app's parts"; return 0; }
  [ -n "${DISPLAY:-}" ] || { RESULT="later: run this in a terminal on the desktop"; return 0; }
  (cd "$REPO" && node tools/test/run.js --only home) || { say "  The quick test failed: see the report in $REPO/tools/test/results"; return 1; }
  touch "$STATE/quick-test-passed"
}
step "A quick test passes (Home loads)" t_quick d_quick

AGENT_AUTOSTART="$HOME/.config/autostart/e2k-lab-agent.desktop"
t_agent() { [ -f "$AGENT_AUTOSTART" ]; }
d_agent() {
  [ -f "$REPO/tools/lab/agent.js" ] || { RESULT="later: the lab agent is not built yet; run this again once it is"; return 0; }
  mkdir -p "$(dirname "$AGENT_AUTOSTART")"
  printf '[Desktop Entry]\nType=Application\nName=E2K lab agent\nExec=sh -c "cd %s && exec %s tools/lab/agent.js"\n' "$REPO" "$(command -v node)" > "$AGENT_AUTOSTART"
  (cd "$REPO" && nohup node tools/lab/agent.js >/dev/null 2>&1 &)
}
step "The lab agent starts with the desktop" t_agent d_agent

t_stick() {
  lsblk -rno LABEL,FSTYPE 2>/dev/null | grep -qx "$MAIN exfat" && lsblk -rno LABEL,FSTYPE 2>/dev/null | grep -qx "$FAT vfat"
}
disk_of() { lsblk -no PKNAME "$1" 2>/dev/null | head -1; }   # the disk a partition is on
d_stick() {
  # Never the stick this script runs from, nor any holding the "E2K Lab Setup" folder, and only USB disks.
  local skip=() from m d
  from=$(findmnt -no SOURCE -T "$HERE" 2>/dev/null); [ -n "$from" ] && skip+=("$(disk_of "$from")")
  while read -r m; do [ -d "$m/E2K Lab Setup" ] && skip+=("$(disk_of "$(findmnt -no SOURCE "$m")")"); done < <(findmnt -lno TARGET)
  local disks=()
  while read -r d tran; do
    [ "$tran" = "usb" ] || continue
    [[ " ${skip[*]} " == *" $d "* ]] && continue
    disks+=("$d")
  done < <(lsblk -dno NAME,TRAN)
  [ ${#disks[@]} -gt 0 ] || { RESULT="later: plug in a stick for testing (not the setup stick) and run this again"; return 0; }
  echo
  for d in "${disks[@]}"; do
    note "$d: $(lsblk -dno MODEL,SIZE "/dev/$d" | xargs), now holding: $(lsblk -no LABEL "/dev/$d" | grep . | paste -sd, - || true)"
  done
  if [ ${#disks[@]} -eq 1 ]; then d=${disks[0]}; else read -rp "          Which one becomes the test stick (for example sdb)? " d; fi
  [[ " ${disks[*]} " == *" $d "* ]] || { RESULT="later: no such disk"; return 0; }
  local bytes; bytes=$(lsblk -bdno SIZE "/dev/$d")
  [ "$bytes" -ge 16000000000 ] || { RESULT="later: that stick is smaller than 16 GB"; return 0; }
  say "          Everything on /dev/$d ($(lsblk -dno MODEL,SIZE "/dev/$d" | xargs)) will be erased."
  local ans; read -rp "          Type ERASE to format it, or press Enter to skip: " ans
  [ "$ans" = "ERASE" ] || { RESULT="later: skipped (nothing was changed)"; return 0; }
  for p in $(lsblk -lno NAME "/dev/$d" | tail -n +2); do sudo umount "/dev/$p" 2>/dev/null || true; done
  sudo wipefs -a "/dev/$d" >/dev/null &&
  printf 'label: dos\n,%sGiB,c\n,,7\n' "$FATGB" | sudo sfdisk -q "/dev/$d" && sudo partprobe "/dev/$d" 2>/dev/null; sudo udevadm settle
  local p1 p2; p1=$(lsblk -lno NAME "/dev/$d" | sed -n 2p); p2=$(lsblk -lno NAME "/dev/$d" | sed -n 3p)
  for p in $p1 $p2; do sudo umount "/dev/$p" 2>/dev/null || true; done
  sudo mkfs.vfat -F 32 -n "$FAT" "/dev/$p1" >/dev/null && sudo mkfs.exfat -L "$MAIN" "/dev/$p2" >/dev/null && sudo udevadm settle
}
step "Test stick: $MAIN (exFAT) and $FAT (FAT32, $FATGB GB)" t_stick d_stick

# --- Run them --------------------------------------------------------------------------------------------------------
G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
echo; say "${C}Setting up $NAME$([ $CHECK = 1 ] && echo ' (check only: nothing is changed)')${N}"; echo
if [ $CHECK = 0 ] && ! t_sudo; then say "Your password (for admin commands; asked once):"; sudo -v || exit 1; fi
restart=0; left=(); failed=()
for s in "${STEPS[@]}"; do
  IFS='|' read -r name t d <<<"$s"
  if $t >/dev/null 2>&1; then say "  ${G}[ok]${N}    $name"; continue; fi
  if [ $CHECK = 1 ]; then say "  [to do] $name"; left+=("$name"); continue; fi
  say "  ...     $name"; RESULT=""
  if $d; then
    case "$RESULT" in
      restart) restart=1; say "  ${G}[done]${N}  $name (after a restart)" ;;
      later:*) left+=("$name: ${RESULT#later: }"); say "  ${Y}[later]${N} $name: ${RESULT#later: }" ;;
      *) if $t >/dev/null 2>&1; then say "  ${G}[done]${N}  $name"; else restart=1; say "  ${G}[done]${N}  $name (may need a restart to show)"; fi ;;
    esac
  else failed+=("$name"); say "  ${R}[error]${N} $name"; fi
done

echo
[ ${#failed[@]} -gt 0 ] && say "${R}${#failed[@]} step(s) failed; fix them and run this again.${N}"
[ ${#left[@]} -gt 0 ] && say "${Y}${#left[@]} step(s) still to do: run this again when they're ready.${N}"
[ $restart = 1 ] && say "${C}Restart the machine (it signs in by itself), then run this again to confirm.${N}"
[ ${#failed[@]} -eq 0 ] && [ ${#left[@]} -eq 0 ] && [ $restart = 0 ] && say "${G}$NAME is ready.${N}"
# The address to reserve in the router, so it never changes.
dev=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
if [ -n "$dev" ]; then
  echo; say "${C}Reserve this machine's address in the router (http://192.168.1.254 > Home Network > IP Allocation):${N}"
  say "  Address: $(ip -o -f inet addr show "$dev" | awk '{print $4}' | cut -d/ -f1)   Network card ID: $(cat "/sys/class/net/$dev/address")"
fi
echo
