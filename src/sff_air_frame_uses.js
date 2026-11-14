'use strict';

const { parseAir } = require('./air_preview_model');

function frameUses(sources, identities) {
  const wanted = new Set((identities || []).map(item => `${item.group},${item.number}`));
  const uses = [];
  for (const source of sources || []) {
    for (const action of parseAir(source.text || '')) {
      action.frames.forEach((frame, frameIndex) => {
        if (wanted.has(`${frame.group},${frame.index}`)) uses.push({filename:source.filename,ownerDef:source.ownerDef||'',action:action.number,actionLine:action.line,frameIndex,frameLine:frame.line,group:frame.group,number:frame.index});
      });
    }
  }
  return uses;
}

function deleteReviewAirUses(context, selected, archiveSprites) {
  const uses=frameUses(context.files,selected),actions=new Set(uses.map(use=>`${use.filename}\u0000${use.actionLine}`));
  const unreadable=Array.isArray(context.unreadableNearby)?context.unreadableNearby:[];
  const duplicate=selected.some(item=>(archiveSprites||[]).filter(sprite=>sprite.group===item.group&&sprite.number===item.number).length>1);
  const lines=[context.assigned?'Assigned character AIR coverage':'Unassigned nearby AIR suggestions',context.reason||'',`Scanned ${context.files?.length||0} readable AIR file(s).${unreadable.length?` Skipped ${unreadable.length} unreadable nearby AIR file(s): ${unreadable.slice(0,5).join(', ')}${unreadable.length>5?', …':''}.`:''}`,`${actions.size} distinct Action(s), ${uses.length} matching frame occurrence(s) in scanned files.`, 'AIR frames reference group,index; they do not identify a physical SFF occurrence.'+(duplicate?' Another physical sprite shares a selected group,index, so deleting one occurrence may leave that AIR identity present.':'')];
  if(uses.length)lines.push(...uses.slice(0,12).map(use=>`${require('node:path').basename(use.filename)} · Action ${use.action} · frame ${use.frameIndex+1} · ${use.group},${use.number}`),...(uses.length>12?[`…plus ${uses.length-12} more frame occurrence(s).`]:[]));
  return {uses,detail:lines.filter(Boolean).join('\n')};
}

module.exports = { frameUses, deleteReviewAirUses };
