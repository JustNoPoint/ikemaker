'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const collectiveModel=require('../src/palette_collective_model');
const {PaletteReductionController}=require('../src/palette_reduction_controller');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-reduction-controller-')),png=path.join(root,'source.png');
fs.writeFileSync(png,collectiveModel.encodeRgbaPng(3,2,Buffer.from([10,20,30,255,10,20,30,255,0,0,0,0,40,50,60,255,40,50,60,255,40,50,60,255])));
try{
 const collective=collectiveModel.buildCollective([{filename:png,buffer:fs.readFileSync(png)}]),review={reviewedImageIds:collective.evidence.map(item=>item.imageId),selectedImageIds:collective.evidence.map(item=>item.imageId),contactReviewed:true,reviewedInventoryHash:collective.inventoryHash,audit:{added:[],missing:[],clean:true}},owner=new PaletteReductionController(root);
 let saved=owner.start(collective,review,review.selectedImageIds);assert.strictEqual(saved.head.revision,1);assert.throws(()=>{owner.busy=true;try{owner.apply(saved.head.operationId,saved.headByteHash,{})}finally{owner.busy=false}},/already completing/);
 saved=owner.settings(saved.head.operationId,saved.headByteHash,{tool:'brush',brush:{width:2,height:1},pairs:[{from:[10,20,30,255],to:[90,80,70,255]}]});const oldHead=saved.headByteHash;
 saved=owner.apply(saved.head.operationId,saved.headByteHash,{kind:'brush',imageId:saved.state.activeImageId,points:[{x:0,y:0}],brush:{width:1,height:1},pairs:saved.state.settings.pairs});assert.strictEqual(saved.head.revision,3);assert.throws(()=>owner.apply(saved.head.operationId,oldHead,{kind:'brush'}),/changed after review/);
 const view=owner.view(saved.head.operationId);assert.strictEqual(view.images[0].layers[0].pixelCount,1);assert(view.images[0].dataUri.startsWith('data:image/png;base64,'));
 saved=owner.undo(saved.head.operationId,saved.headByteHash);assert.strictEqual(owner.view(saved.head.operationId).images[0].layers[0].pixelCount,0);saved=owner.redo(saved.head.operationId,saved.headByteHash);assert.strictEqual(owner.view(saved.head.operationId).images[0].layers[0].pixelCount,1);
 const bundle={schema:'ikemaker.palette-reduction-suggestion-bundle',version:1,sourceAuthorityHash:saved.authority.authorityHash,provider:{id:'local',version:'1',mode:'offline'},proposals:[{id:'pair-001',kind:'color-pair',imageId:saved.state.activeImageId,confidence:.5,provenance:'offline review',pairs:[{from:[40,50,60,255],to:[1,2,3,255]}]}]};saved=owner.importSuggestions(saved.head.operationId,saved.headByteHash,Buffer.from(JSON.stringify(bundle)));const before=saved.head.revision;saved=owner.decideSuggestion(saved.head.operationId,saved.headByteHash,'pair-001',true);assert.strictEqual(saved.head.revision,before+1,'reviewed suggestion and exact operation publish as one durable revision');assert.strictEqual(saved.state.suggestions.proposals[0].status,'approved');
 fs.writeFileSync(png,Buffer.from('drift'));assert.throws(()=>owner.snapshot(saved.head.operationId),/changed after review|PNG/);
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('Palette reduction coordinator busy, CAS, exact preview, durable undo/redo, atomic suggestion, and stale-source tests passed');
