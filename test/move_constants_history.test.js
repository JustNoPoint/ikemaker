'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
(async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8');
  const visits=[],notices=[],messages=[];let modelReads=0,htmlWrites=0;
  const panel={webview:{set html(value){htmlWrites++;},onDidReceiveMessage(){},postMessage:async message=>messages.push(message)},onDidDispose(){}};
  const sandbox={require:name=>{if(name==='./viewer_close')return{support(){},prepare:async()=>false};assert.equal(name,'./webview_policy');return require('../src/webview_policy');},path,session:null,chooseDef:async uri=>uri.fsPath,
    characterAssets:defPath=>({defPath,constants:path.resolve('test.cns')}),modelFor:async()=>{modelReads++;return{character:'Test',timingSources:{constants:'hash'},moves:[{id:'normal.mp',prefix:'normal.mp',timeline:{actionNumber:200,frames:[{},{}]}}]};},validConstantsReference:(reference,assets,model)=>reference.profileId==='normal.mp'&&reference.sourceHash===model.timingSources.constants?model.moves[0]:null,
    registerCharacterToolPanel(){},html:()=>'<html/>',revealInViewerGroup:p=>visits.push(p),preferredViewerColumn:()=>2,trackViewerPanel:p=>p,
    vscode:{ViewColumn:{Active:1},languages:{},workspace:{onDidChangeTextDocument:()=>({dispose(){}}),onDidSaveTextDocument:()=>({dispose(){}})},window:{createWebviewPanel:()=>panel,showInformationMessage:text=>notices.push(text),showErrorMessage:error=>{throw Error(error);},showWarningMessage:text=>notices.push(text)}}};
  vm.runInNewContext(source.slice(source.indexOf('async function openMoveConstantsWorkspace('),source.indexOf('function registerMoveConstantsWorkspace(')),sandbox);
  const owner=path.resolve('test.def');
  assert.strictEqual(await sandbox.openMoveConstantsWorkspace({fsPath:owner},{history:true}),panel);
  assert.strictEqual(modelReads,1);assert.strictEqual(htmlWrites,1);
  assert.strictEqual(await sandbox.openMoveConstantsWorkspace({fsPath:owner},{history:true}),panel);
  assert.strictEqual(modelReads,1);assert.strictEqual(htmlWrites,1,'same owner history must preserve the live draft and model');
  const reference={defPath:owner,profileId:'normal.mp',prefix:'normal.mp',sourceFilename:path.resolve('test.cns'),sourceHash:'hash',actionNumber:200,frameIndex:1};assert.strictEqual(await sandbox.openMoveConstantsWorkspace({fsPath:owner},{reference}),panel);assert.deepStrictEqual(messages.slice(-2).map(item=>item.type),['model','moveLabSelect']);assert.strictEqual(messages.at(-1).reference.frameIndex,1);assert.strictEqual(htmlWrites,1,'same-panel exact selection must not rebuild HTML');
  assert.strictEqual(await sandbox.openMoveConstantsWorkspace({fsPath:path.resolve('other.def')},{history:true}),undefined);
  assert.strictEqual(htmlWrites,1,'another owner must not replace the draft');assert.match(notices.at(-1),/pending edits/);
  const beforeReads=modelReads;await sandbox.openMoveConstantsWorkspace({fsPath:path.resolve('other.def')});assert.equal(modelReads,beforeReads);assert.equal(htmlWrites,1,'cancelled character switch retains original page');
  sandbox.session.busy=true;await sandbox.openMoveConstantsWorkspace({fsPath:path.resolve('other.def')});assert.equal(htmlWrites,1);sandbox.session.busy=false;
  const sourceVisits=[];
  sandbox.session={panel,assets:{defPath:owner,constants:'test.cns'},model:{moves:[{id:'normal.mp',prefix:'normal.mp'}]}};
  sandbox.currentText=async()=> 'normal.mp.damage = 30';
  sandbox.parseConstants=()=>({byName:new Map([['normal.mp.damage',{line:7}]]),values:[]});
  sandbox.vscode.workspace={openTextDocument:async()=>({lineAt:line=>({text:'normal.mp.damage = 30'})})};
  sandbox.require=name=>{assert.strictEqual(name,'./viewer_navigation');return{currentPoint:(filename,kind,message,panel)=>({filename,kind,reference:message.navigationSelection,panel}),openReferenceSource:(origin,point)=>sourceVisits.push({origin,point})};};
  vm.runInNewContext(source.slice(source.indexOf('async function openMoveSource('),source.indexOf('async function handle(')),sandbox);
  await sandbox.openMoveSource({sourceId:'normal.mp',file:'constants',suffix:'damage'});
  assert.strictEqual(sourceVisits[0].origin.line,7);assert.strictEqual(sourceVisits[0].origin.text,'normal.mp.damage = 30');
  assert.strictEqual(sourceVisits[0].point.reference.id,'normal.mp');assert.strictEqual(sourceVisits[0].point.panel,panel);
  let release;sandbox.vscode.workspace.openTextDocument=()=>new Promise(resolve=>{release=()=>resolve({lineAt:()=>({text:'normal.mp.damage = 30'})});});
  const navigating=sandbox.openMoveSource({sourceId:'normal.mp',file:'constants',suffix:'damage'});await new Promise(resolve=>setImmediate(resolve));sandbox.session.assets={defPath:'other.def',constants:'other.cns'};release();await navigating;assert.equal(sourceVisits.length,1,'delayed navigation must not attach the old source to a new owner');
  console.log('JNP closed history returns panel; reuse and conflicting owner preserve drafts');
})().catch(error=>{console.error(error);process.exitCode=1;});
