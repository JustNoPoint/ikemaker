'use strict';
const fs=require('node:fs'),path=require('node:path');
const {stageCodeTargets}=require('./stage_code_targets');
const {hash}=require('./mutation_safety');
const snapshots=require('./stage_attached_authoring_workflow');
const {planReaction,materializeReactionBundle,visibilityGates,managedMembers}=require('./stage_reaction_plan');
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function validMessage(m){
 if(!m||m.type!=='stageReactionOperation'||!['load','review','source','cancel','proveSources'].includes(m.operation)||!Number.isSafeInteger(m.selected)||m.selected<0)return false;
 const keys=m.operation==='review'?['type','generation','operation','selected','ownerId','sourceId','condition','action','returnAction','duration','cooldown','oncePerRound','phase','sound',...(m.reactionKind!==undefined?['reactionKind','position','returnPosition']:[]),...(m.visibilityControllerId!==undefined?['visibilityControllerId','visible','returnVisible']:[]),...(m.priority!==undefined?['priority','interruptPolicy']:[]),...(m.memberId!==undefined?['memberId','editOperation','replaceSound']:[]),...(m.music!==undefined?['music','musicReturn','replaceMusic']:[])]:m.operation==='source'?['type','generation','operation','selected','ownerId','sourceId']:['type','generation','operation','selected'];
 if(Object.keys(m).sort().join('|')!==keys.sort().join('|'))return false;
 if(m.operation==='source')return ['ownerId','sourceId'].every(k=>typeof m[k]==='string'&&m[k].length<=128);
 if(m.operation!=='review')return true;
 if(m.reactionKind!==undefined&&(!['animation','position','visibility'].includes(m.reactionKind)||['position','returnPosition'].some(k=>!Array.isArray(m[k])||m[k].length!==2||m[k].some(n=>!Number.isFinite(n)||Math.abs(n)>10000000))))return false;
 if(m.visibilityControllerId!==undefined&&((m.visibilityControllerId!=='auto'&&(!Number.isSafeInteger(m.visibilityControllerId)||m.visibilityControllerId<0||m.visibilityControllerId>2147483647))||typeof m.visible!=='boolean'||typeof m.returnVisible!=='boolean'))return false;
 if(m.priority!==undefined&&(!Number.isInteger(m.priority)||m.priority<0||m.priority>1000000||!['allow-higher','finish','return-on-false'].includes(m.interruptPolicy)))return false;
 if(m.memberId!==undefined&&(typeof m.memberId!=='string'||m.memberId.length>128||!['new','update','remove'].includes(m.editOperation)||typeof m.replaceSound!=='boolean'||m.editOperation!=='new'&&!m.memberId))return false;
 if(m.music!==undefined&&(typeof m.music!=='boolean'||typeof m.replaceMusic!=='boolean'||!['keep','stage-default','stop'].includes(m.musicReturn)))return false;
 return ['ownerId','sourceId'].every(k=>typeof m[k]==='string'&&m[k].length<=128)&&typeof m.condition==='string'&&m.condition.length<=4096&&['action','returnAction','duration','cooldown'].every(k=>Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=2147483647)&&m.duration>0&&typeof m.oncePerRound==='boolean'&&typeof m.sound==='boolean'&&['fight','outcome','intro','any','custom'].includes(m.phase)&&(m.phase!=='custom'||Boolean(m.memberId)&&m.editOperation!=='new');
}
function refs(owner,env){return stageCodeTargets(owner.filename,env.readText(owner.filename),env,false);}
async function inventory(owner,env,assert){
 const owners=refs(owner,env).filter(t=>t.available&&t.context?.ownerDef===t.filename),seen=new Set();
 const result=[];
 for(const target of owners){
  const key=path.resolve(target.filename).toLowerCase();if(seen.has(key))throw Error('The same DEF is attached more than once. Review explicit runtime-instance ownership before generating shared Stage behavior.');seen.add(key);
  const record=await require('./stage_linked_owner_inventory').inventoryForDef(target.filename,env,assert);
  result.push({...record,target,sourceChoices:record.sourceChoices.map(t=>({...t,members:managedMembers(env.readText(owner.filename),owner.selected,env.readText(t.filename))}))});
 }
 return result;
}
function validateInventory(owner,state,env){env.assert();if(state.generation!==owner.generation||state.selected!==owner.selected||hash(env.readText(owner.filename))!==state.stageHash)throw Error('Stage or selected BG changed. Reopen When → React → Return.');for(const item of state.items)item.assertStateCatalog?.();for(const item of state.items)for(const snapshot of item.snapshots)snapshots.assertSnapshot(env.api,snapshot.filename,snapshot.value);for(const snapshot of state.roundSnapshots||[])snapshots.assertSnapshot(env.api,snapshot.filename,snapshot.value);}
async function handle(owner,message,env){
 if(!validMessage(message)||message.generation!==owner.generation||message.selected!==owner.selected)return false;
 if(message.operation==='cancel'){owner.stageReaction=null;return true;}
 try{
  env.assert();
  if(message.operation==='load'){
   const items=await inventory(owner,env,env.assert),rounds=await require('./stage_area_host').roundIdentityRecords(owner.filename,env.readText(owner.filename),env),state={generation:owner.generation,selected:owner.selected,stageHash:hash(env.readText(owner.filename)),items,roundSnapshots:rounds.filter(r=>!same(r.filename,owner.filename)).map(r=>({filename:r.filename,value:snapshots.ownerSnapshot(env.api,r.filename)}))};require('./stage_area_identity').assertDistinctAreaIdentities(rounds);
   validateInventory(owner,state,env);owner.stageReaction=state;
   return env.post({type:'stageReactionState',generation:owner.generation,selected:owner.selected,sourceProof:require('./stage_linked_owner_inventory').sourceProof(items),visibilityGates:visibilityGates(env.readText(owner.filename),owner.selected),owners:items.map(item=>({id:item.id,label:path.basename(item.target.filename)+(item.sourceChoices.length?'':' — no directly owned ZSS st source; use Stage Code/Create link'),filename:item.target.filename,sources:item.sourceChoices.map(s=>({id:s.id,label:s.label,filename:s.filename,members:s.members.map(({soundReceipt,musicReceipt,...member})=>({...member,hasSound:Boolean(soundReceipt),hasMusic:Boolean(musicReceipt),musicReturnPolicy:musicReceipt?.returnPolicy||'keep'}))}))})),status:items.length?'Choose the exact attached owner and source.':'Create / link an entity with a readable ZSS st file and one global -4. Existing authored source remains available through Stage Code.'});
  }
  const state=owner.stageReaction;if(!state)throw Error('Open When → React → Return again to refresh linked source ownership.');validateInventory(owner,state,env);
  if(message.operation==='proveSources'){await require('./stage_linked_owner_inventory').proveStateSources(state.items,env,()=>validateInventory(owner,state,env));return handle(owner,{...message,operation:'load'},env);}
  const item=state.items.find(i=>i.id===message.ownerId),source=item?.sourceChoices.find(s=>s.id===message.sourceId);if(!item||!source)throw Error('Choose a current linked owner and its ZSS source.');
  if(message.operation==='source'){const target=refs(owner,env).find(t=>t.available&&same(t.filename,source.filename)&&t.context?.ownerDef&&same(t.context.ownerDef,item.target.filename));if(!target)throw Error('The selected linked reaction source is unavailable.');return env.openSource(target);}
  if(message.editOperation!=='remove')require('./stage_linked_owner_inventory').assertSourceProof(state.items);
  const ownerText=env.readText(source.filename),stageText=env.readText(owner.filename),ownerSources=item.sources.map(s=>({filename:s.filename,text:env.readText(s.filename)}));
  const editOperation=message.editOperation||'new',member=message.memberId?source.members.find(m=>m.id===message.memberId):null;if(editOperation!=='new'&&!member)throw Error('Choose an exact existing managed reaction in this source.');
  let namespace=member?.id||'ikm_rx_bg'+owner.selected,n=1;if(!member)while(ownerSources.some(s=>s.text.toLowerCase().includes(namespace.toLowerCase())))namespace='ikm_rx_bg'+owner.selected+'_'+n++;
  let ownerSound,ownerSoundEvidence;
  if(message.sound&&editOperation!=='remove'&&member?.soundReceipt&&!message.replaceSound){ownerSound=member.soundReceipt;require('./stage_audio_host').validateOwnerSound(ownerSound,owner,env);ownerSoundEvidence={ownerDefText:env.readText(ownerSound.ownerDef),sndBytes:fs.readFileSync(ownerSound.filename),link:source.link};}
  else if(message.sound&&editOperation!=='remove'){
   const soundOwner={...owner,payload:{...owner.payload,model:{...owner.payload.model,attachedChars:owner.payload.model.attachedChars.filter(a=>{const file=env.resolveAsset(a.path,owner.filename);return file&&same(file,item.target.filename);})}}};
   ownerSound=await require('./stage_audio_host').chooseOwnerSound(soundOwner,{...env,capture:()=>({}),assert:()=>validateInventory(owner,state,env)});if(!ownerSound){await env.post({type:'stageReactionResult',generation:owner.generation,selected:owner.selected,status:'Sound selection cancelled. No source changed.'});return false;}validateInventory(owner,state,env);
   if(!same(ownerSound.ownerDef,item.target.filename))throw Error('Choose a sound belonging to the selected reaction owner. No edit was applied.');
   ownerSoundEvidence={ownerDefText:env.readText(ownerSound.ownerDef),sndBytes:fs.readFileSync(ownerSound.filename),link:source.link};
  }
  let ownerMusic,ownerMusicEvidence;if(message.music&&editOperation!=='remove'){
   const music=require('./stage_reaction_music');
   if(member?.musicReceipt&&!message.replaceMusic)ownerMusic={...member.musicReceipt,returnPolicy:message.musicReturn};
   else{const selection=owner.stageEventMusic;if(!selection||!same(selection.stageFilename,owner.filename))throw Error('Choose/edit music in Music & Sounds, then Use in selected reaction. No files are imported or assigned automatically.');ownerMusic=music.receipt(selection,item.target.filename,env.readText(item.target.filename),message.musicReturn);}
   if(!env.root)throw Error('Event music requires a containing game project.');require('./stage_audio_model').assignmentPath(owner.filename,ownerMusic.filename,env.root);ownerMusicEvidence={ownerDefText:env.readText(item.target.filename),bytes:fs.readFileSync(ownerMusic.filename),link:source.link};
   if(message.musicReturn==='stage-default'){
    const assignment=require('./def_model').unquote(require('./stage_audio_model').music(stageText,owner.filename,'').assignment);if(!assignment||assignment.includes(','))throw Error('This Stage has no single default music assignment. Choose Keep or Stop for event Return.');const filename=env.resolveAsset(assignment,owner.filename);if(!filename||!fs.existsSync(filename))throw Error('The active Stage default music is missing. Choose Keep or Stop for event Return.');
    const bytes=fs.readFileSync(filename);require('./stage_audio_model').inspect(bytes,filename);ownerMusic={...ownerMusic,stageDefault:{assignment,filename,sourceHash:hash(bytes)}};ownerMusicEvidence.defaultBytes=bytes;ownerMusicEvidence.defaultLink={from:owner.filename,reference:assignment,to:filename};
   }else ownerMusic={...ownerMusic,stageDefault:null};
  }
  const roundStates=message.phase==='custom'?member.roundStates:{fight:[2],outcome:[3,4],intro:[0,1],any:[0,1,2,3,4]}[message.phase];
  const foreignOwnerSources=state.items.filter(i=>i.id!==item.id).flatMap(i=>i.sources.map(s=>({filename:s.filename,text:env.readText(s.filename)}))),input={stageText,ownerText,stageFilename:owner.filename,ownerFilename:source.filename,ownerSourcesComplete:true,ownerSources,foreignOwnerSources,namespace,editOperation,bgPhysicalIndex:owner.selected,condition:message.condition,reactionKind:message.reactionKind,position:message.position,returnPosition:message.returnPosition,visibilityControllerId:message.visibilityControllerId,visible:message.visible,returnVisible:message.returnVisible,priority:message.priority,interruptPolicy:message.interruptPolicy,action:message.action,returnAction:message.returnAction,duration:message.duration,cooldown:message.cooldown,oncePerRound:message.oncePerRound,roundStates,ownerSound,ownerSoundEvidence,ownerMusic,ownerMusicEvidence};
  if(editOperation==='remove')Object.assign(input,member.parameters,{condition:member.condition,roundStates:member.roundStates,duration:member.duration,cooldown:member.cooldown,oncePerRound:member.oncePerRound,priority:member.priority,interruptPolicy:member.interruptPolicy});
  const plan=planReaction(input);state.lastTarget=item.target;state.lastTarget={...item.target,filename:source.filename,line:ownerText.slice(0,plan.edit.offset).split(/\r?\n/).length-1};
  require('./stage_area_identity').assertDistinctAreaIdentities(await require('./stage_area_host').roundIdentityRecords(owner.filename,plan.stageAfter,env));validateInventory(owner,state,env);
  const preview=materializeReactionBundle(plan,input),reviewRows=[{filename:source.filename,before:ownerText,after:preview.ownerText},...(preview.stageText!==stageText?[{filename:owner.filename,before:stageText,after:preview.stageText}]:[])];
  const summary=editOperation==='remove'?'Remove only this exact managed reaction member. Preserve other authored code, shared Stage identity and dormant gates.':`${editOperation==='update'?'Update':'Create'} ${message.reactionKind||'animation'} reaction for BG ID ${plan.target.id}, matching instance ${plan.target.index}.\nOwner condition: ${message.condition.slice(0,160)}${message.condition.length>160?'…':''}\nHold ${message.duration} ticks; cooldown ${message.cooldown}; ${message.oncePerRound?'once per round':'rising-edge retrigger'}. Trigger RoundStates: ${roundStates.join(',')}.\nArtwork behavior only; participant physical surfaces use the dedicated tool.\n${ownerSound?'Entry sound: '+ownerSound.group+', '+ownerSound.index+'; channel '+ownerSound.channel+'.\n':''}${ownerMusic?'Match music return policy: '+ownerMusic.returnPolicy+'.\n':''}Save every reviewed source before game playback; one native Undo reverts this edit.`;
  if(!await require('./stage_source_review').reviewStageSources(env.api,{rows:reviewRows,title:'Review Stage background reaction',summary,approveLabel:'Apply Reaction',assertCurrent:()=>validateInventory(owner,state,env),returnToStage:env.returnToStage,onDispose:env.onReviewDispose,beginReadonlyReview:env.beginReadonlyReview})){await env.post({type:'stageReactionResult',generation:owner.generation,selected:owner.selected,status:'Reaction review cancelled. No source changed.'});return false;}
  validateInventory(owner,state,env);if(ownerSound){require('./stage_audio_host').validateOwnerSound(ownerSound,owner,env);input.ownerSoundEvidence={ownerDefText:env.readText(ownerSound.ownerDef),sndBytes:fs.readFileSync(ownerSound.filename),link:source.link};}
  if(ownerMusic){input.ownerMusicEvidence={...ownerMusicEvidence,ownerDefText:env.readText(ownerMusic.ownerDef),bytes:fs.readFileSync(ownerMusic.filename)};if(ownerMusic.stageDefault)input.ownerMusicEvidence.defaultBytes=fs.readFileSync(ownerMusic.stageDefault.filename);}
  const document=await env.api.workspace.openTextDocument(env.api.Uri.file(source.filename));validateInventory(owner,state,env);
  const after=materializeReactionBundle(plan,{...input,ownerText:document.getText(),ownerSources:item.sources.map(s=>({filename:s.filename,text:env.readText(s.filename)}))}),patches=[{document,before:document.getText(),after:after.ownerText}];
  const stageChanged=after.stageText!==stageText;if(stageChanged){const stageDocument=await env.api.workspace.openTextDocument(env.api.Uri.file(owner.filename));validateInventory(owner,state,env);patches.push({document:stageDocument,before:stageText,after:after.stageText});}
  await require('./stage_reaction_patch').applyLinkedOwnerPatch(env.api,{patches,assertCurrent:()=>validateInventory(owner,state,env),label:'Stage background reaction'});
  owner.stageReaction=null;await env.post({type:'stageReactionResult',generation:owner.generation,selected:owner.selected,filename:source.filename,appliedMemberId:editOperation==='remove'?'':namespace,stageChanged,nextStageHash:hash(after.stageText),status:stageChanged?'Stage identity, any reviewed visibility gate, and linked reaction applied as one unsaved native edit. Save Stage DEF AND linked source to use them in game; native Undo reverts both.':'Reaction applied to unsaved linked source. Save that source to use it in game; native Undo reverts this one edit. Open linked source to inspect it.'});
  owner.stageReactionLastTarget={ownerDef:item.target.filename,filename:source.filename};return {applied:true,filename:source.filename,nativeUndo:true,stageChanged};
 }catch(error){await env.post({type:'stageReactionResult',generation:owner.generation,selected:owner.selected,error:error.message,status:error.message});return false;}
}
module.exports={validMessage,inventory,validateInventory,handle};
