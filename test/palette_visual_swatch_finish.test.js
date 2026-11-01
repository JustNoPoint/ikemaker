'use strict';
const assert = require('assert');
const finish = require('../src/palette_visual_swatch_finish');

const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]);
assert.deepStrictEqual(finish.darkestColor(colors, [0, 8, 3]), { index: 3, rgba: [3,3,3,255] });
assert.deepStrictEqual(finish.cornerPlacement({ canvas:{width:100,height:80}, block:{width:30,height:20}, margin:5, corner:'bottom-right' }), { corner:'bottom-right', x:65, y:55, canvas:{width:100,height:80} });
assert.deepStrictEqual(finish.cornerPlacement({ canvas:{width:20,height:20}, block:{width:30,height:40}, margin:5, corner:'top-right' }), { corner:'top-right', x:5, y:5, canvas:{width:40,height:50} });
assert.throws(() => finish.finishReview({ missingIndexes:[12], colors, usedIndexes:[3], canvas:{width:10,height:10}, block:{width:1,height:1} }), /Missing indexes: 12/);
const reviewed = finish.finishReview({ missingIndexes:[], colors, usedIndexes:[4,7], canvas:{width:100,height:80}, block:{width:30,height:20}, corner:'bottom-left' });
assert.strictEqual(reviewed.output, 'flat-indexed-png');
assert.strictEqual(reviewed.paletteEntryCount, 256);
assert.strictEqual(reviewed.labelColorIndex, 4);
assert.deepStrictEqual(reviewed.placement, { corner:'bottom-left', x:8, y:52, canvas:{width:100,height:80} });
console.log('Palette visual-swatch corner placement, automatic darkest label color, completeness gate, and flat indexed export review tests passed');
