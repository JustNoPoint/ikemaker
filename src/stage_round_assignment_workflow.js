'use strict';
const {parseDef,kind}=require('./def_model'),a=require('./stage_round_assignment'),{ownerSnapshot,assertSnapshot}=require('./stage_attached_authoring_workflow');
async function reviewRoundAssignment(operation,env){
 const api=env.api;let document=env.document,version=document.version;const text=document.getText();
 const guard=()=>{env.assertCurrent();if(document.version!==version||document.getText()!==text)throw Error('Main Stage changed during round assignment review.');};
 const prompt=async fn=>{guard();const result=await fn();if(env.restoreNativeDocument){document=await env.restoreNativeDocument();version=document.version;}guard();return result;};
 const base=a.roundAssignments(text);let target,round;
 if(operation==='assign'||operation==='remove'){
  const remove=operation==='remove',slots=base.rounds.filter(row=>remove||row.round<=999).map(row=>({label:'Round '+row.round,description:row.path,round:row.round}));
  if(remove&&!slots.length){Promise.resolve(api.window.showInformationMessage('No authored round assignment is available to remove.')).catch(()=>{});return false;}
  if(!remove)slots.push({label:'Another round…',description:'Choose a new round number',input:true});
  let chosen;if(slots.length>1||remove){chosen=await prompt(()=>api.window.showQuickPick(slots,{title:remove?'Remove a round assignment':'Choose the round assignment to edit'}));if(!chosen)return false;if(!slots.includes(chosen))throw Error('The selected round assignment changed.');}else chosen=slots[0];
  round=chosen.round;
  if(chosen.input){let suggested=2;while(base.rounds.some(row=>row.round===suggested)&&suggested<999)suggested++;const input=await prompt(()=>api.window.showInputBox({title:'Assign an existing Stage to a round',value:String(suggested),prompt:'Round 1 uses the main Stage; later unassigned rounds retain the current Stage.',validateInput:v=>/^\d+$/.test(v)&&Number(v)>=2&&Number(v)<=999?undefined:'Enter a round from 2 to 999.'}));if(input===undefined)return false;round=Number(input);}
  if(!remove){
  const selected=await prompt(()=>api.window.showOpenDialog({title:'Choose existing round Stage DEF — files stay unchanged',canSelectMany:false,filters:{'Stage DEF':['def']}}));if(!selected?.length)return false;
  const filename=selected[0].fsPath;await prompt(()=>api.workspace.openTextDocument(api.Uri.file(filename)));const snapshot=ownerSnapshot(api,filename);if(kind(parseDef(snapshot.text,filename))!=='stage')throw Error('The selected target is not a Stage DEF.');target={filename,snapshot,dirty:snapshot.dirty};
  }
 }
 const choices=[{label:'Keep '+(base.roundLoop?'sorted Stage cycling':'round-number assignments'),value:undefined},{label:'Use authored round numbers',description:'Unassigned later rounds keep the current Stage',value:false},{label:'Cycle sorted Stage keys every round',description:'Includes main Stage key 0; repeats after the last key',value:true}];
 const mode=operation==='remove'?choices[0]:await prompt(()=>api.window.showQuickPick(choices,{title:'Round sequence mode'}));if(!mode)return false;if(!choices.includes(mode))throw Error('The selected round mode changed.');
 const plan=a.planRoundAssignment(text,document.fileName,{...(target?{targetDef:target.filename,round}:{}),...(operation==='remove'?{removeRound:round}:{}),roundLoop:mode.value});if(!plan.changes.length){Promise.resolve(api.window.showInformationMessage('Round assignments already match the source.')).catch(()=>{});return false;}
 const physical=require('./stage_attached_authoring'),records=[{filename:document.fileName,text:plan.text}],snapshots=[];
 for(const row of plan.rounds){const filename=env.resolveAsset?env.resolveAsset(row.path,document.fileName):require('node:path').resolve(require('node:path').dirname(document.fileName),row.path);if(records.some(record=>physical.samePhysical(record.filename,filename)))continue;let snapshot;if(target&&physical.samePhysical(target.filename,filename)){assertSnapshot(api,filename,target.snapshot);snapshot=target.snapshot;}else{await prompt(()=>api.workspace.openTextDocument(api.Uri.file(filename)));snapshot=ownerSnapshot(api,filename);}if(kind(parseDef(snapshot.text,filename))!=='stage')throw Error('An assigned round target is not a Stage DEF: '+filename);records.push({filename,text:snapshot.text});snapshots.push({filename,snapshot});}
 require('./stage_area_identity').assertDistinctAreaIdentities(records);const dirty=snapshots.filter(row=>row.snapshot.dirty),extra=dirty.length?'\nSave these unsaved round Stage sources too before testing:\n'+dirty.map(row=>row.filename).join('\n'):'';
 if(await prompt(()=>api.window.showWarningMessage('Apply reviewed round Stage assignments?',{modal:true,detail:a.roundAssignmentReview(document.fileName,plan,target)+extra},'Apply Round Assignment'))!=='Apply Round Assignment')return false;
 guard();if(target)assertSnapshot(api,target.filename,target.snapshot);for(const row of snapshots)assertSnapshot(api,row.filename,row.snapshot);await env.apply(plan.text);await env.refresh?.();Promise.resolve(api.window.showInformationMessage('Round assignment applied as an unsaved native main-Stage edit. Save the main DEF'+(dirty.length?' and the unsaved round target Stage edits':'')+' before testing in game.')).catch(()=>{});return true;
}
module.exports={reviewRoundAssignment};
