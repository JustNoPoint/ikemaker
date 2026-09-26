'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-preset-conflict-'));
 const def=path.join(root,'fighter.def'),cmd=path.join(root,'fighter.cmd'),moves=path.join(root,'moves.dat');
 const originalCommand='[Command]\nname="x"\ncommand=x\ntime=15\n';
 fs.writeFileSync(def,'[Files]\ncmd=fighter.cmd\nmovelist=moves.dat\n');fs.writeFileSync(cmd,originalCommand);fs.writeFileSync(moves,'Original move\n');
 const commands=new Map(),storage=new Map(),messages=[],errors=[];let panel,warningMode='none';
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),isDirty:false,getText:()=>fs.readFileSync(filename,'utf8'),positionAt:()=>({line:0,character:0}),save:async()=>true});
 const vscode={
  Uri:{file:uri},Range:class{},ViewColumn:{Active:1,Beside:2},WorkspaceEdit:class{replace(){}},env:{clipboard:{writeText:async()=>{}}},
  workspace:{textDocuments:[],getWorkspaceFolder:()=>({uri:uri(root)}),getConfiguration:()=>({get:(name,fallback)=>fallback}),openTextDocument:async target=>document(target.fsPath||target),applyEdit:async()=>true,onDidChangeTextDocument:()=>({dispose(){}})},
  window:{registerWebviewPanelSerializer:()=>({dispose(){}}),createWebviewPanel:()=>{const listeners=[];panel={viewColumn:2,reveal(){},onDidChangeViewState:()=>({dispose(){}}),onDidDispose:()=>{},webview:{onDidReceiveMessage(fn){listeners.push(fn);panel.receive=m=>Promise.all(listeners.map(x=>x(m)));return{dispose(){}}},postMessage(m){messages.push(m);return true;}}};return panel;},showInputBox:async()=> 'My authored command',showWarningMessage:async(message,options,choice)=>{if(warningMode==='command-race'&&choice==='Replace Command'){fs.writeFileSync(cmd,originalCommand+'; external change\n');return choice}if(warningMode==='movelist-race'&&choice==='Apply Movelist'){fs.writeFileSync(moves,'External move\n');return choice}return choice;},showInformationMessage:()=>{},showErrorMessage:message=>errors.push(message)},
  commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:(name,...args)=>commands.get(name)(...args)}
 };
 const originalLoad=Module._load;
 Module._load=function(name,parent,main){if(name==='vscode')return vscode;if(name==='./character_context')return{owningCharacterDefs:()=>[]};if(name==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:p=>p};if(name==='./viewer_toolbar')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};if(name==='./viewer_layout')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};return originalLoad.call(this,name,parent,main)};
 try{
  const api=require('../src/command_movelist_workspace'),context={subscriptions:[],workspaceState:{get:key=>storage.get(key),update:async(key,value)=>storage.set(key,value)}};api.registerCommandMovelistWorkspace(context);
  await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(def));
  panel.webview.html+='<!-- retain drafts -->';
  const authored='[Command]\nname="new_move"\ncommand=/D, DF, F, x\ntime=20\nsteptime=7\n';
  await panel.receive({type:'saveCustomPreset',id:'',text:authored});
  assert(panel.webview.html.endsWith('<!-- retain drafts -->'),'pool save must not rebuild the webview or discard unrelated drafts');
  assert(messages.some(m=>m.type==='customPresetsUpdated'&&m.presets.some(p=>p.label==='My authored command'&&p.text===authored.trim())),'ordinary authored command reaches the real workspace preset pool');
  assert.strictEqual(fs.readFileSync(cmd,'utf8'),originalCommand,'saving to the pool never edits the character command file');
  const saved=messages.findLast(m=>m.type==='customPresetsUpdated').presets[0];
  await panel.receive({type:'deleteCustomPreset',id:saved.id});
  assert(panel.webview.html.endsWith('<!-- retain drafts -->'),'pool delete must not rebuild the webview');
  assert(messages.findLast(m=>m.type==='customPresetsUpdated').removedId===saved.id);

  vscode.workspace.textDocuments=[{fileName:cmd,isDirty:true,getText:()=>originalCommand+'; unsaved editor change\n'}];
  await panel.receive({type:'saveCommand',index:0,values:{name:'x',command:'y',time:15,steptime:-1}});
  assert(errors.at(-1).includes('unsaved source edits'));assert.strictEqual(fs.readFileSync(cmd,'utf8'),originalCommand);
  vscode.workspace.textDocuments=[];warningMode='command-race';
  await panel.receive({type:'saveCommand',index:0,values:{name:'x',command:'y',time:15,steptime:-1}});
  assert(errors.at(-1).includes('changed while'));assert(fs.readFileSync(cmd,'utf8').includes('external change'));assert(!fs.readFileSync(cmd,'utf8').includes('command = y'));

  fs.writeFileSync(cmd,originalCommand);warningMode='none';
  const fresh=await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(def));
  warningMode='movelist-race';await fresh.receive({type:'saveMovelist',text:'Draft move\n'});
  assert(errors.at(-1).includes('changed'));assert.strictEqual(fs.readFileSync(moves,'utf8'),'External move\n');
  console.log('Command preset pool and post-confirmation source-conflict tests passed');
 }finally{Module._load=originalLoad;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
