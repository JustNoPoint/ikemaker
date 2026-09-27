'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
(async()=>{
 const warnings=[], registrations=[], panels=[];
 const model={character:'Fixture',files:{defPath:path.resolve('fixture.def')},moves:[{id:'normal.lp',values:{damage:20},fields:[{suffix:'damage',present:true}]},{id:'normal.mp',values:{damage:30},fields:[{suffix:'damage',present:true}]}]};
 const box={require:name=>{if(name==='./viewer_close')return{support(){}};assert(['./form_drafts','./webview_policy'].includes(name));return require('../src/'+name.slice(2));},session:null,path,setTimeout,clearTimeout,characterAssets:defPath=>({defPath}),characterShellAssets:defPath=>({defPath}),modelFor:async()=>model,shellModelFor:async()=>model,registerCharacterToolPanel:()=>{},html:()=>'<html>restored</html>',handle:async()=>{},openMoveConstantsWorkspace:()=>{},vscode:{languages:{},workspace:{onDidChangeTextDocument:()=>({dispose(){}}),onDidSaveTextDocument:()=>({dispose(){}})},window:{showWarningMessage:x=>warnings.push(x),showErrorMessage:()=>{},registerWebviewPanelSerializer:(kind,handler)=>{registrations.push({kind,handler});return{};}},commands:{registerCommand:()=>({})}}};
 vm.runInNewContext(extract('function attachPanel(', 'module.exports'),box);
 box.registerMoveConstantsWorkspace({subscriptions:[]});
 assert.equal(registrations[0].kind,'ikemenMoveConstants');
 function panel(){const p={webview:{options:{},onDidReceiveMessage:f=>p.receive=f},onDidDispose:f=>p.close=f,dispose:()=>{p.disposed=true;p.close?.();}};panels.push(p);return p;}
 const first=panel();await registrations[0].handler.deserializeWebviewPanel(first,{defPath:model.files.defPath});
 assert.equal(box.session.panel,first);assert.equal(first.webview.options.enableScripts,true);assert.equal(first.webview.html,'<html>restored</html>');
 const duplicate=panel();await box.restoreMoveConstantsWorkspace(duplicate,{defPath:model.files.defPath});assert(duplicate.disposed);assert.equal(box.session.panel,first);
 first.dispose();assert.equal(box.session,null);
 const invalid=panel();await box.restoreMoveConstantsWorkspace(invalid,{defPath:'relative.def'});assert(invalid.disposed);assert.equal(box.session,null);
 box.characterShellAssets=()=>{throw Error('Missing character');};const missing=panel();await box.restoreMoveConstantsWorkspace(missing,{defPath:model.files.defPath});assert(missing.disposed);assert(warnings.some(x=>x.includes('Missing character')));
 // Run the actual client selection/save functions; restore only valid fields for the saved move.
 let persisted={layout:{name:'Attack Editing'}};
 const client={window:{addEventListener(){}},document:{querySelectorAll:()=>[]},$:()=>null,saved:persisted,moveDrafts:{stage(){}},model,move:null,draft:{},profileDrafts:{shared:'-4.8'},frame:0,stop:()=>{},render:()=>{},vscode:{getState:()=>persisted,setState:x=>{persisted=x;client.saved=x;},postMessage:()=>{}},opponentEnabled:true,opponentWorldX:80,opponentWorldY:0,reactionId:'high',viewZoom:1,panX:20,panY:10,viewportWidth:800,viewportHeight:600};
 vm.createContext(client);vm.runInContext(require('../src/move_constants_drafts').clientScript(),client);
 vm.runInContext(extract('function saveState(', 'function renderMoveList('),client);
 client.selectMove('normal.mp',{damage:37,unknown:42});assert.equal(client.move.id,'normal.mp');assert.equal(client.draft.damage,37);assert.equal(client.draft.unknown,undefined);assert.equal(persisted.selectedMove,'normal.mp');assert.equal(persisted.layout.name,'Attack Editing');assert.equal(persisted.defPath,model.files.defPath);assert.equal(persisted.profileDrafts.shared,'-4.8');
 client.selectMove('deleted.move',{damage:99});assert.equal(client.move.id,'normal.lp');assert.equal(Object.keys(client.draft).length,0,'never attach orphaned drafts to the fallback move');
 client.selectMove('normal.mp',{damage:NaN});assert.equal(client.draft.damage,37,'a saved move draft takes precedence over invalid legacy state');
 const startup={model:{...model,openReference:{profileId:'normal.mp',frameIndex:1}},saved:{defPath:model.files.defPath,selectedMove:'normal.lp',selectedFrame:7,draft:{damage:99}}};vm.createContext(startup);vm.runInContext(extract('function initialMoveSelection(', "$('moveSearch')"),startup);const chosen=startup.initialMoveSelection();assert.equal(chosen.id,'normal.mp');assert.equal(chosen.frame,1);assert.equal(chosen.draft,undefined,'an explicit profile cannot inherit another saved move legacy draft');
 console.log('JNP reload restoration, unavailable owners, selection and draft isolation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
