'use strict';

const assert = require('assert');
const { rgbaPng } = require('../src/sff_reader');
const { alphaMaskFromPng } = require('../src/image_alpha_mask');
const { analyzeMask, anchorSuggestion, referenceSuggestion, consensusSuggestion } = require('../src/sff_auto_axis_model');

function mask(width, height, points) { const value = new Uint8Array(width * height); for (const [x, y] of points) value[y * width + x] = 1; return { width, height, mask: value }; }
function rectangle(left, top, right, bottom) { const points = []; for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) points.push([x, y]); return points; }

const reference = mask(12, 12, rectangle(2, 3, 4, 7));
const target = mask(12, 12, rectangle(4, 4, 6, 8));
const anchored = anchorSuggestion(target, 'bottom-center');
assert.deepStrictEqual([anchored.axisX, anchored.axisY], [5, 9]);
assert.strictEqual(anchored.confidenceLabel, 'review');

const matched = referenceSuggestion(target, reference, { axisX: 3, axisY: 8 }, { maxOffset: 8 });
assert.deepStrictEqual([matched.axisX, matched.axisY], [5, 9]);
assert(matched.confidence > 0.5);
assert(Number.isFinite(matched.evidence.runnerUpMargin));

const consensus = consensusSuggestion(target, [
  { image: reference, axisX: 3, axisY: 8 },
  { image: reference, axisX: 3, axisY: 8 },
  { image: reference, axisX: 30, axisY: 30 }
], { maxOffset: 16 });
assert.deepStrictEqual([consensus.axisX, consensus.axisY], [5, 9], 'weighted median must reject one outlying trusted reference');
assert.throws(() => analyzeMask(mask(4, 4, [])), /fully transparent/);

const rgba = Buffer.alloc(4 * 3 * 4);
for (const [x, y] of [[1, 1], [2, 1], [2, 2]]) rgba[(y * 4 + x) * 4 + 3] = 255;
const decoded = alphaMaskFromPng(rgbaPng(4, 3, rgba));
assert.deepStrictEqual(analyzeMask(decoded).bounds, { left: 1, top: 1, right: 2, bottom: 2, width: 2, height: 2 });

console.log('SFF automatic axis analysis tests passed.');
