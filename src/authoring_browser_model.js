'use strict';

const path = require('path');
const crypto = require('crypto');
const { parseCodeStructure } = require('./code_structure_model');
const { buildProjectSymbolCatalog, CATEGORY_LABELS, stringFlowRoles } = require('./project_symbol_catalog');
const authoringCatalog = require('./authoring_catalog');
const intentSearch = require('./intent_search');
const { buildSimilarCodeProjection } = require('./similar_code_model');
const { BROWSER_BOUNDS } = require('./authoring_browser_bounds');
const triggerCatalog=require('../data/triggers.json');
const {argumentSummary}=require('./trigger_argument_model');
const {entryAvailable,filterAvailable,enabledCapabilityIds}=require('./catalog_capability_filter');
const {buildResourceLifecycleProjection}=require('./resource_lifecycle_projection');

const LIMITS = BROWSER_BOUNDS;
const NIGHTLY_STRING_PATTERN = /\b(?:string|text)\s*(?:map|function|logger|data)|\bmap\s*\([^)]*string/i;

function text(value, limit = LIMITS.textBytes) {
  const result = String(value ?? '');
  if (Buffer.byteLength(result, 'utf8') > limit) throw new RangeError('Authoring Browser text exceeds its bounded projection limit.');
  return result;
}
function canonical(filename) { return path.resolve(text(filename, 4096)); }
function within(root, filename) {
  if (!root) return false;
  const relative = path.relative(root, filename);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function language(filename) {
  const extension = path.extname(filename).toLowerCase();
  return extension === '.lua' ? 'lua' : extension === '.cns' || extension === '.st' ? 'cns' : 'zss';
}
function opaque(parts) { return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32); }
function source(filename, line, endLine = line, fingerprint = '') { return Object.freeze({ filename, line:Math.max(0, Number(line)||0), endLine:Math.max(Number(line)||0, Number(endLine)||0), fingerprint:text(fingerprint,128) }); }

function codeProjection(files, root) {
  let count = 0;
  const project = (node, filename, depth, trail, fingerprint) => {
    if (depth > LIMITS.depth || count >= LIMITS.nodes) return null;
    count += 1;
    const label = text(node.title || node.label || node.kind || 'Code');
    const item = { id:opaque(['code',filename,node.kind,node.startLine,node.endLine,trail]), label, kind:text(node.kind || 'code',128), description:text(node.detail || node.signature || '',2048), source:source(filename,node.startLine,node.endLine,fingerprint), children:[] };
    for (let index=0; index<(node.children||[]).length && count<LIMITS.nodes; index+=1) {
      const child = project(node.children[index], filename, depth+1, `${trail}.${index}`, fingerprint); if (child) item.children.push(child);
    }
    return item;
  };
  const items = [];
  for (const file of files) {
    const parsed = parseCodeStructure(file.text, language(file.filename), file.filename);
    const children = [];
    for (let index=0; index<(parsed.children||[]).length && count<LIMITS.nodes; index+=1) {
      const child=project(parsed.children[index],file.filename,1,String(index),file.fingerprint); if(child)children.push(child);
    }
    items.push({ id:opaque(['code-file',file.filename]), label:path.basename(file.filename), kind:'file', description:path.relative(root,file.filename), source:source(file.filename,0,0,file.fingerprint), children });
  }
  return { items, truncated:count>=LIMITS.nodes, count };
}

function projectDataProjection(files, assignedFiles, options={}) {
  const ownerDef=typeof options.ownerDef==='string'&&path.isAbsolute(options.ownerDef)&&path.extname(options.ownerDef).toLowerCase()==='.def'?path.resolve(options.ownerDef):'';
  const catalog = buildProjectSymbolCatalog(files, { assignedFiles, ownerIdentity:ownerDef });
  const resourceLifecycle=buildResourceLifecycleProjection(catalog,{ownerIdentity:ownerDef,contextOwnerIdentity:ownerDef});
  const glossaryApi=require('./identifier_glossary_metadata'),glossaryMetadata=glossaryApi.normalizeStore(options.glossaryMetadata);
  const fingerprints=new Map(files.map(file=>[canonical(file.filename).toLowerCase(),file.fingerprint||'']));
  const enabledCapabilities=enabledCapabilityIds(options.capabilities);
  let count = 0;
  const groups = [];
  for (const category of Object.keys(CATEGORY_LABELS)) {
    const children=[];
    for (const entry of catalog.entries.filter(item=>item.category===category)) {
      if (count>=LIMITS.nodes) break;
      count+=1;
      const availableKinds=[...new Set([...entry.sites.flatMap(site=>{const capability=site.metadata?.capabilityId||site.metadata?.visibilityCapabilityId;if(capability&&!enabledCapabilities.has(String(capability).toLowerCase())&&!(capability==='zss.runtime-strings'&&options.nightlyStringsEnabled===true))return[];return site.valueKind?[site.valueKind]:site.argumentKinds||[];}),...(entry.inboundKinds||[])].filter(kind=>kind&&kind!=='unknown'))].sort();
      const valueKinds=options.nightlyStringsEnabled===true?availableKinds:availableKinds.filter(value=>value!=='string');
      const metadataEntries=site=>{const metadata=site.metadata||{},visibility=String(metadata.visibilityCapabilityId||'').toLowerCase(),hideStrings=visibility&&!enabledCapabilities.has(visibility)&&!(visibility==='zss.runtime-strings'&&options.nightlyStringsEnabled===true),hideCommand=metadata.commandVisibilityCapabilityId&&!enabledCapabilities.has(String(metadata.commandVisibilityCapabilityId).toLowerCase());return Object.entries(metadata).filter(([key])=>!['visibilityCapabilityId','commandVisibilityCapabilityId'].includes(key)&&(!hideStrings||!key.startsWith('string '))&&(!hideCommand||!['usage','command trigger'].includes(key)));};
      const runtimeStringInput=options.nightlyStringsEnabled===true&&entry.sites.some(site=>site.metadata?.['string usage']==='runtime string input'&&(!site.metadata.visibilityCapabilityId||enabledCapabilities.has(String(site.metadata.visibilityCapabilityId).toLowerCase())||site.metadata.visibilityCapabilityId==='zss.runtime-strings'));
      const dynamicCommandInput=enabledCapabilities.has('command.nightly-expressions')&&entry.sites.some(site=>site.metadata?.usage==='dynamic command name');
      const sites=entry.sites.slice(0,128).map((site,index)=>{const metadata=metadataEntries(site);return { id:opaque(['symbol-site',category,entry.name,site.filename,site.line,index]), label:`${site.file}:${Number(site.line)+1}`, kind:'site', description:`${site.role}${site.access?` · ${site.access}`:''}${site.runtimeOwner?` · runtime owner ${site.runtimeOwner}`:''}${site.ownerName?` · in ${site.ownerKind} ${site.ownerName}`:''}${metadata.length?` · ${metadata.map(([key,value])=>`${key} ${value}`).join(' · ')}`:''}${options.nightlyStringsEnabled===true&&site.valueSummary?` · ${site.valueSummary}`:''}${options.nightlyStringsEnabled===true&&site.argumentSummaries?.length?` · args ${site.argumentSummaries.join('; ')}`:''}${site.assigned?' · assigned':' · connected'}`, source:source(site.filename,site.line,site.line,fingerprints.get(canonical(site.filename).toLowerCase())||'') };});
      const relationshipSource=value=>source(value.filename,value.line,value.line,fingerprints.get(canonical(value.filename).toLowerCase())||'');
      const relationRows=[];
      for(const [role,values,label] of category==='functions'?[['caller',entry.callers,'Called by'],['callee',entry.callees,'Calls']]:category==='states'?[['transition-in',entry.transitionsIn,'Transition from'],['transition-out',entry.transitionsOut,'Transition to']]:category==='helpers'?[['state-start',entry.stateStarts,'Starts in StateDef']]:['maps','variables','constants'].includes(category)?[['writer',entry.writers,'Written by'],['reader',entry.readers,'Read by']]:[]){
        for(const [index,value] of (values||[]).entries())relationRows.push({id:opaque(['symbol-relation',category,entry.name,role,value.filename,value.line,index]),label:`${label} ${value.name}`,kind:role,status:text(value.status||'observed',128),description:`${value.file}:${Number(value.line)+1}${value.assigned?' · assigned':' · connected'}`,source:relationshipSource(value)});
      }
      if(category==='functions')for(const [role,values,label] of [['impact-in',entry.transitiveCallers,'Indirect caller'],['impact-out',entry.transitiveCallees,'Indirect dependency']])for(const [index,value] of (values||[]).filter(item=>item.depth>1).entries())relationRows.push({id:opaque(['symbol-impact',entry.name,role,value.name,value.depth,index]),label:`${label}: ${value.name}`,kind:role,status:'bounded literal call path',description:`${value.depth} calls · ${value.file}:${Number(value.line)+1}${value.assigned?' · assigned':' · connected'}`,source:relationshipSource(value)});
      if(category==='states')for(const [role,values,label] of [['transition-impact-in',entry.transitiveTransitionsIn,'Indirect transition from'],['transition-impact-out',entry.transitiveTransitionsOut,'Indirect transition to']])for(const [index,value] of (values||[]).filter(item=>item.depth>1).entries())relationRows.push({id:opaque(['state-impact',entry.name,role,value.name,value.depth,index]),label:`${label} StateDef ${value.name}`,kind:role,status:'bounded literal transition path',description:`${value.depth} transitions · ${value.file}:${Number(value.line)+1}${value.assigned?' · assigned':' · connected'}`,source:relationshipSource(value)});
      if(category==='functions')for(const flow of entry.parameterFlows||[]){const kinds=(flow.kinds||[]).filter(kind=>options.nightlyStringsEnabled===true||kind!=='string');if(!kinds.length)continue;const summaries=(flow.summaries||[]).filter(summary=>options.nightlyStringsEnabled===true||!/^string literal|^observed string|^declared string/i.test(summary)).slice(0,4);relationRows.push({id:opaque(['parameter-flow',entry.name,flow.position]),label:`Parameter ${Number(flow.position)+1}: ${flow.name}`,kind:'parameter-flow',status:'observed call flow',description:text(`${flow.callSites} exact call site(s) · observed ${kinds.join('/')}${summaries.length?` · ${summaries.join(' / ')}`:''}${flow.documentation?` · ${flow.documentation}`:''}`,1024),source:source(flow.filename,flow.line,flow.line,fingerprints.get(canonical(flow.filename).toLowerCase())||''),stringFlow:options.nightlyStringsEnabled===true&&kinds.includes('string'),stringFlowRoles:options.nightlyStringsEnabled===true&&kinds.includes('string')?['function-argument consumer']:[]});}
      if(category==='locals'&&entry.inboundCallSites){const kinds=(entry.inboundKinds||[]).filter(kind=>options.nightlyStringsEnabled===true||kind!=='string'),summaries=(entry.inboundSummaries||[]).filter(summary=>options.nightlyStringsEnabled===true||!/^string literal|^observed string|^declared string/i.test(summary)).slice(0,4),declaration=entry.sites.find(site=>site.role==='declaration');if(kinds.length&&declaration)relationRows.push({id:opaque(['parameter-input',entry.id]),label:'Inbound function parameter',kind:'parameter-input',status:'observed call flow',description:text(`${entry.inboundCallSites} exact call site(s) · observed ${kinds.join('/')}${summaries.length?` · ${summaries.join(' / ')}`:''}`,1024),source:source(declaration.filename,declaration.line,declaration.line,fingerprints.get(canonical(declaration.filename).toLowerCase())||''),stringFlow:options.nightlyStringsEnabled===true&&kinds.includes('string'),stringFlowRoles:options.nightlyStringsEnabled===true&&kinds.includes('string')?['function-parameter input']:[]});}
      const childrenRows=[...sites,...relationRows].slice(0,128);
      const relationships=category==='states'?` · ${entry.transitionsIn?.length||0} transition(s) in · ${entry.transitionsOut?.length||0} out · ${(entry.transitiveTransitionsIn||[]).filter(value=>value.depth>1).length} indirect source(s) · ${(entry.transitiveTransitionsOut||[]).filter(value=>value.depth>1).length} indirect destination(s)${entry.transitionCycle?' · literal transition cycle':''}${entry.transitionImpactTruncated?' · transition bound reached':''}`:category==='functions'?` · ${entry.callers?.length||0} caller(s) · ${entry.callees?.length||0} callee(s) · ${(entry.transitiveCallers||[]).filter(value=>value.depth>1).length} indirect caller(s) · ${(entry.transitiveCallees||[]).filter(value=>value.depth>1).length} indirect dependency(s)${entry.callImpactCycle?' · literal call cycle':''}${entry.callImpactTruncated?' · impact bound reached':''}`:category==='helpers'?` · ${entry.stateStarts?.length||0} literal start state(s)`:['maps','variables','constants'].includes(category)?` · ${entry.writers?.length||0} owned writer(s) · ${entry.readers?.length||0} owned reader(s)`:'';
      const returnTypes=category==='functions'?[]:(entry.returnTypes||[]).filter(value=>value.toLowerCase()!=='string'||options.nightlyStringsEnabled===true),namedReturns=category==='functions'?[...new Set(entry.sites.filter(site=>site.role==='declaration').flatMap(site=>site.returns||[]))]:[],inferredReturnKinds=category==='functions'&&options.nightlyStringsEnabled===true?(entry.returnKinds||[]):[];
      const observedKind=options.nightlyStringsEnabled===true?entry.valueKindStatus:(valueKinds.length>1?'mixed':valueKinds[0]||'');
      const flowRoles=stringFlowRoles({...entry,valueKinds,returnTypes},{nightlyStringsEnabled:options.nightlyStringsEnabled===true,enabledCapabilities:[...enabledCapabilities]});
      const glossaryMetadataId=opaque(['glossary',options.contextIdentity||'unbound',category,entry.id]),annotation=glossaryApi.annotationFor(glossaryMetadata,glossaryMetadataId);
      children.push({ id:opaque(['symbol',category,entry.name]), label:text(`${annotation?.favorite?'★ ':''}${entry.name}`), kind:category, status:text(entry.status||'unknown',128), description:text(`${entry.status}${entry.signatures?.length?` · signatures ${entry.signatures.join(' / ')}`:''}${namedReturns.length?` · named returns ${namedReturns.join(', ')}`:''}${inferredReturnKinds.length?` · inferred return evidence ${inferredReturnKinds.join('/')}`:''}${returnTypes.length?` · returns ${returnTypes.join('/')}`:''} · ${entry.declarations} declaration(s) · ${entry.references} reference(s)${relationships}${entry.runtimeOwners?.length?` · runtime owners ${entry.runtimeOwners.join(', ')}`:''}${observedKind?` · observed ${observedKind}${valueKinds.length?` (${valueKinds.join('/')})`:''}`:''}${entry.glossaryMeaningStatus?` · vocabulary review ${entry.glossaryMeaningStatus}`:''}${runtimeStringInput?' · runtime string input':''}${dynamicCommandInput?' · runtime command-name input':''}${flowRoles.length?` · string flow ${flowRoles.join(' / ')}`:''}`,2048), aliases:(annotation?.aliases||[]).slice(0,16), valueKinds, namedReturns, inferredReturnKinds, glossary:entry.glossary===true, glossaryMetadataId, glossaryAnnotation:annotation||undefined, stringFlowRoles:flowRoles, stringFlow:flowRoles.length>0, ...(sites.length===1?{source:sites[0].source}:{}), children:childrenRows });
    }
    if(children.length)groups.push({id:opaque(['category',category]),label:CATEGORY_LABELS[category],kind:'category',description:`${children.length} entries`,children});
  }
  return { items:groups, failures:catalog.failures, truncated:count>=LIMITS.nodes, count, resourceLifecycle };
}

function recipeProjection(options={}) {
  const nightly = options.nightlyStringsEnabled === true;
  const items=[];
  for(const item of authoringCatalog.allItems()) {
    const searchable=`${item.id} ${item.label} ${item.detail} ${item.family||''}`;
    const nightlyString=Boolean(item.nightlyString||NIGHTLY_STRING_PATTERN.test(searchable));
    if(nightlyString&&!nightly||!entryAvailable(item,options.capabilities))continue;
    items.push({ id:opaque(['recipe',item.id]), canonicalId:text(item.id,512), label:text(item.label), kind:text(item.kind,128), description:text(item.detail||'',2048), family:text(item.family||'Other',256), compatibility:text(item.compatibility||'unknown',128), sourceLabel:text(item.source||'Unknown',256), nightlyString, referenceOnly:true });
    if(items.length>=LIMITS.nodes)break;
  }
  return { items, count:items.length, truncated:items.length>=LIMITS.nodes };
}

const TRIGGER_FAMILIES=Object.freeze([
  ['Math and Clamping',/\b(?:abs|acos|asin|atan|ceil|clamp|cos|exp|floor|ln|log|max|min|pi|pow|random|sin|sqrt|tan)\b/i],
  ['Logic and Selection',/\b(?:ifelse|cond|select|boolean|logical)\b/i],
  ['Time and State',/\b(?:time|state|round|match|pause|tick|life|power)\b/i],
  ['Movement and Position',/\b(?:vel|pos|dist|move|jump|angle|facing|frontedge|backedge)\b/i],
  ['Player and Team',/\b(?:player|team|partner|enemy|p1|p2|numenemy|ailevel)\b/i],
  ['Contact, Hit and Guard',/\b(?:hit|guard|contact|damage|attack|combo)\b/i],
  ['Animation',/\b(?:anim|frame|elem|sprite)\b/i],
  ['Input and Commands',/\b(?:command|input|button|key|analog|axis)\b/i],
  ['Resources',/\b(?:sound|snd|pal|resource|file)\b/i],
  ['Helpers, Projectiles and Explods',/\b(?:helper|projectile|explod|root|parent|owner)\b/i],
  ['Maps and Variables',/\b(?:map|var|fvar|sysvar)\b/i],
  ['Redirections',/\b(?:redirect|target|playerid)\b/i],
  ['Stage and Screen',/\b(?:stage|screen|camera|bound|zoom)\b/i],
  ['Debug and Introspection',/\b(?:debug|version|author|name|id|exist)\b/i]
]);
function triggerFamily(entry){
  const name=String(entry?.name||'');
  if(/^anim/i.test(name))return'Animation';
  if(/^(?:aiLevel|player|team|partner|enemy|numEnemy|p[12])/i.test(name))return'Player and Team';
  const identity=`${name} ${entry?.signature||''}`,description=`${entry?.description||''}`;
  return TRIGGER_FAMILIES.find(([,pattern])=>pattern.test(identity))?.[0]||TRIGGER_FAMILIES.find(([,pattern])=>pattern.test(description))?.[0]||'Other Expressions';
}
function triggerProjection(catalog=triggerCatalog,options={}){
  const grouped=new Map(),children=[];
  for(const entry of filterAvailable(catalog,options.capabilities).slice(0,256)){
    if(!entry||typeof entry.name!=='string'||!entry.name.trim())continue;
    const family=triggerFamily(entry),status=text(entry.status||'documented',128),compatibility=/\bnew\b/i.test(status)?'IKEMEN new or expanded':'documented IKEMEN expression';
    const argumentHelp=argumentSummary(entry,options.capabilities),item={id:opaque(['trigger',entry.name,entry.signature||'']),label:text(entry.name,256),kind:'trigger',family,status,description:text(`${entry.signature||entry.name}${entry.returnType?` · returns ${entry.returnType}`:''}${argumentHelp!=='No arguments.'?` · ${argumentHelp}`:''}`,1024),detail:text(entry.description||'',2048),sourceLabel:text(entry.source||'Bundled IKEMEN documentation',256),compatibility,referenceOnly:true};
    children.push(item);if(!grouped.has(family))grouped.set(family,[]);grouped.get(family).push(item);
  }
  const families=[...TRIGGER_FAMILIES.map(([label])=>label),'Other Expressions'].filter(label=>grouped.has(label)).map(label=>({id:opaque(['trigger-family',label]),label,kind:'trigger-family',description:`${grouped.get(label).length} documented expression${grouped.get(label).length===1?'':'s'}`,children:grouped.get(label)}));
  return{items:[{id:'triggers-expressions',label:'Triggers & Expressions',kind:'catalog',description:`${children.length} bundled documented trigger${children.length===1?'':'s'} organized by purpose`,children:families}],count:children.length,truncated:(Array.isArray(catalog)?catalog.length:0)>256};
}

function aliasPhrase(value) {
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>256||/[\u0000-\u001f<>]/.test(value))return '';
  return value.trim().replace(/\s+/g,' ').toLocaleLowerCase();
}
function aliasProjection(aliases={}, canonicalItems=[], options={}) {
  const mapped=new Map(), collisions=[], configured=aliases&&typeof aliases==='object'&&!Array.isArray(aliases)?aliases:{}, combined={...intentSearch.BUILTIN_ALIASES,...configured};
  for(const [phrase,raw] of Object.entries(combined).slice(0,LIMITS.aliases)) {
    const alias=aliasPhrase(phrase); if(!alias)continue;
    const requested=Array.isArray(raw)?raw:[raw];
    if(requested.length>32||requested.some(value=>typeof value!=='string'||Buffer.byteLength(value,'utf8')>512||/[\u0000-\u001f<>]/.test(value)))continue;
    if(options.nightlyStringsEnabled!==true&&NIGHTLY_STRING_PATTERN.test(`${alias} ${requested.join(' ')}`))continue;
    const targets=[];
    for(const value of requested){
      const normalized=value.trim().toLocaleLowerCase(), exact=canonicalItems.filter(item=>[item.id,item.canonicalId,item.label].some(identity=>typeof identity==='string'&&identity.toLocaleLowerCase()===normalized));
      if(exact.length){targets.push(...exact.map(item=>item.id));continue;}
      for(const item of canonicalItems){
        const haystack=[item.id,item.canonicalId,item.label,item.description,item.detail,item.family,item.kind,item.compatibility,item.sourceLabel].filter(entry=>typeof entry==='string').join(' ');
        if(intentSearch.matches(haystack,value))targets.push(item.id);
      }
    }
    if(!targets.length)continue;
    const unique=[...new Set(targets)]; if(unique.length>1&&collisions.length<64)collisions.push({phrase:alias,targetIds:unique.slice(0,32),targetCount:unique.length}); else if(unique.length===1)mapped.set(alias,unique[0]);
  }
  return { aliases:Object.freeze(Object.fromEntries(mapped)), collisions:Object.freeze(collisions) };
}

function applyAliasDiscovery(items, aliases) {
  const byTarget=new Map();
  for(const [phrase,target] of Object.entries(aliases||{})){const values=byTarget.get(target)||[];values.push(phrase);byTarget.set(target,values);}
  function visit(item){
    const children=(item.children||[]).map(visit), phrases=byTarget.get(item.id)||[];
    return {...item,...(phrases.length?{aliases:Object.freeze([...phrases])}:{}),...(item.children?{children}: {})};
  }
  return (items||[]).map(visit);
}

function flattenItems(items, output=[]) { for(const item of items||[]){output.push(item);flattenItems(item.children,output);}return output; }
function buildAuthoringBrowserModel(input={}) {
  const root=canonical(input.root||'.'), seen=new Set(), files=[];
  for(const value of Array.isArray(input.documents)?input.documents.slice(0,LIMITS.files):[]) {
    if(!value||typeof value.filename!=='string'||typeof value.text!=='string'||Buffer.byteLength(value.text,'utf8')>LIMITS.sourceBytes)continue;
    const filename=canonical(value.filename), key=filename.toLowerCase(); if(seen.has(key)||!within(root,filename))continue;
    seen.add(key); files.push({filename,text:value.text,fingerprint:crypto.createHash('sha256').update(value.text).digest('hex')});
  }
  const contextIdentity=opaque(['authoring-context',String(input.contextIdentity||root)]),code=codeProjection(files,root), projectData=projectDataProjection(files,input.assignedFiles||files.map(file=>file.filename),{nightlyStringsEnabled:input.nightlyStringsEnabled,capabilities:input.capabilities,glossaryMetadata:input.glossaryMetadata,contextIdentity,ownerDef:input.ownerDef}), recipes=recipeProjection({nightlyStringsEnabled:input.nightlyStringsEnabled,capabilities:input.capabilities}), capabilityIds=[...(input.capabilities?.enabledCapabilities||[])].map(String).sort(),catalogFingerprint=crypto.createHash('sha256').update(JSON.stringify(files.map(file=>[file.filename.toLowerCase(),file.fingerprint]))).digest('hex'), similarCode=buildSimilarCodeProjection({documents:files,activeSource:input.activeSource,aliases:input.aliases,personalExamples:input.personalExamples,target:{channel:input.capabilities?.target?.channel||(input.nightlyStringsEnabled?'nightly':'stable'),version:input.capabilities?.target?.version||(input.nightlyStringsEnabled?'':'1.0'),capabilityFingerprint:crypto.createHash('sha256').update(JSON.stringify(capabilityIds)).digest('hex'),catalogFingerprint,contextFingerprint:contextIdentity}});
  const all=[...flattenItems(code.items),...flattenItems(projectData.items),...recipes.items], aliases=aliasProjection(input.aliases,all,{nightlyStringsEnabled:input.nightlyStringsEnabled});
  code.items=applyAliasDiscovery(code.items,aliases.aliases);projectData.items=applyAliasDiscovery(projectData.items,aliases.aliases);recipes.items=applyAliasDiscovery(recipes.items,aliases.aliases);
  code.aliasCollisions=aliases.collisions;projectData.aliasCollisions=aliases.collisions;recipes.aliasCollisions=aliases.collisions;
  const providers={'code-navigator':code,'project-data':projectData,recipes,'similar-code':similarCode};
  const model={ schema:'ikemaker.authoring-browser-model', version:1, root, capability:{nightlyStringsEnabled:input.nightlyStringsEnabled===true,enabledCapabilities:Object.freeze([...(input.capabilities?.enabledCapabilities||[])]),target:input.capabilities?.target||null}, providers, aliases };
  if(Buffer.byteLength(JSON.stringify(model),'utf8')>LIMITS.aggregateBytes)throw new RangeError('Authoring Browser projection exceeds its aggregate byte limit.');
  return Object.freeze(model);
}

module.exports={LIMITS,NIGHTLY_STRING_PATTERN,TRIGGER_FAMILIES,buildAuthoringBrowserModel,codeProjection,projectDataProjection,recipeProjection,triggerFamily,triggerProjection,aliasProjection,applyAliasDiscovery,flattenItems,within,opaque};
