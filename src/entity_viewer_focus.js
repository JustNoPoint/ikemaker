'use strict';
const path=require('path');
const {resolveEntityTargets,targetsStillCurrent}=require('./entity_target_resolver');
function sameFile(a,b){if(!a||!b)return false;const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);return normalize(a)===normalize(b);}
// VS Code applies reveal asynchronously, particularly during a restored split layout.
async function revealEntityPanel(panel, verify) {
 const waitForFocus=()=>new Promise(resolve=>{
  let listener;
  const finish=()=>{clearTimeout(timer);listener?.dispose();resolve();};
  const timer=setTimeout(finish,450);
  listener=panel.onDidChangeViewState(event=>{if(event.webviewPanel.active)finish();});
  if(panel.active)finish();
 });
 for(let attempt=0;attempt<2;attempt++){
  verify();
  if(panel.active===true)return {ok:true};
  panel.reveal(panel.viewColumn,false);
  if(panel.active===false&&panel.onDidChangeViewState)await waitForFocus();
  verify();
  if(panel.active!==false)return {ok:true};
 }
 return {ok:false,reason:'VS Code could not focus the selected entity viewer. Select its editor tab to continue.'};
}
// VS Code restores hidden webviews lazily. Activate the existing editor tab so
// its serializer can recover its selection before asking a viewer to open a file.
async function focusLoadedEditor(runtime,descriptor,isCurrent){
 const groups=runtime.vscode.window?.tabGroups;
 if(!groups||!descriptor)return false;
 const type=descriptor.kind==='character'?['ikemenSffViewer','ikemenAirWorkspace','ikemenSndViewer']:
   descriptor.kind==='stage'?['ikemenStageWorkspace']:descriptor.kind==='storyboard'?['ikemenStoryboardWorkspace']:
   descriptor.kind==='screenpack'?[path.basename(descriptor.ownerFile).toLowerCase()==='select.def'?'ikemenSelectDefWorkspace':'ikemenUiWorkspace']:[];
 if(!type.length)return false;
 const matches=tab=>type.some(view=>tab.input?.viewType?.endsWith(view))&&!/^Transfer /i.test(tab.label);
 const bound=()=>Array.from(runtime.host.headers.keys()).find(panel=>{
   if(!type.includes(panel.viewType)||!runtime.registry.hasPanel(panel))return false;
   return sameFile(require('./entity_switch_runtime').ownerForEntry(runtime.registry.contextSnapshot({panel})),descriptor.ownerFile);
 });
 const verify=()=>{if(!isCurrent())throw Error('The requested entity changed during navigation.');};
 let panel=bound();
 if(panel){verify();return (await revealEntityPanel(panel,verify)).ok;}
 const ordinals=['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth'];
 for(const group of groups.all){
   for(const tab of group.tabs.filter(matches)){
     verify();
     const index=group.tabs.indexOf(tab);
     if(index<0)continue;
     if(groups.activeTabGroup!==group){
       const ordinal=ordinals[group.viewColumn-1];if(!ordinal)continue;
       await runtime.vscode.commands.executeCommand('workbench.action.focus'+ordinal+'EditorGroup');
     }
     if(!tab.isActive){
       if(index<9)await runtime.vscode.commands.executeCommand('workbench.action.openEditorAtIndex'+(index+1));
       else for(let i=0;i<group.tabs.length&&!tab.isActive;i++){verify();await runtime.vscode.commands.executeCommand('workbench.action.nextEditorInGroup');}
     }
     if(!tab.isActive)continue;
     for(let attempt=0;attempt<40;attempt++){
       verify();panel=bound();
       if(panel)return (await revealEntityPanel(panel,verify)).ok;
       if(Array.from(runtime.host.headers.keys()).some(p=>p.active&&type.includes(p.viewType)))break;
       await new Promise(resolve=>setTimeout(resolve,50));
     }
   }
 }
 return false;
}
async function focusEntityViewer(runtime,request){
 const {descriptor,panel,isCurrent}=request;
 const assertCurrent=()=>{if(runtime.disposed||!isCurrent()||!descriptor||descriptor.identity!==request.identity)throw Error('The entity selection changed before opening its viewer.');};
 assertCurrent();
 const readOwnerText=filename=>{const document=(runtime.vscode.workspace.textDocuments||[]).find(doc=>!doc.isClosed&&sameFile(doc.fileName,filename));return document?{text:document.getText(),version:document.version}:undefined;};
 const proof=resolveEntityTargets(descriptor,{readOwnerText});
 const assertProof=()=>{assertCurrent();if(!targetsStillCurrent(proof,{readOwnerText}))throw Error('The exact entity definition changed before opening its viewer.');return true;};
 const assertOpenedProof=()=>{if(runtime.disposed||!(request.selectionCurrent||isCurrent)()||!targetsStillCurrent(proof,{readOwnerText}))throw Error('The exact entity selection or definition changed while its viewer was opening.');return true;};
 const ownsPanel=record=>{
  if(!record)return false;
  const registry=runtime.registry;
  // The entity list has one representative per owner. Several viewers may share it.
  const entry=registry?.hasPanel?.(record.panel)?registry.contextSnapshot({panel:record.panel}):runtime.lastEntries.find(item=>item.panel===record.panel);
  return entry&&sameFile(require('./entity_switch_runtime').ownerForEntry(entry),descriptor.ownerFile);
 };
 const requested=runtime.attachments.get(panel)?.options.surfaceId||request.surfaceId||'',roster=descriptor.kind==='screenpack'&&path.basename(descriptor.ownerFile).toLowerCase()==='select.def';
 const preferred=descriptor.kind==='stage'?['stage.workspace']:descriptor.kind==='screenpack'?[roster?'screenpack.roster':'screenpack.workspace']:descriptor.kind==='character'?[!['companion.text-toolbar','stage.workspace','screenpack.workspace','screenpack.roster'].includes(requested)?requested:'','sff.viewer','air.viewer','snd.viewer'].filter(Boolean):[];
 const applicable=surface=>descriptor.kind!=='character'||(!surface.startsWith('sff.')||proof.sff.available)&&(!surface.startsWith('air.')||proof.air.available)&&(!surface.startsWith('snd.')||proof.snd.available);
 for(const surface of preferred){
  if(!applicable(surface))continue;
  const record=runtime.canonical.get(surface);if(!record||record.disposed||record.excluded)continue;
  const entry=ownsPanel(record);
  if(!entry)continue;
  return revealEntityPanel(record.panel,assertProof);
 }
 if(descriptor.kind==='storyboard'){
  assertProof();
  const opened=await runtime.vscode.commands.executeCommand('ikemen.storyboard.open',runtime.vscode.Uri.file(descriptor.ownerFile));
  assertOpenedProof();
  return opened&&ownsPanel({panel:opened})?revealEntityPanel(opened,assertOpenedProof):{ok:false,reason:'Storyboard Editor did not open the selected storyboard.'};
 }
 if(descriptor.kind==='workspace'){
  const entry=runtime.lastEntries.find(item=>sameFile(require('./entity_switch_runtime').ownerForEntry(item),descriptor.ownerFile)&&item.panel&&item.panel!==panel);
  if(!entry)return{ok:false,reason:'This workspace has no open viewer to focus. Open its existing tool from the workspace menu.'};
  return revealEntityPanel(entry.panel,assertProof);
 }
 const uri=runtime.vscode.Uri.file(descriptor.ownerFile);let command,args;
 if(descriptor.kind==='stage'){command='ikemen.stage.openWorkspace';args=[uri];}
 else if(descriptor.kind==='screenpack'){command=roster?'ikemen.selectDef.openWorkspace':'ikemen.ui.openWorkspace';args=[uri];}
 else if(proof.sff.available){command='sff.openViewer';args=[runtime.vscode.Uri.file(proof.sff.filename),undefined,undefined,{ownerDefs:[descriptor.ownerFile],entityIdentity:request.identity}];}
 else if(proof.air.available){command='air.openAnimationPreview';args=[runtime.vscode.Uri.file(proof.air.filename),{ownerDefs:[descriptor.ownerFile],preserveFocus:false,sourceReturnGuard:assertOpenedProof}];}
 else return{ok:false,reason:'This character has no available assigned SFF or AIR viewer. Its source and retained work remain open.'};
 assertProof();
 // Commands retain their own close/draft/source guards. There is no uniform
 // cancellation API after dispatch: revalidate before it, then report late drift.
 await runtime.vscode.commands.executeCommand(command,...args);
 assertOpenedProof();
 const expected=descriptor.kind==='stage'?'stage.workspace':descriptor.kind==='screenpack'?(roster?'screenpack.roster':'screenpack.workspace'):command==='sff.openViewer'?'sff.viewer':'air.viewer',opened=runtime.canonical.get(expected);
 if(!opened||opened.disposed||!ownsPanel(opened))return{ok:false,reason:'The requested viewer was not opened; the existing source and retained work were left intact.'};
 return revealEntityPanel(opened.panel,assertOpenedProof);
}
module.exports={sameFile,focusEntityViewer,focusLoadedEditor};
