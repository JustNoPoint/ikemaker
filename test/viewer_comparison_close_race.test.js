'use strict';
const assert=require('assert'),Module=require('module');
(async()=>{
  let choice='pin',saved,hold=false,releaseWrite,writeCount=0,lateRenders=0,disposeCallback;
  const store={async read(){},async write(kind,value){writeCount++;if(hold)await new Promise(resolve=>{releaseWrite=resolve;});saved=value;}};
  const panel={disposed:false,webview:{_html:'',onDidReceiveMessage(fn){this.receive=fn;},set html(value){if(panel.disposed)lateRenders++;this._html=value;},get html(){return this._html;}},onDidDispose(fn){disposeCallback=fn;},reveal(){},dispose(){if(this.disposed)return;this.disposed=true;disposeCallback?.();}};
  const original=Module._load;
  Module._load=function(request,parent,main){if(parent?.filename.endsWith('viewer_comparison.js')){
    if(request==='./viewer_comparison_store')return{createStore:()=>store};
    if(request==='vscode')return{commands:{executeCommand:async()=>{}},ViewColumn:{Beside:2},window:{registerWebviewPanelSerializer(){return{dispose(){}};},showQuickPick:async items=>items.find(item=>item.action===choice),showInformationMessage(){},showWarningMessage(){},createWebviewPanel:()=>panel}};
    if(request==='./snd_reader')return{readSnd:()=>({entries:[{group:0,index:0},{group:1,index:1}]}),soundDataUri:()=> 'data:audio/wav;base64,AQID'};
  }return original.call(this,request,parent,main);};
  try{
    const comparison=require('../src/viewer_comparison');comparison.registerComparison({storageUri:{fsPath:'temporary-close-race-storage'},subscriptions:[]});
    await comparison.openComparison('a.snd','snd',{group:0,number:0});choice='compare';await comparison.openComparison('b.snd','snd',{group:1,number:1});
    const beforeWrites=writeCount;hold=true;const first=panel.webview.receive({type:'swap'}),second=panel.webview.receive({type:'swap'}),closing=panel.webview.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'close'});
    await Promise.resolve();assert.strictEqual(writeCount,beforeWrites+1,'repeated swap while busy persists only once');assert.strictEqual(panel.disposed,false,'Close waits for the pending persisted swap');
    releaseWrite();await Promise.all([first,second,closing]);assert(panel.disposed,'Close disposes after the pending swap settles');assert(saved&&saved.primary&&saved.reference,'Close preserves the persisted comparison pair');assert.strictEqual(lateRenders,0,'pending swap never renders after disposal');
    console.log('Comparison busy-swap and Close ordering prevents duplicate writes and late disposed-panel renders');
  }finally{Module._load=original;}
})().catch(error=>{console.error(error);process.exitCode=1;});
