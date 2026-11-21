'use strict';

// Payloads and their indexes occupy fixed-size backing stores. A cursor is a
// serial number, so an export cannot mistake a recycled slot for its old row.
class TelemetryRing {
  constructor(capacity, storageBytes, onEvict) {
    this.capacity = capacity;
    this.offsets = new Uint32Array(capacity);
    this.lengths = new Uint32Array(capacity);
    this.times = new Float64Array(capacity);
    this.indexBytes = capacity * 16;
    if (storageBytes <= this.indexBytes) throw Error('Telemetry pool is too small');
    this.pool = Buffer.alloc(storageBytes - this.indexBytes);
    this.onEvict = onEvict;
    this.first = 1;
    this.next = 1;
    this.writeOffset = 0;
    this.used = 0;
  }

  get count() { return this.next - this.first; }
  slot(serial) { return (serial - 1) % this.capacity; }

  evict(reason) {
    if (!this.count) return;
    const serial = this.first++;
    const slot = this.slot(serial), length = this.lengths[slot], offset = this.offsets[slot];
    const tail = Math.min(length, this.pool.length - offset);
    this.pool.fill(0, offset, offset + tail);
    if (tail < length) this.pool.fill(0, 0, length - tail);
    this.lengths[slot] = 0;
    this.used -= length;
    this.onEvict(reason, serial);
  }

  prune(cutoff) {
    while (this.count && this.times[this.slot(this.first)] <= cutoff) this.evict('age');
  }

  append(record, receivedMs=record.receivedMs) {
    const bytes = Buffer.from(JSON.stringify(record));
    if (bytes.length > this.pool.length || bytes.length > 32768) return false;
    while (this.count >= this.capacity) this.evict('index');
    while (this.used + bytes.length > this.pool.length) this.evict('bytes');
    const slot = this.slot(this.next++);
    this.offsets[slot] = this.writeOffset;
    this.lengths[slot] = bytes.length;
    this.times[slot] = receivedMs;
    const tail = Math.min(bytes.length, this.pool.length - this.writeOffset);
    bytes.copy(this.pool, this.writeOffset, 0, tail);
    if (tail < bytes.length) bytes.copy(this.pool, 0, tail);
    this.writeOffset = (this.writeOffset + bytes.length) % this.pool.length;
    this.used += bytes.length;
    return true;
  }

  bytes(serial) {
    if (!Number.isSafeInteger(serial) || serial < this.first || serial >= this.next) return null;
    const slot = this.slot(serial), offset = this.offsets[slot], length = this.lengths[slot];
    const tail = Math.min(length, this.pool.length - offset);
    // A slow HTTP response must never observe mutation of a reused ring slot.
    const copy = Buffer.allocUnsafe(length);
    this.pool.copy(copy, 0, offset, offset + tail);
    if (tail < length) this.pool.copy(copy, tail, 0, length - tail);
    return copy;
  }

  read(serial) {
    const bytes = this.bytes(serial);
    return bytes ? JSON.parse(bytes.toString('utf8')) : null;
  }
}

module.exports = { TelemetryRing };
