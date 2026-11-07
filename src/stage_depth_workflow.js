'use strict';
const {planDepthEdit}=require('./stage_depth_authoring');
const {createStageNotices}=require('./stage_terminal_notices');
async function reviewStageDepth(owner,values,env){
 if(owner.busy)return false;const notices=createStageNotices({info:env.info});if(env.player()){notices.info('Switch to an authoring mode to apply depth settings.');notices.flush();return false;}
 owner.busy++;try{const authority=env.capture();if(!authority)return false;if(env.backgroundDirty())throw Error('Apply or discard background position previews before applying depth.');const text=env.read(),plan=planDepthEdit(text,values);env.assert(authority);if(!plan.changes.length){notices.info('Depth settings already match the source. No source was written.');return false;}
 const detail=plan.changes.map(change=>change.key+': '+change.before+' → '+change.after).join('\n')+'\nOnly these PlayerInfo / Scaling fields change, in one undoable transaction. Movement bounds use Stage units; scaling reference Z uses engine units. Movement bounds and scaling reference planes remain independent. Ghost position is preview-only. Verify camera, linked ground and character behavior in IKEMEN.'+(env.nativeOpen()?'\nUNSAVED native edit: Save DEF to use in game. Native Save may normalize mixed line endings; disk bytes remain unchanged until Save.':'');
 if(await env.confirm(detail)!=='Apply Depth')return false;env.assert(authority);if(env.read()!==text||env.backgroundDirty())throw Error('The Stage or its position preview changed during depth review. Nothing was changed.');await env.apply(plan.text,authority);await env.refresh();notices.info('Reviewed depth settings applied.'+(env.nativeOpen()?' UNSAVED native edit: Save DEF to use in game. Native Save may normalize mixed line endings.':''));return true;
 }finally{owner.busy=Math.max(0,owner.busy-1);try{env.onBusy?.();}finally{notices.flush();}}
}
module.exports={reviewStageDepth};
