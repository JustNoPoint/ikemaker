'use strict';

const crypto = require('crypto');
const path = require('path');

const MAX_PREVIEW_SETS = 24;

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function sha(value) { return crypto.createHash('sha256').update(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))).digest('hex'); }
function integer(value) { const number=Number(value);return Number.isInteger(number)&&number>=0?number:null; }
function evidence(value = {}) { return { filename: path.resolve(String(value.filename || '')), exists: value.exists !== false, byteHash: String(value.byteHash || ''), byteLength: Math.max(0, Number(value.byteLength) || 0) }; }
function identity(value = {}) { return { physicalIndex: integer(value.physicalIndex), group: integer(value.group), number: integer(value.number) }; }
function colors(value) { return Array.isArray(value) && value.length === 256 ? value.map(color => { if (!Array.isArray(color) || color.length < 4) throw new Error('Saved preview palette requires 256 exact RGBA entries.'); return color.slice(0, 4).map(channel => Math.max(0, Math.min(255, Math.trunc(Number(channel) || 0)))); }) : null; }
function list(value) { return [...new Set((value || []).map(String).filter(Boolean))].slice(0, 64); }

function airIdentity(value) {
  if (!value || value.kind !== 'air' || !value.airPath) return null;
  return {
    kind: 'air', airPath: path.resolve(value.airPath), airByteHash: String(value.airByteHash || ''),
    actionNumber: integer(value.actionNumber), frameIndex: integer(value.frameIndex), sourceLine: integer(value.sourceLine),
    referencedSprite: value.referencedSprite ? { group: integer(value.referencedSprite.group), number: integer(value.referencedSprite.number) } : null
  };
}

function normalizeSet(value = {}) {
  const paletteColors=colors(value.preview?.colors);
  return {
    id: String(value.id || ''), name: String(value.name || '').trim().slice(0, 80), createdAt: String(value.createdAt || ''),
    target: evidence(value.target), sprite: identity(value.sprite), palette: identity(value.palette), action: airIdentity(value.action),
    preview: { kind: ['embedded','draft','candidate'].includes(value.preview?.kind) ? value.preview.kind : 'embedded', colors: paletteColors, colorsHash: paletteColors ? sha(paletteColors) : '', label: String(value.preview?.label || '').slice(0, 120), source: value.preview?.source?.filename ? evidence(value.preview.source) : null, actOrder: value.preview?.actOrder == null ? null : String(value.preview.actOrder) },
    assumptions: { domainIds: list(value.assumptions?.domainIds), remapPalGroupIds: list(value.assumptions?.remapPalGroupIds), runtimeRemap: value.assumptions?.runtimeRemap === 'known' ? 'known' : 'unknown', registryRevision: Math.max(0, Number(value.assumptions?.registryRevision) || 0), registryByteHash: String(value.assumptions?.registryByteHash || '') }
  };
}

function normalizePreviewSets(value = {}) {
  const items=[],seen=new Set();
  for (const raw of value.items || []) { try { const item=normalizeSet(raw);if (!item.id || !item.name || seen.has(item.id)) continue;seen.add(item.id);items.push(item); } catch (_) { /* Corrupt retained convenience entries are ignored. */ } }
  return { items: items.slice(-MAX_PREVIEW_SETS), selectedId: seen.has(String(value.selectedId || '')) ? String(value.selectedId) : '' };
}

function exactArchiveItem(items, selected, label) {
  const item=items?.[selected.physicalIndex];
  if (!item || Number(item.group)!==selected.group || Number(item.number)!==selected.number) throw new Error(`The selected physical ${label} changed. Select it again before saving a preview set.`);
  return item;
}

function capture(input = {}) {
  const session=input.session||{},archive=input.archive||{},sprite=identity(session.selection?.sprite),palette=identity(session.selection?.palette);
  exactArchiveItem(archive.sprites,sprite,'sprite'); exactArchiveItem(archive.palettes,palette,'palette');
  const paletteColors=colors(input.colors);if(!paletteColors)throw new Error('Save Preview Set requires the exact 256-entry rendered palette.');
  const target=evidence(session.target),name=String(input.name||'').trim().slice(0,80);if(!name)throw new Error('Enter a short name for the preview set.');
  const createdAt=String(input.now||new Date().toISOString()),candidate=session.candidate?.active,kind=candidate?'candidate':session.preview?.dirty?'draft':'embedded',source=session.preview?.source?.filename?evidence(session.preview.source):null;
  const seed={name,target,sprite,palette,action:airIdentity(session.context?.returnContext),createdAt};
  return normalizeSet({ id:`preview-${sha(seed).slice(0,20)}`,name,createdAt,target,sprite,palette,action:seed.action,preview:{kind,colors:paletteColors,label:session.preview?.label||'',source,actOrder:session.preview?.actOrder||null},assumptions:{domainIds:session.domains?.selectedDomainIds||[],remapPalGroupIds:session.domains?.selectedRemapPalGroupIds||[],runtimeRemap:'unknown',registryRevision:session.domains?.registryRevision||0,registryByteHash:session.domains?.registryByteHash||''} });
}

function upsert(collection, item) {
  const current=normalizePreviewSets(collection),next=normalizeSet(item),items=current.items.filter(value=>value.id!==next.id&&value.name.toLowerCase()!==next.name.toLowerCase());items.push(next);
  return normalizePreviewSets({items:items.slice(-MAX_PREVIEW_SETS),selectedId:next.id});
}
function remove(collection,id){const current=normalizePreviewSets(collection),items=current.items.filter(item=>item.id!==String(id));return normalizePreviewSets({items,selectedId:current.selectedId===String(id)?'':current.selectedId});}

function sameEvidence(left,right){return Boolean(left&&right&&path.resolve(left.filename)===path.resolve(right.filename)&&left.byteHash===right.byteHash&&Number(left.byteLength)===Number(right.byteLength)&&right.exists!==false);}
function coordinateCount(items, selected){return(items||[]).filter(item=>Number(item.group)===selected.group&&Number(item.number)===selected.number).length;}
function reconcile(raw,input={}){
  const item=normalizeSet(raw),issues=[],target=input.target?evidence(input.target):null,archive=input.archive||{};
  if(!target?.exists)issues.push({code:'TARGET_MISSING',level:'missing',message:'The saved SFF target is missing.'});else if(!sameEvidence(item.target,target))issues.push({code:'TARGET_CHANGED',level:'stale',message:'The SFF changed after this preview set was saved.'});
  for(const [kind,items]of [['sprite',archive.sprites],['palette',archive.palettes]]){const selected=item[kind],physical=items?.[selected.physicalIndex],matches=coordinateCount(items,selected);if(!physical)issues.push({code:`${kind.toUpperCase()}_MISSING`,level:'missing',message:`The saved physical ${kind} no longer exists.`});else if(Number(physical.group)!==selected.group||Number(physical.number)!==selected.number)issues.push({code:`${kind.toUpperCase()}_REMAPPED`,level:'stale',message:`The saved physical ${kind} now has a different group or number.`});if(matches>1)issues.push({code:`${kind.toUpperCase()}_DUPLICATE_COORDINATE`,level:'warning',message:`${matches} ${kind}s share ${selected.group},${selected.number}; the saved physical index remains explicit.`});}
  if(item.action){let observed=null;try{observed=input.fileEvidence?.(item.action.airPath,false)||null;}catch(_){observed=null}if(!observed?.exists)issues.push({code:'AIR_MISSING',level:'missing',message:'The saved AIR source is missing.'});else if(observed.byteHash!==item.action.airByteHash)issues.push({code:'AIR_CHANGED',level:'stale',message:'The AIR source changed after this preview set was saved.'});}
  if(item.preview.source){let observed=null;try{observed=input.fileEvidence?.(item.preview.source.filename,false)||null;}catch(_){observed=null}if(!observed?.exists)issues.push({code:'PALETTE_SOURCE_MISSING',level:'missing',message:'The saved external palette source is missing.'});else if(!sameEvidence(item.preview.source,observed))issues.push({code:'PALETTE_SOURCE_CHANGED',level:'stale',message:'The saved external palette source changed.'});}
  const domains=input.domains||{};if(item.assumptions.registryByteHash&&(item.assumptions.registryByteHash!==String(domains.registryByteHash||'')||item.assumptions.registryRevision!==Number(domains.registryRevision||0)))issues.push({code:'DOMAIN_REGISTRY_CHANGED',level:'stale',message:'Palette Domain or RemapPal metadata changed after this set was saved.'});
  const blocking=issues.some(issue=>issue.level==='missing'||issue.level==='stale');return{item,status:blocking?(issues.some(issue=>issue.level==='missing')?'missing':'stale'):'exact',canOpen:!blocking,issues};
}

function restorePatch(raw){const item=normalizeSet(raw);return{selection:{sprite:item.sprite,palette:item.palette},context:{returnContext:clone(item.action)},preview:{dirty:item.preview.kind!=='embedded',stale:false,colors:item.preview.kind==='embedded'?null:item.preview.colors,source:item.preview.source,actOrder:item.preview.actOrder,label:item.preview.label},facts:{preview:item.preview.kind==='embedded'?'none':'draft'},domains:{selectedDomainIds:item.assumptions.domainIds,selectedRemapPalGroupIds:item.assumptions.remapPalGroupIds},previewSets:{selectedId:item.id}};}

module.exports={MAX_PREVIEW_SETS,normalizePreviewSets,capture,upsert,remove,reconcile,restorePatch};
