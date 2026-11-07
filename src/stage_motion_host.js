'use strict';
const crypto=require('node:crypto'),{stageMotionOwners,motionTargetCurrent}=require('./stage_motion_owners'),{stageCodeTargets}=require('./stage_code_targets');
async function loadStageMotionInventory(owner,env,requestId){
 if(!Number.isSafeInteger(requestId)||requestId<1)return false;
 const filename=owner.filename,generation=owner.generation,selected=owner.selected,request={requestId};owner.motionInventoryRequest=request;delete owner.motionInventory;
 const retained=()=>!owner.disposed&&owner.filename===filename&&owner.generation===generation&&owner.selected===selected&&owner.motionInventoryRequest===request;
 const terminal=async fields=>{if(owner.disposed||owner.filename!==filename)return false;await env.post({type:'stageMotionInventory',generation,selected,requestId,...fields});return fields.ok===true;};
 const stale=()=>terminal({ok:false,error:'Stage selection or source changed while reading motion owners. Inspect again.'});
 try{
  await env.openDocument(filename);if(!retained())return await stale();
  // Snapshot decoded native buffers before taking source authority.
  const opened=new Set([filename]);for(let pass=0;pass<3;pass++){
   const files=[...new Set(stageCodeTargets(filename,env.readText(filename),env).flatMap(row=>(row.dependencies||[]).map(d=>d.filename)))].filter(file=>!opened.has(file));if(!files.length)break;
   for(const file of files){await env.openDocument(file);opened.add(file);if(!retained())return await stale();}
  }
  const authority=env.capture();if(!authority||!retained())return await stale();
  const inventory=stageMotionOwners(filename,env.readText(filename),selected,env),token=crypto.randomBytes(24).toString('hex');
  env.assertCurrent?.(authority);if(!retained())return await stale();
  owner.motionInventory={inventory,token,authority,filename,generation,selected,requestId};
  return await terminal({ok:true,token,scope:inventory.scope,rows:inventory.rows.map(({id,kind,label,detail,affectedBackgrounds,unresolved,target})=>({id,kind,label,detail,affectedBackgrounds,unresolved:Boolean(unresolved),source:Boolean(target?.available)})),attachedOwners:inventory.attachedOwners.map(({ownerDef,label})=>({ownerDef,label}))});
 }catch(error){return await terminal({ok:false,error:'Motion owners could not be read: '+error.message});}
}
async function routeStageMotionInventory(owner,message,env){
 const record=owner.motionInventory;if(!record||record.token!==message.token||record.generation!==owner.generation||record.selected!==owner.selected)return false;
 const row=record.inventory.rows.find(item=>item.id===message.rowId);if(['solo','source'].includes(message.operation)&&row&&!motionTargetCurrent(row.target,env.readText)){delete owner.motionInventory;await env.post({type:'stageMotionInventory',generation:record.generation,selected:record.selected,requestId:record.requestId,ok:false,error:'Motion source changed. Inspect motion owners again before isolating or opening it.'});return false;}
 const current=()=>{try{env.assertCurrent(record.authority);return !owner.disposed&&owner.filename===record.filename&&owner.generation===record.generation&&owner.selected===record.selected;}catch{return false;}};
 const retained=()=>!owner.disposed&&owner.filename===record.filename;
 return require('./stage_motion_workflow').routeStageMotion(env.api,{isCurrent:current,isRetainedCurrent:retained,returnToStage:()=>{if(retained())owner.panel.reveal(owner.panel.viewColumn,false);},onDispose:callback=>owner.panel.onDidDispose(callback)},record.inventory,message,{readText:env.readText,inventoryCurrent:()=>current(),openSource:env.openSource,isolate:indices=>env.post({type:'stageMotionIsolation',generation:owner.generation,selected:owner.selected,token:record.token,indices})});
}
module.exports={loadStageMotionInventory,routeStageMotionInventory};
