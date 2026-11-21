'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const {bindingReceiptPath,uniquelyAssignedState,confinedFile,readSmall,sha,bindingPlanMatches,validBindingPolicy}=require('./snapshot_binding');
const {readBoundedFile}=require('./snapshot_review_evidence');

function assetRecord(root,relative,hash,limit) {
  if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw Error('Asset fingerprint unavailable');
  const bytes=readBoundedFile(confinedFile(root,relative),limit);
  if(sha(bytes)!==hash)throw Error('Asset changed since capture');
  return {bytes,reference:{path:relative,sha256:hash}};
}

function directAirAction(bytes,entity) {
  const frame=entity.authoredAirFrame;
  if(!frame?.sprite||!Number.isSafeInteger(frame.durationTicks)||entity.fieldProvenance?.authoredAirFrame!=='stock-saved-air-frame-at-hook')return false;
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/\r(?!\n)|[\0\uFEFF]/.test(text))return false;
  const lines=text.split('\n');
  let hits=0,active=false,sawFrame=false,unsupported=false;
  for(const raw of lines){
    const line=raw.split(';',1)[0].trim();
    if(/^\[/.test(line)){
      const header=/^\[begin action (-?(?:0|[1-9]\d*))\]$/i.exec(line);
      if(/^\[\s*begin\s+action\b/i.test(line)&&(!header||Number(header[1])>2147483647||Number(header[1])<-2147483648))return false;
      active=Boolean(header)&&Number(header[1])===entity.anim;
      if(active)hits++;
      continue;
    }
    if(!active)continue;
    if(/^(?:copy\s+action|#|include\b)/i.test(line))unsupported=true;
    const row=/^(-?\d+)\s*,\s*(-?\d+)\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*(-?\d+)\s*(?:,|$)/.exec(line);
    if(row&&Number(row[1])===frame.sprite.group&&Number(row[2])===frame.sprite.image&&Number(row[3])===frame.durationTicks)sawFrame=true;
  }
  return hits===1&&sawFrame&&!unsupported;
}

function physicalSpriteIndex(bytes,sprite) {
  if(bytes.length<64||bytes.toString('latin1',0,12)!=='ElecbyteSpr\0'||bytes[15]!==2)return null;
  const offset=bytes.readUInt32LE(36), count=bytes.readUInt32LE(40),end=offset+28*count;
  if(offset<64||count>1000000||end>bytes.length)return null;
  let found=null;
  for(let index=0;index<count;index++){
    const at=offset+28*index;
    if(bytes.readUInt16LE(at)===sprite.group&&bytes.readUInt16LE(at+2)===sprite.image){
      if(found!==null)return null;
      found=index;
    }
  }
  return found;
}

// Resolve only an explicitly selected numeric destination in a literal CNS
// RemapSprite block. This describes source text, never controller execution.
function selectedRemapRange(bytes, lineNumber) {
  const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if (/\r(?!\n)|[\0\uFEFF]/.test(text) || !Number.isSafeInteger(lineNumber) || lineNumber < 1) return null;
  const rows = text.split(/\r?\n/);
  const line = lineNumber - 1;
  if (line >= rows.length) return null;
  const code = row => row.split(';',1)[0];
  const literal = /^(\s*dest\s*=\s*)(\d+\s*,\s*\d+)\s*$/i.exec(code(rows[line]));
  if (!literal) return null;
  let start = line, end = line + 1;
  while (start >= 0 && !/^\s*\[/.test(code(rows[start]))) start--;
  while (end < rows.length && !/^\s*\[/.test(code(rows[end]))) end++;
  if (start < 0 || !/^\s*\[state\s+[^\]]+\]\s*$/i.test(code(rows[start]))) return null;
  const block = rows.slice(start + 1,end).map(code).filter(row => row.trim());
  const types = block.filter(row => /^\s*type\s*=/i.test(row));
  const destinations = block.filter(row => /^\s*dest\s*=/i.test(row));
  if (types.length !== 1 || !/^\s*type\s*=\s*remapsprite\s*$/i.test(types[0]) || destinations.length !== 1) return null;
  return {start:{line,character:literal[1].length},end:{line,character:literal[1].length+literal[2].length}};
}

function boundSnapshotLocator(evidence,pairFile,project,entity,type,selection) {
  if(!pairFile||!['player','helper'].includes(entity.kind)||!['air','sprite','source'].includes(type))return null;
  try{
    const {verdict,first,second}=evidence,pairPath=fs.realpathSync(pairFile),directory=path.dirname(pairPath);
    const prePath=path.join(path.dirname(directory),'binding-prelaunch.json');
    const receipt=JSON.parse(readBoundedFile(bindingReceiptPath(directory,verdict.id),256*1024));
    const preBytes=readBoundedFile(prePath,256*1024),pre=JSON.parse(preBytes);
    if(receipt.schema!=='ikemeter.binding-receipt'||receipt.version!==1||receipt.status!=='bound'||receipt.pairId!==verdict.id||!validBindingPolicy(pre,receipt)||
       receipt.sessionId!==verdict.sessionId||receipt.epoch!==verdict.epoch||receipt.tick!==verdict.tick||
       pre.sessionId!==verdict.sessionId||receipt.pairVerdictSha256!==sha(readSmall(pairPath))||
       receipt.prelaunchSha256!==sha(preBytes)||!isDeepStrictEqual(receipt.engine,first.engine)||!isDeepStrictEqual(pre.engine,first.engine)||
       !bindingPlanMatches(pre,receipt.post)||
       !isDeepStrictEqual(receipt.captureIds,[first.id,second.id])||
       !isDeepStrictEqual(receipt.sidecarSha256,verdict.captures.map(link=>sha(readBoundedFile(path.join(directory,link.metadata),256*1024))))||
       pre.manifest.projectId!==project.id||path.relative(pre.root,project.root)!=='')return null;
    const selected=pre.definitions.find(row=>row.slot===entity.owner),root=receipt.binding.roots[entity.owner-1];
    if(!selected||root?.definition.toLowerCase()!==selected.def.toLowerCase())return null;
    for(const candidate of [first,second]){
      if(!candidate.frame.entities.some(item=>item.kind==='player'&&item.owner===entity.owner&&item.runtimeId===root.runtimeId))return null;
    }
    if (type === 'source') {
      if (entity.kind !== 'player' || root.runtimeId !== entity.runtimeId || !selection) return null;
      const def = assetRecord(project.root,selected.def,pre.files[selected.def],4*1024*1024);
      if (!uniquelyAssignedState(project.root,selected.def,def.bytes,selection.path)) return null;
      const source = assetRecord(project.root,selection.path,pre.files[selection.path],4*1024*1024);
      const range = selectedRemapRange(source.bytes,selection.line);
      return range ? {type,...source.reference,ownerDef:{...def.reference,player:entity.owner},range} : null;
    }
    const prefixes=receipt.binding.prefixes.filter(row=>row.kind===entity.kind&&row.runtimeId===entity.runtimeId);
    if(prefixes.length!==1||prefixes[0].prefix!=='s')return null;
    const owner=type==='air'?entity.animationOwner:entity.spriteOwner;
    const provenance=type==='air'?'stock-animPlayerNo-at-hook':'stock-spritePlayerNo-at-hook';
    if(owner?.status!=='player-slot'||owner.reportedSlot!==entity.owner||owner.provenance!==provenance)return null;
    const {reference:def}=assetRecord(project.root,selected.def,pre.files[selected.def],4*1024*1024);
    const ownerDef={...def,player:entity.owner};
    if(type==='air'){
      if(!Number.isSafeInteger(entity.anim)||entity.anim<0||entity.fieldProvenance?.anim!=='engine-observed')return null;
      const {bytes,reference}=assetRecord(project.root,selected.air,pre.files[selected.air],4*1024*1024);
      if(!directAirAction(bytes,entity))return null;
      return {type,...reference,ownerDef,action:entity.anim};
    }
    const sprite=entity.resolvedSprite;
    if(entity.fieldProvenance?.resolvedSprite!=='stock-resolved-sprite-at-hook'||
       !sprite||![sprite.group,sprite.image].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=65535))return null;
    const {bytes,reference}=assetRecord(project.root,selected.sff,pre.files[selected.sff],128*1024*1024);
    const physicalIndex=physicalSpriteIndex(bytes,sprite);
    return physicalIndex===null?null:{type,...reference,ownerDef,group:sprite.group,image:sprite.image,physicalIndex};
  }catch{return null;}
}

module.exports={selectedRemapRange,boundSnapshotLocator,directAirAction,physicalSpriteIndex};
