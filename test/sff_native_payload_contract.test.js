'use strict';

const assert = require('assert');
const { createExtractionSnapshot } = require('../src/sff_extraction_scope_contract');
const { inspectNativeSprite, copyNativeBytes } = require('../src/sff_native_payload_contract');
const { indexedSourcePng } = require('../src/sff_reader');
function v2() {
  const colors=Array.from({length:256},(_,i)=>[i,i,i,i?255:0]), png=indexedSourcePng(1,1,Buffer.from([0]),colors), prefix=Buffer.alloc(4); prefix.writeUInt32LE(1); const stored = Buffer.concat([prefix, png]), out = Buffer.alloc(120+stored.length);
  out.write('ElecbyteSpr\0',0,'latin1'); out[15]=2; out[13]=1; out.writeUInt32LE(64,36); out.writeUInt32LE(2,40); out.writeUInt32LE(120,52); out.writeUInt16LE(1,4+64); out.writeUInt16LE(1,6+64); out[14+64]=10; out[15+64]=8; out.writeUInt32LE(0,16+64); out.writeUInt32LE(stored.length,20+64); stored.copy(out,120);
  const at=92; out.writeUInt16LE(1,at+2); out.writeUInt16LE(1,at+4); out.writeUInt16LE(1,at+6); out.writeUInt16LE(0,at+12); out[at+14]=10; out[at+15]=8; out.writeUInt32LE(0,at+20); return out;
}
const bytes=v2(), snapshot=createExtractionSnapshot({archiveBytes:bytes,resourceIdentity:'native.sff'});
const native=inspectNativeSprite(snapshot,bytes,0); assert.strictEqual(native.kind,'embedded-native-image'); assert.strictEqual(native.offset,124); assert(copyNativeBytes(bytes,native).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
const linked=inspectNativeSprite(snapshot,bytes,1); assert.strictEqual(linked.kind,'linked-no-own-payload'); assert.strictEqual(linked.resolvedDataOwnerPhysicalIndex,0); assert.throws(()=>copyNativeBytes(bytes,linked),/no native bytes/);
const changed=Buffer.from(bytes); changed[127]^=1; assert.throws(()=>inspectNativeSprite(snapshot,changed,0),/drifted/);
const badPrefix=Buffer.from(bytes); badPrefix.writeUInt32LE(2,120); const badPrefixSnapshot=createExtractionSnapshot({archiveBytes:badPrefix,resourceIdentity:'bad-prefix.sff'}); assert.throws(()=>inspectNativeSprite(badPrefixSnapshot,badPrefix,0),/declares 2/);
const badPng=Buffer.from(bytes); badPng[badPng.length-5]^=1; const badPngSnapshot=createExtractionSnapshot({archiveBytes:badPng,resourceIdentity:'bad-png.sff'}); assert.throws(()=>inspectNativeSprite(badPngSnapshot,badPng,0),/CRC|PNG/);

function v1(paletteSame=false) {
  const headerOffset=32, payload=Buffer.alloc(897), out=Buffer.alloc(headerOffset+32+payload.length); payload[0]=0x0a; payload[2]=1; payload[3]=8; payload[65]=1; payload[payload.length-769]=0x0c; out.writeUInt32LE(payload.length,headerOffset+4); out[headerOffset+18]=paletteSame?1:0; payload.copy(out,headerOffset+32); return out;
}
const parseV1 = buffer => ({header:{version:[1,0,1,0]},sprites:[{group:0,number:0,width:1,height:1,axisX:0,axisY:0,paletteIndex:0,dataSize:897,format:0,colorDepth:8,dataOffset:64,headerOffset:32,legacy:true}]});
const legacy=v1(), legacySnapshot=createExtractionSnapshot({archiveBytes:legacy,resourceIdentity:'legacy.sff'},{parse:parseV1}); const legacyNative=inspectNativeSprite(legacySnapshot,legacy,0,{parse:parseV1}); assert.strictEqual(legacyNative.kind,'embedded-native-image'); assert.strictEqual(legacyNative.mediaType,'image/x-pcx');
const suppressed=v1(true), suppressedSnapshot=createExtractionSnapshot({archiveBytes:suppressed,resourceIdentity:'suppressed.sff'},{parse:parseV1}); assert.strictEqual(inspectNativeSprite(suppressedSnapshot,suppressed,0,{parse:parseV1}).kind,'archive-native-payload');
console.log('SFF native inspection separates embedded images, archive payloads, and linked entries');
