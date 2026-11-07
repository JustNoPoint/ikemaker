'use strict';
// Upstream HitDefVar documentation used a tuple-shaped name the compiler rejects.
// Keep this correction at catalog ingestion, not in arbitrary authored source.
function normalizeTriggerEntry(entry){
  if(String(entry?.name||'').toLowerCase()!=='hitdefvar')return entry;
  const fix=value=>typeof value==='string'?value.replace(/\bfall\.velocity\.([xyz])\b/gi,(_match,axis)=>`fall.${axis.toLowerCase()}velocity`):Array.isArray(value)?value.map(fix):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fix(item)])):value;
  const result=fix(entry);
  if(!['x','y','z'].every(axis=>String(result.description||'').includes(`fall.${axis}velocity`)))result.description=String(result.description||'')+' Fall-velocity parameter names are fall.xvelocity, fall.yvelocity and fall.zvelocity; values are scaled to the caller’s local coordinates.';
  if(!Array.isArray(result.argumentSlots)||!result.argumentSlots.length)result.argumentSlots=[{position:0,name:'param',type:'parameter name',meaning:'Choose a HitDefVar parameter; other compiler-supported names may be entered manually.',choices:['x','y','z'].map(axis=>({value:`fall.${axis}velocity`,type:'float',meaning:`Active HitDef fall ${axis.toUpperCase()} velocity, scaled to the caller’s local coordinates.`}))}];
  return result;
}
function normalizeTriggerCatalog(entries){return(Array.isArray(entries)?entries:[]).map(normalizeTriggerEntry);}
module.exports={normalizeTriggerEntry,normalizeTriggerCatalog};
