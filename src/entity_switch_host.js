'use strict';

const {
  STATE_MESSAGE, READY_MESSAGE, SWITCH_MESSAGE, PREVIOUS_MESSAGE, OPEN_MESSAGE, REORDER_MESSAGE, MOVE_MESSAGE, PIN_MESSAGE, CLOSE_MESSAGE, RESTORE_MESSAGE, normalizeHeaderProjection
} = require('./entity_header');
const { createEntitySwitchCoordinator, MAX_RETAINED_STATE_BYTES } = require('./entity_switch_coordinator');

const MAX_HEADERS = 128;
const MAX_ADAPTERS = 64;
const MAX_ID_BYTES = 512;
const MAX_REASON_BYTES = 2048;
const MAX_RETAINED_DEPTH = 32;
const MAX_RETAINED_NODES = 16384;
const ADAPTER_RETAINED_STATE_KEY = 'adapterRetainedState';
const FORBIDDEN_RETAINED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function bytes(value) { return Buffer.byteLength(String(value || ''), 'utf8'); }
function plain(value) { return Boolean(value) && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function exact(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function bounded(value, maximum = MAX_ID_BYTES) { return typeof value === 'string' && value.length > 0 && bytes(value) <= maximum; }
function reason(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && bytes(text) <= MAX_REASON_BYTES ? text : fallback;
}
function accepted(value, fallback) {
  if (value === false) return { ok:false, reason:fallback };
  if (plain(value) && value.ok === false) return { ok:false, reason:reason(value.reason, fallback) };
  return { ok:true };
}

function cloneRetained(value, seen = new Set(), depth = 0, count = { value:0 }) {
  if (++count.value > MAX_RETAINED_NODES) throw new RangeError('Retained adapter state contains too many values.');
  if (depth > MAX_RETAINED_DEPTH) throw new RangeError('Retained adapter state is nested too deeply.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Retained adapter state contains a non-finite number.'); return value; }
  if (typeof value !== 'object') throw new TypeError('Retained adapter state must contain only JSON data.');
  if (seen.has(value)) throw new TypeError('Retained adapter state cannot contain cycles.');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError('Retained adapter state must contain only plain objects and arrays.');
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map(item => cloneRetained(item, seen, depth + 1, count));
  else {
    result = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_RETAINED_KEYS.has(key)) throw new TypeError(`Retained adapter state contains forbidden key ${key}.`);
      // Optional viewer settings (for example, an untouched Stage camera) have
      // no persisted value. Keep the same object semantics as JSON.stringify.
      if (item === undefined) continue;
      result[key] = cloneRetained(item, seen, depth + 1, count);
    }
  }
  seen.delete(value);
  return result;
}

function encodedSize(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch (_) { throw new TypeError('Retained adapter state must be JSON-serializable.'); }
  if (encoded === undefined || bytes(encoded) > MAX_RETAINED_STATE_BYTES) throw new RangeError(`Retained adapter state exceeds the coordinator ${MAX_RETAINED_STATE_BYTES}-byte limit.`);
  return encoded;
}

function mergeAdapterRetainedState(prior, captures) {
  if (!captures.size) return null;
  const priorClone = prior === null || prior === undefined ? Object.create(null) : cloneRetained(prior);
  const merged = plain(priorClone) ? priorClone : Object.assign(Object.create(null), { retainedValue:priorClone });
  const existing = Object.prototype.hasOwnProperty.call(merged, ADAPTER_RETAINED_STATE_KEY) ? merged[ADAPTER_RETAINED_STATE_KEY] : null;
  if (existing !== null && !plain(existing)) throw new TypeError(`${ADAPTER_RETAINED_STATE_KEY} must remain a plain object.`);
  const states = existing ? cloneRetained(existing) : Object.create(null);
  for (const [adapterId, state] of captures) {
    if (FORBIDDEN_RETAINED_KEYS.has(adapterId)) throw new TypeError(`Adapter id ${adapterId} cannot be used as retained-state ownership.`);
    states[adapterId] = cloneRetained(state);
  }
  merged[ADAPTER_RETAINED_STATE_KEY] = states;
  encodedSize(merged);
  return merged;
}

function validateIntent(message) {
  if (exact(message, ['type']) && message.type === READY_MESSAGE) return Object.freeze({ type:message.type });
  if (exact(message,['type','identity','beforeIdentity','revision'])&&message.type===REORDER_MESSAGE&&bounded(message.identity)&&(message.beforeIdentity===null||bounded(message.beforeIdentity))&&Number.isSafeInteger(message.revision)&&message.revision>=0)return Object.freeze({type:message.type,identity:message.identity,beforeIdentity:message.beforeIdentity,revision:message.revision});
  if (exact(message,['type','identity','direction','revision'])&&message.type===MOVE_MESSAGE&&bounded(message.identity)&&[-1,1].includes(message.direction)&&Number.isSafeInteger(message.revision)&&message.revision>=0)return Object.freeze({type:message.type,identity:message.identity,direction:message.direction,revision:message.revision});
  if (exact(message,['type','identity','pinned','revision'])&&message.type===PIN_MESSAGE&&bounded(message.identity)&&typeof message.pinned==='boolean'&&Number.isSafeInteger(message.revision)&&message.revision>=0)return Object.freeze({type:message.type,identity:message.identity,pinned:message.pinned,revision:message.revision});
  if (exact(message,['type','identity','revision'])&&[CLOSE_MESSAGE,RESTORE_MESSAGE].includes(message.type)&&bounded(message.identity)&&Number.isSafeInteger(message.revision)&&message.revision>=0)return Object.freeze({type:message.type,identity:message.identity,revision:message.revision});
  if (exact(message, ['type','identity','revision']) && message.type === SWITCH_MESSAGE && bounded(message.identity) && Number.isSafeInteger(message.revision) && message.revision >= 0) return Object.freeze({ type:message.type, identity:message.identity, revision:message.revision });
  if (exact(message, ['type','revision']) && message.type === PREVIOUS_MESSAGE && Number.isSafeInteger(message.revision) && message.revision >= 0) return Object.freeze({ type:message.type, revision:message.revision });
  if (exact(message, ['type']) && message.type === OPEN_MESSAGE) return Object.freeze({ type:message.type });
  return null;
}

function validateAdapter(value) {
  if (!plain(value)) throw new TypeError('An entity retarget adapter must be a plain object.');
  const allowed = ['id','surfaceId','transferPinned','supports','prepare','validate','commit','rollback'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`Entity retarget adapter contains unsupported field ${key}.`);
  if (!bounded(value.id, 256)) throw new RangeError('An entity retarget adapter requires a bounded stable id.');
  if (FORBIDDEN_RETAINED_KEYS.has(value.id)) throw new TypeError('The entity retarget adapter id is reserved.');
  if (!bounded(value.surfaceId, 128)) throw new RangeError('An entity retarget adapter requires a bounded surfaceId.');
  if (value.transferPinned !== undefined && typeof value.transferPinned !== 'boolean' && typeof value.transferPinned !== 'function') throw new TypeError('transferPinned must be boolean or a function.');
  for (const name of ['supports','prepare','validate','commit','rollback']) if (typeof value[name] !== 'function') throw new TypeError(`Entity retarget adapter requires ${name}().`);
  return Object.freeze({ ...value });
}

function validateHeaderOptions(value) {
  if (value === undefined) value = {};
  if (!plain(value)) throw new TypeError('Entity header options must be a plain object.');
  for (const key of Object.keys(value)) if (!['surfaceId','adapterId','observerOnly'].includes(key)) throw new TypeError(`Entity header options contain unsupported field ${key}.`);
  const surfaceId = value.surfaceId === undefined ? 'shared' : value.surfaceId;
  if (!bounded(surfaceId, 128)) throw new RangeError('Entity header surfaceId is invalid.');
  const observerOnly = value.observerOnly === true;
  const adapterId = value.adapterId === undefined ? '' : value.adapterId;
  if (!observerOnly && !bounded(adapterId, 256)) throw new RangeError('An entity-dependent header requires its exact adapterId.');
  if (observerOnly && adapterId) throw new TypeError('An observer-only header cannot claim a retarget adapter.');
  return Object.freeze({ surfaceId, adapterId, observerOnly });
}

class EntitySwitchHost {
  constructor(options = {}) {
    if (!plain(options)) throw new TypeError('Entity switch host options must be a plain object.');
    for (const key of Object.keys(options)) if (!['coordinator','openEntity','closeEntity','restoreEntity','focusEntity'].includes(key)) throw new TypeError(`Entity switch host options contain unsupported field ${key}.`);
    this.coordinator = options.coordinator || createEntitySwitchCoordinator();
    if (!this.coordinator || typeof this.coordinator.snapshot !== 'function' || typeof this.coordinator.switchTo !== 'function' || typeof this.coordinator.subscribe !== 'function') throw new TypeError('Entity switch host requires a coordinator.');
    if (options.openEntity !== undefined && typeof options.openEntity !== 'function') throw new TypeError('openEntity must be a host callback.');
    this.openEntity = options.openEntity || null;
    if(options.focusEntity!==undefined&&typeof options.focusEntity!=='function')throw new TypeError('focusEntity must be a host callback.');
    this.focusEntity=options.focusEntity||null;
    if (options.closeEntity !== undefined && typeof options.closeEntity !== 'function') throw new TypeError('closeEntity must be a host callback.');
    if (options.restoreEntity !== undefined && typeof options.restoreEntity !== 'function') throw new TypeError('restoreEntity must be a host callback.');
    this.closeEntity=options.closeEntity||null;
    this.restoreEntity=options.restoreEntity||null;
    this.headers = new Map();
    this.adapters = new Map();
    this.status = '';
    this.disposed = false;
    this.subscription = this.coordinator.subscribe(() => this.broadcast());
  }

  registerHeader(panel, options) {
    this._active();
    if (!panel?.webview || typeof panel.webview.postMessage !== 'function') throw new TypeError('An entity header requires a webview panel.');
    const binding = validateHeaderOptions(options);
    if (this.headers.has(panel)) throw new Error('This entity header is already registered.');
    if (this.headers.size >= MAX_HEADERS) throw new RangeError(`No more than ${MAX_HEADERS} entity headers may be registered.`);
    this.headers.set(panel, binding);
    let active = true;
    let messageDisposable;
    const remove = () => { if (!active) return; active = false; messageDisposable?.dispose?.();this.headers.delete(panel); this.broadcast(); };
    messageDisposable=panel.webview.onDidReceiveMessage?.(message=>Promise.resolve(this.handleMessage(panel,message)).catch(()=>{}));
    const disposable = panel.onDidDispose?.(remove);
    this.broadcast();
    return { dispose: () => { disposable?.dispose?.(); remove(); } };
  }

  registerAdapter(input) {
    this._active();
    const adapter = validateAdapter(input);
    if (!this.adapters.has(adapter.id) && this.adapters.size >= MAX_ADAPTERS) throw new RangeError(`No more than ${MAX_ADAPTERS} entity adapters may be registered.`);
    if (this.adapters.has(adapter.id)) throw new Error(`Entity adapter ${adapter.id} is already registered.`);
    this.adapters.set(adapter.id, adapter);
    this.broadcast();
    let active = true;
    return { dispose: () => { if (!active) return; active = false; if (this.adapters.get(adapter.id) === adapter) this.adapters.delete(adapter.id); this.broadcast(); } };
  }

  ready() {
    if (!this.adapters.size) return false;
    for (const binding of this.headers.values()) if (!binding.observerOnly && !this.adapters.has(binding.adapterId)) return false;
    return true;
  }

  projection(snapshot = this.coordinator.snapshot()) {
    const ready = this.ready(), source = ready ? snapshot : { ...snapshot, entities:snapshot.entities.filter(item => item.identity === snapshot.activeIdentity), previousIdentity:'' };
    const normalized = normalizeHeaderProjection({ ...source, closedEntities:snapshot.closedEntities, canOpen:Boolean(this.openEntity) });
    return Object.freeze({ type:STATE_MESSAGE, revision:normalized.revision, activeIdentity:normalized.activeIdentity, previousIdentity:normalized.previousIdentity, canOpen:normalized.canOpen, entities:normalized.entities, closedEntities:normalized.closedEntities, status:this.status || (ready ? '' : 'Entity switching waits for safe viewer adapters.') });
  }

  broadcast() {
    if (this.disposed) return;
    const packet = this.projection();
    for (const panel of this.headers.keys()) this._post(panel, packet);
  }

  async handleMessage(panel, message) {
    this._active();
    if (!this.headers.has(panel)) return Object.freeze({ handled:false, status:'unregistered' });
    const intent = validateIntent(message);
    if (!intent) return Object.freeze({ handled:false, status:'invalid' });
    if (intent.type === READY_MESSAGE) { this._post(panel, this.projection()); return Object.freeze({ handled:true, status:'ready' }); }
    if (intent.type === OPEN_MESSAGE) return this._open(panel);
    const snapshot = this.coordinator.snapshot();
    if (intent.revision !== snapshot.revision) {
      this.status = 'The entity list changed. Review the refreshed selection and try again.';
      this._post(panel, this.projection());
      return Object.freeze({ handled:true, status:'stale', reason:this.status });
    }
    if(intent.type===CLOSE_MESSAGE||intent.type===RESTORE_MESSAGE){
      const action=intent.type===CLOSE_MESSAGE?this.closeEntity:this.restoreEntity,label=intent.type===CLOSE_MESSAGE?'Close Entity':'Restore Closed Entity';
      if(!action){this.status=`${label} is unavailable in this host.`;this._post(panel,this.projection());return Object.freeze({handled:true,status:'unavailable',reason:this.status});}
      try{const result=await action({identity:intent.identity,revision:intent.revision,panel});const outcome=plain(result)?result:{status:result===false?'unchanged':'completed'};this.status=['completed','closed','restored','unchanged'].includes(outcome.status)?'':reason(outcome.reason,`${label} ${outcome.status||'failed'}.`);this.broadcast();return Object.freeze({handled:true,...outcome});}
      catch(error){this.status=reason(error?.message||error,`${label} failed.`);this.broadcast();return Object.freeze({handled:true,status:'failed',reason:this.status});}
    }
    if([REORDER_MESSAGE,MOVE_MESSAGE,PIN_MESSAGE].includes(intent.type)){
      try{
        let changed=false;
        if(intent.type===PIN_MESSAGE)changed=this.coordinator.setPinned(intent.identity,intent.pinned);
        else if(intent.type===REORDER_MESSAGE)changed=this.coordinator.reorder(intent.identity,intent.beforeIdentity);
        else{
          const items=snapshot.entities,at=items.findIndex(item=>item.identity===intent.identity);if(at<0)throw new Error('The entity is no longer loaded.');
          const item=items[at],peers=items.filter(candidate=>candidate.pinned===item.pinned),peerAt=peers.findIndex(candidate=>candidate.identity===item.identity),next=peerAt+intent.direction;
          if(next>=0&&next<peers.length){const before=intent.direction<0?peers[next].identity:peers[next+1]?.identity||null;changed=this.coordinator.reorder(item.identity,before);}
        }
        this.status='';if(!changed)this._post(panel,this.projection());return Object.freeze({handled:true,status:changed?'reordered':'unchanged'});
      }catch(error){this.status=reason(error?.message||error,'Entity organization failed.');this._post(panel,this.projection());return Object.freeze({handled:true,status:'failed',reason:this.status});}
    }
    const identity = intent.type === PREVIOUS_MESSAGE ? snapshot.previousIdentity : intent.identity;
    if (!this.ready()&&!(this.focusEntity&&identity===snapshot.activeIdentity&&!snapshot.pending)) {
      this.status = 'Entity switching is unavailable until every open entity-dependent header has a safe retarget adapter.';
      this.broadcast();
      return Object.freeze({ handled:true, status:'unavailable', reason:this.status });
    }

    if (!identity) return Object.freeze({ handled:true, status:'unavailable', reason:'No previous loaded entity is available.' });
    this.status = 'Preparing synchronized entity switch…'; this.broadcast();
    const result = await this.coordinator.switchTo(identity, this._hooks());
    let focusStatus='';
    if(this.focusEntity&&['committed','unchanged'].includes(result.status)){
      const settled=this.coordinator.snapshot(),selectionCurrent=()=>!this.disposed&&this.coordinator.snapshot().generation===settled.generation&&this.coordinator.snapshot().activeIdentity===identity&&!this.coordinator.snapshot().pending,isCurrent=()=>this.headers.has(panel)&&selectionCurrent();
      try{if(!isCurrent())throw new Error('The entity selection changed before opening its viewer.');const focused=accepted(await this.focusEntity({identity,panel,descriptor:settled.entities.find(item=>item.identity===identity),surfaceId:this.headers.get(panel)?.surfaceId,isCurrent,selectionCurrent}),'The entity viewer could not be opened.');if(!selectionCurrent())throw new Error('The entity selection changed while its viewer was opening.');focusStatus=focused.ok?'focused':'unavailable';this.status=focused.ok?'':focused.reason;}
      catch(error){focusStatus='unavailable';this.status=reason(error?.message||error,'The entity viewer could not be opened.');}
    }else this.status = result.status === 'committed' ? '' : reason(result.reason, `Entity switch ${result.status}.`);
    this.broadcast();
    return Object.freeze({ handled:true, ...result,...(focusStatus?{focusStatus,focusReason:this.status}:{}) });
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.subscription?.dispose?.();
    this.headers.clear(); this.adapters.clear();
    return true;
  }

  _hooks() {
    const adapterList = [...this.adapters.values()];
    const pinned = adapter => typeof adapter.transferPinned === 'function' ? adapter.transferPinned() === true : adapter.transferPinned === true;
    return {
      prepare: async transaction => {
        const entries = [], captures = new Map();
        const retainCaptures = () => {
          // A superseded preparation must never overwrite a newer request's
          // capture. Ordinary validation/prepare cancellation is not aborted,
          // so its safely captured source UI state is still retained below.
          if (transaction.signal?.aborted) return { ok:true };
          if (!captures.size || !transaction.fromIdentity) return { ok:true };
          try {
            const merged = mergeAdapterRetainedState(transaction.fromState, captures);
            this.coordinator.retain(transaction.fromIdentity, merged);
            return { ok:true };
          } catch (error) {
            return { ok:false, reason:`Retained entity state was rejected: ${reason(error?.message || error, 'unknown failure')}` };
          }
        };
        const cancel = failureReason => {
          const retained = retainCaptures();
          return { ok:false, reason:retained.ok ? failureReason : retained.reason, entries };
        };
        for (const adapter of adapterList) {
          let isPinned;
          try { isPinned = pinned(adapter); }
          catch (error) { return cancel(`${adapter.surfaceId} could not verify its Transfer pin: ${reason(error?.message || error, 'unknown failure')}`); }
          if (isPinned) { entries.push({ adapter, pinned:true, prepared:null }); continue; }
          let supportValue;
          try { supportValue = await adapter.supports(transaction); }
          catch (error) { return cancel(`${adapter.surfaceId} support check failed: ${reason(error?.message || error, 'unknown failure')}`); }
          const support = accepted(supportValue, `${adapter.surfaceId} cannot retarget to this entity.`);
          if (!support.ok) return cancel(support.reason);
          let prepared;
          try { prepared = await adapter.prepare(transaction); }
          catch (error) {
            entries.push({ adapter, pinned:false, prepared:undefined });
            return cancel(`${adapter.surfaceId} could not safely retain its current work: ${reason(error?.message || error, 'unknown failure')}`);
          }
          entries.push({ adapter, pinned:false, prepared });
          if (plain(prepared) && Object.prototype.hasOwnProperty.call(prepared, 'retainedState')) {
            try { captures.set(adapter.id, cloneRetained(prepared.retainedState)); }
            catch (error) { return cancel(`${adapter.surfaceId} returned invalid retained state: ${reason(error?.message || error, 'unknown failure')}`); }
          }
          const verdict = accepted(prepared, `${adapter.surfaceId} could not safely retain its current work.`);
          if (!verdict.ok) return cancel(verdict.reason);
        }
        if (!entries.some(entry => !entry.pinned)) return cancel('Only Transfer-pinned adapters are open; the normal entity context was not changed.');
        const retained = retainCaptures();
        if (!retained.ok) return { ok:false, reason:retained.reason, entries };
        return { ok:true, entries };
      },
      validate: async (_transaction, batch) => {
        for (const entry of batch.entries || []) {
          if (entry.pinned) continue;
          const verdict = accepted(await entry.adapter.validate(_transaction, entry.prepared), `${entry.adapter.surfaceId} rejected the retained switch state.`);
          if (!verdict.ok) return verdict;
        }
        return true;
      },
      commit: async (transaction, batch) => {
        for (const entry of batch.entries || []) if (!entry.pinned) await entry.adapter.commit(transaction, entry.prepared);
      },
      rollback: async (transaction, batch, rollbackReason) => {
        const failures = [];
        for (const entry of [...(batch?.entries || [])].reverse()) {
          if (entry.pinned) continue;
          try { await entry.adapter.rollback(transaction, entry.prepared, rollbackReason); }
          catch (error) { failures.push(`${entry.adapter.surfaceId}: ${reason(error?.message || error, 'rollback failed')}`); }
        }
        if (failures.length) throw new Error(failures.join('; '));
      }
    };
  }

  async _open(panel) {
    if (!this.openEntity) return Object.freeze({ handled:true, status:'unavailable', reason:'No host-owned Open Entity route is registered.' });
    const capture = this.coordinator.snapshot();
    let result;
    try { result = await this.openEntity(Object.freeze({ panel, revision:capture.revision, activeIdentity:capture.activeIdentity })); }
    catch (error) { result = { status:'failed', reason:reason(error?.message || error, 'Open Entity failed.') }; }
    if(this.disposed||!this.headers.has(panel))return Object.freeze({handled:true,status:'cancelled',reason:'The requesting entity header closed while Open Entity was in progress.'});
    const afterOpen=this.coordinator.snapshot(),beforePending=capture.pending?.generation??null,afterPending=afterOpen.pending?.generation??null;
    if(afterOpen.activeIdentity!==capture.activeIdentity||afterPending!==beforePending){
      this.status='A newer entity switch took priority while Open Entity was in progress. The loaded entity remains available, but was not adopted.';
      this.broadcast();
      return Object.freeze({handled:true,status:'cancelled',reason:this.status});
    }
    const allowed = new Set(['opened','cancelled','failed','unavailable']);
    let status = plain(result) && allowed.has(result.status) ? result.status : 'failed', switchResult=null;
    if(status==='opened'){
      const identity=bounded(result.identity)?result.identity:'';
      if(!identity||!this.coordinator.snapshot().entities.some(item=>item.identity===identity)){status='failed';result={reason:'Open Entity did not register one exact bounded entity identity.'};}
      else if(!this.ready()){status='unavailable';result={reason:'The entity was loaded, but switching waits for safe adapters on every open entity-dependent header.'};}
      else{switchResult=await this.coordinator.switchTo(identity,this._hooks());status=['committed','unchanged'].includes(switchResult.status)?'opened':switchResult.status==='cancelled'?'cancelled':'failed';if(status==='failed')result={reason:switchResult.reason||'The loaded entity could not be adopted safely.'};}
    }
    const message = status === 'failed' || status === 'unavailable' ? reason(result?.reason, `Open Entity ${status}.`) : '';
    this.status = message;
    this.broadcast();
    return Object.freeze({ handled:true, status, reason:message, ...(switchResult?{switchResult}:{}) });
  }

  _post(panel, packet) { Promise.resolve(panel.webview.postMessage(packet)).catch(() => {}); }
  _active() { if (this.disposed) throw new Error('Entity switch host has been disposed.'); }
}

function createEntitySwitchHost(options) { return new EntitySwitchHost(options); }

module.exports = {
  MAX_HEADERS, MAX_ADAPTERS, ADAPTER_RETAINED_STATE_KEY, validateIntent, validateAdapter, mergeAdapterRetainedState,
  EntitySwitchHost, createEntitySwitchHost
};
