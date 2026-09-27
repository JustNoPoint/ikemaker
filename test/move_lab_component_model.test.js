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
 const cnsItems=model.components.filter(item=>item.filename===cns),zssItem=model.components.find(item=>item.filename===zss);
 assert.strictEqual(cnsItems.length,2);assert.notStrictEqual(cnsItems[0].id,cnsItems[1].id,'multiple HitDefs in one StateDef remain distinct');
 assert(cnsItems.every(item=>item.owner?.kind==='state'&&/200/.test(item.owner.signature||item.owner.title)),'owning StateDef is retained only as context');
 assert.strictEqual(zssItem.owner?.kind,'function');assert.match(zssItem.owner?.signature||'',/SharedAttack/);assert.strictEqual(zssItem.diagnostics.length,1);
 const reference=componentReference(zssItem,defPath);assert.strictEqual(validComponentReference(reference,model,defPath),zssItem,'full exact identity validates');
 for(const mutation of [{rangeHash:'stale'},{sourceHash:'stale'},{line:reference.line+1},{index:reference.index+1},{filename:cns},{owner:{...reference.owner,signature:'Other()'}}])assert.strictEqual(validComponentReference({...reference,...mutation},model,defPath),null,'stale or ambiguous direct identity is rejected');
 fs.writeFileSync(zss,'// inserted\n'+fs.readFileSync(zss,'utf8'));const changed=directComponentModel(assets,[],diagnostics);assert.strictEqual(validComponentReference(reference,changed,defPath),null,'source insertion invalidates the displayed reference');
 console.log('Direct Move Lab components keep exact CNS/ZSS controller identity and reject stale references');
}finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
