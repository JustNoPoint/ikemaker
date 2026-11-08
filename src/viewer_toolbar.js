'use strict';
const headerContext = require('./header_context_options');

const path = require('path');
const { SLOTS, DIMENSIONS, deepFreeze } = require('./viewer_toolbar_contract');
const { renderUniversalToolbar, universalToolbarStyle } = require('./universal_toolbar_webview');

const ACTIONS = Object.freeze(['back', 'forward', 'back-source', 'used-by', 'related', 'air', 'sff', 'snd', 'source', 'pinned', 'compare', 'game', 'versus', 'training', 'backup', 'autosave']);
const BASE_MENU_COMMANDS = [
  'sff.quickTransfer','air.quickTransfer','snd.quickTransfer',
  'workbench.action.files.newUntitledFile', 'workbench.action.files.openFile', 'workbench.action.files.save', 'workbench.action.files.saveAs',
  'workbench.action.closeActiveEditor', 'workbench.action.closeAllEditors', 'workbench.action.closeOtherEditors',
  'workbench.action.moveEditorToNewWindow', 'workbench.action.restoreEditorsToMainWindow',
  'undo', 'redo', 'editor.action.clipboardCutAction', 'editor.action.clipboardCopyAction', 'editor.action.clipboardPasteAction',
  'actions.find', 'editor.action.startFindReplaceAction', 'workbench.actions.view.problems', 'workbench.action.output.toggleOutput', 'workbench.view.debug',
  'sff.createNew', 'air.createNew', 'snd.createNew', 'sff.openViewer', 'air.openAnimationPreview', 'snd.openViewer', 'sff.openAssembly', 'sff.openAddSprites', 'sff.openCreator',
  'ikemen.stage.openStart','ikemen.ui.openStart','ikemen.storyboard.openStart','ikemen.file.createNew', 'zss.createNew', 'cns.createNew', 'ikemen.stage.createNew', 'ikemen.stage.createFromPngLayers', 'ikemen.ui.createNew', 'ikemen.storyboard.create',
  'ikemen.palette.openWorkspace', 'ikemen.palette.createTemplate', 'zss.openPalFxEditor', 'ikemen.commandMovelist.openEditor', 'ikemen.codeStructure.openWorkspace',
  'ikemen.palettePlayer.organize', 'ikemen.palettePlayer.finishStaged', 'ikemen.paletteImport.open', 'ikemen.openPaletteFolder', 'ikemen.maps.openBrowser',
  'ikemen.mutations.openHistory', 'ikemen.impact.preview', 'ikemen.characterDependencies.open', 'ikemen.characterHealth.open',
  'ikemen.productionWorkflow.open', 'ikemen.testSessions.open', 'ikemen.animationStandards.open', 'ikemen.projectManager.open', 'ikemen.engineRegistry.open',
  'ikemen.character.open', 'ikemen.character.close', 'ikemen.context.show', 'ikemen.context.openRegistry',
  'ikemen.character.createNew', 'ikemen.character.firstPlayableAttack', 'ikemen.launchTrainingCurrent', 'ikemen.launchMirrorCurrent', 'ikemen.restartRunning',
  'ikemen.workspacePreset.save', 'ikemen.workspacePreset.restore', 'ikemen.authoring.openRecipes', 'ikemen.authoring.openFavorites', 'ikemen.authoring.openExamples', 'ikemen.authoring.openSymbols',
  'ikemen.hitDef.openEditor', 'ikemen.moveLab.open', 'ikemen.helperLab.open', 'ikemen.throwCreator.open', 'ikemen.explodComposer.open', 'ikemen.positionCamera.open', 'ikemen.trajectory.openAssist',
  'ikemen.def.openVisualWorkspace', 'ikemen.cnsConverter.open', 'zss.openProjectData', 'zss.openControllers', 'ikemen.workbench.open',
  'ikemen.stage.openWorkspace', 'ikemen.stage.launchRig', 'ikemen.ui.openWorkspace', 'ikemen.selectDef.openWorkspace', 'ikemen.menuModes.openCreator', 'ikemen.storyDialogue.openCreator', 'ikemen.storyboard.open', 'ikemen.showPlatformCapabilities',
  'ikemen.release.openProfile', 'ikemen.release.captureDefaults', 'ikemen.release.audit', 'ikemen.release.complete',
  'sff.auditCharacterRequirements', 'sff.reviewUnassignedSprites', 'sff.createMissingAxisCopies', 'sff.openRequirementsProfile',
  'sff.applyProjectIndexing', 'sff.buildApprovedManifest', 'sff.createProjectBuildProfile',
  'sff.openGroupLog', 'sff.generateBuildFiles', 'sff.openProjectBuildProfile', 'sff.cropArchive', 'sff.suggestAxes', 'sff.openBrowser', 'sff.openSprMakerText',
  'sff.importLayerFolder', 'sff.reviewLayerParts', 'sff.reviewRedundantLayers', 'sff.reviewDismissedLayerWarnings', 'sff.openAliasRegistry', 'sff.showNamingStandard', 'sff.showArtistHandoffGuide', 'sff.addCharacterRequirement', 'ikemen.artistIntake.open',
  'air.openActionLog', 'air.batchApplyClsn2', 'air.assignClsn2HitReactionRegion', 'air.generateGuardProximityHelper',
  'air.toggleBrowser', 'air.browseLists', 'sff.toggleBrowser', 'sff.browseLists', 'snd.browseLists', 'snd.openMakerText', 'zss.audit.currentFile', 'zss.audit.workspace',
  'zss.goToLine', 'zss.toggleLineComment',
  'ikemen.openHome', 'ikemen.openExtensionSettings', 'ikemen.help.open', 'ikemen.help.credits', 'ikemen.docs.openOffline',
  'ikemen.textToolbar.toggleHeaderOnlyLayout',
  'ikemen.switchSuite', 'ikemen.openIKeMeter', 'ikemen.switchToIkeMiner', 'ikeminer.open', 'ikeminer.session.create', 'ikeminer.session.open'
];
const PACKAGE_ACTION_CATALOG = require('./viewer_action_registry').publicCommandCatalog();
const MENU_COMMANDS = Object.freeze(new Set([...BASE_MENU_COMMANDS, ...PACKAGE_ACTION_CATALOG.actions.map(action=>action.command)]));
const SHORTCUTS = Object.freeze({
  'workbench.action.files.newUntitledFile':'Ctrl+N','workbench.action.files.openFile':'Ctrl+O','workbench.action.files.save':'Ctrl+S','workbench.action.files.saveAs':'Ctrl+Shift+S',
  'workbench.action.closeActiveEditor':'Ctrl+W','workbench.action.closeAllEditors':'Ctrl+Shift+W','workbench.action.closeOtherEditors':'Ctrl+Alt+W',
  undo:'Ctrl+Z',redo:'Ctrl+Y','editor.action.clipboardCutAction':'Ctrl+X','editor.action.clipboardCopyAction':'Ctrl+C','editor.action.clipboardPasteAction':'Ctrl+V',
  'actions.find':'Ctrl+F','editor.action.startFindReplaceAction':'Ctrl+H'
});
const ACTION_EFFECTS = Object.freeze({
  'air:newAction': ['The open AIR document after form review and final confirmation.', 'The attached SFF, sprites, references, and runtime-plan metadata.'],
  'air:duplicateAction': ['A byte-preserving copy in the open AIR after confirmation.', 'The source action, SFF, references, and runtime-plan metadata.'],
  'air:deleteSelectedActions': ['The exact selected AIR action ranges after confirmation.', 'SFF data, references, and runtime-plan metadata.'],
  'air:addFrame': ['The selected AIR action through its reviewed frame owner.', 'The attached SFF and unrelated AIR actions.'],
  'air:duplicateFrame': ['The selected AIR action through its reviewed frame owner.', 'The attached SFF and unrelated AIR actions.'],
  'air:deleteFrame': ['The selected AIR action through its reviewed frame owner.', 'The attached SFF and unrelated AIR actions.'],
  'sff:[data-action="addSprites"]': ['The reviewed backend-neutral Creator plan.', 'The loaded SFF until the selected backend produces and validates a candidate.'],
  'sff:[data-action="addSpritesManifest"]': ['The explicitly chosen legacy SprMaker2 CSV manifest.', 'The loaded SFF and selected PNG sources.'],
  'sff:[data-action="deleteSprite"]': ['The selected complete sprite entries in the loaded SFF.', 'Nothing outside the loaded SFF; Undo restores the preceding archive.'],
  'sff:[data-action="deleteGroup"]': ['Every complete sprite entry in the chosen group of the loaded SFF.', 'Nothing outside the loaded SFF; Undo restores the preceding archive.'],
  'sff:[data-action="duplicateSprite"]': ['A new linked sprite entry in the loaded SFF.', 'The original sprite image data; Undo removes the duplicate.'],
  'sff:[data-action="deleteSpriteManifest"]': ['The explicitly chosen legacy SprMaker2 CSV manifest.', 'The loaded SFF until the legacy manifest is rebuilt and separately adopted.'],
  'sff:[data-action="deleteGroupManifest"]': ['The explicitly chosen legacy SprMaker2 CSV manifest.', 'The loaded SFF until the legacy manifest is rebuilt and separately adopted.'],
  'sff:[data-action="duplicateSpriteManifest"]': ['The explicitly chosen legacy SprMaker2 CSV manifest.', 'The loaded SFF until the legacy manifest is rebuilt and separately adopted.'],
  'sff:[data-action="changeImage"]': ['The reviewed backend-neutral Creator replacement plan.', 'The loaded SFF until a private candidate passes validation and is explicitly adopted.'],
  'sff:[data-action="cropImages"]': ['A reviewed derived-image/build plan.', 'Original source images and the loaded SFF.'],
  'snd:add': ['Reviewed SndMaker build manifest after confirmation.', 'The loaded SND archive until a separate reviewed rebuild.'],
  'snd:delete': ['Reviewed SndMaker build manifest after confirmation.', 'Source WAV files and the loaded SND archive.'],
  'snd:replace': ['Reviewed SndMaker build manifest after confirmation.', 'The loaded SND archive until a separate reviewed rebuild.'],
  'snd:mark': ['Viewer selection metadata only.', 'Project files, source WAVs, and the SND archive.'],
  'snd:markVisibleSounds': ['Viewer selection metadata only.', 'Project files, source WAVs, and the SND archive.'],
  'snd:clearSoundMarks': ['Viewer selection metadata only.', 'Project files, source WAVs, and the SND archive.'],
  'snd:export': ['A new WAV copy at the location you choose.', 'The loaded SND archive and its reviewed manifest.'],
  'snd:exportMarked': ['New WAV copies in the folder you choose.', 'The loaded SND archive and its reviewed manifest.'],
  'snd:sndExportRange': ['A new PCM WAV containing the reviewed A–B range.', 'The source WAV, loaded SND archive, and reviewed manifest.'],
  'snd:openEditor': ['A temporary WAV may be changed by the external editor.', 'The loaded SND archive and reviewed manifest; replacement remains explicit.'],
  'snd:chooseEditor': ['The shared audio-editor preference.', 'Sound data, manifests, and the loaded archive.'],
  'snd:nameEvent': ['The sound profile event name after review.', 'Sound identity and the loaded SND archive.'],
  'snd:copyCall': ['Clipboard text only.', 'Project files, manifests, and the loaded SND archive.'],
  'snd:copySoundBridge': ['Clipboard text only.', 'Project files, manifests, and the loaded SND archive.'],
  'snd:assignArchive': ['The sound profile archive assignment after selection.', 'The loaded SND archive and source WAV data.'],
  'snd:openProfile': ['Nothing; opens or creates the profile through its owning workflow.', 'The loaded SND archive.'],
  'snd:openManifest': ['Nothing; opens the authoritative build text.', 'The loaded SND archive.'],
  'snd:openRawMakerText': ['Nothing; opens selected SndMaker text.', 'The loaded SND archive.'],
  'snd:scanReferences': ['Nothing; creates a read-only reference report.', 'Project source and sound data.'],
  'snd:auditContract': ['Nothing; creates a read-only contract report.', 'Profiles, manifests, and sound data.'],
  'snd:createBuild': ['A reviewed build workspace, exported WAV sources, manifest, and profile link.', 'The active SND archive.'],
  'snd:rebuild': ['The reviewed manifest output after confirmation and successful verification.', 'Manifest identities and source WAVs.'],
  'snd:sortManifest': ['SndMaker manifest order after confirmation.', 'Group/index identities and the loaded SND archive.'],
  'snd:generateFx': ['A reviewed CommonFX DEF file after confirmation.', 'The SND archive and sound profile.'],
  'snd:generateAllFx': ['Reviewed CommonFX DEF files after confirmation.', 'SND archives and sound profiles.'],
  'snd:copyDefLine': ['Clipboard text only.', 'Project files, profiles, and sound data.'],
  'snd:stop': ['Playback position only.', 'Project files and sound data.'],
  'snd:special:audio-play': ['Playback state only.', 'Project files and sound data.'],
  'snd:special:audio-loop': ['Viewer playback preference and state only.', 'Project files and sound data.'],
  'snd:special:audio-pause': ['Playback state only.', 'Project files and sound data.']
});
const KEY = 'ikemaker.viewerToolbars.v1';
const ACTIVITY_KEY = 'ikemaker.viewerToolbarActivity.v1';
let storage = null, preferences = {}, activityPreferences = {}, writing = Promise.resolve();
const panels = new Map(), readyWaiters = new Map(), panelSeeds = new WeakMap();
const ASSET_SURFACES = Object.freeze(['sff', 'air', 'snd']);
const PARITY_GROUPS = Object.freeze(['View', 'Palettes', 'Sprites', 'Animations', 'Sounds', 'Review', 'Build', 'Stage', 'Screenpack', 'Tools', 'Help']);
const MENU_ORDER = Object.freeze(['Project','Edit','View','Palettes','Sprites','Animations','Sounds','Review','Build','Stage','Screenpack','Tools','Help','More']);
const CONTEXT_FREE_COMMANDS = Object.freeze(new Set([
  'workbench.action.files.newUntitledFile','workbench.action.files.openFile','workbench.action.closeActiveEditor','workbench.action.closeAllEditors','workbench.action.closeOtherEditors',
  'workbench.action.moveEditorToNewWindow','workbench.action.restoreEditorsToMainWindow',
  'workbench.actions.view.problems','workbench.action.output.toggleOutput','workbench.view.debug',
  'ikemen.openHome','ikemen.changeMode','ikemen.openTools','ikemen.openExtensionSettings','ikemen.help.open','ikemen.help.credits','ikemen.docs.openOffline','ikemen.showVersion','ikemen.showPlatformCapabilities','ikemen.showBundledToolchain','ikemen.restartRunning',
  'ikemen.engineMigration.installRetained','zss.updates.checkNow','ikemen.extensionUpdates.restoreBackup',
  'ikemen.launchTrainingConfigured','ikemen.updates.configureFrequency','ikemen.configureAssetWorkspace',
  'ikemen.switchSuite','ikemen.openIKeMeter','ikemen.switchToIkeMiner','ikeminer.open','ikeminer.session.create','ikeminer.session.open',
  'ikemen.textToolbar.toggleHeaderOnlyLayout','ikemen.maps.configureTextGrammar','ikemen.openLauncherSettings','ikemen.extensionUpdates.settings',
  'ikemen.stage.openStart','ikemen.ui.openStart','ikemen.storyboard.openStart','ikemen.projectManager.open','ikemen.engineRegistry.open','ikemen.shader.openWorkshop','ikemen.stage.createNew','ikemen.stage.createFromPngLayers','ikemen.stage.openWorkspace','ikemen.stage.launchRig','ikemen.ui.createNew','ikemen.ui.openWorkspace','ikemen.selectDef.openWorkspace','ikemen.menuModes.openPlayer','ikemen.menuModes.openCreator','ikemen.storyDialogue.openPlayer','ikemen.storyDialogue.openCreator','ikemen.storyboard.create','ikemen.storyboard.open'
  ,'ikemen.file.createNew','zss.createNew','cns.createNew','sff.createNew','air.createNew','snd.createNew','sff.openViewer','air.openAnimationPreview','snd.openViewer','snd.chooseAudioEditor','ikemen.windowsFileAssociations.configure','ikemen.palette.createTemplate','ikemen.palette.createScratch','ikemen.palette.openWorkspace','ikemen.character.createNew','ikemen.character.firstPlayableAttack','ikemen.character.open'
]));
const SEED_COMMANDS = Object.freeze(new Set([
  'ikemen.character.close','ikemen.context.show','ikemen.context.openRegistry','ikemen.relatedWork.open','ikemen.makeBackup','ikemen.mutations.openHistory',
  'ikemen.workspacePreset.save','ikemen.workspacePreset.restore','ikemen.productionWorkflow.open','ikemen.testSessions.open','ikemen.characterDependencies.open','ikemen.characterHealth.open','ikemen.impact.preview',
  'ikemen.palettePlayer.organize','ikemen.palettePlayer.finishStaged','ikemen.paletteImport.open','ikemen.openPaletteFolder','zss.openPalFxEditor','ikemen.maps.openBrowser',
  'ikemen.commandMovelist.openEditor','ikemen.codeStructure.openWorkspace','ikemen.moveLab.open','ikemen.moveConstants.open','ikemen.hitDef.openEditor','ikemen.helperLab.open','ikemen.throwCreator.open','ikemen.explodComposer.open','ikemen.positionCamera.open','ikemen.trajectory.openAssist','zss.openControllers','zss.openProjectData','ikemen.cnsConverter.open',
  'ikemen.launchGame','ikemen.launchMirrorCurrent','ikemen.launchTrainingCurrent','ikemen.reviewRetryLoadOnError','ikemen.release.openProfile','ikemen.release.captureDefaults','ikemen.release.audit','ikemen.release.complete'
  ,'sff.openViewer','sff.openCreator','sff.openAssembly','sff.openBrowser','sff.compareSprMake2WithBuiltIn','sff.suggestAxes','sff.refreshGroupLog','air.openAnimationPreview','air.refreshActionLog','ikemen.air.openSelectedAnimationReference','snd.openViewer','snd.openMakerText'
]));
const TEXT_COMMAND = /^(?:undo|redo|actions\.find|editor\.|workbench\.action\.files\.save|workbench\.action\.files\.saveAs|zss\.|cns\.|cmd\.|inp\.|ikemen\.text)/;
const SELECTION_REQUIRED_COMMAND = /^(?:zss\.wrap\.|cns\.scaleSelected)/i;
const WRITABLE_TEXT_COMMAND = /^(?:zss\.wrap\.|cns\.scaleSelected|zss\.toggleLineComment$|editor\.action\.clipboard(?:Cut|Paste)Action$)/i;

function resolveActionAvailability(item,{surface='',seed='',vscode,active=true}={}) {
  const unavailable=reason=>({enabled:false,reason:String(reason).slice(0,1024)}),available={enabled:true,reason:''};
  if(active===false)return unavailable('Activate this viewer before using its actions.');
  if(!item||item.separator)return unavailable('This catalog entry is not an action.');
  if(item.unavailableReason)return unavailable(item.unavailableReason);
  if(['ikemen.stage.createNew','ikemen.stage.createFromPngLayers','ikemen.ui.createNew','ikemen.storyboard.create'].includes(item.command)&&require('./interface_mode').current()==='player')return unavailable('Switch to an authoring mode to create files.');
  if(item.targetSurface){const targetCommand=String(item.targetAction||'').startsWith('command.')?String(item.targetAction).slice(8):'';if(CONTEXT_FREE_COMMANDS.has(targetCommand))return available;return seed?available:unavailable(`Open or select a compatible project file before handing this action to the connected ${String(item.targetSurface).toUpperCase()} viewer.`);}
  if(!item.command){if(item.seed&&!seed)return unavailable('Open or select a compatible project file first.');return available;}
  const command=item.command;
  const owner=command.match(/^(sff|air|snd)\./)?.[1];
  if(owner&&surface!==owner&&surface!=='code'&&!item.crossSurface)return unavailable(`This ${owner.toUpperCase()} action is available from its connected ${owner.toUpperCase()} viewer.`);
  // Context-free means the command does not need an asset seed; it does not
  // erase the owning viewer boundary. Foreign viewers receive the reviewed
  // cross-surface catalog entry above instead of executing a direct command.
  if(CONTEXT_FREE_COMMANDS.has(command))return available;
  if(SEED_COMMANDS.has(command))return seed?available:unavailable('Open or select a compatible project file first.');
  if(TEXT_COMMAND.test(command)){
    const editor=vscode?.window?.activeTextEditor,document=editor?.document;
    if(!document||document.isClosed)return unavailable('Focus a compatible text editor before using this action.');
    const writable=document.isReadonly!==true&&vscode?.workspace?.fs?.isWritableFileSystem?.(document.uri?.scheme)!==false;
    if(WRITABLE_TEXT_COMMAND.test(command)&&!writable)return unavailable('The active text editor is read-only. Open a writable source before using this action.');
    if(SELECTION_REQUIRED_COMMAND.test(command)&&editor.selection?.isEmpty!==false)return unavailable('Select text in the active compatible editor before using this action.');
    return available;
  }
  if(owner)return seed?available:unavailable(`Open or select a compatible project file before opening the ${owner.toUpperCase()} viewer for this action.`);
  if(item.seed)return seed?available:unavailable('Open or select the asset or project file this action will use.');
  if(item.catalog&&item.availability==='command-owned')return available;
  return unavailable('This action is not registered for toolbar use.');
}
function optionalVscode(){try{return require('vscode');}catch{return undefined;}}
function surfaceIsActive(surface,panel,vscode,seed=''){
  if(panel?.active!==false)return true;
  if(surface!=='code'||!seed)return false;
  const document=vscode?.window?.activeTextEditor?.document,filename=document?.fileName;
  if(!filename||document.isClosed)return false;
  try{return path.resolve(filename).toLowerCase()===path.resolve(seed).toLowerCase();}catch{return false;}
}

function normalize(input) {
  const order = [...new Set((Array.isArray(input?.order) ? input.order : []).filter(id => ACTIONS.includes(id)))];
  return { order: [...order, ...ACTIONS.filter(id => !order.includes(id))], hidden: [...new Set((Array.isArray(input?.hidden) ? input.hidden : []).filter(id => ACTIONS.includes(id)))] };
}
function configure(context) { storage = context.globalState; preferences = storage?.get(KEY, {}) || {}; activityPreferences = storage?.get(ACTIVITY_KEY, {}) || {}; require('./viewer_layout').configure(context); }
function normalizeActivity(input) {
  const valid = value => typeof value === 'string' && /^[a-z0-9_.:[\]="-]{1,180}$/i.test(value);
  return { favorites: [...new Set(Array.isArray(input?.favorites) ? input.favorites.filter(valid) : [])].slice(0, 40), recent: [...new Set(Array.isArray(input?.recent) ? input.recent.filter(valid) : [])].slice(0, 8), repeatable: valid(input?.repeatable) ? input.repeatable : '' };
}
const BASIC=['sff','air','snd','source','game'];
function read(surface,mode=require('./interface_mode').current()) { return normalize(preferences[surface+':'+mode] || (mode==='workspace'?preferences[surface]:undefined) || (['sff','air','snd'].includes(surface)&&mode!=='workspace'?{order:BASIC,hidden:ACTIONS.filter(id=>!BASIC.includes(id))}:undefined)); }
function repeatable(item, surface) {
  if (['back', 'forward', 'back-source', 'used-by', 'related', 'source', 'pinned', 'compare'].includes(item.action)) return true;
  if (['fit', 'actual', 'resetView', 'axisToggle', 'axis', 'grid', 'play', 'stop'].includes(item.element)) return true;
  return ['audio-play', 'audio-loop', 'audio-pause'].includes(item.special) && surface === 'snd';
}
function toolbarItemId(item, surface) {
  return item.id || (item.action ? `shared.${item.action}` : item.command ? `command.${item.command}` : item.element ? `${surface}.element.${item.element}` : item.selector ? `${surface}.selector.${item.selector.replace(/[^a-z0-9]+/gi, '.').replace(/^\.|\.$/g, '')}` : `${surface}.special.${item.special}`);
}
function menuDefinitions(surface, options = {}) {
  const requestedSurface=surface,creator=requestedSurface==='sff_creator';if(creator)surface='sff';
  const asset = creator ? ['sff.createNew', 'sff.openViewer', '', ''] : { sff: ['sff.createNew', 'sff.openViewer', '', 'saveSffAs'], air: ['air.createNew', 'air.openAnimationPreview', 'saveAir', 'saveAirAs'], snd: ['snd.createNew', 'snd.openViewer', '', 'saveSndAs'] }[surface];
  const project = [];
  if (asset) project.push({ label: `New ${surface.toUpperCase()}…`, command: asset[0] }, { label: `Open ${surface.toUpperCase()}…`, command: asset[1] });
  else if(surface==='palette')project.push({label:'New Palette…',command:'ikemen.palette.createScratch',id:'palette.project.new'},{label:'Open Palette or SFF Workspace…',command:'ikemen.palette.openWorkspace',id:'palette.project.open'});
  else project.push({ label: 'New text file', command: 'workbench.action.files.newUntitledFile' }, { label: 'Open file…', command: 'workbench.action.files.openFile' });
  // SND is currently a reviewed build-manifest workflow, not a direct archive
  // writer. Avoid generic editor Save actions that imply otherwise.
  if (surface !== 'code') {
    if(surface==='palette'){
      project.push({label:'Save Palette Document',element:'paletteSaveOwner',id:'palette.element.save'},{label:'Save Palette Document As…',element:'paletteSaveAsOwner',id:'palette.element.saveAs'},{label:'Save Bank B as New Palette…',selector:'#saveBankBNew',id:'palette.selector.saveBankBNew'},{label:'Overwrite Selected Palette…',selector:'#overwriteBankB',id:'palette.selector.overwriteBankB'});
    }else if (surface !== 'snd') {
      if (asset?.[2]) project.push({ label: `Save ${surface.toUpperCase()}`, element: asset[2] }); else if(surface!=='sff') project.push({ label: 'Save', command: 'workbench.action.files.save' });
    }
    if (asset?.[3]) project.push({ label: `Save ${surface.toUpperCase()} As…`, element: asset[3] }); else if(!['snd','palette'].includes(surface)) project.push({ label: 'Save As…', command: 'workbench.action.files.saveAs' });
  }
  project.push({ separator: true }, { label: 'Create New Character…', command: 'ikemen.character.createNew' }, { label: 'Open Character…', command: 'ikemen.character.open' }, { label: 'First Playable Attack…', command: 'ikemen.character.firstPlayableAttack', seed: true }, { label: 'Close Character…', command: 'ikemen.character.close' }, { label: 'Current Project Context…', command: 'ikemen.context.show', seed: true }, { label: 'Game / Project Registry…', command: 'ikemen.context.openRegistry', seed: true },
    { separator: true }, { label: 'Save Workspace Layout Preset…', command: 'ikemen.workspacePreset.save', seed: true }, { label: 'Restore Workspace Layout Preset…', command: 'ikemen.workspacePreset.restore', seed: true },
    { separator: true }, { label: 'Create backup…', action: 'backup' }, { label: 'Run Normal Game', action: 'game' }, { label: 'Run Training Mirror', action: 'training' }, { label: 'Run Infinite Quick VS Mirror', action: 'versus' }, { label: 'Restart IKEMEN / Apply Changes', command: 'ikemen.restartRunning' }, { separator: true }, { label: 'Close', command: 'workbench.action.closeActiveEditor' }, { label: 'Close others', command: 'workbench.action.closeOtherEditors' }, { label: 'Close all', command: 'workbench.action.closeAllEditors' });
  const groups = [
    { label: 'Project', items: project },
    { label: 'Edit', items: [
      { label: 'Open / Focus Text Editor…', action: 'source', id: 'shared.edit.open-text-editor' }, { separator: true },
      ...(['sff','air','snd'].includes(surface) ? [{ label: `Undo ${surface.toUpperCase()} Viewer Change`, special: 'asset-undo', id: `${surface}.element.undoAsset` }, { label: `Redo ${surface.toUpperCase()} Viewer Change`, special: 'asset-redo', id: `${surface}.element.redoAsset` }, { separator: true }] : surface==='palette'?[{label:'Undo Palette Workspace Change',element:'paletteUndoOwner',id:'palette.element.undo'},{label:'Redo Palette Workspace Change',element:'paletteRedoOwner',id:'palette.element.redo'},{separator:true}]:[]),
      { label: 'Text / Input Undo', command: 'undo' }, { label: 'Text / Input Redo', command: 'redo' }, { separator: true },
      { label: 'Cut', command: 'editor.action.clipboardCutAction' }, { label: 'Copy', command: 'editor.action.clipboardCopyAction' }, { label: 'Paste', command: 'editor.action.clipboardPasteAction' },
      { separator: true }, { label: 'Find', command: 'actions.find' }, { label: 'Find / Replace', command: 'editor.action.startFindReplaceAction' },
      { label: 'Go to Line…', command: 'zss.goToLine' }, { label: 'Comment / Uncomment Selected Lines', command: 'zss.toggleLineComment' },
      { separator: true }, { label: 'Repeat Last Viewer Action', special: 'repeat', id: 'shared.special.repeat' }
    ] },
    { label: 'View', items: [
      { label: 'Restore Native Editor Tabs & Scrollbars (Escape)', command: 'ikemen.textToolbar.restoreNativeLayout', id: 'shared.command.restore-native-layout' },
      { label: 'Disable Native Editor Tabs & Scrollbars (Use Header Only)', command: 'ikemen.textToolbar.disableNativeLayout', id: 'shared.command.disable-native-layout' }, { separator: true },
      { label: 'Back in viewer history', action: 'back' }, { label: 'Forward in viewer history', action: 'forward' }, { label: 'Back to Source', action: 'back-source' },
      { label: 'Used By…', action: 'used-by' }, { label: 'Related Work…', action: 'related' }, { separator: true },
      { label: 'Problems', command: 'workbench.actions.view.problems' }, { label: 'Output', command: 'workbench.action.output.toggleOutput' }, { label: 'Debugger', command: 'workbench.view.debug' }
    ] },
    { label: 'Palettes', items: [
      { label: 'Palette Workspace…', command: 'ikemen.palette.openWorkspace' }, { label: 'Create Standalone Palette Template Image…', command: 'ikemen.palette.createTemplate' }, { label: 'PalFX Editor…', command: 'zss.openPalFxEditor', seed: true },
      { label: 'Sprite & Palette Import Assistant…', command: 'ikemen.paletteImport.open', seed: true }, { label: 'Open Character Palette Folder', command: 'ikemen.openPaletteFolder', seed: true },
      { separator: true }, { label: 'Create, Edit, Export, or Clean Up Palette…', command: 'ikemen.palettePlayer.organize', seed: true }, { label: 'Finish Reviewed Palette Build…', command: 'ikemen.palettePlayer.finishStaged', seed: true }
    ] },
    { label: 'Sprites', items: [
      { label: 'Open connected SFF', action: 'sff' }, { label: 'Add Sprites…', command: 'sff.openAddSprites', seed: true }, { label: 'Advanced SFF Creator…', command: 'sff.openCreator', seed: true }, { label: 'Two-SFF Assembly…', command: 'sff.openAssembly', seed: true }
    ] },
    { label: 'Animations', items: [{ label: 'Open connected AIR', action: 'air' }] },
    { label: 'Sounds', items: [{ label: 'Open connected SND', action: 'snd' }] },
    { label: 'Review', items: [
      { label: 'Recovery Center / Change History…', command: 'ikemen.mutations.openHistory', seed: true }, { label: 'Preview Change Impact…', command: 'ikemen.impact.preview', seed: true },
      { label: 'Character Dependencies…', command: 'ikemen.characterDependencies.open', seed: true }, { label: 'Character Health…', command: 'ikemen.characterHealth.open', seed: true },
      { label: 'Run Character Scale Review…', command: 'ikemen.scaleReview.run', seed: true }, { label: 'Toggle Character Scale Monitoring', command: 'ikemen.scaleReview.toggleMonitoring', seed: true },
      { label: 'Audit Current ZSS File', command: 'zss.audit.currentFile', seed: true }, { label: 'Audit Workspace Safety', command: 'zss.audit.workspace', seed: true },
      { separator: true }, { label: 'Production Workflow…', command: 'ikemen.productionWorkflow.open', seed: true }, { label: 'Test Sessions…', command: 'ikemen.testSessions.open', seed: true }, { label: 'Project & Team Manager…', command: 'ikemen.projectManager.open', seed: true }
    ] },
    { label: 'Build', items: [
      { label: 'Create New', heading: true, id: 'shared.build.create-heading' },
      { label: 'New SFF…', command: 'sff.createNew', id: 'shared.build.create-sff', crossSurface: true },
      { label: 'New AIR…', command: 'air.createNew', id: 'shared.build.create-air', crossSurface: true },
      { label: 'New SND…', command: 'snd.createNew', id: 'shared.build.create-snd', crossSurface: true },
      { label: 'New CNS File…', command: 'cns.createNew', id: 'shared.build.create-cns' },
      { label: 'New ZSS File…', command: 'zss.createNew', id: 'shared.build.create-zss' },
      { label: 'New Character…', command: 'ikemen.character.createNew', id: 'shared.build.create-character' },
      { label: 'New Stage…', command: 'ikemen.stage.createNew', id: 'shared.build.create-stage' },
      { label: 'New Screenpack / Fight UI…', command: 'ikemen.ui.createNew', id: 'shared.build.create-screenpack' },
      { label: 'New Storyboard…', command: 'ikemen.storyboard.create', id: 'shared.build.create-storyboard' },
      { label: 'New Palette…', command: 'ikemen.palette.createScratch', id: 'shared.build.create-palette' },
      { label: 'New Master Palette Image…', command: 'ikemen.palette.createTemplate', id: 'shared.build.create-master-palette' },
      { separator: true },
      { label: 'Open', heading: true, id: 'shared.build.open-heading' },
      { label: 'Open SFF…', command: 'sff.openViewer', id: 'shared.build.open-sff', crossSurface: true },
      { label: 'Open AIR…', command: 'air.openAnimationPreview', id: 'shared.build.open-air', crossSurface: true },
      { label: 'Open SND…', command: 'snd.openViewer', id: 'shared.build.open-snd', crossSurface: true },
      { label: 'Open Code or Data File…', command: 'workbench.action.files.openFile', id: 'shared.build.open-file' },
      { label: 'Open Character…', command: 'ikemen.character.open', id: 'shared.build.open-character' },
      { label: 'Open Stage…', command: 'ikemen.stage.openWorkspace', id: 'shared.build.open-stage' },
      { label: 'Open Screenpack / Fight UI…', command: 'ikemen.ui.openWorkspace', id: 'shared.build.open-screenpack' },
      { label: 'Open Storyboard…', command: 'ikemen.storyboard.open', id: 'shared.build.open-storyboard' },
      { label: 'Open Palette or SFF Workspace…', command: 'ikemen.palette.openWorkspace', id: 'shared.build.open-palette' },
      { separator: true },
      { label: 'Release Profile…', command: 'ikemen.release.openProfile', seed: true }, { label: 'Capture Reviewed Defaults…', command: 'ikemen.release.captureDefaults', seed: true },
      { label: 'Audit Release Readiness…', command: 'ikemen.release.audit', seed: true }, { label: 'Complete Reviewed Release…', command: 'ikemen.release.complete', seed: true }
    ] },
    { label: 'Stage', items: [
      { label: 'Stage Workspace…', command: 'ikemen.stage.openWorkspace', seed: true }, { label: 'Stage Rig…', command: 'ikemen.stage.launchRig', seed: true }
    ] },
    { label: 'Screenpack', items: [
      { label: 'Screenpack & UI Workspace…', command: 'ikemen.ui.openWorkspace', seed: true }, { label: 'Roster Manager…', command: 'ikemen.selectDef.openWorkspace', seed: true },
      { label: 'Menu & Modes Creator…', command: 'ikemen.menuModes.openCreator', seed: true }, { label: 'Story & Dialogue Creator…', command: 'ikemen.storyDialogue.openCreator', seed: true },
      { label: 'Storyboard Workspace…', command: 'ikemen.storyboard.open', seed: true }
    ] },
    { label: 'Tools', items: [
      { label: 'Command & Movelist Editor…', command: 'ikemen.commandMovelist.openEditor', seed: true }, { label: 'Code Structure…', command: 'ikemen.codeStructure.openWorkspace', seed: true },
      { label: 'Visual DEF Editor…', command: 'ikemen.def.openVisualWorkspace', seed: true }, { label: 'CNS-to-ZSS Converter…', command: 'ikemen.cnsConverter.open', seed: true }, { label: 'Controller Browser…', command: 'zss.openControllers', seed: true }, { label: 'Project Code Set…', command: 'ikemen.workbench.open', seed: true },
      { label: 'Map Browser…', command: 'ikemen.maps.openBrowser', seed: true }, { label: 'Project Data…', command: 'zss.openProjectData', seed: true }, { label: 'Engine Targets & Compatibility…', command: 'ikemen.engineRegistry.open', seed: true }, { label: 'Platform Capabilities…', command: 'ikemen.showPlatformCapabilities' },
      { separator: true }, { label: 'Recipe Library…', command: 'ikemen.authoring.openRecipes', seed: true }, { label: 'Authoring Favorites…', command: 'ikemen.authoring.openFavorites', seed: true }, { label: 'Example Templates…', command: 'ikemen.authoring.openExamples', seed: true }, { label: 'Project Symbols & Contracts…', command: 'ikemen.authoring.openSymbols', seed: true },
      { separator: true }, { label: 'Universal HitDef Editor…', command: 'ikemen.hitDef.openEditor', seed: true }, { label: 'Move Lab…', command: 'ikemen.moveLab.open', seed: true }, { label: 'Helper Lab…', command: 'ikemen.helperLab.open', seed: true }, { label: 'Throw Creator…', command: 'ikemen.throwCreator.open', seed: true }, { label: 'Explod Composer…', command: 'ikemen.explodComposer.open', seed: true }, { label: 'Position & Camera Editor…', command: 'ikemen.positionCamera.open', seed: true }, { label: 'Orbit / Trajectory Assist…', command: 'ikemen.trajectory.openAssist', seed: true },
      { separator: true }, { label: 'Open IKeMeter…', command: 'ikemen.openIKeMeter' }, { label: 'Switch to IkeMiner Workspace…', command: 'ikemen.switchToIkeMiner' }, { label: 'New IkeMiner Capture Session…', command: 'ikeminer.session.create' }, { label: 'Open IkeMiner Capture Session…', command: 'ikeminer.session.open' },
      { separator: true }, { label: 'Pinned Sources…', action: 'pinned' }, { label: 'Compare…', action: 'compare' },
      { separator: true }, { label: 'Mode & Focus…', command: 'ikemen.changeMode' }, { label: 'IKEMaker Settings…', command: 'ikemen.openExtensionSettings' }
    ] },
    { label: 'Help', items: [{ label: 'IKEMaker Home', command: 'ikemen.openHome' }, { label: 'Help & Learning Center', command: 'ikemen.help.open' }, { label: 'Offline Documentation', command: 'ikemen.docs.openOffline' }] },
    { label: 'More', items: [
      { label: 'Credits', command: 'ikemen.help.credits' },
      { label: 'Asset Auto Save', action: 'autosave' },
      { label: 'Show / Hide Native Editor Tabs & Scrollbars', command: 'ikemen.textToolbar.toggleHeaderOnlyLayout', id: 'shared.command.header-only-layout' },
      { separator: true },
      { label: 'Detach Current View to New Window', command: 'workbench.action.moveEditorToNewWindow', id: 'shared.command.detach-current-view' },
      { label: 'Combine Detached Views into Main Window', command: 'workbench.action.restoreEditorsToMainWindow', id: 'shared.command.combine-detached-views' },
      { separator: true }, { label: 'Workspace mode…', special: 'workspace-mode', id: 'shared.special.workspace-mode' },
      { label: 'Layout…', special: 'layout', id: 'shared.special.layout' }, { label: 'Reset Layout', special: 'reset-layout', id: 'shared.special.reset-layout' }
    ] }
  ];
  const group = label => groups.find(item => item.label === label).items;
  if(require('./interface_mode').current()!=='player')group('Stage').unshift({label:'Create Stage from PNG layers…',command:'ikemen.stage.createFromPngLayers',id:'stage.create-png-layers'});
  const transferMenu={sff:'Sprites',air:'Animations',snd:'Sounds'}[surface];
  if(transferMenu)group(transferMenu).unshift({label:'Quick Transfer...',command:surface+'.quickTransfer',seed:true,id:surface+'.transfer.quick'});
  const workflowSurface=surface==='command_movelist'?'commands':surface;
  const advanced = require('./guided_workflows').ADVANCED_ACTIONS[workflowSurface] || [];
  if (advanced.length) group('Tools').push({ separator: true }, ...advanced.map(item => ({ label: item.label, workflowAction: item.action, id: `${surface}.workflow.${item.action.replace(/[^a-z0-9]+/gi,'.').replace(/^\.|\.$/g,'')}` })));
  if (surface === 'move_constants') {
    group('Tools').unshift(
      { label: 'Throw Creator…', element: 'throwCreator', id: 'move_constants.tool.throw-creator' },
      { label: 'Find Current Profile Uses…', element: 'linkedCode', id: 'move_constants.tool.profile-uses' },
      { label: 'Open Constants Text', element: 'openConstants', id: 'move_constants.tool.constants-text' },
      { label: 'Open AIR Text', element: 'openAir', id: 'move_constants.tool.air-text' },
      { separator: true }
    );
  }
  if (surface === 'sff') {
    group('Sprites').push({ separator: true }, { label: 'Preview Selected Sprite in Shader Workshop', action: 'shaderPreview' });
    group('View').push({ separator: true }, { label: 'Previous sprite', element: 'previous' }, { label: 'Next sprite', element: 'next' }, { label: 'Fit sprite', element: 'fit' }, { label: '100% zoom', element: 'actual' }, { label: 'Center view', element: 'resetView' }, { label: 'Pan preview left', element: 'panLeft' }, { label: 'Pan preview up', element: 'panUp' }, { label: 'Pan preview down', element: 'panDown' }, { label: 'Pan preview right', element: 'panRight' }, { label: 'Toggle axis', element: 'axisToggle' }, { label: 'Toggle axis front / behind', element: 'axisLayerToggle' }, { label: 'Choose proof background', element: 'proofBackground' }, { label: 'Choose custom proof color', element: 'proofColor' }, { label: 'Toggle grid', element: 'showGrid' }, { label: 'Toggle thumbnails', element: 'showThumbnails' }, { label: 'Toggle transparency proof', element: 'showTransparency' });
    group('Palettes').push({ separator: true }, { label: 'Reset Color Draft', element: 'resetPaletteEdits' }, { label: 'Save Color Draft…', element: 'savePaletteEdits' }, { label: 'Assign Palette to Matching Sprites…', element: 'assignPalette' }, { label: 'Apply Palette Preview', element: 'applyPalettePreview' }, { label: 'Use Selected Sprite Palette', element: 'useSpritePalette' },
      { separator: true }, { label: 'Import ACT…', element: 'importAct' }, { label: 'Compare ACT…', element: 'compareAct' }, { label: 'Replace Palette from ACT…', element: 'replacePalette' }, { label: 'Preview Reversed 256-Color Table', element: 'previewReversedPalette' }, { label: 'Save Reversed Table Copy…', element: 'saveReversedPalette' }, { label: 'Export ACT…', element: 'exportAct' }, { label: 'Export Photoshop ACO…', element: 'exportAco' }, { label: 'Export Swatch PNG…', element: 'exportSwatchPng' }, { label: 'Export Artist Palette Pack…', element: 'exportArtistPack' }, { label: 'Organize Palette Indexes…', element: 'organizePalette' }, { label: 'Audit Palette Setup', element: 'auditPalettes' },
      { separator: true }, { label: 'Protect Selected as Master…', element: 'protectMaster' }, { label: 'Compare to Master', element: 'compareMaster' }, { label: 'Preview Master', element: 'previewMaster' }, { label: 'Open Master Record', element: 'openMaster' },
      { separator: true }, { label: 'Choose Palette Library Folder…', element: 'choosePaletteLibrary' }, { label: 'Choose Palette Files…', element: 'choosePaletteFiles' }, { label: 'Remove Selected Palette Sources from List', element: 'removePaletteSources' }, { label: 'Preview Library Palette', element: 'previewLibraryPalette' }, { label: 'Compare Library Palette with Embedded', element: 'compareLibraryPalette' }, { label: 'Add / Insert Selected Palettes…', element: 'stageLibraryPalette' }, { label: 'Insert Palette + Shift Later…', element: 'insertPaletteShift' },
      { separator: true }, { label: 'Stage as Child Variant…', element: 'stagePaletteVariant' }, { label: 'Stage Linked Alias…', element: 'stagePaletteAlias' }, { label: 'Fill Transform Slots', element: 'fillTransformAliases' }, { label: 'Review Staged Palette Plan…', element: 'reviewStagedPalettes' });
    group('Sprites').push({ label: 'SFF Browser…', command: 'sff.openBrowser', seed: true }, { label: 'Artist Intake (temporary SFF)…', command: 'ikemen.artistIntake.open', seed: true }, { separator: true }, { label: 'Add Sprites…', selector: '[data-action="addSprites"]' }, { label: 'Delete Selected Sprites', selector: '[data-action="deleteSprite"]' }, { label: 'Delete Group…', selector: '[data-action="deleteGroup"]' }, { label: 'Duplicate Sprite', selector: '[data-action="duplicateSprite"]' }, { label: 'Replace Sprite Image…', selector: '[data-action="changeImage"]' }, { separator: true }, { label: 'Add Sprites to Legacy SprMaker2 Manifest…', selector: '[data-action="addSpritesManifest"]' }, { label: 'Delete from Legacy SprMaker2 Manifest…', selector: '[data-action="deleteSpriteManifest"]' }, { label: 'Delete Group from Legacy SprMaker2 Manifest…', selector: '[data-action="deleteGroupManifest"]' }, { label: 'Duplicate in Legacy SprMaker2 Manifest…', selector: '[data-action="duplicateSpriteManifest"]' }, { separator: true }, { label: 'Export images…', selector: '[data-action="exportSprites"]' }, { label: 'Export proof preview PNG…', element: 'exportPreviewPng' }, { label: 'Crop images…', selector: '[data-action="cropImages"]' }, { label: 'Rename group…', selector: '[data-action="renameGroup"]' }, { label: 'Alignment tool…', selector: '[data-action="alignmentTool"]' }, { label: 'Suggest Sprite Axes…', selector: '[data-action="autoAxis"]' }, { label: 'Image editor', selector: '[data-action="openImageEditor"]' }, { label: 'Choose image editor…', command: 'sff.chooseImageEditor' },
      { separator: true }, { label: 'Select Sprites By…', selector: '[data-action="selectSprites"]' }, { label: 'Save Aligned Images…', selector: '[data-action="saveAligned"]' }, { label: 'Resize Images…', selector: '[data-action="resizeImages"]' }, { label: 'Rotate Images…', selector: '[data-action="rotateImages"]' }, { label: 'Split Image Channels…', selector: '[data-action="splitChannels"]' }, { label: 'Image & Compression Options…', selector: '[data-action="imageOptions"]' }, { label: 'Layer Tools…', selector: '[data-action="layers"]' },
      { separator: true }, { label: 'Import Layer Folder…', command: 'sff.importLayerFolder', seed: true }, { label: 'Naming & Alias Rules…', command: 'sff.openAliasRegistry', seed: true }, { label: 'Open SprMaker2 Build Text…', command: 'sff.openSprMakerText', seed: true });
    group('Review').push({ separator: true }, { label: 'Audit Character Sprite Requirements…', command: 'sff.auditCharacterRequirements', seed: true }, { label: 'Add Required Sprite / Animation…', command: 'sff.addCharacterRequirement', seed: true }, { label: 'Review Unassigned Sprites…', command: 'sff.reviewUnassignedSprites', seed: true }, { label: 'Review Missing Axis Copies…', command: 'sff.createMissingAxisCopies', seed: true }, { label: 'Review Interaction Part Ordering…', command: 'sff.reviewLayerParts', seed: true }, { label: 'Review Redundant Layer Frames…', command: 'sff.reviewRedundantLayers', seed: true }, { label: 'Review Dismissed Layer Warnings…', command: 'sff.reviewDismissedLayerWarnings', seed: true }, { label: 'Requirements Profile…', command: 'sff.openRequirementsProfile', seed: true }, { label: 'Group Log…', command: 'sff.openGroupLog', seed: true });
    group('Sprites').push({ separator: true }, { label: 'Create SFF Build Profile…', command: 'sff.createProjectBuildProfile', seed: true }, { label: 'Open SFF Build Profile…', command: 'sff.openProjectBuildProfile', seed: true });
    group('Build').unshift({ label: 'Apply Reviewed Index Cleanup…', command: 'sff.applyProjectIndexing', seed: true }, { label: 'Build Approved Sprite Manifest…', command: 'sff.buildApprovedManifest', seed: true }, { label: 'Generate Reviewed SFF Build Files…', command: 'sff.generateBuildFiles', seed: true }, { separator: true });
    group('Tools').splice(group('Tools').length - 2, 0, { separator: true }, { label: 'Crop Archive Safely…', command: 'sff.cropArchive', seed: true }, { label: 'Coder Build & Numbering Standard', command: 'sff.showNamingStandard' }, { label: 'Artist Handoff Guide', command: 'sff.showArtistHandoffGuide' });
  }
  if (surface === 'sff') { group('Sprites').unshift({ label: 'Sprite Lists / Thumbnails', command: 'sff.browseLists', seed: true }); group('Sprites').push({ separator: true }, { label: 'Move Marked in View Order…', element: 'viewMoveFocus' }); }
  if (surface === 'air') {
    group('Animations').push({ label: 'Preview Current Animation in Shader Workshop', element: 'shaderWorkshop' });
    group('View').push({ separator: true }, { label: 'Previous animation', element: 'previousAction' }, { label: 'Next animation', element: 'nextAction' }, { label: 'Previous frame', element: 'prev' }, { label: 'Next frame', element: 'next' }, { label: 'Fit animation', element: 'fit' }, { label: '100% zoom', element: 'actual' }, { label: 'Center view', element: 'center' }, { label: 'Toggle axis', element: 'axis' }, { label: 'Toggle axis layer', element: 'axisLayer' }, { label: 'Toggle grid', element: 'grid' }, { label: 'Toggle action thumbnails', element: 'showActionThumbs' });
    group('Palettes').push({ separator: true }, { label: 'Set Preview Palette for AIR Screen', element: 'saveAirPalette' }, { label: 'Set Preview Palette for Current Sprite Group', element: 'saveAirGroupPalette' }, { label: 'Clear Current Group Preview Palette', element: 'clearAirGroupPalette' });
    group('Animations').push({ label: 'AIR Browser…', command: 'air.toggleBrowser', seed: true }, { label: 'View Current Animation AIR Text', element: 'airText' }, { separator: true }, { label: 'New action…', element: 'newAction' }, { label: 'Duplicate action…', element: 'duplicateAction' }, { label: 'Delete selected actions…', element: 'deleteSelectedActions' }, { label: 'Mark Visible Actions', element: 'markVisibleActions' }, { label: 'Clear Action Marks', element: 'clearActionMarks' }, { label: 'Play', element: 'play' }, { separator: true }, { label: 'Add frame after', element: 'addFrame' }, { label: 'Duplicate frame', element: 'duplicateFrame' }, { label: 'Delete frame', element: 'deleteFrame' }, { label: 'Move frame earlier', element: 'moveFrameEarlier' }, { label: 'Move frame later', element: 'moveFrameLater' }, { label: 'Move frame offset up', element: 'airOffsetUp' }, { label: 'Move frame offset left', element: 'airOffsetLeft' }, { label: 'Move frame offset down', element: 'airOffsetDown' }, { label: 'Move frame offset right', element: 'airOffsetRight' }, { label: 'Batch edit marked frame property…', element: 'batchFrameProperties' }, { label: 'Alignment Tool…', element: 'openAlignmentTool' }, { label: 'Apply offset to all following frames', element: 'timelineBatchOffset' }, { label: 'Apply time to all following frames', element: 'timelineBatchTime' }, { label: 'Apply flip to all following frames', element: 'timelineBatchFlip' }, { label: 'Apply transparency to all following frames', element: 'timelineBatchBlend' }, { label: 'Apply scale to all following frames', element: 'timelineBatchScale' }, { label: 'Apply angle to all following frames', element: 'timelineBatchAngle' }, { label: 'Apply reviewed frame fields', element: 'applyFrame' }, { label: 'Revert frame draft', element: 'revertFrame' }, { separator: true }, { label: 'IKEMEN collision tools…', element: 'openIkemenCollisionTools' }, { label: 'Show or hide Clsn1 attack boxes', element: 'quickToggleClsn1' }, { label: 'Add Clsn1 attack box', element: 'quickAddClsn1' }, { label: 'Inspect Clsn1Default ownership', element: 'quickDefaultClsn1' }, { label: 'Show or hide Clsn2 collision boxes', element: 'quickToggleClsn2' }, { label: 'Add Clsn2 collision box', element: 'quickAddClsn2' }, { label: 'Inspect Clsn2Default ownership', element: 'quickDefaultClsn2' }, { label: 'Show effective Size push box', element: 'quickShowPush' }, { label: 'Nightly Dummy collision tools', element: 'quickDummy' }, { label: 'Review selected contact-box deletion', element: 'quickDeleteClsn' }, { label: 'Current-frame contact-box tools…', element: 'quickDeleteFrameClsn' }, { label: 'Current-animation contact-box tools…', element: 'quickDeleteActionClsn' }, { label: 'Switch contact-box type…', element: 'quickSwitchClsnType' }, { label: 'Shared/default contact-box tools…', element: 'quickSwitchClsnDefault' }, { label: 'Copy previous-frame contact boxes…', element: 'quickCopyPreviousClsn' }, { label: 'Reuse matching contact boxes…', element: 'quickReuseClsn' }, { label: 'Open state/animation references', element: 'quickAnimationReferences' }, { label: 'Open collision-code references', element: 'quickCollisionReferences' }, { label: 'Open selected AIR source line', element: 'quickAirSource' }, { label: 'Add contact box', element: 'addBox' }, { label: 'Edit selected contact box', element: 'beginBoxEdit' }, { label: 'Apply contact-box edit', element: 'applyBoxEdit' }, { label: 'Revert contact-box edit', element: 'revertBoxEdit' }, { label: 'Delete selected contact box', element: 'deleteBox' }, { label: 'Fill reviewed contact boxes…', element: 'fillBoxes' }, { separator: true }, { label: 'GIF to AIR…', element: 'gifToAir' }, { label: 'Export animation preview…', element: 'exportPreview' });
    group('Animations').push({ label: 'Cycle adjacent-frame onion skin', element: 'onion' });
    group('Review').push({ separator: true }, { label: 'Animation Standards…', command: 'ikemen.animationStandards.open', seed: true }, { label: 'Action Log…', command: 'air.openActionLog', seed: true }, { label: 'Apply CLSN2 to Reviewed Batch…', command: 'air.batchApplyClsn2', seed: true }, { label: 'Assign Hit-Reaction Regions…', command: 'air.assignClsn2HitReactionRegion', seed: true }, { label: 'Generate Guard-Proximity Helper…', command: 'air.generateGuardProximityHelper', seed: true });
  }
  if (surface === 'air') group('Animations').unshift({ label: 'Animation Lists / Thumbnails', command: 'air.browseLists', seed: true });
  if (surface === 'air') group('Animations').push({ separator: true }, { label: 'Move Marked Frames…', element: 'airMoveFocus' });
  if (surface === 'snd') {
    group('Sounds').push({ label: 'Transfer Sounds…', selector: '[data-transfer-command="snd.openTransferMode"]', id: 'snd.transfer.open' }, { label: 'Copy Selected Sounds to Destination', selector: '[data-transfer-command="snd.transfer.copySelected"]', id: 'snd.transfer.copy' }, { label: 'Swap Transfer Sides', selector: '[data-transfer-command="snd.transfer.swapSides"]', id: 'snd.transfer.swap' }, { label: 'Change Transfer Source…', selector: '[data-transfer-command="snd.transfer.changeSource"]', id: 'snd.transfer.change-source' }, { label: 'Change Transfer Destination…', selector: '[data-transfer-command="snd.transfer.changeDestination"]', id: 'snd.transfer.change-destination' }, { label: 'Exit SND Transfer', selector: '[data-transfer-command="snd.transfer.exit"]', id: 'snd.transfer.exit' }, { separator: true });
    group('Sounds').push({ label: 'Sound Lists / Waveforms', command: 'snd.browseLists', seed: true });
    group('View').push({ separator: true }, { label: 'Previous Visible Sound', element: 'sndPrevious' }, { label: 'Next Visible Sound', element: 'sndNext' }, { label: 'Sort Sound List…', element: 'sndSortFocus' });
    group('Sounds').push({ separator: true }, { label: 'Previous Configured Sound Archive', element: 'sndArchivePrevious' }, { label: 'Next Configured Sound Archive', element: 'sndArchiveNext' }, { label: 'Open Selected Profile Sound Archive', element: 'sndArchiveOpen' }, { label: 'Add Shared, Character FX, or Voice SND…', element: 'addProfileArchive' }, { separator: true }, { label: 'Add WAV to Build Plan…', element: 'add' }, { label: 'Remove from Build Plan…', element: 'delete' }, { label: 'Replace Selected Source…', element: 'replace' }, { label: 'Mark Current Sound', element: 'mark' }, { label: 'Mark Visible Sounds', element: 'markVisibleSounds' }, { label: 'Clear Sound Marks', element: 'clearSoundMarks' }, { separator: true }, { label: 'Export Selected WAV…', element: 'export' }, { label: 'Export Marked WAVs…', element: 'exportMarked' }, { label: 'Export A–B Audition Range…', element: 'sndExportRange' }, { label: 'Open Audio Editor', element: 'openEditor' }, { label: 'Choose Audio Editor…', element: 'chooseEditor' }, { label: 'Name Referenced Event…', element: 'nameEvent' }, { separator: true }, { label: 'Copy Native PlaySnd Call', element: 'copyCall' }, { label: 'Copy Configured Sound Bridge Snippet', element: 'copySoundBridge' }, { separator: true }, { label: 'Play Once', special: 'audio-play' }, { label: 'Play with Loop', special: 'audio-loop' }, { label: 'Pause', special: 'audio-pause' }, { label: 'Stop', element: 'stop' },
      { separator: true }, { label: 'Open or Create Portable Sound Profile…', element: 'openProfile' }, { label: 'Assign Loaded SND a Profile Role and Prefix…', element: 'assignArchive' }, { label: 'Audit Split-Archive Sound Contract', element: 'auditContract' }, { label: 'Scan Character Sound References', element: 'scanReferences' },
      { separator: true }, { label: 'Create Reviewed SND Build Workspace…', element: 'createBuild' }, { label: 'Open Sound Build Manifest…', element: 'openManifest' }, { label: 'Open Any SndMaker Text…', element: 'openRawMakerText' }, { label: 'Sort Sound Build Manifest…', element: 'sortManifest' }, { label: 'Rebuild SND from Reviewed Manifest…', element: 'rebuild' },
      { separator: true }, { label: 'Generate CommonFX DEF for This Archive…', element: 'generateFx' }, { label: 'Generate CommonFX DEFs for All Profile Archives…', element: 'generateAllFx' }, { label: 'Copy Character DEF fx Line', element: 'copyDefLine' });
    group('Help').push({ separator: true }, { label: 'SND Viewer Guide / What am I editing?…', element: 'sndHelp' });
    group('Sounds').push({ separator: true }, { label: 'Move Marked Build Rows…', element: 'sndManifestMoveFocus' });
  }
  // All non-Project authoring menus are the same union on SFF, AIR, and SND.
  // Project is intentionally surface-owned so Save can never target a different
  // archive. Viewer controls from another surface cross only as a stable action
  // ID; selectors and element IDs never leave their owning webview.
  if (!options.nativeOnly && ASSET_SURFACES.includes(surface)) {
    const nativeBySurface = Object.fromEntries(ASSET_SURFACES.map(owner => [owner, menuDefinitions(owner, { nativeOnly: true })]));
    for (const label of PARITY_GROUPS) {
      const current = nativeBySurface[surface].find(group => group.label === label).items, currentById = new Map(current.filter(item => !item.separator).map(item => [item.id, item]));
      const merged = [], seen = new Set(); let sinceSeparator = 0;
      const separator = () => { if (sinceSeparator && merged.length && !merged.at(-1).separator) { merged.push({ separator: true }); sinceSeparator = 0; } };
      for (const owner of ASSET_SURFACES) for (const entry of nativeBySurface[owner].find(group => group.label === label).items) {
        if (entry.separator) { separator(); continue; }
        // Resource-free start pages belong to the shared menu, not an asset
        // viewer handoff. Their direct routes are added below once per menu.
        if (['ikemen.stage.openStart','ikemen.ui.openStart','ikemen.storyboard.openStart'].includes(entry.command)) continue;
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        const local = currentById.get(entry.id);
        if (local) merged.push({ ...local });
        else merged.push({ label: entry.label, targetSurface: owner, targetAction: entry.id, id: `cross.${owner}.${entry.id}` });
        sinceSeparator++;
      }
      while (merged.at(-1)?.separator) merged.pop();
      groups.find(group => group.label === label).items = merged;
    }
  }
  // Every launch-control viewer receives the complete guarded SFF/AIR/SND
  // action catalog. Actions owned by another surface hand off to that surface
  // instead of looking for foreign element IDs in the current webview.
  if (!options.nativeOnly && !ASSET_SURFACES.includes(surface)) {
    const nativeBySurface = Object.fromEntries(ASSET_SURFACES.map(owner => [owner, menuDefinitions(owner, { nativeOnly: true })]));
    for (const label of PARITY_GROUPS) {
      const menu = groups.find(group => group.label === label); if (!menu) continue;
      const seen = new Set(menu.items.filter(item => !item.separator).map(item => toolbarItemId(item, surface)));
      for (const owner of ASSET_SURFACES) {
        const additions = nativeBySurface[owner].find(group => group.label === label)?.items || []; let separated = false;
        for (const entry of additions) {
          if (entry.separator) { separated = true; continue; }
          if (['ikemen.stage.openStart','ikemen.ui.openStart','ikemen.storyboard.openStart'].includes(entry.command)) continue;
          if (seen.has(entry.id)) { separated = false; continue; }
          if (separated && menu.items.length && !menu.items.at(-1).separator) menu.items.push({ separator: true });
          menu.items.push({ label: entry.label, targetSurface: owner, targetAction: entry.id, id: `cross.${owner}.${entry.id}` });
          seen.add(entry.id); separated = false;
        }
      }
      while (menu.items.at(-1)?.separator) menu.items.pop();
    }
  }
  if(!options.nativeOnly){
    // A guarded cross-surface command is already represented by its owning
    // viewer action. Do not append a second direct-command row for it.
    const represented=new Set(groups.flatMap(group=>group.items).filter(item=>!item.separator).flatMap(item=>{
      if(item.command)return[item.command];
      if(item.targetAction?.startsWith('command.'))return[item.targetAction.slice('command.'.length)];
      return[];
    }));
    const appendedGroups=new Set();for(const action of PACKAGE_ACTION_CATALOG.actions){if(represented.has(action.command))continue;const menu=groups.find(group=>group.label===action.group)||groups.find(group=>group.label==='Tools');if(!appendedGroups.has(menu.label)){if(menu.items.length&&!menu.items.at(-1).separator)menu.items.push({separator:true});appendedGroups.add(menu.label);}const availability=CONTEXT_FREE_COMMANDS.has(action.command)?'context-free':SEED_COMMANDS.has(action.command)?'seed':TEXT_COMMAND.test(action.command)?'editor':/^(?:sff|air|snd)\./.test(action.command)?'surface-owner':'command-owned';menu.items.push({label:action.label,command:action.command,seed:availability==='seed',catalog:true,tooltip:action.tooltip,shortcut:action.shortcut,availability});represented.add(action.command);}
  }
  if(creator){
    for(const group of groups)group.items=group.items.filter(item=>item.separator||!/^Save SFF(?:\s|$)/.test(item.label||''));
    const add=(group,items)=>{const menu=groups.find(entry=>entry.label===group);if(menu?.items.length&&!menu.items.at(-1)?.separator)menu.items.push({separator:true});menu?.items.push(...items)};
    add('Build',[
      {label:'Save Verified SFF Copy…',element:'saveTruecolorCopy',id:'sff_creator.element.saveTruecolorCopy'},
      {label:'Open Saved SFF',element:'openVerifiedCopy',id:'sff_creator.element.openVerifiedCopy'},
      {label:'Create 2 Test SFFs…',element:'buildV21',id:'sff_creator.element.buildV21'},
      {label:'Open Writer Comparison…',element:'openWriterComparison',id:'sff_creator.element.openWriterComparison'},
      {label:'Update Active SFF (Compare Writers)…',element:'build',id:'sff_creator.element.build'},
      {label:'Create Package Only…',element:'apply',id:'sff_creator.element.apply'}
    ]);
    add('Project',[
      {label:'Export Creator Plan…',element:'exportPlan',id:'sff_creator.element.exportPlan'},
      {label:'Import Creator Plan…',element:'importPlan',id:'sff_creator.element.importPlan'},
      {label:'Discard Creator Draft',element:'discard',id:'sff_creator.element.discard'}
    ]);
    for(const menu of groups)for(const item of menu.items)if(!item.separator){
      if((item.element||item.selector||item.workflowAction)&&!String(item.id||'').startsWith('sff_creator.'))item.unavailableReason='This SFF Viewer selection action is not available in SFF Creator.';
      if(item.action==='autosave'||['layout','reset-layout'].includes(item.special))item.unavailableReason='This SFF Viewer-only option is not used by SFF Creator.';
      if(['workbench.action.closeActiveEditor','workbench.action.closeOtherEditors','workbench.action.closeAllEditors'].includes(item.command))item.unavailableReason='Use the universal Close button so the retained Creator draft is reviewed safely.';
    }
  }
  if(requestedSurface==='code_structure'){
    const generic=new Set(['workbench.action.files.newUntitledFile','workbench.action.files.openFile','workbench.action.files.save','workbench.action.files.saveAs','workbench.action.closeActiveEditor','workbench.action.closeOtherEditors','workbench.action.closeAllEditors']);
    group('Project').splice(0,group('Project').length,...group('Project').filter(item=>!generic.has(item.command)));
    group('Project').unshift(...['new','open','save','close'].map(slot=>({label:slot[0].toUpperCase()+slot.slice(1)+' Visual Structure',selector:'[data-universal-slot="'+slot+'"]',id:'code_structure.project.'+slot})));
    const source=group('Edit').find(item=>item.id==='shared.edit.open-text-editor');if(source){source.label='Reveal selected block in text editor';delete source.action;source.element='reveal';source.id='code_structure.element.reveal';}
    group('View').push({separator:true},...[['Focus selected block','focusSelected'],['Show all structure blocks','showAll'],['Collapse all structure blocks','collapse'],['Previous connected code file','filePrevious'],['Next connected code file','fileNext'],['Open IKEMEN documentation','onlineDocs'],['Open IKEMEN wiki','wiki']].map(([label,element])=>({label,element,id:'code_structure.element.'+element})));
  }
  if(['authoring_library','character_dependency','character_health','cns_converter','code','help','maps','menu_modes','shader','story_dialogue','pinned_sources','used_by','comparison','home','png_stage'].includes(requestedSurface)){
    const generic=new Set(['workbench.action.files.newUntitledFile','workbench.action.files.openFile','workbench.action.files.save','workbench.action.files.saveAs','workbench.action.closeActiveEditor','workbench.action.closeOtherEditors','workbench.action.closeAllEditors']);
    group('Project').splice(0,group('Project').length,...group('Project').filter(item=>!generic.has(item.command)));
    group('Project').unshift(...['new','open','save','save-as','close'].map(slot=>({label:slot==='save-as'?'Save As…':slot[0].toUpperCase()+slot.slice(1),selector:'[data-universal-slot="'+slot+'"]',id:requestedSurface+'.project.'+slot})));
    const source=group('Edit').find(item=>item.id==='shared.edit.open-text-editor');if(source){delete source.action;source.selector='[data-universal-slot="text-source"]';source.id=requestedSurface+'.edit.exact-source';}
  }
  const authoring=require('./interface_mode').current()!=='player';
  if(authoring)group('Project').unshift({label:'New Stage…',command:'ikemen.stage.createNew',id:'project.new-stage'},{label:'New Screenpack…',command:'ikemen.ui.createNew',id:'project.new-screenpack'},{label:'New Storyboard…',command:'ikemen.storyboard.create',id:'project.new-storyboard'},{separator:true});
  group('Project').push({separator:true},{label:'Stage Workspace — Start',command:'ikemen.stage.openStart',id:'project.start-stage'},{label:'Screenpack Workspace — Start',command:'ikemen.ui.openStart',id:'project.start-screenpack'},{label:'Storyboard Workspace — Start',command:'ikemen.storyboard.openStart',id:'project.start-storyboard'});
  if(!group('Stage').some(item=>item.command==='ikemen.stage.openStart'))group('Stage').unshift({label:'Stage Workspace — Start',command:'ikemen.stage.openStart',id:surface+'.stage-start'});
  if(!group('Screenpack').some(item=>item.command==='ikemen.ui.openStart'))group('Screenpack').unshift({label:'Screenpack Workspace — Start',command:'ikemen.ui.openStart',id:surface+'.screenpack-start'},{label:'Storyboard Workspace — Start',command:'ikemen.storyboard.openStart',id:surface+'.storyboard-start'});
  if(['stage','screenpack','storyboard','select_def'].includes(surface)){
    const ownedLabel={stage:'Stage Workspace',screenpack:'Screenpack Workspace',select_def:'Roster Manager',storyboard:'Storyboard Workspace'}[surface];
    const generic=new Set(['workbench.action.files.newUntitledFile','workbench.action.files.openFile','workbench.action.files.save','workbench.action.files.saveAs','workbench.action.closeActiveEditor','workbench.action.closeOtherEditors','workbench.action.closeAllEditors']);
    group('Project').splice(0,group('Project').length,...group('Project').filter(item=>!generic.has(item.command)));
    group('Project').unshift(...['new','open','save','close'].map(slot=>({label:slot[0].toUpperCase()+slot.slice(1)+' '+ownedLabel,selector:'[data-universal-slot="'+slot+'"]',id:surface+'.project.'+slot})));
    group('Edit').splice(0,group('Edit').length,...group('Edit').filter(item=>!['undo','redo'].includes(item.command)));
    const undo=surface==='select_def'?'undo':'visualWorkspaceUndo',redo=surface==='select_def'?'redo':'visualWorkspaceRedo';
    group('Edit').unshift({label:'Undo '+ownedLabel+' edit',element:undo},{label:'Redo '+ownedLabel+' edit',element:redo},{separator:true});
    const local=surface==='stage'?[['Previous background','stagePrevious'],['Next background','stageNext'],['Add background','addBg'],['Duplicate background','duplicateBg'],['Remove background','removeBg'],['Import layered PSD','layeredPsd'],['Fit preview','fit'],['Reset preview','reset'],['Toggle guides','guides'],['Stage Code…','stageCode'],['Align floor to fighters…','alignFloor'],['Align layer seam…','alignSeam'],['Depth authoring…','stageDepth'],['Live preview…','stageLive'],['Rebuild preview at this camera…','stageRebuild'],['Copy layer properties…','copyStageLayerProperties'],['Save selected assembly…','saveStageAssembly'],['Insert assembly…','insertStageAssembly'],['New round variant…','createStageVariant'],['Artwork coverage…','stageCoverage'],['Toggle camera and readability tools','stageCameraTools'],['Undo preview edit','undoPreview'],['Redo preview edit','redoPreview'],['Open selected source','source'],['Open selected sprite','assetSprite'],['Open embedded action','assetAction']]:surface==='storyboard'?[['Storyboard settings','sceneDefSettings'],['Add scene','add'],['Move scene up','moveSceneUp'],['Move scene down','moveSceneDown'],['Duplicate scene','duplicate'],['Remove scene','remove'],['Add layer','addLayer'],['Add sound cue','addSoundCue'],['Apply sound cue','applySoundCue'],['Play scene preview','storyPlay'],['Run in IKEMEN','runStoryboardExact'],['Open selected source','source']]:surface==='screenpack'?[['Previous element','screenpackPreviousElement'],['Next element','screenpackNextElement'],['Add screen','addScreen'],['Add element','addElement'],['Duplicate element','duplicateUiElement'],['Fit preview','fit'],['Toggle guides','guides'],['Open selected source','source']]:[['Previous roster record','rosterPrev'],['Next roster record','rosterNext'],['Fit roster preview','fitView'],['Zoom roster in','zoomIn'],['Zoom roster out','zoomOut'],['Toggle roster names','toggleNames'],['Toggle roster numbers','toggleNumbers'],['Reload roster from source','reload']];
    if(surface==='storyboard')local.push(['Assign Storyboard…','assignStoryboard'],['Refresh storyboard','refresh'],['Import layered PSD…','layeredPsd']);
    group(surface==='stage'?'Stage':'Screenpack').push({separator:true},...local.map(([label,element])=>({label,element})));
    for(const menu of groups)for(const item of menu.items)if(['layout','reset-layout'].includes(item.special))item.unavailableReason='Use this workspace’s own preview and navigation controls.';
  }
  const ids = new Set();
  for (const menu of groups) for (const item of menu.items) {
    if (item.separator) continue;
    item.id = toolbarItemId(item, requestedSurface);
    item.repeatable = repeatable(item, requestedSurface);
    item.shortcut = item.shortcut || SHORTCUTS[item.command] || '';
    item.tooltip = String(item.tooltip || item.label || 'Viewer action').slice(0, 1024);
    item.routeKind = item.command?'command':item.targetSurface?'cross-surface':item.action?'proxy':item.element?'element':item.selector?'selector':item.workflowAction?'workflow':'special';
    item.availability=item.availability||(!item.command?'local':CONTEXT_FREE_COMMANDS.has(item.command)?'context-free':SEED_COMMANDS.has(item.command)?'seed':TEXT_COMMAND.test(item.command)?'editor':/^(?:sff|air|snd)\./.test(item.command)?'surface-owner':'unproven');
    if (ids.has(item.id)) throw new Error(`Duplicate viewer toolbar action ID: ${item.id}`);
    ids.add(item.id);
  }
  if (groups.map(item => item.label).join('|') !== MENU_ORDER.join('|')) throw new Error(`Viewer toolbar menu order is not canonical for ${requestedSurface}.`);
  return groups;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function viewerColorsEnabled() {
  try { return require('vscode').workspace.getConfiguration('ikemenZss').get('viewerColorCoding', true) !== false; }
  catch (_) { return true; }
}
const STATIC_TONE_HUES=Object.freeze({danger:2,create:142,save:215,run:174,navigate:268,edit:34,view:195,neutral:220});
function staticButtonTone(value){const text=String(value||'').toLowerCase();if(/delete|remove|discard|clear|stop|close|cancel|cut/.test(text))return'danger';if(/new|add|create|duplicate|insert|paste/.test(text))return'create';if(/save|export|backup|copy/.test(text))return'save';if(/play|run|training|versus|launch|audition|loop|pause/.test(text))return'run';if(/previous|next|back|forward|seek|move earlier|move later|home|end|undo|redo/.test(text))return'navigate';if(/edit|replace|change|rename|apply|comment|crop|resize|rotate|align|remap/.test(text))return'edit';if(/view|preview|fit|zoom|axis|grid|show|open|browser|search|find|go to line/.test(text))return'view';return'neutral'}
function staticToneAttributes(value,key=value){const tone=staticButtonTone(value),source=String(key||value||'');let hash=0;for(let index=0;index<source.length;index++)hash=(hash*31+source.charCodeAt(index))>>>0;const hue=(STATIC_TONE_HUES[tone]+(hash%19)-9+360)%360;return` data-button-tone="${tone}" style="--viewer-button-hue:${hue}"`}
function actionEffect(surface, item) { return ACTION_EFFECTS[`${surface}:${item.special ? `special:${item.special}` : item.element || item.selector || ''}`] || null; }
function iconDefinitions(surface) {
  const item=(icon,label,actionId,separatorBefore=false)=>({icon,label,actionId,separatorBefore});
  if(['stage','screenpack','storyboard','select_def'].includes(surface)){
    const undo=surface==='select_def'?'undo':'visualWorkspaceUndo',redo=surface==='select_def'?'redo':'visualWorkspaceRedo';
    const entries=surface==='stage'?[['◀','Previous background','stagePrevious'],['▶','Next background','stageNext'],['＋','Add background','addBg'],['▣','Duplicate background','duplicateBg'],['×','Remove background','removeBg'],['□','Fit preview','fit'],['↶','Reset preview','reset'],['#','Toggle guides','guides'],['{ }','Stage Code…','stageCode'],['↔','Align floor to fighters…','alignFloor'],['⇆','Align layer seam…','alignSeam'],['◇','Depth authoring…','stageDepth'],['▶','Live preview…','stageLive'],['↻','Rebuild preview at this camera…','stageRebuild'],['⇉','Copy layer properties…','copyStageLayerProperties'],['▤','Save selected assembly…','saveStageAssembly'],['⧉','New round variant…','createStageVariant'],['▥','Artwork coverage…','stageCoverage'],['⌕','Open selected source','source']]:surface==='storyboard'?[['⚙','Storyboard settings','sceneDefSettings'],['＋','Add scene','add'],['↑','Move scene up','moveSceneUp'],['↓','Move scene down','moveSceneDown'],['▣','Duplicate scene','duplicate'],['×','Remove scene','remove'],['＋','Add layer','addLayer'],['♪','Add sound cue','addSoundCue'],['▶','Play scene preview','storyPlay'],['▶','Run in IKEMEN','runStoryboardExact'],['⌕','Open selected source','source']]:surface==='screenpack'?[['◀','Previous element','screenpackPreviousElement'],['▶','Next element','screenpackNextElement'],['＋','Add element','addElement'],['▣','Duplicate element','duplicateUiElement'],['□','Fit preview','fit'],['#','Toggle guides','guides'],['⌕','Open selected source','source']]:[['◀','Previous roster record','rosterPrev'],['▶','Next roster record','rosterNext'],['□','Fit roster preview','fitView'],['+','Zoom roster in','zoomIn'],['−','Zoom roster out','zoomOut'],['N','Toggle roster names','toggleNames'],['#','Toggle roster numbers','toggleNumbers'],['↻','Reload roster from source','reload']];
    if(surface==='storyboard')entries.push(['⇢','Assign Storyboard…','assignStoryboard'],['↻','Refresh storyboard','refresh'],['▧','Import layered PSD…','layeredPsd']);
    return [[item('↶','Undo workspace edit',surface+'.element.'+undo),item('↷','Redo workspace edit',surface+'.element.'+redo),...entries.map(([icon,label,id])=>item(icon,label,surface+'.element.'+id))]];
  }
  if(surface==='sff_creator')return [[
    item('↶','Undo focused document','command.undo'),item('↷','Redo focused document','command.redo'),item('⇩','Save Verified SFF Copy','sff_creator.element.saveTruecolorCopy',true),item('▣','Open Saved SFF','sff_creator.element.openVerifiedCopy'),item('▣','Create 2 Test SFFs','sff_creator.element.buildV21',true),item('≙','Open Writer Comparison','sff_creator.element.openWriterComparison'),item('↺','Update Active SFF (Compare Writers)','sff_creator.element.build'),item('▤','Create Package Only','sff_creator.element.apply',true),item('⇩','Export Creator Plan','sff_creator.element.exportPlan'),item('⇧','Import Creator Plan','sff_creator.element.importPlan'),item('×','Discard Creator Draft','sff_creator.element.discard',true)
  ]];
  if(surface==='code')return [[
    item('↶','Undo','command.undo'),item('↷','Redo','command.redo'),item('✂','Cut','command.editor.action.clipboardCutAction'),item('▱','Copy','command.editor.action.clipboardCopyAction'),item('▣','Paste','command.editor.action.clipboardPasteAction'),item('⌕','Find','command.actions.find'),item('⇄','Find / Replace','command.editor.action.startFindReplaceAction'),item('#','Go to Line','command.zss.goToLine'),item('//','Comment / Uncomment Selected Lines','command.zss.toggleLineComment'),item('←','Back','shared.back'),item('→','Forward','shared.forward')
  ]];
  if(surface==='code_structure')return [[
    item('⌕','Reveal selected block in text editor','code_structure.element.reveal'),item('◀','Previous connected code file','code_structure.element.filePrevious'),item('▶','Next connected code file','code_structure.element.fileNext'),item('⊙','Focus selected block','code_structure.element.focusSelected'),item('▤','Show all structure blocks','code_structure.element.showAll'),item('≡','Collapse all structure blocks','code_structure.element.collapse')
  ]];
  return [
    [
      ['sff','air','snd'].includes(surface)?item('↶',`${surface.toUpperCase()} viewer undo`,`${surface}.element.undoAsset`):surface==='palette'?item('↶','Undo Palette Workspace change','palette.element.undo'):item('↶','Undo focused document','command.undo'),['sff','air','snd'].includes(surface)?item('↷',`${surface.toUpperCase()} viewer redo`,`${surface}.element.redoAsset`):surface==='palette'?item('↷','Redo Palette Workspace change','palette.element.redo'):item('↷','Redo focused document','command.redo'),item('←','Back in viewer history','shared.back',true),item('→','Forward in viewer history','shared.forward'),item('▤','Pinned Sources','shared.pinned'),item('≙','Compare','shared.compare'),
      surface==='snd'&&item('⇄','Transfer Sounds…','snd.transfer.open'),surface==='snd'&&item('＋','Add WAV to Build Plan','snd.element.add'),surface==='snd'&&item('×','Remove from Build Plan','snd.element.delete'),surface==='snd'&&item('↔','Replace Selected Sound Source','snd.element.replace'),surface==='snd'&&item('▤','Export Selected WAV','snd.element.export'),surface==='snd'&&item('▶','Play Once','snd.special.audio-play'),surface==='snd'&&item('↻','Play with Loop','snd.special.audio-loop'),surface==='snd'&&item('Ⅱ','Pause','snd.special.audio-pause'),surface==='snd'&&item('■','Stop','snd.element.stop'),
      surface==='air'&&item('◀','Previous frame','air.element.prev'),surface==='air'&&item('▶','Next frame','air.element.next'),surface==='air'&&item('▷','Play animation','air.element.play'),
      surface==='sff'&&item('＋','Add sprites','sff.selector.data.action.addSprites',true),surface==='sff'&&item('×','Delete selected sprite','sff.selector.data.action.deleteSprite'),surface==='sff'&&item('▣','Duplicate selected sprite','sff.selector.data.action.duplicateSprite'),surface==='sff'&&item('⊟','Delete current sprite group','sff.selector.data.action.deleteGroup'),surface==='sff'&&item('R','Rename current sprite group','sff.selector.data.action.renameGroup'),surface==='sff'&&item('✎','Replace sprite image','sff.selector.data.action.changeImage'),surface==='sff'&&item('⇩','Export sprite images','sff.selector.data.action.exportSprites'),surface==='sff'&&item('▧','Export proof preview PNG','sff.element.exportPreviewPng'),surface==='sff'&&item('▨','Open image editor','sff.selector.data.action.openImageEditor'),surface==='sff'&&item('⚙','Choose image editor','command.sff.chooseImageEditor'),
      surface==='sff'&&item('▥','Browse sprite lists / thumbnails','command.sff.browseLists'),surface==='air'&&item('▥','Browse animation lists / thumbnails','command.air.browseLists'),surface==='snd'&&item('▥','Browse sound lists / waveforms','command.snd.browseLists'),
      ['sff','air','snd'].includes(surface)&&item('▦','Viewer layout','shared.special.layout',true),['sff','air','snd'].includes(surface)&&item('↺','Reset viewer layout','shared.special.reset-layout')
    ].filter(Boolean)
  ];
}
function iconToolbarHtml(surface){return `<div class="viewer-icon-toolbar" role="group" aria-label="Persistent viewer shortcuts">${iconDefinitions(surface).map((row,index)=>`<span class="viewer-icon-row" role="toolbar" aria-label="${index?'Editing and navigation':'Project and asset'} shortcuts">${row.map(item=>`${item.separatorBefore?'<span class="viewer-icon-spacer" aria-hidden="true"></span>':''}<button data-context-hint="${escapeHtml(headerContext.hint)}" data-toolbar-icon-action="${escapeHtml(item.actionId)}"${staticToneAttributes(`${item.actionId} ${item.label}`,item.actionId)} title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}"><span aria-hidden="true">${escapeHtml(item.icon)}</span></button>`).join('')}${index===1?`<button data-toolbar-icon-search${staticToneAttributes('search actions','toolbar-search')} title="Search all viewer actions" aria-label="Search all viewer actions"><span aria-hidden="true">⋯</span></button>`:''}</span>`).join('')}</div>`}
function menuHtml(surface) {
  return `<span class="viewer-dropdown-toolbar" role="menubar" aria-label="IKEMaker menus">${menuDefinitions(surface).map(group => `<details class="viewer-dropdown" data-toolbar-menu="${escapeHtml(group.label)}"><summary role="button">${escapeHtml(group.label)}</summary><div role="menu">${group.items.map(item => { if (item.separator) return '<hr>'; if(item.heading)return `<div class="viewer-menu-section" role="presentation">${escapeHtml(item.label)}</div>`; const effect = actionEffect(surface, item); return `<button role="menuitem" data-toolbar-action-id="${escapeHtml(item.id)}" data-toolbar-route-kind="${escapeHtml(item.routeKind)}" data-toolbar-availability="${escapeHtml(item.availability)}" data-toolbar-group="${escapeHtml(group.label)}" data-toolbar-repeatable="${item.repeatable ? 'true' : 'false'}"${item.tooltip ? ` title="${escapeHtml(item.tooltip)}"` : ''}${effect ? ` data-toolbar-changes="${escapeHtml(effect[0])}" data-toolbar-does-not-change="${escapeHtml(effect[1])}"` : ''}${item.shortcut ? ` data-toolbar-shortcut="${escapeHtml(item.shortcut)}"` : ''}${item.action ? ` data-toolbar-proxy="${escapeHtml(item.action)}"` : ''}${item.element ? ` data-toolbar-element="${escapeHtml(item.element)}"` : ''}${item.selector ? ` data-toolbar-selector="${escapeHtml(item.selector)}"` : ''}${item.special ? ` data-toolbar-special="${escapeHtml(item.special)}"` : ''}${item.workflowAction ? ` data-toolbar-workflow="${escapeHtml(item.workflowAction)}"` : ''}${item.targetSurface ? ` data-toolbar-target-surface="${escapeHtml(item.targetSurface)}" data-toolbar-target-action="${escapeHtml(item.targetAction)}"` : ''}>${escapeHtml(item.label)}</button>`; }).join('')}</div></details>`).join('')}<button class="viewer-action-search-button" data-toolbar-search aria-keyshortcuts="Alt+A" title="Search every command available in this viewer · Alt+A">Actions…</button></span>`;
}
const LEGACY_SURFACE_IDS = Object.freeze({
  shared:'help.workspace',png_stage:'stage.png-creation',
  code:'code.authoring-workspace',home:'transient.home',
  sff:'sff.viewer',air:'air.viewer',snd:'snd.viewer',artist_intake:'sff.artist-intake',sff_assembly:'sff.assembly',
  code_structure:'code.structure',command_movelist:'code.command-movelist',helper:'code.helper',hitdef:'code.hitdef',move_constants:'move.constants',spatial_composer:'code.spatial',
  mutation_history:'project.recovery',palette:'palette.workspace',palette_import:'palette.workspace',palette_index_organizer:'palette.workspace',palfx_editor:'palette.palfx',
  production_workflow:'project.production-workflow',project_manager:'project.manager',quick_launch:'project.quick-launch',storyboard:'story.storyboard',test_session:'project.tests'
  ,story_dialogue:'story.dialogue'
});
const LEGACY_ENABLED = Object.freeze(new Set(['new','close','open','text-source','backup','recovery','run','versus','training','restart','project','stage','sprites','animations','commands','states','sounds','palettes','viewer-browser','actions-search','suite-switch','updates','help','settings']));
const LEGACY_CONTEXT_FREE = Object.freeze(new Set(['close','recovery','restart','project','stage','viewer-browser','actions-search','suite-switch','updates','help','settings']));
const PRIMARY_ALREADY_OWNED = Object.freeze(new Set(['code','code_structure','command_movelist','helper','hitdef','move_constants','spatial_composer']));
function legacyUniversalModel(surface, options = {}) {
  const surfaceId = LEGACY_SURFACE_IDS[surface];
  if (!surfaceId) throw new Error(`No universal toolbar surface is registered for ${surface}.`);
  const enabledSlots = new Set(options.enabledSlots || []);
  const ownedSlots = new Set(options.ownedSlots || []);
  let autoSave=false;try{autoSave=require('./save_controls').enabled(options.seed||'');}catch(_){ }
  const fileSaveSurface=['sff','air'].includes(surface),saveAsSurface=['sff','air','snd'].includes(surface);
  const slots = SLOTS.map(slot => {
    const asset = ['sff','air','snd','palette'].includes(surface);
    const owned=ownedSlots.has(slot.id);
    const supported=(owned||(slot.id==='save'?fileSaveSurface:slot.id==='save-as'?saveAsSurface:slot.id==='auto-save'?asset:((asset ? LEGACY_ENABLED : LEGACY_CONTEXT_FREE).has(slot.id) || enabledSlots.has(slot.id)))) && !(slot.id === 'new' && surface === 'snd');
    const enabled=supported&&!(slot.id==='save'&&autoSave&&!owned);
    const reason=enabled?'':slot.id==='save'&&supported&&autoSave?'Save is unavailable because Auto Save is on.':`${slot.label} is not available from this ${String(surface).toUpperCase()} viewer selection.`;
    return { ...slot, enabled, reason, pressed:slot.id==='auto-save'?autoSave:undefined, manualSaveCapable:slot.id==='save'?supported:undefined, savePolicyOwned:slot.id==='save'?owned:undefined, dispatch: enabled ? `legacy.${slot.id}` : '', sourceCapabilityId: slot.id === 'text-source' ? 'planned.connected-only' : '', connectedResources: slot.id === 'connected-resources' };
  });
  return deepFreeze({ contractId: 'universal-v1', surfaceId, dimensions: DIMENSIONS, slots });
}
function controlsHtml(surface, options = {}) {
  const sessionSurface=options.sessionSurface||surface,universalModel=options.universalModel||legacyUniversalModel(surface,{...options,seed:options.seed}),surfaceId=options.universalSurfaceId||universalModel.surfaceId;
  const universal = options.includeUniversal === true || !PRIMARY_ALREADY_OWNED.has(surface) ? renderUniversalToolbar(universalModel, { surfaceId }) : '';
  const iconSurface=options.iconSurface||sessionSurface;
  const icons=options.includeSpecialistIcons===false?'':iconToolbarHtml(iconSurface),layout=options.includeLayout===false?'':require('./viewer_layout').html(surface);
  return `${universal}${menuHtml(sessionSurface)}${icons}<span class="viewer-toolbar-context" data-toolbar-context role="status" aria-live="polite"></span><span class="viewer-toolbar-options" data-compact="${['sff','air','snd'].includes(surface)&&require('./asset_workspace').compact()}" data-mode="${require('./interface_mode').current()}" data-viewer-colors="${viewerColorsEnabled()?'on':'off'}" data-toolbar-family="${surface}" data-toolbar-surface="${sessionSurface}">${layout}</span>`;
}
function targetAction(target, actionId) {
  return menuDefinitions(target, { nativeOnly: true }).filter(group => PARITY_GROUPS.includes(group.label)).flatMap(group => group.items).find(item => !item.separator && item.id === actionId && !item.targetSurface);
}
function waitForPanel(panel, timeout = 5000) {
  if (panels.has(panel)) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = value => { clearTimeout(timer); const waiting = readyWaiters.get(panel); waiting?.delete(finish); if (!waiting?.size) readyWaiters.delete(panel); resolve(value); };
    const timer = setTimeout(() => finish(false), timeout), waiting = readyWaiters.get(panel) || new Set();
    waiting.add(finish); readyWaiters.set(panel, waiting);
  });
}
async function handleCommand(message, seed, panel) {
  if (message?.type === 'viewerToolbarCrossSurfaceResult') {
    if (!message.ok) require('vscode').window.showInformationMessage(message.reason || 'That action is not available in the connected viewer yet.');
    return true;
  }
  if (message?.type === 'viewerToolbarCrossSurface') {
    const target = String(message.target || ''), action = targetAction(target, String(message.actionId || ''));
    if (!action || !['sff', 'air', 'snd'].includes(target) || message.source === target) return true;
    if (message.busy || message.safeToLeave === false) {
      require('vscode').window.showInformationMessage('Finish or revert the current viewer edit before handing an action to another asset viewer.');
      return true;
    }
    const opened = await require('./viewer_navigation').openConnected(seed, target, undefined, undefined, undefined);
    const panel = opened?.panel || opened;
    // openConnected owns missing-assignment and user-cancellation feedback.
    // Do not stack a second notification when no target was opened.
    if (!panel?.webview) return true;
    if (!await waitForPanel(panel)) {
      require('vscode').window.showInformationMessage(`The connected ${target.toUpperCase()} viewer was not ready for “${action.label}”.`);
      return true;
    }
    await panel.webview.postMessage({ type: 'viewerToolbarInvokeAction', actionId: action.id });
    return true;
  }
  if(message?.type==='viewerToolbarReady'&&panel){panelSeeds.set(panel,seed);return false;}
  if(message?.type==='viewerToolbarAction'){
    const plain=message&&(Object.getPrototypeOf(message)===Object.prototype||Object.getPrototypeOf(message)===null),keys=plain?Object.keys(message).sort():[];
    if(plain&&keys.length===3&&keys[0]==='actionId'&&keys[1]==='setup'&&keys[2]==='type'&&message.setup===true&&['shared.versus','shared.training'].includes(message.actionId)){await require('vscode').commands.executeCommand('ikemen.quickLaunch.openSetup',message.actionId==='shared.training'?'training':'versus');return true;}
    if(plain&&keys.length===3&&keys[0]==='actionId'&&keys[1]==='disposition'&&keys[2]==='type'&&typeof message.actionId==='string'){
      const placement=require('./toolbar_open_disposition');
      if(!placement.valid(message.disposition))return true;
      if(placement.closes(message.disposition)){await placement.apply(require('vscode'),message.disposition);return true;}
      const dispositionSurface=panels.get(panel)?.surface,dispositionItem=(dispositionSurface?menuDefinitions(dispositionSurface):[]).flatMap(group=>group.items).find(entry=>!entry.separator&&entry.id===message.actionId),dispositionSeed=panelSeeds.get(panel)||seed;
      if(dispositionItem?.action==='source'){
        await require('./viewer_navigation').openConnected(dispositionSeed,'source',undefined,undefined,require('./viewer_navigation').currentPoint(dispositionSeed,dispositionSurface,{},panel),undefined,{disposition:message.disposition});
        return true;
      }
      await handleCommand({type:message.type,actionId:message.actionId},seed,panel);
      await placement.apply(require('vscode'),message.disposition);
      return true;
    }
    if(!plain||keys.length!==2||keys[0]!=='actionId'||keys[1]!=='type'||typeof message.actionId!=='string'||message.actionId.length<1||message.actionId.length>256)return true;
    const surface=panels.get(panel)?.surface,groups=surface?menuDefinitions(surface):[],item=groups.flatMap(group=>group.items).find(entry=>!entry.separator&&entry.id===message.actionId);
    if(!item)return true;
    const actualSeed=panelSeeds.get(panel)||seed;
    const vscode=require('vscode'),availability=resolveActionAvailability(item,{surface,seed:actualSeed,vscode,active:surfaceIsActive(surface,panel,vscode,actualSeed)});
    if(!availability.enabled)return true;
    if(item.command){if(!MENU_COMMANDS.has(item.command))return true;await vscode.commands.executeCommand(item.command,...(['ikemen.stage.openWorkspace','ikemen.ui.openWorkspace','ikemen.storyboard.open'].includes(item.command)?[item.seed&&actualSeed?vscode.Uri.file(actualSeed):undefined,{contextHint:true}]:(item.seed&&actualSeed?[vscode.Uri.file(actualSeed)]:[])));return true;}
    if(item.targetSurface&&item.targetAction)return handleCommand({type:'viewerToolbarCrossSurface',source:surface,target:item.targetSurface,actionId:item.targetAction,requestId:'catalog',busy:false,safeToLeave:true},actualSeed,panel);
    if(item.action){const vscode=require('vscode'),commands={game:'ikemen.launchGame',versus:'ikemen.launchMirrorCurrent',training:'ikemen.launchTrainingCurrent'};if(commands[item.action]){await vscode.commands.executeCommand(commands[item.action]);return true;}if(item.action==='backup'){await require('./save_controls').handle({type:'ikemenMakeBackup'},actualSeed,panel);return true;}if(item.action==='related'){await require('./related_work').openRelatedWork(actualSeed?vscode.Uri.file(actualSeed):undefined,surface);return true;}if(['air','sff','snd','source'].includes(item.action)){await require('./viewer_navigation').openConnected(actualSeed,item.action,undefined,undefined,require('./viewer_navigation').currentPoint(actualSeed,surface,{},panel));return true;}if(item.action==='pinned'){await require('./viewer_sources').openSources(actualSeed,require('./viewer_navigation').currentPoint(actualSeed,surface,{},panel));return true;}if(item.action==='back-source'){await require('./viewer_navigation').backToSource(actualSeed,require('./viewer_navigation').currentPoint(actualSeed,surface,{},panel));return true;}if(item.action==='back'||item.action==='forward'){await require('./viewer_navigation').travelHistory(item.action==='back'?-1:1,require('./viewer_navigation').currentPoint(actualSeed,surface,{},panel));return true;}if(['used-by','compare'].includes(item.action))return true;}
    await panel?.webview?.postMessage({type:'viewerToolbarInvokeAction',actionId:item.id});return true;
  }
  if (message?.type !== 'viewerToolbarCommand') return false;
  // F3 retirement debt: exact host-only compatibility for restored old
  // webviews. Production clients never emit this envelope.
  const plain=message&&(Object.getPrototypeOf(message)===Object.prototype||Object.getPrototypeOf(message)===null),keys=plain?Object.keys(message).sort():[];
  if(!plain||keys.length!==3||keys[0]!=='command'||keys[1]!=='seed'||keys[2]!=='type'||typeof message.command!=='string'||message.command.length<1||message.command.length>256||typeof message.seed!=='boolean')return true;
  const command = message.command;
  if (!MENU_COMMANDS.has(command)) return true;
  const legacySurface=panels.get(panel)?.surface,legacyOwner=command.match(/^(sff|air|snd)\./)?.[1];
  if(legacyOwner&&legacySurface!==legacyOwner&&legacySurface!=='code')return true;
  const vscode = require('vscode');
  const args = message.seed && seed ? [vscode.Uri.file(seed)] : [];
  if (command.startsWith('ikeminer.') && vscode.extensions?.getExtension && !vscode.extensions.getExtension('justnopoint.ikeminer')) {
    vscode.window.showInformationMessage('IkeMiner is not installed or enabled. IKEMaker stayed open.');
    return true;
  }
  try { await vscode.commands.executeCommand(command, ...(['ikemen.stage.openWorkspace','ikemen.ui.openWorkspace','ikemen.storyboard.open'].includes(command)?[args[0],{contextHint:true}]:args)); }
  catch (error) {
    if (command.startsWith('ikeminer.')) vscode.window.showErrorMessage(`IkeMiner could not open. IKEMaker stayed open. ${error.message || error}`);
    else throw error;
  }
  return true;
}
async function postActionState(panel) {
  const registered = panels.get(panel);
  if (!registered) return;
  const { surface } = registered;
  const seed = panelSeeds.get(panel);
  const vscode = optionalVscode();
  const active = surfaceIsActive(surface, panel, vscode, seed);
  const actions = menuDefinitions(surface).flatMap(group => group.items)
    .filter(item => !item.separator)
    .map(item => {
      const availability = ['used-by', 'compare'].includes(item.action)
        ? { enabled: false, reason: 'Select an exact viewer item before using this action.' }
        : resolveActionAvailability(item, { surface, seed, vscode, active });
      return { actionId: item.id, ...availability };
    });
  await panel.webview.postMessage({ type: 'viewerToolbarActionState', surface, actions });
}
async function handle(message, panel, options = {}) {
  const current=()=>typeof options?.isCurrent!=='function'||options.isCurrent();
  if(!current())return true;
  if (!['viewerToolbarReady', 'viewerToolbarSave', 'viewerToolbarActivityReady', 'viewerToolbarActivitySave'].includes(message?.type)) return false;
  if (!panel?.webview || !/^[a-z][a-z0-9_-]{0,60}$/.test(message.surface || '')) return true;
  if (!panels.has(panel)) { panels.set(panel, {surface:message.surface,mode:['player','simple','workspace'].includes(message.mode)?message.mode:require('./interface_mode').current()}); const focusSubscription = panel.onDidChangeViewState?.(() => {
    if (panel.active) void postActionState(panel).catch(error => console.warn('Toolbar focus refresh failed', error));
  }); panel.onDidDispose?.(() => { focusSubscription?.dispose(); panels.delete(panel); panelSeeds.delete(panel); for (const finish of readyWaiters.get(panel) || []) finish(false); readyWaiters.delete(panel); }); for (const finish of [...(readyWaiters.get(panel) || [])]) finish(true); }
  if(message.type==='viewerToolbarReady'&&['player','simple','workspace'].includes(message.mode))panels.set(panel,{surface:message.surface,mode:message.mode});
  const {surface,mode} = panels.get(panel);
  if (message.type === 'viewerToolbarReady') {
    await panel.webview.postMessage({type:'viewerToolbarPreferences', surface:message.surface, mode:panels.get(panel).mode, preferences:read(message.surface,panels.get(panel).mode)});
    if(!current())return true;
    await postActionState(panel);
    return true;
  }
  if (message.type === 'viewerToolbarActivityReady') {
    await panel.webview.postMessage({ type: 'viewerToolbarActivity', surface, activity: normalizeActivity(activityPreferences[surface]) });
    return true;
  }
  if (message.type === 'viewerToolbarActivitySave') {
    const change = normalizeActivity(message.activity);
    writing = writing.catch(() => {}).then(async () => {
      if (!storage) throw new Error('Toolbar activity preferences are not available yet. Reopen the viewer.');
      const next = { ...activityPreferences, [surface]: change };
      await storage.update(ACTIVITY_KEY, next); activityPreferences = next;
      for (const [target, kind] of panels) if (kind.surface === surface) await target.webview.postMessage({ type: 'viewerToolbarActivity', surface, activity: change, saved: true });
    });
    try { await writing; } catch (error) { await panel.webview.postMessage({ type: 'viewerToolbarActivityError', surface, message: error.message }); }
    return true;
  }
  // A serialized queue prevents two simultaneously open viewers from losing
  // each other's preferences, and only broadcasts changes after persistence.
  const change = normalize(message.preferences);
  writing = writing.catch(() => {}).then(async () => {
    if (!storage) throw new Error('Toolbar preferences are not available yet. Reopen the viewer.');
    const next = {...preferences, [surface+':'+mode]:change};
    await storage.update(KEY, next); preferences = next;
    for (const [target, kind] of panels) if (kind.surface === surface && kind.mode === mode) await target.webview.postMessage({type:'viewerToolbarPreferences',surface,mode,preferences:change,saved:true});
  });
  try { await writing; } catch(error) { await panel.webview.postMessage({type:'viewerToolbarError',surface,mode,message:error.message}); }
  return true;
}

function combineActionAvailability(hostEnabled, hostReason, localEnabled, localReason) {
  const enabled=hostEnabled===true&&localEnabled===true;
  return {enabled,reason:enabled?'':hostEnabled!==true?(String(hostReason||'This action is unavailable in the current project or editor context.')):String(localReason||'This action is unavailable in the current viewer.')};
}

function client(combineAvailability) {
  for (const toolbar of document.querySelectorAll('.launch-controls')) {
    const options = toolbar.querySelector('[data-toolbar-surface]'); if (!options) continue;
    const surface = options.dataset.toolbarSurface,family=options.dataset.toolbarFamily||surface;
    document.body.dataset.viewerSurface=family;document.body.dataset.viewerColors=options.dataset.viewerColors==='off'?'off':'on';
    const buttonTone=button=>{const value=[button.id,button.className,button.dataset.action,button.dataset.toolbarActionId,button.dataset.toolbarIconAction,button.title,button.textContent].filter(Boolean).join(' ').toLowerCase();if(/delete|remove|discard|clear|stop|close|cancel/.test(value))return'danger';if(/new|add|create|duplicate|insert/.test(value))return'create';if(/save|export|backup|copy/.test(value))return'save';if(/play|run|training|versus|launch|audition|loop|pause/.test(value))return'run';if(/previous|next|back|forward|seek|move earlier|move later|home|end/.test(value))return'navigate';if(/edit|replace|change|rename|apply|comment|crop|resize|rotate|align|remap/.test(value))return'edit';if(/view|preview|fit|zoom|axis|grid|show|open|browser|search|find/.test(value))return'view';return'neutral'};const toneHue={danger:2,create:142,save:215,run:174,navigate:268,edit:34,view:195,neutral:220};const colorizeButton=button=>{if(button.dataset.viewerColorSwatch==='true'){delete button.dataset.buttonTone;button.style.removeProperty('--viewer-button-hue');return}if(button.dataset.buttonTone)return;const tone=buttonTone(button),key=[button.id,button.dataset.action,button.dataset.toolbarActionId,button.dataset.toolbarIconAction,button.textContent].filter(Boolean).join('|');let hash=0;for(let index=0;index<key.length;index++)hash=(hash*31+key.charCodeAt(index))>>>0;button.dataset.buttonTone=tone;button.style.setProperty('--viewer-button-hue',String((toneHue[tone]+(hash%19)-9+360)%360))};const colorizeButtons=root=>{if(root?.matches?.('button'))colorizeButton(root);for(const button of root?.querySelectorAll?.('button')||[])colorizeButton(button)};colorizeButtons(document);if(typeof MutationObserver==='function')new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)colorizeButtons(node)}).observe(document.body,{childList:true,subtree:true});
    // These three viewers predate the canonical chrome. Keep their original
    // controls in the DOM as action owners, but do not render that old header
    // as a second toolbar beside the shared menus and fixed-size quick icons.
    if(['sff','air','snd'].includes(family))toolbar.parentElement?.classList.add('viewer-primary-toolbar');
    if(surface==='sff')document.getElementById('saveSff')?.parentElement?.classList.add('legacy-viewer-action-row');
    const buttons = [...toolbar.querySelectorAll('button')].filter(button => button.hasAttribute('data-ikemen-save') || button.hasAttribute('data-ikemen-used-by') || button.hasAttribute('data-ikemen-history') || button.hasAttribute('data-ikemen-back-source') || button.hasAttribute('data-ikemen-related') || button.hasAttribute('data-ikemen-viewer') || button.hasAttribute('data-ikemen-launch'));
    const identity = button => button.hasAttribute('data-ikemen-save') ? button.dataset.ikemenSave : button.hasAttribute('data-ikemen-used-by') ? 'used-by' : button.hasAttribute('data-ikemen-history') ? button.dataset.ikemenHistory : button.hasAttribute('data-ikemen-back-source') ? 'back-source' : button.hasAttribute('data-ikemen-related') ? 'related' : button.dataset.ikemenViewer || button.dataset.ikemenLaunch;
    const actions = new Map(buttons.map(button => [identity(button),button]));
    for(const [id,button] of actions)button.dataset.toolbarActionId='shared.'+id;
    const menuBar=toolbar.querySelector('.viewer-dropdown-toolbar');
    const contextStrip=toolbar.querySelector('[data-toolbar-context]'),contextConfig={sff_creator:{label:'SFF Creator',owner:'SFF Creator',ids:['status'],warnings:['status']},sff:{label:'SFF',owner:'SFF viewer',ids:['selectionStatus','spritePositionReadout','spriteReferenceStatus'],warnings:['reviewStatus','layerStatus','paletteStatus']},air:{label:'AIR',owner:'AIR viewer',ids:['actionSelectionStatus','frameInfo'],warnings:['airSaveStatus','frameEditStatus','editStatus']},snd:{label:'SND',owner:'SND viewer',ids:['soundSelectionStatus','soundPositionReadout','soundFormatStatus'],warnings:['issues']}}[surface==='sff_creator'?'sff_creator':family]||{label:surface==='move_constants'||surface==='move_lab'?'Move Lab':String(surface||'').toUpperCase(),owner:'current viewer',ids:[],warnings:[]},contextIds=contextConfig.ids;const compactContext=value=>String(value||'').split(/\r?\n/).map(line=>line.trim()).find(Boolean)||'',updateContextStrip=()=>{const parts=contextIds.map(id=>compactContext(document.getElementById(id)?.textContent)).filter(Boolean).filter((value,index,all)=>all.indexOf(value)===index),warning=contextConfig.warnings.map(id=>compactContext(document.getElementById(id)?.textContent)).find(value=>/error|missing|unresolved|warning|dirty|pending|failed/i.test(value)),value=[contextConfig.label,...parts,warning?'⚠ '+warning:''].filter(Boolean).join(' · ');contextStrip.textContent=value;contextStrip.title=[...parts,warning,'Mutation owner: '+contextConfig.owner].filter(Boolean).join('\n');contextStrip.dataset.contextOwner=contextConfig.owner};updateContextStrip();if(typeof MutationObserver==='function'){const contextObserver=new MutationObserver(updateContextStrip);for(const id of [...new Set([...contextIds,...contextConfig.warnings])]){const source=document.getElementById(id);if(source)contextObserver.observe(source,{childList:true,subtree:true,characterData:true})}}
    const dropdowns=[...menuBar.querySelectorAll('.viewer-dropdown')];
    const menuActions=[...menuBar.querySelectorAll('.viewer-dropdown button[data-toolbar-action-id]')], actionById=new Map(menuActions.map(button=>[button.dataset.toolbarActionId,button])),menuUnavailable=button=>button?.getAttribute('aria-disabled')==='true';for(const button of menuActions){button.dataset.toolbarHostEnabled='false';button.dataset.toolbarHostReason='Checking the current project and editor context…';button.disabled=false;button.setAttribute('aria-disabled','true');button.title=button.dataset.toolbarHostReason;button.addEventListener('click',event=>{if(!menuUnavailable(button))return;event.preventDefault();event.stopImmediatePropagation()},true)}
    const savedWebviewState=vscode.getState?.()||{}, savedActivity=savedWebviewState.viewerActionActivity?.[surface]||{};
    let activity={favorites:[...new Set(savedActivity.favorites||[])].filter(id=>actionById.has(id)),recent:[...new Set(savedActivity.recent||[])].filter(id=>actionById.has(id)).slice(0,8),repeatable:actionById.get(savedActivity.repeatable)?.dataset.toolbarRepeatable==='true'?savedActivity.repeatable:''},renderFavoriteBar=()=>{};
    const persistActivity=()=>{const latest=vscode.getState?.()||{};vscode.setState?.({...latest,viewerActionActivity:{...(latest.viewerActionActivity||{}),[surface]:activity}});renderFavoriteBar();activityStatus.textContent='Saving action preferences…';vscode.postMessage({type:'viewerToolbarActivitySave',surface,activity})};
    const remember=button=>{const id=button?.dataset.toolbarActionId;if(!id||button.dataset.toolbarSpecial==='repeat')return;activity.recent=[id,...activity.recent.filter(value=>value!==id)].slice(0,8);if(button.dataset.toolbarRepeatable==='true')activity.repeatable=id;persistActivity()};
    const closeDropdowns=except=>{for(const menu of dropdowns)if(menu!==except)menu.open=false;};
    const directProxy=new Set(['back','forward','back-source','used-by','related','air','sff','snd','source','pinned','compare','game','versus','training','backup','autosave']);
    const refreshMenu=menu=>{for(const button of menu.querySelectorAll('button')){let owner=null,localEnabled=true,localReason='';if(button.dataset.toolbarTargetSurface){const blocked=globalThis.ikemenIsBusy?.()===true||globalThis.ikemenCanLeaveAsset?.()===false;localEnabled=!blocked;localReason=blocked?'Finish or revert the current viewer edit before opening another asset action.':''}else if(button.dataset.toolbarElement){owner=document.getElementById(button.dataset.toolbarElement);localEnabled=Boolean(owner);localReason=owner?'':'This control is not available in the current viewer.'}else if(button.dataset.toolbarSelector){owner=document.querySelector(button.dataset.toolbarSelector);localEnabled=Boolean(owner);localReason=owner?'':'This operation is not available in the current viewer.'}else if(button.dataset.toolbarProxy){owner=actions.get(button.dataset.toolbarProxy);localEnabled=Boolean(owner)||directProxy.has(button.dataset.toolbarProxy);localReason=localEnabled?'':'The connected command is not available.'}else if(button.dataset.toolbarSpecial==='repeat'){owner=actionById.get(activity.repeatable);button.textContent=owner?'Repeat: '+owner.textContent.trim():'Repeat Last Safe Action';localEnabled=Boolean(owner);localReason=owner?'':'Run a navigation, view, or playback action first.'}if(owner){owner.dataset.toolbarActionId=owner.dataset.toolbarActionId||button.dataset.toolbarActionId;localEnabled=!owner.disabled;localReason=owner.disabled?(owner.title||'The previous action is not available for the current selection.'):''}const state=combineAvailability(button.dataset.toolbarHostEnabled==='true',button.dataset.toolbarHostReason,localEnabled,localReason);button.disabled=false;button.setAttribute('aria-disabled',state.enabled?'false':'true');if(!state.enabled)button.title=state.reason;else if(button.dataset.toolbarShortcut)button.title='Shortcut: '+button.dataset.toolbarShortcut;else if(owner?.title)button.title=owner.title;else button.removeAttribute('title')}};
    const placeableAction=button=>{if(!button)return false;const proxy=button.dataset.toolbarProxy||'',route=button.dataset.toolbarRouteKind||'',label=[button.textContent,button.title,button.dataset.toolbarActionId].filter(Boolean).join(' ').toLowerCase();return route==='cross-surface'||['air','sff','snd','source','pinned','related'].includes(proxy)||/(?:open|viewer|browser|workspace|workshop|editor|manager|guide|documentation|connected|project|stage|screenpack|palette|command|state|sound|sprite|animation|coding assistance)/.test(label)};
    const syncIconStates=()=>{for(const icon of toolbar.querySelectorAll('[data-toolbar-icon-action]')){const original=actionById.get(icon.dataset.toolbarIconAction),unavailable=!original||menuUnavailable(original);icon.disabled=unavailable;icon.title=!original?'This shortcut is unavailable in the current viewer.':unavailable?(original.title||'This shortcut is unavailable right now.'):(icon.getAttribute('aria-label')||original.textContent.trim());
      const hasOptions=Boolean(original&&(placeableAction(original)||['versus','training'].includes(original.dataset.toolbarProxy)));
      if(hasOptions){icon.dataset.headerContextOptions='true';icon.setAttribute('aria-keyshortcuts','Shift+F10');if(!unavailable)icon.title+=' · '+icon.dataset.contextHint;}
      else{delete icon.dataset.headerContextOptions;icon.removeAttribute('aria-keyshortcuts');}
    }};globalThis.document?.addEventListener('ikemaker-toolbar-state-changed',()=>{for(const menu of dropdowns)refreshMenu(menu);syncIconStates()});
    const invokeResolved=button=>{if(!button||button.disabled)return;const action=button.dataset.toolbarProxy,element=button.dataset.toolbarElement,selector=button.dataset.toolbarSelector,special=button.dataset.toolbarSpecial,workflow=button.dataset.toolbarWorkflow;if(action){const owned=actions.get(action);if(owned){owned.click();return}}if(element){document.getElementById(element)?.click();return}if(selector){document.querySelector(selector)?.click();return}if(workflow){const trigger=document.createElement('button');trigger.dataset.workflowAction=workflow;trigger.hidden=true;document.body.append(trigger);trigger.click();trigger.remove();return}if(special==='asset-undo'||special==='asset-redo'){vscode.postMessage({type:'viewerAssetHistory',direction:special==='asset-redo'?'redo':'undo'});return}if(special==='workspace-mode'){vscode.postMessage({type:'assetWorkspaceOptions'});return}if(special==='layout'){options.querySelector('[data-viewer-layout]')?.click();return}if(special==='reset-layout'){options.querySelector('[data-viewer-layout-reset]')?.click();return}const audio=document.querySelector('audio');if(special==='audio-play'){audio?.play().catch(()=>{});return}if(special==='audio-loop'){const loop=document.getElementById('loop');if(loop){loop.checked=true;loop.dispatchEvent(new Event('change',{bubbles:true}))}audio?.play().catch(()=>{});return}if(special==='audio-pause')audio?.pause()};const invoke=button=>{if(!button||button.disabled||menuUnavailable(button))return;const special=button.dataset.toolbarSpecial;if(special==='repeat'){const previous=actionById.get(activity.repeatable);if(previous&&previous!==button){refreshMenu(previous.closest('.viewer-dropdown'));if(!menuUnavailable(previous))invoke(previous)}return}vscode.postMessage({type:'viewerToolbarAction',actionId:button.dataset.toolbarActionId})};

    let placementMenu=null,placementTrigger=null;const closePlacementMenu=(restoreFocus=false)=>{placementMenu?.remove();placementMenu=null;const trigger=placementTrigger;placementTrigger=null;if(restoreFocus&&trigger?.isConnected)trigger.focus()};const movePlacementFocus=(menu,event)=>{const items=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')],at=items.indexOf(document.activeElement);if(!items.length)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePlacementMenu(true);return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowUp'?(at<=0?items.length-1:at-1):(at<0||at===items.length-1?0:at+1);items[next].focus()};const showPlacementMenu=(event,original,trigger)=>{if(['versus','training'].includes(original?.dataset.toolbarProxy)){event.preventDefault();event.stopPropagation();vscode.postMessage({type:'viewerToolbarAction',actionId:original.dataset.toolbarActionId,setup:true});return}if(!placeableAction(original))return;event.preventDefault();event.stopPropagation();closePlacementMenu();placementTrigger=trigger;const menu=document.createElement('div');menu.className='ikemaker-toolbar-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',(original.textContent.trim()||'Viewer action')+' options');for(const [disposition,label]of[['beside','Open side by side'],['window','Open in new window'],['close-tab','Close current tab'],['close-window','Close current window']]){const choice=document.createElement('button');choice.type='button';choice.setAttribute('role','menuitem');choice.textContent=label;choice.disabled=original.disabled&&(disposition==='beside'||disposition==='window');choice.onclick=()=>{closePlacementMenu();vscode.postMessage({type:'viewerToolbarAction',actionId:original.dataset.toolbarActionId,disposition})};menu.append(choice)}menu.addEventListener('keydown',event=>movePlacementFocus(menu,event));toolbar.append(menu);const width=200,height=menu.offsetHeight||124,rect=trigger?.getBoundingClientRect?.(),clientX=Number.isFinite(event.clientX)&&event.clientX>0?event.clientX:rect?.left,clientY=Number.isFinite(event.clientY)&&event.clientY>0?event.clientY:rect?.bottom;menu.style.left=Math.max(4,Math.min(clientX||4,innerWidth-width-4))+'px';menu.style.top=Math.max(4,Math.min(clientY||4,innerHeight-height-4))+'px';placementMenu=menu;menu.querySelector('button:not(:disabled)')?.focus()};
    for(const icon of toolbar.querySelectorAll('[data-toolbar-icon-action]'))icon.onclick=()=>{const original=actionById.get(icon.dataset.toolbarIconAction);if(!original){icon.disabled=true;icon.title='This shortcut is unavailable in the current viewer.';return}refreshMenu(original.closest('.viewer-dropdown'));icon.disabled=menuUnavailable(original);if(!icon.disabled)invoke(original)};toolbar.querySelector('[data-toolbar-icon-search]')?.addEventListener('click',()=>menuBar.querySelector('[data-toolbar-search]')?.click());
    const toolbarContext=event=>{const target=event.target.closest('[data-toolbar-action-id],[data-toolbar-icon-action],[data-toolbar-context-action]');if(!target)return;const original=target.dataset.toolbarActionId?actionById.get(target.dataset.toolbarActionId):actionById.get(target.dataset.toolbarIconAction||target.dataset.toolbarContextAction);if(original)showPlacementMenu(event,original,target)};toolbar.addEventListener('contextmenu',toolbarContext);toolbar.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))toolbarContext(event)});document.addEventListener('pointerdown',event=>{if(placementMenu&&!placementMenu.contains(event.target))closePlacementMenu()});
    addEventListener('message',event=>{const message=event.data,plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype,exact=(value,keys)=>plain(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');if(message?.type==='viewerToolbarActionState'){if(!exact(message,['type','surface','actions'])||message.surface!==surface||!Array.isArray(message.actions))return;const seen=new Set(),validated=[];for(const state of message.actions){if(!exact(state,['actionId','enabled','reason'])||!actionById.has(state.actionId)||seen.has(state.actionId)||typeof state.enabled!=='boolean'||typeof state.reason!=='string'||new TextEncoder().encode(state.reason).length>1024)continue;seen.add(state.actionId);validated.push(state)}for(const state of validated){const button=actionById.get(state.actionId);button.dataset.toolbarHostEnabled=state.enabled?'true':'false';button.dataset.toolbarHostReason=state.reason}for(const menu of dropdowns)refreshMenu(menu);syncIconStates();renderFavoriteBar();return}if(!exact(message,['type','actionId'])||message.type!=='viewerToolbarInvokeAction'||!actionById.has(message.actionId))return;const button=actionById.get(message.actionId);refreshMenu(button.closest('.viewer-dropdown'));if(button.disabled)return;remember(button);invokeResolved(button);});
    let menuTypeahead='',menuTypeaheadTimer=0;const focusMenuItem=(menu,index)=>{const items=[...menu.querySelectorAll('button:not(:disabled)')];if(!items.length)return;items[(index+items.length)%items.length].focus()};
    for(const menu of dropdowns){
      menu.addEventListener('toggle',()=>{if(menu.open){closeDropdowns(menu);refreshMenu(menu)}});
      for(const button of menu.querySelectorAll('button'))button.onclick=()=>{menu.open=false;invoke(button)};
      menu.addEventListener('keydown',event=>{const summary=menu.querySelector('summary'),items=[...menu.querySelectorAll('button:not(:disabled)')],at=items.indexOf(document.activeElement);if(document.activeElement===summary&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();menu.open=true;refreshMenu(menu);focusMenuItem(menu,event.key==='ArrowUp'?-1:0);return}if(at<0)return;if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focusMenuItem(menu,event.key==='Home'?0:event.key==='End'?-1:at+(event.key==='ArrowUp'?-1:1));return}if(event.key==='Escape'){event.preventDefault();menu.open=false;summary.focus();return}if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const menuAt=dropdowns.indexOf(menu),next=dropdowns[(menuAt+(event.key==='ArrowLeft'?-1:1)+dropdowns.length)%dropdowns.length];menu.open=false;next.open=true;refreshMenu(next);next.querySelector('summary').focus();return}if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){clearTimeout(menuTypeaheadTimer);menuTypeahead+=event.key.toLowerCase();const match=items.find(item=>item.textContent.trim().toLowerCase().startsWith(menuTypeahead));if(match)match.focus();menuTypeaheadTimer=setTimeout(()=>{menuTypeahead=''},700)}});
    }
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.viewer-dropdown'))closeDropdowns();});
    const searchDialog=document.createElement('dialog');searchDialog.className='viewer-toolbar-dialog viewer-action-search';searchDialog.setAttribute('aria-label','Search viewer actions');searchDialog.innerHTML='<h2>Actions</h2><input data-toolbar-search-input type="search" placeholder="Search project, edit, view, asset, and tool actions" aria-label="Search actions"><div class="viewer-action-search-filters"><label class="viewer-action-filter">Category <select data-toolbar-group-filter aria-label="Filter actions by category"><option value="">All categories</option></select></label><label class="viewer-action-filter"><input type="checkbox" data-toolbar-available> Available now only</label><label class="viewer-action-filter"><input type="checkbox" data-toolbar-favorites-only> Favorites only</label></div><p class="viewer-action-search-help">Star frequent actions, then use the arrow buttons to set their order. Recent actions stay at the top. Use Alt+A from anywhere; use Up/Down, Home/End, and Enter without leaving the keyboard. Press Escape to close this window and return to the viewer.</p><p class="viewer-action-search-summary" data-toolbar-search-summary aria-live="polite"></p><div class="viewer-action-search-layout"><div data-toolbar-search-results role="listbox"></div><aside class="viewer-action-details" data-toolbar-action-details aria-live="polite"><h3>Action details</h3><p>Focus an action to see its route, availability, and safe-repeat status before running it.</p></aside></div><p role="status" data-toolbar-activity-status></p><div class="viewer-toolbar-dialog-actions"><button data-toolbar-clear-recent>Clear recent actions</button><button data-toolbar-search-close>Close</button></div>';document.body.append(searchDialog);const searchInput=searchDialog.querySelector('[data-toolbar-search-input]'),groupFilter=searchDialog.querySelector('[data-toolbar-group-filter]'),availableOnly=searchDialog.querySelector('[data-toolbar-available]'),favoritesOnly=searchDialog.querySelector('[data-toolbar-favorites-only]'),searchSummary=searchDialog.querySelector('[data-toolbar-search-summary]'),searchResults=searchDialog.querySelector('[data-toolbar-search-results]'),actionDetails=searchDialog.querySelector('[data-toolbar-action-details]'),activityStatus=searchDialog.querySelector('[data-toolbar-activity-status]');let actionSearchReturnFocus=null,actionSearchInvoking=false;searchDialog.addEventListener('close',()=>{if(!actionSearchInvoking&&actionSearchReturnFocus?.isConnected)actionSearchReturnFocus.focus();actionSearchInvoking=false;actionSearchReturnFocus=null});for(const group of [...new Set(menuActions.map(action=>action.dataset.toolbarGroup||'Other'))]){const option=document.createElement('option');option.value=group;option.textContent=group;groupFilter.append(option)}
    const actionLabel=original=>{const menu=original.closest('.viewer-dropdown')?.querySelector('summary')?.textContent.trim()||'';return menu+' · '+original.textContent.trim()};
    const showActionDetails=original=>{const heading=document.createElement('h3'),purpose=document.createElement('p'),category=document.createElement('p'),shortcut=document.createElement('p'),route=document.createElement('p'),scope=document.createElement('p'),changes=document.createElement('p'),unchanged=document.createElement('p'),files=document.createElement('p'),recovery=document.createElement('p'),availability=document.createElement('p'),repeat=document.createElement('p'),owner=original.dataset.toolbarElement?document.getElementById(original.dataset.toolbarElement):original.dataset.toolbarSelector?document.querySelector(original.dataset.toolbarSelector):original.dataset.toolbarProxy?actions.get(original.dataset.toolbarProxy):null,viewerOwned=Boolean(owner),crossSurface=original.dataset.toolbarTargetSurface;heading.textContent=original.textContent.trim();purpose.textContent='Purpose: '+(owner?.title||original.title||original.textContent.trim());category.textContent='Category: '+(original.dataset.toolbarGroup||'Other');shortcut.textContent='Shortcut: '+(original.dataset.toolbarShortcut||'None assigned');route.textContent=crossSurface?'Route: Opens the connected '+crossSurface.toUpperCase()+' viewer and asks its owning control to run after it is ready.':original.dataset.toolbarRouteKind==='command'?'Route: Host resolves a registered IKEMEN or editor command from this action ID.':viewerOwned?'Route: Uses the current viewer owner instead of cloning its behavior.':'Route: Viewer navigation or presentation helper.';scope.textContent='Scope: '+(crossSurface?'Connected '+crossSurface.toUpperCase()+' viewer selection/draft.':viewerOwned?'Current '+surface.toUpperCase()+' viewer selection/draft.':'Host-proven workbench or viewer context.');changes.textContent='Changes: '+(original.dataset.toolbarChanges||'Determined and reported by the owning workflow after review.');unchanged.textContent='Does not change: '+(original.dataset.toolbarDoesNotChange||'Opening this Actions detail view changes nothing.');files.textContent='Files affected: exact targets remain owned and reported by the destination workflow; opening this detail view writes nothing.';recovery.textContent=original.dataset.toolbarRepeatable==='true'?'Recovery: view/navigation action; no project mutation is repeated.':'Recovery: the owning action retains its existing confirmation, Undo, draft, or reviewed-build contract.';availability.textContent=original.disabled?'Unavailable: '+(original.title||'Select a compatible item or finish the pending operation first.'):'Available now.';repeat.textContent=original.dataset.toolbarRepeatable==='true'?'Safe Repeat: eligible after it runs.':'Safe Repeat: not eligible; run deliberately from its owning action.';actionDetails.replaceChildren(heading,purpose,category,shortcut,route,scope,changes,unchanged,files,recovery,availability,repeat)};
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(searchDialog.open){event.preventDefault();event.stopPropagation();searchDialog.close();return}const open=dropdowns.find(menu=>menu.open);if(open){event.preventDefault();event.stopPropagation();open.open=false;open.querySelector('summary')?.focus()}},true);
    const intentAliases={'add sound':['sounds','add','wav'],'find sound':['sounds','used by'],'edit sound':['sounds','audio editor'],'export sound range':['sounds','export a–b audition range'],'save sound selection':['sounds','export a–b audition range'],'assign sound archive':['review','assign loaded snd','profile'],'copy playsnd':['sounds','copy native playsnd'],'sound def line':['build','copy character def fx'],'original maker text':['review','open any sndmaker'],'sort sounds':['build','sort manifest'],'audition pitch':['sounds','frequency','audition'],'audition speed':['sounds','frequency','audition'],'go to sound':['sounds','group','index'],'new animation':['animations','new action'],'create animation':['animations','new action'],'duplicate animation':['animations','duplicate action'],'add sprites':['sprites','add sprites','build plan'],'import sprites':['sprites','add sprites','build plan'],'find map':['tools','map','browser'],'fix collision':['animations','clsn'],'edit collision':['animations','clsn'],'find references':['used by'],'recover change':['review','history'],'undo asset change':['review','history'],'make palette':['palettes','create'],'edit palette':['palettes','edit'],'clean palette indexes':['build','index','cleanup'],'finish palette build':['palettes','finish','reviewed'],'test character':['project','test current character'],'check character':['review','health'],'edit move':['tools','move lab'],'edit command':['tools','command','movelist'],'duplicate command':['tools','command','movelist'],'revert command':['tools','command','movelist'],'edit movelist':['tools','command','movelist'],'find glyph':['tools','command','movelist'],'command conflict':['tools','command','movelist'],'input overlap':['tools','command','movelist'],'find symbol':['tools','symbols'],'why not run':['tools','code structure'],'edit stage':['tools','stage workspace'],'edit screenpack':['tools','screenpack'],'edit roster':['tools','roster manager'],'make story':['tools','story','dialogue'],'make storyboard':['tools','storyboard']};
    const searchTerms=query=>intentAliases[query]||query.split(/\s+/).filter(Boolean);
    const renderSearch=()=>{const query=searchInput.value.trim().toLowerCase(),terms=searchTerms(query),ordered=[],seen=new Set();const add=id=>{const original=actionById.get(id);if(original&&!seen.has(id)){seen.add(id);ordered.push(original)}};if(!query){activity.favorites.forEach(add);activity.recent.forEach(add)}menuActions.forEach(original=>add(original.dataset.toolbarActionId));searchResults.replaceChildren();let matches=0;for(const original of ordered){const id=original.dataset.toolbarActionId,label=actionLabel(original),group=original.dataset.toolbarGroup||'Other',starred=activity.favorites.includes(id),unavailable=menuUnavailable(original),haystack=(label+' '+group+' '+id+' '+(original.title||'')).toLowerCase();if(query&&!terms.every(term=>haystack.includes(term)))continue;if(groupFilter.value&&group!==groupFilter.value)continue;if(availableOnly.checked&&unavailable)continue;if(favoritesOnly.checked&&!starred)continue;matches++;const row=document.createElement('div');row.className='viewer-action-search-row';const run=document.createElement('button');run.dataset.toolbarRun='true';run.innerHTML='<span class="viewer-action-label"></span><span class="viewer-action-group"></span>';run.querySelector('.viewer-action-label').textContent=label;run.querySelector('.viewer-action-group').textContent=group;run.disabled=unavailable;run.title=original.title;run.setAttribute('role','option');run.onfocus=()=>showActionDetails(original);row.onmouseenter=()=>showActionDetails(original);run.onclick=()=>{actionSearchInvoking=true;searchDialog.close();invoke(original)};const favorite=document.createElement('button');favorite.textContent=starred?'★':'☆';favorite.className='viewer-action-favorite';favorite.title=starred?'Remove from favorites':'Add to favorites';favorite.setAttribute('aria-label',favorite.title+' '+label);favorite.onclick=()=>{activity.favorites=starred?activity.favorites.filter(value=>value!==id):[...activity.favorites,id];persistActivity();renderSearch()};row.append(run,favorite);if(starred){const index=activity.favorites.indexOf(id);for(const [symbol,offset,name] of [['↑',-1,'Move favorite earlier'],['↓',1,'Move favorite later']]){const move=document.createElement('button');move.textContent=symbol;move.className='viewer-action-favorite-move';move.disabled=index+offset<0||index+offset>=activity.favorites.length;move.title=name;move.setAttribute('aria-label',name+' '+label);move.onclick=()=>{const next=index+offset,[item]=activity.favorites.splice(index,1);activity.favorites.splice(next,0,item);persistActivity();renderSearch()};row.append(move)}}if(unavailable){const reason=document.createElement('div');reason.className='viewer-action-unavailable';reason.textContent='Unavailable: '+(original.title||'Select a compatible item or finish the pending operation first.');row.append(reason)}searchResults.append(row)}searchSummary.textContent=matches+' '+(matches===1?'action':'actions');if(!matches){const empty=document.createElement('p');empty.textContent='No matching actions.';searchResults.append(empty)}};
    searchInput.oninput=renderSearch;groupFilter.onchange=renderSearch;availableOnly.onchange=renderSearch;favoritesOnly.onchange=renderSearch;searchDialog.addEventListener('keydown',event=>{const runs=[...searchResults.querySelectorAll('[data-toolbar-run]:not(:disabled)')],at=runs.indexOf(event.target);if(event.key==='Enter'&&event.target===searchInput){event.preventDefault();runs[0]?.click();return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||(event.target!==searchInput&&at<0))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?runs.length-1:event.key==='ArrowUp'?Math.max(0,(at<0?0:at)-1):Math.min(runs.length-1,at+1);runs[next]?.focus()});const openActionSearch=(favorites=false)=>{closeDropdowns();actionSearchReturnFocus=document.activeElement;searchInput.value='';groupFilter.value='';favoritesOnly.checked=favorites;for(const menu of dropdowns)refreshMenu(menu);renderSearch();searchDialog.showModal();searchInput.focus()};menuBar.querySelector('[data-toolbar-search]').onclick=()=>openActionSearch(false);document.addEventListener('keydown',event=>{if(event.altKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='a'){event.preventDefault();openActionSearch(false)}});searchDialog.querySelector('[data-toolbar-clear-recent]').onclick=()=>{activity.recent=[];persistActivity();renderSearch()};searchDialog.querySelector('[data-toolbar-search-close]').onclick=()=>searchDialog.close();
    const favoriteBar=document.createElement('span');favoriteBar.className='viewer-action-favorites-bar';favoriteBar.setAttribute('aria-label','Favorite viewer actions');menuBar.after(favoriteBar);renderFavoriteBar=()=>{favoriteBar.replaceChildren();for(const id of activity.favorites.slice(0,5)){const original=actionById.get(id);if(!original)continue;refreshMenu(original.closest('.viewer-dropdown'));const button=document.createElement('button'),unavailable=menuUnavailable(original);button.textContent=original.textContent.trim();button.dataset.toolbarContextAction=id;button.disabled=unavailable;button.title=unavailable?original.title:'Favorite · '+(original.dataset.toolbarGroup||'Action');button.onclick=()=>invoke(original);favoriteBar.append(button)}if(activity.favorites.length>5){const overflow=document.createElement('button');overflow.textContent='+'+(activity.favorites.length-5)+' favorites';overflow.title='Show all favorite actions';overflow.onclick=()=>openActionSearch(true);favoriteBar.append(overflow)}};renderFavoriteBar();
    addEventListener('message',event=>{
      const message=event.data;if(message.surface!==surface||(message.mode&&message.mode!==options.dataset.mode))return;
      if(message.type==='viewerToolbarActivity'){activity={favorites:[...new Set(message.activity?.favorites||[])].filter(id=>actionById.has(id)),recent:[...new Set(message.activity?.recent||[])].filter(id=>actionById.has(id)).slice(0,8),repeatable:actionById.get(message.activity?.repeatable)?.dataset.toolbarRepeatable==='true'?message.activity.repeatable:''};const latest=vscode.getState?.()||{};vscode.setState?.({...latest,viewerActionActivity:{...(latest.viewerActionActivity||{}),[surface]:activity}});activityStatus.textContent=message.saved?'Action preferences saved.':'';renderFavoriteBar()}
      if(message.type==='viewerToolbarActivityError'){activityStatus.textContent='Could not save action preferences: '+message.message;renderFavoriteBar()}
    });
    syncIconStates();
    vscode.postMessage({type:'viewerToolbarReady',surface,mode:options.dataset.mode});vscode.postMessage({type:'viewerToolbarActivityReady',surface});
  }
}
function clientScript() {return '('+client.toString()+')('+combineActionAvailability.toString()+');'+require('./map_registry_client').clientScript();}
function style() {return '.launch-controls .ikemaker-toolbar-context-menu{position:fixed;z-index:2147483647;display:flex;flex-direction:column;min-width:190px;padding:4px;background:var(--vscode-menu-background,var(--vscode-editor-background));color:var(--vscode-menu-foreground,var(--vscode-foreground));border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));box-shadow:0 8px 24px #0008}.launch-controls .ikemaker-toolbar-context-menu button{min-height:26px;padding:5px 9px;text-align:left;border:0;background:transparent;color:inherit;font:inherit}.launch-controls .ikemaker-toolbar-context-menu button:hover,.launch-controls .ikemaker-toolbar-context-menu button:focus{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground));outline:none}.viewer-toolbar-options[data-compact=true]>[data-viewer-layout],.viewer-toolbar-options[data-compact=true]>[data-viewer-layout-reset]{display:none}.launch-controls button,.viewer-toolbar-dialog button,.viewer-dropdown button{font:inherit;color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-button-border,var(--vscode-panel-border));padding:6px 8px;cursor:pointer}.launch-controls button:disabled,.viewer-toolbar-dialog button:disabled,.viewer-dropdown button:disabled{opacity:.45;cursor:default}.launch-controls button:focus-visible,.viewer-toolbar-dialog button:focus-visible,.viewer-dropdown summary:focus-visible,.viewer-dropdown button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.launch-controls button[hidden]{display:none!important}.viewer-dropdown-toolbar{display:inline-flex;align-items:center;gap:1px;flex-wrap:wrap;position:relative}.viewer-action-search-button{margin-left:3px}.viewer-dropdown{position:relative}.viewer-dropdown>summary{list-style:none;padding:5px 7px;cursor:pointer;white-space:nowrap}.viewer-dropdown>summary::-webkit-details-marker{display:none}.viewer-dropdown[open]>summary{background:var(--vscode-list-activeSelectionBackground)}.viewer-dropdown>div{position:absolute;z-index:10020;top:100%;left:0;min-width:220px;max-height:min(70vh,620px);overflow:auto;padding:5px;background:var(--vscode-menu-background,var(--vscode-editor-background));border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));box-shadow:0 8px 24px #0008}.viewer-dropdown>div>button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--vscode-menu-foreground,var(--vscode-foreground));white-space:nowrap}.viewer-dropdown>div>button:hover{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))}.viewer-dropdown hr{border:0;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-panel-border));margin:5px}.viewer-toolbar-options{display:inline-flex;gap:4px;flex-shrink:0;flex-wrap:wrap;max-width:100%}.viewer-toolbar-dialog{position:fixed;z-index:10000;box-sizing:border-box;width:min(780px,92vw);max-height:80vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-focusBorder);padding:18px}.viewer-toolbar-dialog::backdrop{background:#0008}.viewer-toolbar-dialog h2{margin:0 0 10px}.viewer-toolbar-dialog>button,.viewer-action-search [data-toolbar-search-results]>.viewer-action-search-row>button:first-child{display:block;width:100%;margin:6px 0;text-align:left}.viewer-action-search>input{width:100%;margin-bottom:8px}.viewer-action-search-filters{display:flex;flex-wrap:wrap;gap:6px 18px}.viewer-action-filter{display:flex;align-items:center;gap:7px;margin:4px 0}.viewer-action-filter input{width:auto;margin:0}.viewer-action-search-help,.viewer-action-search-summary,.viewer-action-unavailable,.viewer-action-group{color:var(--vscode-descriptionForeground);font-size:12px}.viewer-action-search-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(210px,1fr);gap:12px;align-items:start}.viewer-action-details{position:sticky;top:0;border:1px solid var(--vscode-panel-border);padding:10px;background:var(--vscode-sideBar-background,var(--vscode-editor-background))}.viewer-action-details h3{margin:0 0 8px}.viewer-action-details p{margin:6px 0}.viewer-action-label,.viewer-action-group{display:block}.viewer-action-search-row{display:grid;grid-template-columns:minmax(0,1fr) 38px 34px 34px;gap:5px;align-items:center}.viewer-action-unavailable{grid-column:1/-1;padding:0 8px 5px}.viewer-action-favorite{font-size:18px;padding:3px!important;text-align:center!important}.viewer-action-favorite-move{padding:3px!important;text-align:center!important}.viewer-toolbar-dialog-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}@media(max-width:700px){.viewer-toolbar-options>[data-viewer-layout],.viewer-toolbar-options>[data-viewer-layout-reset]{display:none}.viewer-toolbar-options{flex-wrap:nowrap}.viewer-dropdown-toolbar{flex-wrap:wrap;max-width:100%;overflow:visible}.viewer-dropdown>div{position:fixed;top:auto;left:8px;right:8px;min-width:0}.viewer-action-search-layout{grid-template-columns:1fr}.viewer-action-details{position:static}.viewer-action-search-row{grid-template-columns:minmax(0,1fr) 36px 32px 32px}}';}
function favoriteStyle() { return '.viewer-toolbar-context{min-width:0;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vscode-descriptionForeground);font-size:12px;padding:0 6px}.viewer-toolbar-context:empty{display:none}.viewer-action-favorites-bar{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow-x:auto}.viewer-action-favorites-bar:empty{display:none}.viewer-action-favorites-bar>button{white-space:nowrap}.viewer-dropdown button[data-toolbar-shortcut]::after{content:attr(data-toolbar-shortcut);float:right;margin-left:18px;color:var(--vscode-descriptionForeground);font-size:11px}'; }
function legacyStyle(){return '.legacy-viewer-action-row{display:none!important}.legacy-sff-editing-actions{display:none!important}';}
function layoutIconStyle(){return '.viewer-toolbar-options{display:none!important}.viewer-icon-spacer{box-sizing:border-box;width:9px;height:24px;margin-left:4px;border-left:1px solid var(--vscode-panel-border);flex:0 0 9px}';}
function iconStyle(){return `${headerContext.style()}
body[data-viewer-surface="air"] .viewer-primary-toolbar>:not(.launch-controls):not(style):not([data-viewer-archive]),.viewer-primary-toolbar>:is(button,label,select,input,.badge,.tool,.pane-buttons,.spacer){display:none!important}
:is(header,.header,.toolbar):has(> .launch-controls){box-sizing:border-box!important;display:block!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;position:relative;z-index:10010}
:is(header,.header,.toolbar):has(> .launch-controls)>:not(.launch-controls):not(style):not([data-viewer-archive]){display:none!important}
.launch-controls{box-sizing:border-box!important;display:flex!important;flex:0 0 auto!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:var(--vscode-editor-background)}
.launch-controls>.viewer-dropdown-toolbar{order:0!important}.launch-controls>.ikemaker-universal-toolbar{order:1!important}.launch-controls>.viewer-icon-toolbar{order:2!important}.launch-controls>.viewer-toolbar-context{order:3!important}.launch-controls>.viewer-toolbar-options{order:4!important}
.viewer-dropdown-toolbar{box-sizing:border-box;min-height:27px;padding:1px 3px!important;overflow:visible!important}.viewer-dropdown-toolbar>details>summary{padding:4px 6px!important}
.viewer-icon-toolbar{box-sizing:border-box;display:flex;flex-flow:row wrap;align-items:center;gap:3px;max-width:100%;min-height:31px;overflow:visible;padding:2px 3px}.viewer-icon-row{display:inline-flex;flex:0 0 auto;flex-wrap:nowrap;gap:2px}
.viewer-icon-row button{box-sizing:border-box!important;width:27px!important;min-width:27px!important;max-width:27px!important;height:27px!important;min-height:27px!important;max-height:27px!important;padding:0!important;margin:0!important;display:inline-grid!important;place-items:center;font-weight:700;font-size:14px;line-height:1;background:var(--vscode-input-background)!important;color:var(--vscode-input-foreground,var(--vscode-foreground))!important;border:1px solid var(--vscode-input-border,var(--vscode-panel-border))!important;border-radius:0}.viewer-icon-row button span{pointer-events:none}.viewer-icon-row button:disabled{opacity:.42}
.viewer-action-favorites-bar{flex-wrap:wrap!important;overflow:visible!important}.viewer-dropdown>div{z-index:10050!important}
body[data-viewer-colors="on"]{--viewer-surface-accent:#607d8b}body[data-viewer-colors="on"][data-viewer-surface="sff"]{--viewer-surface-accent:#8b63d9}body[data-viewer-colors="on"][data-viewer-surface="air"]{--viewer-surface-accent:#3f8edb}body[data-viewer-colors="on"][data-viewer-surface="snd"]{--viewer-surface-accent:#d99136}body[data-viewer-colors="on"]{background:color-mix(in srgb,var(--vscode-editor-background) 92%,var(--viewer-surface-accent) 8%)!important}body[data-viewer-colors="on"] :is(header,.header,.workspace,.rail,.left,.right,.center,.preview){background-color:color-mix(in srgb,var(--vscode-editor-background) 95%,var(--viewer-surface-accent) 5%)}
body[data-viewer-colors="on"] button[data-button-tone],.launch-controls:has(.viewer-toolbar-options[data-viewer-colors="on"]) button[data-button-tone]{background:hsla(var(--viewer-button-hue),58%,45%,.22)!important;border-color:hsla(var(--viewer-button-hue),72%,66%,.72)!important;color:var(--vscode-foreground)!important}body[data-viewer-colors="on"] button[data-button-tone]:hover:not(:disabled),.launch-controls:has(.viewer-toolbar-options[data-viewer-colors="on"]) button[data-button-tone]:hover:not(:disabled){background:hsla(var(--viewer-button-hue),64%,50%,.38)!important;border-color:hsla(var(--viewer-button-hue),82%,72%,.95)!important}body[data-viewer-colors="on"] button[data-button-tone="danger"],.launch-controls:has(.viewer-toolbar-options[data-viewer-colors="on"]) button[data-button-tone="danger"]{background:hsla(var(--viewer-button-hue),64%,45%,.28)!important}
.wave{display:block!important;visibility:visible!important}@media(max-width:700px){.viewer-icon-row button{width:27px!important;min-width:27px!important;max-width:27px!important;height:27px!important;min-height:27px!important;max-height:27px!important}}
`;}
module.exports = {ACTIONS,MENU_COMMANDS,CONTEXT_FREE_COMMANDS,SEED_COMMANDS,SELECTION_REQUIRED_COMMAND,WRITABLE_TEXT_COMMAND,resolveActionAvailability,surfaceIsActive,combineActionAvailability,menuDefinitions,menuHtml,iconDefinitions,iconToolbarHtml,legacyUniversalModel,normalize,configure,read,handle,handleCommand,controlsHtml,clientScript,style:()=>universalToolbarStyle()+favoriteStyle()+legacyStyle()+layoutIconStyle()+iconStyle()+style()+'.viewer-menu-section{padding:6px 8px 3px;color:var(--vscode-descriptionForeground);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;user-select:none}.viewer-dropdown button[aria-disabled="true"]{opacity:.45;cursor:help}.viewer-dropdown button[aria-disabled="true"]:hover{background:var(--vscode-list-hoverBackground)}'};
