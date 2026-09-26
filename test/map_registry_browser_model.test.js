'use strict';

const assert = require('assert');
const { filterEntries, nextSegments, validPath, scopeTotals } = require('../src/map_registry_browser_model');

const entry = (name, path, scopes = ['assigned']) => ({ name, family: path.join('_'), ownership: 'Unknown', suggestedPath: path, scopeIds: scopes, notes: [], files: [`${name}.zss`] });
const entries = [
  entry('JNP_SF6_hit_region_high', ['JNP', 'SF6', 'hit', 'region']),
  entry('JNP_SF6_hit_region_low', ['JNP', 'SF6', 'hit', 'region']),
  entry('JNP_SF6_guard_region', ['JNP', 'SF6', 'guard'], ['template', 'available']),
  entry('Shared_value', ['Shared'], ['assigned', 'template', 'available'])
];

assert.strictEqual(filterEntries(entries, 'assigned', ['JNP']).length, 2, 'selecting a parent must immediately expose every descendant map');
assert.deepStrictEqual(nextSegments(entries, 'assigned', ['JNP']).map((item) => [item.segment, item.count, item.fewer]), [['SF6', 2, 0]]);
assert.deepStrictEqual(nextSegments(entries, 'assigned', ['JNP', 'SF6']).map((item) => [item.segment, item.count, item.fewer]), [['hit', 2, 0]]);
assert.strictEqual(filterEntries(entries, 'assigned', ['JNP'], 'low').length, 1, 'search must combine with scope and path');
assert.deepStrictEqual(validPath(entries, 'template', ['JNP', 'SF6', 'hit']), ['JNP', 'SF6'], 'scope changes fall back to the nearest valid ancestor');
assert.deepStrictEqual(scopeTotals(entries, [{ id: 'assigned' }, { id: 'template' }]).map((item) => item.mapCount), [3, 2]);

console.log('Map registry progressive scope, search, count and path fallback tests passed');
