'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { configureViewerTopology, preferredViewerColumn, reserveViewerColumns, releaseViewerColumns } = require('./viewer_group');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, renderUniversalToolbar, universalToolbarClientScript: baseUniversalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { ExactSourceRegistry, fingerprint, unavailable } = require('./exact_source_routes');
const { clientScript: viewerCloseClientScript, support: supportViewerClose } = require('./viewer_close');
const { has: hasAirBrowserSession, onDidChangeSourceHandoff } = require('./air_browser_sessions');
const viewerToolbar = require('./viewer_toolbar');
const entityHeader = require('./entity_header');
const entityFileOrder = require('./entity_file_order');
const entityFileOrderKey = entityFileOrder.key;
const { attachedTextLayout, attachedLayoutShape, fittedHeaderRatio } = require('./text_editor_layout');
const textDropdownLayout = require('./text_dropdown_layout');
const universalToolbarClientScript = options => `${entityHeader.clientScript(options)}${baseUniversalToolbarClientScript(options)}${require('./universal_toolbar_webview').browserShortcutClientScript(options)}`;

const COMPANION_RESTORE_SCHEMA='ikemaker.code-navigation-restore';
const COMPANION_RESTORE_VERSION=1;
const MAX_RESTORE_BYTES=256*1024;
const HEADER_ONLY_SETTING='textToolbar.headerOnlyLayout';
const HEADER_ONLY_BACKUP_KEY='ikemen.textToolbar.headerOnlyLayout.backup.v1';
const GROUPED_FILES_SETTING='textToolbar.groupedFiles';
const ENTITY_FILE_ORDER_KEY='ikemen.textToolbar.entityFileOrder.v1';
const HEADER_ONLY_TARGETS=Object.freeze([
  Object.freeze({section:'workbench.editor',key:'showTabs',value:'none',label:'native editor tabs'}),
  Object.freeze({section:'editor.scrollbar',key:'horizontal',value:'hidden',label:'horizontal editor scrollbars'}),
  Object.freeze({section:'editor.scrollbar',key:'vertical',value:'hidden',label:'vertical editor scrollbars'})
]);
const TEXT_GROUP_RESERVATION='ikemaker.text-editor-exclusive-groups';

const SUPPORTED = new Set(['zss', 'cns', 'st', 'cmd', 'inp', 'jnp', 'dat', 'air', 'def', 'lua', 'txt']);
const GROUPS = Object.freeze(['Navigate', 'Edit & Insert', 'Preview & Visual Editors', 'Validate & Safety', 'Character / Stage / Screenpack', 'Project & Run']);
const TOOLBAR_COMMANDS = Object.freeze({ new:'ikemen.text.createNew', open:'workbench.action.files.openFile', project:'ikemen.projectManager.open', help:'ikemen.help.open', settings:'ikemen.openExtensionSettings', 'suite-switch':'ikemen.switchSuite' });

const ACTIONS = Object.freeze([
  { command: 'zss.goToLine', label: 'Go to Line…', group: 'Navigate' },
  { command: 'ikemen.viewer.openReference', label: 'Open Definition or Reference', group: 'Navigate', kinds: ['zss','cns','st','cmd','air','def','txt'] },
  { command: 'ikemen.air.openSelectedAnimationReference', label: 'Open Selected Animation Reference in AIR', group: 'Navigate', kinds: ['zss','cns','st'] },
  { command: 'ikemen.codeStructure.openWorkspace', label: 'Code Structure', group: 'Navigate', kinds: ['zss','cns','st','lua','txt'] },
  { command: 'zss.toggleLineComment', label: 'Comment / Uncomment Selected Lines', group: 'Edit & Insert' },
  { command: 'ikemen.statedef.create', label: 'Create New StateDef…', group: 'Edit & Insert', kinds: ['zss','cns','st'] },
  { command: 'zss.openControllers', label: 'Browse State Controllers', group: 'Edit & Insert', kinds: ['zss','cns','st','txt'] },
  { command: 'zssStructures.browse', label: 'Insert Structure or Logic', group: 'Edit & Insert', kinds: ['zss','cns','st','txt'] },
  { command: 'ikemen.maps.insert', label: 'Insert Project Data Map', group: 'Edit & Insert', kinds: ['zss','cns','st','cmd','inp','jnp','txt'] },
  { command: 'ikemen.maps.openBrowser', label: 'Browse Project Data Maps', group: 'Edit & Insert', kinds: ['zss','cns','st','cmd','inp','jnp','txt'] },
  { id: 'viewer.sff', viewer: 'sff', label: 'Open Connected SFF Viewer', group: 'Preview & Visual Editors', kinds: ['zss','cns','st','cmd','inp','jnp','dat','air','def','txt'], roles: ['character'] },
  { id: 'viewer.air', viewer: 'air', label: 'Open AIR Animation Viewer', group: 'Preview & Visual Editors', kinds: ['zss','cns','st','cmd','inp','jnp','dat','air','def','txt'], roles: ['character'] },
  { id: 'viewer.snd', viewer: 'snd', label: 'Open Connected SND Viewer', group: 'Preview & Visual Editors', kinds: ['zss','cns','st','cmd','inp','jnp','dat','air','def','txt'], roles: ['character'] },
  { command: 'zss.openPalFxEditor', label: 'Open PalFX Editor', group: 'Preview & Visual Editors', kinds: ['zss','air'] },
  { command: 'ikemen.def.openVisualWorkspace', label: 'Open Visual DEF Workspace', group: 'Preview & Visual Editors', kinds: ['def'] },
  { command: 'ikemen.stage.openWorkspace', label: 'Open Stage Workspace', group: 'Preview & Visual Editors', roles: ['stage'] },
  { command: 'ikemen.ui.openWorkspace', label: 'Open Screenpack Workspace', group: 'Preview & Visual Editors', roles: ['screenpack','roster'] },
  { command: 'zss.audit.currentFile', label: 'Audit Current ZSS File', group: 'Validate & Safety', kinds: ['zss'] },
  { command: 'ikemen.characterHealth.open', label: 'Character Health & Cleanup', group: 'Validate & Safety', kinds: ['zss','cns','st','cmd','inp','jnp','air','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.characterDependencies.open', label: 'Character Dependencies', group: 'Validate & Safety', kinds: ['zss','cns','st','cmd','inp','jnp','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.scaleReview.run', label: 'Run Character Scale Review', group: 'Validate & Safety', kinds: ['zss','cns','st','cmd','inp','jnp','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.scaleReview.toggleMonitoring', label: 'Toggle Character Scale Monitoring', group: 'Validate & Safety', kinds: ['zss','cns','st','cmd','inp','jnp','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.moveLab.open', label: 'Move Lab', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','air','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.hitDef.openEditor', label: 'Universal HitDef Editor', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','txt'] },
  { command: 'ikemen.helperLab.open', label: 'Helper & Projectile Lab', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.explodComposer.open', label: 'Explod / Spatial Composer', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','air','def'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.positionCamera.open', label: 'Position & Camera', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','air','def'], excludeRoles: ['screenpack','roster'] },
  { command: 'ikemen.trajectory.openAssist', label: 'Orbit / Trajectory Assist', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','air','def'], excludeRoles: ['roster'] },
  { command: 'ikemen.commandMovelist.openEditor', label: 'Commands & Movelist', group: 'Character / Stage / Screenpack', kinds: ['zss','cns','st','cmd','inp','jnp','dat','air','def','txt'], excludeRoles: ['stage','screenpack','roster'] },
  { command: 'ikemen.selectDef.openWorkspace', label: 'Roster Manager', group: 'Character / Stage / Screenpack', roles: ['roster'] },
  { command: 'ikemen.menuModes.openCreator', label: 'Menus & Modes Creator', group: 'Character / Stage / Screenpack', roles: ['screenpack','roster'] },
  { command: 'ikemen.productionWorkflow.open', label: 'Production Workflow', group: 'Project & Run', kinds: ['zss','cns','st','air','def'] },
  { command: 'ikemen.launchGame', label: 'Run Game', group: 'Project & Run' },
  { command: 'ikemen.launchMirrorCurrent', label: 'Run Infinite Quick VS', group: 'Project & Run' },
  { command: 'ikemen.launchTrainingCurrent', label: 'Run Training', group: 'Project & Run' },
  { command: 'ikemen.switchSuite', label: 'Switch Suite', group: 'Project & Run' },
  { command: 'ikemen.openIKeMeter', label: 'Open IKeMeter', group: 'Project & Run' },
  { command: 'ikemen.switchToIkeMiner', label: 'Switch to IkeMiner', group: 'Project & Run' },
  { command: 'ikemen.textToolbar.toggleCompanion', label: 'Open / Close Text Toolbar Companion', group: 'Project & Run' },
  { command: 'ikemen.textToolbar.toggleGroupedFiles', label: 'Toggle Grouped files', group: 'Project & Run' },
  { command: 'ikemen.textToolbar.toggleHeaderOnlyLayout', label: 'Toggle Header-Only Text Layout', group: 'Project & Run' }
]);

function workspaceValue(configuration,key){
  const inspected=configuration?.inspect?.(key);
  return inspected&&Object.prototype.hasOwnProperty.call(inspected,'workspaceValue')&&inspected.workspaceValue!==undefined
    ? {defined:true,value:inspected.workspaceValue}
    : {defined:false,value:null};
}

async function applyHeaderOnlyLayout(vscode,extensionContext,enabled){
  return applyTextTabLayout(vscode,extensionContext,{headerOnly:enabled,grouped:false});
}

function sameWorkspaceValue(left,right){return Boolean(left?.defined)===Boolean(right?.defined)&&(!left?.defined||left.value===right.value);}
function desiredTextTabValue(item,mode,previous){
  if(mode==='header-only')return{defined:true,value:item.value};
  if(mode==='grouped'&&item.section==='workbench.editor'&&item.key==='showTabs')return{defined:true,value:'single'};
  return previous;
}

async function applyTextTabLayout(vscode,extensionContext,state={}){
  const target=vscode.ConfigurationTarget?.Workspace??2;
  let backup=extensionContext.workspaceState.get(HEADER_ONLY_BACKUP_KEY,null);
  const hasWorkspace=Boolean(vscode.workspace.workspaceFile||(vscode.workspace.workspaceFolders||[]).length);
  // VS Code rejects workspace-scoped configuration writes when the user opens
  // loose character files instead of a folder/workspace. Header-only mode is
  // optional UI chrome; it must never prevent the text commands from
  // registering or the native editor from opening.
  if(!hasWorkspace)return{enabled:false,mode:'ordinary',changed:[],preserved:[],unavailable:true};
  const mode=state.headerOnly?'header-only':state.grouped?'grouped':'ordinary';
  if(backup?.version===1&&Array.isArray(backup.values))backup={version:2,mode:'header-only',values:backup.values.map(item=>({...item,applied:{defined:true,value:item.value}}))};
  if(mode!=='ordinary'&&!Array.isArray(backup?.values)){
    backup={version:2,mode:'ordinary',values:HEADER_ONLY_TARGETS.map(item=>({...item,previous:workspaceValue(vscode.workspace.getConfiguration(item.section),item.key),applied:null}))};
    await extensionContext.workspaceState.update(HEADER_ONLY_BACKUP_KEY,backup);
  }
  if(mode==='ordinary'&&!backup?.values){
    // Nothing was changed by IKEMaker, so there is nothing to restore. Writing
    // guessed defaults here used to mutate user settings during every startup
    // and throws outright when no workspace is open.
    return{enabled:false,mode,changed:[],preserved:[]};
  }
  const changed=[],preserved=[],backupBefore=JSON.parse(JSON.stringify(backup)),operationBefore=new Map(backup.values.map(item=>[`${item.section}.${item.key}`,workspaceValue(vscode.workspace.getConfiguration(item.section),item.key)]));
  try{
    for(const item of backup.values){
      const configuration=vscode.workspace.getConfiguration(item.section),current=workspaceValue(configuration,item.key),mayChange=!item.applied||sameWorkspaceValue(current,item.applied);
      if(!mayChange){preserved.push(item.label);item.applied=null;continue;}
      const desired=desiredTextTabValue(item,mode,item.previous);
      if(!sameWorkspaceValue(current,desired)){await configuration.update(item.key,desired?.defined?desired.value:undefined,target);changed.push(item.label);}
      item.applied=mode==='ordinary'?null:desired;
    }
  }catch(error){
    for(const item of backup.values){const previous=operationBefore.get(`${item.section}.${item.key}`);try{await vscode.workspace.getConfiguration(item.section).update(item.key,previous?.defined?previous.value:undefined,target);}catch{}}
    if(backupBefore.mode==='ordinary'&&backupBefore.values.every(item=>!item.applied))await extensionContext.workspaceState.update(HEADER_ONLY_BACKUP_KEY,undefined);else await extensionContext.workspaceState.update(HEADER_ONLY_BACKUP_KEY,backupBefore);
    throw error;
  }
  if(mode==='ordinary')await extensionContext.workspaceState.update(HEADER_ONLY_BACKUP_KEY,undefined);else{backup.mode=mode;await extensionContext.workspaceState.update(HEADER_ONLY_BACKUP_KEY,backup);}
  return{enabled:mode!=='ordinary',mode,changed,preserved};
}

async function restoreNativeTextLayout(vscode,extensionContext){
  const target=vscode.ConfigurationTarget?.Workspace??2,ikemen=vscode.workspace.getConfiguration('ikemenZss');
  await ikemen.update(HEADER_ONLY_SETTING,false,target);await ikemen.update(GROUPED_FILES_SETTING,false,target);
  const result=await applyTextTabLayout(vscode,extensionContext,{headerOnly:false,grouped:false});if(result.unavailable)return result;
  const fallbacks=[['workbench.editor','showTabs','none','multiple'],['editor.scrollbar','horizontal','hidden','auto'],['editor.scrollbar','vertical','hidden','auto']];
  for(const[section,key,blocked,restored]of fallbacks){const configuration=vscode.workspace.getConfiguration(section);if(configuration.get(key)===blocked)await configuration.update(key,restored,target);}
  return{...result,forcedNative:true};
}

async function disableNativeTextLayout(vscode,extensionContext){
  const hasWorkspace=Boolean(vscode.workspace.workspaceFile||(vscode.workspace.workspaceFolders||[]).length);if(!hasWorkspace)return{enabled:false,mode:'ordinary',changed:[],preserved:[],unavailable:true};
  const target=vscode.ConfigurationTarget?.Workspace??2,ikemen=vscode.workspace.getConfiguration('ikemenZss');
  await ikemen.update(GROUPED_FILES_SETTING,false,target);await ikemen.update(HEADER_ONLY_SETTING,true,target);
  return applyTextTabLayout(vscode,extensionContext,{headerOnly:true,grouped:false});
}

function extensionOf(document) {
  return path.extname(document?.fileName || '').slice(1).toLowerCase();
}

function defRole(document) {
  const name = path.basename(document?.fileName || '').toLowerCase();
  if (name === 'select.def') return 'roster';
  if (name === 'system.def' || name === 'fight.def') return 'screenpack';
  const text = document?.getText?.() || '';
  if (/^\s*\[\s*(?:bgdef|camera|stageinfo|playerinfo)\s*\]/im.test(text)) return 'stage';
  if (/^\s*\[\s*(?:title info|select info|files)\s*\]/im.test(text) && /(?:system\.sff|select\.def|fight\.def)/i.test(text)) return 'screenpack';
  return 'character';
}

function classify(document, configuration) {
  if (!document) return { supported: false, kind: '', role: '', writable: false, label: 'No supported text editor' };
  let kind = extensionOf(document);
  if (document.languageId === 'zss') kind = 'zss';
  if (document.languageId === 'ikemen-cns' && !['cmd','inp','jnp','dat'].includes(kind)) kind = kind === 'st' ? 'st' : 'cns';
  const configured = (configuration?.get?.('additionalCodeExtensions', []) || []).map(value => String(value).replace(/^\./, '').toLowerCase());
  if (kind === 'txt' && document.languageId !== 'zss' && document.languageId !== 'ikemen-cns' && !configured.includes('txt')) return { supported: false, kind, role: '', writable: false, label: 'Ordinary TXT' };
  if (!SUPPORTED.has(kind)) return { supported: false, kind, role: '', writable: false, label: kind ? kind.toUpperCase() : 'Unsupported' };
  const role = kind === 'def' ? defRole(document) : kind === 'lua' ? (/[/\\](?:data|external|script)[/\\]/i.test(document.fileName || '') ? 'screenpack' : 'script') : 'character';
  const writable = ['file','untitled'].includes(document.uri?.scheme || 'file') && !document.isClosed;
  return { supported: true, kind, role, writable, label: `${kind.toUpperCase()} · ${role}` };
}

function actionsFor(context) {
  if (!context?.supported) return [];
  return ACTIONS.filter(action => (!action.kinds || action.kinds.includes(context.kind)) && (!action.roles || action.roles.includes(context.role)) && (!action.excludeRoles || !action.excludeRoles.includes(context.role)));
}

function actionId(action) { return action.id || `command.${action.command}`; }

async function runAction(action, seed, vscode, navigation = require('./viewer_navigation'), ownerDef = '') {
  if (action?.viewer) return navigation.openConnected(seed?.fsPath || seed, action.viewer, undefined, undefined, undefined, ownerDef ? { def: path.resolve(ownerDef) } : undefined, { origin:'text' });
  if (action?.command) return vscode.commands.executeCommand(action.command, seed);
}

function primaryCommand(context) {
  if (['zss','cns','st','lua','txt'].includes(context.kind)) return 'ikemen.codeStructure.openWorkspace';
  if (['cmd','inp','jnp','dat'].includes(context.kind)) return 'ikemen.commandMovelist.openEditor';
  if (context.kind === 'air') return 'air.openAnimationPreview';
  if (context.role === 'stage') return 'ikemen.stage.openWorkspace';
  if (context.role === 'screenpack') return 'ikemen.ui.openWorkspace';
  if (context.role === 'roster') return 'ikemen.selectDef.openWorkspace';
  if (context.kind === 'def') return 'ikemen.characterDependencies.open';
  return '';
}

function contextDescriptor(document, classification, navigation = require('./viewer_navigation')) {
  const filename = document?.fileName ? path.resolve(document.fileName) : path.resolve('.ikemaker-text-companion-neutral');
  const files = document?.fileName ? [filename] : [];
  if (!classification?.supported || document?.isClosed) return { type:'project', key:filename, label:'Unsupported editor', root:'', files, neutral:true };
  if (classification.role === 'stage' && classification.kind === 'def') { const folder=path.dirname(filename),broad=path.basename(folder).toLowerCase()==='stages';return { type:'stage', key:filename, label:path.basename(filename,path.extname(filename)), root:broad?'':folder, files }; }
  if (['screenpack','roster'].includes(classification.role) && classification.kind === 'def') { const folder=path.dirname(filename),broad=/^(?:data|motif)$/i.test(path.basename(folder));return { type:'screenpack', key:filename, label:path.basename(filename,path.extname(filename)), root:broad?'':folder, files }; }
  if (classification.role === 'character') {
    if (classification.kind === 'def') return { type:'character', key:path.dirname(filename), label:path.basename(path.dirname(filename)), root:path.dirname(filename), files:[filename], ownerDef:filename };
    let owners=[];try{owners=navigation.associatedDefs(filename);}catch{}
    if (owners.length===1) { const ownerDef=path.resolve(owners[0]),root=path.dirname(ownerDef);return { type:'character', key:root, label:path.basename(root), root, files:[ownerDef,filename], ownerDef }; }
  }
  const directory=path.dirname(filename),script=classification.role==='script';return { type:'project', key:script?directory:filename, label:path.basename(script?directory:filename), root:script?directory:'', files, private:true };
}

function hasAction(bound, command) { return Boolean(bound?.classification?.supported && actionsFor(bound.classification).some(action => action.command === command)); }
function textToolbarModel(bound = {}) {
  const classification=bound.classification||{},document=bound.document,descriptor=bound.descriptor||{},supported=classification.supported===true&&!document?.isClosed,fileDocument=supported&&document?.uri?.scheme==='file',character=descriptor.type==='character'&&Boolean(descriptor.ownerDef),paletteDef=classification.kind==='def'&&((descriptor.type==='stage'&&classification.role==='stage')||(descriptor.type==='screenpack'&&classification.role==='screenpack'));
  const capabilities=Object.fromEntries(SLOTS.map(slot=>[slot.id,{enabled:false,reason:supported?`${slot.label} is not available for this ${classification.label||'editor'} context.`:'Open or bind a supported IKEMaker text file to use this action.'}]));
  const enable=(id,dispatch)=>capabilities[id]={enabled:true,dispatch};
  enable('close','internal:close');
  for(const [id,command]of Object.entries(TOOLBAR_COMMANDS))enable(id,'command:'+command);
  if(supported){enable('actions-search','internal:actions-search');enable('run','internal:run');enable('versus','internal:versus');enable('training','internal:training');enable('recovery','internal:recovery');enable('stage','internal:stage');enable('viewer-browser','internal:viewer-browser');}
  if(fileDocument){enable('text-source','internal:text-source');capabilities['text-source']={...capabilities['text-source'],capabilityId:'implemented.text-companion-source',resolverId:'text-companion.exact-source',routeKind:'exact-document'};enable('backup','internal:backup');}
  else capabilities['text-source']={enabled:false,reason:'Text / Source requires a supported, open file-backed native document.'};
  if(supported&&classification.writable){enable('save','internal:save');enable('auto-save','internal:auto-save');enable('save-as','internal:save-as');}
  if(character){enable('connected-resources','internal:connected-resources');capabilities['connected-resources']={...capabilities['connected-resources'],routeKind:'connected-resources'};for(const id of ['sprites','animations','sounds'])enable(id,'internal:'+id);}
  else capabilities['connected-resources']={enabled:false,reason:'Connected Resources requires an unambiguous character owner for the bound document.'};
  if(character||paletteDef)enable('palettes','internal:palettes');
  if(hasAction(bound,'ikemen.commandMovelist.openEditor'))enable('commands','internal:commands');
  if(hasAction(bound,'zss.openControllers'))enable('states','internal:states');
  if(hasAction(bound,'ikemen.codeStructure.openWorkspace'))enable('code-structure','internal:code-structure');
  let textAutoSave=false;try{textAutoSave=require('./save_controls').textEnabled(document?.fileName||'');}catch(_){ }
  return adapt('companion.text-toolbar',capabilities,{resolverIds:['text-companion.exact-source'],autoSaveEnabled:textAutoSave,seed:document?.fileName||''});
}

function validBodyMessage(message) {
  if(!message||Object.getPrototypeOf(message)!==Object.prototype)return false;
  const keys=Object.keys(message).sort();
  if(message.type==='run')return keys.length===2&&keys[0]==='id'&&keys[1]==='type'&&typeof message.id==='string'&&Boolean(message.id);
  if(message.type==='favorite')return keys.length===3&&keys[0]==='id'&&keys[1]==='type'&&keys[2]==='value'&&typeof message.id==='string'&&Boolean(message.id)&&typeof message.value==='boolean';
  if(message.type==='select-connected')return (keys.length===2||keys.length===3)&&keys.every(key=>['generation','index','type'].includes(key))&&Number.isInteger(message.index)&&message.index>=0&&message.index<512&&(!Object.prototype.hasOwnProperty.call(message,'generation')||(Number.isSafeInteger(message.generation)&&message.generation>=0));
  if(message.type==='reorder-connected')return keys.length===4&&keys.every(key=>['beforeIdentity','generation','identity','type'].includes(key))&&typeof message.identity==='string'&&message.identity.length>0&&message.identity.length<=8192&&(message.beforeIdentity===null||(typeof message.beforeIdentity==='string'&&message.beforeIdentity.length>0&&message.beforeIdentity.length<=8192))&&Number.isSafeInteger(message.generation)&&message.generation>=0;
  if(message.type==='pin-connected')return keys.length===4&&keys.every(key=>['generation','identity','pinned','type'].includes(key))&&typeof message.identity==='string'&&message.identity.length>0&&message.identity.length<=8192&&typeof message.pinned==='boolean'&&Number.isSafeInteger(message.generation)&&message.generation>=0;
  if(message.type==='hide-connected')return keys.length===4&&keys.every(key=>['generation','hidden','identity','type'].includes(key))&&typeof message.identity==='string'&&message.identity.length>0&&message.identity.length<=8192&&typeof message.hidden==='boolean'&&Number.isSafeInteger(message.generation)&&message.generation>=0;
  if(message.type==='unhide-all-connected')return keys.length===2&&keys[0]==='generation'&&keys[1]==='type'&&Number.isSafeInteger(message.generation)&&message.generation>=0;
  if(message.type==='connected-tab-action')return keys.length===4&&keys.every(key=>['action','generation','identity','type'].includes(key))&&['close','close-others','close-right','close-saved','close-all','copy-path','copy-relative-path','copy-breadcrumbs-path','split-right','split-move-right','split-move-left','move-new-window','copy-new-window'].includes(message.action)&&typeof message.identity==='string'&&message.identity.length>0&&message.identity.length<=8192&&Number.isSafeInteger(message.generation)&&message.generation>=0;
  if(message.type==='toggle-grouped-files')return keys.length===1&&keys[0]==='type';
  if(message.type==='toggle-header-only')return keys.length===1&&keys[0]==='type';
  if(message.type==='fit-header-height')return keys.length===3&&keys[0]==='contentHeight'&&keys[1]==='type'&&keys[2]==='viewportHeight'&&Number.isFinite(message.contentHeight)&&Number.isFinite(message.viewportHeight)&&message.contentHeight>=60&&message.contentHeight<=600&&message.viewportHeight>=80&&message.viewportHeight<=3000;
  if(message.type==='dropdown-layout')return keys.length===4&&keys[0]==='contentHeight'&&keys[1]==='open'&&keys[2]==='type'&&keys[3]==='viewportHeight'&&typeof message.open==='boolean'&&Number.isFinite(message.contentHeight)&&message.contentHeight>=0&&message.contentHeight<=1800&&Number.isFinite(message.viewportHeight)&&message.viewportHeight>=80&&message.viewportHeight<=3000;
  if(message.type==='focus-air-browser')return keys.length===1&&keys[0]==='type';
  if(message.type==='reopen-air-browser')return keys.length===1&&keys[0]==='type';
  if(message.type==='close-air-source')return keys.length===1&&keys[0]==='type';
  if(message.type==='air-return-rendered')return keys.length===2&&keys[0]==='token'&&keys[1]==='type'&&typeof message.token==='string'&&/^[a-f0-9]{48}$/.test(message.token);
  return false;
}

function airBrowserControlState(filename, kind, routedSourceLookup, directSessionLookup = hasAirBrowserSession) {
  if (!filename) return { returnAvailable: false, closeAvailable: false, reopenAvailable: false };
  const lookup = routedSourceLookup || ((candidate) => {
    try { return require('./air_docking_workspace').sourceHandoffDetails(candidate); } catch (_) { return null; }
  });
  const route = lookup(filename),routed=Boolean(route&&route.available!==false),reopenAvailable=Boolean(route&&!routed&&route.origin);
  return { returnAvailable: routed || (kind === 'air' && directSessionLookup(filename)), closeAvailable: routed, reopenAvailable };
}
function airBrowserControlsAvailable(filename, kind, routedSourceLookup, directSessionLookup) { return airBrowserControlState(filename, kind, routedSourceLookup, directSessionLookup).returnAvailable; }
function exactAirReturnRenderAdoption(request, rendered, selectedFile, attachedPanel, route) {
  return Boolean(request&&rendered===true&&attachedPanel&&request.panel===attachedPanel&&typeof selectedFile==='string'&&path.resolve(selectedFile).toLowerCase()===request.filename&&route&&route.available===true&&String(route.origin||'').toLowerCase()===request.origin);
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function fileKind(filename,languageId=''){
  if(languageId==='lua')return'lua';
  if(languageId==='zss')return'zss';
  if(languageId==='ikemen-cns'){const native=path.extname(filename||'').slice(1).toLowerCase();return['cns','st','cmd'].includes(native)?native:'cns';}
  const extension=path.extname(filename||'').slice(1).toLowerCase();
  return ['def','air','zss','cns','st','cmd','inp','jnp','dat','lua','txt'].includes(extension)?extension:'text';
}
function fileKindLabel(kind){return({lua:'Lua',zss:'ZSS',cns:'CNS',st:'CNS/ST',cmd:'CMD',inp:'INP',jnp:'JNP',dat:'DAT',def:'DEF',air:'AIR',txt:'Text',text:'Text'})[String(kind||'').toLowerCase()]||String(kind||'Text').toUpperCase();}

function fileOrigin(filename,descriptor={}){
  const target=path.resolve(filename||'.'),root=typeof descriptor.root==='string'&&path.isAbsolute(descriptor.root)?path.resolve(descriptor.root):'';
  if(descriptor.type==='character'){
    if(root){
      const relative=path.relative(root,target),inside=relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
      if(inside){const directories=relative.split(path.sep).slice(0,-1);return directories.some(part=>/template/i.test(part))?'Template':'Character';}
    }
    if(path.dirname(target).split(path.sep).some(part=>/template/i.test(part)))return'Template';
    return'Shared';
  }
  if(descriptor.type==='stage')return'Stage';
  if(descriptor.type==='screenpack'||descriptor.type==='roster')return'Screenpack';
  return'Connected';
}

const MAX_CONNECTED_FILES=512;
function connectedOwnerIdentity(descriptor={}){
  if(!descriptor||typeof descriptor!=='object')return'';
  const type=String(descriptor.type||descriptor.kind||'').toLowerCase();
  if(!type)return'';
  const declared=String(descriptor.identity||descriptor.id||'').trim();
  if(declared)return`${type}|${declared.toLowerCase()}`;
  const exactCharacterOwner=type==='character'&&typeof descriptor.ownerDef==='string'&&path.isAbsolute(descriptor.ownerDef)&&path.extname(descriptor.ownerDef).toLowerCase()==='.def'?descriptor.ownerDef:'';
  const candidate=exactCharacterOwner||(typeof descriptor.root==='string'&&path.isAbsolute(descriptor.root)?descriptor.root:typeof descriptor.key==='string'&&path.isAbsolute(descriptor.key)?descriptor.key:'');
  return candidate?`${type}|${path.resolve(candidate).toLowerCase()}`:'';
}
function sameConnectedOwner(left,right){const a=connectedOwnerIdentity(left),b=connectedOwnerIdentity(right);return Boolean(a&&b&&a===b);}
function mergeConnectedFilePaths(retained,incoming,selectedFile,preserve){
  const admitted=[...new Map([...(preserve?retained:[]),...incoming].filter(value=>typeof value==='string'&&path.isAbsolute(value)).map(filename=>{const exact=path.resolve(filename);return[exact.toLowerCase(),exact];})).values()],selected=typeof selectedFile==='string'&&path.isAbsolute(selectedFile)?path.resolve(selectedFile):'';
  if(!selected)return admitted.slice(0,MAX_CONNECTED_FILES);
  const without=admitted.filter(filename=>filename.toLowerCase()!==selected.toLowerCase()),bounded=without.slice(0,MAX_CONNECTED_FILES-1);bounded.push(selected);return bounded;
}

function plainExact(value, keys) {
  return Boolean(value) && Object.getPrototypeOf(value) === Object.prototype && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function boundedRestoreString(value, maximum, allowEmpty = true) {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && Buffer.byteLength(value, 'utf8') <= maximum;
}

function serializedCompanionState(input = {}) {
  const files=[...new Set((input.files||[]).map(value=>typeof value==='string'?path.resolve(value):'').filter(value=>value&&path.isAbsolute(value)))].slice(0,512);
  if(!files.length)return null;
  const selected=typeof input.selectedFile==='string'&&files.some(file=>file.toLowerCase()===path.resolve(input.selectedFile).toLowerCase())?path.resolve(input.selectedFile):files[0];
  const source=input.context&&typeof input.context==='object'?input.context:{},context={
    type:String(source.type||'project').slice(0,64),
    key:String(source.key||source.identity||source.id||path.dirname(files[0])).slice(0,8192),
    label:String(source.label||path.basename(path.dirname(files[0]))).slice(0,256),
    root:typeof source.root==='string'&&path.isAbsolute(source.root)?path.resolve(source.root):'',
    identity:String(source.identity||source.id||'').slice(0,8192)
  };
  const state={schema:COMPANION_RESTORE_SCHEMA,version:COMPANION_RESTORE_VERSION,files,selectedFile:selected,mode:'tabs',nativeColumn:Number.isInteger(input.nativeColumn)&&input.nativeColumn>0&&input.nativeColumn<100?input.nativeColumn:1,context};
  return Buffer.byteLength(JSON.stringify(state),'utf8')<=MAX_RESTORE_BYTES?Object.freeze(state):null;
}

function parseCompanionState(value) {
  if(!plainExact(value,['schema','version','files','selectedFile','mode','nativeColumn','context'])||value.schema!==COMPANION_RESTORE_SCHEMA||value.version!==COMPANION_RESTORE_VERSION||!Array.isArray(value.files)||!value.files.length||value.files.length>512||!['tabs','cards','list'].includes(value.mode)||!Number.isInteger(value.nativeColumn)||value.nativeColumn<1||value.nativeColumn>=100)return null;
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>MAX_RESTORE_BYTES)return null;
  const files=[];for(const candidate of value.files){if(!boundedRestoreString(candidate,8192,false)||!path.isAbsolute(candidate))return null;const filename=path.resolve(candidate);if(files.some(item=>item.toLowerCase()===filename.toLowerCase()))return null;files.push(filename);}
  if(!boundedRestoreString(value.selectedFile,8192,false)||!path.isAbsolute(value.selectedFile))return null;const selectedFile=path.resolve(value.selectedFile);if(!files.some(file=>file.toLowerCase()===selectedFile.toLowerCase()))return null;
  const context=value.context;if(!plainExact(context,['type','key','label','root','identity'])||!boundedRestoreString(context.type,64,false)||!boundedRestoreString(context.key,8192)||!boundedRestoreString(context.label,256)||!boundedRestoreString(context.root,8192)||!boundedRestoreString(context.identity,8192)||(context.root&&!path.isAbsolute(context.root)))return null;
  return Object.freeze({schema:value.schema,version:value.version,files:Object.freeze(files),selectedFile,mode:'tabs',nativeColumn:value.nativeColumn,context:Object.freeze({...context,root:context.root?path.resolve(context.root):''})});
}

function companionHtml(context, actions, favorites, toolbarModel = textToolbarModel(), navigationState = {}) {
  const sharedMenuCss='.launch-controls .viewer-dropdown>div{display:block!important;width:auto!important;min-width:220px!important;max-width:none!important;max-height:min(70vh,620px)!important;overflow:auto!important;padding:5px!important;font-size:var(--vscode-font-size,13px)!important}.launch-controls .viewer-dropdown>div>button{display:block!important;width:100%!important;padding:6px 8px!important;white-space:nowrap!important}.launch-controls .viewer-dropdown>div>hr{width:auto!important;height:0!important;border:0!important;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-panel-border))!important;margin:5px!important;grid-row:auto!important}';
  const universal=renderUniversalToolbar(toolbarModel,{surfaceId:'companion.text-toolbar'});
  const toolbar=viewerToolbar.iconToolbarHtml('code'),menus=`<style>${entityHeader.style()}</style>${entityHeader.html()}${viewerToolbar.menuHtml('code')}<style>${sharedMenuCss}</style>${universal}`;
  const files=Array.isArray(navigationState.files)?navigationState.files.slice(0,512):[],selected=Math.max(0,Math.min(files.length-1,Number(navigationState.index)||0));
  const button=(file,index)=>{const label=file.label||path.basename(file.filename||''),status=Array.isArray(file.status)?file.status.slice(0,8):[],origin=file.origin||'Connected',kind=file.kind||fileKind(file.filename,file.languageId),detail=[origin,...status,fileKindLabel(kind)],summary=` · ${detail.join(', ')}`,selectedState=index===selected,identity=file.id||entityFileOrderKey(file.filename||label);return `<button type="button" role="tab" aria-selected="${selectedState}" draggable="true" aria-label="${escapeHtml((file.pinned?'Pinned · ':'')+label+summary)}" tabindex="${selectedState?'0':'-1'}" data-connected-index="${index}" data-file-identity="${escapeHtml(identity)}" data-file-pinned="${file.pinned?'true':'false'}" data-file-kind="${escapeHtml(kind)}" data-file-origin="${escapeHtml(origin.toLowerCase())}" title="${escapeHtml((file.filename||label)+summary)}"><span>${file.pinned?'📌 ':''}${escapeHtml(label)}</span><small>${escapeHtml(detail.join(' · '))}</small></button>`;};
  const tabParts=[];for(let index=0;index<files.length;index++){const file=files[index],label=file.label||path.basename(file.filename||'');if(file.hidden){const identity=file.id||entityFileOrderKey(file.filename||label);tabParts.push(`<button type="button" class="hidden-tab-marker" data-hidden-identity="${escapeHtml(identity)}" aria-label="Hidden tab: ${escapeHtml(label)}. Click to unhide." aria-pressed="${index===selected}" title="${escapeHtml(label)} · Click to unhide"></button>`);continue;}tabParts.push(button(file,index));}const tabs=tabParts.join(''),hiddenCount=files.filter(file=>file.hidden).length;
  const airControls=navigationState.airBrowserControls||{returnAvailable:false,closeAvailable:false,reopenAvailable:false};
  const airOriginBanner=(airControls.returnAvailable||airControls.reopenAvailable)?`
      <section class="air-origin-banner" role="navigation" aria-label="AIR source return">
        <span class="air-origin-label" role="status" aria-live="polite">${airControls.returnAvailable?'Opened from AIR Actions Browser':'AIR Actions Browser closed'}</span>
        <span class="air-origin-actions">
          ${airControls.returnAvailable?'<button type="button" class="air-browser-return" data-focus-air-browser aria-label="Return to AIR Actions Browser" title="Return to AIR Actions Browser">← Return to AIR Browser</button>':'<button type="button" class="air-browser-return" data-reopen-air-browser aria-label="Reopen exact AIR Actions Browser" title="Reopen the exact AIR Actions Browser that opened this source">↻ Reopen AIR Actions Browser</button>'}
          ${airControls.closeAvailable?'<button type="button" class="air-browser-return" data-close-air-source aria-label="Close source and return to AIR Actions Browser" title="Close this source and return to AIR Actions Browser">Close Source &amp; Return</button>':''}
        </span>
      </section>`:'';
  const navigation=files.length?`
    <style>
      html,body{width:100%;height:100%;overflow-x:hidden;overflow-y:auto}
      .navigation-browser{overflow:hidden}
      .connected-nav{grid-template-columns:58px minmax(80px,1fr) 58px 27px 27px minmax(80px,auto)!important}
      .scroll-pair{display:inline-flex;gap:3px}
      .tab-viewport{overflow:hidden!important;scroll-behavior:auto!important;scrollbar-width:none}
      .tab-viewport::-webkit-scrollbar{display:none}
      .hidden-tab-marker{flex:0 0 9px!important;align-self:stretch;width:9px!important;min-width:9px!important;max-width:9px!important;padding:0!important;border:0!important;border-left:3px double var(--vscode-focusBorder)!important;border-right:3px double var(--vscode-focusBorder)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:transparent!important}.hidden-tab-marker:hover,.hidden-tab-marker:focus-visible{background:color-mix(in srgb,var(--vscode-focusBorder) 18%,transparent)!important}.hidden-tab-marker[aria-pressed="true"]{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
      .air-origin-banner{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;margin:2px 0 5px;padding:4px 6px;border:1px solid var(--vscode-focusBorder);background:var(--vscode-editorInfo-background,var(--vscode-sideBar-background));overflow:hidden}
      .air-origin-label{min-width:0;overflow-wrap:anywhere;font-weight:600}
      .air-origin-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}
      .air-browser-return{width:auto!important;min-height:27px!important;height:auto!important;padding:3px 7px!important;font-size:11px;white-space:normal;overflow-wrap:anywhere}
      @media(max-width:520px){.air-origin-banner{align-items:stretch;flex-direction:column}.air-origin-actions{align-items:stretch;flex-direction:column}.air-browser-return{width:100%!important}.connected-nav{grid-template-columns:58px minmax(40px,1fr) 58px 27px 27px!important;grid-template-rows:auto auto}.connected-nav>span[role=status]{grid-column:1/-1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
    </style>
    <main class="navigation-browser">
      ${airOriginBanner}
      <div class="connected-nav">
        <span class="scroll-pair"><button type="button" data-scroll-tabs="-1" aria-label="Scroll text tabs left" title="Scroll text tabs left">←</button><button type="button" data-scroll-tabs="1" aria-label="Scroll text tabs right" title="Scroll text tabs right">→</button></span>
        <input id="tab-scroll-slider" type="range" min="0" max="0" value="0" aria-label="Scroll text tabs">
        <span class="scroll-pair"><button type="button" data-scroll-tabs="-1" aria-label="Scroll text tabs left" title="Scroll text tabs left">←</button><button type="button" data-scroll-tabs="1" aria-label="Scroll text tabs right" title="Scroll text tabs right">→</button></span>
        <button type="button" class="header-only-toggle" data-grouped-files-toggle aria-pressed="${navigationState.groupedFilesEnabled?'true':'false'}" aria-label="Toggle Grouped files" title="${navigationState.groupedFilesEnabled?'Turn off Grouped files and restore the prior workspace tab display':'Group this entity’s files in Code Navigation and reduce native tabs to one visible tab per editor group. Workspace/window scope; prior workspace value is restored.'}">▦</button>
        <button type="button" class="header-only-toggle" data-header-only-toggle aria-pressed="${navigationState.headerOnlyEnabled?'true':'false'}" aria-label="Toggle Header-Only Text Layout" title="${navigationState.headerOnlyEnabled?'Restore native VS Code tabs and editor scrollbars':'Use IKEMaker header only; hide native VS Code tabs and editor scrollbars. This turns off Grouped files.'}">▱</button>
        <span role="status" aria-live="polite">${selected+1} / ${files.length} · ${escapeHtml(files[selected]?.label||path.basename(files[selected]?.filename||''))}${hiddenCount?` · ${hiddenCount} hidden`:''}</span>
      </div>
      <div class="tab-viewport"><section class="tabs" role="tablist" aria-label="Connected native editor tabs">${tabs}</section></div>
      <script>(()=>{
        const viewport=document.querySelector('.tab-viewport'),slider=document.getElementById('tab-scroll-slider'),buttons=[...document.querySelectorAll('[data-scroll-tabs]')];
        if(!viewport||!slider)return;
        const limit=()=>Math.max(0,viewport.scrollWidth-viewport.clientWidth),sync=()=>{const max=limit();slider.max=String(max);slider.value=String(Math.max(0,Math.min(max,Math.round(viewport.scrollLeft))));slider.disabled=max===0;for(const button of buttons){const direction=Number(button.dataset.scrollTabs);button.disabled=max===0||(direction<0&&viewport.scrollLeft<=0)||(direction>0&&viewport.scrollLeft>=max-1)}};
        buttons.forEach(button=>button.addEventListener('click',()=>viewport.scrollBy({left:Number(button.dataset.scrollTabs)*Math.max(96,Math.min(220,(viewport.clientWidth||320)*.35)),behavior:'smooth'})));
        slider.addEventListener('input',event=>{viewport.scrollLeft=Number(event.target.value)||0});
        document.querySelector('[data-grouped-files-toggle]')?.addEventListener('click',()=>vscode.postMessage({type:'toggle-grouped-files'}));
        document.querySelector('[data-header-only-toggle]')?.addEventListener('click',()=>vscode.postMessage({type:'toggle-header-only'}));
        document.querySelector('[data-focus-air-browser]')?.addEventListener('click',()=>vscode.postMessage({type:'focus-air-browser'}));
        document.querySelector('[data-reopen-air-browser]')?.addEventListener('click',()=>vscode.postMessage({type:'reopen-air-browser'}));
        document.querySelector('[data-close-air-source]')?.addEventListener('click',()=>vscode.postMessage({type:'close-air-source'}));
        window.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented||!document.querySelector('[data-focus-air-browser]'))return;event.preventDefault();vscode.postMessage({type:'focus-air-browser'})});
        const airReturnRenderToken=${JSON.stringify(navigationState.airReturnRenderToken||'')};
        if(airReturnRenderToken&&document.querySelector('[data-focus-air-browser]'))requestAnimationFrame(()=>vscode.postMessage({type:'air-return-rendered',token:airReturnRenderToken}));
        viewport.addEventListener('scroll',sync,{passive:true});
        window.addEventListener('resize',sync);
        const organizationGeneration=${Number.isSafeInteger(navigationState.generation)?navigationState.generation:0},fileTabs=[...document.querySelectorAll('[data-file-identity]')],hiddenMarkers=[...document.querySelectorAll('[data-hidden-identity]')],hiddenCount=${hiddenCount};let draggedIdentity='';
        const sendOrganization=message=>vscode.postMessage({...message,generation:organizationGeneration});
        const menuAction=(menu,label,run,disabled=false)=>{if(label==='Keep Open')return null;const item=document.createElement('button');item.type='button';item.textContent=label;item.disabled=disabled;item.addEventListener('click',()=>{if(disabled)return;run();menu.remove()});menu.append(item);return item};const menuSeparator=menu=>{const line=document.createElement('hr');line.style.cssText='width:100%;border:0;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-panel-border));margin:2px 0';menu.append(line)};const placeMenu=(menu,event)=>{document.body.append(menu);menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-(menu.offsetWidth||220)-4))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-(menu.offsetHeight||300)-4))+'px';menu.querySelector('button:not(:disabled)')?.focus()};
        fileTabs.forEach((button,index)=>button.addEventListener('contextmenu',event=>{event.preventDefault();event.stopImmediatePropagation();document.querySelector('[data-file-tab-menu]')?.remove();const menu=document.createElement('div');menu.dataset.fileTabMenu='true';menu.setAttribute('role','menu');menu.style.cssText='position:fixed;z-index:9999;display:grid;gap:3px;min-width:220px;max-height:min(78vh,640px);overflow:auto;padding:4px;border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));background:var(--vscode-menu-background,var(--vscode-editor-background))';const identity=button.dataset.fileIdentity,tabAction=action=>sendOrganization({type:'connected-tab-action',action,identity});menuAction(menu,'Move Left',()=>index>0&&sendOrganization({type:'reorder-connected',identity,beforeIdentity:fileTabs[index-1].dataset.fileIdentity}),index===0);menuAction(menu,'Move Right',()=>index<fileTabs.length-1&&sendOrganization({type:'reorder-connected',identity,beforeIdentity:fileTabs[index+2]?.dataset.fileIdentity||null}),index===fileTabs.length-1);menuAction(menu,button.dataset.filePinned==='true'?'Unpin':'Pin',()=>sendOrganization({type:'pin-connected',identity,pinned:button.dataset.filePinned!=='true'}));menuAction(menu,'Hide',()=>sendOrganization({type:'hide-connected',identity,hidden:true}));menuAction(menu,'Unhide All',()=>sendOrganization({type:'unhide-all-connected'}),hiddenCount===0);menuSeparator(menu);menuAction(menu,'Close',()=>tabAction('close'));menuAction(menu,'Close Others',()=>tabAction('close-others'));menuAction(menu,'Close to the Right',()=>tabAction('close-right'));menuAction(menu,'Close Saved',()=>tabAction('close-saved'));menuAction(menu,'Close All',()=>tabAction('close-all'));menuSeparator(menu);menuAction(menu,'Copy Path',()=>tabAction('copy-path'));menuAction(menu,'Copy Relative Path',()=>tabAction('copy-relative-path'));menuAction(menu,'Copy Breadcrumbs Path',()=>tabAction('copy-breadcrumbs-path'));menuSeparator(menu);menuAction(menu,'Keep Open',()=>tabAction('keep-open'));menuAction(menu,'Split Right',()=>tabAction('split-right'));menuAction(menu,'Split & Move Right',()=>tabAction('split-move-right'));menuAction(menu,'Split & Move Left',()=>tabAction('split-move-left'));menuAction(menu,'Move into New Window',()=>tabAction('move-new-window'));menuAction(menu,'Copy into New Window',()=>tabAction('copy-new-window'));placeMenu(menu,event)},{capture:true}));
        hiddenMarkers.forEach(marker=>marker.addEventListener('click',event=>{event.preventDefault();sendOrganization({type:'hide-connected',identity:marker.dataset.hiddenIdentity,hidden:false})}));
        fileTabs.forEach((button,index)=>{if(organizationGeneration>0)button.addEventListener('click',()=>sendOrganization({type:'select-connected',index:Number(button.dataset.connectedIndex)}),{capture:true});button.addEventListener('dragstart',event=>{draggedIdentity=button.dataset.fileIdentity||'';event.dataTransfer?.setData('text/plain',draggedIdentity)});button.addEventListener('dragover',event=>{if(draggedIdentity){event.preventDefault();button.dataset.dropTarget='true'}});button.addEventListener('dragleave',()=>delete button.dataset.dropTarget);button.addEventListener('drop',event=>{event.preventDefault();delete button.dataset.dropTarget;const identity=event.dataTransfer?.getData('text/plain')||draggedIdentity;if(identity&&identity!==button.dataset.fileIdentity)sendOrganization({type:'reorder-connected',identity,beforeIdentity:button.dataset.fileIdentity})});button.addEventListener('keydown',event=>{if(event.altKey&&event.key.toLowerCase()==='p'){event.preventDefault();sendOrganization({type:'pin-connected',identity:button.dataset.fileIdentity,pinned:button.dataset.filePinned!=='true'});return}if(!event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const target=index+(event.key==='ArrowLeft'?-1:1);if(target<0||target>=fileTabs.length)return;sendOrganization({type:'reorder-connected',identity:button.dataset.fileIdentity,beforeIdentity:event.key==='ArrowLeft'?fileTabs[target].dataset.fileIdentity:(fileTabs[target+1]?.dataset.fileIdentity||null)})});button.addEventListener('contextmenu',event=>{event.preventDefault();document.querySelector('[data-file-tab-menu]')?.remove();const menu=document.createElement('div');menu.dataset.fileTabMenu='true';menu.setAttribute('role','menu');menu.style.cssText='position:fixed;z-index:9999;display:grid;gap:3px;min-width:150px;padding:4px;border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));background:var(--vscode-menu-background,var(--vscode-editor-background))';menuAction(menu,'Move Left',()=>index>0&&sendOrganization({type:'reorder-connected',identity:button.dataset.fileIdentity,beforeIdentity:fileTabs[index-1].dataset.fileIdentity}),index===0);menuAction(menu,'Move Right',()=>index<fileTabs.length-1&&sendOrganization({type:'reorder-connected',identity:button.dataset.fileIdentity,beforeIdentity:fileTabs[index+2]?.dataset.fileIdentity||null}),index===fileTabs.length-1);menuAction(menu,button.dataset.filePinned==='true'?'Unpin':'Pin',()=>sendOrganization({type:'pin-connected',identity:button.dataset.fileIdentity,pinned:button.dataset.filePinned!=='true'}));menuAction(menu,'Hide',()=>sendOrganization({type:'hide-connected',identity:button.dataset.fileIdentity,hidden:true}));menuAction(menu,'Unhide All',()=>sendOrganization({type:'unhide-all-connected'}),hiddenCount===0);placeMenu(menu,event)})});
        document.addEventListener('click',event=>{if(!event.target.closest('[data-file-tab-menu]'))document.querySelector('[data-file-tab-menu]')?.remove()});
        requestAnimationFrame(sync);
      })()</script>
    </main>`:`<main class="navigation-browser"><p role="status">${escapeHtml(navigationState.unavailableReason||'No connected code files are available.')}</p></main>`;
  const restoreJson=JSON.stringify(navigationState.restore||null).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${viewerToolbar.style()}:root{color-scheme:light dark}*{box-sizing:border-box}html,body{overflow:hidden}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:12px var(--vscode-font-family)}button,input{font:inherit;color:inherit}.launch-controls{display:flex;flex-direction:column;align-items:stretch;overflow:visible;border-bottom:1px solid var(--vscode-panel-border)}.launch-controls>.viewer-dropdown-toolbar{order:0}.launch-controls>.ikemaker-universal-toolbar{order:1}.viewer-dropdown>div{display:grid;grid-auto-flow:column;grid-template-rows:repeat(3,auto);grid-auto-columns:minmax(220px,max-content);width:max-content;max-width:calc(100vw - 16px);max-height:none!important;overflow:visible!important;padding:5px;font-size:var(--vscode-font-size,13px)}.viewer-dropdown>div>button{padding:6px 8px}.viewer-dropdown>div>hr{width:1px;height:100%;border:0;border-left:1px solid var(--vscode-menu-separatorBackground,var(--vscode-panel-border));margin:0 3px;grid-row:1 / span 3}.viewer-dropdown:nth-last-of-type(-n+4)>div{left:auto;right:0}.navigation-browser{padding:3px 8px 7px}.navigation-browser button{--tab-kind:var(--vscode-panel-border);background:color-mix(in srgb,var(--tab-kind) 10%,var(--vscode-button-secondaryBackground,var(--vscode-input-background)));border:1px solid color-mix(in srgb,var(--tab-kind) 72%,var(--vscode-panel-border));box-shadow:inset 0 2px var(--tab-kind);padding:4px 7px}.navigation-browser button[data-file-kind="def"]{--tab-kind:#4f9bd8}.navigation-browser button[data-file-kind="air"]{--tab-kind:#a77bd8}.navigation-browser button[data-file-kind="zss"],.navigation-browser button[data-file-kind="cns"],.navigation-browser button[data-file-kind="st"]{--tab-kind:#44a88d}.navigation-browser button[data-file-kind="cmd"],.navigation-browser button[data-file-kind="inp"],.navigation-browser button[data-file-kind="jnp"],.navigation-browser button[data-file-kind="dat"]{--tab-kind:#d19a55}.navigation-browser button[data-file-kind="lua"]{--tab-kind:#5c9dd5}.navigation-browser button:focus-visible,.navigation-browser input:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.navigation-browser button[aria-selected="true"]{border-color:var(--vscode-focusBorder);background:color-mix(in srgb,var(--tab-kind) 24%,var(--vscode-editor-background));color:var(--vscode-foreground)}.navigation-browser button small{display:block;color:var(--vscode-descriptionForeground);font-size:10px}.navigation-browser button[aria-selected="true"] small{color:inherit}.connected-nav{display:grid;grid-template-columns:58px minmax(80px,1fr) 58px 27px 27px minmax(80px,auto);gap:5px;align-items:center;margin:3px 0 5px}.connected-nav button{box-sizing:border-box;width:27px;height:27px;padding:0;box-shadow:none}.header-only-toggle{border-color:var(--vscode-focusBorder)!important}.header-only-toggle[aria-pressed="true"]{background:var(--vscode-list-activeSelectionBackground)!important;color:var(--vscode-list-activeSelectionForeground)!important}.tab-viewport{max-width:100%;overflow:hidden;scroll-behavior:smooth}.tabs{display:flex;flex-flow:row nowrap;gap:3px;width:max-content;min-width:100%}.tabs button{flex:0 0 auto;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tabs button:has(small:is(:not(:empty))){min-height:38px}@media(forced-colors:active){.navigation-browser button[aria-selected="true"],.header-only-toggle[aria-pressed="true"]{outline:2px solid CanvasText;outline-offset:1px}}</style></head><body><div class="launch-controls">${menus}${toolbar}<span class="viewer-toolbar-context" data-toolbar-context role="status" aria-live="polite"></span><span class="viewer-toolbar-options" data-mode="workspace" data-viewer-colors="on" data-toolbar-surface="code" hidden></span></div>${navigation}<script>const vscode=acquireVsCodeApi();const persistedRestore=${restoreJson};const priorState=vscode.getState?.()||{};vscode.setState({...priorState,restore:persistedRestore});${universalToolbarClientScript({vscodeVariable:'vscode'})}${viewerToolbar.clientScript()}const tabButtons=[...document.querySelectorAll('[data-connected-index]')],tabViewport=document.querySelector('.tab-viewport'),slider=document.getElementById('connected-slider');const reveal=index=>{const button=tabButtons[index];if(!button||!tabViewport)return;const left=Math.max(0,button.offsetLeft-(tabViewport.clientWidth-button.offsetWidth)/2);tabViewport.scrollTo({left,behavior:'smooth'})};const choose=index=>{if(!tabButtons.length)return;const bounded=(index+tabButtons.length)%tabButtons.length;reveal(bounded);vscode.postMessage({type:'select-connected',index:bounded})};tabButtons.forEach(button=>button.addEventListener('click',()=>choose(Number(button.dataset.connectedIndex))));document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',()=>choose((Number(slider?.value)||1)-1+Number(button.dataset.move))));slider?.addEventListener('input',event=>choose(Number(event.target.value)-1));document.querySelector('.tabs')?.addEventListener('keydown',event=>{const at=tabButtons.indexOf(event.target);if(at<0)return;let next;if(event.key==='ArrowRight')next=Math.min(tabButtons.length-1,at+1);else if(event.key==='ArrowLeft')next=Math.max(0,at-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=tabButtons.length-1;else return;event.preventDefault();tabButtons[next]?.focus();choose(next)});let headerFitSent=false;const reportHeaderFit=()=>{if(headerFitSent)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(headerFitSent)return;const launch=document.querySelector('.launch-controls'),navigation=document.querySelector('.navigation-browser');if(!launch||!navigation)return;const top=Math.min(launch.getBoundingClientRect().top,navigation.getBoundingClientRect().top),bottom=Math.max(launch.getBoundingClientRect().bottom,navigation.getBoundingClientRect().bottom),contentHeight=Math.ceil(bottom-top),viewportHeight=Math.ceil(document.documentElement.clientHeight);if(Number.isFinite(contentHeight)&&Number.isFinite(viewportHeight)&&contentHeight>=60&&contentHeight<=600&&viewportHeight>=80&&viewportHeight<=3000){headerFitSent=true;vscode.postMessage({type:'fit-header-height',contentHeight,viewportHeight})}}))};document.fonts?.ready?.then(reportHeaderFit,reportHeaderFit);window.addEventListener('load',reportHeaderFit,{once:true});reportHeaderFit();requestAnimationFrame(()=>reveal(Math.max(0,tabButtons.findIndex(button=>button.getAttribute('aria-selected')==='true'))));${viewerCloseClientScript()}</script></body></html>`;
}

const rawCompanionHtml = companionHtml;
companionHtml = function (...args) {
  const dropdownLayoutClient="const reportDropdownLayout=()=>requestAnimationFrame(()=>{const open=[...document.querySelectorAll('.viewer-dropdown[open]')].at(-1),menu=open?.querySelector(':scope>div'),navigation=document.querySelector('.navigation-browser'),viewportHeight=Math.ceil(document.documentElement.clientHeight),contentHeight=open?Math.min(1800,Math.ceil((menu?.scrollHeight||0)+(navigation?.getBoundingClientRect().height||0)+24)):0;if(viewportHeight>=80)vscode.postMessage({type:'dropdown-layout',open:Boolean(open),contentHeight,viewportHeight})});document.querySelectorAll('.viewer-dropdown').forEach(details=>details.addEventListener('toggle',reportDropdownLayout));";
  return rawCompanionHtml(...args)
    .replace('.viewer-dropdown>div{display:grid;grid-auto-flow:column;grid-template-rows:repeat(3,auto);grid-auto-columns:minmax(220px,max-content);width:max-content;max-width:calc(100vw - 16px);max-height:none!important;overflow:visible!important;padding:5px;font-size:var(--vscode-font-size,13px)}.viewer-dropdown>div>button{padding:6px 8px}.viewer-dropdown>div>hr{width:1px;height:100%;border:0;border-left:1px solid var(--vscode-menu-separatorBackground,var(--vscode-panel-border));margin:0 3px;grid-row:1 / span 3}','')
    .replace('const tabButtons=',dropdownLayoutClient+'const tabButtons=')
    .replace('if(organizationGeneration>0)button.addEventListener', 'button.addEventListener')
    .replace(/const tabButtons=\[\.\.\.document\.querySelectorAll\('\[data-connected-index\]'\)\],tabViewport=.*?;let headerFitSent=false;/, "const selectedTab=document.querySelector('[data-connected-index][aria-selected=\"true\"]');requestAnimationFrame(()=>selectedTab?.scrollIntoView({block:'nearest',inline:'center'}));let headerFitSent=false;")
    .replace("document.addEventListener('click',event=>{if(!event.target.closest('[data-file-tab-menu]'))", "fileTabs.forEach((button,index)=>button.addEventListener('keydown',event=>{if(event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?fileTabs.length-1:Math.max(0,Math.min(fileTabs.length-1,index+(event.key==='ArrowLeft'?-1:1)));fileTabs[target]?.focus();sendOrganization({type:'select-connected',index:Number(fileTabs[target]?.dataset.connectedIndex)})}));document.addEventListener('click',event=>{if(!event.target.closest('[data-file-tab-menu]'))");
};

function register(vscode, extensionContext) {
  configureViewerTopology(()=>({all:vscode.window.tabGroups?.all||[],active:vscode.window.tabGroups?.activeTabGroup||null}));
  let panel=null,activeEditor=vscode.window.activeTextEditor,active={document:activeEditor?.document||null,classification:{supported:false,kind:'',role:'',writable:false}},bound={document:null,classification:{supported:false,kind:'',role:'',writable:false,label:'No supported text editor'},descriptor:null,contextEntry:null,contextModel:null},contextQueue=Promise.resolve(),connectedFiles=[],connectedIndex=0,workspaceNavigation=false,workspaceDescriptor=null,nativeColumn=activeEditor?.viewColumn,statusSignature='',statusTimer=null,layoutMode='text-attached',layoutGeneration=0,headerFitApplied=false,headerRepairing=false,groupRepairing=false,serializerRestoring=false,repairProtectedHeader=async()=>false,startupRepairTimer=null,airReturnRenderRequest=null,airReturnRenderGeneration=0,entityRetargetGeneration=0,entityRetargetLock=false,entityUnavailableReason='',currentFileOrganization={order:[],pinned:[],hidden:[]},dropdownLayoutState=null,dropdownLayoutQueue=Promise.resolve();
  const settleAirReturnRender=(accepted=false)=>{const request=airReturnRenderRequest;if(!request)return false;airReturnRenderRequest=null;clearTimeout(request.timer);request.resolve(Boolean(accepted));return true;};
  const beginAirReturnRender=filename=>{settleAirReturnRender(false);const exact=path.resolve(filename),route=(()=>{try{return require('./air_docking_workspace').sourceHandoffDetails(exact);}catch(_){return null;}})(),origin=route?.origin||'';if(!route||route.available===false||!origin)return null;let resolve;const promise=new Promise(done=>{resolve=done}),request={token:crypto.randomBytes(24).toString('hex'),filename:exact.toLowerCase(),origin:String(origin).toLowerCase(),generation:++airReturnRenderGeneration,panel:null,resolve,promise,timer:null};request.timer=setTimeout(()=>{if(airReturnRenderRequest===request)settleAirReturnRender(false);},1500);airReturnRenderRequest=request;return request;};
  const config = () => vscode.workspace.getConfiguration('ikemenZss');
  let textTabLayoutQueue=Promise.resolve();
  const syncTextTabLayout=()=>textTabLayoutQueue=textTabLayoutQueue.then(()=>applyTextTabLayout(vscode,extensionContext,{headerOnly:config().get(HEADER_ONLY_SETTING,false),grouped:config().get(GROUPED_FILES_SETTING,false)}));
  const favoritesKey = 'ikemen.textToolbar.favorites.v1';
  const navigation=require('./viewer_navigation'),contextRegistry=require('./authoring_context_registry');
  const entityFileOrders=entityFileOrder.decodeByEntity(extensionContext.workspaceState.get(ENTITY_FILE_ORDER_KEY,null));
  const uriKey=document=>String(document?.uri?.toString?.()||document?.uri?.fsPath||document?.fileName||'');
  const tabInputPath=tab=>tab?.input?.uri?.fsPath||tab?.input?.modified?.fsPath||tab?.input?.original?.fsPath||'';
  const nativeColumnFor=(candidate,avoidColumn=panel?.viewColumn)=>{
    const connected=new Set(connectedFiles.map(file=>file.filename.toLowerCase()));
    for(const group of vscode.window.tabGroups?.all||[]){if(group?.viewColumn===avoidColumn)continue;if((group?.tabs||[]).some(tab=>{const filename=tabInputPath(tab);return filename&&connected.has(path.resolve(filename).toLowerCase());}))return group.viewColumn;}
    const visible=(vscode.window.visibleTextEditors||[]).find(editor=>editor?.viewColumn!==avoidColumn&&connected.has(path.resolve(editor?.document?.fileName||'.').toLowerCase()));
    if(Number.isInteger(visible?.viewColumn)&&visible.viewColumn>0)return visible.viewColumn;
    if(Number.isInteger(candidate)&&candidate>0&&candidate!==avoidColumn)return candidate;
    return avoidColumn===vscode.ViewColumn?.One?2:1;
  };
  const canonicalLayout=async()=>{
    const generation=layoutGeneration;
    let layout;try{layout=await vscode.commands.executeCommand('vscode.getEditorLayout');}catch(_){ }
    if(generation!==layoutGeneration||layoutMode==='visual-suspended')return false;
    const canonical=attachedLayoutShape(layout);
    if(!canonical){try{await vscode.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());}catch(_){return false;}}
    return generation===layoutGeneration&&layoutMode!=='visual-suspended';
  };
  const fitHeaderLayout=async measurement=>{
    if(headerFitApplied||layoutMode!=='text-attached'||!panel||!config().get(HEADER_ONLY_SETTING,false))return false;
    headerFitApplied=true;
    const generation=layoutGeneration;let layout;
    try{layout=await vscode.commands.executeCommand('vscode.getEditorLayout');}catch(_){return false;}
    if(generation!==layoutGeneration||!attachedLayoutShape(layout))return false;
    const ratio=fittedHeaderRatio(layout,measurement),current=Number(layout.groups[0].size)/(Number(layout.groups[0].size)+Number(layout.groups[1].size));
    if(!Number.isFinite(ratio)||Math.abs(ratio-current)<0.008)return false;
    try{await vscode.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout(ratio));return generation===layoutGeneration;}catch(_){return false;}
  };
  const setDropdownLayout=message=>dropdownLayoutQueue=dropdownLayoutQueue.then(async()=>{
    if(message.open&&(layoutMode!=='text-attached'||!panel))return false;
    let layout;try{layout=await vscode.commands.executeCommand('vscode.getEditorLayout');}catch(_){if(!message.open)dropdownLayoutState=null;return false;}
    if(message.open){
      if(dropdownLayoutState)return true;
      const leaves=textDropdownLayout.leafPaths(layout),column=Number(panel?.viewColumn),targetLeaf=Number.isInteger(column)&&column>0&&column<=leaves.length?column-1:0;
      const factor=Number(message.contentHeight)/Number(message.viewportHeight),prepared=textDropdownLayout.prepareDropdownLayout(layout,targetLeaf,factor);
      if(!prepared)return false;
      dropdownLayoutState=prepared;
      try{await vscode.commands.executeCommand('vscode.setEditorLayout',prepared.expanded);return true;}catch(_){dropdownLayoutState=null;return false;}
    }
    if(!dropdownLayoutState)return true;
    const prepared=dropdownLayoutState;dropdownLayoutState=null;
    const restore=textDropdownLayout.restoreDropdownLayout(layout,prepared);
    if(!restore)return false;
    try{await vscode.commands.executeCommand('vscode.setEditorLayout',restore);return true;}catch(_){return false;}
  }).catch(()=>false);
  const restoreDropdownLayout=()=>dropdownLayoutState===null?Promise.resolve(false):setDropdownLayout({open:false,contentHeight:0,viewportHeight:100});
  const pruneHeaderSourceDuplicates=async()=>{
    if(layoutMode==='restoring'||serializerRestoring||!panel||typeof vscode.window.tabGroups?.close!=='function')return false;
    const headerGroup=(vscode.window.tabGroups.all||[]).find(group=>group?.viewColumn===panel.viewColumn),otherGroups=(vscode.window.tabGroups.all||[]).filter(group=>group?.viewColumn!==panel.viewColumn),connected=new Set(connectedFiles.map(file=>file.filename.toLowerCase()));
    if(!headerGroup||!otherGroups.length)return false;
    const visibleElsewhere=new Set(otherGroups.flatMap(group=>(group.tabs||[]).map(tab=>tabInputPath(tab)).filter(Boolean).map(filename=>path.resolve(filename).toLowerCase()))),duplicates=(headerGroup.tabs||[]).filter(tab=>{const filename=tabInputPath(tab);return filename&&connected.has(path.resolve(filename).toLowerCase())&&visibleElsewhere.has(path.resolve(filename).toLowerCase());});
    if(!duplicates.length)return false;
    try{await vscode.window.tabGroups.close(duplicates);return true;}catch(_){return false;}
  };
  const reserveTextGroups=()=>{
    if(!panel){releaseViewerColumns(TEXT_GROUP_RESERVATION);return 0;}
    const connected=new Set(connectedFiles.map(file=>file.filename.toLowerCase())),groups=vscode.window.tabGroups?.all||[],headerGroup=groups.find(group=>group?.viewColumn===panel.viewColumn),nativeGroups=groups.filter(group=>(group?.tabs||[]).some(tab=>{const filename=tabInputPath(tab);return filename&&connected.has(path.resolve(filename).toLowerCase());})),nativeGroup=groups.find(group=>group?.viewColumn===nativeColumn),columns=[headerGroup||panel.viewColumn,nativeGroup||nativeColumn,...nativeGroups];
    return reserveViewerColumns(TEXT_GROUP_RESERVATION,columns);
  };
  const repairHeaderSourceTabs=async()=>{
    if(groupRepairing||!panel)return false;
    const headerGroup=(vscode.window.tabGroups?.all||[]).find(group=>group?.viewColumn===panel.viewColumn),connected=new Set(connectedFiles.map(file=>file.filename.toLowerCase())),misplaced=(headerGroup?.tabs||[]).map(tab=>tabInputPath(tab)).filter(filename=>filename&&connected.has(path.resolve(filename).toLowerCase()));
    if(!misplaced.length)return false;
    groupRepairing=true;
    try{
      const target=nativeColumnFor(nativeColumn,panel.viewColumn);nativeColumn=target;
      for(const filename of misplaced){
        const exact=path.resolve(filename).toLowerCase(),document=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&path.resolve(item.fileName||'.').toLowerCase()===exact)||await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
        await vscode.window.showTextDocument(document,{viewColumn:target,preview:false,preserveFocus:true});
      }
      await pruneHeaderSourceDuplicates();
      reserveTextGroups();
      return true;
    }catch(_){return false;}finally{groupRepairing=false;}
  };
  const protectHeaderGroup=async()=>{
    if(layoutMode!=='text-attached'||!panel)return false;
    reserveTextGroups();
    await repairHeaderSourceTabs();
    if(!config().get(HEADER_ONLY_SETTING,false))return false;
    await pruneHeaderSourceDuplicates();
    const headerGroup=(vscode.window.tabGroups?.all||[]).find(group=>group?.viewColumn===panel.viewColumn),navigationTab=(headerGroup?.tabs||[]).find(tab=>tab?.input?.viewType==='ikemenTextCompanion'||/^IKEMaker Code Navigation(?:\s|·|$)/i.test(String(tab?.label||'')));
    if(!headerGroup||!navigationTab||headerGroup.activeTab===navigationTab)return false;
    panel.reveal?.(headerGroup.viewColumn,true);
    return true;
  };
  const selectionFor=state=>({surfaceId:'companion.text-toolbar',uri:uriKey(state.document),filename:state.document?.fileName||'',kind:state.classification.kind||'',role:state.classification.role||''});
  const claimSelection=()=>{if(bound.classification.supported&&bound.contextModel)bound.contextModel.setSelection(selectionFor(bound));};
  const stateForEditor=editor=>{const document=editor?.document||null,classification=classify(document,config());return{document,classification,seed:document?.uri||null};};
  const bind=editor=>{
    const next=stateForEditor(editor),descriptor=workspaceNavigation&&workspaceDescriptor?{...workspaceDescriptor,files:connectedFiles.map(file=>file.filename)}:contextDescriptor(next.document,next.classification,navigation);entityUnavailableReason='';bound={...next,descriptor,contextEntry:null,contextModel:null};
    if(panel){bound.contextEntry=contextRegistry.registerAuthoringPanel(panel,descriptor,{visualViewer:false});bound.contextModel=contextRegistry.getContextModel(bound.contextEntry);render();}
  };
  const updateContext = editor => {
    if(entityRetargetLock)return contextQueue;
    const expectedEntityGeneration=entityRetargetGeneration;
    activeEditor=editor;active=stateForEditor(editor);
    contextQueue=contextQueue.then(async()=>{if(expectedEntityGeneration!==entityRetargetGeneration||entityRetargetLock)return;const next=active.classification;await Promise.all([
      vscode.commands.executeCommand('setContext', 'ikemen.activeTextSupported', next.supported),vscode.commands.executeCommand('setContext', 'ikemen.activeTextKind', next.kind || ''),vscode.commands.executeCommand('setContext', 'ikemen.activeTextRole', next.role || ''),vscode.commands.executeCommand('setContext', 'ikemen.activeTextWritable', next.writable),vscode.commands.executeCommand('setContext', 'ikemen.activeTextPrimary', primaryCommand(next))
    ]);if(expectedEntityGeneration!==entityRetargetGeneration||entityRetargetLock)return;const activeFilename=editor?.document?.fileName,connectedAt=activeFilename?connectedFiles.findIndex(item=>item.filename.toLowerCase()===path.resolve(activeFilename).toLowerCase()):-1;if(connectedAt>=0){connectedIndex=connectedAt;if(!workspaceNavigation&&Number.isInteger(editor?.viewColumn))nativeColumn=editor.viewColumn;else if(workspaceNavigation&&(!Number.isInteger(nativeColumn)||nativeColumn===panel?.viewColumn))nativeColumn=nativeColumnFor(editor?.viewColumn);}if(panel&&config().get('textToolbar.companion.followActiveEditor',true)&&(!workspaceNavigation||connectedAt>=0))bind(activeEditor);else if(panel&&connectedAt>=0)render();});
    return contextQueue;
  };
  const navigationFiles=()=>{const pinned=new Set(currentFileOrganization.pinned||[]),hidden=new Set(currentFileOrganization.hidden||[]);return connectedFiles.map(item=>{const document=(vscode.workspace.textDocuments||[]).find(candidate=>candidate&&!candidate.isClosed&&candidate.fileName&&path.resolve(candidate.fileName).toLowerCase()===item.filename.toLowerCase()),status=[],id=entityFileOrderKey(item.filename);if(!fs.existsSync(item.filename))status.push('Missing');if(document){if(document.isDirty)status.push('Unsaved');let diagnostics=[];try{diagnostics=vscode.languages?.getDiagnostics?.(document.uri)||[];}catch{}const errors=diagnostics.filter(value=>value?.severity===(vscode.DiagnosticSeverity?.Error??0)).length,warnings=diagnostics.filter(value=>value?.severity===(vscode.DiagnosticSeverity?.Warning??1)).length;if(errors)status.push(`${errors} Error${errors===1?'':'s'}`);if(warnings)status.push(`${warnings} Warning${warnings===1?'':'s'}`);}return{...item,id,pinned:pinned.has(id),hidden:hidden.has(id),kind:fileKind(item.filename,document?.languageId),languageId:document?.languageId||'',origin:fileOrigin(item.filename,workspaceDescriptor||bound.descriptor||{}),status};});};
  let renderedCompanionHtml = '';
  const render = () => {
    if (!panel) return;
    if(dropdownLayoutState!==null)void restoreDropdownLayout();
    const favoriteIds = extensionContext.globalState.get(favoritesKey, []);
    const files=navigationFiles();statusSignature=JSON.stringify(files.map(file=>file.status));
    panel.title = bound.classification.supported ? `IKEMaker Code Navigation · ${path.basename(bound.document?.fileName || '')}` : 'IKEMaker Code Navigation';
    const restore=serializedCompanionState({files:connectedFiles.map(file=>file.filename),selectedFile:connectedFiles[connectedIndex]?.filename,mode:'tabs',nativeColumn,context:bound.descriptor||{}});
    const airBrowserControls=airBrowserControlState(bound.document?.fileName,bound.classification.kind),ack=airReturnRenderRequest&&airReturnRenderRequest.panel===panel&&airReturnRenderRequest.filename===path.resolve(bound.document?.fileName||'.').toLowerCase()&&airBrowserControls.returnAvailable?airReturnRenderRequest.token:'';
    const headerOnlyEnabled=config().get(HEADER_ONLY_SETTING,false);
    const html = companionHtml(bound.classification, actionsFor(bound.classification), favoriteIds, textToolbarModel(bound), {files,index:connectedIndex,mode:'tabs',restore,headerOnlyEnabled,groupedFilesEnabled:!headerOnlyEnabled&&config().get(GROUPED_FILES_SETTING,false),airBrowserControls,airReturnRenderToken:ack,unavailableReason:entityUnavailableReason,generation:entityRetargetGeneration});
    // Replacing an unchanged webview reloads its document and can reclaim DOM
    // focus after a native source handoff has already completed.
    if(html===renderedCompanionHtml)return;
    renderedCompanionHtml=html;
    panel.webview.html=require('./webview_policy').protect(html,panel.webview.cspSource);
  };
  const scheduleStatusRender=()=>{if(!panel||statusTimer)return;statusTimer=setTimeout(()=>{statusTimer=null;const next=JSON.stringify(navigationFiles().map(file=>file.status));if(next!==statusSignature)render();},120);};
  const showActionsFor=async state=>{
    if(!state?.classification?.supported)return vscode.window.showInformationMessage('Open a supported IKEMaker text file first.');
    const favorites=new Set(extensionContext.globalState.get(favoritesKey,[])),picked=await vscode.window.showQuickPick(actionsFor(state.classification).map(action=>({label:`${favorites.has(actionId(action))?'$(star-full)':'$(blank)'} ${action.label}`,description:action.group,detail:action.command||`Connected ${action.viewer.toUpperCase()} viewer`,action})),{title:`${state.classification.label} — IKEMaker Actions`,placeHolder:'Search every action available for this editor'});
    if(picked)return runAction(picked.action,state.seed,vscode,navigation,state.descriptor?.ownerDef);
  };
  const showConnectedFor=async state=>{
    if(!state?.classification?.supported||state.descriptor?.type!=='character')return vscode.window.showInformationMessage('Open a supported, unambiguously owned character text file first.');
    const choices=actionsFor(state.classification).filter(action=>action.viewer).map(action=>({label:action.label,description:`Resolve from ${path.basename(state.document.fileName)}`,action})),picked=await vscode.window.showQuickPick(choices,{title:`${state.classification.label} — Open Connected Viewer`,placeHolder:'Choose the existing character viewer to open'});if(picked)return runAction(picked.action,state.seed,vscode,navigation,state.descriptor?.ownerDef);
  };
  const configureConnected = options => {
    const files=Array.isArray(options?.files)?options.files.filter(file=>typeof file==='string'&&path.isAbsolute(file)).slice(0,512):[];
    workspaceNavigation=Array.isArray(options?.files);
    connectedFiles=[...new Map(files.map(filename=>[path.resolve(filename).toLowerCase(),{filename:path.resolve(filename),label:path.basename(filename)}])).values()];
    const suppliedContext=options?.context&&typeof options.context==='object'?options.context:{},contextRoot=typeof suppliedContext.root==='string'&&path.isAbsolute(suppliedContext.root)?path.resolve(suppliedContext.root):(connectedFiles[0]?path.dirname(connectedFiles[0].filename):'');
    workspaceDescriptor=workspaceNavigation?{type:String(suppliedContext.type||suppliedContext.kind||'project'),identity:String(suppliedContext.identity||suppliedContext.id||''),key:suppliedContext.key||contextRoot||(connectedFiles[0]?.filename||''),label:String(suppliedContext.label||path.basename(contextRoot||connectedFiles[0]?.filename||'Coding workspace')),root:contextRoot,ownerDef:suppliedContext.ownerDef||connectedFiles.find(file=>path.extname(file.filename).toLowerCase()==='.def')?.filename||'',files:connectedFiles.map(file=>file.filename)}:null;
    require('./air_source_return').retainAirReturnOwner(workspaceDescriptor?.ownerDef||'');
    const entityIdentity=connectedOwnerIdentity(workspaceDescriptor),organized=entityFileOrder.reconcile(connectedFiles,entityFileOrders.get(entityIdentity)||{});connectedFiles=organized.items.map(item=>({filename:item.filename,label:path.basename(item.filename),hidden:item.hidden}));currentFileOrganization=organized.state;
    const activeName=activeEditor?.document?.fileName||'';connectedIndex=Math.max(0,connectedFiles.findIndex(item=>item.filename.toLowerCase()===path.resolve(activeName||'.').toLowerCase()));
    if(Number.isInteger(options?.viewColumn))nativeColumn=nativeColumnFor(options.viewColumn);
  };
  const selectConnected = async (index,options={}) => {
    if(!connectedFiles.length)return false;
    const expectedEntityGeneration=entityRetargetGeneration;
    connectedIndex=(index+connectedFiles.length)%connectedFiles.length;
    const document=await vscode.workspace.openTextDocument(vscode.Uri.file(connectedFiles[connectedIndex].filename));
    if(expectedEntityGeneration!==entityRetargetGeneration||entityRetargetLock)return false;
    nativeColumn=Number.isInteger(options.exactColumn)?options.exactColumn:options.forceWorkColumn===true?2:nativeColumnFor(nativeColumn);const editor=await vscode.window.showTextDocument(document,{viewColumn:nativeColumn,preview:false,preserveFocus:false});if(expectedEntityGeneration!==entityRetargetGeneration||entityRetargetLock||!editor||editor.document!==document||editor.viewColumn!==nativeColumn)return false;activeEditor=editor;active=stateForEditor(activeEditor);if(options.forceBind===true||config().get('textToolbar.companion.followActiveEditor',true))bind(activeEditor);else render();return true;
  };
  const organizeConnected=async message=>{
    if(message.generation!==entityRetargetGeneration||entityRetargetLock||!connectedFiles.length)return false;
    const selectedIdentity=connectedFiles[connectedIndex]?entityFileOrderKey(connectedFiles[connectedIndex].filename):'',files=connectedFiles.map(file=>file.filename);
    try{currentFileOrganization=message.type==='pin-connected'?entityFileOrder.setPinned(files,currentFileOrganization,message.identity,message.pinned):message.type==='hide-connected'?entityFileOrder.setHidden(files,currentFileOrganization,message.identity,message.hidden):message.type==='unhide-all-connected'?entityFileOrder.unhideAll(files,currentFileOrganization):entityFileOrder.reorder(files,currentFileOrganization,message.identity,message.beforeIdentity);}
    catch(_){return false;}
    const organized=entityFileOrder.reconcile(files,currentFileOrganization);connectedFiles=organized.items.map(item=>({filename:item.filename,label:path.basename(item.filename),hidden:item.hidden}));currentFileOrganization=organized.state;connectedIndex=Math.max(0,connectedFiles.findIndex(file=>entityFileOrderKey(file.filename)===selectedIdentity));
    await persistEntityFileOrder(connectedOwnerIdentity(workspaceDescriptor||bound.descriptor),currentFileOrganization);render();return true;
  };
  const connectedTabAction=async message=>{
    if(message.generation!==entityRetargetGeneration||entityRetargetLock||!connectedFiles.length)return false;
    const index=connectedFiles.findIndex(file=>entityFileOrderKey(file.filename)===message.identity);if(index<0)return false;
    const filename=connectedFiles[index].filename,uri=vscode.Uri.file(filename),copy=async value=>{if(!vscode.env?.clipboard?.writeText)return false;await vscode.env.clipboard.writeText(String(value||''));return true;};
    if(message.action==='copy-path')return copy(filename);
    const relativePath=()=>{try{if(typeof vscode.workspace.asRelativePath==='function')return vscode.workspace.asRelativePath(uri,false);}catch(_){}const root=workspaceDescriptor?.root||bound.descriptor?.root||'';return root?path.relative(root,filename):path.basename(filename);};
    if(message.action==='copy-relative-path')return copy(relativePath());
    if(message.action==='copy-breadcrumbs-path'){const parts=String(relativePath()).split(/[\\/]+/).filter(Boolean),owner=String(workspaceDescriptor?.label||bound.descriptor?.label||'').trim();return copy([owner,...parts].filter((part,at,all)=>at>0||part!==all[1]).join(' › '));}
    const opened=await selectConnected(index);if(!opened)return false;
    const commands={
      'split-right':'workbench.action.splitEditorRight',
      'split-move-right':'workbench.action.moveEditorToNextGroup',
      'split-move-left':'workbench.action.moveEditorToPreviousGroup',
      'move-new-window':'workbench.action.moveEditorToNewWindow',
      'copy-new-window':'workbench.action.copyEditorToNewWindow'
    };
    if(commands[message.action])return vscode.commands.executeCommand(commands[message.action]);
    const groups=vscode.window.tabGroups?.all||[],exact=path.resolve(filename).toLowerCase(),entries=[];for(const group of groups)for(const tab of group?.tabs||[]){const candidate=tabInputPath(tab);if(candidate&&path.resolve(candidate).toLowerCase()===exact)entries.push({group,tab});}
    const target=entries.find(entry=>entry.group?.viewColumn===nativeColumn)||entries.find(entry=>entry.group===vscode.window.tabGroups?.activeTabGroup)||entries[0];if(!target)return false;
    const groupTabs=Array.from(target.group?.tabs||[]),at=groupTabs.indexOf(target.tab);let closing=[];
    if(message.action==='close')closing=[target.tab];
    else if(message.action==='close-others')closing=groupTabs.filter(tab=>tab!==target.tab);
    else if(message.action==='close-right')closing=at<0?[]:groupTabs.slice(at+1);
    else if(message.action==='close-saved')closing=groupTabs.filter(tab=>tab?.isDirty!==true);
    else if(message.action==='close-all')closing=groupTabs;
    if(!closing.length)return true;if(typeof vscode.window.tabGroups?.close!=='function')return false;
    return vscode.window.tabGroups.close(closing,message.action!=='close');
  };
  const attachCompanion = (restoredPanel, options = {}) => {
    if(panel){if(restoredPanel&&restoredPanel!==panel)restoredPanel.dispose();panel.reveal?.();return panel;}
    if (!active.classification.supported) { restoredPanel?.dispose?.(); return vscode.window.showInformationMessage('Open a supported IKEMaker text file first.'); }
    configureConnected(options);nativeColumn=nativeColumn||activeEditor?.viewColumn;
    // Code Navigation is the fixed text header, not a visual-viewer destination.
    // Keeping it out of the shared viewer-group tracker prevents asset viewers
    // and auxiliary browsers from ever being routed into the header group.
    const requestedHeaderColumn=options?.headerColumn===vscode.ViewColumn?.Beside?vscode.ViewColumn.Beside:Number.isInteger(options?.headerColumn)&&options.headerColumn>0?options.headerColumn:0;
    if(!restoredPanel&&layoutMode==='explicitly-closed')layoutMode='text-attached';
    panel = restoredPanel||vscode.window.createWebviewPanel('ikemenTextCompanion', 'IKEMaker Code Navigation', requestedHeaderColumn||preferredViewerColumn(vscode.ViewColumn.Beside, vscode.window.activeTextEditor?.viewColumn), { enableScripts: true, retainContextWhenHidden: true });headerFitApplied=false;
    if(airReturnRenderRequest)airReturnRenderRequest.panel=panel;
    if(options.scopedLayout===true){panel.reveal?.(requestedHeaderColumn,true);nativeColumn=options.viewColumn;}
    else if(config().get(HEADER_ONLY_SETTING,false)||requestedHeaderColumn===1){panel.reveal?.(1,true);nativeColumn=2;}else nativeColumn=nativeColumnFor(nativeColumn,panel.viewColumn);
    const retainedPanelPermissions=options.scopedLayout===true?require('./viewer_group').trackedPanels().filter(item=>item.viewColumn===requestedHeaderColumn).map(item=>require('./viewer_group').permitOwnedViewerColumn(item,panel,requestedHeaderColumn)):[];
    panel.onDidDispose(()=>{for(const permission of retainedPanelPermissions)permission.dispose();});
    reserveTextGroups();
    Promise.resolve().then(pruneHeaderSourceDuplicates);
    supportViewerClose(panel,{readOnly:true});
    let activation;panel.onDidDispose(() => { activation?.dispose();if(dropdownLayoutState!==null)void restoreDropdownLayout();releaseViewerColumns(TEXT_GROUP_RESERVATION);if(airReturnRenderRequest?.panel===panel)settleAirReturnRender(false);if(statusTimer){clearTimeout(statusTimer);statusTimer=null;}if(startupRepairTimer){clearTimeout(startupRepairTimer);startupRepairTimer=null;}panel=null;renderedCompanionHtml='';if(!['visual-suspended','restoring'].includes(layoutMode))layoutMode='explicitly-closed'; });
    bind(activeEditor);
    require('./entity_switch_runtime').attachEntitySurface(panel,{
      surfaceId:'companion.text-toolbar',
      createAdapter:()=>createRetargetAdapter()
    });
    if(panel.active===true)claimSelection();
    const exactSources=new ExactSourceRegistry();
    exactSources.register({id:'text-companion.exact-source',capabilityId:'implemented.text-companion-source',surfaceId:'companion.text-toolbar',resolve:request=>{
      const document=bound.document,context=bound.contextModel?.snapshot(),currentFingerprint=document?.getText?fingerprint(document.getText()):'',currentVersion=document?String(document.version??currentFingerprint):'';
      if(!bound.classification.supported||document?.isClosed||document?.uri?.scheme!=='file')return unavailable('The bound native document is no longer an open supported file.',request);
      if(request.uri!==uriKey(document)||request.version!==currentVersion||request.fingerprint!==currentFingerprint)return unavailable('The bound native document changed before it could be focused.',request);
      const selection=context?.selection;if(!context||request.contextId!==context.identity||request.selectionRevision!==context.selectionRevision||selection?.surfaceId!=='companion.text-toolbar'||selection.uri!==request.uri)return unavailable('The companion context selection changed before its source could be focused.',request);
      return{available:true,filename:document.fileName,identity:'exact-document',fingerprint:currentFingerprint,version:currentVersion,label:path.basename(document.fileName),access:'external-editor',mutationOwner:'native-text-editor',contextId:context.identity,selectionRevision:context.selectionRevision};
    }});
    const openExactSource=async()=>{const document=bound.document,context=bound.contextModel?.snapshot(),sourceFingerprint=document?.getText?fingerprint(document.getText()):'',sourceVersion=document?String(document.version??sourceFingerprint):'',request={uri:uriKey(document),version:sourceVersion,fingerprint:sourceFingerprint,contextId:context?.identity||'',selectionRevision:context?.selectionRevision??-1};nativeColumn=nativeColumnFor(nativeColumn);const result=await exactSources.open('text-companion.exact-source',request,()=>vscode.window.showTextDocument(document,{preview:false,viewColumn:nativeColumn}));if(!result.available)vscode.window.showInformationMessage(result.reason);return result;};
    const execute=(command,withSeed=true)=>vscode.commands.executeCommand(command,...(withSeed&&bound.seed?[bound.seed]:[]));
    const openTextConnected=async target=>{if(target==='air'){const returned=await require('./air_source_return').openAirSourceReturn(bound.document?.fileName||bound.seed,bound.descriptor?.ownerDef||'',{getDocuments:()=>vscode.workspace.textDocuments,inform:message=>vscode.window.showInformationMessage(message),open:(filename,options)=>require('./air_viewer').openAirPreview(vscode.Uri.file(filename),options)});if(returned.handled)return returned.opened;}return navigation.openConnected(bound.seed,target,undefined,undefined,undefined,bound.descriptor?.ownerDef?{def:path.resolve(bound.descriptor.ownerDef)}:undefined,{origin:'text'});};
    const handlers={
      close:async()=>{if(config().get(HEADER_ONLY_SETTING,false)){panel?.reveal?.(panel.viewColumn,true);return vscode.window.showInformationMessage('Code Navigation protects access to the text editor while native tabs are hidden. Turn off Header-Only Text Layout before closing it.');}return panel?.dispose();},new:async()=>execute(TOOLBAR_COMMANDS.new,false),open:async()=>execute(TOOLBAR_COMMANDS.open,false),project:async()=>execute(TOOLBAR_COMMANDS.project,false),help:async()=>execute(TOOLBAR_COMMANDS.help,false),settings:async()=>execute(TOOLBAR_COMMANDS.settings,false),'suite-switch':async()=>execute(TOOLBAR_COMMANDS['suite-switch'],false),
      save:async()=>bound.document?.save(),'save-as':async()=>require('./text_save_as').run({vscode,focused:bound.document,documents:vscode.workspace.textDocuments}),'auto-save':async()=>{await require('./save_controls').toggleText(bound.document?.fileName||'');render();},'text-source':openExactSource,'connected-resources':async()=>openTextConnected('source'),backup:async()=>execute('ikemen.makeBackup'),recovery:async()=>execute('ikemen.mutations.openHistory'),run:async()=>execute('ikemen.launchGame'),versus:async()=>execute('ikemen.launchMirrorCurrent'),training:async()=>execute('ikemen.launchTrainingCurrent'),
      stage:async()=>execute('ikemen.stage.openWorkspace',bound.classification.role==='stage'&&bound.classification.kind==='def'),sprites:async()=>openTextConnected('sff'),animations:async()=>openTextConnected('air'),sounds:async()=>openTextConnected('snd'),palettes:async()=>execute('ikemen.palette.openWorkspace'),commands:async()=>execute('ikemen.commandMovelist.openEditor'),states:async()=>execute('zss.openControllers'),'code-structure':async()=>execute('ikemen.codeStructure.openWorkspace'),'viewer-browser':async()=>{const route=require('./viewer_browser_route').forText(bound.classification);return execute(route.command,route.seed)},'actions-search':async()=>showActionsFor(bound)
    };
    const dispatcher=createUniversalToolbarDispatcher({handlersBySurface:{'companion.text-toolbar':handlers},getToolbar:async()=>textToolbarModel(bound)});
    activation=panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active)claimSelection();});
    panel.webview.onDidReceiveMessage(async message => {
      if(message?.type==='ikemenBrowserShortcut')return require('./viewer_browser_shortcut').handle(message,bound.document?.fileName||'', 'text',panel,{api:vscode,classification:bound.classification});
      if(message?.type===MESSAGE_TYPE){try{await dispatcher.dispatch('companion.text-toolbar',message);}catch{}return;}
      if(await viewerToolbar.handleCommand(message,bound.document?.fileName||'',panel))return;
      if(await viewerToolbar.handle(message,panel))return;
      if(!validBodyMessage(message))return;
      if(message.type==='fit-header-height')return fitHeaderLayout(message);
      if(message.type==='dropdown-layout')return setDropdownLayout(message);
      if(message.type==='air-return-rendered'){
        const request=airReturnRenderRequest,current=bound.document?.fileName?path.resolve(bound.document.fileName).toLowerCase():'',route=(()=>{try{return require('./air_docking_workspace').sourceHandoffDetails(bound.document?.fileName||'');}catch(_){return null;}})();
        const exact=Boolean(request&&request.panel===panel&&message.token===request.token&&current===request.filename&&route?.available!==false&&String(route?.origin||'').toLowerCase()===request.origin);
        if(exact)settleAirReturnRender(true);
        return;
      }
      if(message.type==='toggle-grouped-files')return toggleGroupedFiles();
      if(message.type==='toggle-header-only')return toggleHeaderOnlyLayout();
      if(message.type==='focus-air-browser')return vscode.commands.executeCommand('air.focusActionsBrowser',bound.document?.uri||vscode.Uri.file(bound.document.fileName));
      if(message.type==='reopen-air-browser')return vscode.commands.executeCommand('air.reopenActionsBrowser',bound.document?.uri||vscode.Uri.file(bound.document.fileName));
      if(message.type==='close-air-source')return vscode.commands.executeCommand('air.closeSourceAndReturn',bound.document?.uri||vscode.Uri.file(bound.document.fileName));
      if(message.type==='reorder-connected'||message.type==='pin-connected'||message.type==='hide-connected'||message.type==='unhide-all-connected')return organizeConnected(message);
      if(message.type==='connected-tab-action')return connectedTabAction(message);
      if(message.type==='select-connected'){if(Object.prototype.hasOwnProperty.call(message,'generation')?message.generation!==entityRetargetGeneration:entityRetargetGeneration>0)return;return selectConnected(message.index);}
      const available=actionsFor(bound.classification),action=available.find(candidate=>actionId(candidate)===message.id);if(!action)return;
      if (message.type === 'favorite') {
        const saved = new Set(extensionContext.globalState.get(favoritesKey, []));
        message.value ? saved.add(message.id) : saved.delete(message.id);
        await extensionContext.globalState.update(favoritesKey, [...saved]);
        return render();
      }
      if (message.type === 'run') {
        return runAction(action,bound.seed,vscode,navigation,bound.descriptor?.ownerDef);
      }
    });
    return panel;
  };
  const toggle = (options = {}) => {
    if (panel) { if(config().get(HEADER_ONLY_SETTING,false)){panel.reveal?.(panel.viewColumn,true);vscode.window.showInformationMessage('Code Navigation stays attached while native tabs are hidden. Turn off Header-Only Text Layout before closing it.');return panel;}panel.dispose();return; }
    return attachCompanion(null,options);
  };
  // Explicit Code Navigation attaches above its native source. Splitting this
  // region vertically preserves the source width and unrelated editor groups.
  const openAttachedCompanion=async(options={},toggleExisting=false)=>{
    if(panel)return toggleExisting?toggle(options):openCompanion(options);
    if(options.files||options.context||options.headerColumn||options.viewColumn)return attachCompanion(null,options);
    const editor=vscode.window.activeTextEditor,document=editor?.document,classification=classify(document,config());
    const group=(vscode.window.tabGroups?.all||[]).find(item=>item.viewColumn===editor?.viewColumn);
    if(!document||document.uri?.scheme!=='file'||!classification.supported||!group)return attachCompanion(null,options);
    const descriptor=contextDescriptor(document,classification,navigation),same=connectedFiles.some(file=>file.filename.toLowerCase()===path.resolve(document.fileName).toLowerCase());
    const files=Array.isArray(options.files)?options.files:same?connectedFiles.map(file=>file.filename):descriptor.files;
    const result=await resumeCompanion({...options,files,selectedFile:document.fileName,context:options.context||descriptor,originEditorGroup:group});
    if(result?.attached===true&&result.panel===panel){const native=(vscode.window.visibleTextEditors||[]).find(item=>item.document===document);if(native)await require('./native_source_focus').showNativeSource(vscode,document,{viewColumn:native.viewColumn,preview:false,selection:editor.selection});}
    return result?.panel||result;
  };
  const suspendForVisualViewer=async()=>{
    if(!panel)return false;
    // This companion is only the missing header for native text editors.
    // Visual viewers render the universal controls themselves.
    layoutMode='visual-suspended';layoutGeneration+=1;if(startupRepairTimer){clearTimeout(startupRepairTimer);startupRepairTimer=null;}panel.dispose();
    try{await vscode.commands.executeCommand('workbench.action.joinAllGroups');}catch(_){ }
    const activeColumn=vscode.window.tabGroups?.activeTabGroup?.viewColumn;
    if(Number.isInteger(activeColumn)&&activeColumn>0)nativeColumn=activeColumn;
    return true;
  };
  const openCompanion = options => { if(panel){configureConnected(options);bind(activeEditor);panel.reveal?.();return panel;}return toggle(options); };
  const resumeCompanion=async options=>{
    const transitionFiles=Array.isArray(options?.files)?options.files:[];
    const originGroup=options?.originEditorGroup||(options?.transitionPanel?(vscode.window.tabGroups?.all||[]).find(group=>group.viewColumn===options.transitionPanel.viewColumn):null);
    if(options?.transitionPanel){
      try{await require('./text_origin_layout').retainOriginWithSource(vscode,originGroup,transitionFiles,options.selectedFile);}
      catch(error){void vscode.window.showInformationMessage(error.message);return Object.freeze({attached:false,aborted:true,originClosed:false});}
      const transition=await require('./viewer_group').closeViewerGroupForText(options.transitionPanel,vscode,{admittedFiles:transitionFiles,preserveUnrelatedTabs:true});
      if(transition?.accepted!==true||transition?.closed!==true||transition?.settled!==true)return Object.freeze({attached:false,aborted:true,originClosed:transition?.closed===true});
    }
    layoutMode='restoring';layoutGeneration+=1;
    const prior=connectedFiles[connectedIndex]?.filename||'';
    if(Array.isArray(options?.files)){
      const preserve=options.preserveConnected===true&&sameConnectedOwner(workspaceDescriptor,options.context),files=mergeConnectedFilePaths(connectedFiles.map(file=>file.filename),options.files,options.selectedFile,preserve);
      configureConnected({...options,files});
      const requested=typeof options.selectedFile==='string'&&path.isAbsolute(options.selectedFile)?path.resolve(options.selectedFile):'',selected=requested?connectedFiles.findIndex(file=>file.filename.toLowerCase()===requested.toLowerCase()):-1,restored=connectedFiles.findIndex(file=>file.filename.toLowerCase()===path.resolve(prior||'.').toLowerCase());
      if(selected>=0)connectedIndex=selected;else if(restored>=0)connectedIndex=restored;
    }
    if(!connectedFiles.length){layoutMode='text-attached';return false;}
    layoutMode='restoring';const generation=layoutGeneration;
    let headerColumn=1,scopedLayout=null;
    if(originGroup&&(vscode.window.tabGroups?.all||[]).includes(originGroup)&&(originGroup.tabs?.length||(vscode.window.tabGroups.all||[]).length>1)){
      try{scopedLayout=await require('./text_origin_layout').prepareOriginTextLayout(vscode,originGroup,connectedFiles[connectedIndex]?.filename,()=>generation===layoutGeneration&&layoutMode==='restoring');nativeColumn=scopedLayout.nativeColumn;headerColumn=scopedLayout.headerColumn;}
      catch(error){layoutMode='text-attached';void vscode.window.showInformationMessage(error.message);return false;}
    }else if(options?.transitionPanel){
      const consolidated=await require('./text_transition_layout').consolidate(vscode,connectedFiles.map(file=>file.filename),()=>generation===layoutGeneration&&layoutMode==='restoring',{selectedFile:connectedFiles[connectedIndex]?.filename});
      if(!consolidated.ok){
        // A stale or unusual VS Code tab arrangement must not strand the user
        // outside the text editor.  The exact visual origin is already closed;
        // rebuild the normal text workspace and open the requested source.
        if(!await canonicalLayout()||generation!==layoutGeneration){layoutMode='text-attached';return false;}
        nativeColumn=2;headerColumn=1;
      }else{nativeColumn=consolidated.nativeColumn;headerColumn=consolidated.headerColumn;}
    }else{
      if(!await canonicalLayout()||generation!==layoutGeneration){layoutMode='text-attached';return false;}
      nativeColumn=2;
    }
    if(!await selectConnected(connectedIndex,{forceWorkColumn:!options?.transitionPanel,forceBind:Boolean(options?.selectedFile),exactColumn:scopedLayout?.nativeColumn})||generation!==layoutGeneration){layoutMode='text-attached';return false;}
    const selectedForReturn=bound.document?.fileName?path.resolve(bound.document.fileName):'',renderRequest=selectedForReturn?beginAirReturnRender(selectedForReturn):null;
    const restored=attachCompanion(null,{files:connectedFiles.map(file=>file.filename),viewColumn:nativeColumn,headerColumn,scopedLayout:Boolean(scopedLayout),context:options?.context||workspaceDescriptor||{}});if(renderRequest&&restored){renderRequest.panel=restored;render();}if(restored){if(scopedLayout){try{await require('./text_origin_layout').finishOriginTextLayout(vscode,restored,scopedLayout,connectedFiles[connectedIndex]?.filename);nativeColumn=scopedLayout.nativeGroup.viewColumn;}catch(error){layoutMode='text-attached';if(renderRequest&&airReturnRenderRequest===renderRequest)settleAirReturnRender(false);void vscode.window.showInformationMessage(error.message);return Object.freeze({attached:false,aborted:true,originClosed:true});}}else{await require('./text_transition_layout').attachHeaderLayout(vscode,restored,connectedFiles[connectedIndex]?.filename);nativeColumn=2;}}layoutMode='text-attached';await protectHeaderGroup();
    if(!restored){if(renderRequest&&airReturnRenderRequest===renderRequest)settleAirReturnRender(false);return false;}
    const selectedFile=bound.document?.fileName?path.resolve(bound.document.fileName):'';
    const rendered=Boolean(renderRequest&&await renderRequest.promise),finalRoute=(()=>{try{return require('./air_docking_workspace').sourceHandoffDetails(selectedFile);}catch(_){return null;}})();
    const airReturnRendered=exactAirReturnRenderAdoption(renderRequest,rendered,selectedFile,restored,finalRoute);
    return Object.freeze({attached:true,selectedFile,airReturnRendered,panel:restored,nativeColumn});
  };
  const positionState=position=>Number.isInteger(position?.line)&&position.line>=0&&Number.isInteger(position?.character)&&position.character>=0?{line:position.line,character:position.character}:null;
  const captureNativeView=filename=>{
    const exact=typeof filename==='string'&&filename?path.resolve(filename).toLowerCase():'';
    const editor=(vscode.window.visibleTextEditors||[]).find(candidate=>path.resolve(candidate?.document?.fileName||'.').toLowerCase()===exact)||((vscode.window.activeTextEditor?.document?.fileName&&path.resolve(vscode.window.activeTextEditor.document.fileName).toLowerCase()===exact)?vscode.window.activeTextEditor:null);
    if(!editor)return null;
    const anchor=positionState(editor.selection?.anchor),activePosition=positionState(editor.selection?.active),visibleStart=positionState(editor.visibleRanges?.[0]?.start);
    return anchor&&activePosition?{anchor,active:activePosition,visibleStart}:null;
  };
  const restoreNativeView=(editor,state)=>{
    if(!editor||!state?.anchor||!state?.active)return;
    try{editor.selection=typeof vscode.Selection==='function'?new vscode.Selection(state.anchor.line,state.anchor.character,state.active.line,state.active.character):{anchor:state.anchor,active:state.active};}catch(_){ }
    if(state.visibleStart&&typeof editor.revealRange==='function')try{const range=typeof vscode.Range==='function'?new vscode.Range(state.visibleStart.line,state.visibleStart.character,state.visibleStart.line,state.visibleStart.character):{start:state.visibleStart,end:state.visibleStart};editor.revealRange(range,vscode.TextEditorRevealType?.AtTop);}catch(_){ }
  };
  const exactEntityIdentity=descriptor=>String(descriptor?.identity||descriptor?.id||'');
  const retainedNavigationState=()=>{
    const selectedFile=connectedFiles[connectedIndex]?.filename||bound.document?.fileName||'',identity=exactEntityIdentity(workspaceDescriptor||bound.descriptor),organization=entityFileOrder.reconcile(connectedFiles,currentFileOrganization).state;
    const state={version:1,identity,files:connectedFiles.map(file=>file.filename),selectedFile:selectedFile?path.resolve(selectedFile):'',nativeColumn:Number.isInteger(nativeColumn)?nativeColumn:1,headerColumn:Number.isInteger(panel?.viewColumn)?panel.viewColumn:1,layoutMode:String(layoutMode||'text-attached'),organization,nativeView:captureNativeView(selectedFile),unavailableReason:entityUnavailableReason||''};
    while(state.files.length&&Buffer.byteLength(JSON.stringify(state),'utf8')>128*1024)state.files.pop();
    state.organization=entityFileOrder.reconcile(state.files,organization).state;
    if(state.selectedFile&&!state.files.some(filename=>filename.toLowerCase()===state.selectedFile.toLowerCase()))state.selectedFile=state.files[0]||'';
    return Object.freeze(state);
  };
  const exactWorkspaceDescriptor=(descriptor,projection,files)=>{const kind=String(descriptor?.kind||descriptor?.type||projection?.kind||'workspace'),ownerFile=projection?.ownerFile||descriptor?.ownerFile||'',root=ownerFile?path.dirname(ownerFile):'';return{type:kind,key:ownerFile||exactEntityIdentity(descriptor)||kind,label:String(descriptor?.label||path.basename(ownerFile)||kind),root,ownerDef:kind==='character'?ownerFile:'',files:[ownerFile,...files].filter(Boolean),identity:exactEntityIdentity(descriptor)};};
  const persistEntityFileOrder=async(identity,state)=>{if(!identity)return;entityFileOrders.set(identity,state);try{await extensionContext.workspaceState.update(ENTITY_FILE_ORDER_KEY,entityFileOrder.encodeByEntity(entityFileOrders));}catch(_){ }};
  const showEntityUnavailable=(descriptor,reason)=>{
    entityUnavailableReason=String(reason||'This entity has no connected text files assigned by its exact owner.');connectedFiles=[];connectedIndex=0;currentFileOrganization={order:[],pinned:[],hidden:[]};workspaceNavigation=true;workspaceDescriptor=exactWorkspaceDescriptor(descriptor,null,[]);
    const classification={supported:false,kind:'',role:String(descriptor?.kind||descriptor?.type||''),writable:false,label:'No connected text source'};bound={document:null,classification,seed:null,descriptor:workspaceDescriptor,contextEntry:null,contextModel:null};
    if(panel){bound.contextEntry=contextRegistry.registerAuthoringPanel(panel,workspaceDescriptor,{visualViewer:false});bound.contextModel=contextRegistry.getContextModel(bound.contextEntry);render();}
  };
  const createRetargetAdapter=(services={})=>{
    const resolveTargets=services.resolveTargets||require('./entity_target_resolver').resolveEntityTargets,targetsStillCurrent=services.targetsStillCurrent||require('./entity_target_resolver').targetsStillCurrent,io=services.fs||fs;
    const liveDocument=filename=>(vscode.workspace.textDocuments||[]).find(document=>!document.isClosed&&path.resolve(document.fileName||'.').toLowerCase()===path.resolve(filename).toLowerCase());
    const resolverServices={...services,fs:io,readOwnerText:services.readOwnerText||((filename)=>{const document=liveDocument(filename);return document?{text:document.getText(),version:document.version}:null;})};
    const sourceSnapshot=filename=>{const document=liveDocument(filename),text=document?document.getText():io.readFileSync(filename,'utf8');return{filename:path.resolve(filename),hash:fingerprint(text),open:Boolean(document),version:document?String(document.version):null};};
    const sourceCurrent=snapshot=>{try{const current=sourceSnapshot(snapshot.filename);return current.hash===snapshot.hash&&(!snapshot.open||(current.open&&current.version===snapshot.version));}catch{return false;}};
    const selectRetained=(state,files)=>{const requested=typeof state?.selectedFile==='string'&&path.isAbsolute(state.selectedFile)?path.resolve(state.selectedFile):'',match=requested&&files.find(filename=>filename.toLowerCase()===requested.toLowerCase());return match||files[0]||'';};
    const applyTarget=async(target)=>{
      entityRetargetLock=true;const generation=++entityRetargetGeneration;
      try{
        if(!target){throw new Error('Missing text-navigation target.');}
        if(target.unavailable){showEntityUnavailable(target.descriptor,target.reason);return;}
        const document=await vscode.workspace.openTextDocument(vscode.Uri.file(target.selectedFile));
        if(generation!==entityRetargetGeneration||!sourceCurrent(target.source))throw new Error('The destination text source changed while it was opening.');
        require('./air_source_return').retainAirReturnOwner(target.workspaceDescriptor?.ownerDef||'');currentFileOrganization=target.organization;const hidden=new Set(currentFileOrganization.hidden||[]);connectedFiles=target.files.map(filename=>({filename,label:path.basename(filename),hidden:hidden.has(entityFileOrderKey(filename))}));connectedIndex=Math.max(0,connectedFiles.findIndex(file=>file.filename.toLowerCase()===target.selectedFile.toLowerCase()));workspaceNavigation=true;workspaceDescriptor=target.workspaceDescriptor;entityUnavailableReason='';
        const requestedColumn=Number.isInteger(target.nativeColumn)&&target.nativeColumn>0&&target.nativeColumn!==panel?.viewColumn?target.nativeColumn:nativeColumnFor(nativeColumn);nativeColumn=requestedColumn;
        const editor=await vscode.window.showTextDocument(document,{viewColumn:nativeColumn,preview:false,preserveFocus:false});
        if(generation!==entityRetargetGeneration||!editor||editor.document!==document)throw new Error('Code Navigation could not adopt the exact destination source in its native editor group.');
        activeEditor=editor;active=stateForEditor(editor);bind(editor);restoreNativeView(editor,target.nativeView);await persistEntityFileOrder(connectedOwnerIdentity(workspaceDescriptor),currentFileOrganization);
      }finally{entityRetargetLock=false;}
    };
    return{
      id:'code.navigation',surfaceId:'companion.text-toolbar',transferPinned:false,
      async supports(){return Boolean(panel&&!panel.disposed&&layoutMode==='text-attached');},
      async prepare(transaction){
        if(!panel||panel.disposed||layoutMode!=='text-attached')return{ok:false,reason:'Code Navigation is not attached to the native text editor.'};
        const retainedState=retainedNavigationState(),capture={descriptor:workspaceDescriptor||bound.descriptor,state:retainedState,document:bound.document,unavailable:Boolean(entityUnavailableReason)};
        let projection;try{projection=resolveTargets(transaction.to,resolverServices);}catch(error){return{ok:true,retainedState,capture,target:{unavailable:true,descriptor:transaction.to,reason:error.message},preparedGeneration:entityRetargetGeneration};}
        const candidateFiles=(projection.code||[]).map(item=>typeof item==='string'?{filename:item,available:true}:item).filter(item=>item?.available!==false&&typeof item?.filename==='string'&&SUPPORTED.has(path.extname(item.filename).slice(1).toLowerCase())).map(item=>path.resolve(item.filename));
        if(!candidateFiles.length)return{ok:true,retainedState,capture,target:{unavailable:true,descriptor:transaction.to,projection,reason:'This entity has no connected text files assigned by its exact owner.'},preparedGeneration:entityRetargetGeneration};
        const destinationState=transaction.toState?.adapterRetainedState?.['code.navigation'],identity=connectedOwnerIdentity(transaction.to),savedOrganization=destinationState?.organization||entityFileOrders.get(identity)||{},organized=entityFileOrder.reconcile(candidateFiles,savedOrganization),files=organized.items.map(item=>item.filename),selectedFile=selectRetained(destinationState,files);
        let source;try{source=sourceSnapshot(selectedFile);}catch(error){return{ok:true,retainedState,capture,target:{unavailable:true,descriptor:transaction.to,projection,reason:error.message},preparedGeneration:entityRetargetGeneration};}
        return{ok:true,retainedState,capture,preparedGeneration:entityRetargetGeneration,target:{descriptor:transaction.to,projection,files,selectedFile,source,organization:organized.state,nativeColumn:destinationState?.nativeColumn,nativeView:destinationState?.nativeView,workspaceDescriptor:exactWorkspaceDescriptor(transaction.to,projection,files)}};
      },
      async validate(_transaction,prepared){if(!panel||panel.disposed||prepared.preparedGeneration!==entityRetargetGeneration)return{ok:false,reason:'Code Navigation changed while the entity switch was being prepared.'};if(prepared.target?.projection&&!targetsStillCurrent(prepared.target.projection,resolverServices))return{ok:false,reason:'The destination entity owner changed while Code Navigation was switching.'};if(prepared.target?.source&&!sourceCurrent(prepared.target.source))return{ok:false,reason:'The destination text source changed while Code Navigation was switching.'};return true;},
      async commit(_transaction,prepared){prepared.committed=true;await applyTarget(prepared.target);},
      async rollback(transaction,prepared){
        if(!prepared?.committed||prepared.rolledBack)return;
        const captured=prepared.capture;
        if(captured.unavailable||!captured.state?.selectedFile)await applyTarget({unavailable:true,descriptor:transaction.from,reason:captured.state?.unavailableReason||'This entity has no connected text files assigned by its exact owner.'});
        else{
          const files=captured.state.files.filter(filename=>typeof filename==='string'&&path.isAbsolute(filename)),selectedFile=selectRetained(captured.state,files),source=sourceSnapshot(selectedFile),organization=entityFileOrder.reconcile(files,captured.state.organization).state;
          await applyTarget({descriptor:transaction.from,files,selectedFile,source,organization,nativeColumn:captured.state.nativeColumn,nativeView:captured.state.nativeView,workspaceDescriptor:captured.descriptor||exactWorkspaceDescriptor(transaction.from,null,files)});
        }
        prepared.rolledBack=true;prepared.committed=false;
      }
    };
  };
  repairProtectedHeader=async()=>{
    if(headerRepairing||serializerRestoring||['visual-suspended','explicitly-closed'].includes(layoutMode)||panel||!config().get(HEADER_ONLY_SETTING,false)||!connectedFiles.length||connectedFiles.some(file=>contextRegistry.isClosingFile(file.filename)))return false;
    headerRepairing=true;
    try{return Boolean(await resumeCompanion({files:connectedFiles.map(file=>file.filename),context:workspaceDescriptor||bound.descriptor||{}}));}finally{headerRepairing=false;}
  };
  const restoreCompanion=async(restoredPanel,state)=>{
    serializerRestoring=true;if(startupRepairTimer){clearTimeout(startupRepairTimer);startupRepairTimer=null;}
    const parsed=parseCompanionState(state?.restore);
    if(!parsed){serializerRestoring=false;restoredPanel.dispose();return vscode.window.showInformationMessage('Code Navigation could not safely restore. Reopen Character Essentials to rebuild its exact connected file set.');}
    if(panel){serializerRestoring=false;restoredPanel.dispose();panel.reveal?.();return panel;}
    try{
      layoutMode='restoring';layoutGeneration+=1;const generation=layoutGeneration;if(!await canonicalLayout()||generation!==layoutGeneration){restoredPanel.dispose();layoutMode='text-attached';serializerRestoring=false;return false;}restoredPanel.reveal?.(1,true);
      const document=await vscode.workspace.openTextDocument(vscode.Uri.file(parsed.selectedFile));
      connectedFiles=parsed.files.map(filename=>({filename,label:path.basename(filename)}));const restoredNativeColumn=2;
      const editor=await vscode.window.showTextDocument(document,{viewColumn:restoredNativeColumn,preview:false,preserveFocus:false});
      if(!editor||editor.document!==document||editor.viewColumn!==2||generation!==layoutGeneration)throw new Error('Canonical native editor restoration failed.');
      activeEditor=editor;active=stateForEditor(activeEditor);const restored=attachCompanion(restoredPanel,{files:parsed.files,viewColumn:2,headerColumn:1,mode:parsed.mode,context:parsed.context});await require('./text_transition_layout').attachHeaderLayout(vscode,restored,parsed.selectedFile);nativeColumn=2;layoutMode='text-attached';serializerRestoring=false;await protectHeaderGroup();return restored;
    }catch(_){layoutMode='text-attached';serializerRestoring=false;restoredPanel.dispose();return vscode.window.showInformationMessage('Code Navigation source files changed before restoration. Reopen Character Essentials to rebuild the workspace.');}
  };
  const showActions=()=>showActionsFor({...active,descriptor:contextDescriptor(active.document,active.classification,navigation)});
  const showConnectedViewers=()=>showConnectedFor({...active,descriptor:contextDescriptor(active.document,active.classification,navigation)});
  const openPrimary=()=>{const command=primaryCommand(active.classification);if(!active.classification.supported||!command)return vscode.window.showInformationMessage('Open a supported IKEMaker text file first.');return vscode.commands.executeCommand(command,active.seed);};
  const requireWorkspaceForTextLayout=async label=>{
    if(vscode.workspace.workspaceFile||(vscode.workspace.workspaceFolders||[]).length)return true;
    await vscode.window.showInformationMessage(`${label} is a workspace/window setting. Open a folder or workspace before enabling it; ordinary native tabs remain unchanged.`);return false;
  };
  const toggleGroupedFiles=async()=>{
    if(!await requireWorkspaceForTextLayout('Grouped files'))return false;
    const next=!config().get(GROUPED_FILES_SETTING,false);
    if(next){
      const accepted=await vscode.window.showWarningMessage('Grouped files uses the entity-scoped Code Navigation header and reduces VS Code\'s native tab display to one visible tab per editor group throughout this workspace/window. IKEMaker saves and restores the prior workspace value. Header-Only Text Layout will be turned off.',{modal:true},'Enable Grouped Files');
      if(accepted!=='Enable Grouped Files')return false;
      await config().update(GROUPED_FILES_SETTING,true,vscode.ConfigurationTarget?.Workspace??2);
      if(config().get(HEADER_ONLY_SETTING,false))await config().update(HEADER_ONLY_SETTING,false,vscode.ConfigurationTarget?.Workspace??2);
    }else await config().update(GROUPED_FILES_SETTING,false,vscode.ConfigurationTarget?.Workspace??2);const result=await syncTextTabLayout();render();
    if(next)await vscode.window.showInformationMessage('Grouped files enabled for this workspace/window. Native tabs are reduced per editor group; the Code Navigation file row remains entity-scoped.');
    else if(result.preserved.length)await vscode.window.showInformationMessage(`Grouped files disabled. Restored saved values; kept independently changed settings for ${result.preserved.join(', ')}.`);
    else await vscode.window.showInformationMessage('Grouped files disabled and the previous workspace tab display was restored.');return true;
  };
  const toggleHeaderOnlyLayout=async()=>{
    if(!await requireWorkspaceForTextLayout('Header-Only Text Layout'))return false;
    const next=!config().get(HEADER_ONLY_SETTING,false);
    if(next){
      const accepted=await vscode.window.showWarningMessage('Header-Only Text Layout hides VS Code\'s native editor tabs and both editor scrollbars throughout this workspace/window. IKEMaker Code Navigation becomes the visible tab header. Grouped files will be turned off. You can disable this command later to restore the saved workspace values.',{modal:true},'Enable Header-Only Layout');
      if(accepted!=='Enable Header-Only Layout')return false;
      await config().update(HEADER_ONLY_SETTING,true,vscode.ConfigurationTarget?.Workspace??2);
      if(config().get(GROUPED_FILES_SETTING,false))await config().update(GROUPED_FILES_SETTING,false,vscode.ConfigurationTarget?.Workspace??2);
    }else await config().update(HEADER_ONLY_SETTING,false,vscode.ConfigurationTarget?.Workspace??2);
    const result=await syncTextTabLayout();render();
    if(next)await vscode.window.showInformationMessage('Header-Only Text Layout enabled for this workspace. Run the same command to restore the native layout.');
    else if(result.preserved.length)await vscode.window.showInformationMessage(`Header-Only Text Layout disabled. Restored saved values; kept independently changed settings for ${result.preserved.join(', ')}.`);
    else await vscode.window.showInformationMessage('Header-Only Text Layout disabled and the previous workspace editor layout was restored.');
    return true;
  };
  const restoreNativeLayoutEscape=async()=>{
    if(!await requireWorkspaceForTextLayout('Restore Native Editor Tabs & Scrollbars'))return false;
    const result=await restoreNativeTextLayout(vscode,extensionContext);render();
    if(result.preserved?.length)await vscode.window.showInformationMessage(`Native editor tabs and scrollbars restored. Independently changed settings were retained for ${result.preserved.join(', ')}.`);
    else await vscode.window.showInformationMessage('Native editor tabs and scrollbars restored. IKEMaker Header-Only and Grouped files are disabled for this workspace.');
    return true;
  };
  const disableNativeLayout=async()=>{
    if(!await requireWorkspaceForTextLayout('Disable Native Editor Tabs & Scrollbars'))return false;
    const accepted=await vscode.window.showWarningMessage('This hides VS Code native editor tabs and both editor scrollbars for the workspace. The IKEMaker Code Navigation header becomes the replacement. You can always escape from IKEMaker Tools → View → Restore Native Editor Tabs & Scrollbars.',{modal:true},'Use Header Only');
    if(accepted!=='Use Header Only')return false;await disableNativeTextLayout(vscode,extensionContext);render();await vscode.window.showInformationMessage('Native tabs and scrollbars hidden. The permanent restore command remains available at the top of IKEMaker Tools → View.');return true;
  };
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('ikemen.textActions.open', showActions),
    vscode.commands.registerCommand('ikemen.textViewers.open', showConnectedViewers),
    vscode.commands.registerCommand('ikemen.textToolbar.openPrimary', openPrimary),
    vscode.commands.registerCommand('ikemen.textToolbar.toggleCompanion', options=>openAttachedCompanion(options,true)),
    vscode.commands.registerCommand('ikemen.textToolbar.suspendForVisualViewer', suspendForVisualViewer),
    vscode.commands.registerCommand('ikemen.textToolbar.resumeFromVisualViewer', resumeCompanion),
    vscode.commands.registerCommand('ikemen.textToolbar.toggleGroupedFiles', toggleGroupedFiles),
    vscode.commands.registerCommand('ikemen.textToolbar.toggleHeaderOnlyLayout', toggleHeaderOnlyLayout),
    vscode.commands.registerCommand('ikemen.textToolbar.restoreNativeLayout', restoreNativeLayoutEscape),
    vscode.commands.registerCommand('ikemen.textToolbar.disableNativeLayout', disableNativeLayout),
    vscode.commands.registerCommand('ikemen.textToolbar.openCompanion', openAttachedCompanion),
    vscode.window.registerWebviewPanelSerializer?.('ikemenTextCompanion',{deserializeWebviewPanel:restoreCompanion})||{dispose(){}},
    vscode.window.onDidChangeActiveTextEditor(updateContext),
    onDidChangeSourceHandoff(() => { if(panel)render(); }),
    vscode.window.tabGroups?.onDidChangeTabs?.(()=>{protectHeaderGroup().catch(()=>{});})||{dispose(){}},
    vscode.window.tabGroups?.onDidChangeTabGroups?.(()=>{if(panel)protectHeaderGroup().catch(()=>{});})||{dispose(){}},
    vscode.workspace.onDidChangeTextDocument?.(event=>{if(connectedFiles.some(file=>file.filename.toLowerCase()===path.resolve(event?.document?.fileName||'.').toLowerCase()))scheduleStatusRender();})||{dispose(){}},
    vscode.workspace.onDidSaveTextDocument?.(document=>{if(connectedFiles.some(file=>file.filename.toLowerCase()===path.resolve(document?.fileName||'.').toLowerCase()))scheduleStatusRender();})||{dispose(){}},
    vscode.languages?.onDidChangeDiagnostics?.(event=>{const uris=new Set(connectedFiles.map(file=>vscode.Uri.file(file.filename).toString()));if((event?.uris||[]).some(uri=>uris.has(String(uri))))scheduleStatusRender();})||{dispose(){}},
    vscode.workspace.onDidCloseTextDocument(document => { if(!panel||uriKey(bound.document)!==uriKey(document))return;if(!workspaceNavigation){panel.dispose();return;}const replacement=(vscode.workspace.textDocuments||[]).find(item=>!item.isClosed&&connectedFiles.some(file=>file.filename.toLowerCase()===path.resolve(item.fileName||'').toLowerCase()));if(replacement)bind({document:replacement,viewColumn:nativeColumn});else{bound={document:null,classification:{supported:false,kind:'',role:'',writable:false,label:'Connected source closed'},descriptor:null,contextEntry:null,contextModel:null};render();} }),
    vscode.workspace.onDidChangeConfiguration(event => { if(event.affectsConfiguration(`ikemenZss.${HEADER_ONLY_SETTING}`)||event.affectsConfiguration(`ikemenZss.${GROUPED_FILES_SETTING}`))syncTextTabLayout().then(()=>{if(panel)render();}).catch(error=>vscode.window.showErrorMessage?.(`Could not update text tab layout: ${error.message||error}`));if(event.affectsConfiguration('files.autoSave')&&panel)render();if (event.affectsConfiguration('ikemenZss.textToolbar') || event.affectsConfiguration('ikemenZss.additionalCodeExtensions')) updateContext(vscode.window.activeTextEditor); })
  );
  const repairMissingRestoredHeader=async()=>{
    if(panel||serializerRestoring||['visual-suspended','explicitly-closed'].includes(layoutMode)||!config().get(HEADER_ONLY_SETTING,false)||!active.classification.supported||!activeEditor?.document?.fileName||contextRegistry.isClosingFile(activeEditor.document.fileName))return false;
    const activeFilename=path.resolve(activeEditor.document.fileName),files=[...new Set((vscode.window.tabGroups?.all||[]).flatMap(group=>(group.tabs||[]).map(tab=>tabInputPath(tab))).filter(filename=>filename&&SUPPORTED.has(path.extname(filename).slice(1).toLowerCase())).map(filename=>path.resolve(filename)))];
    if(!files.some(filename=>filename.toLowerCase()===activeFilename.toLowerCase()))files.unshift(activeFilename);
    connectedFiles=files.slice(0,512).map(filename=>({filename,label:path.basename(filename)}));if(connectedFiles.some(file=>contextRegistry.isClosingFile(file.filename)))return false;connectedIndex=Math.max(0,connectedFiles.findIndex(file=>file.filename.toLowerCase()===activeFilename.toLowerCase()));workspaceNavigation=true;workspaceDescriptor=contextDescriptor(activeEditor.document,active.classification,navigation);
    return repairProtectedHeader();
  };
  const ready=updateContext(vscode.window.activeTextEditor).then(()=>syncTextTabLayout()).then(()=>{if(config().get(HEADER_ONLY_SETTING,false))startupRepairTimer=setTimeout(()=>{startupRepairTimer=null;repairMissingRestoredHeader().catch(()=>{});},250);});
  return { classify, actionsFor, primaryCommand, ready, toggle, open:openCompanion, bound:()=>bound, active:()=>active, connected:()=>({files:connectedFiles,index:connectedIndex,navigationMode:'tabs',nativeColumn,organization:currentFileOrganization}), createRetargetAdapter };
}

function createTextNavigationRetargetAdapter(registration,services={}){
  if(!registration||typeof registration.createRetargetAdapter!=='function')throw new TypeError('A registered Code Navigation controller is required.');
  return registration.createRetargetAdapter(services);
}

module.exports = { SUPPORTED, GROUPS, ACTIONS, TOOLBAR_COMMANDS, COMPANION_RESTORE_SCHEMA, COMPANION_RESTORE_VERSION, HEADER_ONLY_SETTING, GROUPED_FILES_SETTING, HEADER_ONLY_BACKUP_KEY, HEADER_ONLY_TARGETS, ENTITY_FILE_ORDER_KEY, MAX_CONNECTED_FILES, workspaceValue, applyHeaderOnlyLayout, applyTextTabLayout, restoreNativeTextLayout, disableNativeTextLayout, fileKind, fileKindLabel, fileOrigin, connectedOwnerIdentity, sameConnectedOwner, mergeConnectedFilePaths, classify, actionsFor, actionId, runAction, primaryCommand, contextDescriptor, textToolbarModel, validBodyMessage, airBrowserControlState, airBrowserControlsAvailable, exactAirReturnRenderAdoption, serializedCompanionState, parseCompanionState, companionHtml, createTextNavigationRetargetAdapter, register };
