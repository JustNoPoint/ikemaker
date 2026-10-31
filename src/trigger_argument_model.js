'use strict';

const { entryAvailable } = require('./catalog_capability_filter');

const LIMITS=Object.freeze({slots:16,choices:64,textBytes:1024});

function bounded(value,fallback=''){
  const text=String(value==null?'':value).replace(/[\r\n\u0000-\u001f\u007f]+/g,' ').trim();
  return text&&Buffer.byteLength(text,'utf8')<=LIMITS.textBytes?text:fallback;
}
function signaturePositions(entry){
  const signature=bounded(entry?.signature),match=/\(([^)]*)\)/.exec(signature);
  if(!match)return[];
  return match[1].split(',').map(value=>bounded(value)).filter(Boolean).slice(0,LIMITS.slots);
}
function normalizeChoice(choice,slot,capabilities){
  const source=typeof choice==='string'?{value:choice}:choice;
  if(!source||typeof source!=='object'||!entryAvailable(source,capabilities))return null;
  const value=bounded(source.value);if(!value)return null;
  return Object.freeze({value,label:bounded(source.label,value),meaning:bounded(source.meaning),type:bounded(source.type,slot.type)});
}
function argumentSlots(entry,capabilities={}){
  const positions=signaturePositions(entry),structured=Array.isArray(entry?.argumentSlots)?entry.argumentSlots.slice(0,LIMITS.slots):[];
  return Object.freeze(positions.map((fallbackName,position)=>{
    const source=structured.find(value=>Number(value?.position)===position)||structured[position]||{};
    const name=bounded(source.name,fallbackName),type=bounded(source.type,'expression'),meaning=bounded(source.meaning);
    const slot={position,name,meaning,type,optional:source.optional===true,allowExpression:source.allowExpression!==false};
    const choices=[],seen=new Set();
    for(const raw of Array.isArray(source.choices)?source.choices.slice(0,LIMITS.choices):[]){
      const choice=normalizeChoice(raw,slot,capabilities),key=choice?.value.toLocaleLowerCase();
      if(!choice||seen.has(key))continue;seen.add(key);choices.push(choice);
    }
    return Object.freeze({...slot,choices:Object.freeze(choices)});
  }));
}
function argumentSlot(entry,position,capabilities={}){return argumentSlots(entry,capabilities).find(value=>value.position===Number(position))||null;}
function argumentSummary(entry,capabilities={}){
  const slots=argumentSlots(entry,capabilities);if(!slots.length){const legacy=bounded(entry?.arguments);return legacy&&!/^none$/i.test(legacy)?`Documented arguments: ${legacy}.`:'No arguments.';}
  return slots.map(slot=>{
    const flags=[slot.type,slot.optional?'optional':'required'].filter(Boolean).join(', '),choices=slot.choices.length?` Choices: ${slot.choices.map(choice=>choice.value).join(', ')}.`:'';
    const meaning=slot.meaning?` — ${slot.meaning.replace(/[.]+$/,'')}`:'';
    return `${slot.position+1}. ${slot.name}${flags?` (${flags})`:''}${meaning}.${choices}`;
  }).join(' ');
}

module.exports={LIMITS,signaturePositions,argumentSlots,argumentSlot,argumentSummary};
