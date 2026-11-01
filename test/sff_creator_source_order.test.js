'use strict';

const assert = require('assert');
const { normalizeMarkedIds, moveSourceBlock } = require('../src/sff_creator_source_order');

const rows = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
const ids = result => result.sources.map(row => row.id);

assert.deepStrictEqual([...normalizeMarkedIds(rows, new Set(['b', 'd']), 'c')], ['c'], 'dragging an unmarked card moves only that card');
assert.deepStrictEqual([...normalizeMarkedIds(rows, new Set(['b', 'd']), 'b')], ['b', 'd'], 'dragging a marked card retains the complete marked set');
assert.deepStrictEqual(ids(moveSourceBlock(rows, new Set(['b', 'd']), 'b', 'e', 'before')), ['a', 'c', 'b', 'd', 'e'], 'non-contiguous marked sources move as one stable block');
assert.deepStrictEqual(ids(moveSourceBlock(rows, new Set(['b', 'c']), 'b', 'e', 'after')), ['a', 'd', 'e', 'b', 'c'], 'after placement inserts beyond the target');
assert.strictEqual(moveSourceBlock(rows, new Set(['b', 'c']), 'b', 'c', 'before').changed, false, 'a marked target cannot become its own insertion point');
assert.deepStrictEqual(ids(moveSourceBlock(rows, new Set(), 'd', 'a', 'before')), ['d', 'a', 'b', 'c', 'e'], 'an unmarked dragged source moves independently');
assert.deepStrictEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd', 'e'], 'the source draft input is never mutated');

console.log('SFF Creator source ordering keeps multi-selection stable and draft-only.');
