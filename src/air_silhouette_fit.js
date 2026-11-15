'use strict';
const MAX_PIXELS=16000000,MAX_ANALYSIS=128000000;
const area=rect=>(rect[2]-rect[0]+1)*(rect[3]-rect[1]+1);
function transformedMask(image,sprite,frame,cutoff) {
  const width=image.width,height=image.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_PIXELS||image.mask&&image.mask.length!==width*height||!image.mask&&image.rgba?.length!==width*height*4)throw Error('Silhouette input exceeds the 16-million-pixel analysis limit or has invalid dimensions.');
  const opaque=index=>image.mask?!!image.mask[index]:image.rgba[index*4+3]>=cutoff,[a,b,c,d,e,f]=require('./air_visual').runtime().transform(frame);
  if(![a,b,c,d,e,f].every(Number.isFinite)||Math.abs(a*d-b*c)<1e-12)return null;
  const det=a*d-b*c,point=(x,y)=>[a*(x-sprite.axisX)+c*(y-sprite.axisY)+e,b*(x-sprite.axisX)+d*(y-sprite.axisY)+f];
  const corners=[point(0,0),point(width,0),point(0,height),point(width,height)],epsilon=1e-9;
  const minX=Math.floor(Math.min(...corners.map(p=>p[0]))+epsilon),minY=Math.floor(Math.min(...corners.map(p=>p[1]))+epsilon),maxX=Math.ceil(Math.max(...corners.map(p=>p[0]))-epsilon)-1,maxY=Math.ceil(Math.max(...corners.map(p=>p[1]))-epsilon)-1;
  const tw=maxX-minX+1,th=maxY-minY+1;
  if(![minX,minY,maxX,maxY].every(Number.isSafeInteger)||Math.max(...[minX,minY,maxX,maxY].map(Math.abs))>1000000||!Number.isSafeInteger(tw*th)||tw*th>MAX_PIXELS)throw Error('The transformed silhouette exceeds the 16-million-pixel or coordinate analysis limit. Reduce scale or rotation before generating boxes.');
  if(tw<1||th<1)return null;
  // Sample destination pixel centers so enlarged pixels form a solid area instead of separated points.
  let mask=new Uint8Array(tw*th);let found=false,left=tw,top=th,right=-1,bottom=-1;
  const rightAngle=Math.abs((Number(frame.angle)||0)/90-Math.round((Number(frame.angle)||0)/90))<1e-9;
  const offsets=rightAngle?[[.5,.5]]:[[.5,.5],[.0001,.0001],[.9999,.0001],[.0001,.9999],[.9999,.9999]];
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
    for(const [ox,oy]of offsets){
      const dx=x+minX+ox-e,dy=y+minY+oy-f,sx=Math.floor((d*dx-c*dy)/det+sprite.axisX+epsilon),sy=Math.floor((-b*dx+a*dy)/det+sprite.axisY+epsilon);
      if(sx>=0&&sy>=0&&sx<width&&sy<height&&opaque(sy*width+sx)){mask[y*tw+x]=1;found=true;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);break;}
    }
  }
  if(!found)return null;
  // Canvas may antialias a free-angle edge into the neighboring destination pixel.
  // Keep a one-pixel guard for that fringe; right-angle fits remain exact.
  if(!rightAngle){const guarded=new Uint8Array(mask);for(let y=0;y<th;y++)for(let x=0;x<tw;x++)if(mask[y*tw+x])for(let gy=Math.max(0,y-1);gy<=Math.min(th-1,y+1);gy++)for(let gx=Math.max(0,x-1);gx<=Math.min(tw-1,x+1);gx++){guarded[gy*tw+gx]=1;left=Math.min(left,gx);top=Math.min(top,gy);right=Math.max(right,gx);bottom=Math.max(bottom,gy);}mask=guarded;}
  const croppedWidth=right-left+1,croppedHeight=bottom-top+1,cropped=new Uint8Array(croppedWidth*croppedHeight);
  for(let y=0;y<croppedHeight;y++)cropped.set(mask.subarray((top+y)*tw+left,(top+y)*tw+right+1),y*croppedWidth);
  return {width:croppedWidth,height:croppedHeight,mask:cropped,originX:minX+left,originY:minY+top};
}
function merge(a,b) {if(!a)return b&&b.slice();if(!b)return a.slice();return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];}
function bestSplit(image,rect,layout,budget) {
  const rows=Array.from({length:rect[3]-rect[1]+1},()=>null),columns=layout==='stacked'?null:Array.from({length:rect[2]-rect[0]+1},()=>null);
  budget.visits+=area(rect);if(budget.visits>MAX_ANALYSIS)throw Error('The requested box fit exceeds the bounded analysis budget. Use fewer boxes or a smaller sprite.');
  for(let y=rect[1];y<=rect[3];y++)for(let x=rect[0];x<=rect[2];x++)if(image.mask[y*image.width+x]){rows[y-rect[1]]=merge(rows[y-rect[1]],[x,y,x,y]);if(columns)columns[x-rect[0]]=merge(columns[x-rect[0]],[x,y,x,y]);}
  let best=null;
  const inspect=strips=>{const prefix=[],suffix=[];for(let i=0;i<strips.length;i++)prefix[i]=merge(i?prefix[i-1]:null,strips[i]);for(let i=strips.length-1;i>=0;i--)suffix[i]=merge(i+1<strips.length?suffix[i+1]:null,strips[i]);for(let i=0;i<strips.length-1;i++){const left=prefix[i],right=suffix[i+1];if(!left||!right)continue;const saved=area(rect)-area(left)-area(right),balance=Math.abs(area(left)-area(right));if(!best||saved>best.saved||saved===best.saved&&balance<best.balance)best={saved,balance,parts:[left,right]};}};
  if(layout!=='side-by-side')inspect(rows);if(columns)inspect(columns);
  return best;
}
function evenSplit(width,height,count,layout) {
  const columns=layout==='side-by-side'||layout==='auto'&&width>height,length=columns?width:height,n=Math.min(count,length),boxes=[];
  for(let index=0;index<n;index++){const start=index===0?0:Math.floor(index*length/n)-1,end=Math.floor((index+1)*length/n)-1;boxes.push(columns?[start,0,end,height-1]:[0,start,width-1,end]);}
  return boxes;
}
function closeSeams(boxes) {
  for(let i=0;i<boxes.length;i++)for(let j=0;j<boxes.length;j++){if(i===j)continue;const a=boxes[i],b=boxes[j];if(a[3]+1===b[1]&&Math.max(a[0],b[0])<=Math.min(a[2],b[2]))a[3]=b[1];if(a[2]+1===b[0]&&Math.max(a[1],b[1])<=Math.min(a[3],b[3]))a[2]=b[0];}
  return boxes;
}
function fitSilhouette(image,sprite,frame,{count=3,layout='stacked',alphaThreshold=32}={}) {
  if(image?.hasAlpha===false)return [];
  const transformed=transformedMask(image,sprite,frame,alphaThreshold);if(!transformed)return [];
  const {width,height,mask,originX,originY}=transformed;
  let boxes;
  if(mask.every(value=>value===1))boxes=evenSplit(width,height,count,layout);
  else{
    const budget={visits:0},first=[0,0,width-1,height-1],parts=[{rect:first,split:bestSplit(transformed,first,layout,budget)}];
    while(parts.length<count){let chosen=-1;for(let index=0;index<parts.length;index++)if(parts[index].split&&(chosen<0||parts[index].split.saved>parts[chosen].split.saved||parts[index].split.saved===parts[chosen].split.saved&&parts[index].split.balance<parts[chosen].split.balance))chosen=index;if(chosen<0)break;const split=parts[chosen].split.parts.map(rect=>({rect,split:bestSplit(transformed,rect,layout,budget)}));parts.splice(chosen,1,...split);}
    boxes=closeSeams(parts.map(part=>part.rect));
  }
  return boxes.sort((a,b)=>a[1]-b[1]||a[0]-b[0]).map(rect=>[rect[0]+originX,rect[1]+originY,rect[2]+originX,rect[3]+originY]);
}
module.exports={fitSilhouette,transformedMask,evenSplit,closeSeams,MAX_PIXELS,MAX_ANALYSIS};
