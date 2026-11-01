'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const header=require('../src/entity_header');
const {createEntitySwitchCoordinator}=require('../src/entity_switch_coordinator');
const {createEntitySwitchHost}=require('../src/entity_switch_host');
const {EntitySwitchRuntime,navigationState,STATE_KEY}=require('../src/entity_switch_runtime');

function descriptor(root,name){return{kind:'character',projectId:'restore-test',ownerFile:path.join(root,name,`${name}.def`),label:name};}
function panel(){return{webview:{posted:[],postMessage(message){this.posted.push(message);return true;},onDidReceiveMessage(){return{dispose(){}}}},onDidDispose(){return{dispose(){}}}};}

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-restore-'));
  try{
    for(const name of ['Ryu','Ken']){fs.mkdirSync(path.join(root,name),{recursive:true});fs.writeFileSync(path.join(root,name,`${name}.def`),'[Files]\n');}
    const coordinator=createEntitySwitchCoordinator(),ryu=coordinator.register(descriptor(root,'Ryu'),{active:true}),ken=coordinator.register(descriptor(root,'Ken'),{pinned:true,retainedState:{cursor:18,draftContent:'must not survive'}});
    assert.throws(()=>coordinator.close(ryu),/active entity cannot be closed/i);
    coordinator.close(ken);
    let snapshot=coordinator.snapshot();assert.deepStrictEqual(snapshot.entities.map(item=>item.identity),[ryu]);assert.deepStrictEqual(snapshot.closedEntities.map(item=>item.identity),[ken]);
    coordinator.restoreClosed(ken);snapshot=coordinator.snapshot();assert.strictEqual(snapshot.entities[0].identity,ken,'restoration preserves the pinned section and prior placement');

    let closeCalls=0,restoreCalls=0;
    const host=createEntitySwitchHost({coordinator,closeEntity:async()=>{closeCalls++;coordinator.close(ken);return{status:'closed'};},restoreEntity:async()=>{restoreCalls++;coordinator.restoreClosed(ken);return{status:'restored'};}}),view=panel();
    host.registerHeader(view,{surfaceId:'observer',observerOnly:true});
    let result=await host.handleMessage(view,{type:header.CLOSE_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});assert.strictEqual(result.status,'closed');assert.strictEqual(closeCalls,1);
    let projection=host.projection();assert.strictEqual(projection.closedEntities.length,1);assert.strictEqual(projection.closedEntities[0].identity,ken);
    result=await host.handleMessage(view,{type:header.RESTORE_MESSAGE,identity:ken,revision:coordinator.snapshot().revision});assert.strictEqual(result.status,'restored');assert.strictEqual(restoreCalls,1);host.dispose();

    assert.deepStrictEqual(navigationState({cursor:4,selection:{line:2},draftContent:'secret',undo:[1],adapterRetainedState:{viewer:{frame:8,pixelDraft:[1,2]}}}),{cursor:4,selection:{line:2},adapterRetainedState:{viewer:{frame:8}}},'closed persistence retains navigation/view/selection, never edit payloads');
    const poisoned=JSON.parse('{"cursor":2,"__proto__":{"polluted":true}}');assert.deepStrictEqual(navigationState(poisoned),{cursor:2});assert.strictEqual({}.polluted,undefined);

    const resource=path.join(root,'Ken','states.cns');fs.writeFileSync(resource,'[Statedef 0]\n');
    const updates=[],listeners=new Set(),registry={subscribeRegistry(listener){listeners.add(listener);listener([]);return{dispose(){listeners.delete(listener);}}}},workspaceState={get(){return null;},update(key,value){updates.push([key,value]);}},vscode={Uri:{file:fsPath=>({fsPath})},workspace:{workspaceFolders:[{uri:{fsPath:root}}],textDocuments:[],getWorkspaceFolder(){return this.workspaceFolders[0];}},window:{showOpenDialog:async()=>[]}},context={workspaceState,subscriptions:[]};
    const runtime=new EntitySwitchRuntime(vscode,context,{registry});
    const entries=[{type:'character',ownerDef:path.join(root,'Ryu','Ryu.def'),label:'Ryu',files:[path.join(root,'Ryu','Ryu.def')]},{type:'character',ownerDef:path.join(root,'Ken','Ken.def'),label:'Ken',files:[path.join(root,'Ken','Ken.def'),resource]}];for(const listener of listeners)listener(entries);
    const runtimeSnapshot=runtime.coordinator.snapshot(),runtimeKen=runtimeSnapshot.entities.find(item=>item.label==='Ken').identity;runtime.coordinator.retain(runtimeKen,{cursor:31,draftContent:'not an edit backup'});
    let outcome=await runtime.closeEntity({identity:runtimeKen});assert.strictEqual(outcome.status,'closed');
    const persisted=updates.filter(([key])=>key===STATE_KEY).at(-1)[1];assert.strictEqual(persisted.closedEntities.length,1);assert.deepStrictEqual(persisted.closedEntities[0].retainedState,{cursor:31});
    fs.unlinkSync(resource);outcome=await runtime.restoreEntity({identity:runtimeKen});assert.strictEqual(outcome.status,'unavailable');assert.match(outcome.reason,/resource is unavailable/i);assert.strictEqual(runtime.coordinator.snapshot().closedEntities[0].supported,false,'failed revalidation stays truthfully unavailable in every header');
    fs.writeFileSync(resource,'[Statedef 0]\n');outcome=await runtime.restoreEntity({identity:runtimeKen});assert.strictEqual(outcome.status,'restored');assert(runtime.coordinator.snapshot().entities.some(item=>item.identity===runtimeKen));runtime.dispose();

    assert.match(header.html(),/Restore Closed Entity/);assert.match(header.clientScript(),/Close Entity/);assert.match(header.clientScript(),/edits are never restored/);
    console.log('Restore Closed Entity revalidates resources, preserves order/pins, and retains navigation state without claiming edits');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
