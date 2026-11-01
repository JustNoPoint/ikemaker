'use strict';

const crypto = require('crypto');
const templateFinalization = require('./palette_template_finalization');

const SCHEMA = 'ikemaker.palette-image-template-layout';
const VERSION = 1;
const GAP = 5;
const DEFAULT_ROW_WIDTH = 640;
const MAX_PIXELS = 256000000;
const DEFAULT_EXPORT_PADDING = 10;
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
function integer(value, label, minimum = 0) { const number=Number(value);if(!Number.isSafeInteger(number)||number<minimum)throw new Error(`${label} must be a safe integer of at least ${minimum}.`);return number; }
function sourceImage(value) { return { imageId:String(value.imageId||''),width:integer(value.width,'Image width',1),height:integer(value.height,'Image height',1) }; }
function bounds(items) { const width=Math.max(1,...items.map(item=>item.x+item.width)),height=Math.max(1,...items.map(item=>item.y+item.height));if(width*height>MAX_PIXELS)throw new Error('The cropped template sheet exceeds the reviewed 256-million-pixel limit. Remove unnecessary showcase images or choose the correct invisible background index/color.');return{width,height}; }
function normalize(value = {}, images = []) {
  const source=images.map(sourceImage),prior=new Map((value.items||[]).map(item=>[String(item.imageId||''),item])),items=[];
  const retainedBottom=source.reduce((bottom,image)=>{const retained=prior.get(image.imageId);return retained?Math.max(bottom,integer(retained.y,'Image y')+image.height):bottom},0);
  let cursorX=0,cursorY=retainedBottom?retainedBottom+GAP:0,rowHeight=0;
  for(const image of source){const retained=prior.get(image.imageId);let x,y;if(retained){x=integer(retained.x,'Image x');y=integer(retained.y,'Image y')}else{if(cursorX&&cursorX+image.width>DEFAULT_ROW_WIDTH){cursorX=0;cursorY+=rowHeight+GAP;rowHeight=0}x=cursorX;y=cursorY;cursorX+=image.width+GAP;rowHeight=Math.max(rowHeight,image.height)}items.push({...image,x,y})}
  const canvas=bounds(items),body={schema:SCHEMA,version:VERSION,items,canvas,revision:Math.max(0,Number(value.revision)||0)};return{...body,layoutHash:hash(body)};
}
function move(value, expectedHash, imageId, position, images) { const current=normalize(value,images),target=String(imageId||'');if(String(expectedHash||'')!==current.layoutHash)throw new Error('The template image layout changed before this move. Review the current canvas and try again.');if(!current.items.some(item=>item.imageId===target))throw new Error('The template image is no longer included in this layout. Refresh the canvas before moving it.');const next={...current,items:current.items.map(item=>item.imageId===target?{...item,x:integer(position.x,'Image x'),y:integer(position.y,'Image y')}:item),revision:current.revision+1};delete next.layoutHash;return normalize(next,images); }
function finalize(value,images,padding=DEFAULT_EXPORT_PADDING){const working=normalize(value,images);return templateFinalization.finalize({workingLayout:working,decorations:{lines:[]},padding,maximumPixels:MAX_PIXELS}).outputLayout}

module.exports = { SCHEMA, VERSION, MAX_PIXELS, DEFAULT_EXPORT_PADDING, normalize, move, finalize, bounds };
