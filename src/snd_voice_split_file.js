'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {waveFormat, detector, clipBuffer} = require('./snd_voice_split');

async function readAt(file, buffer, position) {
  let used = 0;
  while (used < buffer.length) {
    const {bytesRead} = await file.read(buffer, used, buffer.length - used, position + used);
    if (!bytesRead) throw Error('The recording ended unexpectedly.');
    used += bytesRead;
  }
  return buffer;
}

async function metadata(file, size) {
  const header = await readAt(file, Buffer.alloc(12), 0);
  if (header.toString('ascii',0,4) !== 'RIFF' || header.toString('ascii',8) !== 'WAVE' || header.readUInt32LE(4)+8 !== size) {
    throw Error('Choose a complete RIFF/WAVE recording.');
  }
  let fmt, offset, dataSize;
  const chunk = Buffer.alloc(8);
  for (let pos=12; pos<size;) {
    await readAt(file,chunk,pos);
    const id=chunk.toString('ascii',0,4), length=chunk.readUInt32LE(4), start=pos+8;
    pos=start+length+(length&1);
    if (pos>size) throw Error('Incomplete WAV chunk.');
    if (id==='fmt ') {
      if (fmt || length<16 || length>65554) throw Error('Invalid WAV format description.');
      fmt=await readAt(file,Buffer.alloc(length),start);
    } else if (id==='data') {
      if (offset!==undefined) throw Error('Choose a WAV with one continuous audio data chunk.');
      offset=start; dataSize=length;
    }
  }
  if (!fmt || offset===undefined) throw Error('Missing WAV format or audio data.');
  return {...waveFormat(fmt,dataSize),offset,dataSize};
}

async function withRecording(filename, action) {
  // A cloud provider can update file attributes on the first read. Retry once
  // on the same open handle when only ctime changed, discarding that first read.
  const file=await fs.open(filename,'r');
  try {
    let before=await file.stat();
    if (!before.isFile()) throw Error('Choose a WAV file.');
    for(let attempt=0;attempt<2;attempt++){
      const result=await action(file,before.size);
      const after=await fs.stat(filename);
      if(after.dev!==before.dev || after.ino!==before.ino || after.size!==before.size ||
          after.mtimeMs!==before.mtimeMs) break;
      if(after.ctimeMs===before.ctimeMs)return result;
      before=after;
    }
    throw Error('The recording changed while it was being read.');
  } finally { await file.close(); }
}

async function hashRange(file,hash,start,end,buffer) {
  for (let at=start; at<end; at+=buffer.length) hash.update(await readAt(file,buffer.subarray(0,Math.min(buffer.length,end-at)),at));
}

async function hashHandle(file,size) {
  const hash=crypto.createHash('sha256');
  await hashRange(file,hash,0,size,Buffer.allocUnsafe(1024*1024));
  return hash.digest('hex');
}

function hashFile(filename) { return withRecording(filename,hashHandle); }

function inspectFile(filename) {
  return withRecording(filename,async (file,size)=>{
    const {sampleRate,frames}=await metadata(file,size);
    return {sampleRate,frames};
  });
}

function analyzeFile(filename,options={}) {
  return withRecording(filename,async (file,size)=>{
    const wave=await metadata(file,size), scan=detector(wave,options);
    const block=Buffer.allocUnsafe(Math.max(1,Math.floor(1024*1024/wave.align))*wave.align);
    const hash=crypto.createHash('sha256');
    await hashRange(file,hash,0,wave.offset,block);
    for (let at=0; at<wave.dataSize; at+=block.length) {
      const bytes=await readAt(file,block.subarray(0,Math.min(block.length,wave.dataSize-at)),wave.offset+at);
      hash.update(bytes);
      scan.scan(bytes,at/wave.align);
    }
    await hashRange(file,hash,wave.offset+wave.dataSize,size,block);
    return {...scan.finish(),sourceHash:hash.digest('hex')};
  });
}

function clipFile(filename,start,end,maxBytes=Infinity) {
  return withRecording(filename,async (file,size)=>{
    const wave=await metadata(file,size), {out,payload}=clipBuffer(wave,start,end,maxBytes);
    await readAt(file,payload,wave.offset+start*wave.align);
    return out;
  });
}
module.exports={analyzeFile,clipFile,hashFile,inspectFile};
