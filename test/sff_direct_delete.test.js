'use strict';
const assert=require('assert');
const crypto=require('crypto');
const zlib=require('zlib');
const {parseSffBuffer}=require('../src/sff_reader');
const {deleteSpritesFromSff,duplicateSpriteInSff}=require('../src/sff_direct_delete');

function fixture(){const palette=Buffer.alloc(1024,7),a=Buffer.from([4,0,0,0,1,2,3,4]),b=Buffer.from([4,0,0,0,5,6,7,8]),paletteTable=64,spriteTable=80,literal=176,total=literal+palette.length+a.length+b.length,out=Buffer.alloc(total);out.write('ElecbyteSpr\0','latin1');out.set([0,1,0,2],12);out.set([0,1,0,2],24);out.writeUInt32LE(spriteTable,36);out.writeUInt32LE(3,40);out.writeUInt32LE(paletteTable,44);out.writeUInt32LE(1,48);out.writeUInt32LE(literal,52);out.writeUInt32LE(total-literal,56);out.writeUInt32LE(total,60);out.writeUInt16LE(1,paletteTable);out.writeUInt16LE(1,paletteTable+2);out.writeUInt16LE(256,paletteTable+4);out.writeUInt32LE(palette.length,paletteTable+12);const row=(at,group,index,link,offset,size)=>{out.writeUInt16LE(group,at);out.writeUInt16LE(index,at+2);out.writeUInt16LE(2,at+4);out.writeUInt16LE(2,at+6);out.writeUInt16LE(link,at+12);out[at+14]=10;out[at+15]=8;out.writeUInt32LE(offset,at+16);out.writeUInt32LE(size,at+20);out.writeUInt16LE(0,at+24)};row(spriteTable,10,0,0,palette.length,a.length);row(spriteTable+28,10,1,0,0,0);row(spriteTable+56,20,0,0,palette.length+a.length,b.length);palette.copy(out,literal);a.copy(out,literal+palette.length);b.copy(out,literal+palette.length+a.length);return parseSffBuffer(out,'fixture.sff')}
{
 const archive=fixture(),result=deleteSpritesFromSff(archive,[0]);assert.equal(result.archive.sprites.length,2);assert.deepEqual(result.archive.sprites.map(s=>[s.group,s.number]),[[10,1],[20,0]]);assert.ok(result.archive.sprites[0].dataSize>0,'surviving link materializes its deleted owner payload');assert.ok(result.buffer.length<archive.buffer.length,'deleted unique payload is compacted');assert.deepEqual([...result.buffer.subarray(result.archive.sprites[0].dataOffset,result.archive.sprites[0].dataOffset+result.archive.sprites[0].dataSize)],[4,0,0,0,1,2,3,4]);
}
{
 const archive=fixture(),result=deleteSpritesFromSff(archive,[2]);assert.equal(result.archive.sprites.length,2);assert.equal(result.archive.sprites[1].dataSize,0);assert.equal(result.archive.sprites[1].link,0);assert.deepEqual([...result.buffer.subarray(result.archive.sprites[0].dataOffset,result.archive.sprites[0].dataOffset+result.archive.sprites[0].dataSize)],[4,0,0,0,1,2,3,4]);
}
assert.throws(()=>deleteSpritesFromSff(fixture(),[0,1,2]),/retain at least one sprite/);
{
 const archive=fixture(),result=duplicateSpriteInSff(archive,1,10,2),copy=result.archive.sprites[result.duplicateIndex];
 assert.equal(result.archive.sprites.length,4);assert.deepEqual([copy.group,copy.number],[10,2]);assert.equal(copy.dataSize,0);assert.equal(copy.link,0,'the duplicate reuses the original stored image without copying payload bytes');
}

// SFF v2.0 has a 512-byte header and an explicit TData length at byte 64.
{
 const {createSffBuildSpecificationV2}=require('../src/sff_build_specification_v2'),{createSffV20Raw8Bytes}=require('../src/sff_v20_raw8_writer'),{assertSffV20Raw8}=require('../src/sff_v20_strict_validator');
 const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),pixelsA=Buffer.from([0,1,2,3]),pixelsB=Buffer.from([3,2,1,0]),colors=Array.from({length:256},(_,index)=>[index,index,index,index?255:0]),sourceHash='a'.repeat(64);
 const spec=createSffBuildSpecificationV2({planId:'direct-delete-v20',selection:{targetId:'sff-v2.0',backendId:'ikemaker-builtin-sff-v2.0'},archive:{identity:'delete-v20.sff'},logical:{sourceRoot:'input',sprites:[pixelsA,pixelsB].map((pixels,index)=>({entryId:`sprite:${index}`,group:10,number:index,width:2,height:2,axisX:index,axisY:-index,pixels:{kind:'indexed8',decodedHash:sha(pixels)},paletteEntryId:'palette:0',source:{relativePath:`${index}.png`,byteHash:sourceHash,decodedHash:sha(pixels)}})),palettes:[{entryId:'palette:0',group:1,number:1,colors,source:{relativePath:'a.act',byteHash:sourceHash}}]},encodingIntent:{compression:{default:'raw8'},crop:{default:'none'},storage:{},paletteMode:'embedded',backendOptions:{}}});
 const before=createSffV20Raw8Bytes(spec,{decodedPixelsByEntryId:{'sprite:0':pixelsA,'sprite:1':pixelsB}}),result=deleteSpritesFromSff(parseSffBuffer(before,'v20.sff'),[0]),report=assertSffV20Raw8(result.buffer);
 assert.equal(report.header.firstPaletteHeaderOffset,512);assert.equal(report.header.translatedDataLength,0);assert.equal(report.sprites.length,1);assert.equal(report.sprites[0].number,1);
}

// SFF v2.1 true-color PNG payloads remain byte- and decode-valid.
{
 const {crc32}=require('../src/sff_png8_source'),{createSffBuildSpecification}=require('../src/sff_build_specification'),{createSffV21Bytes}=require('../src/sff_v21_writer'),{assertSffV21Mixed}=require('../src/sff_v21_mixed_strict_validator');
 const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out},png24=pixels=>{const ihdr=Buffer.alloc(13),raw=Buffer.alloc(7);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;raw[0]=0;pixels.copy(raw,1);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])};
 const pixels=[Buffer.from([255,0,0,0,255,0]),Buffer.from([0,0,255,255,255,0])],pngs=pixels.map(png24),sprites=pngs.map((bytes,index)=>({entryId:`rgb:${index}`,group:20,number:index,axisX:index,axisY:0,colorDepth:24,format:'png24',compression:'png24',paletteId:null,duplicatePolicy:'preserve-separate',crop:{mode:'none',axisDeltaX:0,axisDeltaY:0},source:{relativePath:`input/${index}.png`,byteHash:sha(bytes),decodedHash:sha(pixels[index]),width:2,height:1,provenance:{kind:'direct-delete-test'}}})),spec=createSffBuildSpecification({planId:'direct-delete-v21-mixed',sourceRoot:'input',target:{archiveIdentity:'delete-v21.sff',sffVersion:'2.1'},sprites,palettes:[],requirements:['sff-v2.1','sprite-truecolor'],decisions:[],options:{shared:{},backends:{}}}),sources=new Map(pngs.map((bytes,index)=>[`input/${index}.png`,bytes]));
 const before=createSffV21Bytes(spec,{sources}),archive=parseSffBuffer(before,'v21.sff'),result=deleteSpritesFromSff(archive,[0]),report=assertSffV21Mixed(result.buffer),duplicated=duplicateSpriteInSff(archive,1,20,2),duplicateReport=assertSffV21Mixed(duplicated.buffer);
 assert.equal(report.header.paletteTable,64);assert.equal(report.sprites.length,1);assert.equal(report.sprites[0].number,1);assert.equal(report.sprites[0].decodedHash,sha(pixels[1]));
 assert.equal(duplicateReport.sprites.length,3);assert.equal(duplicateReport.sprites[2].number,2);assert.equal(duplicateReport.sprites[2].decodedHash,sha(pixels[1]));
}
console.log('SFF direct delete and duplicate preserve links plus strict v2.0 and true-color v2.1 layouts');
