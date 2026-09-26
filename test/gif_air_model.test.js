'use strict';

const assert = require('assert');
const { cumulativeTiming, resampleTiming, timingAnalysis, gifActionBlock, actionRange, upsertGifAction } = require('../src/gif_air_model');

const block = gifActionBlock({ action: 200, group: 200, startIndex: 0, frameCount: 3, ticks: 1, sourceName: 'compilation.gif' });
assert.match(block, /200,2,0,0,1/);
assert.doesNotMatch(block, /GIF reference/);
const timed = gifActionBlock({ action: 201, group: 201, frameCount: 2, useGifTiming: true, delaysMs: [50, 100] });
assert.match(timed, /201,0,0,0,3 ; GIF reference 50 ms/);
assert.match(timed, /201,1,0,0,6 ; GIF reference 100 ms/);
assert.deepStrictEqual(cumulativeTiming([20, 20, 20]).map((item) => item.ticks), [1, 1, 2], 'cumulative quantization preserves the rounded total instead of independently rounding');
const fast = timingAnalysis([10, 10, 10, 10, 10, 10]);
assert.strictEqual(fast.fasterFrames, 6);
assert.strictEqual(resampleTiming([10, 10, 10, 10, 10, 10]).reduce((sum, item) => sum + item.ticks, 0), 4);
const resampled = gifActionBlock({ action: 202, group: 202, frameCount: 6, useGifTiming: true, resampleTo60: true, delaysMs: [10, 10, 10, 10, 10, 10] });
assert.match(resampled, /resampled to 60 Hz/);
assert.strictEqual(resampled.split(/\r?\n/).filter((line) => /^202,/.test(line)).length, 4);

const source = '[Begin Action 0]\n0,0,0,0,1\n\n[Begin Action 5]\n5,0,0,0,2\n';
assert.deepStrictEqual(actionRange(source, 0), { start: 0, end: 3 });
assert.throws(() => upsertGifAction(source, 5, block), /already exists/);
const replaced = upsertGifAction(source, 5, block, true);
assert.match(replaced, /\[Begin Action 200\]/);
assert.doesNotMatch(replaced, /5,0,0,0,2/);
assert.match(upsertGifAction(source, 10, block), /\[Begin Action 200\]/);

console.log('GIF-to-AIR model tests passed');
