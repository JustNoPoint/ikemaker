'use strict';
function client(){
 const initial=vscode.getState()||{},local=initial.filename===data.filename?{...(initial.sceneDrafts||{})}:{};
 const entry=()=>Object.prototype.hasOwnProperty.call(local,current()?.key)?local[current()?.key]:data.drafts?.[current()?.key];
 const persist=()=>vscode.setState({...vscode.getState(),sceneDrafts:local});
 const effectIds=['fadeInTime','fadeInColor','fadeInAnim','fadeInSnd','fadeOutTime','fadeOutColor','fadeOutAnim','fadeOutSnd','bgmMode','bgmFile'];
 const effectBase=scene=>JSON.stringify({fadeInTime:String(scene.fadeInTime),fadeInColor:scene.fadeInColor?.join(','),fadeInAnim:String(scene.fadeInAnim),fadeInSnd:scene.fadeInSnd?.join(','),fadeOutTime:String(scene.fadeOutTime),fadeOutColor:scene.fadeOutColor?.join(','),fadeOutAnim:String(scene.fadeOutAnim),fadeOutSnd:scene.fadeOutSnd?.join(','),bgmMode:scene.bgmOwn?(scene.bgm?'file':'empty'):'inherit',bgmFile:scene.bgm||''});
 const effects=()=>Object.fromEntries(effectIds.filter(id=>$(id)).map(id=>[id,$(id).value]));
 globalThis.sceneDraftSnapshot=()=>({baseDuration:entry()?.baseDuration??String(current().endTime),baseColor:entry()?.baseColor??current().clearColor.join(','),baseEffects:entry()?.baseEffects??effectBase(current()),duration:$('duration').value,color:$('color').value,effects:effects()});
 function stage(){if(!current())return;const draft=sceneDraftSnapshot();local[current().key]=draft;persist();vscode.postMessage({type:'sceneDraft',sceneKey:current().key,draft});restore();}
 function restore(){const scene=current();if(!scene)return;const draft=entry();if(draft){local[scene.key]=draft;persist();$('duration').value=draft.duration;$('color').value=draft.color;for(const id of effectIds)if($(id)&&draft.effects&&Object.prototype.hasOwnProperty.call(draft.effects,id))$(id).value=draft.effects[id];}const conflict=draft&&(draft.baseDuration!==String(scene.endTime)||draft.baseColor!==scene.clearColor.join(',')||draft.baseEffects&&draft.baseEffects!==effectBase(scene));$('apply').disabled=!!conflict;let bar=$('sceneDraftStatus');if(!bar){bar=document.createElement('div');bar.id='sceneDraftStatus';bar.setAttribute('role','status');$('apply').after(bar);}bar.textContent=draft?(conflict?'Source values changed. Your scene draft is retained; review or discard it.':'Unapplied scene draft retained.'):'';if(draft){const button=document.createElement('button');button.textContent='Discard scene draft';button.onclick=()=>{local[scene.key]=null;persist();vscode.postMessage({type:'discardSceneDraft',sceneKey:scene.key});render();};bar.append(button);}}
 $('duration').addEventListener('input',stage);$('color').addEventListener('input',stage);for(const id of effectIds)$(id)?.addEventListener(id.endsWith('Color')||id==='bgmMode'?'change':'input',stage);
 window.addEventListener('message',event=>{const message=event.data;if(message.type==='sceneDraftRemoved'){local[message.sceneKey??message.sceneNumber]=null;persist();}else if(message.type==='sceneDraftApplied'){const key=message.sceneKey??message.sceneNumber;if(JSON.stringify(local[key])===JSON.stringify(message.draft)){local[key]=null;persist();}}});
 const hasDrafts=()=>Object.values({...data.drafts,...local}).some(Boolean);
 globalThis.ikemenHasUnappliedForms=hasDrafts;
 globalThis.ikemenCanKeepDraft=hasDrafts;
 globalThis.ikemenSceneEffectsClean=()=>!current()||!effectIds.some(id=>$(id))||JSON.stringify(effects())===effectBase(current());
 globalThis.restoreSceneDraft=restore;
}
module.exports={clientScript:()=>`(${client.toString()})();`};
