'use strict';
function client(){
 const initial=vscode.getState()||{},local=initial.filename===data.filename?{...(initial.sceneDrafts||{})}:{};
 const entry=()=>Object.prototype.hasOwnProperty.call(local,current()?.number)?local[current()?.number]:data.drafts?.[current()?.number];
 const persist=()=>vscode.setState({...vscode.getState(),sceneDrafts:local});
 globalThis.sceneDraftSnapshot=()=>({baseDuration:entry()?.baseDuration??String(current().endTime),baseColor:entry()?.baseColor??current().clearColor.join(','),duration:$('duration').value,color:$('color').value});
 function stage(){if(!current())return;const draft=sceneDraftSnapshot();local[current().number]=draft;persist();vscode.postMessage({type:'sceneDraft',sceneNumber:current().number,draft});restore();}
 function restore(){const scene=current();if(!scene)return;const draft=entry();if(draft){local[scene.number]=draft;persist();$('duration').value=draft.duration;$('color').value=draft.color;}const conflict=draft&&(draft.baseDuration!==String(scene.endTime)||draft.baseColor!==scene.clearColor.join(','));$('apply').disabled=!!conflict;let bar=$('sceneDraftStatus');if(!bar){bar=document.createElement('div');bar.id='sceneDraftStatus';bar.setAttribute('role','status');$('apply').after(bar);}bar.textContent=draft?(conflict?'Source values changed. Your scene draft is retained; review or discard it.':'Unapplied scene draft retained.'):'';if(draft){const button=document.createElement('button');button.textContent='Discard scene draft';button.onclick=()=>{local[scene.number]=null;persist();vscode.postMessage({type:'discardSceneDraft',sceneNumber:scene.number});render();};bar.append(button);}}
 $('duration').addEventListener('input',stage);$('color').addEventListener('input',stage);
 window.addEventListener('message',event=>{const message=event.data;if(message.type==='sceneDraftRemoved'){local[message.sceneNumber]=null;persist();}else if(message.type==='sceneDraftApplied'){if(JSON.stringify(local[message.sceneNumber])===JSON.stringify(message.draft)){local[message.sceneNumber]=null;persist();}}else if(message.type==='storyboardModel'){const number=current()?.number;data=message.data;model=data.model;selected=Math.max(0,model.scenes.findIndex(scene=>scene.number===number));render();}});
 const hasDrafts=()=>Object.values({...data.drafts,...local}).some(Boolean);
 globalThis.ikemenHasUnappliedForms=hasDrafts;
 globalThis.ikemenCanKeepDraft=hasDrafts;
 globalThis.restoreSceneDraft=restore;
}
module.exports={clientScript:()=>`(${client.toString()})();`};
