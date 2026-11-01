'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { maskSource, parseStateSource } = require('./state_transfer_model');
const { parseCollisionEligibilityReferences } = require('./collision_eligibility_reference_authority');
const { literalAttribute, literalCollisionGroup, parseCollisionContactReferences } = require('./collision_contact_reference_authority');

const SCHEMA = 'ikemaker.air-collision-destination-plan';
const EXISTING_EDIT_SCHEMA = 'ikemaker.air-collision-existing-property-edit-plan';
const MAX_SOURCES = 128;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_STATES = 4096;
const MAX_CONTROLLERS = 8192;
const MAX_FIELDS = 256;
const MAX_CONTEXT_LINES = 8;
const MAX_DIFF_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const CONTACT_KINDS = new Set(['HitDef', 'ModifyHitDef', 'Projectile', 'ModifyProjectile', 'ReversalDef', 'ModifyReversalDef']);
const ELIGIBILITY_KINDS = new Set(['HitBy', 'NotHitBy']);
const ELIGIBILITY_EDIT_FIELDS = new Set(['attr', 'time', 'clsn.group', 'clsn.index', 'playerno', 'playerid', 'slot', 'stack']);
const CONTACT_EDIT_FIELDS = new Set(['attr', 'reversal.attr', 'p2clsncheck', 'p2clsnrequire']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function c10DraftHash(value) { return sha(JSON.stringify(value)); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function deeplyFrozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value) || !Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(child => deeplyFrozen(child, seen)); }
function canonicalObject(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value)) return false;
  if (stack.has(value)) return false; stack.add(value);
  if (Array.isArray(value)) { const keys = Object.keys(value), symbols = Object.getOwnPropertySymbols(value), valid = symbols.length === 0 && keys.length === value.length && keys.every((key, index) => Number(key) === index && descriptorValueIsCanonical(value, key, stack)); stack.delete(value); return valid; }
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value), own = Reflect.ownKeys(value), valid = own.length === keys.length && keys.every(key => !FORBIDDEN_KEYS.has(key) && descriptorValueIsCanonical(value, key, stack)); stack.delete(value); return valid;
}
function descriptorValueIsCanonical(owner, key, stack) { const descriptor = Object.getOwnPropertyDescriptor(owner, key); return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && canonicalObject(descriptor.value, stack); }
function exactHash(value) { return /^[A-F0-9]{64}$/.test(String(value || '')); }
function exactStringHash(value) { return typeof value === 'string' && /^[A-F0-9]{64}$/.test(value); }
function exactKeys(value, keys) { if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) return false; const own = Reflect.ownKeys(value); return own.length === keys.length && keys.every(key => own.includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) || {}, 'value')); }
function validVersion(value) { return value === null || value === undefined || Number.isSafeInteger(value) && value >= 0; }
function samePath(left, right) { return path.resolve(String(left || '')).toLowerCase() === path.resolve(String(right || '')).toLowerCase(); }
function lineNumber(text, offset) { return text.slice(0, offset).split('\n').length - 1; }
function lineStart(text, offset) { return text.lastIndexOf('\n', Math.max(0, offset) - 1) + 1; }
function eolOf(text) { if (/\r(?!\n)/.test(text)) return null; const crlf = /\r\n/.test(text), lf = /(^|[^\r])\n/.test(text); return crlf && lf ? null : crlf ? '\r\n' : '\n'; }
function limited(text, maximum, label) { if (Buffer.byteLength(String(text), 'utf8') > maximum) throw new Error(`${label} exceeds ${maximum} bytes.`); return String(text); }
function safeValue(value, label) { const text = String(value ?? '').trim(); if (!text || /[{};#\r\n]/.test(text) || text.length > 192) throw new Error(`${label} is not a bounded reviewed literal.`); return text; }
function literalInteger(value, minimum = -2147483648, maximum = 2147483647) { return /^[+-]?\d+$/.test(String(value || '').trim()) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum; }
function literalEligibilityValue(key, value) {
  const text = safeValue(value, key);
  if (key === 'attr') return literalAttribute(text) ? text : null;
  if (key === 'clsn.group') return /^(?:clsn1|clsn2)$/i.test(text) ? text : null;
  if (key === 'clsn.index') return literalInteger(text, 0, 65535) ? text : null;
  if (key === 'slot') return literalInteger(text, 0, 7) ? text : null;
  if (key === 'stack') return /^(?:0|1|true|false)$/i.test(text) ? text : null;
  return literalInteger(text) ? text : null;
}
function literalContactValue(key, value) {
  const text = safeValue(value, key);
  if (key === 'attr' || key === 'reversal.attr') return literalAttribute(text) ? text : null;
  return literalCollisionGroup(text) ? text : null;
}
function cleanDestination(value) {
  if (!value || typeof value !== 'object') return null;
  const integer = candidate => Number.isSafeInteger(candidate) ? candidate : null;
  const controller = value.controller && typeof value.controller === 'object' ? {
    kind: String(value.controller.kind || ''),
    start: integer(value.controller.start),
    end: integer(value.controller.end),
    controllerHash: String(value.controller.controllerHash || '').toUpperCase()
  } : null;
  return deepFreeze({
    sourcePath: String(value.sourcePath || ''),
    sourceHash: String(value.sourceHash || '').toUpperCase(),
    sourceVersion: validVersion(value.sourceVersion) ? value.sourceVersion ?? null : null,
    stateNumber: integer(value.stateNumber),
    stateLine: integer(value.stateLine),
    stateCharacter: integer(value.stateCharacter),
    stateExpression: String(value.stateExpression || ''),
    ...(controller ? { controller } : {})
  });
}
function exactExistingEditDestination(value) {
  if (!value || !deeplyFrozen(value) || !canonicalObject(value) || !exactKeys(value, ['sourcePath', 'sourceHash', 'sourceVersion', 'stateNumber', 'stateLine', 'stateCharacter', 'stateExpression', 'controller'])) return false;
  if (typeof value.sourcePath !== 'string' || !exactStringHash(value.sourceHash) || !validVersion(value.sourceVersion) || !Number.isSafeInteger(value.stateNumber) || !Number.isSafeInteger(value.stateLine) || !Number.isSafeInteger(value.stateCharacter) || typeof value.stateExpression !== 'string') return false;
  const controller = value.controller;
  return exactKeys(controller, ['kind', 'start', 'end', 'controllerHash']) && typeof controller.kind === 'string' && Number.isSafeInteger(controller.start) && Number.isSafeInteger(controller.end) && exactStringHash(controller.controllerHash);
}
function unresolved(reason, projection, destination = null, conflicts = []) { return finalize({ status: conflicts.length ? 'conflict' : 'unresolved', draftHash: exactHash(projection?.draftHash) ? projection.draftHash : '', destination: cleanDestination(destination), operation: null, insertion: null, preview: { before: '', after: '', diff: '' }, hashes: { source: '', before: '', after: '' }, conflicts: conflicts.map(item => String(item)), limitations: [String(reason)] }); }
function finalize(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false } }, output = { ...semantic, planHash: semanticHash(semantic) }; limited(JSON.stringify(output), MAX_OUTPUT_BYTES, 'Collision destination plan output'); return deepFreeze(output); }
function unresolvedExisting(reason, projection, destination = null, conflicts = []) { return finalizeExisting({ status: conflicts.length ? 'conflict' : 'unresolved', draftHash: exactHash(projection?.draftHash) ? projection.draftHash : '', destination: cleanDestination(destination), operation: null, insertion: null, fieldAuthority: null, preview: { before: '', after: '', diff: '' }, hashes: { source: '', before: '', after: '' }, conflicts: conflicts.map(item => String(item)), limitations: [String(reason)] }); }
function finalizeExisting(body) { const semantic = { schema: EXISTING_EDIT_SCHEMA, version: 1, ...body, effects: { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false } }, output = { ...semantic, planHash: semanticHash(semantic) }; limited(JSON.stringify(output), MAX_OUTPUT_BYTES, 'Collision existing-property edit plan output'); return deepFreeze(output); }

function verifiedProjection(projection) {
  if (!projection || !canonicalObject(projection) || !deeplyFrozen(projection) || projection.schema !== 'ikemaker.air-collision-property-draft' || projection.version !== 1 || projection.status !== 'ready' || projection.recipe?.available !== true || !exactHash(projection.draftHash)) return null;
  const { draftHash, ...semantic } = projection;
  return c10DraftHash(semantic) === draftHash ? projection : null;
}

function sourceEvidence(snapshot, destination) {
  if (!snapshot || !canonicalObject(snapshot) || !deeplyFrozen(snapshot) || snapshot.inventoryComplete !== true || snapshot.clean !== true || !Array.isArray(snapshot.assignedSources) || !Array.isArray(snapshot.sources) || snapshot.sources.length !== snapshot.assignedSources.length || snapshot.sources.length > MAX_SOURCES) return { error: 'The assigned-source snapshot is incomplete, mutable, dirty, duplicated, or oversized.' };
  let total = 0, selected = null; const seen = new Set();
  for (let index = 0; index < snapshot.sources.length; index += 1) {
    const item = snapshot.sources[index], rawFilename = String(item?.filename || ''), rawAssigned = String(snapshot.assignedSources[index] || ''), filename = rawFilename ? path.resolve(rawFilename) : '', text = String(item?.text ?? ''), bytes = Buffer.byteLength(text, 'utf8'), key = filename.toLowerCase(); total += bytes;
    const extension = path.extname(filename).toLowerCase(), canonicalSyntax = item?.syntax === 'zss' && extension === '.zss' || item?.syntax === 'cns' && extension === '.cns';
    if (!rawFilename || !rawAssigned || !filename || item?.available !== true || item?.dirty !== false || !canonicalSyntax || !validVersion(item?.version) || !samePath(filename, rawAssigned) || seen.has(key) || bytes > MAX_SOURCE_BYTES || total > MAX_TOTAL_SOURCE_BYTES || !exactHash(String(item?.sourceHash || '').toUpperCase()) || sha(text) !== String(item.sourceHash).toUpperCase()) return { error: 'The assigned-source snapshot contains stale, unavailable, duplicate, mismatched, noncanonical, or oversized evidence.' };
    seen.add(key); if (samePath(filename, destination?.sourcePath)) selected = { ...item, filename, text, sourceHash: sha(text) };
  }
  if (!selected) return { error: 'The explicit destination source is not in the exact assigned-source snapshot.' };
  if (selected.syntax !== 'zss') return { error: 'CNS rendering is not yet reviewed; this planning stage is ZSS-only.' };
  if (selected.text.startsWith('\uFEFF') || selected.text.includes('\0')) return { error: 'BOM or binary-text evidence prevents byte-preserving ZSS planning.' };
  const eol = eolOf(selected.text); if (!eol) return { error: 'Mixed or unsupported line endings prevent byte-preserving ZSS planning.' };
  if (!validVersion(destination.sourceVersion) || !samePath(destination.sourcePath, selected.filename) || String(destination.sourceHash || '').toUpperCase() !== selected.sourceHash || (destination.sourceVersion ?? null) !== (selected.version ?? null)) return { error: 'The destination path, hash, or document version does not match the exact source evidence.' };
  return { selected, eol };
}

function stateSegments(text) {
  const masked = maskSource(text, 'zss'), anchors = [], statePattern = /^[ \t]*\[[ \t]*StateDef\b[^\]\r\n]*\]/gim, functionPattern = /^[ \t]*function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/gim; let match;
  while ((match = statePattern.exec(masked))) anchors.push({ kind: 'state', start: match.index, headerEnd: statePattern.lastIndex });
  while ((match = functionPattern.exec(masked))) anchors.push({ kind: 'function', start: match.index, headerEnd: functionPattern.lastIndex });
  anchors.sort((a, b) => a.start - b.start); for (let index = 0; index < anchors.length; index += 1) anchors[index].end = anchors[index + 1]?.start ?? text.length;
  return { masked, anchors };
}
function balanced(masked, start, end) { let depth = 0; for (let at = start; at < end; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth < 0) return false; } return depth === 0; }
function exactState(source, destination) {
  const parsed = parseStateSource(source.text, source.filename, 'zss'), declarations = parsed.declarations || [];
  if (declarations.length > MAX_STATES) return { error: `The source exceeds the ${MAX_STATES}-StateDef planning cap.` };
  const matches = declarations.filter(item => !item.dynamic && Number(item.value) === Number(destination.stateNumber));
  if (matches.length !== 1) return { error: matches.length ? 'The selected StateDef number is duplicated.' : 'The selected StateDef no longer exists.' };
  const declaration = matches[0];
  if (!Number.isSafeInteger(Number(destination.stateNumber)) || Number(destination.stateLine) !== declaration.line || Number(destination.stateCharacter) !== declaration.character || String(destination.stateExpression || '') !== String(declaration.expression || '')) return { error: 'The explicit StateDef declaration identity no longer matches.' };
  const segments = stateSegments(source.text), segment = segments.anchors.find(item => item.kind === 'state' && lineNumber(source.text, item.start) === declaration.line);
  if (!segment || !balanced(segments.masked, segment.start, segment.end)) return { error: 'The selected StateDef structure is malformed or has no safe insertion boundary.' };
  return { declaration, segment, masked: segments.masked };
}

function contextPreview(source, offset, inserted, eol, replacedEnd = offset) {
  const starts = [0]; for (let at = 0; at < source.length; at += 1) if (source[at] === '\n') starts.push(at + 1);
  const insertionLine = lineNumber(source, offset), fromLine = Math.max(0, insertionLine - MAX_CONTEXT_LINES), toLine = Math.min(starts.length, Math.max(insertionLine, lineNumber(source, replacedEnd)) + MAX_CONTEXT_LINES + 2), contextStart = starts[fromLine], contextEnd = toLine < starts.length ? starts[toLine] : source.length, relative = offset - contextStart, relativeEnd = replacedEnd - contextStart, before = source.slice(contextStart, contextEnd), after = before.slice(0, relative) + inserted + before.slice(relativeEnd), normalizedBefore = before.replace(/\r\n/g, '\n').split('\n'), normalizedAfter = after.replace(/\r\n/g, '\n').split('\n'), diff = ['--- source', '+++ proposed', `@@ line ${insertionLine + 1}, column ${offset - lineStart(source, offset) + 1} @@`, ...normalizedBefore.map(line => `-${line}`), ...normalizedAfter.map(line => `+${line}`)].join('\n');
  limited(diff, MAX_DIFF_BYTES, 'Proposed diff'); return { before, after, diff, contextStartLine: fromLine, insertionLine, insertionColumn: offset - lineStart(source, offset), eol: eol === '\r\n' ? 'CRLF' : 'LF' };
}
function planInsertion(source, offset, inserted, operation, destination, projection, eol, limitations = []) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.text.length || !inserted && !operation.noop) return unresolved('The proposed insertion boundary is invalid.', projection, destination);
  const proposed = source.text.slice(0, offset) + inserted + source.text.slice(offset), preview = contextPreview(source.text, offset, inserted, eol), body = { status: operation.noop ? 'no-op' : 'ready', draftHash: projection.draftHash, destination: cleanDestination({ ...destination, sourcePath: source.filename, sourceHash: source.sourceHash, sourceVersion: source.version ?? null }), operation: operation.noop ? null : operation, insertion: operation.noop ? null : { start: offset, end: offset, text: inserted, insertedByteLength: Buffer.byteLength(inserted, 'utf8'), anchorHash: sha(source.text.slice(Math.max(0, offset - 128), Math.min(source.text.length, offset + 128))) }, preview: operation.noop ? { ...preview, after: preview.before, diff: '' } : preview, hashes: { source: source.sourceHash, before: sha(source.text), after: sha(proposed) }, conflicts: [], limitations };
  body.operation = { ...operation, proposedTextHash: sha(proposed) }; return finalize(body);
}

function fieldAuthorityHash(field) { return sha(field.expression); }
function exactExistingRecord(projection, source, state, destination) {
  const family = projection.recipe.family, kind = projection.recipe.kind, records = family === 'eligibility' ? parseCollisionEligibilityReferences(source.text, 'zss') : family === 'contact' ? parseCollisionContactReferences(source.text, 'zss') : [];
  if (!destination.controller || !(family === 'eligibility' ? ELIGIBILITY_KINDS : CONTACT_KINDS).has(kind)) return { error: 'Existing-property editing requires a supported explicit controller destination.' };
  if (String(destination.controller.kind || '').toLowerCase() !== String(kind).toLowerCase()) return { error: 'The selected controller kind does not match the reviewed recipe.', conflict: true };
  const inState = records.filter(record => record.controllerStart >= state.segment.start && record.controllerEnd <= state.segment.end && record.label.toLowerCase() === String(kind).toLowerCase()), descriptor = destination.controller, exact = inState.filter(record => Number(descriptor.start) === record.controllerStart && Number(descriptor.end) === record.controllerEnd && String(descriptor.controllerHash || '').toUpperCase() === sha(source.text.slice(record.controllerStart, record.controllerEnd)));
  if (exact.length !== 1) return { error: exact.length ? 'The exact controller occurrence is ambiguous.' : 'The matching exact controller occurrence no longer exists.', conflict: true };
  const record = exact[0];
  if (record.sourceExact !== true || record.available !== true || record.redirect) return { error: record.reason || 'The exact controller span is stale, malformed, redirected, duplicated, or ambiguous.', conflict: true };
  if ((record.fields || []).length > MAX_FIELDS) throw new Error(`Collision controller fields exceed ${MAX_FIELDS}.`);
  return { record };
}
function reviewedRecipeField(projection, key) {
  const fields = projection.recipe.fields || {};
  if (projection.recipe.family === 'eligibility') {
    const recipeKey = key === 'clsn.group' ? 'group' : key === 'clsn.index' ? 'index' : key;
    return Object.prototype.hasOwnProperty.call(fields, recipeKey) ? { present: true, value: fields[recipeKey] } : { present: false };
  }
  const recipeKey = key === 'reversal.attr' ? 'reversalAttr' : key;
  if (!Object.prototype.hasOwnProperty.call(fields, recipeKey) || key === 'p2clsnrequire' && fields[recipeKey] === 'None') return { present: false };
  return { present: true, value: fields[recipeKey] };
}
function verifiedEditDescriptor(edit, projection, record, source) {
  if (!edit || !canonicalObject(edit) || !deeplyFrozen(edit) || typeof edit.action !== 'string' || !exactKeys(edit, edit.action === 'replace' ? ['action', 'field', 'replacement'] : edit.action === 'remove' ? ['action', 'field'] : [])) return { error: 'An exact deeply frozen canonical existing-field edit descriptor is required.' };
  const selected = edit.field;
  if (!exactKeys(selected, ['key', 'start', 'end', 'expression', 'expressionHash']) || typeof selected.key !== 'string' || !Number.isSafeInteger(selected.start) || !Number.isSafeInteger(selected.end) || typeof selected.expression !== 'string' || !exactStringHash(selected.expressionHash)) return { error: 'The selected field descriptor must contain only exact primitive key/span/expression/hash authority.' };
  const family = projection.recipe.family, key = selected.key, allowed = family === 'eligibility' ? ELIGIBILITY_EDIT_FIELDS : family === 'contact' ? CONTACT_EDIT_FIELDS : new Set();
  if (!allowed.has(key)) return { error: `${key || 'The selected field'} is not a reviewed ${family || 'collision'} edit field.` };
  if (family === 'contact') {
    const reversal = String(projection.recipe.kind || '').includes('Reversal');
    if (key === 'reversal.attr' && !reversal || key === 'attr' && reversal) return { error: `${key} is not valid for ${projection.recipe.kind}.` };
  }
  const matches = (record.fields || []).filter(field => field.key === key);
  if (matches.length !== 1) return { error: matches.length ? `${key} appears more than once.` : `${key} no longer exists in the selected controller.`, conflict: matches.length > 1 };
  const field = matches[0], expectedHash = fieldAuthorityHash(field);
  if (selected.start !== field.start || selected.end !== field.end || selected.expression !== field.expression || selected.expressionHash !== expectedHash || source.text.slice(selected.start, selected.end) !== selected.expression) return { error: 'The selected field occurrence is stale or does not match the exact source bytes.', conflict: true };
  if (!field.expression.trim() || field.literal === false || field.malformedConventional) return { error: `${key} is dynamic or malformed and cannot be edited by the literal planner.`, conflict: true };
  if (record.dynamic) return { error: 'The selected controller contains dynamic collision fields and cannot be changed by the literal planner.', conflict: true };
  const action = edit.action;
  if (action !== 'replace' && action !== 'remove') return { error: 'Existing-property action must be replace or remove.' };
  const reviewed = reviewedRecipeField(projection, key); let replacement = '';
  if (action === 'replace') {
    if (!reviewed.present) return { error: `${key} is absent from the frozen reviewed C10 recipe and cannot supply replacement authority.` };
    replacement = family === 'eligibility' ? literalEligibilityValue(key, reviewed.value) : literalContactValue(key, reviewed.value);
    if (replacement === null) return { error: `${key} replacement is not a reviewed literal for the pinned controller catalog.` };
    if (typeof edit.replacement !== 'string' || edit.replacement !== String(replacement)) return { error: `${key} replacement does not match the frozen reviewed C10 recipe.` };
  } else {
    if (reviewed.present) return { error: `${key} is still present in the frozen reviewed C10 recipe and cannot be removed.` };
    const requiredContactSelector = family === 'contact' && !String(projection.recipe.kind || '').startsWith('Modify') && (key === 'attr' || key === 'reversal.attr');
    if (requiredContactSelector || key === 'time' || key === 'clsn.group' || key === 'clsn.index') return { error: `${key} is required by the reviewed recipe and cannot be removed.` };
  }
  return { field: { ...field, key }, key, action, replacement };
}
function removalSpan(source, record, field) {
  const masked = maskSource(source.text, 'zss'), before = masked.slice(record.controllerStart, field.start), escaped = field.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), pattern = new RegExp(`(?:^|[;{\\r\\n])[ \\t]*${escaped}[ \\t]*:[ \\t]*$`, 'i'), matches = [...before.matchAll(new RegExp(pattern.source, 'gi'))], match = matches[matches.length - 1];
  if (!match) return null;
  const boundaryLength = /^[;{\r\n]/.test(match[0]) ? 1 : 0, keyStart = record.controllerStart + match.index + boundaryLength + (match[0].slice(boundaryLength).match(/^[ \t]*/) || [''])[0].length; let semicolon = field.end;
  while (semicolon < record.controllerEnd && (source.text[semicolon] === ' ' || source.text[semicolon] === '\t')) semicolon += 1;
  if (source.text[semicolon] !== ';') return null;
  return { start: keyStart, end: semicolon + 1 };
}
function customStateDirective(state) { return /@customstate\b/i.test(state.masked.slice(state.segment.start, state.segment.end)); }
function equivalentEditValue(key, left, right) {
  if (key === 'attr' || key === 'reversal.attr') return String(left).replace(/\s+/g, '').toUpperCase() === String(right).replace(/\s+/g, '').toUpperCase();
  if (key === 'clsn.group' || key === 'p2clsncheck' || key === 'p2clsnrequire') return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
  if (key === 'stack') { const normalized = value => /^(?:1|true)$/i.test(String(value).trim()) ? 1 : /^(?:0|false)$/i.test(String(value).trim()) ? 0 : NaN; return normalized(left) === normalized(right); }
  return literalInteger(left) && literalInteger(right) && Number(left) === Number(right);
}
function verifyEditedController(projection, sourceText, source, state, original, action, key) {
  const records = projection.recipe.family === 'eligibility' ? parseCollisionEligibilityReferences(sourceText, 'zss') : parseCollisionContactReferences(sourceText, 'zss'), candidates = records.filter(record => record.label.toLowerCase() === String(projection.recipe.kind).toLowerCase() && record.controllerStart === original.controllerStart);
  if (candidates.length !== 1) return `The ${projection.recipe.kind} controller is no longer uniquely parseable after the proposed ${action}.`;
  const record = candidates[0];
  if (!record.sourceExact || !record.available || record.redirect || record.dynamic) return `The proposed ${action} would leave the controller malformed, dynamic, redirected, or without its required selector.`;
  if (action === 'remove' && (record.fields || []).some(field => field.key === key)) return `The proposed removal did not remove the exact ${key} occurrence.`;
  return '';
}
function planExistingFieldEdit(source, span, replacement, operation, destination, projection, eol, verify, conditional = false, fieldAuthority = null) {
  if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > source.text.length) return unresolvedExisting('The selected field has no safe exact edit span.', projection, destination);
  const semanticNoop = operation.kind === 'replace-existing-field' && equivalentEditValue(operation.field, source.text.slice(span.start, span.end), replacement);
  if (semanticNoop) { const preview = contextPreview(source.text, span.start, '', eol); return finalizeExisting({ status: 'no-op', draftHash: projection.draftHash, destination: cleanDestination({ ...destination, sourcePath: source.filename, sourceHash: source.sourceHash, sourceVersion: source.version ?? null }), operation: { ...operation, noop: true, proposedTextHash: source.sourceHash, sourceField: fieldAuthority }, insertion: null, fieldAuthority, preview: { ...preview, after: preview.before, diff: '' }, hashes: { source: source.sourceHash, before: source.sourceHash, after: source.sourceHash }, conflicts: [], limitations: ['The reviewed literal is already semantically equal; source formatting remains byte-identical.'] }); }
  const proposed = source.text.slice(0, span.start) + replacement + source.text.slice(span.end), verificationError = verify(proposed); if (verificationError) return unresolvedExisting(verificationError, projection, destination, [verificationError]);
  const preview = contextPreview(source.text, span.start, replacement, eol, span.end), edit = { start: span.start, end: span.end, text: replacement, replacedByteLength: Buffer.byteLength(source.text.slice(span.start, span.end), 'utf8'), insertedByteLength: Buffer.byteLength(replacement, 'utf8'), anchorHash: sha(source.text.slice(Math.max(0, span.start - 128), Math.min(source.text.length, span.end + 128))) }, limitations = ['Only the exact selected literal field occurrence is changed.', 'This is a proposed diff only; C14A grants no mutation authority.']; if (conditional) limitations.unshift('The controller is conditionally nested; this plan does not claim runtime ownership or execution.'); const body = { status: 'ready', draftHash: projection.draftHash, destination: cleanDestination({ ...destination, sourcePath: source.filename, sourceHash: source.sourceHash, sourceVersion: source.version ?? null }), operation: { ...operation, noop: false, proposedTextHash: sha(proposed) }, insertion: edit, preview, hashes: { source: source.sourceHash, before: sha(source.text), after: sha(proposed) }, conflicts: [], limitations };
  body.operation.sourceField = fieldAuthority; body.fieldAuthority = fieldAuthority; if (conditional) body.limitations[0] = 'The controller is conditional or Modify*; this plan does not claim runtime ownership or execution.'; return finalizeExisting(body);
}

function eligibilityPlan(projection, source, state, destination, eol) {
  if (destination.controller) return unresolved('Eligibility creates one new top-level controller and cannot target an existing controller.', projection, destination, ['Unexpected controller destination.']);
  const recipe = projection.recipe, fields = recipe.fields || {}, kind = recipe.kind, controller = kind === 'HitBy' ? 'hitBy' : kind === 'NotHitBy' ? 'notHitBy' : '';
  if (!controller) return unresolved('The eligibility recipe kind is unsupported.', projection, destination);
  const ordered = [['attr', safeValue(fields.attr, 'Hit attributes')], ['time', String(Number(fields.time))], ['clsn.group', safeValue(fields.group, 'Collision group')], ['clsn.index', String(Number(fields.index))]];
  for (const key of ['playerno', 'playerid']) if (fields[key] !== undefined) ordered.push([key, safeValue(fields[key], key)]); if (fields.slot !== undefined) ordered.push(['slot', String(Number(fields.slot))]); if (fields.stack !== undefined) ordered.push(['stack', fields.stack ? '1' : '0']);
  if (!Number.isSafeInteger(fields.time) || !Number.isSafeInteger(fields.index) || fields.index < 0 || fields.index > 65535 || fields.slot !== undefined && (!Number.isSafeInteger(fields.slot) || fields.slot < 0 || fields.slot > 7)) return unresolved('The normalized eligibility fields are outside reviewed bounds.', projection, destination);
  const code = `${controller}{${eol}${ordered.map(([name, value]) => `\t${name}: ${value};`).join(eol)}${eol}}`, offset = state.segment.end, before = source.text.slice(0, offset), separator = before.endsWith(eol + eol) || !before ? '' : before.endsWith(eol) ? eol : eol + eol, inserted = `${separator}${code}${eol}`;
  return planInsertion(source, offset, inserted, { kind: 'new-controller', controller: kind, fields: ordered.map(([name]) => name), noop: false }, destination, projection, eol, ['No trigger or redirect is synthesized.', 'This is a proposed diff only; C11A grants no mutation authority.']);
}

function normalizedContactFields(recipe) {
  const fields = recipe.fields || {}, output = [], reversal = recipe.kind.includes('Reversal');
  if (reversal && fields.reversalAttr !== undefined) output.push(['reversal.attr', safeValue(fields.reversalAttr, 'Reversal attributes')]);
  else if (!reversal && fields.attr !== undefined) output.push(['attr', safeValue(fields.attr, 'Contact attributes')]);
  if (fields.p2clsncheck !== undefined) output.push(['p2clsncheck', safeValue(fields.p2clsncheck, 'p2clsncheck')]);
  if (fields.p2clsnrequire !== undefined && fields.p2clsnrequire !== 'None') output.push(['p2clsnrequire', safeValue(fields.p2clsnrequire, 'p2clsnrequire')]);
  return output;
}
function equivalent(key, left, right) { const normalize = value => key === 'attr' || key === 'reversal.attr' ? String(value).replace(/\s+/g, '').toUpperCase() : String(value).trim().toLowerCase(); return normalize(left) === normalize(right); }
function contactPlan(projection, source, state, destination, eol) {
  const recipe = projection.recipe, kind = recipe.kind;
  if (!CONTACT_KINDS.has(kind) || !destination.controller) return unresolved('Contact planning requires an explicit matching existing controller.', projection, destination);
  if (String(destination.controller.kind || '').toLowerCase() !== kind.toLowerCase()) return unresolved('The selected controller kind does not match the reviewed recipe.', projection, destination, ['Controller kind mismatch.']);
  const records = parseCollisionContactReferences(source.text, 'zss'); if (records.length > MAX_CONTROLLERS) throw new Error(`Collision controller inventory exceeds ${MAX_CONTROLLERS}.`);
  const inState = records.filter(record => record.controllerStart >= state.segment.start && record.controllerEnd <= state.segment.end && record.label.toLowerCase() === kind.toLowerCase());
  if (inState.length !== 1) return unresolved(inState.length ? 'The matching controller kind is duplicated in this StateDef.' : 'The matching controller no longer exists in this StateDef.', projection, destination, inState.length ? ['Duplicate matching controllers.'] : []);
  const record = inState[0], descriptor = destination.controller, controllerHash = sha(source.text.slice(record.controllerStart, record.controllerEnd));
  if (Number(descriptor.start) !== record.controllerStart || Number(descriptor.end) !== record.controllerEnd || String(descriptor.controllerHash || '').toUpperCase() !== controllerHash || record.sourceExact !== true || record.redirect) return unresolved('The exact controller span is stale, malformed, redirected, or ambiguous.', projection, destination, ['Controller authority mismatch.']);
  const controllerMask = maskSource(source.text.slice(record.controllerStart, record.controllerEnd), 'zss'), fieldCount = (controllerMask.match(/(?:^|[;\r\n])[ \t]*[A-Za-z_][A-Za-z0-9_.]*[ \t]*:/gm) || []).length;
  if (fieldCount > MAX_FIELDS || (record.fields || []).length > MAX_FIELDS) throw new Error(`Collision controller fields exceed ${MAX_FIELDS}.`);
  const desired = normalizedContactFields(recipe), missing = [], existing = [], conflicts = [], supported = new Map();
  for (const field of record.fields || []) { if (!supported.has(field.key)) supported.set(field.key, []); supported.get(field.key).push(field); }
  for (const [key, matches] of supported) {
    if (matches.length > 1) conflicts.push(`${key} appears more than once.`);
    else if (!String(matches[0].expression || '').trim() || matches[0].malformedConventional || matches[0].literal !== true) conflicts.push(`${key} is dynamic or malformed and cannot be preserved by an exact contact-field plan.`);
  }
  for (const [key, value] of desired) { const matches = (record.fields || []).filter(field => field.key === key); if (!matches.length) missing.push([key, value]); else if (matches.length > 1) conflicts.push(`${key} appears more than once.`); else if (!matches[0].literal || !equivalent(key, matches[0].expression, value)) conflicts.push(`${key} differs from the reviewed literal.`); else existing.push(key); }
  if (conflicts.length) return unresolved('Existing contact fields conflict with the reviewed recipe.', projection, destination, conflicts);
  if (!missing.length) return planInsertion(source, record.controllerEnd - 1, '', { kind: 'add-missing-fields', controller: kind, fields: [], noop: true }, destination, projection, eol, ['Every reviewed field already matches exactly; no insertion is proposed.']);
  const close = record.controllerEnd - 1; if (source.text[close] !== '}' || !balanced(state.masked, record.controllerStart, record.controllerEnd)) return unresolved('The selected controller has no safe closing-brace insertion anchor.', projection, destination);
  const start = lineStart(source.text, close), whitespace = source.text.slice(start, close), baseIndent = (/^[ \t]*/.exec(source.text.slice(record.controllerStart)) || [''])[0], fieldIndent = `${baseIndent}\t`, lines = missing.map(([name, value]) => `${fieldIndent}${name}: ${value};`), offset = /^[ \t]*$/.test(whitespace) ? start : close, inserted = /^[ \t]*$/.test(whitespace) ? `${lines.join(eol)}${eol}` : `${eol}${lines.join(eol)}${eol}${baseIndent}`;
  return planInsertion(source, offset, inserted, { kind: 'add-missing-fields', controller: kind, fields: missing.map(([name]) => name), retainedEqualFields: existing, noop: false }, destination, projection, eol, ['Existing equal fields remain byte-identical.', 'No new attack, projectile, reversal, trigger, or redirect controller is synthesized.', 'This is a proposed diff only; C11A grants no mutation authority.']);
}

function createAirCollisionDestinationPlan(input = {}) {
  if (!input || !canonicalObject(input)) throw new Error('Collision destination input must be a finite canonical plain object.');
  const projection = verifiedProjection(input.projection); if (!projection) return unresolved('The deeply frozen canonical C10 draft is stale, altered, or not ready.', input.projection);
  const rawDestination = input.destination && canonicalObject(input.destination) && deeplyFrozen(input.destination) ? input.destination : null; if (!rawDestination) return unresolved('An explicit deeply frozen canonical destination descriptor is required.', projection);
  if (!validVersion(rawDestination.sourceVersion)) return unresolved('The destination document version must be null or a nonnegative safe integer.', projection, rawDestination);
  const destination = cleanDestination(rawDestination);
  const binding = input.snapshot?.targetBinding;
  if (!binding || binding.draftHash !== projection.draftHash || binding.inspectionHash !== projection.selection?.inspectionHash || semanticHash(binding.target) !== semanticHash(projection.target)) return unresolved('The destination snapshot is bound to a different draft, collision inspection, or engine target.', projection, destination);
  const evidence = sourceEvidence(input.snapshot, destination); if (evidence.error) return unresolved(evidence.error, projection, destination);
  const state = exactState(evidence.selected, destination); if (state.error) return unresolved(state.error, projection, destination);
  if (projection.recipe.family === 'queries') return unresolved('Collision queries have no reviewed expression insertion anchor in C11A.', projection, destination);
  return projection.recipe.family === 'eligibility' ? eligibilityPlan(projection, evidence.selected, state, destination, evidence.eol) : projection.recipe.family === 'contact' ? contactPlan(projection, evidence.selected, state, destination, evidence.eol) : unresolved('The collision property family is unsupported.', projection, destination);
}

function createAirCollisionExistingPropertyEditPlan(input = {}) {
  if (!input || !canonicalObject(input) || !exactKeys(input, ['projection', 'snapshot', 'destination', 'edit'])) throw new Error('Collision existing-property edit input must contain only the exact finite canonical planner evidence.');
  const projection = verifiedProjection(input.projection); if (!projection) return unresolvedExisting('The deeply frozen canonical C10 draft is stale, altered, or not ready.', input.projection);
  if (projection.recipe.family !== 'eligibility' && projection.recipe.family !== 'contact') return unresolvedExisting('Only eligibility and contact controller fields have a reviewed existing-property edit contract.', projection);
  const rawDestination = exactExistingEditDestination(input.destination) ? input.destination : null; if (!rawDestination) return unresolvedExisting('An exact deeply frozen canonical destination descriptor is required.', projection);
  if (!validVersion(rawDestination.sourceVersion)) return unresolvedExisting('The destination document version must be null or a nonnegative safe integer.', projection, rawDestination);
  const destination = cleanDestination(rawDestination), binding = input.snapshot?.targetBinding;
  if (!binding || binding.draftHash !== projection.draftHash || binding.inspectionHash !== projection.selection?.inspectionHash || semanticHash(binding.target) !== semanticHash(projection.target)) return unresolvedExisting('The destination snapshot is bound to a different draft, collision inspection, or engine target.', projection, destination);
  const evidence = sourceEvidence(input.snapshot, destination); if (evidence.error) return unresolvedExisting(evidence.error, projection, destination);
  const state = exactState(evidence.selected, destination); if (state.error) return unresolvedExisting(state.error, projection, destination);
  if (customStateDirective(state)) return unresolvedExisting('The exact StateDef contains @customstate and cannot provide ordinary self-state edit provenance.', projection, destination, ['Custom-state provenance is unsupported.']);
  const controller = exactExistingRecord(projection, evidence.selected, state, destination); if (controller.error) return unresolvedExisting(controller.error, projection, destination, controller.conflict ? [controller.error] : []);
  const selected = verifiedEditDescriptor(input.edit, projection, controller.record, evidence.selected); if (selected.error) return unresolvedExisting(selected.error, projection, destination, selected.conflict ? [selected.error] : []);
  const span = selected.action === 'replace' ? { start: selected.field.start, end: selected.field.end } : removalSpan(evidence.selected, controller.record, selected.field);
  if (!span) return unresolvedExisting('The selected field has no statement-bounded key-through-semicolon removal span.', projection, destination, ['Ambiguous or missing field terminator.']);
  const fieldAuthority = { key: selected.key, start: selected.field.start, end: selected.field.end, expression: selected.field.expression, expressionHash: fieldAuthorityHash(selected.field) };
  return planExistingFieldEdit(evidence.selected, span, selected.replacement, { kind: selected.action === 'replace' ? 'replace-existing-field' : 'remove-existing-field', controller: projection.recipe.kind, field: selected.key, fields: [selected.key] }, destination, projection, evidence.eol, proposed => verifyEditedController(projection, proposed, evidence.selected, state, controller.record, selected.action, selected.key), Boolean(controller.record.conditional) || String(projection.recipe.kind).startsWith('Modify'), fieldAuthority);
}

module.exports = { SCHEMA, EXISTING_EDIT_SCHEMA, MAX_SOURCES, MAX_SOURCE_BYTES, MAX_TOTAL_SOURCE_BYTES, MAX_STATES, MAX_CONTROLLERS, MAX_FIELDS, MAX_CONTEXT_LINES, MAX_DIFF_BYTES, MAX_OUTPUT_BYTES, createAirCollisionDestinationPlan, createAirCollisionExistingPropertyEditPlan, deepFreeze, fieldAuthorityHash, semanticHash };
