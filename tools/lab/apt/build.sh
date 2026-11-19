#!/bin/bash
# The apt repository's lab test, part 1 (in WSL on the PC): builds this working tree as 0.6.1-beta and 0.6.2-beta .debs,
# a stand-in repository holding 0.6.2 signed with a throwaway test key, and a folder to copy to the Linux lab machine.
#   bash tools/lab/apt/build.sh <old .deb (0.6.0)> <out folder>
# Then: scp -r <out folder> e2k@<linux lab>:apt-lab && ssh e2k@<linux lab> bash apt-lab/run.sh   (part 2: run.sh)
# Needs ~/e2k (a Linux checkout with node_modules) for its node_modules.
set -e
OLD=$1; OUT=$2
[ -f "$OLD" ] && [ -n "$OUT" ] || { echo "usage: build.sh <0.6.0 .deb> <out folder>"; exit 2; }
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
W=~/e2k-apt-test; T=/tmp/e2k-apt-test
mkdir -p $W
rsync -a --delete --chmod=D755,F644 --exclude node_modules --exclude dist --exclude mockups --exclude .git --exclude 'tools/test/results' --exclude 'dist-*' "$REPO/" $W/
[ -e $W/node_modules ] || cp -al ~/e2k/node_modules $W/node_modules
cd $W
for v in 0.6.1-beta 0.6.2-beta; do
  npx electron-builder --linux deb --publish never -c.extraMetadata.version=$v -c.electronDist= >/tmp/e2k-apt-build-$v.log 2>&1 || { tail -30 /tmp/e2k-apt-build-$v.log; exit 1; }
done
rm -rf $T; mkdir -p $T/gnupg; chmod 700 $T/gnupg
gpg --homedir $T/gnupg --batch --passphrase '' --quick-gen-key 'E2K lab test <test@example.invalid>' ed25519 sign 0 2>/dev/null
FPR=$(gpg --homedir $T/gnupg --list-keys --with-colons | awk -F: '/^fpr/{print $10; exit}')
gpg --homedir $T/gnupg --export > $T/test-keyring.gpg
node tools/apt-publish.js dist/Encyclopedia-2000-0.6.2-beta-linux-amd64.deb --dry --out $T/repo --key $FPR --gnupghome $T/gnupg --keyring $T/test-keyring.gpg
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r $T/repo "$OUT/repo"; cp $T/test-keyring.gpg "$OUT/"
cp "$OLD" "$OUT/Encyclopedia-2000-0.6.0-beta-linux-amd64.deb"
cp dist/Encyclopedia-2000-0.6.1-beta-linux-amd64.deb dist/Encyclopedia-2000-0.6.2-beta-linux-amd64.deb "$REPO/tools/lab/apt/run.sh" "$OUT/"
echo "Ready: $OUT"
