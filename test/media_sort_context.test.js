'use strict';
const assert=require('assert');
const {metadataSorts,compareSoundMetadata}=require('../src/snd_sort');
const {exactSpritePalette,clientScript}=require('../src/palette_sprite_editor_client');
for(const field of Object.keys(metadataSorts)){
 const rows=[{archiveIndex:3,[field]:2},{archiveIndex:2},{archiveIndex:1,[field]:1},{archiveIndex:0,[field]:2}];
 assert.deepEqual(rows.sort((a,b)=>compareSoundMetadata(a,b,field)).map(row=>row.archiveIndex),[1,0,3,2]);
}
const sprite={physicalIndex:2,group:0,number:1},model={available:true,sprite,paletteBanks:[{physicalIndex:4}],constraints:{evidence:{sprite:{...sprite},resource:{byteHash:'abc'},authoredPalettePhysicalIndex:4}}};
assert.equal(exactSpritePalette(model),4);
for(const change of [{previewDirty:true},{candidateReadOnly:true},{sprite:{...sprite,physicalIndex:3}},{paletteBanks:[]},{paletteBanks:[{physicalIndex:4},{physicalIndex:4}]}])assert.equal(exactSpritePalette({...model,...change}),null);
assert.equal(exactSpritePalette({...model,constraints:{...model.constraints,blockers:[{code:'STALE_WORKSPACE'}]}}),null);
const client=clientScript();new Function(client);
assert(client.includes("post('paletteSelect',{value:current})"));assert(client.includes("ikemaker-sprite-color-picked"));
assert(client.includes('if(event.button===2)return;pointerDownBeforeContext(event)'));
assert(client.includes("event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')"));
console.log('SND exact metadata sorts and sprite context authority passed');
