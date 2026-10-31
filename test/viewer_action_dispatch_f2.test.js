'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const original=Module._load,executed=[];
const vscode={Uri:{file:fsPath=>({fsPath})},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})},window:{activeTextEditor:undefined,showInformationMessage:()=>{},showErrorMessage:()=>{}},commands:{executeCommand:async(...args)=>executed.push(args)},extensions:{getExtension:()=>({})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main);};
const toolbar=require('../src/viewer_toolbar'),launch=require('../src/launch_controls');
const panel={messages:[],webview:{postMessage(message){panel.messages.push(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};
(async()=>{
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'sff',mode:'workspace'},'C:/game/chars/Ryu/Ryu.sff','sff',panel);
 const valid={type:'viewerToolbarAction',actionId:'command.ikemen.stage.openWorkspace'};
 for(const forged of [
  {...valid,command:'forged'},
  {type:'viewerToolbarAction',actionId:'unknown.action'},
  {type:'viewerToolbarAction',actionId:'x'.repeat(257)},
  Object.assign(Object.create({polluted:true}),valid)
 ])assert.strictEqual(await launch.handleLaunchMessage(forged,'C:/game/chars/Ryu/Ryu.sff','sff',panel),true);
 assert.strictEqual(executed.length,0,'forged catalog traffic executes nothing');
 await launch.handleLaunchMessage(valid,'C:/game/chars/Ryu/Ryu.sff','sff',panel);
 assert.strictEqual(executed.at(-1)[0],'ikemen.stage.openWorkspace','a valid catalog action recovers after rejected traffic');
 const commandOwnedBefore=executed.length;
 await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.ikemen.projectProfile.create'},'C:/game/chars/Ryu/Ryu.sff','sff',panel);
 assert.strictEqual(executed.length,commandOwnedBefore+1,'a registered public command owns its setup and prerequisite handling instead of becoming a generic disabled row');
 assert.strictEqual(executed.at(-1)[0],'ikemen.projectProfile.create');
 await launch.handleLaunchMessage(valid,'C:/game/chars/Ryu/Ryu.sff','sff',panel);
 assert.strictEqual(executed.length,commandOwnedBefore+2,'a valid context-free action remains available after another command-owned action');
 await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.ikemen.commandMovelist.openEditor'},'C:/game/chars/Ryu/Ryu.sff','sff',panel);
 assert.strictEqual(executed.at(-1)[0],'ikemen.commandMovelist.openEditor');assert.strictEqual(executed.at(-1)[1].fsPath,'C:/game/chars/Ryu/Ryu.sff');
 const noSeedPanel={messages:[],webview:{postMessage(message){noSeedPanel.messages.push(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'screenpack',mode:'workspace'},'','screenpack',noSeedPanel);
 const noSeedBefore=executed.length;
 await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.ikemen.commandMovelist.openEditor'},'','screenpack',noSeedPanel);
 assert.strictEqual(executed.length,noSeedBefore,'seed-owned action remains disabled without a proven seed');
 await launch.handleLaunchMessage(valid,'','screenpack',noSeedPanel);
 assert.strictEqual(executed.at(-1)[0],'ikemen.stage.openWorkspace','Stage stays available from Screenpack without inventing a file seed');
 const beforeLegacy=executed.length;
 await launch.handleLaunchMessage({type:'viewerToolbarCommand',command:'ikemen.help.open',seed:false},'', 'sff',panel);
 assert.strictEqual(executed.at(-1)[0],'ikemen.help.open','exact allowlisted restored-webview alias remains compatible');
 await launch.handleLaunchMessage({type:'viewerToolbarCommand',command:'ikemen.help.open',seed:false,extra:true},'', 'sff',panel);
 assert.strictEqual(executed.length,beforeLegacy+1,'forged legacy alias is rejected');
 const legacyForeignPanel={messages:[],webview:{postMessage(message){legacyForeignPanel.messages.push(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'air',mode:'workspace'},'C:/game/chars/Ryu/Ryu.air','air',legacyForeignPanel);
 const legacyOwnerBefore=executed.length;await launch.handleLaunchMessage({type:'viewerToolbarCommand',command:'sff.createNew',seed:false},'C:/game/chars/Ryu/Ryu.air','air',legacyForeignPanel);assert.strictEqual(executed.length,legacyOwnerBefore,'restored foreign viewer cannot bypass direct SFF ownership through the legacy envelope');
 const legacyCodePanel={messages:[],webview:{postMessage(message){legacyCodePanel.messages.push(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'code',mode:'workspace'},'C:/game/chars/Ryu/Ryu.zss','code',legacyCodePanel);
 await launch.handleLaunchMessage({type:'viewerToolbarCommand',command:'sff.createNew',seed:false},'C:/game/chars/Ryu/Ryu.zss','code',legacyCodePanel);assert.strictEqual(executed.at(-1)[0],'sff.createNew','code surface keeps its reviewed direct asset-command exception');
 legacyCodePanel.active=false;vscode.window.activeTextEditor={document:{fileName:'C:/game/chars/Ryu/Ryu.zss',isClosed:false},selection:{isEmpty:true}};
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'code',mode:'workspace'},'C:/game/chars/Ryu/Ryu.zss','code',legacyCodePanel);
 const attachedCodeState=legacyCodePanel.messages.filter(message=>message.type==='viewerToolbarActionState').at(-1).actions.find(item=>item.actionId==='command.zss.toggleLineComment');assert.strictEqual(attachedCodeState.enabled,true,'the inactive header remains usable while its exact connected native editor has focus');
 const attachedBefore=executed.length;await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.zss.toggleLineComment'},'C:/game/chars/Ryu/Ryu.zss','code',legacyCodePanel);assert.strictEqual(executed.length,attachedBefore+1);assert.strictEqual(executed.at(-1)[0],'zss.toggleLineComment');
 vscode.window.activeTextEditor={document:{fileName:'C:/game/chars/Ken/Ken.zss',isClosed:false},selection:{isEmpty:true}};await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.zss.toggleLineComment'},'C:/game/chars/Ryu/Ryu.zss','code',legacyCodePanel);assert.strictEqual(executed.length,attachedBefore+1,'a different native editor cannot dispatch through the retained Ryu header');legacyCodePanel.active=true;
 const editorAction={type:'viewerToolbarAction',actionId:'command.zss.wrap.if'};
 const beforeEditor=executed.length;await launch.handleLaunchMessage(editorAction,'C:/game/chars/Ryu/Ryu.sff','sff',panel);assert.strictEqual(executed.length,beforeEditor,'known text-selection action is disabled in an unrelated asset viewer without a live editor selection');
 vscode.window.activeTextEditor={document:{fileName:'C:/game/chars/Ryu/Ryu.zss',isClosed:false},selection:{isEmpty:false}};
 await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:'sff',mode:'workspace'},'C:/game/chars/Ryu/Ryu.sff','sff',panel);const published=panel.messages.filter(message=>message.type==='viewerToolbarActionState').at(-1).actions.find(item=>item.actionId===editorAction.actionId);assert.strictEqual(published.enabled,true,'live editor selection enables the reviewed text action');
 vscode.window.activeTextEditor.selection={isEmpty:true};await launch.handleLaunchMessage(editorAction,'C:/game/chars/Ryu/Ryu.sff','sff',panel);assert.strictEqual(executed.length,beforeEditor,'dispatch rechecks selection after published availability changes');
 vscode.window.activeTextEditor.selection={isEmpty:false};await launch.handleLaunchMessage(editorAction,'C:/game/chars/Ryu/Ryu.sff','sff',panel);assert.strictEqual(executed.at(-1)[0],'zss.wrap.if','valid live selection recovers after the refusal');
 for(const foreignSurface of ['air','stage','screenpack']){
  const foreignPanel={messages:[],webview:{postMessage(message){foreignPanel.messages.push(message);return true;},onDidReceiveMessage(){return{dispose(){}};}},onDidDispose(){}};
  const foreignSeed=`C:/game/${foreignSurface}/current.def`;
  await launch.handleLaunchMessage({type:'viewerToolbarReady',surface:foreignSurface,mode:'workspace'},foreignSeed,foreignSurface,foreignPanel);
  const ownerBefore=executed.length;await launch.handleLaunchMessage({type:'viewerToolbarAction',actionId:'command.sff.createNew'},foreignSeed,foreignSurface,foreignPanel);assert.strictEqual(executed.length,ownerBefore,`SFF-owned direct action is disabled from an unrelated ${foreignSurface} owner`);
 }
 const client=toolbar.clientScript();assert(client.includes("type:'viewerToolbarAction',actionId:button.dataset.toolbarActionId"));assert(!client.includes("type:'viewerToolbarCommand'"));
 for(const filename of ['code_structure_workspace.js','move_constants_workspace.js']){
  const source=fs.readFileSync(path.join(__dirname,'..','src',filename),'utf8');
  assert.match(source,/if\(message\?\.type==='viewerToolbarAction'\)\{await handleLaunchMessage\([\s\S]*?\);return;\}/,`${filename} routes catalog traffic before its body validator and always returns`);
 }
 console.log('F2 shared action dispatch, strict rejection/recovery, legacy compatibility and approved receiver routing passed');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=original;});
