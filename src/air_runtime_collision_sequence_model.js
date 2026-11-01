'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');

const SCHEMA = 'ikemaker.air-runtime-collision-sequence-plan';
const PINNED_SOURCE_COMMIT = '4a09f23d80bf919195a0be85a28f7356a150f20a';
const GROUPS = Object.freeze(['Clsn1', 'Clsn2', 'Size', 'Dummy']);
const GROUP_NUMBER = new Map(GROUPS.map((name, index) => [index + 1, name]));
const MAX_BOXES = 1024;
const MAX_CONTROLLERS = 128;
const MAX_RETAINED_APPLICATIONS = 1024;
const MAX_WORK = 131072;
const MAX_MAGNITUDE = 1e9;
const EPSILON = 1e-12;
const HASH = /^[A-F0-9]{64}$/;
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false });

function fail(message) { throw new Error(`AIR runtime collision sequence: ${message}`); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex').toUpperCase(); }
function exactKeys(value, required, optional = []) { const keys = Object.keys(value); return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key)); }
function plainData(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  if (Object.getOwnPropertySymbols(value).length) { stack.delete(value); return false; }
  if (Array.isArray(value)) {
    const keys = Object.keys(value), valid = keys.length === value.length && keys.every((key, index) => String(index) === key && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value') && plainData(value[index], stack));
    stack.delete(value); return valid;
  }
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) { stack.delete(value); return false; }
  const descriptors = Object.getOwnPropertyDescriptors(value), valid = Object.values(descriptors).every(descriptor => Object.prototype.hasOwnProperty.call(descriptor, 'value') && plainData(descriptor.value, stack));
  stack.delete(value); return valid;
}
function clean(value) { if (Object.is(value, -0) || Math.abs(value) < EPSILON) return 0; const integer = Math.round(value); return Math.abs(value - integer) < EPSILON ? integer : value; }
function finite(value, label) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) fail(`${label} must be a primitive finite number with magnitude at most ${MAX_MAGNITUDE}.`); return clean(value); }
function integer(value, label) { const number = finite(value, label); if (!Number.isSafeInteger(number)) fail(`${label} must be a safe integer.`); return number; }
function boundedString(value, label, maximum = 160) { if (typeof value !== 'string' || !value || value.length > maximum) fail(`${label} must be a non-empty string no longer than ${maximum} characters.`); return value; }
function exactHash(value, label) { if (typeof value !== 'string' || !HASH.test(value)) fail(`${label} must be one canonical uppercase SHA-256 hash.`); return value; }
function list(value, label, minimum, maximum, fill) {
  if (value === undefined) return { value: Array(maximum).fill(fill), supplied: 0 };
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} must contain ${minimum === maximum ? `exactly ${minimum}` : `${minimum} to ${maximum}`} values.`);
  const output = Array(maximum).fill(fill); value.forEach((entry, index) => { output[index] = finite(entry, `${label} value ${index + 1}`); }); return { value: output, supplied: value.length };
}
function normalizeRect(value, label) { const parsed = list(value, label, 4, 4, 0).value; return [Math.min(parsed[0], parsed[2]), Math.min(parsed[1], parsed[3]), Math.max(parsed[0], parsed[2]), Math.max(parsed[1], parsed[3])].map(clean); }
function polygon(rect) { return [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]]; }
function rotate(points, pivot, angle) { const radians = angle * Math.PI / 180, sine = Math.sin(radians), cosine = Math.cos(radians); return points.map(([x, y]) => { const tx = x - pivot[0], ty = y - pivot[1]; return [clean(cosine * tx - sine * ty + pivot[0]), clean(sine * tx + cosine * ty + pivot[1])]; }); }
function aabb(points) { const xs = points.map(point => point[0]), ys = points.map(point => point[1]); return [clean(Math.min(...xs)), clean(Math.min(...ys)), clean(Math.max(...xs)), clean(Math.max(...ys))]; }
function finalize(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: { ...EFFECTS } }; return deepFreeze({ ...semantic, planHash: hash(semantic) }); }
function unavailable(reason, context = {}) { return finalize({ status: 'unavailable', sourceCommit: context.sourceCommit || '', capabilityFingerprint: context.capabilityFingerprint || '', reason, conflicts: [reason], warnings: [], omissions: [], groups: [], controllers: [], retained: Object.fromEntries(GROUPS.map(group => [group, { overrides: [], transforms: [] }])), lineage: { removed: [], created: [], reindexed: [] }, precision: 'Source-modeled JavaScript number display precision; not bit-identical Go float32 certification.', axis: [0, 0] }); }

function normalizeCapability(value) {
  if (!value || !exactKeys(value, ['target', 'decision', 'fingerprint', 'indexed', 'dummy'])) fail('capability must contain only target, decision, fingerprint, indexed, and dummy.');
  return { target: boundedString(value.target, 'capability target', 32), decision: boundedString(value.decision, 'capability decision', 32), fingerprint: exactHash(value.fingerprint, 'capability fingerprint'), indexed: value.indexed === true, dummy: value.dummy === true };
}
function normalizeScale(value) {
  if (!value || !exactKeys(value, ['available', 'value', 'provenanceHash', 'reason'])) fail('collisionScale must contain only available, value, provenanceHash, and reason.');
  if (typeof value.available !== 'boolean' || typeof value.reason !== 'string' || value.reason.length > 256) fail('collisionScale availability and reason are malformed.');
  const provenanceHash = exactHash(value.provenanceHash, 'collisionScale provenanceHash');
  if (!value.available) { if (value.value !== null) fail('an unavailable collisionScale must use a null value.'); return { available: false, value: null, provenanceHash, reason: value.reason || 'Character collision scale is unavailable.' }; }
  return { available: true, value: list(value.value, 'character collision scale', 2, 2, 1).value, provenanceHash, reason: value.reason };
}
function normalizeGroups(value) {
  if (!Array.isArray(value) || value.length !== GROUPS.length) fail('groups must contain exact Clsn1, Clsn2, Size, and Dummy evidence records.');
  const seen = new Set(); let total = 0;
  const groups = value.map((record, order) => {
    if (!record || !exactKeys(record, ['name', 'available', 'provenance', 'evidenceHash', 'boxes', 'reason'])) fail(`group record ${order + 1} has unknown or missing fields.`);
    const name = boundedString(record.name, `group ${order + 1} name`, 16); if (!GROUPS.includes(name) || seen.has(name)) fail(`group ${name} is unknown or duplicated.`); seen.add(name);
    if (typeof record.available !== 'boolean' || typeof record.provenance !== 'string' || record.provenance.length > 80 || typeof record.reason !== 'string' || record.reason.length > 256) fail(`${name} evidence metadata is malformed.`);
    const evidenceHash = exactHash(record.evidenceHash, `${name} evidenceHash`); if (!Array.isArray(record.boxes)) fail(`${name} boxes must be an array.`);
    if (!record.available && record.boxes.length) fail(`${name} cannot publish boxes while its evidence is unavailable.`);
    const boxes = record.boxes.map((box, index) => { if (!box || !exactKeys(box, ['sourceIndex', 'rect'])) fail(`${name} box ${index} has unknown or missing fields.`); const sourceIndex = integer(box.sourceIndex, `${name} box ${index} sourceIndex`); if (sourceIndex !== index) fail(`${name} source indexes must be contiguous from 0.`); return { sourceIndex, rect: normalizeRect(box.rect, `${name} box ${index} rectangle`) }; });
    total += boxes.length; if (total > MAX_BOXES) fail(`raw boxes exceed the ${MAX_BOXES}-box limit.`);
    if (name === 'Clsn1' || name === 'Clsn2') { if (record.available && record.provenance !== 'air-inspection') fail(`${name} requires exact air-inspection provenance.`); }
    if (name === 'Size' && record.available && (record.provenance !== 'runtime-plan' || boxes.length !== 1)) fail('Size requires one exact runtime-plan sizeToBox rectangle.');
    if (name === 'Dummy' && record.available && (record.provenance !== 'engine-empty' || boxes.length !== 0)) fail('Dummy raw evidence must be the exact empty engine group; only OverrideClsn may create boxes.');
    return { name, available: record.available, provenance: record.provenance, evidenceHash, boxes, reason: record.reason };
  });
  if (groups.some((group, index) => group.name !== GROUPS[index])) fail('groups must remain in canonical Clsn1, Clsn2, Size, Dummy order.');
  return groups;
}
function normalizeController(record, order) {
  if (!record || typeof record !== 'object') fail(`controller ${order + 1} must be a record.`);
  if (Object.prototype.hasOwnProperty.call(record, 'translation') || Object.prototype.hasOwnProperty.call(record, 'translate') || Object.prototype.hasOwnProperty.call(record, 'offset')) fail('TransformClsn has no translation field in the pinned source; world position is a separate later placement input.');
  const common = ['id', 'kind', 'provenanceHash', 'group', 'index'], kind = record.kind;
  if (kind !== 'OverrideClsn' && kind !== 'TransformClsn') fail(`controller ${order + 1} kind must be OverrideClsn or TransformClsn.`);
  const allowed = kind === 'OverrideClsn' ? [...common, 'rect'] : [...common, 'scale', 'angle', 'pivot']; if (!exactKeys(record, ['id', 'kind', 'provenanceHash'], allowed.filter(key => !['id', 'kind', 'provenanceHash'].includes(key)))) fail(`${kind} controller ${order + 1} has unknown or missing fields.`);
  const id = boundedString(record.id, `${kind} id`, 128), provenanceHash = exactHash(record.provenanceHash, `${kind} provenanceHash`), defaulted = [], group = record.group === undefined ? (defaulted.push('group'), kind === 'OverrideClsn' ? 0 : -1) : integer(record.group, `${kind} group`), index = record.index === undefined ? (defaulted.push('index'), kind === 'OverrideClsn' ? 0 : -1) : integer(record.index, `${kind} index`);
  if (kind === 'OverrideClsn') { const rect = list(record.rect, 'OverrideClsn rect', 1, 4, 0); for (let at = rect.supplied; at < 4; at += 1) defaulted.push(`rect[${at}]`); if (!rect.supplied) defaulted.push('rect'); return { id, kind, provenanceHash, sourceOrder: order, group, index, rect: normalizeRect(rect.value, 'OverrideClsn normalized rect'), defaulted }; }
  const scale = list(record.scale, 'TransformClsn scale', 1, 2, 1), pivot = list(record.pivot, 'TransformClsn pivot', 1, 2, 0), angle = record.angle === undefined ? (defaulted.push('angle'), 0) : finite(record.angle, 'TransformClsn angle'); if (!scale.supplied) defaulted.push('scale'); else if (scale.supplied === 1) defaulted.push('scale[1]'); if (!pivot.supplied) defaulted.push('pivot'); else if (pivot.supplied === 1) defaulted.push('pivot[1]'); return { id, kind, provenanceHash, sourceOrder: order, group, index, scale: scale.value, angle, pivot: pivot.value, defaulted };
}
function targetGroups(group) { if (group === -1) return [...GROUPS]; if (GROUP_NUMBER.has(group)) return [GROUP_NUMBER.get(group)]; return []; }
function sameRect(rect) { return rect.every(value => value === 0); }

function createAirRuntimeCollisionSequencePlan(input = {}) {
  if (!plainData(input)) fail('input must be finite canonical plain data without accessors, proxies, cycles, sparse arrays, or symbols.');
  if (!exactKeys(input, ['sourceCommit', 'capability', 'collisionScale', 'groups', 'controllers'])) fail('input must contain only sourceCommit, capability, collisionScale, groups, and controllers.');
  const sourceCommit = boundedString(input.sourceCommit, 'sourceCommit', 64), capability = normalizeCapability(input.capability), collisionScale = normalizeScale(input.collisionScale), groups = normalizeGroups(input.groups);
  if (!Array.isArray(input.controllers) || input.controllers.length > MAX_CONTROLLERS) fail(`controllers must contain at most ${MAX_CONTROLLERS} records.`);
  const controllers = input.controllers.map(normalizeController), ids = new Set(); for (const controller of controllers) { if (ids.has(controller.id)) fail(`controller id ${controller.id} is duplicated.`); ids.add(controller.id); }
  const context = { sourceCommit, capabilityFingerprint: capability.fingerprint };
  if (sourceCommit !== PINNED_SOURCE_COMMIT) return unavailable(`Collision sequence semantics are pinned to official IKEMEN GO commit ${PINNED_SOURCE_COMMIT}.`, context);
  if (capability.target !== 'nightly' || capability.decision !== 'supported' || !capability.indexed || !capability.dummy) return unavailable('An exact verified Nightly indexed/Dummy collision capability decision is required.', context);
  if (!collisionScale.available) return unavailable(collisionScale.reason || 'Exact character collision scale evidence is required.', context);

  const retained = Object.fromEntries(GROUPS.map(group => [group, { overrides: [], transforms: [] }])), warnings = [], omissions = [], conflicts = [], normalizedControllers = [], targetedUnavailable = new Set(); let retainedApplications = 0, work = 0, effectiveTotal = 0;
  for (const controller of controllers) {
    const family = controller.kind === 'OverrideClsn' ? 'overrides' : 'transforms'; let targets = [], effect = 'append';
    if (controller.group === 0) { for (const group of GROUPS) retained[group][family] = []; effect = 'reset-family'; }
    else { targets = targetGroups(controller.group); if (!targets.length) { effect = 'invalid-group-noop'; warnings.push(`${controller.id}: invalid ${controller.kind} group ${controller.group}; pinned engine behavior is warning/no-op.`); } else for (const group of targets) { retained[group][family].push(controller); retainedApplications += 1; if (retainedApplications > MAX_RETAINED_APPLICATIONS) fail(`retained modifier applications exceed ${MAX_RETAINED_APPLICATIONS}.`); } }
    normalizedControllers.push({ ...controller, targets, effect });
  }
  for (const evidence of groups) if (!evidence.available && (retained[evidence.name].overrides.length || retained[evidence.name].transforms.length)) targetedUnavailable.add(evidence.name);

  const lineage = { removed: [], created: [], reindexed: [] }, outputGroups = [];
  for (const evidence of groups) {
    if (!evidence.available) { outputGroups.push({ name: evidence.name, status: 'unavailable', reason: evidence.reason || `${evidence.name} evidence is unavailable.`, provenance: evidence.provenance, evidenceHash: evidence.evidenceHash, rawBoxes: [], postCharacterScaleBoxes: [], postOverrideBoxes: [], finalLocalBoxes: [] }); omissions.push(`${evidence.name}: ${evidence.reason || 'evidence unavailable'}`); continue; }
    const scale = evidence.name === 'Clsn1' || evidence.name === 'Clsn2' ? collisionScale.value : [1, 1]; let boxes = evidence.boxes.map(box => ({ lineageId: `${evidence.name}:source:${box.sourceIndex}`, sourceIndex: box.sourceIndex, effectiveIndex: box.sourceIndex, rawRect: [...box.rect], rect: [box.rect[0] * scale[0], box.rect[1] * scale[1], box.rect[2] * scale[0], box.rect[3] * scale[1]].map(clean), createdBy: null, overrideHistory: [], transformHistory: [], storedAngle: 0, storedPivot: [0, 0] }));
    const rawBoxes = boxes.map(box => ({ lineageId: box.lineageId, sourceIndex: box.sourceIndex, effectiveIndex: box.effectiveIndex, rect: [...box.rawRect] })), postCharacterScaleBoxes = boxes.map(box => ({ lineageId: box.lineageId, sourceIndex: box.sourceIndex, effectiveIndex: box.effectiveIndex, rect: normalizeRect(box.rect, `${evidence.name} scaled rectangle`) })); let creationOrdinal = 0;
    const reindex = (controllerId, before) => { boxes.forEach((box, index) => { if (box.effectiveIndex !== index) lineage.reindexed.push({ group: evidence.name, lineageId: box.lineageId, from: box.effectiveIndex, to: index, controllerId }); box.effectiveIndex = index; }); work += before + boxes.length; if (work > MAX_WORK) fail(`deterministic work exceeds ${MAX_WORK}.`); };
    for (const modifier of retained[evidence.name].overrides) {
      work += 1; const beforeLength = boxes.length, zero = sameRect(modifier.rect), history = { controllerId: modifier.id, sourceOrder: modifier.sourceOrder, index: modifier.index, rect: [...modifier.rect] };
      if (zero) {
        if (modifier.index < 0) { for (const box of boxes) lineage.removed.push({ group: evidence.name, lineageId: box.lineageId, sourceIndex: box.sourceIndex, effectiveIndex: box.effectiveIndex, controllerId: modifier.id, rect: [...box.rect] }); boxes = []; }
        else if (modifier.index < boxes.length) { const [removed] = boxes.splice(modifier.index, 1); lineage.removed.push({ group: evidence.name, lineageId: removed.lineageId, sourceIndex: removed.sourceIndex, effectiveIndex: modifier.index, controllerId: modifier.id, rect: [...removed.rect] }); }
      } else if (modifier.index < 0) boxes = boxes.map(box => ({ ...box, rect: [...modifier.rect], overrideHistory: [...box.overrideHistory, { ...history, action: 'replace-all' }] }));
      else if (modifier.index < boxes.length) { const box = boxes[modifier.index]; boxes[modifier.index] = { ...box, rect: [...modifier.rect], overrideHistory: [...box.overrideHistory, { ...history, action: 'replace' }] }; }
      else { if (boxes.length >= MAX_BOXES) fail(`effective boxes exceed the ${MAX_BOXES}-box limit.`); const lineageId = `${evidence.name}:created:${modifier.id}:${creationOrdinal++}`, created = { lineageId, sourceIndex: null, effectiveIndex: boxes.length, rawRect: null, rect: [...modifier.rect], createdBy: modifier.id, overrideHistory: [{ ...history, action: 'append' }], transformHistory: [], storedAngle: 0, storedPivot: [0, 0] }; boxes.push(created); lineage.created.push({ group: evidence.name, lineageId, effectiveIndex: created.effectiveIndex, controllerId: modifier.id, rect: [...modifier.rect] }); }
      reindex(modifier.id, beforeLength);
    }
    const postOverrideBoxes = boxes.map(box => ({ lineageId: box.lineageId, sourceIndex: box.sourceIndex, effectiveIndex: box.effectiveIndex, rect: normalizeRect(box.rect, `${evidence.name} post-override rectangle`), createdBy: box.createdBy, overrideHistory: box.overrideHistory }));
    for (const modifier of retained[evidence.name].transforms) {
      const indexes = modifier.index < 0 ? boxes.map((_, index) => index) : modifier.index < boxes.length ? [modifier.index] : [];
      for (const index of indexes) { const box = boxes[index]; box.rect = [box.rect[0] * modifier.scale[0], box.rect[1] * modifier.scale[1], box.rect[2] * modifier.scale[0], box.rect[3] * modifier.scale[1]].map(clean); box.storedAngle = modifier.angle; box.storedPivot = [...modifier.pivot]; box.transformHistory.push({ controllerId: modifier.id, sourceOrder: modifier.sourceOrder, scale: [...modifier.scale], angle: modifier.angle, pivot: [...modifier.pivot] }); work += 1; if (work > MAX_WORK) fail(`deterministic work exceeds ${MAX_WORK}.`); }
    }
    const finalLocalBoxes = boxes.map(box => { const rect = normalizeRect(box.rect, `${evidence.name} final rectangle`), unfacedCollisionAngle = clean(-box.storedAngle), unfacedPolygon = rotate(polygon(rect), box.storedPivot, unfacedCollisionAngle); return { lineageId: box.lineageId, sourceIndex: box.sourceIndex, effectiveIndex: box.effectiveIndex, rect, createdBy: box.createdBy, overrideHistory: box.overrideHistory, transformHistory: box.transformHistory, storedAngle: box.storedAngle, storedPivot: box.storedPivot, unfacedCollisionAngle, unfacedPolygon, unfacedAabb: aabb(unfacedPolygon), geometryLabel: 'Character-local unfaced known-input geometry; live collision later applies facing, position, and world conversion.' }; });
    effectiveTotal += finalLocalBoxes.length; if (effectiveTotal > MAX_BOXES) fail(`effective boxes exceed the ${MAX_BOXES}-box total limit.`);
    outputGroups.push({ name: evidence.name, status: 'ready', reason: '', provenance: evidence.provenance, evidenceHash: evidence.evidenceHash, rawBoxes, postCharacterScaleBoxes, postOverrideBoxes, finalLocalBoxes });
  }
  for (const group of targetedUnavailable) conflicts.push(`${group} was targeted by a retained controller but its exact group evidence is unavailable.`);
  const status = conflicts.length ? 'unavailable' : omissions.length ? 'partial' : 'ready', reason = conflicts[0] || (omissions.length ? 'One or more untargeted groups lack exact evidence; known groups remain preview-only.' : 'Exact known-input controller sequence plan.');
  return finalize({ status, sourceCommit, capabilityFingerprint: capability.fingerprint, capability, collisionScale, reason, conflicts, warnings, omissions, groups: outputGroups, controllers: normalizedControllers, retained, lineage, precision: 'Source-modeled JavaScript number display precision; not bit-identical Go float32 certification.', axis: [0, 0], geometryAuthority: 'Known evaluated inputs only; not live runtime execution truth.' });
}

module.exports = { SCHEMA, PINNED_SOURCE_COMMIT, GROUPS, MAX_BOXES, MAX_CONTROLLERS, MAX_RETAINED_APPLICATIONS, MAX_WORK, MAX_MAGNITUDE, EFFECTS, createAirRuntimeCollisionSequencePlan };
