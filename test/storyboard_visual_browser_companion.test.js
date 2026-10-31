'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'storyboard-visual-browser-')),filename=path.join(root,'story.def');
fs.writeFileSync(filename,'[SceneDef]\nspr = story.sff\n[Scene 0]\nlayer0.offset = 10,20\nlayer0.spr = 1,0\nlayer1.offset = 30,40\nlayer1.anim = 10\nend.time = 60\n[Scene 1]\nlayer0.offset = 50,60\nlayer0.spr = 2,0\nlayer1.offset = 70,80\nlayer1.text = Hello\nend.time = 90\n[Begin Action 10]\n1,0,0,0,5\n');
const panels=[],sourceRequests=[],published=[],opened=[],detached=[];let serializer,owner,ownerDisposed=0;
function makePanel(){const listeners=[],disposals=[];const panel={active:true,viewColumn:1,webview:{html:'',posted:[],postMessage(message){this.posted.push(message);return Promise.resolve(true);},onDidReceiveMessage(listener){listeners.push(listener);panel.receive=message=>Promise.all(listeners.map(value=>value(message)));return{dispose(){}}}},onDidChangeViewState(){},onDidDispose(listener){disposals.push(listener)},reveal(){},dispose(){disposals.forEach(listener=>listener())}};panels.push(panel);return panel;}
const companion={tryCurrent:()=>({registerOwner(value){owner=value;return{dispose(){ownerDisposed+=1}}},publish(surface,key){published.push([surface,key]);return Promise.resolve(true);},open(surface,key){opened.push([surface,key]);return Promise.resolve(true);},detachOwner(surface,key){detached.push([surface,key]);return true;}})};
const vscode={Uri:{file:fsPath=>({fsPath})},ViewColumn:{Active:1},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback})},window:{createWebviewPanel:makePanel,registerWebviewPanelSerializer(_type,value){serializer=value;return{dispose(){}}},showInformationMessage:async()=>{},showWarningMessage:async()=>{},showErrorMessage:error=>{throw Error(String(error))},showQuickPick:async()=>undefined,showInputBox:async()=>undefined},commands:{registerCommand(){return{dispose(){}}},executeCommand:async()=>{}}};
const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return vscode;if(request==='./visual_authoring_browser_service'&&parent.filename.endsWith('storyboard_workspace.js'))return companion;if(request==='./viewer_navigation'&&parent.filename.endsWith('storyboard_workspace.js'))return{openViewerSource:async(...args)=>sourceRequests.push(args),currentPoint:(file,kind,message,panel)=>({file,kind,message,panel})};return original.call(this,request,parent,main)};
const api=require('../src/storyboard_workspace');Module._load=original;

(async()=>{try{
  const data=api.payload(filename);data.generation=5;data.sceneBrowsers=api.storyboardSceneBrowsers(data).map(browser=>browser.snapshot());
  const firstModel=api.storyboardCompanionModel(data,data.sceneBrowsers[0].binding,[],''),secondRows=data.sceneBrowsers[1].rows;
  assert.equal(firstModel.scopes.length,2);assert.equal(firstModel.scope.label,'Scene 0');assert(firstModel.browser.rows.every(row=>row.actions.every(action=>action.mutating!==true)),'the companion does not invent a second position draft');assert.deepEqual(firstModel.browser.rows[0].actions.slice(0,2).map(action=>action.id),['toggle-editor-visibility','toggle-position-lock'],'companion context actions match embedded editor-only display controls');
  const selected=api.applyStoryboardCompanionSelection({rows:secondRows},new Set(),'',secondRows[0].id,'replace'),ranged=api.applyStoryboardCompanionSelection({rows:secondRows},new Set(selected.rowIds),selected.anchorId,secondRows[1].id,'range');
  assert.deepEqual(ranged.rowIds,secondRows.map(row=>row.id));
  assert.equal(api.validStoryboardBrowserMessage({type:'layerSelectionChanged',generation:5,binding:data.sceneBrowsers[1].binding,rowIds:ranged.rowIds,anchorId:ranged.anchorId},5),true);
  assert.equal(api.validStoryboardBrowserMessage({type:'layerSelectionChanged',generation:5,binding:data.sceneBrowsers[1].binding,rowIds:[secondRows[0].id,secondRows[0].id],anchorId:''},5),false);

  api.registerStoryboardWorkspace({subscriptions:[],globalState:{get:(_key,fallback)=>fallback,update:async()=>{}}});
  const panel=await api.openStoryboardWorkspace({fsPath:filename});assert(owner,'Storyboard registers one exact shared visual-browser owner');assert.match(panel.webview.html,/id="visualBrowser"/);
  let model=owner.getModel();assert.equal(model.scope.label,'Scene 0');
  await panel.receive({type:'openVisualBrowser',generation:1});assert.deepEqual(opened,[['storyboard',path.resolve(filename)]]);
  const currentData=api.payload(filename),browsers=api.storyboardSceneBrowsers(currentData).map(browser=>browser.snapshot()),second=browsers[1];
  await panel.receive({type:'sceneSelectionChanged',generation:1,binding:second.binding});model=owner.getModel();assert.equal(model.scope.label,'Scene 1');assert(published.length>=1);
  await panel.receive({type:'layerSelectionChanged',generation:1,binding:second.binding,rowIds:[second.rows[0].id],anchorId:second.rows[0].id});assert.deepEqual(owner.getModel().selection.rowIds,[second.rows[0].id]);
  await owner.onSelect(second.rows[1].id,'range');assert.deepEqual(owner.getModel().selection.rowIds,second.rows.map(row=>row.id));assert(panel.webview.posted.some(message=>message.type==='storyboardCompanionCommit'&&message.rowIds.length===2));
  await owner.onScope(browsers[0].binding);assert.equal(owner.getModel().scope.label,'Scene 0');assert.deepEqual(owner.getModel().selection.rowIds,[]);
  const sourceRow=browsers[0].rows[0];await owner.onSelect(sourceRow.id,'replace');panel.active=false;await owner.onAction(sourceRow.id,'open-source');assert.equal(sourceRequests.length,1,'the floating companion retains current host action authority while the main panel is not active');assert.equal(sourceRequests[0][0],filename);await owner.onAction(sourceRow.id,'toggle-position-lock');assert(panel.webview.posted.some(message=>message.type==='storyboardLayerDisplayIntent'&&message.rowId===sourceRow.id&&message.actionId==='toggle-position-lock'),'companion display actions route back to the one authoritative embedded preference state');panel.active=true;
  panel.dispose();assert.equal(ownerDisposed,1);assert.deepEqual(detached,[['storyboard',path.resolve(filename)]]);
  assert(serializer,'existing Storyboard serializer remains registered');
  console.log('Storyboard shared visual-browser scope, selection, action, and lifecycle tests passed');
}finally{fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
