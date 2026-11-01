'use strict';

const assert = require('assert');
const { analyzeSffTransferConflicts } = require('../src/sff_transfer_conflict_model');

const colors = value => Array.from({ length: 256 }, (_, index) => [value, index, 255 - index, index ? 255 : 0]);
const source = { palettes: [{ index: 0, group: 1, number: 1, link: 0, colorsRgba: colors(10) }, { index: 1, group: 1, number: 2, link: 0, colorsRgba: colors(20) }], sprites: [
  { index: 0, group: 0, number: 0, dataSize: 8, link: 0, format: 10, colorDepth: 8, paletteIndex: 0 },
  { index: 1, group: 0, number: 1, dataSize: 0, link: 0, format: 10, colorDepth: 8, paletteIndex: 0 },
  { index: 2, group: 5, number: 0, dataSize: 8, link: 0, format: 10, colorDepth: 8, paletteIndex: 1 },
  { index: 3, group: 6, number: 0, dataSize: 8, link: 0, format: 11, colorDepth: 32, paletteIndex: 0 }
] };
const destination = { palettes: [{ index: 0, group: 1, number: 1, link: 0, colorsRgba: colors(10) }], sprites: [{ index: 0, group: 0, number: 1 }, { index: 1, group: 9, number: 9 }] };
const item = physicalIndex => ({ id: `${source.sprites[physicalIndex].group},${source.sprites[physicalIndex].number}@${physicalIndex}`, physicalIndex, identity: `${source.sprites[physicalIndex].group},${source.sprites[physicalIndex].number}` });
const seed = { schema: 'ikemaker.sff-transfer-assembly-seed', version: 1, authority: { requestIdentity: 'A'.repeat(64) }, reference: { identity: 'B'.repeat(64) }, sourceSelection: { physicalIndices: [1, 2, 3], items: [item(1), item(2), item(3)] }, destinationBoundary: { insertionPhysicalIndex: 1 }, placementRequired: false };
const analysis = analyzeSffTransferConflicts({ seed, sourceArchive: source, destinationArchive: destination });
assert.equal(analysis.items[0].collision.status, 'occupied');
assert.equal(analysis.items[0].link.status, 'target-not-selected'); assert.deepStrictEqual(analysis.items[0].link.choices, ['flatten-copy', 'skip']);
assert.equal(analysis.items[0].palette.status, 'compatible'); assert.equal(analysis.items[0].palette.compatibleDestinations[0].identity, '1,1');
assert.equal(analysis.items[1].palette.status, 'unmatched'); assert(analysis.items[1].palette.choices.includes('import-source-palette'));
assert.equal(analysis.items[2].palette.status, 'truecolor'); assert.equal(analysis.items[2].palette.decisionRequired, false);
assert.deepStrictEqual(analysis.unresolved, { placement: false, identity: 1, links: 1, palettes: 1 }); assert.equal(analysis.readyForApply, false);
assert.deepStrictEqual(analysis.effects, { filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false }); assert(Object.isFrozen(analysis.items[0].collision));
const copy = analyzeSffTransferConflicts({ seed: { ...seed, destinationBoundary: null, placementRequired: true, sourceSelection: { physicalIndices: [0, 3], items: [item(0), item(3)] } }, sourceArchive: source, destinationArchive: destination });
assert.equal(copy.unresolved.placement, true); assert.equal(copy.items[0].link.status, 'direct'); assert.equal(copy.items[0].palette.status, 'compatible');
console.log('SFF Transfer identity, linked-sprite, palette and placement conflict analysis passed');
