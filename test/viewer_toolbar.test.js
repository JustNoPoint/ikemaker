'use strict';
const assert=require('assert');
const toolbar=require('../src/viewer_toolbar');
(async()=>{
  assert.deepStrictEqual(toolbar.read('air').order.slice(0,5),['sff','air','snd','source','game']);
  assert(toolbar.read('air').hidden.includes('compare'));
  assert(toolbar.read('air').hidden.includes('backup'));
  assert(!toolbar.read('air').hidden.includes('air'));
  const normalized=toolbar.normalize({order:['snd','snd','unknown','air'],hidden:['game','unknown','game']});
  assert.deepStrictEqual(normalized.order,['snd','air','back','forward','back-source','used-by','related','sff','source','pinned','compare','game','versus','training','backup','autosave']);
  assert.deepStrictEqual(normalized.hidden,['game']);
  let data={},writes=0;
  const storage={get:()=>data,async update(key,value){await new Promise(resolve=>setTimeout(resolve,5));data=value;writes++;}};
  toolbar.configure({globalState:storage});
  const makePanel=()=>({messages:[],webview:{postMessage(message){this.owner.messages.push(message);return true;}},onDidDispose(callback){this.dispose=callback;}});
  const first=makePanel(),second=makePanel(),third=makePanel();for(const panel of [first,second,third])panel.webview.owner=panel;
  await toolbar.handle({type:'viewerToolbarReady',surface:'air'},first);
  await toolbar.handle({type:'viewerToolbarReady',surface:'snd'},second);
  await toolbar.handle({type:'viewerToolbarReady',surface:'air'},third);
  await Promise.all([
    toolbar.handle({type:'viewerToolbarSave',surface:'air',preferences:{order:['snd'],hidden:['game']}},first),
    toolbar.handle({type:'viewerToolbarSave',surface:'snd',preferences:{order:['air'],hidden:['training']}},second)
  ]);
  assert.strictEqual(writes,2);
  assert.deepStrictEqual(data['air:simple'].hidden,['game']);assert.deepStrictEqual(data['snd:simple'].hidden,['training']);
  assert(third.messages.some(message=>message.saved&&message.preferences.hidden.includes('game')),'same-viewer peers receive persisted preferences');
  assert(!second.messages.some(message=>message.preferences.hidden.includes('game')),'different viewer layouts stay independent');
  toolbar.configure({globalState:storage});
  assert.strictEqual(toolbar.read('air').order[0],'snd','preferences survive reinitialization');
  assert(toolbar.controlsHtml('air').includes('&quot;game&quot;'),'initial HTML includes saved preferences without waiting for a message');
  third.dispose();const previous=third.messages.length;
  await toolbar.handle({type:'viewerToolbarSave',surface:'air',preferences:{}},first);
  assert.deepStrictEqual(toolbar.read('air'),toolbar.normalize({}),'reset restores all commands and their default order');
  assert.strictEqual(third.messages.length,previous,'disposed panels are not updated');
  toolbar.configure({globalState:{get:()=>data,update:async()=>{throw new Error('Storage unavailable');}}});
  await toolbar.handle({type:'viewerToolbarSave',surface:'air',preferences:{hidden:['source']}},first);
  assert.strictEqual(first.messages.at(-1).type,'viewerToolbarError');
  assert.deepStrictEqual(toolbar.read('air').hidden,[],'failed save must retain previous settings');
  assert.strictEqual(await toolbar.handle({type:'unrelated'},first),false);
  assert.doesNotThrow(()=>new Function(toolbar.clientScript()));
  await toolbar.handle({type:'viewerToolbarReady',surface:'air',mode:'workspace'},first);assert.equal(first.messages.at(-1).mode,'workspace');assert.deepStrictEqual(first.messages.at(-1).preferences.hidden,[]);
  await toolbar.handle({type:'viewerToolbarReady',surface:'air',mode:'simple'},first);assert.equal(first.messages.at(-1).mode,'simple');
  console.log('Toolbar persistence, isolation, ordering, reset, concurrent saves and failure tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
