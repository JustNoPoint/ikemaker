'use strict';

const assert=require('assert');
const Module=require('module');
const originalLoad=Module._load;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
let receiver,disposeHandler,heldCapability=null,heldInsert=null,updates=0,throwMaps=false,throwInsert=false,capabilityCalls=0,failCapabilityAt=Infinity;
const messages=[],commands=new Map(),panel={title:'',webview:{html:'',cspSource:'test',onDidReceiveMessage(callback){receiver=message=>callback({generation:panel.ikemenAuthoringGeneration,...message});},postMessage:async message=>{messages.push(message);return true;}},onDidDispose(callback){disposeHandler=callback;},reveal(){},dispose(){disposeHandler?.();}};
const vscode={ViewColumn:{Active:1},Uri:{file:fsPath=>({fsPath})},commands:{registerCommand(id,callback){commands.set(id,callback);return{};},executeCommand:async id=>{if(id==='ikemen.maps.openBrowser'&&throwMaps)throw new Error('maps unavailable');if(id==='ikemen.authoring.insertCatalogItem'){if(throwInsert)throw new Error('insert unavailable');if(heldInsert)return heldInsert.promise;}}},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback})},window:{activeTextEditor:null,createWebviewPanel:()=>panel,showWarningMessage:()=>{},showErrorMessage:()=>{}}};
const context={globalState:{get:(_key,fallback)=>fallback,update:async()=>{updates+=1;}},subscriptions:[]};
Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./viewer_group')return{preferredViewerColumn:()=>1,trackViewerPanel:value=>value};
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./webview_policy')return{protect:value=>value};
  return originalLoad.call(this,request,parent,isMain);
};
const library=require('../src/authoring_library');library.register(vscode,context,{capabilities:async()=>{capabilityCalls+=1;if(capabilityCalls===failCapabilityAt)throw new Error('capability refresh unavailable');return heldCapability?heldCapability.promise:{nightlyStringsEnabled:false,enabledCapabilities:[]};}});

(async()=>{
  await commands.get('ikemen.authoring.openRecipes')();
  heldCapability=deferred();const action=receiver({type:'favorite',id:'standard.recipe.normal.basic'});await new Promise(resolve=>setImmediate(resolve));
  const overlappingView=await receiver({type:'view',view:'examples'});assert.strictEqual(overlappingView,false,'View cannot replace the model while a body action is pending');assert.strictEqual(panel.title,'Recipe Library');
  heldCapability.resolve({nightlyStringsEnabled:false,enabledCapabilities:[]});heldCapability=null;await action;assert.strictEqual(updates,1);

  throwMaps=true;messages.length=0;await receiver({type:'maps'});const terminal=messages.filter(message=>message.type==='libraryBusy').at(-1);assert.match(terminal.status,/Action stopped: maps unavailable/);assert(!/controls are ready/i.test(terminal.status),'failure guidance is not immediately overwritten by generic ready text');throwMaps=false;

  failCapabilityAt=capabilityCalls+2;messages.length=0;const beforeNested=updates;await receiver({type:'favorite',id:'standard.recipe.normal.basic'});const nestedTerminal=messages.filter(message=>message.type==='libraryBusy').at(-1);assert.strictEqual(updates,beforeNested+1,'favorite itself succeeds before its optional current-view refresh');assert.match(nestedTerminal.status,/Could not open this Authoring Library section: capability refresh unavailable/);assert(!/controls are ready/i.test(nestedTerminal.status),'nested rerender failure remains the terminal status');failCapabilityAt=Infinity;

  await receiver({type:'openRecipe',id:'standard.recipe.normal.basic'});const section=[...panel.ikemenAuthoringRenderedItemIds].find(id=>id.startsWith('standard.recipe.normal.basic.section.'));assert(section,'recipe detail exposes an exact insertable section');const beforeFailedInsert=updates;throwInsert=true;await receiver({type:'insert',id:section});throwInsert=false;assert.strictEqual(updates,beforeFailedInsert,'failed insertion never creates a false Recent entry');

  heldInsert=deferred();const abandoned=receiver({type:'insert',id:section});await new Promise(resolve=>setImmediate(resolve));const before=updates;disposeHandler();heldInsert.resolve();heldInsert=null;await abandoned;assert.strictEqual(updates,before,'disposing the exact panel while insertion is held prevents a false Recent entry');
  console.log('Authoring Library body actions serialize against views, retain terminal errors, and revoke on disposal');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
