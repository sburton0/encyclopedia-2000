// Reads Kiwix offline library files (ZIM, https://wiki.openzim.org/wiki/ZIM_file_format) in plain JavaScript, so it
// works on every platform and on the older Electron used for Windows 7. Work in progress for the 0.5 offline library:
// header, MIME list, directory entries, zstd clusters, and lookups by path and by title.
const fs = require('fs');
const { decompress: zstd } = require('fzstd');

class Zim {
  constructor(file) {
    this.fd = fs.openSync(file, 'r');
    const h = this.read(0, 80);
    if (h.readUInt32LE(0) !== 72173914) throw new Error('not a ZIM file');
    this.major = h.readUInt16LE(4); this.minor = h.readUInt16LE(6);
    this.entryCount = h.readUInt32LE(24); this.clusterCount = h.readUInt32LE(28);
    this.urlPtrPos = Number(h.readBigUInt64LE(32)); this.titlePtrPos = Number(h.readBigUInt64LE(40));
    this.clusterPtrPos = Number(h.readBigUInt64LE(48)); this.mimeListPos = Number(h.readBigUInt64LE(56));
    this.mainPage = h.readUInt32LE(64); this.checksumPos = Number(h.readBigUInt64LE(72));
    const ml = this.read(this.mimeListPos, 4096); this.mimes = [];
    for (let p = 0; ml[p] !== 0;) { const e = ml.indexOf(0, p); this.mimes.push(ml.toString('utf8', p, e)); p = e + 1; }
    this.cache = new Map();
  }
  read(pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(this.fd, b, 0, len, pos); return b.subarray(0, n); }
  urlPtr(i) { return Number(this.read(this.urlPtrPos + i * 8, 8).readBigUInt64LE(0)); }
  // Title order: newer ZIMs (6.1+) keep it in X/listing/titleOrdered/v1 (front articles only); older ones in the header.
  titleList() {
    if (this.titles) return this.titles;
    const x = this.find('X', 'listing/titleOrdered/v1');
    if (x) { const b = this.content(x); this.titles = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
    else this.titles = new Uint32Array(this.read(this.titlePtrPos, this.entryCount * 4).buffer.slice(0));
    return this.titles;
  }
  titleIdx(i) { return this.titleList()[i]; }
  entry(i) {
    const pos = this.urlPtr(i), b = this.read(pos, 2048);
    const mime = b.readUInt16LE(0), ns = String.fromCharCode(b[3]);
    const redirect = mime === 0xffff;
    let p = redirect ? 12 : 16;
    const e1 = b.indexOf(0, p), path = b.toString('utf8', p, e1); p = e1 + 1;
    const e2 = b.indexOf(0, p), title = b.toString('utf8', p, e2) || path;
    return redirect ? { i, ns, path, title, redirect: b.readUInt32LE(8) }
      : { i, ns, path, title, mime: this.mimes[mime], cluster: b.readUInt32LE(8), blob: b.readUInt32LE(12) };
  }
  // Binary search over the path-sorted list for namespace + path.
  find(ns, path) {
    const key = ns + '/' + path;
    let lo = 0, hi = this.entryCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, e = this.entry(mid), k = e.ns + '/' + e.path;
      if (k === key) return e;
      if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }
  resolve(e) { for (let n = 0; e && e.redirect !== undefined && n < 10; n++) e = this.entry(e.redirect); return e; }
  clusterData(c) {
    if (this.cache.has(c)) return this.cache.get(c);
    const start = Number(this.read(this.clusterPtrPos + c * 8, 8).readBigUInt64LE(0));
    const end = c + 1 < this.clusterCount ? Number(this.read(this.clusterPtrPos + (c + 1) * 8, 8).readBigUInt64LE(0)) : this.checksumPos;
    const raw = this.read(start, end - start), info = raw[0], comp = info & 0x0f, ext = !!(info & 0x10);
    let data = raw.subarray(1);
    if (comp === 5) data = Buffer.from(zstd(data));
    else if (comp === 4) throw new Error('xz cluster (older ZIM): needs the xz decoder');
    const r = { data, ext };
    this.cache.set(c, r); if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value);
    return r;
  }
  content(e) {
    e = this.resolve(e);
    const { data, ext } = this.clusterData(e.cluster), w = ext ? 8 : 4;
    const off = (k) => (ext ? Number(data.readBigUInt64LE(k * w)) : data.readUInt32LE(k * w));
    return data.subarray(off(e.blob), off(e.blob + 1));
  }
  // Title search: binary search the title-sorted list for the first title >= prefix, then walk forward.
  titlePrefix(prefix, limit = 8, ns = 'C') {
    const key = ns + '/' + prefix;
    const n = this.titleList().length;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1, e = this.entry(this.titleIdx(mid)); if (e.ns + '/' + e.title < key) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let i = lo; i < n && out.length < limit; i++) {
      const e = this.entry(this.titleIdx(i));
      if (e.ns !== ns || !e.title.startsWith(prefix)) break;
      out.push(e.title + (e.redirect !== undefined ? ' (redirect)' : ''));
    }
    return out;
  }
  meta(name) { const e = this.find('M', name); return e ? this.content(e).toString('utf8') : ''; }
}
module.exports = Zim;
