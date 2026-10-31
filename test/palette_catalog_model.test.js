'use strict';
const assert = require('assert');
const catalog = require('../src/palette_catalog_model');
const colors = value => Array.from({ length: 256 }, (_, index) => [value, index, 0, index ? 255 : 0]);
assert.deepStrictEqual(catalog.filenameMetadata('1,12 - Midnight Blue.act'), { filename: '1,12 - Midnight Blue', name: 'Midnight Blue', requestedCoordinate: { group: 1, number: 12 }, numbered: true });
assert.deepStrictEqual(catalog.filenameMetadata('Keith custom palette.act'), { filename: 'Keith custom palette', name: 'Keith custom palette', requestedCoordinate: null, numbered: false }, 'number-free filenames remain useful metadata');
const entries = catalog.decoratePalettes([
  { physicalIndex: 0, group: 1, number: 1, colors: colors(1), spriteCount: 20, role: 'master' },
  { physicalIndex: 1, group: 2, number: 5, colors: colors(1), spriteCount: 0, role: 'alternate', linked: true },
  { physicalIndex: 2, group: 2, number: 8, colors: colors(2), spriteCount: 3, role: 'alternate' }
], { '1,1': { name: 'Default Ryu', aliases: ['P1'] }, '2,5': { name: 'Night' } });
assert.strictEqual(entries[0].comment, 'Default Ryu');
assert.strictEqual(catalog.duplicateClusters(entries).length, 1, 'duplicates are detected archive-wide across groups');
assert.deepStrictEqual(catalog.filter(entries, { query: 'p1' }).map(item => item.stableId), ['embedded:0']);
assert.deepStrictEqual(catalog.filter(entries, { group: 2, unused: true }).map(item => item.stableId), ['embedded:1']);
assert.deepStrictEqual(catalog.filter(entries, { duplicates: true }).map(item => item.stableId), ['embedded:0', 'embedded:1']);
assert.deepStrictEqual(catalog.sort(entries, 'usage').map(item => item.stableId), ['embedded:0', 'embedded:2', 'embedded:1']);
console.log('Palette catalog metadata, filtering, sorting, and archive-wide duplicate detection passed');
