'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { inspectImages, batchSummary } = require('../src/palette_import_assistant');

function chunk(type, data) { const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length, 0); output.write(type, 4, 4, 'ascii'); data.copy(output, 8); return output; }
function png(colorType, transparent = true) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(3, 4); ihdr[8] = 8; ihdr[9] = colorType; const parts = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr)]; if (colorType === 3) { parts.push(chunk('PLTE', Buffer.from([1, 2, 3, 4, 5, 6]))); if (transparent) parts.push(chunk('tRNS', Buffer.from([0, 255]))); } parts.push(chunk('IEND', Buffer.alloc(0))); return Buffer.concat(parts); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-import-')), ready = path.join(root, 'ready.png'), truecolor = path.join(root, 'rgb.png');
fs.writeFileSync(ready, png(3)); fs.writeFileSync(truecolor, png(2));
const okay = inspectImages([ready]);
assert.strictEqual(okay[0].name, 'ready.png'); assert.strictEqual(okay[0].state, 'ready'); assert.strictEqual(okay[0].paletteSize, 256); assert.strictEqual(batchSummary(okay).safeToStage, true);
const mixed = inspectImages([ready, truecolor]);
assert.strictEqual(mixed[1].state, 'conversion-required'); assert.strictEqual(batchSummary(mixed).safeToStage, false); assert.match(batchSummary(mixed).detail, /need indexing/);
fs.rmSync(root, { recursive: true, force: true });
console.log('palette import assistant tests passed');
