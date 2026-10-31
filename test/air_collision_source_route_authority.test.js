'use strict';

const assert = require('assert');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { SCHEMA, buildAirCollisionSourceRoutes, validateAirCollisionSourceRoute } = require('../src/air_collision_source_route_authority');

const source = '[Begin Action 10]\nClsn1: 2\nClsn1[0] = 9,8,1,2\nClsn1[1] = -4,-3,5,6\n10,0,0,0,1\n';
const CAP = 'A'.repeat(64), OTHER_CAP = 'B'.repeat(64);
const inspect = (text = source, capabilityFingerprint = CAP) => createAirCollisionInspection({ text, action: 10, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' }, capabilityFingerprint });
let serial = 0;
const token = () => (++serial).toString(16).padStart(48, '0');
const context = { airPath: 'C:/game/chars/test/test.air', airVersion: 7, generation: 3, sourceFingerprint: inspect().sourceFingerprint, capabilityFingerprint: CAP, token };
const built = buildAirCollisionSourceRoutes({ inspection: inspect(), ...context });

assert.strictEqual(built.publicRoutes.length, 3, 'one block and two exact assignment routes are issued for the selected group only');
assert.strictEqual(built.authorities.size, 3);
assert(Object.isFrozen(built.publicRoutes) && Object.isFrozen(built.publicRoutes[0].range));
const block = built.publicRoutes[0], first = built.publicRoutes[1], authority = built.authorities.get(first.route);
assert.strictEqual(authority.schema, SCHEMA);
assert.strictEqual(authority.kind, 'assignment');
assert.strictEqual(authority.requestedAction, 10);
assert.strictEqual(authority.actionOccurrence, 0);
assert.strictEqual(authority.elementIndex, 0);
assert.strictEqual(authority.authoritativeAction, 10);
assert.strictEqual(authority.allocationProfile, 'stable-source-order');
assert.deepStrictEqual(first.range, { start: { line: 2, character: 0 }, end: { line: 2, character: 18 } });
assert(validateAirCollisionSourceRoute(authority, inspect(), context), 'the exact current dirty-document context validates');
assert(validateAirCollisionSourceRoute(built.authorities.get(block.route), inspect(), context), 'block-header routes validate independently');

for (const changed of [
  { ...context, airVersion: 8 },
  { ...context, generation: 4 },
  { ...context, capabilityFingerprint: OTHER_CAP },
  { ...context, airPath: 'C:/game/chars/test/other.air' },
  { ...context, sourceFingerprint: '0'.repeat(64) }
]) assert.strictEqual(validateAirCollisionSourceRoute(authority, inspect(), changed), null, 'every bound source/capability/generation drift fails closed');
assert.strictEqual(validateAirCollisionSourceRoute(authority, inspect(source.replace('9,8,1,2', '9,8,1,3')), { ...context, sourceFingerprint: inspect(source.replace('9,8,1,2', '9,8,1,3')).sourceFingerprint }), null, 'assignment edits invalidate identity even when a new current inspection is supplied');
assert.strictEqual(validateAirCollisionSourceRoute(authority, createAirCollisionInspection({ text: source, action: 10, elementIndex: 0, target: { channel: 'nightly' }, capabilityFingerprint: CAP }), context), null, 'allocation-profile changes fail closed');

const copiedSource = `${source}[Begin Action 20]\nCopy Action 10\n`;
const copiedInspection = createAirCollisionInspection({ text: copiedSource, action: 20, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' }, capabilityFingerprint: CAP });
const copiedContext = { ...context, sourceFingerprint: copiedInspection.sourceFingerprint, airVersion: 9, generation: 5 };
const copiedRoutes = buildAirCollisionSourceRoutes({ inspection: copiedInspection, ...copiedContext, token });
assert.strictEqual(copiedRoutes.publicRoutes[1].line, 3, 'Copy Action routes target the authoritative assignment line');
assert.strictEqual(copiedRoutes.authorities.get(copiedRoutes.publicRoutes[1].route).authoritativeAction, 10);

const duplicateText = `${source}[Begin Action 10]\nClsn1: 1\nClsn1[0]=0,0,1,1\n10,1,0,0,1\n`;
const duplicateInspection = createAirCollisionInspection({ text: duplicateText, action: 10, actionOccurrence: 0, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' }, capabilityFingerprint: CAP });
const duplicateRoutes = buildAirCollisionSourceRoutes({ inspection: duplicateInspection, ...context, sourceFingerprint: duplicateInspection.sourceFingerprint, token });
assert.strictEqual(duplicateRoutes.publicRoutes.length, 0, 'ambiguous duplicate Action IDs never gain a source route');

for (const missing of [
  { airVersion: 7, generation: 3, sourceFingerprint: inspect().sourceFingerprint, capabilityFingerprint: CAP },
  { airPath: context.airPath, airVersion: 7, generation: 3, capabilityFingerprint: CAP },
  { airPath: context.airPath, airVersion: 7, generation: 3, sourceFingerprint: inspect().sourceFingerprint },
  { ...context, airPath: '   ' }
]) assert.throws(() => buildAirCollisionSourceRoutes({ inspection: inspect(), ...missing, token }), /required|match/i, 'issuance requires explicit current open-document context');
for (const key of ['airPath', 'sourceFingerprint', 'capabilityFingerprint']) { const missing = { ...context }; delete missing[key]; assert.strictEqual(validateAirCollisionSourceRoute(authority, inspect(), missing), null, `validation rejects missing ${key}`); }
const duplicateToken = () => 'f'.repeat(48);
assert.throws(() => buildAirCollisionSourceRoutes({ inspection: inspect(), ...context, token: duplicateToken }), /collided/, 'duplicate opaque tokens fail closed before public routes and authorities diverge');

const consumed = new Set();
function consume(route) { if (consumed.has(route) || !built.authorities.has(route)) return null; consumed.add(route); const record = built.authorities.get(route); built.authorities.delete(route); return record; }
assert(consume(first.route), 'the host can consume the opaque route exactly once');
assert.strictEqual(consume(first.route), null, 'a consumed route cannot be reused');
assert.throws(() => buildAirCollisionSourceRoutes({ inspection: inspect(), ...context, token: () => 'not-a-token' }), /48 lowercase hexadecimal/);

console.log('AIR collision source routes bind one-use host tokens to exact dirty-document evidence and freshness');
