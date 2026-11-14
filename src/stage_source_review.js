'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const providers=new WeakMap();
async function reviewDecision(api,token,index,total,filename,disposal){
 if(!api.window.createStatusBarItem||!api.commands.registerCommand){const notice=api.window.showInformationMessage(`Review ${index+1}/${total}: ${filename}`,{modal:false},'Continue Review','Cancel');return Promise.race([notice,disposal]);}
 let resolve;const action=new Promise(done=>{resolve=done;}),resources=[];
 try{
  for(const [suffix,text,answer]of [['continue','$(check) Continue review '+(index+1)+'/'+total,'Continue Review'],['cancel','$(close) Cancel review','Cancel']]){
   const command='ikemen.stageSourceReview.'+token+'.'+index+'.'+suffix;
   resources.push(api.commands.registerCommand(command,()=>resolve(answer)));
   const item=api.window.createStatusBarItem(api.StatusBarAlignment?.Right,1000000);resources.push(item);item.text=text;item.tooltip=filename;item.command=command;item.show();
  }
  return await Promise.race([action,disposal]);
 }finally{for(const resource of resources.reverse())resource.dispose();}
}
function acquire(api){
 // stageModalApi creates prototype wrappers; the inherited registration
 // function remains the same underlying VS Code capability across sessions.
 const key=api.workspace.registerTextDocumentContentProvider;
 let state=providers.get(key);if(!state){state={key,contents:new Map(),references:0,disposed:false};state.registration=api.workspace.registerTextDocumentContentProvider('ikemaker-stage-review',{provideTextDocumentContent:uri=>state.contents.get(uri.toString())??'This Stage review has closed.'});providers.set(key,state);}state.references++;return state;
}
async function reviewStageSources(api,{rows,title,summary,approveLabel,assertCurrent,returnToStage=async()=>{},onDispose,beginReadonlyReview}){
 if(!Array.isArray(rows)||!rows.length||rows.some(row=>typeof row.filename!=='string'||typeof row.before!=='string'||typeof row.after!=='string'))throw Error('Choose exact before/after Stage source snapshots.');
 const state=acquire(api),pairs=[],token=crypto.randomUUID();let closed=false,rejectDisposed;
 const disposal=new Promise((_resolve,reject)=>{rejectDisposed=reject;});disposal.catch(()=>{});
 const subscription=onDispose?.(()=>{closed=true;rejectDisposed(Error('The retained Stage closed during source review. Nothing was applied.'));});
 const wait=promise=>Promise.race([promise,disposal]);
 const isOwned=()=>{const document=api.window.activeTextEditor?.document,uri=document?.uri?.toString();return !closed&&!state.disposed&&document?.isClosed!==true&&state.contents.has(uri)&&pairs.some(pair=>pair.before.toString()===uri||pair.after.toString()===uri);};
 const check=()=>{if(state.disposed||closed)throw Error('The Stage source review closed.');assertCurrent();};let endReadonlyReview;
 try{
  check();
  endReadonlyReview=beginReadonlyReview?.(isOwned);
  for(const [index,row]of rows.entries()){
   const uri=side=>api.Uri.from({scheme:'ikemaker-stage-review',authority:token,path:'/'+side+'/'+path.basename(row.filename),query:encodeURIComponent(row.filename)}),before=uri('before'),after=uri('after');
   state.contents.set(before.toString(),row.before);state.contents.set(after.toString(),row.after);pairs.push({before,after});
   await api.commands.executeCommand('vscode.diff',before,after,`${index+1}/${rows.length} · ${path.basename(row.filename)} · BEFORE ↔ AFTER`,{preview:false});
   const answer=await reviewDecision(api,token,index,rows.length,row.filename,disposal);
   await returnToStage();check();if(answer!=='Continue Review')return false;
  }
  const answer=await wait(api.window.showInformationMessage(title,{modal:true,detail:summary+'\n\nReviewed files:\n'+rows.map((row,index)=>(index+1)+'. '+path.basename(row.filename)+'\n'+row.filename).join('\n')+'\n\nOne unsaved native edit. Inspect all affected files before native Undo/Redo.'},approveLabel));
  await returnToStage();check();return answer===approveLabel;
 }finally{
  endReadonlyReview?.();
  subscription?.dispose();
  // Match both opaque owned resources. Never close another editor's tab.
  try{const tabs=(api.window.tabGroups?.all||[]).flatMap(group=>group.tabs||[]).filter(tab=>pairs.some(pair=>tab.input?.original?.toString()===pair.before.toString()&&tab.input?.modified?.toString()===pair.after.toString()));if(tabs.length)await api.window.tabGroups.close(tabs,true);}finally{
   for(const pair of pairs){state.contents.delete(pair.before.toString());state.contents.delete(pair.after.toString());}
   if(--state.references===0){state.disposed=true;state.registration.dispose();providers.delete(state.key);}
  }
 }
}
async function returnToStageReview(owner,filename,generation){
 if(owner.disposed||owner.filename!==filename||owner.generation!==generation)throw Error('The retained Stage changed during source review. Nothing was applied.');
 if(owner.panel.active)return;
 await new Promise((resolve,reject)=>{let timer,subscription;const finish=error=>{clearTimeout(timer);subscription?.dispose();error?reject(error):resolve();};subscription=owner.panel.onDidChangeViewState?.(event=>{if(event.webviewPanel===owner.panel&&owner.panel.active)finish();});timer=setTimeout(()=>finish(Error('Return to the exact Stage before applying this source review.')),2000);try{owner.panel.reveal(owner.panel.viewColumn,false);if(owner.panel.active)finish();}catch(error){finish(error);}});
 if(owner.disposed||owner.filename!==filename||owner.generation!==generation||!owner.panel.active)throw Error('The retained Stage changed during source review. Nothing was applied.');
}
module.exports={reviewStageSources,returnToStageReview};
