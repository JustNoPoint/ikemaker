'use strict';

const assert = require('assert');
const { launchControlsHtml, launchControlsClientScript } = require('../src/launch_controls');

const controls = launchControlsHtml();
const client = launchControlsClientScript();

assert(controls.includes('aria-label="Related work and IKEMEN launch shortcuts"'));
assert(controls.includes(':focus-visible'));
assert(controls.includes('prefers-reduced-motion'));
assert(controls.includes('forced-colors:active'));
assert(client.includes("querySelectorAll('button')"));
assert(client.includes("button.type='button'"));
assert(client.includes("setAttribute('aria-label'"));
assert(client.includes("querySelectorAll('input,select,textarea')"));
assert(client.includes("querySelectorAll('canvas')"));
assert(client.includes("querySelectorAll('img:not([alt])')"));

// Availability changes must update both the visible hint and accessible name.
const vm = require('vm');
const attributes = new Map();
const back = {textContent:'Back to Source',title:'Open from a reference',disabled:true,
  hasAttribute:key=>attributes.has(key),getAttribute:key=>key==='title'?back.title:attributes.get(key),
  setAttribute:(key,value)=>attributes.set(key,value)};
const receivers=[];const receive=event=>receivers.forEach(handler=>handler(event));
vm.runInNewContext(client, {
  document:{querySelector:()=>null,querySelectorAll:selector=>selector==='[data-ikemen-back-source]'||selector==='button'?[back]:[]},
  addEventListener:(type,handler)=>{if(type==='message')receivers.push(handler);},vscode:{postMessage(){}}
});
receive({data:{type:'viewerSourceAvailable',available:true,label:'moves.zss:12'}});
assert.strictEqual(back.disabled,false);
assert.strictEqual(attributes.get('aria-label'),'Return to moves.zss:12');
receive({data:{type:'viewerSourceAvailable',available:false}});
assert.strictEqual(back.disabled,true);
assert.strictEqual(attributes.get('aria-label'),back.title);

console.log('Webview accessibility foundation tests passed');
