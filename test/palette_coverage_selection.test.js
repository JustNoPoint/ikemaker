'use strict';

const assert = require('assert');
const path = require('path');
const { buildCollective, encodeRgbaPng, selectCoverageImages } = require('../src/palette_collective_model');

const rgba = colors => Buffer.from(colors.flat());
const png = (name, colors, width = colors.length) => ({
  filename: path.resolve(name),
  buffer: encodeRgbaPng(width, colors.length / width, rgba(colors))
});

const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255], white = [255, 255, 255, 255];
const collective = buildCollective([
  png('large-red-green.png', [red, green, red, green], 2),
  png('small-red-green.png', [red, green], 2),
  png('blue.png', [blue]),
  png('white-blue.png', [white, blue], 2)
]);

const automatic = selectCoverageImages(collective);
assert(automatic.complete);
assert.deepStrictEqual(automatic.selectedImageIds, [collective.images[3].imageId, collective.images[0].imageId], 'compact coverage ties favor stronger visible representation before canvas area');
assert.deepStrictEqual(automatic.rows.map(row => row.contributionCount), [2, 2]);
assert.strictEqual(selectCoverageImages(collective).selectionHash, automatic.selectionHash, 'the same exact inventory produces the same sealed selection');

const ignored = selectCoverageImages(collective, { ignoredColorIds: ['255,255,255,255'] });
assert(ignored.complete);
assert.deepStrictEqual(ignored.selectedImageIds, [collective.images[0].imageId, collective.images[2].imageId], 'ignored colors do not force an otherwise unnecessary representative image');

const pinned = selectCoverageImages(collective, { pinnedImageIds: [collective.images[0].imageId] });
assert.strictEqual(pinned.rows[0].reason, 'manual-showcase');
assert.deepStrictEqual(pinned.rows[0].contributionColorIds, ['255,0,0,255', '0,255,0,255']);
assert.deepStrictEqual(pinned.selectedImageIds, [collective.images[0].imageId, collective.images[3].imageId]);
const redundantShowcase = selectCoverageImages(collective, { showcaseImageIds: [collective.images[1].imageId, collective.images[0].imageId] });
assert.deepStrictEqual(redundantShowcase.selectedImageIds.slice(0,2), [collective.images[1].imageId, collective.images[0].imageId]);
assert.strictEqual(redundantShowcase.rows[1].contributionCount, 0, 'a manually chosen showcase remains selected even when earlier choices already cover all of its colors');
assert.strictEqual(redundantShowcase.rows[1].reason, 'manual-showcase');

const missing = selectCoverageImages(collective, { excludedImageIds: [collective.images[2].imageId, collective.images[3].imageId] });
assert.strictEqual(missing.complete, false);
assert.deepStrictEqual(missing.missingColorIds, ['0,0,255,255', '255,255,255,255'], 'ineligible source gaps remain explicit instead of being silently dropped');

assert.throws(() => selectCoverageImages(collective, { requiredColorIds: ['1,2,3,4'] }), /outside the exact collective/);
assert.throws(() => selectCoverageImages(collective, { pinnedImageIds: ['missing'] }), /outside the exact collective/);

const rareEarly = buildCollective([
  png('rare-one-pixel.png', [white, red, red, red], 4),
  png('rare-many-pixels.png', [white, white, white, white, white, red], 3)
]);
const rareChoice = selectCoverageImages(rareEarly);
assert.deepStrictEqual(rareChoice.selectedImageIds, [rareEarly.images[1].imageId], 'a later sprite with a meaningful rare-color sample wins over an early one-pixel occurrence while covering the same colors');
assert.strictEqual(rareChoice.rows[0].contributions.find(item => item.colorId === '255,255,255,255').pixelCount, 5);

const multi = buildCollective([
  png('red-only.png', [red, red]),
  png('green-only.png', [green, green]),
  png('blue-only.png', [blue, blue]),
  png('representative.png', [red, green, blue], 3)
]);
assert.deepStrictEqual(selectCoverageImages(multi).selectedImageIds, [multi.images[3].imageId], 'new-color count remains the primary criterion so one useful multi-color representative beats one image per color');

const contexts = Object.fromEntries(multi.images.map((image, index) => [image.imageId, { sourceKind:'sff-sprite', group:index < 2 ? 10 : 20, number:index, physicalIndex:index, paletteId:index===3?'2,1':'1,1' }]));
const rejected = selectCoverageImages(multi, { imageContexts:contexts, rejectedImageIds:[multi.images[0].imageId], rejectedGroupIds:[20] });
assert.strictEqual(rejected.complete, false);
assert.deepStrictEqual(rejected.eligibleImageIds, [multi.images[1].imageId]);
assert.deepStrictEqual(rejected.rejections.map(item=>item.reason), ['image','group','group']);
const crossPalette = selectCoverageImages(multi, { imageContexts:contexts, targetPaletteId:'1,1' });
assert.strictEqual(crossPalette.requiresPaletteExpansionReview, true);
assert.strictEqual(crossPalette.rows[0].paletteRelationship, 'reviewed-expansion-candidate');
assert.strictEqual(crossPalette.rows[0].context.paletteId, '2,1', 'a useful sprite from another palette retains its source palette identity');
assert.strictEqual(selectCoverageImages(multi, { imageContexts:contexts, targetPaletteId:'1,1' }).selectionHash, crossPalette.selectionHash, 'context-aware cross-palette review remains deterministic');

console.log('Palette template deterministic coverage selection tests passed');
