'use strict';

class SignatureCache {
  constructor(limit = 256) { this.limit = Math.max(1, Number(limit) || 256); this.values = new Map(); }
  signature(stat) { return `${Number(stat.size) || 0}:${Number(stat.mtimeMs) || 0}`; }
  get(filename, stat) { const item = this.values.get(filename); if (!item || item.signature !== this.signature(stat)) return undefined; this.values.delete(filename); this.values.set(filename, item); return item.value; }
  set(filename, stat, value) { this.values.delete(filename); this.values.set(filename, { signature: this.signature(stat), value }); while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value); return value; }
  invalidate(filename) { if (filename) this.values.delete(filename); else this.values.clear(); }
}

module.exports = { SignatureCache };
