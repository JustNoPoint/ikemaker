'use strict';
function createPalettePreviewAuthority(context) {
  let sequence=0;const pending=new Map();
  const signature=value=>JSON.stringify(value);
  return {
    request(kind,extra={}){const current=context(),request={...current,...extra,requestId:++sequence};pending.set(kind,{request,context:signature(current)});return request},
    accepts(kind,message){const item=pending.get(kind);return Boolean(item&&message.requestId===item.request.requestId&&signature(message.previewContext)===signature(item.request)&&signature(context())===item.context)},
    invalidate(){pending.clear()}
  };
}
// AIR duration units are engine ticks (60 Hz), not a millisecond minimum.
function paletteFrameAdvance(frames,index,loopStart=0) {
  if(!frames.length)return null;
  let next=index,zeroFrames=0;
  while(zeroFrames<=frames.length){
    const frame=frames[next],ticks=Number(frame.time);
    if(ticks===-1)return{index:next,nextIndex:next,delayMs:null,hold:true};
    const after=next+1<frames.length?next+1:Math.max(0,Math.min(frames.length-1,Number.isInteger(loopStart)?loopStart:0));
    if(ticks>0&&Number.isFinite(ticks))return{index:next,nextIndex:after,delayMs:ticks*1000/60,hold:false};
    if(ticks!==0)return null;
    next=after;zeroFrames++;
  }
  return null;
}
function paletteAnimationImages(archive,animation,paletteIndex,render){
  if(!animation?.frames?.length||animation.frames.length>500)return{frames:[],error:'This preview needs 1–500 complete AIR frames.'};
  const frames=[];
  for(const frame of animation.frames){
    if(frame.blank){frames.push({...frame,dataUri:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='});continue;}
    const matches=archive.sprites.filter(sprite=>sprite.group===frame.group&&sprite.number===frame.index);
    if(matches.length!==1)return{frames:[],error:`AIR sprite ${frame.group},${frame.index} is missing or duplicated. Choose an unambiguous action before previewing.`};
    const sprite=matches[0];try{frames.push({...frame,physicalIndex:sprite.index,group:sprite.group,number:sprite.number,dataUri:render(archive,sprite,paletteIndex)})}catch(error){return{frames:[],error:`AIR frame could not be rendered: ${error.message}`};}
  }
  return{frames,error:''};
}
module.exports={createPalettePreviewAuthority,paletteFrameAdvance,paletteAnimationImages};
