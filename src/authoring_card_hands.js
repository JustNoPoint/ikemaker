'use strict';

const SCHEMA = 'ikemaker.authoring-card-hands';
const VERSION = 1;
const MAX_CONTEXTS = 32;
const MAX_HANDS = 64;
const MAX_FILES = 512;
const MAX_MEMBERSHIPS = 512;
const MAX_TOTAL_BYTES = 256 * 1024;
const MAX_CONTEXT_ID_BYTES = 8192;
const MAX_ID_BYTES = 8192;
const MAX_HAND_ID_BYTES = 256;
const MAX_LABEL_BYTES = 128;
const HAND_ID_PATTERN = /^hand-[a-f0-9]{32}$/;

function plain(value) { return value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype; }
function exact(value, keys) { return plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function bounded(value, bytes, empty = false) { return typeof value === 'string' && (empty || value.length > 0) && Buffer.byteLength(value, 'utf8') <= bytes; }
function validLabel(value) { return bounded(value, MAX_LABEL_BYTES) && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value); }
function frozenClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenClone));
  if (plain(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, frozenClone(child)])));
  return value;
}

function validateRecord(value) {
  if (!exact(value, ['contextId','handOrder','hands','fileOrder','collapsedHandIds','mode']) || !bounded(value.contextId, MAX_CONTEXT_ID_BYTES) || !['tabs','cards'].includes(value.mode) || !Array.isArray(value.hands) || value.hands.length > MAX_HANDS || !Array.isArray(value.handOrder) || value.handOrder.length > MAX_HANDS || !Array.isArray(value.fileOrder) || value.fileOrder.length > MAX_FILES || !Array.isArray(value.collapsedHandIds) || value.collapsedHandIds.length > MAX_HANDS) return null;
  const fileOrder = [], files = new Set();
  for (const id of value.fileOrder) {
    if (!bounded(id, MAX_ID_BYTES) || files.has(id)) return null;
    files.add(id); fileOrder.push(id);
  }
  const hands = [], handIds = new Set(), memberships = new Set();
  for (const hand of value.hands) {
    if (!exact(hand, ['id','label','memberIds']) || !HAND_ID_PATTERN.test(hand.id) || !validLabel(hand.label) || !Array.isArray(hand.memberIds) || hand.memberIds.length > MAX_MEMBERSHIPS) return null;
    if (handIds.has(hand.id)) return null;
    handIds.add(hand.id);
    const memberIds = [];
    for (const id of hand.memberIds) {
      if (!bounded(id, MAX_ID_BYTES) || !files.has(id) || memberships.has(id)) return null;
      memberships.add(id); memberIds.push(id);
    }
    if (memberships.size > MAX_MEMBERSHIPS) return null;
    hands.push({ id:hand.id, label:hand.label, memberIds });
  }
  if (value.handOrder.length !== hands.length || new Set(value.handOrder).size !== hands.length || value.handOrder.some((id) => !handIds.has(id))) return null;
  if (new Set(value.collapsedHandIds).size !== value.collapsedHandIds.length || value.collapsedHandIds.some((id) => !handIds.has(id))) return null;
  return frozenClone({ contextId:value.contextId, handOrder:[...value.handOrder], hands, fileOrder, collapsedHandIds:[...value.collapsedHandIds], mode:value.mode });
}

function validateEnvelope(value) {
  if (!exact(value, ['schema','version','contexts']) || value.schema !== SCHEMA || value.version !== VERSION || !Array.isArray(value.contexts) || value.contexts.length > MAX_CONTEXTS) return null;
  const contexts = [], ids = new Set();
  for (const supplied of value.contexts) {
    const record = validateRecord(supplied);
    if (!record || ids.has(record.contextId)) return null;
    ids.add(record.contextId); contexts.push(record);
  }
  const canonical = { schema:SCHEMA, version:VERSION, contexts };
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(canonical), 'utf8'); } catch (_) { return null; }
  return bytes <= MAX_TOTAL_BYTES ? frozenClone(canonical) : null;
}

function emptyRecord(contextId, fileIds = []) {
  return frozenClone({ contextId, handOrder:[], hands:[], fileOrder:[...fileIds], collapsedHandIds:[], mode:'tabs' });
}

function reconcileCardHands(contextId, supplied, naturalIds) {
  if (!bounded(contextId, MAX_CONTEXT_ID_BYTES)) throw new Error('Card-hand context identity is invalid.');
  if (Array.isArray(naturalIds) && naturalIds.length > MAX_FILES) throw new Error('Card-hand file count exceeds the safe limit.');
  const natural = [], known = new Set();
  for (const value of Array.isArray(naturalIds) ? naturalIds.slice(0, MAX_FILES) : []) {
    const id = String(value || '');
    if (!bounded(id, MAX_ID_BYTES) || known.has(id)) continue;
    known.add(id); natural.push(id);
  }
  const valid = supplied ? validateRecord(supplied) : null;
  const prior = valid && valid.contextId === contextId ? valid : emptyRecord(contextId);
  const fileOrder = [...prior.fileOrder.filter((id) => known.has(id)), ...natural.filter((id) => !prior.fileOrder.includes(id))];
  const handsById = new Map(prior.hands.map((hand) => [hand.id, hand]));
  const handOrder = prior.handOrder.filter((id) => handsById.has(id));
  const placed = new Set(), hands = handOrder.map((id) => {
    const hand = handsById.get(id), memberIds = hand.memberIds.filter((memberId) => known.has(memberId) && !placed.has(memberId));
    memberIds.forEach((memberId) => placed.add(memberId));
    return { id:hand.id, label:hand.label, memberIds };
  });
  return frozenClone({ contextId, handOrder, hands, fileOrder, collapsedHandIds:prior.collapsedHandIds.filter((id) => handOrder.includes(id)), mode:prior.mode });
}

class AuthoringCardHandsStore {
  constructor(storage, key) {
    this.storage = storage;
    this.key = key;
    this.envelope = validateEnvelope(storage?.get?.(key)) || frozenClone({ schema:SCHEMA, version:VERSION, contexts:[] });
    this.queue = Promise.resolve();
    this.revision = 0;
    this.contextRevisions = new Map(this.envelope.contexts.map((record) => [record.contextId,0]));
  }
  get(contextId) { return this.envelope.contexts.find((record) => record.contextId === contextId) || null; }
  getWithRevision(contextId) { return Object.freeze({ record:this.get(contextId), revision:this.contextRevisions.get(contextId) || 0 }); }
  set(contextId, supplied, authorize = () => true, options = {}) {
    const operation = this.queue.then(async () => {
      const record = validateRecord(supplied);
      if (!record || record.contextId !== contextId) throw new Error('Card-hand metadata is invalid.');
      const expectedRevision=options?.expectedRevision;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Card-hand metadata revision is invalid.');
      const currentRevision=this.contextRevisions.get(contextId)||0;
      if (expectedRevision !== currentRevision) { const error=new Error('Coding Viewer tab organization changed in another panel.');error.code='STALE_CARD_HANDS';throw error; }
      if (!authorize()) throw new Error('Card-hand metadata authority changed before persistence.');
      const previous = this.envelope, contexts = previous.contexts.filter((item) => item.contextId !== contextId);
      if (contexts.length >= MAX_CONTEXTS) throw new Error('The Coding Viewer card-hand context limit was reached.');
      const candidate = validateEnvelope({ schema:SCHEMA, version:VERSION, contexts:[...contexts,record] });
      if (!candidate) throw new Error('Card-hand metadata exceeds its safe storage bounds.');
      if (!authorize()) throw new Error('Card-hand metadata authority changed before persistence.');
      await this.storage.update(this.key, candidate);
      if (!authorize()) {
        try { await this.storage.update(this.key, previous); this.envelope = previous; }
        catch (rollbackError) {
          this.envelope = previous;
          throw new Error(`Unsafe card-hand persistence failure: authority changed and rollback failed; durable layout may need reload (${rollbackError.message || rollbackError}).`);
        }
        throw new Error('Card-hand metadata authority changed during persistence; the prior metadata was restored.');
      }
      this.envelope = candidate; this.revision += 1; this.contextRevisions.set(contextId,currentRevision+1);
      return Object.freeze({ record, revision:currentRevision+1 });
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  serialize() { return this.envelope; }
}

const sharedStores=new WeakMap();
function sharedAuthoringCardHandsStore(storage,key){
  if(!storage||typeof storage!=='object')return new AuthoringCardHandsStore(storage,key);
  let stores=sharedStores.get(storage);if(!stores){stores=new Map();sharedStores.set(storage,stores);}
  if(!stores.has(key))stores.set(key,new AuthoringCardHandsStore(storage,key));
  return stores.get(key);
}

module.exports = {
  SCHEMA, VERSION, MAX_CONTEXTS, MAX_HANDS, MAX_FILES, MAX_MEMBERSHIPS, MAX_TOTAL_BYTES, MAX_CONTEXT_ID_BYTES, MAX_ID_BYTES, MAX_HAND_ID_BYTES, MAX_LABEL_BYTES, HAND_ID_PATTERN,
  validateRecord, validateEnvelope, emptyRecord, reconcileCardHands, AuthoringCardHandsStore, sharedAuthoringCardHandsStore
};
