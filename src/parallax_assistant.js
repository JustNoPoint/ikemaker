"use strict";
const {parallaxDimensions}=require('./stage_model');
const projection=require('./stage_parallax_projection');
function reasons(model,item,sprite,zooms){
 const out=[];
 if(!Array.isArray(model?.camera?.bounds)||!model.camera.bounds.slice(0,2).every(Number.isFinite)||model.camera.bounds[0]>model.camera.bounds[1]||!model.camera.start?.every(Number.isFinite))out.push('Camera bounds or start are invalid.');
 if(!zooms.length||zooms.some(z=>!Number.isFinite(z)||z<=0))out.push('Positive camera zoom values are required.');
 if(!Number.isInteger(item.tile?.[0]??0))out.push('Horizontal tile count must be a literal integer.');
 const result=projection.project(model,item,sprite,{x:model.camera?.start?.[0]||0,y:model.camera?.start?.[1]||0,zoom:zooms[0]||1},{allowRaster:true});
 if(!result.supported)out.push(result.reason);
 return out;
}
function sampleParallax(model,item,sprite,cameraX,zoom){
 if(!item||item.type!=='parallax'||!Number.isFinite(cameraX)||reasons(model,item,sprite,[zoom]).length)return null;
 const projected=projection.project(model,item,sprite,{x:cameraX,y:model.camera.start[1],zoom},{allowRaster:true}),viewport=projected.viewport,clip=projected.clip||{x:0,y:0,w:viewport.right,h:viewport.bottom};
 const first=Math.max(viewport.top,projected.top.y,clip.y),last=Math.min(viewport.bottom,projected.bottom.y,clip.y+clip.h),width=viewport.right;
 if(last<=first||clip.w<=0||clip.x>=width||clip.x+clip.w<=0)return{cameraX,zoom,visible:false,clip,covered:null,gapLeft:0,gapRight:0};
 const edge=y=>{const t=(y-projected.top.y)/(projected.bottom.y-projected.top.y),row=projection.row(projected,t),flag=item.tile?.[0]||0;let left=row.left,right=row.right;if(flag===1){left=Math.min(0,left);right=Math.max(width,right);}else if(flag!==0)right=left+row.width*(flag<0?2147483647:flag);if(projected.clip){left=Math.max(left,clip.x);right=Math.min(right,clip.x+clip.w);}return{left,right,width:Math.max(0,right-left),gapLeft:Math.min(width,Math.max(0,left)),gapRight:Math.min(width,Math.max(0,width-right)),covered:left<=0&&right>=width};};
 const top=edge(first),bottom=edge(last);return{cameraX,zoom,visible:true,clip,visibleRows:[first,last],top,bottom,left:Math.min(top.left,bottom.left),right:Math.max(top.right,bottom.right),width:Math.max(top.width,bottom.width),gapLeft:Math.max(top.gapLeft,bottom.gapLeft),gapRight:Math.max(top.gapRight,bottom.gapRight),covered:top.covered&&bottom.covered};
}
function analyzeParallax(model,item,sprite){
 if(!item||item.type!=='parallax')return null;
 const zooms=Array.isArray(model?.camera?.zoom)?[...new Set(model.camera.zoom)]:[],unsupported=reasons(model,item,sprite,zooms),shape=parallaxDimensions(item,sprite?.width);
 if(unsupported.length)return{shape,samples:[],failing:null,maxGap:null,coverage:'unknown',label:'Not evaluated',note:unsupported.join(' ')+' Verify this background in IKEMEN.'};
 const cameras=[...new Set([model.camera.bounds[0],model.camera.start[0],model.camera.bounds[1]])],samples=zooms.flatMap(zoom=>cameras.map(x=>sampleParallax(model,item,sprite,x,zoom))),visible=samples.filter(s=>s.visible!==false);
 if(!visible.length)return{shape,samples,failing:0,maxGap:0,coverage:'not-visible',label:'No visible rows at sampled cameras',note:'Artwork is outside the viewport or excluded by clipping at sampled poses. This does not establish coverage by other layers.'};
 const failing=visible.filter(s=>!s.covered);return{shape,samples,failing:failing.length,maxGap:failing.reduce((n,s)=>Math.max(n,s.gapLeft,s.gapRight),0),coverage:failing.length?'review':'covered',label:failing.length?'Estimated edge gaps':'No estimated edge gaps',note:'Checks visible row endpoints after viewport/window clipping at camera bounds/start and declared zoom endpoints, using starting camera Y and shared native-source projection. This is horizontal geometry only, not vertical coverage or opaque artwork. Other layers may fill intentional gaps. Runtime aspect/viewport corrections and dynamic controllers require IKEMEN verification.'};
}
module.exports={sampleParallax,analyzeParallax};
