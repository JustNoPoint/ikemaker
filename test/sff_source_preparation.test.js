'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { decodePng } = require('../src/palette_index_organizer_model');
const { safePrefix, orderedSources, planPreparedSources, inspectPreparedPng, prepareSourceBuffers } = require('../src/sff_source_preparation');

function bmp8() {
  const offset = 14 + 40 + 1024, result = Buffer.alloc(offset + 8);
  result.write('BM'); result.writeUInt32LE(result.length, 2); result.writeUInt32LE(offset, 10); result.writeUInt32LE(40, 14);
  result.writeInt32LE(2, 18); result.writeInt32LE(2, 22); result.writeUInt16LE(1, 26); result.writeUInt16LE(8, 28); result.writeUInt32LE(8, 34); result.writeUInt32LE(256, 46);
  for (let index = 0; index < 256; index += 1) { const at = 54 + index * 4; result[at] = index % 17; result[at + 1] = 255 - index; result[at + 2] = index; }
  Buffer.from([2, 3, 0, 0, 0, 1, 0, 0]).copy(result, offset); return result;
}

function bmp24() {
  const offset = 54, result = Buffer.alloc(offset + 8);
  result.write('BM'); result.writeUInt32LE(result.length, 2); result.writeUInt32LE(offset, 10); result.writeUInt32LE(40, 14);
  result.writeInt32LE(2, 18); result.writeInt32LE(1, 22); result.writeUInt16LE(1, 26); result.writeUInt16LE(24, 28); result.writeUInt32LE(8, 34);
  Buffer.from([0, 0, 255, 0, 255, 0, 0, 0]).copy(result, offset); return result;
}

function bmpRle8() {
  const data = Buffer.from([2, 3, 2, 4, 0, 0, 0, 4, 0, 1, 2, 2, 0, 0, 0, 1]), offset = 14 + 40 + 1024, result = Buffer.alloc(offset + data.length);
  result.write('BM'); result.writeUInt32LE(result.length, 2); result.writeUInt32LE(offset, 10); result.writeUInt32LE(40, 14);
  result.writeInt32LE(4, 18); result.writeInt32LE(2, 22); result.writeUInt16LE(1, 26); result.writeUInt16LE(8, 28); result.writeUInt32LE(1, 30); result.writeUInt32LE(data.length, 34); result.writeUInt32LE(256, 46);
  for (let index = 0; index < 256; index += 1) { const at = 54 + index * 4; result[at] = index % 17; result[at + 1] = 255 - index; result[at + 2] = index; }
  data.copy(result, offset); return result;
}

function pcx8() {
  const result = Buffer.alloc(128 + 4 + 769); result[0] = 0x0a; result[1] = 5; result[2] = 0; result[3] = 8;
  result.writeUInt16LE(1, 8); result.writeUInt16LE(1, 10); result[65] = 1; result.writeUInt16LE(2, 66);
  Buffer.from([0, 1, 2, 3]).copy(result, 128); const marker = 132; result[marker] = 0x0c;
  for (let index = 0; index < 256; index += 1) { const at = marker + 1 + index * 3; result[at] = index; result[at + 1] = 255 - index; result[at + 2] = index % 17; }
  return result;
}

function pcx24() {
  const result = Buffer.alloc(128 + 6); result[0] = 0x0a; result[1] = 5; result[2] = 0; result[3] = 8;
  result.writeUInt16LE(1, 8); result.writeUInt16LE(0, 10); result[65] = 3; result.writeUInt16LE(2, 66);
  Buffer.from([255, 0, 0, 255, 0, 0]).copy(result, 128); return result;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-source-prep-'));
try {
  const files = ['Idle 2.BMP', 'Idle 10.pcx', 'Idle 11.PNG'].map(name => { const filename = path.join(root, name); fs.writeFileSync(filename, name); return filename; });
  const plan = planPreparedSources(files, { prefix: 'Ryu Idle', start: 5, padding: 3 });
  assert.deepStrictEqual(plan.map(item => item.outputName), ['Ryu_Idle_005.png', 'Ryu_Idle_006.png', 'Ryu_Idle_007.png']);
  assert.deepStrictEqual(plan.map(item => item.conversion), ['bmp-to-png', 'pcx-to-png', 'copy-png']);
  assert.deepStrictEqual(orderedSources(files, 'selected'), files, 'selected order remains byte-for-byte positional input');
  assert.deepStrictEqual(orderedSources([files[1], files[2], files[0]], 'natural').map(filename => path.basename(filename)), ['Idle 2.BMP', 'Idle 10.pcx', 'Idle 11.PNG']);
  assert.deepStrictEqual(orderedSources(['frame' + '1'.repeat(201) + '.png', 'frame' + '9'.repeat(200) + '.png'], 'natural'), ['frame' + '9'.repeat(200) + '.png', 'frame' + '1'.repeat(201) + '.png'], 'natural ordering remains exact beyond JavaScript numeric precision');
  assert.throws(() => orderedSources(files, 'alphabet soup'), /Unsupported source ordering/);
  assert.strictEqual(safePrefix(' beard / overlay '), 'beard_overlay');
  assert.throws(() => safePrefix('...---'), /letters or numbers/);
  assert.throws(() => safePrefix('x'.repeat(121)), /120 characters/);
  assert.throws(() => planPreparedSources([files[0]], { padding: 0 }), /padding must be from 1/);
  assert.throws(() => planPreparedSources(files.slice(0, 2), { start: Number.MAX_SAFE_INTEGER }), /exceeds the safe numeric range/);
  assert.throws(() => planPreparedSources([files[0], files[0]]), /selected more than once/);
  const txt = path.join(root, 'bad.txt'); fs.writeFileSync(txt, 'x'); assert.throws(() => planPreparedSources([txt]), /Unsupported source/);

  const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 17, index === 0 ? 0 : 255]);
  const png = encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors), validPng = path.join(root, 'valid.png');
  fs.writeFileSync(validPng, png);
  const copyPlan = planPreparedSources([validPng], { prefix: 'copy', start: 0, padding: 2 });
  const copied = prepareSourceBuffers(copyPlan, path.join(root, 'copy-temp'));
  assert.strictEqual(copied[0].buffer.equals(png), true, 'PNG preparation is a byte-exact copy');
  assert.deepStrictEqual({ width: copied[0].width, height: copied[0].height, indexed: copied[0].indexed }, { width: 2, height: 2, indexed: true });
  assert.match(copied[0].sourceByteHash, /^[A-F0-9]{64}$/);
  assert.strictEqual(copied[0].sourceByteHash, copied[0].outputByteHash);

  const convertedPlan = planPreparedSources([files[0]], { prefix: 'converted', start: 7, padding: 2 });
  const calls = [];
  const converted = prepareSourceBuffers(convertedPlan, path.join(root, 'convert-temp'), 'reviewed-magick', (command, args, options) => {
    calls.push({ command, args, options }); fs.writeFileSync(args[1], png); return { status: 0, stderr: '' };
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].command, 'reviewed-magick');
  assert.deepStrictEqual(calls[0].args, [files[0], path.join(root, 'convert-temp', 'converted_07.png')]);
  assert.strictEqual(converted[0].indexed, true);
  assert.notStrictEqual(converted[0].sourceByteHash, converted[0].outputByteHash);

  const nativeBmp = path.join(root, 'native.bmp'), nativePcx = path.join(root, 'native.pcx'), trueColorBmp = path.join(root, 'truecolor.bmp');
  fs.writeFileSync(nativeBmp, bmp8()); fs.writeFileSync(nativePcx, pcx8()); fs.writeFileSync(trueColorBmp, bmp24());
  const nativePlan = planPreparedSources([nativeBmp, nativePcx, trueColorBmp], { prefix: 'native', start: 0, padding: 2 });
  const native = prepareSourceBuffers(nativePlan, path.join(root, 'native-temp'), 'must-not-run', () => { throw new Error('standard native formats must not launch a fallback converter'); });
  assert.deepStrictEqual(native.map(item => item.converter), ['native', 'native', 'native']);
  assert.deepStrictEqual(native.map(item => [item.width, item.height, item.colorType]), [[2, 2, 3], [2, 2, 3], [2, 1, 6]]);
  assert.deepStrictEqual([...readIndexedPng8(native[0].buffer).indices], [0, 1, 2, 3], 'bottom-up BMP rows become top-down PNG rows');
  assert.deepStrictEqual([...readIndexedPng8(native[1].buffer).indices], [0, 1, 2, 3], 'PCX indexes remain byte-exact');
  assert.deepStrictEqual([...decodePng(native[2].buffer).rgba], [255, 0, 0, 255, 0, 255, 0, 255], '24-bit BMP BGR pixels become exact RGBA PNG pixels');

  const compressedBmp = path.join(root, 'compressed.bmp'), trueColorPcx = path.join(root, 'truecolor.pcx');
  fs.writeFileSync(compressedBmp, bmpRle8()); fs.writeFileSync(trueColorPcx, pcx24());
  const extendedNative = prepareSourceBuffers(planPreparedSources([compressedBmp, trueColorPcx], { prefix: 'extended', start: 0, padding: 2 }), path.join(root, 'extended-temp'), 'must-not-run', () => { throw new Error('RLE8 BMP and three-plane PCX must use native conversion'); });
  assert.deepStrictEqual(extendedNative.map(item => [item.converter, item.colorType]), [['native', 3], ['native', 6]]);
  assert.deepStrictEqual([...readIndexedPng8(extendedNative[0].buffer).indices], [0, 1, 2, 2, 3, 3, 4, 4], 'RLE8 encoded, absolute, EOL, and EOB commands preserve rows');
  assert.deepStrictEqual([...decodePng(extendedNative[1].buffer).rgba], [255, 0, 0, 255, 0, 255, 0, 255], 'three-plane PCX rows become exact RGBA PNG pixels');

  assert.throws(() => inspectPreparedPng(Buffer.from('not png'), 'broken.png'), /not a valid PNG/);
  assert.throws(() => prepareSourceBuffers(convertedPlan, path.join(root, 'bad-temp'), 'magick', (_command, args) => { fs.writeFileSync(args[1], Buffer.from('bad')); return { status: 0 }; }), /not a valid PNG/);
  assert.throws(() => prepareSourceBuffers(convertedPlan, path.join(root, 'failed-temp'), 'magick', () => ({ status: 1, stderr: 'decoder rejected input' })), /Could not convert Idle 2\.BMP.*decoder rejected input/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('SFF batch source preparation safely plans, converts, validates, hashes, and renames PNG, BMP, and PCX copies');
