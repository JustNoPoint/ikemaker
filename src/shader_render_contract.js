'use strict';

const {compileTrustedEffect}=require('./shader_effect_catalog');

const SCHEMA='ikemaker.shader-render-contract/v1',MAX_PACKET_FRAMES=2;
function framePacket(frame,index){return Object.freeze({index,id:frame.id,label:frame.label,dataUri:frame.dataUri,width:frame.width,height:frame.height,ticks:frame.ticks,hold:frame.hold===true,missing:frame.missing===true,x:frame.x,y:frame.y,scaleX:frame.scaleX,scaleY:frame.scaleY,angle:frame.angle});}
function createPreviewFramePacket(preview,currentIndex=0,generation=0){
  if(preview?.schema!=='ikemaker.shader-preview/v1'||!preview.frames.length)throw new Error('A decoded Shader Workshop preview is required.');
  if(!Number.isSafeInteger(generation)||generation<0)throw new Error('A valid preview generation is required.');
  const index=Math.max(0,Math.min(preview.frames.length-1,Number.isSafeInteger(currentIndex)?currentIndex:0)),next=index+1<preview.frames.length?index+1:preview.loopStart,indices=[index];if(next!==index)indices.push(next);
  return Object.freeze({type:'shader.preview.packet',generation,frames:Object.freeze(indices.slice(0,MAX_PACKET_FRAMES).map(value=>framePacket(preview.frames[value],value)))});
}
function createShaderRenderContract(project,preview,currentIndex=0,parameters={}){
  if(preview?.schema!=='ikemaker.shader-preview/v1'||!preview.frames.length)throw new Error('A decoded Shader Workshop preview is required.');
  const index=Math.max(0,Math.min(preview.frames.length-1,Number.isSafeInteger(currentIndex)?currentIndex:0)),next=index+1<preview.frames.length?index+1:preview.loopStart,indices=[index];if(next!==index)indices.push(next);
  const shader=compileTrustedEffect(project,project.presetId,parameters),frames=indices.slice(0,MAX_PACKET_FRAMES).map(value=>framePacket(preview.frames[value],value));
  return Object.freeze({schema:SCHEMA,generation:0,totalFrames:preview.frames.length,currentIndex:index,loopStart:preview.loopStart,shader,frames:Object.freeze(frames),claims:Object.freeze({offlineApproximation:true,ikemenRuntimeEquivalent:false,engineProcessUsed:false})});
}
function withGeneration(contract,generation){if(contract?.schema!==SCHEMA||!Number.isSafeInteger(generation)||generation<0)throw new Error('A valid render contract and generation are required.');return Object.freeze({...contract,generation});}
function validateFrameRequest(message,contract){if(!message||Object.keys(message).sort().join(',')!=='generation,index,type'||message.type!=='shader.preview.frame'||message.generation!==contract.generation||!Number.isSafeInteger(message.index)||message.index<0||message.index>=contract.totalFrames)return false;return message.index;}

module.exports={SCHEMA,MAX_PACKET_FRAMES,createPreviewFramePacket,createShaderRenderContract,withGeneration,validateFrameRequest};
