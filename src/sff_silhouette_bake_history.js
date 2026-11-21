'use strict';
const fs=require('fs'),path=require('path');
const {hash,transactionalWrite}=require('./mutation_safety');
const {paletteRgba,spriteIndexPlane,resolvedSprite}=require('./sff_reader');
const identity=row=>`${row.group},${row.number}`;
function location(filename){return path.join(require('./sff_private_storage').directory('recovery'),'silhouette-bakes',hash(path.resolve(filename).toLowerCase())+'.json');}
function read(filename){const file=location(filename);if(!fs.existsSync(file))return {version:1,records:[]};const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version!==1||!Array.isArray(value.records))throw Error('Silhouette bake history is invalid. Restore an original source copy before baking.');return value;}
function assertUnbaked(filename,archive,bank){
  const stamp=hash(archive.buffer),records=read(filename).records.filter(record=>record.bank===bank);
  for(const record of records){
    if(stamp===record.originalHash)continue; // Exact original restored, including Undo.
    const sprites=new Set(archive.sprites.map(identity)),palettes=new Set(archive.palettes.map(identity));
    const valid=record.mappings.every(row=>sprites.has(row.baseId)&&sprites.has(row.layerId))&&record.palettePairs.every(pair=>palettes.has(pair.equippedId)&&palettes.has(pair.offId));
    throw Error(valid?'This layer bank has already been baked. Restore or Undo the exact original before rebaking. Original backup: '+record.backup:'Saved silhouette mappings are stale. Rebuild from the original source copy before baking. Original backup: '+record.backup);
  }
  // A copied archive may lack host history. Recognize paired opaque/transparent
  // ink tables used by matching base sprites, and require its original copy.
  const colors=archive.palettes.map(p=>paletteRgba(archive,p.index)),opaque=new Set(colors.map(table=>hash(Buffer.from(table.flat()))));
  const spriteIds=new Set(archive.sprites.map(identity));
  const matching=archive.sprites.filter(s=>s.group<10000&&spriteIds.has(`${s.group+bank*10000},${s.number}`)&&[5,8].includes(resolvedSprite(archive,s).colorDepth));
  const usage=new Set();for(const sprite of matching)for(const index of spriteIndexPlane(archive,sprite).indices)usage.add(index);
  for(const table of colors)for(let index=1;index<256;index++)if(usage.has(index)&&table[index]?.[3]===0){const copy=table.map(color=>[...color]);copy[index][3]=255;if(opaque.has(hash(Buffer.from(copy.flat()))))throw Error('This archive contains used opaque/transparent palette partners consistent with an existing silhouette bake. Use the original source copy before rebaking.');}
}
function continuationFor(filename,archive,bank){
  const stamp=hash(archive.buffer),records=read(filename).records.filter(item=>item.bank===bank),saved=records.find(item=>item.bakedHash===stamp);
  if(saved){
    const sprites=new Map(archive.sprites.map(sprite=>[identity(sprite),sprite])),palettes=new Map(archive.palettes.map(palette=>[identity(palette),palette]));
    if(!saved.mappings.every(row=>sprites.has(row.baseId)&&sprites.has(row.layerId))||!saved.palettePairs.every(pair=>palettes.has(pair.equippedId)&&(pair.pending?!palettes.has(pair.offId):palettes.has(pair.offId))))throw Error('Saved silhouette mappings are stale. Rebuild from the original source copy.');
    return {sourceHash:stamp,bank,silhouetteIndex:saved.silhouetteIndex,color:saved.color||[0,0,0],palettePairs:saved.palettePairs,mappings:saved.mappings.map(row=>{const base=sprites.get(row.baseId),layer=sprites.get(row.layerId);return {...row,basePhysicalIndex:base.index,layerPhysicalIndex:layer.index,width:base.width,height:base.height,axisX:base.axisX,axisY:base.axisY};})};
  }
  if(records.some(item=>item.originalHash===stamp))return null;
  assertUnbaked(filename,archive,bank);
  return null;
}
function assertCanBake(filename,archive,bank,indices){
  const continuation=continuationFor(filename,archive,bank);
  if(continuation){const baked=new Set(continuation.mappings.map(row=>row.baseId));for(const index of indices||[])if(baked.has(identity(archive.sprites[index])))throw Error('This sprite already has the layer silhouette. Choose only remaining frames, or Undo that batch before rebaking it.');}
  return continuation;
}
function record(filename,review,bakedHash,backup){
  const file=location(filename),store=read(filename),bytes=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0);
  const prior=store.records.find(item=>item.bank===review.bank&&item.bakedHash===review.sourceHash);
  const mappings=[...(review.continuation?.mappings||[]),...review.mappings];
  // Keep earlier batch snapshots so archive Undo can resume from the exact prior hash.
  store.records=store.records.filter(item=>item.bank!==review.bank||item.bakedHash!==bakedHash);
  store.records.push({bank:review.bank,sourceHash:review.sourceHash,originalHash:prior?.originalHash||review.sourceHash,bakedHash,backup:prior?.backup||backup,batchBackup:backup,color:review.color||[0,0,0],silhouetteIndex:review.silhouetteIndex,mappings,batchMappings:review.mappings,palettePairs:review.palettePairs.map(({pending,...pair})=>pair)});
  transactionalWrite(fs,file,JSON.stringify(store,null,2)+'\n',{expectedHash:hash(bytes),allowExisting:true,label:'silhouette-bake-history'});
}
function savedBake(filename, archive, bank) {
  const stamp = hash(archive.buffer);
  return read(filename).records.find(item => item.bank === bank && item.bakedHash === stamp);
}
// Called only after the normal import transaction has committed. This proof
// authorizes continuing saved batches across an append, never an artwork edit.
function proveAdditiveImport(filename,before,after){
  const sourceHash=hash(before.buffer),bakedHash=hash(after.buffer),store=read(filename);
  const saved=store.records.filter(item=>item.bakedHash===sourceHash);
  if(!saved.length||sourceHash===bakedHash)return {rebasedBanks:[],hash:bakedHash};
  if(after.palettes.length<before.palettes.length)throw Error('Silhouette continuation cannot follow an import that removes palettes.');
  if(after.sprites.length<=before.sprites.length)throw Error('Silhouette continuation requires an append-only sprite import.');
  for(let i=0;i<before.palettes.length;i++){
    const a=before.palettes[i],b=after.palettes[i];
    if(identity(a)!==identity(b)||JSON.stringify(paletteRgba(before,i))!==JSON.stringify(paletteRgba(after,i)))throw Error('The import changed an existing palette; silhouette continuation was not rebased.');
  }
  for(let i=0;i<before.sprites.length;i++){
    const a=before.sprites[i],b=after.sprites[i];
    for(const key of ['group','number','width','height','axisX','axisY','paletteIndex'])if(a[key]!==b[key])throw Error('The import changed an existing sprite row; silhouette continuation was not rebased.');
    const indexed=[5,8].includes(resolvedSprite(before,a).colorDepth);
    if(indexed!==[5,8].includes(resolvedSprite(after,b).colorDepth))throw Error('The import changed existing artwork color mode.');
    const reader=require('./sff_reader'),decode=require('./palette_index_organizer_model').decodePng;
    const left=indexed?spriteIndexPlane(before,a).indices:decode(reader.spritePng(before,a)).rgba;
    const right=indexed?spriteIndexPlane(after,b).indices:decode(reader.spritePng(after,b)).rgba;
    if(!left.equals(right))throw Error('The import changed existing artwork; silhouette continuation was not rebased.');
  }
  const ids=new Set(before.sprites.map(identity));
  for(const sprite of after.sprites.slice(before.sprites.length)){
    if(ids.has(identity(sprite)))throw Error('The import appended a duplicate sprite identity.');ids.add(identity(sprite));
    if([5,8].includes(resolvedSprite(after,sprite).colorDepth)){
      const plane=spriteIndexPlane(after,sprite);
      if(saved.some(item=>plane.indices.includes(item.silhouetteIndex)))throw Error('Newly imported artwork uses a reserved silhouette index. Choose source colors outside the reserved ink before continuing.');
    }
  }
  const file=location(filename),bytes=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0);
  for(const item of saved){
    const pairs=item.palettePairs.map(pair=>({...pair})),occupied=new Set(after.palettes.map(identity));
    for(const pair of pairs)occupied.add(pair.offId);
    const group=Number(pairs[0].offId.split(',')[0]);
    for(const palette of after.palettes.slice(before.palettes.length)){
      if(new Set(after.palettes.filter(p=>identity(p)===identity(palette))).size!==1)throw Error('New palette identities are ambiguous.');
      let number=0;while(number<=65535&&occupied.has(`${group},${number}`))number++;
      if(number>65535)throw Error('No free transparent partner palette identity remains.');
      const offId=`${group},${number}`;occupied.add(offId);
      pairs.push({sourcePhysicalIndex:palette.index,equippedPhysicalIndex:palette.index,offPhysicalIndex:0,sourceId:identity(palette),equippedId:identity(palette),offId,pending:true});
    }
    let pending=0;for(const pair of pairs)if(pair.pending)pair.offPhysicalIndex=after.palettes.length+pending++;
    if(after.palettes.length+pending>65536)throw Error('The appended palettes exceed the SFF transparent-partner table limit.');
    store.records=store.records.filter(row=>row.bank!==item.bank||row.bakedHash!==bakedHash);store.records.push({...item,palettePairs:pairs,sourceHash,bakedHash,rebasedFromHash:sourceHash,additiveImport:true});
  }
  transactionalWrite(fs,file,JSON.stringify(store,null,2)+'\n',{expectedHash:hash(bytes),allowExisting:true,label:'silhouette-additive-continuation'});
  return {rebasedBanks:saved.map(item=>item.bank),hash:bakedHash};
}
function rebaseAfterAdditiveImport(filename,before,after){
  try{return proveAdditiveImport(filename,before,after);}
  catch(error){return {rebasedBanks:[],hash:hash(after.buffer),reason:error.message};}
}
module.exports={assertUnbaked,assertCanBake,continuationFor,record,location,savedBake,rebaseAfterAdditiveImport};

