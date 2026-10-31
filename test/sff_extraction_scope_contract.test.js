'use strict';

const assert = require('assert');
const { createExtractionSnapshot, createNamedWorkSet, resolveExtractionScope } = require('../src/sff_extraction_scope_contract');
const bytes = Buffer.from('sealed fake archive');
const parse = buffer => ({ header: { version: [2,0,1,0] }, sprites: [
  { group: 3, number: 7, width: 2, height: 3, axisX: 1, axisY: 2, paletteIndex: 0, dataSize: 5, format: 10, colorDepth: 8, dataOffset: 1, headerOffset: 10 },
  { group: 3, number: 7, width: 2, height: 3, axisX: 4, axisY: 5, paletteIndex: 0, dataSize: 0, link: 0, format: 10, colorDepth: 8, dataOffset: 0, headerOffset: 20 },
  { group: 4, number: 1, width: 1, height: 1, axisX: 0, axisY: 0, paletteIndex: 1, dataSize: 4, format: 0, colorDepth: 8, dataOffset: 6, headerOffset: 30 }
] });
const snapshot = createExtractionSnapshot({ archiveBytes: bytes, resourceIdentity: 'hero.sff' }, { parse });
assert.notStrictEqual(snapshot.entries[0].entryId, snapshot.entries[1].entryId); assert.strictEqual(snapshot.entries[0].identity, snapshot.entries[1].identity);
const bound = { archiveByteHash: snapshot.archiveByteHash, snapshotHash: snapshot.snapshotHash };
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'marked', ...bound, physicalIndices: [2,0] }).physicalEntries.map(x => x.physicalIndex), [0,2]);
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'current', ...bound, physicalIndex: 1 }).physicalEntries.map(x => x.physicalIndex), [1]);
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'visible', ...bound, physicalIndices: [2] }).physicalEntries.map(x => x.physicalIndex), [2]);
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'group', group: 3 }).physicalEntries.map(x => x.physicalIndex), [0,1]);
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'range', ...bound, start: 1, end: 2 }).physicalEntries.map(x => x.physicalIndex), [1,2]);
assert.strictEqual(resolveExtractionScope(snapshot, { mode: 'all' }).physicalEntries.length, 3);
assert.throws(() => resolveExtractionScope(snapshot, { mode: 'current', ...bound, physicalIndex: 9 }), /missing physical/);
assert.throws(() => resolveExtractionScope(snapshot, { mode: 'visible', ...bound, physicalIndices: [] }), /empty/);
assert.throws(() => resolveExtractionScope(snapshot, { mode: 'marked', ...bound, archiveByteHash: 'a'.repeat(64), physicalIndices: [0] }), /stale/);
const workSet = createNamedWorkSet({ id: 'favorites', name: 'Favorites', physicalIndices: [1,0] }, snapshot);
assert.deepStrictEqual(resolveExtractionScope(snapshot, { mode: 'named-work-set', workSet }).physicalEntries.map(x => x.physicalIndex), [0,1]);
const tamperedWorkSet = JSON.parse(JSON.stringify(workSet)); tamperedWorkSet.rows[0].physicalIndex = 2;
assert.throws(() => resolveExtractionScope(snapshot, { mode: 'named-work-set', workSet: tamperedWorkSet }), /seal.*drifted/);
assert.throws(() => resolveExtractionScope(snapshot, { mode: 'named-work-set', workSet: { version: 2, identities: ['3,7'] } }), /v1/);
assert.throws(() => createExtractionSnapshot({ archiveBytes: 'not bytes', resourceIdentity: 'x' }, { parse }), /archiveBytes/);
console.log('SFF extraction scopes preserve exact physical occurrences and sealed archive identity');
