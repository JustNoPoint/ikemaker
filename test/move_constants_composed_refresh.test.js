'use strict';

const assert=require('assert'),vm=require('vm');
const moveDraftScript=require('../src/move_constants_drafts').clientScript();
const codeDraftScript=require('../src/move_code_drafts').clientScript();
const overviewScript=require('../src/move_constants_overview').clientScript();

class Element{constructor(id=''){this.id=id;this.dataset={};this.value='';this.hidden=false;this.open=true;this.classList={toggle(){}};}focus(){active=this;}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}scrollIntoView(){}set innerHTML(value){this._html=value;parse(value)}get innerHTML(){return this._html||''}}
const elements={},dynamic=[],listeners={message:[]},microtasks=[],order=[];let active=null;
function add(item){if(item.id)elements[item.id]=item;dynamic.push(item);return item}
function parse(html){for(const match of html.matchAll(/<(button|input|select)[^>]*>/g)){const source=match[0],id=/\sid="([^"]+)"/.exec(source),item=add(new Element(id?.[1]||''));for(const data of source.matchAll(/data-([a-z-]+)="([^"]*)"/g))item.dataset[data[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=data[2];const value=/value="([^"]*)"/.exec(source);if(value)item.value=value[1]}}
for(const id of ['moveOverview','overviewDrawer','problems'])add(new Element(id));
elements.fields={before(item){elements[item.id]=item;}};
const document={body:{},get activeElement(){order.push('capture-focus');return active},set activeElement(value){active=value},getElementById:id=>elements[id]||null,createElement:()=>({setAttribute(){},append(){}}),querySelectorAll(selector){if(selector==='.category'||selector==='.code-section'||selector==='[data-apply]')return[];const found=/^\[data-([a-z-]+)\]$/.exec(selector);if(!found)return[];const key=found[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return dynamic.filter(item=>item.dataset[key]!==undefined)}};
const window={addEventListener(type,callback,capture=false){(listeners[type]||=[]).push({callback,capture})}};
function dispatch(data){for(const item of listeners.message.filter(item=>item.capture))item.callback({data});for(const item of listeners.message.filter(item=>!item.capture))item.callback({data});while(microtasks.length){order.push('microtask');microtasks.shift()();}}
let state={moveFormDrafts:{},moveCodeDrafts:{}},sent=[];
const section={stableId:'a.zss:move-state:200',filename:'A.zss',kind:'move-state',signature:'200',sourceHash:'code-hash',text:'state source',startLine:0,endLine:3};
const sourceMove={id:'normal.lp',prefix:'normal.LP',values:{damage:30},fields:[{suffix:'damage',present:true}],timeline:{actionNumber:200,frames:[{},{}]},codeSections:[section],problems:[]};
const targetMove={id:'normal.mp',prefix:'normal.MP',values:{damage:50},fields:[{suffix:'damage',present:true}],timeline:{actionNumber:210,frames:[{},{},{}]},codeSections:[],problems:[]};
const context={console,document,window,order,queueMicrotask:callback=>microtasks.push(callback),saved:{},model:{files:{defPath:'C:/Ryu.def'},formDrafts:{},codeDrafts:{},moves:[sourceMove,targetMove],overview:{constantProfiles:[{id:'normal.mp',prefix:'normal.MP',moveID:210,sourceFilename:'C:/constants.zss',sourceHash:'constants-hash',supported:true}],controllers:[],problems:[]}},move:sourceMove,frame:0,draft:{},profileDrafts:{'shared#damage':{value:12,revision:1}},vscode:{getState:()=>state,setState:value=>state=value,postMessage:message=>sent.push(message)},$:id=>document.getElementById(id),esc:value=>String(value??''),render(){},renderTimeline(){},renderHeader(){},draw(){},saveState(){},Number,String,Object,Array,Set,Math,JSON};context.globalThis=context;
vm.createContext(context);vm.runInContext(moveDraftScript+codeDraftScript,context);
vm.runInContext(`function selectMove(id,legacy,requestedFrame=0){move=model.moves.find(item=>item.id===id)||model.moves[0];frame=Math.max(0,Math.min((move.timeline?.frames?.length||1)-1,Number(requestedFrame)||0));draft=moveDrafts.select(legacy)};window.addEventListener('message',event=>{if(event.data.type==='model'){order.push('core-model');moveDrafts.stage();const keep=move.id,keepFrame=frame;model=event.data.model;selectMove(keep,undefined,keepFrame)}else if(event.data.type==='moveLabSelect'){order.push('core-select');selectMove(event.data.reference.profileId,undefined,event.data.reference.frameIndex)}});`,context);
vm.runInContext(`draft={damage:40};moveDrafts.stage();codeDraftStore.stage(model.moves[0].codeSections[0],'edited state');`,context);
vm.runInContext(overviewScript,context);vm.runInContext('moveOverviewUi.render();',context);elements.moveOverview.onclick();
const profileButton=document.querySelectorAll('[data-overview-profile]')[0];assert(profileButton);profileButton.onclick();assert.strictEqual(sent.at(-1).type,'overviewProfile');
const refreshed={...context.model,moves:[{...sourceMove,values:{damage:30}},{...targetMove}],formDrafts:{},codeDrafts:{}};
elements.overviewSearch.focus();dispatch({type:'model',model:refreshed});dispatch({type:'moveLabSelect',reference:{profileId:'normal.mp',prefix:'normal.MP',frameIndex:2}});
assert(order.indexOf('capture-focus')<order.indexOf('core-model'),'capture listener runs before the existing model listener');
assert(order.indexOf('core-model')<order.indexOf('microtask'),'focus restoration runs after the existing model listener');
assert.strictEqual(context.move.id,'normal.mp');assert.strictEqual(context.frame,2,'same-panel profile navigation retains an exact nonzero frame');
assert.strictEqual(state.moveFormDrafts['c:/ryu.def#normal.lp'].damage.value,40,'model refresh and profile navigation retain the source move draft');
assert.strictEqual(vm.runInContext('codeDraftStore.hasDrafts()',context),true,'model refresh and profile navigation retain the connected-code draft');
assert.strictEqual(context.profileDrafts['shared#damage'].value,12,'pending shared-value drafts survive composed refresh ordering');
console.log('Composed Move Constants refresh orders capture/model/microtask correctly and preserves real draft stores through profile navigation');
