'use strict';
const def=require('./def_model');
function stageDepth(info,players,scaling){
  const major=value=>parseInt(def.unquote(value||'0'),10)||0;
  const scalingSupported=major(info.mugenversion)!==1||major(info.ikemenversion)>=1;
  const topBound=def.number(players.topbound,0),bottomBound=def.number(players.botbound,0);
  return {enabled:topBound!==bottomBound,topBound,bottomBound,scalingSupported,
    topZ:scalingSupported?def.number(scaling.topz,0):0,bottomZ:scalingSupported?def.number(scaling.botz,0):0,
    topScale:scalingSupported?def.number(scaling.topscale,1):1,bottomScale:scalingSupported?def.number(scaling.botscale,1):1,
    depthToScreen:scalingSupported?def.number(scaling.depthtoscreen,1):1};
}
function depthRuntimeContext(localCoordX,gameWidth=320,verified=false){
 if(!Number.isFinite(localCoordX)||localCoordX<=0||!Number.isFinite(gameWidth)||gameWidth<=0)throw Error('Depth projection requires positive Stage and runtime widths.');
 return {gameWidth,stageLocalScale:gameWidth/localCoordX,verified:verified===true};
}
// Pinned system.go updateZScale receives character-local Z; topz/botz are
// engine units, unlike Stage-local movement bounds and player start positions.
// The character localscl cancels, leaving stageZ * Stage localscl below.
function stageDepthPosition(depth,player,cameraX,runtime=depth?.runtime||{}){
  if(!depth?.enabled)return {x:player.x,y:player.y,scale:1};
  const localScale=runtime.stageLocalScale??1;
  if(!Number.isFinite(localScale)||localScale<=0)throw Error('Depth projection requires a positive runtime Stage local scale.');
  const z=player.z||0,span=depth.bottomZ-depth.topZ;
  const scale=span===0?1:Math.max(0,depth.topScale+(z*localScale-depth.topZ)/span*(depth.bottomScale-depth.topScale));
  return {x:(player.x-cameraX)*scale+cameraX,y:player.y*scale+z*depth.depthToScreen,scale};
}
module.exports={stageDepth,stageDepthPosition,depthRuntimeContext};
