'use strict';

const crypto = require('crypto');
const { resolvedSprite, spriteIndexPlane, spritePng, rgbaPng, parseSffBuffer, indexedSourcePng, paletteRgba, friendlyVersion } = require('./sff_reader');
const { decodePng } = require('./palette_index_organizer_model');
const { rgbPng } = require('./sprite_truecolor_edit');
const { scalePlane, rotatePlane, roundAway } = require('./sff_sprite_resample');
const { rewriteSpriteRows } = require('./sff_direct_delete');
const OPERATIONS = Object.freeze(['crop','canvas','scale','flip-x','flip-y','rotate-cw','rotate-ccw','rotate-180','rotate-free','shift-axes']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const validAxis = axis => Number.isInteger(axis) && axis >= -32768 && axis <= 32767;

function pixelPlane(archive, sprite) {
  const source = resolvedSprite(archive,sprite);
  if (source.width * source.height > 1000000) throw new Error('Each transformed image is limited to one million pixels.');
  if ([5,8].includes(source.colorDepth)) {
    const plane = spriteIndexPlane(archive,sprite);
    return { width:plane.width,height:plane.height,pixels:plane.indices,channels:1,colorDepth:8 };
  }
  if (![24,32].includes(source.colorDepth)) throw new Error('This sprite color depth is not supported for transforms.');
  const decoded = decodePng(spritePng(archive,sprite),{maximumDimension:8192,maximumPixels:1000000});
  return {width:decoded.width,height:decoded.height,pixels:Buffer.from(decoded.rgba),channels:4,colorDepth:source.colorDepth};
}

function transformedPlane(plane, sprite, operation, options={}) {
  let width=plane.width,height=plane.height,axisX=sprite.axisX,axisY=sprite.axisY;
  let sample=(x,y)=>[x,y];
  if (operation==='crop') {
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=(y*width+x)*plane.channels,visible=plane.channels===1?plane.pixels[at]!==0:plane.colorDepth===24||plane.pixels[at+3]>0;
      if(visible){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    }
    if(right<left)throw new Error('A fully transparent sprite cannot be automatically cropped.');
    width=right-left+1;height=bottom-top+1;axisX-=left;axisY-=top;
    sample=(x,y)=>[x+left,y+top];
  } else if(operation==='canvas') {
    width=Number(options.width);height=Number(options.height);
    if(!['center','top-left','bottom-center'].includes(options.anchor||'center'))throw new Error('Choose a canvas placement anchor.');
    const anchor=options.anchor||'center';
    const dx=anchor==='top-left'?0:Math.trunc((width-plane.width)/2);
    const dy=anchor==='top-left'?0:anchor==='bottom-center'?height-plane.height:Math.trunc((height-plane.height)/2);
    axisX+=dx;axisY+=dy;sample=(x,y)=>[x-dx,y-dy];
  } else if(operation==='scale') {
    const x=Number(options.percentX),y=Number(options.percentY);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<1||y<1||x>800||y>800)throw new Error('Pixel scale must be from 1 through 800 percent on each axis.');
    const scaled=scalePlane(plane,sprite,Math.max(1,roundAway(width*x/100)),Math.max(1,roundAway(height*y/100)),options.interpolation||'nearest');
    if(!validAxis(scaled.axisX)||!validAxis(scaled.axisY))throw new Error('The scaled axes exceed signed 16-bit SFF coordinates.');
    return scaled;
  } else if(operation.startsWith('flip-')||operation.startsWith('rotate-')) {
    const rotated=rotatePlane(plane,sprite,operation,options);
    if(!validAxis(rotated.axisX)||!validAxis(rotated.axisY))throw new Error('The transformed axes exceed signed 16-bit SFF coordinates.');
    return rotated;
  } else throw new Error('Choose a supported pixel transform.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||width*height>1000000)throw new Error('Output must be whole dimensions from 1 through 8192 and at most one million pixels.');
  if(!validAxis(axisX)||!validAxis(axisY))throw new Error('The transformed axes exceed signed 16-bit SFF coordinates.');
  const pixels=Buffer.alloc(width*height*plane.channels);
  // New RGB24 canvas pixels are opaque black; RGBA/indexed canvas pixels are transparent.
  if(plane.channels===4&&plane.colorDepth===24)for(let at=3;at<pixels.length;at+=4)pixels[at]=255;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [sx,sy]=sample(x,y);if(sx<0||sy<0||sx>=plane.width||sy>=plane.height)continue;
    plane.pixels.copy(pixels,(y*width+x)*plane.channels,(sy*plane.width+sx)*plane.channels,(sy*plane.width+sx+1)*plane.channels);
  }
  return {...plane,width,height,pixels,axisX,axisY};
}

function encodedPlane(plane, colors = null) {
  if(plane.channels===1){
    if(!colors)return {data:Buffer.from(plane.pixels),format:0,colorDepth:8};
    const png=indexedSourcePng(plane.width,plane.height,plane.pixels,colors),length=Buffer.alloc(4);length.writeUInt32LE(plane.pixels.length);
    return {data:Buffer.concat([length,png]),format:10,colorDepth:8};
  }
  const png=plane.colorDepth===24?rgbPng(plane.width,plane.height,plane.pixels):rgbaPng(plane.width,plane.height,plane.pixels);
  const size=Buffer.alloc(4);size.writeUInt32LE(plane.width*plane.height*(plane.colorDepth/8));
  return {data:Buffer.concat([size,png]),format:plane.colorDepth===24?11:12,colorDepth:plane.colorDepth};
}

function planSpriteTransforms(archive, indices, operation, options={}) {
  if(!OPERATIONS.includes(operation))throw new Error('Choose a supported sprite transform.');
  const selected=[...new Set(indices)],chosen=new Set(selected);
  if(!selected.length||selected.length>64||!selected.every(Number.isInteger))throw new Error('Select from 1 through 64 physical sprites.');
  if(selected.some(index=>!archive.sprites[index]))throw new Error('A selected sprite no longer exists.');
  if(operation!=='shift-axes'&&archive.header.legacy)throw new Error('SFF v1 pixel transforms require an explicit Creator conversion to SFF v2 first. Axis shifts remain available.');
  const changes=[],materialized=[],relinked=[];
  let buffer;
  if(operation==='shift-axes'){
    const x=Number(options.x),y=Number(options.y);if(!Number.isInteger(x)||!Number.isInteger(y))throw new Error('Axis shift needs whole X/Y amounts.');
    buffer=Buffer.from(archive.buffer);
    for(const index of selected){const sprite=archive.sprites[index],axisX=sprite.axisX+x,axisY=sprite.axisY+y;if(!validAxis(axisX)||!validAxis(axisY))throw new Error('Shifted axes exceed signed 16-bit SFF coordinates.');buffer.writeInt16LE(axisX,sprite.headerOffset+8);buffer.writeInt16LE(axisY,sprite.headerOffset+10);changes.push({index,group:sprite.group,number:sprite.number,before:{width:sprite.width,height:sprite.height,axisX:sprite.axisX,axisY:sprite.axisY},after:{width:sprite.width,height:sprite.height,axisX,axisY},detached:false});}
  }else{
    let totalPixels=0,outputPixels=0;
    const preservedBySource=new Map();
    const rows=archive.sprites.map(sprite=>({...sprite,newIndex:sprite.index,data:sprite.dataSize?Buffer.from(archive.buffer.subarray(sprite.dataOffset,sprite.dataOffset+sprite.dataSize)):null}));
    for(const sprite of archive.sprites){
      const source=resolvedSprite(archive,sprite),row=rows[sprite.index];
      if(chosen.has(sprite.index)){
        totalPixels+=source.width*source.height;if(totalPixels>16000000)throw new Error('A transform batch is limited to 16 million input pixels.');
        const plane=transformedPlane(pixelPlane(archive,sprite),sprite,operation,options);
        outputPixels+=plane.width*plane.height;if(outputPixels>16000000)throw new Error('A transform batch is limited to 16 million output pixels.');
        const encoded=encodedPlane(plane,plane.channels===1&&friendlyVersion(archive.header.version)==='2.1'?paletteRgba(archive,sprite.paletteIndex):null);
        Object.assign(row,encoded,{width:plane.width,height:plane.height,axisX:plane.axisX,axisY:plane.axisY,dataSize:encoded.data.length,link:0});
        changes.push({index:sprite.index,group:sprite.group,number:sprite.number,before:{width:source.width,height:source.height,axisX:sprite.axisX,axisY:sprite.axisY},after:{width:row.width,height:row.height,axisX:row.axisX,axisY:row.axisY},detached:sprite.dataSize===0});
      }else if(sprite.dataSize===0){
        let linked=archive.sprites[sprite.link],affected=false;
        while(linked){if(chosen.has(linked.index)){affected=true;break;}if(linked.dataSize!==0)break;linked=archive.sprites[linked.link];}
        if(!affected)continue;
        if(!chosen.has(source.index)){row.link=source.index;relinked.push(sprite.index);continue;}
        const prior=preservedBySource.get(source.index);
        if(prior!==undefined){row.link=prior;relinked.push(sprite.index);}
        else {Object.assign(row,{data:Buffer.from(archive.buffer.subarray(source.dataOffset,source.dataOffset+source.dataSize)),dataSize:source.dataSize,format:source.format,colorDepth:source.colorDepth,width:source.width,height:source.height,link:0});materialized.push(sprite.index);preservedBySource.set(source.index,sprite.index);}
      }
    }
    buffer=rewriteSpriteRows(archive,rows).buffer;
  }
  const reopened=parseSffBuffer(buffer,archive.filename);
  return {buffer,archive:reopened,operation,options,sourceHash:sha(archive.buffer),changes,materialized,relinked,warning:'Only selected pixels/axes change. Selected image links detach; unselected users of a transformed source retain their original pixels as independent images. Independent palette slots remain assigned.'};
}

module.exports={OPERATIONS,pixelPlane,transformedPlane,encodedPlane,planSpriteTransforms};
