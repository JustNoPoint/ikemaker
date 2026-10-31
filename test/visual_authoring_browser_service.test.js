'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path');
const {COMMAND,VIEW_TYPE,exactOpenRequest,createVisualAuthoringBrowserHost}=require('../src/visual_authoring_browser_service');

function visualModel(){return{generation:1,binding:'bound',scope:{id:'all',label:'Backgrounds',ordinal:0,total:1},scopes:[{id:'all',label:'Backgrounds'}],browser:{binding:'bound',kinds:['sprite'],rows:[{id:'row',ordinal:0,label:'Floor',description:'sprite 0,0',kind:'sprite',thumbnailKey:'',actions:[]}],total:1,truncated:false},selection:{rowIds:['row'],anchorId:'row'},thumbnails:{}};}
function fakePanel(specification={}){const messages=[],disposals=[];return{specification,viewColumn:1,reveals:0,disposed:false,webview:{cspSource:'vscode-webview://test',options:{},html:'',posted:[],postMessage(message){this.posted.push(message);return Promise.resolve(true);},onDidReceiveMessage(listener){messages.push(listener);return{dispose(){}}}},reveal(){this.reveals+=1;},onDidDispose(listener){disposals.push(listener);return{dispose(){}}},dispose(){if(this.disposed)return;this.disposed=true;disposals.forEach(listener=>listener());},async emit(message){let result=false;for(const listener of messages)result=await listener(message);return result;}};}

(async()=>{
  assert.deepStrictEqual(exactOpenRequest({surface:'stage',ownerKey:'D:/stage.def'}),{surface:'stage',ownerKey:'D:/stage.def'});
  assert.strictEqual(exactOpenRequest({surface:'stage',ownerKey:'D:/stage.def',rows:[]}),null,'command callers cannot inject browser state');
  const commands=new Map(),executed=[],panels=[],serializers=new Map(),infos=[],warnings=[],subscriptions=[],stored=new Map(),tracked=[];
  const api={ViewColumn:{Active:1},commands:{registerCommand(id,handler){commands.set(id,handler);return{dispose(){commands.delete(id)}}},executeCommand:async id=>executed.push(id)},window:{createWebviewPanel(viewType,title,column,options){const panel=fakePanel({viewType,title,column,options});panels.push(panel);return panel;},registerWebviewPanelSerializer(type,serializer){serializers.set(type,serializer);return{dispose(){serializers.delete(type)}}},showInformationMessage(message){infos.push(message);},showWarningMessage(message){warnings.push(message);}}};
  const context={workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)},subscriptions};
  const minimum=[];
  const host=createVisualAuthoringBrowserHost(api,context,{trackViewerPanel:panel=>{tracked.push(panel);return panel;},protectHtml:html=>'PROTECTED:'+html,waitForRestoreSettled:async()=>{},minimumWidthFactory:(_panel,_commands,width)=>{const state={width,began:0,requested:0};minimum.push(state);return{beginOpening(){state.began+=1;},request(){state.requested+=1;},endFloating(){},handle(){return true;}};}});
  assert.strictEqual(host.command,COMMAND);assert.strictEqual(host.viewType,VIEW_TYPE);assert.strictEqual(commands.has(COMMAND),true);assert.strictEqual(serializers.has(VIEW_TYPE),true);assert.strictEqual(subscriptions.includes(host),true);
  assert.strictEqual(await commands.get(COMMAND)({surface:'stage',ownerKey:'missing'}),undefined);assert.strictEqual(infos.length,0,'a well-shaped but unattached owner reaches the authoritative service instead of silently opening stale data');
})().catch(error=>{if(!/not registered/.test(String(error?.message||error)))throw error;}).then(async()=>{
  // Build a fresh host after proving that unattached owners are rejected.
  const commands=new Map(),executed=[],panels=[],serializers=new Map(),infos=[],warnings=[],subscriptions=[],stored=new Map(),tracked=[];
  const api={ViewColumn:{Active:1},commands:{registerCommand(id,handler){commands.set(id,handler);return{dispose(){commands.delete(id)}}},executeCommand:async id=>executed.push(id)},window:{createWebviewPanel(viewType,title,column,options){const panel=fakePanel({viewType,title,column,options});panels.push(panel);return panel;},registerWebviewPanelSerializer(type,serializer){serializers.set(type,serializer);return{dispose(){serializers.delete(type)}}},showInformationMessage(message){infos.push(message);},showWarningMessage(message){warnings.push(message);}}};
  const context={workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)},subscriptions};
  const host=createVisualAuthoringBrowserHost(api,context,{trackViewerPanel:panel=>{tracked.push(panel);return panel;},protectHtml:html=>'PROTECTED:'+html,waitForRestoreSettled:async()=>{},minimumWidthFactory:()=>({beginOpening(){},request(){},endFloating(){},handle(){return true;}})});
  host.registerOwner({surface:'stage',ownerKey:'D:/stage.def',label:'Stage',getModel:visualModel});
  const opening=commands.get(COMMAND)({surface:'stage',ownerKey:'D:/stage.def'});await Promise.resolve();await Promise.resolve();
  assert.strictEqual(panels.length,1);assert.strictEqual(tracked[0],panels[0]);assert.strictEqual(panels[0].specification.viewType,VIEW_TYPE);assert.match(panels[0].webview.html,/^PROTECTED:/);
  const sessionId=host.snapshot('stage','D:/stage.def').sessionId;await panels[0].emit({type:'visualBrowserReady',sessionId});await opening;
  assert.deepStrictEqual(executed,['workbench.action.moveEditorToNewWindow']);
  assert(panels[0].webview.posted.some(message=>message.type==='visualBrowserModel'&&message.browser.rows[0].label==='Floor'));
  await host.publish('stage','D:/stage.def');
  assert.strictEqual(host.snapshot('stage','D:/stage.def').model.selection.anchorId,'row');

  const duplicate=fakePanel();await serializers.get(VIEW_TYPE).deserializeWebviewPanel(duplicate,{version:1,surface:'stage',ownerKey:'D:/stage.def',open:true,floating:false,preferences:{query:'',kind:'',view:'list'}});
  assert.strictEqual(duplicate.disposed,true,'serializer never creates a second panel/session for one owner key');
  const invalid=fakePanel();await serializers.get(VIEW_TYPE).deserializeWebviewPanel(invalid,{rows:[{id:'injected'}]});assert.strictEqual(invalid.disposed,true,'invalid or row-bearing restore state is discarded');

  host.dispose();assert.strictEqual(commands.has(COMMAND),false);assert.strictEqual(serializers.has(VIEW_TYPE),false);assert.strictEqual(panels[0].disposed,true);
  const extension=fs.readFileSync(path.join(__dirname,'..','src','extension.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
  assert.match(extension,/visual_authoring_browser_service'\)\.register\(context, vscode\)/,'extension activation initializes the singleton before visual workspaces register');
  assert(manifest.activationEvents.includes('onCommand:'+COMMAND));assert(manifest.contributes.commands.some(command=>command.command===COMMAND));
  console.log('Visual authoring browser production service registration and serializer tests passed');
}).catch(error=>{console.error(error);process.exitCode=1;});
