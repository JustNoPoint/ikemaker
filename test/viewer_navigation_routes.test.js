'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

(async () => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'viewer-routes-')), calls=[], notices=[];
  const air=path.join(folder,'files','test.air'), def=path.join(folder,'test.def'), cns=path.join(folder,'test.cns');
  fs.mkdirSync(path.dirname(air));
  fs.writeFileSync(air,'[Begin Action 200]\n0,0,0,0,1\n[Begin Action 210]\n1,0,0,0,1\n');
  fs.writeFileSync(cns,'[Constants]\nnormal.lp.moveID = 210\n');
  fs.writeFileSync(def,'[Files]\nanim = files/test.air\ncns = test.cns\n');
  const vscode={Uri:{file:fsPath=>({fsPath})},workspace:{textDocuments:[]},window:{showErrorMessage:async text=>notices.push(text),showQuickPick:async()=>undefined,showInformationMessage:async text=>notices.push(text)}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='vscode')return vscode;
    if(request==='./air_viewer' && /viewer_navigation\.js$/.test(parent.filename))return {openAirPreview:async(uri,options)=>calls.push({uri,options})};
    return original.call(this,request,parent,isMain);
  };
  const originalPatched=Module._load;
  try {
    const nav=require('../src/viewer_navigation');
    assert.strictEqual(nav.allowsArchiveContext(air),false,'a cold text-origin AIR route cannot inherit persisted shared archive context');
    assert.strictEqual(nav.allowsArchiveContext(air,{kind:'air',panel:{}}),true,'a real visual-to-visual handoff may preserve explicit shared archive context');
    assert.deepStrictEqual(nav.associatedDefs(air),[def], 'nested asset must resolve its assigned parent DEF');
    await nav.openConnected(air,'air',{group:210},undefined,{filename:air,kind:'sff',panel:{viewColumn:4}});
    assert.strictEqual(calls[0].uri.fsPath,air);
    assert.strictEqual(calls[0].options.action,210);
    assert.strictEqual(calls[0].options.preserveFocus,false);
    assert.strictEqual(calls[0].options.viewerColumn,4,'cross-viewer AIR navigation stays in the source visual viewer group');
    assert.strictEqual(calls[0].options.ownerDef,def,'AIR launch carries the proven owner DEF into sprite resolution');
    await nav.openConnected(cns,'air',{expression:'const(normal.lp.moveID)'});
    assert.strictEqual(calls[1].options.action,210, 'named move constants should resolve to their assigned AIR action');
    await nav.openConnected(air,'air',{group:999});
    assert.strictEqual(calls.length,2,'a missing action must not silently open the first animation');
    assert(notices.at(-1).includes('999'));
    const sff=path.join(folder,'files','test.sff');fs.writeFileSync(sff,'fixture');fs.appendFileSync(def,'sprite = files/test.sff\n');
    const commands=[];vscode.commands={executeCommand:async(...args)=>{commands.push(args);return args[0]==='ikemen.textToolbar.resumeFromVisualViewer'?{attached:true}:undefined;}};
    Module._load=function(request,parent,isMain){if(request==='./sff_reader'&&/viewer_navigation\.js$/.test(parent.filename))return{readSff:()=>({sprites:[{group:1,number:0}]})};return originalPatched.call(this,request,parent,isMain);};
    await nav.openConnected(air,'sff',{group:1,number:0},undefined,{filename:air,kind:'air',panel:{viewColumn:4}});
    assert.strictEqual(commands[0][0],'sff.openViewer');assert.strictEqual(commands[0][1].fsPath,sff);assert.strictEqual(commands[0][2],4,'cross-viewer SFF navigation stays in the source visual viewer group');assert.strictEqual(commands[0][3].group,1);assert.strictEqual(commands[0][3].number,0);
    const snd=path.join(folder,'files','test.snd');fs.writeFileSync(snd,'fixture');fs.appendFileSync(def,'sound = files/test.snd\n');
    const priorLoader=Module._load;Module._load=function(request,parent,isMain){if(request==='./snd_reader'&&/viewer_navigation\.js$/.test(parent.filename))return{readSnd:()=>({entries:[{group:10,index:20}]})};return priorLoader.call(this,request,parent,isMain);};
    await nav.openConnected(air,'snd',undefined,undefined,{filename:air,kind:'air',panel:{viewColumn:4}});
    const soundOpen=commands.at(-1);assert.strictEqual(soundOpen[0],'snd.openViewer');assert.strictEqual(soundOpen[1].fsPath,snd);assert.strictEqual(soundOpen[2],4);assert.strictEqual(soundOpen[3],undefined);assert.strictEqual(soundOpen[4],undefined,'opening the Sounds toolbar must not mistake owner metadata for exact sound authority');assert.deepStrictEqual(soundOpen[5],{ownerDef:def},'SND character ownership is the fifth command argument');
    await nav.openConnected(air,'snd',{group:10,number:20},undefined,{filename:air,kind:'air',panel:{viewColumn:4}});
    assert.deepStrictEqual(commands.at(-1)[3],{group:10,number:20});assert.strictEqual(commands.at(-1)[4],undefined);assert.deepStrictEqual(commands.at(-1)[5],{ownerDef:def},'sound references keep ownership separate from authority too');
    assert.deepStrictEqual(commands[0][4],{ownerDef:def},'SFF retains its different fourth-argument session contract');
    const sourceOriginPanel={viewColumn:4},opened=[];vscode.ViewColumn={Beside:2};vscode.window.visibleTextEditors=[];
    vscode.workspace.openTextDocument=async uri=>({fileName:uri.fsPath,uri,getText:()=>fs.readFileSync(uri.fsPath,'utf8')});
    vscode.window.showTextDocument=async(document,options)=>{const editor={document,viewColumn:options.viewColumn};opened.push({document,options});vscode.window.activeTextEditor=editor;return editor;};
    const sourceCommandAt=commands.length,sourceOpenedAt=opened.length;await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel});
    assert.strictEqual(opened.length,sourceOpenedAt+1,'Text Editor navigation focuses the native source once after the canonical visual-to-text transition');
    assert.strictEqual(opened[sourceOpenedAt].document.fileName,air,'the canonical text workspace finishes on the requested AIR source');
    assert.strictEqual(commands[sourceCommandAt][0],'ikemen.textToolbar.resumeFromVisualViewer','Text Editor navigation uses the guarded one-screen visual-to-text transition');
    assert(Array.isArray(commands[sourceCommandAt][1].files)&&commands[sourceCommandAt][1].files.includes(def)&&commands[sourceCommandAt][1].files.includes(cns),'the optional companion retains the complete connected character source set');
    assert.strictEqual(commands[sourceCommandAt][1].selectedFile,air,'the current text asset is the explicit focus target instead of whichever connected file was focused previously');
    assert.strictEqual(commands[sourceCommandAt][1].transitionPanel,sourceOriginPanel,'the exact originating viewer is closed as part of the guarded transition');
    const dispositionMoves=commands.length,sideDocument={fileName:air};
    vscode.workspace.openTextDocument=async()=>sideDocument;
    vscode.window.showTextDocument=async document=>{const editor={document};vscode.window.activeTextEditor={document:{fileName:cns}};return editor;};
    await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel},undefined,{disposition:'window'});
    assert.strictEqual(commands.length,dispositionMoves,'a focus change after opening source must not move an unrelated active editor into a new window');
    assert(notices.at(-1).includes('focus changed'),'the refused window move explains why the selected source stayed side by side');
    const fallbackCommands=[];vscode.window.visibleTextEditors=[];vscode.workspace.openTextDocument=async uri=>({fileName:uri.fsPath,uri,getText:()=>fs.readFileSync(uri.fsPath,'utf8')});vscode.window.showTextDocument=async(document,options)=>{const editor={document,viewColumn:options.viewColumn};opened.push({document,options});vscode.window.activeTextEditor=editor;return editor;};vscode.commands.executeCommand=async(...args)=>{fallbackCommands.push(args);if(args[0]==='ikemen.textToolbar.openCompanion')return{panel:true};return undefined;};
    const fallbackOpened=opened.length;await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel});
    assert.strictEqual(opened.length,fallbackOpened,'missing header acknowledgement must not open a side-by-side fallback');
    assert.strictEqual(opened.at(-1).document.fileName,air,'the route finishes on the exact current AIR source');
    assert(fallbackCommands.some(([command,options])=>command==='ikemen.textToolbar.resumeFromVisualViewer'&&options.selectedFile===air),'the canonical transition is attempted before the older-host source fallback');
    vscode.commands.executeCommand=async()=>{throw new Error('header setup failed');};
    assert.strictEqual(await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel}),false);
    assert.strictEqual(opened.length,fallbackOpened,'header exceptions cannot silently open beside');
    assert(notices.at(-1).includes('header setup failed'));
    vscode.commands.executeCommand=async command=>command==='ikemen.textToolbar.resumeFromVisualViewer'?{attached:false,aborted:true,originClosed:false}:undefined;
    const refusedTransitionOpened=opened.length;
    const refusedTransitionFallback=await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel});
    assert.strictEqual(opened.length,refusedTransitionOpened,'a genuinely blocked close must not open a side-by-side text workspace');
    assert.strictEqual(refusedTransitionFallback,false,'a blocked close leaves the protected viewer intact');

    const notify=vscode.window.showInformationMessage;
    vscode.window.showInformationMessage=()=>new Promise(()=>{});
    let notificationTimer;
    try {
      const result=await Promise.race([
        nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel}),
        new Promise((_,reject)=>{notificationTimer=setTimeout(()=>reject(new Error('Text Editor waited for notification dismissal')),150);})
      ]);
      assert.strictEqual(result,false,'a blocked transition returns without waiting for notification dismissal or opening beside the viewer');
    } finally {clearTimeout(notificationTimer);vscode.window.showInformationMessage=notify;}
    vscode.commands.executeCommand=async command=>{throw new Error(`Command unavailable: ${command}`);};
    const unavailableOpened=opened.length;
    const nativeFallback=await nav.openConnected(air,'source',undefined,undefined,{filename:air,kind:'air',panel:sourceOriginPanel});
    assert.strictEqual(opened.length,unavailableOpened,'unavailable header command does not open beside');
    assert.strictEqual(nativeFallback,false,'header failure is reported rather than hidden');
    vscode.Range=class {constructor(line,character){this.line=line;this.character=character;}};
    vscode.workspace.openTextDocument=async filename=>({fileName:filename,getText:()=>fs.readFileSync(filename,'utf8'),lineAt:line=>({text:fs.readFileSync(filename,'utf8').split(/\r?\n/)[line]})});
    vscode.window.showTextDocument=async(document,options)=>opened.push({document,options});
    vscode.window.visibleTextEditors=[{document:{fileName:cns},viewColumn:1}];
    vscode.commands.executeCommand=async command=>command==='ikemen.textToolbar.resumeFromVisualViewer'?{attached:false,aborted:true,originClosed:false}:undefined;
    const sourceOpened=opened.length;
    nav.rememberSource(air,{filename:cns,line:1,character:2,text:'normal.lp.moveID = 210'});
    await nav.backToSource(air,{filename:air,kind:'air',panel:sourceOriginPanel});assert.strictEqual(opened.length,sourceOpened,'a refused Back to Source transition does not split the workspace');await nav.backToSource(air);assert.strictEqual(opened[sourceOpened].options.selection.line,1);assert.strictEqual(opened[sourceOpened].options.selection.character,2);assert.strictEqual(opened[sourceOpened].options.viewColumn,1,'Back to Source must reuse its existing editor group even when the visual transition is safely refused');
    fs.writeFileSync(cns,'; inserted\n[Constants]\nnormal.lp.moveID = 210\n');
    await nav.backToSource(air);assert.strictEqual(opened[sourceOpened+1].options.selection.line,2,'Back to Source relocates a unique shifted line');
    fs.writeFileSync(cns,'[Constants]\nnormal.lp.moveID = 999\n');
    await nav.backToSource(air);assert.strictEqual(opened.length,sourceOpened+2,'changed source must not jump to an unrelated old line');
    fs.writeFileSync(path.join(folder,'alternate.def'),'[Files]\nanim = files/test.air\n');
    await nav.openConnected(air,'air',{group:200});
    assert.strictEqual(calls.length,2,'canceling an ambiguous owner must not navigate');
  } finally {Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}

  // Exercise the actual SND opening function's failure path. Malformed files
  // must report the error and dispose the panel instead of caching a blank tab.
  const source=fs.readFileSync(path.join(__dirname,'../src/snd_viewer.js'),'utf8');
  const body=source.slice(source.indexOf('function normalizeSndReference('),source.indexOf('async function deserializeSndPanel('));
  let disposed=false,error='';const panel={dispose(){disposed=true;}};
  const context={require:name=>{assert.strictEqual(name,'./asset_workspace');return {beforeOpen:async()=>true};},path,preferredViewerColumn:value=>value,reusableViewColumn:()=>2,sndPanels:[],sndPanelsByFile:new Map(),panelKey:value=>value,trackViewerPanel:value=>value,characterLabel:()=> 'Test',isClosingOwner:()=>false,rejectStaleExactSnd:()=>false,populate:async()=>{throw new Error('Invalid SND data');},vscode:{ViewColumn:{Beside:2},commands:{executeCommand:async()=>false},window:{createWebviewPanel:()=>panel,showErrorMessage:message=>{error=message;}}}};
  vm.createContext(context);vm.runInContext(body,context);
  assert.strictEqual(await context.openSndViewer({fsPath:'broken.snd'}),undefined);
  assert(disposed);assert(error.includes('Invalid SND data'));
  console.log('Viewer ownership, exact animation routing, missing targets, cancellation and failed SND opening tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
