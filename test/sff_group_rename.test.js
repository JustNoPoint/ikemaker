'use strict';

const assert = require('assert');
const { analyzeGroupRename } = require('../src/sff_group_rename');

const entries = [
  { group: 1, number: 0 }, { group: 1, number: 1 }, { group: 2, number: 1 }, { group: 2, number: 5 }, { group: 3, number: 9 }
];
const collision = analyzeGroupRename(entries, 1, 2);
assert.deepStrictEqual(collision.affected.map(item => item.physicalIndex), [0, 1]);
assert.deepStrictEqual(collision.destination.map(item => item.physicalIndex), [2, 3]);
assert.deepStrictEqual(collision.collisions, [{ number: 1, sourcePhysicalIndices: [1], destinationPhysicalIndices: [2] }]);
const disjoint = analyzeGroupRename(entries, 1, 3);
assert.strictEqual(disjoint.destination.length, 1);
assert.strictEqual(disjoint.collisions.length, 0);
assert.strictEqual(analyzeGroupRename(entries, 9, 4).affected.length, 0);
assert.throws(() => analyzeGroupRename(entries, -1, 2), /0 through 65535/);
assert.throws(() => analyzeGroupRename(entries, 1, 70000), /0 through 65535/);

console.log('SFF group rename distinguishes safe disjoint merges from identity collisions');
