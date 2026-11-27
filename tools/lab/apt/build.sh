#!/bin/bash
# The apt repository's lab test, part 1 (in WSL on the PC): the app's version (package.json, say 0.6.2-beta) as the
# installed copy and the next patch (0.6.3-beta) as the update, a stand-in repository holding the update signed with a
# throwaway test key, and a folder to copy to the Linux lab machine.
#   bash tools/lab/apt/build.sh <old .deb (0.6.0)> <out folder> [<release .deb>] [<.deb to leave installed>]
# With a release .deb (the one going out), that's the installed copy, so the release itself is what gets updated; the
# update is still built from this working tree. Without one, both are built here. A .deb to leave installed (say the
# last release, from GitHub) is installed again at the end, with its repository, instead of leaving 0.6.0.
# Then: scp -r <out folder> e2k@<linux lab>:apt-lab && ssh e2k@<linux lab> bash apt-lab/run.sh   (part 2: run.sh)
# Needs ~/e2k (a Linux checkout with node_modules) for its node_modules.
set -e
OLD=$1; OUT=$2; REL=$3; LEAVE=$4
[ -f "$OLD" ] && [ -n "$OUT" ] || { echo "usage: build.sh <0.6.0 .deb> <out folder> [<release .deb>] [<.deb to leave installed>]"; exit 2; }
[ -z "$REL" ] || [ -f "$REL" ] || { echo "no such file: $REL"; exit 2; }
[ -z "$LEAVE" ] || [ -f "$LEAVE" ] || { echo "no such file: $LEAVE"; exit 2; }
REL=${REL:+$(realpath "$REL")}; LEAVE=${LEAVE:+$(realpath "$LEAVE")}
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
W=~/e2k-apt-test; T=/tmp/e2k-apt-test
mkdir -p $W
rsync -a --delete --chmod=D755,F644 --exclude node_modules --exclude dist --exclude mockups --exclude .git --exclude 'tools/test/results' --exclude 'dist-*' "$REPO/" $W/
[ -e $W/node_modules ] || cp -al ~/e2k/node_modules $W/node_modules
cd $W
V1=$(node -p "require('./package.json').version")
V2=$(node -p "const [a, b, c] = require('./package.json').version.split(/[.-]/); [a, b, +c + 1].join('.') + '-beta'")
D1=dist/Encyclopedia-2000-$V1-linux-amd64.deb; D2=dist/Encyclopedia-2000-$V2-linux-amd64.deb
rm -f dist/Encyclopedia-2000-*-linux-amd64.deb
if [ -n "$REL" ]; then mkdir -p dist; cp "$REL" $D1; [ "$(dpkg-deb -f $D1 Version)" = "${V1/-/\~}" ] || { echo "$REL isn't $V1"; exit 1; }; BUILD=$V2; else BUILD="$V1 $V2"; fi
for v in $BUILD; do
  npx electron-builder --linux deb --publish never -c.extraMetadata.version=$v -c.electronDist= >/tmp/e2k-apt-build-$v.log 2>&1 || { tail -30 /tmp/e2k-apt-build-$v.log; exit 1; }
done
rm -rf $T; mkdir -p $T/gnupg; chmod 700 $T/gnupg
gpg --homedir $T/gnupg --batch --passphrase '' --quick-gen-key 'E2K lab test <test@example.invalid>' ed25519 sign 0 2>/dev/null
FPR=$(gpg --homedir $T/gnupg --list-keys --with-colons | awk -F: '/^fpr/{print $10; exit}')
gpg --homedir $T/gnupg --export > $T/test-keyring.gpg
node tools/apt-publish.js $D2 --dry --out $T/repo --key $FPR --gnupghome $T/gnupg --keyring $T/test-keyring.gpg
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r $T/repo "$OUT/repo"; cp $T/test-keyring.gpg "$OUT/"
cp "$OLD" "$OUT/Encyclopedia-2000-0.6.0-beta-linux-amd64.deb"
cp $D1 $D2 "$REPO/tools/lab/apt/run.sh" "$OUT/"
printf 'V1=%s\nV2=%s\n' $V1 $V2 > "$OUT/versions"
[ -z "$LEAVE" ] || cp "$LEAVE" "$OUT/leave-installed.deb"
echo "Ready: $OUT"
