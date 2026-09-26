'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-workspace-life-'));
 const first=path.join(root,'first.def'),second=path.join(root,'second.def');
 const stage='[Info]\nname=Test\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=0,1\nstart=0,200\n';
 fs.writeFileSync(first,stage);fs.writeFileSync(second,stage);
 const commands=new Map(),panels=[],sourceVisits=[],restores=[];let activeEditorChanged,nav,serializer;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),languageId:'ini',getText:()=>fs.readFileSync(filename,'utf8'),get lineCount(){return this.getText().split('\n').length;},lineAt(line){return{text:this.getText().split('\n')[line]};}});
 const docs=new Map([[first,document(first)],[second,document(second)]]);
 function createPanel(){
  const disposals=[],listeners=[];const panel={viewColumn:2,active:true,reveals:0,reveal(){this.reveals++;},onDidChangeViewState(){return{dispose(){}};},onDidDispose(fn){disposals.push(fn);},dispose(){this.disposed=true;disposals.forEach(fn=>fn());},webview:{
   onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));queueMicrotask(()=>fn({type:'viewerToolbarReady',surface:'stage'}));return{dispose(){}};},
   postMessage(message){if(message.type==='viewerHistoryRestore'){restores.push(message);queueMicrotask(()=>panel.receive({type:'viewerHistoryRestored',requestId:message.requestId,ok:true}));}return true;}
  }};panels.push(panel);return panel;
 }
 const vscode={Uri:{file:uri},Range:class{constructor(line){this.line=line;}},ViewColumn:{Active:1,Beside:2},workspace:{textDocuments:[],openTextDocument:async target=>docs.get(target.fsPath||target),getConfiguration:()=>({get:(name,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}})},window:{registerWebviewPanelSerializer:(name,value)=>{serializer=value;return{dispose(){}};},createWebviewPanel:createPanel,showTextDocument:async(doc,options)=>{sourceVisits.push({doc,options});return{};},onDidChangeActiveTextEditor:fn=>{activeEditorChanged=fn;return{dispose(){}};},onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:message=>{throw Error(message);},showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(name,...args)=>{assert(commands.has(name),name);return commands.get(name)(...args);}}};
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
  const api=require('../src/stage_workspace');
  api.registerStageWorkspace({subscriptions:[]});
  const open=()=>vscode.commands.executeCommand('ikemen.stage.openWorkspace',uri(first));
  const panel=await open();assert.strictEqual(panel,panels[0]);assert.equal(panels.length,1);
  const markup=panel.webview.html;
  assert(markup.indexOf('id="discard"')<markup.indexOf('What am I editing?'),'editing actions precede expandable guidance');
  assert(markup.includes('Guided authoring recipes'),'guidance remains available');
  assert.strictEqual(await open(),panel);assert.equal(panels.length,1);assert(panel.reveals>0);
  const ref={backgroundName:'Floor',backgroundType:'normal'};
  const line=stage.split('\n').indexOf('[BG Floor]');
  await panel.receive({type:'openSource',line,navigationSelection:ref});
  assert.equal(sourceVisits.at(-1).doc.fileName,first);assert.equal(sourceVisits.at(-1).options.selection.line,line);
  panel.dispose();assert(await nav.travelHistory(-1));assert.equal(panels.length,2,'history invokes the actual workspace opener after disposal');
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
  const missing=createPanel();await serializer.deserializeWebviewPanel(missing,{filename:path.join(root,'missing.def')});
  assert(missing.disposed,'missing source serializer closes the panel');
  assert.equal(fs.readFileSync(first,'utf8'),stage,'navigation never changes the stage file');
  console.log('Actual Stage command, reuse, source message, history reopen and serializer lifecycle passed');
 }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});


