'use strict';

// Resolve a queued AIR Action ID or SND group,index against actual destination
// occurrences and the IDs reserved by earlier items in this same queue.
async function queuedIdentities(kind, rows, occupiedIds, api) {
  const byId=new Map(), reserved=new Set(), result=new Map();
  occupiedIds.forEach((id,index)=>{
    id=String(id);
    if(!byId.has(id))byId.set(id,[]);
    byId.get(id).push(index);
  });
  const maximum=2147483647;
  for(const row of rows){
    let id=row.identity;
    if(row.targetId){
      const fields=String(row.targetId).split(',').map(s=>s.trim());
      if(fields.length!==(kind==='air'?1:2)||fields.some(s=>!/^\d+$/.test(s)||Number(s)>maximum))
        throw Error('Enter '+(kind==='air'?'an Action ID':'a group,index pair')+' between 0 and '+maximum+'.');
      id=fields.map(Number).join(',');
    }
    let outcome='add',destinationPhysicalIndex;
    if(byId.has(id)||reserved.has(id)){
      const matches=byId.get(id)||[];
      let policy=row.conflictPolicy||'ask';
      const canReplace=matches.length>0&&!reserved.has(id);
      if(policy==='ask'){
        const choices=[{label:'Use next free ID',value:'next-free'},{label:'Skip this item',value:'skip'}];
        if(canReplace)choices.push({label:'Replace existing '+id,value:'replace'});
        const picked=await api.showQuickPick(choices,{title:kind.toUpperCase()+' Quick Transfer · '+id+' is already in use'});
        if(!picked)return null;
        policy=picked.value;
      }
      if(policy==='skip')outcome='skip';
      else if(policy==='replace'){
        if(!canReplace)throw Error('Two queued items target '+id+'. Choose different IDs or skip one of them.');
        outcome='replace';
        if(matches.length===1)destinationPhysicalIndex=matches[0];
        else{
          const picked=await api.showQuickPick(matches.map(index=>({label:'Archive position '+(index+1),index})),{title:'Replace which occurrence of '+id+'?'});
          if(!picked)return null;
          destinationPhysicalIndex=picked.index;
        }
      }else if(policy==='next-free'){
        const pair=id.split(','),prefix=pair.length===2?pair[0]+',':'';
        let n=Math.max(0,Number(pair.at(-1)));
        while(byId.has(prefix+n)||reserved.has(prefix+n))n++;
        if(n>maximum)throw Error('No free ID remains after '+id+'.');
        id=prefix+n;
      }else throw Error('Unknown transfer conflict choice.');
    }
    if(outcome!=='skip')reserved.add(id);
    result.set(row.physicalIndex,{outcome,id,destinationPhysicalIndex});
  }
  return result;
}
module.exports={queuedIdentities};
