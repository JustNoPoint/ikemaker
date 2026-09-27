'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-workspace-life-'));
 const first=path.join(root,'first.def'),second=path.join(root,'second.def');
 const command=path.join(root,'commands.cmd');
 const movelist=path.join(root,'moves.dat'),otherCommand=path.join(root,'other.cmd');
 const stage='[Info]\nname=Test\n[Files]\ncmd=commands.cmd\nmovelist=moves.dat\n';
 fs.writeFileSync(movelist,'Test move\n');
 fs.writeFileSync(first,stage);fs.writeFileSync(second,stage);fs.writeFileSync(command,'[Command]\nname="test"\ncommand=x\ntime=15\n\n[Command]\nname="second"\ncommand=y\ntime=15\n');
 fs.copyFileSync(command,otherCommand);
 const commands=new Map(),panels=[],sourceVisits=[],restores=[];let activeEditorChanged,nav,serializer;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),languageId:'ini',getText:()=>fs.readFileSync(filename,'utf8'),get lineCount(){return this.getText().split('\n').length;},lineAt(line){return{text:this.getText().split('\n')[line]};}});
 const docs=new Map([[first,document(first)],[second,document(second)],[command,document(command)],[movelist,document(movelist)]]);
 function createPanel(){
  const disposals=[],listeners=[];const panel={viewColumn:2,active:true,reveals:0,reveal(){this.reveals++;},onDidChangeViewState(){return{dispose(){}};},onDidDispose(fn){disposals.push(fn);},dispose(){this.disposed=true;disposals.forEach(fn=>fn());},webview:{
   onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));queueMicrotask(()=>fn({type:'viewerToolbarReady',surface:'command_movelist'}));return{dispose(){}};},
   postMessage(message){if(message.type==='viewerHistoryRestore'){restores.push(message);queueMicrotask(()=>panel.receive({type:'viewerHistoryRestored',requestId:message.requestId,ok:true}));}return true;}
  }};panels.push(panel);return panel;
 }
 const vscode={Uri:{file:uri},Range:class{constructor(line){this.line=line;}},ViewColumn:{Active:1,Beside:2},workspace:{textDocuments:[],openTextDocument:async target=>docs.get(target.fsPath||target),getConfiguration:()=>({get:(name,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}})},window:{activeTextEditor:{document:docs.get(command),selection:{active:{line:6}}},registerWebviewPanelSerializer:(name,value)=>{serializer=value;return{dispose(){}};},createWebviewPanel:createPanel,showTextDocument:async(doc,options)=>{sourceVisits.push({doc,options});return{};},onDidChangeActiveTextEditor:fn=>{activeEditorChanged=fn;return{dispose(){}};},onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:message=>{throw Error(message);},showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);}},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(name,...args)=>{assert(commands.has(name),name);return commands.get(name)(...args);}}};
 const original=Module._load;
 Module._load=function(name,parent,main){
  if(name==='vscode')return vscode;
  if(name==='./character_context')return{owningCharacterDefs:seed=>path.resolve(seed)===path.resolve(command)?[first]:[]};
  if(name==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:p=>p,revealInViewerGroup:p=>p.reveal()};
  if(name==='./viewer_toolbar')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  if(name==='./viewer_layout')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};
  return original.call(this,name,parent,main);
 };
 try{
  nav=require('../src/viewer_navigation');
  const api=require('../src/command_movelist_workspace');
  api.registerCommandMovelistWorkspace({subscriptions:[]});
  const open=()=>vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(first));
  const panel=await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(command));assert.strictEqual(panel,panels[0]);assert.equal(panels.length,1);assert(panel.webview.html.includes('"initialCommandIndex":1'),'direct CMD caret selects the containing command while retaining the chosen owner');vscode.window.activeTextEditor=undefined;
  panel.webview.html+='<!-- live form marker -->';
  assert.strictEqual(await open(),panel);assert.equal(panels.length,1);assert(panel.reveals>0);assert(panel.webview.html.endsWith('<!-- live form marker -->'),'reuse must not regenerate the live form');
  const ref={tab:'command',file:command,command:require('../src/command_movelist_navigation').commandValues(api.payload(first).commands[0])};
  await panel.receive({type:'openSource',tab:'command',index:0,navigationSelection:ref});
  assert.equal(sourceVisits.at(-1).doc.fileName,command);assert.equal(sourceVisits.at(-1).options.selection.line,0);
  const other=await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(second));
  assert.notStrictEqual(other,panel,'different owner has a separate workspace');other.dispose();
  panel.dispose();
  const countBeforeRejected=panels.length;
  vscode.workspace.textDocuments=[{fileName:command,getText:()=>fs.readFileSync(command,'utf8').replace('time=15','time=99')}];
  assert.equal(await nav.travelHistory(-1),false,'unsaved changed definition must stop history');
  vscode.workspace.textDocuments=[{fileName:command,getText:()=>fs.readFileSync(command,'utf8').repeat(2)}];
  assert.equal(await nav.travelHistory(-1),false,'unsaved duplicate definition must stop history');
  vscode.workspace.textDocuments=[{fileName:first,getText:()=>stage.replace('cmd=commands.cmd','cmd=other.cmd')}];
  assert.equal(await nav.travelHistory(-1),false,'unsaved changed assignment must not open the old command');
  assert.equal(panels.length,countBeforeRejected,'rejected targets never create a replacement panel');
  vscode.workspace.textDocuments=[];
  assert(await nav.travelHistory(-1),'history reopens via actual command');assert.deepStrictEqual(restores.at(-1).reference,ref);assert(await nav.travelHistory(1));const reopened=await open();assert.notStrictEqual(reopened,panel,'disposed workspace can reopen');reopened.dispose();
  const restored=createPanel();await serializer.deserializeWebviewPanel(restored,{seed:first});
  assert.strictEqual(await open(),restored,'serialized panel is reused by the actual open command');
  assert(restored.webview.html.includes('Command & Movelist'));
  const duplicate=createPanel();await serializer.deserializeWebviewPanel(duplicate,{seed:first});
  assert(duplicate.disposed,'duplicate serialized panels are discarded');
  const movelistRef={tab:'movelist',file:movelist};
  await restored.receive({type:'openSource',tab:'movelist',index:0,navigationSelection:movelistRef});
  assert.equal(sourceVisits.at(-1).doc.fileName,movelist,'movelist source opens its assigned text');
  restored.dispose();
  vscode.workspace.textDocuments=[{fileName:first,getText:()=>stage.replace('movelist=moves.dat','movelist=other.dat')}];
  assert.equal(await nav.travelHistory(-1),false,'changed movelist assignment stops restoration');
  vscode.workspace.textDocuments=[];
  const movelistText=fs.readFileSync(movelist,'utf8');fs.unlinkSync(movelist);
  assert.equal(await nav.travelHistory(-1),false,'missing movelist stops restoration');
  fs.writeFileSync(movelist,movelistText);
  assert(await nav.travelHistory(-1),'failed history can retry after the assigned file returns');
  assert.deepStrictEqual(restores.at(-1).reference,movelistRef,'closed history restores the displayed movelist tab');
  const finalPanel=await open();finalPanel.dispose();
  const missing=createPanel();await serializer.deserializeWebviewPanel(missing,{seed:path.join(root,'missing.def')});
  assert(missing.disposed,'missing source serializer closes the panel');
  assert.equal(fs.readFileSync(first,'utf8'),stage,'navigation never changes the owner file');
  console.log('Actual Command & Movelist reuse, separate owners, exact source, disposal/reopen and serializer lifecycle passed');
 }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});


