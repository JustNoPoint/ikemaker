'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { paletteLibraryFiles, safeLibraryPalette, safePaletteSource, paletteSourceLabel, pngPaletteRgba } = require('../src/palette_library');

function chunk(type, data) { const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length, 0); output.write(type, 4, 4, 'ascii'); data.copy(output, 8); return output; }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-library-'));
const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
const first = path.join(root, 'A.act'), second = path.join(nested, 'B.ACT');
fs.writeFileSync(first, Buffer.alloc(768)); fs.writeFileSync(second, Buffer.alloc(768)); fs.writeFileSync(path.join(root, 'ignore.txt'), 'x');
const png = path.join(root, 'C.png'), plte = Buffer.alloc(768); plte[0] = 9; plte[1] = 8; plte[2] = 7;
fs.writeFileSync(png, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('PLTE', plte), chunk('tRNS', Buffer.from([0])), chunk('IEND', Buffer.alloc(0))]));
assert.deepStrictEqual(paletteLibraryFiles(root), [first, png, second]);
assert.strictEqual(safeLibraryPalette(root, second), second);
assert.deepStrictEqual(pngPaletteRgba(fs.readFileSync(png))[0], [9, 8, 7, 0]);
assert.throws(() => safeLibraryPalette(root, path.join(path.dirname(root), 'outside.act')), /outside/);
assert.throws(() => safeLibraryPalette(root, path.join(root, 'ignore.txt')), /outside/);
const outside = path.join(path.dirname(root), 'manually-selected.act'); fs.writeFileSync(outside, Buffer.alloc(768));
assert.strictEqual(safePaletteSource(root, outside, [outside]), outside, 'an exact manually selected palette is accepted outside the configured folder');
assert.throws(() => safePaletteSource(root, outside, []), /outside/, 'an unselected outside path is rejected');
assert.match(paletteSourceLabel(root, outside, [outside]), /manually-selected\.act/, 'manual source labels identify the chosen file');
fs.unlinkSync(outside);
assert.throws(() => safePaletteSource(root, outside, [outside]), /no longer available/, 'a removed manually selected source is rejected before staging');
fs.rmSync(root, { recursive: true, force: true });

console.log('palette library tests passed');
