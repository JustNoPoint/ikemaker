'use strict';
const assert = require('assert');
const preview = require('../src/helper_preview_model');

const plan = { position: [35, -55], projectile: { velocity: [4, 0], lifetime: 25 } };
assert.deepStrictEqual(preview.projectilePath(plan, 10), [
  { tick: 0, x: 35, y: -55 }, { tick: 10, x: 75, y: -55 }, { tick: 20, x: 115, y: -55 }, { tick: 25, x: 135, y: -55 }
]);
const action = { number: 1100, frames: [{ group: 1100, index: 0, x: 2, y: -3, time: 4, flags: '', clsn1: [[-4, -4, 4, 4]], clsn2: [] }] };
const archive = { sprites: [{ group: 1100, number: 0, width: 16, height: 12, axisX: 8, axisY: 6 }] };
const result = preview.projectilePreview(action, archive, plan, { images: false });
assert(result.available); assert.strictEqual(result.duration, 4); assert.strictEqual(result.frames[0].spriteKey, '1100,0'); assert.strictEqual(result.playbackDefault, 'stopped');
console.log('Helper projectile preview model tests passed');
