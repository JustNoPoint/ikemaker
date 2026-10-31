'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { createAirCollisionPropertyDraft } = require('../src/air_collision_property_draft_model');
const { parseStateSource } = require('../src/state_transfer_model');
const { parseCollisionContactReferences } = require('../src/collision_contact_reference_authority');
const { MAX_SOURCE_BYTES, createAirCollisionDestinationPlan, deepFreeze, semanticHash } = require('../src/air_collision_destination_plan');

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
const filename = path.resolve('/char/main.zss'), fingerprint = 'A'.repeat(64);
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const target = { channel: 'nightly', buildId: 'verified' };
const inspection = createAirCollisionInspection({ text: airText, action: 200, elementIndex: 0, target, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });
const base = { inspection, capabilityFingerprint: fingerprint, target, indexedDecision: { capabilityId: 'collision.indexed-controls', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, dummyDecision: { capabilityId: 'collision.dummy-group', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, group: 'Clsn1', index: 0 };
const projection = draft => createAirCollisionPropertyDraft({ ...base, draft });

function fixture(text, draft, options = {}) {
  const projected = options.projection || projection(draft), syntax = options.syntax || 'zss', sourcePath = options.sourcePath || filename, sourceHash = sha(text), version = options.version ?? 7, stateNumber = options.stateNumber ?? 200, parsed = parseStateSource(text, sourcePath, syntax), declaration = parsed.declarations.find(item => item.value === stateNumber) || parsed.declarations[0], contact = options.controller === false ? null : parseCollisionContactReferences(text, syntax).find(item => item.label.toLowerCase() === String(projected.recipe.kind || '').toLowerCase());
  const snapshot = deepFreeze({ inventoryComplete: options.inventoryComplete !== false, clean: options.clean !== false, assignedSources: [sourcePath], sources: [deepFreeze({ filename: sourcePath, text, sourceHash, syntax, available: true, dirty: options.dirty === true, version })], targetBinding: { draftHash: projected.draftHash, inspectionHash: projected.selection?.inspectionHash, target: projected.target } });
  const destination = deepFreeze({ sourcePath, sourceHash, sourceVersion: version, stateNumber, stateLine: declaration?.line ?? 0, stateCharacter: declaration?.character ?? 10, stateExpression: declaration?.expression ?? String(stateNumber), ...(contact ? { controller: { kind: projected.recipe.kind, start: contact.controllerStart, end: contact.controllerEnd, controllerHash: sha(text.slice(contact.controllerStart, contact.controllerEnd)) } } : {}) });
  return { projected, snapshot, destination, text };
}
function plan(f) { return createAirCollisionDestinationPlan({ projection: f.projected, snapshot: f.snapshot, destination: f.destination }); }
function apply(text, result) { return result.insertion ? text.slice(0, result.insertion.start) + result.insertion.text + text.slice(result.insertion.end) : text; }

const eligibilityFixture = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 4, playerno: '2', playerid: 'enemyId', slot: 3, stack: true }, { controller: false });
const { draftHash: eligibilityDraftHash, ...eligibilitySemantic } = eligibilityFixture.projected;
assert.strictEqual(sha(JSON.stringify(eligibilitySemantic)), eligibilityDraftHash, 'test C10 draft hash remains exact');
const eligibilityBefore = JSON.stringify(eligibilityFixture), eligibility = plan(eligibilityFixture), eligibilityAfter = apply(eligibilityFixture.text, eligibility);
assert.strictEqual(eligibility.status, 'ready', eligibility.limitations.join(' | '));
assert.strictEqual(eligibility.operation.kind, 'new-controller');
assert.match(eligibility.insertion.text, /hitBy\{/); assert.match(eligibility.insertion.text, /clsn\.group: Clsn1;/); assert.match(eligibility.insertion.text, /clsn\.index: 0;/);
assert.match(eligibility.insertion.text, /playerno: 2;/); assert.match(eligibility.insertion.text, /slot: 3;/); assert.match(eligibility.insertion.text, /stack: 1;/);
assert.strictEqual(sha(eligibilityAfter), eligibility.hashes.after);
assert.strictEqual(eligibilityAfter.slice(0, eligibility.insertion.start) + eligibilityAfter.slice(eligibility.insertion.start + eligibility.insertion.text.length), eligibilityFixture.text, 'removing the proposed insertion restores every source byte');
assert.strictEqual(JSON.stringify(eligibilityFixture), eligibilityBefore, 'planning neither freezes nor mutates caller-owned evidence after acceptance');
assert(Object.isFrozen(eligibility) && Object.isFrozen(eligibility.operation) && Object.isFrozen(eligibility.effects));
assert.strictEqual(plan(eligibilityFixture).planHash, eligibility.planHash, 'the same exact evidence produces one deterministic plan');
assert.deepStrictEqual(eligibility.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
assert(!Object.prototype.hasOwnProperty.call(eligibility, 'routeToken') && !Object.prototype.hasOwnProperty.call(eligibility, 'commandId') && !Object.prototype.hasOwnProperty.call(eligibility, 'apply') && !Object.prototype.hasOwnProperty.call(eligibility, 'save'), 'C11A emits no route token or mutation-like command');
const hostileDestinationFixture = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false });
hostileDestinationFixture.destination = deepFreeze({ ...hostileDestinationFixture.destination, routeToken: 'evil', command: 'write', apply: true, save: true });
const hostileDestination = plan(hostileDestinationFixture), hostileOutput = JSON.stringify(hostileDestination.destination);
assert.strictEqual(hostileDestination.status, 'ready');
for (const forbidden of ['routeToken', 'command', 'apply', 'save']) assert(!hostileOutput.includes(forbidden), `destination output strips ${forbidden}`);

const contactCases = [
  ['HitDef', 'attr: S, NA;'], ['ModifyHitDef', ''], ['Projectile', 'attr: S, AP;'], ['ModifyProjectile', ''], ['ReversalDef', 'reversal.attr: SCA, AA;'], ['ModifyReversalDef', '']
];
for (const [kind, required] of contactCases) {
  const name = kind[0].toLowerCase() + kind.slice(1), draft = { family: 'contact', kind, attr: kind === 'Projectile' ? 'S, AP' : 'S, NA', reversalAttr: 'SCA, AA', p2clsncheck: kind.includes('Reversal') ? 'Clsn1' : 'Clsn2', p2clsnrequire: 'Size' }, source = `[StateDef 200]\n${name}{\n\t${required}${required ? '\n' : ''}\tguardflag: M;\n}\n`, f = fixture(source, draft), result = plan(f), after = apply(source, result);
  assert.strictEqual(result.status, 'ready', `${kind} should plan missing reviewed fields`);
  assert.strictEqual(result.operation.kind, 'add-missing-fields');
  assert.match(result.insertion.text, /p2clsncheck:/); assert.match(result.insertion.text, /p2clsnrequire: Size;/);
  assert.strictEqual(after.slice(0, result.insertion.start) + after.slice(result.insertion.start + result.insertion.text.length), source, `${kind} preserves every unrelated byte`);
}

const equalAndMissingSource = '[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: clsn2; # equal literal\n}\n';
const equalAndMissing = plan(fixture(equalAndMissingSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2', p2clsnrequire: 'Size' }));
assert.strictEqual(equalAndMissing.status, 'ready'); assert.deepStrictEqual([...equalAndMissing.operation.retainedEqualFields].sort(), ['attr', 'p2clsncheck']); assert.deepStrictEqual(equalAndMissing.operation.fields, ['p2clsnrequire']);
const noopSource = '[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: Clsn2;\n\tp2clsnrequire: Size;\n}\n', noop = plan(fixture(noopSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2', p2clsnrequire: 'Size' }));
assert.strictEqual(noop.status, 'no-op'); assert.strictEqual(noop.operation.kind, 'add-missing-fields'); assert.strictEqual(noop.operation.noop, true); assert.strictEqual(noop.insertion, null); assert.strictEqual(noop.hashes.before, noop.hashes.after);

const different = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: Clsn1;\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(different.status, 'conflict'); assert.match(different.conflicts.join(' '), /differs/i);
const dynamicField = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: map(targetGroup);\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(dynamicField.status, 'conflict'); assert.match(dynamicField.conflicts.join(' '), /differs/i);
const duplicateField = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: Clsn2;\n\tp2clsncheck: Clsn2;\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(duplicateField.status, 'conflict'); assert.match(duplicateField.conflicts.join(' '), /more than once/i);
const unrelatedDynamic = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tguardflag: map(dynamicFlag);\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(unrelatedDynamic.status, 'conflict'); assert.match(unrelatedDynamic.conflicts.join(' '), /guardflag.*dynamic|malformed/i);
const unrelatedDuplicate = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\thitflag: M;\n\thitflag: M;\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(unrelatedDuplicate.status, 'conflict'); assert.match(unrelatedDuplicate.conflicts.join(' '), /hitflag.*more than once/i);
const unrelatedMalformed = plan(fixture('[StateDef 200]\nhitDef{\n\tattr: S, BAD, VALUE;\n}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(unrelatedMalformed.status, 'conflict'); assert.match(unrelatedMalformed.conflicts.join(' '), /attr.*malformed/i);
const duplicateControllerSource = '[StateDef 200]\nhitDef{attr: S, NA;}\nhitDef{attr: S, NA;}\n', duplicateController = plan(fixture(duplicateControllerSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(duplicateController.status, 'conflict'); assert.match(duplicateController.limitations.join(' '), /duplicated/i);
const wrongKindFixture = fixture('[StateDef 200]\nhitDef{attr: S, NA;}\n', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' });
wrongKindFixture.destination = deepFreeze({ ...wrongKindFixture.destination, controller: { ...wrongKindFixture.destination.controller, kind: 'Projectile' } });
assert.strictEqual(plan(wrongKindFixture).status, 'conflict');

const query = plan(fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'queries', kind: 'ClsnOverlap', target: 'Clsn2', player: 'p2, ID' }, { controller: false }));
assert.strictEqual(query.status, 'unresolved'); assert.match(query.limitations[0], /no reviewed expression insertion anchor/i);
const cnsText = '[StateDef 200]\n[State 200, Hit]\ntype = HitDef\nattr = S, NA\n', cns = plan(fixture(cnsText, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }, { syntax: 'cns', sourcePath: path.resolve('/char/main.cns') }));
assert.strictEqual(cns.status, 'unresolved'); assert.match(cns.limitations[0], /CNS rendering is not yet reviewed/i);
const mislabeledCns = plan(fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false, syntax: 'zss', sourcePath: path.resolve('/char/main.cns') }));
assert.strictEqual(mislabeledCns.status, 'unresolved'); assert.match(mislabeledCns.limitations[0], /noncanonical/i);
for (const version of ['seven', -1, 1.5]) {
  const invalidVersion = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false, version });
  assert.strictEqual(plan(invalidVersion).status, 'unresolved', `version ${version} fails closed`);
}

const duplicateStateText = '[StateDef 200]\nchangeAnim{value: 200}\n[StateDef 200]\nchangeAnim{value: 201}\n', duplicateState = plan(fixture(duplicateStateText, { family: 'eligibility', kind: 'NotHitBy' }, { controller: false }));
assert.strictEqual(duplicateState.status, 'unresolved'); assert.match(duplicateState.limitations[0], /duplicated/i);
const malformed = plan(fixture('[StateDef 200]\nif 1 {\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }));
assert.strictEqual(malformed.status, 'unresolved'); assert.match(malformed.limitations[0], /malformed|safe insertion/i);
const commonState = plan(fixture('[StateDef -2]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false, stateNumber: -2 }));
assert.strictEqual(commonState.status, 'ready', 'exact negative/common StateDefs remain valid authoring destinations');

for (const overrides of [{ clean: false }, { dirty: true }, { inventoryComplete: false }]) {
  const bad = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false, ...overrides }); assert.strictEqual(plan(bad).status, 'unresolved');
}
for (const field of ['sourceHash', 'sourceVersion', 'sourcePath']) {
  const stale = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }), replacement = field === 'sourceHash' ? 'B'.repeat(64) : field === 'sourceVersion' ? 99 : path.resolve('/char/other.zss'); stale.destination = deepFreeze({ ...stale.destination, [field]: replacement }); assert.strictEqual(plan(stale).status, 'unresolved', `${field} mismatch fails closed`);
}
const staleDraftFixture = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }), staleDraft = deepFreeze({ ...staleDraftFixture.projected, draftHash: 'B'.repeat(64) }); staleDraftFixture.projected = staleDraft;
assert.strictEqual(plan(staleDraftFixture).status, 'unresolved');
const wrongTarget = fixture('[StateDef 200]\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }); wrongTarget.snapshot = deepFreeze({ ...wrongTarget.snapshot, targetBinding: { ...wrongTarget.snapshot.targetBinding, target: { ...wrongTarget.projected.target, status: 'stable-1.0' } } });
assert.strictEqual(plan(wrongTarget).status, 'unresolved'); assert.match(plan(wrongTarget).limitations[0], /different.*target/i);

const mixed = plan(fixture('[StateDef 200]\r\nchangeAnim{value: 200}\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }));
assert.strictEqual(mixed.status, 'unresolved'); assert.match(mixed.limitations[0], /line endings/i);
const crlfFixture = fixture('[StateDef 200]\r\nchangeAnim{value: 200}\r\n', { family: 'eligibility', kind: 'HitBy' }, { controller: false }), crlf = plan(crlfFixture);
assert.strictEqual(crlf.status, 'ready'); assert(!/(^|[^\r])\n/.test(crlf.insertion.text), 'a CRLF destination receives only CRLF insertion bytes');
const eofFixture = fixture('[StateDef 200]\nchangeAnim{value: 200}', { family: 'eligibility', kind: 'HitBy' }, { controller: false }), eof = plan(eofFixture);
assert.strictEqual(eof.status, 'ready'); assert.strictEqual(eof.preview.before, eofFixture.text); assert.strictEqual(eof.preview.after, apply(eofFixture.text, eof)); assert(eof.preview.insertionColumn > 0, 'EOF insertion records its exact column');
const inlineFixture = fixture('[StateDef 200]\nhitDef{attr: S, NA;}', { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }), inline = plan(inlineFixture);
assert.strictEqual(inline.status, 'ready'); assert.strictEqual(inline.preview.before, inlineFixture.text); assert.strictEqual(inline.preview.after, apply(inlineFixture.text, inline)); assert(inline.preview.insertionColumn > 0, 'inline closing-brace insertion records its exact column'); assert.match(inline.preview.diff, /-hitDef\{attr: S, NA;\}/);
const comments = '[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\t# p2clsncheck: Dummy; fake }\n\ttext: "}";\n}\n', commentsResult = plan(fixture(comments, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' }));
assert.strictEqual(commentsResult.status, 'ready'); assert.deepStrictEqual(commentsResult.operation.fields, ['p2clsncheck']);
const tooManyFieldsSource = `[StateDef 200]\nhitDef{\n\tattr: S, NA;\n${Array.from({ length: 257 }, (_, index) => `\tcustom${index}: ${index};`).join('\n')}\n}\n`;
assert.throws(() => plan(fixture(tooManyFieldsSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' })), /fields exceed/);

const hugeText = '[StateDef 200]\n#' + 'x'.repeat(MAX_SOURCE_BYTES + 1), huge = fixture(hugeText, { family: 'eligibility', kind: 'HitBy' }, { controller: false });
assert.strictEqual(plan(huge).status, 'unresolved'); assert.match(plan(huge).limitations[0], /oversized|stale/i);
const custom = Object.create({ polluted: true }); custom.projection = eligibilityFixture.projected; custom.snapshot = eligibilityFixture.snapshot; custom.destination = eligibilityFixture.destination;
assert.throws(() => createAirCollisionDestinationPlan(custom), /canonical plain object/i);
const accessor = {}; Object.defineProperty(accessor, 'projection', { enumerable: true, get() { throw new Error('getter must not run'); } });
assert.throws(() => createAirCollisionDestinationPlan(accessor), /canonical plain object/i);
for (const hostileLeaf of [() => {}, Symbol('hostile'), 1n, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined]) {
  const hostile = { projection: eligibilityFixture.projected, snapshot: eligibilityFixture.snapshot, destination: Object.freeze({ ...eligibilityFixture.destination, hostileLeaf }) };
  assert.throws(() => createAirCollisionDestinationPlan(hostile), /canonical plain object/i, `${String(hostileLeaf)} is not canonical JSON evidence`);
}
let proxyTrapCount = 0;
const callableProxy = new Proxy(function hostileCallable() {}, {
  apply() { proxyTrapCount += 1; throw new Error('call trap must not run'); },
  get() { proxyTrapCount += 1; throw new Error('get trap must not run'); },
  getPrototypeOf() { proxyTrapCount += 1; throw new Error('prototype trap must not run'); },
  ownKeys() { proxyTrapCount += 1; throw new Error('keys trap must not run'); }
});
const proxyInput = { projection: eligibilityFixture.projected, snapshot: eligibilityFixture.snapshot, destination: Object.freeze({ ...eligibilityFixture.destination, controller: Object.freeze({ kind: 'HitDef', start: 0, end: 1, controllerHash: 'A'.repeat(64), hostile: callableProxy }) }) };
assert.throws(() => createAirCollisionDestinationPlan(proxyInput), /canonical plain object/i);
assert.throws(() => createAirCollisionDestinationPlan({ projection: Object.freeze({ ...eligibilityFixture.projected, hostile: callableProxy }), snapshot: eligibilityFixture.snapshot, destination: eligibilityFixture.destination }), /canonical plain object/i);
assert.throws(() => createAirCollisionDestinationPlan({ projection: eligibilityFixture.projected, snapshot: Object.freeze({ ...eligibilityFixture.snapshot, hostile: callableProxy }), destination: eligibilityFixture.destination }), /canonical plain object/i);
assert.strictEqual(proxyTrapCount, 0, 'callable Proxy evidence is identified and rejected without executing any trap');

console.log('AIR collision destination plans remain exact, bounded, deterministic, ZSS-only, and non-writing');
