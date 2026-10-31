'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { maskSource, parseStateSource } = require('./state_transfer_model');
const { parseCollisionReferences } = require('./collision_reference_authority');

const SCHEMA = 'ikemaker.air-runtime-collision-controller-replacement-plan';
const PINNED_SOURCE_COMMIT = '4a09f23d80bf919195a0be85a28f7356a150f20a';
const MAX_SOURCES = 128;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_STATES = 4096;
const MAX_CONTROLLERS = 8192;
const MAX_FIELDS = 5;
const MAX_CONTEXT_LINES = 8;
const MAX_DIFF_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_MAGNITUDE = 1e9;
const HASH = /^[A-F0-9]{64}$/;
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false });
const GROUP_NAMES = Object.freeze({ '-1': 'All', 0: 'None', 1: 'Clsn1', 2: 'Clsn2', 3: 'Size', 4: 'Dummy' });
const GROUP_VALUES = Object.freeze({ all: -1, none: 0, clsn1: 1, clsn2: 2, size: 3, dummy: 4 });
const KIND_FIELDS = Object.freeze({ OverrideClsn: Object.freeze(['group', 'index', 'rect']), TransformClsn: Object.freeze(['group', 'index', 'scale', 'angle', 'pivot']) });

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function deeplyFrozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value) || !Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(child => deeplyFrozen(child, seen)); }
function plainData(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  if (Object.getOwnPropertySymbols(value).length) { stack.delete(value); return false; }
  if (Array.isArray(value)) { const keys = Object.keys(value), valid = keys.length === value.length && keys.every((key, index) => String(index) === key && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value') && plainData(value[index], stack)); stack.delete(value); return valid; }
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) { stack.delete(value); return false; }
  const descriptors = Object.getOwnPropertyDescriptors(value), valid = Object.entries(descriptors).every(([key, descriptor]) => !['__proto__', 'prototype', 'constructor'].includes(key) && Object.prototype.hasOwnProperty.call(descriptor, 'value') && plainData(descriptor.value, stack)); stack.delete(value); return valid;
}
function exactKeys(value, keys) { if (!value || typeof value !== 'object') return false; const own = Reflect.ownKeys(value); return own.length === keys.length && keys.every(key => own.includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value')); }
function exactHash(value) { return typeof value === 'string' && HASH.test(value); }
function validVersion(value) { return value === null || Number.isSafeInteger(value) && value >= 0; }
function normalizedAbsolutePath(value) { return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value; }
function samePath(left, right) { return String(left || '').toLowerCase() === String(right || '').toLowerCase(); }
function limited(value, maximum, label) { const text = String(value); if (Buffer.byteLength(text, 'utf8') > maximum) throw new Error(`${label} exceeds ${maximum} bytes.`); return text; }
function lineNumber(text, offset) { return text.slice(0, offset).split('\n').length - 1; }
function lineStart(text, offset) { return text.lastIndexOf('\n', Math.max(0, offset) - 1) + 1; }
function eolOf(text) { if (/\r(?!\n)/.test(text)) return null; const crlf = /\r\n/.test(text), lf = /(^|[^\r])\n/.test(text); return crlf && lf ? null : crlf ? '\r\n' : '\n'; }
function clean(value) { return Object.is(value, -0) ? 0 : value; }
function finite(value, label) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) throw new Error(`${label} must be a primitive finite number with magnitude at most ${MAX_MAGNITUDE}.`); return clean(value); }
function integer(value, label) { const number = finite(value, label); if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a safe integer.`); return number; }
function normalizeRect(values, label) { const list = numericArray(values, label, 4, 4, 0); return [Math.min(list[0], list[2]), Math.min(list[1], list[3]), Math.max(list[0], list[2]), Math.max(list[1], list[3])].map(clean); }
function numericArray(value, label, minimum, maximum, fill) { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label} must contain ${minimum === maximum ? minimum : `${minimum}-${maximum}`} numbers.`); const output = Array(maximum).fill(fill); value.forEach((item, index) => { output[index] = finite(item, `${label} ${index + 1}`); }); return output; }
function decimal(value) {
  const text = String(clean(value)); if (!/[eE]/.test(text)) return text;
  const negative = text.startsWith('-'), unsigned = negative ? text.slice(1) : text, [coefficient, exponentText] = unsigned.toLowerCase().split('e'), exponent = Number(exponentText), parts = coefficient.split('.'), digits = parts.join(''), point = parts[0].length + exponent;
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? `${digits}${'0'.repeat(point - digits.length)}` : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${negative ? '-' : ''}${expanded}`;
}
function normalizeCapability(value) {
  if (!exactKeys(value, ['target', 'decision', 'fingerprint', 'indexed', 'dummy']) || typeof value.target !== 'string' || typeof value.decision !== 'string' || !exactHash(value.fingerprint) || typeof value.indexed !== 'boolean' || typeof value.dummy !== 'boolean') throw new Error('Runtime controller capability must contain exact primitive target, decision, fingerprint, indexed, and dummy evidence.');
  if (!value.target || value.target.length > 32 || !value.decision || value.decision.length > 32) throw new Error('Runtime controller capability target and decision must be bounded non-empty strings.');
  return { target: value.target, decision: value.decision, fingerprint: value.fingerprint, indexed: value.indexed, dummy: value.dummy };
}
function normalizeDraft(value) {
  if (value && (Object.prototype.hasOwnProperty.call(value, 'translation') || Object.prototype.hasOwnProperty.call(value, 'translate') || Object.prototype.hasOwnProperty.call(value, 'offset'))) throw new Error('TransformClsn has no translation field in the pinned source.');
  const kind = value?.kind, fields = KIND_FIELDS[kind]; if (!fields || !exactKeys(value, ['kind', ...fields])) throw new Error('Runtime controller draft must be exactly one OverrideClsn or TransformClsn literal field set.');
  const group = integer(value.group, `${kind} group`); if (!Object.prototype.hasOwnProperty.call(GROUP_NAMES, String(group))) throw new Error(`${kind} group must be None, All, Clsn1, Clsn2, Size, or Dummy.`);
  const index = integer(value.index, `${kind} index`);
  if (kind === 'OverrideClsn') return { kind, group, index, rect: normalizeRect(value.rect, 'OverrideClsn rect') };
  return { kind, group, index, scale: numericArray(value.scale, 'TransformClsn scale', 2, 2, 1), angle: finite(value.angle, 'TransformClsn angle'), pivot: numericArray(value.pivot, 'TransformClsn pivot', 2, 2, 0) };
}
function cleanDestination(value) { return value ? { sourcePath: value.sourcePath, sourceHash: value.sourceHash, sourceVersion: value.sourceVersion, stateNumber: value.stateNumber, stateLine: value.stateLine, stateCharacter: value.stateCharacter, stateExpression: value.stateExpression, controller: { ...value.controller } } : null; }
function normalizeDestination(value) {
  if (!deeplyFrozen(value) || !exactKeys(value, ['sourcePath', 'sourceHash', 'sourceVersion', 'stateNumber', 'stateLine', 'stateCharacter', 'stateExpression', 'controller'])) throw new Error('Runtime controller destination must be exact, deeply frozen canonical evidence.');
  if (typeof value.sourcePath !== 'string' || !value.sourcePath || !exactHash(value.sourceHash) || !validVersion(value.sourceVersion) || !Number.isSafeInteger(value.stateNumber) || !Number.isSafeInteger(value.stateLine) || !Number.isSafeInteger(value.stateCharacter) || typeof value.stateExpression !== 'string') throw new Error('Runtime controller destination source or StateDef identity is malformed.');
  const controller = value.controller; if (!exactKeys(controller, ['kind', 'start', 'end', 'controllerHash']) || !KIND_FIELDS[controller.kind] || !Number.isSafeInteger(controller.start) || !Number.isSafeInteger(controller.end) || controller.start < 0 || controller.end <= controller.start || !exactHash(controller.controllerHash)) throw new Error('Runtime controller occurrence identity is malformed.');
  return cleanDestination(value);
}
function sourceEvidence(snapshot, destination) {
  if (!deeplyFrozen(snapshot) || !exactKeys(snapshot, ['inventoryComplete', 'clean', 'assignedSources', 'sources']) || snapshot.inventoryComplete !== true || typeof snapshot.clean !== 'boolean' || !Array.isArray(snapshot.assignedSources) || !Array.isArray(snapshot.sources) || snapshot.sources.length !== snapshot.assignedSources.length || snapshot.sources.length > MAX_SOURCES) return { error: 'The assigned-source snapshot is incomplete, mutable, duplicated, or oversized.' };
  let total = 0, selected = null, dirtyCount = 0; const seen = new Set();
  for (let index = 0; index < snapshot.sources.length; index += 1) {
    const item = snapshot.sources[index]; if (!exactKeys(item, ['available', 'dirty', 'filename', 'syntax', 'text', 'sourceHash', 'version'])) return { error: 'The assigned-source snapshot has noncanonical source evidence.' };
    const filename = item.filename, assigned = snapshot.assignedSources[index], text = typeof item.text === 'string' ? item.text : '', bytes = Buffer.byteLength(text, 'utf8'), key = typeof filename === 'string' ? filename.toLowerCase() : ''; total += bytes;
    const extension = path.extname(filename).toLowerCase(), canonicalSyntax = item.syntax === 'zss' && extension === '.zss' || item.syntax === 'cns' && extension === '.cns';
    if (typeof item.dirty !== 'boolean' || item.dirty && !Number.isSafeInteger(item.version)) return { error: 'Dirty open source evidence requires an exact nonnegative document version.' };
    if (item.dirty) dirtyCount += 1;
    if (!normalizedAbsolutePath(filename) || !normalizedAbsolutePath(assigned) || item.available !== true || !canonicalSyntax || !validVersion(item.version) || !samePath(filename, assigned) || seen.has(key) || bytes > MAX_SOURCE_BYTES || total > MAX_TOTAL_SOURCE_BYTES || !exactHash(item.sourceHash) || sha(text) !== item.sourceHash) return { error: 'The assigned-source snapshot contains relative, stale, unavailable, duplicate, mismatched, noncanonical, or oversized evidence.' };
    seen.add(key); if (samePath(filename, destination.sourcePath)) selected = { ...item, filename, text };
  }
  if (snapshot.clean !== (dirtyCount === 0)) return { error: 'The snapshot clean flag does not match its exact open-document evidence.' };
  if (!selected) return { error: 'The exact destination is not an assigned source.' };
  if (selected.syntax !== 'zss') return { error: 'CNS runtime-controller replacement is not reviewed in C15B1.' };
  if (selected.text.startsWith('\uFEFF') || selected.text.includes('\0')) return { error: 'BOM or binary text prevents byte-preserving planning.' };
  const eol = eolOf(selected.text); if (!eol) return { error: 'Mixed or unsupported line endings prevent byte-preserving planning.' };
  if (!samePath(selected.filename, destination.sourcePath) || selected.sourceHash !== destination.sourceHash || selected.version !== destination.sourceVersion) return { error: 'The destination path, hash, or version is stale.' };
  return { selected, eol };
}
function stateSegments(text) {
  const masked = maskSource(text, 'zss'), anchors = [], statePattern = /^[ \t]*\[[ \t]*StateDef\b[^\]\r\n]*\]/gim, functionPattern = /^[ \t]*function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/gim; let match;
  while ((match = statePattern.exec(masked))) anchors.push({ kind: 'state', start: match.index });
  while ((match = functionPattern.exec(masked))) anchors.push({ kind: 'function', start: match.index });
  anchors.sort((a, b) => a.start - b.start); for (let index = 0; index < anchors.length; index += 1) anchors[index].end = anchors[index + 1]?.start ?? text.length;
  return { masked, anchors };
}
function balanced(masked, start, end) { let depth = 0; for (let at = start; at < end; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth < 0) return false; } return depth === 0; }
function exactState(source, destination) {
  const parsed = parseStateSource(source.text, source.filename, 'zss'), declarations = parsed.declarations || []; if (declarations.length > MAX_STATES) return { error: `The source exceeds the ${MAX_STATES}-StateDef cap.` };
  const matches = declarations.filter(item => !item.dynamic && item.value === destination.stateNumber); if (matches.length !== 1) return { error: matches.length ? 'The selected StateDef number is duplicated.' : 'The selected StateDef is missing.' };
  const declaration = matches[0]; if (destination.stateNumber < 0) return { error: 'Negative/global StateDefs do not provide ordinary self-state edit provenance.' };
  if (destination.stateLine !== declaration.line || destination.stateCharacter !== declaration.character || destination.stateExpression !== declaration.expression) return { error: 'The exact StateDef declaration identity is stale.' };
  const segments = stateSegments(source.text), segment = segments.anchors.find(item => item.kind === 'state' && lineNumber(source.text, item.start) === declaration.line); if (!segment || !balanced(segments.masked, segment.start, segment.end)) return { error: 'The selected StateDef structure is malformed.' };
  if (/@customstate\b/i.test(segments.masked.slice(segment.start, segment.end))) return { error: 'StateDefs containing @customstate have unresolved runtime ownership.' };
  return { declaration, segment, masked: segments.masked };
}
function matchingBrace(masked, open, end = masked.length) { let depth = 0; for (let at = open; at < end; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth === 0) return at; } return -1; }
function parseGroup(text) { const value = String(text).trim(), named = GROUP_VALUES[value.toLowerCase()]; return named === undefined ? null : named; }
function parseNumber(text) { const value = String(text).trim(); if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null; const number = Number(value); return Number.isFinite(number) && Math.abs(number) <= MAX_MAGNITUDE ? clean(number) : null; }
function parseList(text, minimum, maximum, fill) { const parts = String(text).split(',').map(item => item.trim()); if (parts.length < minimum || parts.length > maximum || parts.some(item => item === '')) return null; const values = parts.map(parseNumber); if (values.some(value => value === null)) return null; while (values.length < maximum) values.push(fill); return values; }
function parseControllerBody(source, record, expectedKind) {
  const masked = maskSource(source, 'zss'), open = masked.indexOf('{', record.controllerStart), close = matchingBrace(masked, open, record.controllerEnd); if (open < record.controllerStart || close !== record.controllerEnd - 1) return { error: 'The selected controller braces are incomplete or ambiguous.' };
  const body = source.slice(open + 1, close); if (/[#@"'{}]/.test(body)) return { error: 'Comments, directives, strings, or nested statements inside the controller body are not replaceable in C15B1.' };
  const allowed = new Set(KIND_FIELDS[expectedKind]), fields = new Map(); let cursor = 0;
  while (cursor < body.length) {
    const padding = /^[\s;]*/.exec(body.slice(cursor))[0]; cursor += padding.length; if (cursor >= body.length) break;
    const match = /^([A-Za-z_][A-Za-z0-9_.]*)[ \t]*:[ \t]*([^;{}\r\n]*?)[ \t]*;/.exec(body.slice(cursor)); if (!match) return { error: 'The controller body contains an unsupported or malformed statement.' };
    const key = match[1].toLowerCase(); if (!allowed.has(key)) return { error: `The controller body contains unsupported field ${match[1]}.` }; if (fields.has(key)) return { error: `The controller body duplicates ${match[1]}.` }; fields.set(key, match[2].trim()); cursor += match[0].length;
  }
  const defaults = expectedKind === 'OverrideClsn' ? { kind: expectedKind, group: 0, index: 0, rect: [0, 0, 0, 0] } : { kind: expectedKind, group: -1, index: -1, scale: [1, 1], angle: 0, pivot: [0, 0] };
  if (fields.has('group')) { const group = parseGroup(fields.get('group')); if (group === null) return { error: 'The existing group is dynamic or unsupported.' }; defaults.group = group; }
  if (fields.has('index')) { const index = parseNumber(fields.get('index')); if (index === null || !Number.isSafeInteger(index)) return { error: 'The existing index is dynamic or not an integer.' }; defaults.index = index; }
  if (expectedKind === 'OverrideClsn') { if (fields.has('rect')) { const rect = parseList(fields.get('rect'), 1, 4, 0); if (!rect) return { error: 'The existing rect is dynamic or has unsupported arity.' }; defaults.rect = normalizeRect(rect, 'existing OverrideClsn rect'); } }
  else {
    if (fields.has('scale')) { const scale = parseList(fields.get('scale'), 1, 2, 1); if (!scale) return { error: 'The existing scale is dynamic or has unsupported arity.' }; defaults.scale = scale; }
    if (fields.has('angle')) { const angle = parseNumber(fields.get('angle')); if (angle === null) return { error: 'The existing angle is dynamic.' }; defaults.angle = angle; }
    if (fields.has('pivot')) { const pivot = parseList(fields.get('pivot'), 1, 2, 0); if (!pivot) return { error: 'The existing pivot is dynamic or has unsupported arity.' }; defaults.pivot = pivot; }
  }
  return { open, close, bodyStart: open + 1, bodyEnd: close, body, fields: [...fields.keys()], normalized: defaults };
}
function sameValues(left, right) { if (left.kind !== right.kind || left.group !== right.group) return false; if (left.group === 0) return true; const fields = left.kind === 'OverrideClsn' ? ['index', 'rect'] : ['index', 'scale', 'angle', 'pivot']; return fields.every(key => Array.isArray(left[key]) ? left[key].length === right[key].length && left[key].every((value, index) => value === right[key][index]) : left[key] === right[key]); }
function renderBody(draft, source, record, eol) {
  const baseIndent = (/^[ \t]*/.exec(source.slice(lineStart(source, record.controllerStart))) || [''])[0], indent = `${baseIndent}\t`, lines = [`${indent}group: ${GROUP_NAMES[String(draft.group)]};`];
  if (draft.group !== 0) {
    lines.push(`${indent}index: ${decimal(draft.index)};`);
    if (draft.kind === 'OverrideClsn') lines.push(`${indent}rect: ${draft.rect.map(decimal).join(', ')};`);
    else { lines.push(`${indent}scale: ${draft.scale.map(decimal).join(', ')};`); lines.push(`${indent}angle: ${decimal(draft.angle)};`); lines.push(`${indent}pivot: ${draft.pivot.map(decimal).join(', ')};`); }
  }
  return `${eol}${lines.join(eol)}${eol}${baseIndent}`;
}
function contextPreview(source, start, end, replacement, eol) {
  const starts = [0]; for (let at = 0; at < source.length; at += 1) if (source[at] === '\n') starts.push(at + 1);
  const fromLine = Math.max(0, lineNumber(source, start) - MAX_CONTEXT_LINES), toLine = Math.min(starts.length, lineNumber(source, end) + MAX_CONTEXT_LINES + 2), contextStart = starts[fromLine], contextEnd = toLine < starts.length ? starts[toLine] : source.length, before = source.slice(contextStart, contextEnd), relativeStart = start - contextStart, relativeEnd = end - contextStart, after = before.slice(0, relativeStart) + replacement + before.slice(relativeEnd), diff = ['--- source', '+++ proposed', `@@ line ${lineNumber(source, start) + 1}, column ${start - lineStart(source, start) + 1} @@`, ...before.replace(/\r\n/g, '\n').split('\n').map(line => `-${line}`), ...after.replace(/\r\n/g, '\n').split('\n').map(line => `+${line}`)].join('\n');
  limited(diff, MAX_DIFF_BYTES, 'Runtime controller diff'); return { before, after, diff, contextStartLine: fromLine, replacementLine: lineNumber(source, start), replacementColumn: start - lineStart(source, start), eol: eol === '\r\n' ? 'CRLF' : 'LF' };
}
function finalize(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: { ...EFFECTS } }, output = { ...semantic, planHash: semanticHash(semantic) }; limited(JSON.stringify(output), MAX_OUTPUT_BYTES, 'Runtime controller replacement plan output'); return deepFreeze(output); }
function unavailable(reason, context = {}) { return finalize({ status: 'unavailable', sourceCommit: context.sourceCommit || '', capabilityFingerprint: context.capabilityFingerprint || '', destination: context.destination || null, controllerAuthority: null, before: null, after: null, replacement: null, preview: { before: '', after: '', diff: '' }, hashes: { source: '', before: '', after: '', controllerBefore: '', controllerAfter: '', bodyBefore: '', bodyAfter: '' }, conflicts: [], limitations: [reason] }); }
function unresolved(reason, context = {}, conflict = false) { return finalize({ status: conflict ? 'conflict' : 'unresolved', sourceCommit: context.sourceCommit || '', capabilityFingerprint: context.capabilityFingerprint || '', destination: context.destination || null, controllerAuthority: null, before: context.before || null, after: context.after || null, replacement: null, preview: { before: '', after: '', diff: '' }, hashes: { source: '', before: '', after: '', controllerBefore: '', controllerAfter: '', bodyBefore: '', bodyAfter: '' }, conflicts: conflict ? [reason] : [], limitations: [reason] }); }
function exactController(source, state, destination) {
  const records = parseCollisionReferences(source.text, 'zss'); if (records.length > MAX_CONTROLLERS) return { error: `The source exceeds the ${MAX_CONTROLLERS}-controller cap.` };
  const record = records.find(item => item.controllerStart === destination.controller.start && item.controllerEnd === destination.controller.end && item.label === destination.controller.kind);
  if (!record || sha(source.text.slice(destination.controller.start, destination.controller.end)) !== destination.controller.controllerHash) return { error: 'The exact selected controller occurrence is stale.' };
  if (record.controllerStart < state.segment.start || record.controllerEnd > state.segment.end) return { error: 'The selected controller is outside the exact StateDef.' };
  if (!record.sourceExact || !record.available || record.redirect || record.dynamic || record.conditional) return { error: record.reason || 'The selected controller is nested, redirected, dynamic, or incomplete.' };
  const body = parseControllerBody(source.text, record, destination.controller.kind); if (body.error) return body; if (body.fields.length > MAX_FIELDS) return { error: `The controller exceeds the ${MAX_FIELDS}-field cap.` };
  return { record, body };
}
function verifyProposed(source, proposed, destination, draft, original) {
  if (proposed.slice(0, original.body.bodyStart) !== source.text.slice(0, original.body.bodyStart) || proposed.slice(original.body.bodyStart + (renderBody(draft, source.text, original.record, eolOf(source.text))).length) !== source.text.slice(original.body.bodyEnd)) return { error: 'Bytes outside the selected controller body were not preserved.' };
  const adjusted = { ...destination, sourceHash: sha(proposed), controller: { ...destination.controller, end: destination.controller.end + proposed.length - source.text.length, controllerHash: sha(proposed.slice(destination.controller.start, destination.controller.end + proposed.length - source.text.length)) } }, proposedSource = { ...source, text: proposed, sourceHash: sha(proposed) }, state = exactState(proposedSource, adjusted); if (state.error) return state;
  const controller = exactController(proposedSource, state, adjusted); if (controller.error) return controller; if (!sameValues(controller.body.normalized, draft)) return { error: 'The proposed controller does not reparse to the reviewed normalized semantics.' };
  return { controller, destination: adjusted };
}

function createAirRuntimeCollisionControllerReplacementPlan(input = {}) {
  if (!plainData(input)) throw new Error('Runtime controller planner input must be canonical plain data without accessors, proxies, cycles, sparse arrays, symbols, or non-finite numbers.');
  if (!exactKeys(input, ['sourceCommit', 'capability', 'snapshot', 'destination', 'draft'])) throw new Error('Runtime controller planner input must contain only sourceCommit, capability, snapshot, destination, and draft.');
  if (!deeplyFrozen(input.capability) || !deeplyFrozen(input.snapshot) || !deeplyFrozen(input.destination) || !deeplyFrozen(input.draft)) throw new Error('Runtime controller capability, snapshot, destination, and draft must be deeply frozen.');
  if (typeof input.sourceCommit !== 'string' || input.sourceCommit.length > 64) throw new Error('Runtime controller sourceCommit is malformed.');
  const capability = normalizeCapability(input.capability), destination = normalizeDestination(input.destination), draft = normalizeDraft(input.draft), context = { sourceCommit: input.sourceCommit, capabilityFingerprint: capability.fingerprint, destination };
  if (!normalizedAbsolutePath(destination.sourcePath)) return unresolved('The destination source path must already be normalized and absolute; cwd-derived authority is forbidden.', context, true);
  if (input.sourceCommit !== PINNED_SOURCE_COMMIT) return unavailable(`Controller semantics are pinned to official IKEMEN GO commit ${PINNED_SOURCE_COMMIT}.`, context);
  if (capability.target !== 'nightly' || capability.decision !== 'supported' || !capability.indexed) return unavailable('An exact verified Nightly indexed collision capability decision is required.', context);
  if (draft.group === 4 && !capability.dummy) return unavailable('Dummy requires an exact verified supporting capability decision.', context);
  if (draft.kind !== destination.controller.kind) return unresolved('The draft kind does not match the exact selected controller.', context, true);
  const evidence = sourceEvidence(input.snapshot, destination); if (evidence.error) return unresolved(evidence.error, context, true);
  const state = exactState(evidence.selected, destination); if (state.error) return unresolved(state.error, context, true);
  const selected = exactController(evidence.selected, state, destination); if (selected.error) return unresolved(selected.error, context, true);
  const before = selected.body.normalized; if (sameValues(before, draft)) return finalize({ status: 'no-op', sourceCommit: input.sourceCommit, capabilityFingerprint: capability.fingerprint, destination, controllerAuthority: { kind: selected.record.label, start: selected.record.controllerStart, end: selected.record.controllerEnd, controllerHash: destination.controller.controllerHash, bodyStart: selected.body.bodyStart, bodyEnd: selected.body.bodyEnd, bodyHash: sha(selected.body.body) }, before, after: draft, replacement: null, preview: { before: '', after: '', diff: '' }, hashes: { source: evidence.selected.sourceHash, before: evidence.selected.sourceHash, after: evidence.selected.sourceHash, controllerBefore: destination.controller.controllerHash, controllerAfter: destination.controller.controllerHash, bodyBefore: sha(selected.body.body), bodyAfter: sha(selected.body.body) }, conflicts: [], limitations: ['The existing controller already has the reviewed normalized semantics; source bytes remain unchanged.', 'No mutation authority is issued by this pure planner.'] });
  const replacementText = renderBody(draft, evidence.selected.text, selected.record, evidence.eol), proposed = evidence.selected.text.slice(0, selected.body.bodyStart) + replacementText + evidence.selected.text.slice(selected.body.bodyEnd), verified = verifyProposed(evidence.selected, proposed, destination, draft, selected); if (verified.error) return unresolved(verified.error, { ...context, before, after: draft }, true);
  const afterRecord = verified.controller.record, afterBody = verified.controller.body, preview = contextPreview(evidence.selected.text, selected.body.bodyStart, selected.body.bodyEnd, replacementText, evidence.eol), controllerBefore = evidence.selected.text.slice(selected.record.controllerStart, selected.record.controllerEnd), controllerAfter = proposed.slice(afterRecord.controllerStart, afterRecord.controllerEnd), replacement = { start: selected.body.bodyStart, end: selected.body.bodyEnd, text: replacementText, replacedByteLength: Buffer.byteLength(selected.body.body, 'utf8'), insertedByteLength: Buffer.byteLength(replacementText, 'utf8'), anchorHash: sha(evidence.selected.text.slice(Math.max(0, selected.body.bodyStart - 128), Math.min(evidence.selected.text.length, selected.body.bodyEnd + 128))) };
  return finalize({ status: 'ready', sourceCommit: input.sourceCommit, capabilityFingerprint: capability.fingerprint, destination, controllerAuthority: { kind: selected.record.label, start: selected.record.controllerStart, end: selected.record.controllerEnd, controllerHash: sha(controllerBefore), bodyStart: selected.body.bodyStart, bodyEnd: selected.body.bodyEnd, bodyHash: sha(selected.body.body) }, before, after: draft, replacement, preview, hashes: { source: evidence.selected.sourceHash, before: evidence.selected.sourceHash, after: sha(proposed), controllerBefore: sha(controllerBefore), controllerAfter: sha(controllerAfter), bodyBefore: sha(selected.body.body), bodyAfter: sha(replacementText) }, conflicts: [], limitations: ['Only the exact existing top-level static ZSS controller body is replaced.', 'C15A geometry is display evidence only and supplies no source or mutation authority.', 'This pure plan issues no mutation authority and makes no live runtime claim.'] });
}

module.exports = { SCHEMA, PINNED_SOURCE_COMMIT, MAX_SOURCES, MAX_SOURCE_BYTES, MAX_TOTAL_SOURCE_BYTES, MAX_STATES, MAX_CONTROLLERS, MAX_FIELDS, MAX_DIFF_BYTES, MAX_OUTPUT_BYTES, createAirRuntimeCollisionControllerReplacementPlan };
