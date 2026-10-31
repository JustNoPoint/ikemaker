'use strict';

const assert = require('assert');
const vm = require('vm');
const model = require('../src/visual_comparison_preview_model');

const base = {
  slot: 'A', sourceHash: 'hash', screenIdentity: 'screen:select', screenLabel: 'Select',
  profileIdentity: 'p1', profileLabel: 'Player 1', aspect: 'file', width: 640, height: 480,
  guides: true, visibleLayers: [-1, 0, 1], hasPreviewOverrides: false
};
const a = model.screenpackCaptureDescriptor(base);
const b = model.screenpackCaptureDescriptor({...base, slot:'B', profileIdentity:'p2', profileLabel:'Player 2', aspect:'16:9', hasPreviewOverrides:true});
assert.strictEqual(model.screenpackCapturesCompatible(a,b),true,'profile and safe-area differences are intentional comparison dimensions');
assert.strictEqual(model.screenpackCapturesCompatible(a,{...b,screenIdentity:'screen:title'}),false);
assert.throws(()=>model.screenpackCaptureDescriptor({...base,width:8192,height:8192}),/safe bounds/);
assert.throws(()=>model.screenpackCaptureDescriptor({...base,slot:'C'}),/invalid/);

const scenes = [
  {number:2,layers:[{label:'far',offset:[1,2]}]},
  {number:10,layers:[{label:'current',offset:[3,4]}]},
  {number:90,layers:Array.from({length:514},(_,index)=>({label:`next ${index}`,x:index,y:0}))}
];
const plan = model.adjacentSceneOnionPlan(scenes,1,'both',0.9);
assert.strictEqual(plan.opacity,0.75);
assert.strictEqual(plan.previous.sceneNumber,2,'adjacency follows displayed order, not numeric scene arithmetic');
assert.strictEqual(plan.next.sceneNumber,90);
assert.strictEqual(plan.next.layers.length,512);
assert.strictEqual(plan.truncated,true);
assert.strictEqual(model.adjacentSceneOnionPlan(scenes,0,'previous',0.25).previous,null);
assert.deepStrictEqual(model.onionPreferences({mode:'injected',opacity:-10}),{mode:'off',opacity:0.05});
assert.strictEqual(scenes[2].layers.length,514,'planning does not mutate source scenes');

const clientContext={};clientContext.globalThis=clientContext;
vm.runInNewContext(model.clientScript(),clientContext);
const client=clientContext.ikemenVisualComparisonPreview;
assert.ok(client,'the bounded comparison model is available inside webviews');
assert.strictEqual(vm.runInNewContext(`ikemenVisualComparisonPreview.screenpackCapturesCompatible(${JSON.stringify(base)},${JSON.stringify({...base,slot:'B',aspect:'21:9'})})`,clientContext),true);
assert.strictEqual(vm.runInNewContext(`ikemenVisualComparisonPreview.adjacentSceneOnionPlan(${JSON.stringify(scenes)},1,'both',0.25).next.layers.length`,clientContext),512);

console.log('Visual comparison capture and adjacent-scene onion planning tests passed');
