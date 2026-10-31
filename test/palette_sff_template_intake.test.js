'use strict';
const assert=require('assert');
const reader=require('../src/sff_reader');
const original={...reader};
reader.spriteIndexPlane=(_archive,sprite)=>({width:sprite.indices.length,height:1,indices:Buffer.from(sprite.indices)});
reader.paletteRgba=(archive,index)=>{const seen=new Set();while(archive.palettes[index].dataSize===0){if(seen.has(index))throw new Error('cycle');seen.add(index);index=archive.palettes[index].link;}return archive.palettes[index].colorsRgba;};
reader.spritePng=()=>require('../src/palette_collective_model').encodeRgbaPng(1,1,Buffer.from([7,8,9,255]));
const model=require('../src/palette_sff_template_intake');
Object.assign(reader,original);
const colors=Array.from({length:256},(_,i)=>[i,i,i,i?255:0]);colors[2]=colors[1].slice();
const archive={buffer:Buffer.from('source A'),palettes:[{dataSize:1024,colorsRgba:colors},{dataSize:0,link:0},{dataSize:1024,colorsRgba:colors}],sprites:[
  {index:0,group:10,number:0,colorDepth:8,paletteIndex:0,axisX:2,axisY:-3,indices:[0,1,2]},
  {index:1,group:20,number:0,colorDepth:8,paletteIndex:1,axisX:4,axisY:5,indices:[1]},
  {index:2,group:30,number:0,colorDepth:8,paletteIndex:2,axisX:0,axisY:0,indices:[1]},
  {index:3,group:40,number:0,colorDepth:32,axisX:0,axisY:0}
]};
const inventory=model.inspectArchive(archive,'alternate.sff');
assert(inventory.source.filename.endsWith('alternate.sff'));
assert.deepStrictEqual(inventory.rows[1].ownerChain,[1,0]);
assert.strictEqual(inventory.rows[1].authoredPalettePhysicalIndex,1);
assert.strictEqual(inventory.rows[0].axisY,-3);
assert.strictEqual(inventory.rows[0].indexPlaneHash.length,64);
const preserve=model.reviewSelection(inventory,{physicalIndexes:[0,1,2]});
assert.strictEqual(preserve.slotCount,3,'same family/index shares a slot; duplicate RGB indexes and independent families remain separate');
assert(preserve.semanticDuplicates);
assert.strictEqual(model.reviewSelection(inventory,{physicalIndexes:[0,1,2],mode:'combined'}).slotCount,1);
assert.strictEqual(model.reviewSelection(inventory,{physicalIndexes:[0,1,2],excludedGroups:[10],excludedFamilies:['owner:2']}).slotCount,1);
assert.strictEqual(model.reviewSelection(inventory,{physicalIndexes:[3],mode:'combined'}).slotCount,1,'truecolor-only supported');
assert.strictEqual(model.reviewSelection(inventory,{physicalIndexes:[0,1,2],separators:252}).ready,true);
assert.strictEqual(model.reviewSelection(inventory,{physicalIndexes:[0,1,2],separators:253}).ready,false);
assert.match(model.reviewSelection(inventory,{physicalIndexes:[0,1,2],separators:253}).reasons[0],/Exclude families/);
assert.throws(()=>model.reviewSelection(inventory,{physicalIndexes:[999]}),/does not belong/);
assert.deepStrictEqual([preserve.sourceMayBeModified,preserve.combineWithPrimary,preserve.destination,preserve.adoption],[false,false,null,null]);
const detached=model.reviewSelection(inventory,{physicalIndexes:[0]});detached.rows[0].ownerChain.push(99);detached.rows[0].slots[0].rgba[0]=99;
assert.deepStrictEqual(inventory.rows[0].ownerChain,[0]);assert.strictEqual(inventory.rows[0].slots[0].rgba[0],1,'candidate review cannot mutate source evidence');
const other=model.inspectArchive({...archive,buffer:Buffer.from('source B')},'other.sff');
assert.notStrictEqual(other.rows[0].slots[0].semanticId,inventory.rows[0].slots[0].semanticId);
assert.throws(()=>model.validatedOwner({palettes:[{dataSize:0,link:1},{dataSize:0,link:0}]},0),/Cyclic/);
assert.throws(()=>model.validatedOwner({palettes:[{dataSize:0,link:5}]},0),/Unresolved/);
const invalid=model.inspectArchive({...archive,palettes:[{dataSize:0,link:0}]},'broken.sff');
assert.strictEqual(model.reviewSelection(invalid,{physicalIndexes:[0]}).ready,false);

async function testLiveBudget(){
  let accept,select,hide,disposed=false;
  const picker={onDidAccept:fn=>accept=fn,onDidChangeSelection:fn=>select=fn,onDidHide:fn=>hide=fn,show(){},dispose(){disposed=true;hide();}};
  const pending=model.chooseReviewedSprites({createQuickPick:()=>picker},inventory,{mode:'preserve',separators:253,physicalIndexes:[0,1,2]});
  assert.strictEqual(picker.canSelectMany,true);assert.match(picker.title,/256\/255/);accept();assert.strictEqual(disposed,false,'overflow cannot be accepted');
  picker.selectedItems=picker.items.filter(item=>item.row.physicalIndex===1);select();assert.match(picker.title,/254\/255/);accept();
  const result=await pending;assert(result.ready);assert.deepStrictEqual(result.rows.map(row=>row.physicalIndex),[1]);
}
testLiveBudget().then(()=>console.log('SFF template intake validates owners, semantic budgets, exclusions, truecolor and candidate isolation')).catch(error=>{console.error(error);process.exitCode=1;});
