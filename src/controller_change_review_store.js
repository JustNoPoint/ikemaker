'use strict';

const crypto = require('crypto');
const DEFAULT_KEY = 'ikemenZss.controllerChangeReview.v1';
const LIMITS = Object.freeze({ contexts: 32, controllersPerContext: 256, bytes: 262144 });
function hash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function empty() { return { schema: 'ikemaker.controller-change-review', version: 1, contexts: {} }; }
function validHash(value) { return /^[0-9a-f]{64}$/i.test(String(value || '')); }
function normalize(raw) {
  if (!raw || raw.schema !== 'ikemaker.controller-change-review' || raw.version !== 1 || !raw.contexts || typeof raw.contexts !== 'object' || Array.isArray(raw.contexts)) return empty();
  const state = empty();
  for (const [context, record] of Object.entries(raw.contexts).slice(0, LIMITS.contexts)) {
    if (!validHash(context) || !record?.controllers || typeof record.controllers !== 'object' || Array.isArray(record.controllers)) continue;
    const controllers = {};
    for (const [name, item] of Object.entries(record.controllers).slice(0, LIMITS.controllersPerContext)) {
      if (!name || Buffer.byteLength(name, 'utf8') > 256 || !validHash(item?.contractHash) || !validHash(item?.snapshotId)) continue;
      controllers[name.toLowerCase()] = { contractHash: String(item.contractHash).toLowerCase(), snapshotId: String(item.snapshotId).toLowerCase(), acknowledgedAt: Number.isFinite(item.acknowledgedAt) ? item.acknowledgedAt : 0 };
    }
    state.contexts[context.toLowerCase()] = { controllers };
  }
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > LIMITS.bytes) throw new RangeError('Controller change review state exceeds its bounded storage limit.');
  return state;
}

class ControllerChangeReviewStore {
  constructor(adapter, options = {}) {
    this.adapter = adapter && typeof adapter.get === 'function' && typeof adapter.update === 'function' ? adapter : null;
    this.key = options.key || DEFAULT_KEY;
    this.cache = empty();
    this.queue = Promise.resolve();
  }
  get available() { return Boolean(this.adapter); }
  contextKey(contextIdentity) { return hash(['ikemaker-controller-review-context-v1', String(contextIdentity || '')]); }
  async refresh() {
    if (!this.adapter) return clone(this.cache);
    const next = normalize(this.adapter.get(this.key, empty()));
    this.cache = next;
    return clone(next);
  }
  acknowledged(contextIdentity) {
    const record = this.cache.contexts[this.contextKey(contextIdentity)];
    return clone(record?.controllers || {});
  }
  async acknowledge(contextIdentity, records) {
    const operation = this.queue.then(async () => {
      if (!this.adapter) throw new Error('Durable controller review storage is unavailable; markers remain read-only.');
      if (!Array.isArray(records) || !records.length || records.length > LIMITS.controllersPerContext) throw new RangeError('Controller acknowledgement selection is empty or exceeds its bounded limit.');
      const context = this.contextKey(contextIdentity), current = normalize(this.adapter.get(this.key, empty())), priorCache = this.cache;
      if (!current.contexts[context] && Object.keys(current.contexts).length >= LIMITS.contexts) throw new RangeError('Controller review context limit reached; no acknowledgement was stored.');
      const next = clone(current), target = next.contexts[context] || { controllers: {} };
      for (const record of records) {
        const name = String(record?.controller || '').trim().toLowerCase();
        if (!name || Buffer.byteLength(name, 'utf8') > 256 || !validHash(record?.contractHash) || !validHash(record?.snapshotId)) throw new TypeError('Controller acknowledgement record is invalid.');
        target.controllers[name] = { contractHash: String(record.contractHash).toLowerCase(), snapshotId: String(record.snapshotId).toLowerCase(), acknowledgedAt: Date.now() };
      }
      if (Object.keys(target.controllers).length > LIMITS.controllersPerContext) throw new RangeError('Controller acknowledgement limit reached; no acknowledgement was stored.');
      next.contexts[context] = target;
      if (Buffer.byteLength(JSON.stringify(next), 'utf8') > LIMITS.bytes) throw new RangeError('Controller acknowledgement would exceed its bounded storage limit.');
      try { await this.adapter.update(this.key, next); }
      catch (error) { this.cache = priorCache; throw new Error(`Controller review acknowledgement was not stored: ${error.message}`); }
      this.cache = normalize(next);
      return this.acknowledged(contextIdentity);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

module.exports = { DEFAULT_KEY, LIMITS, normalize, ControllerChangeReviewStore };
