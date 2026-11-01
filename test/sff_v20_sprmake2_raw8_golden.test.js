'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV20Raw8Bytes } = require('../src/sff_v20_raw8_writer');
const { assertSffV20Raw8 } = require('../src/sff_v20_strict_validator');

const executable = path.join(__dirname, '..', 'bin', 'win32-x64', 'sprmake2.exe');
if (process.platform !== 'win32' || !fs.existsSync(executable)) {
  console.log('SFF v2.0 SprMake2 RAW8 golden skipped: bundled Windows backend unavailable');
  process.exit(0);
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
assert.strictEqual(sha(fs.readFileSync(executable)), '8b545b2d0a7216217b6367337478b3afe33d82292716e1d29f59cc5fcbd89333');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-v20-sprmake2-'));
try {
  const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, (3 * index) & 255, index === 0 ? 0 : 255]);
  const pixels = Buffer.from([0, 1, 2, 3, 4, 5]), sourcePng = encodeIndexed(3, 2, pixels, colors), decoded = readIndexedPng8(sourcePng);
  fs.writeFileSync(path.join(root, 'source.png'), sourcePng);
  const definition = ['[Output]', 'filename = raw8.sff', '', '[Option]', 'input.dir = .', 'sprite.compress.8 = none', 'sprite.detectduplicates = 0', 'pal.detectduplicates = 0', 'pal.discardduplicates = 0', 'pal.reversepng = 0', '', '[Option]', 'sprite.usepal = -1', '', '[Sprite]', '10,20, source.png, -7,9', ''].join('\r\n');
  fs.writeFileSync(path.join(root, 'raw8.def'), definition);
  const run = spawnSync(executable, ['raw8.def'], { cwd: root, windowsHide: true, encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stdout || run.stderr); assert(fs.existsSync(path.join(root, 'raw8.sff')), run.stdout || 'SprMake2 returned no archive');
  const bytes = fs.readFileSync(path.join(root, 'raw8.sff'));
  assert.strictEqual(sha(bytes), 'f1e1dbbea39f78c8ddf1aeab464e3365a951a4aa936f195445350d06bced35a1');
  const report = assertSffV20Raw8(bytes, null, { compatibilityProfile: 'sprmake2-v2.0-raw8' });
  assert.strictEqual(report.primaryVersion, '2.0.1.0'); assert.strictEqual(report.compatibleVersion, '2.0.0.0');
  assert.strictEqual(report.sprites[0].format, 0); assert.strictEqual(report.sprites[0].dataSize, 6); assert.deepStrictEqual([...report.sprites[0].decodedIndexes], [0, 1, 2, 3, 4, 5]);
  const specification = createSffBuildSpecificationV2({
    planId: 'sprmake2-v20-raw8-golden', selection: { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' }, archive: { identity: 'builtin.sff' },
    logical: { sourceRoot: 'input', sprites: [{ entryId: 'sprite:0', group: 10, number: 20, width: 3, height: 2, axisX: -7, axisY: 9, pixels: { kind: 'indexed8', decodedHash: decoded.decodedHash }, paletteEntryId: 'palette:0', source: { relativePath: 'source.png', byteHash: sha(sourcePng), decodedHash: decoded.decodedHash } }], palettes: [{ entryId: 'palette:0', group: 10, number: 20, colors, source: { relativePath: 'source.png', byteHash: sha(sourcePng), decodedHash: decoded.decodedHash } }] },
    encodingIntent: { compression: { default: 'raw8' }, crop: { default: 'none' }, storage: {}, paletteMode: 'embedded', backendOptions: {} }
  });
  const builtInBytes = createSffV20Raw8Bytes(specification, { decodedPixelsByEntryId: { 'sprite:0': pixels } }), builtIn = assertSffV20Raw8(builtInBytes, specification);
  assert.deepStrictEqual(builtIn.sprites.map(item => [item.group, item.number, item.axisX, item.axisY, item.width, item.height, item.resolvedDecodedIndexHash, item.paletteIndex]), report.sprites.map(item => [item.group, item.number, item.axisX, item.axisY, item.width, item.height, item.resolvedDecodedIndexHash, item.paletteIndex]));
  assert.deepStrictEqual(builtIn.palettes[0].colorsRgba, report.palettes[0].colorsRgba, 'SprMake2 and built-in candidates are compared semantically; identical bytes are not an acceptance requirement');
  console.log('Pinned Elecbyte SprMake2 RAW8 golden proves the MUGEN 1.0 version pair, 512-byte layout, and prefix-free raw pixels');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
