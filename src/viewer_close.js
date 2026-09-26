'use strict';
const tracked=new Set(),pending=new Map(),capabilities=new Map();let sequence=0;
function track(panel){
 if(!panel?.webview?.onDidReceiveMessage||tracked.has(panel))return;
 tracked.add(panel);
 const listener=panel.webview.onDidReceiveMessage(message=>{if(message?.type!=='ikemenCloseState')return;const request=pending.get(message.id);if(request?.panel===panel)request.finish(message.verified===false?null:{clean:message.clean===true,busy:message.busy===true,canKeepDraft:message.canKeepDraft===true});});
 panel.onDidDispose(()=>{tracked.delete(panel);capabilities.delete(panel);listener?.dispose?.();for(const request of [...pending.values()])if(request.panel===panel)request.finish({clean:true});});
}
function support(panel,options){capabilities.set(panel,options);track(panel);}
function inspect(panel){return new Promise(resolve=>{const id=++sequence,timeout=setTimeout(()=>finish(null),2500);function finish(value){clearTimeout(timeout);pending.delete(id);resolve(value);}pending.set(id,{panel,finish});Promise.resolve().then(()=>panel.webview.postMessage({type:'ikemenPrepareClose',id})).then(sent=>{if(sent===false)finish(null);}).catch(()=>finish(null));});}
async function prepare(panels,api=require('vscode')){
 for(const panel of panels){
  track(panel);const actions=capabilities.get(panel);let state;
  try{state=actions?.isBusy?.()?{busy:true}:await inspect(panel);}catch(_){state=null;}
  if(state?.clean&&!state.busy)continue;
  panel.reveal?.(panel.viewColumn,false);
  if(state===null){await api.window.showInformationMessage('Could not verify '+(panel.title||'the visual workspace')+'. It was kept open. Reopen it or finish its current operation before closing the session.');return false;}
  if(state.busy){await api.window.showInformationMessage((panel.title||'This visual workspace')+' is still applying or saving changes. Wait for it to finish before closing.');return false;}
  const canKeep=state.canKeepDraft&&typeof actions?.keepDraft==='function';
  const answer=await api.window.showWarningMessage((panel.title||'This visual workspace')+' has unapplied edits. Review and apply them before closing, or choose how to close this view. Closing without applying may lose form edits; existing local recovery drafts remain available.',{modal:true},...(canKeep?['Keep Draft and Close']:[]),'Close Without Applying');
  if(answer==='Keep Draft and Close'&&canKeep){try{await actions.keepDraft();}catch(error){await api.window.showWarningMessage('The draft could not be kept. This view remains open: '+error.message);return false;}}
  else if(answer!=='Close Without Applying')return false;
  // A save may have started while the confirmation was open.
  const finalState=await inspect(panel);
  if(!finalState||finalState.busy||actions?.isBusy?.()){await api.window.showInformationMessage('The view could not finish its close check. Wait for pending changes to finish and try again.');return false;}
  if(answer==='Keep Draft and Close'&&!finalState.clean&&!finalState.canKeepDraft){await api.window.showInformationMessage('The form changed while keeping the draft. Review it before closing.');return false;}
 }
 return true;
}
function client(){
 const baseline=new WeakMap(),touched=new Set(),unknown=Symbol('unknown');
 const ignore=element=>/search|filter|zoom|proof|thumbnail/i.test(element.id||element.name||'');
 const eligible=element=>element?.matches?.('input,textarea,select')&&!ignore(element);
 const value=element=>['checkbox','radio'].includes(element.type)?element.checked:element.value;
 const capture=element=>{if(eligible(element)&&!baseline.has(element))baseline.set(element,value(element));};
 for(const element of document.querySelectorAll?.('input,textarea,select')||[])capture(element);
 document.addEventListener?.('focusin',event=>capture(event.target),true);
 const changed=event=>{const element=event.target;if(!eligible(element))return;if(!baseline.has(element))baseline.set(element,unknown);touched.add(element);};
 document.addEventListener?.('input',changed,true);document.addEventListener?.('change',changed,true);
 function dirty(){
  if(typeof globalThis.ikemenHasUnappliedForms==='function')return globalThis.ikemenHasUnappliedForms();
  for(const element of touched){if(element.isConnected===false){touched.delete(element);continue;}const original=baseline.get(element);if(original===unknown||value(element)!==original)return true;}
  return false;
 }
 globalThis.addEventListener?.('message',event=>{
  const message=event.data;
  if(message?.type==='ikemenPresetCapture'){vscode.postMessage({type:'ikemenPresetState',id:message.id,reference:globalThis.ikemenNavigationSelection?.()});return;}
  if(message?.type!=='ikemenPrepareClose')return;
  let clean=false,busy=false,canKeepDraft=false,verified=true;
  try{busy=globalThis.ikemenIsBusy?.()===true;const formsDirty=dirty();canKeepDraft=globalThis.ikemenCanKeepDraft?.()===true&&(!formsDirty||typeof globalThis.ikemenHasUnappliedForms==='function');clean=!formsDirty&&!busy;if(typeof globalThis.ikemenCanLeaveAsset==='function')clean=globalThis.ikemenCanLeaveAsset()&&clean;else if(typeof globalThis.ikemenCanRestoreNavigation==='function'){const selection=globalThis.ikemenNavigationSelection?.();if(selection)clean=globalThis.ikemenCanRestoreNavigation(selection)&&clean;}}catch(_){clean=false;verified=false;}
  vscode.postMessage({type:'ikemenCloseState',id:message.id,clean,busy,canKeepDraft,verified});
 });
}
module.exports={track,support,prepare,clientScript:()=>`(${client.toString()})();`};
