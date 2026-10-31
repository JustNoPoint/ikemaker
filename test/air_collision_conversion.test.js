'use strict';

const assert = require('assert');
const { parseAir } = require('../src/air_preview_model');
const { buildGroupConversion, buildOwnershipConversion } = require('../src/air_collision_conversion');

const capabilityFingerprint = 'C'.repeat(64), base = { action: 100, elementIndex: 0, capabilityFingerprint, target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint } };
const apply = (text, plan) => text.slice(0, plan.patch.start) + plan.patch.replacement + text.slice(plan.patch.end);

const local = '[Begin Action 100]\nClsn1: 2\nClsn1[0] = -10,-20,10,20\nClsn1[1] = -5,-8,5,8\n100,0,0,0,1\n';
const converted = buildGroupConversion({ ...base, text: local, groupKey: 'clsn1', slots: [0, 1] }), convertedText = apply(local, converted), convertedFrame = parseAir(convertedText)[0].frames[0];
assert.strictEqual(converted.count, 2);
assert.strictEqual(convertedFrame.clsn1.length, 0);
assert.deepStrictEqual(convertedFrame.clsn2, [[-10, -20, 10, 20], [-5, -8, 5, 8]]);
assert.throws(() => buildGroupConversion({ ...base, text: local, groupKey: 'clsn1', slots: [] }), /Select one or more/);
assert.throws(() => buildGroupConversion({ ...base, text: '[Begin Action 100]\nClsn1: 1\nClsn1[0]=0,0,1,1\nClsn2Default: 1\nClsn2[0]=0,0,2,2\n100,0,0,0,1\n', groupKey: 'clsn1', slots: [0] }), /target Default block to local ownership first/);

const defaultPlan = buildOwnershipConversion({ ...base, text: local, groupKey: 'clsn1', slots: [0] }), defaultText = apply(local, defaultPlan), defaultFrame = parseAir(defaultText)[0].frames[0];
assert.strictEqual(defaultPlan.direction, 'local-to-default');
assert.strictEqual(defaultFrame.clsn1Ownership, 'default-declared-for-this-element');
const localPlan = buildOwnershipConversion({ ...base, text: defaultText, groupKey: 'clsn1', slots: [0] }), returnedText = apply(defaultText, localPlan), returnedFrame = parseAir(returnedText)[0].frames[0];
assert.strictEqual(localPlan.direction, 'default-to-local');
assert.strictEqual(returnedFrame.clsn1Ownership, 'element');

const inherited = '[Begin Action 100]\nClsn2Default: 1\nClsn2[0] = -8,-18,8,18\n100,0,0,0,1\n100,1,0,0,1\n', inheritedPlan = buildOwnershipConversion({ ...base, text: inherited, elementIndex: 1, groupKey: 'clsn2', slots: [0] }), inheritedText = apply(inherited, inheritedPlan), inheritedFrame = parseAir(inheritedText)[0].frames[1];
assert.strictEqual(inheritedPlan.direction, 'default-to-local');
assert.strictEqual(inheritedFrame.clsn2Ownership, 'element');
assert.deepStrictEqual(inheritedFrame.clsn2, [[-8, -18, 8, 18]]);

console.log('AIR collision conversion plans preserve exact box geometry and reviewed ownership changes');
