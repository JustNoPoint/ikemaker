'use strict';
const zlib=require('node:zlib'),crypto=require('node:crypto'),{crc32,readIndexedPng8}=require('./sff_png8_source');
function chunk(type,data){const name=Buffer.from(type,'ascii'),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out;}
function chunks(buffer){const rows=[];for(let offset=8;offset<buffer.length;){const end=offset+buffer.readUInt32BE(offset)+12;rows.push({type:buffer.toString('latin1',offset+4,offset+8),bytes:buffer.subarray(offset,end),data:buffer.subarray(offset+8,end-4)});offset=end;}return rows;}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Evaluation only: no file writes, writer flags or automatic adoption. Keep the
// original filtered scanlines and every non-IDAT chunk byte-for-byte.
function evaluatePng8Recompression(buffer,options={}){
 const before=readIndexedPng8(buffer,options),rows=chunks(buffer),compressed=Buffer.concat(rows.filter(row=>row.type==='IDAT').map(row=>row.data)),raw=zlib.inflateSync(compressed,{maxOutputLength:before.height*(before.width+1)}),deflated=zlib.deflateSync(raw,{level:9,strategy:zlib.constants.Z_DEFAULT_STRATEGY,memLevel:8}),parts=[buffer.subarray(0,8)];let emitted=false;
 for(const row of rows){if(row.type!=='IDAT')parts.push(row.bytes);else if(!emitted){parts.push(chunk('IDAT',deflated));emitted=true;}}
 const candidate=Buffer.concat(parts),after=readIndexedPng8(candidate,options),nonIdatBefore=Buffer.concat(rows.filter(row=>row.type!=='IDAT').map(row=>row.bytes)),nonIdatAfter=Buffer.concat(chunks(candidate).filter(row=>row.type!=='IDAT').map(row=>row.bytes));
 if(before.width!==after.width||before.height!==after.height||!before.indices.equals(after.indices)||JSON.stringify(before.colors)!==JSON.stringify(after.colors)||!nonIdatBefore.equals(nonIdatAfter))throw Error('PNG recompression changed reviewed index/palette/alpha/metadata bytes.');
 const smaller=candidate.length<buffer.length;
 return{buffer:smaller?candidate:Buffer.from(buffer),accepted:smaller,originalBytes:buffer.length,candidateBytes:candidate.length,outputBytes:smaller?candidate.length:buffer.length,savedBytes:smaller?buffer.length-candidate.length:0,sourceHash:sha(buffer),candidateHash:sha(candidate),outputHash:sha(smaller?candidate:buffer),decodedHash:before.decodedHash,nonIdatHash:sha(nonIdatBefore),width:before.width,height:before.height,metadataPreserved:true,indexPaletteAlphaPreserved:true,algorithm:'original PNG filtered scanlines; zlib deflate level9/default strategy/memLevel8; retain original unless smaller',runtime:{node:process.versions.node,zlib:process.versions.zlib},runtimeVerified:false};
}
module.exports={evaluatePng8Recompression};
