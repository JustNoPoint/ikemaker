'use strict';

const crypto = require('crypto');

const SCHEMA = 'ikemaker.asset-transfer-session';
const VERSION = 1;
const KINDS = new Set(['sff', 'air', 'snd']);
const ROLES = new Set(['source', 'destination']);
const METHODS = new Set(['copy-selected', 'drag-drop']);
const MAX_SELECTION = 4096;
const MAX_MAPPINGS = 4096;
const MAX_RESULT_DETAILS = 4096;
const MAX_ID_BYTES = 4096;
const MAX_LABEL_BYTES = 512;
const SHA256 = /^[A-F0-9]{64}$/;

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError(`${label}.${key} cannot be an accessor.`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  plain(value, label);
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) if (!permitted.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`);
}

function boundedString(value, label, maximum = MAX_ID_BYTES, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.length) || Buffer.byteLength(value, 'utf8') > maximum || value.includes('\0')) throw new TypeError(`${label} is invalid.`);
  return value;
}

function fingerprint(value, label) {
  const normalized = boundedString(value, label, 64).toUpperCase();
  if (!SHA256.test(normalized)) throw new TypeError(`${label} must be an exact SHA-256 fingerprint.`);
  return normalized;
}

function natural(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex').toUpperCase(); }

function endpointIdentity(endpoint) { return `${endpoint.kind}\0${endpoint.entityIdentity}\0${endpoint.fileIdentity}`; }

function normalizeEndpoint(value, role, expectedKind) {
  exactKeys(value, ['kind', 'entityIdentity', 'fileIdentity', 'fingerprint', 'label'], `${role} endpoint`);
  if (!ROLES.has(role)) throw new TypeError('Transfer endpoint role is invalid.');
  const kind = boundedString(value.kind, `${role} endpoint kind`, 16).toLowerCase();
  if (!KINDS.has(kind) || kind !== expectedKind) throw new TypeError(`${role} endpoint must use the session asset kind.`);
  const endpoint = {
    role,
    pinned: true,
    kind,
    entityIdentity: boundedString(value.entityIdentity, `${role} entity identity`),
    fileIdentity: boundedString(value.fileIdentity, `${role} file identity`),
    fingerprint: fingerprint(value.fingerprint, `${role} endpoint fingerprint`),
    label: boundedString(value.label || value.fileIdentity, `${role} endpoint label`, MAX_LABEL_BYTES)
  };
  endpoint.identity = endpointIdentity(endpoint);
  return deepFreeze(endpoint);
}

function distinctEndpoints(source, destination) {
  if (source.identity === destination.identity) throw new Error('Transfer source and destination must be different exact endpoints.');
  if (source.kind === destination.kind && source.fileIdentity === destination.fileIdentity) throw new Error('Transfer source and destination must use different physical asset files.');
}

function normalizeSelectionItem(value, index) {
  exactKeys(value, ['id', 'contentFingerprint', 'label', 'physicalIndex', 'metadataFingerprint'], `Selection item ${index + 1}`);
  const item = {
    id: boundedString(value.id, `Selection item ${index + 1} identity`),
    contentFingerprint: fingerprint(value.contentFingerprint, `Selection item ${index + 1} content fingerprint`),
    label: boundedString(value.label || value.id, `Selection item ${index + 1} label`, MAX_LABEL_BYTES)
  };
  if (value.physicalIndex !== undefined) item.physicalIndex = natural(value.physicalIndex, `Selection item ${index + 1} physical index`);
  if (value.metadataFingerprint !== undefined) item.metadataFingerprint = fingerprint(value.metadataFingerprint, `Selection item ${index + 1} metadata fingerprint`);
  return deepFreeze(item);
}

function normalizeSelection(value, label = 'Transfer selection') {
  if (!Array.isArray(value) || value.length > MAX_SELECTION) throw new TypeError(`${label} must contain at most ${MAX_SELECTION} items.`);
  const selected = value.map(normalizeSelectionItem), identities = new Set();
  for (const item of selected) {
    const identity = `${item.id}\0${item.physicalIndex ?? ''}`;
    if (identities.has(identity)) throw new Error(`${label} contains duplicate exact item ${item.id}.`);
    identities.add(identity);
  }
  return deepFreeze(selected);
}

function baseEffects() { return deepFreeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false }); }

function normalizeSessionInput(input) {
  exactKeys(input, ['kind', 'source', 'destination', 'sessionId', 'sourceSelection', 'destinationSelection'], 'Transfer session');
  const kind = boundedString(input.kind, 'Transfer asset kind', 16).toLowerCase();
  if (!KINDS.has(kind)) throw new TypeError('Transfer asset kind must be sff, air, or snd.');
  const source = normalizeEndpoint(input.source, 'source', kind), destination = normalizeEndpoint(input.destination, 'destination', kind);
  distinctEndpoints(source, destination);
  return { kind, source, destination, sessionId: boundedString(input.sessionId || crypto.randomUUID(), 'Transfer session identity', 128), sourceSelection: normalizeSelection(input.sourceSelection || [], 'Source selection'), destinationSelection: normalizeSelection(input.destinationSelection || [], 'Destination selection') };
}

function createTransferSession(input) {
  const value = normalizeSessionInput(input);
  return deepFreeze({ schema: SCHEMA, version: VERSION, sessionId: value.sessionId, kind: value.kind, generation: 0, revision: 0, status: 'active', source: value.source, destination: value.destination, selections: { source: value.sourceSelection, destination: value.destinationSelection }, pendingReview: null, mappings: [], result: null, effects: baseEffects() });
}

function assertSession(session) {
  plain(session, 'Transfer session');
  if (session.schema !== SCHEMA || session.version !== VERSION || !KINDS.has(session.kind) || !Number.isSafeInteger(session.generation) || !Number.isSafeInteger(session.revision)) throw new TypeError('Transfer session authority is invalid.');
  return session;
}

function next(session, patch, generationChange = false) {
  assertSession(session);
  return deepFreeze({ ...session, ...patch, generation: session.generation + (generationChange ? 1 : 0), revision: session.revision + 1, effects: baseEffects() });
}

function setTransferSelection(session, role, selection) {
  assertSession(session);
  if (!ROLES.has(role)) throw new TypeError('Transfer selection role must be source or destination.');
  const normalized = normalizeSelection(selection, `${role} selection`);
  return next(session, { selections: { ...session.selections, [role]: normalized }, pendingReview: null, result: null });
}

function swapTransferEndpoints(session) {
  assertSession(session);
  if (session.status !== 'active') throw new Error('A cancelled Transfer session cannot swap endpoints.');
  const source = deepFreeze({ ...session.destination, role: 'source' }), destination = deepFreeze({ ...session.source, role: 'destination' });
  return next(session, { source, destination, selections: { source: session.selections.destination, destination: session.selections.source }, pendingReview: null, mappings: [], result: null }, true);
}

function changeTransferEndpoint(session, role, endpoint) {
  assertSession(session);
  if (!ROLES.has(role)) throw new TypeError('Transfer endpoint role must be source or destination.');
  if (session.status !== 'active') throw new Error('A cancelled Transfer session cannot change endpoints.');
  const normalized = normalizeEndpoint(endpoint, role, session.kind), source = role === 'source' ? normalized : session.source, destination = role === 'destination' ? normalized : session.destination;
  distinctEndpoints(source, destination);
  return next(session, { [role]: normalized, selections: { ...session.selections, [role]: deepFreeze([]) }, pendingReview: null, mappings: [], result: null }, true);
}

function normalizeBoundary(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['kind', 'id', 'position'], 'Transfer destination boundary');
  return deepFreeze({ kind: boundedString(value.kind, 'Destination boundary kind', 32), id: boundedString(value.id, 'Destination boundary identity'), position: natural(value.position, 'Destination boundary position') });
}

function createTransferRequest(session, input = {}) {
  assertSession(session); exactKeys(input, ['method', 'selection', 'boundary'], 'Transfer request');
  if (session.status !== 'active') throw new Error('A cancelled Transfer session cannot create requests.');
  const method = input.method || 'copy-selected';
  if (!METHODS.has(method)) throw new TypeError('Transfer request method must be copy-selected or drag-drop.');
  const selection = normalizeSelection(input.selection || session.selections.source, 'Transfer request selection');
  if (!selection.length) throw new Error('Select at least one source asset before starting a transfer review.');
  const boundary = normalizeBoundary(input.boundary), authority = {
    sessionId: session.sessionId,
    kind: session.kind,
    generation: session.generation,
    revision: session.revision,
    sourceIdentity: session.source.identity,
    sourceFingerprint: session.source.fingerprint,
    destinationIdentity: session.destination.identity,
    destinationFingerprint: session.destination.fingerprint,
    selection,
    boundary
  };
  return deepFreeze({ schema: `${SCHEMA}.request`, version: VERSION, ...authority, initiatedBy: method, requestIdentity: digest(authority), effects: baseEffects() });
}

function requestStillCurrent(session, request) {
  try {
    assertSession(session); plain(request, 'Transfer request');
    if (!METHODS.has(request.initiatedBy) || request.schema !== `${SCHEMA}.request` || request.version !== VERSION) return false;
    const authority = {
      sessionId: request.sessionId, kind: request.kind, generation: request.generation, revision: request.revision,
      sourceIdentity: request.sourceIdentity, sourceFingerprint: request.sourceFingerprint,
      destinationIdentity: request.destinationIdentity, destinationFingerprint: request.destinationFingerprint,
      selection: normalizeSelection(request.selection, 'Transfer request selection'), boundary: normalizeBoundary(request.boundary)
    };
    const staged = session.pendingReview?.request?.requestIdentity === request.requestIdentity && request.revision + 1 === session.revision;
    return request.requestIdentity === digest(authority) && request.sessionId === session.sessionId && request.kind === session.kind && request.generation === session.generation && (request.revision === session.revision || staged) && request.sourceIdentity === session.source.identity && request.sourceFingerprint === session.source.fingerprint && request.destinationIdentity === session.destination.identity && request.destinationFingerprint === session.destination.fingerprint;
  } catch { return false; }
}

function normalizeReview(value) {
  exactKeys(value, ['status', 'reviewFingerprint', 'summary'], 'Transfer review');
  const status = boundedString(value.status, 'Transfer review status', 32).toLowerCase();
  if (!['ready', 'blocked'].includes(status)) throw new TypeError('Transfer review status must be ready or blocked.');
  return deepFreeze({ status, reviewFingerprint: fingerprint(value.reviewFingerprint, 'Transfer review fingerprint'), summary: boundedString(value.summary || status, 'Transfer review summary', MAX_ID_BYTES) });
}

function stageTransferReview(session, request, review) {
  if (!requestStillCurrent(session, request)) throw new Error('The Transfer request is stale; create a fresh review.');
  const normalized = normalizeReview(review);
  return next(session, { pendingReview: deepFreeze({ request, ...normalized }), result: null });
}

function cancelTransferReview(session) {
  assertSession(session);
  if (!session.pendingReview) return session;
  return next(session, { pendingReview: null });
}

function normalizeMapping(value, session) {
  exactKeys(value, ['sourceId', 'sourceContentFingerprint', 'destinationId', 'destinationContentFingerprint', 'paletteFingerprint', 'destinationPhysicalIndex', 'destinationPhysicalOccurrence'], 'Transfer mapping');
  const mapping = {
    sourceId: boundedString(value.sourceId, 'Mapping source identity'),
    sourceContentFingerprint: fingerprint(value.sourceContentFingerprint, 'Mapping source content fingerprint'),
    destinationId: boundedString(value.destinationId, 'Mapping destination identity'),
    destinationContentFingerprint: fingerprint(value.destinationContentFingerprint, 'Mapping destination content fingerprint'),
    sourceEndpointIdentity: session.source.identity,
    sourceEndpointFingerprint: session.source.fingerprint,
    destinationEndpointIdentity: session.destination.identity,
    destinationEndpointFingerprint: session.destination.fingerprint
  };
  if (value.paletteFingerprint !== undefined) mapping.paletteFingerprint = fingerprint(value.paletteFingerprint, 'Mapping palette fingerprint');
  const hasPhysicalIndex = value.destinationPhysicalIndex !== undefined, hasPhysicalOccurrence = value.destinationPhysicalOccurrence !== undefined;
  if (hasPhysicalIndex !== hasPhysicalOccurrence) throw new Error('Transfer mapping physical index and occurrence must be provided together.');
  if (hasPhysicalIndex) {
    if (session.kind !== 'sff') throw new Error('Physical sprite occurrence mappings are valid only for SFF Transfer.');
    mapping.destinationPhysicalIndex = natural(value.destinationPhysicalIndex, 'Mapping Destination physical index');
    mapping.destinationPhysicalOccurrence = natural(value.destinationPhysicalOccurrence, 'Mapping Destination physical occurrence');
  }
  mapping.evidenceFingerprint = digest(mapping);
  return deepFreeze(mapping);
}

function rememberTransferMapping(session, value) {
  assertSession(session);
  if (session.status !== 'active') throw new Error('A cancelled Transfer session cannot remember mappings.');
  const mapping = normalizeMapping(value, session), mappings = session.mappings.filter(item => item.sourceId !== mapping.sourceId);
  if (mappings.length >= MAX_MAPPINGS) throw new Error(`Transfer mapping count cannot exceed ${MAX_MAPPINGS}.`);
  mappings.push(mapping);
  return next(session, { mappings: deepFreeze(mappings), pendingReview: null, result: null });
}

function reusableTransferMapping(session, sourceId, sourceContentFingerprint, paletteFingerprint) {
  assertSession(session);
  const id = boundedString(sourceId, 'Mapping lookup source identity'), content = fingerprint(sourceContentFingerprint, 'Mapping lookup content fingerprint'), palette = paletteFingerprint === undefined ? undefined : fingerprint(paletteFingerprint, 'Mapping lookup palette fingerprint');
  return session.mappings.find(item => item.sourceId === id && item.sourceContentFingerprint === content && item.sourceEndpointIdentity === session.source.identity && item.sourceEndpointFingerprint === session.source.fingerprint && item.destinationEndpointIdentity === session.destination.identity && item.destinationEndpointFingerprint === session.destination.fingerprint && (palette === undefined || item.paletteFingerprint === palette)) || null;
}

function normalizeResultDetail(value, index) {
  exactKeys(value, ['id', 'status', 'destinationId', 'message'], `Transfer result detail ${index + 1}`);
  const status = boundedString(value.status, `Transfer result detail ${index + 1} status`, 32).toLowerCase();
  if (!['added', 'replaced', 'skipped', 'failed'].includes(status)) throw new TypeError('Transfer result detail status is invalid.');
  const detail = { id: boundedString(value.id, `Transfer result detail ${index + 1} identity`), status, message: boundedString(value.message || status, `Transfer result detail ${index + 1} message`, MAX_ID_BYTES) };
  if (value.destinationId !== undefined) detail.destinationId = boundedString(value.destinationId, `Transfer result detail ${index + 1} destination identity`);
  return deepFreeze(detail);
}

function projectTransferResult(session, request, details) {
  assertSession(session);
  if (!requestStillCurrent(session, request) || session.pendingReview?.request?.requestIdentity !== request.requestIdentity || session.pendingReview.status !== 'ready') throw new Error('Only the current ready Transfer review can produce a result projection.');
  if (!Array.isArray(details) || details.length > MAX_RESULT_DETAILS) throw new TypeError(`Transfer result must contain at most ${MAX_RESULT_DETAILS} details.`);
  const normalized = details.map(normalizeResultDetail), counts = { added: 0, replaced: 0, skipped: 0, failed: 0 };
  for (const detail of normalized) counts[detail.status]++;
  const completed = counts.added + counts.replaced, status = counts.failed ? completed ? 'partial-failure' : 'failed' : 'completed';
  return deepFreeze({ schema: `${SCHEMA}.result`, version: VERSION, sessionId: session.sessionId, requestIdentity: request.requestIdentity, status, counts, details: normalized, sourceUnchanged: true, requiresRecovery: counts.failed > 0, effects: baseEffects() });
}

function recordTransferResult(session, request, details) {
  const result = projectTransferResult(session, request, details);
  return next(session, { result, pendingReview: null });
}

function finalizeTransferApply(session, request, details, destination, mappings = []) {
  assertSession(session);
  const result = projectTransferResult(session, request, details);
  if (result.counts.failed || result.requiresRecovery) throw new Error('A failed or recovery-required Transfer result cannot rebase the Destination endpoint.');
  const rebased = normalizeEndpoint(destination, 'destination', session.kind);
  if (rebased.entityIdentity !== session.destination.entityIdentity || rebased.fileIdentity !== session.destination.fileIdentity) throw new Error('A verified Transfer Apply may only rebase the same exact Destination entity and physical file.');
  if (!Array.isArray(mappings) || mappings.length > MAX_MAPPINGS) throw new TypeError(`Transfer mappings must contain at most ${MAX_MAPPINGS} items.`);
  const working = { ...session, destination: rebased }, selected = new Map(request.selection.map(item => [item.id, item])), outcomes = new Map(result.details.filter(item => item.status === 'added' || item.status === 'replaced').map(item => [item.id, item])), normalized = [], sourceIds = new Set();
  for (const value of mappings) {
    const source = selected.get(value?.sourceId), outcome = outcomes.get(value?.sourceId);
    if (!source || !outcome || outcome.destinationId !== value.destinationId) throw new Error('A verified Transfer mapping must match one copied result item and its exact Destination identity.');
    if (String(value.sourceContentFingerprint || '').toUpperCase() !== source.contentFingerprint) throw new Error('A verified Transfer mapping source fingerprint does not match the reviewed selection.');
    if (sourceIds.has(value.sourceId)) throw new Error(`Transfer mappings repeat source item ${value.sourceId}.`);
    sourceIds.add(value.sourceId); normalized.push(normalizeMapping(value, working));
  }
  if (normalized.length !== outcomes.size) throw new Error('Every added or replaced Transfer result requires one verified content mapping.');
  return next(session, { destination: rebased, selections: { ...session.selections, destination: deepFreeze([]) }, mappings: deepFreeze(normalized), result, pendingReview: null }, true);
}

function cancelTransferSession(session) {
  assertSession(session);
  if (session.status === 'cancelled') return session;
  return next(session, { status: 'cancelled', pendingReview: null, mappings: [], result: null }, true);
}

module.exports = {
  SCHEMA, VERSION, MAX_SELECTION, MAX_MAPPINGS, MAX_RESULT_DETAILS,
  createTransferSession, setTransferSelection, swapTransferEndpoints, changeTransferEndpoint,
  createTransferRequest, requestStillCurrent, stageTransferReview, cancelTransferReview,
  rememberTransferMapping, reusableTransferMapping, projectTransferResult, recordTransferResult,
  finalizeTransferApply,
  cancelTransferSession, endpointIdentity
};
