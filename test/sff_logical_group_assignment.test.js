'use strict';

const assert = require('assert');
const { planLogicalGroupAssignment, applyLogicalGroupAssignment } = require('../src/sff_logical_group_assignment');

const sources = [
  { id: 'a', name: 'idle-1.png', byteHash: 'aa' },
  { id: 'b', name: 'idle-2.png', byteHash: 'bb' },
  { id: 'c', name: 'other.png', byteHash: 'cc' }
];
const overrides = { c: { group: 10, number: 2 } };
const plan = planLogicalGroupAssignment({ sources, overrides, selectedIds: ['b', 'a'], targetGroup: 10, targetIndex: 1, existingIdentities: ['10,9'], reservedRanges: [{ group: 10, start: 1, end: 1, label: 'portrait contract' }], airReferences: { '10,2': ['hero.air:12'] }, paletteBySource: { a: '1,1', b: '1,2' } });
assert.deepStrictEqual(plan.rows.map(row => row.sourceId), ['a', 'b'], 'assignment follows authoritative staged source order rather than selection click order');
assert.deepStrictEqual(plan.rows.map(row => row.target), ['10,1', '10,2']);
assert.strictEqual(plan.blocked, true, 'reserved and occupied destinations require explicit review');
assert.deepStrictEqual(plan.review.collisions, ['10,2']);
assert.deepStrictEqual(plan.review.reserved, [{ identity: '10,1', label: 'portrait contract' }]);
assert.deepStrictEqual(plan.review.airReferences, [{ identity: '10,2', references: ['hero.air:12'] }]);
assert.strictEqual(plan.review.mixedPalettes, true, 'mixed effective palettes remain visible in review');
assert.throws(() => applyLogicalGroupAssignment({ plan, sources, overrides }), /review must be accepted/);
const applied = applyLogicalGroupAssignment({ plan, sources, overrides, acceptReviewedRisks: true });
assert.deepStrictEqual(applied.overrides.a, { group: 10, number: 1 });
assert.deepStrictEqual(applied.overrides.b, { group: 10, number: 2 });
assert.deepStrictEqual(applied.overrides.c, { group: 10, number: 2 }, 'applying the plan changes draft overrides only and preserves unrelated rows');
assert.throws(() => applyLogicalGroupAssignment({ plan, sources: sources.map(source => source.id === 'a' ? { ...source, byteHash: 'changed' } : source), overrides, acceptReviewedRisks: true }), /changed; review/);
assert.deepStrictEqual(overrides, { c: { group: 10, number: 2 } }, 'planning and applying never mutate the caller draft');

const safe = planLogicalGroupAssignment({ sources, overrides: {}, selectedIds: ['a', 'b'], targetGroup: 20, targetIndex: 0 });
assert.strictEqual(safe.blocked, false);
assert.deepStrictEqual(applyLogicalGroupAssignment({ plan: safe, sources, overrides: {} }).assignmentReceipt.assigned, [{ sourceId: 'a', identity: '20,0' }, { sourceId: 'b', identity: '20,1' }]);

console.log('SFF logical group assignment is draft-only, reviewable, and stale-safe.');
