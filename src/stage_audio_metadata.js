'use strict';
// Reads native source rates. Never infer them from Web Audio's resampled output.
function metadata(bytes,extension){
 if(extension==='flac'){
  if(bytes.length<42||bytes.toString('ascii',0,4)!=='fLaC'||(bytes[4]&127)!==0||bytes.readUIntBE(5,3)!==34)throw Error('Incomplete FLAC STREAMINFO metadata.');
  const packed=bytes.readBigUInt64BE(18),sampleRate=Number(packed>>44n),frames=Number(packed&((1n<<36n)-1n));
  if(!sampleRate||!frames)throw Error('FLAC source sample rate or sample count is unavailable.');return{sampleRate,frames,duration:frames/sampleRate,metadataSource:'FLAC STREAMINFO'};
 }
 if(extension==='ogg'){
  const identification=bytes.indexOf(Buffer.from([1,118,111,114,98,105,115]));if(identification<0||identification+16>bytes.length)throw Error('Missing Vorbis identification packet.');
  const sampleRate=bytes.readUInt32LE(identification+12);let offset=0,frames=0;
  while(offset+27<=bytes.length){if(bytes.toString('ascii',offset,offset+4)!=='OggS')throw Error('Malformed Ogg page sequence.');const segments=bytes[offset+26];if(offset+27+segments>bytes.length)throw Error('Incomplete Ogg page table.');let size=0;for(let i=0;i<segments;i++)size+=bytes[offset+27+i];const next=offset+27+segments+size;if(next>bytes.length)throw Error('Incomplete Ogg page.');const granule=bytes.readBigUInt64LE(offset+6);if(granule<0xffffffffffffffffn&&granule<=BigInt(Number.MAX_SAFE_INTEGER))frames=Math.max(frames,Number(granule));offset=next;}
  if(!sampleRate||!frames)throw Error('Vorbis source sample rate or terminal granule is unavailable.');return{sampleRate,frames,duration:frames/sampleRate,metadataSource:'Vorbis identification rate and Ogg granule positions'};
 }
 if(extension==='mp3'){
  let start=0;if(bytes.toString('ascii',0,3)==='ID3'&&bytes.length>=10)start=10+((bytes[6]&127)*2097152+(bytes[7]&127)*16384+(bytes[8]&127)*128+(bytes[9]&127));
  for(let i=start;i<Math.min(bytes.length-3,start+4096);i++)if(bytes[i]===255&&(bytes[i+1]&224)===224){const version=(bytes[i+1]>>3)&3,index=(bytes[i+2]>>2)&3;if(version===1||index===3)continue;const sampleRate=[44100,48000,32000][index]/(version===3?1:version===2?2:4);return{sampleRate,frames:null,duration:null,metadataSource:'MPEG frame header; encoder-delay/frame-count parity with target decoder remains unverified'};}
 }return null;
}
module.exports={metadata};
