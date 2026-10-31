'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const original=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{workspace:{textDocuments:[]}};return original.call(this,request,parent,isMain)};
const {specialistComponentModel}=require('../src/move_lab_component_model');
const {createProjectileEditDraft}=require('../src/projectile_edit_draft');
const {buildProjectileStateAuthorities,validateProjectileStateAuthority}=require('../src/projectile_state_authority');
Module._load=original;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-projectile-state-'));
try{
 const defPath=path.join(root,'Hero.def'),sourcePath=path.join(root,'states.zss'),otherPath=path.join(root,'other.cns');
 const defText='[Files]\nst = states.zss\nst1 = other.cns\n';
 const sourceText='[StateDef 200]\r\nprojectile {\r\n  p1stateno: +500;\r\n  p2stateno: 600;\r\n}\r\n[StateDef 500]\r\nctrl = 0;\r\n';
 const otherText='; [StateDef 500]\n[StateDef 600]\ntype = S\n';
 fs.writeFileSync(defPath,defText);fs.writeFileSync(sourcePath,sourceText);fs.writeFileSync(otherPath,otherText);
 const component=specialistComponentModel({defPath,code:[sourcePath]},[],[]).components.find(item=>item.kind==='projectile');assert(component);
 const draft=createProjectileEditDraft(component,sourceText);assert(draft);
 const records=[{filename:sourcePath,text:sourceText,syntax:'zss',available:true},{filename:otherPath,text:otherText,syntax:'cns',available:true}],tokens=['a'.repeat(48),'b'.repeat(48)];let at=0;
 const context={defPath,defText,defDirty:false,sourceText,sourceDocument:null,assignedSources:[sourcePath,otherPath],sources:records,inventoryComplete:true,generation:9,token:()=>tokens[at++]};
 const built=buildProjectileStateAuthorities(component,draft,context);assert.strictEqual(built.authorities.size,2);assert.strictEqual(built.publicFields.p1stateno.state,500);assert.strictEqual(built.publicFields.p2stateno.state,600);assert.strictEqual(built.publicFields.p1stateno.file,'states.zss');assert.strictEqual(built.publicFields.p2stateno.file,'other.cns');
 const p1=built.authorities.get(tokens[0]),p2=built.authorities.get(tokens[1]);assert(validateProjectileStateAuthority(p1,component,draft,{...context,token:()=>tokens[0]}));assert(validateProjectileStateAuthority(p2,component,draft,{...context,token:()=>tokens[1]}));
 for(const forged of [{...p1,field:'p2stateno'},{...p1,state:600},{...p1,targetStart:p1.targetStart+1},{...p1,generation:8},{...p1,evidence:{...p1.evidence,kind:'hitdef'}}])assert.strictEqual(validateProjectileStateAuthority(forged,component,draft,{...context,token:()=>tokens[0]}),null,'field/state/range/generation/controller forgeries fail closed');
 for(const changed of [{...context,defDirty:true},{...context,assignedSources:[otherPath,sourcePath]},{...context,sources:[records[1],records[0]]},{...context,inventoryComplete:false},{...context,generation:10},{...context,sources:[{...records[0],text:sourceText.replace('+500','+501')},records[1]]},{...context,sources:[records[0],{...records[1],text:otherText.replace('StateDef 600','StateDef 601')}]}])assert.strictEqual(validateProjectileStateAuthority(p1,component,draft,{...changed,token:()=>tokens[0]}),null,'assignment/source/target/inventory drift fails closed');
 const duplicateText=otherText+'[StateDef 500]\ntype = S\n',duplicate=buildProjectileStateAuthorities(component,draft,{...context,sources:[records[0],{...records[1],text:duplicateText}],token:()=>tokens[0]});assert.strictEqual(duplicate.publicFields.p1stateno.available,false);
 const missing=buildProjectileStateAuthorities(component,draft,{...context,sources:[records[0],{...records[1],text:otherText.replace('StateDef 600','StateDef 601')}],token:()=>tokens[0]});assert.strictEqual(missing.publicFields.p2stateno.available,false);
 const dynamicText=sourceText.replace('p1stateno: +500','p1stateno: map(Target)'),dynamicComponent=specialistComponentModel({defPath,code:[sourcePath]},[{fileName:sourcePath,isClosed:false,getText:()=>dynamicText}],[]).components.find(item=>item.kind==='projectile'),dynamicDraft=createProjectileEditDraft(dynamicComponent,dynamicText),dynamic=buildProjectileStateAuthorities(dynamicComponent,dynamicDraft,{...context,sourceText:dynamicText,sources:[{...records[0],text:dynamicText},records[1]],token:()=>tokens[0]});assert.strictEqual(dynamic.publicFields.p1stateno.available,false);
 console.log('Projectile state authority proves exact authored p1/p2 destinations across one complete bounded assignment inventory');
}finally{fs.rmSync(root,{recursive:true,force:true});}
