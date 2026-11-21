'use strict';

const scalarKinds = new Set(['var','fvar','sysvar','sysfvar']);
const entityKinds = new Set(['helper','explod','projectile']);
const effectKinds = new Set(['explod','projectile']);
const planKeys=new Set(['slot','kind','key','mapIndex','ownerHelperId']);
const maxWatches = 12;
const isId = n => Number.isInteger(n) && n >= 0 && n <= 2147483647;

function watchPlan(input, slots=[1,2,3,4]) {
  if (!Array.isArray(input) || input.length > maxWatches) throw Error('Choose up to 12 watches');
  const seen = new Set();
  const helperGroups = new Map();
  return input.map(item=>{
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key=>!planKeys.has(key)) ||
        !Object.hasOwn(item,'key')||
        !slots.includes(item.slot)) throw Error('Choose a configured root slot');
    const {slot,kind}=item;
    let {key}=item;
    const mapIndex=item.mapIndex??null;
    const ownerHelperId=item.ownerHelperId??null;
    if(mapIndex!==null&&(kind!=='map'||!Number.isInteger(mapIndex)||mapIndex< -2147483648||mapIndex>2147483647)) {
      throw Error('Choose a signed int32 Map index');
    }
    if(ownerHelperId!==null&&(!effectKinds.has(kind)||!isId(ownerHelperId)))throw Error('Choose a helper owner ID only for Explod or Projectile watches');
    if (scalarKinds.has(kind)) {
      if (!isId(key)) throw Error('Variable index must be a nonnegative int32');
    } else if(kind==='map') {
      if(typeof key!=='string'||!/^[A-Za-z_][A-Za-z0-9_.-]{0,47}$/.test(key)) throw Error('Use a map name of up to 48 ASCII letters, digits, underscores, periods, or hyphens');
      key=key.toLowerCase();
    } else if (!entityKinds.has(kind) || (key!==null && !isId(key))) throw Error('Choose an entity group or a nonnegative authored ID');
    if(kind==='helper'&&key===0)throw Error('Helper ID 0 is the stock wildcard. Leave the ID blank to count all helpers.');
    if(kind==='helper'){
      const prior=helperGroups.get(slot)||[];
      if(prior.length&&(key===null||prior.includes(null)))throw Error('Choose all Helpers or specific IDs for each root');
      helperGroups.set(slot,[...prior,key]);
    }
    const token=JSON.stringify([slot,kind,key,mapIndex,ownerHelperId]);
    if(seen.has(token))throw Error('That watch is already configured');
    seen.add(token);
    return {slot,kind,key,mapIndex,ownerHelperId};
  });
}

function encodeWatchPlan(plan){
  return plan.map(({slot,kind,key,mapIndex,ownerHelperId})=>[slot,kind,key??'-',mapIndex??'_',ownerHelperId??'_'].join(':')).join(',');
}
function parseScalar(raw){
  if(/^s(?:[0-9a-f]{2}){0,48}$/.test(raw)){
    return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(raw.slice(1),'hex'));
  }
  if(!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw))throw Error('Bad watch scalar');
  const n=Number(raw);
  if(!Number.isFinite(n))throw Error('Bad watch scalar');
  return n;
}
const signedInt32=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
const stateSlot=n=>Number.isInteger(n)&&n>=1&&n<=12?n:null;
function decodeWatchRows(parts,plan,telemetry,tick){
  const rows=new Array(plan.length).fill(null);
  const seen=new Set();
  for(const part of parts){
    if(!/^watch[0-9]/.test(part))continue;
    const m=/^watch([1-9]\d?)=(.+)$/.exec(part);
    if(!m)continue;
    const i=Number(m[1])-1;
    if(i>=plan.length)continue;
    if(seen.has(i)){rows[i]=null;continue;}
    seen.add(i);
    try{
      const [owner,scalar,...details]=m[2].split(',');
      if(!/^\d+$/.test(owner)||!isId(Number(owner)))continue;
      const root=telemetry?.roots.find(r=>r.slot===plan[i].slot);
      if(!root||root.id!==Number(owner))continue;
      if(scalar==='-'){rows[i]={ownerId:root.id,value:null,helpers:null};continue;}
      if(plan[i].ownerHelperId!=null){
        if(scalar!=='owned'||details.length>8)continue;
        const seenOwners=new Set();
        const owners=details.map(detail=>{
          if(!/^\d+:\d+:\d+$/.test(detail))throw Error('Bad effect owner identity');
          const [ownerId,parentId,value]=detail.split(':').map(Number);
          if(![ownerId,parentId,value].every(isId)||ownerId===root.id||ownerId===parentId||seenOwners.has(ownerId)){
            throw Error('Ambiguous effect owner identity');
          }
          seenOwners.add(ownerId);
          return {ownerId,parentId,value};
        });
        rows[i]={ownerId:root.id,owners};
        continue;
      }
      const value=parseScalar(scalar), kind=plan[i].kind;
      if((kind!=='map'&&typeof value!=='number')||(entityKinds.has(kind)&&!isId(value))||
         ((kind==='var'||kind==='sysvar')&&(!Number.isInteger(value)||value< -2147483648||value>2147483647)))continue;
      let helpers=null;
      if(kind==='helper'&&details[0]==='full'&&details.length===value+1&&value<=8){
        const ids=new Set();
        let lastOrdinal=-1;
        helpers=details.slice(1).map(d=>{
          if(!/^\d+:\d+:\d+:\d+$/.test(d))throw Error('Bad helper identity');
          const [entityId,authoredId,parentId,ordinal]=d.split(':').map(Number);
          if(![entityId,authoredId,parentId,ordinal].every(isId)||ids.has(entityId)||entityId===root.id||entityId===parentId||
             ordinal<=lastOrdinal||ordinal>=8||(plan[i].key!==null&&authoredId!==plan[i].key))throw Error('Ambiguous helper identity');
          lastOrdinal=ordinal;
          ids.add(entityId);
          return {entityId,authoredId,parentId,ordinal};
        });
      }else if(details.length)continue;
      rows[i]={ownerId:root.id,value,helpers};
    }catch{/* Missing or malformed optional watch data never invalidates the telemetry frame. */}
  }
  if(!isId(tick))return rows;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(!row||row.value===null)continue;
    const root=telemetry.roots.find(r=>r.slot===plan[i].slot&&r.id===row.ownerId);
    const stateNo=root?.values?.stateNo;
    if(signedInt32(stateNo))row.state={tick,entityId:row.ownerId,stateNo,stateOwnerSlot:stateSlot(root.values.stateOwnerSlot)};
  }
  const helperStates=new Map();
  for(const part of parts){
    const match=/^watchState([1-9]\d?)=(\d+):(-?\d+):(\d+|-f)$/.exec(part);
    if(!match)continue;
    const i=Number(match[1])-1, entityId=Number(match[2]), stateNo=Number(match[3]);
    const row=rows[i];
    if(!row||!isId(entityId)||!signedInt32(stateNo))continue;
    const target=row.helpers?.find(x=>x.entityId===entityId)??row.owners?.find(x=>x.ownerId===entityId);
    if(!target)continue;
    const slot=stateSlot(Number(match[4]));
    const key=i+':'+entityId;
    const state=match[4]==='-f'||slot!==null?{tick,entityId,stateNo,stateOwnerSlot:slot}:null;
    helperStates.set(key,{target,state:helperStates.has(key)?null:state});
  }
  for(const {target,state} of helperStates.values())if(state)target.state=state;
  return rows;
}
module.exports={watchPlan,encodeWatchPlan,decodeWatchRows,entityKinds};
