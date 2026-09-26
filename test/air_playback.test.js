'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const playback = require('../src/air_playback');
const action = (times, loopStart = 0) => ({ loopStart, frames: times.map(rawTime => ({ rawTime })) });

const held = action([0, 2, 0, -1]);
assert.deepStrictEqual([0, 1, 2, 100000].map(t => playback.frameAt(held, t)), [1, 1, 3, 3]);
assert.deepStrictEqual(playback.step(held, 0), { index: 1, duration: 2, nextIndex: 2 });
assert.strictEqual(playback.step(held, 2).duration, Infinity);
assert.deepStrictEqual([0, 2, 5, 8, 9, 12].map(t => playback.frameAt(action([2, 3, 4], 1), t)), [0, 1, 2, 2, 1, 2]);
assert.strictEqual(playback.frameAt(action([2, -1, 4]), 2), 2, 'only a final -1 is an indefinite hold');
assert.strictEqual(playback.frameAt(action([2, -2, 4]), 2), 2, 'other negative durations do not become infinite holds');
assert.strictEqual(playback.frameAt(action([2, 4]), Infinity), 0);
assert.strictEqual(playback.frameAt(action([]), 0), -1);
assert.deepStrictEqual(playback.step(action([0, 0], 1), 0), { index: 1, duration: Infinity, nextIndex: 1 });

// Execute the actual viewer scheduler with a controlled clock, rather than a
// duplicate implementation. This verifies that it consumes the shared model.
const source = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8');
const start = source.indexOf('function schedule(){');
const scheduler = source.slice(start, source.indexOf('function proofColor()', start));
let nextTimer = 0, renders = 0;
const timers = new Map();
const context = {
  playing: true, action: held, frameIndex: 0, timer: null, airPlayback: playback, visualClock: playback.createClock(() => 0),
  renderStrip() { renders++; }, requestFrame() {}, requestAnimationFrame() {},
  setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
  clearTimeout(id) { timers.delete(id); }
};
vm.runInNewContext(scheduler, context);
context.schedule();
assert.strictEqual(context.frameIndex, 1, 'Play skips the initial zero-duration frame');
assert.strictEqual(timers.size, 1);
const [id, pending] = [...timers][0];
assert.strictEqual(pending.delay, 2 * 1000 / 60);
timers.delete(id); pending.fn();
assert.strictEqual(context.frameIndex, 3, 'the timer skips the next zero frame and reaches the hold');
assert.strictEqual(timers.size, 0, 'an indefinite hold schedules no more work');
assert(renders > 0);
context.action = action([0, 0, 0], 1); context.frameIndex = 0;
context.schedule();
assert.strictEqual(context.frameIndex, 2);
assert.strictEqual(timers.size, 0, 'all-zero loops cannot spin timers');
context.action = action([2, 0, 3], 1); context.frameIndex = 2;
context.schedule();
const [loopId, loopTimer] = [...timers][0]; timers.delete(loopId); loopTimer.fn();
assert.strictEqual(context.frameIndex, 2, 'looping skips zero-duration loop entry');
assert.strictEqual(timers.size, 1);
context.playing = false; context.schedule();
assert.strictEqual(timers.size, 0, 'Pause cancels the outstanding timer');

const comparison = require('../src/viewer_animation_comparison');
assert.strictEqual(comparison.frameAt, playback.frameAt, 'both surfaces use the shared timing function');
console.log('Shared AIR timing and actual viewer scheduler: zero frames, final holds, loops and pause passed');
