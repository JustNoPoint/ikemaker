'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { parseAir, actionSourceRanges } = require('./air_preview_model');

const SCHEMA = 'ikemaker.air-transfer-review';
const VERSION = 1;
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_SELECTION = 512;
const MAX_ACTIONS = 8192;
const MAX_SPRITES = 65536;
const SHA256 = /^[A-F0-9]{64}$/;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value); }
function dataObject(value, label, exactKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain data object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).filter(key => descriptors[key].enumerable);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))) throw new TypeError(`${label} cannot contain accessors or hidden fields.`);
  if (exactKeys) { const allowed = new Set(exactKeys); for (const key of keys) if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`); for (const key of exactKeys) if (!Object.prototype.hasOwnProperty.call(descriptors, key)) throw new TypeError(`${label} is missing ${key}.`); }
  return descriptors;
}
function dataArray(value, label, minimum, maximum) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length < minimum || value.length > maximum) throw new TypeError(`${label} must contain ${minimum} through ${maximum} items.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) if (!Object.prototype.hasOwnProperty.call(descriptors, String(index)) || !Object.prototype.hasOwnProperty.call(descriptors[String(index)], 'value')) throw new TypeError(`${label} must be a dense data array without accessors.`);
  return descriptors;
}
function boundedText(value, label) { if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) throw new TypeError(`${label} must be a string no larger than ${MAX_TEXT_BYTES} bytes.`); return value; }
function boundedString(value, label, maximum = 1024) { if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > maximum || value.includes('\0')) throw new TypeError(`${label} is invalid.`); return value; }
function natural(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`); return value; }

function dependencies(action) {
  const unique = new Map();
  for (const frame of action?.frames || []) {
    // Stable and Nightly anim.go null only the exact -1 group/index sentinel.
    // Other negative references are drawing requests (uint16 wrapping), not blanks.
    if (!Number.isSafeInteger(frame.group) || !Number.isSafeInteger(frame.index) || frame.group === -1 || frame.index === -1) continue;
    const id = `${frame.group},${frame.index}`;
    if (!unique.has(id)) unique.set(id, { id, group: frame.group, number: frame.index, frameCount: 0 });
    unique.get(id).frameCount += 1;
  }
  return [...unique.values()];
}

function rows(text, label = 'AIR source') {
  const source = boundedText(text, label), parsed = parseAir(source), ranges = actionSourceRanges(source);
  if (ranges.length !== parsed.length || ranges.length > MAX_ACTIONS) throw new Error(`${label} contains too many or structurally inconsistent Action blocks.`);
  return ranges.map((range, physicalIndex) => {
    const action = parsed[physicalIndex], deps = dependencies(action), id = `action:${range.number}@${physicalIndex}`;
    const metadata = {
      number: range.number, physicalIndex, dependencies: deps, copyAction: action?.copyAction ?? null,
      resolvedFrom: action?.resolvedFrom ?? null, fallthroughAction: action?.fallthroughAction ?? null,
      copyError: action?.copyError || '', copyResolved: action?.copyResolved === true, readOnly: action?.readOnly === true,
      shadowedDuplicate: action?.shadowedDuplicate === true, effective: action?.effective !== false
    };
    return { id, physicalIndex, number: range.number, start: range.start, end: range.end, text: range.text, action, dependencies: deps, contentFingerprint: sha(range.text), metadataFingerprint: sha(canonical(metadata)), metadata };
  });
}

function selectionProjection(row) { return { id: row.id, physicalIndex: row.physicalIndex, label: `Action ${row.number} · physical ${row.physicalIndex}`, contentFingerprint: row.contentFingerprint, metadataFingerprint: row.metadataFingerprint }; }

function airTransferSelectionItems(text, physicalIndices) {
  const available = rows(text), descriptors = dataArray(physicalIndices, 'AIR Transfer physical selection', 1, MAX_SELECTION), result = [], seen = new Set();
  for (let index = 0; index < physicalIndices.length; index += 1) {
    const value = descriptors[String(index)].value;
    if (!Number.isSafeInteger(value) || value < 0 || seen.has(value) || !available[value]) throw new Error('The AIR Transfer selection contains a stale, repeated, or invalid physical action.');
    seen.add(value); result.push(selectionProjection(available[value]));
  }
  return deepFreeze(result);
}

function exactSelection(sourceText, selection) {
  const available = rows(sourceText), descriptors = dataArray(selection, 'AIR Transfer reviewed selection', 1, MAX_SELECTION), result = [], seen = new Set();
  for (let index = 0; index < selection.length; index += 1) {
    const item = descriptors[String(index)].value, fields = dataObject(item, `AIR Transfer selection item ${index + 1}`, ['id', 'physicalIndex', 'label', 'contentFingerprint', 'metadataFingerprint']);
    const physicalIndex = natural(fields.physicalIndex.value, `AIR Transfer selection item ${index + 1} physical index`), row = available[physicalIndex];
    const id = boundedString(fields.id.value, `AIR Transfer selection item ${index + 1} identity`), content = boundedString(fields.contentFingerprint.value, `AIR Transfer selection item ${index + 1} content fingerprint`, 64).toUpperCase(), metadata = boundedString(fields.metadataFingerprint.value, `AIR Transfer selection item ${index + 1} metadata fingerprint`, 64).toUpperCase();
    boundedString(fields.label.value, `AIR Transfer selection item ${index + 1} label`, 512);
    if (!SHA256.test(content) || !SHA256.test(metadata) || !row || seen.has(physicalIndex) || id !== row.id || content !== row.contentFingerprint || metadata !== row.metadataFingerprint) throw new Error('The reviewed AIR action selection changed or became ambiguous.');
    seen.add(physicalIndex); result.push(row);
  }
  return result;
}

function firstRowsByNumber(available) { const result = new Map(); for (const row of available) if (!result.has(row.number)) result.set(row.number, row); return result; }

function copyAuthority(row, firstByNumber) {
  if (!Number.isInteger(row.action?.copyAction)) return null;
  if (row.action.copyAction < 0) return { status: 'invalid-negative-target', targetNumber: row.action.copyAction, directTargetId: null, chainIds: [], authorityId: null, error: row.action.copyError || `Copy Action ${row.action.copyAction} is invalid.`, choices: [] };
  const chainIds = [], seen = new Set([row.id]); let targetNumber = row.action.copyAction, directTargetId = null, authority = null, error = '';
  for (let depth = 0; depth < 8; depth += 1) {
    const target = firstByNumber.get(targetNumber);
    if (!target) { error = `Copy Action ${targetNumber} has no exact source target.`; break; }
    if (!directTargetId) directTargetId = target.id;
    if (seen.has(target.id)) { error = `Copy Action cycle reaches ${target.id}.`; break; }
    seen.add(target.id); chainIds.push(target.id);
    if (!Number.isInteger(target.action?.copyAction)) {
      authority = target;
      if (target.action?.readOnly && Number.isInteger(target.action.resolvedFrom)) authority = firstByNumber.get(target.action.resolvedFrom) || target;
      if (authority.id !== target.id && !chainIds.includes(authority.id)) chainIds.push(authority.id);
      break;
    }
    if (target.action.copyAction < 0) { error = target.action.copyError || `Copy Action ${target.action.copyAction} is invalid.`; break; }
    targetNumber = target.action.copyAction;
  }
  if (!authority && !error) error = 'Copy Action chain exceeds the engine limit of 8 links.';
  if (row.action?.copyError) error = row.action.copyError;
  if (error || !authority || !authority.action?.frames?.length) return { status: /cycle/i.test(error) ? 'cycle' : /limit/i.test(error) ? 'chain-too-deep' : 'unresolved', targetNumber: row.action.copyAction, directTargetId, chainIds, authorityId: authority?.id || null, error: error || 'Copy Action has no materializable authority.', choices: [] };
  return { status: 'available', targetNumber: row.action.copyAction, directTargetId, chainIds, authorityId: authority.id, error: '', choices: ['preserve-copy', 'include-copy-targets', 'materialize-copy'] };
}

function archiveSprites(archive, label, required) {
  if (archive === null || archive === undefined) { if (required) throw new TypeError(`${label} is required for animation-with-sprites review.`); return []; }
  const descriptors = dataObject(archive, label), spriteDescriptor = descriptors.sprites;
  if (!spriteDescriptor || !Object.prototype.hasOwnProperty.call(spriteDescriptor, 'value')) throw new TypeError(`${label}.sprites must be an own data array.`);
  const sprites = spriteDescriptor.value, entries = dataArray(sprites, `${label}.sprites`, 0, MAX_SPRITES), result = [];
  for (let index = 0; index < sprites.length; index += 1) {
    const value = entries[String(index)].value, fields = dataObject(value, `${label} sprite ${index + 1}`);
    const group = natural(fields.group?.value, `${label} sprite ${index + 1} group`), number = natural(fields.number?.value, `${label} sprite ${index + 1} index`), physicalIndex = fields.index ? natural(fields.index.value, `${label} sprite ${index + 1} physical index`) : index;
    result.push({ group, number, physicalIndex, evidenceFingerprint: typeof fields.evidence?.value === 'string' && SHA256.test(fields.evidence.value.toUpperCase()) ? fields.evidence.value.toUpperCase() : sha(canonical({ group, number, physicalIndex })) });
  }
  return result;
}

function spriteOccurrence(sprites, dependency) {
  const matches = sprites.filter(sprite => sprite.group === dependency.group && sprite.number === dependency.number);
  return { ...dependency, status: matches.length === 1 ? 'exact' : matches.length ? 'ambiguous' : 'missing', physicalIndices: matches.map(sprite => sprite.physicalIndex), sourceEvidenceFingerprints: matches.map(sprite => sprite.evidenceFingerprint) };
}

function analyzeAirTransfer(input) {
  const fields = dataObject(input, 'AIR Transfer analysis input'), allowed = new Set(['sourceText', 'destinationText', 'selection', 'dependencyMode', 'sourceSff', 'destinationSff']);
  for (const key of Object.keys(fields)) if (!allowed.has(key)) throw new TypeError(`AIR Transfer analysis input contains unsupported field ${key}.`);
  for (const key of ['sourceText', 'destinationText', 'selection']) if (!fields[key]) throw new TypeError(`AIR Transfer analysis input is missing ${key}.`);
  const sourceText = boundedText(fields.sourceText.value, 'AIR Transfer source text'), destinationText = boundedText(fields.destinationText.value, 'AIR Transfer destination text'), dependencyMode = fields.dependencyMode?.value ?? 'animation-only';
  if (!['animation-only', 'animation-with-sprites'].includes(dependencyMode)) throw new Error('AIR Transfer dependency mode must be animation-only or animation-with-sprites.');
  const selected = exactSelection(sourceText, fields.selection.value), available = rows(sourceText), firstByNumber = firstRowsByNumber(available), selectedIds = new Set(selected.map(row => row.id)), destination = rows(destinationText, 'AIR destination'), occupied = new Map();
  for (const row of destination) { if (!occupied.has(row.number)) occupied.set(row.number, []); occupied.get(row.number).push(row.physicalIndex); }
  const needsSprites = dependencyMode === 'animation-with-sprites' && selected.some(row => row.dependencies.length > 0), sourceSprites = archiveSprites(fields.sourceSff?.value, 'Source SFF archive', needsSprites), destinationSprites = archiveSprites(fields.destinationSff?.value, 'Destination SFF archive', needsSprites);
  const spriteMap = new Map(), closure = new Map();
  const items = selected.map(row => {
    for (const dependency of row.dependencies) { if (!spriteMap.has(dependency.id)) spriteMap.set(dependency.id, { ...dependency, referencedBy: [] }); spriteMap.get(dependency.id).referencedBy.push(row.id); }
    const copy = copyAuthority(row, firstByNumber);
    if (copy) for (const id of copy.chainIds) if (!selectedIds.has(id)) closure.set(id, available.find(candidate => candidate.id === id) || null);
    const closureSelected = copy ? copy.chainIds.every(id => selectedIds.has(id)) : true, conflicts = occupied.get(row.number) || [];
    return {
      id: row.id, physicalIndex: row.physicalIndex, actionNumber: row.number, contentFingerprint: row.contentFingerprint, metadataFingerprint: row.metadataFingerprint,
      effective: row.metadata.effective, shadowedDuplicate: row.metadata.shadowedDuplicate, copyAction: row.action?.copyAction ?? null,
      copyDependency: copy ? { ...copy, closureSelected } : null,
      copyDependencyStatus: !copy ? 'self-contained' : copy.status === 'available' && closureSelected ? 'self-contained' : copy.status === 'available' ? 'referenced-action-not-selected' : copy.status,
      destinationConflict: { status: conflicts.length ? 'occupied' : 'clear', physicalIndices: conflicts, choices: conflicts.length ? ['add-next-free', 'replace-existing', 'skip', 'manual-action'] : ['preserve-action', 'manual-action'] }
    };
  });
  const copyClosureItems = [...closure.values()].filter(Boolean).sort((a, b) => a.physicalIndex - b.physicalIndex).map(row => ({ ...selectionProjection(row), actionNumber: row.number, effective: row.metadata.effective, shadowedDuplicate: row.metadata.shadowedDuplicate, copyAction: row.action?.copyAction ?? null, copyDependency: copyAuthority(row, firstByNumber) }));
  const spriteDependencies = [...spriteMap.values()].map(dependency => ({ ...spriteOccurrence(sourceSprites, dependency), destinationMatches: destinationSprites.filter(sprite => sprite.group === dependency.group && sprite.number === dependency.number).map(sprite => ({ physicalIndex: sprite.physicalIndex, evidenceFingerprint: sprite.evidenceFingerprint })) }));
  const projection = { sourceFingerprint: sha(sourceText), destinationFingerprint: sha(destinationText), dependencyMode, items, copyClosureItems, spriteDependencies };
  return deepFreeze({ schema: SCHEMA, version: VERSION, ...projection, analysisIdentity: sha(canonical(projection)), includeSprites: dependencyMode === 'animation-with-sprites', missingSourceSprites: spriteDependencies.filter(item => item.status !== 'exact'), unresolvedActionConflicts: items.filter(item => item.destinationConflict.status === 'occupied').length, unresolvedCopyDependencies: items.filter(item => item.copyDependencyStatus !== 'self-contained').length, effects: EFFECTS });
}

module.exports = { SCHEMA, VERSION, EFFECTS, MAX_TEXT_BYTES, MAX_SELECTION, airTransferSelectionItems, analyzeAirTransfer };
