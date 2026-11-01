'use strict';

const crypto = require('crypto');

const SCHEMA = 'ikemaker.palette-template-sidecar';
const VERSION = 1;
const DEFAULT_GROUP_ID = 'swatches';

const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
const cleanName = (value, fallback) => String(value || '').trim().slice(0, 80) || fallback;
const rgba = colorId => String(colorId || '').split(',').map(Number);
function channel(value) { const normalized=Math.max(0,Math.min(255,Number(value)||0))/255;return normalized<=0.04045?normalized/12.92:Math.pow((normalized+0.055)/1.055,2.4); }
function luminance(colorId) { const color=rgba(colorId);return channel(color[0])*0.2126+channel(color[1])*0.7152+channel(color[2])*0.0722; }
function orderColors(colorIds, order = 'manual') {
  const colors=[...colorIds];
  if(order==='light-to-dark')return colors.sort((left,right)=>luminance(right)-luminance(left)||left.localeCompare(right));
  if(order==='dark-to-light')return colors.sort((left,right)=>luminance(left)-luminance(right)||left.localeCompare(right));
  return colors;
}
function effectiveGroupGap(retainedColorCount, groupCount, requested = 5) {
  const colors=Math.max(0,Math.min(256,Math.trunc(Number(retainedColorCount)||0))),boundaries=Math.max(0,Math.trunc(Number(groupCount)||0)-1),wanted=Math.max(0,Math.min(64,Math.trunc(Number(requested)||0)));
  if(!boundaries)return 0;
  const available=Math.max(0,255-colors);
  return Math.min(wanted,Math.floor(available/boundaries));
}
function normalizedId(value, index, used) { let base=String(value||'').trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||`group-${index+1}`,id=base,suffix=2;while(used.has(id))id=`${base}-${suffix++}`;used.add(id);return id; }
function normalize(settings = {}, retainedColorIds = [], options = {}) {
  const retained=[...new Set(retainedColorIds.map(String))],known=new Set(retained),usedIds=new Set(),assigned=new Set();
  let source=Array.isArray(settings.groups)?settings.groups:[];
  if(!source.length&&options.createDefault!==false)source=[{id:DEFAULT_GROUP_ID,name:'Swatches',order:'manual',colorIds:retained}];
  const groups=source.map((group,index)=>{const id=normalizedId(group.id,index,usedIds),order=['manual','light-to-dark','dark-to-light'].includes(group.order)?group.order:'manual',colorIds=[];for(const colorId of Array.isArray(group.colorIds)?group.colorIds:[]){const exact=String(colorId);if(known.has(exact)&&!assigned.has(exact)){assigned.add(exact);colorIds.push(exact)}}return{id,name:cleanName(group.name,`Swatch group ${index+1}`),order,colorIds:orderColors(colorIds,order)}});
  const unassignedColorIds=retained.filter(colorId=>!assigned.has(colorId));
  const gap=Number.isFinite(Number(settings.gap))?Math.trunc(Number(settings.gap)):1,groupGap=Number.isFinite(Number(settings.groupGap))?Math.trunc(Number(settings.groupGap)):5,requestedGroupGap=Math.max(0,Math.min(64,groupGap)),appliedGroupGap=effectiveGroupGap(retained.length,groups.filter(group=>group.colorIds.length).length,requestedGroupGap);
  const fillerEnabled=settings.fillerEnabled===true,fillerColorId=String(settings.fillerColorId||'').trim(),fillerChannels=fillerColorId.split(',').map(Number),validFiller=fillerChannels.length===4&&fillerChannels.every(value=>Number.isInteger(value)&&value>=0&&value<=255)&&fillerChannels[3]===255;
  if(fillerEnabled&&!validFiller)throw new Error('Choose an exact opaque filler color before enabling group separators.');
  if(fillerEnabled&&known.has(fillerColorId))throw new Error('The filler color is already used by a retained sprite color. Choose a color that the sprites do not use.');
  return{enabled:settings.enabled!==false,showLabels:settings.showLabels!==false,cellSize:Math.max(2,Math.min(64,Math.trunc(Number(settings.cellSize)||12))),gap:Math.max(0,Math.min(16,gap)),columns:Math.max(1,Math.min(64,Math.trunc(Number(settings.columns)||16))),groupGap:requestedGroupGap,effectiveGroupGap:appliedGroupGap,groupGapReduced:appliedGroupGap<requestedGroupGap,groups,unassignedColorIds,retainedColorCount:retained.length,assignedColorCount:assigned.size,complete:unassignedColorIds.length===0,fillerEnabled,fillerColorId:fillerEnabled?fillerColorId:'',fillerPolicy:fillerEnabled?{purpose:'named-group-separator',transparentIndex:false,preferredIndex:'nonzero-unused',requestedGap:requestedGroupGap,effectiveGap:appliedGroupGap}:null};
}
function sidecar(input) {
  const body={schema:SCHEMA,version:VERSION,createdAt:String(input.createdAt||new Date().toISOString()),inventoryHash:String(input.inventoryHash||''),pngFilename:String(input.pngFilename||''),sourceFiles:(input.sourceFiles||[]).map(String),display:input.display||{},layout:input.layout||{},swatches:input.swatches||{},finalization:input.finalization||null,indexedOutput:input.indexedOutput||null};
  return{...body,sidecarHash:hash(body)};
}
function parseSidecar(value) { const parsed=Buffer.isBuffer(value)?JSON.parse(value.toString('utf8')):typeof value==='string'?JSON.parse(value):value;if(!parsed||parsed.schema!==SCHEMA||parsed.version!==VERSION)throw new Error('This is not a supported IKEMaker palette-template sidecar.');const body={...parsed};delete body.sidecarHash;if(parsed.sidecarHash&&parsed.sidecarHash!==hash(body))throw new Error('The IKEMaker palette-template sidecar failed its integrity check.');return parsed; }

module.exports = { SCHEMA, VERSION, DEFAULT_GROUP_ID, luminance, orderColors, effectiveGroupGap, normalize, sidecar, parseSidecar, hash };
