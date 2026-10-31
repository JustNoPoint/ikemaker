'use strict';

const assert = require('assert');
const { snapshot, numbersForRequest, resolveScope, createWorkSet } = require('../src/air_batch_scope');

const text = '[Begin Action 0]\n0,0,0,0,1\n[Begin Action 200]\n0,0,0,0,1\n[Begin Action 201]\n0,0,0,0,1\n[Begin Action 5000]\n0,0,0,0,1';
const actions = [
  { number: 0, sourceOrder: 0, category: 'Standards' },
  { number: 200, sourceOrder: 1, category: 'Attacks' },
  { number: 201, sourceOrder: 2, category: 'Attacks' },
  { number: 5000, sourceOrder: 3, category: 'Custom' }
];
const snap = snapshot(text, actions, '/char/main.air');
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'current', currentAction: 200 }), [200]);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'marked', markedActions: [5000, 0] }), [0, 5000]);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'visible', visibleActions: [201, 200] }), [200, 201]);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'group', group: 'Attacks' }), [200, 201]);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'range', first: 199, last: 300 }), [200, 201]);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'all' }), [0, 200, 201, 5000]);
assert.throws(() => numbersForRequest(snap, { mode: 'range', first: 300, last: 200 }), /ordered first-to-last/);
assert.throws(() => numbersForRequest(snap, { mode: 'visible', visibleActions: [] }), /contains no animations/);
assert.throws(() => numbersForRequest(snap, { mode: 'all', fingerprint: 'STALE' }), /changed after this scope/);

const set = createWorkSet(snap, 'Normals', [201, 200]);
assert.deepStrictEqual(set.entryIds, ['200', '201']);
assert.deepStrictEqual(numbersForRequest(snap, { mode: 'work-set', workSetId: set.id }, [set]), [200, 201]);
const stale = { ...set, fingerprint: '0'.repeat(64) };
assert.throws(() => numbersForRequest(snap, { mode: 'work-set', workSetId: set.id }, [stale]), /older revision/);
const missing = { ...set, entryIds: ['200', '999'] };
assert.throws(() => numbersForRequest(snap, { mode: 'work-set', workSetId: set.id }, [missing]), /no longer present/);

const resolved = resolveScope(snap, { mode: 'group', group: 'Attacks' });
assert.strictEqual(resolved.assetKind, 'air-action');
assert.deepStrictEqual(resolved.identities, ['200', '201']);
assert.strictEqual(resolved.resolutionHash, resolveScope(snap, { mode: 'group', group: 'Attacks' }).resolutionHash);

const duplicate = snapshot(text, [{ number: 200, category: 'A' }, { number: 200, category: 'B' }]);
assert.throws(() => numbersForRequest(duplicate, { mode: 'all' }), /duplicate AIR action identities/);
assert.throws(() => createWorkSet(duplicate, 'Unsafe', [200]), /ambiguous duplicate/);

console.log('AIR batch scope tests passed');
