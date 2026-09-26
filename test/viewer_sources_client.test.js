'use strict';
const assert=require('assert'),vm=require('vm');
const {html}=require('../src/viewer_sources');
const elements=new Map(),messages=[];let saved;const listeners=[];const receive=event=>listeners.forEach(listener=>listener(event));
function node(){return{value:'',checked:false,children:[],classList:{toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},scrollIntoView(){}};}
function element(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);}
const main={scrollTop:0,scrollLeft:0},tabs=[{...node(),dataset:{file:'0'}}];
const context={acquireVsCodeApi:()=>({getState:()=>({follow:true,locationsExpanded:true,positions:{0:{top:500,left:120,line:25}}}),setState:state=>saved=state,postMessage:m=>messages.push(m)}),document:{getElementById:element,querySelector:()=>main,querySelectorAll:()=>tabs,createElement:node,createTextNode:text=>({text})},addEventListener:(name,callback)=>{if(name==='message')listeners.push(callback);}};
const script=html('C:/char.def',['C:/constants.cns'],'test').match(/<script nonce="test">([\s\S]*)<\/script>/)[1];
vm.runInNewContext(script,context);
assert.strictEqual(messages[0].restorePosition,true,'startup asks to restore the saved reading position even with Follow enabled');
assert.strictEqual(element('follow').checked,true);
assert.strictEqual(element('locations').open,true,'restore source-location disclosure');
element('locations').open=false;element('locations').ontoggle();assert.strictEqual(saved.locationsExpanded,false);
const text=Array.from({length:100},(_,i)=>'line '+i).join('\n');
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text,sourceFingerprint:'displayed-fingerprint',status:'Read-only',jump:false}});
assert.strictEqual(element('filename').textContent,'C:/constants.cns','full source path remains available in the disclosure');assert.strictEqual(element('code').children.length,100);assert.strictEqual(main.scrollTop,500);assert.strictEqual(main.scrollLeft,120);
element('code').children[40].children[0].onclick();assert.strictEqual(messages.at(-1).line,40,'clicking a source line selects that exact pin/relink target');
element('pinExample').onclick();assert.strictEqual(messages.at(-1).type,'pinExample');assert.strictEqual(messages.at(-1).line,40);assert.strictEqual(messages.at(-1).sourceFingerprint,'displayed-fingerprint');
receive({data:{type:'examples',items:[{id:'one',label:'Stop movement',scope:'shared',fileLabel:'common.zss',status:'changed',detail:'Review source',excerpt:'velSet{x: 0}'}]}});assert.strictEqual(element('exampleCount').textContent,'(1)');assert.strictEqual(element('exampleList').children.length,1,'personal example cards render in the existing source surface');
main.scrollTop=720;main.scrollLeft=140;main.onscroll();
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text:text+'\nunsaved change',status:'Unsaved source',jump:false}});
assert.strictEqual(main.scrollTop,720);assert.strictEqual(main.scrollLeft,140);assert.strictEqual(element('code').children.length,101);
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text:'',status:'Source unavailable',error:true}});
assert.strictEqual(element('code').children.length,0,'failure clears stale source rows');assert(element('editor').disabled);
main.scrollTop=0;main.scrollLeft=0;main.onscroll();assert.strictEqual(saved.positions[0].top,720,'empty unavailable panel must not overwrite the reading position');
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text,status:'Recovered'}});
assert.strictEqual(element('code').children.length,100);assert.strictEqual(element('editor').disabled,false);assert.strictEqual(main.scrollTop,720);assert.strictEqual(saved.positions[0].left,140);
tabs[0].onclick();assert.strictEqual(messages.at(-1).restorePosition,false,'explicit file selection still requests a follow jump');
console.log('Pinned source client preserves reading position on updates and clears stale rows until recovery');

const fresh={...context,acquireVsCodeApi:()=>({getState:()=>({}),setState(){},postMessage:m=>messages.push(m)})};
vm.runInNewContext(script,fresh);assert.strictEqual(messages.at(-1).restorePosition,false,'a fresh pinned view follows the selected move when no reading position exists');
