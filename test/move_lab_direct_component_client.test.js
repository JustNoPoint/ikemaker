'use strict';

const assert=require('assert');
const vm=require('vm');
const {clientScript}=require('../src/move_lab_direct_component');

class Element{
 constructor(id=''){this.id=id;this.hidden=false;this.dataset={};this.classList={toggle(){}};}
 set innerHTML(value){this._html=value;for(const match of value.matchAll(/<button[^>]*id="([^"]+)"[^>]*>/g))elements[match[1]]=new Element(match[1]);for(const match of value.matchAll(/<button[^>]*data-direct-problem="([^"]+)"[^>]*>/g)){const item=new Element();item.dataset.directProblem=match[1];dynamic.push(item);}}
 get innerHTML(){return this._html||'';}
 click(){this.onclick?.();}
}
const elements={directWorkspace:new Element('directWorkspace'),moveOverview:new Element('moveOverview'),status:new Element('status'),character:new Element('character'),moveTitle:new Element('moveTitle')},layout=new Element(),dynamic=[],listeners={};
const document={querySelector:selector=>selector==='.layout'?layout:null,querySelectorAll:selector=>selector==='[data-direct-problem]'?dynamic:[],getElementById:id=>elements[id]||null};
let state={moveFormDrafts:{keep:{damage:44}},moveCodeDrafts:{keep:{text:'draft'}},selectedMove:'normal.slp',selectedFrame:3},staged=0,stopped=0,selected=[],headers=0,overview=0;
const sent=[],reference={defPath:'C:/Hero/Hero.def',kind:'hitdef',id:'c:/hero/a.zss#0',filename:'C:/Hero/a.zss',index:0,line:4,endLine:8,sourceHash:'source',rangeHash:'range',owner:null};
const item={...reference,label:'State 200 · HitDef 1',syntax:'zss',fileLabel:'a.zss',sourceText:'hitDef { damage: 30; }',diagnostics:[],reference};
const constantsMove={id:'normal.slp',prefix:'normal.sLP',timeline:{actionNumber:200,frames:[{},{},{},{}]}};
const context={saved:{...state},model:{files:{defPath:reference.defPath,constants:'C:/Hero/constants.zss'},timingSources:{constants:'constants-hash'},moves:[constantsMove],directComponents:[item]},move:constantsMove,frame:3,document,window:{addEventListener(type,fn,capture){(listeners[type]||=[]).push({fn,capture});}},queueMicrotask:fn=>fn(),vscode:{getState:()=>state,setState:value=>state=value,postMessage:message=>sent.push(message)},moveDrafts:{stage:()=>staged++},stop:()=>stopped++,saveState(){staged++;state={...state,selectedMove:context.move?.id,selectedFrame:state.selectedFrame};},selectMove:(id,draft,frame)=>selected.push({id,frame}),moveOverviewUi:{render:()=>overview++},renderHeader:()=>headers++,$:id=>elements[id]||null,esc:value=>String(value??''),Number,String,Object,Array,Math,JSON,console};context.globalThis=context;
vm.createContext(context);vm.runInContext(clientScript(),context);const ui=vm.runInContext('moveDirectUi',context);
ui.select(reference);
assert.strictEqual(context.move,null,'direct selection replaces only the active component view');assert.strictEqual(staged,2,'the current constants draft is staged before selection and state persistence');
assert.strictEqual(layout.hidden,true);assert.match(elements.directWorkspace.innerHTML,/Source inspection/);assert.strictEqual(sent.at(-1).type,'moveIntegrationContext');
assert.deepStrictEqual(state.moveFormDrafts,{keep:{damage:44}});assert.deepStrictEqual(state.moveCodeDrafts,{keep:{text:'draft'}},'component switching preserves existing draft stores');
assert.strictEqual(state.directReturnReference.profileId,'normal.slp');assert.strictEqual(state.directReturnReference.frameIndex,3,'the typed return target survives refresh/reload even while no constants profile is active');assert.strictEqual(ui.modelChanged(),true);assert.deepStrictEqual(state.directComponent,reference);
elements.returnDirectConstants.onclick();assert.deepStrictEqual(selected.at(-1),{id:'normal.slp',frame:3},'returning to constants restores the selected profile and nonzero frame');
ui.select(reference);elements.editDirectHitDef.onclick();assert.strictEqual(sent.at(-1).type,'editDirectComponent');elements.openDirectSource.onclick();assert.strictEqual(sent.at(-1).type,'openDirectComponent');elements.directOverview.onclick();assert.strictEqual(overview>0,true);
const beforeInvalidReturn=selected.length;context.model={...context.model,timingSources:{constants:'changed'}};elements.returnDirectConstants.onclick();assert.strictEqual(selected.length,beforeInvalidReturn,'a changed constants return target does not fall back to another profile');assert.match(elements.status.textContent,/changed or was removed/);
assert.strictEqual(headers>0,true);assert.strictEqual(stopped>0,true);
console.log('Direct HitDef component view round-trips mixed constants state without dropping drafts or frame selection');
