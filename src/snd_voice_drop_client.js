'use strict';
function readVoicePayload(dataTransfer){
 const prefix='IKEMAKER_VOICE_CUT_V1:',custom=dataTransfer?.getData('application/x-ikemaker-voice-cut-ticket')||'',plain=dataTransfer?.getData('text/plain')||'',raw=custom||(plain.startsWith(prefix)?plain.slice(prefix.length):'');
 if(!raw||raw.length>1024*1024)return '';try{const value=JSON.parse(raw);if(!/^[a-f0-9]{64}$/.test(value.ticket)||!Number.isSafeInteger(value.revision)||value.revision<1||!Array.isArray(value.ids)||!value.ids.length||value.ids.length>4096||new Set(value.ids).size!==value.ids.length||value.ids.some(id=>typeof id==='string'?!/^[a-zA-Z0-9-]{1,64}$/.test(id):!Number.isSafeInteger(id)||id<0))return '';return JSON.stringify({ticket:value.ticket,revision:value.revision,ids:value.ids});}catch{return '';}
}
function installVoiceDrop({root,post,model,selected,readPayload}){
 const MIME='application/x-ikemaker-voice-cut-ticket';
 const matches=event=>Array.from(event.dataTransfer?.types||[]).some(type=>type===MIME||type==='text/plain');
 root.addEventListener('dragover',event=>{if(!matches(event))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';});
 root.addEventListener('drop',event=>{if(event.voiceCutHandled)return;const payload=readPayload(event.dataTransfer);if(!payload)return;event.voiceCutHandled=true;event.preventDefault();event.stopPropagation();const row=event.target.closest('[data-sound-archive-index]');const index=row?Number(row.dataset.soundArchiveIndex):selected()?.archiveIndex;post({type:'dropVoiceCuts',payload,index,generation:model.generation,sourceFingerprint:model.sourceFingerprint});});
}
module.exports={installVoiceDrop,readVoicePayload};
