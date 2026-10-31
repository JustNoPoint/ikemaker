'use strict';
const assert=require('assert'),zlib=require('zlib'),p=require('../src/palette_indexed_png');
const signature=Buffer.from('89504e470d0a1a0a','hex');
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(p.crc32(out.subarray(4,8+data.length)),8+data.length);return out}
function split(bytes){const out=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at);out.push({type:bytes.toString('ascii',at+4,at+8),data:Buffer.from(bytes.subarray(at+8,at+8+size))});at+=size+12}return out}
function compose(items){return Buffer.concat([signature,...items.map(item=>chunk(item.type,item.data))])}
const colors=Array.from({length:256},(_,i)=>[i,255-i,i%17,i===0?0:i===1?128:255]),indices=Buffer.from([0,1,2,3,1,0,3,2]),shape={width:4,height:2};
for(const bitDepth of[1,2,4,8]){const max=2**bitDepth,plane=Buffer.from(indices.map(v=>v%max)),bytes=p.encodeIndexedPng(shape,plane,colors,{bitDepth}),decoded=p.readIndexedPng(bytes);assert.strictEqual(decoded.bitDepth,bitDepth);assert(decoded.indices.equals(plane));assert.deepStrictEqual(decoded.colors[0],[0,255,0,0]);if(max>1)assert.strictEqual(decoded.colors[1][3],128)}
let bytes=p.encodeIndexedPng(shape,indices,colors),bad=Buffer.from(bytes);bad[bad.length-1]^=1;assert.throws(()=>p.readIndexedPng(bad),/CRC/);assert.throws(()=>p.readIndexedPng(bytes,{maximumPixels:2}),/dimensions/);assert.throws(()=>p.readIndexedPng(bytes.subarray(0,bytes.length-2)),/truncated|IEND/);assert.throws(()=>p.encodeIndexedPng(shape,Buffer.from([2,0,0,0,0,0,0,0]),colors,{bitDepth:1}),/capacity/);
const parts=split(bytes),ihdr=parts.find(item=>item.type==='IHDR'),idat=parts.find(item=>item.type==='IDAT');
assert.throws(()=>p.readIndexedPng(compose([parts[0],idat,...parts.filter(item=>!['IHDR','IDAT'].includes(item.type))])),/ordering/);
assert.throws(()=>p.readIndexedPng(compose([parts[0],{type:'ABCD',data:Buffer.alloc(0)},...parts.slice(1)])),/unknown critical/);
assert.throws(()=>p.readIndexedPng(compose([parts[0],{type:'acTL',data:Buffer.alloc(8)},...parts.slice(1)])),/Animated PNG/);
const interlaced={type:'IHDR',data:Buffer.from(ihdr.data)};interlaced.data[12]=1;assert.throws(()=>p.readIndexedPng(compose([interlaced,...parts.slice(1)])),/interlace/);
const tooWide={type:'IHDR',data:Buffer.from(ihdr.data)};tooWide.data.writeUInt32BE(9000,0);assert.throws(()=>p.readIndexedPng(compose([tooWide,...parts.slice(1)])),/dimensions/);
assert.throws(()=>p.readIndexedPng(compose(parts.filter(item=>item.type!=='IDAT'))),/ordering|image data/);
assert.throws(()=>p.readIndexedPng(compose(parts.map(item=>item.type==='IEND'?{type:'IEND',data:Buffer.from([0])}:item))),/zero-length IEND/);
const shortRaw=Buffer.alloc(1);assert.throws(()=>p.readIndexedPng(compose(parts.map(item=>item.type==='IDAT'?{type:'IDAT',data:zlib.deflateSync(shortRaw)}:item))),/scanline size/);
const overRaw=Buffer.alloc(1000);assert.throws(()=>p.readIndexedPng(compose(parts.map(item=>item.type==='IDAT'?{type:'IDAT',data:zlib.deflateSync(overRaw)}:item))),/inflate failed|exceeded limits/);
assert.throws(()=>p.readIndexedPng(bytes,{maximumChunks:3}),/chunk-count/);
console.log('Indexed PNG bit-depth, alpha, CRC, structural ordering, APNG, inflate, truncation, and limit tests passed');
