'use strict';

const crypto = require('crypto');

const STORE_KEY = 'ikemaker.pendingChanges.v1';
const VERSION = 1;
const TYPES = new Set(['draft', 'staged', 'dirty', 'conflict']);
const PERSISTENCE = new Set(['workspace', 'session']);
const ACTIONS = ['focus', 'apply', 'undo'];
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function text(value, name, limit = 1024, required = false) {
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw new Error(`Pending change ${name} is required.`);
  if (result.length > limit) throw new Error(`Pending change ${name} exceeds ${limit} characters.`);
  return result;
}

function canonicalResource(value, caseInsensitive = process.platform === 'win32') {
  let result = text(value, 'resource', 4096, true).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(result)) result = result[0].toLowerCase() + result.slice(1);
  return caseInsensitive ? result.toLowerCase() : result;
}

function identity(input, options = {}) {
  const ownerId = text(input.ownerId || input.owner?.id, 'owner id', 120, true);
  const type = text(input.type, 'type', 32, true).toLowerCase();
  if (!TYPES.has(type)) throw new Error(`Unknown pending change type: ${type}.`);
  const resource = canonicalResource(input.resource, options.caseInsensitive);
  const scope = text(input.scope || 'default', 'scope', 512, true);
  // Type is lifecycle state, not identity: a draft that becomes conflicted must
  // remain the same tray item and retain its optimistic revision chain.
  const digest = crypto.createHash('sha256').update(JSON.stringify([ownerId, resource, scope])).digest('hex').slice(0, 24);
  return { id: `pending:v1:${digest}`, ownerId, type, resource, scope };
}

function actionMetadata(value, fallbackLabel) {
  if (value === false || value == null) return undefined;
  if (value === true) value = {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Pending change action metadata must be an object, true, or false.');
  return {
    label: text(value.label || fallbackLabel, 'action label', 80, true),
    enabled: value.enabled !== false,
    reason: text(value.reason, 'action reason', 300)
  };
}

function safeMetadata(value) {
  if (value == null) return undefined;
  let serialized;
  try { serialized = JSON.stringify(value); } catch (_) { throw new Error('Pending change metadata must be JSON serializable.'); }
  if (serialized === undefined || serialized.length > 8192) throw new Error('Pending change metadata exceeds its safe storage boundary.');
  const parsed = JSON.parse(serialized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Pending change metadata must be an object.');
  return parsed;
}

function normalize(input, options = {}, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pending change must be an object.');
  const key = identity(input, options);
  if (input.id && input.id !== key.id) throw new Error('Pending change identity fields do not match its stable id.');
  const persistence = text(input.persistence || (key.type === 'dirty' ? 'session' : 'workspace'), 'persistence', 20, true).toLowerCase();
  if (!PERSISTENCE.has(persistence)) throw new Error(`Unknown pending change persistence boundary: ${persistence}.`);
  if (key.type === 'dirty' && persistence !== 'session') throw new Error('Dirty source documents are session-owned and cannot be persisted as recovery drafts.');
  const ownerLabel = text(input.ownerLabel || input.owner?.label || previous?.ownerLabel || key.ownerId, 'owner label', 120, true);
  const actions = {};
  const suppliedActions = input.actions || {};
  for (const name of ACTIONS) {
    const normalized = actionMetadata(suppliedActions[name], name === 'focus' ? 'Focus Owner' : name === 'apply' ? 'Apply' : 'Undo');
    if (normalized) actions[name] = normalized;
  }
  if (!actions.focus) actions.focus = actionMetadata(true, 'Focus Owner');
  const now = options.clock ? options.clock() : Date.now();
  return {
    ...key,
    title: text(input.title, 'title', 200, true),
    detail: text(input.detail, 'detail', 1000),
    ownerLabel,
    persistence,
    actions,
    metadata: safeMetadata(input.metadata),
    sourceRevision: text(input.sourceRevision, 'source revision', 256),
    revision: previous ? previous.revision + 1 : Math.max(1, Number(input.revision) || 1),
    createdAt: previous?.createdAt || (Number(input.createdAt) || now),
    updatedAt: now
  };
}

function loadEntries(storage, options) {
  const stored = storage?.get(STORE_KEY, { version: VERSION, entries: [] });
  if (!stored || stored.version !== VERSION || !Array.isArray(stored.entries)) return [];
  const loaded = [];
  for (const value of stored.entries.slice(0, 2048)) {
    try {
      if (value.persistence !== 'workspace') continue;
      const entry = normalize(value, { ...options, clock: () => Number(value.updatedAt) || Date.now() });
      entry.revision = Math.max(1, Number(value.revision) || 1);
      entry.createdAt = Number(value.createdAt) || entry.updatedAt;
      loaded.push(entry);
    } catch (_) { /* Invalid or obsolete recovery metadata is ignored, never executed. */ }
  }
  return loaded;
}

class PendingChanges {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.options = options;
    this.entries = new Map(loadEntries(storage, options).map(entry => [entry.id, entry]));
    this.owners = new Map();
    this.listeners = new Set();
    this.busy = new Set();
    this.writing = Promise.resolve();
  }

  registerOwner(owner) {
    if (!owner || typeof owner !== 'object') throw new Error('Pending change owner is required.');
    const id = text(owner.id, 'owner id', 120, true);
    if (this.owners.has(id)) throw new Error(`Pending change owner ${id} is already registered.`);
    const handlers = { id, label: text(owner.label || id, 'owner label', 120, true) };
    for (const action of ACTIONS) if (owner[action] != null) {
      if (typeof owner[action] !== 'function') throw new Error(`Pending change owner ${id} ${action} handler must be a function.`);
      handlers[action] = owner[action];
    }
    this.owners.set(id, handlers);
    this._emit();
    return { dispose: () => { if (this.owners.get(id) === handlers) { this.owners.delete(id); this._emit(); } } };
  }

  list(filter = {}) {
    return [...this.entries.values()]
      .filter(entry => !filter.type || entry.type === filter.type)
      .filter(entry => !filter.ownerId || entry.ownerId === filter.ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title))
      .map(clone);
  }

  get(id) { return clone(this.entries.get(id)); }

  actionState(id, action) {
    if (!ACTIONS.includes(action)) return { enabled: false, reason: 'Unknown action.' };
    const entry = this.entries.get(id), owner = entry && this.owners.get(entry.ownerId), metadata = entry?.actions?.[action];
    if (!entry) return { enabled: false, reason: 'This pending change no longer exists.' };
    if (!metadata) return { enabled: false, reason: `${entry.ownerLabel} does not offer ${action} for this change.` };
    if (!metadata.enabled) return { enabled: false, reason: metadata.reason || `${metadata.label} is not currently available.` };
    if (!owner) return { enabled: false, reason: `${entry.ownerLabel} is not open in this session.` };
    if (typeof owner[action] !== 'function') return { enabled: false, reason: `${entry.ownerLabel} has no ${action} handler.` };
    if (this.busy.has(id)) return { enabled: false, reason: 'This pending change is already being handled.' };
    return { enabled: true, label: metadata.label };
  }

  upsert(input, expectedRevision) {
    const key = identity(input, this.options), previous = this.entries.get(key.id);
    if (expectedRevision != null && previous?.revision !== expectedRevision) return Promise.resolve(undefined);
    const entry = normalize(input, this.options, previous);
    this.entries.set(entry.id, entry);
    this._emit();
    const persistenceChanged = previous && previous.persistence !== entry.persistence;
    return entry.persistence === 'session' && !persistenceChanged ? Promise.resolve(clone(entry)) : this.flush().then(() => clone(entry));
  }

  remove(id, expectedRevision) {
    const current = this.entries.get(id);
    if (!current || (expectedRevision != null && current.revision !== expectedRevision)) return Promise.resolve(false);
    this.entries.delete(id);
    this._emit();
    return current.persistence === 'session' ? Promise.resolve(true) : this.flush().then(() => true);
  }

  async execute(id, action) {
    const state = this.actionState(id, action);
    if (!state.enabled) throw new Error(state.reason);
    const entry = this.entries.get(id), revision = entry.revision, owner = this.owners.get(entry.ownerId);
    this.busy.add(id); this._emit();
    try {
      const result = await owner[action](clone(entry));
      if (action !== 'focus' && result?.resolved !== false) await this.remove(id, revision);
      return result;
    } finally { this.busy.delete(id); this._emit(); }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('Pending change listener must be a function.');
    this.listeners.add(listener);
    listener(this.list());
    return { dispose: () => this.listeners.delete(listener) };
  }

  flush() {
    const entries = this.list().filter(entry => entry.persistence === 'workspace');
    const payload = { version: VERSION, entries };
    if (JSON.stringify(payload).length > 2 * 1024 * 1024) return Promise.reject(new Error('Pending change recovery metadata exceeds its safe workspace storage limit.'));
    this.writing = this.writing.catch(() => {}).then(() => this.storage?.update(STORE_KEY, payload));
    return this.writing;
  }

  _emit() {
    const snapshot = this.list();
    for (const listener of this.listeners) listener(snapshot);
  }
}

let active;
function initialize(storage, options) { active = new PendingChanges(storage, options); return active; }
function current() { if (!active) active = new PendingChanges(); return active; }

module.exports = { STORE_KEY, VERSION, PendingChanges, canonicalResource, identity, initialize, current };
