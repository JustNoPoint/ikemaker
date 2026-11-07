'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const engineLocator = require('./engine_locator');
const runtimeSession = require('./ikemen_runtime_session');
const { chooseLaunchStage } = require('./launch_stage');
const PACKAGE_VERSION = require('../package.json').version;
let engineCapabilities = () => ({ enabledCapabilities: [], capabilities: {} });

const TEAM_MODES = [
  { label: 'Single', value: 0, count: 1 },
  { label: 'Simul', value: 1, count: 2 },
  { label: 'Turns', value: 2, count: 2 },
  { label: 'Tag', value: 3, count: 2 }
];
function hostCapabilities() { return detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env }); }

class HubItem extends vscode.TreeItem {
  constructor(label, children = null, command = null, description = '') {
    super(label, children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.children = children;
    this.description = description;
    if (command) this.command = { command, title: label };
    this.contextValue = children ? 'ikemenCategory' : 'ikemenAction';
  }
}

class IkemenHubProvider {
  getTreeItem(item) { return item; }
  getChildren(item) {
    if (item) return item.children || [];
    return buildHubItems();
  }
}

// Commands have a primary home, while common entry points are intentionally
// repeated where a player or creator would reasonably look for them.
function buildHubItems(){
  const mode=require('./interface_mode').current(), setup=require('./workspace_setup').current();
  const allowed=command=>require('./interface_capabilities').allows(command,mode,setup),catalog=require('./viewer_action_registry').publicCommandCatalog();
  const quickStartActions=[
    ['Open Character…','ikemen.character.open','start here'],
    ['Open Move Lab…','ikemen.moveLab.open','moves, throws, animation, assets, code, diagnostics, and tests'],
    ['Create New Character…','ikemen.character.createNew','complete playable character scaffold'],
    ['Create New Stage…','ikemen.stage.createNew','stage files and visual workspace'],
    ['Create New Screenpack / Fight UI…','ikemen.ui.createNew','screenpack files and visual workspace'],
    ['Create New Storyboard…','ikemen.storyboard.create','opening, ending, credits, logo, loading, and story scenes'],
    ['Create Code, Stage, or UI…','ikemen.file.createNew','code/data files and complete Stage or UI workspaces'],
    ['Close Current Character…','ikemen.character.close','close all of its tabs'],
    ['Close Current Authoring Context…','ikemen.context.closeCurrent','character, stage, or screenpack'],
    ['Open Related Work…','ikemen.relatedWork.open','connected files and tools'],
    ['Open Production Workflow…','ikemen.productionWorkflow.open','guided character work'],
    ['Open Project & Team Manager…','ikemen.projectManager.open','games, work projects, teams, members, and job classes'],
    ['Create New Game Profile…','ikemen.projectProfile.create','game identity, classification, and ownership'],
    ['Open Roster Manager…','ikemen.selectDef.openWorkspace','add characters and stages'],
    ['Launch IKEMEN  (Ctrl+Alt+F5)','ikemen.launchGame',''],
    ['Infinite Quick VS Mirror  (Ctrl+Alt+F6)','ikemen.launchMirrorCurrent',''],
    ['Training Mirror  (Ctrl+Alt+F7)','ikemen.launchTrainingCurrent','']
  ];
  const quickStart=new HubItem('Quick Start',quickStartActions.map(([label,command,description])=>{const enabled=allowed(command),item=new HubItem(label,null,enabled?command:null,enabled?description:'Unavailable in the current interface mode.');item.contextValue=enabled?'ikemenAction':'ikemenActionUnavailable';return item;}));
  const viewEscapeOrder=['ikemen.textToolbar.restoreNativeLayout','ikemen.textToolbar.disableNativeLayout'];
  const catalogGroups=catalog.menuOrder.map(group=>{const actions=catalog.actions.filter(action=>action.group===group);if(group==='View')actions.sort((left,right)=>{const a=viewEscapeOrder.indexOf(left.command),b=viewEscapeOrder.indexOf(right.command);return(a<0?viewEscapeOrder.length:a)-(b<0?viewEscapeOrder.length:b);});return new HubItem(group,actions.map(action=>{const enabled=allowed(action.command),item=new HubItem(action.label,null,enabled?action.command:null,enabled?[action.tooltip,action.shortcut].filter(Boolean).join(' · '):'Unavailable in the current interface mode.');item.actionId=action.actionId;item.contextValue=enabled?'ikemenAction':'ikemenActionUnavailable';return item;}));});
  return [quickStart,...catalogGroups];
}
function buildAllHubItems() {
  return [
      new HubItem('Quick Start', [
        new HubItem('Open Character…', null, 'ikemen.character.open', 'start here'),
        new HubItem('Open Move Lab…', null, 'ikemen.moveLab.open', 'moves, throws, animation, assets, code, diagnostics, and tests'),
        new HubItem('Create New Character…', null, 'ikemen.character.createNew', 'complete playable character scaffold'),
        new HubItem('Create New Stage…', null, 'ikemen.stage.createNew', 'stage files and visual workspace'),
        new HubItem('Create New Screenpack / Fight UI…', null, 'ikemen.ui.createNew', 'screenpack files and visual workspace'),
        new HubItem('Create New Storyboard…', null, 'ikemen.storyboard.create', 'opening, ending, credits, logo, loading, and story scenes'),
        new HubItem('Create Code, Stage, or UI…', null, 'ikemen.file.createNew', 'code/data files and complete Stage or UI workspaces'),
        new HubItem('Close Current Character…', null, 'ikemen.character.close', 'close all of its tabs'),
        new HubItem('Close Current Authoring Context…', null, 'ikemen.context.closeCurrent', 'character, stage, or screenpack'),
        new HubItem('Open Related Work…', null, 'ikemen.relatedWork.open', 'connected files and tools'),
        new HubItem('Open Production Workflow…', null, 'ikemen.productionWorkflow.open', 'guided character work'),
        new HubItem('Open Project & Team Manager…', null, 'ikemen.projectManager.open', 'games, work projects, teams, members, and job classes'),
        new HubItem('Create New Game Profile…', null, 'ikemen.projectProfile.create', 'game identity, classification, and ownership'),
        new HubItem('Open Roster Manager…', null, 'ikemen.selectDef.openWorkspace', 'add characters and stages'),
        new HubItem('Launch IKEMEN  (Ctrl+Alt+F5)', null, 'ikemen.launchGame'),
        new HubItem('Infinite Quick VS Mirror  (Ctrl+Alt+F6)', null, 'ikemen.launchMirrorCurrent'),
        new HubItem('Training Mirror  (Ctrl+Alt+F7)', null, 'ikemen.launchTrainingCurrent')
      ]),
      new HubItem('Create New', [
        new HubItem('Create Character…', null, 'ikemen.character.createNew', 'DEF, AIR, SFF, SND, and starter code'),
        new HubItem('Create Stage…', null, 'ikemen.stage.createNew', 'DEF, SFF, and visual workspace'),
        new HubItem('Stage from PNG layers…', null, 'ikemen.stage.createFromPngLayers', 'ordered art, preview, fighter depth, DEF and SFF'),
        new HubItem('Create Screenpack / Fight UI…', null, 'ikemen.ui.createNew', 'system, fight, sprites, and workspace'),
        new HubItem('Create Storyboard…', null, 'ikemen.storyboard.create', 'openings, endings, credits, logo, loading, or story scenes'),
        new HubItem('Create Game Profile…', null, 'ikemen.projectProfile.create', 'game identity, standards, and ownership'),
        new HubItem('Open Project & Team Manager…', null, 'ikemen.projectManager.open', 'create or reassign work projects and teams'),
        new HubItem('Create SFF 2.1…', null, 'sff.createNew'),
        new HubItem('Create AIR…', null, 'air.createNew'),
        new HubItem('Create SND…', null, 'snd.createNew'),
        new HubItem('Create ZSS File…', null, 'zss.createNew'),
        new HubItem('Create CNS File…', null, 'cns.createNew'),
        new HubItem('Create INP Input File…', null, 'inp.createNew'),
        new HubItem('Create Legacy CMD File…', null, 'cmd.createNew'),
        new HubItem('Create DEF File…', null, 'ikemen.def.createNew'),
        new HubItem('Create Lua File…', null, 'ikemen.lua.createNew'),
        new HubItem('Create Text Data File…', null, 'ikemen.text.createNew'),
        new HubItem('Create or Import a Palette…', null, 'ikemen.paletteImport.open', 'indexed sprites, ACT, Photoshop, and Aseprite output'),
        new HubItem('Organize Palette Indexes…', null, 'ikemen.paletteOrganizer.open', 'semantic CS table, opacity audit, and exact indexed PNG output'),
        new HubItem('Create Artist Intake / Temporary SFF…', null, 'ikemen.artistIntake.open', 'GIF, sprite sheet, or loose frames')
      ]),
      new HubItem('Player Setup', [
        new HubItem('Roster, Stages, and Arcade Order…', null, 'ikemen.selectDef.openWorkspace'),
        new HubItem('Palette Workspace…', null, 'ikemen.palette.openWorkspace', 'character, stage, screenpack, fight UI, standalone, and exact-SFF palettes'),
        new HubItem('Menu and Mode Options…', null, 'ikemen.menuModes.openPlayer'),
        new HubItem('Story and Dialogue…', null, 'ikemen.storyDialogue.openPlayer'),
        new HubItem('Character Select Preview…', null, 'ikemen.selectDef.openLayoutBuilder')
      ]),
      new HubItem('Character Authoring', [
        new HubItem('Open Recipe Library…', null, 'ikemen.authoring.openRecipes', 'universal move recipes and reusable sections'),
        new HubItem('Open Project Symbols & Contracts…', null, 'ikemen.authoring.openSymbols', 'maps, functions, constants, commands, and project contracts'),
        new HubItem('Open Example Templates…', null, 'ikemen.authoring.openExamples', 'SF6, DS, DS4, and HDBZ learning references'),
        new HubItem('Manage Authoring Favorites…', null, 'ikemen.authoring.openFavorites', 'quick access in the State Controllers sidebar'),
        new HubItem('Open Move Lab…', null, 'ikemen.moveLab.open', 'one visual shell for moves, throws, assets, code, diagnostics, and tests'),
        new HubItem('Open Explod Composer…', null, 'ikemen.explodComposer.open', 'place effects on fighters, the stage, or the screen'),
        new HubItem('Open Position & Camera…', null, 'ikemen.positionCamera.open', 'position fighters, targets, helpers, bounds, and camera-sensitive movement'),
        new HubItem('Open Orbit / Trajectory Assist…', null, 'ikemen.trajectory.openAssist', 'preview and generate reviewed circular, elliptical, arc, and spiral movement'),
        new HubItem('Open Shader Workshop…', null, 'ikemen.shader.openWorkshop', 'build and preview safeguarded offline sprite and animation effects'),
        new HubItem('Open Helper Lab…', null, 'ikemen.helperLab.open', 'create helpers, inspect nested helper trees, and map data flow'),
        new HubItem('Open Character…', null, 'ikemen.character.open'),
        new HubItem('Close Current Character…', null, 'ikemen.character.close'),
        new HubItem('Open Related Character Work…', null, 'ikemen.relatedWork.open'),
        new HubItem('Create New Character…', null, 'ikemen.character.createNew', 'choose MUGEN/CNS or IKEMEN/ZSS'),
        new HubItem('Create Code, Stage, or UI…', null, 'ikemen.file.createNew', 'code/data files and complete Stage or UI workspaces'),
        new HubItem('Create New SFF 2.1…', null, 'sff.createNew'),
        new HubItem('Create New AIR…', null, 'air.createNew'),
        new HubItem('Create New SND…', null, 'snd.createNew'),
        new HubItem('Create Workbench from Existing Character…', null, 'ikemen.workbench.create'),
        new HubItem('Open Character Connection Tree…', null, 'ikemen.characterDependencies.open'),
        new HubItem('Open Visual Character DEF Editor…', null, 'ikemen.def.openVisualWorkspace'),
        new HubItem('Move Lab — Constants Integration…', null, 'ikemen.moveConstants.open', 'legacy direct route retained for compatible workflows'),
        new HubItem('Open Universal HitDef Editor…', null, 'ikemen.hitDef.openEditor', 'edit the current HitDef or create a new controller'),
        new HubItem('Open Throw Creator…', null, 'ikemen.throwCreator.open'),
        new HubItem('Open Throw Creator Guide', null, 'ikemen.throwCreator.openGuide'),
        new HubItem('Open Command and Movelist Editor…', null, 'ikemen.commandMovelist.openEditor'),
        new HubItem('Open Production Workflow…', null, 'ikemen.productionWorkflow.open'),
        new HubItem('Open Current Character Palette Folder', null, 'ikemen.openPaletteFolder')
      ]),
      new HubItem('SFF and Sprites', [
        new HubItem('Create New SFF 2.1…', null, 'sff.createNew'),
        new HubItem('Open SFF Sprite Browser…', null, 'sff.openViewer'),
        new HubItem('Open SFF Browser…', null, 'sff.toggleBrowser', 'read-only Groups, Sprites, and Details browser'),
        new HubItem('Open Artist Intake / Temporary SFF…', null, 'ikemen.artistIntake.open', 'organize unnamed GIFs, sheets, and frame folders'),
        new HubItem('Assemble or Replace Between Two SFFs…', null, 'sff.openAssembly', 'drag groups or selected sprites into a reviewed rebuild'),
        new HubItem('Open Sprite & Palette Import Assistant…', null, 'ikemen.paletteImport.open'),
        new HubItem('Open Palette Index Organizer…', null, 'ikemen.paletteOrganizer.open', 'build a reusable semantic index contract from PNG artwork or an SFF palette'),
        new HubItem('Create Missing Axis Copies…', null, 'sff.createMissingAxisCopies'),
        new HubItem('Add Required Sprite or Animation…', null, 'sff.addCharacterRequirement'),
        new HubItem('Generate SprMaker2 Build Files', null, 'sff.generateBuildFiles'),
        new HubItem('Open SprMaker2 Build Text', null, 'sff.openSprMakerText'),
        new HubItem('Open or Refresh SFF Group Log', null, 'sff.openGroupLog'),
        new HubItem('Refresh SFF Group Log…', null, 'sff.refreshGroupLog', 'review generated entries; retain notes'),
        new HubItem('Open Project SFF Build and Animation Rules', null, 'sff.openProjectBuildProfile'),
        new HubItem('Create Custom SFF Build and Animation Rules…', null, 'sff.createProjectBuildProfile'),
        new HubItem('Apply Project Get-Hit Indexing…', null, 'sff.applyProjectIndexing'),
        new HubItem('Build Approved Manifest', null, 'sff.buildApprovedManifest'),
        new HubItem('Crop Current SFF…', null, 'sff.cropArchive'),
        new HubItem('Import Folder as Layer', null, 'sff.importLayerFolder'),
        new HubItem('Review Interaction Part Ordering', null, 'sff.reviewLayerParts'),
        new HubItem('Review Redundant Layers', null, 'sff.reviewRedundantLayers')
      ]),
      new HubItem('AIR and Collision', [
        new HubItem('Create New AIR…', null, 'air.createNew'),
        new HubItem('Open AIR Animation Viewer…', null, 'air.openAnimationPreview'),
        new HubItem('Open AIR Browser…', null, 'air.toggleBrowser', 'portable action navigation and management; docks, floats, and restores with the AIR workspace'),
        new HubItem('Open or Refresh AIR Action Log', null, 'air.openActionLog'),
        new HubItem('Refresh AIR Action Log…', null, 'air.refreshActionLog', 'review generated entries; retain notes'),
        new HubItem('Batch Apply Clsn2', null, 'air.batchApplyClsn2'),
        new HubItem('Generate Guard-Proximity Helper', null, 'air.generateGuardProximityHelper'),
        new HubItem('Assign Hit-Reaction Region', null, 'air.assignClsn2HitReactionRegion')
      ]),
      new HubItem('SND and Sounds', [
        new HubItem('Create New SND…', null, 'snd.createNew'),
        new HubItem('Open SND Archive Workspace…', null, 'snd.openViewer'),
        new HubItem('Open SndMaker Build Text', null, 'snd.openMakerText'),
        new HubItem('Choose Audio Editor…', null, 'snd.chooseAudioEditor')
      ]),
      new HubItem('Stages and Screenpacks', [
		new HubItem('Open Visual select.def Editor…', null, 'ikemen.selectDef.openWorkspace'),
		new HubItem('Open Complete Menu & Modes Editor…', null, 'ikemen.menuModes.openCreator'),
		new HubItem('Open Advanced Story & Dialogue Builder…', null, 'ikemen.storyDialogue.openCreator'),
		new HubItem('Create New Storyboard…', null, 'ikemen.storyboard.create', 'opening, ending, credits, logo, loading, game-over, or story scene'),
		new HubItem('Open Storyboard Visual Editor…', null, 'ikemen.storyboard.open'),
		new HubItem('Create Character Opening…', null, 'ikemen.storyboard.createOpening'),
		new HubItem('Create Character Ending…', null, 'ikemen.storyboard.createEnding'),
		new HubItem('Open Character Select Layout Builder…', null, 'ikemen.selectDef.openLayoutBuilder'),
        new HubItem('Create New Stage Workspace…', null, 'ikemen.stage.createNew'),
        new HubItem('Open Stage Visual Workspace…', null, 'ikemen.stage.openWorkspace'),
        new HubItem('Close Stage Workspace…', null, 'ikemen.stage.close'),
        new HubItem('Create Stage Interaction Helper…', null, 'ikemen.stage.createInteraction'),
        new HubItem('Launch Current Stage with Stage Rig…', null, 'ikemen.stage.launchRig'),
        new HubItem('Create New Screenpack / Fight UI Workspace…', null, 'ikemen.ui.createNew'),
        new HubItem('Open Screenpack / Fight UI Workspace…', null, 'ikemen.ui.openWorkspace'),
        new HubItem('Open or Create Screenpack Lua Module…', null, 'ikemen.ui.openLuaModule'),
        new HubItem('Generate Character UI Bridge…', null, 'ikemen.ui.generateCharacterBridge')
      ]),
      new HubItem('ZSS, CNS, and Lua', [
        new HubItem('Open Move Lab…', null, 'ikemen.moveLab.open', 'compose code, controllers, animation, resources, diagnostics, and testing'),
        new HubItem('Browse Maps…', null, 'ikemen.maps.openBrowser', 'browse project maps and insert only when a supported ZSS/CNS destination is captured'),
        new HubItem('Create New ZSS File…', null, 'zss.createNew'),
        new HubItem('Create New CNS File…', null, 'cns.createNew'),
        new HubItem('Create New INP Input File…', null, 'inp.createNew'),
        new HubItem('Create Legacy CMD File…', null, 'cmd.createNew'),
        new HubItem('Create New DEF File…', null, 'ikemen.def.createNew'),
        new HubItem('Create New Lua File…', null, 'ikemen.lua.createNew'),
        new HubItem('Create New Text Data File…', null, 'ikemen.text.createNew'),
        new HubItem('Convert CNS State Code to ZSS…', null, 'ikemen.cnsConverter.open'),
        new HubItem('Convert a Character’s CNS State Files…', null, 'ikemen.cnsConverter.character'),
        new HubItem('Browse and Insert State Controllers…', null, 'zss.openControllers'),
        new HubItem('Insert State Controller with Options…', null, 'zssControllers.insert'),
        new HubItem('Browse ZSS Structure & Logic…', null, 'zssStructures.browse', 'conditions, selection, loops, functions, assignments, states, and safety patterns'),
        new HubItem('Open ZSS Learning Criteria', null, 'ikemen.zssLearning.open', 'recognition-first daily topics with optional exercises'),
        new HubItem('Open Universal HitDef Editor…', null, 'ikemen.hitDef.openEditor', 'common attack options first; specialist fields stay collapsed'),
        new HubItem('Open Helper Lab…', null, 'ikemen.helperLab.open', 'creation, nested ownership, exact-instance routing, maps, and cleanup'),
        new HubItem('Open Visual Code Structure…', null, 'ikemen.codeStructure.openWorkspace'),
        new HubItem('Open Project Data and ID Registry', null, 'zss.openProjectData'),
        new HubItem('Open State Controller Documentation…', null, 'zssControllers.openDocs'),
        new HubItem('Open Referenced Definition', null, 'ikemen.navigation.openDefinition'),
        new HubItem('Go to Line…', null, 'zss.goToLine'),
        new HubItem('Comment / Uncomment Selection', null, 'zss.toggleLineComment'),
        new HubItem('Open PalFX Editor…', null, 'zss.openPalFxEditor'),
        new HubItem('Wrap with ignoreHitPause', null, 'zss.wrap.ignoreHitPause'),
        new HubItem('Wrap with persistent…', null, 'zss.wrap.persistent'),
        new HubItem('Wrap with ignoreHitPause + persistent…', null, 'zss.wrap.ignoreHitPausePersistent'),
        new HubItem('Scale Selected Sizebox', null, 'cns.scaleSelectedSizebox')
      ]),
      new HubItem('Debug and Testing', [
        new HubItem('Open Test and Diagnostic Suite…', null, 'ikemen.testSessions.open', 'guided test sessions'),
        new HubItem('Audit Character Health and Cleanup…', null, 'ikemen.characterHealth.open'),
        new HubItem('Audit Current Code File', null, 'zss.audit.currentFile'),
        new HubItem('Audit All Workspace Code', null, 'zss.audit.workspace'),
        new HubItem('Audit DEF Ownership Dependencies…', null, 'ikemen.ownership.auditDef'),
        new HubItem('Preview Cross-File Change Impact…', null, 'ikemen.impact.preview'),
        new HubItem('Audit Required Sprites and Animations…', null, 'sff.auditCharacterRequirements'),
        new HubItem('Review Unassigned Sprites…', null, 'sff.reviewUnassignedSprites'),
        new HubItem('Review Dismissed Layer Warnings…', null, 'sff.reviewDismissedLayerWarnings'),
        new HubItem('Launch Current Stage with Stage Rig…', null, 'ikemen.stage.launchRig'),
        new HubItem('Open Recovery Center', null, 'ikemen.mutations.openHistory')
      ]),
      new HubItem('Universal Standards', [
        new HubItem('Open Animation Standards Registry', null, 'ikemen.animationStandards.open'),
        new HubItem('Install Authoring Bridge into Character…', null, 'ikemen.authoringBridge.install'),
        new HubItem('Open Authoring Bridge Guide', null, 'ikemen.authoringBridge.openGuide'),
        new HubItem('Offline Documentation Library', null, 'ikemen.docs.openOffline'),
        new HubItem('Update Offline Documentation Library…', null, 'ikemen.docs.updateOffline'),
        new HubItem('Open Production Workflow Guide', null, 'ikemen.productionWorkflow.openGuide'),
        new HubItem('Coder Build and Numbering Standard', null, 'sff.showNamingStandard'),
        new HubItem('Artist Handoff Guide', null, 'sff.showArtistHandoffGuide'),
        new HubItem('Stage and Screenpack Workspace Specification', null, 'ikemen.openStageScreenpackSpec')
      ]),
      new HubItem('Game and Project Profiles', [
        new HubItem('Open Project & Team Manager…', null, 'ikemen.projectManager.open', 'games, work projects, teams, members, and job classes'),
        new HubItem('Create New Game Profile…', null, 'ikemen.projectProfile.create', 'complete game identity and ownership'),
        new HubItem('Show Current Project Context', null, 'ikemen.context.show'),
        new HubItem('Open Complete Game / Project Registry', null, 'ikemen.context.openRegistry'),
        new HubItem('Open Project Data and ID Registry', null, 'zss.openProjectData', 'maps, functions, states, helpers, and assigned IDs'),
        new HubItem('Validate or Migrate Project Registry…', null, 'ikemen.context.migrateRegistry'),
        new HubItem('Index Existing Project Metadata…', null, 'ikemen.context.indexMetadata'),
        new HubItem('Create or Edit Production Workflow Subprofile…', null, 'ikemen.productionWorkflow.editProfile', 'tasks, tickets, phases, and signoff'),
        new HubItem('Open Character Requirements Rules', null, 'sff.openRequirementsProfile'),
        new HubItem('Open Project Naming and Alias Rules', null, 'sff.openAliasRegistry'),
        new HubItem('Open Project SFF Build and Animation Rules', null, 'sff.openProjectBuildProfile'),
        new HubItem('Create Custom SFF Build and Animation Rules…', null, 'sff.createProjectBuildProfile'),
        new HubItem('Create Optional Screenpack Preview Profile…', null, 'ikemen.ui.createPreviewProfile')
      ]),
      new HubItem('Personal Workspace and Preferences', [
        new HubItem('Configure Expanded / Compact Explanations…', null, 'ikemen.experience.configure'),
        new HubItem('Open Docking Panel Prototype…', null, 'ikemen.dockingPrototype.open', 'four movable native Views in the bottom Panel'),
        new HubItem('Open Docking Floating-Window Probe…', null, 'ikemen.dockingPrototype.openEditor', 'optional editor tab for split groups and VS Code floating windows'),
        new HubItem('Save Workspace Layout Preset…', null, 'ikemen.workspacePreset.save'),
        new HubItem('Restore Workspace Layout Preset…', null, 'ikemen.workspacePreset.restore'),
        new HubItem('Delete Workspace Layout Preset…', null, 'ikemen.workspacePreset.delete'),
        new HubItem('Configure Training Match…', null, 'ikemen.launchTrainingConfigured'),
        new HubItem('Set Default Training Character…', null, 'ikemen.setDefaultTrainingCharacter'),
        new HubItem('Set Default Training Stage…', null, 'ikemen.setDefaultTrainingStage'),
        new HubItem('Open Launcher Settings', null, 'ikemen.openLauncherSettings'),
        new HubItem('Choose Audio Editor…', null, 'snd.chooseAudioEditor'),
        new HubItem('Choose Image Editor…', null, 'sff.chooseImageEditor'),
        new HubItem('Open IKEMEN Controls', null, 'ikemen.openControls'),
        new HubItem('Choose Opening Sidebar…', null, 'ikemen.chooseOpeningSidebar', 'IKEMaker or the normal VS Code default'),
        new HubItem('Set .SFF / .AIR / .SND / Code File Opening…', null, 'ikemen.windowsFileAssociations.configure', 'Windows defaults for ZSS, SFF, AIR, DEF, SND, CMD, and related files'),
        new HubItem('Check Recommended Lua Authoring Support', null, 'ikemen.luaSupport.status'),
        new HubItem('Install / Refresh IKEMEN LuaLS Definitions', null, 'ikemen.luaSupport.installDefinitions'),
        new HubItem('Check for IKEMaker Updates…', null, 'ikemen.extensionUpdates.check'),
        new HubItem('Configure IKEMaker Update Channel…', null, 'ikemen.extensionUpdates.settings'),
        new HubItem('Open Extension Settings', null, 'ikemen.openExtensionSettings')
      ]),
      new HubItem('Release and Public Copy', [
        new HubItem('Capture Public Release Defaults…', null, 'ikemen.release.captureDefaults'),
        new HubItem('Open Public Release Profile', null, 'ikemen.release.openProfile'),
        new HubItem('Audit Public Release', null, 'ikemen.release.audit'),
        new HubItem('Complete Project into Public Copy…', null, 'ikemen.release.complete')
      ]),
      new HubItem('Help and Compatibility', [
        new HubItem('Open Help & Learning Center…', null, 'ikemen.help.open', 'offline guides, visual screen map, and MUGEN migration'),
        new HubItem('Platform Capabilities', null, 'ikemen.showPlatformCapabilities'),
        new HubItem('Show Bundled Build Toolchain', null, 'ikemen.showBundledToolchain'),
        new HubItem('Check IKEMEN and Documentation Updates', null, 'zss.updates.checkNow'),
        new HubItem('Check Changes for Current DEF', null, 'zss.updates.checkDefNow'),
        new HubItem('Show Last Update Report', null, 'zss.updates.showLastReport'),
        new HubItem('Offline Documentation Library', null, 'ikemen.docs.openOffline'),
        new HubItem('Android / iPhone Feature Print Sheet', null, 'ikemen.openMobileFeatureMatrix')
      ])
    ];
}

function activePath() {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document?.uri?.scheme === 'file') return editor.document.uri.fsPath;
  const input = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input;
  for (const uri of [input?.uri, input?.modified, input?.original]) if (uri?.scheme === 'file') return uri.fsPath;
  return null;
}

function openFilePaths() {
  const paths = [], add = (uri) => { if (uri?.scheme === 'file' && !paths.includes(uri.fsPath)) paths.push(uri.fsPath); };
  add(vscode.window.activeTextEditor?.document?.uri);
  const activeInput = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input;
  add(activeInput?.uri); add(activeInput?.modified); add(activeInput?.original);
  for (const editor of vscode.window.visibleTextEditors || []) add(editor.document?.uri);
  for (const group of vscode.window.tabGroups?.all || []) for (const tab of group.tabs || []) { add(tab.input?.uri); add(tab.input?.modified); add(tab.input?.original); }
  return paths;
}

function findGameRoot(start) {
  let current = path.resolve(start || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath) || process.cwd());
  if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function listFiles(root, folder, extension) {
  const base = path.join(root, folder);
  if (!fs.existsSync(base)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) found.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  };
  visit(base);
  return found.sort((a, b) => a.localeCompare(b));
}

function currentCharacter(root) {
  const charsRoot = path.join(root, 'chars');
  for (const current of openFilePaths()) {
    const relative = path.relative(charsRoot, current);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    const folder = relative.split(path.sep)[0];
    const defs = listFiles(root, path.join('chars', folder), '.def');
    const preferred = `chars/${folder}/${folder}.def`.toLowerCase();
    const found = defs.find((value) => value.toLowerCase() === preferred) || defs.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
    if (found) return found;
  }
  return null;
}

function currentGameRoot() {
  for (const candidate of [...openFilePaths(), ...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath)]) {
    const root = findGameRoot(candidate); if (root) return root;
  }
  return findGameRoot(process.cwd());
}

function config() { return vscode.workspace.getConfiguration('ikemenZss'); }

function enginePath(root) {
  const configured = config().get('ikemenPath', '');
  return require('./engine_runtime').resolve(root, configured);
}

function quoteSummary(args) {
  return args.map((value) => /\s/.test(value) ? `"${value}"` : value).join(' ');
}

async function launch(root, players1, players2, stage, mode1, mode2) {
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
  // Quick VS keeps the configured round timer unless it is explicitly
  // overridden. Training must always begin with unlimited time; otherwise the
  // custom training-mode hook can enter a match whose timer has already ended.
  const args = require('./training_launch_args').buildTrainingArgs('-time', '-1', '-tmode1', String(mode1.value), '-tmode2', String(mode2.value), '-s', stage);
  players1.forEach((character, index) => args.push(`-p${1 + index * 2}`, character));
  players2.forEach((character, index) => args.push(`-p${2 + index * 2}`, character));
  await runtimeSession.launch({ executable, args, cwd: root, mode: 'training' });
  vscode.window.showInformationMessage(`IKEMEN training launched: ${quoteSummary(args)}`);
}

async function launchVersus(root, players1, players2, stage, mode1, mode2) {
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
  const args = ['-loadmotif', '-time', '-1', '-rounds', '-1', '-tmode1', String(mode1.value), '-tmode2', String(mode2.value), '-s', stage];
  players1.forEach((character, index) => args.push(`-p${1 + index * 2}`, character));
  players2.forEach((character, index) => args.push(`-p${2 + index * 2}`, character));
  await runtimeSession.launch({ executable, args, cwd: root, mode: 'quick-versus' });
  vscode.window.showInformationMessage(`IKEMEN Infinite Quick VS launched: ${quoteSummary(args)}`);
}

async function launchScenarioOwner(request,services={}) {
  const ownerDef=typeof request?.ownerDef==='string'&&path.isAbsolute(request.ownerDef)?path.resolve(request.ownerDef):'',mode=String(request?.mode||'');
  const exists=services.existsSync||fs.existsSync;if(!ownerDef||path.extname(ownerDef).toLowerCase()!=='.def'||!exists(ownerDef)||!['training','versus','game'].includes(mode))return{status:'unavailable',reason:'The saved scenario has no valid exact character owner or launch mode.'};
  const capabilities=(services.hostCapabilities||hostCapabilities)();if(!capabilities.ikemenLaunch)return{status:'unavailable',reason:missingCapabilityMessage('IKEMEN scenario launch',capabilities)};
  const root=(services.findGameRoot||findGameRoot)(ownerDef);if(!root)return{status:'unavailable',reason:'The exact scenario owner is not inside a resolvable IKEMEN game root.'};
  const character=path.relative(root,ownerDef).replace(/\\/g,'/');if(character.startsWith('../')||!/^chars\//i.test(character))return{status:'unavailable',reason:'The exact scenario owner is not a character DEF inside this game root.'};
  try{
    if(mode==='game'){
      const executable=(services.enginePath||enginePath)(root);if(!exists(executable))return{status:'unavailable',reason:`IKEMEN executable was not found: ${executable}`};
      await(services.runtimeLaunch||runtimeSession.launch)({executable,args:[],cwd:root,mode:'normal'});return{status:'manual-setup',reason:`Normal game opened. Select ${character} manually; normal game launch cannot preselect the saved exact owner.`,mode,root,ownerDef,character,exactOwnerSelected:false};
    }
    const preferred=(services.defaultStage||config().get('defaultTrainingStage','stages/stage0.def')),stage=await(services.chooseStage||chooseLaunchStage)(root,preferred,services.pick||((items,options)=>vscode.window.showQuickPick(items,options)));if(!stage)return{status:'cancelled',reason:'No stage was selected; the scenario launch was cancelled.',mode,root,ownerDef,character};
    if(mode==='training')await(services.launchTraining||launch)(root,[character],[character],stage,TEAM_MODES[0],TEAM_MODES[0]);else await(services.launchVersus||launchVersus)(root,[character],[character],stage,TEAM_MODES[0],TEAM_MODES[0]);
    return{status:'launched',mode,root,ownerDef,character,stage};
  }catch(error){return{status:'failed',reason:error.message||String(error),mode,root,ownerDef,character};}
}

async function launchPreset(root, preset) {
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
  const launchModel = require('./quick_launch_presets'), validation = launchModel.validatePreset(preset, root, fs.existsSync);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const args = launchModel.buildArgs(validation.preset), runtimeMode = validation.preset.mode === 'training' ? 'training' : 'quick-versus';
  if (validation.preset.music) {
    require('./quick_launch_music_runtime').install(root);
    args.push('-ikemaker.music', validation.preset.music,
      '-ikemaker.music-volume', String(validation.preset.musicTest.volume),
      '-ikemaker.music-loopstart', String(validation.preset.musicTest.loopStart),
      '-ikemaker.music-loopend', String(validation.preset.musicTest.loopEnd));
  }
  await runtimeSession.launch({ executable, args, cwd: root, mode: runtimeMode });
  vscode.window.showInformationMessage(`IKEMEN ${validation.preset.mode === 'training' ? 'Training' : 'Quick VS'} launched: ${launchModel.summary(validation.preset)}`);
}

async function openQuickLaunchSetup(selectedMode = 'versus') {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN match setup', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open character, tabs, or workspace.');
  return require('./quick_launch_workspace').open({
    mode: selectedMode === 'training' ? 'training' : 'versus', root,
    currentCharacter: currentCharacter(root) || config().get('defaultTrainingCharacter', ''),
    defaultStage: config().get('defaultTrainingStage', 'stages/stage0.def'),
    run: preset => launchPreset(root, preset)
  });
}

async function chooseCharacter(root, title, preferred) {
  const values = listFiles(root, 'chars', '.def');
  const picked = await vscode.window.showQuickPick(values.map((value) => ({ label: value, picked: value === preferred })), { title, matchOnDescription: true });
  return picked && picked.label;
}

async function chooseStage(root, title, preferred) {
  const values = listFiles(root, 'stages', '.def');
  const picked = await vscode.window.showQuickPick(values.map((value) => ({ label: value, picked: value === preferred })), { title });
  return picked && picked.label;
}

async function chooseMode(title) {
  return vscode.window.showQuickPick(TEAM_MODES.map((mode) => ({ label: mode.label, description: `${mode.count} default participant(s)`, mode })), { title }).then((pick) => pick && pick.mode);
}

async function chooseTeamCount(mode, title) {
  if (mode.value === 0) return 1;
  const picked = await vscode.window.showQuickPick([2, 3, 4, 5, 6, 7, 8].map((count) => ({ label: String(count) })), {
    title: `${title} participant count`
  });
  return picked ? Number(picked.label) : null;
}

async function currentMirror() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN training launch', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open character, tabs, or workspace.');
  const character = currentCharacter(root) || config().get('defaultTrainingCharacter', '');
  const stage = await chooseLaunchStage(root, config().get('defaultTrainingStage', 'stages/stage0.def'), (items, options) => vscode.window.showQuickPick(items, options));
  if (!stage) return;
  if (!character) return vscode.window.showErrorMessage('Open a file inside a character folder or set a default training character.');
  try { await launch(root, [character], [character], stage, TEAM_MODES[0], TEAM_MODES[0]); }
  catch (error) { vscode.window.showErrorMessage(error.message); }
}

async function currentMirrorVersus() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN versus launch', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open character, tabs, or workspace.');
  const character = currentCharacter(root) || config().get('defaultTrainingCharacter', '');
  const stage = await chooseLaunchStage(root, config().get('defaultTrainingStage', 'stages/stage0.def'), (items, options) => vscode.window.showQuickPick(items, options));
  if (!stage) return;
  if (!character) return vscode.window.showErrorMessage('Open a file inside a character folder or set a default character.');
  try { await launchVersus(root, [character], [character], stage, TEAM_MODES[0], TEAM_MODES[0]); }
  catch (error) { vscode.window.showErrorMessage(error.message); }
}

async function launchGame() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN launch', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open tabs or workspace.');
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) return vscode.window.showErrorMessage(`IKEMEN executable was not found: ${executable}`);
  await runtimeSession.launch({ executable, args: [], cwd: root, mode: 'normal' });
  vscode.window.showInformationMessage('IKEMEN launched.');
}

async function launchExactStoryboard(request) {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN storyboard preview', capabilities));
  if (!request || typeof request.storyboardFilename !== 'string' || typeof request.gameRoot !== 'string' || !/^[a-f0-9]{64}$/i.test(request.expectedSourceHash || '')) throw new Error('Choose the saved storyboard, its IKEMEN game root, and the reviewed source hash before preview.');
  const root = path.resolve(request.gameRoot), executable = enginePath(root);
  try {
    const launched = await require('./storyboard_runtime_preview').launchStoryboardRuntimePreview({ gameRoot: root, executable, storyboardFilename: request.storyboardFilename, expectedSourceHash: request.expectedSourceHash });
    vscode.window.showInformationMessage('IKEMEN launched the exact saved storyboard preview.');
    return launched;
  } catch (error) { vscode.window.showErrorMessage(error.message); throw error; }
}

async function restartRunning() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN restart', capabilities));
  try {
    const session = await runtimeSession.restart();
    vscode.window.showInformationMessage(`IKEMEN restarted in ${session.mode === 'quick-versus' ? 'Infinite Quick VS' : session.mode === 'training' ? 'Training' : session.mode === 'storyboard' ? 'Storyboard Preview' : 'Normal'} mode. Saved files were reloaded from disk.`);
  } catch (error) { vscode.window.showErrorMessage(error.message); }
}

async function configuredTraining() {
  return openQuickLaunchSetup('training');
}

async function setDefaultCharacter() {
  const root = findGameRoot(activePath()); if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const value = await chooseCharacter(root, 'Default training character', config().get('defaultTrainingCharacter', ''));
  if (value) await config().update('defaultTrainingCharacter', value, vscode.ConfigurationTarget.Workspace);
}

async function setDefaultStage() {
  const root = findGameRoot(activePath()); if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const value = await chooseStage(root, 'Default training stage', config().get('defaultTrainingStage', ''));
  if (value) await config().update('defaultTrainingStage', value, vscode.ConfigurationTarget.Workspace);
}

async function openControls() {
  const root = findGameRoot(activePath()); if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const filename = path.join(root, 'save', 'config.ini');
  if (!fs.existsSync(filename)) return vscode.window.showErrorMessage(`Controls file not found: ${filename}`);
  await vscode.window.showTextDocument(vscode.Uri.file(filename));
}

async function reviewRetryLoadOnError() {
  const root = findGameRoot(activePath());
  if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const capability = engineCapabilities(root)?.capabilities?.['launch.retry-load-on-error'];
  if (!capability?.enabled) {
    const choice = await vscode.window.showInformationMessage('Retry on load error is available only when this game explicitly targets a verified supporting IKEMEN GO Nightly build. IKEMEN GO 1.0 remains unchanged.', 'Review Engine Target');
    if (choice === 'Review Engine Target') await vscode.commands.executeCommand('ikemen.projectManager.open');
    return;
  }
  const filename = path.join(root, 'save', 'config.ini');
  if (!fs.existsSync(filename)) return vscode.window.showErrorMessage(`IKEMEN configuration was not found: ${filename}`);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  const config = require('./retry_load_config'), inspection = config.inspectRetryLoadOnError(document.getText());
  const current = inspection.state === 'enabled' ? 'Enabled' : inspection.state === 'disabled' ? 'Disabled' : inspection.state === 'invalid' ? 'Invalid value' : 'Not set';
  const picked = await vscode.window.showQuickPick([
    { label: 'Enable for development', description: 'Offer Retry after a foreground character or stage load error', enabled: true },
    { label: 'Disable', description: 'Return to the normal fail-and-exit loading behavior', enabled: false },
    { label: 'Open config.ini without changing it', description: 'Review the [Debug] section manually', openOnly: true }
  ], { title: `Retry on load error · currently ${current}`, placeHolder: 'A retry is convenience only and never counts as successful validation.' });
  if (!picked) return;
  if (picked.openOnly) return vscode.window.showTextDocument(document, { preview: false, selection: inspection.line >= 0 ? new vscode.Range(inspection.line, 0, inspection.line, 0) : undefined });
  const plan = config.planRetryLoadOnError(document.getText(), picked.enabled);
  if (!plan.ok) return vscode.window.showWarningMessage(plan.reason, 'Open config.ini').then(choice => choice === 'Open config.ini' && vscode.window.showTextDocument(document, { preview: false }));
  if (!plan.changed) return vscode.window.showInformationMessage(`Retry on load error is already ${picked.enabled ? 'enabled' : 'disabled'}.`);
  const confirmation = await vscode.window.showWarningMessage(`${picked.enabled ? 'Enable' : 'Disable'} RetryLoadOnError in save/config.ini? The edit will remain unsaved so you can review it. Retrying never counts as a successful compile or runtime test.`, { modal: true }, 'Apply Unsaved Edit');
  if (confirmation !== 'Apply Unsaved Edit') return;
  const edit = new vscode.WorkspaceEdit();
  const end = document.lineAt(Math.max(0, document.lineCount - 1)).range.end;
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), plan.text.replace(/\r?\n$/, ''));
  if (!await vscode.workspace.applyEdit(edit)) return vscode.window.showErrorMessage('VS Code could not apply the reviewed config edit.');
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(0, Math.min(plan.line, document.lineCount - 1)), position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position); editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  vscode.window.showInformationMessage(`Retry on load error is ${picked.enabled ? 'enabled' : 'disabled'} in the unsaved config editor. Review and save when ready.`);
}

async function openPaletteFolder() {
  const root = findGameRoot(activePath()); if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const character = currentCharacter(root); if (!character) return vscode.window.showErrorMessage('Open a file inside the desired character folder first.');
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(path.join(root, character))));
}

function registerIkemenHub(context, options = {}) {
  engineCapabilities = typeof options.getCapabilities === 'function' ? options.getCapabilities : engineCapabilities;
  require('./quick_launch_workspace').initialize(context);
  const provider = new IkemenHubProvider();
  const changes=new vscode.EventEmitter();provider.onDidChangeTreeData=changes.event;
  context.subscriptions.push(changes,require('./workspace_setup').onDidChange(()=>changes.fire()),vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('ikemenZss.interfaceMode'))changes.fire();}));
  const installedVersion = context.extension?.packageJSON?.version || PACKAGE_VERSION;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = 'IKEMaker Version'; status.text = `$(tools) IKEMaker ${installedVersion}`; status.tooltip = 'Installed IKEMaker version — click to confirm or open IKEMaker'; status.command = 'ikemen.showVersion'; status.show();
  context.subscriptions.push(
    status,
    vscode.window.createTreeView('ikemen.tools', { treeDataProvider: provider, showCollapseAll: true }),
    vscode.commands.registerCommand('ikemen.openTools', () => vscode.commands.executeCommand('workbench.view.extension.ikemen')),
    vscode.commands.registerCommand('ikemen.chooseOpeningSidebar', async () => {
      const configuration = vscode.workspace.getConfiguration('ikemenZss');
      const current = configuration.get('openIkemenToolsOnStartup', true);
      const selected = await vscode.window.showQuickPick([
        { label: 'Open IKEMaker (Recommended)', description: current ? 'Current choice' : 'Show IKEMaker Tools whenever VS Code starts', value: true },
        { label: 'Use VS Code’s normal opening sidebar', description: current ? 'Leave Explorer or the previously active sidebar in control' : 'Current choice', value: false }
      ], { title: 'Choose the sidebar shown when VS Code opens' });
      if (!selected) return;
      await configuration.update('openIkemenToolsOnStartup', selected.value, vscode.ConfigurationTarget.Global);
      if (selected.value) await vscode.commands.executeCommand('workbench.view.extension.ikemen');
      vscode.window.showInformationMessage(selected.value ? 'IKEMaker will be the opening sidebar.' : 'VS Code will retain its normal opening sidebar.');
    }),
    vscode.commands.registerCommand('ikemen.showVersion', async () => {
      const action = await vscode.window.showInformationMessage(`IKEMaker ${installedVersion} is installed.`, 'Open IKEMaker', 'Copy Version');
      if (action === 'Open IKEMaker') await vscode.commands.executeCommand('ikemen.openTools');
      if (action === 'Copy Version') { await vscode.env.clipboard.writeText(installedVersion); vscode.window.showInformationMessage(`Copied IKEMaker version ${installedVersion}.`); }
    }),
    vscode.commands.registerCommand('ikemen.launchGame', launchGame),
    vscode.commands.registerCommand('ikemen.storyboard.runExact', launchExactStoryboard),
    vscode.commands.registerCommand('ikemen.launchMirrorCurrent', currentMirrorVersus),
    vscode.commands.registerCommand('ikemen.launchTrainingCurrent', currentMirror),
    vscode.commands.registerCommand('ikemen.authoring.launchScenarioOwner', launchScenarioOwner),
    vscode.commands.registerCommand('ikemen.restartRunning', restartRunning),
    vscode.commands.registerCommand('ikemen.launchTrainingConfigured', configuredTraining),
    vscode.commands.registerCommand('ikemen.quickLaunch.openSetup', openQuickLaunchSetup),
    vscode.commands.registerCommand('ikemen.setDefaultTrainingCharacter', setDefaultCharacter),
    vscode.commands.registerCommand('ikemen.setDefaultTrainingStage', setDefaultStage),
    vscode.commands.registerCommand('ikemen.openControls', openControls),
    vscode.commands.registerCommand('ikemen.reviewRetryLoadOnError', reviewRetryLoadOnError),
    vscode.commands.registerCommand('ikemen.openPaletteFolder', openPaletteFolder),
    vscode.commands.registerCommand('ikemen.openLauncherSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools training')),
    vscode.commands.registerCommand('ikemen.openExtensionSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools'))
  );
  require('./windows_file_associations').registerWindowsFileAssociations(context, installedVersion);
  if (vscode.workspace.getConfiguration('ikemenZss').get('openIkemenToolsOnStartup', true)) {
    // VS Code restores its previous sidebar after extension activation on some
    // machines. Run after that restoration so the explicit IKEMaker preference wins.
    setTimeout(() => vscode.commands.executeCommand('workbench.view.extension.ikemen'), 1500);
  }
}

module.exports = { registerIkemenHub, findGameRoot, currentCharacter, launchScenarioOwner, launchExactStoryboard, TEAM_MODES, HubItem, IkemenHubProvider, buildHubItems, reviewRetryLoadOnError };
