'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/air_viewer.js'),'utf8');
function extract(name,next){const start=source.indexOf('function '+name+'(');assert(start>=0);return source.slice(start,source.indexOf('function '+next+'(',start));}
const calls=[],ctx=Object.fromEntries(['save','restore','translate','scale','rotate','setLineDash','fillRect','strokeRect'].map(name=>[name,(...args)=>calls.push([name,...args])]));
const frame={x:80,y:-30,flags:'HV',scaleX:2,scaleY:.5,angle:90};
const sandbox={ctx,canvas:{width:400,height:300,getBoundingClientRect:()=>({left:10,top:20,width:200,height:150})},panX:3,panY:4,zoom:2,current:()=>frame,document:{getElementById:()=>({checked:true})},edit:{selectedSet:new Set([0]),boxes:[[10,-20,30,0]]}};
vm.runInNewContext(extract('drawBoxes','drawDepthBand'),sandbox);
sandbox.drawBoxes(sandbox.edit.boxes,'#ff0000',frame);
assert.deepStrictEqual(calls.find(c=>c[0]==='translate'),['translate',203,154]);
assert.deepStrictEqual(calls.find(c=>c[0]==='scale'),['scale',2,2]);
assert.deepStrictEqual(calls.find(c=>c[0]==='strokeRect'),['strokeRect',10,-20,20,20]);
// Mouse conversion includes CSS/canvas scaling, zoom and pan, but no sprite transform.
vm.runInNewContext(extract('localPoint','boxHit'),sandbox);
assert.deepStrictEqual(Array.from(sandbox.localPoint({clientX:121.5,clientY:77})),[10,-20]);
calls.length=0;
vm.runInNewContext(extract('drawHandles','draw'),sandbox);
sandbox.drawHandles(frame);
assert.deepStrictEqual(calls.filter(c=>c[0]==='fillRect'),[['fillRect',219,110,8,8],['fillRect',259,110,8,8],['fillRect',259,150,8,8],['fillRect',219,150,8,8]]);
// Runtime collision transforms remain explicit options, independent of AIR art flags.
calls.length=0;sandbox.drawBoxes(sandbox.edit.boxes,'#ff0000',frame,{scale:[2,3],angle:45});
assert.deepStrictEqual(calls.filter(c=>c[0]==='scale'),[['scale',2,2],['scale',2,3]]);
assert.strictEqual(calls.find(c=>c[0]==='rotate')[1],Math.PI/4);
console.log('AIR collision drawing, handles and mouse coordinates ignore sprite-only offsets/flips');
