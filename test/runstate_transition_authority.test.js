'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const original=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{workspace:{textDocuments:[]}};return original.call(this,request,parent,isMain)};
const {behaviorComponentModel}=require('../src/move_lab_component_model');
const {buildStateDestinationSnapshot}=require('../src/exact_state_destination_authority');
const {buildStateTransitionAuthorities,validateStateTransitionAuthority}=require('../src/state_transition_authority');
Module._load=original;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-runstate-transition-'));
try{
 const defPath=path.join(root,'Hero.def'),sourcePath=path.join(root,'states.zss'),cnsPath=path.join(root,'states.cns'),defText='[Files]\nst = states.zss\nst1 = states.cns\n';
 const sourceText='[StateDef 200]\r\n# runState { value: 999; }\r\nrunState { value: 500; }\r\nrunState { value: 500; }\r\nchangeState { value: 600; }\r\n[StateDef 500]\r\nctrl = 0;\r\n';
 const cnsText='[StateDef 300]\r\n[State 300, run]\r\ntype = RunState\r\nvalue = 500\r\n[StateDef 600]\r\ntype = S\r\n';
 fs.writeFileSync(defPath,defText);fs.writeFileSync(sourcePath,sourceText);fs.writeFileSync(cnsPath,cnsText);
 const component=behaviorComponentModel({defPath,code:[sourcePath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='200'),cnsComponent=behaviorComponentModel({defPath,code:[cnsPath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='300');assert(component&&cnsComponent);
 const records=[{filename:sourcePath,text:sourceText,syntax:'zss',available:true},{filename:cnsPath,text:cnsText,syntax:'cns',available:true}],assignedSources=[sourcePath,cnsPath],stateSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:records}),nightly={target:{channel:'nightly',buildId:'nightly-exact'},enabledCapabilities:['zss.run-state']},base={defPath,defText,defDirty:false,assignedSources,sources:records,inventoryComplete:true,stateSnapshot,generation:21,sourceText,capabilities:nightly};let sequence=0;
 const built=buildStateTransitionAuthorities(component,{...base,token:()=>((sequence++%15)+1).toString(16).repeat(48)});assert.deepStrictEqual(built.publicTransitions.items.map(item=>item.label),['RunState','RunState','ChangeState']);assert.deepStrictEqual(built.publicTransitions.items.map(item=>item.state),[500,500,600]);assert.notStrictEqual(built.publicTransitions.items[0].occurrence,built.publicTransitions.items[1].occurrence,'repeated RunState targets remain occurrence-distinct');
 const runItem=built.publicTransitions.items[0],authority=built.authorities.get(runItem.route);assert(authority.capabilityFingerprint);assert(validateStateTransitionAuthority(authority,component,{...base,token:()=>runItem.route}));
 const stable=buildStateTransitionAuthorities(component,{...base,capabilities:{target:{channel:'stable',version:'1.0'},enabledCapabilities:[]},token:()=> 'a'.repeat(48)});assert.deepStrictEqual(stable.publicTransitions.items.map(item=>item.label),['ChangeState'],'Stable 1.0 omits RunState rows entirely');
 const contradictory=buildStateTransitionAuthorities(component,{...base,capabilities:{target:{channel:'stable',version:'1.0'},enabledCapabilities:['zss.run-state']},token:()=> 'a'.repeat(48)});assert.deepStrictEqual(contradictory.publicTransitions.items.map(item=>item.label),['ChangeState'],'stable target plus contradictory capability cannot expose RunState');
 for(const capabilities of [{enabledCapabilities:['zss.run-state']},{target:{channel:'nightly'},enabledCapabilities:['zss.run-state']},{target:{channel:'nightly',buildId:'nightly-exact'},enabledCapabilities:[]}])assert.deepStrictEqual(buildStateTransitionAuthorities(component,{...base,capabilities,token:()=> 'a'.repeat(48)}).publicTransitions.items.map(item=>item.label),['ChangeState'],'unverified or missing capability omits RunState rows');
 assert.deepStrictEqual(buildStateTransitionAuthorities(cnsComponent,{...base,sourceText:cnsText,capabilities:nightly,token:()=> 'a'.repeat(48)}).publicTransitions.items,[],'CNS RunState is outside this Nightly ZSS slice');
 function firstRun(text){fs.writeFileSync(sourcePath,text);const current=behaviorComponentModel({defPath,code:[sourcePath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='200'),changed=[{filename:sourcePath,text,syntax:'zss',available:true},records[1]],snapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:changed});return buildStateTransitionAuthorities(current,{...base,sourceText:text,sources:changed,stateSnapshot:snapshot,capabilities:nightly,token:()=> 'b'.repeat(48)}).publicTransitions.items.find(item=>item.label==='RunState');}
 for(const [before,after]of [['value: 500','value: map(Next)'],['value: 500','value: -1'],['value: 500','value: 500; value: 600'],['value: 500','redirectID: 2; value: 500'],['value: 500','playerNo: 2; value: 500']])assert.strictEqual(firstRun(sourceText.replace(before,after)).available,false,`${after} fails closed`);
 assert.strictEqual(firstRun(sourceText.replace('[StateDef 500]','[StateDef 501]')).available,false,'missing RunState destination fails closed');
 assert.strictEqual(validateStateTransitionAuthority(authority,component,{...base,capabilities:{target:{channel:'stable',version:'1.0'},enabledCapabilities:[]},token:()=>runItem.route}),null,'capability change revokes a prior RunState route');
 console.log('Verified-Nightly RunState routes remain exact, ZSS-only, capability-bound, and invisible on Stable 1.0');
}finally{fs.rmSync(root,{recursive:true,force:true});}
