'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');

const SCHEMA = 'ikemaker.air-collision-character-context';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_OCCURRENCES_PER_SOURCE = 64;
const MAX_PUBLIC_EXPRESSION_BYTES = 256;
const MAX_OUTPUT_BYTES = 128 * 1024;
const HASH = /^[A-F0-9]{64}$/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false, runtimeSimulation: false });
const FIELDS = Object.freeze({
  'stand.sizebox': Object.freeze({ section: 'size', arity: 4, category: 'sizebox', label: 'Standing Size baseline' }),
  'crouch.sizebox': Object.freeze({ section: 'size', arity: 4, category: 'sizebox', label: 'Crouching Size baseline' }),
  'air.sizebox': Object.freeze({ section: 'size', arity: 4, category: 'sizebox', label: 'Air Size baseline' }),
  'down.sizebox': Object.freeze({ section: 'size', arity: 4, category: 'sizebox', label: 'Down Size baseline' }),
  'attack.dist.width': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Attack guard distance X' }),
  'attack.dist.height': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Attack guard distance Y' }),
  'attack.dist.depth': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Attack guard distance Z' }),
  'proj.attack.dist.width': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Projectile guard distance X' }),
  'proj.attack.dist.height': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Projectile guard distance Y' }),
  'proj.attack.dist.depth': Object.freeze({ section: 'size', arity: 2, category: 'guard-range', label: 'Projectile guard distance Z' }),
  pushfactor: Object.freeze({ section: 'size', arity: 1, category: 'push-resolution', label: 'Push factor' }),
  weight: Object.freeze({ section: 'size', arity: 1, category: 'push-resolution', label: 'Push weight' }),
  depth: Object.freeze({ section: 'size', arity: 2, category: 'depth-band', label: 'Player depth band' }),
  'attack.depth': Object.freeze({ section: 'size', arity: 2, category: 'depth-band', label: 'Default attack depth band' }),
  xscale: Object.freeze({ section: 'size', arity: 1, category: 'character-scale', label: 'Character collision X scale' }),
  yscale: Object.freeze({ section: 'size', arity: 1, category: 'character-scale', label: 'Character collision Y scale' }),
  'ground.front': Object.freeze({ section: 'size', arity: 1, category: 'legacy-size', label: 'Legacy ground front' }),
  'ground.back': Object.freeze({ section: 'size', arity: 1, category: 'legacy-size', label: 'Legacy ground back' }),
  'air.front': Object.freeze({ section: 'size', arity: 1, category: 'legacy-size', label: 'Legacy air front' }),
  'air.back': Object.freeze({ section: 'size', arity: 1, category: 'legacy-size', label: 'Legacy air back' }),
  height: Object.freeze({ section: 'size', arity: 1, category: 'legacy-size', label: 'Legacy height' }),
  ikemenversion: Object.freeze({ section: 'info', arity: 1, category: 'source-declaration', label: 'Authored IKEMEN version declaration', version: true }),
  cns: Object.freeze({ section: 'files', arity: 1, category: 'binding', label: 'Assigned constants source', path: true })
});
const PUBLIC_KEYS = Object.freeze(Object.keys(FIELDS).filter(key => !['legacy-size', 'binding'].includes(FIELDS[key].category)));
const LEGACY = Object.freeze({
  stand: Object.freeze(['ground.back', 'height', 'ground.front']),
  crouch: Object.freeze(['ground.back', 'height', 'ground.front']),
  air: Object.freeze(['air.back', 'height', 'air.front']),
  down: Object.freeze(['ground.back', 'height', 'ground.front'])
});

function fail(message) { throw new Error(`AIR character collision context: ${message}`); }
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
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function digest(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value)), 'utf8').digest('hex').toUpperCase(); }
function normalizedAbsolute(filename) { return typeof filename === 'string' && path.isAbsolute(filename) && path.normalize(filename) === filename; }
function validVersion(version) { return version === null || Number.isSafeInteger(version) && version >= 0; }
function sourceSnapshot(value, label) {
  const keys = ['filename', 'text', 'sourceHash', 'version', 'open', 'dirty'];
  if (!deeplyFrozen(value) || !exactKeys(value, keys)) fail(`${label} must be a deeply frozen exact source snapshot.`);
  if (!normalizedAbsolute(value.filename) || Buffer.byteLength(value.filename, 'utf8') > 4096 || typeof value.text !== 'string' || value.text.startsWith('\uFEFF') || value.text.includes('\0') || !HASH.test(value.sourceHash) || digest(value.text) !== value.sourceHash || !validVersion(value.version) || typeof value.open !== 'boolean' || typeof value.dirty !== 'boolean') fail(`${label} path, text, hash, version, or open/dirty provenance is malformed.`);
  if (value.dirty && (!value.open || !Number.isSafeInteger(value.version))) fail(`${label} dirty evidence requires one open document with a nonnegative version.`);
  if (value.open && !Number.isSafeInteger(value.version) || !value.open && value.version !== null) fail(`${label} version must exactly describe its open-document provenance.`);
  const bytes = Buffer.byteLength(value.text, 'utf8'); if (bytes > MAX_SOURCE_BYTES) fail(`${label} exceeds ${MAX_SOURCE_BYTES} UTF-8 bytes.`);
  return { filename: value.filename, text: value.text, sourceHash: value.sourceHash, version: value.version, open: value.open, dirty: value.dirty, bytes };
}
function targetDescriptor(target, capability) {
  if (!deeplyFrozen(target) || !exactKeys(target, ['channel', 'buildId', 'capabilityFingerprint']) || !deeplyFrozen(capability) || !exactKeys(capability, ['status', 'capabilityFingerprint'])) fail('target and capability must be deeply frozen exact descriptors.');
  if (!['stable', 'nightly', 'unknown'].includes(target.channel) || typeof target.buildId !== 'string' || target.buildId.length > 128 || !HASH.test(target.capabilityFingerprint) || !['supported', 'unsupported', 'unknown'].includes(capability.status) || !HASH.test(capability.capabilityFingerprint)) fail('target or capability descriptor is malformed.');
  const matched = target.capabilityFingerprint === capability.capabilityFingerprint, known = matched && target.channel !== 'unknown' && Boolean(target.buildId) && capability.status !== 'unknown';
  return { channel: target.channel, buildId: target.buildId, capabilityFingerprint: target.capabilityFingerprint, capabilityStatus: capability.status, matched, known };
}
function commentStart(line) {
  let quote = ''; for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (quote) { if (character === quote && line[index - 1] !== '\\') quote = ''; continue; } if (character === '"' || character === "'") quote = character; else if (character === ';') return index; } return line.length;
}
function lineRecords(text) {
  const records = []; let start = 0, line = 0;
  while (start <= text.length) { const newline = text.indexOf('\n', start), endWithCr = newline < 0 ? text.length : newline, end = endWithCr > start && text[endWithCr - 1] === '\r' ? endWithCr - 1 : endWithCr; records.push({ line, start, end, raw: text.slice(start, end) }); if (newline < 0) break; start = newline + 1; line += 1; }
  return records;
}
function numeric(expression, arity) {
  const parts = expression.split(',').map(part => part.trim()); if (parts.length !== arity || parts.some(part => !NUMBER.test(part))) return { status: 'malformed', values: [], reason: `Expected exactly ${arity} finite numeric literal${arity === 1 ? '' : 's'}.` };
  const values = parts.map(Number); if (values.some(value => !Number.isFinite(value) || Math.abs(value) > 1e9)) return { status: 'malformed', values: [], reason: 'Numeric literals must be finite with magnitude at most 1000000000.' };
  return { status: 'exact', values: values.map(value => Object.is(value, -0) ? 0 : value), reason: '' };
}
function versionLiteral(expression) { return /^\d+(?:\.\d+){1,2}$/.test(expression) ? { status: 'exact', values: [expression], reason: '' } : { status: 'malformed', values: [], reason: 'ikemenversion must be one authored dotted version literal.' }; }
function pathLiteral(expression) {
  let value = expression; const quoted = value.startsWith('"') || value.startsWith("'");
  if (quoted) { const quote = value[0]; if (value.length < 2 || value[value.length - 1] !== quote) return { status: 'malformed', values: [], reason: 'The cns assignment has an unmatched quote.' }; value = value.slice(1, -1); }
  if (!value || Buffer.byteLength(value, 'utf8') > 4096 || /[\0\r\n]/.test(value) || !quoted && /["']/.test(value)) return { status: 'malformed', values: [], reason: 'The cns assignment must be one bounded literal Windows path.' };
  return { status: 'exact', values: [value], reason: '' };
}
function parseSource(snapshot, sourceKind) {
  let section = '', relevantCount = 0, omitted = 0; const occurrences = [], issues = [];
  for (const record of lineRecords(snapshot.text)) {
    const visibleEnd = commentStart(record.raw), visible = record.raw.slice(0, visibleEnd), header = /^\s*\[\s*([^\]]+)\s*\]\s*$/.exec(visible);
    if (header) { const nextSection = header[1].trim().toLowerCase(); section = nextSection.length <= 128 ? nextSection : '__overlong_section__'; continue; }
    const assignment = /^\s*([A-Za-z][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(visible); if (!assignment) continue;
    const key = assignment[1].toLowerCase(), field = FIELDS[key]; if (!field) continue; relevantCount += 1;
    if (relevantCount > MAX_OCCURRENCES_PER_SOURCE) { omitted += 1; continue; }
    const keyColumn = visible.indexOf(assignment[1]), expressionRaw = assignment[2], expressionColumn = assignment.index + assignment[0].indexOf(expressionRaw), leading = /^\s*/.exec(expressionRaw)[0].length, trailing = /\s*$/.exec(expressionRaw)[0].length, valueColumn = expressionColumn + leading, expressionFull = expressionRaw.slice(leading, expressionRaw.length - trailing), expressionBytes = Buffer.byteLength(expressionFull, 'utf8'), truncated = expressionBytes > MAX_PUBLIC_EXPRESSION_BYTES, expression = truncated ? Buffer.from(expressionFull, 'utf8').subarray(0, MAX_PUBLIC_EXPRESSION_BYTES).toString('utf8').replace(/\uFFFD$/u, '') : expressionFull, parsed = field.version ? versionLiteral(expressionFull) : field.path ? pathLiteral(expressionFull) : numeric(expressionFull, field.arity), wrongSection = section !== field.section, expectedSource = field.version || field.path ? 'def' : 'constants', wrongSource = sourceKind !== expectedSource, status = wrongSection || wrongSource || truncated ? 'conflict' : parsed.status, reason = wrongSource ? `${key} belongs to the ${expectedSource === 'def' ? 'owning DEF' : 'assigned constants'} evidence source, not ${sourceKind}.` : wrongSection ? `${key} is authored in [${section || 'no section'}], not [${field.section}].` : truncated ? `Expression exceeds ${MAX_PUBLIC_EXPRESSION_BYTES} public UTF-8 bytes.` : parsed.reason;
    occurrences.push({ id: `${sourceKind}:${record.start + keyColumn}:${key}`, source: sourceKind, filename: snapshot.filename, sourceHash: snapshot.sourceHash, sourceVersion: snapshot.version, sourceDirty: snapshot.dirty, key, authoredKey: assignment[1], section, line: record.line, column: keyColumn, start: record.start + keyColumn, end: record.start + valueColumn + expressionFull.length, valueStart: record.start + valueColumn, valueEnd: record.start + valueColumn + expressionFull.length, expression, literalArity: parsed.values.length, values: parsed.values, status, reason, truncated });
  }
  if (omitted) issues.push({ kind: 'occurrence-cap', source: sourceKind, count: omitted, message: `${omitted} relevant occurrence${omitted === 1 ? '' : 's'} exceed the ${MAX_OCCURRENCES_PER_SOURCE}-occurrence source cap.` });
  const byKey = new Map(); for (const occurrence of occurrences) { const list = byKey.get(occurrence.key) || []; list.push(occurrence); byKey.set(occurrence.key, list); }
  for (const [key, list] of byKey) { const validSection = list.filter(item => item.section === FIELDS[key].section); if (validSection.length > 1) { for (const occurrence of validSection) { occurrence.status = 'conflict'; occurrence.reason = `${key} has ${validSection.length} assignments in [${FIELDS[key].section}].`; } issues.push({ kind: 'duplicate', source: sourceKind, key, count: validSection.length, message: `${key} is duplicated in [${FIELDS[key].section}].` }); } }
  for (const occurrence of occurrences) if (occurrence.status !== 'exact') issues.push({ kind: 'occurrence-conflict', source: sourceKind, key: occurrence.key, line: occurrence.line, message: occurrence.reason || `${occurrence.key} is unresolved.` });
  return { occurrences, issues, relevantCount, omitted };
}
function occurrenceSummary(occurrence) { return { id: occurrence.id, source: occurrence.source, filename: occurrence.filename, sourceHash: occurrence.sourceHash, sourceVersion: occurrence.sourceVersion, sourceDirty: occurrence.sourceDirty, key: occurrence.key, authoredKey: occurrence.authoredKey, section: occurrence.section, line: occurrence.line, column: occurrence.column, start: occurrence.start, end: occurrence.end, valueStart: occurrence.valueStart, valueEnd: occurrence.valueEnd, expression: occurrence.expression, literalArity: occurrence.literalArity, values: occurrence.values, status: occurrence.status, reason: occurrence.reason, truncated: occurrence.truncated }; }
function exactOccurrence(index, key) { const list = index.get(key) || [], correct = list.filter(item => item.section === FIELDS[key].section); return correct.length === 1 && correct[0].status === 'exact' ? correct[0] : null; }
function meaning(field) {
  if (field.category === 'sizebox') return 'Whole-character Size-group baseline; the selected AIR Action, element, group, and box are context only.';
  if (field.category === 'guard-range') return 'Proximity-guard range; it is not an active Clsn box or proof of contact.';
  if (field.category === 'depth-band') return 'Z-axis range/band; it is not a 2D AIR rectangle.';
  if (field.category === 'push-resolution') return 'Push-resolution input; it does not define collision-box geometry.';
  if (field.category === 'character-scale') return 'Known character collision-scale input; it is not a live TransformClsn result.';
  return 'Authored source declaration only; it does not detect the installed engine or build.';
}
function compatibility(profile) {
  if (!profile.matched) return 'Target/capability fingerprint mismatch; authored evidence is read-only and runtime support is unresolved.';
  if (!profile.known) return 'Target capability is unresolved; authored evidence is read-only and is not runtime certification.';
  return `Authored source evidence under exact ${profile.channel === 'nightly' ? 'Nightly' : 'Stable'} target ${profile.buildId}; not live runtime certification.`;
}
function legacySizeCard(key, field, constantsIndex, profile) {
  const name = key.split('.')[0], contributorKeys = LEGACY[name], contributors = contributorKeys.map(contributorKey => { const occurrence = exactOccurrence(constantsIndex, contributorKey), candidates = constantsIndex.get(contributorKey) || []; return { key: contributorKey, status: occurrence ? 'exact' : candidates.length ? 'conflict' : 'missing', occurrence: occurrence ? occurrenceSummary(occurrence) : null, reason: occurrence ? '' : candidates.length ? `${contributorKey} is conflicting or malformed.` : `${contributorKey} is missing and remains engine-default context.` }; }), exact = contributors.every(item => item.status === 'exact'), contributorConflict = contributors.some(item => item.status === 'conflict'), values = exact ? [-contributors[0].occurrence.values[0], -contributors[1].occurrence.values[0], contributors[2].occurrence.values[0], 0] : null;
  return { id: `context:${key}`, key, label: field.label, category: field.category, status: exact ? 'exact-legacy-basis' : contributorConflict ? 'conflict' : 'default-context', provenance: exact ? 'legacy-size-contributors' : contributorConflict ? 'conflicting-legacy-evidence' : 'missing-or-engine-default', values, literalArity: values ? 4 : 0, occurrences: [], legacyContributors: contributors, relation: 'whole-character', compatibility: compatibility(profile), meaning: meaning(field), selectedContextOnly: true, reason: exact ? 'Derived from the listed exact legacy assignments; no fabricated single source line owns this rectangle.' : contributorConflict ? 'A legacy contributor is duplicated, malformed, truncated, or in the wrong section; no rectangle is inferred.' : 'No exact native sizebox exists and the legacy basis is incomplete; no authored rectangle is invented.', nightlyOnly: false };
}
function card(key, indexes, profile) {
  const field = FIELDS[key], sourceIndex = key === 'ikemenversion' ? indexes.def : indexes.constants, candidates = sourceIndex.get(key) || [], exact = exactOccurrence(sourceIndex, key);
  if (field.category === 'sizebox' && !candidates.length) return legacySizeCard(key, field, indexes.constants, profile);
  const status = exact ? 'exact-authored' : candidates.length ? 'conflict' : 'missing', reason = exact ? 'One exact section-aware authored assignment.' : candidates.length ? 'The authored evidence is duplicated, malformed, truncated, or in the wrong section.' : 'No authored assignment; engine-default context remains unresolved.';
  return { id: `context:${key}`, key, label: field.label, category: field.category, status, provenance: exact ? 'authored-assignment' : status === 'missing' ? 'missing-or-engine-default' : 'conflicting-authored-evidence', values: exact ? exact.values : null, literalArity: exact ? exact.literalArity : 0, occurrences: candidates.map(occurrenceSummary), legacyContributors: [], relation: key === 'ikemenversion' ? 'source-declaration' : 'whole-character', compatibility: compatibility(profile), meaning: meaning(field), selectedContextOnly: true, reason, nightlyOnly: false };
}
function constantsBinding(defIndex, constants, def) {
  const candidates = defIndex.get('cns') || [], occurrence = exactOccurrence(defIndex, 'cns');
  if (!occurrence) return { status: 'unresolved', assignedLiteral: '', resolvedFilename: '', occurrence: null, reason: candidates.length ? 'The owning DEF cns assignment is duplicated, malformed, truncated, or outside [Files].' : 'The owning DEF has no exact [Files] cns assignment.' };
  const assignedLiteral = occurrence.values[0], resolvedFilename = path.normalize(path.resolve(path.dirname(def.filename), assignedLiteral)), same = resolvedFilename.toLowerCase() === constants.filename.toLowerCase();
  return { status: same ? 'exact' : 'unresolved', assignedLiteral, resolvedFilename, occurrence: occurrenceSummary(occurrence), reason: same ? 'The owning DEF exact [Files] cns assignment resolves to this constants source.' : 'The owning DEF cns assignment resolves to a different constants source.' };
}
function createAirCollisionCharacterContext(input = {}) {
  if (!plainData(input)) fail('input must be finite canonical plain data without accessors, proxies, cycles, sparse arrays, or symbols.');
  if (!exactKeys(input, ['constants', 'def', 'target', 'capability'])) fail('input must contain only constants, def, target, and capability.');
  const constants = sourceSnapshot(input.constants, 'constants source'), def = sourceSnapshot(input.def, 'owning DEF source'), profile = targetDescriptor(input.target, input.capability), constantsParsed = parseSource(constants, 'constants'), defParsed = parseSource(def, 'def'), index = parsed => { const map = new Map(); for (const occurrence of parsed.occurrences) { const list = map.get(occurrence.key) || []; list.push(occurrence); map.set(occurrence.key, list); } return map; }, indexes = { constants: index(constantsParsed), def: index(defParsed) }, binding = constantsBinding(indexes.def, constants, def), cards = PUBLIC_KEYS.map(key => card(key, indexes, profile)), conflicts = [...constantsParsed.issues, ...defParsed.issues, ...cards.filter(item => item.status === 'conflict').map(item => ({ kind: 'field-conflict', key: item.key, message: item.reason }))], omissions = { constants: constantsParsed.omitted, def: defParsed.omitted }, targetReason = !profile.matched ? 'Target and capability fingerprints do not match.' : !profile.known ? 'The exact engine target/capability is unresolved.' : '', bindingReason = binding.status === 'exact' ? '' : binding.reason, capReason = omissions.constants || omissions.def ? 'Relevant source occurrences exceed a bounded evidence cap.' : '', status = targetReason || bindingReason || capReason ? 'unresolved' : conflicts.length ? 'conflict' : 'ready', semantic = { schema: SCHEMA, version: 1, status, reason: [targetReason, bindingReason, capReason, conflicts.length ? `${conflicts.length} authored evidence conflict${conflicts.length === 1 ? '' : 's'} require review.` : ''].filter(Boolean).join(' '), target: profile, sources: { constants: { filename: constants.filename, sourceHash: constants.sourceHash, sourceVersion: constants.version, sourceDirty: constants.dirty, sourceOpen: constants.open, bytes: constants.bytes, relevantOccurrences: constantsParsed.relevantCount }, def: { filename: def.filename, sourceHash: def.sourceHash, sourceVersion: def.version, sourceDirty: def.dirty, sourceOpen: def.open, bytes: def.bytes, relevantOccurrences: defParsed.relevantCount } }, constantsBinding: binding, cards, conflicts, omissions, limitations: ['Selected AIR Action/element/box is context only for all character-level cards.', 'Authored constants and ikemenversion do not certify live engine values or installed-build support.', 'Saved or recovery runtime plans are not consumed as evidence by this model.'], effects: { ...EFFECTS } }, output = { ...semantic, contextHash: digest(semantic) };
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_OUTPUT_BYTES) fail(`projection exceeds ${MAX_OUTPUT_BYTES} bytes.`);
  return deepFreeze(output);
}

module.exports = { SCHEMA, MAX_SOURCE_BYTES, MAX_OCCURRENCES_PER_SOURCE, MAX_PUBLIC_EXPRESSION_BYTES, MAX_OUTPUT_BYTES, FIELDS, createAirCollisionCharacterContext, deepFreeze, digest };
