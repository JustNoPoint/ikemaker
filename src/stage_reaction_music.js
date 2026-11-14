'use strict';
const path=require('node:path'),crypto=require('node:crypto'),audio=require('./stage_audio_model');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function settings(track,values){
 const n=(key)=>{const value=Number(values[key]);if(!Number.isSafeInteger(value)||value<0||value>2147483647)throw Error('Music '+key+' must be a nonnegative int32.');return value;},result={volume:n('volume'),start:n('start'),end:n('end'),loop:Number(values.loop)};
 if(![0,1].includes(result.loop)||result.end!==0&&result.end<=result.start)throw Error('Choose valid music loop bounds (end 0 means file end).');
 if((result.start!==0||result.end!==0)&&!['wav','ogg','flac'].includes(track.extension))throw Error('Precise source-frame event loops are verified only for WAV, Ogg Vorbis and FLAC. Use whole-file playback for this format.');
 if((result.start!==0||result.end!==0)&&(!Number.isSafeInteger(track.frames)||!Number.isFinite(track.sampleRate)))throw Error('Source audio frame/rate metadata is unavailable for these loop markers.');
 if(track.frames&&(result.start>=track.frames||result.end>track.frames))throw Error('Event music markers exceed the source frame count.');return result;
}
function draft(track,values,stageFilename){return {stageFilename,filename:track.filename,sourceHash:track.hash,format:track.extension,sampleRate:track.sampleRate??null,frames:track.frames??null,...settings(track,values)};}
function receipt(selection,ownerDef,ownerDefText,returnPolicy='keep',stageDefault=null){
 if(!['keep','stage-default','stop'].includes(returnPolicy))throw Error('Choose an explicit event music Return policy.');
 const relative=path.relative(path.dirname(ownerDef),selection.filename).replace(/\\/g,'/');if(!relative||path.isAbsolute(relative)||/[\r\n";{}#\x00]/.test(relative))throw Error('Event music needs a safely representable reference relative to its exact attached DEF.');
 return {...selection,ownerDef,ownerDefHash:hash(ownerDefText),relative,returnPolicy,stageDefault};
}
function validate(value,evidence,ownerFilename,stageFilename,stageText){
 if(!value)return null;if(!evidence||typeof evidence.ownerDefText!=='string'||!Buffer.isBuffer(evidence.bytes))throw Error('Provide fresh event music and owner DEF evidence.');
 const track=audio.inspect(evidence.bytes,value.filename),checked=receipt(draft(track,value,stageFilename),value.ownerDef,evidence.ownerDefText,value.returnPolicy,value.stageDefault??null);
 if(JSON.stringify(checked)!==JSON.stringify(value))throw Error('Event music owner/source metadata changed. Choose it again.');
 if(!require('./stage_linked_owner_inventory').validateSourceLink(evidence.ownerDefText,value.ownerDef,ownerFilename,evidence.link))throw Error('Event music must be emitted into the exact attached DEF-owned ZSS source.');
 if(value.returnPolicy==='stage-default'){
  const assignment=require('./def_model').unquote(audio.music(stageText,stageFilename,'').assignment);if(!assignment||assignment.includes(','))throw Error('Default Return requires one nonempty Stage music filename. The engine splits commas into candidates, including commas inside filenames; choose Stop/Keep or review the Stage assignment.');
  if(!value.stageDefault||value.stageDefault.assignment!==assignment||!evidence.defaultBytes||hash(evidence.defaultBytes)!==value.stageDefault.sourceHash||evidence.defaultLink?.reference!==assignment||path.resolve(evidence.defaultLink?.from||'')!==path.resolve(stageFilename)||path.resolve(evidence.defaultLink?.to||'')!==path.resolve(value.stageDefault.filename))throw Error('Resolve and revalidate the active Stage default music before default Return.');
  audio.inspect(evidence.defaultBytes,value.stageDefault.filename);
 }
 return checked;
}
function code(value){return value?'playBgm{bgm: '+JSON.stringify(value.relative)+'; volume: '+value.volume+'; loop: '+value.loop+'; loopstart: '+value.start+'; loopend: '+value.end+'; startposition: 0}':'';}
function returnCode(value){return !value||value.returnPolicy==='keep'?'':value.returnPolicy==='stop'?'playBgm{bgm: ""}':'playBgm{source: "stagedef"}';}
const observed=['filename','volume','loop','loopstart','loopend'];
function snapshot(namespace){return observed.map(field=>'mapSet{map: "'+namespace+'_music_'+field+'"; value: bgmVar('+field+')}');}
function owns(namespace){return observed.map(field=>'bgmVar('+field+') = map("'+namespace+'_music_'+field+'")').join(' && ');}
module.exports={settings,draft,receipt,validate,code,returnCode,snapshot,owns};
