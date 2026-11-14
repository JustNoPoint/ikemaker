'use strict';
const def=require('./def_model');

function planSoundCue(text,sceneKey,index,input){
  const document=def.parseDef(text),section=document.sections.find(item=>item.normalized===sceneKey&&/^scene(?:\s+.+)?$/i.test(item.name));
  if(!section||document.sections.filter(item=>item.normalized===sceneKey).length!==1)throw new Error('The selected storyboard scene changed. Refresh and choose it again.');
  if(!Number.isSafeInteger(index)||index<0||index>1000000)throw new Error('Choose a valid sound cue index.');
  const seen=new Set();for(const entry of section.entries){if(seen.has(entry.normalized))throw new Error(`[${section.name}] ${entry.normalized} appears more than once. Resolve duplicate keys in text before editing sound cues.`);seen.add(entry.normalized);}
  const family=/^sound_?(\d+)\./i,spellings=[...new Set(section.entries.map(entry=>{const match=family.exec(entry.normalized);return match&&Number(match[1])===index?entry.normalized.slice(0,entry.normalized.indexOf('.')):null}).filter(Boolean))];
  if(spellings.length>1)throw new Error(`Sound ${index} has both sound${index} and sound_${index} families. Resolve them in text before editing.`);
  const prefix=spellings[0]||`sound${index}`;
  const tuple=String(input.value||'').split(',').map(part=>part.trim());
  if(tuple.length!==2||tuple.some(part=>!/^\d+$/.test(part)||Number(part)>1000000))throw new Error('Sound value needs a nonnegative group and sound number.');
  const start=Number(input.startTime),volume=Number(input.volumeScale),pan=Number(input.pan);
  if(!Number.isSafeInteger(start)||start<0||start>1000000)throw new Error('Sound start time needs 0 to 1,000,000 ticks.');
  if(!Number.isSafeInteger(volume)||volume<0||volume>1000)throw new Error('Sound volume scale needs a whole number from 0 to 1000.');
  if(!Number.isFinite(pan)||Math.abs(pan)>1000)throw new Error('Sound pan needs a finite value between -1000 and 1000.');
  let next=text;const values={value:tuple.map(Number).join(','),starttime:String(start),volumescale:String(volume),pan:String(pan)};
  for(const [property,value] of Object.entries(values)){
    const current=def.parseDef(next),target=current.sections.find(item=>item.normalized===sceneKey);
    const key=`${prefix}.${property}`;
    if(target.entries.filter(entry=>entry.normalized===key).length>1)throw new Error(`Sound ${index} ${property} appears more than once. Resolve duplicate keys in text before editing.`);
    if(def.value(target,key)===value)continue;
    next=def.setSectionEntry(def.parseDef('\n'+next),target.line+1,key,value).slice(1);
  }
  return{text:next,changed:next!==text,index,values};
}
module.exports={planSoundCue};
