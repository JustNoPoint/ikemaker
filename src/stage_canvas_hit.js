'use strict';
function stageCanvasHit(bounds,backgrounds,point,insideWindow=()=>true){
 const indices=Object.keys(bounds).map(Number).filter(i=>bounds[i]&&backgrounds[i]).sort((a,b)=>(backgrounds[b].layer-backgrounds[a].layer)||b-a);
 for(const index of indices){
  const box=bounds[index];if(!insideWindow(backgrounds[index],point))continue;
  let x=point.x,y=point.y;
  if(box.transform){const t=box.transform,r=-t.angle*Math.PI/180,dx=x-t.x,dy=y-t.y,rx=dx*Math.cos(r)-dy*Math.sin(r),ry=dx*Math.sin(r)+dy*Math.cos(r);x=t.x+rx-t.shear*ry;y=t.y+ry;}
  if(box.parallaxHit){const p=box.parallaxHit;if(p.h<=0||y<p.y||y>=p.y+p.h)continue;const t=(y-p.y)/p.h,width=p.top.width+(p.bottom.width-p.top.width)*t,left=p.top.left+(p.bottom.left-p.top.left)*t;if(x>=left+p.first*width&&x<left+(p.last+1)*width)return index;}
  else {const rectangles=box.hitRects||[box];if(rectangles.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))return index;}
 }
 return undefined;
}
module.exports={stageCanvasHit};
