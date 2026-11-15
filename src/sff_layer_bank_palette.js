'use strict';
const {paletteRgba,resolvedSprite,spritePng,friendlyVersion}=require('./sff_reader');
const {decodePng}=require('./palette_index_organizer_model');
const {encodedPlane}=require('./sff_sprite_transforms');
const {rewriteSpriteRows}=require('./sff_direct_delete');

function reviewBank(archive,bank){
  if(friendlyVersion(archive.header.version)!=='2.1'||!Number.isInteger(bank)||bank<1||bank>6)throw Error('Choose a linked SFF 2.1 sprite bank.');
  const masters=archive.palettes.filter(p=>p.group===1&&p.number===0);
  if(masters.length!==1)throw Error('This operation needs a unique 1,0 indexing master.');
  const colors=paletteRgba(archive,masters[0].index),byRgb=new Map(),byId=new Map();
  colors.forEach(([r,g,b,a],i)=>{
    if(!i||!a)return;
    const key=(r<<16)|(g<<8)|b;
    byRgb.set(key,[...(byRgb.get(key)||[]),i]);
  });
  for(const s of archive.sprites){
    const key=s.group+','+s.number;
    byId.set(key,byId.has(key)?null:s);
  }
  const frames=new Map();let partial=0,area=0;
  for(const s of archive.sprites){
    const g=s.group-bank*10000;
    if(g<0||g>=10000)continue;
    const key=g+','+s.number;
    if(!byId.has(key))continue;
    const base=byId.get(key),source=resolvedSprite(archive,s);
    if(!base||!byId.get(s.group+','+s.number))throw Error('Duplicate sprite ID near '+key+'.');
    if(![24,32].includes(source.colorDepth))continue;
    if(![5,8].includes(resolvedSprite(archive,base).colorDepth)||!archive.palettes[base.paletteIndex])throw Error('Base '+key+' needs an indexed palette.');
    area+=source.width*source.height;
    if(area>64000000)throw Error('Layer bank exceeds the 64-million-pixel conversion limit.');
    const {width,height,rgba}=decodePng(spritePng(archive,s)),pixels=Buffer.alloc(width*height),edges=[];
    for(let i=0;i<pixels.length;i++){
      const at=i*4,a=rgba[at+3];if(!a)continue;
      const matches=byRgb.get(rgba.readUIntBE(at,3))||[];
      const exact=matches.filter(index=>colors[index][3]===a);
      if(exact.length===1){pixels[i]=exact[0];continue}
      if(!exact.length&&matches.length===1&&a<255&&colors[matches[0]][3]===255){
        edges.push(i);pixels[i]=matches[0];continue;
      }
      throw Error('Sprite '+s.group+','+s.number+' has a missing or ambiguous master color.');
    }
    partial+=edges.length;
    frames.set(s.index,{width,height,pixels,edges,palette:base.paletteIndex});
  }
  return {frames,partial};
}

function convertBank(archive,review,policy){
  if(!['transparent','opaque','skip'].includes(policy))throw Error('Choose how to handle partial opacity.');
  const changed=new Set();
  const rows=archive.sprites.map(s=>{
    const row={...s,newIndex:s.index,data:s.dataSize?archive.buffer.subarray(s.dataOffset,s.dataOffset+s.dataSize):null};
    const f=review.frames.get(s.index);
    if(!f||(policy==='skip'&&f.edges.length))return row;
    const pixels=Buffer.from(f.pixels);
    if(policy==='transparent')for(const i of f.edges)pixels[i]=0;
    const encoded=encodedPlane({channels:1,width:f.width,height:f.height,pixels},paletteRgba(archive,f.palette));
    changed.add(s.index);
    return {...row,...encoded,dataSize:encoded.data.length,width:f.width,height:f.height,link:0,paletteIndex:f.palette};
  });
  for(const row of rows){
    if(row.dataSize)continue;
    let source=archive.sprites[row.index];
    while(!source.dataSize){
      source=archive.sprites[source.link];
      if(changed.has(source.index))throw Error('An unselected sprite links to converted artwork. Separate that link before converting.');
    }
  }
  if(!changed.size)throw Error('No truecolor frames are eligible for conversion.');
  return rewriteSpriteRows(archive,rows).buffer;
}
module.exports={reviewBank,convertBank};
