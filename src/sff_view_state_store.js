'use strict';
const fs=require('fs'),path=require('path');
function createSffViewStateStore({limit=64,io=fs}={}){
 const entries=new Map(),key=file=>path.resolve(file),capacity=Number.isInteger(limit)&&limit>0?Math.min(limit,64):64;
 function identity(binding){
  if(!binding?.filename||binding.transferPinned||!/^[a-f0-9]{64}$/.test(binding.sourceFingerprint||''))return null;
  const filename=path.resolve(binding.filename),owners=[...new Set((binding.ownerDefs||[]).map(key))].sort(),stat=io.statSync(filename);
  return{key:JSON.stringify([key(filename),owners]),fingerprint:binding.sourceFingerprint,device:String(stat.dev),inode:String(stat.ino)};
 }
 function remember(binding,state){
  if(state?.dirty)return false;
  try{const proof=identity(binding);if(!proof)return false;const safe={...state,dirty:false,importedPaletteColors:null};entries.delete(proof.key);entries.set(proof.key,{proof,state:JSON.parse(JSON.stringify(safe))});while(entries.size>capacity)entries.delete(entries.keys().next().value);return true;}catch(_){return false;}
 }
 function restore(binding){
  try{const proof=identity(binding);if(!proof)return null;const entry=entries.get(proof.key);if(!entry)return null;if(['fingerprint','device','inode'].some(field=>entry.proof[field]!==proof[field])){entries.delete(proof.key);return null;}entries.delete(proof.key);entries.set(proof.key,entry);return JSON.parse(JSON.stringify(entry.state));}catch(_){return null;}
 }
 return{remember,restore,size:()=>entries.size};
}
function sffViewStateForModel(persisted,model){
 const key=value=>String(value||''),owners=value=>[...new Set((Array.isArray(value)?value:[]).map(key))].sort().join('\n');
 const current=key(persisted?.filename)===key(model.fullPath)&&/^[a-f0-9]{64}$/.test(model.sourceFingerprint||'')&&persisted?.sourceFingerprint===model.sourceFingerprint&&owners(persisted.sessionOwnerDefs)===owners(model.sessionOwnerDefs);
 return current?{...persisted,importedPaletteColors:null}:Object.assign({filename:model.fullPath},model.retainedState||{});
}
module.exports={createSffViewStateStore,sffViewStateForModel};
