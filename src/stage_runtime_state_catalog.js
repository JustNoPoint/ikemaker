'use strict';
const fs=require('node:fs'),states=require('./state_transfer_catalog'),snapshots=require('./stage_attached_authoring_workflow'),physical=require('./stage_attached_authoring');
const matchedDefaults=new Map(),resolutions=new WeakMap();
function certifiedDefaults(filename,authority){
 const reviewed=require('./stage_negative_global_authority').reviewedAuthorityFor(authority);
 if(!reviewed)throw Error('The exact engine artifact is not supported for certified embedded defaults.');
 const expected=reviewed.defaultConfigSha256;
 if(require('./mutation_safety').hash(fs.readFileSync(filename))!==expected)throw Error('Selected defaults do not match the exact supported engine source. No source changed.');
 return{engineDefaultConfig:filename,engineDefaultConfigCertification:{certified:true,buildId:authority.buildId,executableSha256:authority.executableSha256}};
}
function catalogResolution(catalog){return resolutions.get(catalog)||{overrides:{}};}
async function loadRuntimeStateCatalog(api,defFilename,options={}){
 const assert=options.assertCurrent||(()=>{}),build=options.buildCatalog||states.buildStateTransferCatalog,verify=options.verifyEngineDefaults||require('./stage_negative_global_authority').negativeGlobalAuthority;
 assert();const originalDocuments=new Map((api.workspace.textDocuments||[]).filter(doc=>!doc.isClosed).map(doc=>[physical.canonicalPath(doc.fileName),doc])),retained=snapshots.ownerSnapshot(api,defFilename),check=()=>{assert();snapshots.assertSnapshot(api,defFilename,retained);};let overrides=options.overrides||{},catalog=await build(api,api.Uri.file(defFilename),options.service,overrides),engineAuthority;check();
 const finish=metadata=>{const authorityProof=engineAuthority&&overrides.engineDefaultConfigCertification?.certified?{expected:JSON.stringify(engineAuthority),current:()=>JSON.stringify(verify(api,catalog.authority.root,defFilename,catalog))}:null;resolutions.set(catalog,{overrides,authorityProof,originalDocuments,...metadata});catalogProof(api,catalog)();return catalog;};
 // Ordinary catalog resolution retains the existing resource/config rules.
 // Exact reviewed-artifact evidence is needed only for the optional embedded-default artifact
 // fallback. Passive inventory never prompts, changes files or changes targets.
 if(catalog.complete){if(overrides.engineDefaultConfigCertification?.certified)engineAuthority=verify(api,catalog.authority.root,defFilename,catalog);return finish();}
 if(!(catalog.limitations||[]).some(reason=>reason.includes('defaultConfig.ini resource could not be proven')))return finish();
 let authority;try{authority=verify(api,catalog.authority.root,defFilename);}catch(error){
  if(!options.interactive)return finish({needsEngineBinding:true,reason:error.message});
  const answer=await api.window.showWarningMessage('Engine source proof is unavailable. '+error.message,{modal:true},'Inspect Engine Binding');check();
  if(answer==='Inspect Engine Binding'){await api.commands.executeCommand('ikemen.engineRegistry.open',api.Uri.file(defFilename));return finish({cancelled:true,needsEngineBinding:true,inspectedEngine:true,reason:error.message});}
  return finish({cancelled:true,needsEngineBinding:true,reason:error.message});
 }
 engineAuthority=authority;let cached=matchedDefaults.get(authority.executableSha256);
 if(cached){try{overrides=certifiedDefaults(cached,authority);}catch{matchedDefaults.delete(authority.executableSha256);cached=null;overrides={};}if(cached){catalog=await build(api,api.Uri.file(defFilename),options.service,overrides);check();return finish();}}
 if(!options.interactive)return finish({needsEngineDefaults:true});
 const answer=await api.window.showWarningMessage('This exact engine embeds its default configuration. Choose its matched source defaultConfig.ini as read-only input to prove Common.States, or inspect the engine binding. No project/configuration files will be created or changed.',{modal:true},'Choose Matched Engine Defaults…','Inspect Engine Binding');check();
 if(answer==='Inspect Engine Binding'){await api.commands.executeCommand('ikemen.engineRegistry.open',api.Uri.file(defFilename));return finish({cancelled:true,inspectedEngine:true});}
 if(answer!=='Choose Matched Engine Defaults…')return finish({cancelled:true});
 const selected=await api.window.showOpenDialog({title:'Exact bound engine source: resources/defaultConfig.ini (read-only input)',canSelectMany:false,filters:{'Engine default configuration':['ini']}});check();if(!selected?.length)return finish({cancelled:true});
 const filename=selected[0].fsPath;overrides=certifiedDefaults(filename,authority);catalog=await build(api,api.Uri.file(defFilename),options.service,overrides);check();matchedDefaults.set(authority.executableSha256,filename);return finish();
}
function catalogProof(api,catalog,options={}){
 const all=[...(catalog.authority?.dependencies||[]),...(catalog.authority?.functionCatalog?.authority?.dependencies||[]),catalog.authority?.functionCatalog?.authority?.owner].filter(Boolean),proof=new Map();
 for(const row of all){
  if(row.exists===false){if(fs.existsSync(row.filename)||api.workspace.textDocuments?.some(doc=>!doc.isClosed&&physical.samePath(doc.fileName,row.filename)))throw Error('A runtime source resolution candidate appeared while building the catalog: '+row.filename);if(!proof.has(row.filename))proof.set(row.filename,null);continue;}
  const now=snapshots.ownerSnapshot(api,row.filename),version=Number.isInteger(row.version)?row.version:null,currentVersion=Number.isInteger(now.version)?now.version:null,clean=!row.dirty&&!now.dirty,original=catalogResolution(catalog).originalDocuments?.get(physical.canonicalPath(row.filename));
  const cleanLifecycle=clean&&(version===null||currentVersion===null||original?.isClosed===true);
  if(typeof row.hash!=='string'||require('./mutation_safety').hash(now.text)!==row.hash||Boolean(row.dirty)!==now.dirty||version!==currentVersion&&!cleanLifecycle)throw Error('Runtime dependency changed while building the catalog; reload its source proof: '+row.filename);
  if(!proof.has(row.filename))proof.set(row.filename,now);
 }
 const authority=catalogResolution(catalog).authorityProof;
 return()=>{if(authority&&authority.current()!==authority.expected)throw Error('The bound engine target or exact executable changed during source review.');for(const [filename,value]of proof){if(value===null){if(fs.existsSync(filename)||api.workspace.textDocuments?.some(doc=>!doc.isClosed&&physical.samePath(doc.fileName,filename)))throw Error('A runtime source resolution candidate appeared during review: '+filename);}else try{snapshots.assertSnapshot(api,filename,value);}catch(error){const document=(api.workspace.textDocuments||[]).find(doc=>!doc.isClosed&&physical.samePath(doc.fileName,filename)),now=snapshots.ownerSnapshot(api,filename),cleanOpened=value.version===undefined&&value.dirty===false&&document&&options.allowCleanOpenedDocuments?.has(document)&&document.isDirty===false&&now.dirty===false&&now.text===value.text&&now.disk===value.disk&&JSON.stringify(now.identity)===JSON.stringify(value.identity);if(!cleanOpened)throw Error('Runtime source changed during review: '+filename,{cause:error});}}};
}
module.exports={loadRuntimeStateCatalog,catalogResolution,catalogProof,certifiedDefaults};
