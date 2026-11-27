#!/bin/bash
# (Part 2 of the apt repository lab test; see build.sh.)
# The apt repository, end to end on the Linux lab machine (Mint), with V1 and V2 from build.sh (say 0.6.2 and 0.6.3):
# 0.6.0 → V1 adds the repository; the system upgrades to V2 from a local copy of the repository (signed with a test
# key) while V1 is open; the app says so and Restart Now starts V2; removing the app removes the repository and a
# reinstall adds it again; a deleted repository isn't added back by an upgrade. Leaves 0.6.0 with no repository, or
# leave-installed.deb (with its real repository) if build.sh was given one.
cd "$(dirname "$0")"
L=$PWD
. ./versions
D1=./Encyclopedia-2000-$V1-linux-amd64.deb; D2=./Encyclopedia-2000-$V2-linux-amd64.deb
A1=${V1/-/\~}; A2=${V2/-/\~}
P2=$(echo "$V2" | sed -E 's/^([0-9.]+)-beta$/\1 Beta/')
SRC=/etc/apt/sources.list.d/encyclopedia-2000.sources
KEYRING=/usr/share/keyrings/encyclopedia-2000-archive-keyring.gpg
TESTKEY=/usr/share/keyrings/e2k-lab-test.gpg
pass=0; fail=0
ok() { if eval "$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
ver() { dpkg-query -W -f='${Status} ${Version}' encyclopedia-2000 2>/dev/null | sed -n 's/^install ok installed //p'; }
U=$(id -u)
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$U/bus" XDG_RUNTIME_DIR="/run/user/$U"
inst() { sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades "$@" >/tmp/apt-lab-inst.log 2>&1 || { tail -20 /tmp/apt-lab-inst.log; return 1; }; }
rem() { sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y encyclopedia-2000 >/dev/null 2>&1; }
clean() { rem; sudo rm -f /etc/apt/sources.list.d/encyclopedia-2000.* $TESTKEY; sudo rm -rf /var/lib/encyclopedia-2000; }

pkill -f '/opt/Encyclopedia 2000/encyclopedia-2000' 2>/dev/null; sleep 1
clean

inst ./Encyclopedia-2000-0.6.0-beta-linux-amd64.deb
ok "0.6.0 installed, with no repository" '[ "$(ver)" = 0.6.0~beta ] && [ ! -e $SRC ]'
inst $D1
ok "0.6.0 → $V1 adds the repository and its key" '[ "$(ver)" = $A1 ] && grep -q "^URIs: https://apt.encyclopedia2000.com$" $SRC && grep -q "^Signed-By: $KEYRING$" $SRC && [ -s $KEYRING ]'
ok "The key in the package is the project's" 'gpg --no-default-keyring --keyring $KEYRING --list-keys --with-colons 2>/dev/null | grep -q 758EF5BAE98CBF7BB7BDF0F331881CBAA33D0E14'

# The lab's stand-in for apt.encyclopedia2000.com: the same repository layout, on this machine, signed with a test key.
sudo install -m 644 "$L/test-keyring.gpg" $TESTKEY
sudo sed -i "s#https://apt.encyclopedia2000.com#http://127.0.0.1:8765#; s#$KEYRING#$TESTKEY#" $SRC
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$L/repo" >/dev/null 2>&1 &
HTTP=$!
sleep 1

# V1 open while the system updates it. Phase 1 (V1) waits for "was installed", notes what it saw, and presses
# Restart Now; phase 2 (the restarted copy) reports. E2K_CAPTURE is what makes the hooks run.
P=/tmp/e2k-apt-lab-profile; rm -rf $P; mkdir -p $P; echo '{"showSplash":false,"autoUpdate":true}' > $P/settings.json
rm -f /tmp/apt-lab-eval.json /tmp/apt-lab-shot.png
EVAL='(async () => {
  const s = (m) => new Promise((r) => setTimeout(r, m));
  const v = (await window.e2k.appInfo()).version;
  const bar = () => (document.getElementById("updatebar").hidden ? "" : document.getElementById("updatebar").innerText);
  const p1 = localStorage.getItem("e2k.labPhase1");
  if (p1) { await s(1500); return { phase: 2, version: v, phase1: JSON.parse(p1), bar: bar() }; }
  const before = bar();
  for (let i = 0; i < 150 && !bar(); i++) { await window.e2k.update.check().catch(() => {}); await s(1000); }
  const seenBar = bar();
  E2K.command("updates"); await s(1500);
  const d = document.querySelector(".overlay .dialog");
  localStorage.setItem("e2k.labPhase1", JSON.stringify({ version: v, barBefore: before, bar: seenBar,
    heading: d && d.querySelector("h2").textContent, buttons: d ? [...d.querySelectorAll(".df .go")].map((b) => b.textContent) : [] }));
  await s(1000);
  window.e2k.update.install();
  await s(60000);
})()'
E2K_PROFILE=$P E2K_NOSPLASH=1 E2K_MUTE=1 E2K_DELAY=4000 E2K_EVAL="$EVAL" E2K_EVAL_OUT=/tmp/apt-lab-eval.json E2K_CAPTURE=/tmp/apt-lab-shot.png \
  setsid /usr/bin/encyclopedia-2000 >/tmp/apt-lab-app.log 2>&1 < /dev/null &
sleep 15
ok "The app ($V1) is open" 'pgrep -f "/opt/Encyclopedia 2000/encyclopedia-2000" >/dev/null'
sudo apt-get update >/tmp/apt-lab-update.log 2>&1
ok "apt update reads the repository with no errors or warnings" '! grep -qE "^(W|E|Err):" /tmp/apt-lab-update.log' || tail -5 /tmp/apt-lab-update.log
ok "apt offers $V2 from it" 'apt-cache policy encyclopedia-2000 | grep -q "Candidate: $A2"'
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade encyclopedia-2000 >/tmp/apt-lab-upgrade.log 2>&1
ok "The system upgrades it to $V2" '[ "$(ver)" = $A2 ]'
ok "…and the repository is still there" 'grep -q "^URIs: http://127.0.0.1:8765$" $SRC'
for i in $(seq 1 120); do [ -s /tmp/apt-lab-eval.json ] && break; sleep 2; done
echo "--- what the app saw:"; cat /tmp/apt-lab-eval.json 2>/dev/null; echo
ok "$V1 had nothing in the status bar before" 'grep -q "\"barBefore\": \"\"" /tmp/apt-lab-eval.json'
ok "…then “Version $P2 was installed” with Restart Now" 'grep -q "Version $P2 was installed" /tmp/apt-lab-eval.json && grep -q "Restart Now" /tmp/apt-lab-eval.json'
ok "Check for Updates: “Restart to finish updating”, Restart Now and Later" 'grep -q "\"heading\": \"Restart to finish updating\"" /tmp/apt-lab-eval.json && grep -q "\"Later\"" /tmp/apt-lab-eval.json'
ok "Restart Now started $V2, with nothing in the status bar" 'grep -q "\"phase\": 2" /tmp/apt-lab-eval.json && grep -q "\"version\": \"$V2\"" /tmp/apt-lab-eval.json && grep -q "^  \"bar\": \"\"" /tmp/apt-lab-eval.json'
cp /tmp/apt-lab-shot.png "$L/restarted.png" 2>/dev/null
pkill -f '/opt/Encyclopedia 2000/encyclopedia-2000' 2>/dev/null
kill $HTTP 2>/dev/null

rem
ok "Removing the app removes the repository" '[ -z "$(ver)" ] && [ ! -e $SRC ] && [ ! -e /var/lib/encyclopedia-2000 ]'
inst $D1
ok "Installing it again adds the repository again" '[ -e $SRC ]'
sudo rm -f $SRC
inst $D2
ok "Deleted by hand, an upgrade doesn't add it back" '[ "$(ver)" = $A2 ] && [ ! -e $SRC ]'

# Leave the machine as it was: 0.6.0 installed with no repository, or leave-installed.deb with its repository.
clean
inst ./Encyclopedia-2000-0.6.0-beta-linux-amd64.deb
if [ -f leave-installed.deb ]; then inst ./leave-installed.deb; echo "Left installed: $(ver), repository: $([ -e $SRC ] && echo yes || echo no)"; fi
sudo apt-get update >/dev/null 2>&1
echo "RESULT: $pass passed, $fail failed"
