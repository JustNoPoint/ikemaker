'use strict';
const {pathKey}=require('./snd_voice_destination');

// Import IDs identify immutable events. Portable sessions may carry only the
// event's selected cuts; merge those subsets without losing physical slots.
function mergeImports(current,incoming,key=pathKey){
 const result=structuredClone(current),byId=new Map(result.map(item=>[item.importId,item]));
 for(const saved of incoming){
  const prior=byId.get(saved.importId);
  if(!prior){const copy=structuredClone(saved);result.push(copy);byId.set(copy.importId,copy);continue;}
  if(key(prior.destination)!==key(saved.destination)||key(prior.entityId)!==key(saved.entityId))throw Error('Conflicting destination in portable voice placement history.');
  const slots=new Map(prior.entries.map(entry=>[entry.entryIndex,entry]));
  for(const entry of saved.entries){
   const old=slots.get(entry.entryIndex);
   if(old){if(['clipId','group','index','wavHash'].some(field=>old[field]!==entry[field]))throw Error('Conflicting physical sound in portable voice placement history.');continue;}
   const copy=structuredClone(entry);prior.entries.push(copy);slots.set(copy.entryIndex,copy);
  }
 }
 return result;
}

function presentClips({clips,imports,destinationPath,entityId,archive,hashEntry,key=pathKey}){
 const byId=new Map(clips.map(clip=>[clip.id,[]])),hashes=new Map(),firstSlots=new Map();
 for(const entry of archive?.entries||[])if(!firstSlots.has(entry.identity))firstSlots.set(entry.identity,entry.archiveIndex);
 for(const item of imports){
  const sameDestination=destinationPath&&key(item.destination)===key(destinationPath)&&key(item.entityId)===key(entityId);
  for(const entry of item.entries){
   const placements=byId.get(entry.clipId);if(!placements)continue;
   let current=false;
   if(sameDestination&&archive){
    const physical=archive.entries[entry.entryIndex],identity=entry.group+','+entry.index;
    // ID equality alone is insufficient: another duplicate may still contain
    // the old WAV, or the recorded slot may have been replaced or reordered.
    if(physical?.identity===identity&&firstSlots.get(identity)===entry.entryIndex){
     if(!hashes.has(entry.entryIndex))hashes.set(entry.entryIndex,hashEntry(physical));
     current=hashes.get(entry.entryIndex)===entry.wavHash;
    }
   }
   placements.push({...entry,destination:item.destination,entityId:item.entityId,importId:item.importId,importedAt:item.importedAt,historical:!current});
  }
 }
 return clips.map(clip=>{const placements=byId.get(clip.id);return{...clip,placements,addedHere:placements.some(item=>!item.historical)};});
}
module.exports={mergeImports,presentClips};
