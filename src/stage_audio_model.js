'use strict';
const path=require('path');
const fs=require('fs');
const {parseDef,sectionMap,setSectionEntry}=require('./def_model');
const {wavInfo,soundPeaks}=require('./snd_reader');
const {hash}=require('./mutation_safety');
const FORMATS=['wav','ogg','mp3','flac','mid','midi','xm','mod','it','s3m'];
const SLOT=/^(?:|round[1-9]\d{0,2}\.|final\.|life\.|victory\.)$/;
function slot(value){if(typeof value!=='string'||!SLOT.test(value))throw Error('Choose a supported music slot.');return value;}
function music(text,filename,prefix=''){
 slot(prefix);const sections=parseDef(text,filename).sections.filter(s=>s.normalized==='music');
 if(sections.length>1)throw Error('Multiple Music sections require source review before authoring.');
 const fields={},authoredKeys={};
 for(const [key,aliases]of Object.entries({bgmusic:['bgmusic','bgm'],bgmvolume:['bgmvolume','bgm.volume'],bgmloopstart:['bgmloopstart','bgm.loopstart'],bgmloopend:['bgmloopend','bgm.loopend'],bgmloop:['bgmloop','bgm.loop']})){
  const matching=(sections[0]?.entries||[]).filter(e=>aliases.some(alias=>e.normalized===prefix+alias));
  if(matching.length>1)throw Error('Repeated or aliased '+prefix+key+' entries require source review before editing this music slot.');
  if(matching.length){fields[key]=matching[0].value;authoredKeys[key]=matching[0].key;}
 }
 return {assignment:fields.bgmusic||'',volume:fields.bgmvolume||'100',start:fields.bgmloopstart||'0',end:fields.bgmloopend||'0',loop:fields.bgmloop||'1',authoredKeys};
}
function inspect(bytes,filename){
 const extension=path.extname(filename).slice(1).toLowerCase();if(!FORMATS.includes(extension))throw Error('Unsupported target-engine music extension.');
 if(!bytes.length)throw Error('The music file is empty.');
 const boundedPreview=bytes.length<=64*1024*1024;
 let info=null,peaks=[];
 const ascii=(start,end)=>bytes.toString('ascii',start,end);
 if(extension==='ogg'&&(ascii(0,4)!=='OggS'||bytes.indexOf(Buffer.from('vorbis'))<0))throw Error('Expected Ogg Vorbis audio for this engine format.');
 if(extension==='flac'&&ascii(0,4)!=='fLaC')throw Error('Invalid FLAC header.');
 if(['mid','midi'].includes(extension)&&ascii(0,4)!=='MThd')throw Error('Invalid MIDI header.');
 if(extension==='xm'&&ascii(0,17)!=='Extended Module: ')throw Error('Invalid XM header.');
 if(extension==='it'&&ascii(0,4)!=='IMPM')throw Error('Invalid IT header.');
 if(extension==='s3m'&&(bytes.length<48||ascii(44,48)!=='SCRM'))throw Error('Invalid S3M header.');
 if(extension==='mod'&&bytes.length<1084)throw Error('Incomplete MOD audio.');
 if(extension==='mp3'){
  let at=0;if(ascii(0,3)==='ID3'){if(bytes.length<10)throw Error('Incomplete MP3 tag.');at=10+((bytes[6]&127)*2097152+(bytes[7]&127)*16384+(bytes[8]&127)*128+(bytes[9]&127));}
  let valid=false;for(let i=at;i<Math.min(bytes.length-3,at+4096);i++)if(bytes[i]===255&&(bytes[i+1]&224)===224&&(bytes[i+1]&24)!==8&&(bytes[i+1]&6)!==0&&(bytes[i+2]&240)!==0&&(bytes[i+2]&240)!==240&&(bytes[i+2]&12)!==12){valid=true;break;}
  if(!valid)throw Error('No valid MP3 frame header was found.');
 }
 if(extension==='wav'){
  info=wavInfo(bytes);if(!info.valid||!info.dataSize||!info.sampleRate||!info.blockAlign||info.dataOffset+info.dataSize>bytes.length)throw Error('Incomplete or invalid WAV audio.');
  const frames=Math.floor(info.dataSize/info.blockAlign);if(!frames)throw Error('The WAV contains no sample frames.');
  info={sampleRate:info.sampleRate,frames,duration:frames/info.sampleRate};
  if(boundedPreview)peaks=soundPeaks({buffer:bytes},{dataOffset:0,dataSize:bytes.length});
 }
 if(['ogg','flac','mp3'].includes(extension))info=require('./stage_audio_metadata').metadata(bytes,extension);
 // Other supported formats retain native frame inputs. Browser resampling must never determine engine loop units.
 return {filename,hash:hash(bytes),extension,sampleRate:info?.sampleRate||null,frames:info?.frames||null,duration:info?.duration||null,metadataSource:info?.metadataSource||'WAV format/data chunks',peaks,candidates:boundedPreview&&extension==='wav'?loopCandidates(bytes):[],
  preview:boundedPreview&&['wav','ogg','mp3','flac'].includes(extension)?`data:audio/${{wav:'wav',ogg:'ogg',mp3:'mpeg',flac:'flac'}[extension]};base64,${bytes.toString('base64')}`:'',
  note:(info?'Loop units: source sample frames (end exclusive).':'Native format supported by pinned IKEMEN. Precise waveform-to-frame mapping unavailable; existing loops are preserved unless explicitly edited.')+(!boundedPreview?' File exceeds the 64 MiB browser preview budget; assignment remains available.':'')};
}
function loopCandidates(bytes){
 const info=wavInfo(bytes);if(!info.valid||info.format!==1||info.bitsPerSample!==16||!info.blockAlign||!info.sampleRate)return [];
 const frames=Math.floor(info.dataSize/info.blockAlign);if(frames<info.sampleRate)return [];
 const sample=frame=>bytes.readInt16LE(info.dataOffset+frame*info.blockAlign)/32768;
 const crossing=frame=>frame>0&&frame<frames-32&&sample(frame-1)<=0&&sample(frame)>0;
 const nearby=center=>{const result=[];for(let frame=Math.max(32,center-1024);frame<Math.min(frames-32,center+1024);frame++)if(crossing(frame))result.push(frame);return result;};
 const ends=nearby(frames-1025),candidates=[];
 for(const ratio of [.25,.333333,.5]){
  const starts=nearby(Math.floor(frames*ratio));let best=null;
  for(const start of starts.filter((_,i)=>i%Math.max(1,Math.ceil(starts.length/24))===0))for(const end of ends.filter((_,i)=>i%Math.max(1,Math.ceil(ends.length/24))===0)){
   if(end-start<info.sampleRate/2)continue;let error=0,energy=0;for(let offset=-16;offset<16;offset++){const a=sample(start+offset),b=sample(end+offset);error+=(a-b)**2;energy+=a*a+b*b;}if(energy<.00001)continue;const score=error/energy;if(!best||score<best.score)best={start,end,score};
  }if(best&&!candidates.some(c=>Math.abs(c.start-best.start)<1024))candidates.push(best);
 }
 return candidates.sort((a,b)=>a.score-b.score).slice(0,3).map((candidate,index)=>({...candidate,label:'Boundary match '+(index+1)+' · '+candidate.start+' → '+candidate.end,reason:'Positive zero-crossings with similar 32-frame boundary windows. This is a signal match, not beat detection; audition and edit before Apply.'}));
}
function assignmentPath(filename,track,root){
 const target=path.resolve(track),base=path.resolve(root||path.dirname(filename)),relative=path.relative(base,target);
 if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('Reference must be inside the game project. Choose approved copy/import for external audio.');
 if(fs.existsSync(base)){
  let existing=target;const tail=[];while(!fs.existsSync(existing)){tail.unshift(path.basename(existing));const parent=path.dirname(existing);if(parent===existing)break;existing=parent;}
  const physical=path.resolve(fs.realpathSync(existing),...tail),physicalRelative=path.relative(fs.realpathSync(base),physical);
  if(physicalRelative==='..'||physicalRelative.startsWith('..'+path.sep)||path.isAbsolute(physicalRelative))throw Error('Audio path resolves outside the game project through a link.');
 }
 const value=relative.replace(/\\/g,'/');if(/[\r\n;,"\x00]/.test(value))throw Error('This audio path cannot be represented safely in a Stage music assignment.');return value;
}
function apply(text,filename,draft){
 slot(draft.slot);const current=music(text,filename,draft.slot);
 if(typeof draft.assignment!=='string'||!draft.assignment||/[\r\n;,"\x00]/.test(draft.assignment))throw Error('Choose one safely representable audio file; authored track lists are preserved until explicitly replaced.');
 const integer=(value,max)=>{if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error('Use a nonnegative integer within the supported range.');return Number(value);};
 const volume=integer(draft.volume,2147483647),start=integer(draft.start,2147483647),end=integer(draft.end,2147483647);
 if(end!==0&&end<=start)throw Error('Loop end must follow loop start, or be 0 for file end.');
 if(draft.frames&&(start>=draft.frames||end>draft.frames))throw Error('Loop markers exceed the source audio frame count.');
 if(![0,1].includes(draft.loop))throw Error('Loop must be enabled or disabled.');
 let next=text;if(!parseDef(next,filename).sections.some(s=>s.normalized==='music'))next+=(next.endsWith('\n')?'':'\n')+'\n[Music]\n';
 for(const [key,value] of Object.entries({bgmusic:draft.assignment,bgmvolume:volume,bgmloopstart:start,bgmloopend:end,bgmloop:draft.loop})){
  const document=parseDef(next,filename),section=document.sections.find(s=>s.normalized==='music');next=setSectionEntry(document,section.line,current.authoredKeys[key]||draft.slot+key,String(value));
 }return next;
}
function removeTrack(text,filename,prefix=''){
 const current=music(text,filename,prefix);
 if(!current.authoredKeys.bgmusic)throw Error('This slot has no authored track assignment to remove.');
 const section=parseDef(text,filename).sections.find(s=>s.normalized==='music'),entry=section.entries.find(e=>e.key===current.authoredKeys.bgmusic);
 const lines=text.split(/(\r\n|\r|\n)/);
 lines[entry.line*2]='; Removed track assignment: '+lines[entry.line*2];
 return lines.join('');
}
function validMessage(message){
 if(!message||message.type!=='stageAudio'||!Number.isSafeInteger(message.generation))return false;
 const keys=Object.keys(message).sort().join(','),base='generation,operation,type';
 if(['open','choose','project','cancel','sounds','waveform','removeTrack'].includes(message.operation))return keys===base;
 if(message.operation==='slot')return keys==='generation,operation,slot,type'&&typeof message.slot==='string'&&SLOT.test(message.slot);
 if(message.operation==='apply')return keys==='end,generation,loop,mode,operation,start,type,volume'&&['reference','copy'].includes(message.mode)&&[0,1].includes(message.loop)&&['start','end','volume'].every(k=>typeof message[k]==='string'&&/^\d{1,10}$/.test(message[k]));
 if(message.operation==='event')return keys==='end,generation,loop,operation,start,type,volume'&&[0,1].includes(message.loop)&&['start','end','volume'].every(k=>typeof message[k]==='string'&&/^\d{1,10}$/.test(message[k]));
 return false;
}
module.exports={FORMATS,slot,music,inspect,loopCandidates,assignmentPath,apply,removeTrack,validMessage};
