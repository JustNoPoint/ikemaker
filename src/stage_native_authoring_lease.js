'use strict';
// A narrow witness for VS Code disposing a clean, hidden native document while
// an authoring dialog is open. It does not forgive owner/source/context changes.
function createStageNativeAuthoringLease(owner,initial,env){
 let document=initial,version=document.version,text=document.getText(),closed=false,disposed=false,readonlyReview=null;
 const source=env.diskProof(),initialProof=env.ownerProof(),state=JSON.stringify(initialProof);
 const retained=()=>{let proof=env.ownerProof();if(initialProof.active===true&&proof.active===false&&readonlyReview?.isCurrent()===true)proof={...proof,active:true};return !disposed&&owner.busy>0&&JSON.stringify(proof)===state&&env.diskProof()===source;};
 const clean=doc=>doc===document&&doc.isDirty===false&&doc.version===version&&doc.getText()===text;
 const lease={
  acceptClose(doc){try{if(!retained()||!clean(doc))return false;closed=true;return true;}catch{return false;}},
  beginReadonlyReview(isCurrent){if(typeof isCurrent!=='function'||!retained()||readonlyReview)throw Error('The exact Stage cannot start this read-only source review.');const scope={isCurrent};readonlyReview=scope;return()=>{if(readonlyReview===scope)readonlyReview=null;};},
  async restore(){
   if(initialProof.active===true&&env.ownerProof().active!==true)throw Error('Return to the exact active Stage before restoring native authoring. Nothing was applied.');
   if(!closed&&!document.isClosed)return document;
   if(!closed||!retained())throw Error('The native Stage closed without an unchanged clean-source witness. Nothing was applied.');
   const next=await env.open();
   if(!retained()||next.isClosed||next.isDirty!==false||next.getText()!==text)throw Error('The Stage changed while restoring its clean native authoring document. Nothing was applied.');
   env.adopt(next);document=next;version=next.version;text=next.getText();closed=false;return document;
  },
  dispose(){disposed=true;readonlyReview=null;if(owner.nativeAuthoringLease===lease)delete owner.nativeAuthoringLease;}
 };
 if(owner.nativeAuthoringLease)throw Error('A native Stage authoring lease is already active.');owner.nativeAuthoringLease=lease;return lease;
}
function retainStageNativeClose(owner,document){return owner.nativeAuthoringLease?.acceptClose(document)===true;}
function createStageNativeAuthoringSession(owner,initial,env){
 let document=initial,authority=env.capture();if(!authority)throw Error('Activate the intended Stage workspace.');
 const state=JSON.stringify(env.ownerProof()),disk=env.diskProof(),token=Object.freeze({nativeStageSession:true});
 const lease=createStageNativeAuthoringLease(owner,document,{...env,adopt:next=>{const fresh=env.capture(),expected={...authority,uri:next.uri?.toString?.()||authority.uri,version:String(next.version)};if(!fresh||JSON.stringify(fresh)!==JSON.stringify(expected))throw Error('Stage ownership, source or selection changed while restoring native authoring. Nothing was applied.');document=next;authority=fresh;}});
 const session={token,get document(){return document},get authority(){return authority},assert(stamp){if(stamp!==undefined&&stamp!==token)throw Error('The native Stage session changed.');env.assertAuthority(authority);if(JSON.stringify(env.ownerProof())!==state||env.diskProof()!==disk)throw Error('Stage owner, selection or disk identity changed during modal authoring. Nothing was applied.');},beginReadonlyReview(isCurrent){session.assert();return lease.beginReadonlyReview(isCurrent);},async restore(){document=await lease.restore();session.assert();return document},dispose:()=>lease.dispose()};return session;
}
function stageModalApi(api,session){
 const scoped=Object.create(api),window=Object.create(api.window);scoped.window=window;
 if(api.workspace?.openTextDocument){scoped.workspace=Object.create(api.workspace);scoped.workspace.openTextDocument=async(...args)=>{const document=await api.workspace.openTextDocument(...args);await session.restore();return document;};}
 for(const method of ['showQuickPick','showInputBox','showOpenDialog','showSaveDialog','showInformationMessage','showWarningMessage'])if(typeof api.window[method]==='function')window[method]=async(...args)=>{const result=await api.window[method](...args);if(!['showInformationMessage','showWarningMessage'].includes(method)||args[1]?.modal===true)await session.restore();return result;};
 return scoped;
}
module.exports={createStageNativeAuthoringLease,retainStageNativeClose,createStageNativeAuthoringSession,stageModalApi};
