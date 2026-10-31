'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createAirCollisionCharacterContext, MAX_SOURCE_BYTES, MAX_OCCURRENCES_PER_SOURCE, digest } = require('../src/air_collision_character_context_model');

function frozen(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); } return value; }
function source(filename, text, options = {}) { return frozen({ filename: path.normalize(path.resolve(filename)), text, sourceHash: digest(text), version: options.open === false ? null : options.version ?? 4, open: options.open !== false, dirty: options.dirty === true }); }
const fingerprint = 'A'.repeat(64);
function target(channel = 'nightly', status = 'supported', otherFingerprint = fingerprint) { return { target: frozen({ channel, buildId: channel === 'unknown' ? '' : `${channel}-build`, capabilityFingerprint: fingerprint }), capability: frozen({ status, capabilityFingerprint: otherFingerprint }) }; }
const defaultDef = '[Info]\nikemenversion = 1.1\n[Files]\ncns = constants.cns\n';
function make(constantsText, defText = defaultDef, options = {}) { return createAirCollisionCharacterContext({ constants: source('/char/constants.cns', constantsText, options.constants), def: source('/char/hero.def', defText, options.def), ...target(options.channel, options.capabilityStatus, options.capabilityFingerprint) }); }
function byKey(model, key) { const result = model.cards.find(item => item.key === key); assert(result, `missing ${key}`); return result; }

const complete = [
  '[Size]',
  'stand.sizebox = -15, -60, 16, 0 ; visible comment must be excluded',
  'crouch.sizebox = -14,-50,15,0',
  'air.sizebox = -12,-58,13,1',
  'down.sizebox = -18,-22,19,2',
  'attack.dist.width = 160, 8',
  'attack.dist.height = 100, 90',
  'attack.dist.depth = 4, 5',
  'proj.attack.dist.width = 170, 9',
  'proj.attack.dist.height = 110, 95',
  'proj.attack.dist.depth = 6, 7',
  'pushfactor = 0.75',
  'weight = 125',
  'depth = 3, 4',
  'attack.depth = 5, 6',
  'xscale = 1.25',
  'yscale = .875'
].join('\n');

const exact = make(complete);
assert.strictEqual(exact.status, 'ready');
assert.strictEqual(exact.cards.length, 17);
assert.deepStrictEqual(byKey(exact, 'stand.sizebox').values, [-15, -60, 16, 0]);
assert.deepStrictEqual(byKey(exact, 'attack.dist.width').values, [160, 8]);
assert.deepStrictEqual(byKey(exact, 'pushfactor').values, [0.75]);
assert.deepStrictEqual(byKey(exact, 'depth').values, [3, 4]);
assert.deepStrictEqual(byKey(exact, 'xscale').values, [1.25]);
assert.strictEqual(byKey(exact, 'stand.sizebox').meaning.includes('context only'), true);
assert.match(byKey(exact, 'attack.dist.width').meaning, /not an active Clsn box/i);
assert.match(byKey(exact, 'depth').meaning, /not a 2D AIR rectangle/i);
assert.match(byKey(exact, 'pushfactor').meaning, /does not define collision-box geometry/i);
assert.match(byKey(exact, 'xscale').meaning, /not a live TransformClsn result/i);
assert.match(byKey(exact, 'ikemenversion').meaning, /does not detect the installed engine/i);
assert(exact.cards.every(item => item.selectedContextOnly === true && item.nightlyOnly === false));
const standOccurrence = byKey(exact, 'stand.sizebox').occurrences[0];
assert.strictEqual(complete.slice(standOccurrence.valueStart, standOccurrence.valueEnd), '-15, -60, 16, 0');
assert.strictEqual(standOccurrence.line, 1); assert.strictEqual(standOccurrence.column, 0); assert.strictEqual(standOccurrence.expression, '-15, -60, 16, 0'); assert.strictEqual(standOccurrence.literalArity, 4);
assert.strictEqual(exact.sources.constants.sourceDirty, false); assert.strictEqual(exact.sources.constants.sourceVersion, 4);
assert.deepStrictEqual(exact.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false, runtimeSimulation: false });
assert(Object.isFrozen(exact) && Object.isFrozen(exact.cards) && Object.isFrozen(exact.cards[0].occurrences));
assert.strictEqual(make(complete).contextHash, exact.contextHash, 'same evidence remains deterministic');

for (const eol of ['\n', '\r\n']) {
  const text = ['[Size]', 'stand.sizebox = -1,-2,3,4', 'pushfactor = 1'].join(eol);
  const model = make(text, `[Info]${eol}ikemenversion = 1.1${eol}[Files]${eol}cns = constants.cns`);
  const occurrence = byKey(model, 'stand.sizebox').occurrences[0];
  assert.strictEqual(text.slice(occurrence.valueStart, occurrence.valueEnd), '-1,-2,3,4');
  assert.strictEqual(byKey(model, 'ikemenversion').values[0], '1.1');
}

const commented = make('[Size]\n; stand.sizebox = 1,2,3,4\nattack.dist.width = 10, 20 ; ground.front = 999\n');
assert.strictEqual(byKey(commented, 'stand.sizebox').status, 'default-context');
assert.deepStrictEqual(byKey(commented, 'attack.dist.width').values, [10, 20]);

const legacyText = '[Size]\nground.front = 18\nground.back = 14\nair.front = 11\nair.back = 9\nheight = 72\n';
const legacy = make(legacyText);
const legacyStand = byKey(legacy, 'stand.sizebox'), legacyAir = byKey(legacy, 'air.sizebox');
assert.strictEqual(legacyStand.status, 'exact-legacy-basis'); assert.deepStrictEqual(legacyStand.values, [-14, -72, 18, 0]);
assert.strictEqual(legacyStand.occurrences.length, 0); assert.strictEqual(legacyStand.legacyContributors.length, 3); assert(new Set(legacyStand.legacyContributors.map(item => item.occurrence.line)).size === 3, 'legacy provenance remains a list of exact contributing lines');
assert.deepStrictEqual(legacyAir.values, [-9, -72, 11, 0]);
const nativeWins = make(`${legacyText}stand.sizebox = -1,-2,3,4\n`); assert.strictEqual(byKey(nativeWins, 'stand.sizebox').provenance, 'authored-assignment'); assert.deepStrictEqual(byKey(nativeWins, 'stand.sizebox').values, [-1, -2, 3, 4]);
const incompleteLegacy = make('[Size]\nground.front = 18\n'); assert.strictEqual(byKey(incompleteLegacy, 'stand.sizebox').status, 'default-context'); assert.strictEqual(byKey(incompleteLegacy, 'stand.sizebox').values, null); assert.match(byKey(incompleteLegacy, 'stand.sizebox').reason, /no authored rectangle is invented/i);
const conflictingLegacy = make('[Size]\nground.front = 18\nground.front = 19\nground.back = 14\nheight = 72\n'); assert.strictEqual(byKey(conflictingLegacy, 'stand.sizebox').status, 'conflict'); assert.strictEqual(byKey(conflictingLegacy, 'stand.sizebox').values, null);

for (const [name, text] of [
  ['duplicate', '[Size]\npushfactor = 1\npushfactor = 0.5\n'],
  ['malformed', '[Size]\npushfactor = map(foo)\n'],
  ['wrong arity', '[Size]\ndepth = 1,2,3\n'],
  ['wrong section', '[Velocity]\nweight = 100\n'],
  ['dynamic', '[Size]\nxscale = ifElse(foo, 1, 2)\n']
]) {
  const model = make(text); assert.strictEqual(model.status, 'conflict', name); const key = name === 'duplicate' || name === 'malformed' ? 'pushfactor' : name === 'wrong arity' ? 'depth' : name === 'wrong section' ? 'weight' : 'xscale'; assert.strictEqual(byKey(model, key).status, 'conflict', name); assert.strictEqual(byKey(model, key).values, null, name);
}
const wrongFile = make('[Size]\npushfactor = 1\n[Info]\nikemenversion = 2.0\n', '[Info]\nname = Hero\n[Files]\ncns = constants.cns\n'); assert.strictEqual(wrongFile.status, 'conflict'); assert.strictEqual(byKey(wrongFile, 'ikemenversion').status, 'missing');

const dirty = make('[Size]\npushfactor = 1\n', '[Info]\nikemenversion = 1.1\n', { constants: { dirty: true, version: 19 } });
assert.strictEqual(dirty.sources.constants.sourceDirty, true); assert.strictEqual(dirty.sources.constants.sourceVersion, 19); assert.strictEqual(byKey(dirty, 'pushfactor').occurrences[0].sourceDirty, true);
const stable = make(complete, undefined, { channel: 'stable', capabilityStatus: 'supported' }); assert.strictEqual(stable.status, 'ready'); assert(stable.cards.every(item => item.nightlyOnly === false)); assert.match(stable.cards[0].compatibility, /exact Stable target/i);
const unknown = make(complete, undefined, { channel: 'unknown', capabilityStatus: 'unknown' }); assert.strictEqual(unknown.status, 'unresolved'); assert.match(unknown.reason, /target.*unresolved/i);
const mismatch = make(complete, undefined, { capabilityFingerprint: 'B'.repeat(64) }); assert.strictEqual(mismatch.status, 'unresolved'); assert.match(mismatch.reason, /fingerprints do not match/i);

const overCapText = `[Size]\n${Array.from({ length: MAX_OCCURRENCES_PER_SOURCE + 1 }, (_, index) => `ground.front = ${index}`).join('\n')}\n`;
const overCap = make(overCapText); assert.strictEqual(overCap.status, 'unresolved'); assert.strictEqual(overCap.omissions.constants, 1); assert.match(overCap.reason, /bounded evidence cap/i);
assert.throws(() => make(`[Size]\n;${'x'.repeat(MAX_SOURCE_BYTES)}\n`), /exceeds .* UTF-8 bytes/i);
const longExpression = make(`[Size]\npushfactor = ${'1'.repeat(300)}\n`); assert.strictEqual(longExpression.status, 'conflict'); assert.strictEqual(byKey(longExpression, 'pushfactor').occurrences[0].truncated, true); assert(Buffer.byteLength(byKey(longExpression, 'pushfactor').occurrences[0].expression, 'utf8') <= 256);

function bound(constantsFilename, defFilename, cnsExpression, options = {}) {
  const defText = `[Info]\nikemenversion = 1.1\n[Files]\ncns = ${cnsExpression}${options.comment || ''}\n`;
  return createAirCollisionCharacterContext({ constants: source(constantsFilename, '[Size]\npushfactor = 1\n', options.constants), def: source(defFilename, defText, options.def), ...target() });
}
const quotedBinding = bound('/char/shared data/constants file.cns', '/char/hero.def', '"shared data/constants file.cns"', { comment: ' ; exact comment' });
assert.strictEqual(quotedBinding.status, 'ready'); assert.strictEqual(quotedBinding.constantsBinding.status, 'exact'); assert.strictEqual(quotedBinding.constantsBinding.assignedLiteral, 'shared data/constants file.cns');
const bindingOccurrence = quotedBinding.constantsBinding.occurrence, quotedDefText = '[Info]\nikemenversion = 1.1\n[Files]\ncns = "shared data/constants file.cns" ; exact comment\n';
assert.strictEqual(quotedDefText.slice(bindingOccurrence.valueStart, bindingOccurrence.valueEnd), '"shared data/constants file.cns"'); assert.strictEqual(bindingOccurrence.sourceHash, quotedBinding.sources.def.sourceHash);
const parentBinding = bound('/char/constants.cns', '/char/sub/hero.def', '../constants.cns'); assert.strictEqual(parentBinding.status, 'ready'); assert.strictEqual(parentBinding.constantsBinding.status, 'exact');
const caseBinding = bound('/char/Constants.CNS', '/char/Hero.def', 'constants.cns'); assert.strictEqual(caseBinding.status, 'ready', 'Windows path identity is case-insensitive');
for (const [name, defText] of [
  ['missing', '[Info]\nikemenversion = 1.1\n'],
  ['duplicate', '[Info]\nikemenversion = 1.1\n[Files]\ncns = constants.cns\ncns = other.cns\n'],
  ['malformed', '[Info]\nikemenversion = 1.1\n[Files]\ncns = "constants.cns\n'],
  ['wrong section', '[Info]\nikemenversion = 1.1\ncns = constants.cns\n'],
  ['mismatch', '[Info]\nikemenversion = 1.1\n[Files]\ncns = other.cns\n']
]) { const model = make('[Size]\npushfactor = 1\n', defText); assert.strictEqual(model.status, 'unresolved', name); assert.strictEqual(model.constantsBinding.status, 'unresolved', name); }
const dirtyBound = bound('/char/constants.cns', '/char/hero.def', 'constants.cns', { def: { dirty: true, version: 28 } }); assert.strictEqual(dirtyBound.status, 'ready'); assert.strictEqual(dirtyBound.constantsBinding.occurrence.sourceDirty, true); assert.strictEqual(dirtyBound.constantsBinding.occurrence.sourceVersion, 28);
const dirtyReassigned = bound('/char/constants.cns', '/char/hero.def', 'other.cns', { def: { dirty: true, version: 29 } }); assert.strictEqual(dirtyReassigned.status, 'unresolved'); assert.match(dirtyReassigned.constantsBinding.reason, /different constants source/i);
const bindingHashA = bound('/char/constants.cns', '/char/hero.def', 'constants.cns'), bindingHashB = createAirCollisionCharacterContext({ constants: source('/char/constants.cns', '[Size]\npushfactor = 1\n'), def: source('/char/hero.def', `${defaultDef}; changed exact DEF hash\n`), ...target() }); assert.notStrictEqual(bindingHashA.contextHash, bindingHashB.contextHash); assert.notStrictEqual(bindingHashA.constantsBinding.occurrence.sourceHash, bindingHashB.constantsBinding.occurrence.sourceHash);

const validSource = source('/char/constants.cns', '[Size]\npushfactor = 1\n'), validDef = source('/char/hero.def', defaultDef);
const validTarget = frozen({ channel: 'nightly', buildId: 'nightly-build', capabilityFingerprint: fingerprint }), validCapability = frozen({ status: 'supported', capabilityFingerprint: fingerprint });
assert.throws(() => createAirCollisionCharacterContext({ constants: { ...validSource }, def: validDef, target: validTarget, capability: validCapability }), /deeply frozen/i);
assert.throws(() => createAirCollisionCharacterContext({ constants: frozen({ ...validSource, extra: true }), def: validDef, target: validTarget, capability: validCapability }), /exact source snapshot/i);
assert.throws(() => createAirCollisionCharacterContext({ constants: frozen({ ...validSource, filename: 'relative.cns' }), def: validDef, target: validTarget, capability: validCapability }), /malformed/i);
assert.throws(() => createAirCollisionCharacterContext({ constants: frozen({ ...validSource, sourceHash: 'B'.repeat(64) }), def: validDef, target: validTarget, capability: validCapability }), /malformed/i);
assert.throws(() => createAirCollisionCharacterContext({ constants: validSource, def: frozen({ ...validDef, sourceHash: 'B'.repeat(64) }), target: validTarget, capability: validCapability }), /malformed/i);
assert.throws(() => createAirCollisionCharacterContext({ constants: frozen({ ...validSource, dirty: true, open: false, version: null }), def: validDef, target: validTarget, capability: validCapability }), /dirty evidence/i);
const sparse = []; sparse.length = 2; assert.throws(() => createAirCollisionCharacterContext(sparse), /canonical plain data/i);
const cycle = {}; cycle.self = cycle; assert.throws(() => createAirCollisionCharacterContext(cycle), /canonical plain data/i);
assert.throws(() => createAirCollisionCharacterContext(new Proxy({}, {})), /canonical plain data/i);
const accessor = {}; Object.defineProperty(accessor, 'constants', { get() { throw new Error('getter ran'); }, enumerable: true }); assert.throws(() => createAirCollisionCharacterContext(accessor), /canonical plain data/i);

const before = fs.readdirSync(path.dirname(__filename)).length, mutableText = '[Size]\npushfactor = 1\n', immutableInput = { constants: source('/char/constants.cns', mutableText), def: validDef, target: validTarget, capability: validCapability }, serialized = JSON.stringify(immutableInput), first = createAirCollisionCharacterContext(immutableInput), second = createAirCollisionCharacterContext(immutableInput);
assert.strictEqual(JSON.stringify(immutableInput), serialized, 'caller evidence is not mutated'); assert.deepStrictEqual(first, second); assert.strictEqual(fs.readdirSync(path.dirname(__filename)).length, before, 'pure projection creates no files');
const serializedOutput = JSON.stringify(first); for (const forbidden of ['routeToken', 'applyAuthority', 'patch', 'clipboardText', 'editorDestination']) assert(!serializedOutput.includes(forbidden));

console.log('AIR character collision context keeps constants evidence exact, bounded, section-aware, deterministic, and read-only');
