'use strict';

const assert=require('assert');
const path=require('path');
const runtimeModule=require('../src/entity_switch_runtime');

function panel(){const listeners=[];return{webview:{posted:[],postMessage(message){this.posted.push(message);return true;},onDidReceiveMessage(){return{dispose(){}}}},onDidDispose(listener){listeners.push(listener);return{dispose(){}}},dispose(){for(const listener of listeners)listener();}};}
const owner=name=>path.resolve(`C:/Game/chars/${name}/${name}.def`);

(async()=>{
  const updates=[],registryListeners=new Set(),registry={subscribeRegistry(listener){registryListeners.add(listener);listener([]);return{dispose(){registryListeners.delete(listener);}}}},workspaceState={get(){return null;},update(key,value){updates.push([key,value]);}},vscode={Uri:{file:fsPath=>({fsPath})},workspace:{workspaceFolders:[{uri:{fsPath:path.resolve('C:/Game')}}],textDocuments:[{fileName:path.resolve('C:/Game/chars/common.cns'),isDirty:true,isClosed:false}],getWorkspaceFolder(){return this.workspaceFolders[0];}},window:{showOpenDialog:async()=>[]}},context={workspaceState,subscriptions:[]};
  const runtime=new runtimeModule.EntitySwitchRuntime(vscode,context,{registry});
  const entries=[{type:'character',ownerDef:owner('Ryu'),label:'Ryu',files:[owner('Ryu'),path.resolve('C:/Game/chars/common.cns')],draftLease:null},{type:'character',ownerDef:owner('Ken'),label:'Ken',files:[owner('Ken'),path.resolve('C:/Game/chars/common.cns')],draftLease:{owner:'air.viewer'}}];
  for(const listener of registryListeners)listener(entries);
  const snapshot=runtime.coordinator.snapshot();assert.strictEqual(snapshot.entities.length,2);assert(snapshot.entities.every(item=>item.shared),'shared-file badges are derived from exact multi-owner membership');assert(snapshot.entities.every(item=>item.dirty),'native dirty text and viewer draft leases aggregate onto owning entities');assert.match(snapshot.entities[1].detail,/air\.viewer draft/);

  const log=[],first=panel(),second=panel(),factory=()=>({id:'air.viewer',surfaceId:'air.viewer',transferPinned:false,async supports(){return true;},async prepare(){log.push('prepare');return{ok:true,retainedState:{action:4}};},async validate(){return true;},async commit(){log.push('commit');},async rollback(){}});
  runtime.attach(first,{surfaceId:'air.viewer',createAdapter:factory});runtime.attach(second,{surfaceId:'air.viewer',createAdapter:factory});assert.strictEqual(runtime.host.adapters.size,1,'one ordinary viewer adapter owns each synchronized surface');assert.strictEqual(runtime.host.headers.has(second),false,'a second/Transfer-like pane cannot receive a misleading global entity projection');
  first.dispose();assert.strictEqual(runtime.host.adapters.size,1,'closing the canonical viewer promotes a surviving ordinary pane');assert.strictEqual(runtime.host.headers.get(second).observerOnly,false);
  assert(updates.length>0,'entity ordering/pins/retained projection is persisted as UI state');runtime.dispose();
  assert.strictEqual(runtimeModule.classifyDef('x.def','[Camera]\n'), 'stage');assert.strictEqual(runtimeModule.classifyDef('system.def',''), 'screenpack');assert.strictEqual(runtimeModule.classifyDef('ryu.def','[Files]\n'), 'character');
  console.log('Entity switch runtime projects exact contexts, evidence badges, persistence, and one canonical adapter per viewer kind');
})().catch(error=>{console.error(error);process.exitCode=1;});
