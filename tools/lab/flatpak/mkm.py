# Writes test.yml: the real manifest, taking the .deb of the given version from ~/apt-lab instead of GitHub.
import re, sys
v = sys.argv[1]
s = open("com.encyclopedia2000.Encyclopedia2000.yml").read()
s, n = re.subn(r"        url: .*\n        sha256: .*\n", "        path: /home/e2k/apt-lab/Encyclopedia-2000-%s-beta-linux-amd64.deb\n" % v, s)
assert n == 1
open("test.yml", "w").write(s)
