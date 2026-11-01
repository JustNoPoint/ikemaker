'use strict';
const {build,bounds}=require('./viewer_animation_comparison');
const {parseAir}=require('./air_preview_model');
const LIMITS=Object.freeze({maximumFrames:256,maximumImages:128});
function startTick(action,index){let tick=0;for(let at=0;at<Math.max(0,Math.min(action.frames.length-1,Number(index)||0));at++){const value=Number(action.frames[at].rawTime);if(value>0)tick+=value;}return tick}
function create(input={}){
  const render=input.render;if(typeof render!=='function')throw new Error('A/B preview requires an exact sprite renderer.');const sprite=input.sprite,base={version:1,mode:'sprite',aLabel:'Embedded original',bLabel:'Retained draft',assumptions:{zoom:'shared-fit',background:'shared-grid',paletteOverride:'explicit-a-b',runtimeRemap:'unknown'},startTick:0,notice:''};
  const fallback=notice=>({...base,notice,aDataUri:render(input.archive,sprite,input.embeddedColors),bDataUri:render(input.archive,sprite,input.draftColors)}),air=input.air;
  if(!air)return fallback('Static sprite comparison. Open from an AIR frame for synchronized animation playback.');
  if(!air.text||air.expectedHash!==air.actualHash)return fallback('AIR authority changed or is unavailable; comparison is safely limited to the selected sprite.');
  try{
    const exactAction=parseAir(air.text).find(item=>item.number===Number(air.actionNumber)),exactFrame=exactAction?.frames?.[Number(air.frameIndex)];
    if(!exactFrame||exactFrame.line!==Number(air.sourceLine)||exactFrame.group!==Number(air.referencedSprite?.group)||exactFrame.index!==Number(air.referencedSprite?.number))return fallback('The reviewed AIR frame changed; comparison is safely limited to the selected sprite.');
    const referenced=new Set(exactAction.frames.filter(frame=>frame.group>=0).map(frame=>`${frame.group},${frame.index}`));
    if(exactAction.frames.length>LIMITS.maximumFrames||referenced.size>LIMITS.maximumImages)return fallback('The AIR action exceeds the compact A/B preview limit; comparison is limited to the selected sprite.');
    const a=build(air.text,air.actionNumber,input.archive,(archive,item)=>render(archive,item,input.embeddedColors)),b=build(air.text,air.actionNumber,input.archive,(archive,item)=>render(archive,item,input.draftColors)),selected=a.frames[Number(air.frameIndex)];
    if(!selected||selected.group!==Number(air.referencedSprite?.group)||selected.index!==Number(air.referencedSprite?.number))return fallback('The reviewed AIR frame changed; comparison is safely limited to the selected sprite.');
    return{...base,mode:'animation',actionNumber:a.number,selectedFrameIndex:Number(air.frameIndex),startTick:startTick(a,air.frameIndex),action:{number:a.number,loopStart:a.loopStart,frames:a.frames},imagesA:a.images,imagesB:b.images,bounds:bounds(a),notice:`Action ${a.number} · element ${Number(air.frameIndex)+1} · one shared playback clock.`};
  }catch(error){return fallback(`Animation comparison unavailable: ${error.message}`)}
}
module.exports={LIMITS,startTick,create};
