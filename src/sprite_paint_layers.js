'use strict';

function compositeIndexedPaintLayers(layers, width, height, colors) {
  const count=width*height,rgba=new Uint8ClampedArray(count*4),indices=new Int16Array(count).fill(-1);
  for(const layer of layers){
    if(!layer.visible||!(layer.opacity>0))continue;
    const opacity=Math.min(1,layer.opacity);
    for(let pixel=0;pixel<count;pixel++){
      const index=layer.pixels[pixel];if(index<=0)continue;
      const color=colors[index]||[0,0,0,255],sourceAlpha=(color[3]??255)/255*opacity;if(!sourceAlpha)continue;
      const at=pixel*4,destinationAlpha=rgba[at+3]/255,alpha=sourceAlpha+destinationAlpha*(1-sourceAlpha);
      for(let channel=0;channel<3;channel++)rgba[at+channel]=Math.round((color[channel]*sourceAlpha+rgba[at+channel]*destinationAlpha*(1-sourceAlpha))/alpha);
      rgba[at+3]=Math.round(alpha*255);indices[pixel]=index;
    }
  }
  return {rgba,indices};
}
function clientScript(){return compositeIndexedPaintLayers.toString();}
module.exports={compositeIndexedPaintLayers,clientScript};
