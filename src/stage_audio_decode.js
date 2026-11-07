'use strict';
const {spawn}=require('child_process');
const {soundPeaks}=require('./snd_reader');
const {loopCandidates}=require('./stage_audio_model');
function run(executable,args,{limit=32*1024*1024,timeout=15000,spawnProcess=spawn}={}){
 return new Promise((resolve,reject)=>{
  const child=spawnProcess(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']}),chunks=[];let size=0,errorText='',failure=null,finished=false;
  const stop=error=>{failure=error;child.kill();};const timer=setTimeout(()=>stop(Error('Waveform decoder exceeded the 15-second budget.')),timeout);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>limit)return stop(Error('Decoded waveform exceeds the 32 MiB memory budget.'));chunks.push(chunk);});
  child.stderr.on('data',chunk=>{if(errorText.length<4000)errorText+=chunk.toString();});
  child.once('error',error=>{if(finished)return;finished=true;clearTimeout(timer);reject(Error('Configured ffmpeg is unavailable: '+error.message));});
  child.once('close',code=>{if(finished)return;finished=true;clearTimeout(timer);if(failure)return reject(failure);if(code!==0)return reject(Error('Configured ffmpeg failed: '+errorText.trim()));resolve(Buffer.concat(chunks));});
 });
}
async function decodeWaveform(track,executable,options={}){
 if(!['ogg','flac'].includes(track.extension)||!track.sampleRate||!track.frames)throw Error('Precise compressed waveform decoding currently requires Vorbis or FLAC native sample metadata.');
 const version=await run(executable,['-version'],{...options,limit:64000,timeout:3000});if(!version.toString().startsWith('ffmpeg version '))throw Error('Configured executable did not identify itself as ffmpeg.');
 // No -ar: preserve source native sample rate. Mono mix affects visual amplitude only, not sample-frame positions.
 const pcm=await run(executable,['-hide_banner','-loglevel','error','-nostdin','-i',track.filename,'-map','0:a:0','-ac','1','-f','s16le','pipe:1'],options);
 if(pcm.length%2||pcm.length/2!==track.frames)throw Error('Decoder sample count differs from source metadata. Exact waveform frame mapping is unavailable; use native frame inputs and verify in the target engine.');
 const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(track.sampleRate,24);wav.writeUInt32LE(track.sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
 return {peaks:soundPeaks({buffer:wav},{dataOffset:0,dataSize:wav.length}),candidates:loopCandidates(wav),note:'Decoded read-only waveform at original '+track.sampleRate+' Hz; frame count matches '+track.metadataSource+'. Browser boundary timing remains approximate. Verify in IKEMEN.'};
}
module.exports={run,decodeWaveform};
