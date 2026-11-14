'use strict';
const crypto = require('crypto');
const { parseAir, updateFrameElement, updateFrameDirectives, insertFrameElement, deleteFrameElement, moveFrameElementPatch, moveFrameBlockPatch, applyActionPatches } = require('./air_preview_model');
const { airActions } = require('./costume_explod_model');
const { splitElementPatch } = require('./air_element_split');

const fields = ['x','y','time','scaleX','scaleY','angle','blend'];
const exceptionFields=['x','y','time','flags','flipH','flipV','scaleX','scaleY','angle','blend','interpolate','loopStart'];
const hash = body => crypto.createHash('sha256').update(body,'utf8').digest('hex').slice(0,16);
const normalizedBody = lines => lines.map(line => line.split(';')[0].replace(/[ \t]+$/,'')).filter(line => line.trim()).join('\n');

function pairs(text, baseAction) {
  const actions = airActions(text), base=actions.find(action=>action.number===baseAction);
  if(!base || base.marker)throw new Error(`Action ${baseAction} is not an authored base Action. Select its source Action before linked editing.`);
  const generated = actions.filter(action => action.marker?.base === baseAction && (/^bank:[1-6]$/.test(action.marker.source) || action.marker.source === 'mapping'));
  const ids = new Set();
  for (const action of generated) {
    if (ids.has(action.marker.source)) throw new Error(`Two generated layer actions claim ${action.marker.source} for Action ${baseAction}.`);
    ids.add(action.marker.source);
    if (action.marker.version !== 1 || hash(action.body) !== action.marker.hash) throw new Error(`Generated Action ${action.number} was changed outside the linked editor. Review its source before propagating.`);
  }
  return generated;
}
function refreshMarker(text, actionNumber) {
  const action = airActions(text).find(item => item.number === actionNumber);
  if (!action?.marker) throw new Error(`Generated Action ${actionNumber} marker is missing.`);
  const lines = text.split(/\r?\n/), first = action.headerLine;
  let at = first;
  while (at < lines.length && !lines[at].trim()) at++;
  if (!/IKEMaker generated layer animation/i.test(lines[at] || '')) throw new Error(`Generated Action ${actionNumber} marker moved.`);
  const end = airActions(text).find(item => item.headerLine > action.headerLine)?.headerLine || lines.length + 1;
  const body = normalizedBody(lines.slice(at + 1, end - 1));
  lines[at] = lines[at].replace(/sha256=[0-9a-f]{16}/i, `sha256=${hash(body)}`);
  return lines.join(/\r\n/.test(text) ? '\r\n' : '\n');
}
function frameBy(text, action, index) {
  const found = parseAir(text).find(item => item.number === action);
  return found?.frames[index] || null;
}
function same(a,b) { return String(a ?? '') === String(b ?? ''); }
function nativeExceptions(text, action, frameIndex) {
  const frame=frameBy(text,action,frameIndex),line=frame&&text.split(/\r?\n/)[frame.line-1] || '';
  const match=/\bIKEMaker link-except=([\w,]+)/.exec(line);
  return new Set((match?.[1]||'').split(',').filter(name=>exceptionFields.includes(name)));
}
function setElementException(text,{baseAction,source,frameIndex,field,keep}) {
  if (!exceptionFields.includes(field) || typeof keep!=='boolean') throw new Error('Choose a supported linked AIR field exception.');
  const pair=pairs(text,Number(baseAction)).find(item=>item.marker.source===source);
  if (!pair) throw new Error('The exact generated layer pair is missing.');
  const frame=frameBy(text,pair.number,Number(frameIndex));
  if (!frame) throw new Error('The paired element is missing.');
  const lines=text.split(/\r?\n/),at=frame.line-1,old=lines[at],before=nativeExceptions(text,pair.number,Number(frameIndex));
  keep?before.add(field):before.delete(field);
  const cleaned=old.replace(/\s*;\s*IKEMaker link-except=[\w,]+/,'');
  const names=exceptionFields.filter(name=>before.has(name));
  lines[at]=cleaned+(names.length?` ; IKEMaker link-except=${names.join(',')}`:'');
  return refreshMarker(lines.join(/\r\n/.test(text)?'\r\n':'\n'),pair.number);
}
function exceptionFor(composition, source, action, element, field) {
  const layer=composition?.layers?.find(item=>item.enabled && item.source?.kind==='bank' && `bank:${item.source.bank}`===source);
  const rules=layer?.linkExceptions;
  for (const item of [rules?.elements?.[`${action}:${element}`],rules?.actions?.[String(action)],rules?.layer])
    if (typeof item?.[field]==='boolean') return item[field];
  return false;
}
function propagateFrame(original, request, scope = 'base', composition = null, preupdatedText = null) {
  const baseAction = Number(request.action), frameIndex = Number(request.frameIndex);
  if (scope !== 'paired-frame') return { text:updateFrameElement(original,request), paired:[] };
  const generated = pairs(original,baseAction);
  const before = frameBy(original,baseAction,frameIndex);
  if (!before) throw new Error('Base AIR element is missing.');
  let text = preupdatedText === null ? updateFrameElement(original,request) : preupdatedText;
  const after = frameBy(text,baseAction,frameIndex), paired=[];
  for (const action of generated) {
    const target = frameBy(text,action.number,frameIndex);
    const owner = parseAir(text).find(item => item.number === action.number);
    if (!target || owner.frames.length !== parseAir(text).find(item => item.number === baseAction).frames.length) throw new Error(`Generated Action ${action.number} does not align element-for-element with Action ${baseAction}. No linked edit was written.`);
    const patch = {action:action.number,frameIndex,group:target.group,index:target.index};
    let changed = false;
    for (const key of fields) {
      const value = !nativeExceptions(text,action.number,frameIndex).has(key) && !exceptionFor(composition,action.marker.source,baseAction,frameIndex,key) && same(target[key],before[key]) ? after[key] : target[key];
      patch[key] = value;
      if (!same(value,target[key])) changed = true;
    }
    const oldFlags = String(before.flags || '').toUpperCase(), targetFlags = String(target.flags || '').toUpperCase(), newFlags = String(after.flags || '').toUpperCase();
    const native=nativeExceptions(text,action.number,frameIndex);
    patch.flags = ['H','V'].filter(flag => {
      const field=flag==='H'?'flipH':'flipV';
      const keep=native.has('flags')||native.has(field)||exceptionFor(composition,action.marker.source,baseAction,frameIndex,'flags')||exceptionFor(composition,action.marker.source,baseAction,frameIndex,field);
      return keep || targetFlags.includes(flag)!==oldFlags.includes(flag) ? targetFlags.includes(flag) : newFlags.includes(flag);
    }).join('');
    if (patch.flags !== targetFlags) changed = true;
    if (!changed) continue;
    text = refreshMarker(updateFrameElement(text,patch),action.number);
    paired.push(action.number);
  }
  return {text,paired};
}
function propagateDirectives(original, request, scope = 'base', composition = null) {
  if (scope !== 'paired-frame') return {text:updateFrameDirectives(original,request),paired:[]};
  const generated = pairs(original,Number(request.action)), baseBefore=frameBy(original,Number(request.action),Number(request.frameIndex));
  let text=updateFrameDirectives(original,request), paired=[];
  for (const action of generated) {
    const target=frameBy(text,action.number,Number(request.frameIndex));
    if (!target || parseAir(text).find(item=>item.number===action.number).frames.length!==parseAir(text).find(item=>item.number===Number(request.action)).frames.length) throw new Error(`Generated Action ${action.number} is not an exact element pair.`);
    const native=nativeExceptions(text,action.number,Number(request.frameIndex));
    const interpolate = native.has('interpolate') || exceptionFor(composition,action.marker.source,Number(request.action),Number(request.frameIndex),'interpolate') || !same(target.interpolate?.join(','),baseBefore.interpolate?.join(',')) ? target.interpolate : request.interpolate;
    const loopStart = native.has('loopStart') || exceptionFor(composition,action.marker.source,Number(request.action),Number(request.frameIndex),'loopStart') || Boolean(target.loopStart)!==Boolean(baseBefore.loopStart) ? target.loopStart : request.loopStart;
    text=refreshMarker(updateFrameDirectives(text,{...request,action:action.number,interpolate,loopStart}),action.number);
    paired.push(action.number);
  }
  return {text,paired};
}
function propagateFrameBatch(original,updated,baseAction,indices,composition=null) {
  let text=updated,paired=new Set();
  for(const frameIndex of [...new Set(indices)].sort((a,b)=>a-b)) {
    const result=propagateFrame(original,{action:baseAction,frameIndex},'paired-frame',composition,text);
    text=result.text;
    for(const number of result.paired)paired.add(number);
  }
  return {text,paired:[...paired]};
}
function propagateStructure(original, request, scope = 'base', sprites = null, composition = null) {
  const operation = request.type;
  const apply = (text, input) => {
    if (operation === 'insertFrame') return insertFrameElement(text,input);
    if (operation === 'deleteFrame') return deleteFrameElement(text,input);
    if (operation === 'moveFrame') return applyActionPatches(text,[moveFrameElementPatch(text,input)]);
    if (operation === 'moveFrameBlock') return applyActionPatches(text,[moveFrameBlockPatch(text,input)]);
    if (operation === 'splitElement') return applyActionPatches(text,[splitElementPatch(text,input)]);
    throw new Error(`Unsupported linked AIR structure operation ${operation}.`);
  };
  if (scope !== 'paired-frame') return {text:apply(original,request),paired:[]};
  const generated=pairs(original,Number(request.action)),base=parseAir(original).find(item=>item.number===Number(request.action));
  if (!base) throw new Error('Base Action is missing.');
  if (generated.some(action=>composition?.layers?.some(layer=>Object.keys(layer.linkExceptions?.elements||{}).some(key=>key.startsWith(`${request.action}:`)) && ((action.marker.source==='mapping' && layer.source?.kind==='mapping') || action.marker.source===`bank:${layer.source?.bank}`))))
    throw new Error('This layer has saved element exceptions. Structural editing would renumber their positions; review or clear those exception rules before moving, inserting, deleting, or splitting linked elements. Nothing was written.');
  for (const action of generated) {
    const target=parseAir(original).find(item=>item.number===action.number);
    if (!target || target.frames.length!==base.frames.length) throw new Error(`Generated Action ${action.number} is not an exact element pair.`);
    if (operation==='splitElement' && target.frames[Number(request.frameIndex)].rawTime!==base.frames[Number(request.frameIndex)].rawTime) throw new Error(`Generated Action ${action.number} has a different duration at this element and cannot share the split.`);
  }
  let text=apply(original,request),paired=[];
  const inserted=operation==='insertFrame' && request.copy===false ? frameBy(text,Number(request.action),Number(request.frameIndex)+1) : null;
  const available=Array.isArray(sprites)?new Set(sprites.map(sprite=>`${sprite.group},${sprite.number}`)):null;
  const counts=Array.isArray(sprites)?new Map():null;
  if(counts)for(const sprite of sprites){const key=`${sprite.group},${sprite.number}`;counts.set(key,(counts.get(key)||0)+1);}
  for (const action of generated) {
    text=apply(text,{...request,action:action.number});
    if (inserted) {
      const bank=/^bank:([1-6])$/.exec(action.marker.source);
      if (!bank && action.marker.source!=='mapping') throw new Error(`Generated Action ${action.number} has no supported sprite source for insertion.`);
      if (!available) throw new Error('The SFF sprite inventory is required for linked element insertion.');
      const explicit=action.marker.source==='mapping'?request.layerTargets?.[String(action.number)]:undefined;
      if(action.marker.source==='mapping'&&explicit===undefined)throw new Error(`Choose an exact mapped sprite or blank for generated Action ${action.number}.`);
      if(explicit!==undefined && explicit!==null && (!Array.isArray(explicit)||explicit.length!==2||explicit.some(value=>!Number.isInteger(value)||value<0||value>65535)))throw new Error('The reviewed mapped sprite identity is invalid.');
      const group=bank?(inserted.group>=0?inserted.group+Number(bank[1])*10000:-1):(explicit?.[0]??-1),index=bank?inserted.index:(explicit?.[1]??0);
      if(group>=0 && counts.get(`${group},${index}`)>1)throw new Error(`Mapped sprite ${group},${index} is ambiguous in the SFF. Review its exact identity before insertion.`);
      if(!bank && explicit && !available.has(`${group},${index}`))throw new Error(`Mapped sprite ${group},${index} is missing from the SFF.`);
      const target=frameBy(text,action.number,Number(request.frameIndex)+1);
      const mapped=group<=65535 && available.has(`${group},${index}`);
      text=updateFrameElement(text,{action:action.number,frameIndex:Number(request.frameIndex)+1,group:mapped?group:-1,index:mapped?index:0,x:target.x,y:target.y,time:target.time,flags:target.flags,blend:target.blend,scaleX:target.scaleX,scaleY:target.scaleY,angle:target.angle});
    }
    text=refreshMarker(text,action.number);
    paired.push(action.number);
  }
  return {text,paired};
}
module.exports={pairs,exceptionFor,nativeExceptions,setElementException,propagateFrame,propagateFrameBatch,propagateDirectives,propagateStructure};
