"use strict";
// Capture a source-art anchor once. A common authored Start displacement preserves
// group-relative positions; each layer still follows its own projection.
function stageDragProjection(projection,model,item,sprite,camera,runtime,point){
 const fail=reason=>({supported:false,reason});
 if(Number.isInteger(model.stageInfo?.zOffsetLink)&&model.stageInfo.zOffsetLink>=0)return fail('Pointer drag is unavailable while a BG controls the standing line; use numeric Start.');
 if(item.action!=null&&!(item.type==='normal'&&item.sprite))return fail('Animated artwork pointer drag needs a verified frame adapter; use numeric Start.');
 if(model.backgrounds?.some(bg=>(parseInt(bg.raw?.positionlink,10)||0)!==0))return fail('Position-linked groups need a verified drag adapter; use numeric Start.');
 const base=projection.project(model,item,sprite,camera,runtime);if(!base.supported)return fail(base.reason+' Use numeric Start.');if(item.type==='normal'&&(Math.abs(base.native.shear)>.001||Math.abs((base.top.right-base.top.left)-(base.bottom.right-base.bottom.left))>.001))return fail('Normal BG parallax-like autoresize needs runtime verification; use numeric Start.');
 const t=Math.max(0,Math.min(1,(point.y-base.top.y)/(base.bottom.y-base.top.y))),row=projection.row(base,t),copy=(item.tile?.[0]||0)!==0?Math.floor((point.x-row.left)/row.width):0,u=(point.x-row.left)/row.width-copy;
 const anchor=p=>{const r=projection.row(p,t);return[r.left+(copy+u)*r.width,r.y];},origin=anchor(base),columns=[];
 for(let axis=0;axis<2;axis++){
  const shifted={...runtime,start:[...(runtime.start||item.start)]};shifted.start[axis]+=4;
  if(runtime.motionRow){shifted.motionRow={...runtime.motionRow,start:[...(runtime.motionRow.start||item.start)],position:[...runtime.motionRow.position]};shifted.motionRow.start[axis]+=4;shifted.motionRow.position[axis]+=4;}
  const p=projection.project(model,item,sprite,camera,shifted);if(!p.supported)return fail(p.reason);const a=anchor(p);columns.push(a.map((v,i)=>(v-origin[i])/4));
 }
 const [a,c]=columns[0],[b,d]=columns[1],det=a*d-b*c;if(!Number.isFinite(det)||Math.abs(det)<1e-7)return fail('Projected drag is singular; use numeric Start.');
 return{supported:true,t,copy,u,origin,derivative:[a,b,c,d],shift(dx,dy){return[(d*dx-b*dy)/det,(-c*dx+a*dy)/det];}};
}
module.exports={stageDragProjection};
