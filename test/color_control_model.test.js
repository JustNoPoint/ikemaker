'use strict';

const assert = require('assert');
const color = require('../src/color_control_model');

assert.strictEqual(color.clampByte(-4), 0);
assert.strictEqual(color.clampByte(12.6), 13);
assert.strictEqual(color.clampByte(999), 255);
assert.deepStrictEqual(color.normalizeRgba({ r: -3, g: 12.6, b: 999 }), { r: 0, g: 13, b: 255, a: 255 });

assert.deepStrictEqual(color.parseHex('#123456'), { r: 18, g: 52, b: 86, a: 255 });
assert.deepStrictEqual(color.parseHex('12345678'), { r: 18, g: 52, b: 86, a: 120 });
assert.deepStrictEqual(color.parseHex('#0f8'), { r: 0, g: 255, b: 136, a: 255 });
assert.deepStrictEqual(color.parseHex('#0f8c'), { r: 0, g: 255, b: 136, a: 204 });
assert.strictEqual(color.parseHex('#xyz'), null);
assert.strictEqual(color.formatHex({ r: 18, g: 52, b: 86, a: 255 }), '#123456');
assert.strictEqual(color.formatHex({ r: 18, g: 52, b: 86, a: 120 }), '#12345678');
assert.strictEqual(color.formatHex({ r: 18, g: 52, b: 86 }, { alpha: 'always', prefix: false, uppercase: false }), '123456ff');

const samples = [
  { r: 255, g: 0, b: 0, a: 77 },
  { r: 12, g: 180, b: 240, a: 255 },
  { r: 31, g: 31, b: 31, a: 9 },
  { r: 250, g: 200, b: 3, a: 128 }
];
for (const sample of samples) {
  assert.deepStrictEqual(color.hslToRgb(color.rgbToHsl(sample)), sample, `HSL round trip for ${JSON.stringify(sample)}`);
  assert.deepStrictEqual(color.hsvToRgb(color.rgbToHsv(sample)), sample, `HSV round trip for ${JSON.stringify(sample)}`);
}

assert.deepStrictEqual(
  color.hsvToRgb({ h: 120, s: 100, v: 100, a: 0 }, { preserveAlpha: true, current: { r: 1, g: 2, b: 3, a: 91 } }),
  { r: 0, g: 255, b: 0, a: 91 }
);
assert.deepStrictEqual(color.updateRgba({ r: 1, g: 2, b: 3, a: 40 }, { r: 300, a: 9 }), { r: 255, g: 2, b: 3, a: 40 });
assert.deepStrictEqual(color.updateRgba({ r: 1, g: 2, b: 3, a: 40 }, { a: 9 }, { preserveAlpha: false }), { r: 1, g: 2, b: 3, a: 9 });

assert.strictEqual(color.wheelDeltaToStep(-120), 1);
assert.strictEqual(color.wheelDeltaToStep(120), -1);
assert.strictEqual(color.wheelDeltaToStep(-1, true), 10);
assert.strictEqual(color.wheelDeltaToStep(1, true), -10);
assert.strictEqual(color.wheelDeltaToStep(0, true), 0);
assert.deepStrictEqual(color.adjustChannelFromWheel({ r: 250, g: 2, b: 3, a: 50 }, 'r', -1, { shiftKey: true }), { r: 255, g: 2, b: 3, a: 50 });
assert.deepStrictEqual(color.adjustChannelFromWheel({ r: 1, g: 2, b: 3, a: 50 }, 'a', -1, { shiftKey: true, preserveAlpha: true }), { r: 1, g: 2, b: 3, a: 50 });
assert.throws(() => color.adjustChannel({ r: 0, g: 0, b: 0 }, 'x', 1), /Unsupported color channel/);

assert.deepStrictEqual(color.saturationValueFromPoint(0, 0, 200, 100), { s: 0, v: 100 });
assert.deepStrictEqual(color.saturationValueFromPoint(100, 50, 200, 100), { s: 50, v: 50 });
assert.deepStrictEqual(color.saturationValueFromPoint(300, 200, 200, 100), { s: 100, v: 0 });
assert.strictEqual(color.hueFromVerticalPoint(0, 120), 0);
assert.strictEqual(color.hueFromVerticalPoint(60, 120), 180);
assert.strictEqual(color.hueFromVerticalPoint(120, 120), 0);

assert(color.cssChannelGradient('r', { r: 4, g: 5, b: 6, a: 255 }).includes('linear-gradient'));
assert(color.cssChannelGradient('h', {}).includes('#FF00FF'));

console.log('Shared exact color-control model tests passed');
