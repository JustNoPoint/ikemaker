'use strict';

const path = require('path');

const ENTITY_KINDS = Object.freeze(['character', 'stage', 'screenpack', 'storyboard', 'workspace']);
const MAX_ENTITIES = 64;
const MAX_PROJECT_ID_BYTES = 256;
const MAX_LABEL_BYTES = 512;
const MAX_PATH_BYTES = 8192;
const MAX_REASON_BYTES = 2048;
const MAX_RETAINED_STATE_BYTES = 256 * 1024;

function bytes(value) { return Buffer.byteLength(String(value || ''), 'utf8'); }
function boundedString(value, name, maximum, allowEmpty = false) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
  const result = value.trim();
  if ((!allowEmpty && !result) || bytes(result) > maximum) throw new RangeError(`${name} is empty or exceeds its ${maximum}-byte limit.`);
  return result;
}
function plain(value) {
  return Boolean(value) && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, allowed, name) {
  if (!plain(value)) throw new TypeError(`${name} must be a plain object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`${name} contains unsupported field ${key}.`);
}
function canonicalOwner(value) {
  const owner = boundedString(value, 'ownerFile', MAX_PATH_BYTES);
  if (!path.isAbsolute(owner)) throw new TypeError('ownerFile must be an absolute path.');
  const resolved = path.normalize(path.resolve(owner));
  if (bytes(resolved) > MAX_PATH_BYTES) throw new RangeError(`ownerFile exceeds its ${MAX_PATH_BYTES}-byte limit.`);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function retainedState(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value) && !Array.isArray(value)) throw new TypeError('Retained entity state must be a plain object, an array, or null.');
  let encoded;
  try { encoded = JSON.stringify(value); } catch (_) { throw new TypeError('Retained entity state must be JSON-serializable.'); }
  if (encoded === undefined || bytes(encoded) > MAX_RETAINED_STATE_BYTES) throw new RangeError(`Retained entity state exceeds its ${MAX_RETAINED_STATE_BYTES}-byte limit.`);
  let clone;
  try { clone = JSON.parse(encoded); } catch (_) { throw new TypeError('Retained entity state must be JSON-serializable.'); }
  return deepFreeze(clone);
}
function normalizeDescriptor(input) {
  exactKeys(input, ['kind', 'projectId', 'ownerFile', 'label', 'detail', 'dirty', 'shared', 'supported', 'unavailableReason', 'transferPinned'], 'Entity descriptor');
  const kind = boundedString(input.kind, 'kind', 32).toLowerCase();
  if (!ENTITY_KINDS.includes(kind)) throw new RangeError(`Unsupported entity kind ${kind}.`);
  const projectId = boundedString(input.projectId, 'projectId', MAX_PROJECT_ID_BYTES);
  const ownerFile = canonicalOwner(input.ownerFile);
  if (kind === 'character' && path.extname(ownerFile).toLowerCase() !== '.def') throw new TypeError('A character entity ownerFile must be its exact DEF file.');
  const label = input.label === undefined ? path.basename(ownerFile) : boundedString(input.label, 'label', MAX_LABEL_BYTES);
  const detail = input.detail === undefined ? ownerFile : boundedString(input.detail, 'detail', MAX_PATH_BYTES);
  const dirty = input.dirty === true, shared = input.shared === true;
  if (input.dirty !== undefined && typeof input.dirty !== 'boolean') throw new TypeError('dirty must be boolean.');
  if (input.shared !== undefined && typeof input.shared !== 'boolean') throw new TypeError('shared must be boolean.');
  const supported = input.supported === undefined ? true : input.supported;
  if (typeof supported !== 'boolean') throw new TypeError('supported must be boolean.');
  const unavailableReason = input.unavailableReason === undefined ? '' : boundedString(input.unavailableReason, 'unavailableReason', MAX_REASON_BYTES, true);
  if (!supported && !unavailableReason) throw new TypeError('An unsupported entity requires unavailableReason.');
  if (input.transferPinned !== undefined && typeof input.transferPinned !== 'boolean') throw new TypeError('transferPinned must be boolean.');
  const id = `${kind}\0${projectId}\0${ownerFile}`;
  return deepFreeze({ id, identity:id, kind, projectId, ownerFile, label, detail, dirty, shared, supported, unavailableReason, transferPinned: input.transferPinned === true });
}

function publicError(error) { return error instanceof Error ? error.message : String(error || 'Unknown switch failure.'); }
function rejected(value, fallback) {
  if (value === false) return { rejected: true, reason: fallback };
  if (plain(value) && value.ok === false) return { rejected: true, reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : fallback };
  return { rejected: false, reason: '' };
}

class EntitySwitchCoordinator {
  constructor() {
    this._records = new Map();
    this._order = [];
    this._closedOrder = [];
    this._activeIdentity = '';
    this._previousIdentity = '';
    this._revision = 0;
    this._generation = 0;
    this._listeners = new Set();
    this._pending = null;
    this._snapshot = null;
  }

  snapshot() {
    if (this._snapshot) return this._snapshot;
    const entities = this._order.map((id) => {
      const record = this._records.get(id);
      return deepFreeze({ ...record.descriptor, pinned:record.pinned, retainedState: record.retainedState });
    });
    const closedEntities = this._closedOrder.map((id) => {
      const record = this._records.get(id);
      return deepFreeze({ ...record.descriptor, pinned:record.pinned, retainedState:record.retainedState });
    });
    const pending = this._pending ? deepFreeze({ identity: this._pending.identity, fromIdentity: this._pending.fromIdentity, generation: this._pending.generation, phase: this._pending.phase }) : null;
    this._snapshot = deepFreeze({ entities, closedEntities, activeIdentity: this._activeIdentity, previousIdentity: this._previousIdentity, revision: this._revision, generation: this._generation, pending });
    return this._snapshot;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('An entity-switch listener must be a function.');
    this._listeners.add(listener);
    let active = true;
    return { dispose: () => { if (active) { active = false; this._listeners.delete(listener); } } };
  }

  register(input, options = {}) {
    exactKeys(options, ['active', 'retainedState', 'pinned'], 'Register options');
    const descriptor = normalizeDescriptor(input);
    const existing = this._records.get(descriptor.id);
    if(options.active===true&&this._closedOrder.includes(descriptor.id))throw new Error('A closed entity must be restored before it can be activated.');
    if (!existing && this._records.size >= MAX_ENTITIES) throw new RangeError(`No more than ${MAX_ENTITIES} loaded and restorable entities are retained.`);
    const nextState = Object.prototype.hasOwnProperty.call(options, 'retainedState') ? retainedState(options.retainedState) : existing?.retainedState || null;
    const pinned=Object.prototype.hasOwnProperty.call(options,'pinned')?options.pinned===true:existing?.pinned===true;
    this._records.set(descriptor.id, { descriptor, retainedState: nextState, pinned });
    if (!existing) {
      if(pinned){const firstUnpinned=this._order.findIndex(id=>this._records.get(id)?.pinned!==true);this._order.splice(firstUnpinned<0?this._order.length:firstUnpinned,0,descriptor.id);}
      else this._order.push(descriptor.id);
    } else if(existing.pinned!==pinned && this._order.includes(descriptor.id)) this._placePinned(descriptor.id,pinned);
    if (options.active === true) {
      if (!descriptor.supported) throw new Error(`Cannot activate unsupported entity: ${descriptor.unavailableReason}`);
      if (this._activeIdentity && this._activeIdentity !== descriptor.id) this._previousIdentity = this._activeIdentity;
      this._activeIdentity = descriptor.id;
    }
    this._publish();
    return descriptor.id;
  }

  update(identity, patch) {
    const record = this._record(identity);
    exactKeys(patch, ['label', 'detail', 'dirty', 'shared', 'supported', 'unavailableReason', 'transferPinned'], 'Entity update');
    const current = record.descriptor;
    const descriptor = normalizeDescriptor({ kind:current.kind, projectId:current.projectId, ownerFile:current.ownerFile, label:current.label, detail:current.detail, dirty:current.dirty, shared:current.shared, supported:current.supported, unavailableReason:current.unavailableReason, transferPinned:current.transferPinned, ...patch });
    this._records.set(identity, { ...record, descriptor });
    this._publish();
    return descriptor;
  }

  retain(identity, state) {
    const record = this._record(identity);
    const next = retainedState(state);
    this._records.set(identity, { ...record, retainedState: next });
    this._publish();
    return next;
  }

  setPinned(identity,pinned) {
    const record=this._record(identity);
    if(typeof pinned!=='boolean')throw new TypeError('pinned must be boolean.');
    if(record.pinned===pinned)return false;
    this._records.set(String(identity),{...record,pinned});
    if(this._order.includes(String(identity)))this._placePinned(String(identity),pinned);
    this._publish();
    return true;
  }

  reorder(identity,beforeIdentity=null) {
    identity=String(identity||'');beforeIdentity=beforeIdentity===null?'':String(beforeIdentity||'');
    const record=this._record(identity);
    if(beforeIdentity===identity)return false;
    const target=beforeIdentity?this._record(beforeIdentity):null;
    if(target&&target.pinned!==record.pinned)throw new Error('Pinned and unpinned entities must be reordered within their own section.');
    const prior=[...this._order],without=prior.filter(id=>id!==identity);
    let index;
    if(beforeIdentity)index=without.indexOf(beforeIdentity);
    else if(record.pinned){index=without.findIndex(id=>this._records.get(id)?.pinned!==true);if(index<0)index=without.length;}
    else index=without.length;
    without.splice(index,0,identity);
    if(without.every((id,at)=>id===prior[at]))return false;
    this._order=without;this._publish();return true;
  }

  close(identity) {
    identity=String(identity||'');
    const record=this._record(identity);
    if(identity===this._activeIdentity)throw new Error('The active entity cannot be closed. Switch to another entity first.');
    const index=this._order.indexOf(identity);
    if(index<0)return false;
    if(this._pending?.identity===identity||this._pending?.fromIdentity===identity)throw new Error('An entity involved in a pending switch cannot be closed.');
    this._records.set(identity,{...record,restoreIndex:index});
    this._order.splice(index,1);
    if(!this._closedOrder.includes(identity))this._closedOrder.push(identity);
    if(this._previousIdentity===identity)this._previousIdentity='';
    this._publish();
    return true;
  }

  restoreClosed(identity) {
    identity=String(identity||'');
    const record=this._record(identity),closedAt=this._closedOrder.indexOf(identity);
    if(closedAt<0)return false;
    this._closedOrder.splice(closedAt,1);
    const wanted=Number.isSafeInteger(record.restoreIndex)?Math.max(0,record.restoreIndex):this._order.length;
    let index=Math.min(wanted,this._order.length);
    if(record.pinned){const firstUnpinned=this._order.findIndex(id=>this._records.get(id)?.pinned!==true);index=Math.min(index,firstUnpinned<0?this._order.length:firstUnpinned);}
    else{const firstUnpinned=this._order.findIndex(id=>this._records.get(id)?.pinned!==true);index=Math.max(index,firstUnpinned<0?this._order.length:firstUnpinned);}
    this._order.splice(index,0,identity);
    this._records.set(identity,{descriptor:record.descriptor,retainedState:record.retainedState,pinned:record.pinned});
    this._publish();
    return true;
  }

  remove(identity) {
    identity = String(identity || '');
    if (!this._records.has(identity)) return false;
    if (this._pending?.identity === identity || this._pending?.fromIdentity === identity) this.cancel('An entity involved in the pending switch was removed.');
    this._records.delete(identity);
    this._order = this._order.filter((id) => id !== identity);
    this._closedOrder = this._closedOrder.filter((id) => id !== identity);
    if (this._activeIdentity === identity) {
      this._activeIdentity = '';
      if (this._previousIdentity === identity || !this._records.has(this._previousIdentity)) this._previousIdentity = '';
    }
    else if (this._previousIdentity === identity) this._previousIdentity = '';
    this._publish();
    return true;
  }

  cancel(reason = 'Switch cancelled.') {
    if (!this._pending) return false;
    const pending = this._pending;
    this._generation += 1;
    pending.controller.abort(boundedString(String(reason), 'cancellation reason', MAX_REASON_BYTES));
    this._pending = null;
    this._publish();
    return true;
  }

  async switchTo(identity, hooks = {}) {
    exactKeys(hooks, ['prepare', 'validate', 'commit', 'rollback'], 'Switch hooks');
    for (const name of Object.keys(hooks)) if (typeof hooks[name] !== 'function') throw new TypeError(`${name} must be a function.`);
    const destination = this._records.get(String(identity || ''));
    if (!destination) return deepFreeze({ status: 'missing', identity: String(identity || ''), reason: 'The destination entity is not loaded. No viewer was opened.' });
    if (!destination.descriptor.supported) return deepFreeze({ status: 'unsupported', identity: destination.descriptor.id, reason: destination.descriptor.unavailableReason });
    if (destination.descriptor.id === this._activeIdentity && !this._pending) return deepFreeze({ status: 'unchanged', identity: destination.descriptor.id, generation: this._generation });
    if (this._pending) this.cancel('Superseded by a newer entity switch.');
    const generation = ++this._generation;
    const fromIdentity = this._activeIdentity;
    const controller = new AbortController();
    const pending = { identity: destination.descriptor.id, fromIdentity, generation, phase: 'prepare', controller };
    this._pending = pending;
    this._publish();
    // AbortSignal has private mutable state and must not be recursively frozen.
    // Every coordinator-owned field around it is already immutable.
    const transaction = Object.freeze({
      generation, fromIdentity, toIdentity: destination.descriptor.id,
      from: fromIdentity ? this._records.get(fromIdentity)?.descriptor || null : null,
      to: destination.descriptor,
      fromState: fromIdentity ? this._records.get(fromIdentity)?.retainedState || null : null,
      toState: destination.retainedState,
      signal: controller.signal
    });
    let prepared;
    const stale = () => this._pending !== pending || this._generation !== generation || controller.signal.aborted;
    const rollback = async (reason) => {
      if (prepared === undefined || typeof hooks.rollback !== 'function') return '';
      try { await hooks.rollback(transaction, prepared, reason); return ''; }
      catch (error) { return publicError(error); }
    };
    const finishFailure = async (status, phase, reason) => {
      const rollbackError = await rollback(reason);
      if (this._pending === pending) { this._pending = null; this._publish(); }
      return deepFreeze({ status, phase, identity: destination.descriptor.id, generation, reason, rollbackError });
    };
    try {
      prepared = hooks.prepare ? await hooks.prepare(transaction) : null;
      if (stale()) return finishFailure('stale', 'prepare', controller.signal.reason || 'A newer switch superseded this request.');
      const preparation = rejected(prepared, 'The destination could not be prepared.');
      if (preparation.rejected) return finishFailure('cancelled', 'prepare', preparation.reason);
      pending.phase = 'validate'; this._publish();
      const validation = hooks.validate ? await hooks.validate(transaction, prepared) : true;
      if (stale()) return finishFailure('stale', 'validate', controller.signal.reason || 'A newer switch superseded this request.');
      const verdict = rejected(validation, 'The prepared destination did not validate.');
      if (verdict.rejected) return finishFailure('cancelled', 'validate', verdict.reason);
      pending.phase = 'commit'; this._publish();
      if (hooks.commit) await hooks.commit(transaction, prepared);
      if (stale()) return finishFailure('stale', 'commit', controller.signal.reason || 'A newer switch superseded this request.');
      this._previousIdentity = fromIdentity && fromIdentity !== destination.descriptor.id ? fromIdentity : this._previousIdentity;
      this._activeIdentity = destination.descriptor.id;
      this._pending = null;
      this._publish();
      return deepFreeze({ status: 'committed', identity: destination.descriptor.id, previousIdentity: fromIdentity, generation });
    } catch (error) {
      return finishFailure(controller.signal.aborted || stale() ? 'stale' : 'failed', pending.phase, publicError(error));
    }
  }

  _record(identity) {
    const record = this._records.get(String(identity || ''));
    if (!record) throw new Error('The entity is not loaded.');
    return record;
  }

  _placePinned(identity,pinned) {
    const without=this._order.filter(id=>id!==identity);
    if(pinned){const firstUnpinned=without.findIndex(id=>this._records.get(id)?.pinned!==true);without.splice(firstUnpinned<0?without.length:firstUnpinned,0,identity);}
    else{const firstUnpinned=without.findIndex(id=>this._records.get(id)?.pinned!==true);without.splice(firstUnpinned<0?without.length:firstUnpinned,0,identity);}
    this._order=without;
  }

  _publish() {
    this._revision += 1;
    this._snapshot = null;
    const snapshot = this.snapshot();
    for (const listener of [...this._listeners]) { try { listener(snapshot); } catch (_) {} }
  }
}

function createEntitySwitchCoordinator() { return new EntitySwitchCoordinator(); }

module.exports = {
  ENTITY_KINDS, MAX_ENTITIES, MAX_RETAINED_STATE_BYTES,
  normalizeDescriptor, EntitySwitchCoordinator, createEntitySwitchCoordinator
};
