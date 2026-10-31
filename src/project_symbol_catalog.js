'use strict';
const path = require('path');
const crypto = require('crypto');
const { collectRecords } = require('./analyzer');
const { matches } = require('./intent_search');

const CATEGORY_ORDER = ['maps', 'variables', 'locals', 'redirects', 'controllers', 'triggers', 'constants', 'commands', 'functions', 'states', 'helpers', 'explods', 'projectiles'];
const CATEGORY_LABELS = Object.freeze({ maps: 'Maps', variables: 'Variables', locals:'Scoped Locals & Parameters', redirects:'Redirects & Runtime Recipients', controllers:'State Controllers Used', triggers:'Trigger & Expression Uses', constants:'Constants & Uses', commands:'Commands & Input Uses', functions: 'Functions & Calls', states: 'States & Transitions', helpers: 'Helpers', explods: 'Explods', projectiles: 'Projectiles' });
const GLOSSARY_CATEGORIES=new Set(['maps','variables','locals','constants','commands','functions','states','helpers','explods','projectiles']);
const RECORD_CACHE_LIMITS=Object.freeze({entries:256,sourceBytes:16*1024*1024,perSourceBytes:4*1024*1024});
const CATALOG_LIMITS=Object.freeze({files:256,sourceBytes:16*1024*1024,perSourceBytes:4*1024*1024});
const recordCache=new Map();
let recordCacheBytes=0,recordCacheHits=0,recordCacheMisses=0;

function evictRecordCache() {
  while(recordCache.size>RECORD_CACHE_LIMITS.entries||recordCacheBytes>RECORD_CACHE_LIMITS.sourceBytes){
    const oldest=recordCache.keys().next().value;if(oldest===undefined)break;
    const removed=recordCache.get(oldest);recordCache.delete(oldest);recordCacheBytes-=removed?.bytes||0;
  }
}

function cachedRecords(text, filename) {
  const source=String(text),bytes=Buffer.byteLength(source,'utf8'),identity=path.resolve(filename).toLowerCase(),hash=crypto.createHash('sha256').update(source).digest('hex'),cached=recordCache.get(identity);
  if(cached?.hash===hash){recordCache.delete(identity);recordCache.set(identity,cached);recordCacheHits+=1;return{records:cached.records,hash};}
  recordCacheMisses+=1;
  const records=collectRecords(source,filename);
  if(cached){recordCache.delete(identity);recordCacheBytes-=cached.bytes;}
  if(bytes<=RECORD_CACHE_LIMITS.perSourceBytes){recordCache.set(identity,{hash,bytes,records});recordCacheBytes+=bytes;evictRecordCache();}
  return{records,hash};
}

function clearRecordCache(){recordCache.clear();recordCacheBytes=0;recordCacheHits=0;recordCacheMisses=0;}
function recordCacheSnapshot(){return Object.freeze({entries:recordCache.size,sourceBytes:recordCacheBytes,hits:recordCacheHits,misses:recordCacheMisses,limits:RECORD_CACHE_LIMITS});}

function stringFlowRoles(item, options={}) {
  if(options.nightlyStringsEnabled!==true)return [];
  const enabled=new Set((options.enabledCapabilities||[]).map(value=>String(value).toLowerCase())),sites=item?.sites||[],valueKinds=item?.valueKinds||[],returnTypes=item?.returnTypes||[];
  const functionArgumentInput=item?.category==='functions'&&sites.some(site=>site.role==='call'&&(site.argumentKinds||[]).includes('string')),functionParameterInput=item?.category==='locals'&&(item?.inboundKinds||[]).includes('string');
  const visibleStringInput=site=>site.metadata?.['string usage']==='runtime string input'&&(!site.metadata.visibilityCapabilityId||enabled.has(String(site.metadata.visibilityCapabilityId).toLowerCase())||site.metadata.visibilityCapabilityId==='zss.runtime-strings'),loggerInput=sites.some(site=>visibleStringInput(site)&&site.metadata?.['string role']==='runtime logger parameter');
  const runtimeStringInput=sites.some(site=>visibleStringInput(site)&&site.metadata?.['string role']!=='runtime logger parameter'),loggerConsumer=loggerInput&&(valueKinds.includes('string')||(item?.inboundKinds||[]).includes('string'));
  const dynamicCommandInput=enabled.has('command.nightly-expressions')&&sites.some(site=>site.metadata?.usage==='dynamic command name');
  const producer=sites.some(site=>site.valueKind==='string')||(item?.returnKinds||[]).includes('string')||returnTypes.some(value=>String(value).toLowerCase()==='string');
  return [...(producer?['producer']:[]),...(functionArgumentInput?['function-argument consumer']:[]),...(functionParameterInput?['function-parameter input']:[]),...(runtimeStringInput?['runtime consumer']:[]),...(loggerConsumer?['logger consumer']:[]),...(dynamicCommandInput?['command-name consumer']:[])];
}

function argumentReference(value) {
  const expression=String(value||'').trim();let match;
  if((match=/^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(expression)))return{kind:'local',name:match[1]};
  if((match=/^map\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)$/i.exec(expression)))return{kind:'map',name:match[1]};
  if((match=/^const\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)$/i.exec(expression)))return{kind:'constant',name:match[1]};
  if((match=/^call\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\((?:[^()]|\([^()]*\))*\)$/i.exec(expression)))return{kind:'function',name:match[1]};
  if((match=/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s*\((?:[^()]|\([^()]*\))*\))?$/.exec(expression)))return{kind:'trigger',name:match[1]};
  return null;
}

function site(record, filename, role, assigned) {
  return { filename, file: path.basename(filename), line: record.line, start: record.start, role, access: record.access || '', assigned: Boolean(assigned), ownerKind: record.ownerKind || '', ownerName: record.ownerName || '', ownerLine: record.ownerLine, runtimeOwner:record.runtimeOwner||'', catalogMatch:record.catalogMatch===true, metadata:record.metadata&&typeof record.metadata==='object'?{...record.metadata}:{}, signature:record.signature||'', displaySignature:record.displaySignature||'', sourceSignature:record.sourceSignature||'', params:Array.isArray(record.params)?record.params:[], returns:Array.isArray(record.returns)?record.returns:[], returnType:record.returnType||'', documentation:record.documentation||'', parameterDocs:record.parameterDocs&&typeof record.parameterDocs==='object'?{...record.parameterDocs}:{}, arity:Number.isInteger(record.arity)?record.arity:null, observedValue:record.valueKind==='string'?'':record.observedValue||'', valueKind:record.valueKind||'', valueSummary:record.valueSummary||'', literal:record.literal!==false, argumentKinds:Array.isArray(record.argumentKinds)?[...record.argumentKinds]:[], argumentSummaries:Array.isArray(record.argumentSummaries)?[...record.argumentSummaries]:[], argumentReferences:Array.isArray(record.args)?record.args.map(argumentReference):[] };
}

function entry(groups, category, name, identity=name) {
  const key = `${category}\0${String(identity).toLowerCase()}`;
  if (!groups.has(key)) groups.set(key, { id: key, category, name, sites: [], declarations: 0, references: 0, reads: 0, writes: 0, assigned: false, status: 'observed' });
  return groups.get(key);
}

function addRecord(groups, category, record, filename, role, assigned) {
  const identity=record.identity?`${filename}\0${record.identity}`:record.name,target = entry(groups, category, record.name,identity), occurrence = site(record, filename, role, assigned);
  target.sites.push(occurrence); target.assigned ||= occurrence.assigned;
  if (role === 'declaration' || role === 'creation') target.declarations += 1; else target.references += 1;
  if (record.access === 'read') target.reads += 1;
  if (record.access === 'write' || record.access === 'add') target.writes += 1;
}

function buildProjectSymbolCatalog(files, options = {}) {
  const assigned = new Set((options.assignedFiles || []).map(filename => path.resolve(filename).toLowerCase())), groups = new Map(), failures = [], sources = {};
  const requested=Array.isArray(files)?files:[];let admitted=requested,totalBytes=0,blocked=false;
  if(requested.length>CATALOG_LIMITS.files){failures.push({filename:'',reason:`project catalog exceeds the ${CATALOG_LIMITS.files}-file admission limit`});blocked=true;}
  for(const file of requested.slice(0,CATALOG_LIMITS.files)){
    if(!file?.filename||typeof file.text!=='string'){failures.push({filename:file?.filename||'',reason:'missing source text'});blocked=true;continue;}
    const bytes=Buffer.byteLength(file.text,'utf8');totalBytes+=bytes;if(bytes>CATALOG_LIMITS.perSourceBytes){failures.push({filename:file.filename,reason:'source exceeds the 4 MiB project-catalog admission limit'});blocked=true;}
  }
  if(totalBytes>CATALOG_LIMITS.sourceBytes){failures.push({filename:'',reason:'sources exceed the 16 MiB project-catalog aggregate admission limit'});blocked=true;}
  if(blocked)admitted=[];
  for (const file of admitted) {
    if (!file?.filename || typeof file.text !== 'string') { failures.push({ filename: file?.filename || '', reason: 'missing source text' }); continue; }
    const filename = path.resolve(file.filename), isAssigned = assigned.has(filename.toLowerCase()), cached=cachedRecords(file.text,filename),records=cached.records;
    sources[filename.toLowerCase()] = { filename, hash:cached.hash, bytes:Buffer.byteLength(file.text,'utf8') };
    records.maps.forEach(record => addRecord(groups, 'maps', record, filename, record.declaration ? 'declaration' : record.access || 'reference', isAssigned));
    records.variables.forEach(record => addRecord(groups, 'variables', record, filename, record.access || 'reference', isAssigned));
    records.locals.forEach(record=>addRecord(groups,'locals',record,filename,record.declaration?'declaration':record.access||'reference',isAssigned));
    records.redirects.forEach(record=>addRecord(groups,'redirects',record,filename,'reference',isAssigned));
    records.controllers.forEach(record=>addRecord(groups,'controllers',record,filename,'use',isAssigned));
    records.triggers.forEach(record=>addRecord(groups,'triggers',record,filename,'use',isAssigned));
    records.constants.forEach(record=>addRecord(groups,'constants',record,filename,record.declaration?'declaration':'reference',isAssigned));
    records.commands.forEach(record=>addRecord(groups,'commands',record,filename,record.declaration?'declaration':'reference',isAssigned));
    records.functions.forEach(record => addRecord(groups, 'functions', record, filename, 'declaration', isAssigned));
    records.calls.forEach(record => addRecord(groups, 'functions', record, filename, 'call', isAssigned));
    records.states.forEach(record => addRecord(groups, 'states', record, filename, 'declaration', isAssigned));
    records.stateReferences.forEach(record => addRecord(groups, 'states', record, filename, 'transition', isAssigned));
    records.resources.forEach(record => addRecord(groups, `${record.kind}s`, { ...record, name: record.id }, filename, record.role||'creation', isAssigned));
  }
  const entries = [...groups.values()].map(item => {
    if (item.category === 'functions') item.status = item.declarations === 0 ? 'unresolved call' : item.declarations > 1 ? 'multiple declarations' : 'resolved';
    else if (item.category === 'states') item.status = item.declarations === 0 ? 'unresolved literal transition' : item.declarations > 1 ? 'multiple definitions' : 'resolved';
    else if (['helpers', 'explods', 'projectiles'].includes(item.category)) {
      const roles=[...new Set(item.sites.map(site=>site.role))],dynamic=item.sites.some(site=>site.literal===false),created=roles.includes('creation');
      item.status=`${created?'lifecycle':'creation unresolved'} · ${roles.join(' / ')} observed${item.declarations>1?' · multiple creation sites / review runtime exclusivity':''}${dynamic?' · dynamic ID unresolved':''}`;
    }
    else if(item.category==='constants')item.status=item.declarations===0?'definition unresolved / engine or common constant':item.declarations>1?'multiple definitions':item.references?'defined / referenced':'defined / unused';
    else if(item.category==='commands')item.status=item.declarations===0?'definition unresolved':item.declarations>1?'multiple definitions':item.references?'defined / referenced':'defined / unused';
    else if(item.category==='locals'){const kind=item.sites.find(site=>site.metadata?.kind)?.metadata.kind||'local';item.status=`${kind} · ${item.declarations?'scoped declaration':'declaration unresolved'}${item.references?' / referenced':' / unused'}`;}
    else if(item.category==='triggers'){const statuses=[...new Set(item.sites.map(site=>site.metadata?.status).filter(Boolean))];item.status=`bundled catalog ${statuses.join(' / ')||'documented'} · observed use`;}
    else if(item.category==='controllers'){const statuses=[...new Set(item.sites.map(site=>site.metadata?.status).filter(Boolean))];item.status=statuses.includes('not in bundled catalog')?'catalog match unresolved':`bundled catalog ${statuses.join(' / ')||'documented'} · observed use`;}
    else item.status = item.writes ? item.reads ? 'read / write' : 'write only' : item.reads ? 'read only' : 'observed';
    item.files = [...new Set(item.sites.map(site => site.filename))];
    item.valueKinds=[...new Set(item.sites.flatMap(site=>site.valueKind?[site.valueKind]:site.argumentKinds||[]).filter(kind=>kind&&kind!=='unknown'))].sort();
    const concrete=item.valueKinds.filter(kind=>kind!=='expression');item.valueKindStatus=item.valueKinds.includes('expression')?(concrete.length?'mixed / unresolved':'unresolved'):concrete.length>1?'mixed':concrete[0]||'unknown';
    item.runtimeOwners=[...new Set(item.sites.map(site=>site.runtimeOwner).filter(Boolean))].sort();
    const contractSites=['triggers','controllers'].includes(item.category)?item.sites:item.category==='maps'?item.sites.filter(site=>['write','add'].includes(site.access)&&site.documentation):item.sites.filter(site=>site.role==='declaration');
    item.signatures=[...new Set(contractSites.filter(site=>site.signature).map(site=>site.signature))];
    item.returnTypes=[...new Set(contractSites.filter(site=>site.returnType).map(site=>site.returnType))];
    item.documentation=[...new Set(contractSites.filter(site=>site.documentation).map(site=>site.documentation))];
    item.parameterFlows=[];
    item.callers = [];
    item.callees = [];
    item.transitiveCallers=[];
    item.transitiveCallees=[];
    item.callImpactCycle=false;
    item.callImpactTruncated=false;
    item.transitionsIn = [];
    item.transitionsOut = [];
    item.transitiveTransitionsIn=[];
    item.transitiveTransitionsOut=[];
    item.transitionCycle=false;
    item.transitionImpactTruncated=false;
    item.stateStarts = [];
    item.writers=[];
    item.readers=[];
    if(['maps','variables','constants'].includes(item.category))for(const occurrence of item.sites.filter(site=>site.ownerName&&['read','write','add'].includes(site.access))){const relation={name:occurrence.ownerName,kind:occurrence.ownerKind||'scope',filename:occurrence.filename,file:occurrence.file,line:occurrence.line,start:occurrence.start,assigned:occurrence.assigned};const bucket=['write','add'].includes(occurrence.access)?item.writers:item.readers;if(!bucket.some(value=>value.name===relation.name&&value.kind===relation.kind&&value.filename===relation.filename&&value.line===relation.line))bucket.push(relation);}
    return item;
  }).sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const symbolLookup=new Map();for(const item of entries){const key=`${item.category}\0${item.name.toLowerCase()}`;if(!symbolLookup.has(key))symbolLookup.set(key,[]);symbolLookup.get(key).push(item);}const lookup=(category,name)=>symbolLookup.get(`${category}\0${String(name||'').toLowerCase()}`)||[];
  const functions = new Map(entries.filter(item => item.category === 'functions').map(item => [item.name.toLowerCase(), item]));
  const refreshFunctionReturns=()=>{for(const target of functions.values()){
    target.returnFlows=[];target.returnKinds=[];const declarations=target.sites.filter(site=>site.role==='declaration');if(declarations.length!==1)continue;
    const declaration=declarations[0];for(const [position,name] of (declaration.returns||[]).entries()){
      const local=lookup('locals',name).find(item=>item.sites.some(site=>site.role==='declaration'&&site.filename===declaration.filename&&site.ownerKind==='function'&&site.ownerName===target.name&&site.ownerLine===declaration.line));
      const kinds=[...new Set((local?.sites||[]).filter(site=>site.access==='write').map(site=>site.valueKind).filter(kind=>kind&&kind!=='unknown'))].sort();target.returnFlows.push({name,position,kinds,status:kinds.length===0?'unknown':kinds.length===1?kinds[0]:'mixed'});
    }target.returnKinds=[...new Set(target.returnFlows.flatMap(flow=>flow.kinds))].sort();
  }};refreshFunctionReturns();
  const exactStringArgument=(reference,call)=>{
    if(!reference)return null;
    if(reference.kind==='trigger'){
      const sites=lookup('triggers',reference.name).flatMap(item=>item.sites).filter(value=>value.filename===call.filename&&value.line===call.line&&value.ownerKind===call.ownerKind&&value.ownerName===call.ownerName&&value.valueKind==='string');
      return sites.length?`observed runtime string from trigger ${reference.name}`:null;
    }
    if(reference.kind==='function'){
      const target=functions.get(reference.name.toLowerCase()),declarations=target?.sites.filter(value=>value.role==='declaration')||[];
      return declarations.length===1&&target.returnFlows?.length===1&&target.returnFlows[0].kinds.length===1&&target.returnFlows[0].kinds[0]==='string'?`inferred string return from Function ${target.name}`:null;
    }
    const category=reference.kind==='map'?'maps':reference.kind==='constant'?'constants':'locals',candidates=lookup(category,reference.name);
    if(reference.kind==='local'){
      const scoped=candidates.filter(item=>item.sites.some(value=>value.role==='declaration'&&value.filename===call.filename&&value.ownerKind===call.ownerKind&&value.ownerName===call.ownerName&&value.ownerLine===call.ownerLine));
      if(scoped.length!==1)return null;
      const writes=scoped[0].sites.filter(value=>value.access==='write'&&value.valueKind);
      const inbound=scoped[0].inboundKinds||[];
      return (writes.length&&writes.every(value=>value.valueKind==='string'))||(inbound.length&&inbound.every(value=>value==='string'))?`observed string from scoped local $${scoped[0].name}`:null;
    }
    if(candidates.length!==1)return null;
    const candidate=candidates[0],producers=candidate.sites.filter(value=>reference.kind==='constant'?value.role==='declaration':value.access==='write'&&value.role!=='call');
    if(reference.kind==='constant'&&candidate.declarations!==1)return null;
    return producers.length&&producers.every(value=>value.valueKind==='string')?`observed string from ${reference.kind} ${candidate.name}`:null;
  };
  const propagateStringAssignments=()=>{let changed=false;for(const item of entries.filter(value=>['maps','locals','constants'].includes(value.category)))for(const occurrence of item.sites){
    if(occurrence.access!=='write'||occurrence.valueKind!=='expression'||!occurrence.observedValue)continue;
    const summary=exactStringArgument(argumentReference(occurrence.observedValue),occurrence);if(!summary)continue;
    occurrence.valueKind='string';occurrence.valueSummary=summary;occurrence.observedValue='';occurrence.metadata={...(occurrence.metadata||{}),'string source':summary,visibilityCapabilityId:'zss.runtime-strings'};changed=true;
  }return changed;};
  const refreshValueEvidence=item=>{item.valueKinds=[...new Set(item.sites.flatMap(value=>value.valueKind?[value.valueKind]:value.argumentKinds||[]).filter(kind=>kind&&kind!=='unknown'))].sort();const concrete=item.valueKinds.filter(kind=>kind!=='expression');item.valueKindStatus=item.valueKinds.includes('expression')?(concrete.length?'mixed / unresolved':'unresolved'):concrete.length>1?'mixed':concrete[0]||'unknown';};
  propagateStringAssignments();for(const item of entries)refreshValueEvidence(item);refreshFunctionReturns();
  for(const target of functions.values())for(const call of target.sites.filter(value=>value.role==='call'))for(let position=0;position<call.argumentKinds.length;position+=1){
    if(call.argumentKinds[position]!=='expression')continue;
    const summary=exactStringArgument(call.argumentReferences?.[position],call);if(!summary)continue;
    call.argumentKinds[position]='string';call.argumentSummaries[position]=summary;
  }
  const refreshFunctionEvidence=()=>{for(const target of functions.values()){
    refreshValueEvidence(target);
    const declarations=target.sites.filter(value=>value.role==='declaration'),calls=target.sites.filter(value=>value.role==='call');target.parameterFlows=[];
    if(declarations.length!==1)continue;
    const declaration=declarations[0],parameters=(declaration.params||[]).slice(0,64).map(value=>String(value||'').match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1]||'').filter(Boolean);
    target.parameterFlows=parameters.map((name,position)=>{const kinds=[...new Set(calls.map(call=>call.argumentKinds?.[position]).filter(kind=>kind&&kind!=='unknown'))].sort(),summaries=[...new Set(calls.map(call=>call.argumentSummaries?.[position]).filter(Boolean))].slice(0,8),callSites=calls.filter(call=>call.argumentKinds?.[position]||call.argumentSummaries?.[position]).length;return{name,position,kinds,summaries,callSites,documentation:String(declaration.parameterDocs?.[name]||'').slice(0,512),filename:declaration.filename,file:declaration.file,line:declaration.line};});
  }};refreshFunctionEvidence();
  for (const target of functions.values()) for (const call of target.sites.filter(site => site.role === 'call' && site.ownerName)) {
    const relation = { name: call.ownerName, kind: call.ownerKind || 'scope', filename: call.filename, file: call.file, line: call.line, assigned: call.assigned };
    if (!target.callers.some(item => item.name.toLowerCase() === relation.name.toLowerCase() && item.filename === relation.filename && item.line === relation.line)) target.callers.push(relation);
    if (call.ownerKind === 'function') {
      const caller = functions.get(call.ownerName.toLowerCase());
      if (caller && !caller.callees.some(item => item.name.toLowerCase() === target.name.toLowerCase() && item.filename === call.filename && item.line === call.line)) caller.callees.push({ name: target.name, kind: 'function', filename: call.filename, file: call.file, line: call.line, assigned: call.assigned, status: target.status });
    }
  }
  const callImpact=(start,direction)=>{
    const output=[],seen=new Map([[start.name.toLowerCase(),0]]),queue=[{item:start,depth:0}],limit=64,maxDepth=8;let cycle=false,truncated=false;
    while(queue.length){const current=queue.shift();if(current.depth>=maxDepth){if((current.item[direction]||[]).some(value=>value.kind==='function'))truncated=true;continue;}
      for(const relation of current.item[direction]||[]){if(relation.kind!=='function')continue;const key=relation.name.toLowerCase(),target=functions.get(key);if(!target||target.status!=='resolved')continue;
        if(key===start.name.toLowerCase()){cycle=true;continue;}const depth=current.depth+1,known=seen.get(key);if(known!==undefined&&known<=depth)continue;seen.set(key,depth);
        if(output.length>=limit){truncated=true;continue;}output.push({...relation,depth});queue.push({item:target,depth});
      }
    }
    return{rows:output.sort((a,b)=>a.depth-b.depth||a.name.localeCompare(b.name,undefined,{sensitivity:'base'})),cycle,truncated};
  };
  for(const item of functions.values())if(item.status==='resolved'){
    const inbound=callImpact(item,'callers'),outbound=callImpact(item,'callees');item.transitiveCallers=inbound.rows;item.transitiveCallees=outbound.rows;item.callImpactCycle=inbound.cycle||outbound.cycle;item.callImpactTruncated=inbound.truncated||outbound.truncated;
  }
  const propagateParameterInputs=()=>{let changed=false;for(const target of functions.values()){
    const declarations=target.sites.filter(site=>site.role==='declaration');if(declarations.length!==1)continue;
    const declaration=declarations[0],parameters=(declaration.params||[]).slice(0,64).map(value=>String(value||'').match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1]||'').filter(Boolean),calls=target.sites.filter(site=>site.role==='call');
    for(const [position,name] of parameters.entries()){
      const local=lookup('locals',name).find(item=>item.sites.some(site=>site.role==='declaration'&&site.filename===declaration.filename&&site.ownerKind==='function'&&site.ownerName===target.name&&site.ownerLine===declaration.line));if(!local)continue;
      const kinds=[...new Set(calls.map(call=>call.argumentKinds?.[position]).filter(kind=>kind&&kind!=='unknown'))].sort(),summaries=[...new Set(calls.map(call=>call.argumentSummaries?.[position]).filter(Boolean))].slice(0,8);if(!kinds.length)continue;
      const nextCallSites=calls.filter(call=>call.argumentKinds?.[position]||call.argumentSummaries?.[position]).length;if(JSON.stringify(local.inboundKinds||[])!==JSON.stringify(kinds)||local.inboundCallSites!==nextCallSites)changed=true;
      local.inboundKinds=kinds;local.inboundSummaries=summaries;local.inboundCallSites=nextCallSites;local.valueKinds=[...new Set([...(local.valueKinds||[]),...kinds])].sort();const concrete=local.valueKinds.filter(kind=>kind!=='expression');local.valueKindStatus=local.valueKinds.includes('expression')?(concrete.length?'mixed / unresolved':'unresolved'):concrete.length>1?'mixed':concrete[0]||'unknown';
    }
  }return changed;};propagateParameterInputs();
  for(let pass=0;pass<8;pass+=1){
    let changed=propagateStringAssignments();
    for(const target of functions.values())for(const call of target.sites.filter(value=>value.role==='call'))for(let position=0;position<call.argumentKinds.length;position+=1){
      if(call.argumentKinds[position]!=='expression')continue;
      const summary=exactStringArgument(call.argumentReferences?.[position],call);if(!summary)continue;
      call.argumentKinds[position]='string';call.argumentSummaries[position]=summary;changed=true;
    }
    if(!changed)break;for(const item of entries)refreshValueEvidence(item);refreshFunctionReturns();refreshFunctionEvidence();propagateParameterInputs();
  }
  const states = new Map(entries.filter(item=>item.category==='states').map(item=>[item.name.toLowerCase(),item]));
  for(const target of states.values())for(const transition of target.sites.filter(site=>site.role==='transition'&&site.ownerKind==='state'&&site.ownerName)){
    const incoming={name:transition.ownerName,kind:'state',filename:transition.filename,file:transition.file,line:transition.line,assigned:transition.assigned,status:target.status};
    if(!target.transitionsIn.some(item=>item.name.toLowerCase()===incoming.name.toLowerCase()&&item.filename===incoming.filename&&item.line===incoming.line))target.transitionsIn.push(incoming);
    const source=states.get(transition.ownerName.toLowerCase());
    if(source&&!source.transitionsOut.some(item=>item.name.toLowerCase()===target.name.toLowerCase()&&item.filename===transition.filename&&item.line===transition.line))source.transitionsOut.push({name:target.name,kind:'state',filename:transition.filename,file:transition.file,line:transition.line,assigned:transition.assigned,status:target.status});
  }
  const transitionImpact=(start,direction)=>{
    const output=[],seen=new Map([[start.name.toLowerCase(),0]]),queue=[{item:start,depth:0}],limit=64,maxDepth=8;let cycle=false,truncated=false;
    while(queue.length){const current=queue.shift();if(current.depth>=maxDepth){if((current.item[direction]||[]).some(value=>value.kind==='state'))truncated=true;continue;}
      for(const relation of current.item[direction]||[]){if(relation.kind!=='state')continue;const key=relation.name.toLowerCase(),target=states.get(key);if(!target||target.status!=='resolved')continue;
        if(key===start.name.toLowerCase()){cycle=true;continue;}const depth=current.depth+1,known=seen.get(key);if(known!==undefined&&known<=depth)continue;seen.set(key,depth);
        if(output.length>=limit){truncated=true;continue;}output.push({...relation,depth});queue.push({item:target,depth});
      }
    }
    return{rows:output.sort((a,b)=>a.depth-b.depth||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})),cycle,truncated};
  };
  for(const item of states.values())if(item.status==='resolved'){
    const inbound=transitionImpact(item,'transitionsIn'),outbound=transitionImpact(item,'transitionsOut');item.transitiveTransitionsIn=inbound.rows;item.transitiveTransitionsOut=outbound.rows;item.transitionCycle=inbound.cycle||outbound.cycle;item.transitionImpactTruncated=inbound.truncated||outbound.truncated;
  }
  for(const helper of entries.filter(item=>item.category==='helpers'))for(const creation of helper.sites.filter(site=>site.role==='creation')){
    const value=String(creation.metadata?.state||'').trim();if(!/^-?\d+$/.test(value))continue;
    const target=states.get(value.toLowerCase()),declaration=target?.sites.find(site=>site.role==='declaration');
    const relation={name:value,kind:'state',filename:declaration?.filename||creation.filename,file:declaration?.file||creation.file,line:declaration?.line??creation.line,assigned:declaration?.assigned??creation.assigned,status:target?.status||'definition unresolved',sourceRole:declaration?'declaration':'helper creation'};
    if(!helper.stateStarts.some(item=>item.name===relation.name&&item.filename===relation.filename&&item.line===relation.line))helper.stateStarts.push(relation);
  }
  const glossaryGroups=new Map();
  for(const item of entries){
    item.glossary=GLOSSARY_CATEGORIES.has(item.category)&&(item.declarations>0||['maps','variables'].includes(item.category)&&item.sites.length>0);item.glossaryMeaningStatus='';
    if(!item.glossary)continue;const key=`${item.category}\0${item.name.toLowerCase()}`;if(!glossaryGroups.has(key))glossaryGroups.set(key,[]);glossaryGroups.get(key).push(item);
  }
  for(const group of glossaryGroups.values()){
    const meanings=[...new Set(group.flatMap(item=>item.documentation||[]).map(value=>String(value).trim()).filter(Boolean))];
    if(meanings.length<2)continue;for(const item of group)item.glossaryMeaningStatus='documented meaning varies by scope or declaration';
  }
  const counts = Object.fromEntries(CATEGORY_ORDER.map(category => [category, entries.filter(item => item.category === category).length]));
  return { label: options.label || 'Current project', resolved: options.resolved !== false, detail: options.detail || '', ownerIdentity:options.ownerIdentity?path.resolve(options.ownerIdentity):'', currentFile:options.currentFile?path.resolve(options.currentFile):'', files: files.length, entries, counts, failures, sources };
}

function searchSymbols(model, query, aliases = {}, options={}) {
  if (!String(query || '').trim()) return model.entries || [];
  const enabled=new Set((options.enabledCapabilities||[]).map(value=>String(value).toLowerCase()));
  return (model.entries || []).filter(item => {
    const showStrings=options.nightlyStringsEnabled!==false,returnTypes=(item.returnTypes||[]).filter(value=>showStrings||value.toLowerCase()!=='string'),valueKinds=(item.valueKinds||[]).filter(value=>showStrings||value!=='string'),flowRoles=stringFlowRoles(item,{nightlyStringsEnabled:options.nightlyStringsEnabled===true,enabledCapabilities:[...enabled]}),parameterFlows=(item.parameterFlows||[]).flatMap(flow=>{const kinds=(flow.kinds||[]).filter(value=>showStrings||value!=='string');return kinds.length?[`parameter ${flow.name} observed ${kinds.join(' ')}`]:[];});
    const siteText=item.sites.map(site => {const metadata=site.metadata||{},visibility=String(metadata.visibilityCapabilityId||'').toLowerCase(),hideStrings=visibility&&!enabled.has(visibility)&&!(visibility==='zss.runtime-strings'&&showStrings),hideCommand=Array.isArray(options.enabledCapabilities)&&metadata.commandVisibilityCapabilityId&&!enabled.has(String(metadata.commandVisibilityCapabilityId).toLowerCase()),entries=Object.entries(metadata).filter(([key])=>!['visibilityCapabilityId','commandVisibilityCapabilityId'].includes(key)&&(!hideStrings||!key.startsWith('string '))&&(!hideCommand||!['usage','command trigger'].includes(key)));return `${site.role} ${site.access} ${site.runtimeOwner?`runtime owner ${site.runtimeOwner}`:''} ${entries.map(([key,value])=>`${key} ${value}`).join(' ')} ${site.file}`;}).join(' ');
    return matches(`${CATEGORY_LABELS[item.category]} ${item.name} ${(item.signatures||[]).join(' ')} ${returnTypes.map(value=>`returns ${value}`).join(' ')} ${valueKinds.map(value=>`observed ${value}`).join(' ')} ${flowRoles.map(value=>`string flow ${value}`).join(' ')} ${parameterFlows.join(' ')} ${(item.documentation||[]).join(' ')} ${item.status} ${siteText} ${(item.callers || []).map(value => `called by ${value.kind} ${value.name}`).join(' ')} ${(item.callees || []).map(value => `calls function ${value.name}`).join(' ')} ${(item.transitiveCallers||[]).filter(value=>value.depth>1).map(value=>`indirectly called by function ${value.name} depth ${value.depth}`).join(' ')} ${(item.transitiveCallees||[]).filter(value=>value.depth>1).map(value=>`indirectly calls function ${value.name} depth ${value.depth}`).join(' ')} ${(item.transitiveTransitionsIn||[]).filter(value=>value.depth>1).map(value=>`indirect transition from StateDef ${value.name} depth ${value.depth}`).join(' ')} ${(item.transitiveTransitionsOut||[]).filter(value=>value.depth>1).map(value=>`indirect transition to StateDef ${value.name} depth ${value.depth}`).join(' ')} ${(item.writers||[]).map(value=>`written by ${value.kind} ${value.name}`).join(' ')} ${(item.readers||[]).map(value=>`read by ${value.kind} ${value.name}`).join(' ')} ${(item.stateStarts||[]).map(value=>`starts in StateDef ${value.name} ${value.status}`).join(' ')}`, query, aliases);
  });
}

function suggestLiteralResourceId(model, category, start = 1) {
  if (!['helpers', 'explods', 'projectiles'].includes(category)) throw new Error('Choose Helper, Explod, or Projectile.');
  const floor = Number(start);
  if (!Number.isSafeInteger(floor) || floor < 0) throw new Error('The starting ID must be a non-negative whole number.');
  const entries = (model?.entries || []).filter(item => item.category === category), used = new Set(), dynamic = [];
  for (const item of entries) {
    const value = String(item.name || '').trim();
    if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) used.add(Number(value));
    else dynamic.push(value || '(empty expression)');
  }
  let candidate = floor;
  while (used.has(candidate) && candidate < Number.MAX_SAFE_INTEGER) candidate += 1;
  if (!Number.isSafeInteger(candidate)) throw new Error('No safe whole-number candidate remains in this range.');
  const limitations = [];
  if (!model?.resolved) limitations.push('project ownership is unresolved');
  if (model?.failures?.length) limitations.push(`${model.failures.length} source file(s) could not be indexed`);
  if (dynamic.length) limitations.push(`${dynamic.length} dynamic or non-literal ID expression(s) cannot be collision-checked`);
  return { category, start: floor, candidate, used: [...used].sort((a, b) => a - b), dynamic, complete: limitations.length === 0, limitations };
}

module.exports = { CATEGORY_ORDER, CATEGORY_LABELS, RECORD_CACHE_LIMITS, CATALOG_LIMITS, buildProjectSymbolCatalog, searchSymbols, suggestLiteralResourceId, stringFlowRoles, clearRecordCache, recordCacheSnapshot };
