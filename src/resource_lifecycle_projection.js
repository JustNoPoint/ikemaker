'use strict';

const crypto=require('crypto');
const path=require('path');

const RESOURCE_CATEGORIES=Object.freeze(['helpers','explods','projectiles']);
const LIMITS=Object.freeze({files:256,perSourceBytes:4*1024*1024,sourceBytes:16*1024*1024,items:512,sites:2048,sitesPerItem:128,metadataFields:16,outputBytes:512*1024});

function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function bounded(value,limit=512){const source=String(value??'');if(Buffer.byteLength(source,'utf8')<=limit)return source;let output='';for(const character of source){if(Buffer.byteLength(`${output}${character}…`,'utf8')>limit)break;output+=character;}return `${output}…`;}
function opaque(parts){return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);}
function ownerKey(value){return String(value||'').replace(/\\/g,'/').toLowerCase();}
function recipient(expression){
  const authored=bounded(expression||'self',256),match=/^([A-Za-z][A-Za-z0-9]*)(?:\((.*)\))?$/.exec(authored),name=String(match?.[1]||authored).toLowerCase(),argument=match?.[2]===undefined?'':bounded(match[2],192),parameterized=match?.[2]!==undefined;
  return freeze({expression:authored,kind:['self','root','parent','partner','p2','stateowner'].includes(name)?name:['helper','target','enemy','enemynear','player','playerid'].includes(name)?name:'authored-expression',parameterized,argument,dynamic:parameterized&&!/^-?\d+$/.test(argument)});
}
function metadata(value){const output={};for(const [key,item] of Object.entries(value||{}).slice(0,LIMITS.metadataFields))output[bounded(key,128)]=bounded(item,512);return output;}
function unavailable(ownerIdentity,reason,details={}){return freeze({schema:'ikemaker.resource-lifecycle-projection',version:1,ownerIdentity:bounded(ownerIdentity,4096),status:'unavailable',complete:false,items:[],counts:{items:0,sites:0,omittedItems:0,omittedSites:0},limitations:[bounded(reason,1024)],...details});}

function buildResourceLifecycleProjection(catalog,options={}){
  const catalogOwner=String(catalog?.ownerIdentity||''),requestedOwner=String(options.ownerIdentity||catalogOwner),contextOwnerIdentity=String(options.contextOwnerIdentity||'');
  if(!catalogOwner||!requestedOwner||!contextOwnerIdentity)return unavailable(catalogOwner,'Exact character ownership is unavailable.');
  if(ownerKey(catalogOwner)!==ownerKey(requestedOwner)||ownerKey(catalogOwner)!==ownerKey(contextOwnerIdentity))return unavailable(catalogOwner,'The catalog, request, and active character do not share the same exact owner.');
  const ownerIdentity=catalogOwner;
  const sources=Object.values(catalog?.sources||{}),aggregate=sources.reduce((sum,item)=>sum+Number(item.bytes||0),0);
  const admissionFailure=(catalog?.failures||[]).find(item=>/admission limit|aggregate admission limit|file admission limit/i.test(String(item?.reason||item?.message||'')));if(admissionFailure)return unavailable(ownerIdentity,String(admissionFailure.reason||admissionFailure.message));
  if(sources.length>LIMITS.files)return unavailable(ownerIdentity,`The lifecycle inventory exceeds the ${LIMITS.files}-file admission limit.`,{counts:{items:0,sites:0,omittedItems:0,omittedSites:0}});
  if(sources.some(item=>Number(item.bytes||0)>LIMITS.perSourceBytes))return unavailable(ownerIdentity,'A lifecycle source exceeds the 4 MiB per-file admission limit.');
  if(aggregate>LIMITS.sourceBytes)return unavailable(ownerIdentity,'Lifecycle sources exceed the 16 MiB aggregate admission limit.');
  const order=new Map(sources.map((item,index)=>[path.resolve(item.filename).toLowerCase(),index])),candidates=(catalog?.entries||[]).filter(item=>RESOURCE_CATEGORIES.includes(item.category)),items=[];
  let siteCount=0,omittedItems=0,omittedSites=0;
  for(const entry of candidates){
    if(items.length>=LIMITS.items){omittedItems+=1;omittedSites+=(entry.sites||[]).filter(site=>site.assigned).length;continue;}
    const admitted=(entry.sites||[]).filter(site=>site.assigned).sort((left,right)=>(order.get(path.resolve(left.filename).toLowerCase())??Number.MAX_SAFE_INTEGER)-(order.get(path.resolve(right.filename).toLowerCase())??Number.MAX_SAFE_INTEGER)||Number(left.line)-Number(right.line)||Number(left.start)-Number(right.start));
    if(!admitted.length)continue;
    const sites=[];
    for(const site of admitted){
      if(sites.length>=LIMITS.sitesPerItem||siteCount>=LIMITS.sites){omittedSites+=1;continue;}
      const sourceRecord=catalog.sources?.[path.resolve(site.filename).toLowerCase()];
      if(!sourceRecord?.hash){omittedSites+=1;continue;}
      const route=freeze({filename:path.resolve(site.filename),line:Math.max(0,Number(site.line)||0),start:Math.max(0,Number(site.start)||0),fingerprint:sourceRecord.hash,ownerIdentity:bounded(ownerIdentity,4096)});
      sites.push(freeze({id:opaque([entry.category,entry.name,route.filename,route.line,route.start,site.role,site.access]),role:bounded(site.role||'reference',64),access:bounded(site.access||'',64),literal:site.literal!==false,owner:freeze({kind:bounded(site.ownerKind||'',64),name:bounded(site.ownerName||'',256),line:Number.isInteger(site.ownerLine)?site.ownerLine:null}),recipient:recipient(site.runtimeOwner),metadata:freeze(metadata(site.metadata)),source:route}));siteCount+=1;
    }
    const stateStarts=(entry.stateStarts||[]).slice(0,32).map(value=>freeze({state:bounded(value.name,128),status:bounded(value.status||'definition unresolved',128),source:freeze({filename:path.resolve(value.filename),line:Math.max(0,Number(value.line)||0),fingerprint:catalog.sources?.[path.resolve(value.filename).toLowerCase()]?.hash||'',ownerIdentity:bounded(ownerIdentity,4096)})}));
    items.push(freeze({id:opaque(['resource-lifecycle',entry.category,entry.name]),namespace:entry.category.slice(0,-1),resourceId:bounded(entry.name,256),literal:admitted.every(site=>site.literal!==false),status:bounded(entry.status||'observed',256),roles:freeze([...new Set(admitted.map(site=>site.role||'reference'))]),sites:freeze(sites),stateStarts:freeze(stateStarts)}));
  }
  const limitations=[];
  if(catalog?.resolved===false)limitations.push('Assigned project ownership is incomplete.');
  if(catalog?.failures?.length)limitations.push(`${catalog.failures.length} assigned source file(s) could not be indexed.`);
  const idless=items.filter(item=>item.resourceId==='(id omitted)').length;if(idless)limitations.push(`${idless} creation lifecycle(s) omit an ID and remain unresolved.`);
  if(omittedItems||omittedSites)limitations.push(`${omittedItems} lifecycle item(s) and ${omittedSites} site(s) were omitted by projection bounds.`);
  const result={schema:'ikemaker.resource-lifecycle-projection',version:1,ownerIdentity:bounded(ownerIdentity,4096),status:limitations.length?'incomplete':'ready',complete:limitations.length===0,items,counts:{items:items.length,sites:siteCount,omittedItems,omittedSites},limitations};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>LIMITS.outputBytes)return unavailable(ownerIdentity,'The lifecycle projection exceeds its 512 KiB output limit.',{counts:result.counts});
  return freeze(result);
}

function validateResourceLifecycleRoute(route,catalog,contextOwnerIdentity){
  if(!route||!catalog)return freeze({available:false,reason:'The lifecycle source route is unavailable.'});
  const ownerIdentity=String(catalog.ownerIdentity||''),filename=path.resolve(String(route.filename||'')),record=catalog.sources?.[filename.toLowerCase()];
  if(!ownerIdentity||ownerKey(ownerIdentity)!==ownerKey(contextOwnerIdentity)||ownerKey(route.ownerIdentity)!==ownerKey(ownerIdentity))return freeze({available:false,reason:'The active character no longer owns this lifecycle source.'});
  if(!record||record.hash!==route.fingerprint)return freeze({available:false,reason:'The lifecycle source changed after the inventory was built.'});
  return freeze({available:true,filename,line:Math.max(0,Number(route.line)||0),fingerprint:route.fingerprint,ownerIdentity});
}

module.exports={RESOURCE_CATEGORIES,LIMITS,buildResourceLifecycleProjection,validateResourceLifecycleRoute,recipient};
