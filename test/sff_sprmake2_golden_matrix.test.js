'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { paletteAct } = require('../src/sff_reader');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { compareSffBackends } = require('../src/sff_backend_comparison');
const { normalizeSprMake2IndexedPng } = require('../src/sff_sprmake2_png_adapter');
const { noncanonicalIndexedPng } = require('../tools/generate_sff_runtime_certification_fixtures');

const executable = path.join(__dirname, '..', 'bin', 'win32-x64', 'sprmake2.exe');
const EXPECTED_EXECUTABLE_HASH = '8b545b2d0a7216217b6367337478b3afe33d82292716e1d29f59cc5fcbd89333';
if (process.platform !== 'win32' || !fs.existsSync(executable)) {
  console.log('SprMake2 golden matrix skipped: bundled Windows backend is unavailable on this platform');
  process.exit(0);
}

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => [(index * 5) & 255, (255 - index) & 255, (index ^ 0x63) & 255, index === 0 ? 0 : 255]);
const storedColors = Array.from({ length: 256 }, (_, index) => [(255 - index) & 255, (index * 11) & 255, (index ^ 0xc7) & 255, index === 0 ? 0 : 255]);
const png = encodeIndexed(3, 2, Buffer.from([0, 1, 254, 255, 33, 77]), colors), decoded = readIndexedPng8(png);
const pngB = encodeIndexed(3, 2, Buffer.from([0, 2, 253, 255, 34, 78]), colors), decodedB = readIndexedPng8(pngB);
const binaryNoncanonical = noncanonicalIndexedPng({ partialTransparency: false });
const noncanonicalPath = binaryNoncanonical.source.relativePath, noncanonicalPng = binaryNoncanonical.bytes, noncanonicalDecoded = readIndexedPng8(noncanonicalPng);
const normalizedNoncanonical = normalizeSprMake2IndexedPng(noncanonicalPng, noncanonicalPath), normalizedNoncanonicalPng = normalizedNoncanonical.bytes;
assert.strictEqual(normalizedNoncanonical.compatible, true); assert.strictEqual(normalizedNoncanonical.normalized, true, 'the SprMake2 adapter canonicalizes nonstandard but semantically supported PNG8 containers');
const source = { relativePath: 'input/source.png', byteHash: sha256(png), decodedHash: decoded.decodedHash, width: 3, height: 2, provenance: { kind: 'physical-golden-matrix' } };
const afterAxisSource = { ...source, provenance: { kind: 'approved-manifest-source', preparation: { kind: 'after-axis-crop', bounds: '1,1,3,2', outputByteHash: source.byteHash, axisDeltaX: -1, axisDeltaY: -1, originalAxis: '1,1' } } };
const sourceB = { relativePath: 'input/source-b.png', byteHash: sha256(pngB), decodedHash: decodedB.decodedHash, width: 3, height: 2, provenance: { kind: 'physical-golden-matrix' } };
const noncanonicalSource = { relativePath: noncanonicalPath, byteHash: sha256(noncanonicalPng), decodedHash: noncanonicalDecoded.decodedHash, width: noncanonicalDecoded.width, height: noncanonicalDecoded.height, provenance: { kind: 'physical-golden-matrix-noncanonical', filters: [0, 1, 2, 3, 4], splitIdat: true, partialTransparency: true } };
const palette = { entryId: 'palette:1,1', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors, source: { relativePath: 'input/source.act', byteHash: sha256(paletteAct(colors)), width: 256, height: 1 } };
const storedPalette = { entryId: 'palette:9,9', group: 9, number: 9, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: storedColors, source: { relativePath: 'input/stored.act', byteHash: sha256(paletteAct(storedColors)), width: 256, height: 1, provenance: { kind: 'portable-sprmake2-recipe-palette' } } };
const noncanonicalPalette = { entryId: 'palette:40,9', group: 40, number: 9, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: noncanonicalDecoded.colors, source: noncanonicalSource };
const linkedPalette = { ...palette, entryId: 'palette:1,2', number: 2, duplicatePolicy: 'share-identical', linkTargetEntryId: 'palette:1,1' };
const sprite = (entryId, group, number, axisX, axisY, selectedSource = source, cropMode = 'none', options = {}) => ({ entryId, group, number, axisX, axisY, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: options.paletteId || 'palette:1,1', duplicatePolicy: options.linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(options.linkTargetEntryId ? { linkTargetEntryId: options.linkTargetEntryId } : {}), crop: { mode: cropMode, axisDeltaX: 0, axisDeltaY: 0 }, source: selectedSource });
const specification = (id, sprites, palettes = [palette]) => createSffBuildSpecification({
  planId: id, sourceRoot: 'input', target: { archiveIdentity: `${id}.sff`, sffVersion: '2.1' }, sprites, palettes,
  requirements: ['sff-v2.1', 'sprite-png8', 'embedded-palettes', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption'], decisions: [], options: { shared: { physicalGoldenMatrix: true }, backends: {} }
});
const cases = [
  { id: 'physical-minimal', sprites: [sprite('sprite:minimal', 0, 0, 0, 0)], lines: ['0,0, source.png, 0,0'], expectedSprMake2Hash: 'd5dea6f9fd33030d3c4d1c0bbb969adc6819b87b59933005fdec90f3bd3000c2', expectedBuiltInHash: 'afee06a21ccfbc9de133ee7837517c9442cfe93bf4112ebc20e9f0dd5d3ffaf9' },
  { id: 'physical-before-axis-snapshot', sprites: [sprite('sprite:prepared-crop', 0, 0, 0, 0, source, 'before-axis')], lines: ['0,0, source.png, 0,0'], expectedSprMake2Hash: 'd5dea6f9fd33030d3c4d1c0bbb969adc6819b87b59933005fdec90f3bd3000c2', expectedBuiltInHash: 'afee06a21ccfbc9de133ee7837517c9442cfe93bf4112ebc20e9f0dd5d3ffaf9' },
  { id: 'physical-after-axis-snapshot', sprites: [{ ...sprite('sprite:prepared-after-crop', 0, 0, 1, 1, afterAxisSource, 'after-axis'), crop: { mode: 'after-axis', axisDeltaX: -1, axisDeltaY: -1 } }], lines: ['0,0, source.png, 0,0'], expectedSprMake2Hash: 'd5dea6f9fd33030d3c4d1c0bbb969adc6819b87b59933005fdec90f3bd3000c2', expectedBuiltInHash: 'afee06a21ccfbc9de133ee7837517c9442cfe93bf4112ebc20e9f0dd5d3ffaf9' },
  { id: 'physical-boundaries', sprites: [sprite('sprite:max', 65535, 65535, -32768, 32767), sprite('sprite:sparse', 0, 65000, 32767, -32768, sourceB)], lines: ['65535,65535, source.png, -32768,32767', '0,65000, source-b.png, 32767,-32768'], expectedSprMake2Hash: 'b2edb39f273c882a4ac1b9276842c96d4c089c17defc6e7da2874e90dc3e0db4', expectedBuiltInHash: 'e1aaffdc2b74c44255359e611f1bb00e8f017efa92954194ab0d1e0ace8906ca' },
  {
    id: 'physical-noncanonical-own-image-palette', sprites: [sprite('sprite:noncanonical', 40, 9, -15, 38, noncanonicalSource, 'none', { paletteId: 'palette:40,9' })], palettes: [noncanonicalPalette],
    bodyLines: ['', '[Option]', 'sprite.usepal = -1', '', '[Sprite]', '40,9, mixed-filters-split-idat.png, -15,38', ''],
    expectedSprMake2Hash: '89c8292b44c8cf03f95300c727d8f796892c81f3113ea367e8b3051337b1aa47', expectedBuiltInHash: '7fecf9c498398a105dccf3361af3d481a302c1475d75346a4030bfa5303eb86d'
  },
  {
    id: 'physical-stored-palette-overrides-png', sprites: [sprite('sprite:stored-palette', 12, 34, -27, 61, source, 'none', { paletteId: 'palette:9,9' })], palettes: [storedPalette],
    bodyLines: ['', '[Pal]', '9,9, stored.act, 0,255', '', '[Option]', 'sprite.usepal = 9,9', '', '[Sprite]', '12,34, source.png, -27,61', ''],
    expectedSprMake2Hash: '10ab7c356b275a1e7fa70e6622938ed0ab837ece0afac798c79072fa8e717fe6', expectedBuiltInHash: '4fb57669a9fbfca36f238b6371640b4bec6fe7b98af1ca2a97552e07b4dc35ad'
  },
  {
    id: 'physical-shared-links-and-reordered-identities',
    sprites: [sprite('sprite:base', 90, 7, -14, 33), sprite('sprite:linked', 2, 500, 21, -8, source, 'none', { paletteId: 'palette:1,2', linkTargetEntryId: 'sprite:base' })], palettes: [palette, linkedPalette],
    spriteDetectDuplicates: true, paletteDetectDuplicates: true,
    bodyLines: ['', '[Pal]', '1,1, source.act, 0,255', '1,2, source.act, 0,255', '', '[Option]', 'sprite.usepal = 1,1', '', '[Sprite]', '90,7, source.png, -14,33', '', '[Option]', 'sprite.usepal = 1,2', '', '[Sprite]', '2,500, source.png, 21,-8', ''],
    expectedSprMake2Hash: '9fee3feedd7975b906649a15dbbca3f3ad9662d1082bf422b6deeea190080a6a', expectedBuiltInHash: 'a5834516f4079d70452f04c324058df5db736e8879821033b38eb2fec244f19b'
  }
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sprmake2-golden-matrix-'));
try {
  fs.writeFileSync(path.join(root, 'source.png'), png); fs.writeFileSync(path.join(root, 'source-b.png'), pngB); fs.writeFileSync(path.join(root, 'source.act'), paletteAct(colors)); fs.writeFileSync(path.join(root, 'stored.act'), paletteAct(storedColors)); fs.writeFileSync(path.join(root, 'mixed-filters-split-idat.png'), normalizedNoncanonicalPng);
  assert.strictEqual(sha256(fs.readFileSync(executable)), EXPECTED_EXECUTABLE_HASH, 'the bundled SprMake2 executable changed; the physical golden matrix requires deliberate review');
  for (const item of cases) {
    const output = path.join(root, `${item.id}.sff`), definition = path.join(root, `${item.id}.def`);
    const bodyLines = item.bodyLines || ['', '[Pal]', '1,1, source.act, 0,255', '', '[Option]', 'sprite.usepal = 1,1', '', '[Sprite]', ...item.lines, ''];
    fs.writeFileSync(definition, ['[Output]', `filename = ${output}`, '', '[Option]', `input.dir = ${root}`, 'sprite.compress.8 = png8', `sprite.detectduplicates = ${item.spriteDetectDuplicates ? 1 : 0}`, `pal.detectduplicates = ${item.paletteDetectDuplicates ? 1 : 0}`, 'pal.discardduplicates = 0', 'pal.reversepng = 0', 'pal.reverseact = 1', ...bodyLines].join('\r\n'));
    const built = spawnSync(executable, [definition], { cwd: root, windowsHide: true, encoding: 'utf8' });
    assert.strictEqual(built.status, 0, `${item.id} SprMake2 failed: ${built.stdout || ''}\n${built.stderr || ''}`);
    assert(fs.existsSync(output), `${item.id} SprMake2 returned success without a candidate: ${built.stdout || ''}\n${built.stderr || ''}`);
    const sprMake2 = fs.readFileSync(output), repeat = spawnSync(executable, [definition], { cwd: root, windowsHide: true, encoding: 'utf8' });
    assert.strictEqual(repeat.status, 0, `${item.id} repeat SprMake2 build failed`);
    assert.deepStrictEqual(fs.readFileSync(output), sprMake2, `${item.id} SprMake2 bytes must be deterministic`);
    const comparison = compareSffBackends({ specification: specification(item.id, item.sprites, item.palettes), sprMake2CandidateBytes: sprMake2, builtInOptions: { sources: new Map([['input/source.png', png], ['input/source-b.png', pngB], [noncanonicalPath, noncanonicalPng]]) } });
    assert.strictEqual(comparison.status, 'equivalent'); assert.strictEqual(comparison.adoption.attempted, false);
    if (item.id === 'physical-shared-links-and-reordered-identities') {
      assert.deepStrictEqual(comparison.semantic.sprMake2.physicalSpriteOrder, ['90,7', '2,500']);
      assert.deepStrictEqual(comparison.semantic.sprMake2.physicalPaletteOrder, ['1,1', '1,2']);
      assert.deepStrictEqual(comparison.semantic.sprMake2.sprites.map(entry => entry.storage.kind), ['stored', 'linked']);
      assert.deepStrictEqual(comparison.semantic.sprMake2.palettes.map(entry => entry.storage.kind), ['stored', 'linked']);
    }
    if (item.id === 'physical-stored-palette-overrides-png') {
      const expectedStoredColorHash = sha256(Buffer.from(storedColors.flat()));
      assert.notStrictEqual(expectedStoredColorHash, sha256(Buffer.from(colors.flat())), 'the golden must exercise a genuinely different stored palette');
      assert.strictEqual(comparison.semantic.sprMake2.sprites[0].paletteAssignment.resolvedColorHash, expectedStoredColorHash);
      assert.strictEqual(comparison.semantic.builtIn.sprites[0].paletteAssignment.resolvedColorHash, expectedStoredColorHash, 'both backends must interpret the source indexes through the explicit stored palette');
    }
    assert.strictEqual(sha256(sprMake2), item.expectedSprMake2Hash, `${item.id} SprMake2 golden bytes changed`);
    assert.strictEqual(comparison.candidates.builtIn.byteHash, item.expectedBuiltInHash, `${item.id} built-in golden bytes changed`);
  }
  console.log('Physical SprMake2 golden matrix covers minimal, prepared before/after-axis, signed-boundary, normalized noncanonical PNG8, stored-palette override, reordered, sprite-link, and palette-link archives');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
