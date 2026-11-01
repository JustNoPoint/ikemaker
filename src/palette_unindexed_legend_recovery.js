'use strict';
const crypto=require('crypto');
const {decodePng}=require('./palette_index_organizer_model');
const {encodeIndexedPng,readIndexedPng}=require('./palette_indexed_png');
function sha(value){return crypto.createHash('sha256').update(value).digest('hex')}
function rgbaAt(decoded,x,y){const at=(y*decoded.width+x)*4;return[...decoded.rgba.subarray(at,at+4)]}
function key(rgba){return rgba.join(',')}
function recover(input){
  const decoded=decodePng(input.bytes),document=input.zoneDocument;
  if(!document||document.schema!=='ikemaker.palette-template-zones'||!Array.isArray(document.zones))throw new Error('Unindexed recovery requires reviewed visible template-zone metadata.');
  const template=document.template||{};
  if(decoded.width!==template.width||decoded.height!==template.height)throw new Error('Submitted image geometry drifted from the registered indexed template.');
  const legend=new Map(),byIndex=new Map(),conflicts=[],maskPixels=[];
  for(const zone of document.zones)for(const member of zone.members||[]){
    const colors=new Map();
    for(const offset of member.mask||[]){const x=member.rect.x+offset%member.rect.width,y=member.rect.y+Math.floor(offset/member.rect.width),rgba=rgbaAt(decoded,x,y),id=key(rgba);colors.set(id,rgba);maskPixels.push({x,y,index:member.index,imageId:String(input.imageId||'image:0'),imageLabel:String(input.imageLabel||'Submitted palette image')});}
    if(colors.size!==1){conflicts.push({code:'SWATCH_NOT_UNIFORM',zoneId:zone.id,index:member.index,pixels:maskPixels.filter(item=>item.index===member.index),message:`Swatch ${zone.name}/${member.index} contains ${colors.size} colors.`});continue}
    const rgba=[...colors.values()][0],id=key(rgba);
    if(legend.has(id)&&legend.get(id)!==member.index)conflicts.push({code:'DUPLICATE_RGBA_AMBIGUITY',indexes:[legend.get(id),member.index],rgba,pixels:maskPixels.filter(item=>item.index===member.index),message:`RGBA ${id} belongs to more than one distinct index.`});
    else{legend.set(id,member.index);byIndex.set(member.index,rgba)}
  }
  const resolutions=new Map(Object.entries(input.resolutions||{}).map(([rgba,index])=>[rgba,Number(index)])),replacements=new Map(Object.entries(input.replacements||{}).map(([rgba,target])=>[rgba,String(target)]));
  for(const [rgba,index]of resolutions)if(!byIndex.has(index)||!/^\d+,\d+,\d+,\d+$/.test(rgba))throw new Error('A reviewed legend resolution references an unavailable index or invalid RGBA.');
  for(const [rgba,target]of replacements)if(!/^\d+,\d+,\d+,\d+$/.test(rgba)||!legend.has(target))throw new Error('A reviewed replacement must target an exact color in the visible swatch legend.');
  const indices=Buffer.alloc(decoded.width*decoded.height),unknown=new Map();
  for(let pixel=0;pixel<indices.length;pixel++){
    const rgba=[...decoded.rgba.subarray(pixel*4,pixel*4+4)],id=key(rgba);let index=rgba[3]===0?0:legend.get(id);
    if(index===undefined&&replacements.has(id))index=legend.get(replacements.get(id));
    if(index===undefined)index=resolutions.get(id);
    if(index===undefined){if(!unknown.has(id))unknown.set(id,{rgba,count:0,pixels:[]});const item=unknown.get(id);item.count++;if(item.pixels.length<256)item.pixels.push({x:pixel%decoded.width,y:Math.floor(pixel/decoded.width),imageId:String(input.imageId||'image:0'),imageLabel:String(input.imageLabel||'Submitted palette image')});continue}
    indices[pixel]=index;
  }
  for(const item of unknown.values())conflicts.push({code:'COLOR_OUTSIDE_LEGEND',...item,message:`RGBA ${key(item.rgba)} is outside the reviewed swatch legend.`});
  const colors=Array.from({length:256},(_,index)=>byIndex.get(index)||[0,0,0,index===0?0:255]);
  if(conflicts.length){
    const blinkMask=conflicts.flatMap(item=>item.pixels||[]).sort((a,b)=>String(a.imageId).localeCompare(String(b.imageId))||a.y-b.y||a.x-b.x),imageIds=[...new Set(blinkMask.map(item=>item.imageId))],affectedPixels=conflicts.reduce((total,item)=>total+(Number.isInteger(item.count)?item.count:(item.pixels||[]).length),0);
    return{ready:false,conflicts,legend:[...byIndex].map(([index,rgba])=>({index,rgba})),blinkMask,summary:{affectedImages:imageIds.length,affectedPixels,affectedColors:new Set(conflicts.map(item=>key(item.rgba||[]))).size},firstOccurrence:blinkMask[0]||null,originalHash:sha(input.bytes)};
  }
  const bytes=encodeIndexedPng({width:decoded.width,height:decoded.height},indices,colors,{bitDepth:8}),reopened=readIndexedPng(bytes);
  return{ready:true,conflicts:[],legend:[...byIndex].map(([index,rgba])=>({index,rgba})),bytes,originalHash:sha(input.bytes),outputHash:sha(bytes),indexPlaneHash:reopened.indexPlaneHash,paletteHash:reopened.paletteHash,provenance:{kind:'reviewed-visible-swatch-legend',templateByteHash:String(template.sourceByteHash||''),zoneHash:sha(Buffer.from(JSON.stringify(document.zones))),exactOnly:true,originalPreserved:true}};
}
module.exports={recover};
