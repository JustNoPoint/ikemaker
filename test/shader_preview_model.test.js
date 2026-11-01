'use strict';

const assert = require('assert');
const { normalizeShaderPreview, MAX_PREVIEW_FRAMES } = require('../src/shader_preview_model');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const sprite = normalizeShaderPreview({ sourceKind: 'sff', sourceLabel: 'Sprite 1,0', frames: [{ dataUri: png, group: 1, index: 0 }] });
assert.strictEqual(sprite.schema, 'ikemaker.shader-preview/v1');
assert.strictEqual(sprite.frames[0].group, 1);
assert.strictEqual(sprite.frames[0].ticks, 1);
assert.strictEqual(sprite.frames[0].width, 1);

const animation = normalizeShaderPreview({ sourceKind: 'air', loopStart: 1, frames: [{ dataUri: png, ticks: 2 }, { dataUri: png, ticks: 4, x: 3, missing: true }] });
assert.strictEqual(animation.frames.length, 2);
assert.strictEqual(animation.frames[1].ticks, 4);
assert.strictEqual(animation.frames[1].missing, true, 'missing AIR sprites retain their timing slot instead of shifting the animation');
assert.strictEqual(animation.loopStart, 1);
assert.throws(() => normalizeShaderPreview({ frames: [{ dataUri: 'https://example.test/sprite.png' }] }), /local PNG data/);
assert.throws(() => normalizeShaderPreview({ frames: [{ dataUri: 'data:image/svg+xml;base64,AA==' }] }), /local PNG data/);
assert.throws(() => normalizeShaderPreview({ frames: [{ dataUri: `data:image/png;base64,${Buffer.from('not really png').toString('base64')}` }] }), /valid PNG header/);
assert.throws(() => normalizeShaderPreview({ frames: Array.from({ length: MAX_PREVIEW_FRAMES + 1 }, () => ({ dataUri: png })) }), /limited/);

console.log('Shader previews accept bounded local PNG sprite and animation frames only');
