'use strict';
const def=require('./def_model');
const {storyboardModel}=require('./storyboard_model');
const KEYS=Object.freeze(['clearcolor','clearalpha','clearlayerno','layerall.pos']);
function values(scene){return{clearcolor:scene.clearColor.join(','),clearalpha:String(scene.clearAlpha),clearlayerno:String(scene.clearLayerNo),'layerall.pos':scene.layerAllPosition.join(',')}}
function reviewCarryChange(beforeText,afterText,{copiedFromKey='',newKey='',copiedValues=null}={}){
  const before=storyboardModel(def.parseDef(beforeText)),after=storyboardModel(def.parseDef(afterText)),old=new Map(before.scenes.map(scene=>[scene.key,scene]));
  const changes=[];
  for(const scene of after.scenes){const prior=old.get(scene.key)||(scene.key===newKey?old.get(copiedFromKey):null),priorValues=prior?values(prior):scene.key===newKey?copiedValues:null;if(!priorValues)continue;const nextValues=values(scene);for(const key of KEYS)if(priorValues[key]!==nextValues[key]&&scene.inherited[key]!==undefined)changes.push({sceneKey:scene.key,sceneName:scene.name,key,before:priorValues[key],after:nextValues[key]});}
  return changes;
}
function pinCarryValues(afterText,changes){let next=afterText;for(const change of changes){const doc=def.parseDef(next),section=doc.sections.find(item=>item.normalized===change.sceneKey);if(!section)throw Error('The affected scene changed before pinning.');if(section.entries.some(entry=>entry.normalized===change.key))throw Error(`${change.sceneName} now owns ${change.key}; review the source before pinning.`);next=def.setSectionEntry(doc,section.line,change.key,change.before);}return next;}
function carryReviewDetail(changes){return changes.length?`Inherited values that change:\n${changes.map(change=>`${change.sceneName} ${change.key}: ${change.before} → ${change.after}`).join('\n')}`:'Inherited clear values remain the same.';}
function removedReferenceDetail(text,removedKey){const model=storyboardModel(def.parseDef(text)),index=model.scenes.findIndex(scene=>scene.key===removedKey);if(index<0)return'';const surviving=model.scenes.filter(scene=>scene.key!==removedKey),destination=surviving[Math.min(index,surviving.length-1)];if(!destination)return'No scene remains after removal.';const references=[];if(model.startScene===index)references.push(`startscene → ${destination.name}`);for(const scene of model.scenes)if(scene.key!==removedKey&&scene.jump===index)references.push(`${scene.name} jump → ${destination.name}`);return references.length?`References to the removed scene retarget: ${references.join('; ')}.`:'';}
module.exports={KEYS,values,reviewCarryChange,pinCarryValues,carryReviewDetail,removedReferenceDetail};
