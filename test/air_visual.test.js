'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { parseAir } = require('../src/air_preview_model');
const visual = require('../src/air_visual');
const comparison = require('../src/viewer_animation_comparison');
const parsed = parseAir('[Begin Action 7]\nInterpolate Angle\n0,0,10,20,4,H,AS128D128,2,.5,90\nInterpolate Scale\nInterpolate Offset\n0,0,30,40,-1,,,0,-2,-45\n')[0];
assert.deepStrictEqual(parsed.frames[0].interpolate, ['angle']);
assert.deepStrictEqual(parsed.frames[1].interpolate, ['scale', 'offset']);
assert.strictEqual(parsed.frames[0].blend, 'AS128D128');
assert.strictEqual(parsed.frames[1].scaleX, 0, 'zero scale must remain zero');
assert.strictEqual(parsed.frames[1].scaleY, -2);
const defaults = parseAir('[Begin Action 0]\n0,0,0,0,1\n0,0,0,0,1,,,,,\n')[0];
for (const frame of defaults.frames) assert.deepStrictEqual([frame.scaleX, frame.scaleY, frame.angle], [1, 1, 0]);
function close(actual, expected) { actual.forEach((value, index) => assert(Math.abs(value - expected[index]) < 1e-9, `${actual} != ${expected}`)); }
close(visual.transform({ x: 10, y: 20, flags: '', scaleX: 2, scaleY: .5, angle: 90 }), [0, -2, .5, 0, 10, 20]);
close(visual.transform(parsed.frames[0]), [0, 2, .5, 0, 10, 20]);
const sprite = { group: 0, number: 0, width: 4, height: 6, axisX: 1, axisY: 2 };
const rotated = { x: 10, y: 20, flags: '', scaleX: 2, scaleY: .5, angle: 90 };
const points = visual.corners(sprite, rotated);
close(points[0], [9, 22]); close(points[3], [12, 14]);
const model = comparison.build('[Begin Action 7]\n0,0,10,20,4,,AS128D128,2,.5,90', 7, { sprites: [sprite] }, () => 'data:image/png;base64,AA==');
assert.strictEqual(model.frames[0].angle, 90);
assert.strictEqual(model.frames[0].blend, 'AS128D128');
const box = comparison.bounds(model); close([box.left, box.right, box.top, box.bottom], [0, 12, 0, 22]);
const missing = comparison.build('[Begin Action 7]\nClsn1:1\nClsn1[0]=-200,-300,400,500\n9,9,0,0,1', 7, { sprites: [] }, () => '');
assert.deepStrictEqual(comparison.bounds(missing), { left: -200, right: 400, top: -300, bottom: 500 }, 'missing artwork must not clip its collision overlay');

// Both actual drawing paths must call the shared transform; the main viewer
// adds only its viewport translation/zoom around it.
const calls = [];
const ctx = Object.fromEntries(['save','restore','translate','scale','transform','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
const source = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8');
const start = source.indexOf('function drawSprite(entry,f){');
const draw = source.slice(start, source.indexOf('function drawBoxes(', start));
const context = { ctx, canvas: { width: 400, height: 300 }, panX: 3, panY: 4, zoom: 2, airVisual: visual };
vm.runInNewContext(draw, context);
context.drawSprite({ image: 'test image', sprite }, rotated);
assert.deepStrictEqual(calls[1], ['translate', 203, 154]);
close(calls.find(call => call[0] === 'transform').slice(1), visual.transform(rotated));
assert.deepStrictEqual(calls.find(call => call[0] === 'drawImage'), ['drawImage', 'test image', -1, -2]);
const snapshot = { kind: 'air', identity: 'AIR 7', filename: 'test.air', detail: '', animation: model };
const page = comparison.html(snapshot, snapshot, 'test');
assert.match(page, /visual\.drawSprite\(ctx,image,info,frame\)/);
assert.doesNotThrow(() => new Function(page.match(/<script nonce="test">([\s\S]*)<\/script>/)[1]));
console.log('AIR scale/rotation parsing, shared sprite transforms, axis geometry and comparison bounds passed');

const fitStart = source.indexOf('function fit(){');
const fitSource = source.slice(fitStart, source.indexOf('function applyModel(', fitStart));
const fitContext = { images: new Map([[0, { image: { width: 4, height: 6 }, sprite }]]), current: () => rotated, airVisual: visual, canvas: { width: 600, height: 400 }, zoom: 1, panX: 0, panY: 0, setZoom(value) { fitContext.zoom = value; }, draw() {} };
vm.runInNewContext(fitSource, fitContext); fitContext.fit();
close([fitContext.zoom, fitContext.panX, fitContext.panY], [4, -42, -72]);
console.log('Main AIR Fit centers the transformed sprite bounds');
