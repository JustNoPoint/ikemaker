'use strict';
const crypto=require('crypto');
const {resolvedSprite,paletteRgba}=require('./sff_reader');
const {pixelPlane}=require('./sff_sprite_transforms');
const {rewriteSpriteRows,rewriteOrderedSpriteRows}=require('./sff_direct_delete');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function sourceData(archive,source) {
  return Buffer.from(archive.buffer.subarray(source.dataOffset,source.dataOffset+source.dataSize));
}

function planStorage(archive,operation,indices=[],options={}) {
  if(archive.header.legacy)throw new Error('Convert SFF v1 to v2 before changing archive storage/order.');
  if(!['sort-id','sort-size','sort-selected-id','link','unlink','unlink-all'].includes(operation))throw new Error('Choose a supported archive storage operation.');
  if(options.portraitsFirst!==undefined&&typeof options.portraitsFirst!=='boolean')throw new Error('Portrait-first sorting needs an explicit boolean choice.');
  if(archive.sprites.length>4096)throw new Error('Archive storage review is limited to 4096 physical sprites.');
  let totalPixels=0;
  for(const sprite of archive.sprites){const source=resolvedSprite(archive,sprite);totalPixels+=source.width*source.height;if(source.width*source.height>1000000||totalPixels>16000000)throw new Error('Archive storage verification is limited to one million pixels per image and 16 million total.');}
  const selection=[...new Set(operation==='unlink-all'?archive.sprites.filter(sprite=>!sprite.dataSize).map(sprite=>sprite.index):indices)];
  if(['link','unlink'].includes(operation)&&(!selection.length||selection.length>256||selection.some(index=>!Number.isInteger(index)||!archive.sprites[index])))throw new Error('Select from 1 through 256 exact physical sprites.');
  if(operation==='sort-selected-id'&&(selection.length<2||selection.length>256||selection.some(index=>!Number.isInteger(index)||!archive.sprites[index])))throw new Error('Select from 2 through 256 exact physical sprites to sort within their existing slots.');
  const rows=archive.sprites.map(sprite=>({...sprite,oldIndex:sprite.index,newIndex:sprite.index,data:sprite.dataSize?sourceData(archive,sprite):null}));
  const changes=[],lookupChanges=[];
  let built;
  if(operation.startsWith('sort-')) {
    const byId=(a,b)=>a.group-b.group||a.number-b.number||a.oldIndex-b.oldIndex;
    if(operation==='sort-selected-id'){
      const slots=selection.slice().sort((a,b)=>a-b),ordered=slots.map(index=>rows[index]).sort(byId);
      slots.forEach((slot,index)=>{rows[slot]=ordered[index];});
    }else if(operation==='sort-size')rows.sort((a,b)=>a.width*a.height-b.width*b.height||byId(a,b));
    else rows.sort((a,b)=>(options.portraitsFirst?Number(a.group!==9000)-Number(b.group!==9000):0)||byId(a,b));
    {
      const originalFirst=new Map(),sortedFirst=new Set();
      for(const sprite of archive.sprites)if(!originalFirst.has(sprite.group+','+sprite.number))originalFirst.set(sprite.group+','+sprite.number,sprite.index);
      for(const row of rows){
        const identity=row.group+','+row.number;
        if(sortedFirst.has(identity))continue;
        sortedFirst.add(identity);
        const prior=originalFirst.get(identity);
        if(prior!==row.oldIndex)lookupChanges.push({identity,prior,next:row.oldIndex});
      }
    }
    const ownerPositions=new Map(),positions=new Map(rows.map((row,index)=>[row.oldIndex,index]));
    rows.forEach((row,index)=>{
      const source=resolvedSprite(archive,archive.sprites[row.oldIndex]),prior=ownerPositions.get(source.index);
      row.newIndex=index;
      // Ownership follows original image identity, never an equal-content guess.
      // A link that sorts before its old owner becomes the new payload owner.
      if(prior===undefined){row.data=sourceData(archive,source);row.dataSize=row.data.length;row.link=0;ownerPositions.set(source.index,index);}
      else{const original=archive.sprites[row.oldIndex],direct=original.dataSize?undefined:positions.get(original.link);row.data=null;row.dataSize=0;row.link=Number.isInteger(direct)&&direct<index?direct:prior;}
      for(const key of ['width','height','format','colorDepth','flags'])row[key]=source[key];
      const original=archive.sprites[row.oldIndex],actions=[];
      if(row.oldIndex!==index)actions.push(`physical ${row.oldIndex} → ${index}`);
      if(Boolean(row.data)!==Boolean(original.dataSize)||!row.data&&row.link!==original.link)actions.push(row.data?'store original image independently':`image link to physical ${row.link}`);
      if(actions.length)changes.push({index:row.oldIndex,group:row.group,number:row.number,action:actions.join('; ')});
    });
    built=rewriteOrderedSpriteRows(archive,rows);
  } else {
    const exactOwners=new Map();let pixels=0;
    for(const index of selection.sort((a,b)=>a-b)) {
      const row=rows[index],source=resolvedSprite(archive,archive.sprites[index]);
      if(operation==='unlink'||operation==='unlink-all'){
        if(row.data)continue;
        Object.assign(row,{data:sourceData(archive,source),dataSize:source.dataSize,link:0});
        for(const key of ['width','height','format','colorDepth','flags'])row[key]=source[key];
        changes.push({index,group:row.group,number:row.number,action:'make image data independent'});
      } else {
        const plane=pixelPlane(archive,archive.sprites[index]);pixels+=plane.width*plane.height;
        if(pixels>16000000)throw new Error('Link review is limited to 16 million decoded pixels.');
        const signature=[plane.width,plane.height,plane.channels,plane.colorDepth,sha(plane.pixels)].join(':');
        const prior=exactOwners.get(signature);
        if(prior===undefined){exactOwners.set(signature,index);continue;}
        // Materialize the first selected member if it used an unrelated owner;
        // later exact matches may safely link without involving unselected art.
        const owner=rows[prior];
        if(!owner.data){const original=resolvedSprite(archive,archive.sprites[prior]);owner.data=sourceData(archive,original);owner.dataSize=owner.data.length;owner.link=0;for(const key of ['width','height','format','colorDepth','flags'])owner[key]=original[key];changes.push({index:prior,group:owner.group,number:owner.number,action:'store exact image as selected shared source'});}
        if(!row.data&&row.link===prior)continue;
        row.data=null;row.dataSize=0;row.link=prior;
        for(const key of ['width','height','format','colorDepth','flags'])row[key]=owner[key];
        changes.push({index,group:row.group,number:row.number,action:`share exact image with physical ${prior}; assigned palette retained`});
      }
    }
    built=rewriteSpriteRows(archive,rows);
  }
  // Compare by original physical occurrence, so duplicate group/index entries
  // cannot accidentally substitute for each other during an order review.
  for(let index=0;index<rows.length;index++){
    const before=archive.sprites[rows[index].oldIndex],after=built.archive.sprites[index];
    const oldPlane=pixelPlane(archive,before),newPlane=pixelPlane(built.archive,after);
    if(after.axisX!==before.axisX||after.axisY!==before.axisY||after.paletteIndex!==before.paletteIndex||newPlane.width!==oldPlane.width||newPlane.height!==oldPlane.height||newPlane.colorDepth!==oldPlane.colorDepth||!newPlane.pixels.equals(oldPlane.pixels))throw new Error('Archive storage verification changed rendered pixels, axes or palette assignment.');
  }
  for(let index=0;index<archive.palettes.length;index++)if(JSON.stringify(paletteRgba(archive,index))!==JSON.stringify(paletteRgba(built.archive,index)))throw new Error('Archive storage verification changed palette colors.');
  return {...built,operation,changes,lookupChanges,sourceHash:sha(archive.buffer),order:rows.map(row=>row.oldIndex)};
}

module.exports={planStorage};
