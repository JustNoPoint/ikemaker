'use strict';
const assert=require('assert'),Module=require('module');
(async()=>{
 let fail=false,saved,choice='pin',choices,created=0,warnings=[];
 const store={async read(){},async write(kind,value){if(fail)throw Error('Disk full');saved=value;}};
 const panel={webview:{onDidReceiveMessage(fn){this.receive=fn;}},onDidDispose(fn){this.disposeCallback=fn;},reveal(){},dispose(){this.disposed=true;this.disposeCallback();}};
 const original=Module._load;
 Module._load=function(request,parent,main){if(parent?.filename.endsWith('viewer_comparison.js')){
  if(request==='./viewer_comparison_store')return{createStore:()=>store};
  if(request==='vscode')return{ViewColumn:{Beside:2},window:{registerWebviewPanelSerializer(){return{dispose(){}};},showQuickPick:async items=>{choices=items;return items.find(i=>i.action===choice);},showInformationMessage(){},showWarningMessage(m){warnings.push(m);},createWebviewPanel(){created++;return panel;}}};
  if(request==='./snd_reader')return{readSnd:()=>({entries:[{group:0,index:0},{group:1,index:1}]}),soundDataUri:()=> 'data:audio/wav;base64,AQID'};
 }return original.call(this,request,parent,main);};
 try{
  const comparison=require('../src/viewer_comparison');comparison.registerComparison({storageUri:{fsPath:'temporary-test-storage'},subscriptions:[]});
  fail=true;await assert.rejects(comparison.openComparison('a.snd','snd',{group:0,number:0}),/Disk full/);
  choice='cancel';await comparison.openComparison('a.snd','snd',{});assert.deepStrictEqual(choices.map(i=>i.action),['pin'],'failed pin is not advertised as a saved reference');
  fail=false;choice='pin';await comparison.openComparison('a.snd','snd',{group:0,number:0});
  fail=true;choice='compare';await assert.rejects(comparison.openComparison('b.snd','snd',{group:1,number:1}),/Disk full/);assert.strictEqual(created,0,'failed comparison does not open a misleading pair');
  fail=false;await comparison.openComparison('b.snd','snd',{group:1,number:1});const previous=panel.webview.html,previousSaved=saved;
  fail=true;await panel.webview.receive({type:'swap'});assert.strictEqual(panel.webview.html,previous);assert.strictEqual(saved,previousSaved);assert.match(warnings[0],/previous pair is unchanged/);
  choice='pin';await assert.rejects(comparison.openComparison('b.snd','snd',{group:1,number:1}),/Disk full/);assert.strictEqual(panel.webview.html,previous);
  choice='clear';await assert.rejects(comparison.openComparison('b.snd','snd',{}),/Disk full/);assert(!panel.disposed);
  fail=false;await comparison.openComparison('b.snd','snd',{});assert(panel.disposed);assert.strictEqual(saved,undefined);
  console.log('Failed pin, compare, swap, replacement and clear preserve previous visible/saved comparison; retry succeeds');
 }finally{Module._load=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
