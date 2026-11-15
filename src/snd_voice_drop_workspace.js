'use strict';
async function importDrop({vscode,archive,payload,defaultGroup=0,defaultIndex=0,assertDestination,apply,materialized:prepared,entityId}){
 let request;if(prepared)request={};else try{request=JSON.parse(payload);}catch{throw Error('The voice drag is invalid. Drag reviewed clips again.');}
 const ticket=prepared?{describe:'Selected reviewed voice cuts',assertCurrent:()=>{},materialize:async()=>prepared}:require('./snd_voice_drag').consume(request?.ticket);
 assertDestination();ticket.assertCurrent();
 const value=prepared?'0,0':await vscode.window.showInputBox({title:'Dropped voice clip destination',prompt:'Destination SND: '+archive.filename+' · group, starting index. Matching IDs will be reviewed before replacement.',value:defaultGroup+','+defaultIndex,validateInput:value=>/^\d+,\d+$/.test(value)&&value.split(',').every(x=>Number(x)<=2147483647)?undefined:'Enter group,index from 0 through 2147483647.'});
 if(value===undefined)return;
 assertDestination();ticket.assertCurrent();
 const [group,startIndex]=value.split(',').map(Number),materialized=await ticket.materialize({group,startIndex,ids:request.ids,revision:request.revision});
 const sounds=materialized?.sounds;if(!Array.isArray(sounds)||!sounds.length||sounds.length>4096||sounds.reduce((n,x)=>n+(x.bytes?.length||0)+16,512)>256*1024*1024)throw Error('The dropped clips exceed the SND package limits. Choose a smaller batch.');
 const result=require('./snd_media_manifest').mergeArchive(archive,sounds.map(sound=>({...sound,type:'sound',file:'reviewed voice cut'}))),existing=new Set(archive.entries.map(x=>x.identity));
 const detail='Destination SND: '+archive.filename+'\nEntity: '+(entityId||'Unknown (standalone or ambiguous owner)')+'\n'+ticket.describe+'\n'+result.replaced+' matching IDs replaced; '+result.added+' new IDs added. Existing neighbors stay unchanged.\n\n'+sounds.map(x=>(existing.has(x.group+','+x.index)?'Replace':'Add')+' · '+x.group+','+x.index).join('\n');
 const question='Import '+sounds.length+' voice '+(sounds.length===1?'clip':'clips')+'?';
 if(await vscode.window.showWarningMessage(question,{modal:true,detail},'Import Voice Clips')!=='Import Voice Clips')return;
 assertDestination();ticket.assertCurrent();await materialized.validate?.();assertDestination();ticket.assertCurrent();
 const reopened=require('./snd_reader').parseSndBuffer(result.bytes);
 const physicalSlots=new Map(reopened.entries.map(entry=>[entry.identity,entry.archiveIndex]));
 const placement={
   destination:archive.filename,...(entityId?{entityId}:{}),
   entries:sounds.map(sound=>({
     clipId:sound.clipId,group:sound.group,index:sound.index,
     entryIndex:physicalSlots.get(sound.group+','+sound.index),
     wavHash:require('./snd_audio_processing').hash(sound.bytes)
   })),
   importId:require('node:crypto').randomUUID(),importedAt:new Date().toISOString()
 };
 const selectedIds=new Set(sounds.map(sound=>sound.group+','+sound.index));
 const previousHashes=new Map(archive.entries.filter(entry=>selectedIds.has(entry.identity)).map(entry=>[entry.identity,require('./snd_audio_processing').hash(require('./snd_reader').soundBuffer(archive,entry))]));
 const ledger=await materialized.planPlacementWrites?.(placement,previousHashes);
 assertDestination();ticket.assertCurrent();await materialized.validate?.();
 await apply({bytes:result.bytes,sourceHash:require('./snd_audio_processing').hash(archive.buffer),writes:ledger?.writes||[],expectedHashes:ledger?.expectedHashes||{}});
 ledger?.onCommitted?.();if(!ledger)await materialized.recordImported?.(placement);
 return {destination:archive.filename,entityId,count:sounds.length};
}
module.exports={importDrop,importClips:options=>importDrop(options)};
