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

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-state-transition-'));
try{
 const defPath=path.join(root,'Hero.def'),zssPath=path.join(root,'states.zss'),cnsPath=path.join(root,'other.cns');
 const defText='[Files]\nst = states.zss\nst1 = other.cns\n';
 const zssText='[StateDef 200]\r\n# changeState { value: 999; }\r\nif time { changeState { value: 500; } }\r\nchangeState { value: 500; }\r\nchangeState { value: 600; }\r\n[StateDef 500]\r\nctrl = 0;\r\n';
 const cnsText='[StateDef 300]\r\n[State 300, first]\r\ntype = ChangeState\r\nvalue = 700\r\n[State 300, second]\r\ntype = ChangeState\r\nvalue = 600\r\n[StateDef 600]\r\ntype = S\r\n[StateDef 700]\r\ntype = A\r\n';
 fs.writeFileSync(defPath,defText);fs.writeFileSync(zssPath,zssText);fs.writeFileSync(cnsPath,cnsText);
 const zssComponent=behaviorComponentModel({defPath,code:[zssPath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='200'),cnsComponent=behaviorComponentModel({defPath,code:[cnsPath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='300');assert(zssComponent&&cnsComponent);
 const records=[{filename:zssPath,text:zssText,syntax:'zss',available:true},{filename:cnsPath,text:cnsText,syntax:'cns',available:true}],assignedSources=[zssPath,cnsPath],stateSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:records}),tokens=Array.from({length:8},(_,index)=>(index+1).toString(16).repeat(48));let at=0;
 const base={defPath,defText,defDirty:false,assignedSources,sources:records,inventoryComplete:true,stateSnapshot,generation:15,token:()=>tokens[at++]};
 const zssBuilt=buildStateTransitionAuthorities(zssComponent,{...base,sourceText:zssText});assert.deepStrictEqual(zssBuilt.publicTransitions.items.map(item=>item.state),[500,500,600]);assert.strictEqual(zssBuilt.authorities.size,3);assert.notStrictEqual(zssBuilt.publicTransitions.items[0].occurrence,zssBuilt.publicTransitions.items[1].occurrence,'repeated target values remain occurrence-distinct');
 const cnsBuilt=buildStateTransitionAuthorities(cnsComponent,{...base,sourceText:cnsText});assert.deepStrictEqual(cnsBuilt.publicTransitions.items.map(item=>item.state),[700,600]);assert.strictEqual(cnsBuilt.authorities.size,2);
 for(const [component,built,sourceText]of [[zssComponent,zssBuilt,zssText],[cnsComponent,cnsBuilt,cnsText]])for(const item of built.publicTransitions.items){const authority=built.authorities.get(item.route);assert(validateStateTransitionAuthority(authority,component,{...base,sourceText,token:()=>item.route}));}
 const first=zssBuilt.authorities.get(zssBuilt.publicTransitions.items[0].route),context={...base,sourceText:zssText,token:()=>first.route};for(const forged of [{...first,state:600},{...first,occurrence:'forged'},{...first,controllerStart:first.controllerStart+1},{...first,valueStart:first.valueStart+1},{...first,targetStart:first.targetStart+1},{...first,generation:14}])assert.strictEqual(validateStateTransitionAuthority(forged,zssComponent,context),null,'occurrence/source/target/generation forgeries fail closed');
 function project(text){fs.writeFileSync(zssPath,text);const component=behaviorComponentModel({defPath,code:[zssPath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='200'),changed=[{filename:zssPath,text,syntax:'zss',available:true},records[1]],snapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:changed});return buildStateTransitionAuthorities(component,{...base,sourceText:text,sources:changed,stateSnapshot:snapshot,token:()=>tokens[0]}).publicTransitions.items;}
 assert.strictEqual(project(zssText.replace('value: 500; } }','value: map(Next); } }'))[0].available,false,'dynamic value rejects');
 assert.strictEqual(project(zssText.replace('value: 500; } }','value: -1; } }'))[0].available,false,'negative value rejects');
 assert.strictEqual(project(zssText.replace('value: 500; } }','value: 500; value: 600; } }'))[0].available,false,'duplicate values reject');
 assert.strictEqual(project(zssText.replace('value: 500; } }','redirectID: 1; value: 500; } }'))[0].available,false,'redirected ChangeState rejects');
 assert.strictEqual(project(zssText.replace('[StateDef 500]','[StateDef 501]'))[0].available,false,'missing destination rejects');
 const duplicateRecords=[records[0],{...records[1],text:cnsText+'[StateDef 500]\r\ntype = S\r\n'}],duplicateSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:duplicateRecords});assert.strictEqual(buildStateTransitionAuthorities(zssComponent,{...base,sourceText:zssText,sources:duplicateRecords,stateSnapshot:duplicateSnapshot,token:()=>tokens[0]}).publicTransitions.items[0].available,false,'multiply-defined destination rejects');
 for(const changed of [{...context,defDirty:true},{...context,assignedSources:[cnsPath,zssPath]},{...context,inventoryComplete:false},{...context,generation:16},{...context,sourceText:zssText.replace('value: 500','value: 501')}])assert.strictEqual(validateStateTransitionAuthority(first,zssComponent,changed),null,'dirty, reassigned, incomplete, stale, or changed source rejects');
 console.log('Selected StateDef ChangeState authority preserves exact CNS/ZSS occurrences and unique destinations');
}finally{fs.rmSync(root,{recursive:true,force:true});}
