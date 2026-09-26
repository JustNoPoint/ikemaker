'use strict';
const assert=require('assert'),fs=require('fs/promises'),path=require('path'),os=require('os'),Module=require('module');
const {createStore}=require('../src/viewer_comparison_store');
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ikemen-comparison-'));
 const original=Module._load;let choice='pin',serializer,choices;
 function panel(){let dispose;return{viewColumn:3,webview:{onDidReceiveMessage(fn){this.receive=fn;}},onDidDispose(fn){dispose=fn;},reveal(){this.revealed=true;},dispose(){this.disposed=true;dispose?.();}};}
 const window={showQuickPick:async items=>{choices=items;return items.find(i=>i.action===choice);},showInformationMessage(){},showWarningMessage(message){throw Error(message);},createWebviewPanel:panel,registerWebviewPanelSerializer(type,value){serializer=value;return{dispose(){}};}};
 Module._load=function(request,parent,main){if(parent?.filename.endsWith('viewer_comparison.js')){
  if(request==='vscode')return{window,ViewColumn:{Beside:2}};
  if(request==='./snd_reader')return{readSnd:()=>({entries:[{group:1,index:2},{group:3,index:4}]}),soundDataUri:(_,item)=>'data:audio/wav;base64,'+(item.group===1?'AQID':'BAUG')};
 }return original.call(this,request,parent,main);};
 function fresh(){delete require.cache[require.resolve('../src/viewer_comparison')];const comparison=require('../src/viewer_comparison');comparison.registerComparison({storageUri:{fsPath:directory},subscriptions:[]});return comparison;}
 try{
  let comparison=fresh();await comparison.openComparison('first.snd','snd',{group:1,number:2});choice='compare';const first=await comparison.openComparison('second.snd','snd',{group:3,number:4});
  const initial=await createStore(path.join(directory,'viewer-comparisons')).read('snd');assert.strictEqual(initial.reference.media,'data:audio/wav;base64,AQID');assert.strictEqual(initial.primary.selection.group,3);
  comparison=fresh();const restored=panel();await serializer.deserializeWebviewPanel(restored,{kind:'snd'});assert.match(restored.webview.html,/Primary · SND 3,4/);assert.match(restored.webview.html,/Reference · SND 1,2/);assert.match(restored.webview.html,/setState\(\{kind:"snd"\}\)/);
  await restored.webview.receive({type:'swap'});
  comparison=fresh();const swapped=panel();await serializer.deserializeWebviewPanel(swapped,{kind:'snd'});assert.match(swapped.webview.html,/Reference · SND 3,4/);
  choice='pin';await comparison.openComparison('third.snd','snd',{group:1,number:2});assert.match(swapped.webview.html,/Reference · SND 1,2/);
  choice='clear';await comparison.openComparison('unused.snd','snd',{});assert(swapped.disposed);
  comparison=fresh();choice='cancel';await comparison.openComparison('unused.snd','snd',{});assert.deepStrictEqual(choices.map(i=>i.action),['pin'],'cleared reference does not reappear after reload');
  const absent=panel();await serializer.deserializeWebviewPanel(absent,{kind:'snd'});assert(absent.disposed);
  const store=createStore(path.join(directory,'isolated'));await Promise.all([store.write('snd',initial),store.write('snd',undefined)]);assert.strictEqual(await store.read('snd'),undefined,'queued clear wins over earlier save');
  await fs.writeFile(path.join(directory,'isolated','snd.json'),'{broken');await assert.rejects(store.read('snd'));
  assert.throws(()=>store.write('../outside',initial),/Unknown/);
  console.log('Comparison pin, pair, swap, replacement and clear survive module reload with frozen media; corrupt storage rejected');
 }finally{Module._load=original;await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
