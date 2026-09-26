'use strict';

const assert = require('assert');
const { analyzeParallax, sampleParallax } = require('../src/parallax_assistant');

const model = { localCoord: [320, 240], camera: { bounds: [-100, 100], start: [0, 0], zoom: [1, 0.75, 1], zoomAnchor: 'bottom' } };
const base = { type: 'parallax', start: [0, 200], delta: [1, 1], scaleStart: [1, 1], width: [320, 640], xscale: null, tile: [0, 0], autoResizeParallax: false };
const sprite = { width: 320, axisX: 160 };
const centered = sampleParallax(model, base, sprite, 0, 1);
assert.ok(centered.covered);
const analysis = analyzeParallax(model, base, sprite);
assert.strictEqual(analysis.shape.mode, 'width');
assert.strictEqual(analysis.samples.length, 6);
assert.ok(['covered', 'review'].includes(analysis.coverage));
const narrow = analyzeParallax(model, { ...base, width: [100, 100] }, sprite);
assert.ok(narrow.failing > 0);
const tiled = analyzeParallax(model, { ...base, width: [100, 100], tile: [1, 0] }, sprite);
assert.strictEqual(tiled.coverage, 'tiled');
console.log('Parallax assistant tests passed');
