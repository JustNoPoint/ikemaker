'use strict';

const assert = require('assert');
const path = require('path');
const { createShaderPreviewSourceBridge } = require('../src/shader_preview_source_bridge');
const { createShaderSourceAuthority } = require('../src/shader_source_authority');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const archive = { buffer:Buffer.alloc(0), sprites:[{ index:0, group:1, number:0, paletteIndex:0 }], palettes:[] };
const sff = path.resolve('fixture.sff'), air = path.resolve('fixture.air');
// Keep this unit focused on exact source routing; decoded PNG generation is replaced at the SFF boundary.
archive.sprites[0].format = 11; archive.sprites[0].dataOffset = 0; archive.sprites[0].dataSize = png.length + 4; archive.buffer = Buffer.concat([Buffer.alloc(4), png]);
const authority=createShaderSourceAuthority({readBytes:filename=>filename===sff?archive.buffer:Buffer.from('[Begin Action 200]\n1, 0, 2, 3, 4'),parseArchive:()=>archive});
const bridge = createShaderPreviewSourceBridge({sourceAuthority:authority});
const sprite = bridge.fromSff(sff, { physicalIndex:0, group:1, number:0, palettePhysicalIndex:null });
assert.strictEqual(sprite.source.kind, 'sff');
assert.match(sprite.source.byteHash,/^[a-f0-9]{64}$/);
assert.strictEqual(sprite.preview.frames.length, 1);
const animation = bridge.fromAir(sff, air, 200);
assert.strictEqual(animation.source.actionNumber, 200);
assert.strictEqual(animation.preview.frames[0].ticks, 4);
assert.throws(() => bridge.fromSff(sff, { physicalIndex:0, group:2, number:0 }), /no longer matches/);
assert.throws(() => bridge.fromAir(sff, air, 201), /not found/);
assert.throws(() => bridge.fromSff(path.resolve('fixture.txt'), { group:1, number:0 }), /\.SFF path/);
assert.strictEqual(bridge.refresh(sprite.source).source.byteHash,sprite.source.byteHash);

console.log('Shader preview source bridge resolves exact local SFF sprites and AIR actions without engine access');
