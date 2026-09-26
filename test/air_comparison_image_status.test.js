'use strict';
const assert=require('assert'),vm=require('vm');
const comparison=require('../src/viewer_animation_comparison'),visual=require('../src/air_visual'),playback=require('../src/air_playback');
(async()=>{
 const blank=comparison.build('[Begin Action 1]\n-1,0,0,0,1\n9,9,0,0,1',1,{sprites:[]},()=>{throw Error('blank frames must not request images');});
 assert.deepStrictEqual(blank.missing,['9,9']);
 const action=comparison.build('[Begin Action 2]\n0,0,0,0,1\n-1,0,0,0,1\n9,9,0,0,-1',2,{sprites:[{group:0,number:0,width:4,height:6,axisX:0,axisY:0}]},()=> 'invalid image');
 const elements=new Map(),buttons=[{dataset:{play:'0'}},{dataset:{play:'1'}}];
 const ctx=Object.fromEntries(['clearRect','fillRect','save','translate','scale','beginPath','moveTo','lineTo','stroke','restore','strokeRect'].map(n=>[n,()=>{}]));
 function element(id){if(!elements.has(id))elements.set(id,{checked:false,value:0,getContext:()=>ctx});return elements.get(id);}
 const sandbox={acquireVsCodeApi:()=>({postMessage(){},setState(){}}),document:{hidden:false,getElementById:element,querySelectorAll:()=>buttons},performance:{now:()=>0},requestAnimationFrame(){},Image:class{set src(value){this.onerror();}}};
 const run=vm.runInNewContext('('+comparison.client.toString()+')',sandbox);
 run([{animation:action},{animation:action}],playback,comparison.bounds,visual);
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(element('status-0').textContent,/Could not decode sprite 0,0/);
 assert(buttons.every(b=>b.disabled===false),'failed image does not leave playback disabled forever');
 element('tick').value=1;element('seek').onclick();assert.match(element('status-0').textContent,/Blank frame/);assert(!/Missing/.test(element('status-0').textContent));
 element('tick').value=2;element('seek').onclick();assert.match(element('status-0').textContent,/Missing sprite 9,9/);
 element('reset').onclick();assert.strictEqual(element('tick').value,'0','Reset updates the shared tick input');assert.match(element('status-1').textContent,/Could not decode sprite 0,0/);
 console.log('Actual AIR comparison client distinguishes blank, missing and failed image decode without blocking controls');
})().catch(error=>{console.error(error);process.exitCode=1;});
