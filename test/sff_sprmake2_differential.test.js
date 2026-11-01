'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { crc32, readIndexedPng8 } = require('../src/sff_png8_source');
const { paletteAct } = require('../src/sff_reader');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { validateSffV21Png8 } = require('../src/sff_v21_strict_validator');
const { compareSffBackends } = require('../src/sff_backend_comparison');

// This is a physical differential and hash-locked golden test against the
// bundled trusted Windows backend. It is skipped where that exact backend is
// unavailable and still does not replace an IKEMEN load/render test.
const executable = path.join(__dirname, '..', 'bin', 'win32-x64', 'sprmake2.exe');
const GOLDEN = Object.freeze({
  executableSha256: '8b545b2d0a7216217b6367337478b3afe33d82292716e1d29f59cc5fcbd89333',
  sprMake2CandidateSha256: '1ad7fd10a7e280278a22addfdc29c8186fddc359e03863ae73b25584f261ae4f',
  builtInCandidateSha256: '4fbde46d27bd50c147b177c9c0d5e71410f7d83ddcc3a5a779bdbafc06ceaa92'
});
if (process.platform !== 'win32' || !fs.existsSync(executable)) {
  console.log('SprMake2 differential smoke test skipped: bundled Windows backend is unavailable on this platform');
  process.exit(0);
}

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function chunk(type, data) { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; }
function png8(width, height, pixels, colors) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const plte = Buffer.from(colors.flatMap((color) => color.slice(0, 3))), alpha = Buffer.from(colors.map((color) => color[3]));
  const raw = Buffer.alloc(height * (width + 1)); for (let y = 0; y < height; y += 1) { raw[y * (width + 1)] = 0; pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width); }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', alpha), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sprmake2-differential-'));
try {
  const colorsA = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 0x55, index === 0 ? 0 : 255]);
  const colorsB = Array.from({ length: 256 }, (_, index) => [(index + 37) & 255, (index * 3) & 255, 255 - index, index === 0 ? 0 : 255]);
  const pixelsA = Buffer.from([0, 1, 2, 3, 4, 5]), pixelsB = Buffer.from([9, 8, 7, 6]);
  const pngA = png8(3, 2, pixelsA, colorsA), pngB = png8(2, 2, pixelsB, colorsB);
  fs.writeFileSync(path.join(root, 'a.png'), pngA);
  fs.writeFileSync(path.join(root, 'b.png'), pngB);
  fs.writeFileSync(path.join(root, 'a.act'), paletteAct(colorsA));
  fs.writeFileSync(path.join(root, 'b.act'), paletteAct(colorsB));
  const output = path.join(root, 'sprmake2.sff'), definition = path.join(root, 'sprmake2.def');
  fs.writeFileSync(definition, [
    '[Output]', `filename = ${output}`, '', '[Option]', `input.dir = ${root}`,
    'sprite.compress.8 = png8', 'sprite.detectduplicates = 0', 'pal.detectduplicates = 0',
    'pal.discardduplicates = 0', 'pal.reversepng = 0', 'pal.reverseact = 1',
    '', '[Pal]', '1,2, b.act, 0,255', '1,1, a.act, 0,255', '1,3, a.act, 0,255',
    '', '[Option]', 'sprite.usepal = 1,2', '', '[Sprite]', '900,2, b.png, -4,18',
    '', '[Option]', 'sprite.usepal = 1,1', '', '[Sprite]', '20,7, a.png, 320,-200', '20,8, a.png, 14,-9', ''
  ].join('\r\n'));
  const built = spawnSync(executable, [definition], { cwd: root, windowsHide: true, encoding: 'utf8' });
  assert.strictEqual(built.status, 0, `SprMake2 failed: ${built.stdout || ''}\n${built.stderr || ''}`);
  assert(fs.existsSync(output), 'SprMake2 did not create its candidate');
  const firstCandidate = fs.readFileSync(output);
  const rebuilt = spawnSync(executable, [definition], { cwd: root, windowsHide: true, encoding: 'utf8' });
  assert.strictEqual(rebuilt.status, 0, `SprMake2 repeat build failed: ${rebuilt.stdout || ''}\n${rebuilt.stderr || ''}`);
  assert.deepStrictEqual(fs.readFileSync(output), firstCandidate, 'the same reviewed SprMake2 input must produce deterministic candidate bytes');
  const decodedA = readIndexedPng8(pngA), decodedB = readIndexedPng8(pngB);
  const specification = createSffBuildSpecification({
    planId: 'physical-sprmake2-smoke', sourceRoot: 'input', target: { archiveIdentity: 'sprmake2.sff', sffVersion: '2.1' },
    sprites: [
      { entryId: 'sprite:b', group: 900, number: 2, axisX: -4, axisY: 18, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:b', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: 'input/b.png', byteHash: sha(pngB), decodedHash: decodedB.decodedHash, width: 2, height: 2 } },
      { entryId: 'sprite:a', group: 20, number: 7, axisX: 320, axisY: -200, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:a', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: 'input/a.png', byteHash: sha(pngA), decodedHash: decodedA.decodedHash, width: 3, height: 2 } },
      { entryId: 'sprite:a-link', group: 20, number: 8, axisX: 14, axisY: -9, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:a', duplicatePolicy: 'share-identical', linkTargetEntryId: 'sprite:a', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: 'input/a.png', byteHash: sha(pngA), decodedHash: decodedA.decodedHash, width: 3, height: 2 } }
    ],
    palettes: [
      { entryId: 'palette:b', group: 1, number: 2, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: colorsB, source: { relativePath: 'input/b.act', byteHash: sha(paletteAct(colorsB)), width: 256, height: 1 } },
      { entryId: 'palette:a', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: colorsA, source: { relativePath: 'input/a.act', byteHash: sha(paletteAct(colorsA)), width: 256, height: 1 } },
      { entryId: 'palette:a-link', group: 1, number: 3, tableOrder: 'sff', duplicatePolicy: 'share-identical', linkTargetEntryId: 'palette:a', colors: colorsA, source: { relativePath: 'input/a.act', byteHash: sha(paletteAct(colorsA)), width: 256, height: 1 } }
    ],
    requirements: ['sff-v2.1', 'sprite-png8', 'embedded-palettes', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption']
  });
  const report = validateSffV21Png8(output, specification, { compatibilityProfile: 'sprmake2-v2.1' });
  assert.strictEqual(report.ok, true, `${report.errors.join('; ')}; first stored colors: ${JSON.stringify(report.palettes[0]?.colorsRgba?.slice(0, 2))}`);
  assert.deepStrictEqual(report.physicalOrder.map(entry => `${entry.group},${entry.number}`), ['900,2', '20,7', '20,8']);
  assert.deepStrictEqual(report.palettes.map(entry => `${entry.group},${entry.number}`), ['1,2', '1,1', '1,3']);
  assert.strictEqual(report.physicalOrder[0].decodedIndexHash, decodedB.decodedHash);
  assert.strictEqual(report.physicalOrder[1].decodedIndexHash, decodedA.decodedHash);
  assert.strictEqual(report.sprites[2].dataSize, 0);
  assert.strictEqual(report.sprites[2].link, 1);
  assert.strictEqual(report.palettes[2].dataSize, 0);
  assert.strictEqual(report.palettes[2].link, 1);
  const comparison = compareSffBackends({
    specification,
    sprMake2CandidateBytes: firstCandidate,
    builtInOptions: { sources: new Map([['input/a.png', pngA], ['input/b.png', pngB]]) }
  });
  assert.strictEqual(comparison.status, 'equivalent');
  assert.strictEqual(comparison.semanticEquivalent, true);
  assert.strictEqual(comparison.adoption.attempted, false);
  assert.strictEqual(sha(fs.readFileSync(executable)), GOLDEN.executableSha256, 'the bundled backend changed; review it and deliberately update the golden evidence');
  assert.strictEqual(sha(firstCandidate), GOLDEN.sprMake2CandidateSha256, 'SprMake2 golden candidate bytes changed');
  assert.strictEqual(comparison.candidates.builtIn.byteHash, GOLDEN.builtInCandidateSha256, 'built-in golden candidate bytes changed');
  console.log('SprMake2 multi-entry physical differential passed strict validation and built-in semantic comparison');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
