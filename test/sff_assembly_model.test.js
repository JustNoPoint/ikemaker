'use strict';

const assert = require('assert');
const { selectedSprites, buildAssembly } = require('../src/sff_assembly_model');

const base = { sprites: [
  { index: 0, group: 0, number: 0, axisX: 1, axisY: 2 },
  { index: 1, group: 200, number: 0, axisX: 10, axisY: 20 }
] };
const source = { sprites: [
  { index: 0, group: 900, number: 0, axisX: 30, axisY: 40 },
  { index: 1, group: 900, number: 1, axisX: 31, axisY: 41 }
] };

assert.strictEqual(selectedSprites(source, { groups: [900] }).length, 2);
const appended = buildAssembly(base, source, [{ selection: { groups: [900] }, targetGroup: 200, mode: 'append' }]);
assert.deepStrictEqual(appended.changes.map((item) => item.identity), ['200,1', '200,2']);
assert.strictEqual(appended.rows.length, 4);

const collided = buildAssembly(base, source, [{ selection: { indices: [0] }, targetGroup: 200, mode: 'original' }]);
assert.strictEqual(collided.conflicts.length, 1);
assert.strictEqual(collided.rows.length, 2, 'a collision must not silently overwrite');

const replaced = buildAssembly(base, source, [{ selection: { indices: [0] }, targetGroup: 200, mode: 'replace', preserveDestinationAxis: true }]);
assert.strictEqual(replaced.conflicts.length, 0);
assert.strictEqual(replaced.rows.find((row) => row.group === 200).archive, 'source');
assert.strictEqual(replaced.rows.find((row) => row.group === 200).axisX, 10);

console.log('sff_assembly_model tests passed');
