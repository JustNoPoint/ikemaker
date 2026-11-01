'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'code-workspace-life-'));
 const first=path.join(root,'first.zss'),second=path.join(root,'second.zss'),third=path.join(root,'third.zss');
 const firstOwner=path.join(root,'first.def'),secondOwner=path.join(root,'second.def'),thirdOwner=path.join(root,'third.def'),stageOwner=path.join(root,'stage.def');
 fs.writeFileSync(first,'[StateDef 200]\nHitDef{\n damage:30;\n}\n');
 fs.writeFileSync(second,'[StateDef 200]\nHitDef{\n damage:40;\n}\n');
 fs.writeFileSync(third,'[StateDef 300]\nChangeState{\n value:0;\n}\n');
 fs.writeFileSync(firstOwner,'[Files]\ncns = first.zss\n');fs.writeFileSync(secondOwner,'[Files]\ncns = second.zss\n');fs.writeFileSync(thirdOwner,'[Files]\ncns = third.zss\n');fs.writeFileSync(stageOwner,'[Camera]\nstartx = 0\n');
 const commands=new Map(),panels=[],sourceVisits=[],restores=[],stored=new Map(),texts=new Map([[first,fs.readFileSync(first,'utf8')],[second,fs.readFileSync(second,'utf8')],[third,fs.readFileSync(third,'utf8')]]);let activeEditorChanged,nav,deferPreference=null;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),languageId:'zss',version:1,isClosed:false,isDirty:false,getText:()=>texts.get(filename),get lineCount(){return this.getText().split('\n').length;},lineAt(line){return{text:this.getText().split('\n')[line]};}});
 const docs=new Map([[first,document(first)],[second,document(second)],[third,document(third)]]);
 function createPanel(){
  const disposals=[],listeners=[],messages=[];let viewState;const panel={viewColumn:2,active:true,reveals:0,messages,reveal(){this.reveals++;},onDidChangeViewState(fn){viewState=fn;return{dispose(){}};},activate(){this.active=true;viewState?.({webviewPanel:this});},onDidDispose(fn){disposals.push(fn);},dispose(){this.disposed=true;disposals.forEach(fn=>fn());},webview:{
   onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));queueMicrotask(()=>fn({type:'viewerToolbarReady',surface:'code_structure'}));return{dispose(){}};},
   postMessage(message){messages.push(message);if(message.type==='viewerHistoryRestore'){restores.push(message);queueMicrotask(()=>panel.receive({type:'viewerHistoryRestored',requestId:message.requestId,ok:true}));}return true;}
  }};panels.push(panel);return panel;
 }
 const vscode={Uri:{file:uri},Range:class{constructor(line){this.line=line;}},ViewColumn:{Active:1,Beside:2},workspace:{textDocuments:[docs.get(first)],openTextDocument:async target=>{const doc=docs.get(target.fsPath||target);if(!vscode.workspace.textDocuments.includes(doc))vscode.workspace.textDocuments.push(doc);return doc;},getConfiguration:()=>({get:(name,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}})},window:{createWebviewPanel:createPanel,showTextDocument:async(doc,options)=>{sourceVisits.push({doc,options});return{};},onDidChangeActiveTextEditor:fn=>{activeEditorChanged=fn;return{dispose(){}};},onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:message=>{throw Error(message);},showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(name,...args)=>{assert(commands.has(name),name);return commands.get(name)(...args);}}};
 const original=Module._load;
 Module._load=function(name,parent,main){
  if(name==='vscode')return vscode;
  if(name==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:p=>p,revealInViewerGroup:p=>p.reveal()};
  if(name==='./viewer_toolbar')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  if(name==='./viewer_layout')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  return original.call(this,name,parent,main);
 };
 try{
  nav=require('../src/viewer_navigation');
  const api=require('../src/code_structure_workspace'),registry=require('../src/authoring_context_registry'),{flatten}=require('../src/code_structure_model'),{referenceFor}=require('../src/code_structure_navigation');
  api.registerCodeStructureWorkspace(vscode,{subscriptions:[],workspaceState:{get:(key,fallback)=>stored.has(key)?stored.get(key):fallback,update:async(key,value)=>{stored.set(key,value);if(deferPreference)await new Promise(resolve=>deferPreference=resolve);}}});
  const open=()=>vscode.commands.executeCommand('ikemen.codeStructure.openWorkspace',uri(first));
  const panel=await open();assert.strictEqual(panel,panels[0]);assert.equal(panels.length,1);
  assert.strictEqual(await open(),panel);assert.equal(panels.length,1);assert(panel.reveals>0);
  vscode.window.activeTextEditor={document:docs.get(first),selection:{active:{line:1,character:2}}};await vscode.commands.executeCommand('ikemen.codeStructure.focusCurrent');const focused=panel.messages.filter(message=>message.type==='model').at(-1).model;assert.strictEqual(focused.focusOnSelected,true);assert.strictEqual(focused.selectedReference.blockKind,'controller','the native-editor focus route carries the exact caret block and presentation-only focus intent into the reused panel');
  const ref=referenceFor(flatten(api.clientModel(docs.get(first))).find(n=>n.kind==='controller'));
  await panel.receive({type:'reveal',reference:ref});
  assert.equal(sourceVisits.at(-1).doc.fileName,first);assert.equal(sourceVisits.at(-1).options.selection.line,1);
  panel.dispose();assert(await nav.travelHistory(-1));assert.equal(panels.length,2,'history invokes the actual workspace opener after disposal');
  assert.deepStrictEqual(restores.at(-1).reference,ref);
  await nav.travelHistory(1);
  activeEditorChanged({document:docs.get(second)});
  assert(panels[1].title.includes('first.zss'),'follow-active is off by default and cannot silently rebind the coding viewer');
  await panels[1].receive({type:'followActive',enabled:true});
  activeEditorChanged({document:docs.get(second)});await new Promise(resolve=>setImmediate(resolve));
  assert(panels[1].title.includes('second.zss'),'the explicit persisted follow toggle permits active supported files to rebind the viewer');
  assert.equal(stored.get('ikemaker.codeStructure.followActive'),true,'follow preference is persisted only after explicit opt-in');
  const rebound=panels[1].messages.filter(message=>message.type==='model').at(-1).model;
  assert.equal(rebound.selectedReference.blockKind,'state','the host-selected per-file block is sent with the replacement page model');
  const beforeBackground=sourceVisits.length;panels[1].active=false;
  await panels[1].receive({type:'ikemaker.universal-toolbar.invoke',slotId:'text-source'});
  assert.equal(sourceVisits.length,beforeBackground,'a background follow rebind cannot steal the shared source selection');
  panels[1].activate();await panels[1].receive({type:'ikemaker.universal-toolbar.invoke',slotId:'text-source'});
  assert.equal(sourceVisits.at(-1).doc.fileName,second);assert.equal(sourceVisits.at(-1).options.selection.line,0,'activation reclaims exactly the host-selected block shown by the page model');
  await vscode.commands.executeCommand('ikemen.codeStructure.openWorkspace',uri(first));
  assert.equal(panels.length,2);assert(panels[1].title.includes('first.zss'),'an explicit open rebinds the existing singleton after opt-in follow');
  const retarget=api.createCodeRetargetAdapter(vscode,panels[1]),character=(label,ownerFile)=>({kind:'character',identity:label.toLowerCase(),label,ownerFile});
  texts.set(first,'[StateDef 200]\nHitDef{\n damage:31;\n}\n');docs.get(first).version++;docs.get(first).isDirty=true;
  texts.set(second,'[StateDef 200]\nHitDef{\n damage:99;\n}\n');docs.get(second).version++;docs.get(second).isDirty=true;
  let transaction={from:character('First',firstOwner),to:character('Second',secondOwner),toState:null},prepared=await retarget.prepare(transaction);
  assert.strictEqual(await retarget.validate(transaction,prepared),true);await retarget.commit(transaction,prepared);
  assert(panels[1].title.includes('second.zss'),'entity retargeting reuses the one Code Structure panel for the exact destination owner');
  assert.strictEqual(path.resolve(registry.currentContext().ownerDef),path.resolve(secondOwner),'the rebound authoring context keeps the exact destination DEF identity instead of re-inferring a same-folder owner');
  assert.match(panels[1].webview.html,/damage:99/,'retargeting rebuilds the destination page from its unsaved open buffer without writing it');
  assert.match(panels[1].webview.html,/second\.zss/,'the full replacement page names the destination source rather than retaining the old header/model');
  await retarget.rollback(transaction,prepared);assert(panels[1].title.includes('first.zss'),'rollback restores the prior exact dirty-buffer owner in place');
  assert.match(panels[1].webview.html,/damage:31/,'rollback rebuilds the original page from its retained unsaved buffer');
  await retarget.rollback(transaction,prepared);assert(panels[1].title.includes('first.zss'),'Code Structure rollback is idempotent');
  transaction={from:character('First',firstOwner),to:character('Third',thirdOwner),toState:null};prepared=await retarget.prepare(transaction);assert.strictEqual(prepared.target.source.open,false,'the destination begins closed');await retarget.commit(transaction,prepared);
  assert(panels[1].title.includes('third.zss'),'opening an unchanged closed destination does not invalidate its prepared source snapshot');await retarget.rollback(transaction,prepared);
  transaction={from:character('First',firstOwner),to:{kind:'stage',identity:'stage',label:'Stage',ownerFile:stageOwner},toState:null};prepared=await retarget.prepare(transaction);await retarget.commit(transaction,prepared);
  assert.match(panels[1].webview.html,/no supported ZSS, CNS, or Lua source/i,'an inapplicable entity shows a truthful empty Code Structure state instead of stale source');
  assert.doesNotMatch(panels[1].webview.html,/damage:31/,'the unavailable page cannot expose stale source content');
  activeEditorChanged({document:docs.get(second)});await new Promise(resolve=>setImmediate(resolve));assert.match(panels[1].webview.html,/no supported ZSS, CNS, or Lua source/i,'follow-active cannot resurrect the stale prior Code page while the selected entity has no applicable source');
  await retarget.rollback(transaction,prepared);assert(panels[1].title.includes('first.zss'),'rollback from the unavailable page restores the prior Code Structure page');
  deferPreference=true;const stale=panels[1].receive({type:'followActive',enabled:false});await new Promise(resolve=>setImmediate(resolve));
  transaction={from:character('First',firstOwner),to:character('Second',secondOwner),toState:null};prepared=await retarget.prepare(transaction);await retarget.commit(transaction,prepared);deferPreference();await stale;
  assert(panels[1].title.includes('second.zss'),'a delayed message from the replaced page cannot rebind the destination back to its old document');
  assert.match(fs.readFileSync(first,'utf8'),/damage:30/);assert.match(fs.readFileSync(second,'utf8'),/damage:40/,'entity switching never silently saves either retained dirty buffer');
  panels[1].dispose();
  console.log('Actual Code Structure command, reuse, source message, disposal/reopen and changed-owner history passed');
 }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});


