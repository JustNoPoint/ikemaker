'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const original=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{workspace:{textDocuments:[]}};return original.call(this,request,parent,isMain)};
const {specialistComponentModel}=require('../src/move_lab_component_model');
const {buildStateDestinationSnapshot}=require('../src/exact_state_destination_authority');
const {buildHelperStateAuthority,validateHelperStateAuthority}=require('../src/helper_state_authority');
Module._load=original;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-helper-state-'));
try{
 const defPath=path.join(root,'Hero.def'),zssPath=path.join(root,'states.zss'),cnsPath=path.join(root,'other.cns');
 const defText='[Files]\nst = states.zss\nst1 = other.cns\n';
 const zssText='[StateDef 200]\r\nif time {\r\n  helper { id: 7000; stateno: 500; }\r\n  helper { id: 7000; stateno: 600; }\r\n}\r\n[StateDef 500]\r\nctrl = 0;\r\n';
 const cnsText='[StateDef 300]\r\n[State 300, helper]\r\ntype = Helper\r\nid = 12\r\nstateno = 700\r\n[StateDef 600]\r\ntype = S\r\n[StateDef 700]\r\ntype = A\r\n';
 fs.writeFileSync(defPath,defText);fs.writeFileSync(zssPath,zssText);fs.writeFileSync(cnsPath,cnsText);
 const components=specialistComponentModel({defPath,code:[zssPath,cnsPath]},[],[]).components.filter(item=>item.kind==='helper');assert.strictEqual(components.length,3);
 const records=[{filename:zssPath,text:zssText,syntax:'zss',available:true},{filename:cnsPath,text:cnsText,syntax:'cns',available:true}],assignedSources=[zssPath,cnsPath],stateSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:records}),tokens=['a'.repeat(48),'b'.repeat(48),'c'.repeat(48)];let at=0;
 const base={defPath,defText,defDirty:false,assignedSources,sources:records,inventoryComplete:true,stateSnapshot,generation:11,token:()=>tokens[at++]};
 const built=components.map(component=>buildHelperStateAuthority(component,{...base,sourceText:records.find(item=>path.resolve(item.filename)===path.resolve(component.filename)).text}));
 assert.deepStrictEqual(built.map(item=>item.publicState.state),[500,600,700]);assert.deepStrictEqual(built.map(item=>item.publicState.file),['states.zss','other.cns','other.cns']);
 assert.notStrictEqual(built[0].evidence.handoff.startIndex,built[1].evidence.handoff.startIndex,'repeated Helper IDs retain distinct exact controller ranges');
 for(let index=0;index<components.length;index++){const authority=built[index].authorities.get(tokens[index]),sourceText=records.find(item=>path.resolve(item.filename)===path.resolve(components[index].filename)).text;assert(validateHelperStateAuthority(authority,components[index],{...base,sourceText,token:()=>tokens[index]}));}
 const first=built[0].authorities.get(tokens[0]),firstContext={...base,sourceText:zssText,token:()=>tokens[0]};
 for(const forged of [{...first,state:600},{...first,targetStart:first.targetStart+1},{...first,generation:10},{...first,componentIdentity:'forged'},{...first,evidence:{...first.evidence,handoff:{...first.evidence.handoff,startIndex:first.evidence.handoff.startIndex+1}}}])assert.strictEqual(validateHelperStateAuthority(forged,components[0],firstContext),null,'state/range/generation/component/controller forgeries fail closed');
 for(const changed of [{...firstContext,defDirty:true},{...firstContext,assignedSources:[cnsPath,zssPath]},{...firstContext,inventoryComplete:false},{...firstContext,generation:12},{...firstContext,sourceText:zssText.replace('stateno: 500','stateno: 501')},{...firstContext,sources:[records[0],{...records[1],text:cnsText.replace('StateDef 600','StateDef 601')}],stateSnapshot:null}])assert.strictEqual(validateHelperStateAuthority(first,components[0],changed),null,'dirty, reordered, incomplete, stale, or changed inventories fail closed');
 const unavailable=(text,find=0,sourceRecords=[{...records[0],text},records[1]])=>{fs.writeFileSync(zssPath,text);const component=specialistComponentModel({defPath,code:[zssPath]},[],[]).components.filter(item=>item.kind==='helper')[find];return buildHelperStateAuthority(component,{...base,sourceText:text,sources:sourceRecords,stateSnapshot:buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:sourceRecords}),token:()=>tokens[0]}).publicState.available;};
 const dynamicIdZss=zssText.replace('id: 7000; stateno: 500','id: map(DynamicID); stateno: 500');assert.strictEqual(unavailable(dynamicIdZss),true,'a dynamic ZSS Helper ID does not invalidate an independently exact starting state');
 const dynamicIdCns=cnsText.replace('id = 12','id = 10 + 2'),dynamicCnsRecords=[records[0],{...records[1],text:dynamicIdCns}];fs.writeFileSync(cnsPath,dynamicIdCns);const dynamicCnsComponent=specialistComponentModel({defPath,code:[cnsPath]},[],[]).components.find(item=>item.kind==='helper'),dynamicCns=buildHelperStateAuthority(dynamicCnsComponent,{...base,sourceText:dynamicIdCns,sources:dynamicCnsRecords,stateSnapshot:buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:dynamicCnsRecords}),token:()=>tokens[2]});assert.strictEqual(dynamicCns.publicState.available,true,'a dynamic CNS Helper ID does not invalidate an independently exact starting state');
 assert.strictEqual(unavailable(zssText.replace('stateno: 500','stateno: map(Start)')),false,'dynamic state rejects');
 assert.strictEqual(unavailable(zssText.replace('stateno: 500','stateno: -1')),false,'negative state rejects');
 assert.strictEqual(unavailable(zssText.replace('stateno: 500','stateno: 500; stateno: 501')),false,'duplicate fields reject');
 assert.strictEqual(unavailable(zssText.replace('[StateDef 500]\r\nctrl = 0;\r\n','')),false,'missing destination rejects');
 assert.strictEqual(unavailable(zssText,[0],[records[0],{...records[1],text:cnsText+'[StateDef 500]\r\ntype = S\r\n'}]),false,'duplicate destinations reject');
 console.log('Helper starting-StateDef authority proves exact CNS/ZSS creation ranges and complete assigned destinations');
}finally{fs.rmSync(root,{recursive:true,force:true});}
