'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const {hash}=require('./mutation_safety');
const { registerCharacterToolPanel, getContextModel } = require('./authoring_context_registry');
const { launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, universalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { ExactSourceRegistry, unavailable } = require('./exact_source_routes');
const { readSff } = require('./sff_reader');
const { characterPaletteAssignment, spritePreviewPair, directActionImages } = require('./move_palette_preview');
const { parseConstants, moveGroups, fieldsFor, actionTimeline, timingEvidence, directStateTiming, reactionSummary, updateConstant, resolveMoveTargets, copyMoveFields, hitPauseTicks, airTimingProposal } = require('./move_constants_model');
const { chooseCharacterDef } = require('./character_picker');
const { moveEditorColumn } = require('./move_editor_column');
const { trackViewerPanel } = require('./viewer_group');
const { fieldExplanation, timingProblems, connectedCode, diagnosticProblems } = require('./attack_workspace_model');
const { attackLibrary, validAttackReference } = require('./move_lab_model');
const { componentReference, validComponentReference, directComponentModel } = require('./move_lab_component_model');
const { planHelperMapInitializer } = require('./helper_map_binding');
const { resolveHelperHandoff } = require('./helper_handoff');
const { resolveExplodHandoff } = require('./explod_handoff');
const { projectProjectileProperties } = require('./projectile_property_projection');
const { buildProjectileAirAuthorities, validateProjectileAirAuthority, MAX_DEF_BYTES:MAX_PROJECTILE_DEF_BYTES, MAX_SOURCE_BYTES:MAX_PROJECTILE_SOURCE_BYTES, MAX_AIR_BYTES:MAX_PROJECTILE_AIR_BYTES } = require('./projectile_air_authority');
const { buildProjectileResourceAuthorities, validateProjectileResourceAuthority, MAX_SND_BYTES:MAX_PROJECTILE_SND_BYTES } = require('./projectile_resource_authority');
const { buildProjectileStateAuthorities, validateProjectileStateAuthority } = require('./projectile_state_authority');
const { buildHelperStateAuthority, validateHelperStateAuthority } = require('./helper_state_authority');
const { buildStateTransitionAuthorities, validateStateTransitionAuthority } = require('./state_transition_authority');
const { MAX_ASSIGNED_FILES:MAX_STATE_FILES, buildStateDestinationSnapshot } = require('./exact_state_destination_authority');
const { buildFunctionCallSnapshot, buildFunctionCallAuthorities, validateFunctionCallAuthority } = require('./function_call_authority');
const { MAX_COMMAND_BYTES, boundedText, buildCommandFamilySnapshot, buildCommandUsageAuthorities, validateCommandUsageAuthority } = require('./command_usage_authority');
const { buildProjectSymbolSnapshot, buildProjectSymbolAuthorities, validateProjectSymbolAuthority } = require('./project_symbol_handoff_authority');
const { buildStateAnimationAuthority, validateStateAnimationAuthority, targetOrigin: stateAnimationTargetOrigin } = require('./state_animation_authority');
const { buildChangeAnimationSnapshot, buildStateChangeAnimationAuthorities, validateStateChangeAnimationAuthority, targetOrigin: stateChangeAnimationTargetOrigin } = require('./state_change_animation_authority');
const { buildPlaySoundSnapshot, buildStatePlaySoundAuthorities, validateStatePlaySoundAuthority, targetOrigin: statePlaySoundTargetOrigin } = require('./state_play_sound_authority');
const { TARGETS: PROJECTILE_EDIT_TARGETS, createProjectileEditDraft, previewProjectileEdit } = require('./projectile_edit_draft');
const { groupIdForTarget, projectAuthoredGroups } = require('./projectile_edit_groups');
const { exactStateSources } = require('./exact_state_sources');

const moveLabThrowHandoff=require('./move_lab_throw_handoff');
let session = null;
let capabilityResolver = () => ({});
let formDrafts=new (require('./form_drafts').FormDrafts)();
let codeFormDrafts=new (require('./form_drafts').FormDrafts)();
const draftKey=(def,id)=>'move-constants:'+def.toLowerCase()+'#'+id;
const codeDraftKey=(def,id)=>'move-code:'+def.toLowerCase()+'#'+id;
const componentPool=model=>[...(model?.directComponents||[]),...(model?.behaviorComponents||[]),...(model?.specialistComponents||[])];
const assignedMapEntries=model=>model?.projectKnowledge?.resolved!==false&&!(model?.projectKnowledge?.failures||[]).length?(model.projectKnowledge.entries||[]).filter(entry=>entry.category==='maps'&&entry.assigned===true):[];
const mapEntryIdentity=entry=>hash(JSON.stringify({id:entry?.id||'',name:entry?.name||'',status:entry?.status||'',assigned:Boolean(entry?.assigned),sites:entry?.sites||[],reads:Number(entry?.reads)||0,writes:Number(entry?.writes)||0}));
const currentTextSync=filename=>{const wanted=identity(filename),document=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&identity(item.fileName)===wanted);return document?document.getText():fs.readFileSync(filename,'utf8');};
function boundedProjectileStateSource(filename,services={}){const openDocuments=services.openDocuments||vscode.workspace.textDocuments||[],exists=services.existsSync||fs.existsSync,stat=services.statSync||fs.statSync,read=services.readFileSync||fs.readFileSync,document=openDocuments.find(item=>!item.isClosed&&identity(item.fileName)===identity(filename));if(document){const text=document.getText();return{filename:path.resolve(filename),text,available:Buffer.byteLength(text,'utf8')<=MAX_PROJECTILE_SOURCE_BYTES};}if(!filename||!exists(filename)||stat(filename).size>MAX_PROJECTILE_SOURCE_BYTES)return{filename:path.resolve(filename||'.'),text:'',available:false};const text=read(filename,'utf8');return{filename:path.resolve(filename),text,available:Buffer.byteLength(text,'utf8')<=MAX_PROJECTILE_SOURCE_BYTES};}
function projectileAuthoritySnapshot(owner,generation,services={}){
 const openDocuments=services.openDocuments||vscode.workspace.textDocuments||[],exists=services.existsSync||fs.existsSync,stat=services.statSync||fs.statSync,read=services.readFileSync||fs.readFileSync,defPath=path.resolve(owner.assets.defPath),defDocument=openDocuments.find(item=>!item.isClosed&&identity(item.fileName)===identity(defPath));let defText='',airText='',airPath='',sndPath='',sndBuffer=null,commandPath='',commandText='',commandHash='',commandVersion=null,commandAvailable=false,commandSnapshot=null,assignedSources=[],sources=[],inventoryComplete=false,stateSnapshot=null,functionSnapshot=null,changeAnimationSnapshot=null,playSoundSnapshot=null;
 const empty=()=>({defPath,defText,defDirty:Boolean(defDocument?.isDirty),airText,airPath,sndPath,sndBuffer,commandPath,commandText,commandHash,commandVersion,commandAvailable,commandSnapshot,assignedSources,sources,inventoryComplete,stateSnapshot,functionSnapshot,changeAnimationSnapshot,playSoundSnapshot,generation});
 try{if(defDocument)defText=defDocument.getText();else{if(!exists(defPath)||stat(defPath).size>MAX_PROJECTILE_DEF_BYTES)return empty();defText=read(defPath,'utf8');}if(Buffer.byteLength(defText,'utf8')>MAX_PROJECTILE_DEF_BYTES)return empty();assignedSources=exactStateSources(defPath,defText,{existsSync:exists});if(assignedSources.length<=MAX_STATE_FILES){sources=assignedSources.map(filename=>({...boundedProjectileStateSource(filename,{...services,openDocuments}),syntax:path.extname(filename).toLowerCase()==='.zss'?'zss':'cns'}));inventoryComplete=true;const snapshotContext={assignedSources,sources,inventoryComplete};stateSnapshot=(services.buildStateSnapshot||buildStateDestinationSnapshot)(snapshotContext);functionSnapshot=(services.buildFunctionSnapshot||buildFunctionCallSnapshot)(snapshotContext);changeAnimationSnapshot=(services.buildChangeAnimationSnapshot||buildChangeAnimationSnapshot)(snapshotContext);}const assigned=require('./related_work').resolveAssigned(defPath,defText);airPath=assigned.air||'';sndPath=assigned.snd||'';commandPath=assigned.commands||'';if(commandPath){const command=boundedText(commandPath,MAX_COMMAND_BYTES,{openDocuments,existsSync:exists,statSync:stat,readFileSync:read});if(command.available){commandText=command.text;commandHash=hash(command.text);commandVersion=command.version;commandAvailable=true;commandSnapshot=(services.buildCommandSnapshot||buildCommandFamilySnapshot)({commandPath,commandText,commandHash,commandVersion,commandAvailable});}}if(airPath){const airDocument=openDocuments.find(item=>!item.isClosed&&identity(item.fileName)===identity(airPath));if(airDocument)airText=airDocument.getText();else if(exists(airPath)&&stat(airPath).size<=MAX_PROJECTILE_AIR_BYTES){airText=read(airPath,'utf8');if(Buffer.byteLength(airText,'utf8')>MAX_PROJECTILE_AIR_BYTES)airText='';}}if(sndPath&&exists(sndPath)&&stat(sndPath).size<=MAX_PROJECTILE_SND_BYTES){sndBuffer=read(sndPath);if(!Buffer.isBuffer(sndBuffer)||sndBuffer.length>MAX_PROJECTILE_SND_BYTES)sndBuffer=null;}if(sndBuffer)playSoundSnapshot=(services.buildPlaySoundSnapshot||buildPlaySoundSnapshot)({assignedSources,sources,inventoryComplete,sndPath,sndBuffer});return empty();}catch(_){return empty();}
}
function projectileAuthorityContext(owner,component,generation,token,snapshot){const shared=snapshot||projectileAuthoritySnapshot(owner,generation),sourceDocument=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&identity(item.fileName)===identity(component.filename)),source=shared.sources?.find(item=>identity(item.filename)===identity(component.filename)),sourceText=source?.available?source.text:sourceDocument?.getText()||'';return{...shared,sourceText,sourceDocument,token};}
const compactOverviewComponent=item=>({id:item.id,kind:item.kind,label:item.label,detail:item.detail||'',fileLabel:item.fileLabel,line:item.line,shared:item.shared===true,signature:item.signature,stateNumber:item.stateNumber??null,reference:item.reference});
function decorateProjectileModel(owner,model,{renew=true}={}){
 if(renew){owner.projectileGeneration=(owner.projectileGeneration||0)+1;owner.projectileEditAuthorities=new Map();}
 owner.projectileRoutes=new Map();owner.projectileConsumedRoutes=new Set();const generation=owner.projectileGeneration||0,routes=owner.projectileRoutes,authoritySnapshot=[...(model.specialistComponents||[]),...(model.behaviorComponents||[])].some(component=>['helper','projectile','state','function'].includes(component.kind))?projectileAuthoritySnapshot(owner,generation):null;if(authoritySnapshot)authoritySnapshot.previewCache={airActions:null,helperInspections:new WeakMap(),helperParses:new WeakMap(),stateParses:new WeakMap(),stateNodes:new WeakMap(),specialists:model.specialistComponents||[]};let authorityCapabilities={};try{authorityCapabilities=typeof capabilityResolver==='function'?capabilityResolver({fsPath:owner?.assets?.defPath})||{}:{};}catch(_){}const projectSymbolSnapshot=buildProjectSymbolSnapshot(model.projectKnowledge,{capabilities:authorityCapabilities});
 model.helperCreationTargets=require('./state_controller_creation').helperTargetCatalog(authoritySnapshot?.defDirty?null:authoritySnapshot?.stateSnapshot);
 model.specialistComponents=(model.specialistComponents||[]).map(component=>{
  if(component.kind==='helper'){const context=projectileAuthorityContext(owner,component,generation,()=>require('crypto').randomBytes(24).toString('hex'),authoritySnapshot),built=buildHelperStateAuthority(component,context);for(const [route,authority]of built.authorities)routes.set(route,{kind:'helper-state',authority,reference:component.reference});const target=[...built.authorities.values()][0],destination=target&&require('./move_lab_helper_navigation').startingState(target,model.behaviorComponents||[],owner.assets.defPath);return{...component,helperState:{...built.publicState,targetReference:destination?.reference||null}};}
  if(component.kind!=='projectile')return component;const capabilities=authorityCapabilities,context=projectileAuthorityContext(owner,component,generation,()=>require('crypto').randomBytes(24).toString('hex'),authoritySnapshot),sourceText=context.sourceText||'',projection=projectProjectileProperties(component,sourceText,{capabilities}),airBuilt=buildProjectileAirAuthorities(component,projection,context),draft=createProjectileEditDraft(component,sourceText),resourceBuilt=buildProjectileResourceAuthorities(component,draft,context),stateBuilt=buildProjectileStateAuthorities(component,draft,context);
  for(const [route,authority]of airBuilt.authorities)routes.set(route,{kind:'air',authority,reference:component.reference});for(const [route,authority]of resourceBuilt.authorities)routes.set(route,{kind:'resource',authority,reference:component.reference});for(const [route,authority]of stateBuilt.authorities)routes.set(route,{kind:'state',authority,reference:component.reference});
  const fields=projection.fields.map(field=>({...field,air:airBuilt.publicFields[field.name]||null})),groups=projection.groups.map(group=>({...group,fields:group.fields.map(field=>fields.find(candidate=>candidate.name===field.name))})),projectionByName=new Map([...fields,...(projection.contact?.fields||[])].map(field=>[field.name,field])),saved=draft&&owner.projectileEditPreviews?.get(component.stableId),kept=saved?.draftId===draft?.draftId?saved:null;if(saved&&!kept)owner.projectileEditPreviews.delete(component.stableId);
  const edit=draft?(()=>{const editFields=draft.fields.map(item=>({target:item.target,editable:item.editable,status:item.status,authoredName:item.authoredName||'',expression:item.expression||'',reason:item.reason||'',resource:resourceBuilt.publicFields[item.target]||null,state:stateBuilt.publicFields[item.target]||null,contactGroup:groupIdForTarget(item.target),origin:projectionByName.get(item.target)?.origin||'',compatibilityLabel:projectionByName.get(item.target)?.compatibilityLabel||''}));return{draftId:draft.draftId,fields:editFields,groups:projectAuthoredGroups(editFields,kept?.preview),preview:kept?{previewId:kept.preview.previewId,before:kept.preview.before,after:kept.preview.after,replacements:kept.preview.replacements.map(item=>({target:item.target,authoredName:item.authoredName,before:item.before,after:item.after})),applyToken:owner.projectileEditAuthorities?.has(kept.token)?kept.token:''}:null};})():null;return{...component,projectileProjection:{...projection,fields,groups},projectileEdit:edit};
 });
 const animationIndex=authoritySnapshot?.airText?require('./state_animation_authority').indexAnimationActions(authoritySnapshot.airText):null;
 model.behaviorComponents=(model.behaviorComponents||[]).map(component=>{
  const context={...projectileAuthorityContext(owner,component,generation,()=>require('crypto').randomBytes(24).toString('hex'),authoritySnapshot),capabilities:authorityCapabilities};if(!['state','function'].includes(component.kind))return component;const commandBuilt=buildCommandUsageAuthorities(component,context);for(const [route,authority]of commandBuilt.authorities)routes.set(route,{kind:'command-usage',authority,reference:component.reference});const symbolBuilt=buildProjectSymbolAuthorities(component,projectSymbolSnapshot,context);for(const [route,authority]of symbolBuilt.authorities)routes.set(route,{kind:'project-symbol',authority,reference:component.reference});if(component.kind==='function'){const built=buildFunctionCallAuthorities(component,context);for(const [route,authority]of built.authorities)routes.set(route,{kind:'function-call',authority,reference:component.reference});return{...component,functionTransfers:require('./move_transition_conditions').functionStateTransitions(component),functionCalls:built.publicOutgoing,functionCallers:built.publicIncoming,commandUses:commandBuilt.publicUses,projectSymbolLinks:symbolBuilt.publicLinks};}const built=buildStateTransitionAuthorities(component,context),animationBuilt=buildStateAnimationAuthority(component,{...context,animationIndex}),changeAnimationBuilt=buildStateChangeAnimationAuthorities(component,context),playSoundBuilt=buildStatePlaySoundAuthorities(component,context);for(const [route,authority]of built.authorities)routes.set(route,{kind:'state-transition',authority,reference:component.reference});for(const [route,authority]of animationBuilt.authorities)routes.set(route,{kind:'state-animation',authority,reference:component.reference});for(const [route,authority]of changeAnimationBuilt.authorities)routes.set(route,{kind:'state-change-animation',authority,reference:component.reference});for(const [route,authority]of playSoundBuilt.authorities)routes.set(route,{kind:'state-play-sound',authority,reference:component.reference});return{...component,stateTransitions:built.publicTransitions,stateIncoming:built.publicIncoming,stateAnimation:animationBuilt.publicAnimation,stateAnimationChanges:changeAnimationBuilt.publicChanges,statePlayedSounds:playSoundBuilt.publicSounds,commandUses:commandBuilt.publicUses,projectSymbolLinks:symbolBuilt.publicLinks};
 });
 if(model.overview?.behaviors)model.overview.behaviors=model.behaviorComponents.map(compactOverviewComponent);
 if(model.overview?.specialists)model.overview.specialists=model.specialistComponents.map(compactOverviewComponent);return model;
}
function currentProjectileRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='air'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false)return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.specialists},owner.assets.defPath);if(!component||component.kind!=='projectile')return null;let sourceText='';try{sourceText=currentTextSync(component.filename);}catch(_){return null;}const projection=projectProjectileProperties(component,sourceText),context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateProjectileAirAuthority(record.authority,component,projection,context);return authority?{component,projection,context,authority}:null;
}
function currentProjectileResourceRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='resource'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false)return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.specialists},owner.assets.defPath);if(!component||component.kind!=='projectile')return null;let sourceText='';try{sourceText=currentTextSync(component.filename);}catch(_){return null;}const draft=createProjectileEditDraft(component,sourceText),context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateProjectileResourceAuthority(record.authority,component,draft,context);return authority?{component,draft,context,authority}:null;
}
function currentProjectileStateRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='state'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false)return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.specialists},owner.assets.defPath);if(!component||component.kind!=='projectile')return null;const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),draft=createProjectileEditDraft(component,context.sourceText||''),authority=validateProjectileStateAuthority(record.authority,component,draft,context);return authority?{component,draft,context,authority}:null;
}
function currentHelperStateRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='helper-state'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false)return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.specialists},owner.assets.defPath);if(!component||component.kind!=='helper')return null;const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateHelperStateAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentStateTransitionRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='state-transition'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||component.kind!=='state')return null;let capabilities={};try{capabilities=typeof capabilityResolver==='function'?capabilityResolver({fsPath:owner?.assets?.defPath||component.filename})||{}:{};}catch(_){}const context={...projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),capabilities},authority=validateStateTransitionAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentStateAnimationRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='state-animation'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;
 if(codeFormDrafts.read(codeDraftKey(owner.assets.defPath,record.reference?.stableId||record.reference?.id)))return null;
 const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||component.kind!=='state')return null;
 const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateStateAnimationAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentStateChangeAnimationRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='state-change-animation'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;
 if(codeFormDrafts.read(codeDraftKey(owner.assets.defPath,record.reference?.stableId||record.reference?.id)))return null;
 const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||component.kind!=='state')return null;
 const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateStateChangeAnimationAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentStatePlaySoundRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='state-play-sound'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;
 if(codeFormDrafts.read(codeDraftKey(owner.assets.defPath,record.reference?.stableId||record.reference?.id)))return null;
 const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||component.kind!=='state')return null;
 const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateStatePlaySoundAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentFunctionCallRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='function-call'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||component.kind!=='function')return null;const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateFunctionCallAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentCommandUsageRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='command-usage'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||!['state','function'].includes(component.kind))return null;const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),authority=validateCommandUsageAuthority(record.authority,component,context);return authority?{component,context,authority}:null;
}
function currentProjectSymbolRoute(owner,record,{requireActive=false}={}){
 if(!record||record.kind!=='project-symbol'||session!==owner||owner.disposed||requireActive&&owner.panel?.active===false||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return null;
 if(codeFormDrafts.read(codeDraftKey(owner.assets.defPath,record.reference?.stableId||record.reference?.id)))return null;
 const direct=directComponentModel(owner.assets,vscode.workspace.textDocuments||[],sourceDiagnostics([owner.assets.constants,owner.assets.air,...(owner.assets.code||[])])),component=validComponentReference(record.reference,{components:direct.behaviors},owner.assets.defPath);if(!component||!['state','function'].includes(component.kind))return null;
 let capabilities={};try{capabilities=typeof capabilityResolver==='function'?capabilityResolver({fsPath:owner.assets.defPath})||{}:{};}catch(_){}
 const context={...projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>record.authority.route),capabilities},snapshot=buildProjectSymbolSnapshot(direct.projectKnowledge,{capabilities}),authority=validateProjectSymbolAuthority(record.authority,component,snapshot,context);return authority?{component,context,snapshot,authority}:null;
}
function sameJson(left,right){return JSON.stringify(left)===JSON.stringify(right);}
function projectileEditContext(owner,component){
 if(session!==owner||owner.disposed||owner.panel?.active===false)return null;
 const context=owner.contextModel?.snapshot(),selection=selectionEnvelope(owner);
 if(!context||context.disposed||context.activeSurfaceId!=='move.constants'||selection?.kind!=='direct'||!sameJson(selection.componentReference,component.reference)||!sameJson(context.selection,selection))return null;
 return{identity:context.identity,revision:context.revision,selectionRevision:context.selectionRevision,activeSurfaceId:context.activeSurfaceId,selection};
}
function exactAssignedProjectileSource(owner,component){
 const defPath=path.resolve(owner.assets.defPath),defDocument=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&identity(item.fileName)===identity(defPath));
 if(defDocument?.isDirty)return null;
 if(!defDocument&&(!fs.existsSync(defPath)||fs.statSync(defPath).size>MAX_PROJECTILE_DEF_BYTES))return null;
 const defText=defDocument?defDocument.getText():fs.readFileSync(defPath,'utf8');if(Buffer.byteLength(defText,'utf8')>MAX_PROJECTILE_DEF_BYTES)return null;
 const assigned=exactStateSources(defPath,defText);if(!assigned.some(item=>identity(item)===identity(component.filename)))return null;
 return{defPath,defHash:hash(defText),assignedSources:assigned.map(identity).sort()};
}
async function currentProjectileEdit(owner,reference,{requireActive=true}={}){
 if(session!==owner||owner.disposed||requireActive&&owner.panel?.active===false)return null;
 const model=await shellModelFor(owner.assets);if(session!==owner||owner.disposed)return null;
 const component=validComponentReference(reference,{components:model.specialistComponents||[]},owner.assets.defPath);if(!component||component.kind!=='projectile')return null;
 const assigned=exactAssignedProjectileSource(owner,component),context=projectileEditContext(owner,component);if(!assigned||!context)return null;
 const open=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&identity(item.fileName)===identity(component.filename));if(!open&&(!fs.existsSync(component.filename)||fs.statSync(component.filename).size>MAX_PROJECTILE_SOURCE_BYTES))return null;
 const sourceText=open?open.getText():fs.readFileSync(component.filename,'utf8');if(Buffer.byteLength(sourceText,'utf8')>MAX_PROJECTILE_SOURCE_BYTES)return null;
 const draft=createProjectileEditDraft(component,sourceText);if(!draft)return null;
 return{model,component,sourceText,draft,assigned,context,sourceVersion:open?.version??null};
}
function sameProjectileEditAuthority(record,current,preview){
 return Boolean(record&&current&&preview&&record.generation===current.ownerGeneration&&record.draftId===current.draft.draftId&&record.previewId===preview.previewId&&record.defPath===current.assigned.defPath&&record.defHash===current.assigned.defHash&&sameJson(record.assignedSources,current.assigned.assignedSources)&&record.contextIdentity===current.context.identity&&record.contextRevision===current.context.revision&&record.selectionRevision===current.context.selectionRevision&&record.activeSurfaceId===current.context.activeSurfaceId&&sameJson(record.selection,current.context.selection)&&record.sourceHash===current.draft.sourceHash&&record.controllerHash===current.draft.controllerHash&&record.expectedSourceHash===preview.expectedSourceHash);
}
function initialDisplaySelection(model) {
  const requested=model?.openReference;
  if(requested?.componentReference)return {kind:'direct',componentReference:requested.componentReference};
  const move=requested?.profileId?model?.moves?.find(item=>item.id===requested.profileId&&item.prefix===requested.prefix):model?.moves?.[0];
  if(move)return {kind:'constants',id:move.id,prefix:move.prefix,frameIndex:Number.isInteger(requested?.frameIndex)?requested.frameIndex:0};
  const direct=componentPool(model)[0];return direct?{kind:'direct',componentReference:direct.reference}:null;
}
function existingCharacterFiles(assets, exists = fs.existsSync) {
  const result=[],seen=new Set(),add=value=>{if(Array.isArray(value)){value.forEach(add);return;}if(!value||typeof value!=='string'||!path.isAbsolute(value))return;const file=path.resolve(value),key=file.toLowerCase();if(seen.has(key)||!exists(file))return;seen.add(key);result.push(file);};
  add(assets?.defPath);add(assets?.constants);add(assets?.air);add(assets?.sff);add(assets?.snd);add(assets?.code);add(assets?.sounds);add(assets?.resources);return result;
}
function moveToolbarModel(owner = {}) {
  const selection=owner.displaySelection||initialDisplaySelection(owner.model),available=Boolean(selection&&(selection.kind==='constants'||selection.kind==='direct'));
  const capabilities=Object.fromEntries(SLOTS.map(slot=>[slot.id,{enabled:false,reason:`${slot.label} is unavailable without a validated Move Lab character context.`}]));
  const enable=(id,dispatch)=>capabilities[id]={enabled:true,dispatch};
  for(const id of ['new','close','open','connected-resources','backup','recovery','run','versus','training','project','stage','sprites','animations','commands','states','sounds','palettes','code-structure','viewer-browser','actions-search','suite-switch','help','settings'])enable(id,'internal:'+id);
  capabilities.save={enabled:false,reason:'Move Lab applies reviewed changes to one or more native documents; save those documents in their text editors.'};
  if(available)capabilities['text-source']={enabled:true,dispatch:'internal:text-source',capabilityId:'implemented.move-constants-source',resolverId:'move-constants.exact-source',routeKind:'selected-block'};
  else capabilities['text-source']={enabled:false,reason:'Select an exact constants profile or direct code component first.'};
  capabilities['connected-resources']={...capabilities['connected-resources'],routeKind:'connected-resources'};
  return adapt('move.constants',capabilities,{resolverIds:['move-constants.exact-source']});
}
function clean(value) { return String(value || '').replace(/\s*;.*/, '').trim().replace(/^['"]|['"]$/g, ''); }
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
const identity = filename => path.resolve(filename || '').toLowerCase();
function constantsReference(move, assets, model, extra = {}) {
  return move ? { defPath: assets.defPath, profileId: move.id, prefix: move.prefix, sourceFilename: assets.constants, sourceHash: model.timingSources?.constants, actionNumber: move.timeline?.actionNumber, ...extra } : null;
}
function validConstantsReference(reference, assets, model) {
  if (!reference || identity(reference.defPath) !== identity(assets.defPath) || identity(reference.sourceFilename) !== identity(assets.constants) || reference.sourceHash !== model.timingSources?.constants) return null;
  const move = model.moves.find(item => item.id === reference.profileId);
  if (!move || move.prefix !== reference.prefix) return null;
  if (reference.actionNumber !== undefined && reference.actionNumber !== move.timeline?.actionNumber) return null;
  if (reference.frameIndex !== undefined && (!Number.isInteger(reference.frameIndex) || reference.frameIndex < 0 || reference.frameIndex >= (move.timeline?.frames?.length || 0))) return null;
  return move;
}
function validOverviewProblem(reference, model) {
  if (!reference || typeof reference.id !== 'string') return null;
  const problem = model?.overview?.problems?.find(item => item.id === reference.id);
  if (!problem) return null;
  const member = (problem.members || []).find(item => item.key === reference.memberKey);
  if (!member) return null;
  const sameFile = identity(member.filename) === identity(reference.filename);
  return sameFile && member.line === reference.line && member.sourceHash === reference.sourceHash && member.sourceId === reference.sourceId ? { problem, member } : null;
}

function overviewFor(assets, moves, diagnostics, openDocuments, sourceHashes) {
  const discovered = attackLibrary(assets, openDocuments), problems = [], byKey = new Map();
  const add = (problem, sourceId = '', moveLabel = '') => {
    const filename = problem.field ? assets.constants : problem.filename || (problem.source === 'AIR timing' ? assets.air : '');
    const line = Number.isInteger(problem.line) ? problem.line : null, title = problem.title || problem.message || 'Review';
    const actionNumber = moves.find(move => move.id === sourceId)?.timeline?.actionNumber ?? null;
    const specificity = [problem.source || '', problem.diagnosticCode || '', problem.endLine ?? '', problem.endCharacter ?? '', problem.field || '', problem.source === 'AIR timing' ? actionNumber ?? '' : '', problem.frameIndex ?? ''].join(':');
    const key = filename ? `source:${identity(filename)}:${line}:${title}:${specificity}` : `move:${title}:${specificity}`;
    const sourceHash = filename ? (sourceHashes.get(identity(filename)) || '') : '';
    const target = problem.field ? 'field' : Number.isInteger(problem.frameIndex) && problem.source === 'AIR timing' ? 'air-frame' : problem.sectionId ? 'section' : filename ? 'source' : 'none';
    const member = { key: `member-${hash(JSON.stringify([key, sourceId, problem.id || '', problem.sectionId || '', target, filename, line, sourceHash]))}`, sourceId, moveLabel, problemId: problem.id || '', filename, line, sourceHash, target, field: problem.field || '', frameIndex: Number.isInteger(problem.frameIndex) ? problem.frameIndex : null, sectionId: problem.sectionId || '', actionNumber };
    const existing = byKey.get(key);
    if (existing) { if (!existing.members.some(item => item.key === member.key)) existing.members.push(member); return; }
    const id = `overview-${hash(JSON.stringify([key, sourceHash]))}`, item = { ...problem, id, members: [member] };
    problems.push(item); byKey.set(key, item);
  };
  for (const move of moves) for (const problem of move.problems || []) add(problem, move.id, move.prefix);
  for (const diagnostic of diagnostics) add({
    source: diagnostic.source || 'IKEMEN lint', level: diagnostic.severity === 0 ? 'error' : diagnostic.severity === 1 ? 'warning' : 'info',
    title: diagnostic.message || 'Source diagnostic', detail: `${path.basename(diagnostic.filename || 'source')}:${Number(diagnostic.line || 0) + 1}`,
    filename: diagnostic.filename, line: diagnostic.line, endLine: diagnostic.endLine, endCharacter: diagnostic.endCharacter, diagnosticCode: diagnostic.diagnosticCode || diagnostic.code || ''
  });
  return {
    controllers: discovered.controllers,
    constantProfiles: discovered.constantProfiles.map(profile => ({ ...profile, defPath: assets.defPath, supported: moves.some(move => move.id === profile.id) })),
    problems
  };
}

function characterAssets(defPath) {
  const text = fs.readFileSync(defPath, 'utf8'), folder = path.dirname(defPath), find = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'im').exec(text);
  const resolve = (match) => match ? path.resolve(folder, clean(match[1]).replace(/[\\/]/g, path.sep)) : '';
  const constants = resolve(find('cns')), air = resolve(find('anim')), sff = resolve(find('sprite'));
  if (!constants || !air || !sff || ![constants, air, sff].every(fs.existsSync)) throw new Error('The character DEF must resolve an existing cns, anim, and sprite file.');
  const assigned = require('./related_work').resolveAssigned(defPath);
  return { ...assigned, defPath, folder, constants, air, sff, code: assigned.code || [] };
}
function characterShellAssets(defPath) {
  const assigned=require('./related_work').resolveAssigned(defPath),folder=path.dirname(defPath);
  return {...assigned,defPath,folder,constants:assigned.constants||'',air:assigned.air||'',sff:assigned.sff||'',code:assigned.code||[]};
}

async function chooseDef(uri) {
  return chooseCharacterDef(uri, { title: 'Move Lab — Constants Character' });
}

async function currentText(filename) {
  const open = vscode.workspace.textDocuments.find((document) => path.resolve(document.fileName).toLowerCase() === path.resolve(filename).toLowerCase());
  return open ? open.getText() : fs.readFileSync(filename, 'utf8');
}

function sourceDiagnostics(files) {
  const wanted=new Set((files||[]).filter(Boolean).map(identity)),diagnostics=[];
  for(const [uri,items]of(vscode.languages?.getDiagnostics?.()||[])){
    if(!uri?.fsPath||!wanted.has(identity(uri.fsPath)))continue;
    for(const item of items)diagnostics.push({filename:uri.fsPath,line:item.range.start.line,character:item.range.start.character,endLine:item.range.end.line,endCharacter:item.range.end.character,diagnosticCode:String(item.code??''),severity:item.severity,message:item.message,source:item.source||'IKEMEN'});
  }
  return diagnostics;
}

function compactAirCatalog(text) {
  const lines = String(text || '').split(/\r?\n/), actions = require('./air_preview_model').parseAir(text);
  return actions.map((action, index) => { const held = action.frames.findIndex(frame => frame.rawTime === -1), prefix = held < 0 ? action.frames : action.frames.slice(0, held), ticks = prefix.reduce((sum, frame) => sum + Math.max(1, Number(frame.time) || 1), 0); return ({
    number: action.number,
    line: action.line,
    frames: action.frames.length,
    ticks: held < 0 ? ticks : null,
    finitePrefixTicks: ticks,
    holdElement: held < 0 ? null : held + 1,
    loopStart: action.loopStart,
    hasLoopStart: lines.slice(action.line, (actions[index + 1]?.line || (lines.length + 1)) - 1).some((line) => /^\s*LoopStart\s*(?:;.*)?$/i.test(line)),
    clsn1Frames: action.frames.filter((frame) => (frame.clsn1 || []).length).length,
    clsn2Frames: action.frames.filter((frame) => (frame.clsn2 || []).length).length,
    clsn1Boxes: action.frames.reduce((sum, frame) => sum + (frame.clsn1 || []).length, 0),
    clsn2Boxes: action.frames.reduce((sum, frame) => sum + (frame.clsn2 || []).length, 0)
  }); });
}

function contactProfile(assignments, move) {
  const strength = ['', 'light', 'medium', 'heavy'][Number(move.values.attackStrength)] || '';
  if (!strength) return [];
  const prefix = `JNP_SF6_cfg_normal_${strength}_`, wanted = [
    ['guard_damage', 'Chip damage'], ['hit_pause_p1', 'Hit pause P1'], ['hit_pause_p2', 'Hit pause P2'],
    ['guard_pause_p1', 'Guard pause P1'], ['guard_pause_p2', 'Guard pause P2'], ['air_hit_time', 'Air hitstun'],
    ['ground_velocity_x', 'Ground hit velocity X'], ['guard_velocity_x', 'Guard velocity X'],
    ['air_velocity_x', 'Air hit velocity X'], ['air_velocity_y', 'Air hit velocity Y'], ['y_accel', 'Air Y acceleration']
  ];
  return wanted.map(([suffix, label]) => { const item = assignments.get((prefix + suffix).toLowerCase()); return item ? { ...item, label, sharedLabel: `${strength} normal profile` } : null; }).filter(Boolean);
}

async function modelFor(assets, options = {}) {
  const constantsText = await currentText(assets.constants), airText = await currentText(assets.air), parsed = parseConstants(constantsText), moves = moveGroups(parsed);
  const archive = readSff(assets.sff), airActions = require('./air_preview_model').parseAir(airText);
  let knownDef = null;
  try { knownDef = { filename: assets.defPath, text: await currentText(assets.defPath) }; } catch (_) {}
  const characterPalette = characterPaletteAssignment(archive, assets.sff, knownDef);
  const reactionSpecs = [
    { id: 'stand-high', label: 'Standing high', action: 5000, posture: 'standing' },
    { id: 'stand-low', label: 'Standing low', action: 5001, posture: 'standing' },
    { id: 'crouching', label: 'Crouching', action: 5010, posture: 'crouching' },
    { id: 'airborne', label: 'Airborne', action: 5020, posture: 'airborne' }
  ];
  const reactionPreviews = reactionSpecs.map((spec) => {
    const action = airActions.find((item) => item.number === spec.action); if (!action) return null;
    const frames = action.frames.map((frame) => {
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index); let image = null;
      if (sprite) try { image = spritePreviewPair(archive, sprite, characterPalette.override); } catch (_) {}
      return { ...frame, image };
    });
    return { ...spec, frames, loopStart: action.loopStart, totalTicks: frames.reduce((sum, frame) => sum + Math.max(1, Number(frame.time) || 1), 0) };
  }).filter(Boolean);
  const output = [], openDocuments = vscode.workspace.textDocuments || [], diagnostics = sourceDiagnostics([assets.constants, assets.air, ...(assets.code || [])]), sharedAssignments = new Map(), sharedProfile = require('./move_constants_shared_profile'), sourceHashes = new Map([[identity(assets.constants), hash(constantsText)], [identity(assets.air), hash(airText)]]);
  for (const filename of assets.code || []) {
    let text = ''; try { text = await currentText(filename); } catch (_) { continue; }
    sourceHashes.set(identity(filename), hash(text)); const lines = text.split(/\r?\n/);
    for (let line = 0; line < lines.length; line++) {
      const assignment = sharedProfile.parseAssignmentLine(lines[line]);
      if (assignment) sharedAssignments.set(assignment.name.toLowerCase(), { name: assignment.name, value: assignment.value, filename, line, sourceHash: hash(text) });
    }
  }
  for (const move of moves) {
    const timeline = actionTimeline(airText, move), images = {};
    if (timeline.state === 'ready') for (const frame of timeline.frames) {
      const key = `${frame.group},${frame.index}`; if (images[key]) continue;
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index);
      if (sprite) try { images[key] = spritePreviewPair(archive, sprite, characterPalette.override); } catch (_) {}
    }
    const codeSections = connectedCode(assets, move, openDocuments), fields = fieldsFor(move).map(field => ({ ...field, explanation: fieldExplanation(field) }));
    output.push({ ...move, fields, timeline, timingEvidence: timingEvidence(timeline, move, codeSections), followups: require('./move_followup_windows').followupWindows(codeSections), images, codeSections, contactProfile: contactProfile(sharedAssignments, move), problems: [...timingProblems({ ...move, timeline }), ...diagnosticProblems(diagnostics, codeSections)], reactionPreviews, reactions: { normal: reactionSummary(move, 'normal'), counter: reactionSummary(move, 'counter'), punish: reactionSummary(move, 'punish') } });
  }
  const directImages = directActionImages(options.directComponents, airActions, archive, characterPalette.override);
  const directTiming = directStateTiming(options.directComponents, airText, airActions);
  const fileStatus = [...new Set([assets.constants, assets.air, ...(assets.code || [])].filter(Boolean))].map(filename => { const document=openDocuments.find(item=>path.resolve(item.fileName).toLowerCase()===path.resolve(filename).toLowerCase()); return { filename, label:path.basename(filename), dirty:Boolean(document?.isDirty) }; });
  const codePrefix=codeDraftKey(assets.defPath,''),codeDrafts={};
  for(const [key,value] of Object.entries(codeFormDrafts.entries||{}))if(key.startsWith(codePrefix)&&value&&Object.keys(value).length)codeDrafts[key.slice(codePrefix.length)]=value;
  return { character: path.basename(assets.folder), files: assets, characterPalette: { ...characterPalette, override: undefined }, directActionImages: directImages.images, directActionImagesTruncated: directImages.truncated, directActionTiming: directTiming, fileStatus, timingSources:{constants:hash(constantsText),air:hash(airText)}, airActions:compactAirCatalog(airText), moves: output, overview: overviewFor(assets, output, diagnostics, openDocuments, sourceHashes), codeDrafts, formDrafts:Object.fromEntries(output.map(move=>[move.id,formDrafts.read(draftKey(assets.defPath,move.id))||{}])) };
}
async function shellModelFor(assets) {
  const ready=[assets.constants,assets.air,assets.sff].every(filename=>filename&&fs.existsSync(filename));
  const openDocuments=vscode.workspace.textDocuments||[],diagnostics=sourceDiagnostics([assets.constants,assets.air,...(assets.code||[])]);
  let unavailable='No assigned AIR/SFF preview is available. Direct source inspection remains fully available.';
  if(ready)try{const direct=directComponentModel(assets,openDocuments,diagnostics),model=await modelFor(assets,{directComponents:direct.behaviors});model.directComponents=direct.components;model.behaviorComponents=direct.behaviors;model.specialistComponents=direct.specialists;model.projectKnowledge=direct.projectKnowledge;model.componentFailures=direct.failures;model.overview.controllers=direct.components;model.overview.behaviors=direct.behaviors;model.overview.specialists=direct.specialists;return model;}catch(error){unavailable=`The optional constants/preview component is unavailable: ${error.message}. Direct source inspection remains fully available.`;}
  const direct=directComponentModel(assets,openDocuments,diagnostics),fileStatus=(assets.code||[]).filter(filename=>filename&&fs.existsSync(filename)).map(filename=>{const document=openDocuments.find(item=>identity(item.fileName)===identity(filename));return{filename,label:path.basename(filename),dirty:Boolean(document?.isDirty)}});
  let airText='',airActions=[];if(assets.air&&fs.existsSync(assets.air))try{airText=await currentText(assets.air);airActions=compactAirCatalog(airText);}catch(_){}
  let characterPalette=null,directImages={images:{},truncated:0},palettePreviewUnavailable='';
  const directTiming = airText ? directStateTiming(direct.behaviors, airText) : {};
  if(airText&&assets.sff&&fs.existsSync(assets.sff))try{const archive=readSff(assets.sff),knownDef={filename:assets.defPath,text:await currentText(assets.defPath)};characterPalette=characterPaletteAssignment(archive,assets.sff,knownDef);directImages=directActionImages(direct.behaviors,require('./air_preview_model').parseAir(airText),archive,characterPalette.override);characterPalette={...characterPalette,override:undefined};}catch(error){palettePreviewUnavailable=`The assigned AIR/SFF thumbnails could not be rendered: ${error.message}. Exact code inspection remains available.`;}
  const codePrefix=codeDraftKey(assets.defPath,''),codeDrafts={};for(const [key,value]of Object.entries(codeFormDrafts.entries||{}))if(key.startsWith(codePrefix)&&value&&Object.keys(value).length)codeDrafts[key.slice(codePrefix.length)]=value;
  return{character:path.basename(assets.folder),files:assets,characterPalette,directActionImages:directImages.images,directActionImagesTruncated:directImages.truncated,directActionTiming:directTiming,palettePreviewUnavailable,fileStatus,timingSources:{air:airText?hash(airText):''},airActions,moves:[],overview:{controllers:direct.components.map(item=>({...item,reference:item.reference})),behaviors:direct.behaviors,specialists:direct.specialists,constantProfiles:(direct.constantProfiles||[]).map(item=>({...item,defPath:assets.defPath,supported:false})),problems:[]},directComponents:direct.components,behaviorComponents:direct.behaviors,specialistComponents:direct.specialists,projectKnowledge:direct.projectKnowledge,componentFailures:direct.failures,codeDrafts,formDrafts:{},previewUnavailable:unavailable};
}

function moveConstantsControlAvailability(state={}) {
  const hasMove=Boolean(state.hasMove),frameCount=Math.max(0,Number(state.frameCount)||0),moveCount=Math.max(0,Number(state.moveCount)||0),moveIndex=Math.max(-1,Number(state.moveIndex)||0),reactionCount=Math.max(0,Number(state.reactionCount)||0),hasAir=Boolean(state.hasAir),hasConstants=Boolean(state.hasConstants),hasSpark=Boolean(state.hasSpark);
  const available=(enabled=true,reason='')=>({enabled:Boolean(enabled),reason:enabled?'':reason});
  const result={};
  for(const id of ['actualView','advancedTools','canvas','character','codeSections','connectedCode','directWorkspace','dirtyStatus','fields','followSpritePalette','headerMeta','mode:counter','mode:normal','mode:punish','moveList','moveOverview','moveQuickAccess','moveQuickActions','moveSearch','moveStateReadout','moveTitle','overviewDrawer','problems','refresh','stage','status','throwCreator','viewZoomValue'])result[id]=available();
  for(const id of ['actualView','fitView','showClsn1','showClsn2','viewZoom'])result[id]=available(frameCount>0,'No AIR frames are available for this move.');
  result.play=available(frameCount>0,'No AIR frames are available to play.');
  result.previous=result.next=available(frameCount>1,frameCount?'This AIR action has only one element.':'No AIR frames are available.');
  result.timeline=available(frameCount>0,'The selected move has no matching AIR action.');
  result.airWorkspace=available(hasMove&&hasAir,hasAir?'Select a constants-backed move first.':'No AIR file is assigned to this character.');
  result.moveOverview=available(hasMove,'Select a constants-backed move first.');
  result.openAir=available(hasMove&&hasAir,hasAir?'Select a constants-backed move first.':'No AIR file is assigned to this character.');
  result.openConstants=available(hasMove&&hasConstants,hasConstants?'Select a constants-backed move first.':'No Constants file is assigned to this character.');
  result.linkedCode=available(hasMove,'Select a constants-backed move first.');
  for(const id of ['mode:normal','mode:counter','mode:punish'])result[id]=available(hasMove,'Select a constants-backed move first.');
  result.openOpponent=result.showOpponent=result.reactionAction=result.opponentX=result.opponentY=result.resetOpponent=available(hasMove&&reactionCount>0,reactionCount?'Select a constants-backed move first.':'No authored get-hit AIR action is available.');
  result.reaction=result.reactionData=available(hasMove,'Select a constants-backed move first.');
  result.findSpark=result.spark=available(hasMove&&hasSpark,hasMove?'The current AIR element has no authored hit spark pair.':'Select a constants-backed move first.');
  result.moveQuickPrevious=available(moveCount>0&&moveIndex>0,moveCount?'This is the first constants-backed move.':'No constants-backed moves were found.');
  result.moveQuickNext=available(moveCount>0&&moveIndex>=0&&moveIndex<moveCount-1,moveCount?'This is the last constants-backed move.':'No constants-backed moves were found.');
  result.moveStateScroll=available(moveCount>1,moveCount?'Only one constants-backed move is available.':'No constants-backed moves were found.');
  result.launch=available(false,'Live preview is provided by the universal Run action; the retired duplicate is not rendered.');
  return result;
}
function moveConstantsAccessibilityClientScript(){return `
const moveConstantsControlAvailability=${moveConstantsControlAvailability.toString()};
function moveConstantsVisibleMoveRows(list=$('moveList')){return list?[...list.querySelectorAll('[data-move]')].filter(node=>!node.hidden&&node.getAttribute('aria-hidden')!=='true'):[]}
function syncMoveConstantsMoveListAccessibility(){
 const list=$('moveList');if(!list)return;const rows=moveConstantsVisibleMoveRows(list),selected=rows.find(row=>row.getAttribute('aria-selected')==='true'),tabStop=selected||rows[0]||null;
 rows.forEach(row=>row.tabIndex=row===tabStop?0:-1);list.tabIndex=rows.length?-1:0;
 if(!list.dataset.keyboard){list.dataset.keyboard='true';list.addEventListener('keydown',event=>{const items=moveConstantsVisibleMoveRows(list),active=document.activeElement;if((event.key==='Enter'||event.key===' ')&&items.includes(active)){event.preventDefault();active.click();return}if(!items.length)return;let index=Math.max(0,items.indexOf(active));if(event.key==='ArrowDown')index=Math.min(items.length-1,index+1);else if(event.key==='ArrowUp')index=Math.max(0,index-1);else if(event.key==='Home')index=0;else if(event.key==='End')index=items.length-1;else return;event.preventDefault();items[index].focus()})}
}
function syncMoveConstantsAccessibility(){
 const frames=move?.timeline?.frames||[],moveIndex=model.moves.findIndex(item=>item.id===move?.id),sparkAvailable=Boolean(move&&sparkValues(frames[frame]));
 const routes=moveConstantsControlAvailability({hasMove:Boolean(move),frameCount:frames.length,moveCount:model.moves.length,moveIndex,reactionCount:(move?.reactionPreviews||[]).length,hasAir:Boolean(model.files?.air),hasConstants:Boolean(model.files?.constants),hasSpark:sparkAvailable});
 for(const [id,route] of Object.entries(routes)){const nodes=id.startsWith('mode:')?[document.querySelector('[data-mode="'+id.slice(5)+'"]')]:[document.getElementById(id)];for(const node of nodes){if(!node)continue;if(!node.dataset.availableTitle)node.dataset.availableTitle=node.title||'';if('disabled' in node)node.disabled=!route.enabled;node.setAttribute('aria-disabled',String(!route.enabled));node.title=route.enabled?node.dataset.availableTitle:route.reason;route.reason?node.setAttribute('aria-description',route.reason):node.removeAttribute('aria-description')}}
 document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
 $('showClsn1')?.setAttribute('aria-pressed',String(showClsn1));$('showClsn2')?.setAttribute('aria-pressed',String(showClsn2));
 for(const node of [...document.querySelectorAll('[data-mode]'),$('showClsn1'),$('showClsn2')].filter(Boolean))if(!node.dataset.a11ySync){node.dataset.a11ySync='true';node.addEventListener('click',()=>queueMicrotask(syncMoveConstantsAccessibility))}
 syncMoveConstantsMoveListAccessibility();
 const timeline=$('timeline');if(timeline&&!timeline.dataset.keyboard){timeline.dataset.keyboard='true';timeline.addEventListener('keydown',event=>{const items=[...timeline.querySelectorAll('[data-frame]')];if(!items.length)return;let index=Math.max(0,items.indexOf(document.activeElement));if(event.key==='ArrowRight')index=Math.min(items.length-1,index+1);else if(event.key==='ArrowLeft')index=Math.max(0,index-1);else if(event.key==='Home')index=0;else if(event.key==='End')index=items.length-1;else return;event.preventDefault();items[index].click();timeline.querySelector('[data-frame="'+index+'"]')?.focus()})}
 const preview=$('canvas');if(preview&&!preview.dataset.keyboard){preview.dataset.keyboard='true';preview.addEventListener('keydown',event=>{if(event.key==='+'||event.key==='=')setViewZoom(viewZoom*1.12);else if(event.key==='-')setViewZoom(viewZoom*.89);else if(event.key==='Home')centerView();else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){const step=event.shiftKey?30:10;panX+=event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0;panY+=event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0;saveState();draw()}else return;event.preventDefault()})}
}
`;}

function html(model, toolbarModel = moveToolbarModel({model})) { const universal=require('./shared_workspace_header').html('move_constants',toolbarModel),page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{display:flex;flex-direction:column;margin:0;height:100vh;overflow:hidden;font:12px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}header{min-height:46px;flex-shrink:0;max-height:35vh;overflow:auto;display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border)}.grow{flex:1}.layout{flex:1;min-height:0;display:grid;grid-template-columns:360px minmax(480px,1fr) 300px}.rail{overflow:auto;padding:10px}.left{border-right:1px solid var(--vscode-panel-border)}.right{border-left:1px solid var(--vscode-panel-border)}.center{display:grid;grid-template-rows:minmax(350px,1fr) 150px;min-width:0}.stage{position:relative;overflow:hidden;background:linear-gradient(#101827,#202838);border-bottom:1px solid var(--vscode-panel-border)}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;image-rendering:pixelated;cursor:grab}canvas:active{cursor:grabbing}.timeline{display:flex;overflow:auto;gap:5px;padding:8px}.frame{min-width:92px;border:2px solid var(--vscode-panel-border);padding:4px;text-align:center}.frame.selected{outline:2px solid var(--vscode-focusBorder)}.frame.startup{border-color:#7f8c9a}.frame.active,.frame.authored-window{border-color:#49d17d}.frame.post-window{border-color:#dfb64b}.frame.hitpause{box-shadow:inset 0 -5px #c47cff}.frame.hp-start{border-left-width:6px}.frame.hp-freeze{border-right-width:6px;border-right-color:#ff9f43}.frame img{width:80px;height:84px;object-fit:contain;image-rendering:pixelated}.move-picker{margin-bottom:10px}.move-picker input{width:100%;margin:5px 0}.move-list{height:180px;overflow:auto;border:1px solid var(--vscode-panel-border);padding:3px}.move-item{display:block;width:100%;text-align:left;margin:2px 0;border-left:3px solid transparent}.move-item.active{border-left-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.category{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary{padding:7px;font-weight:700;cursor:pointer}.category-actions{display:flex;gap:5px;padding:0 7px 5px;flex-wrap:wrap}.category-actions button{flex:1}.field{display:grid;grid-template-columns:18px minmax(70px,1fr) minmax(60px,90px);gap:5px;align-items:center;padding:4px 7px}.field input,.field select{width:100%}.field input[type=checkbox]{width:auto}.field button{padding:4px}.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}.muted{color:var(--vscode-descriptionForeground)}.card{padding:8px;margin:8px 0;background:var(--vscode-editor-inactiveSelectionBackground)}.contact-summary{margin:6px 0;padding:6px;background:var(--vscode-textBlockQuote-background)}.quick-grid{display:grid;grid-template-columns:1fr;gap:4px}.quick-field{display:grid;grid-template-columns:minmax(95px,1fr) 72px 30px;gap:4px;align-items:center}.quick-field input{width:100%}.quick-field button{padding:4px}.profile-values{margin-top:8px;border-top:1px solid var(--vscode-panel-border);padding-top:6px}.profile-values summary{cursor:pointer;font-weight:700}.profile-value{display:grid;grid-template-columns:minmax(95px,1fr) 92px 30px auto auto;gap:5px;align-items:center;margin:4px 0}.profile-value input{width:100%;text-align:right}.profile-conflict{grid-column:1 / -1}.modes,.playback,.opponent-controls{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.opponent-controls input{width:68px}.toggle.active,.modes button.active{outline:2px solid var(--vscode-focusBorder)}.legend{display:grid;grid-template-columns:14px 1fr;gap:5px}.swatch{height:10px}.warning{color:var(--vscode-charts-yellow)}h2,h3{margin:6px 0}@media(max-width:1000px){.layout{grid-template-columns:300px 1fr}.right{display:none}}
@media(max-width:650px){.layout{display:block;overflow:auto}.layout .rail{overflow:visible}.layout .center{height:480px}.layout .right{display:block}}</style></head><body><header><b>Move Lab</b><span class="context">Constants integration</span><span id="character"></span><span id="moveTitle"></span><div class="playback"><button id="previous" title="Previous AIR element">◀</button><button id="play" title="Play or stop this AIR action">Play</button><button id="next" title="Next AIR element">▶</button><button id="showClsn1" class="toggle active" title="Toggle attack collision boxes">Clsn1</button><button id="showClsn2" class="toggle active" title="Toggle hurt collision boxes">Clsn2</button><button id="fitView" title="Fit the current sprite in the canvas">Fit</button><button id="actualView" title="Use 100% sprite scale">100%</button><input id="viewZoom" type="range" min="25" max="800" step="25" value="200" title="Preview zoom"><span id="viewZoomValue">200%</span></div><button id="moveCommandTriggerRecipes" title="Review command-trigger recipes for this exact character">Command triggers…</button><button id="moveOverview">Overview / Related Tools</button><button id="airWorkspace">Edit in AIR Workspace</button><button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Common / Functions…</button><button id="openConstants">Constants</button><button id="openAir">AIR Text</button><button id="launch">Live Training Preview</button><span class="grow"></span><button id="refresh">Refresh</button></header><main class="layout"><aside class="rail left"><div class="move-picker"><h3>Attack library</h3><input id="moveSearch" type="search" placeholder="Filter attacks…" aria-label="Filter attacks"><div id="moveList" class="move-list"></div></div><h3>Move characteristics</h3><p class="muted">Edit and apply one value with ✓. Copy sends one option, checked options, or a whole category to one or more existing move/state profiles after review.</p><div id="fields"></div></aside><section class="center"><div class="stage"><canvas id="canvas" width="960" height="540" title="Mouse wheel zooms. Drag the yellow spark to draft its X/Y values, drag P2 to position the opponent, or drag empty canvas space to pan. Double-click to center."></canvas></div><div class="timeline" id="timeline"></div></section><aside class="rail right"><h3>Opponent reaction estimate</h3><div class="modes"><button data-mode="normal" class="active">Normal</button><button data-mode="counter">Counter Hit</button><button data-mode="punish">Punish Counter</button></div><div class="reaction" id="reaction"><div class="spark" id="spark"></div></div><div class="card" id="reactionData"></div><div class="legend"><span class="swatch" style="background:#7f8c9a"></span><span>Startup</span><span class="swatch" style="background:#49d17d"></span><span>Active / authored active window</span><span class="swatch" style="background:#dfb64b"></span><span>Authored post-window (recovery unverified)</span><span class="swatch" style="background:#ff3b45"></span><span>Clsn1 (attack)</span><span class="swatch" style="background:#3d8dff"></span><span>Clsn2 (hurt)</span><span class="swatch" style="background:#ffd84a"></span><span>Default Clsn1</span><span class="swatch" style="background:#b26cff"></span><span>Default Clsn2</span><span class="swatch" style="background:#ffd84d;border-radius:50%"></span><span>Estimated hit spark (active frames only)</span></div><p class="muted">Animation starts stopped. Mouse wheel zooms the canvas. Drag the yellow spark marker to draft that active window's X/Y pair; use each field's ✓ button to apply it to code. Drag P2 to reposition the reaction preview, or drag empty space to pan. Spark X is defender-relative, so the canvas estimates contact from the leading edge of the active Clsn1. Separate active windows use explicit spark2X/spark2Y, spark3X/spark3Y, and so on; missing pairs are not guessed. Live Training Preview remains the authority for exact contact placement, physics, states, hit pause, and project systems.</p><div id="status" class="warning"></div></aside></main><script>
${require('./move_constants_view_transform').clientScript()}${require('./move_constants_shared_profile').clientScript()}const vscode=acquireVsCodeApi(),saved=vscode.getState()||{},imageCache=new Map();let model=${safe(model)},move=null,frame=0,mode='normal',draft={},profileDrafts=saved.profileDrafts&&typeof saved.profileDrafts==='object'?{...saved.profileDrafts}:{},profilePending={},profileRequestSerial=0,playing=false,timer=null,showClsn1=true,showClsn2=true,followSpritePalette=!(saved.defPath===model.files?.defPath&&saved.followSpritePalette===false),opponentEnabled=saved.opponentEnabled!==false,reactionId=saved.reactionId||'stand-high',viewZoom=moveView.clampZoom(saved.viewZoom??2),panX=Number(saved.panX)||0,panY=Number(saved.panY)||0,viewportWidth=Number(saved.viewportWidth)||960,viewportHeight=Number(saved.viewportHeight)||540;const restoredOpponent=moveView.migrateOpponent(saved,viewZoom,viewportWidth,viewportHeight);let opponentWorldX=restoredOpponent.x,opponentWorldY=restoredOpponent.y;const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function saveState(){moveDrafts.stage();saved.advancedOpen=$('advancedTools')?.open||false;saved.connectedOpen=$('connectedCode')?.open!==false;saved.openCode=[...document.querySelectorAll('.code-section[open]')].map(x=>x.dataset.section);vscode.setState({...vscode.getState(),defPath:model.files.defPath,selectedMove:move?.id,selectedFrame:frame,draft:{...draft},profileDrafts:{...profileDrafts},followSpritePalette,opponentEnabled,opponentWorldX,opponentWorldY,reactionId,viewZoom,panX,panY,viewportWidth,viewportHeight,advancedOpen:saved.advancedOpen,connectedOpen:saved.connectedOpen,openCode:saved.openCode})}
function publishMoveContext(){if(move)vscode.postMessage({type:'moveIntegrationContext',sourceId:move.id,frameIndex:frame})}
function selectMove(id,restoredDraft,restoredFrame=0){stop();move=model.moves.find(x=>x.id===id)||model.moves[0]||null;frame=Math.max(0,Math.min((move?.timeline?.frames?.length||1)-1,Number(restoredFrame)||0));draft=moveDrafts.select(move?.id===id?restoredDraft:undefined);render();saveState();publishMoveContext();vscode.postMessage({type:'viewerSelectionChanged',navigationSelection:{id:move?.id}})}
function renderMoveList(){const query=$('moveSearch').value.trim().toLowerCase(),items=model.moves.filter(x=>(x.prefix+' '+x.id+' '+x.values.moveID).toLowerCase().includes(query));$('moveList').innerHTML=items.map(x=>{const selected=move?.id===x.id;return '<button role="option" aria-selected="'+selected+'" tabindex="'+(selected?'0':'-1')+'" class="move-item '+(selected?'active':'')+'" data-move="'+esc(x.id)+'"><b>'+esc(x.values.moveID??'—')+'</b> · '+esc(x.prefix)+'</button>'}).join('')||'<p class="muted">No matching attacks.</p>';document.querySelectorAll('[data-move]').forEach(x=>x.onclick=()=>selectMove(x.dataset.move));syncMoveConstantsMoveListAccessibility()}
function stop(){playing=false;if(timer){clearTimeout(timer);timer=null}if($('play'))$('play').textContent='Play'}
function advance(delta=1,fromPlayback=false){const frames=move?.timeline.frames||[];if(!frames.length)return;let next=frame+delta;if(next>=frames.length)next=fromPlayback&&Number.isInteger(move.timeline.loopStart)?move.timeline.loopStart:0;if(next<0)next=frames.length-1;frame=next;renderTimeline();renderHeader();draw();if(fromPlayback)schedule();else{saveState();publishMoveContext()}}
function schedule(){if(!playing)return;const current=move?.timeline.frames?.[frame];if(current?.hold||current?.reachable===false){stop();return}const ticks=Math.max(1,Number(current?.duration??current?.time)||1);timer=setTimeout(()=>advance(1,true),ticks*1000/60)}
function togglePlay(){if(playing)return stop();if(!(move?.timeline.frames||[]).length)return;playing=true;$('play').textContent='Stop';schedule()}
function value(s){return Object.prototype.hasOwnProperty.call(draft,s)?Number(draft[s]):Number(move.values[s]??0)}
function hasValue(s){return Object.prototype.hasOwnProperty.call(draft,s)||Object.prototype.hasOwnProperty.call(move.values,s)}
function profileDraftKey(item){return String(item?.filename||'').replace(/\\\\/g,'/').toLowerCase()+'#'+String(item?.name||'').toLowerCase()}
function profileDraft(item){const key=profileDraftKey(item);return Object.prototype.hasOwnProperty.call(profileDrafts,key)?sharedProfile.normalizeDraft(profileDrafts[key],item):null}
function sparkValues(f){if(!f?.clsnActive)return null;const hit=Math.max(1,Number(f.activeWindow)||1),xKey=hit===1?'sparkX':'spark'+hit+'X',yKey=hit===1?'sparkY':'spark'+hit+'Y';return hasValue(xKey)&&hasValue(yKey)?{hit,xKey,yKey,x:value(xKey),y:value(yKey)}:null}
function previewOrigin(){const canvas=$('canvas');return{x:canvas.width/2+panX,y:canvas.height*.8+panY}}function opponentScreenPoint(){const origin=previewOrigin();return moveView.screenPoint(origin.x,origin.y,opponentWorldX,opponentWorldY,viewZoom)}
function sparkPoint(f,scale,ox,oy){const spark=sparkValues(f);if(!spark)return null;const leading=(f.clsn1||[]).reduce((edge,box)=>Math.max(edge,Number(box[0])||0,Number(box[2])||0),0),opponent=opponentScreenPoint(),anchorX=opponentEnabled?opponent.x:ox+leading*scale,anchorY=opponentEnabled?opponent.y:oy;return{...spark,valueX:spark.x,valueY:spark.y,anchorX,anchorY,x:anchorX+spark.x*scale,y:anchorY+spark.y*scale}}
function imageSource(info){return followSpritePalette?info?.src:info?.characterPaletteSrc||info?.src}
function syncPalettePreviewStatus(){const node=$('palettePreviewStatus');if(!node)return;const palette=model.characterPalette||{};node.textContent=followSpritePalette?'Each sprite’s SFF palette':palette.issue?'Assigned palette unavailable; showing SFF colors':palette.source==='act'?'DEF pal'+palette.number+' ACT preview':Number.isInteger(palette.index)?'DEF default '+palette.group+','+palette.number+' preview':'No assigned palette; showing SFF colors';node.title=palette.issue||'Preview only; source files are unchanged.'}
function cachedImage(info){const src=imageSource(info);if(!src)return null;if(imageCache.has(src))return imageCache.get(src);const image=new Image();image.onload=draw;image.src=src;imageCache.set(src,image);return image}
function reactionPreview(){return move?.reactionPreviews?.find(item=>item.id===reactionId)||move?.reactionPreviews?.[0]||null}
function reactionFrame(){const preview=reactionPreview(),attack=move?.timeline.frames?.[frame],attackFrames=move?.timeline.frames||[];if(!preview?.frames?.length||!attack)return null;const contacts=attackFrames.filter((item,index)=>item.clsnActive&&Number.isInteger(item.start)&&Number.isInteger(attack.start)&&item.start<=attack.start&&(index===0||attackFrames[index-1].activeWindow!==item.activeWindow)),contact=contacts.length?contacts[contacts.length-1]:null;let tick=contact?Math.max(0,attack.start-contact.start):0;for(const item of preview.frames){if(tick<Math.max(1,Number(item.time)||1))return item;tick-=Math.max(1,Number(item.time)||1)}return preview.frames[preview.frames.length-1]}
function coordinateText(value){return String(Number(Number(value).toFixed(6)))}
function renderOpponentControls(){const select=$('reactionAction'),previews=move?.reactionPreviews||[];select.innerHTML=previews.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.label)+' · Action '+item.action+'</option>').join('')||'<option value="">No standard get-hit actions found</option>';if(!previews.some(item=>item.id===reactionId))reactionId=previews[0]?.id||'';select.value=reactionId;$('showOpponent').checked=opponentEnabled;$('opponentX').value=coordinateText(opponentWorldX);$('opponentY').value=coordinateText(opponentWorldY);$('stage').classList.toggle('opponent',opponentEnabled)}
function drawOpponent(ctx,scale){if(!opponentEnabled)return;const f=reactionFrame(),info=f?.image,image=cachedImage(info),axis=opponentScreenPoint(),x=axis.x,y=axis.y;if(!image?.complete)return;ctx.save();ctx.globalAlpha=.68;ctx.filter='brightness(.38) saturate(.55)';ctx.translate(x+(f.x||0)*scale,y+(f.y||0)*scale);ctx.scale(f.flags?.includes('H')?scale:-scale,f.flags?.includes('V')?-scale:scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,-info.axisX,-info.axisY);ctx.restore();ctx.save();ctx.strokeStyle='rgba(110,210,255,.65)';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();ctx.restore()}
function fieldControl(f){const v=value(f.suffix),name=move.prefix+'.'+f.suffix,label=' aria-label="'+esc(f.label)+'"';if(f.type==='enum')return '<select data-field="'+f.suffix+'"'+label+'>'+f.values.map((x,i)=>'<option value="'+i+'" '+(i===v?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';if(f.type==='boolean')return '<select data-field="'+f.suffix+'"'+label+'><option value="0" '+(!v?'selected':'')+'>No</option><option value="1" '+(v?'selected':'')+'>Yes</option></select>';return '<input data-field="'+f.suffix+'" type="number"'+label+' value="'+v+'" '+(f.min!==undefined?'min="'+f.min+'"':'')+'>'}
function sendCopy(suffixes){const values={};for(const suffix of suffixes)values[suffix]=value(suffix);vscode.postMessage({type:'copyFields',sourceId:move.id,suffixes,values})}
function renderFields(){const groups={};for(const f of move.fields.filter(x=>x.present))(groups[f.category]||(groups[f.category]=[])).push(f);$('fields').innerHTML=Object.entries(groups).map(([name,fields])=>{const air=name==='Animation timing'?'<button data-import-air title="Suggest contact and post-window elements from AIR collision; state control and cancel timing remain unverified">Import from AIR…</button>':'';return '<details class="category" open data-category="'+esc(name)+'"><summary>'+esc(name)+'</summary><div class="category-actions">'+air+'<button data-copy-category="'+esc(name)+'" title="Copy every option in this category to other existing move/state profiles">Copy category…</button><button data-copy-checked="'+esc(name)+'" title="Copy only the checked options in this category">Copy checked…</button></div>'+fields.map(f=>'<div class="field" title="'+esc(move.prefix+'.'+f.suffix)+'"><input type="checkbox" data-copy-select="'+f.suffix+'" aria-label="Select '+esc(f.label)+' for copying"><label>'+esc(f.label)+'</label>'+fieldControl(f)+'<span class="field-actions"><button data-source="'+f.suffix+'" title="Open this constant in its text editor">Source</button><button data-apply="'+f.suffix+'" title="Apply this value to the current move">✓</button><button data-copy-one="'+f.suffix+'" title="Copy only '+esc(f.label)+' to other moves">Copy</button></span></div>').join('')+'</details>'}).join('');document.querySelectorAll('[data-field]').forEach(x=>x.oninput=()=>{draft[x.dataset.field]=Number(x.value);saveState();draw();renderReaction();renderTimeline()});document.querySelectorAll('[data-source]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'open',file:'constants',sourceId:move.id,suffix:x.dataset.source}));document.querySelectorAll('[data-apply]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'apply',defPath:model.files.defPath,sourceId:move.id,suffix:x.dataset.apply,base:moveDrafts.base(x.dataset.apply),name:move.prefix+'.'+x.dataset.apply,value:value(x.dataset.apply)}));document.querySelectorAll('[data-copy-one]').forEach(x=>x.onclick=()=>sendCopy([x.dataset.copyOne]));document.querySelectorAll('[data-copy-category]').forEach(x=>x.onclick=()=>sendCopy(groups[x.dataset.copyCategory].map(f=>f.suffix)));document.querySelectorAll('[data-copy-checked]').forEach(x=>x.onclick=()=>{const root=x.closest('details'),suffixes=[...root.querySelectorAll('[data-copy-select]:checked')].map(i=>i.dataset.copySelect);if(suffixes.length)sendCopy(suffixes);else $('status').textContent='Check one or more options in this category first.'});document.querySelectorAll('[data-import-air]').forEach(x=>x.onclick=()=>vscode.postMessage({type:'importAirTiming',sourceId:move.id}))}
function phase(i,f){const first=hasValue('firstActiveElement')?value('firstActiveElement'):0,idle=hasValue('idleElement')?value('idleElement'):0;return first>0&&i+1<first?'startup':idle>0&&i+1>=idle?'post-window':f.clsnActive?'active':'authored-window'}
function renderTimingEvidence(){const evidence=move.timingEvidence||{},frames=move.timeline.frames||[],lines=['AIR: '+(evidence.authored||'unavailable')];const first=hasValue('firstActiveElement')?frames[value('firstActiveElement')-1]:null,post=hasValue('idleElement')?frames[value('idleElement')-1]:null;if(Number.isInteger(first?.start))lines.push('First authored active element starts at tick '+first.start+(Object.prototype.hasOwnProperty.call(draft,'firstActiveElement')?' (draft)':''));if(Number.isInteger(post?.start))lines.push('Authored post-window element starts at tick '+post.start+(Object.prototype.hasOwnProperty.call(draft,'idleElement')?' (draft)':''));lines.push('Ordinary control: '+(evidence.ordinaryControl||'unknown'));lines.push('Cancel window: '+(evidence.cancel||'unknown'));lines.push('Frame advantage: '+(evidence.advantage||'unknown'));if(evidence.projectile){lines.push('Projectile release: '+evidence.projectile.release);lines.push('Projectile lifetime: '+evidence.projectile.lifetime)}$('timingEvidence').innerHTML='<b>Timing evidence</b><br>'+lines.map(esc).join('<br>');const routes=move.followups||[];if(routes.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Follow-up conditions ('+routes.length+')';details.appendChild(summary);for(const [index,row] of routes.entries()){const block=document.createElement('div'),button=document.createElement('button');button.textContent='State '+row.target+' · source';button.onclick=()=>vscode.postMessage({type:'moveFollowupSource',sourceId:move.id,index});block.appendChild(button);for(const label of row.cases){const line=document.createElement('div');line.textContent=label;block.appendChild(line)}details.appendChild(block)}$('timingEvidence').appendChild(details)}}
function renderTimeline(){const frames=move.timeline.frames||[],hpStart=value('hitPauseAnimateStartElement'),hpFreeze=value('hitPauseFreezeElement');renderTimingEvidence();$('timeline').innerHTML=frames.map((f,i)=>{const img=move.images[f.group+','+f.index],element=i+1,inRange=hpStart>0&&element>=hpStart&&element<hpFreeze,role=(element===hpStart?' · hit-pause start':'')+(element===hpFreeze?' · freeze here':'')+(i===move.timeline.loopStart&&move.timeline.hasLoopMarker?' · Loopstart':''),selected=i===frame,duration=f.hold?'Hold (time=-1)':f.authoredTime===0?'0 authored (1 preview tick)':f.duration+' tick'+(f.duration===1?'':'s'),range=f.reachable===false?'not reached after hold':f.hold?'from tick '+f.start+' onward':f.start+'–'+f.end;return '<button role="option" aria-selected="'+selected+'" tabindex="'+(selected?'0':'-1')+'" class="frame '+phase(i,f)+(selected?' selected':'')+(inRange?' hitpause':'')+(element===hpStart?' hp-start':'')+(element===hpFreeze?' hp-freeze':'')+'" data-frame="'+i+'" title="Right-click to assign hit-pause animation timing">'+(img?'<img src="'+imageSource(img)+'" alt="">':'')+'<b>Element '+element+'</b><br>'+duration+'<br><span class="muted">'+range+role+'</span></button>'}).join('')||'<p class="warning">AIR action '+move.timeline.actionNumber+' was not found.</p>';document.querySelectorAll('[data-frame]').forEach(x=>{x.onclick=()=>{stop();frame=Number(x.dataset.frame);renderTimeline();draw();saveState();publishMoveContext()};x.oncontextmenu=e=>{e.preventDefault();stop();frame=Number(x.dataset.frame);renderTimeline();draw();saveState();publishMoveContext();vscode.postMessage({type:'frameTimingMenu',sourceId:move.id,element:frame+1})}});document.querySelector('[data-frame="'+frame+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}
function paintBox(ctx,box,color,f,scale,ox,oy){const flipX=f.flags?.includes('H')?-1:1,flipY=f.flags?.includes('V')?-1:1,x1=box[0]*flipX,x2=box[2]*flipX,y1=box[1]*flipY,y2=box[3]*flipY,x=ox+Math.min(x1,x2)*scale,y=oy+Math.min(y1,y2)*scale,w=Math.abs(x2-x1)*scale,h=Math.abs(y2-y1)*scale;ctx.fillStyle=color+'30';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h)}
function cancelCanvasDrag(){if(pointer!==null&&canvas?.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);pointer=null;drag=null}function setViewZoom(next,pointer){cancelCanvasDrag();const canvas=$('canvas'),old=viewZoom,value=moveView.clampZoom(next);if(pointer){const rect=canvas.getBoundingClientRect(),px=(pointer.clientX-rect.left)*canvas.width/rect.width,py=(pointer.clientY-rect.top)*canvas.height/rect.height,nextPan=moveView.zoomPan(old,value,panX,panY,px,py,canvas.width/2,canvas.height*.8);panX=nextPan.x;panY=nextPan.y}viewZoom=value;$('viewZoom').value=Math.round(value*100);$('viewZoomValue').textContent=Math.round(value*100)+'%';saveState();draw()}
function centerView(){cancelCanvasDrag();panX=0;panY=0;saveState();draw()}
function resizePreviewCanvas(){const canvas=$('canvas'),width=Math.round(canvas.clientWidth),height=Math.round(canvas.clientHeight);if(width<1||height<1)return false;if(width===canvas.width&&height===canvas.height&&width===viewportWidth&&height===viewportHeight)return false;viewportWidth=width;viewportHeight=height;canvas.width=width;canvas.height=height;renderOpponentControls();saveState();return true}
function fitView(){resizePreviewCanvas();const f=move?.timeline.frames?.[frame],info=f&&move.images[f.group+','+f.index],canvas=$('canvas');if(!info)return centerView();viewZoom=Math.max(.25,Math.min(4,Math.min(canvas.width*.55/info.width,canvas.height*.65/info.height)));centerView();$('viewZoom').value=Math.round(viewZoom*100);$('viewZoomValue').textContent=Math.round(viewZoom*100)+'%'}
function draw(){resizePreviewCanvas();if(!move)return;const canvas=$('canvas'),ctx=canvas.getContext('2d'),f=move.timeline.frames?.[frame],scale=viewZoom,baseX=canvas.width/2+panX,baseY=canvas.height*.8+panY,ox=baseX+(f?.x||0)*scale,oy=baseY+(f?.y||0)*scale;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#132033';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#34475e';const step=Math.max(16,30*scale),gx=((baseX%step)+step)%step,gy=((baseY%step)+step)%step;for(let x=gx;x<canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}for(let y=gy;y<canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}ctx.strokeStyle='#5cb6ff';ctx.beginPath();ctx.moveTo(0,baseY);ctx.lineTo(canvas.width,baseY);ctx.stroke();if(!f)return;drawOpponent(ctx,scale);const info=move.images[f.group+','+f.index],image=cachedImage(info);if(image?.complete){ctx.save();ctx.translate(ox,oy);ctx.scale(f.flags?.includes('H')?-scale:scale,f.flags?.includes('V')?-scale:scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,-info.axisX,-info.axisY);ctx.restore()}if(showClsn2)for(const b of f.clsn2||[])paintBox(ctx,b,f.clsn2Source==='default'?'#b26cff':'#3d8dff',f,scale,ox,oy);if(showClsn1)for(const b of f.clsn1||[])paintBox(ctx,b,f.clsn1Source==='default'?'#ffd84a':'#ff3b45',f,scale,ox,oy);const point=sparkPoint(f,scale,ox,oy);if(point){ctx.strokeStyle='#ffd84d';ctx.fillStyle='rgba(255,216,77,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(point.x-12,point.y);ctx.lineTo(point.x+12,point.y);ctx.moveTo(point.x,point.y-12);ctx.lineTo(point.x,point.y+12);ctx.stroke();ctx.fillStyle='#ffd84d';ctx.fillText('Hit '+point.hit+' spark',point.x+14,point.y-10)}ctx.fillStyle='#fff';ctx.fillText(move.prefix+' · element '+(frame+1)+'/'+move.timeline.frames.length+' · '+phase(frame,f)+' · AIR '+(f.reachable===false?'after hold':f.hold?'hold from tick '+f.start:f.start+'–'+f.end)+' / '+(move.timeline.totalTicks===null?'no finite total':move.timeline.totalTicks+' tick pass'),12,20)}
function calculateReaction(){const base=move.reactions[mode],supp=value('suppressCounterBonuses'),damage=value('damage'),percentField=mode==='counter'?'counterHitDamagePercent':mode==='punish'?'punishCounterDamagePercent':null,pct=percentField&&hasValue(percentField)?value(percentField):100,bonus=mode==='counter'?value('counterHitBonusTime'):mode==='punish'?value('punishCounterBonusTime'):0;return{...base,damage:Math.round(damage*(supp?100:pct)/100),hitstun:value('groundHitTime')+(supp?0:bonus),guardStun:value('guardHitTime'),driveDamage:mode==='punish'&&!supp?value('punishCounterDriveDamage'):0}}
function renderReaction(){
  const r=calculateReaction(),preview=reactionPreview(),quick=(suffix,label)=>hasValue(suffix)?'<label class="quick-field"><span>'+esc(label)+'</span><input type="number" data-quick="'+suffix+'" value="'+value(suffix)+'"><button data-quick-apply="'+suffix+'" title="Apply this drafted value to code">✓</button></label>':'';
  const modeFields=mode==='counter'?quick('counterHitDamagePercent','Counter damage %')+quick('counterHitBonusTime','Bonus hitstun')+quick('counterHitReactionState','Reaction state'):mode==='punish'?quick('punishCounterDamagePercent','Punish damage %')+quick('punishCounterBonusTime','Bonus hitstun')+quick('punishCounterDriveDamage','Drive damage')+quick('punishCounterReactionState','Reaction state')+quick('punishCounterHardKnockdown','Hard knockdown')+quick('punishCounterDownTime','Down time'):'';
  const profile=(move.contactProfile||[]).map((item,index)=>{const stored=profileDraft(item),conflict=stored&&sharedProfile.draftConflict(stored,item),key=profileDraftKey(item),pending=profilePending[key];return '<div class="profile-value"><span>'+esc(item.label)+'</span><input type="number" step="any" data-profile-value="'+index+'" value="'+esc(stored?stored.value:item.value)+'" aria-label="'+esc(item.label)+' shared value"><button data-profile-apply="'+index+'" title="'+(conflict?'Review the changed shared source before applying':'Apply this shared value after impact review')+'" '+(conflict||pending?'disabled':'')+'>✓</button><button data-profile-source="'+index+'" title="Open the shared '+esc(item.sharedLabel)+' source">Source</button>'+(conflict?'<button data-profile-rebase="'+index+'" title="Keep the draft value but accept the currently displayed shared source as its new review base">Use current</button><span class="profile-conflict warning">SOURCE CHANGED — open Source, review it, then choose Use current before applying.</span>':'')+'</div>'}).join('');
  $('reactionData').innerHTML='<b>'+esc(mode==='normal'?'Normal Hit':mode==='counter'?'Counter Hit':'Punish Counter')+'</b><div class="contact-summary">Result: '+r.damage+' damage · '+r.hitstun+'t hitstun · '+r.guardStun+'t guard stun'+(r.driveDamage?' · '+r.driveDamage+' drive damage':'')+(preview?'<br>Reaction: '+esc(preview.label)+' (Action '+preview.action+')':'<br>No standard get-hit action found')+'</div><div class="quick-grid">'+quick('damage','Base damage')+quick('groundHitTime','Ground hitstun')+quick('groundSlideTime','Ground slide time')+quick('guardHitTime','Guard stun')+modeFields+'</div>'+(profile?'<details class="profile-values" open><summary>Shared classic HitDef values</summary>'+profile+'<p class="muted">These are inherited by every move using the same '+esc(move.contactProfile[0].sharedLabel)+'. Open Source before changing them because the change is shared. This shared profile does not expose guard.slidetime; authored Projectile or HitDef source may define it separately. Priority, juggle, power, flags, reaction types, fall/recovery, sparks, and sounds remain in the connected shared function until the profile exposes a safe override.</p></details>':'');
  document.querySelectorAll('[data-quick]').forEach(input=>{input.oninput=()=>{draft[input.dataset.quick]=Number(input.value);const field=document.querySelector('[data-field="'+input.dataset.quick+'"]');if(field)field.value=input.value;saveState();draw();renderTimeline();renderHeader()};input.onchange=renderReaction});
  document.querySelectorAll('[data-quick-apply]').forEach(button=>button.onclick=()=>{const suffix=button.dataset.quickApply;vscode.postMessage({type:'apply',defPath:model.files.defPath,sourceId:move.id,suffix,base:moveDrafts.base(suffix),name:move.prefix+'.'+suffix,value:value(suffix)})});
  document.querySelectorAll('[data-profile-value]').forEach(input=>input.oninput=()=>{const item=move.contactProfile[Number(input.dataset.profileValue)];if(item){const key=profileDraftKey(item);profileDrafts[key]=sharedProfile.createDraft(input.value,item,profileDrafts[key]);saveState();renderHeader()}});
  document.querySelectorAll('[data-profile-apply]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.profileApply),item=move.contactProfile[index],input=document.querySelector('[data-profile-value="'+index+'"]');if(!item||!input)return;const key=profileDraftKey(item);if(!Object.prototype.hasOwnProperty.call(profileDrafts,key))profileDrafts[key]=sharedProfile.createDraft(input.value,item);const stored=sharedProfile.normalizeDraft(profileDrafts[key],item);if(sharedProfile.draftConflict(stored,item))return renderReaction();const requestId='profile-'+(++profileRequestSerial);profilePending[key]={requestId};renderReaction();vscode.postMessage({type:'applyProfile',requestId,sourceId:move.id,index,filename:item.filename,line:item.line,name:item.name,base:item.value,sourceHash:item.sourceHash,value:stored.value,draftRevision:stored.revision,draftBase:stored.base,draftSourceHash:stored.sourceHash})});
  document.querySelectorAll('[data-profile-rebase]').forEach(button=>button.onclick=()=>{const item=move.contactProfile[Number(button.dataset.profileRebase)];if(!item)return;const key=profileDraftKey(item);profileDrafts[key]=sharedProfile.rebaseDraft(profileDrafts[key],item);saveState();renderReaction();renderHeader()});
  document.querySelectorAll('[data-profile-source]').forEach(button=>button.onclick=()=>{const item=move.contactProfile[Number(button.dataset.profileSource)];if(item)vscode.postMessage({type:'openProfileSource',filename:item.filename,line:item.line})});
}
function renderHeader(){const action=move?.timeline?.actionNumber??'—',state=move?.values?.moveID??'—',dirtyFiles=(model.fileStatus||[]).filter(x=>x.dirty).map(x=>x.label),profileItems=model.moves.flatMap(item=>item.contactProfile||[]),profileKeys=new Set(profileItems.map(profileDraftKey)),profileEntries=Object.entries(profileDrafts).filter(([key])=>profileKeys.has(key)),profileConflict=profileEntries.some(([key,value])=>{const item=profileItems.find(entry=>profileDraftKey(entry)===key);return item&&sharedProfile.draftConflict(value,item)}),dirty=[...dirtyFiles,...(Object.keys(draft).length?['move values']:[]),...(profileEntries.length?[profileConflict?'shared HitDef draft (source changed)':'shared HitDef draft']:[]),...(codeDraftStore.hasDrafts()?['connected code draft']:[])];$('headerMeta').textContent=move?'State '+state+' · AIR '+action+' · element '+(frame+1):'Exact source component';$('dirtyStatus').textContent=dirty.length?'Unsaved: '+dirty.join(', '):'Saved sources';$('dirtyStatus').classList.toggle('clean',!dirty.length)}
function renderProblems(){const items=move.problems||[],errors=items.filter(x=>x.level==='error').length,review=items.filter(x=>x.level==='warning'||x.level==='likely').length;$('problems').innerHTML='<details class="problems" '+(errors?'open':'')+'><summary>Problems · '+errors+' error'+(errors===1?'':'s')+' · '+review+' review</summary>'+(items.map((item,index)=>'<div class="problem '+esc(item.level||'info')+'"><b>'+esc(item.title||item.message||'Review')+'</b><br><span>'+esc(item.detail||item.message||'')+'</span><div class="code-actions"><button data-problem="'+index+'">Show source</button></div></div>').join('')||'<div class="problem info">No move-specific problems detected.</div>')+'<div class="problem info">Static timing checks are guidance. Conditional branches, animation changes, loops, and project systems can make different durations intentional; live training remains authoritative.</div></details>';document.querySelectorAll('[data-problem]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.problem)];if(Number.isInteger(item?.frameIndex)){frame=item.frameIndex;renderTimeline();renderHeader();draw();return}if(item?.sectionId){const target=[...document.querySelectorAll('.code-section')].find(x=>x.dataset.section===item.sectionId);if(target){target.open=true;target.scrollIntoView({block:'nearest'});saveState();return}}vscode.postMessage({type:'openProblem',sourceId:move.id,index:Number(button.dataset.problem)})})}
function syncCodeActions(root,section){const state=codeDraftStore.actionState(section),apply=root?.querySelector('[data-apply-code]'),discard=root?.querySelector('[data-discard-code]'),rebase=root?.querySelector('[data-rebase-code]');if(apply)apply.disabled=!state.canApply;if(discard)discard.disabled=!state.canDiscard;if(rebase)rebase.disabled=state.pending}
function renderCode(){const sections=move.codeSections||[],allSections=[...model.moves.flatMap(item=>item.codeSections||[]),...(model.behaviorComponents||[])],orphans=codeDraftStore.orphaned(allSections),remembered=new Set(saved.openCode||[]),hasRemembered=Array.isArray(saved.openCode),outerOpen=saved.connectedOpen!==false;$('codeSections').innerHTML='<details id="connectedCode" class="connected-code" '+(outerOpen?'open':'')+'><summary>Connected code · '+sections.length+'</summary><p class="muted">Only the selected move’s state and directly connected functions are shown. Shared functions can affect other moves. Apply edits into the open document, then use normal Undo and Save.</p>'+orphans.map((item,index)=>'<div class="problem error"><b>Retained draft source block is no longer present.</b><br>'+esc(item.draft.filename||item.sectionId)+' · '+esc(item.draft.signature||item.draft.kind||'source block')+'<div class="code-actions"><button data-discard-orphan="'+index+'">Discard orphaned draft</button></div></div>').join('')+sections.map((section,index)=>{const state=codeDraftStore.actionState(section),open=remembered.has(section.id)||(!hasRemembered&&section.kind==='move-state');return '<details class="code-section" data-section="'+esc(section.id)+'" '+(open?'open':'')+'><summary>'+esc(section.title||section.kind)+' · '+esc(section.fileLabel||section.filename.split(/[\\/]/).pop())+(section.shared?' · shared':'')+(state.conflict?' · SOURCE CHANGED':'')+'</summary><p class="muted">'+esc(section.explanation||'')+(section.controllers?.length?'<br>Controllers: '+esc(section.controllers.join(', ')):'')+'</p>'+(state.conflict?'<div class="problem error"><b>Source changed after this draft began.</b><br>Compare the full source, then explicitly rebase or discard this retained draft. Apply is disabled.</div>':'')+'<textarea class="code-editor" data-code="'+index+'" spellcheck="false">'+esc(codeDraftStore.value(section))+'</textarea><div class="code-actions"><button data-apply-code="'+index+'" '+(!state.canApply?'disabled':'')+'>Apply to open document</button>'+(state.conflict?'<button data-rebase-code="'+index+'" '+(state.pending?'disabled':'')+'>Rebase onto current source</button>':'')+'<button data-discard-code="'+index+'" '+(!state.canDiscard?'disabled':'')+'>Discard draft</button><button data-open-code="'+index+'">Open full text</button></div></details>'}).join('')+'</details>';document.querySelectorAll('[data-code]').forEach(area=>area.oninput=()=>{const section=sections[Number(area.dataset.code)],root=area.closest('.code-section');codeDraftStore.stage(section,area.value);syncCodeActions(root,section);renderHeader()});document.querySelectorAll('[data-apply-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.applyCode)];if(codeDraftStore.apply(section)){$('status').textContent='Applying connected code…';syncCodeActions(button.closest('.code-section'),section)}});document.querySelectorAll('[data-discard-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.discardCode)];codeDraftStore.discard(section);renderCode();renderHeader()});document.querySelectorAll('[data-discard-orphan]').forEach(button=>button.onclick=()=>{codeDraftStore.discardId(orphans[Number(button.dataset.discardOrphan)].sectionId);renderCode();renderHeader()});document.querySelectorAll('[data-rebase-code]').forEach(button=>button.onclick=()=>{const section=sections[Number(button.dataset.rebaseCode)];codeDraftStore.rebase(section);renderCode();renderHeader()});document.querySelectorAll('[data-open-code]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'openCodeSection',sourceId:move.id,id:sections[Number(button.dataset.openCode)].id}));$('connectedCode').ontoggle=saveState;document.querySelectorAll('.code-section').forEach(x=>x.ontoggle=saveState)}
function render(){if(!move)return;$('character').textContent=model.character;$('moveTitle').textContent='— '+move.prefix;$('viewZoom').value=Math.round(viewZoom*100);$('viewZoomValue').textContent=Math.round(viewZoom*100)+'%';renderMoveList();renderFields();renderTimeline();renderOpponentControls();renderProblems();renderCode();renderHeader();draw();renderReaction();moveDrafts.notice()}
function handleCodeSectionFailed(message){if(moveDirectUi.current())return moveDirectUi.applyFailed(message.requestId);codeDraftStore.failed(message.requestId);if(move)renderCode();else moveOverviewUi.render();renderHeader();$('status').textContent='Connected-code apply was stopped; the draft is retained.'}function initialMoveSelection(){const requestedProfile=model.openReference?.profileId,savedMatches=!requestedProfile||saved.selectedMove===requestedProfile,restoreLegacy=saved.defPath===model.files.defPath&&savedMatches;return{id:requestedProfile||(saved.defPath===model.files.defPath?saved.selectedMove:model.moves[0]?.id),draft:restoreLegacy?saved.draft:undefined,frame:model.openReference?.frameIndex??(restoreLegacy?saved.selectedFrame:0)}}$('moveSearch').oninput=renderMoveList;$('play').onclick=togglePlay;$('previous').onclick=()=>{stop();advance(-1)};$('next').onclick=()=>{stop();advance(1)};$('showClsn1').onclick=()=>{showClsn1=!showClsn1;$('showClsn1').classList.toggle('active',showClsn1);draw()};$('showClsn2').onclick=()=>{showClsn2=!showClsn2;$('showClsn2').classList.toggle('active',showClsn2);draw()};$('followSpritePalette').checked=followSpritePalette;syncPalettePreviewStatus();$('followSpritePalette').onchange=e=>{followSpritePalette=e.target.checked;saveState();syncPalettePreviewStatus();if(move)renderTimeline();draw()};$('fitView').onclick=fitView;$('actualView').onclick=()=>setViewZoom(1);$('viewZoom').oninput=e=>setViewZoom(Number(e.target.value)/100);$('moveOverview').onclick=()=>vscode.postMessage({type:'moveOverview',sourceId:move.id,frameIndex:frame});$('airWorkspace').onclick=()=>vscode.postMessage({type:'airWorkspace',sourceId:move.id,frameIndex:frame});$('throwCreator').onclick=()=>vscode.postMessage({type:'throwCreator'});document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{mode=x.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===x));renderReaction()});$('linkedCode').onclick=()=>vscode.postMessage({type:'linkedCode',sourceId:move.id});$('openConstants').onclick=()=>vscode.postMessage({type:'open',file:'constants',sourceId:move.id});$('openAir').onclick=()=>vscode.postMessage({type:'open',file:'air',sourceId:move.id});$('launch').onclick=()=>vscode.postMessage({type:'launch'});$('refresh').onclick=()=>vscode.postMessage({type:'refresh'});$('advancedTools').open=Boolean(saved.advancedOpen);$('advancedTools').ontoggle=saveState;window.addEventListener('message',e=>{if(e.data.type==='model'){stop();const keep=move?.id,keepFrame=frame;model=e.data.model;imageCache.clear();selectMove(keep,undefined,keepFrame)}else if(e.data.type==='moveLabSelect'){const requested=model.moves.find(item=>item.id===e.data.reference?.profileId&&item.prefix===e.data.reference?.prefix);if(requested)selectMove(requested.id,undefined,e.data.reference.frameIndex)}else if(e.data.type==='profileApplied'){const key=profileDraftKey(e.data),next=sharedProfile.acknowledgeDraft(profileDrafts[key],e.data);if(next===null)delete profileDrafts[key];else if(next!==undefined)profileDrafts[key]=next;if(profilePending[key]?.requestId===e.data.requestId)delete profilePending[key];saveState();renderHeader()}else if(e.data.type==='profileFailed'){const key=profileDraftKey(e.data);if(profilePending[key]?.requestId===e.data.requestId)delete profilePending[key];renderReaction();renderHeader();if(e.data.text)$('status').textContent=e.data.text}else if(e.data.type==='status')$('status').textContent=e.data.text;else if(e.data.type==='codeSectionApplied'){codeDraftStore.acknowledge(e.data);renderHeader()}else if(e.data.type==='codeSectionFailed')handleCodeSectionFailed(e.data)});${require('./move_constants_drafts').clientScript()}${require('./move_code_drafts').clientScript()}const initialSelection=initialMoveSelection();selectMove(initialSelection.id,initialSelection.draft,initialSelection.frame);
$('showOpponent').onchange=e=>{opponentEnabled=e.target.checked;$('stage').classList.toggle('opponent',opponentEnabled);saveState();draw()};
$('reactionAction').onchange=e=>{reactionId=e.target.value;saveState();draw();renderReaction()};
$('opponentX').oninput=e=>{if(Number.isFinite(Number(e.target.value)))opponentWorldX=Number(e.target.value);saveState();draw()};
$('opponentY').oninput=e=>{if(Number.isFinite(Number(e.target.value)))opponentWorldY=Number(e.target.value);saveState();draw()};
$('resetOpponent').onclick=()=>{opponentWorldX=40;opponentWorldY=-1;renderOpponentControls();saveState();draw()};
const canvas=$('canvas');let pointer=null,drag=null;
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,dx:canvas.width/r.width,dy:canvas.height/r.height}}
function currentSparkPoint(){const f=move?.timeline?.frames?.[frame],baseX=canvas.width/2+panX,baseY=canvas.height*.8+panY,ox=baseX+(f?.x||0)*viewZoom,oy=baseY+(f?.y||0)*viewZoom;return f?sparkPoint(f,viewZoom,ox,oy):null}
function overSpark(e){const point=currentSparkPoint();if(!point)return null;const p=canvasPoint(e);return Math.hypot(p.x-point.x,p.y-point.y)<=18?point:null}
function overOpponent(e){if(!opponentEnabled)return false;const f=reactionFrame(),info=f?.image;if(!f||!info)return false;const p=canvasPoint(e),axis=opponentScreenPoint(),cx=axis.x+(f.x||0)*viewZoom,cy=axis.y+(f.y||0)*viewZoom,sx=(f.flags?.includes('H')?1:-1)*viewZoom,sy=(f.flags?.includes('V')?-1:1)*viewZoom,x1=cx-info.axisX*sx,x2=cx+(info.width-info.axisX)*sx,y1=cy-info.axisY*sy,y2=cy+(info.height-info.axisY)*sy;return p.x>=Math.min(x1,x2)&&p.x<=Math.max(x1,x2)&&p.y>=Math.min(y1,y2)&&p.y<=Math.max(y1,y2)}
const findSparkButton=document.createElement('button');findSparkButton.id='findSpark';findSparkButton.textContent='Find Spark';findSparkButton.title='Pan the view to the current hit spark without changing its values';$('actualView').after(findSparkButton);findSparkButton.onclick=()=>{const point=currentSparkPoint();if(!point){$('status').textContent='No hit spark is available on this frame.';return}panX+=canvas.width/2-point.x;panY+=canvas.height/2-point.y;saveState();draw();$('status').textContent='Centered the current hit spark without changing its X/Y values.'};
canvas.onpointerdown=e=>{pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);const spark=overSpark(e),mode=spark?'spark':overOpponent(e)?'opponent':'pan';if(mode==='spark')stop();drag={mode,x:e.clientX,y:e.clientY,opponentWorldX,opponentWorldY,panX,panY,sparkX:spark?.valueX,sparkY:spark?.valueY,sparkAnchorX:spark?.anchorX,sparkAnchorY:spark?.anchorY,xKey:spark?.xKey,yKey:spark?.yKey}};
canvas.onpointermove=e=>{if(e.pointerId===pointer&&drag){const p=canvasPoint(e),dx=(e.clientX-drag.x)*p.dx,dy=(e.clientY-drag.y)*p.dy;if(drag.mode==='spark'){const nextX=Math.round(drag.sparkX+dx/viewZoom),nextY=Math.round(drag.sparkY+dy/viewZoom);draft[drag.xKey]=nextX;draft[drag.yKey]=nextY;const xField=document.querySelector('[data-field="'+drag.xKey+'"]'),yField=document.querySelector('[data-field="'+drag.yKey+'"]');if(xField)xField.value=nextX;if(yField)yField.value=nextY;$('status').textContent='Spark position drafted. Apply both X and Y with their ✓ buttons when ready.';renderReaction();renderTimeline()}else if(drag.mode==='opponent'){opponentWorldX=drag.opponentWorldX+dx/viewZoom;opponentWorldY=drag.opponentWorldY+dy/viewZoom;$('opponentX').value=coordinateText(opponentWorldX);$('opponentY').value=coordinateText(opponentWorldY)}else{panX=drag.panX+dx;panY=drag.panY+dy}draw();return}canvas.style.cursor=overSpark(e)?'crosshair':overOpponent(e)?'move':'grab'};
const endDrag=e=>{if(e.pointerId!==pointer)return;const sparkEdited=drag?.mode==='spark';pointer=null;drag=null;canvas.style.cursor='grab';saveState();if(sparkEdited)moveDrafts.notice()};canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
canvas.onlostpointercapture=e=>{if(e.pointerId===pointer)endDrag(e)};
canvas.onwheel=e=>{e.preventDefault();setViewZoom(viewZoom*(e.deltaY<0?1.12:.89),e)};canvas.ondblclick=centerView;const previewResizeObserver=new ResizeObserver(()=>draw());previewResizeObserver.observe(canvas.parentElement);
</script></body></html>`;
  return page
    .replace('</style>',require('./move_behavior_browser').style()+'</style>')
    .replace('<button id="launch">Live Training Preview</button>', '<button id="launch">Live Training Preview</button><button id="moveTestAgain" title="Save a repeatable Test Session for the selected StateDef">Test this change again…</button>')
    .replace('</script></body>', "document.getElementById('moveTestAgain').onclick=()=>vscode.postMessage({type:'moveTestAgain'});</script></body>")
    .replace('<main class="layout">',require('./move_behavior_browser').markup()+'<main class="layout">')
    .replace('button,input,select{', 'button,input,select,textarea{')
    .replace('.grow{flex:1}', '.grow{flex:1}.header-meta,.dirty-status{padding:3px 7px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}.dirty-status.clean{opacity:.7}.advanced-tools{display:inline-flex;gap:4px;align-items:center}.advanced-tools summary{cursor:pointer}')
    .replace('.move-picker{margin-bottom:10px}', '.move-quick-access{margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border)}.move-quick-access .viewer-icon-toolbar{max-width:100%;margin-bottom:6px}.move-state-nav{display:flex;align-items:center;gap:4px}.move-state-nav input{flex:1;min-width:0;padding:0}.move-state-nav button{box-sizing:border-box;width:28px;height:28px;padding:0}.move-state-readout{margin-top:4px}.move-item:focus-visible,.frame:focus-visible,canvas:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}.move-picker{margin-bottom:10px}')
    .replace('grid-template-columns:360px minmax(480px,1fr) 300px', 'grid-template-columns:360px minmax(480px,1fr) 320px')
    .replace('.center{display:grid;grid-template-rows:minmax(350px,1fr) 150px;min-width:0}', '.center{display:grid;grid-template-rows:minmax(330px,1fr) 150px minmax(180px,auto);min-width:0;overflow:auto}.workbench{padding:8px;border-top:1px solid var(--vscode-panel-border)}')
    .replace('.category{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary{padding:7px;font-weight:700;cursor:pointer}', '.category,.code-section,.problems{margin:10px 0;border:1px solid var(--vscode-panel-border)}.category summary,.code-section summary,.problems summary{padding:7px;font-weight:700;cursor:pointer}')
    .replace('.field input,.field select{width:100%}', '.field-help{grid-column:2 / -1;color:var(--vscode-descriptionForeground);font-size:11px}.field input,.field select{width:100%}')
    .replace('.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}', '.field-actions{grid-column:2 / -1;display:flex;gap:5px;justify-content:flex-end}.code-actions{display:flex;gap:5px;padding:0 7px 5px;flex-wrap:wrap}.code-editor{display:block;width:calc(100% - 14px);min-height:150px;margin:0 7px 7px;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);white-space:pre;tab-size:4}.problem{padding:7px;border-top:1px solid var(--vscode-panel-border)}.problem.error{border-left:4px solid var(--vscode-errorForeground)}.problem.warning,.problem.likely{border-left:4px solid var(--vscode-charts-yellow)}.problem.info{border-left:4px solid var(--vscode-descriptionForeground)}')
    .replace('<header><b>Move Lab</b><span class="context">Constants integration</span><span id="character"></span><span id="moveTitle"></span>', '<header><b>Move Lab</b><span class="header-meta">Constants integration</span><span id="character"></span><span id="moveTitle"></span><span id="headerMeta" class="header-meta"></span><span id="dirtyStatus" class="dirty-status clean">Saved sources</span>')
    .replace('<div class="playback">', '<div class="playback" role="toolbar" aria-label="AIR preview controls">')
    .replace('<button id="fitView"', '<label title="Follow each frame’s own SFF palette. Turn off to preview the character’s assigned DEF palette across frames, reactions, and move cards."><input id="followSpritePalette" type="checkbox" checked> Follow Sprite Palette</label><span id="palettePreviewStatus" class="muted" role="status"></span><button id="fitView"')
    .replace('<div class="modes">', '<div class="modes" role="group" aria-label="Contact result mode">')
    .replace('<div id="moveList" class="move-list"></div>', '<div id="moveList" class="move-list" role="listbox" aria-label="Constants-backed moves"></div>')
    .replace('<h3>Move characteristics</h3>', '<div id="timingEvidence" class="card" aria-label="Authored timing and unknown runtime timing"></div><h3>Move characteristics</h3>')
    .replace('<div class="timeline" id="timeline"></div>', '<div class="timeline" id="timeline" role="listbox" aria-label="AIR elements"></div>')
    .replace('<canvas id="canvas"', '<canvas id="canvas" tabindex="0" role="application" aria-label="Move preview. Mouse wheel zooms; drag a hit spark or opponent; drag empty space to pan; double-click to center."')
    .replace('<div id="status" class="warning"></div>', '<div id="status" class="warning" role="status" aria-live="polite"></div>')
    .replace('<button id="airWorkspace">Edit in AIR Workspace</button>', '<button id="airWorkspace">Edit AIR / CLSN</button>')
    .replace("+fieldControl(f)+'<span class=\"field-actions\">", "+fieldControl(f)+'<div class=\"field-help\">'+esc(f.explanation||'')+'</div><span class=\"field-actions\">")
    .replace('<button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Common / Functions…</button><button id="openConstants">Constants</button><button id="openAir">AIR Text</button>', '<details id="advancedTools"><summary>Move tools</summary><button id="throwCreator" title="Coordinate P1 and P2 throw animations, binds, events, and parts">Throw Creator</button><button id="linkedCode">Find profile uses…</button><button id="openConstants">Constants text</button><button id="openAir">AIR text</button></details>')
    .replace('<div class="timeline" id="timeline" role="listbox" aria-label="AIR elements"></div></section>', '<div class="timeline" id="timeline" role="listbox" aria-label="AIR elements"></div><div class="workbench"><div id="problems"></div><div id="codeSections"></div></div></section>')
    .replace('<div class="stage"><canvas', '<div class="stage" id="stage"><canvas')
    .replace('<h3>Opponent reaction estimate</h3>', '<h3>Opponent reaction preview</h3><div class="opponent-controls"><label><input id="showOpponent" type="checkbox" checked> Show P2</label><select id="reactionAction" title="Choose an authored get-hit AIR action"></select><button id="resetOpponent" title="Return P2 to the default authored preview position">Reset</button></div><div class="opponent-controls"><label>World X <input id="opponentX" type="number" step="any"></label><label>World Y <input id="opponentY" type="number" step="any"></label></div><p class="muted">Drag the darkened P2 directly in the AIR canvas. Its authored/world coordinates stay unchanged when zooming; only its screen distance from the zoom pivot scales. Select standing-high, standing-low, crouching, or airborne reactions when those standard actions exist.</p><h3>Contact result</h3>')
    .replace('<div class="reaction" id="reaction"><div class="spark" id="spark"></div></div>', '')
    .replace('Spark X is defender-relative, so the canvas estimates contact from the leading edge of the active Clsn1.', 'Spark X is defender-relative. With P2 visible it follows the draggable defender axis; without P2 the canvas estimates contact from the leading edge of active Clsn1.')
    .replace('</style>', `${universalToolbarStyle()}.move-constants-content{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden}.move-constants-content .viewer-icon-toolbar{display:none!important}.overview-drawer{position:fixed;z-index:20;top:46px;bottom:0;left:0;width:min(460px,92vw);overflow:auto;padding:12px;background:var(--vscode-editor-background);border-right:1px solid var(--vscode-panel-border);box-shadow:5px 0 18px rgba(0,0,0,.35)}.overview-drawer[hidden],.direct-workspace[hidden],.layout[hidden]{display:none}.overview-heading,.direct-heading,.direct-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.overview-heading h2,.direct-heading h2{margin:0}.overview-drawer>input{width:100%;margin:8px 0}.overview-entry{display:block;width:100%;text-align:left;margin:4px 0}.overview-entry:disabled{opacity:.62;cursor:not-allowed}.problem-scope{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px;border-top:1px solid var(--vscode-panel-border)}.direct-workspace{flex:1;min-height:0;overflow:auto;padding:12px}.direct-heading{align-items:flex-start}.direct-component-active>header{min-height:35px;padding:5px 9px}@media(max-height:650px){.direct-visual{position:static!important}.direct-grid .code-editor{height:28vh;min-height:160px}.direct-visual-stage{height:190px!important;min-height:190px}}.direct-source-tools{position:relative;margin:0!important}.direct-source-tools>summary{padding:5px;border:1px solid var(--vscode-panel-border);cursor:pointer}.direct-source-tools[open]>div{position:absolute;right:0;top:100%;z-index:20;min-width:190px;padding:6px;display:flex;flex-direction:column;gap:5px;background:var(--vscode-editor-background,#171c24);border:1px solid var(--vscode-panel-border)}.direct-actions{flex-wrap:wrap;justify-content:flex-end}.direct-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:10px}.direct-source{white-space:pre-wrap;overflow:auto;max-height:55vh;padding:10px;background:var(--vscode-textCodeBlock-background);font-family:var(--vscode-editor-font-family)}@media(max-width:800px){.direct-grid{grid-template-columns:1fr}}${require('./move_lab_direct_preview').style()}</style>`)
    .replace('<body>', `<body>${universal}<div class="move-constants-content">`)
    .replace('<button id="moveOverview">Overview / Related Tools</button>', '<button id="moveOverview" title="Browse all discovered constants profiles and exact HitDef controllers without leaving this panel">Moves / Overview</button>')
    .replace('<button id="launch">Live Training Preview</button>', '')
    .replace("$('launch').onclick=()=>vscode.postMessage({type:'launch'});", '')
    .replace('<main class="layout">', '<aside id="overviewDrawer" class="overview-drawer" hidden aria-label="Moves and overview"></aside><section id="directWorkspace" class="direct-workspace" hidden aria-label="Exact code component"></section><main class="layout">')
    .replace('<aside class="rail left"><div class="move-picker"><h3>Attack library</h3>', '<aside class="rail left"><section id="moveQuickAccess" class="move-quick-access" aria-label="Move quick access"><div id="moveQuickActions"></div><div class="move-state-nav"><button id="moveQuickPrevious" title="Previous state or move" aria-label="Previous state or move">◀</button><input id="moveStateScroll" type="range" min="0" value="0" step="1" aria-label="State or move selection"><button id="moveQuickNext" title="Next state or move" aria-label="Next state or move">▶</button></div><div id="moveStateReadout" class="muted move-state-readout">No move selected</div></section><div class="move-picker"><h3>Attack library</h3>')
    .replace('function selectMove(id,restoredDraft,restoredFrame=0){stop();', 'function selectMove(id,restoredDraft,restoredFrame=0){moveDirectUi.clear();stop();')
    .replace('function render(){if(!move)return;', 'function render(){if(moveDirectUi.beforeRender()){syncMoveConstantsAccessibility();return}if(!move){moveOverviewUi.render();syncMoveConstantsAccessibility();return;}')
    .replace('renderMoveList();renderFields();renderTimeline();renderOpponentControls();renderProblems();renderCode();', 'renderMoveList();renderFields();moveOverviewUi.restoreCategories();renderTimeline();renderOpponentControls();moveOverviewUi.renderProblems();renderCode();moveOverviewUi.render();syncMoveConstantsAccessibility();')
    .replace("if(e.data.type==='model'){stop();const keep=move?.id,keepFrame=frame;model=e.data.model;imageCache.clear();selectMove(keep,undefined,keepFrame)}", "if(e.data.type==='model'){stop();const keep=move?.id,keepFrame=frame,direct=moveDirectUi.hasSelection(),sameOwner=model.files?.defPath===e.data.model.files?.defPath;model=e.data.model;if(!sameOwner){followSpritePalette=true;$('followSpritePalette').checked=true}imageCache.clear();syncPalettePreviewStatus();if(direct)moveDirectUi.modelChanged();else selectMove(keep,undefined,keepFrame)}")
    .replace('const initialSelection=initialMoveSelection();', `${require('./move_constants_overview').clientScript()}${require('./move_diagnosis_client').clientScript()}${require('./move_motion_inspector_client').clientScript()}${require('./move_variant_client').clientScript()}${require('./move_lab_direct_component').clientScript()}${moveConstantsAccessibilityClientScript()}const initialSelection=initialMoveSelection();`)
    .replace('selectMove(initialSelection.id,initialSelection.draft,initialSelection.frame);', 'if(model.openReference?.profileId){moveDirectUi.clear();selectMove(initialSelection.id,initialSelection.draft,initialSelection.frame)}else if(!moveDirectUi.hasSelection()&&!model.openReference?.componentReference)selectMove(initialSelection.id,initialSelection.draft,initialSelection.frame);moveDirectUi.restoreInitial();')
.replace('</script></body>', `globalThis.ikemenNavigationSelection=()=>move?{kind:'constants',id:move.id}:moveDirectUi.current()?{kind:'direct',componentReference:moveDirectUi.current().reference}:undefined;globalThis.ikemenCanRestoreNavigation=ref=>ref?.kind==='direct'?Boolean([...(model.directComponents||[]),...(model.behaviorComponents||[]),...(model.specialistComponents||[])].find(item=>moveDirectUi.matches(item,ref.componentReference))):Object.keys(draft).length===0&&Object.keys(profileDrafts).length===0&&model.moves.some(item=>item.id===ref?.id);globalThis.ikemenRestoreNavigation=ref=>{if(ref?.kind==='direct'){const item=[...(model.directComponents||[]),...(model.behaviorComponents||[]),...(model.specialistComponents||[])].find(candidate=>moveDirectUi.matches(candidate,ref.componentReference));if(!item)return false;moveDirectUi.select(item.reference);return true}selectMove(ref.id);return true};${universalToolbarClientScript({vscodeVariable:'vscode'})}${launchControlsClientScript()}${moveLabThrowHandoff.richClientScript()}addEventListener('message',event=>{if(event.data?.type==='ikemaker.move-constants.open-actions')document.querySelector('[data-toolbar-search]')?.click()});function installMoveQuickAccess(){const host=document.getElementById('moveQuickActions'),toolbar=document.querySelector('.viewer-icon-toolbar'),favorites=document.querySelector('.viewer-action-favorites-bar'),scroll=document.getElementById('moveStateScroll'),readout=document.getElementById('moveStateReadout');if(host&&toolbar)host.append(toolbar);if(host&&favorites)host.append(favorites);const sync=()=>{const index=Math.max(0,model.moves.findIndex(item=>item.id===move?.id));scroll.max=String(Math.max(0,model.moves.length-1));scroll.value=String(index);scroll.disabled=!model.moves.length;document.getElementById('moveQuickPrevious').disabled=!model.moves.length||index<=0;document.getElementById('moveQuickNext').disabled=!model.moves.length||index>=model.moves.length-1;readout.textContent=move?(index+1)+' / '+model.moves.length+' · State '+(move.values.moveID??'—')+' · '+move.prefix:'No constants-backed state selected'};const choose=index=>{const item=model.moves[Math.max(0,Math.min(model.moves.length-1,index))];if(item&&item.id!==move?.id)selectMove(item.id)};scroll.oninput=()=>{const index=Math.max(0,Math.min(model.moves.length-1,Number(scroll.value))),item=model.moves[index];if(item)readout.textContent=(index+1)+' / '+model.moves.length+' · State '+(item.values.moveID??'—')+' · '+item.prefix};scroll.onchange=()=>choose(Number(scroll.value));document.getElementById('moveQuickPrevious').onclick=()=>choose(Number(scroll.value)-1);document.getElementById('moveQuickNext').onclick=()=>choose(Number(scroll.value)+1);const originalSelectMove=selectMove;selectMove=(...args)=>{originalSelectMove(...args);sync()};sync()}installMoveQuickAccess();${require('./move_behavior_browser').clientScript()}</script></div></body>`);
}

function selectionEnvelope(owner) {
  const selected=owner?.displaySelection;if(!selected)return null;
  if(selected.kind==='constants')return {surfaceId:'move.constants',kind:'constants',id:selected.id,prefix:selected.prefix,frameIndex:Number(selected.frameIndex)||0};
  if(selected.kind==='direct'&&selected.componentReference)return {surfaceId:'move.constants',kind:'direct',componentReference:selected.componentReference};
  return null;
}
function claimContextSelection(owner) {
  const selection=selectionEnvelope(owner);if(!selection||!owner?.contextModel)return null;
  return owner.contextModel.update({selection,activeSurfaceId:'move.constants'});
}
function bindCharacterContext(owner) {
  const files=existingCharacterFiles(owner.assets),extras=files.filter(file=>identity(file)!==identity(owner.assets.defPath));
  owner.contextEntry=registerCharacterToolPanel(owner.panel,owner.assets.defPath,owner.model.character,extras);
  owner.contextModel=getContextModel(owner.contextEntry);return owner.contextModel;
}
async function sourceSnapshot(filename) {
  const absolute=path.resolve(filename),open=(vscode.workspace.textDocuments||[]).find(document=>identity(document.fileName)===identity(absolute)),document=open||await vscode.workspace.openTextDocument(absolute),text=document.getText(),sourceHash=hash(text);
  return {document,text,fingerprint:sourceHash,version:open?String(document.version??sourceHash):sourceHash};
}
async function resolveDisplaySource(owner) {
  const selected=owner?.displaySelection;if(!selected)return null;
  if(selected.kind==='constants'){
    const snapshot=await sourceSnapshot(owner.assets.constants),parsed=parseConstants(snapshot.text),move=moveGroups(parsed).find(item=>item.id===selected.id&&item.prefix===selected.prefix),declaration=move&&parsed.values.find(item=>item.name.toLowerCase().startsWith(move.prefix.toLowerCase()+'.'));
    if(!move||!declaration)return null;
    return {...snapshot,filename:owner.assets.constants,line:declaration.line,selectionKey:`constants:${move.id}:${move.prefix}`,label:`${move.prefix} · ${path.basename(owner.assets.constants)}`};
  }
  if(selected.kind==='direct'&&selected.componentReference){
    const refreshed=await shellModelFor(owner.assets);
    const component=validComponentReference(selected.componentReference,{components:componentPool(refreshed)},owner.assets.defPath);if(!component)return null;
    const snapshot=await sourceSnapshot(component.filename),line=Number.isInteger(component.startLine)?component.startLine:Number(component.line)||0;
    return {...snapshot,filename:component.filename,line,selectionKey:`direct:${component.kind}:${component.stableId||component.id}:${line}`,label:`${component.label||component.kind} · ${path.basename(component.filename)}`};
  }
  return null;
}
function sourceRequest(route,context) { return {uri:path.resolve(route.filename),line:route.line,version:route.version,fingerprint:route.fingerprint,selectionKey:route.selectionKey,contextId:context.identity,selectionRevision:context.selectionRevision,activeSurfaceId:context.activeSurfaceId}; }

function plainMessage(message) { return Boolean(message&&typeof message==='object'&&(Object.getPrototypeOf(message)===Object.prototype||Object.getPrototypeOf(message)===null)); }
function exactMessageKeys(message, required, optional=[]) {
  if(!plainMessage(message))return false;
  const allowed=new Set(['type',...required,...optional]),keys=Object.keys(message);
  return required.every(key=>Object.prototype.hasOwnProperty.call(message,key))&&keys.every(key=>allowed.has(key));
}
function validMoveBodyMessage(message) {
  if(['requestMoveDiagnosis','openMoveDiagnosisSource','importMoveDiagnosisEvidence','testMoveDiagnosisInput'].includes(message?.type))return require('./move_diagnosis_host').validDiagnosisMessage(message);
  if(['requestMoveMotionInspection','moveMotionSource','openMoveMotionOrbit'].includes(message?.type))return require('./move_motion_inspector_host').validMotionMessage(message);
  if(['moveLabThrowInspect','moveLabThrowReview','moveLabThrowContinue','moveLabThrowSource'].includes(message?.type))return require('./move_lab_workspace').validMoveLabMessage(message);
  if(!plainMessage(message)||typeof message.type!=='string')return false;
  try{if(JSON.stringify(message).length>300000)return false;}catch{return false;}
  const schemas={
    moveFormDraft:[['defPath','sourceId','draft'],[]],moveCodeDraft:[['defPath','sectionId','draft'],[]],moveIntegrationContext:[[],['sourceId','frameIndex','componentReference']],refresh:[[],[]],
    createMoveVariant:[[],['reference','sourceId','sourceHash']],selectDirectComponent:[['reference'],[]],saveDirectStateSource:[['reference'],[]],editDirectComponent:[['reference'],[]],openDirectComponent:[['reference'],[]],openDirectDiagnostic:[['reference','line'],[]],openSpecialistComponent:[['reference'],[]],openComponentAir:[['reference'],[]],openComponentAirAction:[['reference','action'],[]],previewComponentAirAction:[['reference','action','requestId'],[]],previewStateControllerCreate:[['reference','kind','targetState','action','resourceId'],[]],applyStateControllerCreate:[['token'],[]],discardStateControllerCreate:[['token'],[]],openProjectileAirRoute:[['route'],[]],openStateAnimationRoute:[['route'],[]],openStateChangeAnimationRoute:[['route'],[]],openStatePlaySoundRoute:[['route'],[]],openProjectileResourceRoute:[['route'],[]],openProjectileStateRoute:[['route'],[]],openHelperStateRoute:[['route'],[]],navigateHelperStateRoute:[['route'],[]],navigateHelperComponent:[['direction'],['reference','token']],openStateTransitionRoute:[['route'],[]],openFunctionCallRoute:[['route'],[]],openCommandUsageRoute:[['route'],[]],openProjectSymbolRoute:[['route'],[]],previewProjectileEdit:[['reference','values'],[]],applyProjectileEdit:[['token'],[]],discardProjectileEdit:[['reference'],[]],openBehaviorMaps:[['reference'],[]],openComponentKnowledge:[['reference'],[]],openComponentStructure:[['reference'],[]],openComponentRecommendations:[['reference'],[]],openComponentLifecycleSite:[['reference','siteId','fingerprint'],[]],initializeHelperMap:[['reference'],[]],
    overviewAttack:[['reference'],[]],overviewProfile:[['reference'],[]],overviewProblem:[['reference'],[]],
    moveBehaviorCreateOverride:[['state'],[]],moveCommandTriggerRecipes:[[],[]],moveTestAgain:[[],[]],moveOverview:[[],['sourceId','frameIndex']],airWorkspace:[[],['sourceId','frameIndex']],throwCreator:[[],[]],linkedCode:[['sourceId'],[]],open:[['file','sourceId'],['suffix']],launch:[[],[]],
    apply:[['defPath','sourceId','name','suffix','base','value'],[]],applyProfile:[['requestId','sourceId','index','filename','line','name','base','sourceHash','value','draftRevision','draftBase','draftSourceHash'],[]],importAirTiming:[['sourceId'],[]],frameTimingMenu:[['sourceId','element'],[]],copyFields:[['sourceId','suffixes'],['values']],
    moveFollowupSource:[['sourceId','index'],[]],openProfileSource:[['filename','line'],[]],openProblem:[['sourceId','index'],[]],openCodeSection:[['sourceId','id'],[]],applyCodeSection:[['sourceId','id','requestId','text','baseHash'],['componentReference','helperMapPlan']],
    viewerSelectionChanged:[[],['navigationSelection']],playerNavigate:[['command'],[]],
    ikemenMakeBackup:[[],[]],ikemenToggleAutoSave:[[],[]],viewerUsedBy:[['navigationSelection'],[]],viewerHistory:[['direction','navigationSelection'],[]],viewerBackToSource:[['navigationSelection'],[]],ikemenViewer:[['target','navigationSelection'],['comparisonPreview']],ikemenLaunch:[['mode'],[]],ikemenRelatedWork:[[],[]],viewerHistoryRestored:[['requestId','ok'],[]],
    ikemenCloseState:[['id','clean','busy','canKeepDraft','verified'],[]],ikemenPresetState:[['id','reference'],[]],ikemenMaps:[['target','navigationSelection'],[]],ikemenMapInsertResult:[['ok'],['reason']],viewerToolbarCrossSurfaceResult:[['requestId','ok'],['reason']],viewerToolbarCrossSurface:[['source','target','actionId','requestId','busy','safeToLeave','navigationSelection'],[]],
    // F3 retirement debt: restored old webviews may still send this exact,
    // host-allowlisted alias. New clients emit viewerToolbarAction only.
    viewerToolbarCommand:[['command','seed'],[]],
    viewerToolbarReady:[['surface','mode'],[]],viewerToolbarSave:[['surface','mode','preferences'],[]],viewerToolbarActivityReady:[['surface'],[]],viewerToolbarActivitySave:[['surface','activity'],[]],assetWorkspaceOptions:[[],[]],assetWorkspaceReady:[[],[]],assetWorkspaceCaptured:[['id','clean','state','reference','fields','scroll'],[]],viewerLayoutReady:[['surface','mode'],['initial']],viewerLayoutSave:[['surface','mode','layout'],['name']],viewerLayoutReset:[['surface','mode'],[]],ikemenModeReady:[[],[]]
  };
  const schema=schemas[message.type];if(!schema||!exactMessageKeys(message,schema[0],schema[1]))return false;
  if(message.type==='previewStateControllerCreate')return ['helper','explod','projectile'].includes(message.kind)&&plainMessage(message.reference)&&Number.isSafeInteger(message.resourceId)&&message.resourceId>=0&&message.resourceId<=2147483647&&(message.kind==='helper'?Number.isSafeInteger(message.targetState)&&message.targetState>=0&&message.targetState<=2147483647&&message.action===null:message.targetState===null&&Number.isSafeInteger(message.action)&&message.action>=0&&message.action<=2147483647);
  if(['applyStateControllerCreate','discardStateControllerCreate'].includes(message.type))return typeof message.token==='string'&&/^[0-9a-f-]{36}$/i.test(message.token);
  if(message.type==='createMoveVariant')return message.reference?plainMessage(message.reference)&&!Object.prototype.hasOwnProperty.call(message,'sourceId')&&!Object.prototype.hasOwnProperty.call(message,'sourceHash'):typeof message.sourceId==='string'&&message.sourceId.length<=512&&typeof message.sourceHash==='string'&&/^[a-f0-9]{64}$/.test(message.sourceHash);
  if(message.type==='navigateHelperStateRoute')return typeof message.route==='string'&&/^[0-9a-f]{48}$/.test(message.route);
  if(message.type==='navigateHelperComponent')return message.direction==='return'?typeof message.token==='string'&&/^[0-9a-f]{48}$/.test(message.token)&&!Object.prototype.hasOwnProperty.call(message,'reference'):['creator','spawn','origin'].includes(message.direction)&&plainMessage(message.reference)&&!Object.prototype.hasOwnProperty.call(message,'token');
  return true;
}

async function showDef(owner) {
  const document=await vscode.workspace.openTextDocument(owner.assets.defPath);
  if(session!==owner)return null;
  await vscode.window.showTextDocument(document,{preview:false});return document;
}
function createMoveToolbar(owner, services = {}) {
  const exactSources=services.exactSources||new ExactSourceRegistry(),navigation=services.navigation||require('./viewer_navigation'),isCurrent=services.isCurrent||(()=>session===owner),resolveSource=services.resolveSource||resolveDisplaySource;
  exactSources.register({id:'move-constants.exact-source',capabilityId:'implemented.move-constants-source',surfaceId:'move.constants',resolve:async request=>{
    if(!isCurrent())return unavailable('This Move Lab session is no longer current.',request);
    const route=await resolveSource(owner),context=owner.contextModel?.snapshot(),selection=selectionEnvelope(owner);
    if(!isCurrent()||!route||!context||!selection)return unavailable('The selected Move Lab source is no longer available.',request);
    const shared=context.selection;
    if(request.contextId!==context.identity||request.selectionRevision!==context.selectionRevision||request.activeSurfaceId!=='move.constants'||context.activeSurfaceId!=='move.constants'||shared?.surfaceId!=='move.constants'||JSON.stringify(shared)!==JSON.stringify(selection))return unavailable('The Move Lab selection changed before its source could be opened.',request);
    if(request.uri!==path.resolve(route.filename)||request.line!==route.line||request.version!==route.version||request.fingerprint!==route.fingerprint||request.selectionKey!==route.selectionKey)return unavailable('The selected source changed before it could be opened.',request);
    return{available:true,filename:route.filename,line:route.line,identity:'selected-block',fingerprint:route.fingerprint,version:route.version,label:route.label,access:'external-editor',mutationOwner:'native-text-editor',contextId:context.identity,selectionRevision:context.selectionRevision};
  }});
  const openExactSource=async()=>{
    const route=await resolveSource(owner),context=owner.contextModel?.snapshot();
    if(!route||!context){vscode.window.showInformationMessage('Select an exact constants profile or direct component first.');return;}
    let result;try{result=await exactSources.open('move-constants.exact-source',sourceRequest(route,context),async resolved=>{
      const document=await vscode.workspace.openTextDocument(resolved.filename),text=document.getText(),currentFingerprint=hash(text),currentVersion=String(document.version??currentFingerprint),versionMatches=resolved.version===resolved.fingerprint||resolved.version===currentVersion;
      if(currentFingerprint!==resolved.fingerprint||!versionMatches)throw new Error('The source changed while it was opening. Nothing was navigated.');
      const line=Math.max(0,Math.min(document.lineCount-1,resolved.line||0));
      return navigation.openReferenceSource({filename:resolved.filename,line,character:0,text:document.lineAt(line).text},navigation.currentPoint(owner.assets.defPath,'constants',{navigationSelection:selectionEnvelope(owner)},owner.panel));
    });}catch(error){vscode.window.showInformationMessage(error.message);return unavailable(error.message,sourceRequest(route,context));}
    if(!result.available)vscode.window.showInformationMessage(result.reason);return result;
  };
  const command=(id,seed=true)=>async()=>vscode.commands.executeCommand(id,...(seed?[vscode.Uri.file(owner.assets.defPath)]:[]));
  const launch=id=>async()=>{if(!await showDef(owner))return;return vscode.commands.executeCommand(id);};
  const connected=target=>async()=>navigation.openConnected(owner.assets.defPath,target,selectionEnvelope(owner),undefined,navigation.currentPoint(owner.assets.defPath,'constants',{navigationSelection:selectionEnvelope(owner)},owner.panel));
  const handlers={
    new:command('ikemen.text.createNew',false),open:command('workbench.action.files.openFile',false),close:async()=>{if(await (services.viewerClose||require('./viewer_close')).prepare([owner.panel],vscode)&&isCurrent())owner.panel.dispose();},
    'text-source':openExactSource,'connected-resources':async()=>{const files=existingCharacterFiles(owner.assets),picked=await vscode.window.showQuickPick(files.map(file=>({label:path.basename(file),description:file,file})),{title:`${owner.model.character} — Connected Resources`,placeHolder:'Open an assigned file in the native text editor'});if(picked&&session===owner)return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(picked.file),{preview:false});},
    backup:command('ikemen.makeBackup'),recovery:command('ikemen.mutations.openHistory'),run:launch('ikemen.launchGame'),versus:launch('ikemen.launchMirrorCurrent'),training:launch('ikemen.launchTrainingCurrent'),project:command('ikemen.projectManager.open',false),stage:command('ikemen.stage.openWorkspace'),
    sprites:connected('sff'),animations:connected('air'),sounds:connected('snd'),commands:command('ikemen.commandMovelist.openEditor'),states:command('zss.openControllers'),palettes:command('ikemen.palette.openWorkspace'),'code-structure':command('ikemen.codeStructure.openWorkspace'),
    'viewer-browser':async()=>{if(owner.panel.active===true)claimContextSelection(owner);return vscode.commands.executeCommand('ikemen.authoringBrowser.open');},'actions-search':async()=>owner.panel.webview.postMessage({type:'ikemaker.move-constants.open-actions'}),'suite-switch':command('ikemen.switchSuite',false),help:command('ikemen.help.open',false),settings:command('ikemen.openExtensionSettings',false)
  };
  return createUniversalToolbarDispatcher({handlersBySurface:{'move.constants':handlers},getToolbar:async()=>moveToolbarModel(owner)});
}

function assetAssignmentKey(value){return JSON.stringify([value.constants,value.air,value.sff,value.snd,value.commands,value.code]);}
function refreshAssets(owner) {
 const assets=owner.assets,document=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&identity(item.fileName)===identity(assets.defPath));
 // An unsaved DEF cannot authorize a new source graph. Saved reassignment is
 // rebuilt before any new exact route is issued, preserving retained drafts.
 if(document?.isDirty)return assets;
 const current=characterShellAssets(assets.defPath);
 return assetAssignmentKey(current)===assetAssignmentKey(assets)?assets:current;
}
async function refresh() { const owner=session,assets=owner?.assets;if(!owner)return;const updatedAssets=refreshAssets(owner),model=owner.shell?await shellModelFor(updatedAssets):await modelFor(updatedAssets);if(session!==owner||owner.assets!==assets||assetAssignmentKey(refreshAssets(owner))!==assetAssignmentKey(updatedAssets))return;owner.assets=updatedAssets;owner.helperMapPlans?.clear();if(updatedAssets!==assets){owner.projectileEditPreviews?.clear();bindCharacterContext(owner);}decorateProjectileModel(owner,model);owner.model=model;owner.panel.webview.postMessage({type:'model',model});return model; }
async function applyMoveValues(sourceId, values, statusText, owner=session, expectedText, expectedAir) {
  if(session!==owner)return;
  const current = await currentText(owner.assets.constants), moves = moveGroups(parseConstants(current)), move = moves.find((item) => item.id === String(sourceId).toLowerCase());
  if (!move) throw new Error('The selected move is no longer present. Refresh and try again.');
  const applicable = Object.entries(values).filter(([suffix]) => Object.prototype.hasOwnProperty.call(move.values, suffix));
  if (!applicable.length) throw new Error('None of the selected timing fields exist in this move profile. Add the fields to the profile before importing AIR timing.');
  let next = current;
  for (const [suffix, value] of applicable) next = updateConstant(next, `${move.prefix}.${suffix}`, value);
  const document = await vscode.workspace.openTextDocument(owner.assets.constants);
  const airUnchanged=expectedAir===undefined||await currentText(owner.assets.air)===expectedAir;
  if(session!==owner)return;
  if(!airUnchanged)throw new Error('The AIR changed while choosing timing. Refresh and review before applying.');
  if(document.getText()!==current||(expectedText!==undefined&&current!==expectedText))throw new Error('The constants changed while choosing timing. Refresh and review before applying.');
  const edit = new vscode.WorkspaceEdit(), last = document.lineAt(document.lineCount - 1);
  edit.replace(document.uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), next); if(!await vscode.workspace.applyEdit(edit)||session!==owner)return;
  owner.panel.webview.postMessage({ type: 'status', text: statusText }); return refresh();
}
async function openMoveSource(message) {
  const owner=session,assets=owner?.assets;if(!owner)return;
  const move = owner.model.moves.find(item => item.id === message.sourceId);
  if (!move) return;
  let filename = assets[message.file], line = 0;
  if (message.type === 'linkedCode') {
    const files = require('./related_work').resolveAssigned(assets.defPath).code;
    const matches = [];
    for (const file of files.filter(file => file !== assets.constants)) {
      const lines = (await currentText(file)).split(/\r?\n/);
      lines.forEach((text, index) => { if (text.toLowerCase().includes(move.prefix.toLowerCase())) matches.push({label: path.basename(file) + ':' + (index + 1), description: text.trim(), filename: file, line: index}); });
    }
    if (!matches.length) return vscode.window.showInformationMessage('No connected code refers directly to this move prefix. Use Text Editors to browse the assigned files.');
    const picked = await vscode.window.showQuickPick(matches, {title: 'Open code using ' + move.prefix, matchOnDescription: true});
    if (!picked) return;
    filename = picked.filename; line = picked.line;
  } else if (message.file === 'constants') {
    const parsed = parseConstants(await currentText(filename));
    const declaration = message.suffix ? parsed.byName.get((move.prefix + '.' + message.suffix).toLowerCase()) : parsed.values.find(item => item.name.toLowerCase().startsWith(move.prefix.toLowerCase() + '.'));
    if (!declaration) return vscode.window.showInformationMessage('The selected constant is no longer present. Refresh the viewer.');
    line = declaration.line;
  } else if (message.file === 'air') {
    const action = require('./gif_air_model').actionRange(await currentText(filename), move.timeline.actionNumber);
    if (!action) return vscode.window.showInformationMessage('This animation is not present in the assigned AIR.');
    line = action.start;
  } else return;
  const document=await vscode.workspace.openTextDocument(filename), navigation=require('./viewer_navigation');
  if(session!==owner||owner.assets!==assets)return;
  return navigation.openReferenceSource({filename,line,character:0,text:document.lineAt(line).text},navigation.currentPoint(assets.defPath,'constants',{navigationSelection:{id:move.id}},owner.panel));
}

async function openAirProblem(owner, member) {
  const move = owner.model.moves.find(item => item.id === member.sourceId);
  if (!move || !Number.isInteger(member.frameIndex) || member.actionNumber !== move.timeline?.actionNumber) return;
  const document = await vscode.workspace.openTextDocument(owner.assets.constants), parsed = parseConstants(document.getText()), declaration = parsed.byName.get((move.prefix + '.moveID').toLowerCase());
  if (!declaration || session !== owner) return;
  return require('./viewer_navigation').openConnected(owner.assets.constants, 'air', { group: member.actionNumber, frameIndex: member.frameIndex }, { filename: owner.assets.constants, line: declaration.line, character: 0, text: document.lineAt(declaration.line).text }, require('./viewer_navigation').currentPoint(owner.assets.defPath, 'constants', { navigationSelection: { id: move.id } }, owner.panel));
}

function codeSectionFor(owner, sourceId, id) {
  const move = owner.model.moves.find(item => item.id === sourceId);
  return move?.codeSections?.find(item => item.id === id);
}
async function openSourceLocation(owner, filename, line = 0, extraProvenSources = []) {
  const allowed = new Set([owner.assets.constants, owner.assets.air, ...(owner.assets.code || []),...extraProvenSources].filter(Boolean).map(file => path.resolve(file).toLowerCase()));
  if (!filename || !allowed.has(path.resolve(filename).toLowerCase())) return;
  const document = await vscode.workspace.openTextDocument(filename);
  if (session !== owner || owner.assets !== session.assets) return;
  const safeLine = Math.max(0, Math.min(document.lineCount - 1, Number(line) || 0));
  return require('./viewer_navigation').openReferenceSource({ filename, line: safeLine, character: 0, text: document.lineAt(safeLine).text }, require('./viewer_navigation').currentPoint(owner.assets.defPath, 'constants', {}, owner.panel));
}

async function openProjectileAirRoute(owner,route){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Projectile animation route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 let current=currentProjectileRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The Projectile, character assignment, or AIR action changed. Refresh Move Lab before opening it.');
 const exactAuthority=Object.freeze({schema:'ikemaker.air-action-authority',version:1,defPath:current.authority.defPath,defHash:current.authority.defHash,filename:current.authority.airPath,sourceHash:current.authority.airHash,action:current.authority.action,line:current.authority.line,actionHash:current.authority.actionHash,origin:Object.freeze({schema:'ikemaker.related-source-authority',version:1,identity:current.authority.componentIdentity,filename:current.authority.sourcePath,sourceHash:current.authority.sourceHash,startLine:current.authority.startLine,endLine:current.authority.endLine,rangeHash:current.authority.rangeHash})});
 const document=await vscode.workspace.openTextDocument(vscode.Uri.file(current.authority.airPath));if(session!==owner||owner.disposed)return;
 current=currentProjectileRoute(owner,record,{requireActive:true});if(!current||hash(document.getText())!==current.authority.airHash)return vscode.window.showWarningMessage('The exact Projectile AIR action changed while its source was opening, or Move Lab is no longer active. Nothing stale was selected.');
 const result=await vscode.commands.executeCommand('air.openAnimationPreview',vscode.Uri.file(current.authority.airPath),{action:current.authority.action,exactAuthority,preserveFocus:false});if(session!==owner||owner.disposed)return result;
 if(!currentProjectileRoute(owner,record))vscode.window.showWarningMessage('The Projectile source or assignment changed during AIR navigation. Refresh Move Lab before navigating again.');return result;
}

async function openStateAnimationRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact StateDef animation route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&owner.panel?.active===true&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),openPreview=services.openPreview||((uri,options)=>vscode.commands.executeCommand('air.openAnimationPreview',uri,options));if(!active())return;
 let current=currentStateAnimationRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The selected StateDef, its authored default animation, or assigned AIR changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.airPath));if(!active())return;current=currentStateAnimationRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.airPath)||hash(document.getText())!==current.authority.airHash)return vscode.window.showWarningMessage('The assigned AIR changed while opening. Nothing stale was selected.');
 const authority=current.authority,exactAuthority=Object.freeze({schema:'ikemaker.air-action-authority',version:1,defPath:authority.defPath,defHash:authority.defHash,filename:authority.airPath,sourceHash:authority.airHash,action:authority.action,line:authority.line,actionHash:authority.actionHash,origin:stateAnimationTargetOrigin(authority)}),result=await openPreview(vscode.Uri.file(authority.airPath),{action:authority.action,exactAuthority,preserveFocus:false});if(!active())return result;
 if(!currentStateAnimationRoute(owner,record))vscode.window.showWarningMessage('The StateDef source or AIR assignment changed during navigation. Refresh Move Lab before navigating again.');return result;
}

async function openStateChangeAnimationRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact ChangeAnim route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&owner.panel?.active===true&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),openPreview=services.openPreview||((uri,options)=>vscode.commands.executeCommand('air.openAnimationPreview',uri,options));if(!active())return;
 let current=currentStateChangeAnimationRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The selected StateDef, authored ChangeAnim, or assigned AIR changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.airPath));if(!active())return;current=currentStateChangeAnimationRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.airPath)||hash(document.getText())!==current.authority.airHash)return vscode.window.showWarningMessage('The assigned AIR changed while opening. Nothing stale was selected.');
 const authority=current.authority,exactAuthority=Object.freeze({schema:'ikemaker.air-action-authority',version:1,defPath:authority.defPath,defHash:authority.defHash,filename:authority.airPath,sourceHash:authority.airHash,action:authority.action,line:authority.line,actionHash:authority.actionHash,origin:stateChangeAnimationTargetOrigin(authority)}),result=await openPreview(vscode.Uri.file(authority.airPath),{action:authority.action,exactAuthority,preserveFocus:false});if(!active())return result;
 if(!currentStateChangeAnimationRoute(owner,record))vscode.window.showWarningMessage('The ChangeAnim source or AIR assignment changed during navigation. Refresh Move Lab before navigating again.');return result;
}

async function openStatePlaySoundRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact PlaySnd route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&owner.panel?.active===true&&record?.authority?.generation===owner.projectileGeneration,openPreview=services.openPreview||((uri,reference,authority)=>vscode.commands.executeCommand('snd.openExactSoundPreview',uri,reference,authority));if(!active())return;
 let current=currentStatePlaySoundRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The selected StateDef, authored PlaySnd, or assigned SND changed. Refresh Move Lab before opening it.');const authority=current.authority,exactAuthority=Object.freeze({schema:'ikemaker.snd-sound-authority',version:1,defPath:authority.defPath,defHash:authority.defHash,filename:authority.sndPath,sourceHash:authority.sndHash,group:authority.group,index:authority.index,archiveIndex:authority.archiveIndex,identityHash:authority.identityHash,origin:statePlaySoundTargetOrigin(authority)}),reference={group:authority.group,index:authority.index},result=await openPreview(vscode.Uri.file(authority.sndPath),reference,exactAuthority);if(!active())return result;
 current=currentStatePlaySoundRoute(owner,record);if(!current||current.authority.sndHash!==authority.sndHash)vscode.window.showWarningMessage('The PlaySnd source or SND assignment changed during navigation. Refresh Move Lab before navigating again.');return result;
}

async function openProjectileResourceRoute(owner,route){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Projectile resource route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 let current=currentProjectileResourceRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The Projectile, character assignment, or referenced resource changed. Refresh Move Lab before opening it.');
 const authority=current.authority,origin=Object.freeze({schema:'ikemaker.related-source-authority',version:1,controllerKind:'projectile',resourceField:true,identity:authority.componentIdentity,filename:authority.sourcePath,sourceHash:authority.sourceHash,startLine:authority.startLine,endLine:authority.endLine,rangeHash:authority.rangeHash,syntax:authority.syntax,field:authority.field,expression:authority.expression});
 if(authority.kind==='air')await vscode.workspace.openTextDocument(vscode.Uri.file(authority.targetPath));if(session!==owner||owner.disposed)return;
 current=currentProjectileResourceRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The exact Projectile resource changed while its file was opening, or Move Lab is no longer active. Nothing stale was selected.');
 let result;if(authority.kind==='air'){
  const exactAuthority=Object.freeze({schema:'ikemaker.air-action-authority',version:1,defPath:authority.defPath,defHash:authority.defHash,filename:authority.targetPath,sourceHash:authority.targetHash,action:authority.action,line:authority.line,actionHash:authority.targetIdentityHash,origin});
  result=await vscode.commands.executeCommand('air.openAnimationPreview',vscode.Uri.file(authority.targetPath),{action:authority.action,exactAuthority,preserveFocus:false});
 }else{
  const exactAuthority=Object.freeze({schema:'ikemaker.snd-sound-authority',version:1,defPath:authority.defPath,defHash:authority.defHash,filename:authority.targetPath,sourceHash:authority.targetHash,group:authority.group,index:authority.index,archiveIndex:authority.archiveIndex,identityHash:authority.targetIdentityHash,origin});
  result=await vscode.commands.executeCommand('snd.openExactSoundPreview',vscode.Uri.file(authority.targetPath),{group:authority.group,index:authority.index},exactAuthority);
 }
 if(session!==owner||owner.disposed)return result;if(!currentProjectileResourceRoute(owner,record))vscode.window.showWarningMessage('The Projectile source or character assignment changed during resource navigation. Refresh Move Lab before navigating again.');return result;
}

async function openProjectileStateRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Projectile state route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&owner.panel?.active===true&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),showDocument=services.showDocument||((document,options)=>vscode.window.showTextDocument(document,options));if(!active())return vscode.window.showWarningMessage('The Projectile selection is no longer active. Nothing stale was opened.');
 let current=currentProjectileStateRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The Projectile, character assignment, or destination StateDef changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.targetPath));if(!active())return;current=currentProjectileStateRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.targetPath)||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The destination source changed while opening. Nothing stale was selected.');
 const editor=await showDocument(document,{preview:false});if(!active())return;current=currentProjectileStateRoute(owner,record,{requireActive:true});if(!current||editor.document!==document||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The exact Projectile state authority changed before reveal. Nothing stale was selected.');
 const start=document.positionAt(current.authority.targetStart),end=document.positionAt(current.authority.targetEnd),range=new vscode.Range(start,end);editor.selection=new vscode.Selection(start,end);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);return{available:true,filename:current.authority.targetPath,state:current.authority.state,line:current.authority.targetLine};
}

function variantSnapshot(owner,message){
 if(session!==owner||owner.disposed)throw Error('This Move Lab session changed.');
 const assets=owner.assets,updated=refreshAssets(owner);if(assetAssignmentKey(updated)!==assetAssignmentKey(assets))throw Error('Character resource assignments changed. Refresh Move Lab.');
 const snapshot=projectileAuthoritySnapshot(owner,owner.projectileGeneration);if(snapshot.defDirty||!snapshot.inventoryComplete||!snapshot.stateSnapshot||snapshot.sources.some(source=>!source.available))throw Error('Save/revert the DEF and repair the complete assigned state inventory before creating a variant.');
 const direct=directComponentModel({...assets,code:snapshot.assignedSources},vscode.workspace.textDocuments||[],[]);if(direct.failures.length)throw Error('Assigned source inspection is incomplete. No variant can be certified.');
 let component;if(message.reference){if(owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,message.reference))throw Error('The selected exact move changed.');component=validComponentReference(message.reference,{components:direct.behaviors},assets.defPath);}
 else{if(owner.displaySelection?.kind!=='constants'||owner.displaySelection.id!==message.sourceId||message.sourceHash!==owner.model.timingSources?.constants||hash(currentTextSync(assets.constants))!==message.sourceHash)throw Error('The selected constants profile changed.');const profile=owner.model.moves.find(item=>item.id===message.sourceId),number=profile?.values?.moveID;const matches=Number.isSafeInteger(number)&&number>=0?direct.behaviors.filter(item=>item.kind==='state'&&require('./state_controller_creation').literalStateNumber(item.signature)===number):[];if(matches.length!==1)throw Error('This constants profile has no unique literal moveID StateDef. Choose its exact authored StateDef to create a variant.');component=matches[0];}
 if(!component||component.kind!=='state')throw Error('Choose one current authored StateDef or a constants move with a unique literal moveID StateDef.');
 return{defPath:assets.defPath,defText:snapshot.defText,folder:assets.folder||path.dirname(assets.defPath),inventoryComplete:true,sources:snapshot.sources,components:direct.behaviors,component,airPath:snapshot.airPath,airText:snapshot.airText,commandPath:snapshot.commandPath};
}
async function createSelectedMoveVariant(owner,message){return require('./move_variant_host').createVariant(owner,message,{
 async runtimeCatalog(target) {
   const runtime = require('./stage_runtime_state_catalog');
   const catalog = await runtime.loadRuntimeStateCatalog(vscode, target.assets.defPath, { interactive: false });
   const ids = new Set();
   for (const entry of catalog.entries || []) {
     for (const declaration of entry.declarations || []) {
       if (Number.isSafeInteger(declaration.value)) ids.add(declaration.value);
     }
   }
   // These common movement, guard and damage states are unsafe fallback destinations
   // even when the target project's full config could not be resolved.
   if (!catalog.complete) for (const id of [0, 10, 11, 12, 20, 40, 50, 52, 120, 5000, 5150]) ids.add(id);
   const cleanOpenedDocuments=new Set();
   return { ids, complete: catalog.complete, check: runtime.catalogProof(vscode, catalog,{allowCleanOpenedDocuments:cleanOpenedDocuments}),allowCleanOpen:document=>cleanOpenedDocuments.add(document) };
 },
 api:vscode,active:target=>session===target&&!target.disposed&&target.panel?.active===true,snapshot:variantSnapshot,hasDraft:(target,component)=>Boolean(codeFormDrafts.read(codeDraftKey(target.assets.defPath,component.stableId))),post:(target,value)=>target.panel.webview.postMessage(value),
 refresh:async(target,plan)=>{if(session!==target||target.disposed)return;await refresh();const created=(target.model.behaviorComponents||[]).filter(item=>item.kind==='state'&&require('./state_controller_creation').literalStateNumber(item.signature)===plan.newState);if(created.length===1){target.displaySelection={kind:'direct',componentReference:created[0].reference};await target.panel.webview.postMessage({type:'directComponentSelect',reference:created[0].reference});}},
 openCommand:request=>require('./command_movelist_workspace').openVariantCommandDraft(request)
});}

function helperNavigationRouter(){
 return require('./move_lab_helper_navigation').createRouter({
  active:owner=>session===owner&&!owner.disposed&&owner.panel?.active===true,
  snapshot:owner=>{const context=projectileAuthoritySnapshot(owner,owner.projectileGeneration);if(context.defDirty)return{unavailable:'Save or revert the character DEF before exact Helper navigation.'};if(!context.inventoryComplete)return{unavailable:'The complete assigned Helper source inventory is unavailable or exceeds the inspection limit.'};const missing=context.sources.filter(source=>!source.available);if(missing.length)return{unavailable:'Assigned Helper source is unavailable: '+missing.slice(0,3).map(source=>path.basename(source.filename)).join(', ')};if(!context.stateSnapshot)return{unavailable:'The bounded assigned StateDef snapshot could not be built. Refresh Move Lab.'};const direct=directComponentModel({...owner.assets,code:context.assignedSources},vscode.workspace.textDocuments||[],[]);if(direct.failures?.length)return{unavailable:'Assigned Helper component inspection failed: '+direct.failures.slice(0,2).map(failure=>path.basename(failure.filename||'')+': '+String(failure.message||failure.reason||'unavailable').slice(0,180)).join('; ')};return{components:[...direct.behaviors,...direct.specialists],binding:hash(JSON.stringify([context.defPath,hash(context.defText),context.stateSnapshot.inventoryHash]))};},
  validateState:(owner,record)=>currentHelperStateRoute(owner,record,{requireActive:true}),
  proveState:(owner,component)=>{const context=projectileAuthorityContext(owner,component,owner.projectileGeneration,()=>require('crypto').randomBytes(24).toString('hex')),built=buildHelperStateAuthority(component,context);return[...built.authorities.values()][0]||null;},
  hasDraft:(owner,component)=>Boolean(codeFormDrafts.read(codeDraftKey(owner.assets.defPath,component.stableId))),
  token:()=>require('crypto').randomBytes(24).toString('hex'),
  post:(owner,message)=>owner.panel.webview.postMessage(message),
  selected:(owner,component)=>{require('./move_lab_context').remember(owner.assets.defPath,{kind:'direct',reference:component.reference});claimContextSelection(owner);},
  warn:message=>vscode.window.showWarningMessage(message)
 });
}

async function openHelperStateRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Helper state route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 let revealingNative=false;const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&(revealingNative||owner.panel?.active===true)&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),showDocument=services.showDocument||((document,options)=>vscode.window.showTextDocument(document,options));if(!active())return vscode.window.showWarningMessage('The Helper selection is no longer active. Nothing stale was opened.');
 let current=currentHelperStateRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The Helper, character assignment, or starting StateDef changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.targetPath));if(!active())return;current=currentHelperStateRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.targetPath)||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The Helper destination source changed while opening. Nothing stale was selected.');
 revealingNative=true;const editor=await showDocument(document,{preview:false});if(!active())return;current=currentHelperStateRoute(owner,record);if(!current||editor.document!==document||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The exact Helper state authority changed before reveal. Nothing stale was selected.');
 const start=document.positionAt(current.authority.targetStart),end=document.positionAt(current.authority.targetEnd),range=new vscode.Range(start,end);editor.selection=new vscode.Selection(start,end);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);return{available:true,filename:current.authority.targetPath,state:current.authority.state,line:current.authority.targetLine};
}

async function openStateTransitionRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact ChangeState route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 let revealingNative=false;const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&(revealingNative||owner.panel?.active===true)&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),showDocument=services.showDocument||((document,options)=>vscode.window.showTextDocument(document,options));if(!active())return vscode.window.showWarningMessage('The selected StateDef is no longer active. Nothing stale was opened.');
 let current=currentStateTransitionRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The StateDef, exact ChangeState, assignment, or linked source changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.targetPath));if(!active())return;current=currentStateTransitionRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.targetPath)||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The ChangeState source or destination changed while opening. Nothing stale was selected.');
 revealingNative=true;const editor=await showDocument(document,{preview:false});if(!active())return;current=currentStateTransitionRoute(owner,record,{requireActive:false});if(!current||editor.document!==document||hash(document.getText())!==current.authority.targetHash)return vscode.window.showWarningMessage('The exact ChangeState authority changed before reveal. Nothing stale was selected.');
 const start=document.positionAt(current.authority.targetStart),end=document.positionAt(current.authority.targetEnd),range=new vscode.Range(start,end);editor.selection=new vscode.Selection(start,end);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);return{available:true,filename:current.authority.targetPath,state:current.authority.state,line:current.authority.targetLine};
}

async function openFunctionCallRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Function link is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 const isCurrent=services.isCurrent||(()=>session===owner),active=(requireFocus=true)=>isCurrent()&&!owner.disposed&&(!requireFocus||owner.panel?.active===true)&&record?.authority?.generation===owner.projectileGeneration,openDocument=services.openDocument||(uri=>vscode.workspace.openTextDocument(uri)),showDocument=services.showDocument||((document,options)=>vscode.window.showTextDocument(document,options));if(!active())return vscode.window.showWarningMessage('The selected Function is no longer active. Nothing stale was opened.');
 let current=currentFunctionCallRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The Function, exact call, assignment inventory, or linked source changed. Refresh Move Lab before opening it.');
 const document=await openDocument(vscode.Uri.file(current.authority.revealPath));if(!active())return;current=currentFunctionCallRoute(owner,record,{requireActive:true});if(!current||identity(document.fileName)!==identity(current.authority.revealPath)||hash(document.getText())!==current.authority.revealHash)return vscode.window.showWarningMessage('The Function call source or declaration changed while opening. Nothing stale was selected.');
 const editor=await showDocument(document,{preview:false});if(!active(false))return;current=currentFunctionCallRoute(owner,record,{requireActive:false});if(!current||editor.document!==document||hash(document.getText())!==current.authority.revealHash)return vscode.window.showWarningMessage('The exact Function call authority changed before reveal. Nothing stale was selected.');
 const start=document.positionAt(current.authority.revealStart),end=document.positionAt(current.authority.revealEnd),range=new vscode.Range(start,end);editor.selection=new vscode.Selection(start,end);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);return{available:true,filename:current.authority.revealPath,name:current.authority.targetName,line:current.authority.revealLine,direction:current.authority.direction};
}

async function openCommandUsageRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact command-family route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 const isCurrent=services.isCurrent||(()=>session===owner),active=(requireFocus=true)=>isCurrent()&&!owner.disposed&&(!requireFocus||owner.panel?.active===true)&&record?.authority?.generation===owner.projectileGeneration;if(!active())return vscode.window.showWarningMessage('The selected code block is no longer active. Nothing stale was opened.');
 let current=currentCommandUsageRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The selected block, exact command use, character assignment, or command family changed. Refresh Move Lab before opening it.');
 const verify=(requireActive)=>{if(!active(requireActive))throw new Error('The Move Lab command selection is no longer active.');const fresh=currentCommandUsageRoute(owner,record,{requireActive});if(!fresh)throw new Error('The exact command-family authority changed while opening.');return fresh;};
 try{return await(services.adoptCommandFamily||require('./command_movelist_workspace').adoptCommandFamilyAuthority)(current.authority,{beforeOpen:()=>verify(true),afterOpen:()=>verify(false)});}catch(error){return vscode.window.showWarningMessage(`${error.message||'The command family changed while opening.'} Nothing stale was selected.`);}
}

async function openProjectSymbolRoute(owner,route,services={}){
 if(typeof route!=='string'||!/^[0-9a-f]{48}$/.test(route)||owner.projectileConsumedRoutes?.has(route))return vscode.window.showWarningMessage('That exact Project Symbols route is invalid or was already used. Refresh Move Lab before trying again.');
 const record=owner.projectileRoutes?.get(route);owner.projectileConsumedRoutes?.add(route);owner.projectileRoutes?.delete(route);
 const isCurrent=services.isCurrent||(()=>session===owner),active=()=>isCurrent()&&!owner.disposed&&owner.panel?.active===true&&record?.authority?.generation===owner.projectileGeneration;if(!active())return vscode.window.showWarningMessage('The selected code block is no longer active. Nothing stale was opened.');
 let current=currentProjectSymbolRoute(owner,record,{requireActive:true});if(!current)return vscode.window.showWarningMessage('The selected block, owner assignment, engine target, or project symbol changed. Refresh Move Lab before opening it.');
 const verify=()=>{if(!active())throw new Error('The Move Lab symbol selection is no longer active.');const fresh=currentProjectSymbolRoute(owner,record,{requireActive:true});if(!fresh)throw new Error('The exact Project Symbols authority changed while opening.');return fresh;};
 try{return await(services.adoptProjectSymbol||require('./authoring_library').adoptProjectSymbolAuthority)(current.authority,{beforeOpen:verify,afterOpen:verify});}catch(error){return vscode.window.showWarningMessage(`${error.message||'The project symbol changed while opening.'} Nothing stale was selected.`);}
}

function validProjectileEditValues(values){
 if(!plainMessage(values))return false;const allowed=new Set(Object.keys(PROJECTILE_EDIT_TARGETS)),keys=Object.keys(values);
 return keys.length>0&&keys.every(key=>allowed.has(key)&&typeof values[key]==='string'&&values[key].length<=4096);
}
async function publishProjectileEditModel(owner,model,reference){
 if(session!==owner||owner.disposed)return;model.openReference={componentReference:reference};decorateProjectileModel(owner,model,{renew:false});owner.model=model;await owner.panel.webview.postMessage({type:'model',model});if(session===owner)await owner.panel.webview.postMessage({type:'directComponentSelect',reference});
}
function exactCreationHelperTarget(owner,component,number){
 const snapshot=projectileAuthoritySnapshot(owner,owner.projectileGeneration||0),creation=require('./state_controller_creation');
 if(snapshot.defDirty||!snapshot.inventoryComplete||!snapshot.stateSnapshot)return{reason:'The current character DEF or complete assigned StateDef inventory is unavailable. Save or refresh it before creating a Helper.'};
 const source=snapshot.stateSnapshot.sources.find(item=>identity(item.filename)===identity(component.filename));
 if(!source||source.sourceHash!==component.sourceHash)return{reason:'The selected StateDef is no longer one exact assigned source. Refresh Move Lab.'};
 if(creation.literalStateNumber(component.signature)===number)return{reason:'Choose another StateDef so the Helper does not spawn itself recursively.'};
 const evidence=creation.helperTargetEvidence(snapshot.stateSnapshot,number);
 if(!evidence)return{reason:'The Helper starting StateDef is absent or duplicated in the complete assigned sources, including stcommon. Refresh and choose a unique target.'};
 return{evidence};
}
async function previewStateControllerCreate(owner,message){
 const fail=reason=>owner.panel.webview.postMessage({type:'stateControllerCreationFailed',reason});
 if(owner.busy)return fail('Another Move Lab edit is in progress. Try again when it finishes.');
 if(session!==owner||owner.disposed||owner.panel?.active!==true)return fail('Focus this exact Move Lab StateDef before adding a controller.');
 const assets=owner.assets,creation=require('./state_controller_creation'),current=await shellModelFor(assets);
 if(session!==owner||owner.assets!==assets)return;
 const component=validComponentReference(message.reference,{components:componentPool(current)},assets.defPath);
 if(!component||component.kind!=='state'||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,message.reference))return fail('The selected StateDef changed. Select it again before adding a controller.');
 if(codeFormDrafts.read(codeDraftKey(assets.defPath,component.stableId)))return fail('Review or discard the retained StateDef code draft before inserting a controller.');
 let targetEvidence=null;if(message.kind==='helper'){const target=exactCreationHelperTarget(owner,component,message.targetState);if(!target.evidence)return fail(target.reason);targetEvidence=target.evidence;}
 else if(!current.airActions?.some(item=>item.number===message.action))return fail('Choose an exact action from the assigned AIR before creating this effect.');
 const document=await vscode.workspace.openTextDocument(component.filename);if(session!==owner||owner.assets!==assets)return;
 const text=document.getText();if(hash(text)!==component.sourceHash)return fail('The StateDef source changed. Refresh Move Lab before reviewing this insertion.');
 let plan;try{plan=creation.planStateControllerCreation({sourceText:text,component,kind:message.kind,targetState:message.targetState,action:message.action,resourceId:message.resourceId});}catch(error){return fail(error.message)}
 const token=require('crypto').randomUUID();owner.stateControllerCreationPlans=new Map([[token,{token,reference:component.reference,options:{kind:message.kind,targetState:message.targetState,action:message.action,resourceId:message.resourceId},targetEvidence,plan,filename:component.filename,startLine:component.startLine}]]);
 return owner.panel.webview.postMessage({type:'stateControllerCreationPreview',reference:component.reference,token,kind:message.kind,snippet:plan.snippet,file:component.fileLabel,shared:component.shared===true});
}
async function applyStateControllerCreate(owner,token){
 const fail=reason=>owner.panel.webview.postMessage({type:'stateControllerCreationFailed',reason});
 const record=owner.stateControllerCreationPlans?.get(token);owner.stateControllerCreationPlans?.delete(token);
 if(!record||session!==owner||owner.disposed||owner.panel?.active!==true)return fail('The reviewed controller insertion is no longer active. Prepare it again.');
 const assets=owner.assets,creation=require('./state_controller_creation'),current=await shellModelFor(assets);
 if(session!==owner||owner.assets!==assets)return;
 const component=validComponentReference(record.reference,{components:componentPool(current)},assets.defPath);
 if(!component||component.kind!=='state'||owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,record.reference))return fail('The exact StateDef selection changed after review. Prepare the insertion again.');
 if(codeFormDrafts.read(codeDraftKey(assets.defPath,component.stableId)))return fail('A StateDef code draft appeared after review. Keep it and prepare this insertion again later.');
 if(record.options.kind==='helper'){const target=exactCreationHelperTarget(owner,component,record.options.targetState);if(!target.evidence||!sameJson(target.evidence,record.targetEvidence))return fail('The exact Helper start state or assigned common source changed after review. Prepare the insertion again.');}
 else if(!current.airActions?.some(item=>item.number===record.options.action))return fail('The assigned AIR action changed after review.');
 const document=await vscode.workspace.openTextDocument(component.filename);if(session!==owner||owner.assets!==assets)return;
 const before=document.getText();if(hash(before)!==record.plan.beforeHash)return fail('The source changed after review. Nothing was inserted.');
 const plan=creation.planStateControllerCreation({sourceText:before,component,...record.options});
 if(plan.afterHash!==record.plan.afterHash||plan.insertOffset!==record.plan.insertOffset||plan.insertText!==record.plan.insertText)return fail('The insertion plan changed after review. Nothing was inserted.');
 const beforeVersion=document.version,edit=new vscode.WorkspaceEdit();edit.insert(document.uri,document.positionAt(plan.insertOffset),plan.insertText);
 if(!await vscode.workspace.applyEdit(edit))return fail('The native editor declined the reviewed insertion.');
 const verified=await vscode.workspace.openTextDocument(component.filename);if(hash(verified.getText())!==plan.afterHash||(Number.isInteger(beforeVersion)&&Number.isInteger(verified.version)&&verified.version<=beforeVersion))return fail('The native editor did not produce the exact reviewed StateDef insertion. Inspect its open Undo history.');
 if(session!==owner||owner.disposed){vscode.window.showInformationMessage('The controller was inserted in the open document. Use normal Undo or Save there.');return;}
 const refreshed=await shellModelFor(assets);if(session!==owner||owner.disposed)return;
 const matches=(refreshed.behaviorComponents||[]).filter(item=>item.kind==='state'&&identity(item.filename)===identity(record.filename)&&item.startLine===record.startLine);
 if(matches.length===1){owner.displaySelection={kind:'direct',componentReference:matches[0].reference};refreshed.openReference={componentReference:matches[0].reference};}
 decorateProjectileModel(owner,refreshed);owner.model=refreshed;await owner.panel.webview.postMessage({type:'model',model:refreshed});
 if(matches.length===1)await owner.panel.webview.postMessage({type:'directComponentSelect',reference:matches[0].reference});
 owner.panel.webview.postMessage({type:'status',text:'Added the reviewed controller to the open StateDef document. Review it, then use normal Undo or Save.'});
}
function revokeProjectileEditIntent(owner,reference){
 owner.projectileEditAuthorities ||= new Map();owner.projectileEditPreviews ||= new Map();let stableId='';
 for(const [token,record]of [...owner.projectileEditAuthorities])if(sameJson(record.reference,reference)){stableId=record.stableId||stableId;owner.projectileEditAuthorities.delete(token);}
 const component=validComponentReference(reference,{components:owner.model?.specialistComponents||[]},owner.assets.defPath);stableId=component?.kind==='projectile'?component.stableId:stableId;
 const saved=stableId&&owner.projectileEditPreviews.get(stableId);if(saved?.token){owner.projectileEditAuthorities.delete(saved.token);owner.projectileEditPreviews.set(stableId,{...saved,token:''});}
 return component?.kind==='projectile'?component:null;
}
async function republishProjectileEditState(owner,reference){
 if(session!==owner||owner.disposed)return;const model=await shellModelFor(owner.assets);if(session!==owner||owner.disposed)return;const component=validComponentReference(reference,{components:model.specialistComponents||[]},owner.assets.defPath);
 if(component?.kind==='projectile')return publishProjectileEditModel(owner,model,component.reference);decorateProjectileModel(owner,model,{renew:false});owner.model=model;await owner.panel.webview.postMessage({type:'model',model});
}
async function previewExactProjectileEdit(owner,reference,values){
 revokeProjectileEditIntent(owner,reference);
 const reject=async(message,information=false)=>{try{await republishProjectileEditState(owner,reference);}catch(_){}return vscode.window[information?'showInformationMessage':'showWarningMessage'](message);};
 if(!validProjectileEditValues(values))return reject('That Projectile edit request is invalid. Nothing was staged.');
 const current=await currentProjectileEdit(owner,reference);if(!current)return reject('The exact Projectile, current state assignment, or Move Lab selection changed. Refresh and review it again.');
 const preview=previewProjectileEdit(current.draft,current.sourceText,values);if(!preview)return reject('One or more Projectile values are omitted, duplicated, dynamic, or invalid. Nothing was staged.');
 if(preview.status==='no-op')return reject('Those Projectile values already match the exact source.',true);
 const token=require('crypto').randomBytes(24).toString('hex'),record={token,reference:current.component.reference,stableId:current.component.stableId,generation:owner.projectileGeneration,draftId:current.draft.draftId,previewId:preview.previewId,values:{...values},defPath:current.assigned.defPath,defHash:current.assigned.defHash,assignedSources:current.assigned.assignedSources,contextIdentity:current.context.identity,contextRevision:current.context.revision,selectionRevision:current.context.selectionRevision,activeSurfaceId:current.context.activeSurfaceId,selection:current.context.selection,sourceHash:current.draft.sourceHash,controllerHash:current.draft.controllerHash,expectedSourceHash:preview.expectedSourceHash};
 owner.projectileEditAuthorities.set(token,record);owner.projectileEditPreviews.set(current.component.stableId,{draftId:current.draft.draftId,preview,token});await publishProjectileEditModel(owner,current.model,current.component.reference);
}
async function discardExactProjectileEdit(owner,reference){
 const component=validComponentReference(reference,{components:owner.model?.specialistComponents||[]},owner.assets.defPath);if(!component||component.kind!=='projectile')return;
 const saved=owner.projectileEditPreviews?.get(component.stableId);if(saved?.token)owner.projectileEditAuthorities?.delete(saved.token);owner.projectileEditPreviews?.delete(component.stableId);
 const model=await shellModelFor(owner.assets);if(session===owner&&!owner.disposed)await publishProjectileEditModel(owner,model,component.reference);
}
async function applyExactProjectileEdit(owner,token){
 if(typeof token!=='string'||!/^[0-9a-f]{48}$/.test(token))return vscode.window.showWarningMessage('That Projectile Apply authority is invalid. The reviewed preview was retained.');
 const record=owner.projectileEditAuthorities?.get(token);owner.projectileEditAuthorities?.delete(token);if(!record)return vscode.window.showWarningMessage('That Projectile Apply authority was already used or revoked. The reviewed preview was retained.');
 const fail=message=>vscode.window.showWarningMessage(message+' The reviewed preview was retained; preview it again to obtain fresh Apply authority.');
 let current=await currentProjectileEdit(owner,record.reference),preview=current&&previewProjectileEdit(current.draft,current.sourceText,record.values);if(current)current.ownerGeneration=owner.projectileGeneration;
 if(!sameProjectileEditAuthority(record,current,preview))return fail('The Projectile, owner DEF assignment, source, selection, or session changed. Nothing was applied.');
 let document;try{document=await vscode.workspace.openTextDocument(vscode.Uri.file(current.component.filename));}catch(_){return fail('The exact Projectile source could not be opened. Nothing was applied.');}
 current=await currentProjectileEdit(owner,record.reference);preview=current&&previewProjectileEdit(current.draft,current.sourceText,record.values);if(current)current.ownerGeneration=owner.projectileGeneration;
 if(!sameProjectileEditAuthority(record,current,preview)||document.getText()!==current.sourceText)return fail('The Projectile context changed while its source was opening. Nothing was applied.');
 const beforeVersion=document.version,edit=new vscode.WorkspaceEdit();for(const replacement of preview.replacements)edit.replace(document.uri,new vscode.Range(document.positionAt(replacement.start),document.positionAt(replacement.end)),replacement.after);
 if(!preview.replacements.length)return fail('The reviewed Projectile edit no longer changes any source bytes.');
 let applied=false;try{applied=await vscode.workspace.applyEdit(edit);}catch(_){}if(!applied)return fail('The native editor declined the reviewed Projectile edit.');
 const versionAdvanced=!Number.isInteger(beforeVersion)||!Number.isInteger(document.version)||document.version>beforeVersion;
 if(hash(document.getText())!==preview.expectedSourceHash||!versionAdvanced)return fail('The native editor did not produce the exact reviewed Projectile source.');
 owner.projectileEditPreviews?.delete(record.stableId);if(session!==owner||owner.disposed){vscode.window.showInformationMessage('The reviewed Projectile edit was applied exactly in the native document. Move Lab is no longer available to refresh its selection.');return;}
 let model;try{model=await shellModelFor(owner.assets);}catch(_){vscode.window.showWarningMessage('The reviewed Projectile edit was applied exactly, but Move Lab could not refresh its model. The open document remains changed with normal Undo available.');return;}if(session!==owner||owner.disposed){vscode.window.showInformationMessage('The reviewed Projectile edit was applied exactly in the native document. Move Lab is no longer available to refresh its selection.');return;}
 const matches=(model.specialistComponents||[]).filter(item=>item.kind==='projectile'&&identity(item.filename)===identity(current.component.filename)&&item.startLine===current.component.startLine&&item.rangeHash===hash(preview.after));if(matches.length!==1){vscode.window.showWarningMessage('The reviewed Projectile edit was applied exactly, but the refreshed Projectile could not be identified uniquely. The open document remains changed with normal Undo available.');decorateProjectileModel(owner,model);owner.model=model;owner.panel.webview.postMessage({type:'model',model});return;}
 owner.displaySelection={kind:'direct',componentReference:matches[0].reference};if(owner.panel.active===true)claimContextSelection(owner);decorateProjectileModel(owner,model);owner.model=model;model.openReference={componentReference:matches[0].reference};await owner.panel.webview.postMessage({type:'model',model});await owner.panel.webview.postMessage({type:'directComponentSelect',reference:matches[0].reference});owner.panel.webview.postMessage({type:'status',text:'Projectile properties changed in the open source document. Review them, then use normal Save or Undo.'});
}

async function handle(message) {
  const pool=model=>[...(model?.directComponents||[]),...(model?.behaviorComponents||[]),...(model?.specialistComponents||[])];
  const currentOwner=session;if(!currentOwner)return;
  if(await require('./shared_workspace_header').handle(message,{...currentOwner,filename:currentOwner.assets.defPath},'move_constants'))return;
  if(message?.type===MESSAGE_TYPE){try{await currentOwner.toolbarDispatcher.dispatch('move.constants',message);}catch{}return;}
  // The shared toolbar handler is the sole catalog validator/dispatcher.
  // Always return so forged catalog traffic cannot fall through to body routes.
  if(message?.type==='viewerToolbarAction'){await handleLaunchMessage(message,currentOwner.assets.defPath,'constants',currentOwner.panel);return;}
  if(!validMoveBodyMessage(message))return;
  if(message.type.startsWith('moveLabThrow')){const owner=session;return moveLabThrowHandoff.handleRich(owner,message,{isCurrent:()=>session===owner&&!owner.disposed,documents:vscode.workspace.textDocuments||[],read:currentTextSync,source:()=>resolveDisplaySource(owner),open:reference=>vscode.commands.executeCommand('ikemen.throwCreator.open',vscode.Uri.file(owner.assets.defPath),{handshake:reference}),openSource:link=>require('./viewer_navigation').openViewerSource(link.filename,link.line,require('./viewer_navigation').currentPoint(owner.assets.defPath,'code',{},owner.panel))});}
  if(message.type==='moveBehaviorCreateOverride'){const owner=currentOwner,assets=owner.assets;return require('./move_behavior_navigation').createOverride(owner,message.state,{api:vscode,isCurrent:()=>session===owner&&owner.assets===assets});}
  if(message.type==='moveCommandTriggerRecipes'){if(session!==currentOwner||currentOwner.disposed||currentOwner.panel?.active===false)return;return vscode.commands.executeCommand('ikemen.moveLab.commandTriggerRecipes',vscode.Uri.file(currentOwner.assets.defPath));}
  if(message.type==='moveFormDraft'){
    if(!session?.draftDefs.has(message.defPath?.toLowerCase())||typeof message.sourceId!=='string'||!message.draft||typeof message.draft!=='object')return;
    await formDrafts.stage(draftKey(message.defPath,message.sourceId),message.draft);return;
  }
  if(message.type==='moveCodeDraft'){
    if(!session?.draftDefs.has(message.defPath?.toLowerCase())||typeof message.sectionId!=='string'||message.sectionId.length>1000||!message.draft||typeof message.draft!=='object')return;
    if(JSON.stringify(message.draft).length>250000)return;
    const key=codeDraftKey(message.defPath,message.sectionId);
    if(!Object.keys(message.draft).length){for(const [token,authority] of session?.helperMapPlans||[])if(authority.plan?.componentId===message.sectionId)session.helperMapPlans.delete(token);await codeFormDrafts.discard(key);}else await codeFormDrafts.stage(key,message.draft);
    return;
  }
  const owner=session,assets=owner?.assets;if(!owner)return;
  if (await handleLaunchMessage(message, assets.defPath, 'constants', owner.panel)) return;
  if(session!==owner||owner.assets!==assets)return;
  if(message.type==='createMoveVariant')return createSelectedMoveVariant(owner,message);
  if(['requestMoveDiagnosis','openMoveDiagnosisSource','importMoveDiagnosisEvidence','testMoveDiagnosisInput'].includes(message.type)&&await require('./move_diagnosis_host').handleDiagnosisMessage(owner,message,{isCurrent:()=>session===owner,openSource:source=>openSourceLocation(owner,source.filename,source.line,[source.filename])}))return;
  if(['requestMoveMotionInspection','moveMotionSource','openMoveMotionOrbit'].includes(message.type)&&await require('./move_motion_inspector_host').handleMotionMessage(owner,message,{isCurrent:()=>session===owner,openSource:source=>openSourceLocation(owner,source.filename,source.line,[source.filename])}))return;
  if(message.type==='openProjectileAirRoute')return openProjectileAirRoute(owner,message.route);
  if(message.type==='openStateAnimationRoute')return openStateAnimationRoute(owner,message.route);
  if(message.type==='openStateChangeAnimationRoute')return openStateChangeAnimationRoute(owner,message.route);
  if(message.type==='openStatePlaySoundRoute')return openStatePlaySoundRoute(owner,message.route);
  if(message.type==='openProjectileResourceRoute')return openProjectileResourceRoute(owner,message.route);
  if(message.type==='openProjectileStateRoute')return openProjectileStateRoute(owner,message.route);
  if(message.type==='openHelperStateRoute')return openHelperStateRoute(owner,message.route);
  if(message.type==='navigateHelperStateRoute')return helperNavigationRouter().navigateState(owner,message.route);
  if(message.type==='navigateHelperComponent')return helperNavigationRouter().navigateComponent(owner,message);
  if(message.type==='openStateTransitionRoute')return openStateTransitionRoute(owner,message.route);
  if(message.type==='openFunctionCallRoute')return openFunctionCallRoute(owner,message.route);
  if(message.type==='openCommandUsageRoute')return openCommandUsageRoute(owner,message.route);
  if(message.type==='openProjectSymbolRoute')return openProjectSymbolRoute(owner,message.route);
  if(message.type==='previewProjectileEdit')return previewExactProjectileEdit(owner,message.reference,message.values);
  if(message.type==='discardProjectileEdit')return discardExactProjectileEdit(owner,message.reference);
  if(message.type==='previewStateControllerCreate')return previewStateControllerCreate(owner,message);
  if(message.type==='discardStateControllerCreate'){owner.stateControllerCreationPlans?.delete(message.token);return;}
  if(message.type==='moveIntegrationContext'){
    owner.helperMapPlans?.clear();
    if(message.componentReference){const component=validComponentReference(message.componentReference,{components:pool(owner.model)},assets.defPath);if(component){if(owner.displaySelection?.kind!=='direct'||!sameJson(owner.displaySelection.componentReference,component.reference))owner.stateControllerCreationPlans?.clear();owner.displaySelection={kind:'direct',componentReference:component.reference};require('./move_lab_context').remember(assets.defPath,{kind:'direct',reference:componentReference(component,assets.defPath)});if(owner.panel.active===true)claimContextSelection(owner);}return;}
    const move=owner.model.moves.find(item=>item.id===message.sourceId),frameIndex=Number(message.frameIndex);
    if(!move||!Number.isInteger(frameIndex)||frameIndex<0||frameIndex>=(move.timeline?.frames?.length||0))return;
    owner.stateControllerCreationPlans?.clear();owner.displaySelection={kind:'constants',id:move.id,prefix:move.prefix,frameIndex};require('./move_lab_context').remember(assets.defPath,{kind:'constants',reference:constantsReference(move,assets,owner.model,{frameIndex,overviewReference:owner.overviewReference})});if(owner.panel.active===true)claimContextSelection(owner);return;
  }
  if(owner.busy){if(message.type==='applyProfile')owner.panel.webview.postMessage({type:'profileFailed',requestId:message.requestId,filename:message.filename,name:message.name,text:'Another edit is being reviewed. This shared HitDef draft was retained.'});return;}
  const mutating=['saveDirectStateSource','apply','applyProfile','importAirTiming','frameTimingMenu','copyFields','applyCodeSection','initializeHelperMap','applyProjectileEdit','applyStateControllerCreate'].includes(message.type),constantsMutation=mutating&&!['saveDirectStateSource','initializeHelperMap','applyProjectileEdit','applyStateControllerCreate'].includes(message.type)&&!(message.type==='applyCodeSection'&&message.componentReference);if(mutating)owner.busy=true;
  try{
  const expectedText=constantsMutation?await currentText(assets.constants):undefined;
  if(session!==owner||owner.assets!==assets)return;
  const timing=['importAirTiming','frameTimingMenu'].includes(message.type),expectedAir=timing?await currentText(assets.air):undefined;
  if(session!==owner||owner.assets!==assets)return;
  if(timing&&(owner.model.timingSources?.constants!==hash(expectedText)||owner.model.timingSources?.air!==hash(expectedAir)))throw new Error('The constants or AIR changed since this preview. Refresh before assigning timing.');
  if (message.type === 'refresh') return refresh();
  if(message.type==='applyProjectileEdit')return applyExactProjectileEdit(owner,message.token);
  if(message.type==='applyStateControllerCreate')return applyStateControllerCreate(owner,message.token);
  if(message.type==='initializeHelperMap'){
    owner.helperMapPlans ||= new Map();
    owner.helperMapPlans.clear();
    const rebuild=async()=>{const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)throw new Error('The Move Lab context changed during review.');const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);if(!component||component.kind!=='helper')throw new Error('That Helper creation controller changed. Refresh and choose it again.');const maps=assignedMapEntries(current);if(!maps.length)throw new Error('No complete assigned-character map catalog is available. Define or use a project map first, then refresh.');return{current,component,maps};};
    let snapshot=await rebuild(),picked=await vscode.window.showQuickPick(snapshot.maps.map(entry=>({label:entry.name,description:`${entry.writes} write / ${entry.reads} read`,detail:entry.status,entryId:entry.id,identity:mapEntryIdentity(entry)})),{title:'Initialize an existing map on the spawned Helper',placeHolder:'Choose one exact map from this character’s assigned source catalog',matchOnDescription:true,matchOnDetail:true});
    if(!picked)return;
    snapshot=await rebuild();let entry=snapshot.maps.find(candidate=>candidate.id===picked.entryId&&mapEntryIdentity(candidate)===picked.identity);if(!entry)throw new Error('The selected project map changed during review. Refresh and choose it again.');
    const same=(snapshot.component.helperMapBindings||[]).filter(binding=>binding.normalizedName===entry.name.toLowerCase());if(same.length>1)throw new Error(`This Helper has duplicate map.${entry.name} initializers. Resolve them in source before using the guided draft.`);
    const mode=same.length?'replace':'add';if(same.length){const replace=await vscode.window.showWarningMessage(`Replace the existing spawned-Helper initializer for map.${same[0].name}?`,{modal:true,detail:`Current value: ${same[0].value}\n\nOnly this property value will be replaced. No runtime Helper instance is inferred.`},'Replace Initializer');if(replace!=='Replace Initializer')return;}
    const value=await vscode.window.showInputBox({title:`${mode==='replace'?'Replace':'Add'} spawned-Helper map.${entry.name}`,prompt:'Enter one numeric expression. String-bearing values remain unavailable until their Nightly target is separately verified.',value:same[0]?.value||'0',validateInput:value=>{try{planHelperMapInitializer(snapshot.component,entry,{mode,value});return undefined;}catch(error){return error.message;}}});if(value===undefined)return;
    snapshot=await rebuild();entry=snapshot.maps.find(candidate=>candidate.id===picked.entryId&&mapEntryIdentity(candidate)===picked.identity);if(!entry)throw new Error('The selected project map changed before preview. Refresh and choose it again.');const plan=planHelperMapInitializer(snapshot.component,entry,{mode,value});
    const approved=await vscode.window.showInformationMessage(`${mode==='replace'?'Replace':'Add'} map.${entry.name} on this spawned Helper?`,{modal:true,detail:`Receiver: spawned Helper map\nOwner: ${assets.defPath}\nSource: ${snapshot.component.filename}:${snapshot.component.startLine+1}-${snapshot.component.endLine+1}\nOperation: ${plan.operation}\n\nBefore\n${plan.before}\n\nAfter\n${plan.after}\n\nThis stages a draft only. Apply remains a separate native text edit with Undo.`},'Stage Reviewed Draft');if(approved!=='Stage Reviewed Draft')return;
    const latest=await rebuild(),latestEntry=latest.maps.find(candidate=>candidate.id===picked.entryId&&mapEntryIdentity(candidate)===picked.identity);if(!latestEntry)throw new Error('The selected project map changed after preview. Nothing was staged.');const latestPlan=planHelperMapInitializer(latest.component,latestEntry,{mode,value});if(latestPlan.beforeHash!==plan.beforeHash||latestPlan.afterHash!==plan.afterHash)throw new Error('The Helper controller changed after preview. Nothing was staged.');
    const token=require('crypto').randomUUID();owner.helperMapPlans.set(token,{token,componentReference:latest.component.reference,entryId:latestEntry.id,entryIdentity:picked.identity,plan:latestPlan});
    owner.model=latest.current;return owner.panel.webview.postMessage({type:'helperMapDraft',reference:latest.component.reference,token,mapName:latestEntry.name,operation:latestPlan.operation,text:latestPlan.after});
  }
  if (message.type === 'selectDirectComponent'||message.type === 'editDirectComponent'||message.type === 'openDirectComponent'||message.type === 'openDirectDiagnostic'||message.type==='openSpecialistComponent'||message.type==='openComponentAir'||message.type==='openComponentAirAction'||message.type==='previewComponentAirAction') {
    if(message.type==='selectDirectComponent'&&refreshAssets(owner)===assets){
      const selected=validComponentReference(message.reference,{components:pool(owner.model)},assets.defPath);
      const dirtyDef=(vscode.workspace.textDocuments||[]).some(doc=>doc.isDirty&&identity(doc.fileName)===identity(assets.defPath));
      if(selected&&!dirtyDef&&hash(await currentText(selected.filename))===selected.sourceHash){
        if(session!==owner||owner.assets!==assets)return;
        return owner.panel.webview.postMessage({type:'directComponentSelect',reference:selected.reference});
      }
    }
    const current = await shellModelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component)return vscode.window.showWarningMessage('That direct component changed or moved. Refresh Moves / Overview and choose it again.');
    if(message.type==='selectDirectComponent'){
      decorateProjectileModel(owner,current);
      owner.model=current;owner.shell=true;
      await owner.panel.webview.postMessage({type:'model',model:current});
      return owner.panel.webview.postMessage({type:'directComponentSelect',reference:component.reference});
    }
    if(message.type==='editDirectComponent'&&component.kind==='hitdef')return vscode.commands.executeCommand('ikemen.hitDef.openEditor',vscode.Uri.file(component.filename),{preset:true,reference:{sourceHash:component.sourceHash,index:component.index,defPath:assets.defPath}});
    if(message.type==='openSpecialistComponent'&&component.kind==='helper'){
      const document=await vscode.workspace.openTextDocument(component.filename),reference=resolveHelperHandoff(component,{defPath:assets.defPath,assignedFiles:assets.code,sourceText:document.getText()});
      if(!reference)return vscode.window.showWarningMessage('That exact Helper creation site cannot be handed off safely. Refresh Move Lab and verify the assigned source.');
      if(session!==owner||owner.assets!==assets)return;
      return vscode.commands.executeCommand('ikemen.helperLab.open',vscode.Uri.file(assets.defPath),{preset:true,reference});
    }
    if(message.type==='openSpecialistComponent'&&component.kind==='explod'){
      const document=await vscode.workspace.openTextDocument(component.filename),reference=resolveExplodHandoff(component,{defPath:assets.defPath,assignedFiles:assets.code,sourceText:document.getText()});
      if(!reference)return vscode.window.showWarningMessage('That exact Explod creation site cannot be handed off safely. Refresh Move Lab and verify the assigned source.');
      if(session!==owner||owner.assets!==assets)return;
      return vscode.commands.executeCommand('ikemen.explodComposer.open',vscode.Uri.file(assets.defPath),{preset:true,reference});
    }
    if(message.type==='openSpecialistComponent')return openSourceLocation(owner,component.filename,component.line);
    if(message.type==='openComponentAir'){
      if(!assets.air||!fs.existsSync(assets.air))return vscode.window.showWarningMessage('This character has no available assigned AIR file. IKEMaker will not guess another animation source.');
      const actions=require('./air_preview_model').parseAir(await currentText(assets.air));
      if(!actions.length)return vscode.window.showWarningMessage('The assigned AIR file has no complete animation actions to choose.');
      const picked=await vscode.window.showQuickPick(actions.map(action=>({label:`Action ${action.number}`,description:`${action.frames.length} frame${action.frames.length===1?'':'s'}`,detail:`AIR line ${action.line}`,action:action.number})),{title:'Choose the exact AIR action for this component',placeHolder:'No StateDef, Helper, Explod, Projectile, or HitDef number is inferred as an AIR action'});
      if(!picked)return;return vscode.commands.executeCommand('air.openAnimationPreview',vscode.Uri.file(assets.air),{action:picked.action});
    }
    if(message.type==='previewComponentAirAction'){
      let preview;try{
        if(!assets.air||!assets.sff)throw Error('This character needs assigned AIR and SFF files for sprite preview.');
        const action=Number(message.action),airText=await currentText(assets.air),actions=require('./air_preview_model').parseAir(airText),matches=actions.filter(item=>item.number===action);
        if(!Number.isSafeInteger(message.requestId)||message.requestId<1||!Number.isSafeInteger(message.action)||matches.length!==1)throw Error('Choose one unambiguous action from the assigned AIR.');
        const archive=readSff(assets.sff),palette=characterPaletteAssignment(archive,assets.sff,{filename:assets.defPath,text:await currentText(assets.defPath)});
        preview=require('./move_lab_direct_preview').actionPreview(matches[0],archive,palette.override);
      }catch(error){preview={state:'unavailable',detail:error.message}}
      if(session!==owner||owner.assets!==assets)return;return owner.panel.webview.postMessage({type:'componentAirPreview',reference:component.reference,action:message.action,requestId:message.requestId,preview});
    }
    if(message.type==='openComponentAirAction'){
      if(!assets.air||!fs.existsSync(assets.air))return vscode.window.showWarningMessage('This character has no available assigned AIR file. IKEMaker will not guess another animation source.');
      const action=Number(message.action),currentAir=await currentText(assets.air),found=require('./air_preview_model').parseAir(currentAir).find(item=>item.number===action);
      if(!Number.isInteger(action)||!found)return vscode.window.showWarningMessage('That AIR action changed or was removed. Refresh Move Lab and choose a current action.');
      return vscode.commands.executeCommand('air.openAnimationPreview',vscode.Uri.file(assets.air),{action});
    }
    if(message.type==='openDirectComponent')return openSourceLocation(owner,component.filename,component.line);
    const diagnostic=(component.diagnostics||[]).find(item=>item.line===Number(message.line));if(diagnostic)return openSourceLocation(owner,diagnostic.filename,diagnostic.line);return;
  }
  if(message.type==='openBehaviorMaps'){
    const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component||component.kind==='hitdef')return vscode.window.showWarningMessage('That state or function changed. Refresh and choose it again.');
    return vscode.commands.executeCommand('ikemen.maps.openBrowser',vscode.Uri.file(component.filename));
  }
  if(message.type==='openComponentKnowledge'){
    const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component)return vscode.window.showWarningMessage('That code component changed. Refresh and choose it again.');
    return vscode.commands.executeCommand('ikemen.authoring.openSymbols',vscode.Uri.file(component.filename));
  }
  if(message.type==='openComponentLifecycleSite'){
    const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component||!['helper','explod','projectile'].includes(component.kind))return vscode.window.showWarningMessage('That lifecycle component changed. Refresh and choose it again.');
    const sites=(component.lifecycleConnections?.groups||[]).flatMap(group=>group.sites||[]),site=sites.find(candidate=>candidate.id===message.siteId&&candidate.source?.fingerprint===message.fingerprint);
    if(!site||String(site.source?.ownerIdentity||'').replace(/\\/g,'/').toLowerCase()!==String(assets.defPath||'').replace(/\\/g,'/').toLowerCase())return vscode.window.showWarningMessage('That lifecycle connection changed or belongs to another character. Refresh before opening it.');
    let text;try{text=await currentText(site.source.filename);}catch(_){return vscode.window.showWarningMessage('That lifecycle source is no longer readable. Refresh before opening it.');}
    if(hash(text)!==site.source.fingerprint)return vscode.window.showWarningMessage('That lifecycle source changed. Refresh before opening it.');
    return openSourceLocation(owner,site.source.filename,site.source.line);
  }
  if(message.type==='openComponentStructure'){
    const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component)return vscode.window.showWarningMessage('That code component changed. Refresh and choose it again.');
    return vscode.commands.executeCommand('ikemen.codeStructure.openWorkspace',vscode.Uri.file(component.filename),{line:Number(component.startLine??component.line)});
  }
  if(message.type==='openComponentRecommendations'){
    const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
    const component=validComponentReference(message.reference,{components:pool(current)},assets.defPath);
    if(!component)return vscode.window.showWarningMessage('That code component changed. Refresh and choose it again.');
    if(component.syntax!=='zss')return vscode.window.showInformationMessage('Context Suggestions currently use the ZSS authoring catalog. No source was changed.');
    await openSourceLocation(owner,component.filename,Number(component.startLine??component.line));
    if(session!==owner||owner.assets!==assets)return;
    return vscode.commands.executeCommand('zss.contextualRecommendations');
  }
  if (message.type === 'overviewAttack') {
    const current = await shellModelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const attack = validAttackReference(message.reference, current.overview);
    if (!attack) return vscode.window.showWarningMessage('That HitDef changed. Refresh the Moves / Overview drawer and choose it again.');
    return vscode.commands.executeCommand('ikemen.hitDef.openEditor', vscode.Uri.file(attack.filename), { preset: true, reference: { sourceHash: attack.sourceHash, index: attack.index, defPath: assets.defPath } });
  }
  if (message.type === 'overviewProfile') {
    const current = await shellModelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const selected = validConstantsReference(message.reference, assets, current);
    if (!selected) return vscode.window.showWarningMessage('That constants profile changed. Refresh the Moves / Overview drawer and choose it again.');
    owner.model=current;await owner.panel.webview.postMessage({type:'model',model:current});
    return owner.panel.webview.postMessage({type:'moveLabSelect',reference:message.reference});
  }
  if (message.type === 'overviewProblem') {
    const current = await shellModelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const validated = validOverviewProblem(message.reference, current);
    if (!validated) return vscode.window.showWarningMessage('That problem or its source changed. Refresh and review the current result.');
    owner.model=current;
    const member=validated.member;
    if(member.target==='field')return openMoveSource({type:'open',file:'constants',sourceId:member.sourceId,suffix:member.field});
    if(member.target==='air-frame')return openAirProblem(owner,member);
    if(member.filename)return openSourceLocation(owner,member.filename,member.line);
    return;
  }
  if (message.type === 'moveOverview') {
    const current = await shellModelFor(assets); if(session!==owner||owner.assets!==assets)return;
    const move = current.moves.find(item => item.id === message.sourceId), returnTo = constantsReference(move, assets, current, {frameIndex:Number(message.frameIndex),overviewReference:owner.overviewReference});
    if (!returnTo) return vscode.window.showWarningMessage('That move profile changed. Refresh and choose it again.');
    if(!validConstantsReference(returnTo,assets,current))return vscode.window.showWarningMessage('That move frame changed. Refresh and choose it again.');
    const prior=owner.overviewReference&&typeof owner.overviewReference.mode==='string'?owner.overviewReference:{defPath:assets.defPath,mode:'overview'};
    return vscode.commands.executeCommand('ikemen.moveLab.open', vscode.Uri.file(assets.defPath), { preset: true, reference: { ...prior, defPath:assets.defPath, returnTo } });
  }
  if (message.type === 'airWorkspace') { const move=owner.model.moves.find(item=>item.id===message.sourceId); if(!move)return; const document=await vscode.workspace.openTextDocument(assets.constants), parsed=parseConstants(document.getText()), declaration=parsed.byName.get((move.prefix+'.moveID').toLowerCase()); if(!declaration||session!==owner||owner.assets!==assets)return; return require('./viewer_navigation').openConnected(assets.constants,'air',{group:move.timeline.actionNumber,frameIndex:Number.isInteger(message.frameIndex)?message.frameIndex:0},{filename:assets.constants,line:declaration.line,character:0,text:document.lineAt(declaration.line).text},require('./viewer_navigation').currentPoint(assets.defPath,'constants',{navigationSelection:{id:move.id}},owner.panel)); }
  if (message.type === 'openProfileSource') return openSourceLocation(owner, message.filename, message.line);
  if (message.type === 'applyProfile') {
    const move=owner.model.moves.find(item=>item.id===message.sourceId),item=move?.contactProfile?.[Number(message.index)],shared=require('./move_constants_shared_profile');
    const response={requestId:message.requestId,filename:message.filename,name:message.name,value:String(message.value??''),draftRevision:Number(message.draftRevision),draftBase:Number(message.draftBase),draftSourceHash:String(message.draftSourceHash||'')};
    const fail=async(text,show=true)=>{if(show)await vscode.window.showWarningMessage(text);if(session===owner)owner.panel.webview.postMessage({type:'profileFailed',...response,text});};
    if(!item||item.filename!==message.filename||item.line!==Number(message.line)||item.name!==message.name||item.value!==Number(message.base)||item.sourceHash!==message.sourceHash){await fail('The shared HitDef row changed after this Apply began. Refresh and review the retained draft.');return;}
    if(response.draftBase!==item.value||response.draftSourceHash!==item.sourceHash||!Number.isInteger(response.draftRevision)){await fail('This shared HitDef draft was based on an older source. Review the current source before applying.');return;}
    const draft=shared.parseDraft(message.value);
    if(!draft){await fail('Enter a complete decimal or negative number before applying this shared HitDef value.');return;}
    const document=await vscode.workspace.openTextDocument(item.filename),before=document.getText();
    if(hash(before)!==item.sourceHash){await fail('This shared HitDef source changed after the value was displayed. Refresh and review it before applying.');return;}
    const line=document.lineAt(item.line),plan=shared.assignmentEdit(line.text,item.name,item.value,draft.text);
    if(!plan){await fail('The shared HitDef assignment no longer matches the displayed value. Refresh and review it before applying.');return;}
    const approved=await vscode.window.showWarningMessage(`Apply shared ${item.label}?`,{modal:true,detail:`${item.name}: ${item.value} → ${draft.text}\n\nThis changes the ${item.sharedLabel} used by every move that inherits it. The edit remains unsaved in its normal text document so Undo and review stay available.`},'Apply Shared Value');
    if(approved!=='Apply Shared Value'||session!==owner){if(session===owner)await fail('Shared HitDef Apply was cancelled; the draft was retained.',false);return;}
    if(document.getText()!==before){await fail('The shared HitDef source changed during review. Refresh before applying.');return;}
    const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(item.line,plan.start,item.line,plan.end),plan.text);
    if(!await vscode.workspace.applyEdit(edit)||session!==owner){if(session===owner)await fail('The shared HitDef edit could not be applied; the draft was retained.',false);return;}
    owner.panel.webview.postMessage({type:'profileApplied',...response});
    owner.panel.webview.postMessage({type:'status',text:`${item.name} changed in the shared open document. Review every affected move, then save normally.`});return refresh();
  }
  if (message.type === 'moveFollowupSource') {
    const move = owner.model.moves.find(item => item.id === message.sourceId);
    const row = Number.isInteger(message.index) && move?.followups?.[message.index];
    const section = row && codeSectionFor(owner, move.id, row.sectionId);
    if (!section || session !== owner || owner.disposed || owner.panel?.active === false) return;
    const document = await vscode.workspace.openTextDocument(section.filename);
    if (session !== owner || owner.disposed || owner.panel?.active === false) return;
    if (hash(document.getText()) !== section.sourceHash) return vscode.window.showWarningMessage('The state code changed. Refresh Move Lab to review this follow-up.');
    const navigation = require('./viewer_navigation');
    const selection = { navigationSelection: { id: move.id, frameIndex: owner.displaySelection?.id === move.id ? owner.displaySelection.frameIndex : 0 } };
    return navigation.openReferenceSource({ filename: section.filename, line: row.line, character: 0, text: document.lineAt(row.line).text }, navigation.currentPoint(owner.assets.defPath, 'constants', selection, owner.panel));
  }
  if (message.type === 'openCodeSection') { const section=codeSectionFor(owner,message.sourceId,message.id); if(section)return openSourceLocation(owner,section.filename,section.startLine); return; }
  if (message.type === 'openProblem') { const move=owner.model.moves.find(item=>item.id===message.sourceId),problem=move?.problems?.[Number(message.index)]; if(problem?.filename)return openSourceLocation(owner,problem.filename,problem.line); if(problem?.field)return openMoveSource({type:'open',file:'constants',sourceId:message.sourceId,suffix:problem.field}); if(problem?.source==='AIR timing')return openMoveSource({type:'open',file:'air',sourceId:message.sourceId}); return; }
  if (message.type === 'saveDirectStateSource') {
    const selected=owner.displaySelection;
    const component=validComponentReference(message.reference,{components:pool(owner.model)},assets.defPath);
    if(!component||component.kind!=='state'||owner.panel.active===false||selected?.kind!=='direct'||!sameJson(selected.componentReference,component.reference))throw Error('Select the current StateDef before saving its source.');
    const assigned=refreshAssets(owner);
    const document=vscode.workspace.textDocuments.find(doc=>!doc.isClosed&&identity(doc.fileName)===identity(component.filename));
    if(!assigned.code?.some(file=>identity(file)===identity(component.filename))||!document||hash(document.getText())!==component.sourceHash)throw Error('The selected state source changed. Refresh Move Lab before saving.');
    const result=await require('./source_document_save').saveSourceDocument(document,component.fileLabel);
    if(session!==owner||owner.disposed)return;
    await owner.panel.webview.postMessage({type:'stateSaveResult',reference:component.reference,dirty:result.dirty,text:result.message});
    if(!result.ok)await vscode.window.showWarningMessage(result.message);
    return;
  }
  if (message.type === 'applyCodeSection') {
    let section=codeSectionFor(owner,message.sourceId,message.id),nextComponentReference=null;
    if(message.componentReference){
      const current=await shellModelFor(assets);if(session!==owner||owner.assets!==assets)return;
      section=validComponentReference(message.componentReference,{components:pool(current)},assets.defPath);
      if(!section||section.kind==='hitdef')throw new Error('The selected state or function changed. Refresh and review the retained draft.');
      if(section.stableId!==message.id)throw new Error('The selected source block no longer matches this draft.');
      if(section.kind==='helper'){
        owner.helperMapPlans ||= new Map();const token=typeof message.helperMapPlan==='string'?message.helperMapPlan:'',authority=owner.helperMapPlans.get(token);owner.helperMapPlans.delete(token);
        if(!authority||JSON.stringify(authority.componentReference)!==JSON.stringify(message.componentReference)||authority.plan.componentId!==section.stableId||authority.plan.sourceHash!==section.sourceHash||authority.plan.rangeHash!==section.rangeHash||authority.plan.after!==message.text)throw new Error('This spawned-Helper map draft no longer has current reviewed authority. Prepare it again before Apply.');
        const entry=assignedMapEntries(current).find(candidate=>candidate.id===authority.entryId&&mapEntryIdentity(candidate)===authority.entryIdentity);if(!entry)throw new Error('The selected project map changed after this draft was reviewed. Prepare it again before Apply.');
        const rebuilt=planHelperMapInitializer(section,entry,{mode:authority.plan.operation,value:authority.plan.value});if(rebuilt.beforeHash!==authority.plan.beforeHash||rebuilt.afterHash!==authority.plan.afterHash)throw new Error('The Helper initializer plan changed after review. Prepare it again before Apply.');
      }else if(message.helperMapPlan)throw new Error('A Helper-map authority token cannot apply to another source component.');
    }
    if(!section||typeof message.text!=='string'||message.text.length>100000)return;
    const key=codeDraftKey(assets.defPath,section.stableId),stored=codeFormDrafts.read(key);
    const document=await vscode.workspace.openTextDocument(section.filename);
    const conflict=require('./move_code_drafts').applyConflict(section,stored,message,hash(document.getText()));
    if(conflict==='draft-changed')throw new Error('The retained connected-code draft changed. Review it before applying.');
    if(conflict==='source-refreshed')throw new Error('The connected-code source changed after this draft began. Compare, then explicitly rebase or discard the retained draft.');
    if(conflict==='source-changed')throw new Error('The source file changed outside this workspace. Your draft was retained; refresh and compare before applying.');
    const beforeText=document.getText(),beforeVersion=document.version,start=document.lineAt(section.startLine).range.start,end=document.lineAt(section.endLine).range.end;
    const exactOffset=position=>{if(typeof document.offsetAt==='function')return document.offsetAt(position);if(!Number.isInteger(position?.line)||!Number.isInteger(position?.character)||position.line<0||position.character<0)return null;let lineStart=0;for(let line=0;line<position.line;line++){const newline=beforeText.indexOf('\n',lineStart);if(newline<0)return null;lineStart=newline+1;}const newline=beforeText.indexOf('\n',lineStart),lineEnd=newline<0?beforeText.length:newline-(beforeText[newline-1]==='\r'?1:0);return lineStart+position.character<=lineEnd?lineStart+position.character:null;},startOffset=exactOffset(start),endOffset=exactOffset(end);
    if(startOffset===null||endOffset===null)throw new Error('The native editor cannot prove the exact Helper replacement range. The recovery draft was retained.');
    const sourceEol=document.eol===2||(document.eol==null&&beforeText.includes('\r\n'))?'\r\n':'\n';
    const normalized=message.text.replace(/\r\n|\r/g,'\n'),replacement=normalized.replace(/\n/g,sourceEol);
    const predicted=beforeText.slice(0,startOffset)+replacement+beforeText.slice(endOffset),edit=new vscode.WorkspaceEdit();
    edit.replace(document.uri,new vscode.Range(start,end),replacement);
    if(session!==owner||owner.assets!==assets)return;
    let applied=false;try{applied=await vscode.workspace.applyEdit(edit);}catch(_){}if(session!==owner)return;if(!applied)throw new Error('The native editor did not apply the reviewed Helper source. The recovery draft was retained.');
    const verified=await vscode.workspace.openTextDocument(section.filename);if(session!==owner||verified.getText()!==predicted||(Number.isInteger(beforeVersion)&&Number.isInteger(verified.version)&&verified.version<=beforeVersion))throw new Error('The native edit did not produce the exact reviewed Helper source. The recovery draft was retained.');
    const cleared=await codeFormDrafts.discard(key,stored);
    if(message.componentReference){const refreshed=await shellModelFor(assets);if(session===owner&&owner.assets===assets){const candidates=pool(refreshed).filter(item=>item.kind===section.kind&&identity(item.filename)===identity(section.filename)&&item.line===section.startLine&&item.rangeHash===hash(normalized.replace(/\n+$/,'')));if(candidates.length===1){
      nextComponentReference=candidates[0].reference;
      if(owner.displaySelection?.kind==='direct'&&sameJson(owner.displaySelection.componentReference,message.componentReference))owner.displaySelection={kind:'direct',componentReference:nextComponentReference};
    }owner.model=refreshed;}}
    await owner.panel.webview.postMessage({type:'codeSectionApplied',id:message.id,requestId:message.requestId,cleared,nextComponentReference});
    owner.panel.webview.postMessage({type:'status',text:'Connected code changed in the open document. Review it, then use normal Save or Undo.'});
    return await refresh();
  }
  if (message.type === 'throwCreator') return vscode.commands.executeCommand('ikemen.throwCreator.open', vscode.Uri.file(session.assets.defPath));
  if (message.type === 'moveTestAgain') {
    const selected=owner.displaySelection,number=selected?.kind==='constants'?Number(owner.model.moves.find(item=>item.id===selected.id)?.values?.moveID):require('./move_test_again').stateNumber(componentPool(owner.model).find(item=>JSON.stringify(item.reference)===JSON.stringify(selected?.componentReference)));
    if(!Number.isInteger(number)||number<0)return vscode.window.showWarningMessage('Select a numbered move StateDef before testing it.');
    const candidates=componentPool(owner.model).filter(item=>require('./move_test_again').stateNumber(item)===number);
    if(candidates.length!==1)return vscode.window.showWarningMessage('This move does not resolve one exact assigned StateDef. Review duplicate or missing states before testing.');
    const chosen=candidates[0],sourceFiles=existingCharacterFiles(owner.assets).filter(file=>/\.(?:def|cns|zss|air|cmd)$/i.test(file));
    return vscode.commands.executeCommand('ikemen.testSessions.openMove',{defPath:owner.assets.defPath,stateNo:number,sourceFile:chosen.filename,rangeHash:chosen.rangeHash,sourceFiles});
  }
  if (message.type === 'open' || message.type === 'linkedCode') return openMoveSource(message);
  if (message.type === 'launch') { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(session.assets.defPath), { preview: false }); return vscode.commands.executeCommand('ikemen.launchTrainingCurrent'); }
  if (message.type === 'apply') {
    const owner=session;
    if(message.defPath!==owner.assets.defPath)return;
    const document=await vscode.workspace.openTextDocument(owner.assets.constants);
    if(session!==owner||message.defPath!==owner.assets.defPath)return;
    const current=moveGroups(parseConstants(document.getText())).find(move=>move.id===message.sourceId);
    if(!current||message.name!==current.prefix+'.'+message.suffix||current.values[message.suffix]!==message.base){await vscode.window.showWarningMessage('This constant changed after the draft was created. Refresh to review the retained draft and source values.');return;}
    const next=updateConstant(document.getText(),message.name,message.value),edit=new vscode.WorkspaceEdit(),last=document.lineAt(document.lineCount-1);
    edit.replace(document.uri,new vscode.Range(0,0,last.lineNumber,last.text.length),next);
    if(!await vscode.workspace.applyEdit(edit))return;
    const key=draftKey(message.defPath,message.sourceId),fields=formDrafts.read(key)||{},field=fields[message.suffix];
    if(field?.base===message.base){if(field.value===message.value)delete fields[message.suffix];else field.base=message.value;try{await formDrafts.stage(key,fields);}catch(error){await vscode.window.showWarningMessage('The constant was applied, but updating its recovery draft failed: '+error.message);}}
    await owner.panel.webview.postMessage({type:'moveFieldApplied',defPath:message.defPath,sourceId:message.sourceId,suffix:message.suffix,base:message.base,value:message.value});
    if(session!==owner)return;
    owner.panel.webview.postMessage({type:'status',text:message.name+' changed in the open document. Review, then save normally.'});return refresh();
  }
  if (message.type === 'importAirTiming') {
    const move = session.model.moves.find((item) => item.id === String(message.sourceId).toLowerCase());
    if (!move || move.timeline.state !== 'ready') return vscode.window.showWarningMessage('This move does not resolve an AIR action to import.');
    const proposal = airTimingProposal(move.timeline, move.values);
    if (proposal.state !== 'ready') return vscode.window.showWarningMessage('No effective Clsn1 frame was found. The first contact/hit-pause frame cannot be inferred safely.');
    const entries = Object.entries(proposal.values).filter(([suffix]) => Object.prototype.hasOwnProperty.call(move.values, suffix));
    const detail = entries.map(([suffix, value]) => `${suffix} = ${value}`).join('\n');
    const approved = await vscode.window.showInformationMessage(`Import authored AIR timing into ${move.prefix}?`, { modal: true, detail: `${detail}\n\nThe first effective Clsn1 becomes the contact hint; the element after the final Clsn1 becomes the authored post-window hint. AIR alone does not prove ordinary control return, cancel timing, or frame advantage. Any existing smear range remains authored by your thumbnail selections.` }, 'Import Timing');
    if (approved !== 'Import Timing') return;
    return await applyMoveValues(move.id, proposal.values, `Imported AIR timing into ${move.prefix}. Review the contact frame and smear range, then save normally.`, owner, expectedText, expectedAir);
  }
  if (message.type === 'frameTimingMenu') {
    const move = session.model.moves.find((item) => item.id === String(message.sourceId).toLowerCase()), element = Number(message.element);
    if (!move || !Number.isInteger(element)) return;
    const choice = await vscode.window.showQuickPick([
      { label: 'Start smear playback here', description: `Element ${element} begins advancing during hit pause`, action: 'start' },
      { label: 'Freeze on this frame', description: `Elements before ${element} play; element ${element} holds`, action: 'freeze' },
      { label: 'Clear smear playback range', description: 'Disable authored animation-through-hit-pause timing', action: 'clear' }
    ], { title: `${move.prefix} — AIR element ${element}`, placeHolder: 'Assign this thumbnail’s hit-pause smear role' });
    if (!choice) return;
    if (choice.action === 'clear') return await applyMoveValues(move.id, { hitPauseAnimateStartElement: 0, hitPauseFreezeElement: 0, hitPauseAnimateTicks: 0 }, `Cleared the hit-pause smear range for ${move.prefix}.`, owner, expectedText, expectedAir);
    if (choice.action === 'start') {
      const freeze = Number(move.values.hitPauseFreezeElement) || 0, validFreeze = freeze > element ? freeze : 0;
      const ticks = validFreeze ? hitPauseTicks(move.timeline.frames, element, validFreeze) : 0;
      if (ticks === null) return vscode.window.showWarningMessage('The selected smear range crosses an indefinite AIR hold. Choose finite elements before the hold.');
      return await applyMoveValues(move.id, { hitPauseAnimateStartElement: element, hitPauseFreezeElement: validFreeze, hitPauseAnimateTicks: ticks }, `Smear playback starts at AIR element ${element}${validFreeze ? ` and advances for ${ticks} tick(s)` : '; right-click its freeze frame next'}.`, owner, expectedText, expectedAir);
    }
    const start = Number(move.values.hitPauseAnimateStartElement) || 0;
    if (!start) return vscode.window.showWarningMessage('Assign the smear playback start thumbnail first.');
    if (element <= start) return vscode.window.showWarningMessage(`The freeze frame must come after smear start element ${start}.`);
    const ticks = hitPauseTicks(move.timeline.frames, start, element);
    if (ticks === null) return vscode.window.showWarningMessage('The selected smear range crosses an indefinite AIR hold. Choose finite elements before the hold.');
    return await applyMoveValues(move.id, { hitPauseFreezeElement: element, hitPauseAnimateTicks: ticks }, `The smear advances from element ${start} through the frame before element ${element} (${ticks} AIR tick(s)), then freezes on element ${element}.`, owner, expectedText, expectedAir);
  }
  if (message.type === 'copyFields') {
    const current = expectedText, parsed = parseConstants(current), moves = moveGroups(parsed), source = moves.find((item) => item.id === String(message.sourceId).toLowerCase());
    if (!source) throw new Error('The source move is no longer present. Refresh and try again.');
    const available = moves.filter((item) => item.id !== source.id).map((item) => `${item.values.moveID ?? '—'} (${item.prefix})`).join(', ');
    const input = await vscode.window.showInputBox({ title: `Copy ${message.suffixes.length} option(s) from ${source.prefix}`, prompt: 'Enter destination move/state IDs or constant prefixes separated by commas.', placeHolder: 'Example: 210, 220, 250', value: '', validateInput: (value) => value.trim() ? undefined : 'Enter at least one destination.' });
    if (input === undefined) return;
    const resolved = resolveMoveTargets(moves, input, source.id);
    if (resolved.unresolved.length) return vscode.window.showErrorMessage(`No existing move-constant profile matches: ${resolved.unresolved.join(', ')}. Available: ${available}`);
    if (!resolved.selected.length) return vscode.window.showWarningMessage('No destination moves were selected.');
    const identity = message.suffixes.some((suffix) => ['moveID', 'hitIndex', 'hitDefID'].includes(suffix));
    const targetLabel = resolved.selected.map((item) => `${item.values.moveID ?? '—'} (${item.prefix})`).join(', ');
    const approved = await vscode.window.showWarningMessage(`Copy ${message.suffixes.length} option(s) from ${source.prefix} to ${resolved.selected.length} move(s)?`, { modal: true, detail: `${targetLabel}${identity ? '\n\nIdentity fields are included. Review duplicated move, hit, and HitDef IDs carefully.' : ''}\n\nExisting values will be replaced; missing selected options will be added to the existing destination profile.` }, 'Copy Options');
    if (approved !== 'Copy Options') return;
    const plan = copyMoveFields(current, source.id, resolved.selected.map((item) => item.id), message.suffixes, message.values || {}), document = await vscode.workspace.openTextDocument(assets.constants), edit = new vscode.WorkspaceEdit(), last = document.lineAt(document.lineCount - 1);
    if(session!==owner||owner.assets!==assets)return;
    if(document.getText()!==current)throw new Error('The constants changed while choosing copy options. Refresh and review before copying.');
    edit.replace(document.uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), plan.text); if(!await vscode.workspace.applyEdit(edit)||session!==owner)return; owner.panel.webview.postMessage({ type: 'status', text: `Copied ${plan.fields.length} option(s) to ${plan.targets.length} move(s): ${plan.updated} replaced, ${plan.inserted} added. Review, then save normally.` }); return refresh();
  }
  }finally{if(mutating)owner.busy=false;}
}

async function openMoveConstantsWorkspace(uri, options = {}) {
  if(session?.busy){vscode.window.showInformationMessage('Wait for the current Move Lab edit to finish before switching context.');return session.panel;}
  const previous=session,defPath = await chooseDef(uri), requested=options?.reference || null,wantsShell=options?.integration==='shell'||Boolean(requested?.componentReference); if (!defPath||session!==previous||session?.busy) return;
  if(session && options.history){
    if(path.resolve(session.assets.defPath).toLowerCase()!==path.resolve(defPath).toLowerCase()){
      vscode.window.showInformationMessage('Another character is open in the Move Lab constants integration. Close that workspace before restoring this history item so its pending edits remain protected.');return;
    }
    if(options.browseBehaviors)await session.panel.webview.postMessage({type:'moveBehaviorBrowse'});session.panel.reveal(await moveEditorColumn(vscode),false);return session.panel;
  }
  if(session&&path.resolve(session.assets.defPath).toLowerCase()===path.resolve(defPath).toLowerCase()){
    const ownerAtOpen=session;await refresh();if(session!==ownerAtOpen||ownerAtOpen.busy)return ownerAtOpen.panel;
    if(requested){
      const owner=session,current=owner.model;if(session!==owner||owner.busy)return owner.panel;
      decorateProjectileModel(owner,current);if(requested.componentReference){const component=validComponentReference(requested.componentReference,{components:componentPool(current)},owner.assets.defPath);if(!component){vscode.window.showWarningMessage('That direct component changed or moved. Refresh Moves / Overview and choose it again.');return owner.panel;}owner.model=current;owner.shell=true;current.openReference={componentReference:component.reference};await owner.panel.webview.postMessage({type:'model',model:current});await owner.panel.webview.postMessage({type:'directComponentSelect',reference:component.reference});}
      else {if(!validConstantsReference(requested,owner.assets,current)){vscode.window.showWarningMessage('That constants profile or source changed. Refresh Move Lab and choose it again.');return owner.panel;}owner.model=current;owner.shell=true;owner.overviewReference=requested.overviewReference||owner.overviewReference;await owner.panel.webview.postMessage({type:'model',model:current});await owner.panel.webview.postMessage({type:'moveLabSelect',reference:requested});}
    }
    if(options.browseBehaviors)await session.panel.webview.postMessage({type:'moveBehaviorBrowse'});session.panel.reveal(await moveEditorColumn(vscode),false);return session.panel;
  }
  let assets, model,constantsFallback=false;
  if(requested){
    try { assets = wantsShell?characterShellAssets(defPath):characterAssets(defPath); model = await shellModelFor(assets); }
    catch(error){if(wantsShell)return vscode.window.showErrorMessage(`Move Lab: ${error.message}`);const choice=await vscode.window.showWarningMessage(`Move Lab — Constants is unavailable: ${error.message}`,'Open Move Lab');if(choice!=='Open Move Lab')return;try{assets=characterShellAssets(defPath);model=await shellModelFor(assets);constantsFallback=true;}catch(shellError){return vscode.window.showErrorMessage(`Move Lab: ${shellError.message}`);}}
    if(requested.componentReference){const component=validComponentReference(requested.componentReference,{components:componentPool(model)},assets.defPath);if(!component){vscode.window.showWarningMessage('That direct component changed or moved. Refresh Moves / Overview and choose it again.');return;}model.openReference={componentReference:component.reference};}
    else if(!constantsFallback&&!validConstantsReference(requested,assets,model)){vscode.window.showWarningMessage('That constants profile or source changed. Refresh Move Lab and choose it again.');return;}
  }
  if(session&&path.resolve(session.assets.defPath).toLowerCase()!==path.resolve(defPath).toLowerCase()){if(!await require('./viewer_close').prepare([session.panel],vscode)||session!==previous)return;await Promise.all([formDrafts.flush(),codeFormDrafts.flush()]);}
  if(!model){
    try { assets = wantsShell?characterShellAssets(defPath):characterAssets(defPath); model = await shellModelFor(assets); }
    catch (error) {
      if(wantsShell)return vscode.window.showErrorMessage(`Move Lab: ${error.message}`);
      const choice=await vscode.window.showWarningMessage(`Move Lab — Constants is unavailable: ${error.message}`,'Open Move Lab');if(choice!=='Open Move Lab')return;
      try{assets=characterShellAssets(defPath);model=await shellModelFor(assets);}catch(shellError){return vscode.window.showErrorMessage(`Move Lab: ${shellError.message}`);}
    }
  }
  if(!model.openReference&&!constantsFallback)model.openReference=requested;
  if(session!==previous||session?.busy)return;
  if (!model.moves.length&&!componentPool(model).length) return vscode.window.showWarningMessage(wantsShell?'No constants profiles, StateDefs, Functions, or direct HitDef controllers were found in the assigned character code.':'No normal.*, special.*, or hyper.* move-constant groups were found in [Constants].');
  if(options.browseBehaviors)model.browseBehaviors=true;
  if (session) { session.draftDefs.add(defPath.toLowerCase()); session.assets = assets;decorateProjectileModel(session,model); session.model = model; session.shell=true; session.overviewReference=model.openReference?.overviewReference||null;session.displaySelection=initialDisplaySelection(model);bindCharacterContext(session);session.panel.title = `${model.character} — Move Lab`; session.panel.webview.html = require('./webview_policy').protect(html(model,moveToolbarModel(session))); session.panel.reveal(await moveEditorColumn(vscode),false);if(session.panel.active===true)claimContextSelection(session);return session.panel; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMoveConstants', `${model.character} — Move Lab`, await moveEditorColumn(vscode), { enableScripts: true, retainContextWhenHidden: true }));
  if(options.browseBehaviors)model.browseBehaviors=true;
  attachPanel(panel, assets, model, true);
  return panel;
}

function attachPanel(panel, assets, model, shell=false) {
  session = { panel, assets, model, shell, overviewReference:model.openReference?.overviewReference||null, busy:false, draftDefs:new Set([assets.defPath.toLowerCase()]),displaySelection:initialDisplaySelection(model),contextEntry:null,contextModel:null,toolbarDispatcher:null,helperMapPlans:new Map(),projectileGeneration:0,projectileRoutes:new Map(),projectileConsumedRoutes:new Set(),projectileEditAuthorities:new Map(),projectileEditPreviews:new Map(),disposed:false };decorateProjectileModel(session,model);
  const owner=session;bindCharacterContext(owner);owner.toolbarDispatcher=createMoveToolbar(owner);
  panel.title = `${model.character} — Move Lab${shell?'':' · Constants'}`;
  panel.webview.options = { ...panel.webview.options, enableScripts: true };
  panel.webview.html = require('./webview_policy').protect(html(model,moveToolbarModel(owner)));
  panel.webview.onDidReceiveMessage(message => session?.panel===panel&&handle(message).catch(error => { if(message?.type==='applyCodeSection')panel.webview.postMessage({type:'codeSectionFailed',requestId:message.requestId});return vscode.window.showErrorMessage(`Move Constants Editor: ${error.message}`); }));
  const listeners=[],isWatched=filename=>{const owner=session;if(!owner||owner.panel!==panel||!filename)return false;return [owner.assets.defPath,owner.assets.constants,owner.assets.air,...(owner.assets.code||[])].filter(Boolean).some(file=>path.resolve(file).toLowerCase()===path.resolve(filename).toLowerCase());};
  const scheduleRefresh=()=>{const owner=session;if(!owner||owner.panel!==panel)return;clearTimeout(owner.refreshTimer);owner.refreshTimer=setTimeout(()=>{if(session!==owner)return;if(owner.busy){scheduleRefresh();return;}refresh().catch(error=>vscode.window.showErrorMessage(`Move Constants Editor: ${error.message}`));},180);};
  listeners.push(vscode.workspace.onDidChangeTextDocument(event=>{if(isWatched(event.document.fileName))scheduleRefresh();}));
  listeners.push(vscode.workspace.onDidSaveTextDocument(document=>{if(isWatched(document.fileName))scheduleRefresh();}));
  if(vscode.languages.onDidChangeDiagnostics){
    const watchedDiagnostics=()=>JSON.stringify(sourceDiagnostics([owner.assets.defPath,owner.assets.constants,owner.assets.air,...(owner.assets.code||[])]));
    let previousDiagnostics=watchedDiagnostics();
    listeners.push(vscode.languages.onDidChangeDiagnostics(event=>{
      if(!event.uris.some(uri=>isWatched(uri.fsPath)))return;
      const current=watchedDiagnostics();
      if(current===previousDiagnostics)return;
      previousDiagnostics=current;
      scheduleRefresh();
    }));
  }
  listeners.push(require('./engine_capability_events').onDidChangeEngineCapabilities(()=>scheduleRefresh()));
  const activation=panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active&&session===owner)claimContextSelection(owner);});if(activation)listeners.push(activation);
  if(panel.active===true)claimContextSelection(owner);
  require('./viewer_close').support(panel,{isBusy:()=>session?.panel===panel&&!!session.busy,keepDraft:()=>Promise.all([formDrafts.flush(),codeFormDrafts.flush()])});
  panel.onDidDispose(() => { owner.disposed=true;owner.projectileRoutes?.clear();owner.projectileEditAuthorities?.clear();for(const listener of listeners)listener.dispose?.();if(session?.panel===panel){clearTimeout(session.refreshTimer);session=null;} });
}
async function restoreMoveConstantsWorkspace(panel, state) {
  try {
    if (!state || typeof state.defPath !== 'string' || !path.isAbsolute(state.defPath)) throw new Error('The saved character path is unavailable. Reopen Move Lab from the character.');
    if (session) throw new Error('Another Move Lab constants integration is already open.');
    const assets = characterShellAssets(state.defPath), model = await shellModelFor(assets);
    if (!model.moves.length&&!componentPool(model).length) throw new Error('The saved character no longer contains move profiles or assigned state/function components.');
    attachPanel(panel, assets, model, true);
  } catch (error) {
    panel.dispose();
    vscode.window.showWarningMessage(`Move Lab constants integration could not be restored: ${error.message}`);
  }
}
function registerMoveConstantsWorkspace(context, options = {}) {
  capabilityResolver = typeof options.getCapabilities === 'function' ? options.getCapabilities : () => ({});
  formDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState,'ikemaker.moveConstantDrafts.v1');
  codeFormDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState,'ikemaker.moveCodeDrafts.v1');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.moveConstants.open', openMoveConstantsWorkspace));
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('ikemenMoveConstants', { deserializeWebviewPanel: restoreMoveConstantsWorkspace }));
}

module.exports = { registerMoveConstantsWorkspace, openMoveConstantsWorkspace, characterAssets, characterShellAssets, contactProfile, compactAirCatalog, modelFor, shellModelFor, html, moveConstantsControlAvailability, moveConstantsAccessibilityClientScript, constantsReference, validConstantsReference, validOverviewProblem, overviewFor, initialDisplaySelection, existingCharacterFiles, moveToolbarModel, selectionEnvelope, validMoveBodyMessage, resolveDisplaySource, createMoveToolbar, bindCharacterContext, claimContextSelection, boundedProjectileStateSource, projectileAuthoritySnapshot, projectileAuthorityContext, decorateProjectileModel, currentProjectileStateRoute, openProjectileStateRoute, currentHelperStateRoute, openHelperStateRoute, currentStateTransitionRoute, openStateTransitionRoute, currentStateAnimationRoute, openStateAnimationRoute, currentStateChangeAnimationRoute, openStateChangeAnimationRoute, currentStatePlaySoundRoute, openStatePlaySoundRoute, currentFunctionCallRoute, openFunctionCallRoute, currentCommandUsageRoute, openCommandUsageRoute, currentProjectSymbolRoute, openProjectSymbolRoute };
