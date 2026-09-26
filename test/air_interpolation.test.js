'use strict';
const assert = require('assert');
const { parseAir } = require('../src/air_preview_model');
const visual = require('../src/air_visual'), playback = require('../src/air_playback');
const action = parseAir('[Begin Action 1]\nInterpolate Angle\n0,0,0,0,10,,,1,1,0\nInterpolate Offset\nInterpolate Scale\nInterpolate Angle\n0,0,100,-20,10,,,3,.5,180\n')[0];
const half = visual.sample(action, 0, 5);
assert.deepStrictEqual([half.x, half.y, half.scaleX, half.scaleY, half.angle], [50, -10, 2, .75, 90]);
assert.deepStrictEqual(action.frames[0].interpolate, ['angle'], 'directives before first frame apply to wraparound');
assert.strictEqual(visual.sample(action, 1, 5).angle, 90);
assert.strictEqual(visual.sample(action, 1, 5).x, 100, 'offset does not interpolate without a directive on the next frame');
assert.strictEqual(visual.sample(action, 0, 5.9).angle, 90, 'rendering follows integer game ticks');
assert.deepStrictEqual(playback.locate(action, 25), { index: 0, elapsed: 5 });
assert.deepStrictEqual(playback.locate(action, 15), { index: 1, elapsed: 5 });
const held = parseAir('[Begin Action 1]\nInterpolate Offset\n0,0,10,20,-1')[0];
assert.strictEqual(visual.sample(held, 0, 10000).x, 10);
const flipped = parseAir('[Begin Action 1]\n0,0,10,0,10,H\nInterpolate Offset\n0,0,20,0,10')[0];
assert.strictEqual(visual.sample(flipped, 0, 5).x, -5, 'AIR offset interpolation observes the encoded flip directions');

const sprite = { width: 20, height: 100, axisX: 10, axisY: 100 };
const bounds = visual.motionCorners(sprite, action, 0);
const left = Math.min(...bounds.map(p => p[0])), right = Math.max(...bounds.map(p => p[0]));
const top = Math.min(...bounds.map(p => p[1])), bottom = Math.max(...bounds.map(p => p[1]));
for (let tick = 0; tick <= 10; tick++) for (const [x,y] of visual.corners(sprite, visual.sample(action, 0, tick))) {
  assert(x >= left && x <= right && y >= top && y <= bottom, 'intermediate rotation must fit the comparison bounds');
}
let now = 0;
const clock = playback.createClock(() => now);
clock.sync(action, 0, true); now = 100; clock.sync(action, 0, false);
assert.strictEqual(clock.elapsed(), 6);
now = 1000; assert.strictEqual(clock.elapsed(), 6, 'paused time does not advance interpolation');
clock.sync(action, 0, true); now = 1050; assert.strictEqual(clock.elapsed(), 9);
clock.sync(action, 1, true); assert.strictEqual(clock.elapsed(), 0);
now = 1100; clock.sync(action, 1, true, true); assert.strictEqual(clock.elapsed(), 0, 'same-frame loops reset their clock');
console.log('AIR interpolation sampling, loop targets, motion bounds and pause/resume clock passed');
