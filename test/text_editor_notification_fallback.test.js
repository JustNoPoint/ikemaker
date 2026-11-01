'use strict';
const assert=require('assert');
const groups=require('../src/viewer_group');
const close=require('../src/viewer_close');
async function withoutDismissal(operation){
  let timer;
  try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Informational notification blocked text fallback')),150);})]);}
  finally{clearTimeout(timer);}
}
(async()=>{
  const notices=[],api={window:{showInformationMessage(message){notices.push(message);return new Promise(()=>{});},showWarningMessage(){throw new Error('No discard decision should be requested');}}};
  groups.resetViewerGroupForTests();
  assert.strictEqual((await withoutDismissal(()=>groups.closeViewerGroupForText({},api))).accepted,false,'unmatched origin returns without dismissing its notice');
  const panel={title:'AIR',viewType:'ikemenAirWorkspace',viewColumn:1,active:true,webview:{onDidReceiveMessage(){return{dispose(){}};},postMessage(){return false;}},onDidDispose(){},onDidChangeViewState(){},reveal(){},dispose(){throw new Error('Protected viewer must remain open');}};
  const group={viewColumn:1,tabs:[{label:'AIR',input:{viewType:'ikemenAirWorkspace'}},{label:'Unrelated',input:{viewType:'other.viewer'}}]};
  groups.configureViewerTopology(()=>({all:[group],active:group}));groups.trackViewerPanel(panel);
  assert.strictEqual((await withoutDismissal(()=>groups.closeViewerGroupForText(panel,api,{admittedFiles:['C:/character/test.def']}))).accepted,false,'mixed visual group keeps all tabs and immediately permits native fallback');
  close.support(panel,{isBusy:()=>true});
  assert.strictEqual(await withoutDismissal(()=>close.prepare([panel],api)),false,'busy notice does not suspend the caller');
  close.support(panel,{});
  assert.strictEqual(await withoutDismissal(()=>close.prepare([panel],api)),false,'unresponsive viewer notice does not suspend the caller');
  assert.strictEqual(notices.length,4);groups.resetViewerGroupForTests();
  console.log('Text fallback proceeds while unmatched, mixed-group, busy and unavailable-viewer notices remain visible');
})().catch(error=>{console.error(error);process.exitCode=1;});
