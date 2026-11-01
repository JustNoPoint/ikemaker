'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const original=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{workspace:{textDocuments:[]}};return original.call(this,request,parent,isMain)};
const {behaviorComponentModel}=require('../src/move_lab_component_model');
const {MAX_INCOMING_PER_STATE,buildStateDestinationSnapshot}=require('../src/exact_state_destination_authority');
const {buildStateTransitionAuthorities,validateStateTransitionAuthority}=require('../src/state_transition_authority');
Module._load=original;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-incoming-state-'));
try{
 const defPath=path.join(root,'Hero.def'),zssPath=path.join(root,'states.zss'),cnsPath=path.join(root,'other.cns'),defText='[Files]\nst = states.zss\nst1 = other.cns\n';
 const zssText='[StateDef 100]\r\n# changeState { value: 500; }\r\nchangeState { value: 500; }\r\nif time { changeState { value: 500; } }\r\n[StateDef 101]\r\nchangeState { value: map(Next); }\r\nchangeState { value: 500; value: 501; }\r\nchangeState { redirectID: 2; value: 500; }\r\n[StateDef 500]\r\nctrl = 0;\r\n[StateDef 900]\r\nctrl = 0;\r\n';
 const cnsText='[StateDef 200]\r\n[State 200, exact]\r\ntype = ChangeState\r\nvalue = 500\r\n[State 200, duplicate]\r\ntype = ChangeState\r\nvalue = 500\r\nvalue = 501\r\n[State 200, dynamic]\r\ntype = ChangeState\r\nvalue = var(0)\r\n';
 fs.writeFileSync(defPath,defText);fs.writeFileSync(zssPath,zssText);fs.writeFileSync(cnsPath,cnsText);
 const selected=behaviorComponentModel({defPath,code:[zssPath]},[],[]).components.find(item=>item.kind==='state'&&item.signature==='500');assert(selected);
 const records=[{filename:zssPath,text:zssText,syntax:'zss',available:true},{filename:cnsPath,text:cnsText,syntax:'cns',available:true}],assignedSources=[zssPath,cnsPath],snapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:records});
 assert.strictEqual(snapshot.incomingChangeStates['500'].total,3,'only exact, unredirected, uniquely-valued classic ChangeState occurrences enter the reverse index');
 assert.strictEqual(new Set(snapshot.incomingChangeStates['500'].items.map(item=>item.occurrence)).size,3,'repeated targets remain occurrence-distinct');
 let sequence=0;const base={defPath,defText,defDirty:false,assignedSources,sources:records,inventoryComplete:true,stateSnapshot:snapshot,generation:31,sourceText:zssText,token:()=>String(++sequence).padStart(48,'0')};
 const built=buildStateTransitionAuthorities(selected,base);assert.strictEqual(built.publicIncoming.available,true,built.publicIncoming.reason);assert.strictEqual(built.publicIncoming.total,3);assert.strictEqual(built.publicIncoming.omitted,0);assert.deepStrictEqual(built.publicIncoming.items.map(item=>item.fromState),[100,100,200]);assert.strictEqual(built.authorities.size,3);
 for(const item of built.publicIncoming.items){const authority=built.authorities.get(item.route);assert.strictEqual(authority.schema,'ikemaker.incoming-state-route');assert.strictEqual(authority.targetPath===zssPath||authority.targetPath===cnsPath,true);assert(validateStateTransitionAuthority(authority,selected,{...base,token:()=>item.route}));}
 const firstItem=built.publicIncoming.items[0],first=built.authorities.get(firstItem.route),validation={...base,token:()=>first.route};
 for(const forged of [{...first,originOwnerState:999},{...first,occurrence:'forged'},{...first,controllerStart:first.controllerStart+1},{...first,valueStart:first.valueStart+1},{...first,destinationStart:first.destinationStart+1},{...first,targetStart:first.targetStart+1},{...first,generation:32}])assert.strictEqual(validateStateTransitionAuthority(forged,selected,validation),null,'incoming source, destination, occurrence, and generation forgeries fail closed');
 const driftedZss=zssText.replace('changeState { value: 500; }','changeState { value: 501; }'),driftedRecords=[{...records[0],text:driftedZss},records[1]],driftedSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:driftedRecords});assert.strictEqual(validateStateTransitionAuthority(first,selected,{...validation,sources:driftedRecords,stateSnapshot:driftedSnapshot,sourceText:driftedZss}),null,'origin source drift revokes the route');
 const duplicateRecords=[records[0],{...records[1],text:cnsText+'[StateDef 500]\r\ntype = S\r\n'}],duplicateSnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources,sources:duplicateRecords}),duplicate=buildStateTransitionAuthorities(selected,{...base,sources:duplicateRecords,stateSnapshot:duplicateSnapshot,token:()=> 'a'.repeat(48)});assert.strictEqual(duplicate.publicIncoming.available,false);assert.match(duplicate.publicIncoming.reason,/more than once/);
 const stable=buildStateTransitionAuthorities(selected,{...base,capabilities:{target:{channel:'stable',version:'1.0'},enabledCapabilities:[]},token:()=> 'b'.repeat(48)}),nightly=buildStateTransitionAuthorities(selected,{...base,capabilities:{target:{channel:'nightly',buildId:'exact'},enabledCapabilities:['zss.run-state']},token:()=> 'c'.repeat(48)});assert.deepStrictEqual(stable.publicIncoming.items.map(item=>[item.fromState,item.file,item.line]),nightly.publicIncoming.items.map(item=>[item.fromState,item.file,item.line]),'classic incoming ChangeState indexing is identical on Stable 1.0 and verified Nightly');
 const many='[StateDef 1]\n'+Array.from({length:MAX_INCOMING_PER_STATE+44},()=> 'changeState { value: 500; }').join('\n')+'\n[StateDef 500]\nctrl = 0;\n',manySnapshot=buildStateDestinationSnapshot({inventoryComplete:true,assignedSources:[zssPath],sources:[{filename:zssPath,text:many,syntax:'zss',available:true}]});assert.strictEqual(manySnapshot.incomingChangeStates['500'].total,MAX_INCOMING_PER_STATE+44);assert.strictEqual(manySnapshot.incomingChangeStates['500'].items.length,MAX_INCOMING_PER_STATE,'the reverse index retains a bounded per-StateDef route set');
 console.log('Incoming ChangeState references remain exact, bounded, occurrence-distinct, and source-navigable across CNS and ZSS');
}finally{fs.rmSync(root,{recursive:true,force:true});}
