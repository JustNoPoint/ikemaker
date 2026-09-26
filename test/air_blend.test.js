'use strict';
const assert = require('assert'), vm = require('vm');
const visual = require('../src/air_visual'), { parseAir } = require('../src/air_preview_model');
const pixel = (mode, alpha = 255) => Array.from(visual.blendPixels(new Uint8ClampedArray([100,80,60,255]), new Uint8ClampedArray([20,100,240,alpha]), visual.parseBlend(mode)));
assert.deepStrictEqual(pixel('A'), [120,180,255,255]);
assert.deepStrictEqual(pixel('S'), [80,0,0,255]);
assert.deepStrictEqual(pixel('A1'), [70,140,255,255]);
assert.deepStrictEqual(pixel('AS128D128'), [60,90,150,255]);
assert.deepStrictEqual(pixel('SS128D128'), [40,0,0,255]);
assert.deepStrictEqual(pixel('SA'), [20,100,240,255], 'SubAdd clamps the grayscale subtraction before adding source color');
assert.deepStrictEqual(pixel('A', 0), [100,80,60,255]);
assert.deepStrictEqual(pixel('A', 128), [110,130,180,255]);
assert.deepStrictEqual(visual.parseBlend('AS256D0'), { mode: 'add', src: 255, dst: 0 });
assert.deepStrictEqual(visual.parseBlend('SAS64D32'), { mode: 'subadd', src: 64, dst: 32 });
assert.strictEqual(visual.parseBlend('').mode, 'none');
const action = parseAir('[Begin Action 0]\n0,0,0,0,10,,AS256D0\nInterpolate Blend\n0,0,0,0,10,,AS0D256')[0];
assert.deepStrictEqual(visual.sample(action, 0, 5).blendState, { mode: 'add', src: 127.5, dst: 127.5 });
action.frames[0].blend = '';
assert.strictEqual(visual.sample(action, 0, 5).blendState, undefined, 'ordinary opaque frames do not interpolate blending implicitly');

// Execute the real canvas adapter in a browser-like context. Verify transformed
// pixel bounds, layer reuse, and the completed blend written back to the target.
let creations = 0, output, requested;
const layer = { canvas: { width: 0, height: 0 }, resetTransform(){}, clearRect(){}, setTransform(){}, transform(){}, drawImage(){}, getImageData(){ return { data: new Uint8ClampedArray([20,100,240,255]) }; } };
const sandbox = { document: { createElement(){ creations++; return { getContext: () => layer }; } } };
const runtime = vm.runInNewContext('(' + visual.runtime.toString() + ')()', sandbox);
const ctx = { canvas: { width: 100, height: 100 }, getTransform: () => ({ a:2,b:0,c:0,d:2,e:10,f:20 }), getImageData(...args){ requested=args; return { data:new Uint8ClampedArray([100,80,60,255]) }; }, putImageData(value,x,y){ output={data:Array.from(value.data),x,y}; } };
const frame = { flags:'',x:0,y:0,blend:'A' }, sprite = { axisX:0,axisY:0 }, image = { width:4,height:6 };
runtime.drawSprite(ctx, image, sprite, frame);
assert.deepStrictEqual(requested, [9,19,10,14]);
assert.deepStrictEqual(output, { data:[120,180,255,255],x:9,y:19 });
runtime.drawSprite(ctx, image, sprite, {...frame,blend:'S'});
assert.strictEqual(creations, 1, 'a renderer reuses its scratch canvas');
assert.deepStrictEqual(output.data, [80,0,0,255]);
console.log('AIR blend modes, pixel arithmetic, interpolation and transformed canvas adapter passed');
