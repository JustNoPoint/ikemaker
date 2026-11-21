'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {locateExecutable,hashSnapshotExecutable}=require('./snapshot_engine_identity');

const engineSha256='73bcd922ec7e3b471a0bfc16c9d00a756e9d8abc7e0f11819a6b1bac4d63f27f';
const bindingPolicy='pinned-quickvs-asset-binding-2';
const pinned={
  'external/script/main.lua':'db852e82d3d7786d1dfb3fd21e9796d3b870bcd20a70cf5de61fa622fdfe9dc6',
  'external/script/start.lua':'dc59b3035d2ac9c3d33d9a468e982abfa6ea1f73eb918fd6f7195138841dbf39',
  'external/script/debug.lua':'160a54b3c4191e7e7735d322d6b300553e2f0828f1b2ea6d876a06061bb12bf2',
  'external/script/default.lua':'4ecc7162e41a3d00c6b8c846f22bd4cc322ca861da829b230df57761fb5a4c0e',
  'external/script/menu.lua':'389ccf571143753d24893d3ca64766a6ffc080be4619d8e5a979497fbd59bd82',
  'external/script/options.lua':'1f4d73a12ffa0acd63318ea41aabff2468b363e00d069c12aa0c7b637a70ae08',
  'data/ikemen1/system.def':'dc0431a0bee84ad5e77cd920d3c8e8a31dbaffadb215b705d3f1c78ede48ea7e',
  'data/system.base.def':'309060a9015ecba5eea75e0ab8c913f0a18f9f70c56b3798b7e10ca5c7729edb'
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const writeRecord=(filename,data)=>fs.writeFileSync(filename,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const samePath=(a,b)=>path.relative(a,b)==='';
function relative(value,expression) {
  return typeof value==='string'&&value.length<=160&&expression.test(value)&&
    value.split('/').every(segment=>!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}
const localFile=/^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.[a-z0-9]+$/i;
const defFile=/^chars\/[a-z0-9_-]+\/[a-z0-9_-]+\.def$/i;
function knownKeys(value,keys) {
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function confinedFile(root,resource) {
  if(!relative(resource,localFile)||resource.split('/').some(part=>part==='.'||part==='..')) throw Error('Unsupported local asset path');
  let current=root;
  const parts=resource.split('/');
  for(const [index,part] of parts.entries()){
    current=path.join(current,part);
    const stat=fs.lstatSync(current);
    if(index===parts.length-1? !stat.isFile():!stat.isDirectory()) throw Error('Binding requires regular files and directories');
  }
  if(!samePath(current,fs.realpathSync.native(current))) throw Error('Binding file resolves away from its declared location');
  return current;
}
function readSmall(filename,max=4*1024*1024) {
  const size=fs.statSync(filename).size;
  if(size<1||size>max) throw Error('Binding text size is unsupported');
  const bytes=fs.readFileSync(filename);
  if(bytes.length!==size) throw Error('Binding text changed while reading');
  return bytes;
}
function loadLaunchManifest(filename,runtime) {
  const bytes=readSmall(filename,16*1024),manifest=JSON.parse(bytes);
  if(!knownKeys(manifest,['schema','version','projectId','stage','selections'])||manifest.schema!=='ikemeter.launch-manifest'||
     manifest.version!==1||typeof manifest.projectId!=='string'||!/^[A-Za-z0-9_.-]{1,100}$/.test(manifest.projectId)||
     manifest.stage!=='stages/stage0.def'||!Array.isArray(manifest.selections)||manifest.selections.length!==2)throw Error('Invalid IKeMeter launch manifest');
  const root=fs.realpathSync.native(runtime);
  for(const [index,item] of manifest.selections.entries()){
    if(!knownKeys(item,['slot','launchArgument','def','air','sff'])||item.slot!==index+1||
       item.launchArgument!==item.def||!relative(item.def,defFile)||
       !relative(item.air,localFile)||!item.air.toLowerCase().endsWith('.air')||
       !relative(item.sff,localFile)||!item.sff.toLowerCase().endsWith('.sff'))throw Error('Binding requires explicit DEF, AIR and SFF paths for slots 1 and 2');
    confinedFile(root,item.def);
  }
  return {manifest,manifestSha256:sha(bytes),root};
}
function ini(bytes,strictSections=[]) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/\r(?!\n)|[\0\uFEFF]/.test(text))throw Error('Unsupported definition or configuration line endings');
  const sections=new Map();
  let current,strict=false;
  for(const raw of text.split('\n')){
    const line=raw.split(';',1)[0].trim(), header=/^\[([^\]]+)\]$/.exec(line);
    if(header){
      const name=header[1].trim().toLowerCase();
      strict=strictSections.includes(name);
      if(strict){
        if(header[1].toLowerCase()!==name)throw Error(`Noncanonical [${name}] section is unsupported for binding`);
        if(sections.has(name))throw Error(`Duplicate [${name}] section is unsupported for binding`);
      }
      current=sections.get(name)||[];sections.set(name,current);continue;
    }
    const assignment=/^([^=]+)=(.*)$/.exec(line);
    if(strictSections.length&&line.startsWith('['))throw Error('Malformed section header is unsupported for binding');
    if(strict&&line&&(!assignment||!/^[a-z0-9_.-]+$/i.test(assignment[1].trim())||
       line.endsWith('\\')||/`|"""|'''/.test(line)))throw Error('Ambiguous assignment is unsupported for binding');
    if(assignment&&current)current.push([assignment[1].trim().toLowerCase(),assignment[2].trim()]);
  }
  return sections;
}
function assign(sections,section,key) {
  const rows=(sections.get(section)||[]).filter(row=>row[0]===key);
  if(rows.length!==1) throw Error(`Expected a single ${section}.${key} assignment`);
  return rows[0][1];
}
function literal(value) {
  const text=value.replace(/^(["'])(.*)\1$/,'$2').replaceAll('\\','/');
  if(!text||/[:*?\[\]'",\s]|\.zip(?:\/|$)/i.test(text)||text.startsWith('/'))throw Error('Unsupported asset lookup');
  return text;
}
function directResource(def,value) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(def),literal(value)));
}
function resolveResource(root,request,folders,allowZssFallback=false) {
  for(const name of allowZssFallback&&!request.toLowerCase().endsWith('.zss')?[request,request+'.zss']:[request]){
    for(const folder of folders){
      const candidate=path.posix.normalize(path.posix.join(folder,name));
      try{confinedFile(root,candidate);return candidate;}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  throw Error(`Unresolved binding dependency ${request}`);
}
// A selected source reference needs its own DEF assignment. A generic
// dependency hash (or another asset belonging to this root) is insufficient.
function uniquelyAssignedState(root, definition, bytes, source) {
  if (!/\.cns$/i.test(source)) return false;
  const sections = ini(bytes,['files']);
  const folder = path.posix.dirname(definition);
  const matches = [];
  for (const [key,value] of sections.get('files') || []) {
    if (!/^st\d*$/.test(key) || !value) continue;
    const request = literal(assign(sections,'files',key));
    const resource = resolveResource(root,request,[folder,'','data/ikemen1','data'],true);
    if (resource.toLowerCase() === source.toLowerCase()) matches.push(resource);
  }
  return matches.length === 1 && matches[0] === source;
}

function checkStateSource(root,resource) {
  if(!/\.(?:cns|cmd|zss)$/i.test(resource))throw Error('Unsupported character state source');
  const bytes=readSmall(confinedFile(root,resource));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(text.includes('\0')||/\b(?:matchrestart|loadstate|loadfile)\b|(?:^|\n)\s*#?\s*(?:include|import)\b/i.test(text)){
    throw Error(`Unbound restart, load or include in ${resource}`);
  }
  return sha(bytes);
}
function dataPlan(binding) {
  const {root,manifest}=binding,definitions=[],stateSources=new Set();
  const parsedHashes={};
  const loadIni=(resource,uniqueSections)=>{
    const bytes=readSmall(confinedFile(root,resource));
    parsedHashes[resource]=sha(bytes);
    return ini(bytes,uniqueSections);
  };
  const resources=new Set(Object.keys(pinned));
  resources.add('save/config.ini');
  resources.add(manifest.stage);
  if(fs.existsSync(path.join(root,'resources/defaultConfig.ini')))throw Error('Alternate engine defaults are unsupported for binding');
  const config=loadIni('save/config.ini',['config','common']);
  if(assign(config,'config','system')!=='external/script/main.lua'||assign(config,'config','motif')!=='data/ikemen1/system.def'||
     assign(config,'config','language')!=='en'||assign(config,'common','modules')!==''||
     assign(config,'common','lua')!=='loop()'||assign(config,'common','air')!=='data/common.air'||
     (config.get('common')||[]).some(([key])=>/^(?:modules|lua|air).+$/i.test(key))||
     ['cmd','const','states','fx'].some(key=>!assign(config,'common',key)))throw Error('Unsupported stock script, motif or common configuration');
  resources.add('data/common.air');
  resources.add('external/mods/ikemeter_bridge.lua');
  const motifFolder='data/ikemen1';
  const fight=resolveResource(root,'fight.def',[motifFolder,'','data']);
  if(fight!=='data/fight.def')throw Error('Unsupported motif fight definition fallback');
  resources.add(fight);
  const select=resolveResource(root,'select.def',[motifFolder,'','data']);
  if(select!=='data/select.def')throw Error('Unsupported motif selection definition fallback');
  resources.add(select);
  const stage=loadIni(manifest.stage);
  if([...stage.values()].flat().some(([key,value])=>/^attachedchar\d*$/i.test(key)&&value))throw Error('Attached stage characters are not bound');
  for(const folder of ['external/script','external/mods']){
    const names=fs.readdirSync(path.join(root,folder),{withFileTypes:true});
    if(names.some(entry=>entry.isSymbolicLink()||entry.isDirectory()||
      (/\.lua$/i.test(entry.name)&&!(folder==='external/mods'&&entry.name.startsWith('-'))&&
       folder+'/'+entry.name!=='external/mods/ikemeter_bridge.lua'&&!Object.hasOwn(pinned,folder+'/'+entry.name)))) {
      throw Error('Unbound executable script or module');
    }
  }
  for(const item of manifest.selections){
    const info=loadIni(item.def,['info','files']);
    if([...info.keys()].some(key=>key!=='files'&&/(?:^|[. ])files(?:$|[. ])/i.test(key)))throw Error('Localized character file assignments are unsupported');
    resources.add(item.def);
    const assets={};
    for(const [key,type] of [['anim','air'],['sprite','sff']]){
      try {
        const candidate=directResource(item.def,assign(info,'files',key));
        if(candidate!==item[type])throw Error('Declared asset does not match the direct DEF assignment');
        confinedFile(root,candidate);
        assets[type]=candidate;
        resources.add(candidate);
      }catch(error){assets[type]=null;}
    }
    const defFolder=path.posix.dirname(item.def);
    const commonFolders=[defFolder,motifFolder,'data','','data'];
    for(const [key,value] of config.get('common')||[]){
      if(!/^(?:air|cmd|const|states|fx)\d*$/.test(key)||!value)continue;
      for(const source of value.split(',')){
        const request=literal(source.trim());
        if(!request.startsWith('data/'))throw Error('Unsupported common resource lookup');
        const resource=resolveResource(root,request,commonFolders,key.startsWith('states'));
        if(resource!==request)throw Error(`Shadowed common binding dependency ${request}`);
        resources.add(resource);
        if(/^(?:cmd|states)\d*$/.test(key))stateSources.add(resource);
      }
    }
    for(const [key,value] of info.get('files')||[]){
      if(!/^(?:cmd|cns|st\d*|stcommon|sound|pal\d+)$/.test(key)||!value)continue;
      const request=literal(assign(info,'files',key));
      const state=/^(?:st\d*|stcommon)$/.test(key),folders=state?[defFolder,'',motifFolder,'data']:[defFolder,'','data'];
      const resource=resolveResource(root,request,folders,state);
      resources.add(resource);
      if(state)stateSources.add(resource);
      if(key==='cmd'){
        const compiled=resolveResource(root,resource,[defFolder,'',motifFolder,'data'],true);
        resources.add(compiled);stateSources.add(compiled);
      }
    }
    definitions.push({slot:item.slot,def:item.def,...assets});
  }
  if(resources.size>64)throw Error('The binding file-set limit was exceeded');
  return {resources:[...resources].sort(),definitions,stateSources,parsedHashes};
}
async function fingerprintPlan(binding,signal) {
  const {resources,definitions,stateSources,parsedHashes}=dataPlan(binding);
  let bytes=0;
  const files={},identities={};
  for(const relativePath of resources){
    signal.throwIfAborted();
    const file=confinedFile(binding.root,relativePath),{imagePath,identity}=locateExecutable(file);
    bytes+=Number(identity.size);
    if(bytes>512*1024*1024)throw Error('The binding byte limit was exceeded');
    const {sha256}=await hashSnapshotExecutable(imagePath,identity,signal);
    if(pinned[relativePath]&&sha256!==pinned[relativePath])throw Error('The active stock startup files do not match the pinned runtime');
    if(parsedHashes[relativePath]&&sha256!==parsedHashes[relativePath])throw Error('Parsed dependency changed while binding');
    if(stateSources.has(relativePath)&&sha256!==checkStateSource(binding.root,relativePath))throw Error('State dependency changed while binding');
    files[relativePath]=sha256;
    identities[relativePath]=Object.fromEntries(['dev','ino','size','mtimeNs'].map(key=>[key,String(identity[key])]));
  }
  return {definitions,files,identities};
}
function bindingPlanMatches(pre,post) {
  if(!pre.identities||!post?.identities||!isDeepStrictEqual(pre.definitions,post.definitions)||
     !isDeepStrictEqual(pre.files,post.files))return false;
  return Object.keys(pre.files).every(resource=>{
    const prior=pre.identities[resource],later=post.identities[resource];
    if(!prior||!later)return false;
    // The pinned engine rewrites config.ini at startup. Keep its identity and require identical bytes.
    if(resource==='save/config.ini')return ['dev','ino','size'].every(key=>typeof prior[key]==='string'&&prior[key]===later[key]);
    return isDeepStrictEqual(prior,later);
  });
}
function validBindingPolicy(pre,receipt) {
  return pre.policy===bindingPolicy&&receipt.policy===bindingPolicy&&pre.engine?.sha256===engineSha256&&
    Object.entries(pinned).every(([resource,expected])=>pre.files?.[resource]===expected)&&
    ['save/config.ini','data/select.def','data/fight.def','data/common.air','stages/stage0.def','external/mods/ikemeter_bridge.lua']
      .every(resource=>typeof pre.files?.[resource]==='string'&&/^[a-f0-9]{64}$/.test(pre.files[resource]));
}
async function bindBeforeLaunch(binding,active,args) {
  const record={version:1,policy:bindingPolicy,manifest:binding.manifest,manifestSha256:binding.manifestSha256,root:binding.root,
    sessionId:active.session.bootstrap.sessionId,args,engine:active.launchEngine,bridgeSha256:sha(active.bridgeBytes)};
  try{
    if(active.launchEngine.sha256!==engineSha256)throw Error('Opt-in binding requires the pinned stock engine');
    Object.assign(record,await fingerprintPlan(binding,active.operationAbort.signal));
    if(record.files['external/mods/ikemeter_bridge.lua']!==record.bridgeSha256)throw Error('Installed Meter bridge changed before launch');
  }catch(error){active.operationAbort.signal.throwIfAborted();record.reason=error.message;}
  return record;
}
async function retainPrelaunchBinding(binding,active,args,assertCurrent) {
  const pre=await bindBeforeLaunch(binding,active,args);
  assertCurrent();
  const filename=path.join(active.results,'binding-prelaunch.json');
  writeRecord(filename,pre);
  active.bindingPre=pre;
  active.bindingPreSha256=sha(readSmall(filename));
}
function parseRootSelection(value,owner) {
  const match=/^([12]),([0-9]{1,10}),([0-9]{1,10}),((?:[a-f0-9]{2}){1,160})$/.exec(value);
  if(!match||Number(match[1])!==owner)return null;
  const definition=Buffer.from(match[4],'hex').toString('latin1');
  if(!relative(definition,defFile))return null;
  return {slot:owner,runtimeId:Number(match[2]),selectRef:Number(match[3]),definition};
}
function recordMatch(pre,proof,entities) {
  if(!proof)return false;
  return pre.definitions.every(item=>{
    const root=entities.find(entity=>entity.kind==='player'&&entity.owner===item.slot);
    const observed=proof.roots[item.slot-1];
    return root&&observed&&observed.slot===item.slot&&root.runtimeId===observed.runtimeId&&observed.definition.toLowerCase()===item.def.toLowerCase();
  });
}
function bindingReceiptPath(directory,id) {return path.join(directory,`binding-receipt-${id}.json`);}
async function writeBindingReceipt(active,binding,first,second,pair,firstProof,secondProof,assertCurrent) {
  const pre=active.bindingPre,preFile=path.join(active.results,'binding-prelaunch.json');
  const out=bindingReceiptPath(path.dirname(pair.verificationPath),pair.id);
  const receipt={schema:'ikemeter.binding-receipt',version:1,policy:bindingPolicy,pairId:pair.id,pairVerdictSha256:sha(readSmall(pair.verificationPath)),
    prelaunchSha256:active.bindingPreSha256,sessionId:pair.sessionId,epoch:pair.epoch,tick:pair.tick,engine:first.engine,
    captureIds:[first.id,second.id],sidecarSha256:[first,second].map(item=>sha(readSmall(item.metadataPath))),
    binding:firstProof,status:'unbound'};
  try{
    if(pre.reason)throw Error(pre.reason);
    if(sha(readSmall(preFile))!==receipt.prelaunchSha256)throw Error('Prelaunch binding evidence changed');
    const post=await fingerprintPlan(binding,active.operationAbort.signal);
    receipt.post=post;
    if(!bindingPlanMatches(pre,post))throw Error('Launch files or assignments changed');
    if(!isDeepStrictEqual(firstProof,secondProof)||!recordMatch(pre,firstProof,first.frame.entities)||
       !recordMatch(pre,secondProof,second.frame.entities))throw Error('Stock root selections or animation prefixes did not agree');
    receipt.status='bound';
  }catch(error){receipt.reason=error.message;}
  assertCurrent();
  writeRecord(out,receipt);
  return {status:receipt.status,...(receipt.reason&&{reason:receipt.reason})};
}

module.exports={uniquelyAssignedState,loadLaunchManifest,retainPrelaunchBinding,writeBindingReceipt,bindingReceiptPath,parseRootSelection,confinedFile,sha,readSmall,dataPlan,checkStateSource,bindingPlanMatches,validBindingPolicy,bindingPolicy,pinned};
