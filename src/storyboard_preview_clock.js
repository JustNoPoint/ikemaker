'use strict';
// Local editorial timing only; engine audio, custom Action fades and loading gates
// stay on the separate saved-storyboard engine route.
function runtime(){
 const ticks=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
 function timing(scene){const end=ticks(scene?.endTime),fadeOut=ticks(scene?.fadeOutTime);return{authoredEnd:end,fadeOutStart:Math.max(0,end-fadeOut),duration:Math.max(end,fadeOut),fadeIn:ticks(scene?.fadeInTime),fadeOut};}
 function next(scenes,index){const jump=scenes[index]?.jump;if(jump===null||jump===undefined||jump===index)return index+1;return Number.isInteger(jump)&&jump>=0?jump:-1;}
 function path(scenes,index,limit=64){const result=[],seen=new Set();while(index>=0&&index<scenes.length&&!seen.has(index)&&result.length<limit){seen.add(index);result.push(index);index=next(scenes,index)}return{indexes:result,truncated:index>=0&&index<scenes.length&&!seen.has(index)};}
 function create(scenes,index=0,tick=0){
  let state={index:0,tick:0,mode:'hold',complete:false,reason:''};
  const snapshot=()=>({...state});
  function select(index,tick=0){state={index:Math.max(0,Math.min(scenes.length-1,Math.trunc(index)||0)),tick:0,mode:'hold',complete:false,reason:''};state.tick=Math.min(ticks(tick),Math.max(0,timing(scenes[state.index]).duration-1));return snapshot();}
  function hold(reason=''){state.mode='hold';state.reason=reason;return snapshot();}
  function advance(count){if(state.mode!=='transition')return snapshot();let remaining=ticks(count),transitions=0;const zero=new Set();
   while(state.mode==='transition'){
    const duration=timing(scenes[state.index]).duration,available=duration-state.tick;
    if(duration>0&&remaining<available){state.tick+=remaining;break;}
    if(duration>0){remaining-=Math.max(0,available);zero.clear();}else{if(zero.has(state.index)){hold('Zero-time jump cycle: local preview stopped.');break;}zero.add(state.index);}
    const target=next(scenes,state.index);if(target<0){hold('Authored jump is invalid; inspect its source.');break;}
    if(target>=scenes.length){state.tick=Math.max(0,duration-1);state.complete=true;hold('End of local transition preview.');break;}
    state.index=target;state.tick=0;if(++transitions>256){hold('Local transition catch-up limit reached.');break;}
    if(!remaining&&timing(scenes[state.index]).duration>0)break;
   }return snapshot();
  }
  function play(){state.tick=0;state.complete=false;state.reason='';state.mode=scenes.length?'transition':'hold';if(!scenes.length)state.reason='Create or select a scene first.';return advance(0);}
  select(index,tick);return{state:snapshot,select,hold,play,advance};
 }
 return{timing,next,path,create};
}
function normalizeRequest(options={}){if(options.previewMode!=='hold')return null;const result={mode:'hold',tick:0};if(options.previewTick!==undefined){if(!Number.isSafeInteger(options.previewTick)||options.previewTick<0)return null;result.tick=options.previewTick;}if(options.sceneIndex!==undefined){if(!Number.isSafeInteger(options.sceneIndex)||options.sceneIndex<0)return null;result.sceneIndex=options.sceneIndex;}if(options.expectedSourceHash!==undefined){if(typeof options.expectedSourceHash!=='string'||!/^[a-f0-9]{64}$/i.test(options.expectedSourceHash))return null;result.expectedSourceHash=options.expectedSourceHash.toLowerCase();}return result;}
module.exports={runtime,normalizeRequest,...runtime()};
