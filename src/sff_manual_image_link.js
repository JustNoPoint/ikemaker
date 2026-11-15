'use strict';
const {resolvedSprite,paletteRgba}=require('./sff_reader'),{pixelPlane}=require('./sff_sprite_transforms'),{rewriteSpriteRows}=require('./sff_direct_delete'),{hash}=require('./mutation_safety');
function eligibleTarget(archive,destinationIndex,targetIndex){
 const destination=archive.sprites[destinationIndex],target=archive.sprites[targetIndex];if(!destination||!target||destinationIndex===targetIndex)return false;
 try{const source=resolvedSprite(archive,target);if(source.index===destinationIndex||source.width*source.height>1000000)return false;if([5,8].includes(source.colorDepth)){const palette=require('./sff_reader').resolvedPalette(archive,destination.paletteIndex),plane=pixelPlane(archive,target);if(!palette||plane.pixels.some(index=>index>=palette.colors))return false;}pixelPlane(archive,target);return true;}catch{return false;}
}
function planManualLink(archive,destinationIndex,targetIndex){
 if(archive.header.legacy)throw Error('Convert SFF v1 to v2 before linking images.');
 if(!Number.isInteger(destinationIndex)||!archive.sprites[destinationIndex]||!Number.isInteger(targetIndex)||!archive.sprites[targetIndex]||destinationIndex===targetIndex)throw Error('Choose two distinct exact physical sprites.');
 if(archive.sprites.length>4096)throw Error('Manual image linking is limited to 4096 sprites.');
 const destination=archive.sprites[destinationIndex],target=archive.sprites[targetIndex],source=resolvedSprite(archive,target);
 if(source.index===destinationIndex)throw Error('That target resolves to the destination image already. Choose an independent image.');
 let total=0;for(const sprite of archive.sprites){const image=resolvedSprite(archive,sprite);total+=image.width*image.height;if(image.width*image.height>1000000||total>16000000)throw Error('Manual image linking exceeds the decoded image budget.');}
 if([5,8].includes(source.colorDepth)){const palette=require('./sff_reader').resolvedPalette(archive,destination.paletteIndex),plane=pixelPlane(archive,target);if(!palette||plane.pixels.some(index=>index>=palette.colors))throw Error('The destination assigned palette cannot represent every index in the chosen artwork. Choose another image or assign a suitable palette first.');}
 const payload=sprite=>Buffer.from(archive.buffer.subarray(sprite.dataOffset,sprite.dataOffset+sprite.dataSize));
 const rows=archive.sprites.map(sprite=>({...sprite,newIndex:sprite.index,data:sprite.dataSize?payload(sprite):null}));
 const affected=[];
 // Preserve old downstream users explicitly: linking one occurrence must not replace neighbors.
 for(const sprite of archive.sprites){if(sprite.index===destinationIndex||sprite.dataSize)continue;let cursor=sprite,seen=new Set();while(cursor&&!cursor.dataSize&&!seen.has(cursor.index)){seen.add(cursor.index);if(cursor.link===destinationIndex){const old=resolvedSprite(archive,sprite),row=rows[sprite.index];row.data=payload(old);row.dataSize=row.data.length;row.link=0;for(const key of ['width','height','format','colorDepth','flags'])row[key]=old[key];affected.push(sprite.index);break;}cursor=archive.sprites[cursor.link];}}
 const row=rows[destinationIndex];for(const key of ['width','height','format','colorDepth','flags'])row[key]=source[key];
 if(source.index<destinationIndex){row.data=null;row.dataSize=0;row.link=source.index;}
 else{row.data=payload(source);row.dataSize=row.data.length;row.link=0;const owner=rows[source.index];owner.data=null;owner.dataSize=0;owner.link=destinationIndex;}
 const built=rewriteSpriteRows(archive,rows);
 for(let i=0;i<rows.length;i++){const before=archive.sprites[i],after=built.archive.sprites[i],old=pixelPlane(archive,i===destinationIndex?target:before),next=pixelPlane(built.archive,after);if(before.axisX!==after.axisX||before.axisY!==after.axisY||before.paletteIndex!==after.paletteIndex||old.width!==next.width||old.height!==next.height||old.colorDepth!==next.colorDepth||!old.pixels.equals(next.pixels))throw Error('Manual image link verification failed.');}
 for(let i=0;i<archive.palettes.length;i++){const before=archive.palettes[i],after=built.archive.palettes[i];if(['group','number','colors','link','dataSize'].some(key=>before[key]!==after[key])||JSON.stringify(paletteRgba(archive,i))!==JSON.stringify(paletteRgba(built.archive,i)))throw Error('Manual image linking changed palette colors or ownership.');}
 const affectedUsers=affected.map(index=>({index,group:archive.sprites[index].group,number:archive.sprites[index].number,paletteIndex:archive.sprites[index].paletteIndex,action:'retain previous artwork independently'}));
 const rehomedOwner=source.index>destinationIndex?{from:source.index,to:destinationIndex,users:archive.sprites.filter(sprite=>resolvedSprite(archive,sprite).index===source.index).map(sprite=>({index:sprite.index,group:sprite.group,number:sprite.number,paletteIndex:sprite.paletteIndex}))}:null;
 return {...built,affectedUsers,rehomedOwner,operation:"manual-image-link",order:rows.map(row=>row.index),destinationIndex,targetIndex,affected,sourceHash:hash(archive.buffer),changes:[{index:destinationIndex,action:'replace artwork with target image'},...affected.map(index=>({index,action:'retain previous artwork independently'}))]};
}
module.exports={planManualLink,eligibleTarget};
