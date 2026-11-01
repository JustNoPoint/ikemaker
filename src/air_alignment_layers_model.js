'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { parseAir } = require('./air_preview_model');

const SCHEMA = 'ikemaker.air-alignment-layers';
const HASH = /^[A-F0-9]{64}$/;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_ALIGNMENT_REFS = 32;
const MAX_ONION_PER_SIDE = 4;
const MAX_STORED_ENTRIES = 64;
const MAX_PUBLIC_BYTES = 64 * 1024;
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false, save: false, autosave: false });

function fail(message) { throw new Error(`AIR alignment layers: ${message}`); }
function digest(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function exactKeys(value, keys) { if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) return false; const own = Reflect.ownKeys(value); return own.length === keys.length && keys.every(key => own.includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value')); }
function plainData(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  if (Object.getOwnPropertySymbols(value).length) { stack.delete(value); return false; }
  if (Array.isArray(value)) {
    const own = Reflect.ownKeys(value), keys = own.filter(key => key !== 'length'), lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length'), valid = own.length === value.length + 1 && lengthDescriptor && Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') && keys.length === value.length && keys.every((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return key === String(index) && descriptor?.enumerable === true && Object.prototype.hasOwnProperty.call(descriptor, 'value') && plainData(descriptor.value, stack);
    });
    stack.delete(value); return valid;
  }
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) { stack.delete(value); return false; }
  const descriptors = Object.getOwnPropertyDescriptors(value), valid = Object.entries(descriptors).every(([key, descriptor]) => descriptor.enumerable === true && !['__proto__', 'prototype', 'constructor'].includes(key) && Object.prototype.hasOwnProperty.call(descriptor, 'value') && plainData(descriptor.value, stack));
  stack.delete(value); return valid;
}
function lineAt(text, line) { return String(text).split(/\n/)[line - 1]?.replace(/\r$/, '') ?? ''; }
function canonicalPath(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\0') || Buffer.byteLength(filename, 'utf8') > 4096 || !path.isAbsolute(filename) || path.normalize(filename) !== filename) fail('airPath must be one canonical absolute path.');
  return filename;
}
function descriptor(value, label) {
  if (!exactKeys(value, ['action', 'actionOccurrence', 'elementIndex'])) fail(`${label} must contain only action, actionOccurrence, and elementIndex.`);
  if (!Number.isSafeInteger(value.action)) fail(`${label}.action must be a safe integer.`);
  for (const key of ['actionOccurrence', 'elementIndex']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail(`${label}.${key} must be a non-negative safe integer.`);
  return value;
}
function stateRecord(value, label) {
  if (!exactKeys(value, ['key', 'visible', 'selected'])) fail(`${label} must contain only key, visible, and selected.`);
  if (typeof value.key !== 'string' || !HASH.test(value.key) || typeof value.visible !== 'boolean' || typeof value.selected !== 'boolean') fail(`${label} is malformed.`);
  return value;
}
function occurrence(parsed, request, label) {
  const matches = parsed.filter(item => item.number === request.action);
  if (matches.length !== 1) fail(`${label} Action ${request.action} is ${matches.length ? 'defined more than once' : 'missing'}.`);
  if (request.actionOccurrence !== 0) fail(`${label} Action ${request.action} has no unique occurrence ${request.actionOccurrence}.`);
  const action = matches[0];
  if (action.readOnly || Number.isInteger(action.copyAction)) fail(`${label} cannot use a Copy Action alias.`);
  if (!action.frames.length) fail(`${label} Action ${request.action} has no authored frame elements.`);
  if (request.elementIndex >= action.frames.length) fail(`${label} element ${request.elementIndex + 1} is outside Action ${request.action}.`);
  return { action, frame: action.frames[request.elementIndex] };
}
function identity(airPath, sourceFingerprint, request, action, frame, text) {
  const actionSourceLine = action.line, frameSourceLine = frame.line, actionSourceFingerprint = digest(lineAt(text, actionSourceLine));
  return { airPath, sourceFingerprint, action: request.action, actionOccurrence: request.actionOccurrence, actionSourceLine, actionSourceFingerprint, elementIndex: request.elementIndex, elementNumber: request.elementIndex + 1, frameSourceLine, frameFingerprint: digest(lineAt(text, frameSourceLine)) };
}
function layerRecord(kind, airPath, sourceFingerprint, request, parsed, text, states, defaults = {}) {
  const resolved = occurrence(parsed, request, `${kind} layer`), identityValue = identity(airPath, sourceFingerprint, request, resolved.action, resolved.frame, text), key = digest(JSON.stringify(identityValue)), retained = states.get(key), visible = retained ? retained.visible : defaults.visible !== false, selected = retained ? retained.selected : defaults.selected === true, frame = resolved.frame;
  return { key, kind, identity: identityValue, visible, selected, relation: defaults.relation || '', distance: Number(defaults.distance) || 0, sprite: { group: frame.group, index: frame.index }, authored: { x: frame.x, y: frame.y, flags: frame.flags || '', blend: frame.blend || '', scaleX: frame.scaleX, scaleY: frame.scaleY, angle: frame.angle, rawTime: frame.rawTime }, provenance: { airPath, action: request.action, actionOccurrence: request.actionOccurrence, actionSourceLine: resolved.action.line, elementIndex: request.elementIndex, frameSourceLine: frame.line } };
}
function createAirAlignmentLayers(input) {
  if (!plainData(input) || !exactKeys(input, ['airPath', 'text', 'sourceFingerprint', 'base', 'alignment', 'onion', 'states', 'primaryKey'])) fail('input must be exact finite canonical plain data without accessors, proxies, cycles, sparse arrays, or symbols.');
  const airPath = canonicalPath(input.airPath);
  if (typeof input.text !== 'string' || input.text.includes('\0') || Buffer.byteLength(input.text, 'utf8') > MAX_SOURCE_BYTES) fail(`text must be at most ${MAX_SOURCE_BYTES} UTF-8 bytes and contain no NUL.`);
  const sourceFingerprint = digest(input.text); if (!HASH.test(input.sourceFingerprint) || input.sourceFingerprint !== sourceFingerprint) fail('sourceFingerprint is stale or malformed.');
  const base = descriptor(input.base, 'base');
  if (!Array.isArray(input.alignment) || input.alignment.length > MAX_ALIGNMENT_REFS) fail(`alignment accepts at most ${MAX_ALIGNMENT_REFS} exact references.`);
  if (!exactKeys(input.onion, ['before', 'after']) || !Number.isSafeInteger(input.onion.before) || !Number.isSafeInteger(input.onion.after) || input.onion.before < 0 || input.onion.after < 0 || input.onion.before > MAX_ONION_PER_SIDE || input.onion.after > MAX_ONION_PER_SIDE) fail(`onion before/after must each be from 0 to ${MAX_ONION_PER_SIDE}.`);
  if (!Array.isArray(input.states) || input.states.length > MAX_STORED_ENTRIES) fail(`states accepts at most ${MAX_STORED_ENTRIES} entries.`);
  const states = new Map(); for (let index = 0; index < input.states.length; index += 1) { const state = stateRecord(input.states[index], `states[${index}]`); if (states.has(state.key)) fail(`states contains duplicate key ${state.key}.`); states.set(state.key, state); }
  if (input.primaryKey !== null && (typeof input.primaryKey !== 'string' || !HASH.test(input.primaryKey))) fail('primaryKey must be null or one exact layer key.');
  const parsed = parseAir(input.text), baseResolved = occurrence(parsed, base, 'base'), records = [layerRecord('base', airPath, sourceFingerprint, base, parsed, input.text, states, { visible: true, selected: true })], seen = new Set([records[0].key]);
  for (let index = 0; index < input.alignment.length; index += 1) { const request = descriptor(input.alignment[index], `alignment[${index}]`), record = layerRecord('alignment', airPath, sourceFingerprint, request, parsed, input.text, states); if (!seen.has(record.key)) { seen.add(record.key); records.push(record); } }
  const onionRequests = [];
  for (let distance = input.onion.before; distance >= 1; distance -= 1) if (base.elementIndex - distance >= 0) onionRequests.push({ request: { ...base, elementIndex: base.elementIndex - distance }, relation: 'previous', distance });
  for (let distance = 1; distance <= input.onion.after; distance += 1) if (base.elementIndex + distance < baseResolved.action.frames.length) onionRequests.push({ request: { ...base, elementIndex: base.elementIndex + distance }, relation: 'next', distance });
  for (const onion of onionRequests) { const record = layerRecord('onion', airPath, sourceFingerprint, onion.request, parsed, input.text, states, { visible: true, selected: false, relation: onion.relation, distance: onion.distance }); if (!seen.has(record.key)) { seen.add(record.key); records.push(record); } }
  if (records.length > MAX_STORED_ENTRIES) fail(`composition exceeds ${MAX_STORED_ENTRIES} exact entries.`);
  const byKey = new Map(records.map(record => [record.key, record])), requestedPrimary = input.primaryKey ? byKey.get(input.primaryKey) : null, visibleSelected = records.filter(record => record.kind !== 'base' && record.visible && record.selected), primary = requestedPrimary?.visible && requestedPrimary.selected ? requestedPrimary : visibleSelected[0] || records[0], moveTargets = records.filter(record => record.visible && record.selected);
  const normalized = records.map(record => ({ ...record, primary: record.key === primary.key, effectiveMoveTarget: moveTargets.some(item => item.key === record.key) })), orphanStateKeys = [...states.keys()].filter(key => !byKey.has(key)), semantic = { schema: SCHEMA, version: 1, status: 'ready', airPath, sourceFingerprint, baseKey: records[0].key, primaryKey: primary.key, layers: normalized, moveTargetKeys: moveTargets.map(item => item.key), omittedDuplicateReferences: 1 + input.alignment.length + onionRequests.length - records.length, orphanStateKeys, limits: { alignmentReferences: MAX_ALIGNMENT_REFS, onionPerSide: MAX_ONION_PER_SIDE, storedEntries: MAX_STORED_ENTRIES, publicBytes: MAX_PUBLIC_BYTES }, limitations: ['This projection is read-only; reviewed movement belongs only to the AIR host edit owner.', 'Sprite-bank substitutions are not alignment layers and resolve only to the base AIR element.', 'No runtime draw order, synchronized Action playback, generated code, save, or AIR mutation is implied by this projection.'], effects: { ...EFFECTS } }, output = { ...semantic, compositionHash: digest(JSON.stringify(semantic)) };
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_PUBLIC_BYTES) fail(`public projection exceeds ${MAX_PUBLIC_BYTES} UTF-8 bytes.`);
  return deepFreeze(output);
}

module.exports = { SCHEMA, MAX_SOURCE_BYTES, MAX_ALIGNMENT_REFS, MAX_ONION_PER_SIDE, MAX_STORED_ENTRIES, MAX_PUBLIC_BYTES, EFFECTS, createAirAlignmentLayers, digest, deepFreeze };
