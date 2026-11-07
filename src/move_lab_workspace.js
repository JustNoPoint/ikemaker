'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { chooseCharacterDef, nearestCharacterDef } = require('./character_picker');
const { buildMoveLabModel, validAttackReference } = require('./move_lab_model');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { handleLaunchMessage } = require('./launch_controls');
const { readSff } = require('./sff_reader');
const { characterPaletteAssignment } = require('./move_palette_preview');
const { previewModel } = require('./hitdef_preview_model');
const { componentReference, validComponentReference, directComponentModel } = require('./move_lab_component_model');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, universalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { ExactSourceRegistry, unavailable, fingerprint } = require('./exact_source_routes');
const { createNavigationState, projectNavigation, reduceNavigation } = require('./authoring_navigation_model');
const authoringContextRegistry = require('./authoring_context_registry');
const { isDeepStrictEqual } = require('util');
const throwHandoff=require('./move_lab_throw_handoff');

const sessions = new Map();
let activeSession = null;
const sessionKey = filename => path.resolve(filename).toLowerCase();
const MOVE_MODES = new Set(['overview', 'attack', 'throw', 'animation', 'spatial', 'helpers', 'resources', 'code', 'tests']);
const MOVE_LAB_COMMANDS = new Set(['ikemen.moveLab.commandTriggerRecipes','ikemen.hitDef.openEditor', 'ikemen.explodComposer.open', 'air.openAnimationPreview', 'ikemen.throwCreator.open', 'ikemen.positionCamera.open', 'ikemen.stage.launchRig', 'sff.openViewer', 'snd.openViewer', 'ikemen.helperLab.open', 'ikemen.characterDependencies.open', 'ikemen.paletteImport.open', 'zss.openPalFxEditor', 'ikemen.codeStructure.openWorkspace', 'zss.openControllers', 'ikemen.testSessions.open', 'ikemen.characterHealth.open', 'ikemen.mutations.openHistory', 'ikemen.impactPreview.open', 'ikemen.relatedWork.open']);
const MOVE_LAB_TOOLS = Object.freeze({ overview:[['Command triggers…','ikemen.moveLab.commandTriggerRecipes']],attack:[['Open HitDef editor','ikemen.hitDef.openEditor'],['Explod Composer','ikemen.explodComposer.open'],['AIR workspace','air.openAnimationPreview']],throw:[['Throw Creator','ikemen.throwCreator.open'],['Explod Composer for throw parts','ikemen.explodComposer.open'],['Position & Camera','ikemen.positionCamera.open'],['AIR workspace','air.openAnimationPreview']],animation:[['AIR workspace','air.openAnimationPreview'],['SFF workspace','sff.openViewer']],spatial:[['Explod Composer','ikemen.explodComposer.open'],['Position & Camera','ikemen.positionCamera.open'],['Throw Creator','ikemen.throwCreator.open'],['Stage Rig','ikemen.stage.launchRig']],helpers:[['Helper Lab','ikemen.helperLab.open'],['Position & Camera','ikemen.positionCamera.open'],['Explod Composer','ikemen.explodComposer.open'],['Connection tree','ikemen.characterDependencies.open']],resources:[['SFF workspace','sff.openViewer'],['SND workspace','snd.openViewer'],['Palette import','ikemen.paletteImport.open'],['PalFX editor','zss.openPalFxEditor']],code:[['Command triggers…','ikemen.moveLab.commandTriggerRecipes'],['Visual code structure','ikemen.codeStructure.openWorkspace'],['Controller browser','zss.openControllers'],['Connection tree','ikemen.characterDependencies.open']],tests:[['Test suite','ikemen.testSessions.open'],['Character health','ikemen.characterHealth.open'],['Recovery Center','ikemen.mutations.openHistory'],['Impact preview','ikemen.impactPreview.open']] });
const fileKey = filename => path.resolve(filename || '').toLowerCase();
function textSourceFile(filename) { return /\.(?:def|air|cmd|cns|zss|st|txt|lua|jnp|inp)$/i.test(filename || ''); }
function moveLabControlAvailability(input = {}) {
  const state = (disabled, reason = '') => Object.freeze({ disabled: Boolean(disabled), reason: disabled ? reason : '' });
  const modeCount = Math.max(0, Number(input.modeCount) || 0), modeIndex = Math.max(0, Number(input.modeIndex) || 0);
  const fileCount = Math.max(0, Number(input.fileCount) || 0), fileIndex = Math.max(0, Number(input.fileIndex) || 0), pendingNavigation = Boolean(input.pendingNavigation), navigationBusy = Boolean(input.navigationBusy);
  const totalTicks = Math.max(0, Number(input.totalTicks) || 0), tick = Math.max(0, Number(input.tick) || 0), previewReady = Boolean(input.previewReady), hasActions = Boolean(input.hasActions);
  const busy = Boolean(input.busy), hasSource = Boolean(input.hasSource), wait = 'Wait for the current Move Lab operation to finish.';
  const noFiles = 'No connected character file is available. Refresh after assigning files in the character DEF.';
  const navWait = navigationBusy ? wait : 'Wait for the current connected-file navigation to finish.';
  const noPreview = 'Assign a usable AIR and SFF preview before using preview controls.';
  return Object.freeze({
    choose: state(busy, wait), refresh: state(busy, wait),
    editSelectedSource: state(busy || !hasSource, busy ? wait : 'Select a connected file, outline item, timeline event, diagnostic, or detected controller first.'),
    openFullTextNative: state(busy || !hasSource, busy ? wait : 'Select an exact Move Lab source before opening the native text editor.'),
    returnToMove: state(busy, wait),
    modePrevious: state(modeCount < 1 || modeIndex <= 0, modeCount < 1 ? 'No Move Lab areas are available.' : 'Already at the first Move Lab area.'),
    modeNext: state(modeCount < 1 || modeIndex >= modeCount - 1, modeCount < 1 ? 'No Move Lab areas are available.' : 'Already at the last Move Lab area.'),
    modeSlider: state(modeCount < 1, 'No Move Lab areas are available.'),
    modeSelect: state(modeCount < 1, 'No Move Lab areas are available.'),
    filePrevious: state(navigationBusy || pendingNavigation || fileCount < 2 || fileIndex <= 0, navigationBusy || pendingNavigation ? navWait : fileCount < 1 ? noFiles : fileCount < 2 ? 'Only one connected character file is available.' : 'Already at the first connected character file.'),
    fileNext: state(navigationBusy || pendingNavigation || fileCount < 2 || fileIndex >= fileCount - 1, navigationBusy || pendingNavigation ? navWait : fileCount < 1 ? noFiles : fileCount < 2 ? 'Only one connected character file is available.' : 'Already at the last connected character file.'),
    fileSlider: state(navigationBusy || pendingNavigation || fileCount < 2, navigationBusy || pendingNavigation ? navWait : fileCount < 1 ? noFiles : 'Only one connected character file is available.'),
    fileSelect: state(navigationBusy || pendingNavigation || fileCount < 1, navigationBusy || pendingNavigation ? navWait : noFiles),
    movePlay: state(!previewReady || totalTicks < 1, noPreview),
    movePrevious: state(!previewReady || totalTicks < 1 || tick <= 0, !previewReady || totalTicks < 1 ? noPreview : 'Already at the first preview tick.'),
    moveNext: state(!previewReady || totalTicks < 1, noPreview),
    moveP1: state(!previewReady || !hasActions, noPreview),
    moveP2: state(!previewReady || !hasActions, noPreview),
    moveFit: state(!previewReady, noPreview),
    eventTimelineScope: state(Math.max(0, Number(input.scopeCount) || 0) < 1, 'No connected event timeline scope is available for the current selection.')
  });
}
function moveLabListNavigation(index, key, count) {
  const size = Math.max(0, Number(count) || 0), at = Math.max(0, Math.min(size - 1, Number(index) || 0));
  if (!size) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return size - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % size;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + size) % size;
  return -1;
}
function moveLabNavigation(files, current = '', mode = 'tabs') {
  const items = (files || []).filter(item => item?.filename && item.exists !== false).map((item, index) => ({ id: `connected-${index}`, label: item.name || path.basename(item.filename), title: `${item.kind || 'Source'} · ${item.name || path.basename(item.filename)}`, filename: path.resolve(item.filename), kind: item.kind || path.extname(item.filename).slice(1) }));
  const found = items.find(item => fileKey(item.filename) === fileKey(current));
  return createNavigationState({ mode, items, currentId: found?.id || items[0]?.id || null });
}
function sourceText(filename) {
  const open = (vscode.workspace.textDocuments || []).find(document => fileKey(document.fileName) === fileKey(filename));
  return open ? { text: open.getText(), version: String(open.version ?? fingerprint(open.getText())) } : { text: fs.readFileSync(filename, 'utf8'), version: fingerprint(fs.readFileSync(filename, 'utf8')) };
}
function sourceSelection(owner) { return owner?.source ? { surfaceId: 'move.lab', sourceId: owner.source.id, filename: owner.source.filename, line: owner.source.line, kind: owner.source.kind, generation: owner.source.generation, selectionEpoch: owner.source.selectionEpoch } : null; }
function claimSource(owner) { if (!owner?.panel?.active || owner.disposed || !owner.contextModel || !owner.source) return null; return owner.contextModel.update({ selection: sourceSelection(owner), activeSurfaceId: 'move.lab' }); }
function moveLabToolbarModel(owner = {}) {
  const capabilities = Object.fromEntries(SLOTS.map(slot => [slot.id, { enabled: false, reason: `${slot.label} is unavailable for the current Move Lab context.` }])), enable = (id, dispatch = `internal:${id}`) => capabilities[id] = { enabled: true, dispatch };
  for (const id of ['new', 'open', 'recovery', 'run', 'project', 'stage', 'viewer-browser', 'actions-search', 'suite-switch', 'help', 'settings']) enable(id);
  if (!owner.busy) enable('close'); else capabilities.close = { enabled: false, reason: 'Wait for the current Move Lab operation to finish before closing.' };
  capabilities.save = { enabled: false, reason: 'Move Lab is a read-only overview. Edit and save through the selected specialist or native text editor.' };
  if (owner.defPath) enable('backup');
  if (owner.source) capabilities['text-source'] = { enabled: true, dispatch: 'internal:text-source', capabilityId: 'implemented.move-lab-source', resolverId: 'move-lab.exact-source', routeKind: 'selected-block' };
  else capabilities['text-source'] = { enabled: false, reason: 'Select a connected file, outline item, issue, or detected controller first.' };
  const navigation = projectNavigation(owner.navigation || moveLabNavigation([], ''));
  if (navigation.visibleCount > 1) capabilities['connected-resources'] = { enabled: true, dispatch: 'internal:connected-resources', routeKind: 'connected-resources' };
  else capabilities['connected-resources'] = { enabled: false, reason: 'No other connected character file is available.' };
  if (owner.defPath) for (const id of ['versus', 'training', 'sprites', 'animations', 'commands', 'states', 'sounds', 'palettes', 'code-structure']) enable(id);
  return adapt('move.lab', capabilities, { resolverIds: ['move-lab.exact-source'] });
}
function constantsReferenceFor(profile, defPath, extra = {}) {
  return profile ? { defPath, profileId: profile.id, prefix: profile.prefix, sourceFilename: profile.sourceFilename, sourceHash: profile.sourceHash, ...extra } : null;
}
function validConstantsReference(reference, data, defPath) {
  if (!reference || sessionKey(reference.defPath || '') !== sessionKey(defPath)) return false;
  const profile = (data.attacks?.constantProfiles || []).find(item => item.id === reference.profileId);
  if (!profile || profile.prefix !== reference.prefix || sessionKey(profile.sourceFilename || '') !== sessionKey(reference.sourceFilename || '') || profile.sourceHash !== reference.sourceHash) return false;
  if (reference.actionNumber !== undefined && (!Number.isInteger(reference.actionNumber) || reference.actionNumber !== profile.moveID)) return false;
  return reference.frameIndex === undefined || (Number.isInteger(reference.frameIndex) && reference.frameIndex >= 0);
}
function validMoveReference(reference, data, defPath) {
  if (!reference || sessionKey(reference.defPath || '') !== sessionKey(defPath) || !MOVE_MODES.has(reference.mode)) return false;
  const actions = new Set((data.visual?.actions || []).map(item => item.number));
  return (!Number.isInteger(reference.p1Action) || actions.has(reference.p1Action)) && (!Number.isInteger(reference.p2Action) || actions.has(reference.p2Action)) && (!reference.timelineScope||(data.eventTimeline?.availableScopes||[]).some(item=>item.id===reference.timelineScope)) && (!reference.returnTo || require('./stage_attached_move_lab').isStageReturn(reference.returnTo, defPath) || validConstantsReference(reference.returnTo, data, defPath));
}
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function diagnosticsFor(files) {
  const wanted = new Set(files.map((filename) => path.resolve(filename).toLowerCase())), output = [];
  for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
    if (!uri?.fsPath || !wanted.has(path.resolve(uri.fsPath).toLowerCase())) continue;
    for (const diagnostic of diagnostics) output.push({
      filename: uri.fsPath, displayFilename: path.basename(uri.fsPath), line: diagnostic.range.start.line, character: diagnostic.range.start.character,
      severity: diagnostic.severity, message: diagnostic.message, source: diagnostic.source || 'IKEMEN'
    });
  }
  return output.sort((a, b) => a.severity - b.severity || a.filename.localeCompare(b.filename) || a.line - b.line);
}
function visualModel(defPath, requestedP1, requestedP2) {
  try {
    const assets = require('./related_work').resolveAssigned(defPath);
    if (!assets.air || !assets.sff || !fs.existsSync(assets.air) || !fs.existsSync(assets.sff)) return { state: 'unavailable', detail: 'An assigned AIR and SFF are required for the shared preview.' };
    const airDocument = (vscode.workspace.textDocuments || []).find((document) => path.resolve(document.fileName).toLowerCase() === path.resolve(assets.air).toLowerCase());
    const airText = airDocument ? airDocument.getText() : fs.readFileSync(assets.air, 'utf8'), archive = readSff(assets.sff), palette = characterPaletteAssignment(archive, assets.sff, { filename: defPath, text: sourceText(defPath).text });
    return { ...previewModel(airText, archive, palette.override, requestedP1, requestedP2), palette: { ...palette, override: undefined } };
  } catch (error) { return { state: 'unavailable', detail: error.message }; }
}
function timelineScopeOptions(components=[],actionNumbers=[]) {
  const actions=[...new Set((actionNumbers||[]).filter(Number.isInteger))],result=[{id:'air-only',label:`Selected AIR Action${actions.length===1?'':'s'}${actions.length?` ${actions.join(' / ')}`:''}`,kind:'air',description:'AIR/CLSN only. No StateDef relationship is inferred from matching numbers.',codeScope:{mode:'none'}}],seen=new Set();
  for(const component of components){if(!['state','function','hitdef'].includes(component.kind)||!component.filename||!Number.isInteger(component.line))continue;const key=[fileKey(component.filename),component.kind,component.line,Number.isInteger(component.endLine)?component.endLine:component.line].join('\0');if(seen.has(key))continue;seen.add(key);const id=`component:${fingerprint(key).slice(0,24)}`;result.push({id,label:`${component.kind==='state'?'StateDef':component.kind==='function'?'Function':'HitDef'} · ${component.label||component.signature||path.basename(component.filename)}`,kind:'component',description:'Exact parser-owned code range plus the separately selected AIR actions; no AIR-to-StateDef equivalence is assumed.',codeScope:{mode:'range',filename:path.resolve(component.filename),startLine:component.line,endLine:Number.isInteger(component.endLine)?component.endLine:component.line},componentId:component.id||component.stableId||''});if(result.length>=258)break;}
  result.push({id:'whole-character',label:'All connected code (broad inventory)',kind:'inventory',description:'Explicit whole-character authored inventory. Events are not claimed to belong to the selected AIR actions.',codeScope:{mode:'all'}});return result;
}
function selectTimelineScope(scopes,requested){return scopes.find(scope=>scope.id===requested)||scopes[0];}
function model(defPath, requestedP1, requestedP2, requestedTimelineScope='air-only') {
  const first = buildMoveLabModel(defPath, vscode.workspace.textDocuments || [], []);
  const diagnostics=diagnosticsFor(first.files.map((item) => item.filename)),result=buildMoveLabModel(defPath, vscode.workspace.textDocuments || [], diagnostics);
  try{
    const assets=require('./related_work').resolveAssigned(defPath),direct=directComponentModel(assets,vscode.workspace.textDocuments||[],diagnostics);
    result.attacks={...(result.attacks||{}),controllers:direct.components,constantProfiles:result.attacks?.constantProfiles||direct.constantProfiles||[]};
    result.components=[...direct.components,...direct.behaviors,...direct.specialists];result.projectKnowledge=direct.projectKnowledge;result.componentFailures=direct.failures;
  }catch(error){result.components=result.attacks?.controllers||[];result.componentFailures=[{filename:defPath,message:error.message}];}
  const visual=visualModel(defPath, requestedP1, requestedP2),selectedActions=[visual.p1Action,visual.p2Action].filter(Number.isInteger),timelineFiles=(result.files||[]).filter(item=>item.exists!==false&&/\.(?:zss|cns|st|cmd|txt)$/i.test(item.filename)).flatMap(item=>{try{return[{filename:path.resolve(item.filename),text:sourceText(item.filename).text}]}catch(_){return[];}}),airPath=result.assets?.air,air=airPath&&fs.existsSync(airPath)?{filename:path.resolve(airPath),text:sourceText(airPath).text,actionNumbers:selectedActions}:null,availableScopes=timelineScopeOptions(result.components||[],selectedActions),selectedScope=selectTimelineScope(availableScopes,requestedTimelineScope);
  result.eventTimeline={...require('./connected_event_timeline_model').buildConnectedEventTimeline(timelineFiles,{ownerIdentity:path.resolve(defPath),air,codeScope:selectedScope.codeScope}),scope:{id:selectedScope.id,label:selectedScope.label,kind:selectedScope.kind,description:selectedScope.description},availableScopes:availableScopes.map(({codeScope,...scope})=>scope)};
  return { ...result, defLabel: vscode.workspace.asRelativePath?.(defPath, true) || path.basename(defPath), visual };
}
function rawPage(data) { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;font:12px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}button,select{font:inherit;color:inherit;background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-button-border,var(--vscode-panel-border));padding:5px 8px}button{cursor:pointer}button:disabled{cursor:not-allowed}header{min-height:48px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--vscode-panel-border)}.grow{flex:1}.context{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:4px 8px;border-radius:10px}.tabs{display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:7px 8px;border-bottom:1px solid var(--vscode-panel-border);overflow:visible}.tabs>input{min-width:90px;flex:1 1 150px}.tabs>select{max-width:260px}.tabs details{flex:1 0 100%;margin:0}.tabs button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}#modeCollection{display:flex;gap:5px;flex-wrap:wrap}#modeCollection.navigation-list{display:grid;grid-template-columns:1fr}#modeCollection.navigation-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr))}main{height:calc(100vh - 91px);display:grid;grid-template-columns:minmax(220px,300px) 1fr minmax(250px,340px)}aside,.content{overflow:auto;padding:10px}.left{border-right:1px solid var(--vscode-panel-border)}.right{border-left:1px solid var(--vscode-panel-border)}.card{border:1px solid var(--vscode-panel-border);padding:10px;margin-bottom:9px}.file,.node,.issue{display:block;width:100%;text-align:left;margin:4px 0}.missing{color:var(--vscode-errorForeground)}.muted{color:var(--vscode-descriptionForeground)}.stat{display:inline-block;margin:3px;padding:5px 8px;background:var(--vscode-sideBar-background)}details{border:1px solid var(--vscode-panel-border);margin:7px 0}summary{cursor:pointer;padding:8px;font-weight:700}details>div{padding:0 8px 8px}.issue[data-severity="0"]{border-left:3px solid var(--vscode-errorForeground)}.issue[data-severity="1"]{border-left:3px solid var(--vscode-editorWarning-foreground)}.visual-tools{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.stage{position:relative;height:330px;background:#152033;border:1px solid var(--vscode-panel-border)}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;image-rendering:pixelated;cursor:grab}.timeline{display:flex;gap:4px;overflow:auto;padding:6px 0}.frame{min-width:62px;text-align:center}.frame img{width:48px;height:46px;object-fit:contain;image-rendering:pixelated}aside,.content{min-width:0}.visual-tools{flex-wrap:wrap}main{grid-template-columns:minmax(220px,300px) minmax(0,1fr) minmax(250px,340px)}@media(max-width:1100px){body{height:auto;min-height:100vh;overflow:auto}main{height:auto;grid-template-columns:minmax(0,1fr)}.content{grid-row:1;overflow:visible}.left{grid-row:2;max-height:360px}.right{grid-row:3;display:block}.tabs{flex-wrap:wrap}.context{max-width:100%;overflow-wrap:anywhere}}@media(max-width:520px){header>button,.tabs>select,.tabs>input,.visual-tools>button,.visual-tools>label{flex:1 1 140px;max-width:none}.stage{height:270px}}</style></head><body>
<header><b>Move Lab</b><span class="context" id="context" aria-label="Current Move Lab context"></span><button data-action="moveLabBrowse">Browse moves &amp; behaviors&hellip;</button><button data-action="choose">Character…</button><button data-action="refresh">Refresh</button><button id="editSelectedSource" disabled title="Uses the Native / Integrated / Ask coding preference">Edit selected source</button><button id="openFullTextNative" disabled>Open Full Text Native</button><button id="returnToMove" hidden>Return to Constants</button><span class="grow"></span><span id="moveLabStatus" role="status" aria-live="polite">Ready.</span></header>
<nav class="tabs" id="tabs" aria-label="Move Lab area navigation"><button id="modePrevious" title="Previous Move Lab area">◀</button><input id="modeSlider" type="range" min="1" max="9" value="1" aria-label="Move Lab areas"><button id="modeNext" title="Next Move Lab area">▶</button><span id="modeReadout" role="status" aria-live="polite"></span><select id="modeSelect" aria-label="Choose Move Lab area"></select><span aria-label="Move Lab area layout"><button data-mode-view="tabs" aria-pressed="false">Tabs</button><button data-mode-view="list" aria-pressed="false">List</button><button data-mode-view="cards" aria-pressed="false">Cards</button></span><details><summary>Move Lab areas</summary><div id="modeCollection" role="tablist" aria-label="Move Lab areas"></div></details></nav><main><aside class="left"><b>Connected files</b><div id="files" role="navigation" aria-label="Connected character files"></div><hr><b>Source outline</b><div id="outline" role="navigation" aria-label="Connected source outline"></div></aside><section class="content" id="content" role="tabpanel" tabindex="0"></section><aside class="right"><b>Live diagnostics</b><p class="muted">Includes unsaved editor changes. Select an issue to open its exact source line.</p><div id="diagnostics" role="region" aria-label="Live diagnostics"></div></aside></main>
<script>const moveLabAvailability=(${moveLabControlAvailability.toString()}),moveLabListTarget=(${moveLabListNavigation.toString()});${require('./move_constants_view_transform').clientScript()}const vscode=acquireVsCodeApi(),initialState=vscode.getState()||{},previewViews=initialState.previewViews&&typeof initialState.previewViews==='object'?{...initialState.previewViews}:{};let model=${safe(data)},followSpritePalette=!(initialState.paletteOwner===model.defPath&&initialState.followSpritePalette===false),generation=model.generation||0,selectionEpoch=model.selectionEpoch||0,mode=model.presetReference?.mode||initialState.mode||'overview',returnTo=model.presetReference?.returnTo||null,modeViews=initialState.modeViews&&typeof initialState.modeViews==='object'?{...initialState.modeViews}:{},modeView=modeViews[model.defPath]||'tabs',moveLabBusy=false;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function setMoveLabState(control,state,enabledTitle=''){if(!control)return;if(!control.dataset.enabledTitle)control.dataset.enabledTitle=enabledTitle||control.title||'';control.disabled=Boolean(state?.disabled);const explanation=state?.disabled?(state.reason||'This control is currently unavailable.'):(enabledTitle||control.dataset.enabledTitle);control.title=explanation;control.setAttribute('aria-description',explanation)}
const modes=[['overview','Overview'],['attack','Attack / HitDef'],['throw','Throw'],['animation','Animation'],['spatial','Explods & Position'],['helpers','Helpers'],['resources','Sprites, Sound & FX'],['code','Code & Controllers'],['tests','Test & Recovery']];
let tools=model.actionSlots||{};
let tick=0,playing=false,timer=null,zoom=2,panX=0,panY=0,p1WorldX=-40,p1WorldY=0,p2WorldX=40,p2WorldY=0,images=new Map(),canvasObserver=null,timelineTracks=new Set(Array.isArray(initialState.timelineTracks)?initialState.timelineTracks:(model.eventTimeline?.tracks||[]).map(track=>track.id));function restorePreviewState(){const scene=moveView.normalizePreviewScene(previewViews[model.defPath]);zoom=scene.zoom;panX=scene.panX;panY=scene.panY;p1WorldX=scene.p1WorldX;p1WorldY=scene.p1WorldY;p2WorldX=scene.p2WorldX;p2WorldY=scene.p2WorldY}function saveShellState(){previewViews[model.defPath]={zoom,panX,panY,p1WorldX,p1WorldY,p2WorldX,p2WorldY};modeViews[model.defPath]=modeView;vscode.setState({...vscode.getState(),mode,modeViews,previewViews,timelineTracks:[...timelineTracks],paletteOwner:model.defPath,followSpritePalette})}restorePreviewState();function total(track){let ticks=0;for(const frame of track?.frames||[]){if(frame.rawTime===-1)return ticks+1;ticks+=Math.max(1,Number(frame.time)||1)}return ticks}function previewHasHold(){return[model.visual?.p1,model.visual?.p2].some(track=>track?.frames?.some(frame=>frame.rawTime===-1))}function previewTicks(){return Math.max(0,total(model.visual?.p1),total(model.visual?.p2))}function at(track,time){let left=time;for(const frame of track?.frames||[]){if(frame.rawTime===-1||left<Math.max(1,frame.time))return frame;left-=Math.max(1,frame.time)}return track?.frames?.at(-1)}function imageSource(info){return followSpritePalette?info?.src:info?.characterPaletteSrc||info?.src}function image(info){const src=imageSource(info);if(!src)return null;if(images.has(src))return images.get(src);const img=new Image();img.onload=draw;img.src=src;images.set(src,img);return img}function sprite(ctx,frame,x,y,face,shade){const img=image(frame?.image);if(!img?.complete)return;const flipX=(frame.flags||'').includes('H')?-1:1,flipY=(frame.flags||'').includes('V')?-1:1,axisX=x+(frame.x||0)*zoom,axisY=y+(frame.y||0)*zoom;ctx.save();ctx.translate(axisX,axisY);ctx.scale(face*flipX*zoom,flipY*zoom);if(shade){ctx.globalAlpha=.65;ctx.filter='brightness(.38) saturate(.55)'}ctx.drawImage(img,-frame.image.axisX,-frame.image.axisY);ctx.restore();for(const [key,color] of [['clsn1','#ff3b45'],['clsn2','#3d8dff']]){ctx.strokeStyle=color;for(const b of frame?.[key]||[]){const x1=axisX+b[0]*face*flipX*zoom,x2=axisX+b[2]*face*flipX*zoom,y1=axisY+b[1]*flipY*zoom,y2=axisY+b[3]*flipY*zoom;ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1))}}}function draw(){const canvas=document.getElementById('moveCanvas');if(!canvas)return;const width=Math.max(1,Math.round(canvas.clientWidth)),height=Math.max(1,Math.round(canvas.clientHeight));if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}themedMoveDraw()}function syncMoveTimeline(){document.querySelectorAll('.timeline [data-tick]').forEach(button=>button.setAttribute('aria-selected',String(Number(button.dataset.tick)===tick)))}function refreshVisualAvailability(){const availability=moveLabAvailability({previewReady:model.visual?.state==='ready',hasActions:Boolean(model.visual?.actions?.length),totalTicks:previewTicks(),tick});setMoveLabState(document.getElementById('movePlay'),availability.movePlay,'Play or pause preview');setMoveLabState(document.getElementById('movePrev'),availability.movePrevious,'Previous preview tick');setMoveLabState(document.getElementById('moveNext'),availability.moveNext,'Next preview tick');setMoveLabState(document.getElementById('moveP1'),availability.moveP1,'Choose P1 preview action');setMoveLabState(document.getElementById('moveP2'),availability.moveP2,'Choose P2 preview action');setMoveLabState(document.getElementById('moveFit'),availability.moveFit,'Reset preview camera')}function stop(){playing=false;clearInterval(timer);const b=document.getElementById('movePlay');if(b)b.textContent='Play'}function play(){if(playing)return stop();playing=true;document.getElementById('movePlay').textContent='Pause';timer=setInterval(()=>{const span=Math.max(1,previewTicks());if(previewHasHold()&&tick>=span-1){stop();return}tick=(tick+1)%span;syncMoveTimeline();refreshVisualAvailability();draw()},1000/60)}function visualHtml(){if(!['attack','throw','animation'].includes(mode))return'';if(model.visual?.state!=='ready')return'<div class="card missing" role="status">'+esc(model.visual?.detail||'Preview unavailable')+'</div>';const opts=(selected)=>model.visual.actions.map(a=>'<option value="'+esc(model.previewSlots?.[a.number]||'')+'" '+(a.number===selected?'selected':'')+'>'+a.number+' · '+a.frames+' frames · '+(a.ticks===null?'holds at element '+a.holdElement+' after '+a.finitePrefixTicks+' ticks':a.ticks+' ticks')+'</option>').join('');const frames=(model.visual.p1?.frames||[]).map((f,i)=>'<button class="frame" role="option" aria-selected="false" data-tick="'+(model.visual.p1.frames.slice(0,i).reduce((s,x)=>s+Math.max(1,x.time),0))+'">'+(f.image?'<img src="'+imageSource(f.image)+'" alt="">':'')+'<br>'+f.group+','+f.index+' · '+(f.rawTime===-1?'Hold (time=-1)':f.time+'t')+'</button>').join('');return'<div class="card"><div class="visual-tools"><button id="movePlay">Play</button><button id="movePrev" aria-label="Previous preview tick" title="Previous preview tick">◀</button><button id="moveNext" aria-label="Next preview tick" title="Next preview tick">▶</button><label>P1 preview action <select id="moveP1">'+opts(model.visual.p1Action)+'</select></label><label>P2 preview action <select id="moveP2">'+opts(model.visual.p2Action)+'</select></label><button id="moveFit" title="Restore the default camera without changing fighter positions">Reset View</button><label title="Follow each frame’s SFF palette; turn off to preview the character’s assigned DEF palette."><input id="followSpritePalette" type="checkbox" checked> Follow Sprite Palette</label><span id="palettePreviewStatus" class="muted"></span></div><div class="stage"><canvas id="moveCanvas" width="1000" height="500" tabindex="0" aria-label="Move preview. Use P1 and P2 action selectors and timeline buttons from the keyboard; pointer drag pans and the mouse wheel zooms." title="Mouse wheel zooms around the pointer. Drag to pan. Double-click to reset the camera."></canvas></div><div class="timeline" role="listbox" aria-label="P1 animation frames">'+frames+'</div></div>'}function bindVisual(){if(canvasObserver)canvasObserver.disconnect();const c=document.getElementById('moveCanvas');if(!c)return;let drag=null,pointer=null;const point=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};const cancelDrag=()=>{if(pointer!==null&&c.hasPointerCapture?.(pointer))c.releasePointerCapture(pointer);drag=null;pointer=null};if(typeof ResizeObserver!=='undefined'){canvasObserver=new ResizeObserver(()=>{cancelDrag();draw()});canvasObserver.observe(c.parentElement)}document.getElementById('followSpritePalette').checked=followSpritePalette;document.getElementById('palettePreviewStatus').textContent=followSpritePalette?'Each sprite’s SFF palette':model.visual?.palette?.issue?'Assigned palette unavailable; showing SFF colors':model.visual?.palette?.source==='act'?'DEF pal'+model.visual.palette.number+' ACT preview':'DEF default palette preview';document.getElementById('palettePreviewStatus').title=model.visual?.palette?.issue||'Preview only; source files are unchanged.';document.getElementById('followSpritePalette').onchange=e=>{followSpritePalette=e.target.checked;saveShellState();render()};document.getElementById('movePlay').onclick=play;document.getElementById('movePrev').onclick=()=>{stop();tick=Math.max(0,tick-1);syncMoveTimeline();refreshVisualAvailability();draw()};document.getElementById('moveNext').onclick=()=>{stop();tick=previewHasHold()?Math.min(Math.max(0,previewTicks()-1),tick+1):(tick+1)%Math.max(1,previewTicks());syncMoveTimeline();refreshVisualAvailability();draw()};document.getElementById('moveP1').onchange=e=>post('preview',{generation,p1Slot:e.target.value,p2Slot:document.getElementById('moveP2').value});document.getElementById('moveP2').onchange=e=>post('preview',{generation,p1Slot:document.getElementById('moveP1').value,p2Slot:e.target.value});document.getElementById('moveFit').onclick=()=>{cancelDrag();zoom=2;panX=panY=0;saveShellState();draw()};document.querySelectorAll('.timeline [data-tick]').forEach(x=>x.onclick=()=>{stop();tick=Number(x.dataset.tick);syncMoveTimeline();refreshVisualAvailability();draw()});c.onwheel=e=>{e.preventDefault();cancelDrag();const p=point(e),next=moveView.clampZoom(zoom*(e.deltaY<0?1.12:.89)),camera=moveView.zoomPan(zoom,next,panX,panY,p.x,p.y,c.width/2,c.height*.78);zoom=next;panX=camera.x;panY=camera.y;saveShellState();draw()};c.onpointerdown=e=>{pointer=e.pointerId;const p=point(e);drag={x:p.x,y:p.y,px:panX,py:panY};c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(e.pointerId===pointer&&drag){const p=point(e);panX=drag.px+p.x-drag.x;panY=drag.py+p.y-drag.y;draw()}};const end=e=>{if(e.pointerId!==pointer)return;drag=null;pointer=null;saveShellState()};c.onpointerup=end;c.onpointercancel=end;c.onlostpointercapture=end;c.ondblclick=()=>{cancelDrag();zoom=2;panX=panY=0;saveShellState();draw()};syncMoveTimeline();refreshVisualAvailability();draw()}
 function themedMoveDraw(){const canvas=document.getElementById('moveCanvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,axes=moveView.previewAxes(w,h,{zoom,panX,panY,p1WorldX,p1WorldY,p2WorldX,p2WorldY}),step=Math.max(16,30*zoom),gx=((axes.origin.x%step)+step)%step,gy=((axes.origin.y%step)+step)%step;ctx.fillStyle='#132033';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#34475e';for(let x=gx;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=gy;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}ctx.strokeStyle='#5cb6ff';ctx.beginPath();ctx.moveTo(0,axes.origin.y);ctx.lineTo(w,axes.origin.y);ctx.stroke();sprite(ctx,at(model.visual?.p1,tick),axes.p1.x,axes.p1.y,1,false);sprite(ctx,at(model.visual?.p2,tick),axes.p2.x,axes.p2.y,-1,true);ctx.fillStyle='#fff';ctx.fillText('tick '+tick+' · '+(followSpritePalette?'sprite SFF palette':model.visual?.palette?.source==='act'?'DEF ACT palette':'DEF default palette'),10,18)}
 function post(type,extra={}){vscode.postMessage({type,...extra})}function selectMode(next,focusMode=false){if(!modes.some(item=>item[0]===next))return;mode=next;saveShellState();render();if(focusMode)document.querySelector('[data-mode="'+mode+'"]').focus()}function renderModeNavigation(){const index=Math.max(0,modes.findIndex(item=>item[0]===mode)),previous=document.getElementById('modePrevious'),next=document.getElementById('modeNext'),slider=document.getElementById('modeSlider'),select=document.getElementById('modeSelect'),collection=document.getElementById('modeCollection'),availability=moveLabAvailability({modeCount:modes.length,modeIndex:index});setMoveLabState(previous,availability.modePrevious,'Previous Move Lab area');setMoveLabState(next,availability.modeNext,'Next Move Lab area');setMoveLabState(slider,availability.modeSlider,'Choose Move Lab area by position');setMoveLabState(select,availability.modeSelect,'Choose Move Lab area');slider.min=1;slider.max=modes.length;slider.value=index+1;document.getElementById('modeReadout').textContent=(index+1)+' / '+modes.length+' · '+modes[index][1];select.innerHTML=modes.map(([id,label])=>'<option value="'+id+'" '+(id===mode?'selected':'')+'>'+label+'</option>').join('');collection.className='navigation-'+modeView;collection.innerHTML=modes.map(([id,label])=>'<button id="moveLabMode_'+id+'" class="'+(id===mode?'active':'')+'" data-mode="'+id+'" role="tab" aria-controls="content" aria-selected="'+String(id===mode)+'" tabindex="'+(id===mode?'0':'-1')+'">'+label+'</button>').join('');document.getElementById('content').setAttribute('aria-labelledby','moveLabMode_'+mode);const tabs=[...document.querySelectorAll('[data-mode]')];tabs.forEach(tab=>{tab.onclick=()=>selectMode(tab.dataset.mode,true);tab.onkeydown=event=>{const target=moveLabListTarget(tabs.indexOf(tab),event.key,tabs.length);if(target<0)return;event.preventDefault();tabs[target].click()}});document.querySelectorAll('[data-mode-view]').forEach(x=>{const active=x.dataset.modeView===modeView;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active))})}document.getElementById('modePrevious').onclick=()=>{const index=modes.findIndex(item=>item[0]===mode);if(index>0)selectMode(modes[index-1][0])};document.getElementById('modeNext').onclick=()=>{const index=modes.findIndex(item=>item[0]===mode);if(index>=0&&index<modes.length-1)selectMode(modes[index+1][0])};document.getElementById('modeSlider').onchange=e=>selectMode(modes[Math.max(0,Math.min(modes.length-1,Number(e.target.value)-1))][0]);document.getElementById('modeSelect').onchange=e=>selectMode(e.target.value);document.querySelectorAll('[data-mode-view]').forEach(x=>x.onclick=()=>{modeView=x.dataset.modeView;saveShellState();renderModeNavigation()});function eventTimelineHtml(){const timeline=model.eventTimeline;if(!timeline?.tracks?.length)return'';const scope=timeline.scope||{},scopeOptions=(timeline.availableScopes||[]).map(item=>'<option value="'+esc(item.id)+'" '+(item.id===scope.id?'selected':'')+'>'+esc(item.label)+'</option>').join(''),controls=timeline.tracks.map(track=>'<label><input type="checkbox" data-event-track="'+esc(track.id)+'" '+(timelineTracks.has(track.id)?'checked':'')+'> '+esc(track.id)+' ('+(track.events?.length||0)+')</label>').join(' '),rows=timeline.tracks.filter(track=>timelineTracks.has(track.id)).map(track=>'<details><summary>'+esc(track.id)+' · '+track.events.length+' event'+(track.events.length===1?'':'s')+'</summary><div>'+(track.events.length?track.events.map(event=>'<button class="file" data-route="'+esc(event.routeId||'')+'"><b>'+esc(event.label)+'</b><br><span class="muted">'+esc(event.timing?.domain||'unresolved-runtime-time')+(event.timing?.expression?' · '+esc(event.timing.expression):'')+' · '+esc(event.source?.filename?.split(/[\\/]/).pop()||'source')+':'+((event.source?.line||0)+1)+'</span></button>').join(''):'<p class="muted">No events on this track.</p>')+'</div></details>').join('');return'<div class="card"><b>Connected event timeline</b><p class="muted">AIR/CLSN, authored state/animation-time conditions, and unresolved runtime timing stay distinct. Matching AIR and StateDef numbers are never assumed to be connected.</p><label>Timeline scope <select id="eventTimelineScope">'+scopeOptions+'</select></label><p class="muted">'+esc(scope.description||'Choose an exact code scope or the explicit broad inventory.')+'</p><div class="visual-tools">'+controls+'</div>'+rows+'</div>'}function bindEventTimeline(){const scope=document.getElementById('eventTimelineScope');if(scope){const availability=moveLabAvailability({scopeCount:model.eventTimeline?.availableScopes?.length||0});setMoveLabState(scope,availability.eventTimelineScope,'Choose connected event timeline scope');scope.onchange=()=>post('moveLabTimelineScope',{generation,scopeId:scope.value})}document.querySelectorAll('[data-event-track]').forEach(input=>input.onchange=()=>{if(input.checked)timelineTracks.add(input.dataset.eventTrack);else timelineTracks.delete(input.dataset.eventTrack);saveShellState();render()})}function render(){document.getElementById('context').textContent=model.context.project+' → '+model.context.character+' → '+(model.context.ownership||'character')+(model.context.profile?' → '+model.context.profile:'')+' → '+mode;renderModeNavigation();
document.getElementById('files').innerHTML=model.files.length?model.files.map((f,i)=>'<button class="file '+(f.exists?'':'missing')+'" data-route="'+esc(f.routeId||'')+'">'+esc(f.kind)+' · '+esc(f.name)+' · '+esc(f.ownership||'unclassified')+(f.exists?'':' · missing')+'</button>').join(''):'<p class="muted" role="status">No connected character files are available. Assign files in the character DEF, then Refresh.</p>';document.querySelectorAll('#files [data-route]').forEach(x=>x.onclick=()=>post('moveLabInvoke',{generation,slot:x.dataset.route}));
document.getElementById('outline').innerHTML=model.sources.length?model.sources.map(s=>'<details><summary>'+esc(s.name)+' · '+s.states.length+' states</summary><div>'+s.states.slice(0,80).map(n=>'<button class="node" data-route="'+esc(n.routeId||'')+'">'+esc(n.title)+'</button>').join('')+'</div></details>').join(''):'<p class="muted" role="status">No parsed states are available in the connected code sources.</p>';document.querySelectorAll('#outline [data-route]').forEach(x=>x.onclick=()=>post('moveLabInvoke',{generation,slot:x.dataset.route}));
const summary='<div class="card"><b>Character authoring context</b><p>'+esc(model.defLabel || model.context.character)+'</p><span class="stat">'+model.totals.states+' states</span><span class="stat">'+model.totals.controllers+' controllers</span><span class="stat">'+model.totals.functions+' functions</span><span class="stat">'+model.totals.diagnostics+' issues</span></div>';
const entries=tools[mode]||[];const attacks=model.attacks?.controllers||[],profiles=model.attacks?.constantProfiles||[];const attackCards=mode==='attack'?'<div class="card"><b>Detected attack controllers</b><p class="muted">These come directly from HitDef controllers in the connected CNS/ZSS files. They remain available alongside optional constants-based profiles.</p>'+(attacks.length?attacks.map(a=>'<button class="file" data-route="'+esc(a.routeId||'')+'"><b>'+esc(a.label)+'</b>'+(a.detail?' · '+esc(a.detail):'')+'<br><span class="muted">'+esc(a.fileLabel)+':'+(a.line+1)+'</span></button>').join(''):'<p class="muted">No HitDef controllers were detected. Projectile, helper, function, map, or custom code can still be opened through Code & Controllers.</p>')+'</div>'+(profiles.length?'<div class="card"><b>Constants integration</b><p class="muted">These project-specific profiles are one Move Lab value source, not a required coding style. Choose the exact profile to continue in the richer constants editor.</p>'+profiles.map(p=>'<button class="file" data-route="'+esc(p.routeId||'')+'"><b>'+esc(p.prefix)+'</b>'+(Number.isInteger(p.moveID)?' · State '+p.moveID:'')+(p.linkedControllerIds.length?' · linked to '+p.linkedControllerIds.length+' HitDef'+(p.linkedControllerIds.length===1?'':'s'):' · no matching HitDef')+'</button>').join('')+'</div>':'') : '';const throwSlot=(tools.throw||[]).find(item=>item[0]==='Throw Creator')?.[1]||'';const throwCards=mode==='throw'?'<div class="card"><b>Throw plans</b><p>Coordinate P1/P2 timing, bind events, reaction states, parts, and layering. The dedicated Throw Creator is the focused editor for this mode.</p>'+(model.throws.plans.length?model.throws.plans.map(p=>'<button class="file" data-route="'+esc(throwSlot)+'"><b>'+esc(p.name)+'</b> · '+esc(p.template||'custom')+' · '+p.events+' events · '+p.parts+' parts · '+(p.valid?'ready':'review '+p.issues.length)+'</button>').join(''):'<p class="muted">No saved throw plans yet. Available starters: '+model.throws.templates.map(t=>esc(t.label)).join(', ')+'.</p>')+'</div>':'';document.getElementById('content').innerHTML=summary+visualHtml()+eventTimelineHtml()+attackCards+'<div class="card"><b>'+esc(modes.find(x=>x[0]===mode)[1])+'</b><p class="muted">This shell keeps code authoritative and opens the established specialist editor in the same viewer group.</p>'+entries.map(([label,slot])=>'<button class="file" data-route="'+esc(slot)+'">'+esc(label)+' →</button>').join('')+'</div>'+throwCards;document.querySelectorAll('#content [data-route]').forEach(x=>x.onclick=()=>post('moveLabInvoke',{generation,slot:x.dataset.route}));const back=document.getElementById('returnToMove');back.hidden=!returnTo;back.textContent=returnTo?.kind==='stage'?'Return to Stage':'Return to Constants';back.onclick=()=>post('moveLabReturn',{generation,...(returnTo?.kind==='stage'?{returnToken:returnTo.token}:{})});bindVisual();bindEventTimeline();
document.getElementById('diagnostics').innerHTML=model.diagnostics.length?model.diagnostics.map(d=>'<button class="issue" data-route="'+esc(d.routeId||'')+'" data-severity="'+d.severity+'"><b>'+esc(d.source)+'</b> · '+esc(d.message)+'<br><span class="muted">'+esc(d.displayFilename || 'Source')+':'+(d.line+1)+'</span></button>').join(''):'<p class="muted">No current diagnostics for connected files.</p>';document.querySelectorAll('#diagnostics [data-route]').forEach(x=>x.onclick=()=>post('moveLabInvoke',{generation,slot:x.dataset.route}))}
document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>post(x.dataset.action,{generation}));document.getElementById('editSelectedSource').onclick=()=>post('moveLabEditSource',{generation,selectionEpoch,presentation:'preferred'});document.getElementById('openFullTextNative').onclick=()=>post('moveLabEditSource',{generation,selectionEpoch,presentation:'native'});globalThis.ikemenNavigationSelection=()=>({defPath:model.defPath,mode,p1Action:model.visual?.p1Action,p2Action:model.visual?.p2Action,timelineScope:model.eventTimeline?.scope?.id||'air-only',returnTo});globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.defPath===model.defPath&&modes.some(item=>item[0]===ref.mode)&&(!Number.isInteger(ref.p1Action)||model.visual?.actions?.some(item=>item.number===ref.p1Action))&&(!Number.isInteger(ref.p2Action)||model.visual?.actions?.some(item=>item.number===ref.p2Action))&&(!ref.timelineScope||(model.eventTimeline?.availableScopes||[]).some(item=>item.id===ref.timelineScope));globalThis.ikemenRestoreNavigation=ref=>{mode=ref.mode;returnTo=ref.returnTo||null;if(ref.timelineScope&&ref.timelineScope!==model.eventTimeline?.scope?.id)post('moveLabTimelineScope',{generation,scopeId:ref.timelineScope});saveShellState();render();return true};window.addEventListener('message',e=>{const incoming=e.data||{};if(incoming.type==='model'){saveShellState();const samePaletteOwner=model.defPath===incoming.model.defPath;model=incoming.model;if(!samePaletteOwner)followSpritePalette=true;tools=model.actionSlots||{};generation=model.generation||generation;selectionEpoch=model.selectionEpoch||selectionEpoch;restorePreviewState();render()}if(incoming.type==='ikemenPresetCapture')vscode.postMessage({type:'ikemenPresetState',id:incoming.id,reference:globalThis.ikemenNavigationSelection()});if(incoming.type==='viewerHistoryRestore'){let ok=false;try{ok=globalThis.ikemenCanRestoreNavigation(incoming.reference)===true&&globalThis.ikemenRestoreNavigation(incoming.reference)===true}catch(_){}vscode.postMessage({type:'viewerHistoryRestored',requestId:incoming.requestId,ok})}});render();</script></body></html>`; }

function moveLabCloseClientScript(){
  // Every input in this overview selects or previews existing data. Authored
  // edits live in specialists/native documents and must not be discarded here.
  return 'globalThis.ikemenHasUnappliedForms=()=>false;globalThis.ikemenCanKeepDraft=()=>false;globalThis.ikemenIsBusy=()=>Boolean(moveLabBusy||moveLabNavRequest);';
}
function page(data, toolbarModel) {
  const navigation = data.navigation || projectNavigation(moveLabNavigation(data.files || [], data.files?.[0]?.filename || ''));
  const fallback = toolbarModel || moveLabToolbarModel({ defPath: data.defPath, navigation, source: null });
  const toolbar = require('./shared_workspace_header').html('code', fallback);
  const nav = `<div class="move-lab-navigation" aria-label="Connected-file navigation"><button id="moveLabFilePrevious" title="Previous connected file">◀</button><input id="moveLabFileSlider" type="range" min="1" max="1" value="1" aria-label="Connected character files"><button id="moveLabFileNext" title="Next connected file">▶</button><span id="moveLabFileReadout" role="status" aria-live="polite">0 of 0</span><select id="moveLabFileSelect" aria-label="Choose connected character file"></select><span class="move-lab-nav-modes" aria-label="Connected-file layout"><button data-move-lab-nav-mode="tabs" aria-pressed="false">Tabs</button><button data-move-lab-nav-mode="list" aria-pressed="false">List</button><button data-move-lab-nav-mode="cards" aria-pressed="false">Cards</button></span><details><summary>Connected file cards</summary><div id="moveLabFileCollection" role="listbox" aria-label="Connected character files"></div></details></div>`;
  let html = rawPage(data)
    .replace('</style></head>', `body{display:flex;flex-direction:column}.move-lab-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.move-lab-content main{height:auto;flex:1;min-height:0}.move-lab-navigation{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border)}.move-lab-navigation input[type=range]{min-width:90px;flex:1;max-width:340px}.move-lab-navigation details{flex:1 0 100%;margin:0;padding:3px}.move-lab-navigation details>div{display:flex;gap:4px;flex-wrap:wrap;padding:4px}.move-lab-navigation .navigation-list,.move-lab-navigation .navigation-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.move-lab-navigation [data-move-lab-file].active,.move-lab-navigation [data-move-lab-nav-mode].active{outline:2px solid var(--vscode-focusBorder)}${universalToolbarStyle()}</style></head>`)
    .replace('<body>', `<body>${toolbar}<div class="move-lab-content">`)
    .replace('<nav class="tabs"', `${nav}<nav class="tabs"`)
    .replace('</body></html>', '</div></body></html>');
  const client = `let moveLabNavigation=${safe(navigation)},moveLabNavRequest=0,moveLabHasSource=false,moveLabPendingFileFocus='';function moveLabRequestNavigation(action,id){moveLabNavRequest+=1;applyMoveLabChromeAvailability();vscode.postMessage({type:'moveLabNavigate',generation,requestId:moveLabNavRequest,action,...(id?{id}:{})})}function renderMoveLabNavigation(){const nav=moveLabNavigation||{},items=nav.visibleItems||[],slider=nav.slider||{},byId=id=>document.getElementById(id),activeId=moveLabPendingFileFocus||document.activeElement?.dataset?.moveLabFile||'',currentIndex=Math.max(0,items.findIndex(item=>item.id===nav.currentId)),availability=moveLabAvailability({fileCount:items.length,fileIndex:currentIndex,pendingNavigation:Boolean(moveLabNavRequest),navigationBusy:moveLabBusy});setMoveLabState(byId('moveLabFilePrevious'),availability.filePrevious,'Previous connected character file');setMoveLabState(byId('moveLabFileNext'),availability.fileNext,'Next connected character file');const range=byId('moveLabFileSlider');range.min=slider.min||0;range.max=slider.max||0;range.value=slider.value||0;setMoveLabState(range,availability.fileSlider,'Choose connected character file by position');byId('moveLabFileReadout').textContent=slider.title||'0 of 0';const select=byId('moveLabFileSelect');select.innerHTML=items.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===nav.currentId?'selected':'')+'>'+esc(item.label)+'</option>').join('');setMoveLabState(select,availability.fileSelect,'Choose connected character file');const collection=byId('moveLabFileCollection');collection.className='navigation-'+(nav.mode||'tabs');collection.innerHTML=items.length?items.map(item=>'<button role="option" aria-selected="'+String(item.id===nav.currentId)+'" tabindex="'+(item.id===nav.currentId?'0':'-1')+'" data-move-lab-file="'+esc(item.id)+'" '+(item.id===nav.currentId?'class="active"':'')+'>'+esc(item.title||item.label)+'</button>').join(''):'<p class="muted" role="status">No connected character files are available. Assign files in the character DEF, then Refresh.</p>';const options=[...document.querySelectorAll('[data-move-lab-file]')];options.forEach(button=>{button.onclick=()=>moveLabRequestNavigation('select',button.dataset.moveLabFile);button.onkeydown=event=>{const target=moveLabListTarget(options.indexOf(button),event.key,options.length);if(target<0)return;event.preventDefault();moveLabPendingFileFocus=options[target].dataset.moveLabFile;options[target].click()}});document.querySelectorAll('[data-move-lab-nav-mode]').forEach(button=>{const active=button.dataset.moveLabNavMode===nav.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});const restore=activeId&&document.querySelector('[data-move-lab-file="'+activeId+'"]');if(restore){restore.focus();moveLabPendingFileFocus=''}}document.getElementById('moveLabFilePrevious').onclick=()=>moveLabRequestNavigation('previous');document.getElementById('moveLabFileNext').onclick=()=>moveLabRequestNavigation('next');document.getElementById('moveLabFileSlider').onchange=event=>{const item=(moveLabNavigation.visibleItems||[])[Number(event.target.value)-1];if(item)moveLabRequestNavigation('select',item.id)};document.getElementById('moveLabFileSelect').onchange=event=>moveLabRequestNavigation('select',event.target.value);document.querySelectorAll('[data-move-lab-nav-mode]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'moveLabNavigationMode',generation,mode:button.dataset.moveLabNavMode}));function applyMoveLabChromeAvailability(){const availability=moveLabAvailability({busy:moveLabBusy,hasSource:moveLabHasSource});setMoveLabState(document.querySelector('[data-action="choose"]'),availability.choose,'Choose another character');setMoveLabState(document.querySelector('[data-action="refresh"]'),availability.refresh,'Refresh Move Lab');setMoveLabState(document.getElementById('editSelectedSource'),availability.editSelectedSource,'Edit selected source using the coding preference');setMoveLabState(document.getElementById('openFullTextNative'),availability.openFullTextNative,'Open selected source in the native text editor');setMoveLabState(document.getElementById('returnToMove'),availability.returnToMove,document.getElementById('returnToMove')?.textContent||'Return to Constants');const status=document.getElementById('moveLabStatus');if(status)status.textContent=moveLabBusy?'Working…':'Ready.';renderMoveLabNavigation()}function updateMoveLabToolbar(toolbar,hasSource,busy=false){moveLabHasSource=Boolean(hasSource);moveLabBusy=Boolean(busy);for(const slot of toolbar?.slots||[]){const button=document.querySelector('[data-universal-slot="'+slot.id+'"]');if(!button)continue;button.disabled=!slot.enabled;button.title=slot.enabled?slot.label:slot.label+' — unavailable: '+slot.reason}applyMoveLabChromeAvailability()}window.addEventListener('message',event=>{const message=event.data||{};if(message.type==='moveLabNavigation'&&message.generation===generation&&(!message.requestId||message.requestId>=moveLabNavRequest)){moveLabNavRequest=0;moveLabNavigation=message.navigation;renderMoveLabNavigation()}if(message.type==='moveLabToolbarState'&&message.generation===generation){selectionEpoch=message.selectionEpoch;updateMoveLabToolbar(message.model,message.hasSource,message.busy)}});updateMoveLabToolbar(${safe(fallback)},false,false);renderMoveLabNavigation();${moveLabCloseClientScript()}${require('./shared_workspace_header').clientScript()}${throwHandoff.clientScript()}`;
  return html.replace('</script></div></body>', `${client}</script></div></body>`);
}

function validMoveLabMessage(message) {
  if (!message || (Object.getPrototypeOf(message) !== Object.prototype && Object.getPrototypeOf(message) !== null) || typeof message.type !== 'string') return false;
  const exact = keys => Object.keys(message).sort().join('|') === keys.sort().join('|');
  if (message.type === MESSAGE_TYPE) return exact(['type', 'slotId']) || message.slotId === 'updates' && message.configure === true && exact(['type', 'slotId', 'configure']);
  const generation = Number.isInteger(message.generation) && message.generation >= 0, slot = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[a-z0-9:_-]+$/i.test(value);
  if (['refresh', 'choose', 'moveLabBrowse'].includes(message.type)) return exact(['type', 'generation']) && generation;
  if (message.type === 'preview') return exact(['type', 'generation', 'p1Slot', 'p2Slot']) && generation && slot(message.p1Slot) && slot(message.p2Slot);
  if (message.type === 'moveLabInvoke') return exact(['type', 'generation', 'slot']) && generation && slot(message.slot);
  if(['moveLabThrowInspect','moveLabThrowReview','moveLabThrowContinue','moveLabThrowSource'].includes(message.type)){const fields=['type','generation','selectionEpoch',...(message.type==='moveLabThrowReview'?['choices']:message.type==='moveLabThrowContinue'?['token']:message.type==='moveLabThrowSource'?['slot']:[])];return exact(fields)&&generation&&Number.isSafeInteger(message.selectionEpoch)&&message.selectionEpoch>=0&&(message.type!=='moveLabThrowReview'||throwHandoff.validChoices(message.choices))&&(message.type!=='moveLabThrowContinue'||typeof message.token==='string'&&/^[a-f0-9]{48}$/.test(message.token))&&(message.type!=='moveLabThrowSource'||slot(message.slot));}
  if (message.type === 'moveLabEditSource') return exact(['type', 'generation', 'selectionEpoch', 'presentation']) && generation && Number.isInteger(message.selectionEpoch) && message.selectionEpoch >= 0 && ['preferred', 'native'].includes(message.presentation);
  if (message.type === 'moveLabReturn') return exact(['type', 'generation',...(message.returnToken!==undefined?['returnToken']:[])]) && generation && (message.returnToken===undefined||typeof message.returnToken==='string'&&message.returnToken.length<=128);
  if (message.type === 'moveLabNavigate') return (exact(['type', 'generation', 'requestId', 'action']) || exact(['type', 'generation', 'requestId', 'action', 'id'])) && generation && Number.isInteger(message.requestId) && message.requestId >= 0 && ['previous', 'next', 'select'].includes(message.action) && (message.action !== 'select' || slot(message.id));
  if (message.type === 'moveLabNavigationMode') return exact(['type', 'generation', 'mode']) && generation && ['tabs', 'list', 'cards'].includes(message.mode);
  if (message.type === 'moveLabTimelineScope') return exact(['type', 'generation', 'scopeId']) && generation && slot(message.scopeId);
  if (message.type === 'viewerHistoryRestored') return exact(['type', 'requestId', 'ok']) && Number.isInteger(message.requestId) && message.requestId >= 0 && typeof message.ok === 'boolean';
  return false;
}
function currentNavigationFilename(owner) { const projected = projectNavigation(owner.navigation || moveLabNavigation([], '')); return projected.items.find(item => item.id === projected.currentId)?.filename || ''; }
function reconcileNavigation(files, requested, fallbackCurrent = '') {
  const projected = requested ? projectNavigation(requested) : null, requestedItem = projected?.items.find(item => item.id === projected.currentId);
  return moveLabNavigation(files, requestedItem?.filename || fallbackCurrent, projected?.mode || 'tabs');
}
function prepareCandidate(owner, next, options = {}) {
  const baseGeneration = owner.generation, generation = baseGeneration + 1, files = next.files || [], requestedNavigation = options.navigation || owner.navigation, navigation = reconcileNavigation(files, requestedNavigation, currentNavigationFilename(owner)), routes = new Map(), add = (id, route) => { routes.set(id, Object.freeze({ ...route, id, generation })); return id; };
  let preserved = owner.source;
  if (preserved) { try { const current = sourceText(preserved.filename); if (!files.some(item => item.exists !== false && fileKey(item.filename) === fileKey(preserved.filename)) || fingerprint(current.text) !== preserved.fingerprint || current.version !== preserved.version) preserved = null; } catch (_) { preserved = null; } }
  next.defPath = owner.defPath; next.generation = generation; next.selectionEpoch = owner.selectionEpoch + (preserved ? 1 : 0); next.navigation = projectNavigation(navigation);
  next.files = files.map((item, index) => ({ ...item, routeId: add(`file:${index}`, { kind: 'file', item }) }));
  next.sources = (next.sources || []).map((source, sourceIndex) => ({ ...source, states: (source.states || []).map((node, nodeIndex) => ({ ...node, routeId: add(`outline:${sourceIndex}:${nodeIndex}`, { kind: 'line', filename: source.filename, line: node.line, character: 0, label: node.title }) })) }));
  next.diagnostics = (next.diagnostics || []).map((item, index) => ({ ...item, routeId: add(`diagnostic:${index}`, { kind: 'line', filename: item.filename, line: item.line, character: item.character || 0, label: item.message }) }));
  next.eventTimeline={...(next.eventTimeline||{}),tracks:(next.eventTimeline?.tracks||[]).map(track=>({...track,events:(track.events||[]).map((event,index)=>({...event,routeId:add(`timeline:${track.id}:${index}`,{kind:'timeline',eventId:event.id,filename:event.source.filename,line:event.source.line,sourceFingerprint:event.source.fingerprint,character:0,label:event.label})}))}))};
  next.attacks = { ...(next.attacks || {}), controllers: (next.attacks?.controllers || []).map((item, index) => ({ ...item, routeId: add(`attack:${index}`, { kind: 'attack', reference: item }) })), constantProfiles: (next.attacks?.constantProfiles || []).map((item, index) => ({ ...item, routeId: add(`profile:${index}`, { kind: 'profile', reference: item }) })) };
  next.actionSlots = Object.fromEntries(Object.entries(MOVE_LAB_TOOLS).map(([mode, entries]) => [mode, entries.map(([label, command], index) => [label, add(`tool:${mode}:${index}`, { kind: 'tool', command })])]));
  next.previewSlots = Object.fromEntries((next.visual?.actions || []).map((item, index) => [item.number, add(`preview:${index}`, { kind: 'preview', action: item.number })]));
  return { baseGeneration, generation, model: next, navigation, files: files.map(item => fileKey(item.filename)), connectedFiles: [...new Set(files.filter(item => item.exists !== false && item.filename).map(item => path.resolve(item.filename)))], routes, source: preserved, selectionEpoch: next.selectionEpoch };
}
function ownerCurrent(owner, generation = owner.generation) { return Boolean(owner && !owner.disposed && !owner.tombstone && (typeof owner.isCurrent === 'function' ? owner.isCurrent() : sessions.get(sessionKey(owner.defPath)) === owner) && owner.generation === generation); }
function rebindOwnerContext(owner, files) {
  const register = owner.registerCharacterToolPanel || registerCharacterToolPanel, getModel = owner.getContextModel || authoringContextRegistry.getContextModel;
  owner.contextEntry = register(owner.panel, owner.defPath, 'Move Lab', files); owner.contextModel = getModel?.(owner.contextEntry) || owner.contextModel;
  return owner.contextModel;
}
function commitCandidate(owner, candidate, options = {}) {
  if (!ownerCurrent(owner, candidate.baseGeneration)) return false;
  const previousContext = owner.contextModel?.snapshot?.(), previousSelection = sourceSelection(owner), ownedContextSelection = Boolean(previousContext && previousContext.activeSurfaceId === 'move.lab' && previousSelection && isDeepStrictEqual(previousContext.selection, previousSelection));
  owner.generation = candidate.generation; owner.navigation = candidate.navigation; owner.files = candidate.files; owner.routes = candidate.routes; owner.selectionEpoch = candidate.selectionEpoch;
  owner.p1Action = candidate.model.visual?.p1Action; owner.p2Action = candidate.model.visual?.p2Action; owner.timelineScope=candidate.model.eventTimeline?.scope?.id||'air-only';
  owner.source = candidate.source ? { ...candidate.source, generation: owner.generation, selectionEpoch: owner.selectionEpoch } : null;
  if (owner.contextModel) {
    rebindOwnerContext(owner, candidate.connectedFiles);
    if (ownedContextSelection) { const snapshot = owner.contextModel.update({ selection: owner.source ? sourceSelection(owner) : null, activeSurfaceId: 'move.lab' }); if (owner.source) owner.source.capture = { contextId: snapshot.identity, revision: snapshot.revision, selectionRevision: snapshot.selectionRevision, selection: snapshot.selection }; }
  }
  if (!options.initial) { owner.panel.webview.postMessage({ type: 'model', model: candidate.model }); owner.panel.webview.postMessage({ type: 'moveLabNavigation', requestId: options.requestId || 0, generation: owner.generation, navigation: candidate.model.navigation }); owner.panel.webview.postMessage({ type: 'moveLabToolbarState', model: moveLabToolbarModel(owner), generation: owner.generation, selectionEpoch: owner.selectionEpoch, hasSource: Boolean(owner.source), busy: owner.busy > 0 }); }
  return true;
}
function knownLineSelection(current, filename, line, character = 0) {
  const key = fileKey(filename), connected = (current.files || []).some(item => item.exists !== false && fileKey(item.filename) === key);
  if (!connected || !fs.existsSync(filename)) return null;
  const node = (current.sources || []).find(source => fileKey(source.filename) === key)?.states?.find(item => item.line === line);
  const issue = (current.diagnostics || []).find(item => fileKey(item.filename) === key && item.line === line && (item.character || 0) === character);
  if (!node && !issue) return null;
  const snapshot = sourceText(filename), lines = snapshot.text.split(/\r?\n/);
  if (line >= lines.length) return null;
  return { filename: path.resolve(filename), line, character: Math.min(character, lines[line].length), kind: node ? 'outline' : 'diagnostic', fingerprint: fingerprint(snapshot.text), version: snapshot.version, label: node?.title || issue?.message || path.basename(filename) };
}
function validatedLineSelection(filename, line, kind, label) {
  if (!textSourceFile(filename) || !fs.existsSync(filename) || !Number.isInteger(line) || line < 0) return null;
  const snapshot = sourceText(filename), lines = snapshot.text.split(/\r?\n/);
  if (line >= lines.length) return null;
  return { filename: path.resolve(filename), line, character: 0, kind, fingerprint: fingerprint(snapshot.text), version: snapshot.version, label: label || path.basename(filename) };
}
function fileSelection(current, filename) {
  const item = (current.files || []).find(candidate => candidate.exists !== false && fileKey(candidate.filename) === fileKey(filename));
  if (!item || !fs.existsSync(item.filename) || !textSourceFile(item.filename)) return null;
  const snapshot = sourceText(item.filename);
  return { filename: path.resolve(item.filename), line: 0, character: 0, kind: 'file', fingerprint: fingerprint(snapshot.text), version: snapshot.version, label: item.name || path.basename(item.filename) };
}
function claimMoveLabSource(owner, selection) {
  if (!ownerCurrent(owner)) return false;
  owner.selectionEpoch += 1; owner.source = selection ? { ...selection, id: selection.id || `source:${owner.selectionEpoch}`, generation: owner.generation, selectionEpoch: owner.selectionEpoch } : null;
  if (owner.panel.active && owner.contextModel) { const snapshot = owner.contextModel.update({ selection: sourceSelection(owner), activeSurfaceId: 'move.lab' }); if (owner.source) owner.source.capture = { contextId: snapshot.identity, revision: snapshot.revision, selectionRevision: snapshot.selectionRevision, selection: snapshot.selection }; }
  owner.panel.webview.postMessage({ type: 'moveLabToolbarState', model: moveLabToolbarModel(owner), generation: owner.generation, selectionEpoch: owner.selectionEpoch, hasSource: Boolean(owner.source), busy: owner.busy > 0 });
  return Boolean(selection);
}
function createMoveLabToolbar(owner, services = {}) {
  const exactSources = new ExactSourceRegistry(), navigation = services.navigation || require('./viewer_navigation'), isCurrent = services.isCurrent || (() => sessions.get(sessionKey(owner.defPath)) === owner && !owner.disposed);
  const currentOwner = generation => Boolean(isCurrent() && !owner.disposed && !owner.tombstone && owner.generation === (generation ?? owner.generation));
  exactSources.register({ id: 'move-lab.exact-source', capabilityId: 'implemented.move-lab-source', surfaceId: 'move.lab', resolve: request => {
    const context = owner.contextModel?.snapshot?.(), selected = owner.source;
    if (!currentOwner() || !owner.panel.active || !context || context.activeSurfaceId !== 'move.lab' || !selected || selected.generation !== owner.generation || selected.selectionEpoch !== owner.selectionEpoch) return unavailable('Move Lab no longer owns the active source selection.', request);
    const capture = selected.capture;
    if (!capture || request.contextId !== context.identity || request.contextId !== capture.contextId || Number(request.selectionRevision) !== Number(context.selectionRevision) || request.generation !== owner.generation || request.selectionEpoch !== owner.selectionEpoch || !isDeepStrictEqual(context.selection, capture.selection) || !isDeepStrictEqual(context.selection, sourceSelection(owner))) return unavailable('The complete Move Lab source selection changed before it could be opened.', request);
    const current = sourceText(selected.filename);
    if (fingerprint(current.text) !== selected.fingerprint || current.version !== selected.version) return unavailable('The selected source changed. Select it again before opening.', request);
    return { filename: selected.filename, identity: 'selected-block', line: selected.line, fingerprint: selected.fingerprint, version: selected.version, label: selected.label, access: 'external-editor', mutationOwner: 'native-text-editor', contextId: context.identity, selectionRevision: context.selectionRevision };
  }});
  const resolveExact = async (opener) => {
    const context = owner.contextModel?.snapshot?.(), selected = owner.source;
    if (!context || !selected) return unavailable('Select a current Move Lab source first.');
    const request = { contextId: context.identity, selectionRevision: context.selectionRevision, fingerprint: selected.fingerprint, generation: owner.generation, selectionEpoch: owner.selectionEpoch };
    let result;
    try { result = await exactSources.open('move-lab.exact-source', request, async resolved => { await services.beforeNavigateCheck?.(); const finalContext = owner.contextModel?.snapshot?.(), finalSource = owner.source, current = sourceText(resolved.filename); if (!currentOwner(request.generation) || !owner.panel.active || !finalSource || finalSource.id !== selected.id || finalSource.generation !== request.generation || finalSource.selectionEpoch !== request.selectionEpoch || !finalContext || finalContext.identity !== request.contextId || finalContext.activeSurfaceId !== 'move.lab' || !isDeepStrictEqual(finalContext.selection, selected.capture?.selection) || !isDeepStrictEqual(finalContext.selection, sourceSelection(owner)) || fingerprint(current.text) !== resolved.fingerprint || current.version !== resolved.version) throw new Error('The selected source or owning context changed while it was opening. Nothing was navigated.'); return opener(resolved); }); }
    catch (error) { result = unavailable(error.message, request); }
    if (!result.available) vscode.window.showInformationMessage(result.reason);
    return result;
  };
  const openExact = async () => resolveExact(resolved => navigation.openViewerSource(resolved.filename, resolved.line, navigation.currentPoint(owner.defPath, 'code', { navigationSelection: sourceSelection(owner) }, owner.panel)));
  const editPreferred = async () => resolveExact(resolved => vscode.commands.executeCommand('ikemen.authoringWorkspace.open', vscode.Uri.file(resolved.filename)));
  const command = (id, seeded = true) => async () => vscode.commands.executeCommand(id, ...(seeded ? [vscode.Uri.file(owner.defPath)] : []));
  const characterTarget = target => async () => navigation.openConnected(owner.defPath, target, null, undefined, navigation.currentPoint(owner.defPath, 'code', { navigationSelection: sourceSelection(owner) }, owner.panel));
  const handlers = {
    new: command('ikemen.text.createNew', false), close: async () => { if (await (services.viewerClose || require('./viewer_close')).prepare([owner.panel], vscode) && isCurrent() && !owner.busy) owner.panel.dispose(); }, open: command('workbench.action.files.openFile', false),
    'text-source': openExact, 'connected-resources': async () => { const items = projectNavigation(owner.navigation).visibleItems, picked = await vscode.window.showQuickPick(items.map(item => ({ label: item.label, description:item.kind+' · '+item.filename, item })), { title: 'Move Lab — Connected Files' }); if (!picked || !currentOwner()) return; const current = model(owner.defPath, owner.p1Action, owner.p2Action,owner.timelineScope), selected = fileSelection(current, picked.item.filename); if (selected) return claimMoveLabSource(owner, selected); const extension = path.extname(picked.item.filename).toLowerCase(); if (extension === '.sff') return characterTarget('sff')(); if (extension === '.snd') return characterTarget('snd')(); },
    backup: command('ikemen.makeBackup'), recovery: command('ikemen.mutations.openHistory'), run: command('ikemen.launchGame'), versus: command('ikemen.launchMirrorCurrent'), training: command('ikemen.launchTrainingCurrent'), project: command('ikemen.projectManager.open', false), stage: command('ikemen.stage.openWorkspace'), sprites: characterTarget('sff'), animations: characterTarget('air'), commands: command('ikemen.commandMovelist.openEditor'), states: command('zss.openControllers'), sounds: characterTarget('snd'), palettes: command('ikemen.palette.openWorkspace'), 'code-structure': command('ikemen.codeStructure.openWorkspace'), 'viewer-browser': command('ikemen.authoringBrowser.open'), 'actions-search': command('ikemen.textActions.open', false), 'suite-switch': command('ikemen.switchSuite', false), help: command('ikemen.help.open', false), settings: command('ikemen.openExtensionSettings', false)
  };
  return { dispatcher: createUniversalToolbarDispatcher({ handlersBySurface: { 'move.lab': handlers }, getToolbar: async () => moveLabToolbarModel(owner) }), openExact, editPreferred, resolveExact };
}
function repostCommittedNavigation(owner, requestId = 0) { if (!ownerCurrent(owner)) return false; return owner.panel.webview.postMessage({ type: 'moveLabNavigation', requestId, generation: owner.generation, navigation: projectNavigation(owner.navigation) }); }
async function refresh(owner, options = {}) {
  const generation = owner.generation, build = options.buildModel || owner.buildModel || model;
  let candidate;
  try { candidate = prepareCandidate(owner, build(owner.defPath, options.p1 ?? owner.p1Action, options.p2 ?? owner.p2Action,options.timelineScope??owner.timelineScope??'air-only'), options); }
  catch (error) { if (ownerCurrent(owner, generation)) repostCommittedNavigation(owner, options.requestId || 0); return false; }
  try { if (await options.beforeCommit?.() === false) { if (ownerCurrent(owner, generation)) repostCommittedNavigation(owner, options.requestId || 0); return false; } }
  catch (error) { if (ownerCurrent(owner, generation)) repostCommittedNavigation(owner, options.requestId || 0); return false; }
  if (!ownerCurrent(owner, generation)) return false;
  return commitCandidate(owner, candidate, options);
}
function enqueueOwner(owner, operation, options = {}) {
  const countsBusy = options.countsBusy !== false;
  const run = async () => {
    if (!ownerCurrent(owner)) return false;
    if (countsBusy) { owner.busy += 1; owner.panel.webview.postMessage({ type: 'moveLabToolbarState', model: moveLabToolbarModel(owner), generation: owner.generation, selectionEpoch: owner.selectionEpoch, hasSource: Boolean(owner.source), busy: true }); }
    try { return await operation(); }
    finally {
      if (countsBusy) {
        owner.busy = Math.max(0, owner.busy - 1);
        if (ownerCurrent(owner)) owner.panel.webview.postMessage({ type: 'moveLabToolbarState', model: moveLabToolbarModel(owner), generation: owner.generation, selectionEpoch: owner.selectionEpoch, hasSource: Boolean(owner.source), busy: owner.busy > 0 });
      }
    }
  };
  const result = owner.queue.then(run, run);
  owner.queue = result.then(() => undefined, () => undefined);
  return result;
}
function enqueueMoveLabBodyMessage(owner,message){
  // Source navigation may close this read-only overview. Keep queue ordering,
  // but do not make the handoff veto itself as an in-flight mutation.
  return enqueueOwner(owner,()=>handleMoveLabMessage(owner,message),{countsBusy:message.type!=='moveLabEditSource'});
}
function disposeOwner(owner) {
  if (!owner || owner.tombstone) return;
  owner.tombstone = true; owner.disposed = true; owner.generation += 1; owner.source = null;
  if (owner.timer) clearTimeout(owner.timer);
  for (const disposable of owner.subscriptions || []) { try { disposable?.dispose?.(); } catch (_) {} }
  owner.subscriptions = [];
  if (sessions.get(sessionKey(owner.defPath)) === owner) sessions.delete(sessionKey(owner.defPath));
  if (activeSession === owner) activeSession = null;
}
function scheduleOwnerRefresh(owner) {
  if (!ownerCurrent(owner)) return;
  if (owner.timer) clearTimeout(owner.timer);
  owner.timer = setTimeout(() => { owner.timer = null; enqueueOwner(owner, () => refresh(owner)); }, 180);
}
async function invokeMoveLabRoute(owner, message) {
  if (!ownerCurrent(owner, message.generation)) return false;
  const route = owner.routes.get(message.slot);
  if (!route || route.generation !== owner.generation) return false;
  if (route.kind === 'tool' && MOVE_LAB_COMMANDS.has(route.command)) return vscode.commands.executeCommand(route.command, vscode.Uri.file(owner.defPath));
  const current = model(owner.defPath, owner.p1Action, owner.p2Action,owner.timelineScope);
  if (route.kind === 'file') {
    const selected = fileSelection(current, route.item.filename);
    if (selected) return claimMoveLabSource(owner, { ...selected, id: route.id });
    const extension = path.extname(route.item.filename).toLowerCase();
    if (extension === '.sff') return require('./viewer_navigation').openConnected(owner.defPath, 'sff');
    if (extension === '.snd') return require('./viewer_navigation').openConnected(owner.defPath, 'snd');
    return false;
  }
  if (route.kind === 'line') {
    const selected = knownLineSelection(current, route.filename, route.line, route.character || 0);
    return claimMoveLabSource(owner, selected ? { ...selected, id: route.id } : null);
  }
  if(route.kind==='timeline'){
    const event=(current.eventTimeline?.tracks||[]).flatMap(track=>track.events||[]).find(item=>item.id===route.eventId&&fileKey(item.source?.filename)===fileKey(route.filename)&&item.source?.line===route.line&&item.source?.fingerprint===route.sourceFingerprint);
    if(!event)return vscode.window.showWarningMessage('That timeline event changed. Refresh Move Lab and choose it again.');
    const selected=validatedLineSelection(event.source.filename,event.source.line,'event-timeline',event.label);return claimMoveLabSource(owner,selected?{...selected,id:route.id}:null);
  }
  if (route.kind === 'attack') {
    const attack = validAttackReference(route.reference, current.attacks);
    if (!attack) return vscode.window.showWarningMessage('That HitDef changed. Refresh Move Lab and choose it again.');
    claimMoveLabSource(owner, { ...validatedLineSelection(attack.filename, attack.line, 'hitdef', attack.label), id: route.id });
    return vscode.commands.executeCommand('ikemen.hitDef.openEditor', vscode.Uri.file(attack.filename), { preset: true, reference: { sourceHash: attack.sourceHash, index: attack.index, defPath: owner.defPath, p2Action: owner.p2Action } });
  }
  if (route.kind === 'profile') {
    const displayed = constantsReferenceFor(route.reference, owner.defPath);
    if (!validConstantsReference(displayed, current, owner.defPath)) return vscode.window.showWarningMessage('That constants profile changed. Refresh Move Lab and choose it again.');
    const profile = current.attacks.constantProfiles.find(item => item.id === displayed.profileId);
    return vscode.commands.executeCommand('ikemen.moveConstants.open', vscode.Uri.file(owner.defPath), { integration: 'constants', reference: constantsReferenceFor(profile, owner.defPath) });
  }
  return false;
}
async function handleMoveLabThrow(owner,message){
  if(message.selectionEpoch!==owner.selectionEpoch||!owner.panel.active)return false;
  const current=model(owner.defPath,owner.p1Action,owner.p2Action,owner.timelineScope),read=filename=>sourceText(filename).text,evidence=throwHandoff.inspectHandshake(current,owner.source,read);
  if(message.type==='moveLabThrowSource'){const link=owner.throwLinks?.get(message.slot);if(!link||fingerprint(read(link.filename))!==link.hash)return false;return require('./viewer_navigation').openViewerSource(link.filename,link.line,require('./viewer_navigation').currentPoint(owner.defPath,'code',{},owner.panel));}
  if(message.type==='moveLabThrowInspect'){owner.panel.webview.postMessage({type:'moveLabThrowEvidence',generation:message.generation,selectionEpoch:message.selectionEpoch,evidence:throwHandoff.inspectProof(owner,evidence,String(owner.selectionEpoch),[owner.defPath,current.assets?.air,current.assets?.constants,...(current.assets?.code||[])].filter(Boolean),read)});return true;}
  if(message.type==='moveLabThrowReview'){
    if(!throwHandoff.inspectionCurrent(owner,message.choices?.inspectionToken,String(owner.selectionEpoch),read))return false;
    const review=throwHandoff.reviewHandshake(current,evidence,message.choices),source=owner.source?{...owner.source}:null,epoch=owner.selectionEpoch,originP1=owner.p1Action,originP2=owner.p2Action,originScope=owner.timelineScope,reference=throwHandoff.createTicket({owner,defPath:owner.defPath,review,proofs:[owner.defPath,current.assets?.air,current.assets?.constants,...(current.assets?.code||[]),source?.filename].filter(Boolean),read,current:()=>ownerCurrent(owner)&&owner.selectionEpoch===epoch,restore:()=>enqueueOwner(owner,async()=>{if(!ownerCurrent(owner)||owner.selectionEpoch!==epoch)return false;await refresh(owner,{p1:originP1,p2:originP2,timelineScope:originScope});if(source)claimMoveLabSource(owner,source);owner.panel.reveal(undefined,false);owner.panel.webview.postMessage({type:'moveLabThrowRestore',mode:review.choices.mode,tick:review.choices.tick,frame:review.choices.frame,timelineScope:review.choices.timelineScope});return true;},{countsBusy:false})});
    owner.throwTicket=reference;owner.panel.webview.postMessage({type:'moveLabThrowReviewed',generation:message.generation,selectionEpoch:message.selectionEpoch,token:reference.token,review});return true;
  }
  if(message.type==='moveLabThrowContinue'){
    const reference=owner.throwTicket;if(reference?.token!==message.token||!throwHandoff.ticket(reference,owner.defPath)?.review.canContinue)return false;
    const panel=await vscode.commands.executeCommand('ikemen.throwCreator.open',vscode.Uri.file(owner.defPath),{handshake:reference});if(!panel)owner.panel.webview.postMessage({type:'moveLabThrowStatus',text:'Throw Creator was not changed. Resolve the retained draft or changed source and review again.'});return Boolean(panel);
  }
  return false;
}
async function handleMoveLabMessage(owner, message) {
  if (!ownerCurrent(owner, message.generation)) return false;
  if(message.type?.startsWith('moveLabThrow'))return handleMoveLabThrow(owner,message);
  if(message.type==='moveLabBrowse'){if(!owner.panel.active)return false;return vscode.commands.executeCommand('ikemen.moveConstants.open',vscode.Uri.file(owner.defPath),{integration:'shell',browseBehaviors:true});}
  if (message.type === 'refresh') return refresh(owner);
  if (message.type === 'choose') { const chosen = await chooseCharacterDef(undefined, { title: 'Move Lab — Choose Character' }); if (chosen && ownerCurrent(owner, message.generation)) return openMoveLab(vscode.Uri.file(chosen)); return false; }
  if (message.type === 'preview') {
    const p1 = owner.routes.get(message.p1Slot), p2 = owner.routes.get(message.p2Slot);
    if (!p1 || !p2 || p1.kind !== 'preview' || p2.kind !== 'preview' || p1.generation !== owner.generation || p2.generation !== owner.generation) return false;
    return refresh(owner, { p1: p1.action, p2: p2.action });
  }
  if(message.type==='moveLabTimelineScope'){
    const current=model(owner.defPath,owner.p1Action,owner.p2Action,owner.timelineScope),scope=(current.eventTimeline?.availableScopes||[]).find(item=>item.id===message.scopeId);if(!scope)return false;return refresh(owner,{timelineScope:scope.id});
  }
  if (message.type === 'moveLabInvoke') return invokeMoveLabRoute(owner, message);
  if (message.type === 'moveLabEditSource') {
    if (message.selectionEpoch !== owner.selectionEpoch || !owner.source) return false;
    return message.presentation === 'native' ? owner.toolbar.openExact() : owner.toolbar.editPreferred();
  }
  if (message.type === 'moveLabReturn') {
    const reference = owner.returnTo;
    if(reference?.kind==='stage'&&message.returnToken!==reference.token)return false;
    if(reference?.kind==='stage'){const returned=await require('./stage_attached_move_lab').returnToStage(reference,owner.defPath);if(!returned)await vscode.window.showWarningMessage('Return to Stage is unavailable because the retained Stage or its attached-entity binding changed. Open the Stage and choose Edit linked entity again.');return returned;}
    const current = model(owner.defPath, owner.p1Action, owner.p2Action,owner.timelineScope);
    if (!validConstantsReference(reference, current, owner.defPath)) return vscode.window.showWarningMessage('That constants profile changed. Choose it again from Move Lab.');
    return vscode.commands.executeCommand('ikemen.moveConstants.open', vscode.Uri.file(owner.defPath), { integration: 'constants', reference });
  }
  if (message.type === 'moveLabNavigate') {
    let navigation;
    try { navigation = reduceNavigation(owner.navigation, message.action === 'select' ? { type: 'select', id: message.id } : { type: message.action }); } catch (_) { return false; }
    if (!projectNavigation(navigation).currentId) return false;
    if (!await refresh(owner, { navigation, requestId: message.requestId })) return false;
    const committed = projectNavigation(owner.navigation), item = committed.items.find(candidate => candidate.id === committed.currentId), fileRoutes = [...owner.routes.values()].filter(route => route.kind === 'file').map(route => route.item), selected = item ? fileSelection({ files: fileRoutes }, item.filename) : null;
    return claimMoveLabSource(owner, selected ? { ...selected, id: `navigation:${owner.generation}:${item.id}` } : null);
  }
  if (message.type === 'moveLabNavigationMode') {
    let navigation;
    try { navigation = reduceNavigation(owner.navigation, { type: 'set-mode', mode: message.mode }); } catch (_) { return false; }
    return refresh(owner, { navigation });
  }
  return false;
}
async function openMoveLab(seed, options = {}) {
  let defPath = nearestCharacterDef(seed?.fsPath || vscode.window.activeTextEditor?.document.fileName || '');
  if (!defPath) defPath = await chooseCharacterDef(seed, { title: 'Move Lab — Choose Character' });
  if (!defPath) return;
  if (!options?.preset && (options?.legacyIntegration === true || options?.integration === 'legacy-auto')) {
    const contexts = require('./move_lab_context'), remembered = contexts.current(defPath);
    const current = model(defPath,undefined,undefined,'air-only');
    if (remembered?.kind === 'constants') {
      if (validConstantsReference(remembered.reference, current, defPath)) return vscode.commands.executeCommand('ikemen.moveConstants.open', vscode.Uri.file(defPath), { integration: 'constants', reference: remembered.reference });
      contexts.clear(defPath, remembered);
    }
    if (remembered?.kind === 'direct') {
      const component=validComponentReference(remembered.reference,{components:current.components||[]},defPath);
      if(component)return vscode.commands.executeCommand('ikemen.moveConstants.open',vscode.Uri.file(defPath),{integration:'shell',reference:{componentReference:componentReference(component,defPath)}});
      contexts.clear(defPath,remembered);
    }
    if((current.components||[]).length||(current.attacks?.constantProfiles||[]).length)return vscode.commands.executeCommand('ikemen.moveConstants.open',vscode.Uri.file(defPath),{integration:'shell'});
  }
  const reference = options?.preset ? options.reference : { defPath, mode: 'overview' };
  if (reference?.defPath && sessionKey(reference.defPath) !== sessionKey(defPath)) return;
  const key = sessionKey(defPath), existing = sessions.get(key);
  if (existing) { if (reference && !validMoveReference(reference, model(defPath, existing.p1Action, existing.p2Action,reference.timelineScope||existing.timelineScope), defPath)) return; activeSession = existing; existing.returnTo = reference.returnTo || null; existing.panel.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); existing.panel.webview.postMessage({ type: 'viewerHistoryRestore', requestId: 0, reference }); return existing.panel; }
  const initial = model(defPath, reference?.p1Action, reference?.p2Action,reference?.timelineScope||'air-only'); if (reference && !validMoveReference(reference, initial, defPath)) return;
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMoveLab', 'Move Lab', preferredViewerColumn(vscode.ViewColumn.Active, vscode.window.activeTextEditor?.viewColumn), { enableScripts: true, retainContextWhenHidden: true }));
  const owner = activeSession = { panel, defPath, p1Action: initial.visual?.p1Action, p2Action: initial.visual?.p2Action, timelineScope:initial.eventTimeline?.scope?.id||'air-only', files: [], navigation: moveLabNavigation(initial.files, ''), source: null, contextEntry: null, contextModel: null, toolbar: null, routes: new Map(), generation: 0, selectionEpoch: 0, busy: 0, disposed: false, tombstone: false, queue: Promise.resolve(), timer: null, subscriptions: [], returnTo: reference?.returnTo || null };
  sessions.set(key, owner); initial.defPath = defPath; initial.presetReference = reference;
  const candidate = prepareCandidate(owner, initial); commitCandidate(owner, candidate, { initial: true });
  owner.contextEntry = registerCharacterToolPanel(panel, defPath, 'Move Lab', candidate.connectedFiles); owner.contextModel = authoringContextRegistry.getContextModel?.(owner.contextEntry) || null; owner.toolbar = createMoveLabToolbar(owner);
  panel.webview.html = require('./webview_policy').protect(page(candidate.model, moveLabToolbarModel(owner)), panel.webview.cspSource); require('./viewer_sessions').register(panel, defPath, 'move_lab', true); require('./viewer_close').support(panel, { isBusy: () => owner.busy > 0 });
  owner.subscriptions.push(vscode.workspace.onDidChangeTextDocument?.(event => { if (owner.files.includes(fileKey(event.document.fileName))) scheduleOwnerRefresh(owner); }), vscode.languages.onDidChangeDiagnostics?.(() => scheduleOwnerRefresh(owner)));
  owner.subscriptions = owner.subscriptions.filter(Boolean);
  const viewStateSubscription = panel.onDidChangeViewState?.(event => { if (event.webviewPanel.active && owner.source) enqueueOwner(owner, () => claimMoveLabSource(owner, { ...owner.source, capture: undefined }), { countsBusy: false }); });
  if (viewStateSubscription) owner.subscriptions.push(viewStateSubscription);
  panel.onDidDispose(() => disposeOwner(owner));
  const receiverSubscription = panel.webview.onDidReceiveMessage(async message => {
    if(await require('./shared_workspace_header').handle(message,{...owner,filename:owner.defPath},'code'))return;
    if (message?.type === MESSAGE_TYPE) {
      if (!validMoveLabMessage(message)) return;
      const dispatch = async () => { try { return await owner.toolbar.dispatcher.dispatch('move.lab', message); } catch (error) { return vscode.window.showInformationMessage(error.message); } };
      return message.slotId === 'close' ? dispatch() : enqueueOwner(owner, dispatch, { countsBusy: false });
    }
    if (!validMoveLabMessage(message)) return;
    if (message.type === 'viewerHistoryRestored') return handleLaunchMessage(message, owner.defPath, 'code', panel);
    return enqueueMoveLabBodyMessage(owner,message);
  });
  if (receiverSubscription) owner.subscriptions.push(receiverSubscription);
  return panel;
}
function registerMoveLab(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.moveLab.open', (uri, options) => openMoveLab(uri, options)),
    vscode.commands.registerCommand('ikemen.moveLab.inspectCurrent', () => {
      const session = activeSession; if (!session) return null;
      const current = model(session.defPath, session.p1Action, session.p2Action,session.timelineScope);
      return {
        title: session.panel.title,
        defPath: session.defPath,
        context: current.context,
        visualState: current.visual?.state,
        p1Action: current.visual?.p1Action,
        p2Action: current.visual?.p2Action,
        files: current.files.map((item) => ({ kind: item.kind, name: item.name, exists: item.exists, ownership: item.ownership })),
        totals: current.totals,
        attackControllers: current.attacks?.controllers?.length || 0,
        modularMoveProfiles: current.attacks?.constantProfiles?.length || 0,
        throwPlans: current.throws?.plans?.length || 0,
        modes: ['overview', 'attack', 'throw', 'animation', 'spatial', 'helpers', 'resources', 'code', 'tests']
      };
    })
  );
}
module.exports = { handleMoveLabThrow, registerMoveLab, diagnosticsFor, visualModel, timelineScopeOptions, selectTimelineScope, model, page, rawPage, openMoveLab, moveLabCloseClientScript, validMoveReference, validConstantsReference, validAttackReference, constantsReferenceFor, moveLabControlAvailability, moveLabListNavigation, moveLabNavigation, reconcileNavigation, moveLabToolbarModel, validMoveLabMessage, fileSelection, knownLineSelection, validatedLineSelection, createMoveLabToolbar, sourceSelection, prepareCandidate, rebindOwnerContext, commitCandidate, repostCommittedNavigation, refresh, claimMoveLabSource, enqueueOwner, enqueueMoveLabBodyMessage, disposeOwner, scheduleOwnerRefresh, handleMoveLabMessage, invokeMoveLabRoute };
