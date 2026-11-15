'use strict';

function maskSelection(width, height, mask) {
  let left=width,top=height,right=-1,bottom=-1;
  for(let pixel=0;pixel<mask.length;pixel++)if(mask[pixel]){const x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return right<left?null:{x:left,y:top,w:right-left+1,h:bottom-top+1,mask};
}

function wandPixelSelection(width, height, pixels, channels, x, y, contiguous = true) {
  const count=width*height,mask=new Uint8Array(count),origin=y*width+x;
  const matches=pixel=>{for(let channel=0;channel<channels;channel++)if(pixels[pixel*channels+channel]!==pixels[origin*channels+channel])return false;return true;};
  if(!contiguous){for(let pixel=0;pixel<count;pixel++)if(matches(pixel))mask[pixel]=1;return maskSelection(width,height,mask);}
  const visited=new Uint8Array(count),queue=[origin];visited[origin]=1;
  while(queue.length){const pixel=queue.pop();if(!matches(pixel))continue;mask[pixel]=1;const px=pixel%width,py=Math.floor(pixel/width);
    for(const next of [pixel-1,pixel+1,pixel-width,pixel+width])if(next>=0&&next<count&&!visited[next]&&(next%width===px||Math.floor(next/width)===py)){visited[next]=1;queue.push(next);}
  }
  return maskSelection(width,height,mask);
}

function movePixelSelection(source, width, height, channels, selection, dx, dy, clear) {
  const pixels=source.slice(),mask=new Uint8Array(width*height),selected=[];
  for(let y=selection.y;y<selection.y+selection.h;y++)for(let x=selection.x;x<selection.x+selection.w;x++){
    const from=y*width+x;if(!selection.mask||selection.mask[from])selected.push({from,x:x+dx,y:y+dy});
  }
  for(const pixel of selected)for(let channel=0;channel<channels;channel++)pixels[pixel.from*channels+channel]=clear[channel];
  for(const pixel of selected){if(pixel.x<0||pixel.y<0||pixel.x>=width||pixel.y>=height)continue;const to=pixel.y*width+pixel.x;mask[to]=1;for(let channel=0;channel<channels;channel++)pixels[to*channels+channel]=source[pixel.from*channels+channel];}
  return {pixels,selection:maskSelection(width,height,mask)};
}

function clientScript(){return [maskSelection,wandPixelSelection,movePixelSelection].map(fn=>fn.toString()).join('\n');}
module.exports={maskSelection,wandPixelSelection,movePixelSelection,clientScript};
