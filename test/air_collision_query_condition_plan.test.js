'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { createAirCollisionPropertyDraft } = require('../src/air_collision_property_draft_model');
const {
  MAX_ANCHORS,
  MAX_CONDITION_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_PATCH_BYTES,
  MAX_QUERY_BYTES,
  MAX_SOURCE_BYTES,
  MAX_STATES,
  createAirCollisionQueryConditionPlan,
  deepFreeze,
  inventoryAirCollisionQueryConditionAnchors
} = require('../src/air_collision_query_condition_plan');

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
const sourcePath = path.resolve('test-fixtures/query-condition/main.zss');
const fingerprint = 'A'.repeat(64);
const target = { channel: 'nightly', buildId: 'verified' };
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const inspection = createAirCollisionInspection({ text: airText, action: 200, elementIndex: 0, target, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });
const draftBase = { inspection, capabilityFingerprint: fingerprint, target, indexedDecision: { capabilityId: 'collision.indexed-controls', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, dummyDecision: { capabilityId: 'collision.dummy-group', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, group: 'Clsn1', index: 0 };
const projection = draft => createAirCollisionPropertyDraft({ ...draftBase, draft });

function fixture(text, options = {}) {
  const header = /^[ \t]*\[[ \t]*StateDef\b[^\]\r\n]*\]/im.exec(text);
  assert(header, 'fixture needs a StateDef header');
  const version = options.open === false ? null : options.version ?? 7, sourceHash = sha(text);
  const destination = deepFreeze({ sourcePath, sourceHash, sourceVersion: version, stateNumber: options.stateNumber ?? 200, stateOccurrence: options.stateOccurrence ?? 0, stateHeaderStart: header.index, stateHeaderEnd: header.index + header[0].length, stateExpression: header[0], stateHeaderHash: sha(header[0]) });
  const source = deepFreeze({ filename: sourcePath, text, sourceHash, syntax: 'zss', available: true, open: options.open !== false, dirty: options.dirty === true, version });
  const snapshot = deepFreeze({ inventoryComplete: true, assignedSources: [sourcePath], sources: [source] });
  return { destination, snapshot };
}
function inventory(f) { return inventoryAirCollisionQueryConditionAnchors(deepFreeze({ snapshot: f.snapshot, destination: f.destination })); }
function plan(f, projected, anchor = inventory(f).anchors[0]) { return createAirCollisionQueryConditionPlan(deepFreeze({ propertyProjection: projected, snapshot: f.snapshot, destination: f.destination, anchor, operation: deepFreeze({ kind: 'and-condition' }) })); }
function apply(text, result) { return text.slice(0, result.patch.start) + result.patch.text + text.slice(result.patch.end); }

const source = '[StateDef 200]\nif time > 0 {\n\tif (anim = 200) { changeAnim{value: 201} }\n}\nelse if life > 0 { changeState{value: 0} }\nignoreHitPause if ctrl { changeState{value: 0} }\n';
const f = fixture(source, { dirty: true }), listed = inventory(f);
assert.strictEqual(listed.status, 'ready', listed.limitations.join(' | '));
assert.deepStrictEqual(listed.anchors.map(item => item.kind), ['if', 'if', 'else-if', 'ignoreHitPause-if']);
assert.deepStrictEqual(listed.anchors.map(item => item.nestingDepth), [0, 1, 0, 0]);
assert(Object.isFrozen(listed) && Object.isFrozen(listed.anchors[0]) && Object.isFrozen(listed.effects));
assert.deepStrictEqual(listed.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
assert.strictEqual(inventory(f).inventoryHash, listed.inventoryHash, 'inventory is deterministic');

const clsn = projection({ family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Clsn1', target: 'Clsn2', player: 'p2, ID' });
const clsnPlan = plan(f, clsn);
assert.strictEqual(clsnPlan.status, 'ready', clsnPlan.limitations.join(' | '));
assert.strictEqual(clsnPlan.patch.text, '(time > 0) && (clsnOverlap(Clsn1, p2, ID, Clsn2))');
assert.strictEqual(apply(source, clsnPlan).slice(0, clsnPlan.patch.start), source.slice(0, clsnPlan.patch.start));
assert.strictEqual(sha(apply(source, clsnPlan)), clsnPlan.hashes.after);
assert.strictEqual(clsnPlan.operation.evaluationOrder, 'original-first');
assert.deepStrictEqual(clsnPlan.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
assert(!JSON.stringify(clsnPlan).includes('mutationToken'));

const projectile = projection({ family: 'queries', kind: 'ProjClsnOverlap', projectileListIndex: 44, target: 'Size', player: 'p2, ID' });
const projectilePlan = plan(f, projectile, listed.anchors[2]);
assert.strictEqual(projectilePlan.status, 'ready', projectilePlan.limitations.join(' | '));
assert.match(projectilePlan.patch.text, /projClsnOverlap\(44, p2, ID, Size\)/);

const dummy = projection({ family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Clsn2', player: 'p2, ID' });
assert.strictEqual(plan(f, dummy).status, 'ready', 'exact Nightly Dummy query is accepted');
const stableTarget = { channel: 'stable', version: '1.0' }, stableInspection = createAirCollisionInspection({ text: airText, action: 200, elementIndex: 0, target: stableTarget, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint } });
const stableDummy = createAirCollisionPropertyDraft({ ...draftBase, inspection: stableInspection, target: stableTarget, indexedDecision: { capabilityId: 'collision.indexed-controls', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }, dummyDecision: { capabilityId: 'collision.dummy-group', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }, draft: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Clsn2' } });
assert.strictEqual(stableDummy.status, 'unresolved');
assert.strictEqual(plan(f, stableDummy).status, 'conflict', 'Stable Dummy remains unavailable');

const crlfSource = source.replace(/\n/g, '\r\n'), crlf = fixture(crlfSource), crlfInventory = inventory(crlf);
assert.strictEqual(crlfInventory.status, 'ready');
assert.strictEqual(plan(crlf, clsn, crlfInventory.anchors[0]).status, 'ready');
const noFinal = fixture('[StateDef 200]\nif time > 0 { changeState{value: 0} }');
assert.strictEqual(plan(noFinal, clsn).status, 'ready');
const quotedDelimiter = fixture('[StateDef 200]\nif map("#not-comment") && name = "{//}" { changeState{value: 0} }\n');
assert.strictEqual(plan(quotedDelimiter, clsn).status, 'ready', 'quoted comment and brace delimiters stay masked');
const priorOtherQuery = fixture('[StateDef 200]\nif clsnOverlap(Clsn2, p2, ID, Size) { changeState{value: 0} }\n');
assert.strictEqual(plan(priorOtherQuery, clsn).status, 'ready', 'one new reviewed query may coexist with a different exact query');
const functionBoundary = fixture('[StateDef 200]\nif time > 0 { changeState{value: 0} }\n[Function Helper()]\nif life > 0 { return 1 }\n');
assert.strictEqual(inventory(functionBoundary).anchors.length, 1, 'bracketed Function conditions never leak into the preceding StateDef');

for (const malformed of [
  '[StateDef 200]\nif time > 0\n{ changeState{value: 0} }\n',
  '[StateDef 200]\nif time > 0 { # comment\nchangeState{value: 0}\n}\n',
  '[StateDef 200]\nif (time > 0 { changeState{value: 0} }\n',
  '[StateDef 200]\nif time > 0 { changeState{value: 0}\n'
]) assert.notStrictEqual(inventory(fixture(malformed)).status, 'ready', 'malformed/comment-bearing conditions fail closed');
assert.notStrictEqual(inventory(fixture('[StateDef 200]\nif (time >\n0) { changeState{value: 0} }\n')).status, 'ready', 'parenthesized multiline conditions fail closed');

const duplicate = fixture('[StateDef 200]\nif 1 { changeState{value: 0} }\n[StateDef 200]\nif 1 { changeState{value: 1} }\n');
assert.notStrictEqual(inventory(duplicate).status, 'ready', 'duplicate StateDef identity fails closed');
const custom = fixture('[StateDef 200]\n@customstate\nif 1 { changeState{value: 0} }\n');
assert.notStrictEqual(inventory(custom).status, 'ready');

const noopText = '[StateDef 200]\nif clsnOverlap(Clsn1, p2, ID, Clsn2) { changeState{value: 0} }\n', noop = fixture(noopText);
assert.strictEqual(plan(noop, clsn).status, 'conflict');
assert.match(plan(noop, clsn).conflicts.join(' '), /no-op/i);

const staleAnchor = deepFreeze({ ...listed.anchors[0], conditionHash: 'B'.repeat(64) });
assert.strictEqual(plan(f, clsn, staleAnchor).status, 'conflict');
const staleDestination = deepFreeze({ ...f.destination, sourceVersion: 8 });
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(deepFreeze({ snapshot: f.snapshot, destination: staleDestination })).status, 'ready');

const changedProjection = deepFreeze({ ...clsn, draftHash: 'B'.repeat(64) });
assert.strictEqual(plan(f, changedProjection).status, 'conflict');

const stateAtCapText = '[StateDef 200]\nif 1 { changeState{value: 0} }\n' + Array.from({ length: MAX_STATES - 1 }, (_, index) => `[StateDef ${1000 + index}]\n`).join('');
assert.strictEqual(inventory(fixture(stateAtCapText)).status, 'ready', 'exact StateDef cap is accepted');
const stateOverCapText = stateAtCapText + '[StateDef map(dynamic)]\n';
assert.notStrictEqual(inventory(fixture(stateOverCapText)).status, 'ready', 'all StateDef markers, including dynamic declarations, count toward the cap');
const anchorsAtCapText = '[StateDef 200]\n' + Array.from({ length: MAX_ANCHORS }, () => 'if 1 { }\n').join('');
const anchorsAtCap = inventory(fixture(anchorsAtCapText));
assert.strictEqual(anchorsAtCap.status, 'ready', anchorsAtCap.limitations.join(' | '));
assert.strictEqual(anchorsAtCap.anchors.length, MAX_ANCHORS);
assert.notStrictEqual(inventory(fixture(anchorsAtCapText + 'if 1 { }\n')).status, 'ready', 'condition anchor cap rejects overflow without truncation');
const exactCondition = 'x'.repeat(MAX_CONDITION_BYTES), exactConditionFixture = fixture(`[StateDef 200]\nif ${exactCondition} { }\n`);
assert.strictEqual(inventory(exactConditionFixture).status, 'ready', 'exact condition byte cap is accepted');
assert.notStrictEqual(inventory(fixture(`[StateDef 200]\nif ${exactCondition}x { }\n`)).status, 'ready', 'condition byte cap rejects overflow');
const sourcePrefix = '[StateDef 200]\nif 1 { }\n#', sourceAtCap = sourcePrefix + 'x'.repeat(MAX_SOURCE_BYTES - Buffer.byteLength(sourcePrefix, 'utf8'));
assert.strictEqual(Buffer.byteLength(sourceAtCap, 'utf8'), MAX_SOURCE_BYTES);
assert.strictEqual(inventory(fixture(sourceAtCap)).status, 'ready', 'exact source byte cap is accepted');
assert.notStrictEqual(inventory(fixture(sourceAtCap + 'x')).status, 'ready', 'source byte cap rejects overflow');
assert.strictEqual(MAX_QUERY_BYTES, 1024); assert.strictEqual(MAX_PATCH_BYTES, 16 * 1024); assert.strictEqual(MAX_OUTPUT_BYTES, 128 * 1024);
assert(Buffer.byteLength(clsn.recipe.preview.code, 'utf8') <= MAX_QUERY_BYTES && Buffer.byteLength(clsnPlan.patch.text, 'utf8') <= MAX_PATCH_BYTES);

const accessor = {}; Object.defineProperty(accessor, 'snapshot', { enumerable: true, get() { throw new Error('must not execute'); } });
assert.doesNotThrow(() => inventoryAirCollisionQueryConditionAnchors(accessor));
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(accessor).status, 'ready');
let getterHits = 0; const frozenAccessor = {}; Object.defineProperty(frozenAccessor, 'snapshot', { enumerable: true, get() { getterHits += 1; return null; } }); Object.freeze(frozenAccessor);
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(frozenAccessor).status, 'ready'); assert.strictEqual(getterHits, 0, 'frozen object accessors never execute');
const accessorArray = []; Object.defineProperty(accessorArray, '0', { enumerable: true, get() { getterHits += 1; return sourcePath; } }); Object.defineProperty(accessorArray, 'length', { value: 1 }); Object.freeze(accessorArray);
const accessorSnapshot = Object.freeze({ inventoryComplete: true, assignedSources: accessorArray, sources: Object.freeze([f.snapshot.sources[0]]) }), accessorInput = Object.freeze({ snapshot: accessorSnapshot, destination: f.destination });
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(accessorInput).status, 'ready'); assert.strictEqual(getterHits, 0, 'frozen array accessors never execute');
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(new Proxy({}, { ownKeys() { throw new Error('proxy'); } })).status, 'ready');
let proxyTraps = 0; const trapHandler = { getOwnPropertyDescriptor() { proxyTraps += 1; return undefined; }, isExtensible() { proxyTraps += 1; return true; }, ownKeys() { proxyTraps += 1; return []; }, getPrototypeOf() { proxyTraps += 1; return Object.prototype; }, get() { proxyTraps += 1; return undefined; } }, rootProxy = new Proxy({}, trapHandler);
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(rootProxy).status, 'ready');
assert.notStrictEqual(createAirCollisionQueryConditionPlan(rootProxy).status, 'ready');
assert.strictEqual(proxyTraps, 0, 'root proxies trigger no traps in either entry point');
const nestedInventoryProxy = Object.freeze({ snapshot: new Proxy({}, trapHandler), destination: f.destination });
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(nestedInventoryProxy).status, 'ready');
const nestedPlanProxy = Object.freeze({ propertyProjection: new Proxy({}, trapHandler), snapshot: f.snapshot, destination: f.destination, anchor: listed.anchors[0], operation: Object.freeze({ kind: 'and-condition' }) });
assert.notStrictEqual(createAirCollisionQueryConditionPlan(nestedPlanProxy).status, 'ready');
assert.strictEqual(proxyTraps, 0, 'nested proxies trigger no traps in either entry point');
const cyclic = {}; cyclic.self = cyclic; assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors(cyclic).status, 'ready');
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors({ symbol: Symbol('x') }).status, 'ready');
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors({ bigint: 1n }).status, 'ready');
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors({ number: NaN }).status, 'ready');
assert.notStrictEqual(inventoryAirCollisionQueryConditionAnchors({ number: Infinity }).status, 'ready');

console.log('air_collision_query_condition_plan.test.js passed');
