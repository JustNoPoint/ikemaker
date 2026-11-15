'use strict';
const assert=require('assert'),vm=require('vm'),header=require('../src/entity_header');
function element(){return{children:[],dataset:{},attributes:{},textContent:'',append(...items){this.children.push(...items)},setAttribute(k,v){this.attributes[k]=String(v)},removeAttribute(k){delete this.attributes[k]},querySelectorAll(){return[]},addEventListener(){},scrollIntoView(){}};}
const tabs=element(),slider=element(),search=element(),results=element(),status=element(),open=element(),restore=element(),previous=element(),root=element();
root.querySelector=s=>({'[data-entity-tabs]':tabs,'[data-entity-slider]':slider,'[data-entity-search]':search,'[data-entity-search-results]':results,'[data-entity-status]':status,'[data-entity-previous]':previous}[s]||null);
root.parentElement={querySelector:s=>s==='[data-entity-open]'?open:s==='[data-entity-restore]'?restore:null};
const messages=[],listeners=new Map(),document={querySelector:s=>s==='[data-ikemaker-entity-strip]'?root:s==='[data-entity-tabs]'?tabs:null,createElement:()=>element(),body:element()};
vm.runInNewContext(header.clientScript(),{document,vscode:{postMessage:m=>messages.push(m)},addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},queueMicrotask:fn=>fn(),innerWidth:1000,innerHeight:800});
function state(message){for(const fn of listeners.get('message')||[])fn({data:{type:header.STATE_MESSAGE,revision:1,activeIdentity:'',previousIdentity:'',canOpen:false,entities:[],closedEntities:[],...message}});}
const independent='Independent viewer pane. Use the main viewer header to switch entities.';
state({openUnavailableReason:independent,status:independent});
assert.strictEqual(open.disabled,true);assert.strictEqual(open.attributes['aria-disabled'],'true');assert.strictEqual(open.title,independent);assert.strictEqual(open.attributes['aria-description'],independent);assert.strictEqual(root.hidden,true);
const before=messages.length;open.onclick();assert.strictEqual(messages.length,before,'disabled excluded Open Entity never dispatches an intent');
const pinned='Pinned Transfer pane. Use the main viewer header to switch entities.';state({openUnavailableReason:pinned});assert.strictEqual(open.title,pinned);assert.strictEqual(open.attributes['aria-description'],pinned);
state({revision:2,canOpen:true});assert.strictEqual(open.disabled,false);assert.strictEqual(open.attributes['aria-description'],undefined);assert.match(open.title,/Open another character/);open.onclick();assert.strictEqual(messages.at(-1).type,header.OPEN_MESSAGE,'canonical promotion retains the standard route');
console.log('PASS generated entity header excluded title/ARIA/disabled intents and canonical promotion');
state({revision:3,activeIdentity:'ryu',entities:[{identity:'ryu',label:'Ryu'},{identity:'stage',label:'Training Room'}]});
tabs.clientWidth=100;tabs.scrollWidth=280;
const beforeScroll=messages.length;
slider.value='180';slider.oninput();slider.onchange?.();
assert.strictEqual(tabs.scrollLeft,180);
assert.strictEqual(messages.length,beforeScroll,'dragging and releasing the slider must only scroll');
state({revision:4,activeIdentity:'ryu',entities:[{identity:'ryu',label:'Ryu'},{identity:'stage',label:'Training Room'}]});
assert.strictEqual(tabs.scrollLeft,180,'a refresh of the same entity retains the browsed position');
tabs.children.at(-1).onclick();
assert.strictEqual(messages.at(-1).type,header.SWITCH_MESSAGE);
assert.strictEqual(messages.at(-1).identity,'stage');
