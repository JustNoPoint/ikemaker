'use strict';

const assert = require('assert');
const {
  VIEW_TYPE, MINIMUM_BROWSER_WIDTH, cleanPersistedState, normalizeModel,
  renderVisualAuthoringBrowserCompanionHtml, createVisualAuthoringBrowserCompanion
} = require('../src/visual_authoring_browser_companion');

function deferred() { let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve}; }
function panelFactory(created) {
  return specification => {
    const messageListeners=[],disposeListeners=[],posted=[];
    const panel={specification,viewColumn:2,active:true,reveals:0,disposed:false,holdBusy:false,busyGate:null,webview:{options:{},html:'',posted,postMessage(message){posted.push(message);if(panel.holdBusy&&message.type==='visualBrowserBusy'&&message.busy)return panel.busyGate.promise;return Promise.resolve(true);},onDidReceiveMessage(listener){messageListeners.push(listener);return{dispose(){}}}},reveal(){panel.reveals+=1;},onDidDispose(listener){disposeListeners.push(listener);return{dispose(){}}},dispose(){if(panel.disposed)return;panel.disposed=true;for(const listener of disposeListeners)listener();},async emit(message){let result=false;for(const listener of messageListeners)result=await listener(message);return result;}};
    created.push(panel);return panel;
  };
}
function model(generation=3,binding='binding-3') {
  return {generation,binding,scope:{id:'screen:title',label:'Title screen',ordinal:0,total:2},scopes:[{id:'screen:title',label:'Title screen'},{id:'screen:select',label:'Select screen'}],browser:{binding,kinds:['sprite'],rows:[{id:'row-logo',ordinal:0,label:'Logo',description:'sprite 0,0',kind:'sprite',thumbnailKey:'logo',actions:[{id:'open-source',label:'Open source'}]},{id:'row-cursor',ordinal:1,label:'Cursor',description:'sprite 0,1',kind:'sprite',thumbnailKey:'',actions:[]}],total:2,truncated:false},selection:{rowIds:['row-logo'],anchorId:'row-logo'},thumbnails:{logo:'data:image/png;base64,AA==',logo2:'data:image/png;base64,AQ=='},thumbnailAnimations:{'row-logo':{frames:[{thumbnailKey:'logo',durationMs:50},{thumbnailKey:'logo2',durationMs:2000}],truncated:false}}};
}

(async()=>{
  assert.strictEqual(VIEW_TYPE,'ikemenVisualAuthoringBrowser');
  assert.strictEqual(MINIMUM_BROWSER_WIDTH,420);
  assert.strictEqual(cleanPersistedState({version:1,surface:'screenpack',ownerKey:'D:/system.def',open:true,floating:true,preferences:{query:'logo',kind:'sprite',view:'thumbnails'}}).preferences.view,'thumbnails');
  assert.strictEqual(cleanPersistedState({version:1,surface:'screenpack',ownerKey:'D:/system.def',open:true,floating:true,preferences:{},rows:[{id:'injected'}]}),null,'persisted state rejects copied browser rows');
  const normalized=normalizeModel(model(),{surface:'screenpack',ownerKey:'D:/system.def',label:'UI'},{});
  assert.deepStrictEqual(Object.keys(normalized.browser.rows[0]),['id','ordinal','label','description','kind','thumbnailKey','actions']);
  assert.strictEqual(Object.hasOwn(normalized.browser.rows[0],'source'),false,'the companion projection contains no host source DTO or draft');
  assert.strictEqual(normalized.thumbnailAnimations['row-logo'].frames.length,2,'only bounded, resolved thumbnail frames cross into the companion');
  const markup=renderVisualAuthoringBrowserCompanionHtml({sessionId:'visual:test',model:null});
  assert.match(markup,/Waiting for the visual editor/);assert.match(markup,/minimum:420/);assert.match(markup,/visualBrowserSelectionIntent/);assert.match(markup,/Animate thumbnails/);assert.match(markup,/setInterval/);

  const created=[],commands=[],stored=new Map(),minimum=[];let blockedPlacement='',placementGate=null;
  const storage={get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)};
  const service=createVisualAuthoringBrowserCompanion({
    createPanel:panelFactory(created),commands:{executeCommand:async command=>{commands.push(command);if(command===blockedPlacement)await placementGate.promise;}},storage,
    minimumWidthFactory:(_panel,_commands,width)=>{const state={width,began:0,requested:0,ended:0,handled:0};minimum.push(state);return{beginOpening(){state.began+=1;},request(){state.requested+=1;},endFloating(){state.ended+=1;},handle(){state.handled+=1;return true;}};}
  });
  let current=model(),modelProvider=()=>current,scopes=[],selections=[],actions=[],selectGate=null;
  service.registerOwner({surface:'screenpack',ownerKey:'D:/system.def',label:'Screenpack',getModel:()=>modelProvider(),onScope:id=>scopes.push(id),onSelect:async(id,mode)=>{selections.push([id,mode]);if(selectGate)await selectGate.promise;},onAction:(rowId,actionId)=>actions.push([rowId,actionId])});
  const opening=service.openOrFocus('screenpack','D:/system.def');
  await Promise.resolve();await Promise.resolve();
  assert.strictEqual(created.length,1);assert.strictEqual(commands.length,0,'a new companion is not floated before its own renderer is ready');
  const panel=created[0],sessionId=service.snapshot('screenpack','D:/system.def').sessionId;
  assert.strictEqual(await panel.emit({type:'visualBrowserReady',sessionId}),true);
  const opened=await opening;
  assert.strictEqual(opened.created,true);assert.strictEqual(opened.floating,true);
  assert.deepStrictEqual(commands,['workbench.action.moveEditorToNewWindow']);
  assert.strictEqual(minimum[0].width,420);assert.strictEqual(minimum[0].began,1);assert.strictEqual(minimum[0].requested,1);
  assert.strictEqual(panel.specification.viewType,VIEW_TYPE);

  assert.strictEqual(await panel.emit({type:'visualBrowserScopeIntent',sessionId,generation:3,binding:'binding-3',scopeId:'screen:select'}),true);
  assert.deepStrictEqual(scopes,['screen:select']);
  assert.strictEqual(await panel.emit({type:'visualBrowserSelectionIntent',sessionId,generation:3,binding:'binding-3',rowId:'row-cursor',mode:'toggle'}),true);
  assert.deepStrictEqual(selections,[['row-cursor','toggle']]);
  assert.strictEqual(await panel.emit({type:'visualBrowserAction',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',actionId:'open-source'}),true);
  assert.deepStrictEqual(actions,[['row-logo','open-source']]);
  assert.strictEqual(await panel.emit({type:'visualBrowserAction',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',actionId:'forged'}),false,'actions must exist in the current host projection');
  assert.strictEqual(await panel.emit({type:'visualBrowserSelectionIntent',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',mode:'replace',extra:true}),false,'browser intents use exact DTO shapes');

  selectGate=deferred();const pendingSelection=panel.emit({type:'visualBrowserSelectionIntent',sessionId,generation:3,binding:'binding-3',rowId:'row-cursor',mode:'replace'});await Promise.resolve();await Promise.resolve();const actionCount=actions.length;
  assert.strictEqual(await panel.emit({type:'visualBrowserAction',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',actionId:'open-source'}),false,'overlapping owner actions are rejected while the exact first action remains pending');assert.strictEqual(actions.length,actionCount);assert(panel.webview.posted.some(message=>message.type==='visualBrowserBusy'&&message.busy&&/Wait/.test(message.status)),'the rejected overlap receives an actionable visible reason');selectGate.resolve();await pendingSelection;selectGate=null;assert(panel.webview.posted.some(message=>message.type==='visualBrowserBusy'&&message.busy===false),'the owner-operation lock always publishes a terminal ready state');

  const selectionCount=selections.length;panel.holdBusy=true;panel.busyGate=deferred();const revokedSelection=panel.emit({type:'visualBrowserSelectionIntent',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',mode:'replace'});await Promise.resolve();current=model(4,'binding-4');await service.publish('D:/system.def','screenpack');panel.holdBusy=false;panel.busyGate.resolve(true);assert.strictEqual(await revokedSelection,false,'authority changed while the busy acknowledgement was held revokes the stale operation');assert.strictEqual(selections.length,selectionCount,'revoked operations never reach their owner callback');

  const beforeStale=panel.webview.posted.length;
  await service.publish('D:/system.def','screenpack');
  assert.strictEqual(await panel.emit({type:'visualBrowserSelectionIntent',sessionId,generation:3,binding:'binding-3',rowId:'row-logo',mode:'replace'}),false);
  assert.strictEqual(selections.length,selectionCount,'a stale selection never reaches the owner');
  assert(panel.webview.posted.length>beforeStale,'a stale intent republishes the current host model');
  assert.strictEqual(panel.webview.posted.at(-1).generation,4);

  const olderModel=deferred(),newerModel=deferred();let modelCalls=0;modelProvider=()=>++modelCalls===1?olderModel.promise:newerModel.promise;const olderPublish=service.publish('D:/system.def','screenpack');await Promise.resolve();const newerPublish=service.publish('D:/system.def','screenpack');newerModel.resolve(model(6,'binding-6'));assert.strictEqual(await newerPublish,true);olderModel.resolve(model(5,'binding-5'));assert.strictEqual(await olderPublish,false,'an older asynchronous model request cannot publish after a newer request has claimed the record');assert.strictEqual(service.snapshot('screenpack','D:/system.def').model.generation,6);assert.strictEqual(panel.webview.posted.filter(message=>message.type==='visualBrowserModel').at(-1).generation,6,'out-of-order owner resolution cannot regress client authority');current=model(6,'binding-6');modelProvider=()=>current;

  assert.strictEqual(await panel.emit({type:'visualBrowserPreferences',sessionId,query:'cursor',kind:'sprite',view:'thumbnails'}),true);
  const persisted=[...stored.values()].find(value=>value?.ownerKey==='D:/system.def');
  assert.deepStrictEqual(Object.keys(persisted).sort(),['floating','open','ownerKey','preferences','surface','version']);
  assert.strictEqual(JSON.stringify(persisted).includes('row-logo'),false,'only presentation preferences are persisted');
  assert.strictEqual(await panel.emit({type:'visualBrowserPlacement',sessionId,placement:'dock'}),true);
  assert.strictEqual(service.snapshot('screenpack','D:/system.def').floating,false);
  blockedPlacement='workbench.action.moveEditorToNewWindow';placementGate=deferred();
  const placementCommands=commands.filter(command=>command===blockedPlacement).length,firstFloat=panel.emit({type:'visualBrowserPlacement',sessionId,placement:'float'});
  while(commands.filter(command=>command===blockedPlacement).length===placementCommands)await Promise.resolve();
  const duplicateResult=await panel.emit({type:'visualBrowserPlacement',sessionId,placement:'float'});
  assert.strictEqual(duplicateResult,false,'rapid duplicate placement is rejected while the exact native move remains pending');
  assert.strictEqual(commands.filter(command=>command===blockedPlacement).length,placementCommands+1,'only one native move command can own the placement transition');
  assert(panel.webview.posted.some(message=>message.type==='visualBrowserBusy'&&message.busy&&/Wait/.test(message.status)));
  placementGate.resolve();assert.strictEqual(await firstFloat,true);
  blockedPlacement='';assert.strictEqual(service.snapshot('screenpack','D:/system.def').floating,true);
  assert.strictEqual(await panel.emit({type:'visualBrowserPlacement',sessionId,placement:'dock'}),true);
  const commandCount=commands.length,reopened=await service.openOrFocus('screenpack','D:/system.def');
  assert.strictEqual(reopened.created,false);assert.strictEqual(commands.length,commandCount,'focusing an existing docked browser does not float it');
  assert(panel.reveals>0);

  service.detachOwner('screenpack','D:/system.def');
  assert.match(panel.webview.html,/Waiting for the visual editor to reopen/);

  const restoredPanels=[],restoreGate=deferred(),restoredCommands=[];
  const restoredService=createVisualAuthoringBrowserCompanion({createPanel:panelFactory(restoredPanels),commands:{executeCommand:async command=>restoredCommands.push(command)},storage,waitForRestoreSettled:()=>restoreGate.promise,minimumWidthFactory:()=>({beginOpening(){},request(){},endFloating(){},handle(){return true;}})});
  const restoredPanel=panelFactory(restoredPanels)({viewType:VIEW_TYPE,title:'Restored'}),restorePromise=restoredService.restore({version:1,surface:'storyboard',ownerKey:'D:/intro.def',open:true,floating:true,preferences:{query:'',kind:'',view:'list'}},restoredPanel);
  assert.match(restoredPanel.webview.html,/Waiting for the visual editor/);assert.doesNotMatch(restoredPanel.webview.html,/row-logo/,'restoration never embeds a saved row snapshot');
  restoredService.registerOwner({surface:'storyboard',ownerKey:'D:/intro.def',label:'Intro',getModel:()=>model(1,'story-binding')});
  restoreGate.resolve('quiet');await Promise.resolve();await Promise.resolve();
  const restoredSession=restoredService.snapshot('storyboard','D:/intro.def').sessionId;
  assert.deepStrictEqual(restoredCommands,[],'restoration waits for the restored browser renderer before moving a window');
  await restoredPanel.emit({type:'visualBrowserReady',sessionId:restoredSession});
  await restorePromise;
  assert.deepStrictEqual(restoredCommands,['workbench.action.moveEditorToNewWindow']);

  const settleRaceCreated=[],settleRaceGate=deferred(),settleRaceCommands=[];
  const settleRaceService=createVisualAuthoringBrowserCompanion({createPanel:panelFactory(settleRaceCreated),commands:{executeCommand:async command=>settleRaceCommands.push(command)},storage,waitForRestoreSettled:()=>settleRaceGate.promise,minimumWidthFactory:()=>({beginOpening(){},request(){},endFloating(){},handle(){return true;}})});
  const staleRestoredPanel=panelFactory(settleRaceCreated)({viewType:VIEW_TYPE,title:'Stale restored'}),staleRestore=settleRaceService.restore({version:1,surface:'storyboard',ownerKey:'D:/ending.def',open:true,floating:true,preferences:{query:'',kind:'',view:'list'}},staleRestoredPanel);settleRaceService.registerOwner({surface:'storyboard',ownerKey:'D:/ending.def',label:'Ending',getModel:()=>model(2,'ending-binding')});await Promise.resolve();staleRestoredPanel.dispose();const manualOpen=settleRaceService.openOrFocus('storyboard','D:/ending.def');while(settleRaceCreated.length<2)await Promise.resolve();const currentSettlePanel=settleRaceCreated[1],settleRaceSession=settleRaceService.snapshot('storyboard','D:/ending.def').sessionId;await currentSettlePanel.emit({type:'visualBrowserReady',sessionId:settleRaceSession});const manuallyOpened=await manualOpen;assert.strictEqual(manuallyOpened.floating,true);assert.deepStrictEqual(settleRaceCommands,['workbench.action.moveEditorToNewWindow']);settleRaceGate.resolve('quiet');assert.strictEqual(await staleRestore,false,'a disposed restored attachment cannot adopt the manually opened replacement after workbench settling');assert.deepStrictEqual(settleRaceCommands,['workbench.action.moveEditorToNewWindow'],'stale restore continuation cannot issue another native placement command');assert.strictEqual(settleRaceService.snapshot('storyboard','D:/ending.def').open,true);assert.strictEqual(settleRaceService.snapshot('storyboard','D:/ending.def').floating,true);

  panel.dispose();await Promise.resolve();
  const stateAfterClose=[...stored.values()].find(value=>value?.ownerKey==='D:/system.def');
  assert.strictEqual(stateAfterClose.open,false,'explicit disposal does not persist a stale open browser');

  const raceCreated=[],raceCommands=[];let holdRaceMove=false,raceMoveGate=null;
  const raceService=createVisualAuthoringBrowserCompanion({createPanel:panelFactory(raceCreated),commands:{executeCommand:async command=>{raceCommands.push(command);if(holdRaceMove&&command==='workbench.action.moveEditorToNewWindow')await raceMoveGate.promise;}},storage:new Map(),minimumWidthFactory:()=>({beginOpening(){},request(){},endFloating(){},handle(){return true;}})});
  raceService.registerOwner({surface:'stage',ownerKey:'D:/stage.def',label:'Stage',getModel:()=>model(9,'race-binding')});
  const raceOpening=raceService.openOrFocus('stage','D:/stage.def');while(raceCreated.length<1)await Promise.resolve();const raceOld=raceCreated[0],raceSession=raceService.snapshot('stage','D:/stage.def').sessionId;await raceOld.emit({type:'visualBrowserReady',sessionId:raceSession});await raceOpening;await raceOld.emit({type:'visualBrowserPlacement',sessionId:raceSession,placement:'dock'});
  holdRaceMove=true;raceMoveGate=deferred();const movesBefore=raceCommands.filter(command=>command==='workbench.action.moveEditorToNewWindow').length,oldMessageBoundary=raceOld.webview.posted.length,oldFloat=raceOld.emit({type:'visualBrowserPlacement',sessionId:raceSession,placement:'float'});
  while(raceCommands.filter(command=>command==='workbench.action.moveEditorToNewWindow').length===movesBefore)await Promise.resolve();
  raceOld.dispose();const raceReopening=raceService.openOrFocus('stage','D:/stage.def');while(raceCreated.length<2)await Promise.resolve();const abandoned=raceCreated[1];await abandoned.emit({type:'visualBrowserReady',sessionId:raceSession});await Promise.resolve();
  const abandonedBoundary=abandoned.webview.posted.length;abandoned.dispose();const raceThirdOpening=raceService.openOrFocus('stage','D:/stage.def');while(raceCreated.length<3)await Promise.resolve();const raceCurrent=raceCreated[2];await raceCurrent.emit({type:'visualBrowserReady',sessionId:raceSession});await Promise.resolve();
  assert.strictEqual(raceCommands.filter(command=>command==='workbench.action.moveEditorToNewWindow').length,movesBefore+1,'both automatic reopen waiters remain serialized behind the predecessor native move');
  raceMoveGate.resolve();assert.strictEqual(await oldFloat,false,'the disposed first panel cannot claim the completed placement');const abandonedResult=await raceReopening;assert.strictEqual(abandonedResult.floating,false,'the abandoned second-panel waiter cannot adopt the third attachment');const currentResult=await raceThirdOpening;assert.strictEqual(currentResult.floating,true);assert.strictEqual(currentResult.panel,raceCurrent);assert.strictEqual(raceCommands.filter(command=>command==='workbench.action.moveEditorToNewWindow').length,movesBefore+2,'only the current third attachment drives the one successor native move');assert(raceCurrent.webview.posted.some(message=>message.type==='visualBrowserBusy'&&message.busy&&/Wait/.test(message.status)),'the current reopened panel visibly explains why automatic float is waiting');assert(raceCurrent.webview.posted.some(message=>message.type==='visualBrowserBusy'&&message.busy===false),'the current replacement receives the exact terminal ready state');assert(!raceOld.webview.posted.slice(oldMessageBoundary).some(message=>message.type==='visualBrowserBusy'&&message.busy===false),'the disposed first panel receives no stale terminal');assert(!abandoned.webview.posted.slice(abandonedBoundary).some(message=>message.type==='visualBrowserBusy'&&message.busy===false),'the disposed second panel receives no stale terminal');
  console.log('Shared visual authoring browser companion lifecycle and authority tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
