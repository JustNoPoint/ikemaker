'use strict';
const model=require('./engine_registry_model');
const crypto=require('node:crypto');
const BUILT_IN_ENGINE_CATALOG=require('../data/engine-capability-catalog.json');
const ENGINE_CATALOG_KEY='ikemenZss.engineCapabilityCatalog.v1';
const union=(left=[],right=[])=>[...new Set([...left,...right])];
const records=(left=[],right=[])=>[...new Map([...left,...right].map(row=>[JSON.stringify(row),row])).values()];
function identityConflict(left,right){return['commit','platform','executableSha256','artifactSha256'].some(key=>left[key]&&right[key]&&left[key]!=='unknown'&&right[key]!=='unknown'&&left[key]!==right[key]);}
function identityKey(build){return JSON.stringify([build.engine,build.commit,build.platform,build.executableSha256,build.artifactSha256]);}
function reviewedAlias(build,builds){
 const identity=identityKey(build),base=build.id+'-reviewed-'+crypto.createHash('sha256').update(identity).digest('hex');let id=base;
 for(let n=2;builds.has(id)&&identityKey(builds.get(id))!==identity;n++)id=base+'-'+n;
 return id;
}
function mergeBuild(cached,curated){
 const merged={...cached,...curated};
 for(const key of ['commit','publishedAt','artifactSha256','executableSha256','releaseId','releaseTag','assetId','artifactName','artifactUrl','artifactSize','publishedArtifactSha256','baseBuildId'])if(!curated[key])merged[key]=cached[key];
 merged.patches=union(cached.patches,curated.patches);
 merged.verification={...cached.verification};for(const [key,state]of Object.entries(curated.verification))if(state!=='unknown'){
  const old=cached.verification[key];merged.verification[key]=['failed','conflicting'].includes(old)&&old!==state?'conflicting':old==='verified'&&['observed','limited'].includes(state)?old:state;
 }
 if(!curated.source.url)merged.source=cached.source;if(!curated.provenance.repository)merged.provenance=cached.provenance;
 return merged;
}
function reconcileCatalog(cachedRaw,bundledRaw=BUILT_IN_ENGINE_CATALOG){
 const cached=model.normalizeCatalog(cachedRaw),bundled=model.normalizeCatalog(bundledRaw),builds=new Map(cached.builds.map(build=>[build.id,build])),remap=new Map(),bundledBases=new Map(),conflicts=records(cached.conflicts,bundled.conflicts);
 for(const incoming of bundled.builds){let curated=incoming,existing=builds.get(curated.id);
  if(existing&&(identityConflict(existing,curated)||curated.executableSha256&&existing.executableSha256!==curated.executableSha256)){
   // Never repoint an existing cached ID: installed targets, history and
   // capability evidence may already refer to it. Keep the curated identity
   // under a deterministic separate ID and remap only bundled references.
   const id=reviewedAlias(curated,builds);remap.set(curated.id,id);curated={...curated,id};
   const conflict={id:'catalog-identity|'+incoming.id+'|'+id,buildId:incoming.id,reason:'Cached identity is conflicting or lacks exact executable proof; its observations remain under the retained ID. Curated identity is separate.',status:'unresolved',existing:{commit:existing.commit,executableSha256:existing.executableSha256,artifactSha256:existing.artifactSha256},incoming:{id,commit:curated.commit,executableSha256:curated.executableSha256,artifactSha256:curated.artifactSha256}};
   if(!conflicts.some(row=>row.id===conflict.id))conflicts.push(conflict);existing=builds.get(id);
  }
  builds.set(curated.id,existing?mergeBuild(existing,curated):curated);
  if(incoming.baseBuildId)bundledBases.set(curated.id,incoming.baseBuildId);
 }
 for(const [id,base]of bundledBases)if(remap.has(base))builds.get(id).baseBuildId=remap.get(base);
 const mapIds=ids=>(ids||[]).map(id=>remap.get(id)||id),capabilities=new Map(cached.capabilities.map(capability=>[capability.id,capability]));
 for(const source of bundled.capabilities){const incoming={...source,buildIds:mapIds(source.buildIds),removedBuildIds:mapIds(source.removedBuildIds),fallbackBuildIds:mapIds(source.fallbackBuildIds),evidence:source.evidence.map(row=>({...row,buildIds:mapIds(row.buildIds),fallbackBuildIds:mapIds(row.fallbackBuildIds)}))},existing=capabilities.get(source.id);if(!existing){capabilities.set(source.id,incoming);continue;}
  const merged={...incoming,...existing,buildIds:union(existing.buildIds,incoming.buildIds),removedBuildIds:union(existing.removedBuildIds,incoming.removedBuildIds),fallbackBuildIds:union(existing.fallbackBuildIds,incoming.fallbackBuildIds),affectedConsumers:union(existing.affectedConsumers,incoming.affectedConsumers),evidence:records(existing.evidence,incoming.evidence)};
  if(existing.changeKind!==incoming.changeKind||merged.buildIds.some(id=>merged.removedBuildIds.includes(id))){const id='catalog-capability|'+source.id;if(!conflicts.some(row=>row.id===id))conflicts.push({id,capabilityId:source.id,status:'unresolved',reason:'Cached and bundled capability classifications conflict; neither is silently promoted.'});}
  capabilities.set(source.id,merged);
 }
 return model.normalizeCatalog({schemaVersion:1,catalogRevision:Math.max(cached.catalogRevision,bundled.catalogRevision),generatedAt:cached.generatedAt>bundled.generatedAt?cached.generatedAt:bundled.generatedAt,sources:records(cached.sources,bundled.sources),builds:[...builds.values()],capabilities:[...capabilities.values()],conflicts,consumerCoverage:{...bundled.consumerCoverage,...cached.consumerCoverage}});
}
function readEngineCatalog(context){return reconcileCatalog(context?.globalState?.get(ENGINE_CATALOG_KEY),BUILT_IN_ENGINE_CATALOG);}
function provenIdentity(build){return build.commit&&build.platform!=='unknown'&&build.executableSha256&&build.verification.source==='verified'&&build.verification.artifact==='verified'?[build.commit,build.platform,build.executableSha256,build.artifactSha256||''].join('|'):null;}
function registrationBuilds(catalog){
 const curated=new Set(BUILT_IN_ENGINE_CATALOG.builds.map(build=>build.id)),ordered=[...catalog.builds].sort((a,b)=>Number(curated.has(b.id))-Number(curated.has(a.id))),seen=new Set();
 return ordered.filter(build=>{const key=provenIdentity(build);if(!key)return true;if(seen.has(key))return false;seen.add(key);return true;});
}
function buildChoice(build){return{label:`${build.version||build.id} · ${build.channel} · ${build.platform}`,description:`${build.commit?build.commit.slice(0,12):'commit unknown'} · exe ${build.executableSha256?build.executableSha256.slice(0,12):'unverified'} · source ${build.verification.source}/artifact ${build.verification.artifact} · ${build.id}`,detail:build.artifactUrl||build.source.url||'',build};}
module.exports={ENGINE_CATALOG_KEY,BUILT_IN_ENGINE_CATALOG,reconcileCatalog,readEngineCatalog,registrationBuilds,buildChoice,provenIdentity,identityKey,reviewedAlias};
