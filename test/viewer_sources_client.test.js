'use strict';
const assert=require('assert'),vm=require('vm');
const {html}=require('../src/viewer_sources');
const elements=new Map(),messages=[];let saved;const listeners=[];const receive=event=>listeners.forEach(listener=>listener(event));
function node(){return{value:'',checked:false,children:[],dataset:{},attributes:{},classList:{toggle(){}},setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];},querySelector(selector){return selector==='button'?this.children.find(child=>child&&typeof child==='object'&&typeof child.onclick==='function'):null;},contains(target){return this===target||this.children.some(child=>child&&typeof child==='object'&&child.contains?.(target));},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},scrollIntoView(){},focus(){context.document.activeElement=this;}};}
function element(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);}
const main={scrollTop:0,scrollLeft:0},tabs=[{...node(),dataset:{file:'0'}}];
const context={acquireVsCodeApi:()=>({getState:()=>({follow:true,locationsExpanded:true,positions:{0:{top:500,left:120,line:25}}}),setState:state=>saved=state,postMessage:m=>messages.push(m)}),document:{getElementById:id=>id.startsWith('line-')?element('code').children.find(child=>child.id===id)||null:element(id),querySelector:selector=>selector==='main'?main:null,querySelectorAll:()=>tabs,createElement:node,createTextNode:text=>({text})},addEventListener:(name,callback)=>{if(name==='message')listeners.push(callback);}};
const script=html('C:/char.def',['C:/constants.cns','C:/functions.zss','C:/helpers.zss'],'test').match(/<script nonce="test">([\s\S]*)<\/script>/)[1];
vm.runInNewContext(script,context);
assert.strictEqual(messages[0].restorePosition,true,'startup asks to restore the saved reading position even with Follow enabled');
assert.strictEqual(element('editor').disabled,true,'the editor route waits for an authoritative source response');assert.match(element('editor').title,/Refresh this pinned source/);
assert.strictEqual(element('pinExample').disabled,true,'pinning waits for an authoritative source response');assert.match(element('next').title,/Enter text/);
assert.strictEqual(element('previousFile').disabled,true);assert.strictEqual(element('nextFile').disabled,false);assert.strictEqual(element('fileSlider').disabled,false);assert.strictEqual(element('fileReadout').textContent,'1 of 3 · constants.cns');
element('nextFile').onclick();assert.strictEqual(messages.at(-1).index,1);assert.strictEqual(messages.at(-1).restorePosition,false);assert.strictEqual(element('fileReadout').textContent,'2 of 3 · functions.zss');
element('nextFile').onclick();assert.strictEqual(messages.at(-1).index,2);assert.strictEqual(element('nextFile').disabled,true);const boundaryCount=messages.length;element('nextFile').onclick();assert.strictEqual(messages.length,boundaryCount,'next arrow clamps at the final pinned file');
element('previousFile').onclick();assert.strictEqual(messages.at(-1).index,1);const sliderMessageCount=messages.length;element('fileSlider').value='1';element('fileSlider').oninput();assert.strictEqual(messages.length,sliderMessageCount,'dragging the pinned-source slider previews without opening intermediate files');assert.strictEqual(element('fileReadout').textContent,'1 of 3 · constants.cns');element('fileSlider').onchange();assert.strictEqual(messages.at(-1).index,0);assert.strictEqual(messages.at(-1).restorePosition,true,'slider release restores the saved position for a revisited file');
assert.strictEqual(element('follow').checked,true);
assert.strictEqual(element('locations').open,true,'restore source-location disclosure');
element('locations').open=false;element('locations').ontoggle();assert.strictEqual(saved.locationsExpanded,false);
const text=Array.from({length:100},(_,i)=>'line '+i).join('\n');
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text,sourceFingerprint:'displayed-fingerprint',status:'Read-only',jump:false}});
assert.strictEqual(element('filename').textContent,'C:/constants.cns','full source path remains available in the disclosure');assert.strictEqual(element('code').children.length,100);assert.strictEqual(main.scrollTop,500);assert.strictEqual(main.scrollLeft,120);
assert.strictEqual(element('editor').disabled,false);assert.strictEqual(element('pinExample').disabled,false);element('search').value='line 40';element('search').oninput();assert.strictEqual(element('next').disabled,false,'a matching query enables Next Match');element('search').value='does not exist';element('search').oninput();assert.strictEqual(element('next').disabled,true);assert.match(element('next').title,/No matching lines/);element('search').value='';element('search').oninput();
element('code').children[40].children[0].onclick();assert.strictEqual(messages.at(-1).line,40,'clicking a source line selects that exact pin/relink target');
assert.strictEqual(element('code').children[40].children[0].attributes['aria-current'],'location','the selected source line is exposed without relying on highlight color');
element('pinExample').onclick();assert.strictEqual(messages.at(-1).type,'pinExample');assert.strictEqual(messages.at(-1).line,40);assert.strictEqual(messages.at(-1).sourceFingerprint,'displayed-fingerprint');
receive({data:{type:'examples',items:[{id:'one',label:'Stop movement',scope:'shared',fileLabel:'common.zss',status:'changed',detail:'Review source',excerpt:'velSet{x: 0}'}]}});assert.strictEqual(element('exampleCount').textContent,'(1)');assert.strictEqual(element('exampleList').children.length,1,'personal example cards render in the existing source surface');
receive({data:{type:'examples',items:[]}});assert.strictEqual(element('exampleCount').textContent,'(0)');assert.match(element('exampleList').children[0].textContent,/Pin Current Block/,'an empty personal-example shelf explains the next action');
context.document.activeElement=element('code').children[40].children[0];main.scrollTop=720;main.scrollLeft=140;main.onscroll();
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text:text+'\nunsaved change',status:'Unsaved source',jump:false}});
assert.strictEqual(main.scrollTop,720);assert.strictEqual(main.scrollLeft,140);assert.strictEqual(element('code').children.length,101);
assert.strictEqual(context.document.activeElement,element('code').children[40].children[0],'a synchronous source rerender restores the exact focused line button');
context.document.activeElement=element('search');receive({data:{type:'source',index:0,filename:'C:/constants.cns',text,status:'Read-only',jump:false}});assert.strictEqual(context.document.activeElement,element('search'),'a source rerender never steals focus from another live control');
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text:'',status:'Source unavailable',error:true}});
assert.strictEqual(element('code').children.length,0,'failure clears stale source rows');assert(element('editor').disabled);
main.scrollTop=0;main.scrollLeft=0;main.onscroll();assert.strictEqual(saved.positions[0].top,720,'empty unavailable panel must not overwrite the reading position');
receive({data:{type:'source',index:0,filename:'C:/constants.cns',text,status:'Recovered'}});
assert.strictEqual(element('code').children.length,100);assert.strictEqual(element('editor').disabled,false);assert.strictEqual(main.scrollTop,720);assert.strictEqual(saved.positions[0].left,140);
element('fileSelect').value='1';element('fileSelect').onchange();assert.strictEqual(messages.at(-1).index,1);assert.strictEqual(messages.at(-1).restorePosition,false,'direct file selection follows when the destination has no saved position');
console.log('Pinned source client preserves reading position on updates and clears stale rows until recovery');

const fresh={...context,acquireVsCodeApi:()=>({getState:()=>({}),setState(){},postMessage:m=>messages.push(m)})};
vm.runInNewContext(script,fresh);assert.strictEqual(messages.at(-1).restorePosition,false,'a fresh pinned view follows the selected move when no reading position exists');

const singleElements=new Map(),singleMessages=[];function singleElement(id){if(!singleElements.has(id))singleElements.set(id,node());return singleElements.get(id);}const singleScript=html('C:/char.def',['C:/only.zss'],'single').match(/<script nonce="single">([\s\S]*)<\/script>/)[1];vm.runInNewContext(singleScript,{acquireVsCodeApi:()=>({getState:()=>({}),setState(){},postMessage:message=>singleMessages.push(message)}),document:{getElementById:singleElement,querySelector:selector=>selector==='main'?{scrollTop:0,scrollLeft:0}:null,querySelectorAll:()=>[],createElement:node,createTextNode:text=>({text})},addEventListener(){}});assert(singleElement('previousFile').disabled&&singleElement('nextFile').disabled&&singleElement('fileSlider').disabled,'single-file navigation disables arrows and slider');
