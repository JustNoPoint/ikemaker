'use strict';
function client(){
 const local={...(vscode.getState()?.hitdefDrafts||{})};
 const identity=()=>model.file.toLowerCase()+'#'+model.currentIndex;
 const persist=()=>vscode.setState({...vscode.getState(),hitdefDrafts:local});
 function snapshot(){return{base:local[identity()]?.base||model.formDraft?.base||model.sourceHash,fields:parameters()};}
 function stage(){const id=identity();local[id]=snapshot();persist();vscode.postMessage({type:'hitdefDraft',file:model.file,index:model.currentIndex,draft:local[id]});}
 function restore(){
  const id=identity(),draft=local[id]||model.formDraft;
  if(draft){local[id]=draft;persist();const fields=new Map(draft.fields.map(field=>[field.name,field]));for(const row of document.querySelectorAll('[data-option]')){const field=fields.get(row.dataset.option);if(field){row.querySelector('input[type=checkbox]').checked=field.enabled;row.querySelector('input[type=text]').value=field.value;}}}
  const conflict=!!draft&&draft.base!==model.sourceHash;
  document.getElementById('apply').disabled=conflict;document.getElementById('new').disabled=conflict;
  let bar=document.getElementById('hitdefDraftStatus');
  if(!bar){bar=document.createElement('div');bar.id='hitdefDraftStatus';bar.setAttribute('role','status');document.getElementById('groups').before(bar);}
  bar.textContent=draft?(conflict?'The source changed. Your draft is retained; copy any values you need, then discard it to reload the source.':'Unapplied draft retained for this controller.'):'';
  if(draft){const button=document.createElement('button');button.textContent='Discard draft';button.onclick=()=>{delete local[id];model.formDraft=undefined;persist();vscode.postMessage({type:'hitdefDiscardDraft',file:model.file,index:model.currentIndex});render();};bar.append(button);}
 }
 document.addEventListener('input',event=>{if(event.target?.closest?.('[data-option]')){stage();restore();}});
 document.addEventListener('change',event=>{if(event.target?.closest?.('[data-option]')){stage();restore();}});
 window.addEventListener('message',event=>{if(event.data.type!=='hitdefDraftApplied')return;const {key,draft}=event.data;if(JSON.stringify(local[key])===JSON.stringify(draft)){delete local[key];persist();}if(identity()===key)model.formDraft=undefined;});
 globalThis.ikemenHitdefDraftBase=()=>local[identity()]?.base||model.formDraft?.base||model.sourceHash;
 globalThis.ikemenRestoreHitdefDraft=restore;
 globalThis.ikemenCanKeepDraft=()=>!!local[identity()];
 globalThis.ikemenCanLeaveAsset=()=>!local[identity()];
 globalThis.ikemenHasUnappliedForms=()=>!!local[identity()];
}
module.exports={clientScript:()=>`(${client.toString()})();`};
