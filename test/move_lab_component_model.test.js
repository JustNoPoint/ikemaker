'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{workspace:{}};return original.call(this,request,parent,main);};
 const {directComponentModel,componentReference,validComponentReference}=require('../src/move_lab_component_model');
Module._load=original;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-direct-components-'));
try{
 const cns=path.join(root,'normals.cns'),zss=path.join(root,'shared.zss'),defPath=path.join(root,'Hero.def');
 fs.writeFileSync(cns,'[StateDef 200]\n[State 200, first]\ntype = HitDef\ndamage = 10\n[State 200, second]\ntype = HitDef\ndamage = 20\n');
 fs.writeFileSync(zss,'[Function SharedAttack() ret]\n  hitDef {\n    attr: S, NA;\n    damage: 30;\n  }\n');
 const assets={defPath,code:[cns,zss]},diagnostics=[{filename:zss,line:2,character:2,endLine:2,endCharacter:8,severity:1,message:'Review attr',source:'IKEMEN'}];
 const model=directComponentModel(assets,[],diagnostics);
 assert.strictEqual(model.components.length,3,'CNS and ZSS HitDefs are independently discoverable without constants, AIR, or SFF');
 assert.strictEqual(model.behaviors.filter(item=>item.kind==='state').length,1,'the exact assigned CNS StateDef is independently discoverable');
 assert.strictEqual(model.behaviors.filter(item=>item.kind==='function').length,1,'the exact assigned ZSS Function is independently discoverable');
 const state=model.behaviors.find(item=>item.kind==='state'),fn=model.behaviors.find(item=>item.kind==='function');
 assert.match(state.text,/StateDef 200/);assert.match(fn.text,/Function SharedAttack/);assert.strictEqual(fn.diagnostics.length,1,'diagnostics intersecting a behavior block stay attached to that exact block');
 assert.strictEqual(validComponentReference(fn.reference,{components:model.behaviors},defPath),fn,'exact state/function references validate without using a state number as identity');
 const cnsItems=model.components.filter(item=>item.filename===cns),zssItem=model.components.find(item=>item.filename===zss);
 assert.strictEqual(cnsItems.length,2);assert.notStrictEqual(cnsItems[0].id,cnsItems[1].id,'multiple HitDefs in one StateDef remain distinct');
 assert(cnsItems.every(item=>item.owner?.kind==='state'&&/200/.test(item.owner.signature||item.owner.title)),'owning StateDef is retained only as context');
 assert.strictEqual(zssItem.owner?.kind,'function');assert.match(zssItem.owner?.signature||'',/SharedAttack/);assert.strictEqual(zssItem.diagnostics.length,1);
 const reference=componentReference(zssItem,defPath);assert.strictEqual(validComponentReference(reference,model,defPath),zssItem,'full exact identity validates');
 for(const mutation of [{rangeHash:'stale'},{sourceHash:'stale'},{line:reference.line+1},{index:reference.index+1},{filename:cns},{owner:{...reference.owner,signature:'Other()'}}])assert.strictEqual(validComponentReference({...reference,...mutation},model,defPath),null,'stale or ambiguous direct identity is rejected');
 const previousStable=fn.stableId;fs.writeFileSync(zss,'[Function Earlier() ret]\n  return 0;\n// inserted\n'+fs.readFileSync(zss,'utf8'));const changed=directComponentModel(assets,[],diagnostics);assert.strictEqual(validComponentReference(reference,changed,defPath),null,'source insertion invalidates the displayed reference');assert(!changed.behaviors.some(item=>item.stableId===previousStable),'a retained draft cannot follow an ordinal into a different or shifted source block');
 console.log('Direct Move Lab components keep exact CNS/ZSS controller identity and reject stale references');
}finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
