'use strict';
const assert=require('assert');
const {paletteSwatchPng}=require('../src/palette_editor');
const {decodePng,inventory,opacityStats,finalized,indexedPng,paletteConstructionDraft,exportArtifacts,auditSharedPaletteArchive}=require('../src/palette_index_organizer_model');
const colors=Array.from({length:256},(_,i)=>[i,0,255-i,i===0?0:255]),png=paletteSwatchPng(colors),decoded=decodePng(png);
assert.strictEqual(decoded.width,256);assert.strictEqual(decoded.height,256);assert.deepStrictEqual([...decoded.rgba.subarray(0,4)],[0,0,255,255]);
for(let at=0;at<decoded.rgba.length;at+=4)if(decoded.rgba[at]===0&&decoded.rgba[at+1]===0&&decoded.rgba[at+2]===255)decoded.rgba[at+3]=0;
const seedEntries=colors.map((rgba,firstSeen)=>({id:rgba.join(','),rgba,count:1,files:['table.png'],firstSeen,category:rgba[3]===0?'Transparency':'Unassigned'})),source=indexedPng(decoded,seedEntries);
const model=inventory([{name:'table.png',buffer:source}]);assert.strictEqual(model.uniqueColors,256);assert.strictEqual(model.uniqueRgb,256);assert.strictEqual(model.opacityExpandedColors,0);assert.strictEqual(model.safeExact,true);assert.strictEqual(model.transparent,1);
const alphaVariant=opacityStats([{rgba:[20,40,60,255]},{rgba:[20,40,60,128]},{rgba:[20,40,60,64]},{rgba:[10,10,10,255]}]);assert.deepStrictEqual(alphaVariant,{uniqueRgb:2,rgbWithMultipleAlpha:1,opacityExpandedColors:2,maxAlphaVariants:3});
const draft=paletteConstructionDraft([{name:'table.png',buffer:source}],{targetColors:16,alphaMode:'bands'}),draftModel=inventory(draft.files);assert.strictEqual(draft.files.length,1);assert.ok(draft.resultColors<=16);assert.ok(draftModel.uniqueColors<=16);assert.strictEqual(decodePng(draft.files[0].buffer).width,256);assert.strictEqual(draftModel.transparent,1);
const ordered=finalized(model.entries);assert.strictEqual(ordered[0].rgba[3],0);const remapped=indexedPng(decodePng(source),ordered),roundTrip=decodePng(remapped);assert.deepStrictEqual([...roundTrip.rgba], [...decodePng(source).rgba]);
const outputs=exportArtifacts(ordered,'Test');assert.strictEqual(outputs.colors.length,256);assert.match(outputs.csv.toString(),/index,red,green/);assert.strictEqual(outputs.act.length,768);
const phase1Entries=[
  {id:'0,0,0,0',rgba:[0,0,0,0],firstSeen:0,category:'Transparency',label:'Transparent'},
  {id:'80,40,20,255',rgba:[80,40,20,255],firstSeen:1,category:'Skin',label:'dark'},
  {id:'200,150,100,255',rgba:[200,150,100,255],firstSeen:2,category:'Skin',label:'light'},
  {id:'20,30,40,255',rgba:[20,30,40,255],firstSeen:3,category:'Hair',label:'dark'},
  {id:'100,120,140,255',rgba:[100,120,140,255],firstSeen:4,category:'Hair',label:'light'}
];
const phase1=finalized(phase1Entries,{phase1RowGaps:true});assert.strictEqual(phase1.length,6);assert.strictEqual(phase1.filter(x=>x.category==='RESERVED_ROW_GAP').length,1);assert.ok(phase1.findIndex(x=>x.category==='RESERVED_ROW_GAP')>0);assert.deepStrictEqual(phase1.filter(x=>x.category==='Skin').map(x=>x.label),['dark','light']);
assert.throws(()=>finalized([{id:'1,2,3,255',rgba:[1,2,3,255],category:'Unassigned'}],{phase1RowGaps:true}),/logical material row/);
const phase1Outputs=exportArtifacts(phase1Entries,'Phase1',{phase1RowGaps:true});assert.match(phase1Outputs.csv.toString(),/RESERVED_ROW_GAP/);assert.strictEqual(JSON.parse(phase1Outputs.json).phase1RowGaps,true);
const collisionEntries=[
  {id:'1,2,3,0',rgba:[1,2,3,0],firstSeen:0,category:'Transparency'},
  {id:'0,245,186,255',rgba:[0,245,186,255],firstSeen:1,category:'Hair'},
  {id:'3,240,184,255',rgba:[3,240,184,255],firstSeen:2,category:'Eyes'}
];
const collisionPlan=finalized(collisionEntries,{phase1RowGaps:true,backgroundColor:'#00F5BA',backgroundSimilarityThreshold:12});assert.deepStrictEqual(collisionPlan[0].rgba,[0,245,186,0]);const replaced=collisionPlan.filter(x=>x.backgroundCollision);assert.strictEqual(replaced.length,2);assert.notDeepStrictEqual(replaced[0].rgba.slice(0,3),replaced[1].rgba.slice(0,3));assert.ok(replaced.every(x=>x.sourceRgba));
const customBackground=finalized([{id:'9,9,9,0',rgba:[9,9,9,0],category:'Transparency'},{id:'1,2,3,255',rgba:[1,2,3,255],category:'Skin'}],{phase1RowGaps:true,backgroundColor:'#112233',backgroundSimilarityThreshold:0});assert.deepStrictEqual(customBackground[0].rgba,[17,34,51,0]);
assert.throws(()=>finalized(Array.from({length:257},(_,i)=>({rgba:[i%256,Math.floor(i/256),0,255],firstSeen:i,category:'Unassigned'}))),/exceed/);
const sharedAudit=auditSharedPaletteArchive({palettes:[{index:0,group:0,number:0}],sprites:[{group:0,number:0,colorDepth:8,paletteIndex:0},{group:0,number:1,colorDepth:8,paletteIndex:0}]});assert.strictEqual(sharedAudit.ok,true);assert.strictEqual(sharedAudit.indexedSprites,2);
const detachedAudit=auditSharedPaletteArchive({palettes:[{index:0,group:0,number:0},{index:1,group:0,number:1}],sprites:[{group:0,number:0,colorDepth:8,paletteIndex:0},{group:0,number:1,colorDepth:8,paletteIndex:1}]});assert.strictEqual(detachedAudit.ok,false);assert.match(detachedAudit.issues.join(' '),/Expected one shared palette/);assert.deepStrictEqual(detachedAudit.detachedSprites,['0,1']);
console.log('Palette index organizer model tests passed');
