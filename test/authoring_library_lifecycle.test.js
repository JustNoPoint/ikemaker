'use strict';

const assert=require('assert');
const Module=require('module');
const originalLoad=Module._load;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
let receiver,disposeHandler,capabilities=[];
const commands=new Map(),panel={title:'',webview:{html:'',cspSource:'test',onDidReceiveMessage(callback){receiver=message=>callback({generation:panel.ikemenAuthoringGeneration,...message});},postMessage:async()=>true},onDidDispose(callback){disposeHandler=callback;},reveal(){},dispose(){disposeHandler?.();}};
const vscode={ViewColumn:{Active:1},Uri:{file:fsPath=>({fsPath})},commands:{registerCommand(id,callback){commands.set(id,callback);return{};},executeCommand:async()=>{}},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback})},window:{activeTextEditor:null,createWebviewPanel:()=>panel,showErrorMessage:()=>{}}};
const context={globalState:{get:(_key,fallback)=>fallback,update:async()=>{}},subscriptions:[]};
Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./viewer_group')return{preferredViewerColumn:()=>1,trackViewerPanel:value=>value};
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./webview_policy')return{protect:value=>value};
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./map_registry_service')return{current:()=>null};
  return originalLoad.call(this,request,parent,isMain);
};
const library=require('../src/authoring_library');library.register(vscode,context,{capabilities:async()=>{const next=capabilities.shift();return next?.promise||{nightlyStringsEnabled:false,enabledCapabilities:[]};}});

(async()=>{
  await commands.get('ikemen.authoring.openRecipes')();
  const recipesGeneration=panel.ikemenAuthoringGeneration;
  const oldRequest=deferred(),newRequest=deferred();capabilities.push(oldRequest,newRequest);
  const symbols=receiver({type:'view',view:'symbols'}),examples=receiver({type:'view',view:'examples'});
  newRequest.resolve({nightlyStringsEnabled:false,enabledCapabilities:[]});await examples;assert.strictEqual(panel.title,'Example Templates');assert(panel.webview.html.includes('aria-selected="true" tabindex="0" data-view="examples"'));
  oldRequest.resolve({nightlyStringsEnabled:false,enabledCapabilities:[]});await symbols;assert.strictEqual(panel.title,'Example Templates','an older Symbols request cannot overwrite the newer section');
  const stale=await receiver({type:'search',view:'recipes',query:'old recipes',generation:recipesGeneration});assert.strictEqual(stale,false);assert.strictEqual(panel.title,'Example Templates','a delayed search message from the prior rendered page cannot reclaim the panel');

  const afterDispose=deferred();capabilities.push(afterDispose);const pending=receiver({type:'view',view:'favorites'});disposeHandler();const before=panel.webview.html;afterDispose.resolve({nightlyStringsEnabled:false,enabledCapabilities:[]});await pending;assert.strictEqual(panel.webview.html,before,'a disposed panel cannot receive a late async render');
  console.log('Authoring Library request generations prevent stale and post-dispose renders');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
