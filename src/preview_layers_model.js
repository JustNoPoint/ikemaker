'use strict';

// Preview composition metadata has no authority to edit SFF pixels/axes or AIR.
function normalizePreviewLayers(value) {
  value=value&&typeof value==='object'?value:{};
  const number=(v,f,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):f;
  function normalizeBlend(value) {
    const mode=String(value||'normal').trim().toLowerCase();
    if(['normal','opaque','add','subtract','multiply','screen'].includes(mode))return mode;
    if(['a','a1','s','sa'].includes(mode))return mode.toUpperCase();
    const weights=/^(as|ss|sas)(\d{1,3})(?:d(\d{1,3}))?$/.exec(mode);
    if(!weights)return 'normal';
    const destination = weights[3] === undefined ? '' : 'D' + Math.min(256, Number(weights[3]));
    return weights[1].toUpperCase() + Math.min(256, Number(weights[2])) + destination;
  }
  function linkExceptions(input) {
    const names=['x','y','time','flags','flipH','flipV','scaleX','scaleY','angle','blend','interpolate','loopStart'];
    const rule=value=>Object.fromEntries(names.filter(name=>typeof value?.[name]==='boolean').map(name=>[name,value[name]]));
    const scopes=value=>Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).filter(([key])=>/^[0-9]+(?::[0-9]+)?$/.test(key)).slice(0,4096).map(([key,item])=>[key,rule(item)]));
    return {layer:rule(input?.layer),actions:scopes(input?.actions),elements:scopes(input?.elements)};
  }
  function axisMapping(input) {
    if(!input||typeof input!=='object'||Array.isArray(input))return {};
    return Object.fromEntries(Object.entries(input).filter(([from,to])=>/^\d+,\d+$/.test(from)&&(to===null||typeof to==='string'&&/^\d+,\d+$/.test(to))).slice(0,4096));
  }
  const ids=['base','layer1','layer2','layer3','layer4'];
  const layers=ids.map((id,index)=>{
    const item=(Array.isArray(value.layers)?value.layers:[]).find(item=>item?.id===id)||{};
    const source=item.source&&typeof item.source==='object'?item.source:{};
    const legacyBodyEffects=value.version===1 && item.enabled===true && source.kind!=='animation';
    return {id,castShadow:typeof item.castShadow==='boolean'?item.castShadow:legacyBodyEffects,
      showReflection:typeof item.showReflection==='boolean'?item.showReflection:legacyBodyEffects,
      displayName:String(item.displayName||'').slice(0,80),labelMode:item.labelMode==='name'?'name':'group',label:String(item.label||(index?'Layer '+index:'Base')).slice(0,80),enabled:index?item.enabled===true:true,visible:item.visible!==false,followBasePalette:item.followBasePalette!==false,
      source:{kind:source.kind==='animation'?'animation':source.kind==='bank'?'bank':'sprite',group:Math.round(number(source.group,0,-32768,65535)),index:Math.round(number(source.index,0,-32768,65535)),action:Math.round(number(source.action,0,0,2147483647)),bank:Math.round(number(source.bank,index,0,6)),speed:number(source.speed,1,.01,10),tick:number(source.tick,0,0,2147483647),playing:source.playing!==false},
      x:number(item.x,0,-32768,32767),y:number(item.y,0,-32768,32767),scaleX:number(item.scaleX,1,.01,100),scaleY:number(item.scaleY,1,.01,100),angle:number(item.angle,0,-3600,3600),flipX:item.flipX===true,flipY:item.flipY===true,opacity:number(item.opacity,1,0,1),blend:normalizeBlend(item.blend),order:number(item.order,index,-99,99),runtimeRendering:item.runtimeRendering==='independent'?'independent':'grouped',runtimePriority:Math.round(number(item.runtimePriority,0,-2147483648,2147483647)),linkExceptions:linkExceptions(item.linkExceptions),axisLink:item.axisLink===true,axisMapping:axisMapping(item.axisMapping)};
  });
  // Migrate legacy arbitrary priorities to contiguous back-to-front positions.
  [...layers].sort((a,b)=>a.order-b.order||ids.indexOf(a.id)-ids.indexOf(b.id)).forEach((layer,index)=>{layer.order=index;});
  const selected=[...new Set((Array.isArray(value.selected)?value.selected:['base']).filter(id=>ids.includes(id)))];
  if(!selected.length)selected.push('base');
  return {version:2,primary:selected.includes(value.primary)?value.primary:selected[0],selected,layers};
}

function editPreviewLayers(value,ids,patch) {
  const state=normalizePreviewLayers(value),selected=new Set(ids),primary=state.layers.find(layer=>layer.id===state.primary)||state.layers[0];
  const deltaKeys=['x','y','scaleX','scaleY','angle','opacity','order'];
  const deltas=Object.fromEntries(deltaKeys.filter(key=>Object.hasOwn(patch,key)&&Number.isFinite(Number(patch[key]))).map(key=>[key,Number(patch[key])-primary[key]]));
  return normalizePreviewLayers({...state,layers:state.layers.map(layer=>selected.has(layer.id)?{...layer,...patch,...Object.fromEntries(Object.entries(deltas).map(([key,delta])=>[key,layer[key]+delta]))}:layer)});
}
module.exports={normalizePreviewLayers,editPreviewLayers};
function orderedPreviewLayers(value) {
  const layers=Array.isArray(value?.layers)?value.layers:[];
  return [...layers].sort((a,b)=>a.order-b.order||layers.indexOf(a)-layers.indexOf(b));
}
function movePreviewLayer(value,id,beforeId=null) {
  const state=normalizePreviewLayers(value),ordered=orderedPreviewLayers(state),moving=ordered.find(layer=>layer.id===id);
  if(!moving||id===beforeId||beforeId!==null&&!ordered.some(layer=>layer.id===beforeId))return state;
  const next=ordered.filter(layer=>layer.id!==id),index=beforeId===null?next.length:next.findIndex(layer=>layer.id===beforeId);next.splice(index,0,moving);
  const ranks=new Map(next.map((layer,index)=>[layer.id,index]));
  return normalizePreviewLayers({...state,layers:state.layers.map(layer=>({...layer,order:ranks.get(layer.id)}))});
}
module.exports.orderedPreviewLayers=orderedPreviewLayers;
module.exports.movePreviewLayer=movePreviewLayer;
