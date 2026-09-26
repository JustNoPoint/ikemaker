'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load;let release;const picked=new Promise(resolve=>{release=resolve;}),supports=new Map(),errors=[];
const receive=[],dispose=[];
const panel={onDidDispose:fn=>dispose.push(fn),dispose:()=>dispose.forEach(fn=>fn()),webview:{cspSource:'test:',html:'',messages:[],onDidReceiveMessage:fn=>receive.push(fn),postMessage(message){this.messages.push(message);return true;}}};
const vscode={ViewColumn:{Active:1},window:{activeTextEditor:null,createWebviewPanel:()=>panel,showOpenDialog:()=>picked,showErrorMessage:message=>errors.push(message)},commands:{executeCommand:async()=>{}},workspace:{},Uri:{file:fsPath=>({fsPath})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;if(request==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:value=>value};if(request==='./viewer_close')return{support:(value,options)=>supports.set(value,options)};if(request==='./launch_controls')return{launchControlsHtml:()=>'',launchControlsClientScript:()=>'',handleLaunchMessage:async()=>false};if(request==='./webview_policy')return{protect:value=>value};if(request==='./palette_import_assistant')return{inspectImages:files=>files.map(filename=>({filename})),batchSummary:items=>({title:'Checked',detail:'',safeToStage:true,count:items.length})};return original.call(this,request,parent,main);};
(async()=>{
 const workspace=require('../src/palette_import_workspace'),opened=workspace.openPaletteImportWorkspace();
 assert.strictEqual(opened,panel,'the transient preflight returns its panel for lifecycle coordination');
 receive[0]({type:'choose'});await new Promise(resolve=>setImmediate(resolve));
 assert(supports.get(panel).isBusy(),'the native file picker is reported as busy');
 panel.dispose();release([{fsPath:'C:/art/ryu.png'}]);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(panel.webview.messages.length,0,'a delayed picker cannot publish into a disposed preflight panel');
 assert(!supports.get(panel).isBusy(),'busy state is released after cancellation/disposal');
 assert.deepEqual(errors,[]);
 console.log('Palette import preflight is transient, blocks close while choosing, and ignores delayed results after disposal');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=original;});
