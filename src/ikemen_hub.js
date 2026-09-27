'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const engineLocator = require('./engine_locator');
const { chooseLaunchStage } = require('./launch_stage');
const PACKAGE_VERSION = require('../package.json').version;

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
function buildHubItems(){const allowed=require('./interface_capabilities').allows,mode=require('./interface_mode').current(),setup=require('./workspace_setup'),value=setup.current();const filter=items=>items.flatMap(item=>{if(item.children){item.children=filter(item.children);return item.children.length?[item]:[];}return item.command&&allowed(item.command.command)?[item]:[];});const setupItems=mode==='workspace'?[new HubItem(`Current Project Tool Focus: ${setup.summary(value)}`,null,'ikemen.workspaceSetup.change','presentation only · changes with the active project'),new HubItem(value.showAll?'Use Saved Project Focus':'Show All Workspace Tools',null,'ikemen.workspaceSetup.showAll')]:[];return [new HubItem('Home',null,'ikemen.openHome'),new HubItem('Change mode…',null,'ikemen.changeMode'),...setupItems,...filter(buildAllHubItems())];}
function buildAllHubItems() {
  return [
      new HubItem('Quick Start', [
        new HubItem('Open Character…', null, 'ikemen.character.open', 'start here'),
        new HubItem('Open Move Lab…', null, 'ikemen.moveLab.open', 'moves, throws, animation, assets, code, diagnostics, and tests'),
        new HubItem('Create New Character…', null, 'ikemen.character.createNew', 'complete playable character scaffold'),
        new HubItem('Create New Stage…', null, 'ikemen.stage.createNew', 'stage files and visual workspace'),
        new HubItem('Create New Screenpack / Fight UI…', null, 'ikemen.ui.createNew', 'screenpack files and visual workspace'),
        new HubItem('Create New Storyboard…', null, 'ikemen.storyboard.create', 'opening, ending, credits, logo, loading, and story scenes'),
        new HubItem('Create an Individual File…', null, 'ikemen.file.createNew', 'ZSS, CNS, CMD, DEF, Lua, or text'),
        new HubItem('Close Current Character…', null, 'ikemen.character.close', 'close all of its tabs'),
        new HubItem('Close Current Authoring Context…', null, 'ikemen.context.closeCurrent', 'character, stage, or screenpack'),
        new HubItem('Open Related Work…', null, 'ikemen.relatedWork.open', 'connected files and tools'),
        new HubItem('Open Production Workflow…', null, 'ikemen.productionWorkflow.open', 'guided character work'),
        new HubItem('Open Project & Team Manager…', null, 'ikemen.projectManager.open', 'games, work projects, teams, members, and job classes'),
        new HubItem('Create New Game Profile…', null, 'ikemen.projectProfile.create', 'game identity, classification, and ownership'),
        new HubItem('Open Roster Manager…', null, 'ikemen.selectDef.openWorkspace', 'add characters and stages'),
        new HubItem('Launch IKEMEN  (Ctrl+Alt+F5)', null, 'ikemen.launchGame'),
        new HubItem('Infinite Mirror VS  (Ctrl+Alt+F6)', null, 'ikemen.launchMirrorCurrent'),
        new HubItem('Training Mirror  (Ctrl+Alt+F7)', null, 'ikemen.launchTrainingCurrent')
      ]),
      new HubItem('Create New', [
        new HubItem('Create Character…', null, 'ikemen.character.createNew', 'DEF, AIR, SFF, SND, and starter code'),
        new HubItem('Create Stage…', null, 'ikemen.stage.createNew', 'DEF, SFF, and visual workspace'),
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
        new HubItem('Palette Workshop…', null, 'ikemen.palettePlayer.open', 'preview, create, edit, import, export, add, or replace palettes'),
        new HubItem('Menu and Mode Options…', null, 'ikemen.menuModes.openPlayer'),
        new HubItem('Story and Dialogue…', null, 'ikemen.storyDialogue.openPlayer'),
        new HubItem('Character Select Preview…', null, 'ikemen.selectDef.openLayoutBuilder')
      ]),
      new HubItem('Character Authoring', [
        new HubItem('Open Move Lab…', null, 'ikemen.moveLab.open', 'one visual shell for moves, throws, assets, code, diagnostics, and tests'),
        new HubItem('Open Explod Composer…', null, 'ikemen.explodComposer.open', 'place effects on fighters, the stage, or the screen'),
        new HubItem('Open Position & Camera…', null, 'ikemen.positionCamera.open', 'position fighters, targets, helpers, bounds, and camera-sensitive movement'),
        new HubItem('Open Helper Lab…', null, 'ikemen.helperLab.open', 'create helpers, inspect nested helper trees, and map data flow'),
        new HubItem('Open Character…', null, 'ikemen.character.open'),
        new HubItem('Close Current Character…', null, 'ikemen.character.close'),
        new HubItem('Open Related Character Work…', null, 'ikemen.relatedWork.open'),
        new HubItem('Create New Character…', null, 'ikemen.character.createNew', 'choose MUGEN/CNS or IKEMEN/ZSS'),
        new HubItem('Create Character Asset File…', null, 'ikemen.file.createNew', 'ZSS, CNS, CMD, DEF, Lua, or text'),
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
        new HubItem('Configure Learning / Advanced Experience…', null, 'ikemen.experience.configure'),
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

function launch(root, players1, players2, stage, mode1, mode2) {
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
  // Quick VS keeps the configured round timer unless it is explicitly
  // overridden. Training must always begin with unlimited time; otherwise the
  // custom training-mode hook can enter a match whose timer has already ended.
  const args = ['-loadmotif', '1', '-training', '1', '-time', '-1', '-tmode1', String(mode1.value), '-tmode2', String(mode2.value), '-s', stage];
  players1.forEach((character, index) => args.push(`-p${1 + index * 2}`, character));
  players2.forEach((character, index) => args.push(`-p${2 + index * 2}`, character));
  const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  vscode.window.showInformationMessage(`IKEMEN training launched: ${quoteSummary(args)}`);
}

function launchVersus(root, players1, players2, stage, mode1, mode2) {
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
  const args = ['-loadmotif', '-time', '-1', '-rounds', '-1', '-tmode1', String(mode1.value), '-tmode2', String(mode2.value), '-s', stage];
  players1.forEach((character, index) => args.push(`-p${1 + index * 2}`, character));
  players2.forEach((character, index) => args.push(`-p${2 + index * 2}`, character));
  const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  vscode.window.showInformationMessage(`IKEMEN versus match launched: ${quoteSummary(args)}`);
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
  try { launch(root, [character], [character], stage, TEAM_MODES[0], TEAM_MODES[0]); }
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
  try { launchVersus(root, [character], [character], stage, TEAM_MODES[0], TEAM_MODES[0]); }
  catch (error) { vscode.window.showErrorMessage(error.message); }
}

async function launchGame() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN launch', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open tabs or workspace.');
  const executable = enginePath(root);
  if (!fs.existsSync(executable)) return vscode.window.showErrorMessage(`IKEMEN executable was not found: ${executable}`);
  const child = spawn(executable, [], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  vscode.window.showInformationMessage('IKEMEN launched.');
}

async function configuredTraining() {
  const capabilities = hostCapabilities(); if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMEN training launch', capabilities));
  const root = currentGameRoot();
  if (!root) return vscode.window.showErrorMessage('Could not locate an IKEMEN game root from the open character, tabs, or workspace.');
  const preferred = currentCharacter(root) || config().get('defaultTrainingCharacter', '');
  const mode1 = await chooseMode('P1 team mode'); if (!mode1) return;
  const mode2 = await chooseMode('P2 team mode'); if (!mode2) return;
  const count1 = await chooseTeamCount(mode1, 'P1'); if (!count1) return;
  const count2 = await chooseTeamCount(mode2, 'P2'); if (!count2) return;
  const players1 = [];
  const players2 = [];
  for (let i = 0; i < count1; i += 1) { const value = await chooseCharacter(root, `P1 member ${i + 1}`, preferred); if (!value) return; players1.push(value); }
  for (let i = 0; i < count2; i += 1) { const value = await chooseCharacter(root, `P2 member ${i + 1}`, preferred); if (!value) return; players2.push(value); }
  const stage = await chooseStage(root, 'Training stage', config().get('defaultTrainingStage', '')); if (!stage) return;
  try { launch(root, players1, players2, stage, mode1, mode2); }
  catch (error) { vscode.window.showErrorMessage(error.message); }
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

async function openPaletteFolder() {
  const root = findGameRoot(activePath()); if (!root) return vscode.window.showErrorMessage('IKEMEN game root not found.');
  const character = currentCharacter(root); if (!character) return vscode.window.showErrorMessage('Open a file inside the desired character folder first.');
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(path.join(root, character))));
}

function registerIkemenHub(context) {
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
    vscode.commands.registerCommand('ikemen.launchMirrorCurrent', currentMirrorVersus),
    vscode.commands.registerCommand('ikemen.launchTrainingCurrent', currentMirror),
    vscode.commands.registerCommand('ikemen.launchTrainingConfigured', configuredTraining),
    vscode.commands.registerCommand('ikemen.setDefaultTrainingCharacter', setDefaultCharacter),
    vscode.commands.registerCommand('ikemen.setDefaultTrainingStage', setDefaultStage),
    vscode.commands.registerCommand('ikemen.openControls', openControls),
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

module.exports = { registerIkemenHub, findGameRoot, currentCharacter, TEAM_MODES, HubItem, IkemenHubProvider, buildHubItems };
