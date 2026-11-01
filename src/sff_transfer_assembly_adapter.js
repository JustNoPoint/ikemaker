'use strict';

const crypto = require('crypto');
const path = require('path');
const { requestStillCurrent } = require('./asset_transfer_session');
const { snapshot } = require('./sff_view_organization');

const SCHEMA = 'ikemaker.sff-transfer-assembly-seed';
const VERSION = 1;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object.`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.enumerable && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError(`${label}.${key} cannot be an accessor.`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  plain(value, label);
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`);
  for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label} is missing ${key}.`);
}

function digest(value, label) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} must be an exact SHA-256 fingerprint.`);
  return normalized;
}

function boundedString(value, label, maximum = 4096, allowAuthoritySeparators = false) {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > maximum || !allowAuthoritySeparators && value.includes('\0')) throw new TypeError(`${label} is invalid.`);
  return value;
}

function natural(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function authorityDigest(authority) {
  return crypto.createHash('sha256').update(canonical(authority)).digest('hex').toLowerCase();
}

function canonicalFile(value) {
  const resolved = path.resolve(String(value || ''));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function referenceIdentity(reference) {
  return crypto.createHash('sha256')
    .update(path.resolve(reference.baseFile).toLowerCase()).update('\0').update(reference.baseHash)
    .update('\0').update(path.resolve(reference.sourceFile).toLowerCase()).update('\0').update(reference.sourceHash)
    .digest('hex');
}

function normalizeReference(value) {
  exactKeys(value, ['baseFile', 'sourceFile', 'baseHash', 'sourceHash', 'identity'], 'Two-SFF Assembly reference');
  const reference = {
    baseFile: path.resolve(String(value.baseFile || '')),
    sourceFile: path.resolve(String(value.sourceFile || '')),
    baseHash: digest(value.baseHash, 'Destination SFF fingerprint'),
    sourceHash: digest(value.sourceHash, 'Source SFF fingerprint'),
    identity: digest(value.identity, 'Two-SFF Assembly reference identity')
  };
  if (reference.identity !== referenceIdentity(reference)) throw new Error('The Two-SFF Assembly reference identity does not match its exact endpoint files and fingerprints.');
  if (canonicalFile(reference.baseFile) === canonicalFile(reference.sourceFile)) throw new Error('Transfer Source and Destination must remain different physical SFF files.');
  return reference;
}

function exactArchive(reference, archive, role) {
  plain(archive, `${role} SFF archive`);
  if (!Buffer.isBuffer(archive.buffer) || !Array.isArray(archive.sprites)) throw new TypeError(`${role} SFF archive is incomplete.`);
  const expectedFile = role === 'Source' ? reference.sourceFile : reference.baseFile;
  const expectedHash = role === 'Source' ? reference.sourceHash : reference.baseHash;
  if (canonicalFile(archive.filename) !== canonicalFile(expectedFile)) throw new Error(`The ${role} SFF archive does not match the exact Assembly endpoint.`);
  const scope = snapshot(archive);
  if (scope.fingerprint.toLowerCase() !== expectedHash) throw new Error(`The ${role} SFF changed after the Assembly reference was created.`);
  return scope;
}

function exactSelection(request, sourceScope) {
  const items = [];
  for (const item of request.selection) {
    if (!Number.isSafeInteger(item.physicalIndex) || item.physicalIndex < 0) throw new Error('Every SFF Transfer selection item requires an exact non-negative physical index.');
    const row = sourceScope.rows[item.physicalIndex];
    if (!row || item.id !== `${row.identity}@${row.physicalIndex}` || String(item.contentFingerprint).toLowerCase() !== row.evidence || String(item.metadataFingerprint).toLowerCase() !== row.topology) throw new Error('The reviewed Transfer selection no longer matches the exact Source physical sprite evidence.');
    items.push(Object.freeze({ id: item.id, physicalIndex: row.physicalIndex, identity: row.identity, contentFingerprint: String(item.contentFingerprint).toUpperCase(), metadataFingerprint: String(item.metadataFingerprint).toUpperCase(), label: item.label }));
  }
  if (new Set(items.map(item => item.physicalIndex)).size !== items.length) throw new Error('The reviewed Transfer selection repeats a Source physical sprite.');
  return Object.freeze(items);
}

function validateSeedSelection(value, sourceScope) {
  exactKeys(value, ['physicalIndices', 'items'], 'Transfer Assembly Source selection');
  if (!Array.isArray(value.physicalIndices) || !Array.isArray(value.items) || !value.items.length || value.items.length > 512 || value.physicalIndices.length !== value.items.length) throw new Error('The Transfer Assembly Source selection must contain 1 through 512 exact physical sprites.');
  const items = value.items.map((item, index) => {
    exactKeys(item, ['id', 'physicalIndex', 'identity', 'contentFingerprint', 'metadataFingerprint', 'label'], `Transfer Assembly Source item ${index + 1}`);
    const physicalIndex = natural(item.physicalIndex, `Transfer Assembly Source item ${index + 1} physical index`), row = sourceScope.rows[physicalIndex];
    const id = boundedString(item.id, `Transfer Assembly Source item ${index + 1} identity`), identity = boundedString(item.identity, `Transfer Assembly Source item ${index + 1} sprite identity`, 128), label = boundedString(item.label, `Transfer Assembly Source item ${index + 1} label`, 512);
    const contentFingerprint = digest(item.contentFingerprint, `Transfer Assembly Source item ${index + 1} content fingerprint`).toUpperCase(), metadataFingerprint = digest(item.metadataFingerprint, `Transfer Assembly Source item ${index + 1} metadata fingerprint`).toUpperCase();
    if (!row || id !== `${row.identity}@${row.physicalIndex}` || identity !== row.identity || contentFingerprint.toLowerCase() !== row.evidence || metadataFingerprint.toLowerCase() !== row.topology || value.physicalIndices[index] !== physicalIndex) throw new Error('The Transfer Assembly seed no longer matches the exact Source physical sprite evidence.');
    return { id, physicalIndex, identity, contentFingerprint, metadataFingerprint, label };
  });
  if (new Set(items.map(item => item.physicalIndex)).size !== items.length) throw new Error('The Transfer Assembly seed repeats a Source physical sprite.');
  return items;
}

function exactBoundary(value, destinationScope) {
  if (value === null) return null;
  exactKeys(value, ['kind', 'id', 'position'], 'Transfer destination boundary');
  if (value.kind !== 'between-sprites') throw new Error('The Transfer destination boundary kind is unsupported.');
  const match = /^(-?\d+),(-?\d+)@(\d+)$/.exec(String(value.id || ''));
  const position = Number(value.position), physicalIndex = match ? Number(match[3]) : -1, row = destinationScope.rows[physicalIndex];
  if (!match || !Number.isSafeInteger(position) || !row || row.identity !== `${Number(match[1])},${Number(match[2])}` || ![physicalIndex, physicalIndex + 1].includes(position)) throw new Error('The reviewed Transfer destination boundary is stale or mismatched.');
  return Object.freeze({
    kind: 'between-sprites', id: `${row.identity}@${physicalIndex}`, position,
    targetPhysicalIndex: physicalIndex, targetIdentity: row.identity,
    placement: position === physicalIndex ? 'before' : 'after', insertionPhysicalIndex: position
  });
}

function validateSeedBoundary(value, destinationScope) {
  if (value === null) return null;
  exactKeys(value, ['kind', 'id', 'position', 'targetPhysicalIndex', 'targetIdentity', 'placement', 'insertionPhysicalIndex'], 'Transfer Assembly destination boundary');
  const resolved = exactBoundary({ kind: value.kind, id: value.id, position: value.position }, destinationScope);
  if (value.targetPhysicalIndex !== resolved.targetPhysicalIndex || value.targetIdentity !== resolved.targetIdentity || value.placement !== resolved.placement || value.insertionPhysicalIndex !== resolved.insertionPhysicalIndex) throw new Error('The Transfer Assembly destination boundary projection is inconsistent.');
  return resolved;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

function createSffTransferAssemblySeed(input) {
  exactKeys(input, ['reference', 'session', 'sourceArchive', 'destinationArchive'], 'SFF Transfer Assembly seed input');
  const reference = normalizeReference(input.reference), session = input.session, review = session?.pendingReview, request = review?.request;
  if (!review || review.status !== 'ready' || !request || review.reviewFingerprint !== request.requestIdentity || !requestStillCurrent(session, request)) throw new Error('Only the current ready SFF Transfer review can seed Two-SFF Assembly.');
  if (request.kind !== 'sff') throw new Error('Two-SFF Assembly accepts only an SFF Transfer review.');
  if (digest(request.sourceFingerprint, 'Transfer Source fingerprint') !== reference.sourceHash || digest(request.destinationFingerprint, 'Transfer Destination fingerprint') !== reference.baseHash) throw new Error('The reviewed Transfer endpoints do not match the exact Assembly reference.');
  const sourceScope = exactArchive(reference, input.sourceArchive, 'Source'), destinationScope = exactArchive(reference, input.destinationArchive, 'Destination');
  const selection = exactSelection(request, sourceScope), boundary = exactBoundary(request.boundary, destinationScope);
  return validateSffTransferAssemblySeed({ seed: {
    schema: SCHEMA, version: VERSION, reference,
    authority: {
      sessionId: session.sessionId, generation: request.generation, revision: request.revision,
      requestIdentity: request.requestIdentity, reviewFingerprint: review.reviewFingerprint,
      initiatedBy: request.initiatedBy, kind: request.kind,
      sourceIdentity: request.sourceIdentity, sourceFingerprint: request.sourceFingerprint,
      destinationIdentity: request.destinationIdentity, destinationFingerprint: request.destinationFingerprint
    },
    sourceSelection: { physicalIndices: selection.map(item => item.physicalIndex), items: selection },
    destinationBoundary: boundary,
    placementRequired: boundary === null,
    decisions: { identityConflicts: 'review-required', linkedSprites: 'review-required', paletteCompatibility: 'review-required', apply: 'explicit-approval-required' },
    effects: EFFECTS
  }, reference, sourceArchive: input.sourceArchive, destinationArchive: input.destinationArchive });
}

function validateSffTransferAssemblySeed(input) {
  exactKeys(input, ['seed', 'reference', 'sourceArchive', 'destinationArchive'], 'SFF Transfer Assembly validation input');
  const seed = input.seed;
  exactKeys(seed, ['schema', 'version', 'reference', 'authority', 'sourceSelection', 'destinationBoundary', 'placementRequired', 'decisions', 'effects'], 'SFF Transfer Assembly seed');
  if (seed.schema !== SCHEMA || seed.version !== VERSION) throw new Error('The SFF Transfer Assembly seed schema or version is unsupported.');
  const reference = normalizeReference(input.reference), embeddedReference = normalizeReference(seed.reference);
  if (canonical(reference) !== canonical(embeddedReference)) throw new Error('The SFF Transfer Assembly seed belongs to a different exact Assembly reference.');
  const sourceScope = exactArchive(reference, input.sourceArchive, 'Source'), destinationScope = exactArchive(reference, input.destinationArchive, 'Destination');
  exactKeys(seed.authority, ['sessionId', 'generation', 'revision', 'requestIdentity', 'reviewFingerprint', 'initiatedBy', 'kind', 'sourceIdentity', 'sourceFingerprint', 'destinationIdentity', 'destinationFingerprint'], 'Transfer Assembly authority');
  const authority = {
    sessionId: boundedString(seed.authority.sessionId, 'Transfer session identity', 128),
    generation: natural(seed.authority.generation, 'Transfer generation'), revision: natural(seed.authority.revision, 'Transfer revision'),
    requestIdentity: digest(seed.authority.requestIdentity, 'Transfer request identity'), reviewFingerprint: digest(seed.authority.reviewFingerprint, 'Transfer review fingerprint'),
    initiatedBy: boundedString(seed.authority.initiatedBy, 'Transfer initiation method', 32), kind: boundedString(seed.authority.kind, 'Transfer asset kind', 16),
    sourceIdentity: boundedString(seed.authority.sourceIdentity, 'Transfer Source endpoint identity', 4096, true), sourceFingerprint: digest(seed.authority.sourceFingerprint, 'Transfer Source fingerprint').toUpperCase(),
    destinationIdentity: boundedString(seed.authority.destinationIdentity, 'Transfer Destination endpoint identity', 4096, true), destinationFingerprint: digest(seed.authority.destinationFingerprint, 'Transfer Destination fingerprint').toUpperCase()
  };
  if (authority.kind !== 'sff' || !['copy-selected', 'drag-drop'].includes(authority.initiatedBy) || authority.requestIdentity !== authority.reviewFingerprint) throw new Error('The Transfer Assembly authority is not a current ready SFF review.');
  if (authority.sourceFingerprint.toLowerCase() !== reference.sourceHash || authority.destinationFingerprint.toLowerCase() !== reference.baseHash) throw new Error('The Transfer Assembly authority fingerprints do not match the exact Assembly reference.');
  const items = validateSeedSelection(seed.sourceSelection, sourceScope), boundary = validateSeedBoundary(seed.destinationBoundary, destinationScope);
  if (seed.placementRequired !== (boundary === null) || typeof seed.placementRequired !== 'boolean') throw new Error('The Transfer Assembly placement requirement is inconsistent with its reviewed boundary.');
  if (authority.initiatedBy === 'drag-drop' && !boundary) throw new Error('A drag/drop Transfer Assembly seed requires its reviewed destination boundary.');
  if (authority.initiatedBy === 'copy-selected' && boundary) throw new Error('A Copy Selected Transfer Assembly seed cannot invent a destination boundary.');
  exactKeys(seed.decisions, ['identityConflicts', 'linkedSprites', 'paletteCompatibility', 'apply'], 'Transfer Assembly decision gates');
  if (seed.decisions.identityConflicts !== 'review-required' || seed.decisions.linkedSprites !== 'review-required' || seed.decisions.paletteCompatibility !== 'review-required' || seed.decisions.apply !== 'explicit-approval-required') throw new Error('The Transfer Assembly seed cannot bypass required conflict, link, palette, or apply review.');
  exactKeys(seed.effects, ['filesystem', 'persistence', 'sourceMutation', 'destinationMutation', 'autosave'], 'Transfer Assembly effects');
  if (Object.values(seed.effects).some(value => value !== false)) throw new Error('The Transfer Assembly seed cannot grant file, persistence, mutation, or autosave effects.');
  const requestAuthority = {
    sessionId: authority.sessionId, kind: authority.kind, generation: authority.generation, revision: authority.revision,
    sourceIdentity: authority.sourceIdentity, sourceFingerprint: authority.sourceFingerprint,
    destinationIdentity: authority.destinationIdentity, destinationFingerprint: authority.destinationFingerprint,
    selection: items.map(item => ({ id: item.id, contentFingerprint: item.contentFingerprint, label: item.label, physicalIndex: item.physicalIndex, metadataFingerprint: item.metadataFingerprint })),
    boundary: boundary ? { kind: boundary.kind, id: boundary.id, position: boundary.position } : null
  };
  if (authorityDigest(requestAuthority) !== authority.requestIdentity) throw new Error('The Transfer Assembly seed no longer matches its reviewed request identity.');
  return deepFreeze({ schema: SCHEMA, version: VERSION, reference, authority, sourceSelection: { physicalIndices: items.map(item => item.physicalIndex), items }, destinationBoundary: boundary, placementRequired: boundary === null, decisions: { ...seed.decisions }, effects: EFFECTS });
}

module.exports = { SCHEMA, VERSION, EFFECTS, createSffTransferAssemblySeed, validateSffTransferAssemblySeed, referenceIdentity };
