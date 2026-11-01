'use strict';

function plainRecords(value) { return value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {}; }
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const STORE_SCHEMA = 'ikemaker.authoring-recovery';
const STORE_VERSION = 1;
function bounded(value, maximum, fallback = '') { return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maximum ? value : fallback; }
function normalizedRecord(value, revision) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.text !== 'string' || Buffer.byteLength(value.text, 'utf8') > MAX_TEXT_BYTES) return null;
  return {
    uri:bounded(value.uri, 8192), filename:bounded(value.filename, 4096), language:bounded(value.language, 128, 'plaintext'), text:value.text,
    fingerprint:bounded(value.fingerprint, 256), version:Number.isSafeInteger(Number(value.version)) ? Number(value.version) : 0,
    appliedUnsaved:value.appliedUnsaved === true, reason:bounded(value.reason, 2048), conflict:value.conflict === true,
    revision:Number.isSafeInteger(revision) && revision > 0 ? revision : 0
  };
}

class AuthoringRecoveryStore {
  constructor(memento, key, initial, limits = {}) {
    if (!memento || typeof memento.update !== 'function') throw new TypeError('Recovery storage requires a VS Code Memento-like update API.');
    this.memento = memento;
    this.key = String(key || 'ikemaker.authoringDraftRecovery.v1');
    const stored = initial === undefined ? memento.get?.(this.key, {}) : initial;
    const restored = stored?.schema === STORE_SCHEMA && stored?.version === STORE_VERSION ? plainRecords(stored.records) : plainRecords(stored);
    this.records = {};
    for (const [id, value] of Object.entries(restored)) {
      if (!id || Buffer.byteLength(id, 'utf8') > 8192) continue;
      const record = normalizedRecord(value, Number(value?.revision)); if (record) this.records[id] = record;
    }
    this.maxRecords = Number.isSafeInteger(limits.maxRecords) ? Math.max(1, limits.maxRecords) : 64;
    this.maxBytes = Number.isSafeInteger(limits.maxBytes) ? Math.max(1024, limits.maxBytes) : 8 * 1024 * 1024;
    this._prune();
    this.revision = Object.values(this.records).reduce((maximum, item) => Math.max(maximum, Number(item?.revision || 0)), 0);
    this.queue = Promise.resolve();
    this.listeners = new Set();
  }
  get(id) { const value = this.records[String(id)]; return value ? Object.freeze({ ...value }) : null; }
  snapshot() { return Object.freeze(plainRecords(this.records)); }
  set(id, record) {
    const identity = String(id || ''); if (!identity || Buffer.byteLength(identity, 'utf8') > 8192) return Promise.reject(new RangeError('Recovery id exceeds the supported limit.'));
    const normalized = normalizedRecord(record, this.revision + 1); if (!normalized) return Promise.reject(new RangeError('Recovery record is invalid or exceeds the supported text limit.'));
    if (Buffer.byteLength(JSON.stringify({ schema:STORE_SCHEMA, version:STORE_VERSION, records:{ [identity]:normalized } }), 'utf8') > this.maxBytes) return Promise.reject(new RangeError('Recovery record exceeds the aggregate storage limit.'));
    this.revision += 1; this.records[identity] = normalized; this._prune(); return this._persist().then((value)=>{this._emit(identity);return value;});
  }
  delete(id) { const identity = String(id || ''); if (!identity || Buffer.byteLength(identity, 'utf8') > 8192) return Promise.resolve(); delete this.records[identity]; return this._persist().then((value)=>{this._emit(identity);return value;}); }
  deleteIfRevision(id, revision) {
    const identity = String(id || ''), current = this.records[identity];
    if (!current || !Number.isSafeInteger(revision) || Number(current.revision) !== revision) return Promise.resolve(false);
    delete this.records[identity]; return this._persist().then(() => {this._emit(identity);return true;});
  }
  onDidChange(listener){if(typeof listener!=='function')return{dispose(){}};this.listeners.add(listener);return{dispose:()=>this.listeners.delete(listener)};}
  _emit(id){for(const listener of [...this.listeners]){try{listener(Object.freeze({id:String(id),revision:this.revision}));}catch(_){}}}
  flush() { return this.queue; }
  _prune() {
    const entries = Object.entries(this.records).sort((left, right) => Number(right[1]?.revision || 0) - Number(left[1]?.revision || 0) || left[0].localeCompare(right[0]));
    const newest = [], history = [], seenFiles = new Set();
    for (const entry of entries) {
      const identity = entry[1]?.filename || entry[1]?.uri || entry[0];
      if (seenFiles.has(identity)) history.push(entry); else { seenFiles.add(identity); newest.push(entry); }
    }
    const retained = {}; let count = 0;
    for (const [id, record] of [...newest, ...history]) {
      if (count >= this.maxRecords) continue;
      const candidate = { ...retained, [id]:record };
      const size = Buffer.byteLength(JSON.stringify({ schema:STORE_SCHEMA, version:STORE_VERSION, records:candidate }), 'utf8');
      if (size > this.maxBytes) continue;
      retained[id] = record; count += 1;
    }
    this.records = retained;
  }
  _persist() {
    const snapshot = { schema:STORE_SCHEMA, version:STORE_VERSION, records:plainRecords(this.records) };
    const write = () => this.memento.update(this.key, snapshot);
    const result = this.queue.then(write, write);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

module.exports = { AuthoringRecoveryStore, plainRecords, normalizedRecord, MAX_TEXT_BYTES, STORE_SCHEMA, STORE_VERSION };
