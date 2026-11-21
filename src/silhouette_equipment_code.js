'use strict';
const {buildCostumeExplod}=require('./costume_explod_model');
function paletteId(value,label){
  const match=/^(\d+),(\d+)$/.exec(String(value||''));
  if(!match||match.slice(1).some(n=>Number(n)>65535))throw Error(label+' must be an exact palette group,number.');
  return match.slice(1).map(Number);
}
function expression(value){
  const text=String(value??'map(ikemaker_equipped_claw)').trim();
  if(!text||/[\r\n;{}\[\]#]/.test(text))throw Error('Equipment condition must be a single trigger expression.');
  return text;
}
function spriteConditions(sprites) {
  const groups = new Map();
  for (const sprite of sprites) {
    if (!groups.has(sprite.group)) groups.set(sprite.group, []);
    groups.get(sprite.group).push(sprite.number);
  }
  const conditions = [];
  for (const [group, numbers] of groups) {
    numbers.sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      const start = numbers[i];
      while (numbers[i + 1] === numbers[i] + 1) i++;
      const end = numbers[i];
      const image = start === end ? 'spriteVar(image) = ' + start : 'spriteVar(image) >= ' + start + ' && spriteVar(image) <= ' + end;
      conditions.push('(spriteVar(group) = ' + group + ' && ' + image + ')');
    }
  }
  return conditions;
}
// Callable by review and native QA. The caller appends the returned AIR and both
// state phases through the existing reviewed costume transaction.
function buildSilhouetteEquipment(options={}){
  const lang=String(options.language||'zss').toLowerCase(), equipped=expression(options.equippedExpression);
  if(!['zss','cns'].includes(lang))throw Error('language must be zss or cns.');
  if(!Array.isArray(options.palettePairs)||!options.palettePairs.length)throw Error('Reviewed exact owner palette pairs are required.');
  const sources=new Set();
  const pairs=options.palettePairs.map(row=>{
    const source=paletteId(row.sourceId,'sourceId'),on=paletteId(row.equippedId,'equippedId'),off=paletteId(row.offId,'offId');
    const key=source.join(',');if(sources.has(key))throw Error('Duplicate owner palette source '+key);sources.add(key);
    return {source,on,off};
  });
  const mapping=options.mappings ?? options.review?.cumulativeMappings ?? options.review?.mappings;
  if(!Array.isArray(mapping)||!mapping.length)throw Error('Reviewed cumulative baked sprite mappings are required.');
  const exactMapping=new Map();
  for(const row of mapping){paletteId(row.baseId,'baseId');paletteId(row.layerId,'layerId');if(exactMapping.has(row.baseId)&&exactMapping.get(row.baseId)!==row.layerId)throw Error('Conflicting baked mapping '+row.baseId);exactMapping.set(row.baseId,row.layerId);}
  const layer=options.layer||{id:'layer1',label:'Visible claw',syncLayer:1};
  const mappedLayer={...layer,bank:null,source:{kind:'mapping',mapping:Object.fromEntries(exactMapping)},equipmentIdentity:`silhouette:${layer.id||'layer1'}:bank:${options.bank??layer.source?.bank??1}`};
  const {equipment:unusedEquipment,...plainOptions}=options;
  const generated=buildCostumeExplod({...plainOptions,layer:{...mappedLayer,runtimeRendering:'attached'},runtimeMode:'body-pose',runtimeVisibility:equipped,castShadow:false,showReflection:false});
  const id=generated.summary.explodId;
  const cacheGroup=`ikemaker_equipment_${id}_group`,cacheIndex=`ikemaker_equipment_${id}_index`;
  const observed=pair=>`map(${cacheGroup}) = ${pair[0]} && map(${cacheIndex}) = ${pair[1]}`;
  const remapRows=[];
  for(const [sourceIndex,source] of pairs.entries()){
    const sourcePhysical=options.palettePairs[sourceIndex].sourcePhysicalIndex;
    const sprites=Number.isInteger(sourcePhysical)?(options.sprites||[]).filter(sprite=>sprite.paletteIndex===sourcePhysical&&exactMapping.has(`${sprite.group},${sprite.number}`)):[];
    const hasHeaders = (options.sprites || []).some(sprite => Number.isInteger(sprite.paletteIndex));
    if (hasHeaders && !sprites.length) continue;
    const conditions = sprites.length === options.sprites?.length
      ? ['1'] : spriteConditions(sprites);
    // Callers without archive headers use the first reviewed palette as their source.
    const currentChunks = conditions.length ? Array.from({length: Math.ceil(conditions.length / 12)},
      (_, i) => conditions.slice(i * 12, i * 12 + 12).join(' || ')) : [sourceIndex === 0 ? '1' : '0'];
    for(const current of currentChunks) for(const target of pairs){
      for(const [isOn,palette] of [[true,target.on],[false,target.off]]){
        const needs=isOn?target.off:target.on;
        const trigger=`(${observed(needs)}) && (${isOn?equipped:'!('+equipped+')'}) && (${current})`;
        remapRows.push({source:source.source,dest:palette,trigger});
      }
    }
  }
  const remaps=lang==='zss'
    ? ['ignorehitpause if !isHelper {',`\tmap(${cacheGroup}) := drawPal(group);`,`\tmap(${cacheIndex}) := drawPal(index);`,...remapRows.map(row=>`\tif ${row.trigger} {remapPal{source: ${row.source.join(', ')}; dest: ${row.dest.join(', ')};}}`),'}'].join('\n')
    : [ ...[[cacheGroup,'DrawPal(group)'],[cacheIndex,'DrawPal(index)']].map(([name,value])=>[`[State +1, cache equipment displayed palette]`,'type = MapSet','trigger1 = !IsHelper',`map = "${name}"`,`value = ${value}`,'ignorehitpause = 1',''].join('\n')), ...remapRows.map(row=>[`[State +1, silhouette equipment owner palette ${row.source.join(',')}]`,'type = RemapPal','triggerall = !IsHelper',`trigger1 = ${row.trigger}`,`source = ${row.source.join(', ')}`,`dest = ${row.dest.join(', ')}`,'ignorehitpause = 1',''].join('\n'))].join('\n');
  // Remove before the normal pose cache/creation path; its visibility condition
  // also clears the cache, preventing foreign/custom-state recreation this tick.
  const remove=lang==='zss'
    ? `ignorehitpause if !isHelper && !(${equipped}) && numExplod(${id}) {removeExplod{id: ${id}}}`
    : [`[State +1, silhouette equipment off immediately]`,'type = RemoveExplod',`trigger1 = !IsHelper && !(${equipped}) && NumExplod(${id})`,`id = ${id}`,'ignorehitpause = 1',''].join('\n');
  const comment=lang==='zss'?'#':';';
  const post=generated.postStateCode.replace(/^(\[StateDef \+1\])\n/i,`$1\n${comment} Exact owner palette remaps preserve the selected costume palette.\n${remaps}\n${remove}\n`);
  return {...generated,stateCode:post,postStateCode:post,summary:{...generated.summary,equipment:{...(options.archiveHash?{archiveHash:options.archiveHash}:{}),mappings:[...exactMapping].map(([baseId,layerId])=>({baseId,layerId})),bank:options.bank??layer.source?.bank??1,equippedExpression:equipped,palettePairs:options.palettePairs,castShadow:false,showReflection:false},warnings:generated.summary.warnings.concat('Set the equipment condition in your existing loss/pickup controllers. Keep both returned state phases assigned to the owner; +1 runs after the current state, including custom states.')}};
}
module.exports={buildSilhouetteEquipment};


