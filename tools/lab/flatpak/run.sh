#!/bin/bash
# The Flatpak lab test, on the Linux lab machine: copy flatpak/* and this folder to ~/fp-lab, and the 0.6.1 and 0.6.2
# test .debs (tools/lab/apt/build.sh) to ~/apt-lab, then: bash ~/fp-lab/run.sh. Needs flatpak-builder and, for the
# user, Flathub with org.freedesktop.Platform/Sdk and org.electronjs.Electron2.BaseApp at the manifest's version.
# Builds 0.6.1, opens it, updates to 0.6.2 underneath it, checks the messages, then Restart Now.
cd ~/fp-lab
ID=com.encyclopedia2000.Encyclopedia2000
pass=0; fail=0
ok() { if eval "$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
U=$(id -u)
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$U/bus" XDG_RUNTIME_DIR="/run/user/$U"
flatpak kill $ID 2>/dev/null; sleep 1
# 0.6.1, built from the test .deb into a local repository and installed from it (the e2k-test remote).
flatpak uninstall --user -y --noninteractive $ID >/dev/null 2>&1
flatpak remote-delete --user --force e2k-test >/dev/null 2>&1
rm -rf repo build .flatpak-builder/build
mkm() { python3 mkm.py "$1"; }
mkm 0.6.1
flatpak-builder --user --force-clean --repo=repo build test.yml >/tmp/fpb.log 2>&1 || tail -5 /tmp/fpb.log
flatpak remote-add --user --no-gpg-verify e2k-test repo && flatpak install --user -y --noninteractive e2k-test $ID >/tmp/fpi.log 2>&1
ok "0.6.1 Flatpak installed, with its version file" 'flatpak run --command=cat $ID /app/share/encyclopedia-2000/version | grep -qx 0.6.1-beta'
D=$HOME/.var/app/$ID/lab; rm -rf $D; mkdir -p $D/profile; echo '{"showSplash":false,"autoUpdate":true}' > $D/profile/settings.json
EVAL='(async () => {
  const s = (m) => new Promise((r) => setTimeout(r, m));
  const v = (await window.e2k.appInfo()).version;
  const bar = () => (document.getElementById("updatebar").hidden ? "" : document.getElementById("updatebar").innerText);
  await s(500);
  E2K.command("updates"); await s(1500);
  let d = document.querySelector(".overlay .dialog");
  const first = { heading: d && d.querySelector("h2").textContent, text: d && d.innerText };
  d && d.querySelector(".df .go").click();
  const before = bar();
  for (let i = 0; i < 240 && !bar(); i++) { await window.e2k.update.check().catch(() => {}); await s(1000); }
  const seenBar = bar();
  E2K.command("updates"); await s(1500);
  d = document.querySelector(".overlay .dialog");
  const r = { version: v, first, barBefore: before, bar: seenBar, heading: d && d.querySelector("h2").textContent, buttons: d ? [...d.querySelectorAll(".df .go")].map((b) => b.textContent) : [] };
  return r;
})()'
flatpak run --env=E2K_PROFILE=$D/profile --env=E2K_NOSPLASH=1 --env=E2K_MUTE=1 --env=E2K_DELAY=4000 "--env=E2K_EVAL=$EVAL" --env=E2K_EVAL_WAIT=500 \
  --env=E2K_EVAL_OUT=$D/eval.json --env=E2K_CAPTURE=$D/shot.png $ID >/tmp/fp-app.log 2>&1 &
sleep 20
ok "The Flatpak (0.6.1) is open" 'flatpak ps --columns=application | grep -q $ID'
# 0.6.2 is built into the same repository, and Flatpak updates it (as Software or Update Manager would).
mkm 0.6.2
flatpak-builder --user --force-clean --repo=repo build test.yml >/tmp/fpb2.log 2>&1 || tail -5 /tmp/fpb2.log
flatpak update --user -y --noninteractive $ID >/tmp/fpu.log 2>&1
ok "Flatpak updates it to 0.6.2 while it's open" 'flatpak run --command=cat $ID /app/share/encyclopedia-2000/version | grep -qx 0.6.2-beta'
for i in $(seq 1 150); do [ -s $D/eval.json ] && break; sleep 2; done
echo "--- what the app saw:"; cat $D/eval.json 2>/dev/null; echo
ok "Check for Updates first: “Updates come from your computer”, naming Software" 'grep -q "Updates come from your computer" $D/eval.json && grep -q "Software, Discover" $D/eval.json'
ok "0.6.1 had nothing in the status bar before" 'grep -q "\"barBefore\": \"\"" $D/eval.json'
ok "…then “Version 0.6.2 Beta was installed” with Restart Now" 'grep -q "Version 0.6.2 Beta was installed" $D/eval.json && grep -q "Restart Now" $D/eval.json'
ok "Check for Updates: “Restart to finish updating”" 'grep -q "\"heading\": \"Restart to finish updating\"" $D/eval.json'
cp $D/shot.png ~/fp-lab/flatpak-installed.png 2>/dev/null
sleep 3; pkill -f "[/]app/main/encyclopedia-2000" 2>/dev/null; sleep 2

# Restart Now: from 0.6.1 (running) after Flatpak installs 0.6.2, the portal starts the newest installed version.
OLD=$(flatpak remote-info --user e2k-test $ID | awk '/Parent:/{print $2}')
flatpak update --user -y --noninteractive --commit=$OLD $ID >/tmp/fpu-old.log 2>&1
echo "(back to: $(flatpak run --command=cat $ID /app/share/encyclopedia-2000/version))"
EVAL2='(async () => { const s = (m) => new Promise((r) => setTimeout(r, m)); for (let i = 0; i < 240 && document.getElementById("updatebar").hidden; i++) { await window.e2k.update.check().catch(() => {}); await s(1000); } window.e2k.update.install(); await s(60000); })()'
flatpak run --env=E2K_PROFILE=$D/profile --env=E2K_NOSPLASH=1 --env=E2K_MUTE=1 --env=E2K_DELAY=4000 "--env=E2K_EVAL=$EVAL2" --env=E2K_CAPTURE=$D/shot2.png $ID >/tmp/fp-app2.log 2>&1 &
sleep 20
flatpak update --user -y --noninteractive $ID >/tmp/fpu2.log 2>&1
NEW=$(flatpak info --user -c $ID | cut -c1-12)
for i in $(seq 1 60); do flatpak ps --columns=application,commit | grep $ID | grep -q "$NEW" && break; sleep 2; done
sleep 5
ok "Restart Now started the new version (0.6.2), and 0.6.1 closed" 'flatpak ps --columns=application,commit | grep $ID | grep -q "$NEW" && ! flatpak ps --columns=application,commit | grep $ID | grep -q "${OLD:0:12}"'
flatpak ps --columns=application,commit,pid
pkill -f "[/]app/main/encyclopedia-2000" 2>/dev/null
echo "RESULT: $pass passed, $fail failed"
