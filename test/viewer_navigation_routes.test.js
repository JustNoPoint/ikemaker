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
  const vscode={Uri:{file:fsPath=>({fsPath})},workspace:{textDocuments:[]},window:{showQuickPick:async()=>undefined,showInformationMessage:async text=>notices.push(text)}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='vscode')return vscode;
    if(request==='./air_viewer' && /viewer_navigation\.js$/.test(parent.filename))return {openAirPreview:async(uri,options)=>calls.push({uri,options})};
    return original.call(this,request,parent,isMain);
  };
  const originalPatched=Module._load;
  try {
    const nav=require('../src/viewer_navigation');
    assert.deepStrictEqual(nav.associatedDefs(air),[def], 'nested asset must resolve its assigned parent DEF');
    await nav.openConnected(air,'air',{group:210});
    assert.strictEqual(calls[0].uri.fsPath,air);
    assert.strictEqual(calls[0].options.action,210);
    assert.strictEqual(calls[0].options.preserveFocus,false);
    await nav.openConnected(cns,'air',{expression:'const(normal.lp.moveID)'});
    assert.strictEqual(calls[1].options.action,210, 'named move constants should resolve to their assigned AIR action');
    await nav.openConnected(air,'air',{group:999});
    assert.strictEqual(calls.length,2,'a missing action must not silently open the first animation');
    assert(notices.at(-1).includes('999'));
    const sff=path.join(folder,'files','test.sff');fs.writeFileSync(sff,'fixture');fs.appendFileSync(def,'sprite = files/test.sff\n');
    const commands=[];vscode.commands={executeCommand:async(...args)=>commands.push(args)};
    Module._load=function(request,parent,isMain){if(request==='./sff_reader'&&/viewer_navigation\.js$/.test(parent.filename))return{readSff:()=>({sprites:[{group:1,number:0}]})};return originalPatched.call(this,request,parent,isMain);};
    await nav.openConnected(air,'sff',{group:1,number:0});
    assert.strictEqual(commands[0][0],'sff.openViewer');assert.strictEqual(commands[0][1].fsPath,sff);assert.strictEqual(commands[0][3].group,1);assert.strictEqual(commands[0][3].number,0);
    const opened=[];
    vscode.Range=class {constructor(line,character){this.line=line;this.character=character;}};
    vscode.workspace.openTextDocument=async filename=>({fileName:filename,getText:()=>fs.readFileSync(filename,'utf8'),lineAt:line=>({text:fs.readFileSync(filename,'utf8').split(/\r?\n/)[line]})});
    vscode.window.showTextDocument=async(document,options)=>opened.push({document,options});
    vscode.window.visibleTextEditors=[{document:{fileName:cns},viewColumn:1}];
    nav.rememberSource(air,{filename:cns,line:1,character:2,text:'normal.lp.moveID = 210'});
    await nav.backToSource(air);assert.strictEqual(opened[0].options.selection.line,1);assert.strictEqual(opened[0].options.selection.character,2);assert.strictEqual(opened[0].options.viewColumn,1,'Back to Source must reuse its existing editor group');
    fs.writeFileSync(cns,'; inserted\n[Constants]\nnormal.lp.moveID = 210\n');
    await nav.backToSource(air);assert.strictEqual(opened[1].options.selection.line,2,'Back to Source relocates a unique shifted line');
    fs.writeFileSync(cns,'[Constants]\nnormal.lp.moveID = 999\n');
    await nav.backToSource(air);assert.strictEqual(opened.length,2,'changed source must not jump to an unrelated old line');
    fs.writeFileSync(path.join(folder,'alternate.def'),'[Files]\nanim = files/test.air\n');
    await nav.openConnected(air,'air',{group:200});
    assert.strictEqual(calls.length,2,'canceling an ambiguous owner must not navigate');
  } finally {Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}

  // Exercise the actual SND opening function's failure path. Malformed files
  // must report the error and dispose the panel instead of caching a blank tab.
  const source=fs.readFileSync(path.join(__dirname,'../src/snd_viewer.js'),'utf8');
  const body=source.slice(source.indexOf('async function openSndViewer('),source.indexOf('async function deserializeSndPanel('));
  let disposed=false,error='';const panel={dispose(){disposed=true;}};
  const context={require:name=>{assert.strictEqual(name,'./asset_workspace');return {beforeOpen:async()=>true};},path,preferredViewerColumn:value=>value,reusableViewColumn:()=>2,sndPanels:[],sndPanelsByFile:new Map(),panelKey:value=>value,trackViewerPanel:value=>value,characterLabel:()=> 'Test',populate:async()=>{throw new Error('Invalid SND data');},vscode:{ViewColumn:{Beside:2},window:{createWebviewPanel:()=>panel,showErrorMessage:message=>{error=message;}}}};
  vm.createContext(context);vm.runInContext(body,context);
  assert.strictEqual(await context.openSndViewer({fsPath:'broken.snd'}),undefined);
  assert(disposed);assert(error.includes('Invalid SND data'));
  console.log('Viewer ownership, exact animation routing, missing targets, cancellation and failed SND opening tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
