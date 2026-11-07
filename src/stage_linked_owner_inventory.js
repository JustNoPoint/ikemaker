'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseDef,unquote}=require('./def_model'),{hash}=require('./mutation_safety'),snapshots=require('./stage_attached_authoring_workflow');
const pathIdentity=require('./stage_participant_path_identity');
const CODE=/^(?:st\d*|stcommon|common|cns|cmd|anim)$/i;
// Shared direct-DEF inventory for attached controllers and explicitly selected
// fighters. It does not synthesize Stage bindings or broaden roster ownership.
async function inventoryForDef(defFilename,env,assert){
 defFilename=path.resolve(defFilename);assert();await env.api.workspace.openTextDocument(env.api.Uri.file(defFilename));assert();
 const defSnapshot=snapshots.ownerSnapshot(env.api,defFilename),source=env.readText(defFilename),document=parseDef(source,defFilename),files=document.sections.filter(s=>s.normalized==='files');
 if(files.length!==1||!document.sections.some(s=>s.normalized==='info'))throw Error('Choose a character DEF with one unambiguous Files section.');
 const fields=files[0].entries.filter(e=>CODE.test(e.normalized)),seen=new Set();for(const field of fields){if(seen.has(field.normalized))throw Error('Duplicate declared source key requires review: '+field.key);seen.add(field.normalized);}
 const assigned=[];
 for(const field of fields){
  const reference=unquote(field.value);if(!reference)continue;let filename=env.resolveAsset(reference,defFilename);
  if((!filename||!fs.existsSync(filename))&&/^st(?:\d*|common)$/i.test(field.normalized)&&!/\.zss$/i.test(reference))filename=env.resolveAsset(reference+'.zss',defFilename);
  if(!filename||!fs.existsSync(filename))throw Error('Resolve declared '+field.key+' source before authoring: '+reference);
  filename=path.resolve(filename);await env.api.workspace.openTextDocument(env.api.Uri.file(filename));assert();snapshots.assertSnapshot(env.api,defFilename,defSnapshot);assigned.push({filename,assignedKey:field.key,reference});
 }
 const catalogApi=require('./stage_runtime_state_catalog'),catalog=await(env.loadRuntimeStateCatalog||catalogApi.loadRuntimeStateCatalog)(env.api,defFilename,{assertCurrent:assert,interactive:false});assert();snapshots.assertSnapshot(env.api,defFilename,defSnapshot);
 const catalogCheck=(env.catalogProof||catalogApi.catalogProof)(env.api,catalog),paths=new Map();for(const filename of [defFilename,...assigned.map(s=>s.filename),...(catalog.entries||[]).map(entry=>path.resolve(entry.filename)),...(catalog.authority?.constantInputs||[]).map(entry=>path.resolve(entry.filename))]){const key=path.resolve(filename).toLowerCase();if(!paths.has(key))paths.set(key,filename);}const all=[...paths.values()];
 // Direct DEF-owned mutation choices were opened above. Effective Common.States
 // are read-only inputs; opening new models here would change the lifecycle
 // witnessed during catalog construction. Reuse its native-or-disk text proof.
 assert();catalogCheck();
 const sources=all.map(filename=>({filename,text:env.readText(filename)})),proof=all.map(filename=>({filename,value:snapshots.ownerSnapshot(env.api,filename)})),sourceChoices=[];
 for(const entry of [...(catalog.entries||[]),...(catalog.authority?.constantInputs||[])])if(require('./stage_source_representation').canonical(sources.find(source=>path.resolve(source.filename).toLowerCase()===path.resolve(entry.filename).toLowerCase())?.text)!==require('./stage_source_representation').canonical(entry.text))throw Error('Native decoding differs from proven engine source catalog: '+entry.filename+'. Resolve its source encoding before authoring.');
 for(const row of assigned.filter(s=>/^st\d*$/i.test(s.assignedKey)&&/\.zss$/i.test(s.filename)))if(!sourceChoices.some(s=>pathIdentity(s.filename)===pathIdentity(row.filename)))sourceChoices.push({id:hash(pathIdentity(row.filename)),filename:row.filename,label:path.basename(row.filename),assignedKey:row.assignedKey,link:{from:defFilename,key:row.assignedKey,reference:row.reference,to:row.filename}});
 const runtimeCatalog={complete:catalog.complete===true,root:catalog.authority?.root||'',defaultConfigProvenance:catalog.authority?.defaultConfigProvenance||null,constants:{complete:catalog.authority?.constantsComplete===true,limitations:catalog.authority?.constantLimitations||[],commonInputs:(catalog.authority?.constantInputs||[]).map(row=>({filename:row.filename,text:sources.find(source=>path.resolve(source.filename).toLowerCase()===path.resolve(row.filename).toLowerCase())?.text})),characterCns:(()=>{const row=assigned.find(row=>/^cns$/i.test(row.assignedKey));return row?sources.find(source=>path.resolve(source.filename).toLowerCase()===path.resolve(row.filename).toLowerCase()):null;})()},compileAssignments:(catalog.authority?.compileAssignments||[]).map(row=>{const retained=proof.find(source=>path.resolve(source.filename).toLowerCase()===path.resolve(row.filename).toLowerCase());return{filename:row.filename,role:row.role,physicalKey:retained?.value.identity.split(':').slice(0,2).join(':')||null};})};
 assert();snapshots.assertSnapshot(env.api,defFilename,defSnapshot);catalogCheck();return {id:hash(pathIdentity(defFilename)),defFilename,sources,snapshots:proof,sourceChoices,runtimeCatalog,stateCatalogComplete:catalog.complete===true,sourceProofReason:catalog.complete?'':(catalog.limitations||['Engine source routing could not be proven.']).join(' ').slice(0,1500),assertStateCatalog:catalogCheck};
}
function sourceProof(records){const unresolved=records.filter(record=>!record.requiresSelection&&record.stateCatalogComplete!==true);return{complete:!unresolved.length,reason:unresolved.map(record=>path.basename(record.defFilename)+': '+(record.sourceProofReason||'Engine source routing is unresolved.')).join(' | ').slice(0,2000)};}
function assertSourceProof(records){const proof=sourceProof(records);if(!proof.complete)throw Error('Engine sources are not proven. '+proof.reason+' Use Prove engine sources before generating writes. Existing source browsing and exact managed removal remain available.');}
async function proveStateSources(records,env,assert){const api=require('./stage_runtime_state_catalog');for(const record of records.filter(record=>!record.requiresSelection&&record.stateCatalogComplete!==true)){assert();const catalog=await(env.loadRuntimeStateCatalog||api.loadRuntimeStateCatalog)(env.api,record.defFilename,{assertCurrent:assert,interactive:true});assert();if(api.catalogResolution(catalog).cancelled)return false;if(!catalog.complete)throw Error('Engine sources remain unresolved for '+path.basename(record.defFilename)+': '+(catalog.limitations||[]).join(' '));}return true;}
function validateSourceLink(text,defFilename,sourceFilename,link){
 const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase(),files=parseDef(text).sections.filter(s=>s.normalized==='files');if(files.length!==1)return false;
 const entries=files[0].entries.filter(e=>/^st\d*$/.test(e.normalized));
 if(link){const exact=entries.filter(e=>e.normalized===String(link.key).toLowerCase()&&unquote(e.value)===link.reference);return exact.length===1&&same(link.from,defFilename)&&same(link.to,sourceFilename);}
 return entries.some(e=>{const ref=unquote(e.value),direct=path.resolve(path.dirname(defFilename),ref);return same(direct,sourceFilename)||!/\.zss$/i.test(ref)&&same(direct+'.zss',sourceFilename);});
}
function contractFingerprint(item){return item.requiresSelection?null:hash(JSON.stringify((item.snapshots||[]).map(row=>[path.resolve(row.filename).toLowerCase(),hash(row.value.text)]).sort((a,b)=>a[0].localeCompare(b[0]))));}
module.exports={inventoryForDef,validateSourceLink,contractFingerprint,sourceProof,assertSourceProof,proveStateSources};
