'use strict';
const assert=require('assert'),{encodeLayeredPsd}=require('../src/palette_layered_psd'),{encodeBmp,encodePcx24}=require('../src/palette_merged_image_export');
const rgba=Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
const bottom={name:'Bottom background',x:0,y:0,width:2,height:2,rgba},top={name:'Sprite 1',x:0,y:0,width:2,height:2,rgba},psd=encodeLayeredPsd({width:2,height:2,compositeRgba:rgba,layers:[bottom,top]});
assert.strictEqual(psd.subarray(0,4).toString('ascii'),'8BPS');assert.strictEqual(psd.readUInt16BE(4),1);assert.strictEqual(psd.readUInt32BE(14),2);assert.strictEqual(psd.readUInt32BE(18),2);assert(psd.includes(Buffer.from('Sprite 1','latin1')),'PSD retains the authored layer name');assert(psd.indexOf(Buffer.from('Bottom background','latin1'))<psd.indexOf(Buffer.from('Sprite 1','latin1')),'PSD layer records preserve the supplied bottom-to-top order');
const bmp=encodeBmp(2,2,rgba);assert.strictEqual(bmp.subarray(0,2).toString('ascii'),'BM');assert.strictEqual(bmp.readInt32LE(18),2);assert.strictEqual(bmp.readInt32LE(22),2);
const pcx=encodePcx24(2,2,rgba);assert.deepStrictEqual([...pcx.subarray(0,4)],[10,5,1,8]);assert.strictEqual(pcx[65],3,'pre-index PCX uses three true-color planes');
console.log('Layered PSD and merged PNG/PCX/BMP template export encoders passed');
