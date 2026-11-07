'use strict';
// Stage Animation.Draw adapter over the shared static-normal BG transform.
// ReadAnimFrame stores H/V-negated offsets; Draw's signed H/V multiplies them
// again, and AIR element scale divides out of xoff/yoff (anim.go75–88,1084).
// Sprite axis and dimensions DO use signed element scale. Stage start_scale=1,
// airOffsetFix={1,1}, phantomPixel=false. No animation interpolation is inferred.
function stageAnimationProjection(projection,model,item,sprite,frame,camera,runtime={}){
 const fail=reason=>({supported:false,reason,reasons:[reason]});
 if(item.type==='parallax')return fail('Animated parallax requires a verified frame adapter.');
 if(!frame||!Array.isArray(frame.scale)||frame.scale.length!==2||!frame.scale.every(n=>Number.isFinite(n)&&n!==0&&Math.abs(n)<=10000)||!Array.isArray(frame.offset)||frame.offset.length!==2||!frame.offset.every(n=>Number.isInteger(n)&&Math.abs(n)<=2147483647)||!/^(?:H?V?|VH)$/.test(frame.flags||'')||frame.angle||frame.blend||frame.interpolate?.length)return fail('AIR frame transform is unsupported or blank.');
 const base=projection.project(model,{...item,type:'normal',action:null,sprite:[0,0]},sprite?{...sprite,axisX:0,axisY:0}:sprite,camera,runtime);if(!base.supported)return base;
 if(Math.abs(base.native.shear)>.001||Math.abs((base.top.right-base.top.left)-(base.bottom.right-base.bottom.left))>.001)return fail('Normal AIR autoresize producing a trapezoid needs runtime verification.');
 const f=Math.fround,local=base.native.local,bg=[base.native.xt/local,base.native.hy/local],sign=[String(frame.flags||'').includes('H')?-1:1,String(frame.flags||'').includes('V')?-1:1],scale=bg.map((n,i)=>f(f(n*frame.scale[i])*sign[i])),origin=[f(base.top.left+f(bg[0]*frame.offset[0])),f(base.top.y+f(bg[1]*frame.offset[1]))],start=origin.map((n,i)=>f(n-f(scale[i]*(i?sprite.axisY:sprite.axisX)))),size=[f(sprite.width*scale[0]),f(sprite.height*scale[1])],left=Math.min(start[0],start[0]+size[0]),top=Math.min(start[1],start[1]+size[1]),w=Math.abs(size[0]),h=Math.abs(size[1]);
 if(![...scale,...origin,...start,...size,left,top,w,h,left+w,top+h].every(Number.isFinite)||w<=0||h<=0)return fail('AIR projected frame is nonfinite or degenerate.');
 return{...base,top:{left,right:left+w,y:top},bottom:{left,right:left+w,y:top+h},frameGeometry:{w,h,scale,origin,flip:scale.map(n=>n<0)},native:{...base.native,frameScale:scale}};
}
module.exports={stageAnimationProjection};
