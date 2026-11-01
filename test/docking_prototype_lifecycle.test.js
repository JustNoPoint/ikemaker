'use strict';

const assert=require('assert');
const Module=require('module');
const originalLoad=Module._load;
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};};
let receiver,disposeHandler,updateGate=null,postGate=null,rejectNextPost=false,updates=0,errors=[],information=[];
const messages=[],executed=[],panel={visible:true,webview:{options:{},html:'',onDidReceiveMessage(callback){receiver=callback;},postMessage:async message=>{messages.push(message);if(rejectNextPost){rejectNextPost=false;throw new Error('webview unavailable');}if(postGate){const gate=postGate;postGate=null;await gate.promise;}return true;}},onDidChangeViewState(){},onDidDispose(callback){disposeHandler=callback;},dispose(){disposeHandler?.();}};
const vscode={ViewColumn:{Active:1},commands:{executeCommand:async id=>{executed.push(id);},registerCommand:()=>({})},window:{createWebviewPanel:()=>panel,registerWebviewViewProvider:()=>({}),registerWebviewPanelSerializer:()=>({}),showInformationMessage:async value=>{information.push(value);},showErrorMessage:async value=>{errors.push(value);}}};
const context={subscriptions:[],workspaceState:{get:()=>null,update:async()=>{updates+=1;return updateGate?updateGate.promise:undefined;}}};
Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;if(parent?.filename.endsWith('docking_prototype.js')&&request==='./viewer_group')return{trackViewerPanel:value=>value};return originalLoad.call(this,request,parent,isMain);};
const prototype=require('../src/docking_prototype');

(async()=>{
  prototype.register(context);
  prototype.bindEditorPanel(panel);
  updateGate=deferred();const saving=receiver({type:'saveLayout',layout:{placement:{knowledge:'center'}}});await new Promise(resolve=>setImmediate(resolve));const overlap=await receiver({type:'returnToMainWindow'});assert.strictEqual(overlap,false);assert.strictEqual(executed.length,0);assert(messages.some(message=>/Wait for the current prototype host action/.test(message.status)));
  updateGate.resolve();await saving;assert.strictEqual(information.length,1);assert.match(messages.at(-1).status,/controls are ready/i);

  updateGate=deferred();messages.length=0;const failed=receiver({type:'saveLayout',layout:{}});await new Promise(resolve=>setImmediate(resolve));updateGate.reject(new Error('workspace state unavailable'));await failed;assert.match(messages.at(-1).status,/Prototype action stopped: workspace state unavailable/);assert(!/controls are ready/i.test(messages.at(-1).status));assert.strictEqual(errors.length,1);

  updateGate=null;rejectNextPost=true;const rejected=await receiver({type:'saveLayout',layout:{}});assert.strictEqual(rejected,false,'a rejected initial pending-status post prevents the side effect');const beforeRecovery=updates;assert.strictEqual(await receiver({type:'saveLayout',layout:{}}),true,'initial post rejection releases the single-flight gate for retry');assert.strictEqual(updates,beforeRecovery+1,'only the retry reaches persistence');

  updateGate=deferred();messages.length=0;const informationBeforeAbandon=information.length;const abandoned=receiver({type:'saveLayout',layout:{}});await new Promise(resolve=>setImmediate(resolve));disposeHandler();updateGate.resolve();await abandoned;assert.strictEqual(information.length,informationBeforeAbandon,'disposed prototype does not announce late save success');assert(!messages.some(message=>/controls are ready/i.test(message.status)),'disposed prototype receives no late ready status');

  prototype.bindEditorPanel(panel);updateGate=null;const initialGate=deferred();postGate=initialGate;const beforeDisposedInitial=updates;const disposedBeforeStart=receiver({type:'saveLayout',layout:{}});await new Promise(resolve=>setImmediate(resolve));disposeHandler();initialGate.resolve();assert.strictEqual(await disposedBeforeStart,false,'disposal while the initial pending status is held revokes the action');assert.strictEqual(updates,beforeDisposedInitial,'a disposed initial action never reaches persistence');
  console.log('Docking prototype host actions are schema-bound, single-flight, failure-stable, and disposal-aware');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
