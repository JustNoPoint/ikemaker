'use strict';

const assert = require('assert');
const { planSequentialAddition, requireUnusedIdentity, planIdentityInsertion } = require('../src/sff_manifest_operations');

const plan = planSequentialAddition(['4,0', '4,3', '9,1'], 4, 1, 4);
assert.deepStrictEqual(plan.identities, ['4,1', '4,2', '4,3', '4,4']);
assert.deepStrictEqual(plan.collisions, ['4,3']);
assert.strictEqual(plan.end, 4);
assert.deepStrictEqual(requireUnusedIdentity(['4,1'], 4, 2), { group: 4, number: 2, identity: '4,2' });
assert.throws(() => requireUnusedIdentity(['4,2'], 4, 2), /already contains sprite 4,2/);
assert.throws(() => planSequentialAddition([], 4, 65535, 2), /beyond the SFF limit/);
assert.throws(() => planSequentialAddition([], 70000, 0, 1), /0 through 65535/);
assert.throws(() => planSequentialAddition([], 4, 0, 0), /at least one source/);

const imported = planIdentityInsertion(['1,0', '1,2'], ['1,1', '1,2', '3,4', '3,4']);
assert.deepStrictEqual(imported.identities, ['1,1', '1,2', '3,4', '3,4']);
assert.deepStrictEqual(imported.collisions, ['1,2']);
assert.deepStrictEqual(imported.duplicates, ['3,4']);
assert.throws(() => planIdentityInsertion([], []), /at least one identity/);
assert.throws(() => planIdentityInsertion([], ['70000,0']), /0 through 65535/);
assert.throws(() => planIdentityInsertion(['not-an-id'], ['1,0']), /must use group,index/);

console.log('Legacy SFF manifest add and duplicate planning rejects overflow and occupied destinations');
