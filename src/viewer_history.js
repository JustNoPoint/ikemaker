'use strict';

// Session-only navigation history. A failed/cancelled visit never advances the
// cursor; a new successful handoff after Back discards the old forward branch.
function createHistory(open, changed = () => {}, limit = 100) {
  let entries = [], cursor = -1, busy = false;
  const same = (a,b) => a && b && a.filename.toLowerCase()===b.filename.toLowerCase() && a.kind===b.kind && JSON.stringify(a.reference||null)===JSON.stringify(b.reference||null) && a.line===b.line && a.text===b.text;
  const snapshot = point => ({...point, reference:point.reference ? {...point.reference}:undefined});
  const state = () => ({back:cursor>0,forward:cursor>=0&&cursor<entries.length-1,busy});
  function transition(from,to) {
    if(busy||!to)return;
    entries=entries.slice(0,cursor+1);
    if(from) {
      if(cursor>=0 && entries[cursor].filename.toLowerCase()===from.filename.toLowerCase() && entries[cursor].kind===from.kind) entries[cursor]=snapshot(from);
      else {entries.push(snapshot(from));cursor++;}
    }
    if(!same(entries[cursor],to)){entries.push(snapshot(to));cursor++;}
    if(entries.length>limit){const remove=entries.length-limit;entries.splice(0,remove);cursor-=remove;}
    changed(state());
  }
  async function travel(delta,current) {
    if(busy || ![-1,1].includes(delta))return false;
    const next=cursor+delta;if(next<0||next>=entries.length)return false;
    if(current && cursor>=0 && entries[cursor].filename.toLowerCase()===current.filename.toLowerCase() && entries[cursor].kind===current.kind)entries[cursor]=snapshot(current);
    busy=true;changed(state());
    try {if(await open(snapshot(entries[next]))===false)return false;cursor=next;return true;}
    finally {busy=false;changed(state());}
  }
  return {transition,travel,state};
}
module.exports={createHistory};
