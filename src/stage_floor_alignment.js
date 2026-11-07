'use strict';
// Self-contained so the generated preview and host review use exactly the same math.
function floorCameraRounding(model){
 const value=(name,key)=>model.source?.sections?.find(s=>s.normalized===name)?.entries?.find(e=>e.normalized===key)?.value;
 const mugen=Number.parseInt(value('info','mugenversion')||'0',10),ikemen=Number.parseFloat(value('info','ikemenversion')||'0'),raw=value('bgdef','roundpos');
 return raw==null?mugen!==1&&!ikemen:!['0','false'].includes(String(raw).trim().toLowerCase());
}
function floorAlignment(model,item,sprite,options={}){
 const fail=reason=>({supported:false,reason}),pair=x=>Array.isArray(x)&&x.length>=2&&x.slice(0,2).every(Number.isFinite),same=(x,a,b)=>x==null||pair(x)&&x[0]===a&&x[1]===b;
 if(!model||!item||!sprite||![sprite.width,sprite.height,sprite.axisX,sprite.axisY].every(Number.isFinite)||sprite.width<=0||sprite.height<=0)return fail('The selected background needs decoded sprite dimensions and axes.');
 if(!['normal','parallax'].includes(item.type)||item.action!=null)return fail('Only static normal or explicit-width parallax artwork is supported.');
 if(!pair(item.start)||!pair(item.delta)||!pair(item.scaleStart)||item.scaleStart.some(x=>x<=0)||!pair(model.localCoord)||!pair(model.camera?.bounds)||model.camera.bounds.length<4||!model.camera.bounds.every(Number.isFinite))return fail('Position, scale or camera bounds are invalid.');
 if(model.stageInfo?.xScale!==1||model.stageInfo?.yScale!==1||!model.camera.zoom?.every(x=>x===1)||options.zoom!==1)return fail('Use an unzoomed, unit-stage-scale camera; custom zoom/camera corrections are not modelled.');
 const inheritedRound=typeof model.floorCameraRounding==='boolean'?model.floorCameraRounding:floorCameraRounding(model),explicitRound=item.raw?.roundpos;
 if(explicitRound==null?(item.roundPos==null&&inheritedRound||item.roundPos===1):!['0','false'].includes(String(explicitRound).trim().toLowerCase()))return fail('Camera pixel rounding is enabled or inherited from legacy version defaults; fractional row matching is not supported.');
 if(model.attachedChars?.length)return fail('Attached-character Stage writes cannot be ruled out; this tool only certifies static artwork.');
 if(model.controllers?.length||!same(item.velocity,0,0)||!same(item.scaleDelta,0,0)||item.yScaleDelta||item.yScaleStart!==100||item.roundPos===1||item.raw&&['positionlink','sin.x','sin.y'].some(k=>item.raw[k]!=null))return fail('Animated, linked, rounded or controller-driven geometry is not supported.');
 if(['angle','xAngle','yAngle','xShear'].some(k=>item[k])||item.projection&&item.projection!=='orthographic'||item.window||item.maskWindow||item.autoResizeParallax||item.xBottomZoomDelta!=null||!same(item.zoomDelta,1,1)||!same(item.zoomScaleDelta,0,0))return fail('Transformed, clipped or custom-zoom artwork is not supported.');
 if(item.tile?.[1])return fail('Vertically repeated artwork has an ambiguous source row.');
 const parallax=item.type==='parallax';if(parallax&&(!pair(item.width)||item.width.some(x=>!Number.isInteger(x)||x<=0)||item.tile?.some(x=>x!==0)))return fail('Parallax requires positive explicit widths and no repeated tiles; xscale/raster assumptions are unsupported.');
 const camera=options.camera;if(!pair(camera)||!Number.isFinite(options.groundRow))return fail('Choose a finite ground row and reference camera.');
 const [sx,sy]=item.scaleStart,W=sprite.width,H=sprite.height,C=model.localCoord[0]/2,round=x=>Math.round(x*1e9)/1e9;
 let anchor=options.anchor,point=options.point;
 if(!anchor&&pair(point)){
  const v=(point[1]-item.start[1]+camera[1]*item.delta[1])/sy+sprite.axisY;
  if(parallax){const ratio=1+(item.width[1]/item.width[0]-1)*v/H,rowWidth=(item.width[0]+(item.width[1]-item.width[0])*v/H)*sx;anchor={u:(point[0]-C-(item.start[0]-camera[0]*item.delta[0])*ratio)/rowWidth*W+W/2,v,tile:0};}
  else{const origin=C+item.start[0]-camera[0]*item.delta[0]-sprite.axisX*sx,stride=(W+(item.tileSpacing?.[0]||0))*sx;let tile=item.tile?.[0]?Math.floor((point[0]-origin)/stride):0;if(!Number.isFinite(tile)||stride<=0&&item.tile?.[0])return fail('Nonpositive tile stride is not supported.');anchor={u:(point[0]-origin-tile*stride)/sx,v,tile};}
 }
 if(!anchor||![anchor.u,anchor.v,anchor.tile].every(Number.isFinite)||!Number.isSafeInteger(anchor.tile)||anchor.u<0||anchor.u>W||anchor.v<0||anchor.v>H)return fail('Click inside the selected artwork, outside tile-spacing gaps.');
 if(parallax&&anchor.tile!==0||!parallax&&(!item.tile?.[0]&&anchor.tile!==0||item.tile?.[0]>1&&(anchor.tile<0||anchor.tile>=item.tile[0])||item.tile?.[0]<0&&anchor.tile<0))return fail('The clicked tile is outside the authored repeat range.');
 const q=parallax?1+(item.width[1]/item.width[0]-1)*anchor.v/H:1;if(!Number.isFinite(q)||q<=0)return fail('The selected row has unsupported parallax convergence.');
 const delta=[round(1/q),item.delta[1]],start=[round(item.start[0]+camera[0]*(delta[0]-item.delta[0])),item.start[1]],candidateY=round(options.groundRow-camera[1]+camera[1]*item.delta[1]+(sprite.axisY-anchor.v)*sy);
 if(options.alignVertical===true)start[1]=candidateY;
 const measure=(position,d)=>{const xs=[model.camera.bounds[0],camera[0],model.camera.bounds[1]],ys=[model.camera.bounds[2],camera[1],model.camera.bounds[3]],horizontal=xs.map(x=>(1-d[0]*q)*(x-camera[0])),vertical=ys.map(y=>position[1]+(anchor.v-sprite.axisY)*sy-y*d[1]-(options.groundRow-y));return{horizontalDrift:Math.max(...horizontal)-Math.min(...horizontal),verticalDrift:Math.max(...vertical)-Math.min(...vertical),referenceGroundGap:position[1]+(anchor.v-sprite.axisY)*sy-camera[1]*d[1]-(options.groundRow-camera[1]),samples:xs.map((x,i)=>({cameraX:x,footSlip:horizontal[i]}))};};
 return{supported:true,originalStart:[...item.start],originalDelta:[...item.delta],anchor:{u:round(anchor.u),v:round(anchor.v),tile:anchor.tile},rowFactor:q,start,delta,candidateY,before:measure(item.start,item.delta),after:measure(start,delta),changed:start.some((n,i)=>n!==item.start[i])||delta.some((n,i)=>n!==item.delta[i]),note:'Horizontal foot slip is independent of authored vertical speed. Delta Y is preserved. Camera-sweep figures are geometric estimates, not live engine measurements.'};
}
function parallaxRowGeometry(viewport,startX,cameraX,deltaX,top,bottom,scaleX,row,height){
 const ratio=1+(bottom/top-1)*row/height,center=viewport/2+(startX-cameraX*deltaX)*ratio,width=(top+(bottom-top)*row/height)*scaleX;
 return{center,width,left:center-width/2,ratio};
}
function applyFloorAlignment(text,filename,line,plan){
 if(!plan?.supported)throw Error('No supported alignment plan.');
 if(!plan.changed)return text;
 const {parseDef}=require('./def_model');let next=text;
 for(const [key,value,original]of [['start',plan.start,plan.originalStart],['delta',plan.delta,plan.originalDelta],...(plan.propertyChanges||[]).map(change=>{if(!['width','scalestart'].includes(change.key)||!Array.isArray(change.value)||change.value.length!==2||!change.value.every(n=>Number.isFinite(n)&&n>0))throw Error('Unsupported alignment property change.');return[change.key,change.value,change.original];})]){
  if(original&&value.every((x,i)=>x===original[i]))continue;
  const doc=parseDef(next,filename),section=doc.sections.find(s=>s.line===line);if(!section||!/^bg\s/i.test(section.name))throw Error('The floor section changed.');
  const entry=section.entries.find(e=>e.normalized===key),parts=next.split(/(\r\n|\n|\r)/);
  if(entry){const index=entry.line*2,raw=parts[index],match=raw.match(/^(\s*[^=]+?=\s*)([^;]*?)(\s*(?:;.*)?)$/);if(!match)throw Error('The floor property could not be preserved.');const tokens=match[2].split(',');const replacement=tokens.length===1&&key==='scalestart'&&value[1]===original[1]&&value[1]===1?tokens[0].replace(/\S(?:.*\S)?/,String(value[0])):tokens.length===2?tokens.map((token,i)=>original&&value[i]===original[i]?token:token.replace(/\S(?:.*\S)?/,String(value[i]))).join(','):value.join(', ');parts[index]=match[1]+replacement+match[3];next=parts.join('');}
  else{const later=doc.sections.find(s=>s.line>line),at=later?later.line*2:parts.length,eol=next.includes('\r\n')?'\r\n':'\n';parts.splice(at,0,(at===parts.length&&!/[\r\n]$/.test(next)?eol:'')+key+' = '+value.join(', ')+eol);next=parts.join('');}
 }
 return next;
}
module.exports={floorCameraRounding,floorAlignment,parallaxRowGeometry,applyFloorAlignment};
