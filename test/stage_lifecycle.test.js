'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-workspace-life-'));
 const first=path.join(root,'first.def'),second=path.join(root,'second.def'),single=path.join(root,'single.def');
 const stage='[Info]\nname=Test\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=0,1\nstart=0,200\n';
 const singleStage='[Info]\nname=Single\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Only]\ntype=normal\nspriteno=0,0\nstart=0,0\n';
 fs.writeFileSync(first,stage);fs.writeFileSync(second,stage);fs.writeFileSync(single,singleStage);
 const commands=new Map(),panels=[],sourceVisits=[],restores=[],posted=[],clipboard=[],storage={},closeStates=[],warningAnswers=[];let activeEditorChanged,documentClosed,nav,serializer,failStorage=false;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),languageId:'ini',getText:()=>fs.readFileSync(filename,'utf8'),get lineCount(){return this.getText().split('\n').length;},lineAt(line){return{text:this.getText().split('\n')[line]};}});
 const docs=new Map([[first,document(first)],[second,document(second)],[single,document(single)]]);
 function createPanel(){
  const disposals=[],listeners=[];const panel={viewColumn:2,active:true,reveals:0,reveal(){this.reveals++;},onDidChangeViewState(){return{dispose(){}};},onDidDispose(fn){disposals.push(fn);},dispose(){this.disposed=true;disposals.forEach(fn=>fn());},webview:{
   onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));queueMicrotask(()=>fn({type:'viewerToolbarReady',surface:'stage'}));return{dispose(){}};},
   postMessage(message){posted.push(message);if(message.type==='viewerHistoryRestore'){restores.push(message);queueMicrotask(()=>panel.receive({type:'viewerHistoryRestored',requestId:message.requestId,ok:true}));}if(message.type==='ikemenPrepareClose'){const state=closeStates.shift();queueMicrotask(()=>panel.receive({type:'ikemenCloseState',id:message.id,verified:true,...state}));}return true;}
  }};panels.push(panel);return panel;
 }
 const vscode={Uri:{file:uri},Range:class{constructor(line){this.line=line;}},ViewColumn:{Active:1,Beside:2},env:{clipboard:{writeText:async text=>clipboard.push(text)}},workspace:{textDocuments:[],openTextDocument:async target=>docs.get(target.fsPath||target),getConfiguration:()=>({get:(name,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}}),onDidCloseTextDocument:fn=>{documentClosed=fn;return{dispose(){}};}},window:{registerWebviewPanelSerializer:(name,value)=>{serializer=value;return{dispose(){}};},createWebviewPanel:createPanel,showTextDocument:async(doc,options)=>{sourceVisits.push({doc,options});return{};},onDidChangeActiveTextEditor:fn=>{activeEditorChanged=fn;return{dispose(){}};},onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:async()=>warningAnswers.shift(),showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(name,...args)=>{assert(commands.has(name),name);return commands.get(name)(...args);}}};
 const original=Module._load;
 Module._load=function(name,parent,main){
  if(name==='vscode')return vscode;
  if(name==='./viewer_group')return{focusedVisualWorkspaceColumn:async()=>2,trackViewerPanel:p=>p};
  if(name==='./viewer_toolbar')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  if(name==='./viewer_layout')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  return original.call(this,name,parent,main);
 };
 try{
  nav=require('../src/viewer_navigation');
  const registry=require('../src/authoring_context_registry'),api=require('../src/stage_workspace');
  api.registerStageWorkspace({subscriptions:[],workspaceState:{get:(key,fallback)=>storage[key]??fallback,update:async(key,value)=>{if(failStorage)throw Error('store failed');storage[key]=value;}}});
  const open=()=>vscode.commands.executeCommand('ikemen.stage.openWorkspace',uri(first));
  const panel=await open();assert.strictEqual(panel,panels[0]);assert.equal(panels.length,1);
  const markup=panel.webview.html;
  assert(markup.indexOf('id="discard"')<markup.indexOf('What am I editing?'),'editing actions precede expandable guidance');
  assert(markup.includes('Guided authoring recipes'),'guidance remains available');
  assert.strictEqual(await open(),panel);assert.equal(panels.length,1);assert(panel.reveals>0);
  const ref={backgroundName:'Floor',backgroundType:'normal'};
  const line=stage.split('\n').indexOf('[BG Floor]');
  const visits=sourceVisits.length;await panel.receive({type:'openSource',generation:1,line,navigationSelection:ref,forged:true});assert.equal(sourceVisits.length,visits,'extra-key source traffic fails closed');await panel.receive({type:'openSource',generation:0,line,navigationSelection:ref});assert.equal(sourceVisits.length,visits,'stale-generation source traffic fails closed');
  const commits=posted.filter(message=>message.type==='stageSelectionCommit').length;await panel.receive({type:'selectionChanged',generation:1,selected:1,extra:true});assert.equal(posted.filter(message=>message.type==='stageSelectionCommit').length,commits,'forged selection does not commit');await panel.receive({type:'selectionChanged',generation:1,selected:1});assert.equal(posted.at(-2).type,'stageSelectionCommit');
  await panel.receive({type:'previewDraft',generation:1,selected:0,previewStarts:[[99,99],[99,99]]});assert.equal(storage['ikemaker.stagePreviewDrafts.v1'],undefined,'preview drafts cannot forge or silently change the host-committed selection');
  await panel.receive({type:'previewDraft',generation:1,selected:1,previewStarts:[[12,34],[56,78]]});const stored=Object.values(storage['ikemaker.stagePreviewDrafts.v1'])[0];assert.equal(stored.entries[1].start[0],56,'a draft for the committed selection is durably stored under stable background identities');
  await panel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'text-source'});assert.equal(sourceVisits.at(-1).options.selection.line,line,'universal Text / Source resolves the exact committed background block');
  const beforeExactRace=sourceVisits.length,exactRace=panel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'text-source'});queueMicrotask(()=>registry.getContextModel(registry.currentContext()).update({selection:{surfaceId:'stage.workspace',uri:'forged-race',reference:{}}}));await exactRace;assert.equal(sourceVisits.length,beforeExactRace,'final exact-source reauthorization prevents an injected resolve-to-open race');await panel.receive({type:'selectionChanged',generation:1,selected:1});
  await panel.receive({type:'openSource',generation:1,line,navigationSelection:ref});
  assert.equal(sourceVisits.at(-1).doc.fileName,first);assert.equal(sourceVisits.at(-1).options.selection.line,line);
  const adapter=api.createStageRetargetAdapter(panel),transaction={from:{kind:'stage',identity:'first',ownerFile:first,label:'First'},to:{kind:'stage',identity:'single',ownerFile:single,label:'Single'},fromState:null,toState:null},prepared=await adapter.prepare(transaction);
  assert.strictEqual(await adapter.validate(transaction,prepared),true);await adapter.commit(transaction,prepared);
  assert.strictEqual(panels.length,1,'entity retargeting reuses the exact Stage Workspace panel');assert(panel.title.includes('Single'));assert(panel.webview.html.includes(path.basename(single)),'the same panel adopts the exact destination stage');
  await panel.receive({type:'copyPatch',generation:2,text:'ignored-client-patch'});assert(clipboard.at(-1).startsWith('[BG Only]'),'the host selection resets to the new entity instead of retaining an out-of-range prior-stage index');
  fs.writeFileSync(first,stage.replace('name=Test','name=Changed During Switch'));
  await adapter.rollback(transaction,prepared);assert(panel.webview.html.includes(path.basename(first))&&panel.title.includes('Changed During Switch'),'rollback rebuilds a source that changed during the transaction instead of restoring a stale captured payload');
  const rollbackHtml=panel.webview.html;await adapter.rollback(transaction,prepared);assert.strictEqual(panel.webview.html,rollbackHtml,'a repeated transaction rollback is idempotent');fs.writeFileSync(first,stage);
  const unavailableTransaction={from:transaction.from,to:{kind:'character',identity:'ryu',ownerFile:path.join(root,'Ryu.def'),label:'Ryu'},fromState:null,toState:null},unavailable=await adapter.prepare(unavailableTransaction);assert.strictEqual(await adapter.validate(unavailableTransaction,unavailable),true);await adapter.commit(unavailableTransaction,unavailable);
  assert(panel.webview.html.includes('no applicable stage resource')&&panel.webview.html.includes('data-ikemaker-entity-strip'),'an inapplicable entity shows a truthful synchronized empty stage instead of stale prior content');
  await adapter.rollback(unavailableTransaction,unavailable);assert(panel.webview.html.includes(path.basename(first)),'unavailable rollback restores the prior stage without opening another panel');
  panel.dispose();assert(await nav.travelHistory(-1));assert.equal(panels.length,2,'history invokes the actual workspace opener after disposal');assert(panels[1].webview.html.includes('"previewStarts":[[12,34],[56,78]]'),'matching source hash and identities recover the durable preview');
  assert.deepStrictEqual(restores.at(-1).reference,ref);
  assert(await nav.travelHistory(1));
  assert(await nav.travelHistory(-1),'history restores the existing stage panel');
  assert.equal(panels.length,2);assert.deepStrictEqual(restores.at(-1).reference,ref);
  panels[1].dispose();
  const restored=createPanel();await serializer.deserializeWebviewPanel(restored,{filename:first});
  assert.strictEqual(await open(),restored,'serialized panel is reused by the actual open command');
  assert(restored.webview.html.includes('ikemenNavigationSelection'));
  const duplicate=createPanel();await serializer.deserializeWebviewPanel(duplicate,{filename:first});
  assert(duplicate.disposed,'duplicate serialized panels are discarded');
  restored.dispose();
  const late=await open(),lateHtml=late.webview.html;documentClosed(docs.get(first));late.dispose();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(late.webview.html,lateHtml,'document-close rebind cannot render after panel disposal');
  const missing=createPanel();await serializer.deserializeWebviewPanel(missing,{filename:path.join(root,'missing.def')});
  assert(missing.disposed,'missing source serializer closes the panel');
  const closePanel=await vscode.commands.executeCommand('ikemen.stage.openWorkspace',uri(second));await closePanel.receive({type:'previewDraft',generation:1,selected:0,previewStarts:[[4,4],[0,200]]});closeStates.push({clean:false,busy:false,canKeepDraft:true});warningAnswers.push(undefined);await closePanel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'close'});assert(!closePanel.disposed,'universal Close cancellation keeps the actual panel');closeStates.push({clean:false,busy:false,canKeepDraft:true},{clean:false,busy:false,canKeepDraft:true});warningAnswers.push('Keep Draft and Close');await closePanel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'close'});assert(closePanel.disposed,'universal Close Keep path disposes only after both inspections');assert(Object.keys(storage['ikemaker.stagePreviewDrafts.v1']||{}).some(key=>key.includes('second.def')),'Keep path preserves the durable Stage draft');
  const discardPanel=await open();await discardPanel.receive({type:'previewDraft',generation:1,selected:0,previewStarts:[[5,5],[0,200]]});closeStates.push({clean:false,busy:false,canKeepDraft:true},{clean:false,busy:false,canKeepDraft:true});warningAnswers.push('Close Without Applying');await discardPanel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'close'});assert(discardPanel.disposed,'universal Close discard path disposes after final inspection');assert(!Object.keys(storage['ikemaker.stagePreviewDrafts.v1']||{}).some(key=>key.includes('first.def')),'discard path removes its durable Stage draft');
  const failurePanel=await vscode.commands.executeCommand('ikemen.stage.openWorkspace',uri(second));failStorage=true;await failurePanel.receive({type:'previewDraft',generation:1,selected:0,previewStarts:[[6,6],[0,200]]});closeStates.push({clean:false,busy:false,canKeepDraft:true});warningAnswers.push('Keep Draft and Close');await failurePanel.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'close'});assert(!failurePanel.disposed,'draft-stage failure blocks Keep Draft close through the actual receiver');failStorage=false;
  assert.equal(fs.readFileSync(first,'utf8'),stage,'navigation never changes the stage file');
  console.log('Actual Stage command, reuse, source message, history reopen and serializer lifecycle passed');
 }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});


