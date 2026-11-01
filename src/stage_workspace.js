'use strict';

const vscode = require('vscode');
const { openViewerSource, currentPoint } = require('./viewer_navigation');
const fs = require('fs');
const path = require('path');
const { parseDef, kind, setSectionEntry, sectionMap } = require('./def_model');
const { stageModel, validateStage, parallaxDimensions } = require('./stage_model');
const { analyzeParallax } = require('./parallax_assistant');
const { attachedCharacterTemplates, scanStageIntegration, crossReferenceStage } = require('./stage_integration');
const { readSff, spriteDataUri } = require('./sff_reader');
const { embeddedActions } = require('./def_actions');
const { planThumbnailAnimations, hydrateThumbnailAnimations, projectRowAnimations } = require('./visual_thumbnail_animation_model');
const { hash, transactionalWrite, transactionalWriteSet, optionsFromConfig, policyFromConfig } = require('./mutation_safety');
const { mode } = require('./experience');
const { workspaceExperience } = require('./experience_model');
const { workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('./guided_workflows');
const { launchStageRig } = require('./stage_rig');
const { chooseFileOrFolder } = require('./open_target_picker');
const viewerGroup = require('./viewer_group'), trackViewerPanel = viewerGroup.trackViewerPanel, focusedVisualWorkspaceColumn = viewerGroup.focusedVisualWorkspaceColumn || (async fallback => viewerGroup.preferredViewerColumn(fallback));
const { registerAuthoringPanel } = require('./authoring_context_registry');
const { appendStageBackground, duplicateSection, deleteSection } = require('./visual_def_authoring');
const { pickSpriteReference } = require('./visual_sprite_picker');
const { pickEmbeddedAction } = require('./visual_action_picker');
const { createVisualAuthoringBrowser } = require('./visual_authoring_browser_model');
const visualComponentModel = require('./visual_component_model');
const { createVisualComponentLibrary } = require('./visual_component_library');
const { inheritSectionEntries, batchSummary } = require('./visual_property_batch');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, renderUniversalToolbar, universalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { ExactSourceRegistry, unavailable } = require('./exact_source_routes');
const authoringContextRegistry = require('./authoring_context_registry');
const { FormDrafts } = require('./form_drafts');
const { createPanelBindingRegistry } = require('./panel_binding_registry');
const visualHistory = require('./visual_workspace_history');
const visualBrowserService = require('./visual_authoring_browser_service');
const stageClipboardModel = require('./stage_background_clipboard');

let stageDrafts = new FormDrafts();
let visualComponents = null;
const panelOwners = new WeakMap();
const stageBackgroundClipboard = new stageClipboardModel.StageBackgroundClipboard();
const browserMutationAuthorities = new WeakSet();

const panelMessageHandlers = new WeakMap();

const openPanels = createPanelBindingRegistry();
function panelKey(filename, workspaceMode = '') { return path.resolve(filename).toLowerCase() + '|' + workspaceMode; }
function trackPanel(panel, filename, workspaceMode = '') {
  const key = panelKey(filename, workspaceMode), previouslyBound = openPanels.hasPanel(panel), result = openPanels.claim(panel,key);
  if (!result.ok) { if (!previouslyBound) panel.dispose(); return false; }
  if (!previouslyBound) {
    panel.onDidDispose(() => openPanels.release(panel));
    const folder = path.dirname(filename), broad = path.basename(folder).toLowerCase() === 'stages';
    registerAuthoringPanel(panel, { type: 'stage', key: filename, label: path.basename(filename, path.extname(filename)), root: broad ? '' : folder, files: [filename] });
  }
  return true;
}


function mutationOptions(filename, label, overrides = {}) {
  return optionsFromConfig(vscode, filename, label, { journalRoot: gameRoot(filename) || path.dirname(filename), ...overrides });
}

function gameRoot(filename) {
  let current = path.dirname(filename);
  for (let depth = 0; depth < 12; depth += 1) {
    // Packaged games commonly rename Ikemen_GO.exe (HDBZWin.exe, for example).
    // Prefer the nearest complete game layout so a nested game is not mistaken
    // for a parent developer installation that happens to keep Ikemen_GO.exe.
    const hasChars = fs.existsSync(path.join(current, 'chars'));
    const hasGameData = fs.existsSync(path.join(current, 'data', 'select.def'))
      || fs.existsSync(path.join(current, 'data', 'system.def'))
      || fs.existsSync(path.join(current, 'data', 'system.base.def'));
    if ((hasChars && hasGameData)
      || fs.existsSync(path.join(current, 'Ikemen_GO.exe'))
      || fs.existsSync(path.join(current, 'data', 'system.base.def'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveAsset(reference, filename) {
  if (!reference) return null;
  const cleaned = String(reference).replace(/\\/g, path.sep).replace(/\//g, path.sep);
  if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) return cleaned;
  const root = gameRoot(filename);
  const candidates = [path.resolve(path.dirname(filename), cleaned)];
  if (root) candidates.push(path.resolve(root, cleaned), path.resolve(root, 'data', cleaned), path.resolve(root, 'stages', cleaned));
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function stagePayload(filename, experience = workspaceExperience('stage', 'learning'), sourceText) {
  const text = sourceText === undefined ? fs.readFileSync(filename, 'utf8') : String(sourceText);
  const document = parseDef(text, filename);
  if (kind(document) !== 'stage') throw new Error('This DEF does not contain the Camera, StageInfo, and BGDef structure expected of a stage.');
  const model = stageModel(document);
  const animations = embeddedActions(text);
  const animationPlan = planThumbnailAnimations(animations, model.backgrounds.map(item => item.action).filter(value => value !== null));
  let archive = null, sffError = '', sffPath = '';
  if (model.sff) {
    sffPath = resolveAsset(model.sff, filename);
    try { archive = readSff(sffPath); } catch (error) { sffError = error.message; }
  }
  const images = {};
  const spriteInfo = {};
  const refs = new Set();
  for (const background of model.backgrounds) {
    const reference = background.sprite || (background.action !== null && animations[background.action] && animations[background.action].sprite);
    if (reference) refs.add(reference.join(','));
  }
  for (const key of animationPlan.spriteKeys) refs.add(key);
  if (archive) for (const key of [...refs].slice(0, 2000)) {
    const reference = key.split(',').map(Number);
    const sprite = archive.sprites.find((item) => item.group === reference[0] && item.number === reference[1]);
    if (!sprite) continue;
    try {
      images[key] = spriteDataUri(archive, sprite);
      spriteInfo[key] = { width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY };
    } catch (_) {}
  }
  const thumbnailAnimations = hydrateThumbnailAnimations(animationPlan, images);
  const backgrounds = model.backgrounds.map((item) => {
    const reference = item.sprite || (item.action !== null && animations[item.action] && animations[item.action].sprite);
    const info = reference && spriteInfo[reference.join(',')];
    const embeddedAction = item.action !== null && animations[item.action];
    return { ...item, assetSprite: reference ? [...reference] : null, actionLine: embeddedAction ? embeddedAction.line : null, parallax: parallaxDimensions(item, info && info.width), parallaxAnalysis: analyzeParallax(model, item, info) };
  });
  const interactionScans = [];
  for (const attached of model.attachedChars) {
    const charDef = resolveAsset(attached.path, filename);
    if (!charDef || !fs.existsSync(charDef)) continue;
    try {
      const charDocument = parseDef(fs.readFileSync(charDef, 'utf8'), charDef), files = sectionMap(charDocument.sections.find((section) => section.normalized === 'files'));
      const references = Object.entries(files).filter(([key, value]) => /^(?:st\d*|cns)$/.test(key) && /\.(?:zss|cns)$/i.test(value)).map(([, value]) => resolveAsset(value.replace(/^"|"$/g, ''), charDef));
      for (const source of [...new Set(references)]) if (source && fs.existsSync(source)) interactionScans.push(scanStageIntegration(fs.readFileSync(source, 'utf8'), path.relative(path.dirname(filename), source).replace(/\\/g, '/')));
    } catch (_) {}
  }
  const integration = crossReferenceStage(model, interactionScans);
  const animationIssues = model.backgrounds
    .filter((item) => item.action !== null && !animations[item.action])
    .map((item) => ({ severity: 'error', code: 'missing-animation', line: item.line, message: `${item.name} references missing Begin Action ${item.action}.` }));
  const issues = [...validateStage(model, archive), ...animationIssues, ...integration.issues];
  const rigConfig = vscode.workspace && vscode.workspace.getConfiguration
    ? vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename))
    : { get: (_key, fallback) => fallback };
  const rigSpeed = rigConfig.get('stageRigMoveSpeed', 2);
  const payload = {
    filename, fileLabel: path.basename(filename), sourceHash: hash(text), mutation: policyFromConfig(vscode, filename), experience, sffPath, sffError, images, spriteInfo, animations, thumbnailAnimations,
    model: { ...model, source: undefined, backgrounds },
    rig: { speed: rigSpeed, fineSpeed: rigConfig.get('stageRigFineMoveSpeed', Math.max(0.05, rigSpeed / 4)), fastSpeed: rigConfig.get('stageRigFastMoveSpeed', rigSpeed * 4) },
    integration,
    issues
  };
  payload.backgroundBrowser=stageBackgroundBrowser(payload).snapshot();
  return payload;
}

function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

function stageSpriteHandoff(payload, request) {
  const selected = payload?.model?.backgrounds?.find((item) => item.line === Number(request?.line) && item.name === request?.name);
  const reference = selected && selected.assetSprite;
  if (!selected || !reference || reference[0] !== Number(request?.group) || reference[1] !== Number(request?.number)) return null;
  return { sffPath: payload.sffPath, group: reference[0], number: reference[1], selected };
}

function backgroundReference(payload, index) {
  const item = payload?.model?.backgrounds?.[index];
  if(!item)return null;const signature=hash(JSON.stringify({name:item.name,type:item.type,sprite:item.sprite,action:item.action,id:item.id,layer:item.layer})),occurrence=payload.model.backgrounds.slice(0,index).filter(candidate=>hash(JSON.stringify({name:candidate.name,type:candidate.type,sprite:candidate.sprite,action:candidate.action,id:candidate.id,layer:candidate.layer}))===signature).length;
  return { filename: path.resolve(payload.filename), signature, occurrence, matchCount:payload.model.backgrounds.filter(candidate=>hash(JSON.stringify({name:candidate.name,type:candidate.type,sprite:candidate.sprite,action:candidate.action,id:candidate.id,layer:candidate.layer}))===signature).length };
}
function findBackground(payload, reference) {
  if (!reference || path.resolve(reference.filename || '') !== path.resolve(payload.filename)) return null;
  const matches = payload.model.backgrounds.filter(item => hash(JSON.stringify({name:item.name,type:item.type,sprite:item.sprite,action:item.action,id:item.id,layer:item.layer}))===reference.signature);
  return matches.length===reference.matchCount&&Number.isInteger(reference.occurrence)?matches[reference.occurrence]||null:null;
}
function stageBackgroundBrowser(payload) {
  return createVisualAuthoringBrowser((payload?.model?.backgrounds||[]).map((item,index)=>({
    identity:JSON.stringify(backgroundReference(payload,index)),label:item.name,kind:item.action!==null?'animation':item.type==='parallax'?'parallax':'sprite',
    description:`${item.type} · layer ${item.layer} · ${item.sprite?`sprite ${item.sprite.join(',')}`:`Action ${item.action}`}`,
    thumbnailKey:item.assetSprite?.join(',')||'',source:{reference:backgroundReference(payload,index)},
    actions:[{id:'open-source',label:'Open source block'},...(item.assetSprite?[{id:'open-sprite',label:'Open sprite in SFF'}]:[]),...(item.actionLine!==null?[{id:'open-action',label:'Open embedded action'}]:[]),{id:'copy-background',label:'Copy BG to IKEMaker clipboard'},{id:'cut-background',label:'Cut BG to IKEMaker clipboard',mutating:true},{id:'paste-before',label:'Paste BG before',mutating:true},{id:'paste-after',label:'Paste BG after',mutating:true},{id:'duplicate-background',label:'Duplicate BG',mutating:true}]
  })),{binding:`${path.resolve(payload.filename)}#${payload.sourceHash}`});
}
function exactObject(value, keys) { return value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'); }
function validHistoryReference(value) { return exactObject(value,['backgroundName','backgroundType']) && typeof value.backgroundName==='string' && value.backgroundName.length<=512 && typeof value.backgroundType==='string' && value.backgroundType.length<=64; }
function validStageMessage(message, generation) {
  if (!message || (Object.getPrototypeOf(message)!==Object.prototype && Object.getPrototypeOf(message)!==null) || message.generation!==generation || typeof message.type!=='string') return false;
  const exact=keys=>exactObject(message,['type','generation',...keys]),boundedInt=(value,max=10000000)=>Number.isInteger(value)&&value>=0&&value<=max,boundedString=(value,max=512)=>typeof value==='string'&&value.length<=max,index=()=>boundedInt(message.selected,9999),coordinate=value=>Number.isFinite(value)&&Math.abs(value)<=10000000;
  if(message.type==='selectionChanged')return exact(['selected'])&&index();
  if(message.type==='browserSelectionIntent')return exact(['selected','mode'])&&index()&&['replace','toggle','range'].includes(message.mode);
  if(message.type==='previewDraft')return exact(['selected','previewStarts'])&&index()&&Array.isArray(message.previewStarts)&&message.previewStarts.length<=10000&&message.previewStarts.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(coordinate));
  if(['openExactBackground','editPreferred'].includes(message.type))return exact(['selected','reference'])&&index()&&validHistoryReference(message.reference);
  if(message.type==='openSource')return exact(['line','navigationSelection'])&&boundedInt(message.line)&&validHistoryReference(message.navigationSelection)&&message.navigationSelection.backgroundName.length<=512&&message.navigationSelection.backgroundType.length<=64;
  if(message.type==='openStageSprite')return exact(['line','name','group','number'])&&boundedInt(message.line)&&boundedString(message.name)&&boundedInt(message.group,2147483647)&&boundedInt(message.number,2147483647);
  if(message.type==='visualBrowserAction')return exact(['binding','rowId','actionId'])&&[message.binding,message.rowId].every(value=>boundedString(value,128))&&boundedString(message.actionId,64);
  if(message.type==='stageBackgroundDrop')return exact(['binding','sourceRowIds','targetRowId','placement'])&&boundedString(message.binding,128)&&Array.isArray(message.sourceRowIds)&&message.sourceRowIds.length>0&&message.sourceRowIds.length<=512&&message.sourceRowIds.every(value=>boundedString(value,128))&&boundedString(message.targetRowId,128)&&['before','after'].includes(message.placement);
  if(message.type==='copyPatch')return exact(['text'])&&typeof message.text==='string'&&message.text.length<=4096;
  if(message.type==='launchStageRig')return exact(['speed','fineSpeed','fastSpeed'])&&[message.speed,message.fineSpeed,message.fastSpeed].every(value=>Number.isFinite(value)&&value>0&&value<=100);
  if(['addBackground','openLayeredPsd','insertStageComponent','manageStageComponents'].includes(message.type))return exact([]);
  if(['duplicateBackground','removeBackground','saveStageComponent','inheritBackgroundProperties'].includes(message.type))return exact(['line','name'])&&boundedInt(message.line)&&boundedString(message.name);
  if(message.type==='applyStart')return exact(['sectionLine','value','name'])&&boundedInt(message.sectionLine)&&boundedString(message.value,128)&&boundedString(message.name);
  if(message.type==='applyStarts')return exact(['entries'])&&Array.isArray(message.entries)&&message.entries.length>=2&&message.entries.length<=512&&message.entries.every(entry=>exactObject(entry,['line','name','value'])&&boundedInt(entry.line)&&boundedString(entry.name)&&boundedString(entry.value,128)&&/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(entry.value));
  return false;
}
function stageSelection(owner) { const reference = backgroundReference(owner.payload, owner.selected || 0); return reference ? { surfaceId: 'stage.workspace', uri: owner.document?.uri?.toString?.() || vscode.Uri.file(owner.filename).toString(), reference } : null; }
function claimStage(owner) { if (!owner || owner.disposed || !owner.panel.active || !owner.contextModel) return; owner.contextModel.update({ selection: stageSelection(owner), activeSurfaceId: 'stage.workspace' }); }
function normalizeStageBrowserSelection(owner) {
  const total=owner?.payload?.model?.backgrounds?.length||0,selected=Math.max(0,Math.min(Math.max(0,total-1),Number(owner?.selected)||0));
  let indices=[...new Set(Array.isArray(owner?.selectedIndices)?owner.selectedIndices.filter(index=>Number.isInteger(index)&&index>=0&&index<total):[])];
  if(total&&!indices.length)indices=[selected];
  owner.selected=total?(indices.includes(selected)?selected:indices.at(-1)):0;owner.selectedIndices=indices;owner.selectionAnchor=Number.isInteger(owner.selectionAnchor)&&owner.selectionAnchor>=0&&owner.selectionAnchor<total?owner.selectionAnchor:owner.selected;
  return owner;
}
function applyStageBrowserSelection(owner,index,mode='replace') {
  normalizeStageBrowserSelection(owner);const total=owner?.payload?.model?.backgrounds?.length||0;if(!Number.isInteger(index)||index<0||index>=total||!['replace','toggle','range'].includes(mode))return false;
  const selected=new Set(owner.selectedIndices);
  if(mode==='range'){selected.clear();const low=Math.min(owner.selectionAnchor,index),high=Math.max(owner.selectionAnchor,index);for(let cursor=low;cursor<=high;cursor++)selected.add(cursor);}
  else if(mode==='toggle'){if(selected.has(index)&&selected.size>1)selected.delete(index);else selected.add(index);owner.selectionAnchor=index;}
  else{selected.clear();selected.add(index);owner.selectionAnchor=index;}
  owner.selectedIndices=[...selected].sort((a,b)=>a-b);owner.selected=selected.has(index)?index:owner.selectedIndices.at(-1);return true;
}
function stageBrowserCommit(owner){normalizeStageBrowserSelection(owner);return{type:'stageSelectionCommit',generation:owner.generation,selected:owner.selected,selectedIndices:owner.selectedIndices.slice(),anchor:owner.selectionAnchor};}
function stageBrowserModel(owner){normalizeStageBrowserSelection(owner);const browser=owner.backgroundBrowser.snapshot(),rowsByOrdinal=new Map(browser.rows.map(row=>[row.ordinal,row.id])),actionNumbers=(owner.payload.model.backgrounds||[]).map(item=>item.action);return{generation:owner.generation,binding:browser.binding,scope:{id:'backgrounds',label:'Stage backgrounds',ordinal:0,total:1},scopes:[{id:'backgrounds',label:'Stage backgrounds'}],browser,selection:{rowIds:owner.selectedIndices.map(index=>rowsByOrdinal.get(index)).filter(Boolean),anchorId:rowsByOrdinal.get(owner.selectionAnchor)||''},thumbnails:owner.payload.images||{},thumbnailAnimations:projectRowAnimations(browser.rows,actionNumbers,owner.payload.thumbnailAnimations)};}
function stageBrowserOwnerKey(filename){return path.resolve(filename);}
function detachStageBrowser(owner,service=visualBrowserService){owner.visualBrowserRegistration?.dispose?.();owner.visualBrowserRegistration=null;if(owner.visualBrowserOwnerKey){try{service.detachOwner('stage',owner.visualBrowserOwnerKey);}catch(_){}owner.visualBrowserOwnerKey='';}}
async function publishStageBrowser(owner,service=visualBrowserService){if(!owner?.visualBrowserOwnerKey)return false;try{return await service.publish('stage',owner.visualBrowserOwnerKey);}catch(_){return false;}}
async function commitStageBrowserSelection(owner,index,mode='replace',publish=true){if(!applyStageBrowserSelection(owner,index,mode))return false;claimStage(owner);await owner.panel.webview.postMessage(stageBrowserCommit(owner));await owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});if(publish)await publishStageBrowser(owner);return true;}
async function routeStageBrowserAction(owner,rowId,actionId,binding=owner?.backgroundBrowser?.snapshot?.().binding){
  if(!owner||owner.disposed||panelOwners.get(owner.panel)!==owner)return false;
  const resolved=owner.backgroundBrowser?.resolve({type:'visualBrowserAction',binding,rowId,actionId}),item=resolved&&findBackground(owner.payload,resolved.source.reference);if(!resolved||!item)return false;
  const currentText=liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8');if(hash(currentText)!==owner.payload.sourceHash){await populate(owner.panel,owner.filename);await publishStageBrowser(owner);vscode.window.showWarningMessage('The stage changed. The background browser was refreshed; choose the contextual action again.');return false;}
  if(actionId==='open-source'){await openViewerSource(owner.filename,item.line,currentPoint(owner.filename,'stage',{navigationSelection:{backgroundName:item.name,backgroundType:item.type}},owner.panel));return true;}
  if(actionId==='open-action'&&item.actionLine!==null){await openViewerSource(owner.filename,item.actionLine,currentPoint(owner.filename,'stage',{navigationSelection:{backgroundName:item.name,backgroundType:item.type}},owner.panel));return true;}
  if(actionId==='open-sprite'&&item.assetSprite&&owner.payload.sffPath&&!owner.payload.sffError&&fs.existsSync(owner.payload.sffPath)){await vscode.commands.executeCommand('sff.openViewer',vscode.Uri.file(owner.payload.sffPath),undefined,{group:item.assetSprite[0],number:item.assetSprite[1]});return true;}
  if(['copy-background','cut-background','paste-before','paste-after','duplicate-background'].includes(actionId))return handleStageBrowserClipboardAction(owner,resolved.source.reference,actionId);
  return false;
}
function attachStageBrowser(owner,service=visualBrowserService){
  const ownerKey=stageBrowserOwnerKey(owner.filename);if(owner.visualBrowserRegistration&&owner.visualBrowserOwnerKey===ownerKey)return owner.visualBrowserRegistration;
  detachStageBrowser(owner,service);owner.visualBrowserOwnerKey=ownerKey;
  try{owner.visualBrowserRegistration=service.registerOwner({surface:'stage',ownerKey,label:owner.payload.model.name||path.basename(owner.filename),getModel:()=>stageBrowserModel(owner),onScope:async()=>{},onSelect:async(rowId,mode)=>{const row=owner.backgroundBrowser.snapshot().rows.find(candidate=>candidate.id===rowId);if(!row)return false;return commitStageBrowserSelection(owner,row.ordinal,mode,false);},onAction:(rowId,actionId)=>routeStageBrowserAction(owner,rowId,actionId)});}
  catch(_){owner.visualBrowserOwnerKey='';owner.visualBrowserRegistration=null;}
  return owner.visualBrowserRegistration;
}
function stageToolbarModel(owner = {}) {
  const capabilities = Object.fromEntries(SLOTS.map(slot => [slot.id, { enabled: false, reason: `${slot.label} is unavailable for the current Stage Workspace context.` }]));
  const enable = (id, dispatch = `internal:${id}`) => { capabilities[id] = { enabled: true, dispatch }; };
  for (const id of ['new','open','backup','recovery','project','stage','viewer-browser','actions-search','suite-switch','help','settings']) enable(id);
  capabilities.close=owner.busy?{enabled:false,reason:'Wait for the current stage operation to finish.'}:{enabled:true,dispatch:'internal:close'};
  capabilities.save = { enabled:false, reason:'Stage Workspace owns reviewed specialist mutations, not a whole-document draft. Save unsaved source changes in the native or integrated text editor.' };
  capabilities.run=gameRoot(owner.filename)?{enabled:true,dispatch:'internal:run'}:{enabled:false,reason:'No containing IKEMEN game was proven for this stage.'};
  if (findBackground(owner.payload || {}, backgroundReference(owner.payload, owner.selected || 0))) capabilities['text-source'] = { enabled: true, dispatch: 'internal:text-source', capabilityId: 'implemented.stage-source', resolverId: 'stage.exact-background-source', routeKind: 'selected-block' };
  else capabilities['text-source'] = { enabled: false, reason: 'Choose one current stage background to open its exact source block.' };
  const connected = [owner.filename, owner.payload?.sffPath&&!owner.payload?.sffError?owner.payload.sffPath:''].filter(Boolean);
  if (connected.length > 1) capabilities['connected-resources'] = { enabled: true, dispatch: 'internal:connected-resources', routeKind: 'connected-resources' };
  else capabilities['connected-resources'] = { enabled: false, reason: 'This stage has no currently resolvable connected asset.' };
  for (const id of ['versus','training']) capabilities[id]={enabled:false,reason:'This Stage Workspace does not prove a current character-owned launch target.'};
  capabilities.sprites = owner.payload?.sffPath && !owner.payload?.sffError ? { enabled: true, dispatch: 'internal:sprites' } : { enabled: false, reason: 'The assigned stage SFF is unavailable.' };
  for (const id of ['animations','commands','states','sounds','palettes']) capabilities[id] = { enabled: false, reason: `${SLOTS.find(slot => slot.id === id)?.label || id} has no truthful single stage-owned target.` };
  capabilities['code-structure']={enabled:false,reason:'Code Structure requires a proven code or character owner; this Stage Workspace owns a stage DEF.'};
  return adapt('stage.workspace', capabilities, { resolverIds: ['stage.exact-background-source'] });
}

function stageQuickControlsClientScript() { return `
function installStageQuickControls(){
  const actions=document.getElementById('stageQuickActions'),specialty=document.getElementById('stageSpecialtyControls'),scroll=document.getElementById('stageBackgroundScroll'),readout=document.getElementById('stageSelectionReadout'),direct=document.getElementById('stageDirectSelect'),collection=document.getElementById('stageNavCollection');
  if(actions&&data.sffPath&&!data.sffError){const wrap=document.createElement('label'),writer=document.createElement('select');wrap.className='stage-sff-writer';wrap.title='Shared output writer for SFF-building actions. Stage browsing and preview are unaffected.';wrap.setAttribute('aria-label','SFF output writer');for(const option of [{value:'ikemaker',label:'IKEMaker'},{value:'sprmake2',label:'SprMake2'},{value:'both',label:'Both'}]){const node=document.createElement('option');node.value=option.value;node.textContent=option.label;writer.append(node)}writer.disabled=true;writer.title='Loading the saved SFF output-writer preference.';writer.setAttribute('aria-label','SFF output writer');wrap.append(writer);actions.append(wrap);writer.onchange=()=>{writer.disabled=true;writer.title='Saving the SFF output-writer preference.';vscode.postMessage({type:'sffWriterPreferenceChange',mode:writer.value})};addEventListener('message',event=>{const message=event.data||{};if(message.type!=='sffWriterPreferenceState')return;writer.value=['ikemaker','sprmake2','both'].includes(message.mode)?message.mode:'ikemaker';writer.disabled=false;writer.title='Choose the output writer used by SFF-building actions.'});vscode.postMessage({type:'sffWriterPreferenceReady'})}
  const compact=(id,symbol,label)=>{const button=document.getElementById(id);if(!button||!actions)return;button.dataset.fullLabel=button.textContent.trim();button.textContent=symbol;button.title=button.title||label;button.setAttribute('aria-label',label);actions.appendChild(button)};
  [['stageRig','▶','Launch Stage Rig'],['addBg','＋','Add background'],['layeredPsd','▤','Import layered PSD'],['duplicateBg','▣','Duplicate background'],['removeBg','×','Remove background'],['source','⌕','Open source line'],['assetSprite','▧','Open selected sprite'],['assetAction','A','Open embedded action'],['guides','#','Toggle guides'],['fit','□','Fit preview'],['reset','↶','Reset preview']].forEach(item=>compact(...item));
  const move=node=>{if(node&&specialty)specialty.appendChild(node)};move(document.getElementById('cameraZoom')?.closest('label'));['cameraPreset','previewSweep','captureA','captureB','compare'].forEach(id=>move(document.getElementById(id)));
  model.backgrounds.forEach((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+' · '+(item.name||'Background');direct.appendChild(option);const button=document.createElement('button');button.textContent=option.textContent;button.dataset.stageIndex=String(index);button.setAttribute('role','option');button.setAttribute('aria-describedby','stageSelectionReadout');button.onclick=()=>requestSelection(index);collection.appendChild(button)});
  const navModes=[...document.querySelectorAll('[data-stage-nav-mode]')];let navMode='tabs';
  const setNavMode=mode=>{navMode=['tabs','list','cards'].includes(mode)?mode:'tabs';collection.className='stage-nav-'+navMode;for(const button of navModes){const active=button.dataset.stageNavMode===navMode;button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;button.title=active?button.textContent+' layout is active':'Switch background navigation to '+button.textContent+' layout'}};
  const sync=()=>{const count=model.backgrounds.length,index=Math.max(0,Math.min(count-1,selected)),previous=document.getElementById('stagePrevious'),next=document.getElementById('stageNext');scroll.max=String(Math.max(0,count-1));scroll.value=String(index);direct.value=String(index);scroll.disabled=direct.disabled=!count;scroll.title=direct.title=count?'Choose the current stage background.':'Add a background to enable navigation.';previous.disabled=!count||index<=0;next.disabled=!count||index>=count-1;previous.title=!count?'Add a background to enable navigation.':index<=0?'Already at the first background.':'Previous background';next.title=!count?'Add a background to enable navigation.':index>=count-1?'Already at the last background.':'Next background';readout.textContent=count?(index+1)+' / '+count+' · '+(model.backgrounds[index].name||'Background'):'No backgrounds. Add a background to begin.';for(const button of collection.children){const active=Number(button.dataset.stageIndex)===index;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1}};
  const requestSelection=value=>{if(!model.backgrounds.length)return;post('selectionChanged',{selected:Math.max(0,Math.min(model.backgrounds.length-1,Number(value)||0))})};scroll.onchange=()=>requestSelection(scroll.value);direct.onchange=()=>requestSelection(direct.value);document.getElementById('stagePrevious').onclick=()=>requestSelection(selected-1);document.getElementById('stageNext').onclick=()=>requestSelection(selected+1);
  for(const button of navModes){button.onclick=()=>setNavMode(button.dataset.stageNavMode);button.onkeydown=event=>{const key=event.key;if(!['ArrowLeft','ArrowRight','Home','End'].includes(key))return;event.preventDefault();const current=Math.max(0,navModes.indexOf(button)),target=key==='Home'?0:key==='End'?navModes.length-1:(current+(key==='ArrowRight'?1:-1)+navModes.length)%navModes.length;navModes[target].focus();navModes[target].click()}}setNavMode(navMode);window.addEventListener('message',event=>{const message=event.data;if(message.type!=='stageSelectionCommit'||message.generation!==data.generation)return;selected=message.selected;selectedSet=new Set(Array.isArray(message.selectedIndices)&&message.selectedIndices.length?message.selectedIndices:[selected]);selectionAnchor=Number.isInteger(message.anchor)?message.anchor:selected;list();inspect();render();sync()});
  const originalList=list;list=(...args)=>{const result=originalList(...args);sync();return result};sync();
}installStageQuickControls();`;
}
function stageHistoryClientScript(){return `addEventListener('message',event=>{const message=event.data;if(message.type!=='viewerHistoryRestore')return;let ok=true;try{if(message.reference){ok=globalThis.ikemenCanRestoreNavigation?.(message.reference)===true;if(ok)globalThis.ikemenRestoreNavigation?.(message.reference)}}catch(_){ok=false}vscode.postMessage({type:'viewerHistoryRestored',requestId:message.requestId,ok})});`;}

function stageComparisonAvailability(captureA, captureB) {
  const hasA = Boolean(captureA), hasB = Boolean(captureB);
  if (hasA && hasB) return Object.freeze({ disabled: false, reason: 'Compare the two in-memory stage captures.' });
  return Object.freeze({ disabled: true, reason: !hasA && !hasB ? 'Capture both A and B before comparing them.' : hasA ? 'Capture B before comparing.' : 'Capture A before comparing.' });
}

function stageRigControlAvailability(values = {}) {
  const fields = [
    ['rigSpeed', 'normal speed', values.speed],
    ['rigFine', 'fine speed', values.fineSpeed],
    ['rigFast', 'fast speed', values.fastSpeed]
  ];
  const invalid = fields.find(([, , value]) => !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 100);
  if (invalid) return Object.freeze({ disabled: true, invalidId: invalid[0], reason: `Enter a ${invalid[1]} greater than 0 and no more than 100.` });
  return Object.freeze({ disabled: false, invalidId: '', reason: 'Launch the Stage Rig with these reviewed movement speeds.' });
}

function stagePreviewSelectionAvailability(values = {}) {
  const hasSelection = values.hasSelection === true;
  const currentDirty = hasSelection && values.currentDirty === true;
  const selectionDirty = hasSelection && (currentDirty || values.selectionDirty === true);
  const selectionCount = Math.max(0, Number(values.selectionCount) || 0);
  return Object.freeze({
    positionDisabled: !hasSelection,
    copyDisabled: !hasSelection,
    applyDisabled: !currentDirty,
    discardDisabled: !selectionDirty,
    applySelectedDisabled: selectionCount < 2 || !selectionDirty,
    selectionReason: hasSelection ? 'Edit the selected background preview position.' : 'Add or select a stage background to edit its preview position.',
    currentDirtyReason: !hasSelection ? 'Add or select a stage background to enable this action.' : currentDirty ? 'The current preview position differs from the stage source.' : 'Move the current background before applying its preview position.',
    selectionDirtyReason: !hasSelection ? 'Add or select a stage background to enable this action.' : selectionDirty ? 'At least one selected preview position differs from the stage source.' : 'Move at least one selected background before discarding selected preview positions.',
    applySelectedReason: selectionCount < 2 ? 'Select at least two stage backgrounds to apply their reviewed positions together.' : selectionDirty ? 'Apply the selected preview positions as one undoable transaction.' : 'Move at least one selected background before applying selected positions.'
  });
}

function stagePreviewFitScale(viewportWidth, viewportHeight, canvasWidth, canvasHeight, padding = 30) {
  const width = Number(viewportWidth), height = Number(viewportHeight), canvasW = Number(canvasWidth), canvasH = Number(canvasHeight), pad = Math.max(0, Number(padding) || 0);
  if (![width, height, canvasW, canvasH].every(Number.isFinite) || canvasW <= 0 || canvasH <= 0) return 1;
  return Math.max(0.1, Math.min((width - pad) / canvasW, (height - pad) / canvasH));
}

function stageHtml(payload, toolbarModel = stageToolbarModel({ payload, filename: payload.filename, selected: 0 })) {
  const universalToolbar = renderUniversalToolbar(toolbarModel, { surfaceId: 'stage.workspace', label: 'IKEMaker universal actions' });
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
  :root{color-scheme:dark;--panel:#181b20;--line:#343b46;--muted:#9aa5b1;--accent:#38d5d5;--warn:#ffcc54;--danger:#ff6b6b}*{box-sizing:border-box}body{margin:0;background:#101217;color:#e8edf2;font:12px var(--vscode-font-family,Segoe UI);overflow:hidden}.app{height:100vh;display:grid;grid-template-columns:250px minmax(360px,1fr) 300px;grid-template-rows:auto minmax(0,1fr) auto}.toolbar{grid-column:1/4;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);overflow-x:auto}button,select,input{font:inherit;color:inherit;background:#262b33;border:1px solid #46505d;border-radius:3px;padding:5px}button:hover{border-color:var(--accent)}button.active{background:#15525a;border-color:var(--accent)}.side{min-width:0;background:var(--panel);overflow:auto;padding:10px}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}h2,h3{margin:5px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#b9c8d6}.canvas-wrap{position:relative;overflow:hidden;background:repeating-conic-gradient(#151a20 0 25%,#11161b 0 50%) 50%/24px 24px}.canvas-pan{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}canvas{display:block;background:#27112b;box-shadow:0 0 0 1px #566270}.bg{display:grid;grid-template-columns:24px 1fr auto auto;gap:5px;align-items:center;padding:5px;border-bottom:1px solid #272d35;cursor:pointer}.bg.selected{background:#16464d}.bg.drop-before{box-shadow:inset 0 3px var(--accent)}.bg.drop-after{box-shadow:inset 0 -3px var(--accent)}.bg .meta{color:var(--muted);font-size:10px}.bg-controls{display:flex;gap:3px;align-items:center}.bg-controls button{padding:2px 4px}.layers{display:flex;gap:5px}.status{grid-column:1/4;padding:5px 10px;background:var(--panel);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row{display:grid;grid-template-columns:90px 1fr;gap:7px;margin:5px 0;align-items:center}.value{font-family:var(--vscode-editor-font-family,monospace);color:#dce7ef}.issue{padding:6px;margin:5px 0;border-left:3px solid #5d6875;background:#22272e}.issue.warning{border-color:var(--warn)}.issue.error{border-color:var(--danger)}.issue.info{border-color:#62a9ff}.issue.active{border-color:var(--warn);background:#3c3420}.guide{display:flex;gap:4px;flex-wrap:wrap}.small{color:var(--muted);font-size:10px}.drag{color:var(--accent);font-weight:600}.patch{width:100%;min-height:54px;background:#11151a;color:#dce7ef;font-family:monospace;resize:vertical}.separator{border-top:1px solid var(--line);margin:10px 0}.badge{padding:2px 5px;border-radius:9px;background:#333b46}.camera{width:150px;padding:2px}.fit{margin-left:auto}.compare{position:absolute;inset:16px;z-index:5;background:#101217eF;border:1px solid var(--accent);padding:12px;display:none;overflow:auto}.compare.open{display:block}.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.compare img{width:100%;image-rendering:pixelated;border:1px solid var(--line)}.compact{width:62px}.row input,.row select{min-width:0;width:100%}.toolbar button{white-space:nowrap}.bg>div{min-width:0;overflow-wrap:anywhere}.browser-tools{display:grid;grid-template-columns:1fr auto;gap:4px;margin:8px 0}.browser-tools input{grid-column:1/3;width:100%}#backgrounds.thumbnails{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:5px}#backgrounds.thumbnails .bg{display:block;border:1px solid var(--line);padding:6px}#backgrounds.thumbnails .bg>input,#backgrounds.thumbnails .bg>span{display:none}.bg-thumb{width:100%;height:76px;object-fit:contain;image-rendering:pixelated;background:#11151a;margin-bottom:4px}.browser-context{position:fixed;z-index:50;min-width:170px;padding:5px;background:#20252d;border:1px solid var(--accent);box-shadow:0 5px 18px #000a}.browser-context button{display:block;width:100%;text-align:left;margin:2px 0}@media(max-width:1100px){body{overflow:auto}.app{height:auto;min-height:100vh;grid-template-columns:minmax(0,1fr);grid-template-rows:auto 380px auto auto auto}.toolbar,.status{grid-column:1}.toolbar{grid-row:1}.canvas-wrap{grid-row:2}.left{grid-row:3;max-height:360px}.right{grid-row:4;overflow:visible}.status{grid-row:5;white-space:normal;overflow-wrap:anywhere}.compare-grid{grid-template-columns:1fr}}
  </style><style>${universalToolbarStyle()}</style></head><body>${universalToolbar}<div class="app">
  <div class="toolbar"><b>Stage Workspace</b>${visualHistory.controlsHtml(payload.visualHistory)}<span id="title"></span><span class="badge" id="coord" aria-label="Stage local coordinate size"></span><span class="badge" title="Change this with IKEMEN: Configure Learning / Advanced Experience">${payload.experience.label}</span><button id="stageRig" aria-describedby="stageRigReason" title="Launch the configurable two-player camera diagnostic rig.">▶ Stage Rig</button><div class="layers" role="group" aria-label="Visible stage layers"><button data-layer="-1" class="active" aria-pressed="true">Layer -1</button><button data-layer="0" class="active" aria-pressed="true">Layer 0</button><button data-layer="1" class="active" aria-pressed="true">Layer 1</button></div><button id="guides" class="active" aria-pressed="true">Guides</button><label>Camera X <input class="camera" id="cameraX" type="range"></label><label>Camera Y <input class="camera" id="cameraY" type="range"></label><label>Camera zoom <input class="camera" id="cameraZoom" type="range" min="0.1" max="4" step="0.01"></label><select id="cameraPreset" aria-label="Camera preview preset" title="Preview authored camera stress positions"><option value="">Camera preset…</option><option value="start">Authored start</option><option value="left">Left bound</option><option value="right">Right bound</option><option value="high">High bound</option><option value="low">Low bound</option><option value="wide">Zoom out</option><option value="tight">Zoom in</option></select><button id="previewSweep" aria-pressed="false" title="Animate the editor camera through its bounds; this does not alter the stage.">Sweep</button><label>BGCtrl preview tick <input class="camera" id="timeline" type="range" min="0" max="600" step="1" value="0"></label><output id="timelineValue" for="timeline">0</output><button id="captureA" title="Capture the current preview as comparison A in memory">Capture A</button><button id="captureB" title="Capture the current preview as comparison B in memory">Capture B</button><button id="compare" disabled title="Capture both A and B before comparing them.">Compare</button><button class="fit" id="fit" title="Fit the stage canvas in the current preview area">Fit</button><button id="reset" title="Reset the camera to the authored start, then fit the preview">Reset</button></div>
  <aside class="side left"><h2>Background stack</h2><div class="guide"><button id="addBg" title="Create a new normal, animated, or parallax stage background">+ Background</button><button id="layeredPsd" title="Import a Photoshop document as an ordered, previewable stage background stack">Layered PSD…</button><button id="duplicateBg" title="Duplicate the selected background">Duplicate</button><button id="removeBg" title="Remove the selected background section">Remove</button></div><div class="guide"><button id="inheritStageProperties" title="Copy selected properties from this background to several reviewed targets">Inherit properties…</button><button id="saveStageComponent" title="Save this complete BG as a reusable favorite-like recipe in the shared visual component library">Save reusable BG…</button><button id="insertStageComponent" title="Insert a saved reusable BG with a collision-safe section name">Insert saved BG…</button><button id="manageStageComponents" title="Review or delete saved reusable Stage BGs">Manage saved BGs…</button></div><p class="small">Saved BGs are the reusable recipe/favorites workflow: one shared component library, not a second Stage draft.</p><div class="browser-tools"><input id="backgroundFilter" type="search" placeholder="Filter backgrounds" aria-label="Filter stage backgrounds"><select id="backgroundKind" aria-label="Background kind"><option value="">All kinds</option>${(payload.backgroundBrowser?.kinds||[]).map(kind=>`<option value="${kind}">${kind}</option>`).join('')}</select><select id="backgroundView" aria-label="Background browser view"><option value="list">List</option><option value="thumbnails">Thumbnails</option></select></div><div id="backgrounds" role="list" aria-label="Stage background stack"></div><div id="backgroundContext" class="browser-context" hidden></div><div class="separator"></div><h3>Stage services</h3><div id="services"></div><div class="separator"></div><h3>Validation</h3><div id="issues"></div></aside>
  <main class="canvas-wrap" id="viewport"><div class="canvas-pan" id="pan"><canvas id="canvas"></canvas></div><div class="compare" id="comparePanel" role="dialog" aria-modal="true" aria-labelledby="compareTitle" aria-hidden="true"><div class="guide"><b id="compareTitle">Stage comparison</b><button id="closeCompare">Close</button></div><p class="small">Captures stay in this editor session and are never written to disk.</p><div class="compare-grid"><div><h3>Capture A</h3><img id="imageA" alt="Stage comparison capture A"></div><div><h3>Capture B</h3><img id="imageB" alt="Stage comparison capture B"></div></div></div></main>
  <aside class="side right"><h2>Selected element</h2><div id="inspector"></div><button id="source">Open source line</button><div class="separator"></div><h3>Preview position</h3><div class="row"><label for="startX">Start X</label><input id="startX" type="number" step="1"></div><div class="row"><label for="startY">Start Y</label><input id="startY" type="number" step="1"></div><textarea id="patch" class="patch" aria-label="Generated stage position patch" readonly></textarea><div class="guide"><button id="copy">Copy patch</button><button id="apply">Apply reviewed position</button><button id="applySelected">Apply selected positions</button><button id="discard">Discard preview</button></div><p class="small">Drag one background, or Ctrl/Command/Shift-select several browser rows and drag them together. Apply selected positions commits one reviewed, undoable transaction.</p><div class="separator"></div><details ${payload.experience.guidanceOpen ? 'open' : ''}><summary><b>What am I editing?</b></summary><p class="small"><b>${payload.experience.title}.</b> ${payload.experience.guidance}</p></details><details><summary><b>Stage Rig controls</b></summary><div class="row"><label for="rigSpeed">Normal speed</label><input class="compact" id="rigSpeed" type="number" min="0.1" max="100" step="0.1" value="${payload.rig.speed}"></div><div class="row"><label for="rigFine">Fine speed</label><input class="compact" id="rigFine" type="number" min="0.05" max="100" step="0.05" value="${payload.rig.fineSpeed}"></div><div class="row"><label for="rigFast">Fast speed</label><input class="compact" id="rigFast" type="number" min="0.1" max="100" step="0.5" value="${payload.rig.fastSpeed}"></div><p id="stageRigReason" class="small" role="status" aria-live="polite"></p><p class="small">Directions: P1 · D+directions: P2 · W+directions: both/reversed<br>X/Y: fine/fast · A/B/C: reset P1/P2/both<br>A+B: stress presets · X+Y: auto sweep · Z: lock X/Y/both · A+C: markers<br>B+C: measurements/info · Y+Z: bottom button guide<br>Pause key: pause/resume · Scroll Lock: single frame. Set either visibility toggle before native Pause; the paused inspection remains unobstructed.</p><button id="stageRigPanel" aria-describedby="stageRigReason">Launch with these speeds</button></details></aside>
  <div class="status" id="status" role="status" aria-live="polite"></div></div>
  <script>
  const vscode=acquireVsCodeApi(),data=${safeJson(payload)},model=data.model,post=(type,fields={})=>vscode.postMessage({type,generation:data.generation,...fields}),canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d'),viewport=document.getElementById('viewport'),pan=document.getElementById('pan'),stageComparisonState=(${stageComparisonAvailability.toString()}),stageRigState=(${stageRigControlAvailability.toString()}),stagePreviewSelectionState=(${stagePreviewSelectionAvailability.toString()}),stageFitScale=(${stagePreviewFitScale.toString()});
  document.getElementById('source').textContent='Open exact block native';document.getElementById('source').insertAdjacentHTML('afterend','<div class="guide" style="margin-top:5px"><button id="editPreferred" title="Uses the saved Native / Integrated / Ask coding preference">Edit selected source</button><button id="assetSprite" data-ikemen-destination="sff" disabled>Open sprite in SFF</button><button id="assetAction" data-ikemen-destination="stage" disabled>Open embedded action</button></div><p class="small">Source editing follows the optional Native / Integrated / Ask preference. Asset buttons navigate to the exact authored destination.</p>');document.getElementById('source').dataset.ikemenDestination='stage';
  document.getElementById('applySelected').insertAdjacentHTML('afterend','<details id="stageArrange"><summary>Arrange selected backgrounds</summary><div class="row"><span>Snap grid</span><input id="stageSnap" type="number" min="0" step="1" value="1" aria-label="Stage background snap grid; zero disables snapping"></div><div class="guide"><button data-stage-align="left">Left</button><button data-stage-align="center-x">Center X</button><button data-stage-align="right">Right</button><button data-stage-align="top">Top</button><button data-stage-align="center-y">Center Y</button><button data-stage-align="bottom">Bottom</button><button data-stage-distribute="x">Distribute X</button><button data-stage-distribute="y">Distribute Y</button></div><p class="small">Alignment uses the focused background as the anchor. Distribution needs three visible selections.</p></details>');
  const images={},visible={[-1]:true,0:true,1:true},locked=new Set(),savedView=vscode.getState();let selected=Number.isInteger(data.selected)?data.selected:0,selectedSet=new Set(Array.isArray(data.selectedIndices)&&data.selectedIndices.length?data.selectedIndices:[selected]),selectionAnchor=Number.isInteger(data.selectionAnchor)?data.selectionAnchor:selected,viewScale=1,panX=0,panY=0,guides=true,drag=null,previewStarts=Array.isArray(data.previewStarts)&&data.previewStarts.length===model.backgrounds.length?data.previewStarts.map(x=>[Number(x[0])||0,Number(x[1])||0]):model.backgrounds.map(x=>[...x.start]),draftStoreOk=true,bounds=[],captureA='',captureB='',sweepTimer=null,sweepDirection=1;
  if(savedView&&savedView.filename===data.filename&&savedView.sourceHash===data.sourceHash){for(const index of Array.isArray(savedView.previewHidden)?savedView.previewHidden:[])if(Number.isInteger(index)&&index>=0&&index<model.backgrounds.length)model.backgrounds[index].hidden=true;for(const index of Array.isArray(savedView.editorLocks)?savedView.editorLocks:[])if(Number.isInteger(index)&&index>=0&&index<model.backgrounds.length)locked.add(index)}
  function saveView(){vscode.setState({filename:data.filename,sourceHash:data.sourceHash,previewHidden:model.backgrounds.map((item,index)=>item.hidden?index:-1).filter(index=>index>=0),editorLocks:[...locked]})}
  const previewDirty=()=>previewStarts.some((start,index)=>start[0]!==model.backgrounds[index].start[0]||start[1]!==model.backgrounds[index].start[1]);globalThis.ikemenHasUnappliedForms=previewDirty;globalThis.ikemenCanKeepDraft=()=>previewDirty()&&draftStoreOk;globalThis.ikemenIsBusy=()=>false;window.addEventListener('message',event=>{if(event.data.type==='stageDraftStoreStatus')draftStoreOk=event.data.ok===true});
  canvas.width=model.localCoord[0];canvas.height=model.localCoord[1];canvas.tabIndex=0;canvas.setAttribute('aria-label','Stage background canvas. Click to select, Ctrl or Command-click to toggle, Shift-click for a range, and use arrow keys to nudge selected backgrounds.');document.getElementById('title').textContent=model.name;document.getElementById('coord').textContent=model.localCoord.join(' × ');
  for(const [key,src] of Object.entries(data.images)){const image=new Image();image.onload=render;image.src=src;images[key]=image}
  const cameraX=document.getElementById('cameraX'),cameraY=document.getElementById('cameraY'),cameraZoom=document.getElementById('cameraZoom');cameraX.min=model.camera.bounds[0];cameraX.max=model.camera.bounds[1];cameraX.step=1;cameraX.value=model.camera.start[0];cameraY.min=model.camera.bounds[2];cameraY.max=model.camera.bounds[3];cameraY.step=1;cameraY.value=model.camera.start[1];cameraZoom.min=Math.min(.1,model.camera.zoom[1]);cameraZoom.max=Math.max(2,model.camera.zoom[2]);cameraZoom.value=model.camera.zoom[0];
  function fit(){viewScale=stageFitScale(viewport.clientWidth,viewport.clientHeight,canvas.width,canvas.height,30);panX=panY=0;transform()}
  function transform(){pan.style.transform='translate(calc(-50% + '+panX+'px),calc(-50% + '+panY+'px)) scale('+viewScale+')';document.getElementById('status').textContent='View '+Math.round(viewScale*100)+'% | camera '+cameraX.value+', '+cameraY.value+' | zoom '+Number(cameraZoom.value).toFixed(2)+' | Direct save · backups '+(data.mutation.backups?'on':'off')+' · history '+(data.mutation.history?'on':'off')+' | '+pathLabel();render()}
  function pathLabel(){return data.fileLabel+(data.sffError?' | SFF unavailable; see validation details':'')}
  function art(item){const frame=item.action!==null&&data.animations[item.action],ref=item.sprite||(frame&&frame.sprite),key=ref&&ref.join(',');return{frame,ref,key,image:key&&images[key],info:key&&data.spriteInfo[key]}}
  function bgScreen(item,index){const start=previewStarts[index],asset=art(item),offset=asset.frame?asset.frame.offset:[0,0],info=asset.info;const hidden=item.hidden?10000000:0;const x=hidden+model.localCoord[0]/2+start[0]+offset[0]-Number(cameraX.value)*item.delta[0]-(info?info.axisX:0);const y=hidden+model.stageInfo.zOffset+start[1]+offset[1]-Number(cameraY.value)*item.delta[1]-(info?info.axisY:0);return{x,y,info}}
  function stageTransform(){const z=Number(cameraZoom.value),anchor=model.camera.zoomAnchor==='bottom'?[model.localCoord[0]/2,model.stageInfo.zOffset]:[model.localCoord[0]/2,model.localCoord[1]/2];ctx.translate(anchor[0],anchor[1]);ctx.scale(z,z);ctx.translate(-anchor[0],-anchor[1])}
  function drawParallax(image,x,y,item,shape,scaleX,scaleY){const h=image.height*scaleY,top=shape.top*scaleX,bottom=shape.bottom*scaleX,slices=Math.min(image.height,180);for(let row=0;row<slices;row++){const t=row/slices,next=(row+1)/slices,w=top+(bottom-top)*t,w2=top+(bottom-top)*next,dy=y+h*t,dh=Math.max(1,h/slices+1);ctx.drawImage(image,0,image.height*t,image.width,image.height/slices,x+(top-w)/2,dy,Math.max(w,w2),dh)}ctx.strokeStyle=selectedSet.has(item.order)?'#38d5d5':'rgba(255,204,84,.7)';ctx.strokeRect(x,y,top,h);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(top-bottom)/2,y+h);ctx.lineTo(x+(top+bottom)/2,y+h);ctx.lineTo(x+top,y);ctx.stroke();bounds[item.order]={x:x-Math.max(0,bottom-top)/2,y,w:Math.max(top,bottom),h}}
  function drawNormal(image,p,item,index,sx,sy){const w=image.width*sx,h=image.height*sy,stepX=w+(item.tileSpacing[0]||0),stepY=h+(item.tileSpacing[1]||0),xs=item.tile[0]?[-2,-1,0,1,2]:[0],ys=item.tile[1]?[-2,-1,0,1,2]:[0];for(const tx of xs)for(const ty of ys)ctx.drawImage(image,p.x+tx*stepX,p.y+ty*stepY,w,h);if(selectedSet.has(index)){ctx.strokeStyle='#38d5d5';ctx.lineWidth=2;ctx.strokeRect(p.x,p.y,w,h)}bounds[index]={x:p.x,y:p.y,w,h}}
  function render(){ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#28112c';ctx.fillRect(0,0,canvas.width,canvas.height);stageTransform();bounds=[];for(const layer of [-1,0,1])for(let i=0;i<model.backgrounds.length;i++){const item=model.backgrounds[i];if(item.layer!==layer||!visible[layer]||item.hidden)continue;const asset=art(item),image=asset.image,p=bgScreen(item,i);if(!image||!image.complete)continue;const sx=item.scaleStart[0],sy=item.scaleStart[1];ctx.save();ctx.globalAlpha=item.trans==='addalpha'?Math.max(0,Math.min(1,item.alpha[0]/256)):1;ctx.translate(p.x,p.y);if(item.angle)ctx.rotate(item.angle*Math.PI/180);ctx.transform(1,0,item.xShear,1,0,0);ctx.translate(-p.x,-p.y);if(item.type==='parallax'&&item.parallax)drawParallax(image,p.x,p.y,item,item.parallax,sx,sy);else drawNormal(image,p,item,i,sx,sy);ctx.restore();if(item.window){ctx.save();ctx.strokeStyle=selectedSet.has(i)?'#ffcc54':'rgba(255,204,84,.55)';ctx.setLineDash([6,4]);ctx.strokeRect(item.window[0],item.window[1],item.window[2]-item.window[0],item.window[3]-item.window[1]);ctx.restore()}}if(guides)drawGuides();ctx.restore();syncArrangeAvailability()}
  function drawGuides(){ctx.save();ctx.lineWidth=1;ctx.setLineDash([7,5]);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.strokeRect(0,0,model.localCoord[0],model.localCoord[1]);ctx.strokeStyle='#ffcc54';ctx.beginPath();ctx.moveTo(0,model.stageInfo.zOffset);ctx.lineTo(model.localCoord[0],model.stageInfo.zOffset);ctx.stroke();const cx=model.localCoord[0]/2-Number(cameraX.value);ctx.strokeStyle='#ff6b6b';ctx.strokeRect(cx+model.camera.bounds[0],model.camera.bounds[2],model.camera.bounds[1]-model.camera.bounds[0],model.localCoord[1]-model.camera.bounds[2]);ctx.setLineDash([]);ctx.font='11px sans-serif';for(const p of model.playerStarts.slice(0,8)){const x=model.localCoord[0]/2+p.x-Number(cameraX.value),y=model.stageInfo.zOffset+p.y;ctx.fillStyle=p.player<=2?'#ffffff':'#9aa5b1';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillText('P'+p.player,x+8,y-4)}ctx.restore()}
  function chooseBackground(index,event={}){const mode=event.shiftKey?'range':event.ctrlKey||event.metaKey?'toggle':'replace';if(mode==='range'){selectedSet.clear();const low=Math.min(selectionAnchor,index),high=Math.max(selectionAnchor,index);for(let i=low;i<=high;i++)selectedSet.add(i)}else if(mode==='toggle'){if(selectedSet.has(index)&&selectedSet.size>1)selectedSet.delete(index);else selectedSet.add(index);selectionAnchor=index}else{selectedSet=new Set([index]);selectionAnchor=index}selected=selectedSet.has(index)?index:[...selectedSet].at(-1);post('browserSelectionIntent',{selected:index,mode});list();inspect();render()}
  let backgroundContextOpener=null,backgroundContextIndex=-1;
  function closeBackgroundContext(restore=false){const menu=document.getElementById('backgroundContext');menu.hidden=true;if(restore){const fallback=document.querySelector('#backgrounds [data-stage-index="'+backgroundContextIndex+'"]');(backgroundContextOpener?.isConnected?backgroundContextOpener:fallback)?.focus?.()}}
  function handleBackgroundContextKey(event){const menu=document.getElementById('backgroundContext'),items=[...menu.querySelectorAll('[role=menuitem]')],current=Math.max(0,items.indexOf(document.activeElement));let target=-1;if(event.key==='ArrowDown')target=(current+1)%items.length;else if(event.key==='ArrowUp')target=(current-1+items.length)%items.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=items.length-1;else if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();closeBackgroundContext(true);return}if(target>=0){event.preventDefault();items[target]?.focus()}}
  function dismissBackgroundContextFromPointer(event){const menu=document.getElementById('backgroundContext');if(!menu.contains(event.target))closeBackgroundContext()}
  function openBackgroundContext(browserRow,x,y,opener=null){
    const menu=document.getElementById('backgroundContext'),index=browserRow.ordinal,item=model.backgrounds[index],local=[{id:'preview',label:(item.hidden?'Show':'Hide')+' in preview (H)'},{id:'lock',label:(locked.has(index)?'Unlock':'Lock')+' editor movement (L)'}];
    backgroundContextOpener=opener||document.activeElement;backgroundContextIndex=index;menu.setAttribute('role','menu');menu.innerHTML=local.map(action=>'<button role="menuitem" data-local="'+action.id+'">'+escapeHtml(action.label)+'</button>').join('')+browserRow.actions.map(action=>'<button role="menuitem" data-action="'+action.id+'">'+escapeHtml(action.label)+'</button>').join('');menu.style.left=Math.min(Math.max(0,x),innerWidth-190)+'px';menu.style.top=Math.min(Math.max(0,y),innerHeight-150)+'px';menu.hidden=false;menu.onkeydown=handleBackgroundContextKey;menu.querySelector('[data-local=preview]').onclick=()=>{closeBackgroundContext();item.hidden=!item.hidden;saveView();list();render();closeBackgroundContext(true)};menu.querySelector('[data-local=lock]').onclick=()=>{closeBackgroundContext();locked.has(index)?locked.delete(index):locked.add(index);saveView();list();inspect();render();closeBackgroundContext(true)};menu.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{closeBackgroundContext(true);post('visualBrowserAction',{binding:data.backgroundBrowser.binding,rowId:browserRow.id,actionId:button.dataset.action})});menu.querySelector('button')?.focus()
  }
  function list(){const host=document.getElementById('backgrounds'),filter=document.getElementById('backgroundFilter'),kindControl=document.getElementById('backgroundKind'),viewControl=document.getElementById('backgroundView'),query=String(filter?.value||'').trim().toLowerCase(),kind=String(kindControl?.value||''),view=String(viewControl?.value||'list'),rows=(data.backgroundBrowser?.rows||[]).filter(row=>(!kind||row.kind===kind)&&(!query||(row.label+' '+row.description+' '+row.kind).toLowerCase().includes(query))),rowByOrdinal=new Map((data.backgroundBrowser?.rows||[]).map(row=>[row.ordinal,row]));host.className=view;host.innerHTML='';for(const browserRow of rows){const index=browserRow.ordinal,item=model.backgrounds[index],row=document.createElement('div'),thumb=browserRow.thumbnailKey&&data.images[browserRow.thumbnailKey];if(!item)continue;row.className='bg'+(selectedSet.has(index)?' selected':'');row.dataset.stageIndex=String(index);row.tabIndex=0;row.draggable=!locked.has(index);row.setAttribute('role','listitem');row.setAttribute('aria-label',item.name+', '+browserRow.description+(selectedSet.has(index)?', selected':'')+(locked.has(index)?', editor movement locked':''));row.innerHTML='<input type="checkbox" title="Show this background in the editor preview" aria-label="Show '+escapeHtml(item.name)+' in preview" checked>'+(view==='thumbnails'?(thumb?'<img class="bg-thumb" src="'+thumb+'" alt="">':'<div class="bg-thumb"></div>'):'')+'<div><b>'+escapeHtml(item.name)+'</b><div class="meta">'+escapeHtml(browserRow.description)+(locked.has(index)?' · editor locked':'')+'</div></div><div class="bg-controls"><span>#'+(index+1)+'</span><button type="button" data-lock title="'+(locked.has(index)?'Unlock editor movement':'Lock editor movement')+'" aria-label="'+(locked.has(index)?'Unlock':'Lock')+' '+escapeHtml(item.name)+'">'+(locked.has(index)?'🔒':'🔓')+'</button></div>';row.querySelector('input').checked=!item.hidden;row.querySelector('input').onchange=e=>{item.hidden=!e.target.checked;saveView();render()};row.querySelector('[data-lock]').onclick=e=>{e.stopPropagation();locked.has(index)?locked.delete(index):locked.add(index);saveView();list();render()};row.onclick=e=>{if(e.target.tagName==='INPUT'||e.target.closest('[data-lock]'))return;chooseBackground(index,e)};row.ondragstart=e=>{if(locked.has(index)){e.preventDefault();return}if(!selectedSet.has(index))chooseBackground(index,e);const rowIds=[...selectedSet].filter(value=>!locked.has(value)).map(value=>rowByOrdinal.get(value)?.id).filter(Boolean);if(!rowIds.length){e.preventDefault();return}e.dataTransfer.setData('application/x-ikemaker-stage-backgrounds',JSON.stringify({rowIds}));e.dataTransfer.effectAllowed='move'};row.ondragover=e=>{if(!e.dataTransfer.types.includes('application/x-ikemaker-stage-backgrounds'))return;e.preventDefault();row.classList.toggle('drop-before',e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);row.classList.toggle('drop-after',!row.classList.contains('drop-before'))};row.ondragleave=()=>row.classList.remove('drop-before','drop-after');row.ondrop=e=>{const raw=e.dataTransfer.getData('application/x-ikemaker-stage-backgrounds');if(!raw)return;e.preventDefault();row.classList.remove('drop-before','drop-after');let transfer;try{transfer=JSON.parse(raw)}catch(_){return}const placement=e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2?'before':'after';post('stageBackgroundDrop',{binding:data.backgroundBrowser.binding,sourceRowIds:Array.isArray(transfer.rowIds)?transfer.rowIds:[],targetRowId:browserRow.id,placement})};row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseBackground(index,e)}else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const rect=row.getBoundingClientRect();openBackgroundContext(browserRow,rect.left+16,rect.top+16,row)}};row.oncontextmenu=e=>{e.preventDefault();chooseBackground(index,e);openBackgroundContext(browserRow,e.clientX,e.clientY,row)};host.appendChild(row)}if(!rows.length){host.innerHTML='<div class="issue info" role="status">'+(model.backgrounds.length?'No stage backgrounds match this filter. Clear the filter or choose All kinds.':'No stage backgrounds yet. Use Add background to create one.')+'</div>'}services();issues()}
  function services(){
    const host=document.getElementById('services'),items=[];
    items.push(model.attachedChars.length+' attached character(s)');items.push(model.roundDefs.length+' round-swapped stage(s)');items.push(Object.keys(model.constants).length+' stage constant(s)');items.push(model.backgrounds.filter(x=>x.id!==null).length+' BG target ID(s)');items.push(model.controllers.filter(x=>x.sctrlid!==null).length+' controller target ID(s)');
    items.push(data.integration.scans.length+' interaction code file(s) scanned');
    host.innerHTML=items.map(x=>'<div class="row"><span>•</span><span>'+x+'</span></div>').join('');
    if(model.controllers.length){const tick=Number(document.getElementById('timeline').value)||0;host.innerHTML+='<h3>BGCtrl timeline · tick '+tick+'</h3>'+model.controllers.map(x=>'<div class="issue info '+(ctrlActive(x,tick)?'active':'')+'"><b>'+escapeHtml(x.name)+'</b><br>'+escapeHtml(x.type||'unspecified')+' · time '+x.time.join(', ')+' · sctrlid '+(x.sctrlid??'—')+(ctrlActive(x,tick)?'<br><b>Scheduled now</b>':'')+'</div>').join('')}
    if(model.roundDefs.length){host.innerHTML+='<h3>Round stages</h3>'+model.roundDefs.map(x=>'<div class="small">Round '+x.round+': '+escapeHtml(x.path)+'</div>').join('')}
    if(data.integration.scans.length){host.innerHTML+='<h3>Interaction cross-links</h3>'+data.integration.scans.map(x=>'<div class="issue info"><b>'+escapeHtml(x.filename)+'</b><br>BG writes '+x.modifyStageBg.length+' · BGCtrl writes '+x.modifyBgCtrl.length+' · camera/stage writes '+x.modifyStageVar.length+' · constants '+x.stageConstants.length+'</div>').join('')}
  }
  function ctrlActive(item,tick){const start=Number(item.time[0])||0,end=Number(item.time[1])||start,loop=Number(item.time[2])||-1;if(tick<start)return false;if(loop>0)return((tick-start)%loop)<=Math.max(0,end-start);return tick<=end}
  function cameraPreset(value){if(value==='start'){cameraX.value=model.camera.start[0];cameraY.value=model.camera.start[1];cameraZoom.value=model.camera.zoom[0]}if(value==='left')cameraX.value=model.camera.bounds[0];if(value==='right')cameraX.value=model.camera.bounds[1];if(value==='high')cameraY.value=model.camera.bounds[2];if(value==='low')cameraY.value=model.camera.bounds[3];if(value==='wide')cameraZoom.value=model.camera.zoom[1];if(value==='tight')cameraZoom.value=model.camera.zoom[2];render()}
  function toggleSweep(){const button=document.getElementById('previewSweep');if(sweepTimer){clearInterval(sweepTimer);sweepTimer=null;button.classList.remove('active');button.textContent='Sweep';button.setAttribute('aria-pressed','false');return}button.classList.add('active');button.textContent='Stop sweep';button.setAttribute('aria-pressed','true');sweepTimer=setInterval(()=>{let x=Number(cameraX.value)+sweepDirection*Math.max(1,(model.camera.bounds[1]-model.camera.bounds[0])/180);if(x>=model.camera.bounds[1]){x=model.camera.bounds[1];sweepDirection=-1}if(x<=model.camera.bounds[0]){x=model.camera.bounds[0];sweepDirection=1}cameraX.value=x;render()},16)}
  function updateCompareAvailability(){const button=document.getElementById('compare'),state=stageComparisonState(captureA,captureB);button.disabled=state.disabled;button.title=state.reason;button.setAttribute('aria-description',state.reason)}
  function capture(slot){render();const value=canvas.toDataURL('image/png');if(slot==='A')captureA=value;else captureB=value;document.getElementById('image'+slot).src=value;document.getElementById('status').textContent='Captured comparison '+slot+' in memory. '+pathLabel();updateCompareAvailability()}
  function closeCompare(){const panel=document.getElementById('comparePanel');panel.classList.remove('open');panel.setAttribute('aria-hidden','true');document.getElementById('compare').focus()}
  function showCompare(){if(!captureA||!captureB){updateCompareAvailability();return}document.getElementById('imageA').src=captureA;document.getElementById('imageB').src=captureB;const panel=document.getElementById('comparePanel');panel.classList.add('open');panel.setAttribute('aria-hidden','false');document.getElementById('closeCompare').focus()}
  function issues(){document.getElementById('issues').innerHTML=data.issues.length?data.issues.map(x=>'<div class="issue '+x.severity+'"><b>'+x.severity.toUpperCase()+'</b><br>'+escapeHtml(x.message)+'</div>').join(''):'<div class="issue info">No model-level issues found.</div>'}
  function syncPreviewAvailability(){const item=model.backgrounds[selected],isDirty=index=>Boolean(previewStarts[index]&&model.backgrounds[index])&&(previewStarts[index][0]!==model.backgrounds[index].start[0]||previewStarts[index][1]!==model.backgrounds[index].start[1]),currentDirty=Boolean(item)&&isDirty(selected),selectionDirty=Boolean(item)&&[...selectedSet].some(isDirty),state=stagePreviewSelectionState({hasSelection:Boolean(item),currentDirty,selectionDirty,selectionCount:selectedSet.size});for(const id of ['startX','startY']){const control=document.getElementById(id);control.disabled=state.positionDisabled;control.title=state.selectionReason}const patchOutput=document.getElementById('patch');patchOutput.disabled=state.positionDisabled;patchOutput.title=state.selectionReason;for(const [id,disabled,reason] of [['copy',state.copyDisabled,state.selectionReason],['apply',state.applyDisabled,state.currentDirtyReason],['discard',state.discardDisabled,state.selectionDirtyReason],['applySelected',state.applySelectedDisabled,state.applySelectedReason]]){const control=document.getElementById(id);control.disabled=disabled;control.title=reason}return state}
  function inspect(){
    const item=model.backgrounds[selected];
    const selectionControls=['duplicateBg','removeBg','inheritStageProperties','saveStageComponent','source','editPreferred','copy','apply','discard'];
    for(const id of selectionControls){const control=document.getElementById(id);if(!control)continue;control.disabled=!item;if(!item)control.title='Add or select a stage background to enable this action.';else if(control.title==='Add or select a stage background to enable this action.')control.removeAttribute('title')}
    if(!item){document.getElementById('assetSprite').disabled=true;document.getElementById('assetSprite').title='Add or select a stage background to open its sprite.';document.getElementById('assetAction').disabled=true;document.getElementById('assetAction').title='Add or select a stage background to open its embedded action.';document.getElementById('inspector').textContent='No background elements. Add a background to begin.';document.getElementById('startX').value='';document.getElementById('startY').value='';document.getElementById('patch').value='';syncPreviewAvailability();return}
    const rows=[['Type',item.type],['Source line',item.line+1],['Sprite / anim',item.sprite?item.sprite.join(','):'Action '+item.action],['Layer',item.layer],['ID',item.id??'—'],['SctrlId',item.sctrlid??'—'],['Delta',item.delta.join(', ')],['Scale',item.scaleStart.join(', ')],['Zoom delta',item.zoomDelta.join(', ')],['Velocity',item.velocity.join(', ')],['Window',item.window?item.window.join(', '):'—'],['Projection',item.projection]];
    if(item.parallax){
      rows.push(['Parallax form',item.parallax.mode],['Top width',Math.round(item.parallax.top*100)/100],['Bottom width',Math.round(item.parallax.bottom*100)/100],['Auto resize',item.autoResizeParallax?'Yes':'No']);
      if(item.parallaxAnalysis)rows.push(['Camera sweep',item.parallaxAnalysis.coverage],['Failing samples',item.parallaxAnalysis.failing],['Largest gap',Math.round(item.parallaxAnalysis.maxGap*100)/100]);
    }
    document.getElementById('inspector').innerHTML=rows.map(x=>'<div class="row"><span>'+x[0]+'</span><span class="value">'+escapeHtml(String(x[1]))+'</span></div>').join('')+(item.parallaxAnalysis?'<p class="small">'+escapeHtml(item.parallaxAnalysis.note)+'</p>':'');
    const spriteButton=document.getElementById('assetSprite'),actionButton=document.getElementById('assetAction');spriteButton.disabled=!item.assetSprite||!data.sffPath||Boolean(data.sffError);spriteButton.title=!item.assetSprite?'This background has no resolvable sprite.':!data.sffPath?'No stage SFF is assigned.':data.sffError?'The assigned stage SFF is unavailable: '+data.sffError:'Open sprite '+item.assetSprite.join(',')+' in '+data.sffPath;actionButton.disabled=item.actionLine===null;actionButton.title=item.actionLine===null?'This background does not use an embedded Begin Action.':'Open Begin Action '+item.action+' in the stage DEF';
    document.getElementById('startX').value=previewStarts[selected][0];document.getElementById('startY').value=previewStarts[selected][1];patch();syncPreviewAvailability()
  }
  function patch(){const item=model.backgrounds[selected],s=previewStarts[selected];document.getElementById('patch').value='[BG '+item.name+']\\nstart = '+round(s[0])+', '+round(s[1])}
  function savePreviewDraft(){post('previewDraft',{selected,previewStarts:previewStarts.map(x=>[Number(x[0])||0,Number(x[1])||0])})}function setStart(){previewStarts[selected]=[Number(document.getElementById('startX').value)||0,Number(document.getElementById('startY').value)||0];patch();render();savePreviewDraft()}
  function escapeHtml(x){return x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function round(x){return Math.round(x*1000)/1000}function snapped(x){const step=Math.max(0,Number(document.getElementById('stageSnap')?.value)||0);return step?Math.round(x/step)*step:round(x)}
  function arrangeEdge(box,mode){if(mode==='left')return box.x;if(mode==='right')return box.x+box.w;if(mode==='top')return box.y;if(mode==='bottom')return box.y+box.h;if(mode==='center-x')return box.x+box.w/2;return box.y+box.h/2}
  function alignSelected(mode){const indices=[...selectedSet].filter(index=>bounds[index]);if(indices.length<2||!bounds[selected])return;const horizontal=['left','center-x','right'].includes(mode),target=arrangeEdge(bounds[selected],mode);for(const index of indices){const delta=target-arrangeEdge(bounds[index],mode);previewStarts[index][horizontal?0:1]=snapped(previewStarts[index][horizontal?0:1]+delta)}inspect();render();savePreviewDraft()}
  function distributeSelected(axis){const indices=[...selectedSet].filter(index=>bounds[index]);if(indices.length<3)return;const horizontal=axis==='x',center=index=>horizontal?bounds[index].x+bounds[index].w/2:bounds[index].y+bounds[index].h/2;indices.sort((a,b)=>center(a)-center(b));const first=center(indices[0]),last=center(indices.at(-1)),step=(last-first)/(indices.length-1);indices.forEach((index,slot)=>{const delta=first+step*slot-center(index);previewStarts[index][horizontal?0:1]=snapped(previewStarts[index][horizontal?0:1]+delta)});inspect();render();savePreviewDraft()}
  function syncArrangeAvailability(){const rendered=[...selectedSet].filter(index=>bounds[index]),alignReady=rendered.length>=2&&Boolean(bounds[selected]),distributeReady=rendered.length>=3;for(const button of document.querySelectorAll('[data-stage-align]')){button.disabled=!alignReady;button.title=alignReady?'Align the rendered selection to the focused background.':selectedSet.size<2?'Select at least two stage backgrounds to align them.':'Wait for at least two selected backgrounds to finish rendering.'}for(const button of document.querySelectorAll('[data-stage-distribute]')){button.disabled=!distributeReady;button.title=distributeReady?'Distribute the rendered selection evenly.':selectedSet.size<3?'Select at least three stage backgrounds to distribute them.':'Wait for at least three selected backgrounds to finish rendering.'}}
  document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{const layer=Number(button.dataset.layer);visible[layer]=!visible[layer];button.classList.toggle('active',visible[layer]);button.setAttribute('aria-pressed',String(visible[layer]));render()});cameraX.oninput=cameraY.oninput=cameraZoom.oninput=render;document.getElementById('cameraPreset').onchange=e=>cameraPreset(e.target.value);document.getElementById('previewSweep').onclick=toggleSweep;document.getElementById('timeline').oninput=e=>{document.getElementById('timelineValue').textContent=e.target.value;services()};document.getElementById('captureA').onclick=()=>capture('A');document.getElementById('captureB').onclick=()=>capture('B');document.getElementById('compare').onclick=showCompare;document.getElementById('closeCompare').onclick=closeCompare;document.getElementById('guides').onclick=e=>{guides=!guides;e.target.classList.toggle('active',guides);e.target.setAttribute('aria-pressed',String(guides));render()};document.getElementById('fit').onclick=fit;document.getElementById('reset').onclick=()=>{cameraX.value=model.camera.start[0];cameraY.value=model.camera.start[1];cameraZoom.value=model.camera.zoom[0];fit()};document.getElementById('startX').oninput=document.getElementById('startY').oninput=setStart;document.getElementById('discard').onclick=()=>{for(const index of selectedSet)previewStarts[index]=[...model.backgrounds[index].start];inspect();render();savePreviewDraft()};document.getElementById('copy').onclick=()=>post('copyPatch',{text:document.getElementById('patch').value});document.getElementById('apply').onclick=()=>post('applyStart',{sectionLine:model.backgrounds[selected].line,value:round(previewStarts[selected][0])+', '+round(previewStarts[selected][1]),name:model.backgrounds[selected].name});document.getElementById('applySelected').onclick=()=>post('applyStarts',{entries:[...selectedSet].map(index=>({line:model.backgrounds[index].line,name:model.backgrounds[index].name,value:round(previewStarts[index][0])+', '+round(previewStarts[index][1])}))});updateCompareAvailability();
  document.querySelectorAll('[data-stage-align]').forEach(button=>button.onclick=()=>alignSelected(button.dataset.stageAlign));document.querySelectorAll('[data-stage-distribute]').forEach(button=>button.onclick=()=>distributeSelected(button.dataset.stageDistribute));
  document.getElementById('source').onclick=()=>post('openExactBackground',{selected,reference:globalThis.ikemenNavigationSelection()});document.getElementById('editPreferred').onclick=()=>post('editPreferred',{selected,reference:globalThis.ikemenNavigationSelection()});
  document.getElementById('assetSprite').onclick=()=>{const item=model.backgrounds[selected];if(item&&item.assetSprite)post('openStageSprite',{line:item.line,name:item.name,group:item.assetSprite[0],number:item.assetSprite[1]})};document.getElementById('assetAction').onclick=()=>{const item=model.backgrounds[selected];if(item&&item.actionLine!==null)post('openSource',{line:item.actionLine,navigationSelection:globalThis.ikemenNavigationSelection()})};
  document.getElementById('addBg').onclick=()=>post('addBackground');document.getElementById('layeredPsd').onclick=()=>post('openLayeredPsd');document.getElementById('duplicateBg').onclick=()=>{const item=model.backgrounds[selected];if(item)post('duplicateBackground',{line:item.line,name:item.name})};document.getElementById('removeBg').onclick=()=>{const item=model.backgrounds[selected];if(item)post('removeBackground',{line:item.line,name:item.name})};document.getElementById('inheritStageProperties').onclick=()=>{const item=model.backgrounds[selected];if(item)post('inheritBackgroundProperties',{line:item.line,name:item.name})};document.getElementById('saveStageComponent').onclick=()=>{const item=model.backgrounds[selected];if(item)post('saveStageComponent',{line:item.line,name:item.name})};document.getElementById('insertStageComponent').onclick=()=>post('insertStageComponent');document.getElementById('manageStageComponents').onclick=()=>post('manageStageComponents');
  function currentStageRigValues(){return{speed:Number(document.getElementById('rigSpeed').value),fineSpeed:Number(document.getElementById('rigFine').value),fastSpeed:Number(document.getElementById('rigFast').value)}}function syncStageRigAvailability(){const values=currentStageRigValues(),state=stageRigState(values),reason=document.getElementById('stageRigReason');for(const id of ['stageRig','stageRigPanel']){const button=document.getElementById(id);button.disabled=state.disabled;button.title=state.reason;button.setAttribute('aria-description',state.reason)}reason.textContent=state.disabled?state.reason:'';return{state,values}}function launchRig(){const current=syncStageRigAvailability();if(current.state.disabled){document.getElementById(current.state.invalidId)?.focus();return}post('launchStageRig',current.values)}for(const id of ['rigSpeed','rigFine','rigFast'])document.getElementById(id).addEventListener('input',syncStageRigAvailability);document.getElementById('stageRig').onclick=launchRig;document.getElementById('stageRigPanel').onclick=launchRig;syncStageRigAvailability();
  function stagePointer(e){const rect=canvas.getBoundingClientRect(),rawX=(e.clientX-rect.left)*canvas.width/rect.width,rawY=(e.clientY-rect.top)*canvas.height/rect.height,zoom=Number(cameraZoom.value),anchor=model.camera.zoomAnchor==='bottom'?[model.localCoord[0]/2,model.stageInfo.zOffset]:[model.localCoord[0]/2,model.localCoord[1]/2];return{x:(rawX-anchor[0])/zoom+anchor[0],y:(rawY-anchor[1])/zoom+anchor[1]}}
  canvas.onmousedown=e=>{canvas.focus();const point=stagePointer(e),hit=[...bounds.keys()].reverse().find(index=>{const box=bounds[index];return box&&point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h});if(Number.isInteger(hit))chooseBackground(hit,e);const item=model.backgrounds[selected],starts=[...selectedSet].filter(index=>!locked.has(index)).map(index=>[index,[...previewStarts[index]]]);if(!item||!selectedSet.has(selected)||!starts.length)return;drag={x:e.clientX,y:e.clientY,starts};canvas.classList.add('drag')};canvas.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const amount=e.shiftKey?10:1;for(const index of selectedSet)if(!locked.has(index))previewStarts[index]=[snapped(previewStarts[index][0]+delta[0]*amount),snapped(previewStarts[index][1]+delta[1]*amount)];inspect();render();savePreviewDraft()};window.onmousemove=e=>{if(!drag)return;const rect=canvas.getBoundingClientRect(),zoom=Number(cameraZoom.value),dx=(e.clientX-drag.x)*canvas.width/rect.width/zoom,dy=(e.clientY-drag.y)*canvas.height/rect.height/zoom;for(const [index,start] of drag.starts)previewStarts[index]=[snapped(start[0]+dx),snapped(start[1]+dy)];inspect();render()};window.onmouseup=()=>{if(drag)savePreviewDraft();drag=null;canvas.classList.remove('drag')};viewport.onwheel=e=>{e.preventDefault();viewScale=Math.max(.1,Math.min(6,viewScale*(e.deltaY<0?1.1:.9)));transform()};
  document.getElementById('backgrounds').addEventListener('change',saveView);document.getElementById('backgrounds').addEventListener('click',event=>{if(event.target.closest('[data-lock]'))setTimeout(saveView,0)},true);
  document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea,button,[contenteditable=true]')||!selectedSet.size)return;if(event.key==='h'||event.key==='H'){event.preventDefault();const hide=[...selectedSet].some(index=>!model.backgrounds[index].hidden);for(const index of selectedSet)model.backgrounds[index].hidden=hide;saveView();list();render()}else if(event.key==='l'||event.key==='L'){event.preventDefault();const shouldLock=[...selectedSet].some(index=>!locked.has(index));for(const index of selectedSet)shouldLock?locked.add(index):locked.delete(index);saveView();list();inspect();render()}});
  for(const id of ['backgroundFilter','backgroundKind','backgroundView'])document.getElementById(id).addEventListener(id==='backgroundFilter'?'input':'change',list);
  document.addEventListener('click',dismissBackgroundContextFromPointer);
  document.addEventListener('keydown',event=>{const compareOpen=document.getElementById('comparePanel').classList.contains('open');if(compareOpen&&event.key==='Tab'){event.preventDefault();document.getElementById('closeCompare').focus();return}if(event.key!=='Escape')return;if(compareOpen){event.preventDefault();closeCompare()}else if(!document.getElementById('backgroundContext').hidden){event.preventDefault();closeBackgroundContext(true)}});
  window.onresize=fit;saveView();list();inspect();setTimeout(fit,20);
  </script></body></html>`;
  return page
    .replace('</style>', '.viewer-quick{margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--line)}.viewer-quick-actions{display:flex;flex-wrap:wrap;gap:3px;overflow:visible}.viewer-quick-actions>button{box-sizing:border-box;width:28px;height:27px;padding:0;display:grid;place-items:center}.viewer-selection-nav{display:flex;align-items:center;gap:4px;margin-top:6px}.viewer-selection-nav input{flex:1;min-width:0;padding:0}.viewer-selection-nav button{width:28px;height:28px;padding:0}.viewer-selection-readout{margin-top:4px}.viewer-specialty{margin-top:7px}.viewer-specialty>summary{cursor:pointer}.viewer-specialty>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.viewer-specialty label{display:flex;align-items:center;gap:5px}#stageDirectSelect{width:100%;margin-top:5px}#stageNavCollection{gap:4px;margin-top:5px}.stage-nav-tabs{display:flex;flex-wrap:wrap;overflow:visible}.stage-nav-list{display:grid;grid-template-columns:1fr}.stage-nav-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr))}#stageNavCollection button{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>')
    .replace('<aside class="side left"><h2>Background stack</h2>', '<aside class="side left"><section class="viewer-quick" aria-label="Stage quick access"><div id="stageQuickActions" class="viewer-quick-actions"></div><div class="viewer-selection-nav"><button id="stagePrevious" aria-describedby="stageSelectionReadout" title="Previous background">◀</button><input id="stageBackgroundScroll" type="range" min="0" value="0" step="1" aria-label="Selected stage background" aria-describedby="stageSelectionReadout"><button id="stageNext" aria-describedby="stageSelectionReadout" title="Next background">▶</button></div><select id="stageDirectSelect" aria-label="Choose stage background" aria-describedby="stageSelectionReadout"></select><div id="stageSelectionReadout" class="small viewer-selection-readout" role="status" aria-live="polite"></div><details><summary>Background navigation</summary><div class="guide" role="group" aria-label="Background navigation layout"><button data-stage-nav-mode="tabs" aria-pressed="true">Tabs</button><button data-stage-nav-mode="list" aria-pressed="false" tabindex="-1">List</button><button data-stage-nav-mode="cards" aria-pressed="false" tabindex="-1">Cards</button></div><div id="stageNavCollection" class="stage-nav-tabs" role="listbox" aria-label="Stage backgrounds" aria-describedby="stageSelectionReadout"></div></details><details class="viewer-specialty"><summary>Stage camera and comparison…</summary><div id="stageSpecialtyControls"></div></details></section><h2>Background stack</h2>')
    .replace('</p></details><details><summary><b>Stage Rig controls', `</p>${workflowHtml(workflowFor('stage', { localCoord: payload.model.localCoord, hasSff: Boolean(payload.sffPath), sffError: payload.sffError, backgrounds: payload.model.backgrounds.length, issues: payload.issues }))}</details>${taskRecipesHtml('stage', payload.experience)}${advancedActionBarHtml('stage', payload.experience)}<details><summary><b>Stage Rig controls`)
    .replace('</script></body>', `${require('./stage_navigation').clientScript()}${stageHistoryClientScript()}${workflowClientScript()}${stageQuickControlsClientScript()}${visualHistory.controlsClientScript()}</script><script>${universalToolbarClientScript({vscodeVariable:'vscode'})}${require('./viewer_close').clientScript?.()||''}</script></body>`);
}

function liveDocument(filename) { return (vscode.workspace.textDocuments || []).find(document => !document.isClosed && path.resolve(document.fileName) === path.resolve(filename)) || null; }
function liveStageCapture(owner) {
  if(owner?.invalidated||owner?.disposed)return null;
  const item = findBackground(owner.payload, backgroundReference(owner.payload, owner.selected || 0)), document = liveDocument(owner.filename), text = document ? document.getText() : fs.readFileSync(owner.filename, 'utf8');
  if (!item || hash(text) !== owner.payload.sourceHash) return null;
  return { reference: backgroundReference(owner.payload, owner.selected || 0), filename: owner.filename, uri: document?.uri?.toString?.() || vscode.Uri.file(owner.filename).toString(), version: String(document?.version ?? hash(text)), fingerprint: hash(text), line: item.line };
}
function stageAuthority(owner, requireSelection=true){const context=owner.contextModel?.snapshot?.(),document=liveDocument(owner.filename),text=document?document.getText():fs.readFileSync(owner.filename,'utf8'),capture=requireSelection?liveStageCapture(owner):null,expectedSelection=stageSelection(owner);if(owner.disposed||!owner.panel.active||!context||context.activeSurfaceId!=='stage.workspace'||requireSelection&&(!capture||JSON.stringify(context.selection)!==JSON.stringify(expectedSelection))||!requireSelection&&context.selection!==null&&JSON.stringify(context.selection)!==JSON.stringify(expectedSelection))return null;return{generation:owner.generation,uri:document?.uri?.toString?.()||vscode.Uri.file(owner.filename).toString(),version:String(document?.version??hash(text)),fingerprint:hash(text),reference:capture?.reference||null,contextId:context.identity,contextRevision:context.revision,selectionRevision:context.selectionRevision};}
function assertStageAuthority(owner,authority,requireSelection=true){const fresh=stageAuthority(owner,requireSelection);if(!fresh||JSON.stringify(fresh)!==JSON.stringify(authority))throw new Error('The active stage source or selected background changed before the operation completed. Nothing was changed.');return fresh;}
function stageBrowserMutationAuthority(owner,reference){
  const text=liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8'),authority={generation:owner.generation,filename:path.resolve(owner.filename),fingerprint:hash(text),reference};
  browserMutationAuthorities.add(authority);return authority;
}
function assertStageBrowserMutationAuthority(owner,authority){
  const text=liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8');
  if(!browserMutationAuthorities.has(authority)||owner.disposed||panelOwners.get(owner.panel)!==owner||owner.generation!==authority.generation||path.resolve(owner.filename)!==authority.filename||hash(text)!==authority.fingerprint||hash(text)!==owner.payload.sourceHash||!findBackground(stagePayload(owner.filename,owner.payload.experience,text),authority.reference))throw new Error('The Stage source or contextual background changed before the operation completed. Nothing was changed.');
  return authority;
}
async function applyStageMutation(owner, next, label, authority=stageAuthority(owner,false)) {
  const browserBound=browserMutationAuthorities.has(authority),selectionBound=Boolean(authority?.reference);if(browserBound)assertStageBrowserMutationAuthority(owner,authority);else assertStageAuthority(owner,authority,selectionBound);
  const document = liveDocument(owner.filename), current = document ? document.getText() : fs.readFileSync(owner.filename, 'utf8');
  if (hash(current) !== owner.payload.sourceHash) throw new Error('The stage source changed after this preview. Refresh and try again.');
  owner.history?.prepare(current,next,label);
  if (document?.isDirty) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(current.length)), next);
    if(browserBound)assertStageBrowserMutationAuthority(owner,authority);else assertStageAuthority(owner,authority,selectionBound);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the stage edit. Nothing was changed.');
    owner.history?.record(current,next,label);
    return { dirty: true, backup: '' };
  }
  const result=transactionalWrite(fs, owner.filename, next, mutationOptions(owner.filename, label, { expectedHash: owner.payload.sourceHash }));
  owner.history?.record(current,next,label);
  return result;
}
async function handleStageBrowserClipboardAction(owner,reference,actionId){
  if(owner.busy)return false;
  const current=()=>liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8');
  const resolveTarget=text=>{const target=findBackground(stagePayload(owner.filename,owner.payload.experience,text),reference);if(!target)throw new Error('The selected background is no longer uniquely identifiable.');return target;};
  try{
    const initial=current(),target=resolveTarget(initial);
    if(actionId==='copy-background'){
      stageBackgroundClipboard.set(stageClipboardModel.capture(initial,target.line,{sourceFile:owner.filename}));
      await vscode.window.showInformationMessage(`Copied BG ${target.name} to the in-session IKEMaker BG clipboard.`);return true;
    }
    owner.busy++;await owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});
    const authority=stageBrowserMutationAuthority(owner,reference);let next,label,success,pendingClipboard=null;
    if(actionId==='cut-background'){
      pendingClipboard=stageClipboardModel.capture(initial,target.line,{sourceFile:owner.filename});
      const answer=await vscode.window.showWarningMessage(`Cut BG ${target.name}?`,{modal:true,detail:'The complete BG section, including its comments and properties, will be placed on the in-session IKEMaker BG clipboard. This is one undoable Stage mutation.'},'Cut Background');if(answer!=='Cut Background')return false;
      assertStageBrowserMutationAuthority(owner,authority);const text=current(),fresh=resolveTarget(text);next=stageClipboardModel.remove(text,fresh.line);label='cut-stage-background';success=`Cut BG ${target.name} to the in-session IKEMaker BG clipboard.`;
    }else if(actionId==='duplicate-background'){
      const answer=await vscode.window.showWarningMessage(`Duplicate BG ${target.name}?`,{modal:true,detail:'A collision-safe copy of the complete BG section will be inserted after it as one undoable Stage mutation.'},'Duplicate Background');if(answer!=='Duplicate Background')return false;
      assertStageBrowserMutationAuthority(owner,authority);const text=current(),fresh=resolveTarget(text),result=stageClipboardModel.duplicate(text,fresh.line);next=result.text;label='duplicate-stage-background';success=`Duplicated BG as ${result.identity}.`;
    }else{
      const clipboard=stageBackgroundClipboard.get();if(!clipboard){await vscode.window.showInformationMessage('The in-session IKEMaker BG clipboard is empty. Copy or cut a Stage BG first.');return false;}
      const placement=actionId==='paste-before'?'before':'after',answer=await vscode.window.showWarningMessage(`Paste ${clipboard.sectionName} ${placement} BG ${target.name}?`,{modal:true,detail:'The complete stored BG section will receive a collision-safe name and be inserted as one undoable Stage mutation.'},'Paste Background');if(answer!=='Paste Background')return false;
      assertStageBrowserMutationAuthority(owner,authority);const text=current(),fresh=resolveTarget(text),result=stageClipboardModel.insert(text,fresh.line,clipboard,placement);next=result.text;label=`paste-stage-background-${placement}`;success=`Pasted ${result.identity} ${placement} BG ${target.name}.`;
    }
    await applyStageMutation(owner,next,label,authority);if(pendingClipboard)stageBackgroundClipboard.set(pendingClipboard);await stageDrafts.discard(owner.draftKey);await populate(owner.panel,owner.filename);await vscode.window.showInformationMessage(success);return true;
  }catch(error){await vscode.window.showErrorMessage(`Stage background clipboard: ${error.message}`);return false;}
  finally{owner.busy=Math.max(0,owner.busy-1);if(!owner.disposed){owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});owner.panel.webview.postMessage(visualHistory.stateMessage(owner.history,owner.generation,owner.busy>0));}}
}
async function handleStageBackgroundDrop(owner,message){
  if(owner.busy)return false;
  try{
    const browser=owner.backgroundBrowser?.snapshot?.();if(!browser||message.binding!==browser.binding)return false;
    const rows=new Map(browser.rows.map(row=>[row.id,row])),sourceRows=[...new Set(message.sourceRowIds)].map(id=>rows.get(id)),targetRow=rows.get(message.targetRowId);
    if(sourceRows.some(row=>!row)||!targetRow||sourceRows.some(row=>row.id===targetRow.id))return false;
    const references=sourceRows.map(row=>backgroundReference(owner.payload,row.ordinal)),targetReference=backgroundReference(owner.payload,targetRow.ordinal);if(references.some(reference=>!reference)||!targetReference)return false;
    const text=liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8');if(hash(text)!==owner.payload.sourceHash)throw new Error('The Stage changed. Refresh the background stack and try the drop again.');
    const targets=references.map(reference=>findBackground(owner.payload,reference)),target=findBackground(owner.payload,targetReference);if(targets.some(item=>!item)||!target)return false;
    owner.busy++;await owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});const authority=stageBrowserMutationAuthority(owner,targetReference);
    const answer=await vscode.window.showWarningMessage(`Move ${targets.length} Stage background${targets.length===1?'':'s'} ${message.placement} BG ${target.name}?`,{modal:true,detail:'Complete source sections will move together in their current order. Layer numbers stay unchanged; this changes draw order only where IKEMEN uses source order within a layer. The move is one undoable Stage mutation.'},'Move Backgrounds');if(answer!=='Move Backgrounds')return false;
    assertStageBrowserMutationAuthority(owner,authority);const freshText=liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8'),freshPayload=stagePayload(owner.filename,owner.payload.experience,freshText),freshSources=references.map(reference=>findBackground(freshPayload,reference)),freshTarget=findBackground(freshPayload,targetReference);if(freshSources.some(item=>!item)||!freshTarget)throw new Error('One of the dragged Stage backgrounds changed before the move. Nothing was changed.');
    const next=stageClipboardModel.reorder(freshText,freshSources.map(item=>item.line),freshTarget.line,message.placement);await applyStageMutation(owner,next,'reorder-stage-backgrounds',authority);await stageDrafts.discard(owner.draftKey);await populate(owner.panel,owner.filename);await vscode.window.showInformationMessage(`Moved ${freshSources.length} Stage background${freshSources.length===1?'':'s'} ${message.placement} BG ${freshTarget.name}.`);return true;
  }catch(error){await vscode.window.showErrorMessage(`Could not reorder Stage backgrounds: ${error.message}`);return false;}
  finally{owner.busy=Math.max(0,owner.busy-1);if(!owner.disposed){owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});owner.panel.webview.postMessage(visualHistory.stateMessage(owner.history,owner.generation,owner.busy>0));}}
}
async function finalizeStageClose(owner,accepted,drafts=stageDrafts,api=vscode){if(!accepted||owner.disposed||owner.busy)return false;if(!owner.keepDraftOnClose){try{await drafts.discard(owner.draftKey);}catch(error){await api.window.showWarningMessage(`The stage preview draft could not be discarded, so the workspace was kept open: ${error.message}`);return false;}}if(owner.disposed||owner.busy)return false;owner.panel.dispose();return true;}
function createStageToolbar(owner, services = {}) {
  let exact;const navigation = services.navigation || require('./viewer_navigation'), isCurrent = services.isCurrent || (() => panelOwners.get(owner.panel) === owner && !owner.disposed);
  const requireActive = () => { const context = owner.contextModel?.snapshot?.(); if (!isCurrent() || !owner.panel.active || !context || context.activeSurfaceId !== 'stage.workspace') throw new Error('Stage Workspace is no longer the active authoring surface.'); return context; };
  const exactRegistry=()=>{if(exact)return exact;exact=new ExactSourceRegistry();exact.register({ id: 'stage.exact-background-source', capabilityId: 'implemented.stage-source', surfaceId: 'stage.workspace', resolve: request => {
    const capture = liveStageCapture(owner), context = owner.contextModel?.snapshot?.(), selection = stageSelection(owner);
    if (!capture || !context || !selection) return unavailable('The selected stage background is no longer available.', request);
    if (request.uri !== capture.uri || request.version !== capture.version || request.fingerprint !== capture.fingerprint || JSON.stringify(request.reference) !== JSON.stringify(capture.reference)) return unavailable('The selected stage background changed before opening.', request);
    if (request.contextId !== context.identity || request.contextRevision !== context.revision || request.selectionRevision !== context.selectionRevision || context.activeSurfaceId !== 'stage.workspace' || JSON.stringify(context.selection) !== JSON.stringify(selection)) return unavailable('Stage Workspace no longer owns the active shared selection.', request);
    return { available: true, filename: capture.filename, line: capture.line, identity: 'selected-block', fingerprint: capture.fingerprint, version: capture.version, label: `Selected BG · ${path.basename(capture.filename)}`, access: 'external-editor', mutationOwner: 'native-text-editor', contextId: context.identity, selectionRevision: context.selectionRevision };
  }});return exact;};
  const authorizeExact=async()=>{const capture=liveStageCapture(owner),context=requireActive();if(!capture)return{available:false,reason:'Choose a current stage background first.'};const request={uri:capture.uri,version:capture.version,fingerprint:capture.fingerprint,reference:capture.reference,contextId:context.identity,contextRevision:context.revision,selectionRevision:context.selectionRevision},route=await exactRegistry().resolve('stage.exact-background-source',request),fresh=liveStageCapture(owner),freshContext=requireActive();if(!route.available||!fresh||JSON.stringify(fresh)!==JSON.stringify(capture)||freshContext.revision!==context.revision||freshContext.selectionRevision!==context.selectionRevision)return unavailable(route.reason||'The selected stage background changed immediately before navigation.',request);return{...route,capture};};
  const openExact = async () => { const capture = liveStageCapture(owner), context = requireActive(); if (!capture) return vscode.window.showInformationMessage('Choose a current stage background first.'); const request = { uri:capture.uri,version:capture.version,fingerprint:capture.fingerprint,reference:capture.reference,contextId:context.identity,contextRevision:context.revision,selectionRevision:context.selectionRevision }; const result = await exactRegistry().open('stage.exact-background-source', request, route => {const fresh=liveStageCapture(owner),freshContext=requireActive();if(!fresh||JSON.stringify(fresh)!==JSON.stringify(capture)||freshContext.revision!==context.revision||freshContext.selectionRevision!==context.selectionRevision)throw new Error('The selected stage background changed immediately before navigation. Nothing was opened.');return navigation.openViewerSource(route.filename,route.line,navigation.currentPoint(route.filename,'stage',{navigationSelection:capture.reference},owner.panel));}); if (!result.available) vscode.window.showInformationMessage(result.reason); return result; };
  const execute = (id, seed = true) => async () => { requireActive(); return vscode.commands.executeCommand(id, ...(seed ? [vscode.Uri.file(owner.filename)] : [])); };
  const close = async () => { requireActive();owner.keepDraftOnClose=false;const accepted=await (services.viewerClose||require('./viewer_close')).prepare([owner.panel],vscode);if(!isCurrent())return false;return finalizeStageClose(owner,accepted,stageDrafts,vscode); };
  const save = async () => { requireActive(); const document = liveDocument(owner.filename); if (!document?.isDirty || owner.busy) throw new Error(owner.busy ? 'Wait for the current stage operation to finish.' : 'The stage source has no unsaved native-editor changes.'); owner.busy++; try { await document.save(); } finally { owner.busy--; if (isCurrent()) owner.panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)}); } };
  const connected = async () => { requireActive(); const choices = [{label:path.basename(owner.filename),description:'Stage DEF',filename:owner.filename}]; if (owner.payload.sffPath && !owner.payload.sffError) choices.push({label:path.basename(owner.payload.sffPath),description:'Stage SFF',filename:owner.payload.sffPath,sff:true}); const picked=await vscode.window.showQuickPick(choices,{title:'Stage Workspace — Connected Resources'}); if (!picked) return; requireActive(); return picked.sff ? vscode.commands.executeCommand('sff.openViewer',vscode.Uri.file(picked.filename)) : openExact(); };
  const sprites = async () => { requireActive(); if (!owner.payload.sffPath || owner.payload.sffError) throw new Error('The stage SFF is unavailable.'); return vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(owner.payload.sffPath)); };
  const visualBrowser=async()=>{requireActive();if(!owner.visualBrowserOwnerKey)throw new Error('The Stage visual browser is still attaching.');return visualBrowserService.open('stage',owner.visualBrowserOwnerKey)};
  const handlers={new:execute('ikemen.stage.createNew',false),close,open:execute('workbench.action.files.openFile',false),save,'text-source':openExact,'connected-resources':connected,backup:execute('ikemen.makeBackup'),recovery:execute('ikemen.mutations.openHistory'),run:execute('ikemen.launchGame'),versus:execute('ikemen.launchMirrorCurrent'),training:execute('ikemen.launchTrainingCurrent'),project:execute('ikemen.projectManager.open',false),stage:execute('ikemen.stage.openWorkspace'),sprites,animations:async()=>{},commands:async()=>{},states:async()=>{},sounds:async()=>{},palettes:async()=>{},'code-structure':execute('ikemen.codeStructure.openWorkspace'),'viewer-browser':visualBrowser,'actions-search':execute('ikemen.textActions.open',false),'suite-switch':execute('ikemen.switchToIkeMiner',false),help:execute('ikemen.help.open',false),settings:execute('ikemen.openExtensionSettings',false)};
  return { dispatcher:createUniversalToolbarDispatcher({handlersBySurface:{'stage.workspace':handlers},getToolbar:async()=>stageToolbarModel(owner)}), openExact, authorizeExact };
}

async function populate(panel, filename, options = {}) {
  if (!trackPanel(panel, filename)) return;
  panel.webview.options = { enableScripts: true };
  const document = liveDocument(filename), sourceText = document ? document.getText() : fs.readFileSync(filename, 'utf8');
  if(options.payload&&options.payload.sourceHash!==hash(sourceText))throw new Error('The destination stage changed after switch validation.');
  const payload = options.payload||stagePayload(filename, workspaceExperience('stage', mode('stageUi', vscode.Uri.file(filename))), sourceText), draftKey = `stage-preview:${path.resolve(filename).toLowerCase()}`, recovered = stageDrafts.read(draftKey);
  if (recovered?.sourceHash===payload.sourceHash && Array.isArray(recovered.entries) && recovered.entries.length===payload.model.backgrounds.length && recovered.entries.every((entry,index)=>JSON.stringify(entry.reference)===JSON.stringify(backgroundReference(payload,index))&&Array.isArray(entry.start)&&entry.start.length===2&&entry.start.every(Number.isFinite))) { payload.previewStarts = recovered.entries.map(entry=>entry.start); payload.selected = Math.max(0, Math.min(payload.model.backgrounds.length - 1, Number(recovered.selected) || 0)); }
  let owner = panelOwners.get(panel);
  if (!owner) { owner = { panel, filename:path.resolve(filename), payload, document, selected:payload.selected||0, selectedIndices:[payload.selected||0], selectionAnchor:payload.selected||0, previewStarts:payload.previewStarts, busy:0, disposed:false, draftKey, contextEntry:null, contextModel:null, toolbar:null, history:new visualHistory.VisualWorkspaceHistory(),visualBrowserRegistration:null,visualBrowserOwnerKey:'' }; panelOwners.set(panel, owner); }
  else {
    const resolved=path.resolve(filename),sameSource=!owner.unavailable&&path.resolve(owner.filename)===resolved;
    if(!sameSource){owner.history=new visualHistory.VisualWorkspaceHistory();detachStageBrowser(owner);owner.selectedIndices=[payload.selected||0];owner.selectionAnchor=payload.selected||0;}
    Object.assign(owner,{filename:resolved,payload,document,selected:payload.selected ?? (sameSource?owner.selected:0),previewStarts:Array.isArray(payload.previewStarts)?payload.previewStarts:(sameSource?owner.previewStarts:undefined),draftKey,unavailable:false,entityIdentity:''});
  }
  owner.backgroundBrowser=stageBackgroundBrowser(payload);payload.backgroundBrowser=owner.backgroundBrowser.snapshot();
  owner.generation=(owner.generation||0)+1;owner.invalidated=false;payload.generation=owner.generation;
  normalizeStageBrowserSelection(owner);payload.selected=owner.selected;payload.selectedIndices=owner.selectedIndices.slice();payload.selectionAnchor=owner.selectionAnchor;
  payload.visualHistory=owner.history.state(owner.busy>0);
  const stageFolder=path.dirname(filename),broadStageFolder=path.basename(stageFolder).toLowerCase()==='stages';
  owner.contextEntry = registerAuthoringPanel(panel, { type:'stage', key:path.resolve(filename), label:payload.model.name || path.basename(filename), root:broadStageFolder?'':stageFolder, files:[filename,payload.sffPath&&!payload.sffError&&fs.existsSync(payload.sffPath)?payload.sffPath:''].filter(Boolean) });
  owner.contextModel = authoringContextRegistry.getContextModel(owner.contextEntry);
  attachStageBrowser(owner);
  owner.toolbar = createStageToolbar(owner);
  if (!owner.writerPreferenceAttachment) owner.writerPreferenceAttachment = require('./sff_writer_preference').attach(panel);
  if(typeof panel.webview.postMessage==='function')require('./viewer_navigation').registerSourcePanel(panel,filename);
  if (!owner.lifecycleInstalled) {
    owner.lifecycleInstalled=true;
    require('./viewer_close').support(panel,{isBusy:()=>owner.busy>0,keepDraft:async()=>{if(owner.draftStoreFailed)throw new Error('The latest stage preview draft was not stored.');await stageDrafts.flush();owner.keepDraftOnClose=true;}});
    owner.activation=panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active&&!owner.disposed)claimStage(owner);});
    panel.onDidDispose(()=>{owner.disposed=true;owner.invalidated=true;owner.generation++;clearTimeout(owner.refreshTimer);owner.activation?.dispose?.();owner.writerPreferenceAttachment?.dispose?.();detachStageBrowser(owner);panelOwners.delete(panel);});
  }
  panel.title = `Stage: ${payload.model.name}`;
  panel.webview.html = require('./webview_policy').protect(stageHtml(payload, stageToolbarModel(owner)), panel.webview.cspSource);
  if (panel.active) claimStage(owner);
  await publishStageBrowser(owner);
  const previousHandler = panelMessageHandlers.get(panel);
  if (previousHandler) previousHandler.dispose();
  const generation=owner.generation,receive = async (message) => {
    if(owner.disposed||owner.generation!==generation)return;
    if((message?.type==='sffWriterPreferenceChange'||message?.type==='sffWriterPreferenceReady')
      && await require('./sff_writer_preference').handle(message,vscode))return;
    if(message?.type==='viewerHistoryRestored'&&exactObject(message,['type','requestId','ok'])&&Number.isInteger(message.requestId)&&typeof message.ok==='boolean')return require('./viewer_navigation').acknowledgeRestore(panel,message);
    if(visualHistory.validMessage(message,generation)){
      if(owner.busy)return panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,true));
      owner.busy++;await panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,true));
      try{const result=await owner.history.apply(message.action,{read:async()=>liveDocument(owner.filename)?.getText()??fs.readFileSync(owner.filename,'utf8'),isActive:()=>panelOwners.get(panel)===owner&&!owner.disposed&&panel.active===true&&owner.generation===generation&&Boolean(stageAuthority(owner,false)),write:async(next,label)=>applyStageMutation(owner,next,label,stageAuthority(owner,false))});owner.busy=0;await populate(panel,owner.filename);return result;}catch(error){return vscode.window.showErrorMessage(`Stage ${message.action}: ${error.message}`);}finally{owner.busy=Math.max(0,owner.busy-1);if(!owner.disposed&&owner.generation===generation)panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,false));}
    }
    if (message?.type === MESSAGE_TYPE) { try { return await owner.toolbar.dispatcher.dispatch('stage.workspace',message); } catch (error) { return vscode.window.showInformationMessage(error.message); } }
    if(!validStageMessage(message,owner.generation))return;
    if(message.type==='visualBrowserAction'){
      return routeStageBrowserAction(owner,message.rowId,message.actionId,message.binding);
    }
    if(message.type==='stageBackgroundDrop')return handleStageBackgroundDrop(owner,message);
    if(message.type==='openLayeredPsd'){
      if(panelOwners.get(panel)!==owner||owner.disposed||owner.generation!==generation||panel.active!==true)return;
      if(owner.busy)return panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,true));
      const psdDocument=liveDocument(owner.filename),psdAuthority=stageAuthority(owner,false);if(!psdAuthority)return;
      if(psdDocument?.isDirty)return vscode.window.showInformationMessage('Save or undo the stage DEF changes before importing a Layered PSD so the generated layer plan matches the visible source.');
      if(psdAuthority.fingerprint!==payload.sourceHash)return vscode.window.showInformationMessage('The stage DEF changed after this workspace loaded. Refresh or reopen the Stage Workspace before importing a Layered PSD.');
      owner.busy++;await panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,true));
      try{return await require('./layered_psd_workspace').openLayeredPsdWorkspace({target:'stage',ownerFile:filename,sffPath:payload.sffPath&&!payload.sffError?payload.sffPath:'',targetName:payload.model.name,group:0,startIndex:payload.model.backgrounds.length,targetCanvas:payload.model.localCoord,origin:[-payload.model.localCoord[0]/2,-payload.model.stageInfo.zOffset],isCurrent:()=>{try{assertStageAuthority(owner,psdAuthority,false);return panelOwners.get(panel)===owner&&panel.active===true&&!liveDocument(owner.filename)?.isDirty&&psdAuthority.fingerprint===payload.sourceHash}catch(_){return false}}});}
      catch(error){return vscode.window.showErrorMessage(`Stage Layered PSD: ${error.message}`);}
      finally{owner.busy=Math.max(0,owner.busy-1);if(panelOwners.get(panel)===owner&&!owner.disposed&&owner.generation===generation)await panel.webview.postMessage(visualHistory.stateMessage(owner.history,generation,false));}
    }
    if (message?.type === 'selectionChanged' && message.selected < payload.model.backgrounds.length) return commitStageBrowserSelection(owner,message.selected,'replace');
    if (message?.type === 'browserSelectionIntent' && message.selected < payload.model.backgrounds.length) return commitStageBrowserSelection(owner,message.selected,message.mode);
    if (message?.type === 'previewDraft' && message.selected===owner.selected && message.selected<payload.model.backgrounds.length && message.previewStarts.length === payload.model.backgrounds.length && stageAuthority(owner,true)) {
      const operationGeneration=owner.generation,draftKey=owner.draftKey;owner.previewStarts=message.previewStarts;
      try{
        const clean=message.previewStarts.every((start,index)=>start[0]===payload.model.backgrounds[index].start[0]&&start[1]===payload.model.backgrounds[index].start[1]);
        if(clean)await stageDrafts.discard(draftKey);else await stageDrafts.stage(draftKey,{sourceHash:payload.sourceHash,selected:owner.selected,entries:message.previewStarts.map((start,index)=>({reference:backgroundReference(payload,index),start}))});
        if(owner.disposed||owner.generation!==operationGeneration)return;
        owner.draftStoreFailed=false;await panel.webview.postMessage({type:'stageDraftStoreStatus',ok:true});
      }catch(error){
        if(owner.disposed||owner.generation!==operationGeneration)return;
        owner.draftStoreFailed=true;await panel.webview.postMessage({type:'stageDraftStoreStatus',ok:false});vscode.window.showWarningMessage(`The stage preview remains in this session but could not be stored for reopening: ${error.message}`);
      }return;
    }
    if (message?.type === 'openExactBackground') { const selected=payload.model.backgrounds[owner.selected];if(message.selected!==owner.selected||!selected||message.reference.backgroundName!==selected.name||message.reference.backgroundType!==selected.type)return;return owner.toolbar.openExact(); }
    if (message?.type === 'editPreferred') { const selected=payload.model.backgrounds[owner.selected];if(message.selected!==owner.selected||!selected||message.reference.backgroundName!==selected.name||message.reference.backgroundType!==selected.type)return;const authorized=await owner.toolbar.authorizeExact();if(!authorized.available)return vscode.window.showInformationMessage(authorized.reason);return vscode.commands.executeCommand('ikemen.authoringWorkspace.open',vscode.Uri.file(authorized.filename)); }
    if (message.type === 'launchStageRig') {
      const authority=stageAuthority(owner,true);if(!authority)return;assertStageAuthority(owner,authority,true);
      await launchStageRig(vscode.Uri.file(filename), { speed: message.speed, fineSpeed: message.fineSpeed, fastSpeed: message.fastSpeed });
      return;
    }
    if (message.type === 'openSource') {
      const item=payload.model.backgrounds[owner.selected],ref=message.navigationSelection,authority=stageAuthority(owner,true);if(!item||!authority||ref.backgroundName!==item.name||ref.backgroundType!==item.type||![item.line,item.actionLine].includes(message.line))return;assertStageAuthority(owner,authority,true);await openViewerSource(filename,message.line,currentPoint(filename,'stage',{navigationSelection:{backgroundName:item.name,backgroundType:item.type}},panel));
      return;
    }
    if (message.type === 'openStageSprite') {
      const selected=payload.model.backgrounds[owner.selected],reference=selected?.assetSprite,authority=stageAuthority(owner,true),target=selected&&authority&&reference&&selected.line===message.line&&selected.name===message.name&&reference[0]===message.group&&reference[1]===message.number?{sffPath:payload.sffPath,group:reference[0],number:reference[1],selected}:null;
      if (!target) return vscode.window.showWarningMessage('The selected stage background changed. Refresh the Stage Workspace and choose it again.');
      if (!payload.sffPath || payload.sffError || !fs.existsSync(payload.sffPath)) return vscode.window.showWarningMessage('The stage SFF is not currently available. Review the Stage Workspace validation details.');
      if (!liveStageCapture(owner)) { await populate(panel, filename); return vscode.window.showWarningMessage('The stage changed. The Stage Workspace was refreshed; choose the background again.'); }
      assertStageAuthority(owner,authority,true);await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(target.sffPath), undefined, { group: target.group, number: target.number });
      return;
    }
    if (message.type === 'copyPatch') { const selected=payload.model.backgrounds[owner.selected],start=owner.previewStarts?.[owner.selected]||selected?.start;if(!selected||!start||!stageAuthority(owner,true))return;await vscode.env.clipboard.writeText(`[BG ${selected.name}]\nstart = ${start[0]}, ${start[1]}`); return vscode.window.showInformationMessage('Stage position patch copied.'); }
    if(message.type==='inheritBackgroundProperties'){
      if(owner.busy)return;owner.busy++;try{
        const selected=payload.model.backgrounds[owner.selected],sourceReference=backgroundReference(payload,owner.selected),authority=stageAuthority(owner,true);if(!selected||!sourceReference||!authority||message.line!==selected.line||message.name!==selected.name)return;
        const targetChoices=payload.model.backgrounds.map((item,index)=>({label:`BG ${item.name}`,description:item.type||'background',picked:false,index,reference:backgroundReference(payload,index)})).filter(item=>item.index!==owner.selected);
        if(!targetChoices.length)return vscode.window.showInformationMessage('Add another stage background before inheriting properties.');
        const chosenTargets=await vscode.window.showQuickPick(targetChoices,{title:`Inherit properties from BG ${selected.name}`,placeHolder:'Choose one or more target backgrounds',canPickMany:true});if(!chosenTargets?.length)return;
        assertStageAuthority(owner,authority,true);let text=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),fresh=stagePayload(filename,payload.experience,text),source=findBackground(fresh,sourceReference);if(!source)throw new Error('The source background is no longer uniquely identifiable.');
        const sourceSection=parseDef(text,filename).sections.find(section=>section.name&&section.line===source.line);if(!sourceSection)throw new Error('The source background section no longer exists.');
        const propertyChoices=sourceSection.entries.map(entry=>({label:entry.key,description:entry.value,key:entry.key,picked:['start','delta','tile','mask','trans'].includes(entry.normalized)}));
        const chosenProperties=await vscode.window.showQuickPick(propertyChoices,{title:`Properties from BG ${selected.name}`,placeHolder:'Choose the properties that targets should inherit',canPickMany:true});if(!chosenProperties?.length)return;
        assertStageAuthority(owner,authority,true);const modeChoice=await vscode.window.showQuickPick([{label:'Fill missing only',description:'Keep every property already present on each target.',mode:'missing'},{label:'Overwrite existing',description:'Replace the chosen properties on every target.',mode:'overwrite'}],{title:'Inheritance policy'});if(!modeChoice)return;
        assertStageAuthority(owner,authority,true);text=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8');fresh=stagePayload(filename,payload.experience,text);source=findBackground(fresh,sourceReference);const targets=chosenTargets.map(item=>findBackground(fresh,item.reference));if(!source||targets.some(item=>!item))throw new Error('A selected background changed while the inheritance plan was open.');
        const plan=inheritSectionEntries(text,source.line,targets.map(item=>item.line),chosenProperties.map(item=>item.key),{mode:modeChoice.mode}),summary=batchSummary(plan),confirmation=await vscode.window.showWarningMessage(`Apply inherited Stage properties?`,{modal:true,detail:`Source: BG ${source.name}\nTargets: ${targets.map(item=>`BG ${item.name}`).join(', ')}\nMode: ${modeChoice.label}\n${summary}`},'Apply Inheritance');if(confirmation!=='Apply Inheritance')return;
        assertStageAuthority(owner,authority,true);await applyStageMutation(owner,plan.text,'inherit-stage-background-properties',authority);await stageDrafts.discard(owner.draftKey);await populate(panel,filename);return vscode.window.showInformationMessage(`Stage inheritance applied: ${summary}`);
      }catch(error){return vscode.window.showErrorMessage(`Could not inherit Stage properties: ${error.message}`)}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)})}
    }
    if(message.type==='saveStageComponent'){
      if(owner.busy)return;owner.busy++;try{
        if(!visualComponents)throw new Error('The reusable component library is not initialized.');
        const selected=payload.model.backgrounds[owner.selected],reference=backgroundReference(payload,owner.selected),authority=stageAuthority(owner,true);if(!selected||!authority||message.line!==selected.line||message.name!==selected.name)return;
        const name=await vscode.window.showInputBox({title:'Save Stage BG component',value:selected.name.replace(/^BG\s+/i,''),prompt:'This saves the selected BG properties, not its sprite pixels.',validateInput:value=>value.trim()?undefined:'Enter a reusable component name.'});if(!name)return;
        assertStageAuthority(owner,authority,true);const text=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),fresh=stagePayload(filename,payload.experience,text),target=findBackground(fresh,reference);if(!target)throw new Error('The selected background is no longer uniquely identifiable.');
        const component=visualComponentModel.captureSection(text,target.line,'stage-background',{name:name.trim(),metadata:{sourceFile:path.basename(filename)}}),existing=visualComponents.list('stage-background').find(item=>item.id===component.id);
        if(existing){const replace=await vscode.window.showWarningMessage(`Replace reusable Stage component “${existing.name}”?`,{modal:true,detail:'This changes only the persistent component library. Existing stages are not modified.'},'Replace Component');if(replace!=='Replace Component')return;assertStageAuthority(owner,authority,true)}
        await visualComponents.save(component);return vscode.window.showInformationMessage(`Saved reusable Stage BG component “${component.name}”.`);
      }catch(error){return vscode.window.showErrorMessage(`Could not save Stage component: ${error.message}`)}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)})}
    }
    if(message.type==='insertStageComponent'){
      if(owner.busy)return;owner.busy++;try{
        if(!visualComponents)throw new Error('The reusable component library is not initialized.');
        const authority=stageAuthority(owner,false);if(!authority)return;const components=visualComponents.list('stage-background');if(!components.length)return vscode.window.showInformationMessage('No reusable Stage BG components have been saved yet.');
        const picked=await vscode.window.showQuickPick(components.map(component=>({label:component.name,description:`${component.entries.length} properties`,detail:component.metadata?.sourceFile?`Saved from ${component.metadata.sourceFile}`:'Reusable Stage BG',component})),{title:'Insert reusable Stage BG',placeHolder:'The new BG section receives a collision-safe name.'});if(!picked)return;
        assertStageAuthority(owner,authority,false);const confirmation=await vscode.window.showWarningMessage(`Insert reusable Stage BG “${picked.component.name}”?`,{modal:true,detail:`${picked.component.entries.length} properties will be appended as a new uniquely named BG section. The Stage Workspace mutation history and normal undo path remain active.`},'Insert Component');if(confirmation!=='Insert Component')return;
        assertStageAuthority(owner,authority,false);const text=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),insertion=visualComponentModel.insertSectionComponent(text,picked.component);await applyStageMutation(owner,insertion.text,'insert-stage-bg-component',authority);await stageDrafts.discard(owner.draftKey);await populate(panel,filename);return vscode.window.showInformationMessage(`Inserted ${insertion.identity}.`);
      }catch(error){return vscode.window.showErrorMessage(`Could not insert Stage component: ${error.message}`)}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)})}
    }
    if(message.type==='manageStageComponents'){
      if(owner.busy)return;owner.busy++;try{
        if(!visualComponents)throw new Error('The reusable component library is not initialized.');
        const authority=stageAuthority(owner,false);if(!authority)return;const components=visualComponents.list('stage-background');if(!components.length)return vscode.window.showInformationMessage('No reusable Stage BG components have been saved yet.');
        const picked=await vscode.window.showQuickPick(components.map(component=>({label:component.name,description:`${component.entries.length} properties`,component})),{title:'Manage reusable Stage BG components',placeHolder:'Choose a component to delete from the library.'});if(!picked)return;
        assertStageAuthority(owner,authority,false);const confirmation=await vscode.window.showWarningMessage(`Delete reusable Stage component “${picked.component.name}”?`,{modal:true,detail:'Existing stages that used this component are unchanged.'},'Delete Component');if(confirmation!=='Delete Component')return;
        assertStageAuthority(owner,authority,false);await visualComponents.remove(picked.component.id);return vscode.window.showInformationMessage(`Deleted reusable Stage component “${picked.component.name}”.`);
      }catch(error){return vscode.window.showErrorMessage(`Could not manage Stage components: ${error.message}`)}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)})}
    }
    if (message.type === 'addBackground') {
      if (owner.busy) return; owner.busy++;
      try {const authority=stageAuthority(owner,false);if(!authority)return;
      const namingText=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),suggested=visualComponentModel.uniqueSectionName(parseDef(namingText,filename),`BG Background ${payload.model.backgrounds.length+1}`).replace(/^BG\s+/i,'');
      const name = await vscode.window.showInputBox({ title: 'New background name', value:suggested, validateInput: (value) => value.trim() ? undefined : 'Enter a background name.' }); if (!name) return;
      assertStageAuthority(owner,authority,false);
      const selectedType = await vscode.window.showQuickPick([{ label: 'Normal sprite', value: 'normal' }, { label: 'Animated background', value: 'anim' }, { label: 'Parallax floor or plane', value: 'parallax' }], { title: 'Background type' }); if (!selectedType) return;
      assertStageAuthority(owner,authority,false);
      const reference = selectedType.value === 'anim'
        ? await pickEmbeddedAction(vscode,payload.animations,{title:'Choose embedded action for animated background',value:payload.model.backgrounds[owner.selected]?.action??0})
        : await pickSpriteReference(vscode,payload.sffPath,{title:'Choose stage background sprite',value:payload.model.backgrounds[owner.selected]?.assetSprite?.join(',')||'0,0'}); if (reference === undefined) return;
      try { assertStageAuthority(owner,authority,false);const text = liveDocument(filename)?.getText() ?? fs.readFileSync(filename, 'utf8'), next = appendStageBackground(text, { name, type: selectedType.value, action: reference, sprite: reference }); await applyStageMutation(owner,next,'add-stage-background',authority); await stageDrafts.discard(owner.draftKey); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not add background: ${error.message}`); } return;
      } finally { owner.busy--; if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)}); }
    }
    if (message.type === 'duplicateBackground') {
      if(owner.busy)return;owner.busy++;try{const selected=payload.model.backgrounds[owner.selected],reference=backgroundReference(payload,owner.selected),authority=stageAuthority(owner,true);if(!selected||!authority||message.line!==selected.line||message.name!==selected.name)return;
      const namingText=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),suggested=visualComponentModel.uniqueSectionName(parseDef(namingText,filename),`BG ${selected.name.replace(/^BG\s+/i,'')} Copy`).replace(/^BG\s+/i,'');
      const name = await vscode.window.showInputBox({ title: 'Duplicate background as', value:suggested }); if (!name) return;
      try { assertStageAuthority(owner,authority,true);const text = liveDocument(filename)?.getText() ?? fs.readFileSync(filename, 'utf8'), fresh=stagePayload(filename,payload.experience,text),target=findBackground(fresh,reference);if(!target)throw new Error('The selected background is no longer uniquely identifiable.');const next = duplicateSection(text, target.line, `BG ${name.replace(/^BG\s+/i, '')}`); await applyStageMutation(owner,next,'duplicate-stage-background',authority); await stageDrafts.discard(owner.draftKey); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not duplicate background: ${error.message}`); } return;}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});}
    }
    if (message.type === 'removeBackground') {
      if(owner.busy)return;owner.busy++;try{const selected=payload.model.backgrounds[owner.selected],reference=backgroundReference(payload,owner.selected),authority=stageAuthority(owner,true);if(!selected||!authority||message.line!==selected.line||message.name!==selected.name)return;const answer = await vscode.window.showWarningMessage(`Remove BG ${selected.name}?`, { modal: true, detail: 'This removes the complete background section. Recovery history and configured backups remain active.' }, 'Remove Background'); if (answer !== 'Remove Background') return;
      try { assertStageAuthority(owner,authority,true);const text = liveDocument(filename)?.getText() ?? fs.readFileSync(filename, 'utf8'),fresh=stagePayload(filename,payload.experience,text),target=findBackground(fresh,reference);if(!target)throw new Error('The selected background is no longer uniquely identifiable.');const next = deleteSection(text, target.line); await applyStageMutation(owner,next,'remove-stage-background',authority); await stageDrafts.discard(owner.draftKey); await populate(panel, filename); } catch (error) { vscode.window.showErrorMessage(`Could not remove background: ${error.message}`); } return;}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});}
    }
    if(message.type==='applyStarts'){
      if(owner.busy)return;owner.busy++;try{
        const authority=stageAuthority(owner,false);if(!authority)return;
        const seen=new Set(),planned=[];for(const entry of message.entries){const key=`${entry.line}\u0000${entry.name}`;if(seen.has(key))return;seen.add(key);const index=payload.model.backgrounds.findIndex(item=>item.line===entry.line&&item.name===entry.name);if(index<0)return;planned.push({reference:backgroundReference(payload,index),value:String(entry.value)})}
        const detail=planned.map((entry,index)=>`BG ${findBackground(payload,entry.reference)?.name||index+1}: start = ${entry.value}`).join('\n'),answer=await vscode.window.showWarningMessage(`Apply ${planned.length} selected Stage positions?`,{modal:true,detail:'All selected positions will be written as one undoable transaction.\n\n'+detail},'Apply Selected');if(answer!=='Apply Selected')return;
        assertStageAuthority(owner,authority,false);const text=liveDocument(filename)?.getText()??fs.readFileSync(filename,'utf8'),fresh=stagePayload(filename,payload.experience,text),targets=planned.map(entry=>({target:findBackground(fresh,entry.reference),value:entry.value}));if(targets.some(entry=>!entry.target))throw new Error('A selected background changed while the position review was open.');targets.sort((a,b)=>b.target.line-a.target.line);let next=text;for(const entry of targets)next=setSectionEntry(parseDef(next,filename),entry.target.line,'start',entry.value);
        const result=await applyStageMutation(owner,next,'stage-bg-positions',authority);await stageDrafts.discard(owner.draftKey);await populate(panel,filename);return vscode.window.showInformationMessage(`Updated ${targets.length} Stage background positions.${result.backup?` Backup: ${path.basename(result.backup)}`:''}${result.dirty?' The native document remains unsaved.':''}`);
      }catch(error){return vscode.window.showErrorMessage(`Could not update selected Stage positions: ${error.message}`)}finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)})}
    }
    if (message.type !== 'applyStart') return;
    if(owner.busy)return;owner.busy++;try{const selected=payload.model.backgrounds[owner.selected],reference=backgroundReference(payload,owner.selected),authority=stageAuthority(owner,true);if(!selected||!authority||message.sectionLine!==selected.line||message.name!==selected.name)return;const value=String(message.value||'');if(!/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(value))return;const answer = await vscode.window.showWarningMessage(`Apply Start = ${value} to BG ${selected.name}?`, { modal: true }, 'Apply');
    if (answer !== 'Apply') return;
    try {
      assertStageAuthority(owner,authority,true);const text = liveDocument(filename)?.getText() ?? fs.readFileSync(filename, 'utf8'),fresh=stagePayload(filename,payload.experience,text),target=findBackground(fresh,reference);if(!target)throw new Error('The selected background is no longer uniquely identifiable.');const document = parseDef(text, filename);
      const next = setSectionEntry(document, target.line, 'start', value);
      const result = await applyStageMutation(owner,next,'stage-bg-position',authority); await stageDrafts.discard(owner.draftKey);
      await populate(panel, filename);
      vscode.window.showInformationMessage(`Updated BG ${selected.name} position.${result.backup ? ` Backup: ${path.basename(result.backup)}` : ''}${result.dirty?' The native document remains unsaved.':''}`);
    } catch (error) { vscode.window.showErrorMessage(`Could not update stage position: ${error.message}`); }
    }finally{owner.busy--;if(!owner.disposed)panel.webview.postMessage({type:'stageToolbarState',model:stageToolbarModel(owner)});}
  };
  const handler=panel.webview.onDidReceiveMessage(message=>{const operation=()=>receive(message);owner.queue=(owner.queue||Promise.resolve()).then(operation,operation);return owner.queue;});
  panelMessageHandlers.set(panel, handler);
  require('./entity_switch_runtime').attachEntitySurface(panel,{surfaceId:'stage.workspace',createAdapter:()=>createStageRetargetAdapter(panel)});
  return owner;
}

function stageRetainedState(owner) {
  if(owner?.unavailable)return Object.freeze({unavailable:true,entityIdentity:String(owner.entityIdentity||'')});
  const reference=owner?.payload?backgroundReference(owner.payload,owner.selected||0):null;
  return Object.freeze({ selectedReference:reference, selected:Number(owner?.selected)||0 });
}

function restoreStageRetainedState(payload, state) {
  if(!payload||!state||state.unavailable)return payload;
  const matched=findBackground(payload,state.selectedReference),index=matched?payload.model.backgrounds.indexOf(matched):-1;
  payload.selected=index>=0?index:Math.max(0,Math.min(payload.model.backgrounds.length-1,Number(state.selected)||0));
  return payload;
}

function suspendStagePanel(owner, descriptor, reason, services = {}) {
  owner.invalidated=true;owner.generation=(owner.generation||0)+1;owner.unavailable=true;owner.entityIdentity=String(descriptor?.identity||descriptor?.id||'');
  detachStageBrowser(owner,services.visualBrowserService||visualBrowserService);
  panelMessageHandlers.get(owner.panel)?.dispose?.();panelMessageHandlers.delete(owner.panel);openPanels.release(owner.panel);
  const registry=services.contextRegistry||authoringContextRegistry,kind=String(descriptor?.kind||descriptor?.type||'workspace'),ownerFile=typeof descriptor?.ownerFile==='string'?descriptor.ownerFile:'',root=ownerFile?path.dirname(ownerFile):'';
  owner.contextEntry=registry.registerAuthoringPanel(owner.panel,{type:kind,key:ownerFile||owner.entityIdentity||kind,label:String(descriptor?.label||kind),root,ownerDef:kind==='character'?ownerFile:'',files:ownerFile?[ownerFile]:[]});owner.contextModel=registry.getContextModel(owner.contextEntry);
  owner.panel.title=`Stage · ${String(descriptor?.label||'Unavailable')}`;owner.panel.webview.html=(services.unavailableHtml||require('./entity_unavailable_view').entityUnavailableHtml)({surface:'stage.workspace',label:String(descriptor?.label||'Selected entity'),reason});
  return owner;
}

function createStageRetargetAdapter(panel, services = {}) {
  const owner=panelOwners.get(panel);if(!owner)throw new Error('Stage retargeting requires a populated Stage Workspace panel.');
  const resolveTargets=services.resolveTargets||require('./entity_target_resolver').resolveEntityTargets,buildPayload=services.stagePayload||stagePayload,repopulate=services.populate||populate,drafts=services.drafts||stageDrafts;
  const textFor=filename=>{const document=(services.liveDocument||liveDocument)(filename);return document?document.getText():(services.fs||fs).readFileSync(filename,'utf8');};
  return {
    id:'stage.workspace',surfaceId:'stage.workspace',transferPinned:false,
    async supports(){return !owner.disposed;},
    async prepare(transaction){
      if(owner.disposed)return{ok:false,reason:'The Stage Workspace closed during switching.'};
      if(owner.busy)return{ok:false,reason:'Wait for the current Stage Workspace operation to finish.'};
      if(owner.draftStoreFailed)return{ok:false,reason:'The current stage preview draft could not be retained.'};
      await drafts.flush();
      const capture=owner.unavailable?{unavailable:true,descriptor:transaction.from}:{unavailable:false,filename:owner.filename,payload:owner.payload,retainedState:stageRetainedState(owner)};
      if(transaction.to.kind!=='stage')return{ok:true,capture,target:null,retainedState:stageRetainedState(owner)};
      let targets;try{targets=resolveTargets(transaction.to,services);}catch(error){return{ok:true,capture,target:null,targetReason:error.message,retainedState:stageRetainedState(owner)}}
      if(!targets.stage?.available)return{ok:true,capture,target:null,targetReason:targets.stage?.reason||'No stage applies to this entity.',retainedState:stageRetainedState(owner)};
      const filename=targets.stage.filename,text=textFor(filename),retained=transaction.toState?.adapterRetainedState?.['stage.workspace'],payload=restoreStageRetainedState(buildPayload(filename,workspaceExperience('stage',mode('stageUi',vscode.Uri.file(filename))),text),retained);
      return{ok:true,capture,target:{filename,payload,sourceHash:hash(text)},retainedState:stageRetainedState(owner)};
    },
    async validate(_transaction,prepared){if(owner.disposed||owner.busy)return{ok:false,reason:'The Stage Workspace changed while switching.'};if(!prepared.target)return true;return hash(textFor(prepared.target.filename))===prepared.target.sourceHash||{ok:false,reason:'The destination stage changed while switching.'};},
    async commit(transaction,prepared){
      if(!prepared.target){suspendStagePanel(owner,transaction.to,prepared.targetReason||'This entity has no applicable stage resource.',services);prepared.committed=true;return;}
      const rebound=await repopulate(panel,prepared.target.filename,{payload:prepared.target.payload});if(!rebound||path.resolve(rebound.filename)!==path.resolve(prepared.target.filename))throw new Error('The Stage Workspace could not adopt the destination stage.');prepared.committed=true;
    },
    async rollback(transaction,prepared){
      if(!prepared?.committed||prepared.rolledBack)return;
      if(prepared.capture?.unavailable)suspendStagePanel(owner,transaction.from,'This entity has no applicable stage resource.',services);
      else if(prepared.capture?.filename){
        const currentText=textFor(prepared.capture.filename),capturedPayload=prepared.capture.payload,
          payload=capturedPayload&&capturedPayload.sourceHash===hash(currentText)
            ?restoreStageRetainedState(capturedPayload,prepared.capture.retainedState)
            :undefined,
          rebound=await repopulate(panel,prepared.capture.filename,payload?{payload}:{});
        if(!rebound||path.resolve(rebound.filename)!==path.resolve(prepared.capture.filename))throw new Error('The Stage Workspace could not restore its prior exact stage.');
      }
      prepared.rolledBack=true;prepared.committed=false;
    }
  };
}

async function openStageWorkspace(uri) {
  let filename = uri && uri.fsPath;
  if (!filename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) {
      try { if (kind(parseDef(fs.readFileSync(active.fsPath, 'utf8'), active.fsPath)) === 'stage') filename = active.fsPath; } catch (_) {}
    }
  }
  if (!filename) {
    filename = await chooseFileOrFolder({ title: 'Open IKEMEN Stage', filters: { 'IKEMEN stage': ['def'] }, extensions: ['def'], predicate: (candidate) => kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate)) === 'stage', maxDepth: 4, invalidMessage: 'That DEF is not an IKEMEN stage.', emptyMessage: 'No stage DEF files were found in that folder.' });
  }
  if (!filename) return;
  try {
    if (kind(parseDef(fs.readFileSync(filename, 'utf8'), filename)) !== 'stage') return vscode.window.showErrorMessage('Choose a stage DEF containing Camera, StageInfo, and BGDef sections.');
  } catch (error) { return vscode.window.showErrorMessage(`Could not read stage DEF: ${error.message}`); }
  const existing = openPanels.get(panelKey(filename));
  const targetColumn = await focusedVisualWorkspaceColumn(vscode.ViewColumn.Active);
  if (existing) { existing.reveal(targetColumn, false); return existing; }
  try {
    const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenStageWorkspace', `Stage: ${path.basename(filename)}`, targetColumn, { enableScripts: true, retainContextWhenHidden: true }));
    await populate(panel, filename);
    return panel;
  } catch (error) { vscode.window.showErrorMessage(`Could not open stage workspace: ${error.message}`); }
}

async function createStageInteraction(uri) {
  let stageFilename = uri && uri.fsPath;
  if (!stageFilename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) stageFilename = active.fsPath;
  }
  if (!stageFilename) return vscode.window.showWarningMessage('Open or right-click a stage DEF before creating its interaction helper.');
  let parsed, model;
  try { parsed = parseDef(fs.readFileSync(stageFilename, 'utf8'), stageFilename); model = stageModel(parsed); }
  catch (error) { return vscode.window.showErrorMessage(`Could not read stage: ${error.message}`); }
  const base = path.basename(stageFilename, path.extname(stageFilename));
  const name = await vscode.window.showInputBox({ title: 'Stage interaction name', value: `${model.name} Interaction`, validateInput: (value) => value.trim() ? undefined : 'Enter a name.' });
  if (!name) return;
  const prefix = await vscode.window.showInputBox({ title: 'Map/function namespace', value: `${base.replace(/[^A-Za-z0-9_]/g, '_')}_`, prompt: 'Project-owned prefix used by generated maps. You can change it per project.' });
  if (prefix === undefined) return;
  const target = await vscode.window.showSaveDialog({ title: 'Save attached-character DEF', defaultUri: vscode.Uri.file(path.join(path.dirname(stageFilename), base, 'interaction.def')), filters: { 'IKEMEN character definition': ['def'] } });
  if (!target) return;
  const directory = path.dirname(target.fsPath), stem = path.basename(target.fsPath, '.def');
  const relativeSff = model.sff ? path.relative(directory, resolveAsset(model.sff, stageFilename)).replace(/\\/g, '/') : '../stage.sff';
  const templates = attachedCharacterTemplates({ name, prefix, sff: relativeSff });
  const files = [
    [target.fsPath, templates.def.replace(/interaction\.air/g, `${stem}.air`).replace(/interaction\.zss/g, `${stem}.zss`)],
    [path.join(directory, `${stem}.air`), templates.air], [path.join(directory, `${stem}.zss`), templates.zss], [path.join(directory, 'README.md'), templates.readme]
  ];
  const existing = files.filter(([filename]) => fs.existsSync(filename));
  if (existing.length) {
    const answer = await vscode.window.showWarningMessage(`${existing.length} interaction file(s) already exist. Replace them?`, { modal: true }, 'Replace');
    if (answer !== 'Replace') return;
  }
  try {
    transactionalWriteSet(fs, files, mutationOptions(stageFilename, 'stage-interaction-files', { allowExisting: true }));
  } catch (error) { return vscode.window.showErrorMessage(`Could not create stage interaction files: ${error.message}`); }
  const add = await vscode.window.showInformationMessage('Created the project-owned stage interaction files.', 'Add AttachedChar to Stage', 'Open ZSS');
  if (add === 'Add AttachedChar to Stage') {
    if (model.attachedChars.length >= 4) return vscode.window.showWarningMessage('This stage already declares four attached characters. The files were created but the stage was not changed.');
    const info = parsed.sections.find((section) => section.normalized === 'info');
    if (!info) return vscode.window.showWarningMessage('The files were created, but the stage has no Info section to update.');
    const key = model.attachedChars.length === 0 ? 'attachedChar' : `attachedChar${model.attachedChars.length + 1}`;
    const relative = path.relative(path.dirname(stageFilename), target.fsPath).replace(/\\/g, '/');
    const next = setSectionEntry(parsed, info.line, key, relative);
    transactionalWrite(fs, stageFilename, next, mutationOptions(stageFilename, 'stage-attached-character'));
    vscode.window.showInformationMessage(`Added ${key} = ${relative}`);
  } else if (add === 'Open ZSS') await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(directory, `${stem}.zss`))), { preview: false });
}

function registerStageWorkspace(context) {
  stageDrafts = new FormDrafts(context.workspaceState, 'ikemaker.stagePreviewDrafts.v1');
  visualComponents = createVisualComponentLibrary(context.globalState || context.workspaceState);
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.stage.openWorkspace', openStageWorkspace),
    vscode.commands.registerCommand('ikemen.stage.createInteraction', createStageInteraction),
    vscode.commands.registerCommand('ikemen.stage.launchRig', launchStageRig),
    vscode.window.registerWebviewPanelSerializer('ikemenStageWorkspace', { async deserializeWebviewPanel(panel, state) {
      if (!state || !state.filename || !fs.existsSync(state.filename)) { panel.dispose(); return; }
      try { await populate(panel, state.filename); } catch (error) { panel.dispose(); vscode.window.showErrorMessage(`Could not restore stage workspace: ${error.message}`); }
    } })
  );
  if(vscode.workspace.onDidChangeTextDocument)context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{for(const panel of openPanels.values()){const owner=panelOwners.get(panel);if(!owner||owner.disposed||owner.busy||path.resolve(event.document.fileName)!==owner.filename)continue;owner.invalidated=true;owner.generation++;clearTimeout(owner.refreshTimer);owner.refreshTimer=setTimeout(()=>{const operation=()=>!owner.disposed&&!owner.busy?populate(panel,owner.filename):false;owner.queue=(owner.queue||Promise.resolve()).then(operation,operation).catch(error=>vscode.window.showWarningMessage(`Stage Workspace could not refresh safely: ${error.message}`));},180);}}));
  if(vscode.workspace.onDidCloseTextDocument)context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document=>{for(const panel of openPanels.values()){const owner=panelOwners.get(panel);if(!owner||owner.disposed||path.resolve(document.fileName)!==owner.filename)continue;owner.invalidated=true;owner.generation++;const operation=()=>!owner.disposed&&!owner.busy?populate(panel,owner.filename):false;owner.queue=(owner.queue||Promise.resolve()).then(operation,operation).catch(error=>vscode.window.showWarningMessage(`Stage Workspace could not rebind after the source closed: ${error.message}`));}}));
}

module.exports = { registerStageWorkspace, openStageWorkspace, createStageInteraction, stagePayload, stageHtml, stageSpriteHandoff, resolveAsset, gameRoot, stageQuickControlsClientScript, stageToolbarModel, backgroundReference, findBackground, applyStageMutation, stageAuthority, assertStageAuthority, validStageMessage, finalizeStageClose, stageRetainedState, restoreStageRetainedState, suspendStagePanel, createStageRetargetAdapter, normalizeStageBrowserSelection, applyStageBrowserSelection, stageBrowserCommit, stageBrowserModel, stageBrowserOwnerKey, attachStageBrowser, detachStageBrowser, publishStageBrowser, routeStageBrowserAction, stageComparisonAvailability, stageRigControlAvailability, stagePreviewSelectionAvailability, stagePreviewFitScale };
