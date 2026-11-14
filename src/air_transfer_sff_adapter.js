'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { requestStillCurrent, validateTransferMappingEvidence } = require('./asset_transfer_session');

const CONTINUATION_SCHEMA = 'ikemaker.air-transfer-sff-continuation';
const RECEIPT_SCHEMA = 'ikemaker.air-transfer-sff-receipt';
const VERSION = 1;
const MAX_DEPENDENCIES = 4096;
const SHA256 = /^[A-F0-9]{64}$/;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value); }
function deeplyFrozen(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => deeplyFrozen(item, seen)); }
function safeTree(value, label, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value) || seen.has(value)) throw new TypeError(`${label} must contain only acyclic plain data.`);
  seen.add(value); const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new TypeError(`${label} must contain only plain data.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).filter(key => descriptors[key].enumerable), own = Reflect.ownKeys(value).filter(key => !(array && key === 'length'));
  if (own.length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))) throw new TypeError(`${label} cannot contain accessors or hidden fields.`);
  if (array) for (let index = 0; index < value.length; index += 1) if (!descriptors[String(index)] || !Object.prototype.hasOwnProperty.call(descriptors[String(index)], 'value')) throw new TypeError(`${label} arrays must be dense.`);
  for (const key of keys) safeTree(descriptors[key].value, `${label}.${key}`, seen);
  seen.delete(value);
}
function exactObject(value, keys, label) {
  safeTree(value, label); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  const expected = new Set(keys), actual = Object.keys(value); for (const key of actual) if (!expected.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`); for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label} is missing ${key}.`); return value;
}
function fingerprint(value, label) { const normalized = typeof value === 'string' ? value.toUpperCase() : ''; if (!SHA256.test(normalized)) throw new TypeError(`${label} must be an exact SHA-256 fingerprint.`); return normalized; }
function boundedString(value, label, maximum = 4096, allowAuthoritySeparator = false) { if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > maximum || !allowAuthoritySeparator && value.includes('\0')) throw new TypeError(`${label} is invalid.`); return value; }
function natural(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`); return value; }
function parseSpriteIdentity(value, label) { const match = /^(-?\d+),(-?\d+)$/.exec(String(value || '')); if (!match) throw new Error(`${label} must be a group,index identity.`); return { group: Number(match[1]), index: Number(match[2]), id: `${Number(match[1])},${Number(match[2])}` }; }
function parseSelectionIdentity(value, label) { const match = /^(-?\d+),(-?\d+)@(\d+)$/.exec(String(value || '')); if (!match) throw new Error(`${label} must identify one exact physical SFF sprite.`); return { group: Number(match[1]), index: Number(match[2]), physicalIndex: Number(match[3]), identity: `${Number(match[1])},${Number(match[2])}`, id: `${Number(match[1])},${Number(match[2])}@${Number(match[3])}` }; }

function endpointProjection(endpoint, role) {
  if (!endpoint || endpoint.kind !== 'sff' || endpoint.role !== role || endpoint.pinned !== true) throw new Error(`The ${role} endpoint is not one exact pinned SFF endpoint.`);
  return {
    identity: boundedString(endpoint.identity, `${role} SFF endpoint identity`, 16384, true),
    entityIdentity: boundedString(endpoint.entityIdentity, `${role} SFF entity identity`, 4096, true),
    fileIdentity: boundedString(endpoint.fileIdentity, `${role} SFF file identity`, 32768),
    fingerprint: fingerprint(endpoint.fingerprint, `${role} SFF endpoint fingerprint`)
  };
}

function validateAirReview(review) {
  safeTree(review, 'AIR Transfer review');
  if (!review || review.schema !== 'ikemaker.air-transfer-review' || review.version !== 1 || review.includeSprites !== true || review.dependencyMode !== 'animation-with-sprites' || !Array.isArray(review.spriteDependencies) || !review.spriteDependencies.length || review.spriteDependencies.length > MAX_DEPENDENCIES || !deeplyFrozen(review)) throw new Error('A current immutable animation-with-sprites AIR Transfer review is required.');
  fingerprint(review.analysisIdentity, 'AIR Transfer analysis identity');
  const projection = { sourceFingerprint: review.sourceFingerprint, destinationFingerprint: review.destinationFingerprint, dependencyMode: review.dependencyMode, items: review.items, copyClosureItems: review.copyClosureItems, spriteDependencies: review.spriteDependencies };
  if (sha(canonical(projection)) !== review.analysisIdentity) throw new Error('The AIR Transfer analysis identity is inconsistent.');
  return review;
}

function validateReadySession(session) {
  safeTree(session, 'Ready SFF Transfer session');
  const review = session?.pendingReview, request = review?.request;
  if (!session || session.schema !== 'ikemaker.asset-transfer-session' || session.version !== 1 || session.kind !== 'sff' || session.status !== 'active' || !deeplyFrozen(session) || !review || review.status !== 'ready' || !request || review.reviewFingerprint !== request.requestIdentity || !requestStillCurrent(session, request)) throw new Error('Only the current immutable ready SFF Transfer review can create an AIR continuation.');
  if (request.kind !== 'sff' || request.sourceIdentity !== session.source.identity || request.destinationIdentity !== session.destination.identity || fingerprint(request.sourceFingerprint, 'SFF request Source fingerprint') !== session.source.fingerprint || fingerprint(request.destinationFingerprint, 'SFF request Destination fingerprint') !== session.destination.fingerprint) throw new Error('The ready SFF Transfer request no longer matches its exact endpoints.');
  return { session, request };
}

function createAirTransferSffContinuation(input) {
  exactObject(input, ['airReview', 'sffSession'], 'AIR/SFF continuation input');
  const review = validateAirReview(input.airReview), { session, request } = validateReadySession(input.sffSession), source = endpointProjection(session.source, 'source'), destination = endpointProjection(session.destination, 'destination');
  const selected = new Map();
  for (const [index, item] of request.selection.entries()) {
    const identity = parseSelectionIdentity(item.id, `SFF request selection ${index + 1}`), contentFingerprint = fingerprint(item.contentFingerprint, `SFF request selection ${index + 1} content fingerprint`), metadataFingerprint = fingerprint(item.metadataFingerprint, `SFF request selection ${index + 1} metadata fingerprint`);
    if (item.physicalIndex !== identity.physicalIndex || selected.has(identity.identity)) throw new Error('The ready SFF selection must contain at most one exact occurrence for each AIR sprite dependency identity.');
    selected.set(identity.identity, { ...identity, contentFingerprint, metadataFingerprint });
  }
  const dependencies = [], seen = new Set();
  for (const dependency of review.spriteDependencies) {
    const parsed = parseSpriteIdentity(dependency.id, 'AIR sprite dependency');
    if (seen.has(parsed.id) || dependency.group !== parsed.group || dependency.number !== parsed.index || dependency.status !== 'exact' || !Array.isArray(dependency.physicalIndices) || dependency.physicalIndices.length !== 1) throw new Error(`AIR sprite dependency ${parsed.id} is repeated, ambiguous, missing, or inconsistent.`);
    seen.add(parsed.id); const sourceItem = selected.get(parsed.id);
    if (!sourceItem || sourceItem.physicalIndex !== dependency.physicalIndices[0]) throw new Error(`The ready SFF review does not contain the exact Source occurrence for AIR sprite ${parsed.id}.`);
    dependencies.push({ dependencyId: parsed.id, group: parsed.group, index: parsed.index, sourceId: sourceItem.id, sourcePhysicalIndex: sourceItem.physicalIndex, sourceContentFingerprint: sourceItem.contentFingerprint, sourceMetadataFingerprint: sourceItem.metadataFingerprint });
  }
  const authority = {
    analysisIdentity: review.analysisIdentity, sessionId: boundedString(session.sessionId, 'SFF Transfer session identity', 128), requestIdentity: fingerprint(request.requestIdentity, 'SFF Transfer request identity'),
    requestGeneration: natural(request.generation, 'SFF Transfer request generation'), requestRevision: natural(request.revision, 'SFF Transfer request revision'),
    sourceEndpoint: source, destinationEndpoint: destination, dependencies
  };
  return deepFreeze({ schema: CONTINUATION_SCHEMA, version: VERSION, ...authority, continuationIdentity: sha(canonical(authority)), effects: EFFECTS });
}

function validateContinuation(continuation) {
  safeTree(continuation, 'AIR/SFF continuation');
  if (!continuation || continuation.schema !== CONTINUATION_SCHEMA || continuation.version !== VERSION || !deeplyFrozen(continuation) || !Array.isArray(continuation.dependencies) || !continuation.dependencies.length || continuation.dependencies.length > MAX_DEPENDENCIES) throw new Error('The AIR/SFF continuation is invalid or mutable.');
  const authority = { analysisIdentity: continuation.analysisIdentity, sessionId: continuation.sessionId, requestIdentity: continuation.requestIdentity, requestGeneration: continuation.requestGeneration, requestRevision: continuation.requestRevision, sourceEndpoint: continuation.sourceEndpoint, destinationEndpoint: continuation.destinationEndpoint, dependencies: continuation.dependencies };
  if (fingerprint(continuation.continuationIdentity, 'AIR/SFF continuation identity') !== sha(canonical(authority))) throw new Error('The AIR/SFF continuation identity is inconsistent.');
  fingerprint(continuation.analysisIdentity, 'AIR analysis identity'); fingerprint(continuation.requestIdentity, 'SFF request identity'); natural(continuation.requestGeneration, 'SFF request generation'); natural(continuation.requestRevision, 'SFF request revision');
  return continuation;
}

function validateFinalSession(session, continuation) {
  safeTree(session, 'Finalized SFF Transfer session');
  const result = session?.result;
  if (!session || session.schema !== 'ikemaker.asset-transfer-session' || session.version !== 1 || session.kind !== 'sff' || session.status !== 'active' || !deeplyFrozen(session) || session.pendingReview !== null || !result || result.status !== 'completed' || result.requiresRecovery !== false || result.sourceUnchanged !== true || result.counts?.failed !== 0 || !Array.isArray(session.mappings)) throw new Error('AIR remapping requires one immutable successful finalized SFF Transfer result.');
  if (session.sessionId !== continuation.sessionId || result.requestIdentity !== continuation.requestIdentity || session.generation !== continuation.requestGeneration + 1 || session.revision !== continuation.requestRevision + 2) throw new Error('The finalized SFF Transfer result does not continue the reviewed AIR handoff generation.');
  const source = endpointProjection(session.source, 'source'), destination = endpointProjection(session.destination, 'destination');
  if (canonical(source) !== canonical(continuation.sourceEndpoint)) throw new Error('The finalized SFF Transfer Source endpoint or fingerprint changed.');
  if (destination.identity !== continuation.destinationEndpoint.identity || destination.entityIdentity !== continuation.destinationEndpoint.entityIdentity || destination.fileIdentity !== continuation.destinationEndpoint.fileIdentity) throw new Error('The finalized SFF Transfer Destination is not the reviewed physical endpoint.');
  if (!Array.isArray(result.details) || !result.counts || !['added', 'replaced', 'skipped', 'failed'].every(key => Number.isSafeInteger(result.counts[key]) && result.counts[key] >= 0)) throw new Error('The finalized SFF Transfer result summary is malformed.');
  const counts = { added: 0, replaced: 0, skipped: 0, failed: 0 }, details = new Map();
  for (const detail of result.details) {
    if (!detail || !Object.prototype.hasOwnProperty.call(counts, detail.status) || typeof detail.id !== 'string' || details.has(detail.id)) throw new Error('The finalized SFF Transfer result contains a malformed or repeated item.');
    counts[detail.status] += 1; details.set(detail.id, detail);
  }
  if (canonical(counts) !== canonical(result.counts)) throw new Error('The finalized SFF Transfer result counts do not match its exact item outcomes.');
  return { session, result, source, destination, details };
}

function acceptFinalizedSffTransfer(input) {
  exactObject(input, ['continuation', 'sffSession'], 'Finalized AIR/SFF receipt input');
  const continuation = validateContinuation(input.continuation), { session, destination, details } = validateFinalSession(input.sffSession, continuation), bySource = new Map();
  for (const [index, mapping] of session.mappings.entries()) {
    if (!mapping || typeof mapping !== 'object') throw new Error(`Finalized SFF mapping ${index + 1} is invalid.`);
    if (bySource.has(mapping.sourceId)) throw new Error(`Finalized SFF mappings repeat Source item ${mapping.sourceId}.`);
    if (mapping.sourceEndpointIdentity !== continuation.sourceEndpoint.identity || fingerprint(mapping.sourceEndpointFingerprint, 'SFF mapping Source endpoint fingerprint') !== continuation.sourceEndpoint.fingerprint || mapping.destinationEndpointIdentity !== destination.identity || fingerprint(mapping.destinationEndpointFingerprint, 'SFF mapping Destination endpoint fingerprint') !== destination.fingerprint) throw new Error('A finalized SFF mapping does not match the exact reviewed endpoints.');
    const outcome = details.get(mapping.sourceId);
    if (!outcome || !['added', 'replaced'].includes(outcome.status) || outcome.destinationId !== mapping.destinationId) throw new Error(`Finalized SFF mapping ${mapping.sourceId} does not match one successful exact result item.`);
    validateTransferMappingEvidence(mapping,session);
    bySource.set(mapping.sourceId, mapping);
  }
  const spriteMappings = [];
  for (const dependency of continuation.dependencies) {
    const mapping = bySource.get(dependency.sourceId);
    if (!mapping || fingerprint(mapping.sourceContentFingerprint, `SFF mapping ${dependency.sourceId} Source content fingerprint`) !== dependency.sourceContentFingerprint) throw new Error(`Finalized SFF Transfer has no exact verified mapping for AIR sprite ${dependency.dependencyId}.`);
    fingerprint(mapping.destinationContentFingerprint, `SFF mapping ${dependency.sourceId} Destination content fingerprint`);
    const destinationIdentity = parseSpriteIdentity(mapping.destinationId, `SFF mapping ${dependency.sourceId} Destination identity`);
    if (destinationIdentity.group < 0 || destinationIdentity.index < 0) throw new Error('AIR sprite mappings require non-negative Destination group and index values.');
    spriteMappings.push({ sourceId: dependency.dependencyId, destinationGroup: destinationIdentity.group, destinationIndex: destinationIdentity.index, verified: true });
  }
  const projection = { continuationIdentity: continuation.continuationIdentity, requestIdentity: continuation.requestIdentity, destinationEndpoint: destination, spriteMappings };
  return deepFreeze({ schema: RECEIPT_SCHEMA, version: VERSION, ...projection, receiptIdentity: sha(canonical(projection)), effects: EFFECTS });
}

module.exports = { CONTINUATION_SCHEMA, RECEIPT_SCHEMA, VERSION, EFFECTS, createAirTransferSffContinuation, acceptFinalizedSffTransfer };
