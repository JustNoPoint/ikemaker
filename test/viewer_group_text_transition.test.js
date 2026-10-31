'use strict';
const assert=require('assert');
const viewerGroup=require('../src/viewer_group');
const viewerClose=require('../src/viewer_close');

function panel(title,column,delay=0){
  const disposals=[];
  return{title,viewColumn:column,active:false,disposed:false,webview:{onDidReceiveMessage(){return{dispose(){}};},postMessage:async()=>true},onDidChangeViewState(){},onDidDispose(listener){disposals.push(listener);},dispose(){if(this.disposed)return;this.disposed=true;const finish=()=>{for(const listener of disposals)listener();};if(delay)setTimeout(finish,delay);else finish();}};
}

(async()=>{
  viewerGroup.resetViewerGroupForTests();
  const first=panel('AIR Viewer',2),second=panel('AIR Actions Browser',2),information=[];
  const visualGroup={viewColumn:2,tabs:[{label:first.title},{label:second.title}]};viewerGroup.configureViewerTopology(()=>({all:[visualGroup],active:visualGroup}));first.active=true;
  viewerGroup.trackViewerPanel(first);viewerGroup.trackViewerPanel(second);
  viewerClose.support(first,{readOnly:true});viewerClose.support(second,{readOnly:true});
  const api={window:{showInformationMessage:async message=>information.push(message),showWarningMessage:async()=>undefined}};
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(first,api),{accepted:true,closed:true,settled:true},'normal Text Editor transition safely closes the exact shared visual group first');
  assert(first.disposed&&second.disposed,'every participating visual tab is disposed before the text layout may be rebuilt');
  assert.deepStrictEqual(viewerGroup.trackedPanels(),[],'the transition waits until the visual group is absent');

  viewerGroup.resetViewerGroupForTests();
  const strict=panel('Strict AIR Viewer',2),strictGroup={viewColumn:2,tabs:[{label:strict.title,input:{viewType:'ikemenAirWorkspace'}}]},nativeFile='C:/chars/Ryu/Ryu.def',nativeGroup={viewColumn:3,tabs:[{label:'Ryu.def',input:{uri:{fsPath:nativeFile}}}]};viewerGroup.configureViewerTopology(()=>({all:[strictGroup,nativeGroup],active:strictGroup}));strict.active=true;viewerGroup.trackViewerPanel(strict);viewerClose.support(strict,{readOnly:true});strict.onDidDispose(()=>{strictGroup.tabs=[];});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(strict,api,{admittedFiles:[nativeFile]}),{accepted:true,closed:true,settled:true},'the guarded transition waits until the visual tab leaves the live topology and only admitted native text remains');

  viewerGroup.resetViewerGroupForTests();
  const busy=panel('Busy SFF Creator',3),busyGroup={viewColumn:3,tabs:[{label:busy.title}]};viewerGroup.configureViewerTopology(()=>({all:[busyGroup],active:busyGroup}));busy.active=true;viewerGroup.trackViewerPanel(busy);viewerClose.support(busy,{isBusy:()=>true});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(busy,api),{accepted:false,closed:false,settled:true},'a busy viewer aborts the normal transition');
  assert.strictEqual(busy.disposed,false,'an aborted transition keeps the exact origin open');
  assert(viewerGroup.trackedPanels().includes(busy),'an aborted transition performs no layout-preparation disposal');
  busy.dispose();viewerGroup.resetViewerGroupForTests();
  const guarded=panel('Guarded AIR Viewer',3),guardedGroup={viewColumn:3,tabs:[{label:guarded.title,input:{viewType:'ikemenAirWorkspace'}}]},foreignGroup={viewColumn:4,tabs:[{label:'Foreign Viewer',input:{viewType:'foreign.custom'}}]};viewerGroup.configureViewerTopology(()=>({all:[guardedGroup,foreignGroup],active:guardedGroup}));guarded.active=true;viewerGroup.trackViewerPanel(guarded);viewerClose.support(guarded,{readOnly:true});
  guarded.onDidDispose(()=>{guardedGroup.tabs=[];});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(guarded,api,{admittedFiles:['C:/chars/Ryu/Ryu.def']}),{accepted:true,closed:true,settled:true},'an unrelated surface in another editor group is left untouched and cannot block the connected text editor');
  assert.strictEqual(guarded.disposed,true,'the exact originating visual group still closes normally');
  assert.strictEqual(foreignGroup.tabs.length,1,'the unrelated editor group is not changed by the text transition');
  viewerGroup.resetViewerGroupForTests();
  const sameTitle=panel('Same Title Viewer',3),sameTitleGroup={viewColumn:3,tabs:[{label:sameTitle.title,input:{viewType:'ikemenAirWorkspace'}},{label:sameTitle.title,input:{viewType:'foreign.custom'}}]};viewerGroup.configureViewerTopology(()=>({all:[sameTitleGroup],active:sameTitleGroup}));sameTitle.active=true;viewerGroup.trackViewerPanel(sameTitle);viewerClose.support(sameTitle,{readOnly:true});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(sameTitle,api,{admittedFiles:[nativeFile]}),{accepted:false,closed:false,settled:true},'a same-title untracked custom tab is not mistaken for the tracked IKEMaker panel');assert.strictEqual(sameTitle.disposed,false);sameTitle.dispose();viewerGroup.resetViewerGroupForTests();
  const replaced=panel('Replaced AIR Viewer',3),originalTab={label:replaced.title,input:{viewType:'ikemenAirWorkspace'}},replacedGroup={viewColumn:3,tabs:[originalTab]};viewerGroup.configureViewerTopology(()=>({all:[replacedGroup],active:replacedGroup}));replaced.active=true;viewerGroup.trackViewerPanel(replaced);const originalPrepare=viewerClose.prepare;viewerClose.prepare=async()=>{replacedGroup.tabs=[{label:replaced.title,input:{viewType:'ikemenAirWorkspace'}}];return true;};
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(replaced,api,{admittedFiles:[nativeFile]}),{accepted:false,closed:false,settled:true},'a same-label replacement during close preparation fails the exact Tab-object recheck');assert.strictEqual(replaced.disposed,false);viewerClose.prepare=originalPrepare;replaced.dispose();viewerGroup.resetViewerGroupForTests();
  const delayed=panel('Delayed AIR Viewer',4,35),delayedGroup={viewColumn:4,tabs:[{label:delayed.title}]};viewerGroup.configureViewerTopology(()=>({all:[delayedGroup],active:delayedGroup}));delayed.active=true;viewerGroup.trackViewerPanel(delayed);viewerClose.support(delayed,{readOnly:true});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(delayed,api),{accepted:true,closed:true,settled:true},'the transition waits for a delayed disposal acknowledgement instead of assuming two microtasks are enough');
  viewerGroup.resetViewerGroupForTests();
  const restored=panel('Restored SFF Viewer',2);restored.viewType='ikemenSffViewer';const restoredTab={label:'Restoring…',input:{viewType:'ikemenSffViewer'}},restoredGroup={viewColumn:2,tabs:[restoredTab]};viewerGroup.configureViewerTopology(()=>({all:[restoredGroup],active:restoredGroup}));restored.active=true;viewerClose.support(restored,{readOnly:true});restored.onDidDispose(()=>{restoredGroup.tabs=[];});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(restored,api,{admittedFiles:[nativeFile]}),{accepted:true,closed:true,settled:true},'a clean serialized viewer may open the Text Editor before process-local viewer tracking is rebuilt');
  assert.strictEqual(restored.disposed,true,'the exact restored origin is still closed through normal viewer-close protection');
  viewerGroup.resetViewerGroupForTests();
  const restoredBusy=panel('Restored Busy Viewer',2),restoredBusyGroup={viewColumn:2,tabs:[{label:restoredBusy.title,input:{viewType:'ikemenAirWorkspace'}}]};viewerGroup.configureViewerTopology(()=>({all:[restoredBusyGroup],active:restoredBusyGroup}));restoredBusy.active=true;viewerClose.support(restoredBusy,{isBusy:()=>true});
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(restoredBusy,api,{admittedFiles:[nativeFile]}),{accepted:false,closed:false,settled:true},'a restored viewer still retains genuine busy-work protection');
  assert.strictEqual(restoredBusy.disposed,false,'busy restored work remains open');
  restoredBusy.dispose();
  viewerGroup.resetViewerGroupForTests();
  const prefixed=panel('Restored AIR',2);prefixed.viewType='ikemenAirWorkspace';
  const prefixedGroup={viewColumn:2,tabs:[{label:prefixed.title,input:{viewType:'mainThreadWebview-ikemenAirWorkspace'}}]};
  viewerGroup.configureViewerTopology(()=>({all:[prefixedGroup],active:prefixedGroup}));prefixed.active=true;viewerGroup.trackViewerPanel(prefixed);viewerClose.support(prefixed,{readOnly:true});prefixed.onDidDispose(()=>{prefixedGroup.tabs=[];});
  assert.strictEqual(viewerGroup.restoredAssetColumn([prefixedGroup]),2,'VS Code internal webview types identify the restored viewer group');
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(prefixed,api,{admittedFiles:[nativeFile]}),{accepted:true,closed:true,settled:true},'host-prefixed IKEMaker tabs switch to text instead of being rejected as unrelated');
  viewerGroup.resetViewerGroupForTests();
  const awake=panel('Ryu AIR',1);awake.viewType='ikemenAirWorkspace';awake.active=true;
  const sleeping=panel('Ryu SFF',1);sleeping.viewType='ikemenSffViewer';
  const kept={input:{uri:{fsPath:'C:/shared/unrelated.zss'}},label:'unrelated.zss',isDirty:true};
  const awakeTab={input:{viewType:'mainThreadWebview-ikemenAirWorkspace'},label:awake.title};
  const sleepingTab={input:{viewType:'mainThreadWebview-ikemenSffViewer'},label:sleeping.title};
  const liveGroup={viewColumn:1,tabs:[awakeTab,sleepingTab,kept]};
  viewerGroup.configureViewerTopology(()=>({all:[liveGroup],active:liveGroup}));viewerGroup.trackViewerPanel(awake);viewerClose.support(awake,{readOnly:true});
  awake.onDidDispose(()=>{liveGroup.tabs=liveGroup.tabs.filter(t=>t!==awakeTab);});sleeping.onDidDispose(()=>{liveGroup.tabs=liveGroup.tabs.filter(t=>t!==sleepingTab);});
  const restoringApi={...api,commands:{async executeCommand(id,index){assert.strictEqual(id,'workbench.action.openEditorAtIndex');assert.strictEqual(index,1);viewerGroup.trackViewerPanel(sleeping);viewerClose.support(sleeping,{readOnly:true});}}};
  assert.deepStrictEqual(await viewerGroup.closeViewerGroupForText(awake,restoringApi,{admittedFiles:[nativeFile]}),{accepted:true,closed:true,settled:true});
  assert(awake.disposed&&sleeping.disposed,'lazy restored assets pass normal protected close');
  assert.deepStrictEqual(liveGroup.tabs,[kept],'unrelated dirty native tab remains untouched');
  viewerGroup.resetViewerGroupForTests();
  console.log('Visual-to-text transition closes the exact clean group first and fails closed for busy work');
})().catch(error=>{console.error(error);process.exitCode=1;});
