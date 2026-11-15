'use strict';
const path=require('node:path');

function integer(value,min,max,label) {
  if (!Number.isSafeInteger(value)||value<min||value>max) throw Error('Invalid '+label+' in cut session.');
  return value;
}

function validate(state) {
  const {sourcePath,sourceHash,frames,sampleRate,options,numbering}=state;
  if (typeof sourcePath!=='string'||!sourcePath.trim()||sourcePath.includes('\0')||
      typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/i.test(sourceHash)) throw Error('Invalid source recording in cut session.');
  integer(frames,0,Number.MAX_SAFE_INTEGER,'frame count');
  integer(sampleRate,1,0xffffffff,'sample rate');
  if (!Array.isArray(state.clips)) throw Error('Missing cut list.');
  let previousEnd=0;
  const clips=state.clips.map(clip=>{
    const start=integer(clip.start,previousEnd,frames,'clip start');
    const end=integer(clip.end,start+1,frames,'clip end');
    if (typeof clip.rejected!=='boolean') throw Error('Invalid clip selection in cut session.');
    previousEnd=end;
    return {start,end,rejected:clip.rejected,...(typeof clip.id==='string'?{id:clip.id,name:clip.name,group:clip.group,index:clip.index}:{})};
  });
  const settings={};
  for(const [key,min,max] of [['thresholdDb',-120,0],['minSilenceMs',1,60000],['paddingMs',0,60000]]) {
    const value=options?.[key];
    if (!Number.isFinite(value)||value<min||value>max) throw Error('Invalid '+key+' in cut session.');
    settings[key]=value;
  }
  const ids={
    group:integer(numbering?.group,0,0x7fffffff,'group'),
    startIndex:integer(numbering?.startIndex,0,0x7fffffff,'start index'),
    batchStart:integer(numbering?.batchStart,1,0x7fffffff,'batch start'),
    batchCount:integer(numbering?.batchCount,1,4096,'batch count')
  };
  let history;
  if (state.history) {
    const {origin, imports} = state.history;
    if (origin?.hash !== sourceHash || !Array.isArray(origin.aliases) || !Array.isArray(imports)) throw Error('Invalid recording history.');
    for (const location of [origin,...origin.aliases]) {
      if (typeof location.path !== 'string' || !location.path || typeof location.deviceLabel !== 'string') throw Error('Invalid recording location.');
    }
    const clipIds = new Set(clips.map(clip => clip.id));
    for (const item of imports) {
      if (!item || typeof item.importId !== 'string' || typeof item.destination !== 'string' || !Array.isArray(item.entries)) throw Error('Invalid recording placement.');
      for (const entry of item.entries) {
        if (!clipIds.has(entry.clipId) || !/^[a-f0-9]{64}$/i.test(entry.wavHash)) throw Error('Invalid recording placement entry.');
        for (const field of ['group','index','entryIndex']) integer(entry[field],0,0x7fffffff,field);
      }
    }
    history = {origin,imports};
  }
  return {sourcePath,sourceHash:sourceHash.toLowerCase(),sampleRate,frames,clips,options:settings,numbering:ids,...(history?{history}:{})};
}

function encode(sessionPath,state) {
  const value=validate(state);
  value.clips=require('./snd_voice_cut_library').identify(value.clips,value.clips);
  require('./snd_voice_cut_library').validateClips(value.clips);
  value.sourcePath=path.relative(path.dirname(path.resolve(sessionPath)),path.resolve(value.sourcePath)).split(path.sep).join('/');
  return JSON.stringify({schema:'ikemaker.voice-cuts',version:2,...value})+'\n';
}

function decode(sessionPath,text) {
  const raw=JSON.parse(String(text).replace(/^\uFEFF/,''));
  if (raw?.schema!=='ikemaker.voice-cuts'||![1,2].includes(raw.version)) throw Error('Unsupported voice cut session.');
  const value=validate(raw);
  if(raw.version===2)require('./snd_voice_cut_library').validateClips(value.clips);
  value.sourcePath=path.resolve(path.dirname(sessionPath),value.sourcePath);
  return value;
}
module.exports={encode,decode};
