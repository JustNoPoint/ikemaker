'use strict';
const fs=require('fs'),{hash}=require('./mutation_safety');
const tools={stageSurfaceOperation:'Surface',stageTransitionOperation:'Transition',stageAreaOperation:'Area',stageReactionOperation:'Reaction'};
function clear(owner){delete owner.cleanRefreshRetry;}
function matches(owner,witness){try{return !owner.disposed&&owner.filename===witness.filename&&(owner.entityIdentity||'')===witness.entityIdentity&&owner.payload?.sourceHash===witness.sourceHash&&owner.payload?.sourceDiskHash===witness.diskHash&&hash(fs.readFileSync(owner.filename))===witness.diskHash;}catch{return false;}}
function markCleanRefresh(owner,document){
 clear(owner);if(document.isDirty!==false||hash(document.getText())!==owner.payload?.sourceHash)return;
 const witness={filename:owner.filename,entityIdentity:owner.entityIdentity||'',sourceHash:owner.payload.sourceHash,diskHash:owner.payload.sourceDiskHash,generation:owner.generation,notice:null};
 if(matches(owner,witness))owner.cleanRefreshRetry=witness;
}
// The registered clean-close listener increments once, and its single queued
// populate increments once more. Any later refresh is a different generation.
function refreshed(owner){const witness=owner.cleanRefreshRetry;if(witness&&(!matches(owner,witness)||owner.generation!==witness.generation+2))clear(owner);}
function rememberRetry(owner,message,valid){
 const witness=owner.cleanRefreshRetry;if(!witness)return false;
 if(!matches(owner,witness)||![witness.generation+1,witness.generation+2].includes(owner.generation)){clear(owner);return false;}
 const tool=tools[message?.type];if(witness.delivered||valid!==true||!tool||message.generation!==witness.generation||message.selected!==owner.selected||!['review','removeRecipe'].includes(message.operation))return false;
 witness.notice={type:'stageAuthoringRetry',generation:owner.generation,selected:owner.selected,tool,status:'The clean Stage source refreshed before your review opened. Nothing was applied. Check the refreshed fields, then choose Review or Remove again.'};return true;
}
function publish(owner,post){const witness=owner.cleanRefreshRetry;if(!witness)return false;if(!matches(owner,witness)||owner.generation!==witness.generation+2){if(owner.generation!==witness.generation+1)clear(owner);return false;}if(!witness.ready||!witness.notice)return false;const notice=witness.notice;witness.notice=null;witness.delivered=true;Promise.resolve(post({...notice,generation:owner.generation})).catch(()=>{});return true;}
function ready(owner,post){if(owner.cleanRefreshRetry)owner.cleanRefreshRetry.ready=true;return publish(owner,post);}
function currentRequest(owner,message){if(message.generation===owner.generation&&tools[message.type]&&['review','removeRecipe'].includes(message.operation))clear(owner);}
module.exports={markCleanRefresh,refreshed,rememberRetry,publish,ready,currentRequest,clear};
