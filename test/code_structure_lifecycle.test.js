'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'code-workspace-life-'));
 const first=path.join(root,'first.zss'),second=path.join(root,'second.zss');
 fs.writeFileSync(first,'[StateDef 200]\nHitDef{\n damage:30;\n}\n');
 fs.writeFileSync(second,'[StateDef 300]\nChangeState{\n value:0;\n}\n');
 const commands=new Map(),panels=[],sourceVisits=[],restores=[];let activeEditorChanged,nav;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),languageId:'zss',getText:()=>fs.readFileSync(filename,'utf8'),get lineCount(){return this.getText().split('\n').length;},lineAt(line){return{text:this.getText().split('\n')[line]};}});
 const docs=new Map([[first,document(first)],[second,document(second)]]);
 function createPanel(){
  const disposals=[],listeners=[];const panel={viewColumn:2,active:true,reveals:0,reveal(){this.reveals++;},onDidChangeViewState(){return{dispose(){}};},onDidDispose(fn){disposals.push(fn);},dispose(){this.disposed=true;disposals.forEach(fn=>fn());},webview:{
   onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));queueMicrotask(()=>fn({type:'viewerToolbarReady',surface:'code_structure'}));return{dispose(){}};},
   postMessage(message){if(message.type==='viewerHistoryRestore'){restores.push(message);queueMicrotask(()=>panel.receive({type:'viewerHistoryRestored',requestId:message.requestId,ok:true}));}return true;}
  }};panels.push(panel);return panel;
 }
 const vscode={Uri:{file:uri},Range:class{constructor(line){this.line=line;}},ViewColumn:{Active:1,Beside:2},workspace:{textDocuments:[],openTextDocument:async target=>docs.get(target.fsPath||target),getConfiguration:()=>({get:(name,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}})},window:{createWebviewPanel:createPanel,showTextDocument:async(doc,options)=>{sourceVisits.push({doc,options});return{};},onDidChangeActiveTextEditor:fn=>{activeEditorChanged=fn;return{dispose(){}};},onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:message=>{throw Error(message);},showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(name,...args)=>{assert(commands.has(name),name);return commands.get(name)(...args);}}};
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
  const api=require('../src/code_structure_workspace'),{flatten}=require('../src/code_structure_model'),{referenceFor}=require('../src/code_structure_navigation');
  api.registerCodeStructureWorkspace(vscode,{subscriptions:[]});
  const open=()=>vscode.commands.executeCommand('ikemen.codeStructure.openWorkspace',uri(first));
  const panel=await open();assert.strictEqual(panel,panels[0]);assert.equal(panels.length,1);
  assert.strictEqual(await open(),panel);assert.equal(panels.length,1);assert(panel.reveals>0);
  const ref=referenceFor(flatten(api.clientModel(docs.get(first))).find(n=>n.kind==='controller'));
  await panel.receive({type:'reveal',line:1,navigationSelection:ref});
  assert.equal(sourceVisits.at(-1).doc.fileName,first);assert.equal(sourceVisits.at(-1).options.selection.line,1);
  panel.dispose();assert(await nav.travelHistory(-1));assert.equal(panels.length,2,'history invokes the actual workspace opener after disposal');
  assert.deepStrictEqual(restores.at(-1).reference,ref);
  await nav.travelHistory(1);
  activeEditorChanged({document:docs.get(second)});
  assert(panels[1].title.includes('second.zss'));
  assert(await nav.travelHistory(-1),'history rebinds the existing singleton to the recorded file');
  assert.equal(panels.length,2);assert(panels[1].title.includes('first.zss'));
  assert.deepStrictEqual(restores.at(-1).reference,ref);
  panels[1].dispose();
  console.log('Actual Code Structure command, reuse, source message, disposal/reopen and changed-owner history passed');
 }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});


