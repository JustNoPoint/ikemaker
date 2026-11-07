'use strict';
const fs=require('node:fs'),path=require('node:path');
const snapshots=require('./stage_attached_authoring_workflow'),physical=require('./stage_attached_authoring'),{parseDef,unquote}=require('./def_model'),{setEntry}=require('./stage_source_edits');
const states=require('./state_transfer_catalog');
const {loadRuntimeStateCatalog,catalogResolution,catalogProof,certifiedDefaults}=require('./stage_runtime_state_catalog');
const EMPTY_ADAPTER='[StateDef -4]\n# Explicit participant compatibility hook. Existing CNS sources are retained.\n';
function planAdapter(defFilename,defText,filename,text,create){
 if(!/\.zss$/i.test(filename))throw Error('Choose a .zss compatibility source.');
 const parent=physical.canonicalPath(path.dirname(filename)),ownerParent=physical.canonicalPath(path.dirname(defFilename));
 if(parent!==ownerParent)throw Error('Keep the adapter beside this exact character DEF; shared or external adapters require source ownership review.');
 const doc=parseDef(defText),files=doc.sections.filter(section=>section.normalized==='files');
 if(files.length!==1)throw Error('Resolve ambiguous character Files sections first.');
 const entries=files[0].entries.filter(entry=>/^st\d*$/i.test(entry.key)),used=new Set();
 for(const entry of entries){if(used.has(entry.normalized))throw Error('Duplicate source assignment: '+entry.key);used.add(entry.normalized);}
 // Append after every authored st/stN source. Filling an earlier sparse hole
 // could put the new ZSS block ahead of a legacy CNS negative-state block,
 // whose backward-compatibility first-wins behavior would then hide it.
 let highest=-1n;for(const key of used){const suffix=key.slice(2);if(suffix&&BigInt(suffix)>highest)highest=BigInt(suffix);}
 const key=entries.length?'st'+(highest<0n?1n:highest+1n):'st';
 const ref=path.basename(filename);if(/[\r\n";]/.test(ref))throw Error('Choose an adapter filename without quote, semicolon or newline.');
 require('./stage_reaction_plan').insertionPoint(text);
 const after=setEntry(defText,files[0].line,key,'"'+ref+'"');
 return{stageFilename:defFilename,targetDef:filename,files:new Map(create?[[filename,text]]:[]),destinations:new Map(create?[[filename,physical.canonicalPath(filename)]]:[]),link:{before:defText,text:after,key},rows:[{filename:defFilename,before:defText,after},{filename,before:create?'':text,after:text}]};
}
function assertNoGlobal(catalog,existing,appendAuthority){
 if(!catalog?.complete)throw Error('Cannot prove the complete character and Common.States source set. '+(catalog?.limitations||[]).join(' ')+' Resolve or save those sources before creating an adapter. No source changed.');
 const globals=(catalog.definitions||[]).filter(row=>row.value===-4),seen=new Set(),conflicts=[];
 for(const row of globals){const key=physical.canonicalPath(row.filename);if(seen.has(key)||!appendAuthority&&(!existing||!physical.samePhysical(row.filename,existing)))conflicts.push(row);seen.add(key);}
 const assignments=new Set();for(const row of catalog.authority?.compileAssignments||[]){const key=physical.canonicalPath(row.filename);if(assignments.has(key))throw Error('One physical source is assigned more than once in the runtime compile list. Resolve it before adding an adapter: '+row.filename);assignments.add(key);}
 if(conflicts.length)throw Error('StateDef -4 already exists; preserve its implementation and review compatibility there: '+conflicts.map(row=>row.filename+':'+(row.line+1)).join(', '));
}
function assertLegacyOrdering(catalog,defText,negativeStates=[-4]){
 const versions=parseDef(defText).sections.filter(section=>section.normalized==='info').flatMap(section=>section.entries).filter(entry=>entry.normalized==='ikemenversion');
 const version=unquote(versions[0]?.value||'0.0').split('.');
 if(versions.length>1||version.some(part=>!/^\d+$/.test(part)))throw Error('Resolve the participant IkemenVersion before adding a negative-state hook.');
 if(Number(version[0])||Number(version[1]))return;
 const conflict=(catalog.definitions||[]).find(row=>negativeStates.includes(row.value)&&row.grammar==='cns'&&['cmd','stcommon'].includes(row.role));
 if(conflict)throw Error('Legacy CNS negative-state precedence would hide the existing '+conflict.role+' hook after a new st source. Preserve it and review compatibility in source: '+conflict.filename+':'+(conflict.line+1));
}
function assertExistingHook(catalog,defText,filename,text){
 const declarations=require('./state_transfer_model').parseStateSource(text,filename,'zss').declarations;
 const declared=new Set();for(const declaration of declarations){if(declaration.dynamic)throw Error('Resolve dynamic state headers before linking this compatibility source: '+filename+':'+(declaration.line+1));if(declared.has(declaration.value))throw Error('Duplicate StateDef '+declaration.value+' in selected compatibility source: '+filename+':'+(declaration.line+1));declared.add(declaration.value);if(declaration.value>=0){const existing=catalog.definitions.find(row=>row.value===declaration.value);if(existing)throw Error('Compatibility source StateDef '+declaration.value+' conflicts with '+existing.filename+':'+(existing.line+1));}}
 assertLegacyOrdering(catalog,defText,declarations.filter(row=>row.value<0).map(row=>row.value));
 const collect=require('./analyzer').collectRecords,known=new Map();for(const entry of catalog.entries||[])for(const record of collect(entry.text||'',entry.filename).functions||[])known.set(record.name.toLowerCase(),entry.filename+':'+(record.line+1));
 const seen=new Set();for(const record of collect(text,filename).functions||[]){const key=record.name.toLowerCase();if(seen.has(key)||known.has(key))throw Error('Compatibility function '+record.name+' is already declared: '+(known.get(key)||filename));seen.add(key);}
}
function catalogContentKey(catalog){
 const dependencies=[...(catalog.authority?.dependencies||[]),...(catalog.authority?.functionCatalog?.authority?.dependencies||[]),catalog.authority?.functionCatalog?.authority?.owner].filter(Boolean);
 return JSON.stringify({complete:catalog.complete,owner:physical.canonicalPath(catalog.owner),dependencies:dependencies.map(row=>[physical.canonicalPath(row.filename),row.hash,row.exists===false]).sort(),entries:(catalog.entries||[]).map(row=>[physical.canonicalPath(row.filename),row.grammar]),definitions:(catalog.definitions||[]).map(row=>[physical.canonicalPath(row.filename),row.value,row.line]),ordered:(catalog.authority?.compileAssignments||[]).map(row=>[physical.canonicalPath(row.filename),row.role])});
}
async function runParticipantAdapterAuthoring(item,env,options={}){
 const api=env.api,assert=options.assertCurrent||env.assert,build=options.buildCatalog||states.buildStateTransferCatalog,current=options.catalogCurrent||states.stateCatalogStillCurrent;
 assert();if(api.workspace.fs?.isWritableFileSystem?.('file')===false)throw Error('The participant source filesystem is read-only. No source changed.');if(item.requiresSelection)throw Error('Reselect this exact outside-project DEF before authoring its adapter.');
 const defFilename=item.defFilename,document=await api.workspace.openTextDocument(api.Uri.file(defFilename));assert();
 if(document.isDirty)throw Error('Save this participant DEF first so its runtime source assignments can be proven. Your unsaved edits were retained.');
 const defSnapshot=snapshots.ownerSnapshot(api,defFilename),catalog=await loadRuntimeStateCatalog(api,defFilename,{assertCurrent:assert,interactive:true,buildCatalog:build,verifyEngineDefaults:options.verifyAppendSemantics});assert();
 const resolution=catalogResolution(catalog),overrides=resolution.overrides;if(resolution.cancelled)return{cancelled:true,inspectedEngine:resolution.inspectedEngine};
 if(!catalog?.complete){
  let failure;try{assertNoGlobal(catalog);}catch(error){failure=error;}
  if(api.window.showWarningMessage){const answer=await api.window.showWarningMessage(failure.message+' Additive hook intake currently supports only exact reviewed official artifacts. Inspect the current project engine target and its exact configuration before retrying.',{modal:true},'Inspect Engine Binding');assert();if(answer==='Inspect Engine Binding'){await api.commands.executeCommand('ikemen.engineRegistry.open',api.Uri.file(defFilename));return{cancelled:true,inspectedEngine:true};}}
  throw failure;
 }
 const proof=catalogProof(api,catalog),check=()=>{assert();snapshots.assertSnapshot(api,defFilename,defSnapshot);proof();};check();
 let appendAuthority;try{appendAuthority=(options.verifyAppendSemantics||require('./stage_negative_global_authority').negativeGlobalAuthority)(api,catalog.authority.root,defFilename,catalog);}catch(error){if(api.window.showWarningMessage){const answer=await api.window.showWarningMessage(error.message,{modal:true},'Inspect Engine Binding');check();if(answer==='Inspect Engine Binding'){await api.commands.executeCommand('ikemen.engineRegistry.open',api.Uri.file(defFilename));return{cancelled:true,inspectedEngine:true};}}throw error;}
 assertNoGlobal(catalog,undefined,appendAuthority);
 assertLegacyOrdering(catalog,defSnapshot.text);
 const globals=(catalog.entries||[]).filter(entry=>(catalog.definitions||[]).some(row=>row.value===-4&&physical.samePhysical(row.filename,entry.filename))),review=options.review||require('./stage_source_review').reviewStageSources;
 const choice=await api.window.showQuickPick([{id:'create',label:'Create compatibility hook',description:'New ZSS -4 source; preserve CNS and add one DEF assignment'},{id:'link',label:'Link existing compatibility hook',description:'Select an unassigned ZSS source beside this DEF'},...(globals.length?[{id:'inspect',label:'Inspect retained global hooks…',description:globals.length+' unchanged character/Common.States source files'}]:[])],{title:'Participant compatibility source — exact nightly '+appendAuthority.commit.slice(0,7)});check();if(!choice)return{cancelled:true};
 if(choice.id==='inspect'){const selected=await api.window.showQuickPick(globals.map(entry=>({label:path.basename(entry.filename),description:entry.filename,entry})),{title:'Inspect unchanged global hook source'});check();if(selected)await review(api,{rows:[{filename:selected.entry.filename,before:selected.entry.text,after:selected.entry.text}],title:'Inspect unchanged existing global hook',summary:'Read-only source inspection. No adapter source or DEF change is applied.',approveLabel:'Return to Stage',assertCurrent:check,returnToStage:env.returnToStage,onDispose:env.onReviewDispose,beginReadonlyReview:env.beginReadonlyReview});return{cancelled:true,inspectedSources:Boolean(selected)};}
 let filename,text,create=choice.id==='create',targetSnapshot;
 if(create){const uri=await api.window.showSaveDialog({title:'New participant compatibility ZSS',defaultUri:api.Uri.file(path.join(path.dirname(defFilename),path.basename(defFilename,'.def')+'_adapter.zss')),filters:{'ZSS source':['zss']}});check();if(!uri)return{cancelled:true};filename=uri.fsPath;text=EMPTY_ADAPTER;}
 else{const picked=await api.window.showOpenDialog({title:'Link exact unassigned compatibility ZSS',canSelectMany:false,filters:{'ZSS source':['zss']}});check();if(!picked?.length)return{cancelled:true};filename=picked[0].fsPath;
  await api.workspace.openTextDocument(api.Uri.file(filename));check();targetSnapshot=snapshots.ownerSnapshot(api,filename);text=targetSnapshot.text;
  assertExistingHook(catalog,defSnapshot.text,filename,text);
  // A second runtime assignment would compile a hook twice. An existing direct
  // source is already available in the card and must be used there instead.
  if(catalog.entries.some(row=>physical.samePhysical(row.filename,filename)))throw Error('This source already participates in the runtime catalog. Use its existing source choice; no duplicate assignment was added.');
  const service=require('./map_registry_service').current(),functions=require('./zss_function_catalog');
  const ownership=await (options.resolveOwner||functions.exactFunctionOwner)(api,filename,service?.scope(api.Uri.file(defFilename)),functions.DEFAULT_LIMITS);check();
  if(ownership.reason!=='No character DEF assigns this code file.'||ownership.candidates?.length)throw Error('Existing adapter ownership is ambiguous or already assigned: '+(ownership.reason||ownership.owner||filename));
  assertNoGlobal(catalog,filename,appendAuthority);
 }
 const plan=planAdapter(defFilename,defSnapshot.text,filename,text,create);if(targetSnapshot){plan.targetSnapshot=targetSnapshot;plan.targetDef=filename;}
 snapshots.assertDestinations(api,plan);check();
 if(!await review(api,{rows:plan.rows,title:'Create/link this participant compatibility source?',summary:'Supported exact official nightly: '+appendAuthority.commit.slice(0,7)+'. Preserve existing CNS and authored state sources. Add '+plan.link.key+' to this exact DEF'+(create?' and create one additive ZSS -4 hook.':'; the existing ZSS source is unchanged.')+'\nExisting character and Common.States hooks remain intact and run alongside this hook. '+globals.length+' unchanged global source files (optional Inspect retained global hooks before intake):\n'+globals.map(entry=>path.basename(entry.filename)).join(', ')+'\nSave the participant DEF'+(create?' and new hook':' plus any unsaved hook edits')+' before game playback. One native Undo reverts this edit.',approveLabel:'Apply Adapter Source',assertCurrent:check,returnToStage:env.returnToStage,onDispose:env.onReviewDispose,beginReadonlyReview:env.beginReadonlyReview}))return{cancelled:true};
 check();if(!await current(api,catalog)){
  // VS Code may close/reopen a clean hidden model during a long readonly
  // review. Rebuild complete authority, accepting only identical physical
  // dependencies/content/order; proof() still rejects dirty/replaced sources.
  const freshCatalog=await build(api,api.Uri.file(defFilename),undefined,overrides);check();if(!freshCatalog.complete||catalogContentKey(freshCatalog)!==catalogContentKey(catalog))throw Error('Runtime character/common source authority changed during review. Nothing was applied.');
 }check();(options.verifyAppendSemantics||require('./stage_negative_global_authority').negativeGlobalAuthority)(api,catalog.authority.root,defFilename,catalog);
 if(!create){const service=require('./map_registry_service').current(),functions=require('./zss_function_catalog'),ownership=await(options.resolveOwner||functions.exactFunctionOwner)(api,filename,service?.scope(api.Uri.file(defFilename)),functions.DEFAULT_LIMITS);if(ownership.reason!=='No character DEF assigns this code file.'||ownership.candidates?.length)throw Error('Adapter ownership changed during review. Nothing was applied.');check();}
 const fresh=await api.workspace.openTextDocument(api.Uri.file(defFilename));check();
 const result=await(options.commit||snapshots.commitAttachedPlan)(api,fresh,plan,{assertCurrent:check,ownerLabel:'Participant DEF',operationLabel:'Participant compatibility source'});return{...result,defFilename,filename,filenames:[defFilename,...plan.files.keys()],nativeUndo:true};
}
module.exports={EMPTY_ADAPTER,planAdapter,assertNoGlobal,assertLegacyOrdering,assertExistingHook,catalogProof,catalogContentKey,certifiedDefaults,runParticipantAdapterAuthoring};
