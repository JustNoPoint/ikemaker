'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { maskSource, parseStateSource } = require('./state_transfer_model');
const { parseCollisionOverlapReferences } = require('./collision_overlap_reference_authority');
const { parseProjectileCollisionOverlapReferences } = require('./projectile_collision_overlap_reference_authority');

const INVENTORY_SCHEMA = 'ikemaker.air-collision-query-condition-inventory';
const PLAN_SCHEMA = 'ikemaker.air-collision-query-condition-plan';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_STATES = 256;
const MAX_ANCHORS = 256;
const MAX_CONDITION_BYTES = 8 * 1024;
const MAX_QUERY_BYTES = 1024;
const MAX_PATCH_BYTES = 16 * 1024;
const MAX_CONTEXT_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024;
const HASH = /^[A-F0-9]{64}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (utilTypes.isProxy(value)) return false;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !deeplyFrozen(descriptor.value, seen)) return false;
  }
  return true;
}
function canonicalData(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key === 'symbol' || FORBIDDEN_KEYS.has(key))) { stack.delete(value); return false; }
  if (Array.isArray(value)) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length'), length = lengthDescriptor?.value;
    let valid = safeInteger(length) && length >= 0 && own.length === length + 1 && own.includes('length');
    for (let index = 0; valid && index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      valid = Boolean(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && canonicalData(descriptor.value, stack));
    }
    stack.delete(value); return valid;
  }
  const prototype = Object.getPrototypeOf(value);
  const valid = (prototype === Object.prototype || prototype === null) && own.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && canonicalData(descriptor.value, stack);
  });
  stack.delete(value); return valid;
}
function exactKeys(value, keys) { if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) return false; const own = Reflect.ownKeys(value); return own.length === keys.length && keys.every(key => own.includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value')); }
function safeInteger(value) { return Number.isSafeInteger(value); }
function validVersion(value) { return value === null || safeInteger(value) && value >= 0; }
function samePath(left, right) { return path.resolve(String(left || '')).toLowerCase() === path.resolve(String(right || '')).toLowerCase(); }
function byteLength(value) { return Buffer.byteLength(String(value), 'utf8'); }
function lineAt(text, offset) { return text.slice(0, offset).split('\n').length - 1; }
function lineStart(text, offset) { return text.lastIndexOf('\n', Math.max(0, offset) - 1) + 1; }
function characterAt(text, offset) { return offset - lineStart(text, offset); }
function validText(text) { if (typeof text !== 'string' || text.startsWith('\uFEFF') || text.includes('\0') || /\r(?!\n)/.test(text)) return false; const crlf = /\r\n/.test(text), bareLf = /(^|[^\r])\n/.test(text); return !(crlf && bareLf); }
function exactHash(value) { return typeof value === 'string' && HASH.test(value); }
function limited(value, maximum, label) { if (byteLength(value) > maximum) throw new Error(`${label} exceeds ${maximum} bytes.`); return value; }
function effects() { return { ...EFFECTS }; }

function exactDestination(value) {
  const keys = ['sourcePath', 'sourceHash', 'sourceVersion', 'stateNumber', 'stateOccurrence', 'stateHeaderStart', 'stateHeaderEnd', 'stateExpression', 'stateHeaderHash'];
  return canonicalData(value) && deeplyFrozen(value) && exactKeys(value, keys) && typeof value.sourcePath === 'string' && path.isAbsolute(value.sourcePath) && exactHash(value.sourceHash) && validVersion(value.sourceVersion) && safeInteger(value.stateNumber) && value.stateOccurrence === 0 && safeInteger(value.stateHeaderStart) && safeInteger(value.stateHeaderEnd) && value.stateHeaderEnd > value.stateHeaderStart && typeof value.stateExpression === 'string' && exactHash(value.stateHeaderHash);
}

function sourceEvidence(snapshot, destination) {
  if (!canonicalData(snapshot) || !deeplyFrozen(snapshot) || !exactKeys(snapshot, ['inventoryComplete', 'assignedSources', 'sources']) || snapshot.inventoryComplete !== true || !Array.isArray(snapshot.assignedSources) || !Array.isArray(snapshot.sources) || snapshot.sources.length !== snapshot.assignedSources.length || snapshot.sources.length !== 1) return { error: 'One complete, exact assigned-source snapshot is required.' };
  const item = snapshot.sources[0], assigned = snapshot.assignedSources[0];
  if (!exactKeys(item, ['filename', 'text', 'sourceHash', 'syntax', 'available', 'open', 'dirty', 'version']) || typeof assigned !== 'string' || typeof item.filename !== 'string' || !path.isAbsolute(item.filename) || path.extname(item.filename).toLowerCase() !== '.zss' || item.syntax !== 'zss' || item.available !== true || typeof item.open !== 'boolean' || typeof item.dirty !== 'boolean' || !validVersion(item.version) || typeof item.text !== 'string' || !exactHash(item.sourceHash)) return { error: 'The assigned source evidence is unavailable, relabelled, or malformed.' };
  if (!samePath(assigned, item.filename) || !samePath(item.filename, destination.sourcePath) || sha(item.text) !== item.sourceHash || destination.sourceHash !== item.sourceHash || destination.sourceVersion !== item.version) return { error: 'The source path, hash, or version is stale or mismatched.' };
  if (item.open && !safeInteger(item.version) || !item.open && (item.version !== null || item.dirty) || item.dirty && !item.open) return { error: 'Open/dirty source provenance is inconsistent.' };
  if (!validText(item.text) || byteLength(item.text) > MAX_SOURCE_BYTES) return { error: 'The source contains unsupported bytes, line endings, or exceeds the source cap.' };
  return { source: item };
}

function stateSegments(source) {
  const masked = maskSource(source.text, 'zss'), markers = [], statePattern = /^[ \t]*\[[ \t]*StateDef\b[^\]\r\n]*\]/gim, functionPattern = /^[ \t]*\[[ \t]*Function\b[^\]\r\n]*\]/gim;
  let match;
  while ((match = statePattern.exec(masked))) markers.push({ kind: 'state', start: match.index, headerEnd: statePattern.lastIndex });
  while ((match = functionPattern.exec(masked))) markers.push({ kind: 'function', start: match.index, headerEnd: functionPattern.lastIndex });
  markers.sort((left, right) => left.start - right.start);
  markers.forEach((marker, index) => { marker.end = markers[index + 1]?.start ?? source.text.length; });
  return { masked, markers };
}

function resolveState(source, destination) {
  const parsed = parseStateSource(source.text, source.filename, 'zss'), declarations = (parsed.declarations || []).filter(item => !item.dynamic), segments = stateSegments(source), stateMarkers = segments.markers.filter(item => item.kind === 'state');
  if (stateMarkers.length > MAX_STATES) return { error: `The source exceeds the ${MAX_STATES}-StateDef cap.` };
  const numeric = declarations.filter(item => Number(item.value) === destination.stateNumber);
  if (numeric.length <= destination.stateOccurrence) return { error: 'The explicit StateDef occurrence no longer exists.' };
  const declaration = numeric[destination.stateOccurrence], segment = segments.markers.find(item => item.kind === 'state' && lineAt(source.text, item.start) === declaration.line);
  if (!segment || segment.start !== destination.stateHeaderStart || segment.headerEnd !== destination.stateHeaderEnd || source.text.slice(segment.start, segment.headerEnd) !== destination.stateExpression || sha(destination.stateExpression) !== destination.stateHeaderHash) return { error: 'The StateDef header identity has drifted.' };
  if (numeric.length !== 1) return { error: 'Duplicate StateDef numbers are ambiguous for query attachment.' };
  if (/@customstate\b/i.test(segments.masked.slice(segment.start, segment.end))) return { error: '@customstate destinations are not reviewed for query attachment.' };
  return { declaration, segment, masked: segments.masked };
}

function scanConditionEnd(masked, start, limit) {
  let paren = 0, bracket = 0;
  for (let at = start; at < limit; at += 1) {
    const character = masked[at];
    if (character === '(') paren += 1;
    else if (character === ')') { paren -= 1; if (paren < 0) return null; }
    else if (character === '[') bracket += 1;
    else if (character === ']') { bracket -= 1; if (bracket < 0) return null; }
    else if (character === '{' && paren === 0 && bracket === 0) return { end: at, brace: at };
    else if (character === '\n' || character === '\r') return null;
  }
  return null;
}

function hasInlineComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) { if (character === quote && line[index - 1] !== '\\') quote = ''; continue; }
    if (character === '"' || character === "'") quote = character;
    else if (character === '#' || character === '/' && line[index + 1] === '/') return true;
  }
  return false;
}

function scanAnchors(source, state) {
  const text = source.text, masked = state.masked, start = state.segment.headerEnd, end = state.segment.end, pattern = /\b(?:ignoreHitPause\s+if|else\s+if|if)\b/gi, anchors = [];
  const bindingHash = semanticHash({ sourcePath: source.filename, sourceHash: source.sourceHash, sourceVersion: source.version, stateNumber: state.declaration.value, stateOccurrence: 0, stateHeaderStart: state.segment.start, stateHeaderEnd: state.segment.headerEnd, stateHeaderHash: sha(text.slice(state.segment.start, state.segment.headerEnd)) });
  let match, braceDepth = 0, cursor = start;
  function updateDepth(until) { for (; cursor < until; cursor += 1) { if (masked[cursor] === '{') braceDepth += 1; else if (masked[cursor] === '}') { braceDepth -= 1; if (braceDepth < 0) throw new Error('The selected StateDef has unbalanced braces.'); } } }
  pattern.lastIndex = start;
  while ((match = pattern.exec(masked)) && match.index < end) {
    updateDepth(match.index);
    const rawKeyword = match[0], kind = /^ignore/i.test(rawKeyword) ? 'ignoreHitPause-if' : /^else/i.test(rawKeyword) ? 'else-if' : 'if', conditionStart = match.index + rawKeyword.length;
    const found = scanConditionEnd(masked, conditionStart, end);
    if (!found) throw new Error('A condition is multiline, malformed, or lacks an exact following block brace.');
    let trimmedStart = conditionStart, trimmedEnd = found.end;
    while (trimmedStart < trimmedEnd && /[ \t]/.test(text[trimmedStart])) trimmedStart += 1;
    while (trimmedEnd > trimmedStart && /[ \t]/.test(text[trimmedEnd - 1])) trimmedEnd -= 1;
    const condition = text.slice(trimmedStart, trimmedEnd), rawLine = text.slice(lineStart(text, match.index), text.indexOf('\n', match.index) < 0 ? text.length : text.indexOf('\n', match.index));
    if (!condition || byteLength(condition) > MAX_CONDITION_BYTES || hasInlineComment(rawLine)) throw new Error('Only bounded, nonempty, single-line conditions without inline comments are eligible.');
    anchors.push({
      kind,
      keyword: rawKeyword,
      keywordStart: match.index,
      keywordEnd: match.index + rawKeyword.length,
      conditionStart: trimmedStart,
      conditionEnd: trimmedEnd,
      condition,
      conditionHash: sha(condition),
      nestingDepth: braceDepth,
      line: lineAt(text, match.index),
      character: characterAt(text, match.index),
      bindingHash
    });
    if (anchors.length > MAX_ANCHORS) throw new Error(`The selected StateDef exceeds the ${MAX_ANCHORS}-condition cap.`);
    pattern.lastIndex = found.brace + 1;
  }
  updateDepth(end);
  if (braceDepth !== 0) throw new Error('The selected StateDef has unbalanced braces.');
  return anchors;
}

function inventoryFinalize(body) {
  const semantic = { schema: INVENTORY_SCHEMA, version: 1, ...body, effects: effects() }, output = { ...semantic, inventoryHash: semanticHash(semantic) };
  limited(JSON.stringify(output), MAX_OUTPUT_BYTES, 'AIR query condition inventory'); return deepFreeze(output);
}
function inventoryFailure(reason, destination = null, conflicts = []) { return inventoryFinalize({ status: conflicts.length ? 'conflict' : 'unresolved', destination, anchors: [], source: null, conflicts, limitations: [String(reason)] }); }

function inventoryAirCollisionQueryConditionAnchors(input = {}) {
  try {
    if (!canonicalData(input) || !deeplyFrozen(input) || !exactKeys(input, ['snapshot', 'destination']) || !exactDestination(input.destination)) return inventoryFailure('Exact, deeply frozen canonical source and destination evidence is required.');
    const evidence = sourceEvidence(input.snapshot, input.destination); if (evidence.error) return inventoryFailure(evidence.error, input.destination);
    const state = resolveState(evidence.source, input.destination); if (state.error) return inventoryFailure(state.error, input.destination);
    const anchors = scanAnchors(evidence.source, state);
    return inventoryFinalize({ status: 'ready', destination: input.destination, anchors, source: { path: evidence.source.filename, hash: evidence.source.sourceHash, version: evidence.source.version, open: evidence.source.open, dirty: evidence.source.dirty }, conflicts: [], limitations: ['Anchors identify authored conditions only; they do not prove that a StateDef executes or that a live collision overlaps.'] });
  } catch (error) { return inventoryFailure(error.message || 'Condition anchor inventory failed closed.'); }
}

function verifiedProjection(projection) {
  if (!canonicalData(projection) || !deeplyFrozen(projection) || projection.schema !== 'ikemaker.air-collision-property-draft' || projection.version !== 1 || projection.status !== 'ready' || projection.recipe?.family !== 'queries' || projection.recipe?.available !== true || !exactHash(projection.draftHash)) return false;
  const { draftHash, ...semantic } = projection;
  if (sha(JSON.stringify(semantic)) !== draftHash || projection.target?.known !== true || !['stable-1.0', 'known-base', 'nightly-indexed'].includes(projection.target?.status)) return false;
  if (projection.recipe.kind === 'ClsnOverlap' && projection.recipe.fields?.owner === 'Dummy' && (projection.target?.stable === true || projection.target?.dummy !== true)) return false;
  return true;
}
function reproduceQuery(projection) {
  const fields = projection.recipe.fields || {}, kind = projection.recipe.kind;
  let query = '';
  if (kind === 'ClsnOverlap' && exactKeys(fields, ['owner', 'target', 'player'])) query = `clsnOverlap(${fields.owner}, ${fields.player}, ${fields.target})`;
  else if (kind === 'ProjClsnOverlap' && exactKeys(fields, ['projectileListIndex', 'target', 'player'])) query = `projClsnOverlap(${fields.projectileListIndex}, ${fields.player}, ${fields.target})`;
  if (!query || byteLength(query) > MAX_QUERY_BYTES || query !== projection.recipe.preview?.code) return null;
  const records = kind === 'ClsnOverlap' ? parseCollisionOverlapReferences(query, 'zss') : parseProjectileCollisionOverlapReferences(query, 'zss');
  return records.length === 1 && records[0].available === true && records[0].callStart === 0 && records[0].callEnd === query.length ? query : null;
}
function exactAnchor(anchor, inventory) {
  if (!canonicalData(anchor) || !deeplyFrozen(anchor)) return null;
  return inventory.anchors.find(item => semanticHash(item) === semanticHash(anchor)) || null;
}
function planFinalize(body) {
  const semantic = { schema: PLAN_SCHEMA, version: 1, ...body, effects: effects() }, output = { ...semantic, planHash: semanticHash(semantic) };
  limited(JSON.stringify(output), MAX_OUTPUT_BYTES, 'AIR query condition plan'); return deepFreeze(output);
}
function planFailure(reason, status = 'unresolved', destination = null, conflicts = []) { return planFinalize({ status, destination, anchor: null, query: null, operation: null, patch: null, preview: { before: '', after: '', omittedBytes: 0 }, hashes: { before: '', after: '' }, conflicts, limitations: [String(reason)] }); }
function context(text, start, end, replacement) {
  const radius = Math.floor(MAX_CONTEXT_BYTES / 4), from = Math.max(0, start - radius), to = Math.min(text.length, end + radius), before = text.slice(from, to), after = before.slice(0, start - from) + replacement + before.slice(end - from), omittedBytes = byteLength(text.slice(0, from)) + byteLength(text.slice(to));
  limited(before, MAX_CONTEXT_BYTES, 'Condition preview'); limited(after, MAX_CONTEXT_BYTES, 'Condition preview'); return { before, after, omittedBytes };
}

function createAirCollisionQueryConditionPlan(input = {}) {
  try {
    if (!canonicalData(input) || !deeplyFrozen(input) || !exactKeys(input, ['propertyProjection', 'snapshot', 'destination', 'anchor', 'operation']) || !exactKeys(input.operation, ['kind']) || input.operation.kind !== 'and-condition') return planFailure('Exact, deeply frozen canonical planning evidence is required.');
    if (!verifiedProjection(input.propertyProjection)) return planFailure('The exact reviewed C10 query projection is unavailable or stale.', 'conflict', input.destination, ['C10 query projection verification failed.']);
    const query = reproduceQuery(input.propertyProjection); if (!query) return planFailure('The reviewed query cannot be reproduced and reparsed exactly.', 'conflict', input.destination, ['Query preview and recipe fields differ.']);
    const inventory = inventoryAirCollisionQueryConditionAnchors(deepFreeze({ snapshot: input.snapshot, destination: input.destination }));
    if (inventory.status !== 'ready') return planFailure(inventory.limitations[0], inventory.status, input.destination, inventory.conflicts);
    const anchor = exactAnchor(input.anchor, inventory); if (!anchor) return planFailure('The selected condition anchor is stale or does not belong to this inventory.', 'conflict', input.destination, ['Condition anchor authority drifted.']);
    if (anchor.condition === query) return planFailure('The condition already consists exactly of the reviewed query; no patch is required.', 'conflict', input.destination, ['Exact no-op query attachment.']);
    const replacement = `(${anchor.condition}) && (${query})`; limited(replacement, MAX_PATCH_BYTES, 'Condition replacement');
    const source = input.snapshot.sources[0], proposed = source.text.slice(0, anchor.conditionStart) + replacement + source.text.slice(anchor.conditionEnd), proposedHash = sha(proposed);
    const reboundSource = deepFreeze({ ...source, text: proposed, sourceHash: proposedHash });
    const reboundDestination = deepFreeze({ ...input.destination, sourceHash: proposedHash });
    const reboundSnapshot = deepFreeze({ inventoryComplete: true, assignedSources: input.snapshot.assignedSources, sources: [reboundSource] });
    const rebound = inventoryAirCollisionQueryConditionAnchors(deepFreeze({ snapshot: reboundSnapshot, destination: reboundDestination }));
    if (rebound.status !== 'ready') return planFailure('The proposed source did not reparse to the same exact StateDef and condition anchor.', 'conflict', input.destination, rebound.conflicts);
    const reparsedAnchor = rebound.anchors.find(item => item.keywordStart === anchor.keywordStart && item.kind === anchor.kind);
    if (!reparsedAnchor || reparsedAnchor.condition !== replacement || reparsedAnchor.nestingDepth !== anchor.nestingDepth) return planFailure('The proposed condition anchor changed unexpectedly after reparsing.', 'conflict', input.destination, ['Condition reparse identity differs.']);
    const parseQueries = input.propertyProjection.recipe.kind === 'ClsnOverlap' ? parseCollisionOverlapReferences : parseProjectileCollisionOverlapReferences;
    const beforeQueries = parseQueries(anchor.condition, 'zss').filter(item => item.available === true && anchor.condition.slice(item.callStart, item.callEnd) === query);
    const attached = parseQueries(reparsedAnchor.condition, 'zss').filter(item => item.available === true && reparsedAnchor.condition.slice(item.callStart, item.callEnd) === query);
    const expectedStart = replacement.lastIndexOf(query);
    if (attached.length !== beforeQueries.length + 1 || !attached.some(item => item.callStart === expectedStart && item.callEnd === expectedStart + query.length)) return planFailure('The proposed condition does not contain exactly one newly attached verified reviewed query.', 'conflict', input.destination, ['Query attachment proof failed.']);
    const patch = { start: anchor.conditionStart, end: anchor.conditionEnd, text: replacement };
    return planFinalize({
      status: 'ready',
      destination: input.destination,
      anchor,
      query: { kind: input.propertyProjection.recipe.kind, text: query, hash: sha(query), draftHash: input.propertyProjection.draftHash },
      operation: { kind: 'and-condition', evaluationOrder: 'original-first' },
      patch,
      preview: context(source.text, patch.start, patch.end, patch.text),
      hashes: { before: source.sourceHash, after: proposedHash },
      conflicts: [],
      limitations: [
        'This is an authored source plan, not proof of live collision overlap.',
        'The selected AIR box is browsing context and does not own this query.',
        input.propertyProjection.recipe.kind === 'ClsnOverlap' ? 'ClsnOverlap uses a whole runtime collision family.' : 'ProjClsnOverlap uses an independent projectile-list index.',
        'The original condition is evaluated first; the reviewed query runs only when it passes.',
        'This plan does not guarantee that the selected StateDef executes.',
        'C20A grants no Apply or write authority.'
      ]
    });
  } catch (error) { return planFailure(error.message || 'Collision query condition planning failed closed.'); }
}

module.exports = {
  INVENTORY_SCHEMA,
  MAX_ANCHORS,
  MAX_CONDITION_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_PATCH_BYTES,
  MAX_QUERY_BYTES,
  MAX_SOURCE_BYTES,
  MAX_STATES,
  PLAN_SCHEMA,
  createAirCollisionQueryConditionPlan,
  deepFreeze,
  inventoryAirCollisionQueryConditionAnchors,
  semanticHash
};
