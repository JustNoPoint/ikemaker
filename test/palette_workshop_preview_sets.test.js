'use strict';

const assert = require('assert');
const model = require('../src/palette_workshop_preview_sets');

const target={filename:'C:\\game\\hero.sff',exists:true,byteHash:'a'.repeat(64),byteLength:1200};
const air={filename:'C:\\game\\hero.air',exists:true,byteHash:'b'.repeat(64),byteLength:500};
const source={filename:'C:\\palettes\\alt.act',exists:true,byteHash:'c'.repeat(64),byteLength:768};
const colors=Array.from({length:256},(_,index)=>[index,index,index,index===0?0:255]);
const archive={sprites:[{index:0,group:0,number:0},{index:1,group:10,number:2}],palettes:[{index:0,group:1,number:1},{index:1,group:1,number:2}]};
const session={target,selection:{sprite:{physicalIndex:1,group:10,number:2},palette:{physicalIndex:1,group:1,number:2}},context:{returnContext:{kind:'air',airPath:air.filename,airByteHash:air.byteHash,actionNumber:200,frameIndex:3,sourceLine:44,referencedSprite:{group:10,number:2}}},preview:{dirty:true,colors,source,actOrder:'index',label:'Alt'},candidate:{active:false},domains:{selectedDomainIds:['base'],selectedRemapPalGroupIds:['costumes'],registryRevision:7,registryByteHash:'d'.repeat(64)}};

const saved=model.capture({name:'Standing alt',session,archive,colors,now:'2026-10-22T12:00:00.000Z'});
assert.strictEqual(saved.sprite.physicalIndex,1);assert.strictEqual(saved.action.actionNumber,200);assert.strictEqual(saved.preview.colors.length,256);assert.deepStrictEqual(saved.assumptions.remapPalGroupIds,['costumes']);
const collection=model.upsert({},saved);assert.strictEqual(collection.items.length,1);assert.strictEqual(collection.selectedId,saved.id);
const exactFiles=filename=>filename===air.filename?air:filename===source.filename?source:{...target,filename};
const exact=model.reconcile(saved,{target,archive,domains:session.domains,fileEvidence:exactFiles});assert.strictEqual(exact.status,'exact');assert.strictEqual(exact.canOpen,true);
const duplicate=model.reconcile(saved,{target,archive:{...archive,sprites:[...archive.sprites,{index:2,group:10,number:2}]},domains:session.domains,fileEvidence:exactFiles});assert.strictEqual(duplicate.canOpen,true,'explicit physical identity prevents silent duplicate-coordinate rebinding');assert(duplicate.issues.some(issue=>issue.code==='SPRITE_DUPLICATE_COORDINATE'));
const changed=model.reconcile(saved,{target:{...target,byteHash:'e'.repeat(64)},archive,domains:session.domains,fileEvidence:exactFiles});assert.strictEqual(changed.status,'stale');assert.strictEqual(changed.canOpen,false);
const remapped=model.reconcile(saved,{target,archive:{...archive,sprites:[archive.sprites[0],{index:1,group:99,number:2}]},domains:session.domains,fileEvidence:exactFiles});assert.strictEqual(remapped.status,'stale');assert(remapped.issues.some(issue=>issue.code==='SPRITE_REMAPPED'));
const missingAir=model.reconcile(saved,{target,archive,domains:session.domains,fileEvidence:filename=>filename===air.filename?{...air,exists:false}:exactFiles(filename)});assert.strictEqual(missingAir.status,'missing');
const domainDrift=model.reconcile(saved,{target,archive,domains:{...session.domains,registryRevision:8},fileEvidence:exactFiles});assert.strictEqual(domainDrift.status,'stale');assert(domainDrift.issues.some(issue=>issue.code==='DOMAIN_REGISTRY_CHANGED'));
const patch=model.restorePatch(saved);assert.deepStrictEqual(patch.selection.sprite,saved.sprite);assert.strictEqual(patch.preview.dirty,true);assert.strictEqual(patch.context.returnContext.actionNumber,200);assert.deepStrictEqual(patch.domains.selectedDomainIds,['base']);
assert.strictEqual(model.remove(collection,saved.id).items.length,0);
let bounded={};for(let index=0;index<30;index++){const item={...saved,id:`preview-${String(index).padStart(20,'0')}`,name:`Set ${index}`};bounded=model.upsert(bounded,item);}assert.strictEqual(bounded.items.length,model.MAX_PREVIEW_SETS);
assert.throws(()=>model.capture({name:'',session,archive,colors}),/short name/);assert.throws(()=>model.capture({name:'Broken',session,archive,colors:colors.slice(0,2)}),/256-entry/);

console.log('Palette Workshop saved preview-set tests passed');
