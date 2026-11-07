'use strict';
const path=require('node:path'),{decodeStrictJsonArtifact}=require('./sff_strict_json_artifact');
const KEYS=['schema','version','kind','sourceFile','sourceByteHash','sourceOrdinal','sourceFrameCount','role','delayMs','timingAvailable','gifLoopCount'];
function validate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join('|')!==[...KEYS].sort().join('|')||raw.schema!=='ikemaker.guided-gif-air'||raw.version!==1||raw.kind!=='guided-image-intake'||raw.role!=='gif-frame')throw Error('Guided GIF AIR provenance schema is invalid. Choose the GIF again.');
 if(typeof raw.sourceFile!=='string'||raw.sourceFile.length>4096||!path.isAbsolute(raw.sourceFile)||!/\.gif$/i.test(raw.sourceFile)||typeof raw.sourceByteHash!=='string'||!/^[a-f0-9]{64}$/.test(raw.sourceByteHash))throw Error('Guided GIF AIR source path/hash is invalid.');
 if(!Number.isSafeInteger(raw.sourceFrameCount)||raw.sourceFrameCount<1||raw.sourceFrameCount>4096||!Number.isSafeInteger(raw.sourceOrdinal)||raw.sourceOrdinal<0||raw.sourceOrdinal>=raw.sourceFrameCount)throw Error('Guided GIF AIR frame order/count is invalid.');
 if(typeof raw.timingAvailable!=='boolean'||raw.delayMs!==null&&(typeof raw.delayMs!=='number'||!Number.isFinite(raw.delayMs)||raw.delayMs<0||raw.delayMs>86400000)||raw.timingAvailable&&!(raw.delayMs>0))throw Error('Guided GIF AIR timing must be a verified positive delay or explicitly unavailable.');
 if(raw.gifLoopCount!==null&&(!Number.isSafeInteger(raw.gifLoopCount)||raw.gifLoopCount<0||raw.gifLoopCount>65535))throw Error('Guided GIF AIR loop metadata is invalid.');
 return Object.freeze({...raw});
}
function serializeGuidedGifAir(provenance){
 if(provenance?.kind!=='guided-image-intake'||provenance.role!=='gif-frame')return'';
 const descriptor=validate({schema:'ikemaker.guided-gif-air',version:1,kind:provenance.kind,sourceFile:provenance.sourceFile,sourceByteHash:typeof provenance.sourceByteHash==='string'?provenance.sourceByteHash.toLowerCase():provenance.sourceByteHash,sourceOrdinal:provenance.sourceOrdinal,sourceFrameCount:provenance.sourceFrameCount,role:provenance.role,delayMs:provenance.delayMs??null,timingAvailable:provenance.timingAvailable,gifLoopCount:provenance.gifLoopCount??null});return JSON.stringify(descriptor);
}
function parseGuidedGifAir(text){if(text===undefined||text===null||text==='')return null;if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>16384)throw Error('Guided GIF AIR provenance exceeds its bounded manifest column.');return validate(decodeStrictJsonArtifact(Buffer.from(text,'utf8'),'guided GIF AIR provenance').parsed);}
module.exports={serializeGuidedGifAir,parseGuidedGifAir};
