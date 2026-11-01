'use strict';
const assert=require('assert'),zlib=require('zlib');
const {encodeRgbaPng}=require('../src/palette_collective_model');
const {decodePng}=require('../src/palette_index_organizer_model');
const png=encodeRgbaPng(1,1,Buffer.from([1,2,3,255]));
const huge=Buffer.from(png);huge.writeUInt32BE(9000,16);assert.throws(()=>decodePng(huge),/dimensions exceed/,'oversized IHDR must fail before inflate/allocation');
const tooMany=Buffer.concat([png.subarray(0,png.length-12),Buffer.from([0,0,0,0,116,69,88,116,0,0,0,0]),png.subarray(png.length-12)]);assert.throws(()=>decodePng(tooMany,{maximumChunks:3}),/chunk safety limit/);
assert.throws(()=>decodePng(png.subarray(0,png.length-2)),/Truncated|invalid or trailing/);assert.throws(()=>decodePng(png.subarray(0,png.length-12)),/invalid or trailing/);
function rebuilt(raw){const compressed=zlib.deflateSync(raw),len=Buffer.alloc(4);len.writeUInt32BE(compressed.length);return Buffer.concat([png.subarray(0,33),len,Buffer.from('IDAT'),compressed,Buffer.alloc(4),png.subarray(png.length-12)]);}
assert.throws(()=>decodePng(rebuilt(Buffer.alloc(4))),/scanline size/);assert.throws(()=>decodePng(rebuilt(Buffer.alloc(100))),/larger than|buffer|size|length/i,'inflate overrun must stop at bounded output');
const noIdat=Buffer.concat([png.subarray(0,33),png.subarray(png.length-12)]);assert.throws(()=>decodePng(noIdat),/no image data/);
const badLength=Buffer.from(png);badLength.writeUInt32BE(0xffffffff,33);assert.throws(()=>decodePng(badLength),/Truncated PNG chunk/);
console.log('Palette collective PNG bomb, dimension, truncation, chunk, inflate, and missing-data limits passed');
