'use strict';

const assert=require('assert');
const path=require('path');
const {hash}=require('../src/mutation_safety');
const {buildProjectileAirAuthorities,validateProjectileAirAuthority}=require('../src/projectile_air_authority');

const defPath=path.resolve('Hero.def'),sourcePath=path.resolve('states.cns'),airPath=path.resolve('Hero.air'),defText='[Files]\nanim = Hero.air\nst = states.cns\n',airText='[Begin Action 600]\n0, 0, 0, 0, 1\n[Begin Action 601]\n1, 0, 0, 0, 1\n[Begin Action 602]\n2, 0, 0, 0, 1\n[Begin Action 603]\n3, 0, 0, 0, 1\n',sourceText='[State 200, shot]\ntype = Projectile\nprojanim = 600\nprojhitanim = 601\nprojremanim = 602\nprojcancelanim = 603';
const component={kind:'projectile',filename:sourcePath,startLine:0,endLine:5,sourceHash:hash(sourceText),rangeHash:hash(sourceText),stableId:'shot',reference:{defPath}},fields=['projanim','projhitanim','projremanim','projcancelanim'].map((name,index)=>({name,authoredName:name,status:'literal',literal:true,navigable:true,value:600+index})),projection={status:'ready',fields};
const tokens=['a','b','c','d'].map(value=>value.repeat(48));let at=0,context={defPath,defText,defDirty:false,sourceText,assignedSources:[sourcePath],airPath,airText,generation:4,token:()=>tokens[at++]};
const built=buildProjectileAirAuthorities(component,projection,context);
assert.deepStrictEqual(Object.values(built.publicFields).map(item=>item.action),[600,601,602,603]);assert.strictEqual(built.authorities.size,4,'each animation role receives its own opaque route');assert(Object.values(built.publicFields).every(item=>/^[0-9a-f]{48}$/.test(item.route)));
const authority=built.authorities.get(tokens[0]);assert(validateProjectileAirAuthority(authority,component,projection,{...context,token:()=>tokens[0]}));
for(const changed of [{...context,defDirty:true},{...context,defText:defText.replace('Hero.air','Other.air')},{...context,sourceText:sourceText+'\n'},{...context,airText:airText.replace('0, 0, 0, 0, 1','0, 1, 0, 0, 1')},{...context,generation:5}])assert.strictEqual(validateProjectileAirAuthority(authority,component,projection,{...changed,token:()=>tokens[0]}),null,'DEF/source/AIR/generation drift fails closed');
assert.strictEqual(validateProjectileAirAuthority(authority,component,projection,{...context,assignedSources:[],token:()=>tokens[0]}),null,'saved state-source removal fails closed');
const duplicate={...context,airText:airText+'[Begin Action 600]\n4, 0, 0, 0, 1\n',token:()=>tokens[0]};assert.strictEqual(buildProjectileAirAuthorities(component,projection,duplicate).publicFields.projanim.available,false,'duplicate AIR actions never receive a route');
const dynamicProjection={status:'ready',fields:fields.map((field,index)=>index?field:{...field,status:'dynamic',literal:false,navigable:false,value:null})};assert.strictEqual(buildProjectileAirAuthorities(component,dynamicProjection,{...context,token:()=>tokens[0]}).publicFields.projanim.available,false);
console.log('Projectile AIR routes bind exact DEF, source, AIR, animation role, and generation');
