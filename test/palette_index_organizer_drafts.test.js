'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load,stored={},panels=[],supports=new Map();
const workspaceState={get:(key,fallback)=>stored[key]??fallback,update:async(key,value)=>{stored[key]=value;}};
function panel(){const receive=[],dispose=[];const value={onDidDispose:fn=>dispose.push(fn),dispose:()=>dispose.forEach(fn=>fn()),webview:{cspSource:'test:',html:'',messages:[],onDidReceiveMessage:fn=>receive.push(fn),postMessage(message){this.messages.push(message);return true;}}};value.send=message=>receive.forEach(fn=>fn(message));panels.push(value);return value;}
const commands=new Map(),vscode={ViewColumn:{Active:1},window:{createWebviewPanel:()=>panel(),showErrorMessage:message=>{throw Error(message);}},workspace:{getConfiguration:()=>({get:(_,fallback)=>fallback})},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};}},Uri:{file:fsPath=>({fsPath})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;if(request==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:value=>value};if(request==='./viewer_close')return{support:(value,options)=>supports.set(value,options)};if(request==='./launch_controls')return{launchControlsHtml:()=>'',launchControlsClientScript:()=>'',handleLaunchMessage:async()=>false};if(request==='./webview_policy')return{protect:value=>value};return original.call(this,request,parent,main);};
(async()=>{
 const workspace=require('../src/palette_index_organizer_workspace'),{paletteSwatchPng}=require('../src/palette_editor');
 workspace.registerPaletteIndexOrganizer({workspaceState,subscriptions:[]});
 const colors=Array.from({length:256},(_,index)=>index?[255,0,0,255]:[0,0,0,0]),base64=paletteSwatchPng(colors).toString('base64');
 const first=await workspace.openPaletteIndexOrganizer();first.send({type:'dropPngs',items:[{name:'same.png',base64}]});await new Promise(resolve=>setImmediate(resolve));
 first.send({type:'semanticDraft',revision:3,entries:[{id:'255,0,0,255',category:'Clothing / equipment',label:'robe highlight'}]});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(first.webview.messages.at(-1),{type:'semanticDraftStored',revision:3});assert(!supports.get(first).isBusy());await supports.get(first).keepDraft();
 first.dispose();const second=await workspace.openPaletteIndexOrganizer();second.send({type:'dropPngs',items:[{name:'renamed.png',base64}]});await new Promise(resolve=>setImmediate(resolve));
 assert.match(second.webview.html,/robe highlight/,'semantic assignments recover from the exact artwork bytes even when a dropped filename changes');
 assert.match(second.webview.html,/Recovered semantic category/);second.send({type:'discardSemanticDraft'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(second.webview.messages.at(-1),{type:'semanticDraftDiscarded'});
 second.dispose();const third=await workspace.openPaletteIndexOrganizer();third.send({type:'dropPngs',items:[{name:'same.png',base64}]});await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(third.webview.html,/robe highlight/,'explicit discard removes only the exact source draft');
 console.log('Palette organizer semantic drafts survive rerender/reopen by source fingerprint, support close flush, and discard exactly');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=original;});
