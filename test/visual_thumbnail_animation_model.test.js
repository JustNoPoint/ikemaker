'use strict';

const assert = require('assert');
const { DEFAULT_LIMITS, frameDuration, planThumbnailAnimations, hydrateThumbnailAnimations, projectRowAnimations } = require('../src/visual_thumbnail_animation_model');

const actions = {
  10: { frames: [
    { sprite: [0, 0], time: -1 },
    { sprite: [0, 1], time: 0 },
    { sprite: [0, 2], time: 1 },
    { sprite: [0, 3], time: 999999 },
    { sprite: [0, 4], time: 2 }
  ] },
  11: { frames: [{ sprite: [1, 0], time: 3 }, { sprite: [1, 1], time: 3 }] }
};

assert.strictEqual(frameDuration(-1, DEFAULT_LIMITS), null, 'infinite AIR frames never become a stuck thumbnail');
assert.strictEqual(frameDuration(0, DEFAULT_LIMITS), null, 'zero-time AIR frames are skipped');
assert.strictEqual(frameDuration(1, DEFAULT_LIMITS), 50, 'short frames are clamped to a visible bounded interval');
assert.strictEqual(frameDuration(999999, DEFAULT_LIMITS), 2000, 'long frames are bounded');

const plan = planThumbnailAnimations(actions, [10, 10, 11], { framesPerAction: 3, totalFrames: 4 });
assert.deepStrictEqual(plan.spriteKeys, ['0,2', '0,3', '0,4', '1,0']);
assert.strictEqual(plan.animations['10'].frames.length, 3);
assert.strictEqual(plan.animations['10'].truncated, false);
assert.strictEqual(plan.animations['11'], undefined, 'a clipped one-frame result is not falsely advertised as animated');

const hydrated = hydrateThumbnailAnimations(plan, { '0,2':'data:image/png;base64,AA==', '0,3':'data:image/png;base64,AA==', '0,4':'data:image/png;base64,AA==' });
assert.strictEqual(hydrated['10'].frames.length, 3);
const projected = projectRowAnimations([{ id:'row-a', ordinal:0 }, { id:'row-b', ordinal:1 }], [10, 11], hydrated);
assert.deepStrictEqual(Object.keys(projected), ['row-a']);

const capped = planThumbnailAnimations({ 1: { frames: Array.from({ length: 10 }, (_, index) => ({ sprite:[2,index], time:1 })) } }, [1], { framesPerAction:2, totalFrames:2 });
assert.strictEqual(capped.animations['1'].frames.length, 2);
assert.strictEqual(capped.animations['1'].truncated, true);
console.log('Bounded visual thumbnail animation planning, timing and hydration tests passed');
