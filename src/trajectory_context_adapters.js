'use strict';

const CONTEXT_KINDS = Object.freeze(['move', 'helper', 'explod', 'projectile', 'spatial', 'stage', 'screenpack']);
const PREVIEW_ONLY = new Set(['stage', 'screenpack']);
const LIMITS = Object.freeze({ observations: 256, presetCount: 128, identityLength: 256, coordinate: 1000000, boxes: 512 });

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function boundedText(value, maximum = LIMITS.identityLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('Trajectory context identity must be a bounded non-control string.');
  return text;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
function numericTuple(value, label, length) {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain exactly ${length} finite values.`);
  return value.map((entry) => {
    const number = Number(entry);
    if (!Number.isFinite(number) || Math.abs(number) > LIMITS.coordinate) throw new Error(`${label} contains an unsafe numeric value.`);
    return number;
  });
}
function normalizeObservation(value, index) {
  if (!plain(value)) throw new Error(`Trajectory observation ${index} must be a plain object.`);
  const allowed = new Set(['kind', 'id', 'label', 'position', 'bounds', 'collisionBoxes', 'sprite', 'airFrame', 'confidence']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Trajectory observation ${index} contains unsupported field ${key}.`);
  const result = { kind: boundedText(value.kind, 64), id: boundedText(value.id), label: boundedText(value.label || value.id) };
  if (value.position !== undefined) result.position = numericTuple(value.position, `Trajectory observation ${index} position`, 2);
  if (value.bounds !== undefined) result.bounds = numericTuple(value.bounds, `Trajectory observation ${index} bounds`, 4);
  if (value.collisionBoxes !== undefined) {
    if (!Array.isArray(value.collisionBoxes) || value.collisionBoxes.length > 128) throw new Error(`Trajectory observation ${index} collision boxes are invalid.`);
    result.collisionBoxes = value.collisionBoxes.map((box, boxIndex) => numericTuple(box, `Trajectory observation ${index} collision box ${boxIndex}`, 4));
  }
  if (value.sprite) result.sprite = boundedText(value.sprite);
  if (value.airFrame) result.airFrame = boundedText(value.airFrame);
  if (value.confidence) result.confidence = ['exact', 'reviewed', 'observed', 'unknown'].includes(value.confidence) ? value.confidence : 'unknown';
  return result;
}

function allowedSpaces(kind) {
  if (kind === 'stage') return ['stage', 'world', 'camera', 'screen'];
  if (kind === 'screenpack') return ['screen', 'local'];
  return ['owner-relative', 'local', 'world', 'screen', 'camera', 'stage'];
}
function allowedOwners(kind) {
  if (kind === 'stage') return ['stage-point', 'camera', 'screen'];
  if (kind === 'screenpack') return ['screen', 'camera'];
  return ['self', 'root', 'parent', 'helper', 'p1', 'p2', 'screen', 'camera', 'stage-point', 'expression'];
}

function createTrajectoryContextAdapter(input = {}) {
  if (!plain(input)) throw new Error('Trajectory context must be a plain object.');
  const kind = String(input.kind || '').toLowerCase();
  if (!CONTEXT_KINDS.includes(kind)) throw new Error('Trajectory context kind is unsupported.');
  const observations = Array.isArray(input.observations) ? input.observations : [];
  if (observations.length > LIMITS.observations) throw new Error('Trajectory context has too many observations.');
  const normalizedObservations = observations.map(normalizeObservation);
  if (normalizedObservations.reduce((count, item) => count + (item.collisionBoxes?.length || 0), 0) > LIMITS.boxes) throw new Error('Trajectory context has too many collision boxes.');
  const mutation = PREVIEW_ONLY.has(kind) ? Object.freeze({ allowed: false, reason: `${kind} Orbit Assist is preview-only until its distinct mutation contract is proven.` }) : Object.freeze({
    allowed: Boolean(input.mutation?.allowed && input.mutation?.resolverId && input.mutation?.owner),
    resolverId: input.mutation?.resolverId ? boundedText(input.mutation.resolverId) : '',
    owner: input.mutation?.owner ? boundedText(input.mutation.owner) : '',
    reason: input.mutation?.allowed ? '' : boundedText(input.mutation?.reason || 'No exact mutation owner is established for this context.')
  });
  return freeze({
    contract: 'ikemaker-trajectory-context-v1',
    kind,
    id: boundedText(input.id),
    label: boundedText(input.label || input.id),
    source: input.source && plain(input.source) ? {
      uri: boundedText(input.source.uri),
      revision: boundedText(input.source.revision),
      owner: boundedText(input.source.owner)
    } : null,
    allowedSpaces: allowedSpaces(kind),
    allowedOwners: allowedOwners(kind),
    target: {
      language: ['zss', 'cns'].includes(input.target?.language) ? input.target.language : 'zss',
      engine: boundedText(input.target?.engine || 'ikemen-1.0'),
      capabilityState: ['stable', 'verified-nightly', 'unknown', 'conflicting'].includes(input.target?.capabilityState) ? input.target.capabilityState : 'unknown'
    },
    observations: normalizedObservations,
    mutation,
    previewOnly: PREVIEW_ONLY.has(kind) || !mutation.allowed
  });
}

function adapterSeed(adapter, seed = {}) {
  if (!adapter || adapter.contract !== 'ikemaker-trajectory-context-v1') throw new Error('A normalized trajectory context is required.');
  const coordinateSpace = adapter.allowedSpaces.includes(seed.coordinateSpace) ? seed.coordinateSpace : adapter.allowedSpaces[0];
  const requestedOwner = plain(seed.owner) ? seed.owner : { kind: seed.owner };
  const kind = adapter.allowedOwners.includes(requestedOwner.kind) ? requestedOwner.kind : adapter.allowedOwners[0];
  const owner = { kind, reviewed: requestedOwner.reviewed === true };
  if (kind === 'helper' && requestedOwner.id) owner.id = boundedText(requestedOwner.id);
  if (kind === 'expression' && requestedOwner.expression) owner.expression = boundedText(requestedOwner.expression, 2048);
  return freeze({ ...seed, coordinateSpace, owner, localCoord: numericTuple(seed.localCoord === undefined ? [320, 240] : seed.localCoord, 'Trajectory seed localCoord', 2), targetEngine: adapter.target.engine });
}

module.exports = { CONTEXT_KINDS, PREVIEW_ONLY, LIMITS, createTrajectoryContextAdapter, adapterSeed, allowedSpaces, allowedOwners };
