'use strict';
const crypto=require('crypto'),visual=require('./air_visual'),playback=require('./air_playback'),reader=require('./sff_reader');
const MAX_TICKS=3600,MAX_PIXELS=64000000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function delays(ticks,format) {const rate=format==='gif'?100:1000,minimum=format==='gif'?2:1;let target=0,emitted=0;return ticks.map(count=>{if(!Number.isSafeInteger(count)||count<1)throw Error('Animation runs require positive whole ticks.');target+=count*rate/60;const delay=Math.max(minimum,Math.round(target-emitted));emitted+=delay;return delay;});}
function options(input={}) {const scale=Number(input.scale??1),holdTicks=Number(input.holdTicks??60),format=input.format||'webp',background=input.background??null,boxKinds=input.boxKinds||[];if(!['gif','webp'].includes(format)||!Number.isSafeInteger(scale)||scale<1||scale>8||!Number.isSafeInteger(holdTicks)||holdTicks<1||holdTicks>MAX_TICKS||background!==null&&!/^#[0-9a-f]{6}$/i.test(background)||!Array.isArray(boxKinds)||boxKinds.some(kind=>!['clsn1','clsn2'].includes(kind))||new Set(boxKinds).size!==boxKinds.length)throw Error('Choose GIF/WebP, scale1–8, a finite hold1–3600ticks, a solid/transparent background and supported box overlays.');return {format,scale,holdTicks,background,boxKinds};}
function plan(action,archive,input={}) {
  const settings=options(input);if(!action?.frames?.length||action.frames.length>10000||action.copyAction!==undefined||action.fallthroughAction!==undefined||action.readOnly)throw Error('Choose one exact, authored AIR action with drawable or intentionally blank elements.');
  const durations=action.frames.map((frame,index)=>{
    const ticks=playback.duration(frame,index,action.frames.length);
    return Number.isFinite(ticks)?ticks:settings.holdTicks;
  });
  const length=durations.reduce((sum,ticks)=>sum+ticks,0);
  if(length>MAX_TICKS)throw Error('Animated export is limited to one 60-second pass. Shorten the action or final hold.');
  if(!length)throw Error('The action has no displayed ticks to export.');
  const inventory=new Map();for(const sprite of archive.sprites){const key=sprite.group+','+sprite.number,row=inventory.get(key)||[];row.push(sprite);inventory.set(key,row);}
  const images={},runs=[];let uniquePixels=0,imageBytes=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const include=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1000000||Math.abs(y)>1000000)throw Error('Animated frame placement exceeds its coordinate limit.');minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
  let previous='',element=0,elementStart=0;
  for(let tick=0;tick<length;tick++){
    while(tick>=elementStart+durations[element])elementStart+=durations[element++];
    const pose=visual.sample(action,element,tick-elementStart);if(!pose)throw Error('The animation tick could not be resolved.');
    let imageId=null;
    if(pose.group!==-1&&pose.index!==-1){const matches=inventory.get(pose.group+','+pose.index)||[];if(matches.length!==1)throw Error(matches.length?'An animated frame references duplicate sprite '+pose.group+','+pose.index+'.':'An animated frame references missing sprite '+pose.group+','+pose.index+'.');const selected=matches[0],source=reader.resolvedSprite(archive,selected),palette=Number.isSafeInteger(input.palettes?.[pose.group])?input.palettes[pose.group]:null;if(palette!==null&&!archive.palettes[palette])throw Error('A preview palette is unavailable.');imageId=selected.index+':'+palette;if(!images[imageId]){const pixels=source.width*source.height;if(!Number.isSafeInteger(pixels)||pixels<1||pixels>16000000||(uniquePixels+=pixels)>MAX_PIXELS)throw Error('Animated export exceeds its sprite-decode budget.');const png=reader.spritePng(archive,selected,palette);imageBytes+=png.length;if(imageBytes>64*1024*1024||png.length<24||png.readUInt32BE(16)!==source.width||png.readUInt32BE(20)!==source.height)throw Error('Sprite PNG dimensions or encoded-image budget do not match the export plan.');images[imageId]={sprite:{axisX:selected.axisX,axisY:selected.axisY,width:source.width,height:source.height},dataUri:'data:image/png;base64,'+png.toString('base64'),sha256:hash(png)};}for(const [x,y]of visual.corners(images[imageId].sprite,pose))include(x,y);}
    for(const kind of settings.boxKinds)for(const rect of pose[kind]||[]){include(Math.min(rect[0],rect[2])-1,Math.min(rect[1],rect[3])-1);include(Math.max(rect[0],rect[2])+1,Math.max(rect[1],rect[3])+1);}
    const key=JSON.stringify([element,imageId,pose]);if(key===previous)runs[runs.length-1].ticks++;else{runs.push({element:element,pose,imageId,ticks:1});previous=key;}
  }
  if(!Number.isFinite(minX)){minX=0;minY=0;maxX=1;maxY=1;}
  const originX=Math.floor(minX),originY=Math.floor(minY),width=Math.max(1,Math.ceil(maxX)-originX)*settings.scale,height=Math.max(1,Math.ceil(maxY)-originY)*settings.scale;
  if(width>4096||height>4096||width*height*runs.length>MAX_PIXELS)throw Error('Animated canvas exceeds4096pixels per side or64million total rendered pixels. Reduce scale or action duration.');
  const frameDelays=delays(runs.map(run=>run.ticks),settings.format);runs.forEach((run,index)=>run.delay=frameDelays[index]);
  return {schema:'ikemaker.air-animation-render.v1',action:Number(action.number),settings,width,height,originX,originY,ticks:length,durationMilliseconds:frameDelays.reduce((sum,delay)=>sum+delay,0)*(settings.format==='gif'?10:1),images,runs,colors:{clsn1:'#ff3b45',clsn2:'#3d8dff'}};
}
function renderRuntime(){
  async function frames(plan,api){
    const images={};for(const [key,entry]of Object.entries(plan.images)){const image=new Image();image.src=entry.dataUri;await image.decode();if(api.cancelled())return null;images[key]=image;}
    const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;const ctx=canvas.getContext('2d',{willReadFrequently:true}),result=[];
    for(let index=0;index<plan.runs.length;index++){
      if(api.cancelled())return null;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);if(plan.settings.background){ctx.fillStyle=plan.settings.background;ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.scale(plan.settings.scale,plan.settings.scale);ctx.translate(-plan.originX,-plan.originY);
      const run=plan.runs[index];if(run.imageId)api.visual.drawSprite(ctx,images[run.imageId],plan.images[run.imageId].sprite,run.pose);
      for(const kind of plan.settings.boxKinds)for(const rect of run.pose[kind]||[]){const left=Math.min(rect[0],rect[2]),top=Math.min(rect[1],rect[3]),width=Math.abs(rect[2]-rect[0]),height=Math.abs(rect[3]-rect[1]);ctx.strokeStyle=plan.colors[kind];ctx.fillStyle=plan.colors[kind]+'40';ctx.lineWidth=1;ctx.fillRect(left,top,width,height);ctx.strokeRect(left,top,width,height);}
      result.push(canvas.toDataURL('image/png'));api.progress(index+1,plan.runs.length);if(index%8===0)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    return result;
  }
  return {frames};
}
module.exports={options,delays,plan,renderRuntime,MAX_TICKS,MAX_PIXELS};
