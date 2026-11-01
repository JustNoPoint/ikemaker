'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-preset-conflict-'));
 const def=path.join(root,'fighter.def'),cmd=path.join(root,'fighter.cmd'),moves=path.join(root,'moves.dat');
 const originalCommand='[Command]\r\nname="x"\r\ncommand=x\r\ntime=15\r\n';
 fs.writeFileSync(def,'[Files]\ncmd=fighter.cmd\nmovelist=moves.dat\n');fs.writeFileSync(cmd,originalCommand);fs.writeFileSync(moves,'Original move\n');
 fs.mkdirSync(path.join(root,'save'));fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'save','config.ini'),'[Config]\nMotif = data/system.def\n');fs.writeFileSync(path.join(root,'data','system.def'),'[Files]\nglyphs = glyphs.sff\n[Glyphs]\n_D = 1,0\n');fs.writeFileSync(path.join(root,'data','glyphs.sff'),'invalid fixture');
 const commands=new Map(),storage=new Map(),messages=[],errors=[];let panel,warningMode='none',lastWarningOptions={},baselineCommand=originalCommand;
 const uri=filename=>({fsPath:filename,toString:()=>filename});
 const document=filename=>({fileName:filename,uri:uri(filename),isDirty:false,getText:()=>fs.readFileSync(filename,'utf8'),positionAt:()=>({line:0,character:0}),save:async()=>true});
 const vscode={
  Uri:{file:uri},Range:class{},ViewColumn:{Active:1,Beside:2},WorkspaceEdit:class{replace(target,_range,value){this.target=target;this.value=value;}},env:{clipboard:{writeText:async()=>{}}},
  workspace:{textDocuments:[],getWorkspaceFolder:()=>({uri:uri(root)}),getConfiguration:()=>({get:(name,fallback)=>fallback}),openTextDocument:async target=>document(target.fsPath||target),applyEdit:async edit=>{fs.writeFileSync(edit.target.fsPath,edit.value);return true;},onDidChangeTextDocument:()=>({dispose(){}})},
  window:{registerWebviewPanelSerializer:()=>({dispose(){}}),createWebviewPanel:()=>{const listeners=[];panel={viewColumn:2,reveal(){},onDidChangeViewState:()=>({dispose(){}}),onDidDispose:()=>{},webview:{onDidReceiveMessage(fn){listeners.push(fn);panel.receive=m=>Promise.all(listeners.map(x=>x(m)));return{dispose(){}}},postMessage(m){messages.push(m);return true;}}};return panel;},showInputBox:async()=> 'My authored command',showWarningMessage:async(message,options,choice)=>{lastWarningOptions=options||{};if(warningMode==='command-race'&&choice==='Replace Command'){fs.writeFileSync(cmd,fs.readFileSync(cmd,'utf8')+'; external change\r\n');return choice}if(warningMode==='movelist-race'&&choice==='Apply Movelist'){fs.writeFileSync(moves,'External move\n');return choice}return choice;},showInformationMessage:()=>{},showErrorMessage:message=>errors.push(message)},
  commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:(name,...args)=>commands.get(name)(...args)}
 };
 const originalLoad=Module._load;
 Module._load=function(name,parent,main){if(name==='vscode')return vscode;if(name==='./character_context')return{owningCharacterDefs:()=>[],gameRoot:()=>root};if(name==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:p=>p};if(name==='./viewer_toolbar')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};if(name==='./viewer_layout')return{style:()=>'',controlsHtml:()=>'',clientScript:()=>'',handle:async()=>false};return originalLoad.call(this,name,parent,main)};
 try{
  const api=require('../src/command_movelist_workspace'),context={subscriptions:[],workspaceState:{get:key=>storage.get(key),update:async(key,value)=>storage.set(key,value)}};api.registerCommandMovelistWorkspace(context);
  await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(def));
  panel.webview.html+='<!-- retain drafts -->';
  const authored='\r\n[Command]\r\nname="new_move"\r\ncommand=/D, DF, F, x\r\ntime=20\r\nsteptime=7\r\n';
  await panel.receive({type:'saveCustomPreset',id:'',text:authored});
  assert(panel.webview.html.endsWith('<!-- retain drafts -->'),'pool save must not rebuild the webview or discard unrelated drafts');
  assert(messages.some(m=>m.type==='customPresetsUpdated'&&m.presets.some(p=>p.label==='My authored command'&&p.text===authored)),'ordinary authored command reaches the real workspace preset pool without trimming its source conventions');
  assert.strictEqual(fs.readFileSync(cmd,'utf8'),originalCommand,'saving to the pool never edits the character command file');
  const saved=messages.findLast(m=>m.type==='customPresetsUpdated').presets[0];
  await panel.receive({type:'applyPresetDraft',id:saved.id,text:authored});
  const appliedPreset=fs.readFileSync(cmd,'utf8');assert(!/(?<!\r)\n/.test(appliedPreset),'reviewed preset Apply introduces no lone LF into a CRLF command file');assert(appliedPreset.includes('[Command]\r\nname="new_move"'),`reviewed preset Apply keeps the authored definition and target convention: ${JSON.stringify(appliedPreset)} ${JSON.stringify(errors)}`);
  baselineCommand=appliedPreset;
  panel.webview.html+='<!-- retain drafts -->';
  await panel.receive({type:'deleteCustomPreset',id:saved.id});
  assert(panel.webview.html.endsWith('<!-- retain drafts -->'),'pool delete must not rebuild the webview');
  assert(messages.findLast(m=>m.type==='customPresetsUpdated').removedId===saved.id);
  const afterDelete=fs.readFileSync(cmd,'utf8');await panel.receive({type:'applyPresetDraft',id:saved.id,text:authored});assert(errors.at(-1).includes('no longer available'),'deleting a custom preset updates the live host registry in the same session');assert.strictEqual(fs.readFileSync(cmd,'utf8'),afterDelete);

  const customMotion={id:'custom-motion:test',label:'Nested authored motion',basis:'custom',steps:['/D','macro("a,b")','F+x'],sequence:'\t/D,macro("a,b"), F+x  '};
  await panel.receive({type:'saveCustomMotionRecipe',recipe:customMotion});
  const motionUpdate=messages.findLast(m=>m.type==='customMotionRecipesUpdated');assert.strictEqual(motionUpdate.recipes[0].sequence,customMotion.sequence,'workspace motion storage retains exact custom parser syntax and spacing');assert.deepStrictEqual(motionUpdate.recipes[0].steps,customMotion.steps,'host derives the same parser-aware top-level steps');assert.strictEqual(fs.readFileSync(cmd,'utf8'),afterDelete,'saving a reusable motion recipe never edits character command source');
  await panel.receive({type:'saveCustomMotionRecipe',recipe:{...customMotion,id:'custom-motion:other',sequence:'D, DF, F, y',steps:['ignored']}});const updatedMotion=messages.findLast(m=>m.type==='customMotionRecipesUpdated');assert.strictEqual(updatedMotion.recipes.length,1,'same-name custom motion updates its stable workspace entry instead of duplicating it');assert.strictEqual(updatedMotion.recipes[0].id,customMotion.id);assert.deepStrictEqual(updatedMotion.recipes[0].steps,['D','DF','F','y'],'host never trusts stale client step metadata over the exact sequence');
  await panel.receive({type:'deleteCustomMotionRecipe',id:customMotion.id});assert.deepStrictEqual(messages.findLast(m=>m.type==='customMotionRecipesUpdated').recipes,[],'custom motion deletion updates workspace storage without rebuilding the editor');await panel.receive({type:'deleteCustomMotionRecipe',id:customMotion.id});assert(errors.at(-1).includes('no longer available'));

  vscode.workspace.textDocuments=[{fileName:cmd,isDirty:true,getText:()=>baselineCommand+'; unsaved editor change\r\n'}];
  await panel.receive({type:'saveCommand',index:0,values:{name:'x',command:'y',time:15,steptime:-1}});
  assert(errors.at(-1).includes('unsaved source edits'));assert.strictEqual(fs.readFileSync(cmd,'utf8'),baselineCommand);
  vscode.workspace.textDocuments=[];warningMode='command-race';
  await panel.receive({type:'saveCommand',index:0,values:{name:'x',command:'y',time:15,steptime:-1}});
  assert(errors.at(-1).includes('changed while'));assert(fs.readFileSync(cmd,'utf8').includes('external change'));assert(!fs.readFileSync(cmd,'utf8').includes('command = y'));

  fs.writeFileSync(cmd,originalCommand);warningMode='none';
  const fresh=await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor',uri(def));
  warningMode='movelist-race';await fresh.receive({type:'saveMovelist',text:'Draft move _UNKNOWN\n'});
  assert(lastWarningOptions.detail.includes('possible missing engine glyph reference'),'explicit Apply summarizes advisory missing-glyph findings without enforcing a rewrite');
  assert(errors.at(-1).includes('changed'));assert.strictEqual(fs.readFileSync(moves,'utf8'),'External move\n');
  console.log('Command preset pool and post-confirmation source-conflict tests passed');
 }finally{Module._load=originalLoad;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
