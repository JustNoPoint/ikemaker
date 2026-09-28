'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    window: {}, workspace: {}, commands: {}, ConfigurationTarget: { Workspace: 1 }
  };
  return original.call(this, request, parent, main);
};
const { buildHubItems } = require('../src/ikemen_hub');
Module._load = original;
const packageJson = require('../package.json');

require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'workspace'})}},{});
const roots = buildHubItems();
const contributedCommands = new Set(packageJson.contributes.commands.map((item) => item.command));
const visit = (items) => items.flatMap((item) => item.children ? visit(item.children) : [item]);
for (const item of visit(roots)) if (item.command?.command) {
  assert(contributedCommands.has(item.command.command), `${item.command.command} is visible in IKEMEN Tools but is not contributed to VS Code`);
}
const labels = roots.map((item) => item.label);
assert(labels.some((label)=>label.startsWith('Current Project Tool Focus:')),'Workspace mode exposes the active project presentation focus');
assert(labels.includes('Show All Workspace Tools'),'Workspace mode keeps the full-tool override obvious');
assert.deepStrictEqual(labels.slice(4, 8), ['Quick Start', 'Create New', 'Player Setup', 'Character Authoring']);
for (const required of ['Debug and Testing', 'Universal Standards', 'Game and Project Profiles', 'Personal Workspace and Preferences', 'Release and Public Copy']) {
  assert(labels.includes(required), `missing hub responsibility: ${required}`);
}

const root = (label) => roots.find((item) => item.label === label);
const commands = (label) => (root(label)?.children || []).map((item) => item.command?.command).filter(Boolean);
const debug = commands('Debug and Testing');
for (const command of ['ikemen.testSessions.open', 'ikemen.characterHealth.open', 'zss.audit.currentFile', 'zss.audit.workspace', 'sff.auditCharacterRequirements', 'ikemen.stage.launchRig', 'ikemen.mutations.openHistory']) {
  assert(debug.includes(command), `${command} is not grouped with debug and testing`);
}

const gameProfiles = commands('Game and Project Profiles');
for (const command of ['ikemen.projectManager.open', 'ikemen.projectProfile.create', 'ikemen.context.show', 'ikemen.context.openRegistry', 'ikemen.context.migrateRegistry', 'ikemen.context.indexMetadata', 'ikemen.productionWorkflow.editProfile', 'sff.openRequirementsProfile', 'sff.openAliasRegistry', 'sff.openProjectBuildProfile', 'sff.createProjectBuildProfile', 'ikemen.ui.createPreviewProfile']) {
  assert(gameProfiles.includes(command), `${command} is not grouped with game/project profiles`);
}

const personal = commands('Personal Workspace and Preferences');
for (const command of ['ikemen.experience.configure', 'ikemen.openLauncherSettings', 'snd.chooseAudioEditor', 'ikemen.chooseOpeningSidebar', 'ikemen.windowsFileAssociations.configure', 'ikemen.openExtensionSettings']) {
  assert(personal.includes(command), `${command} is not grouped with personal preferences`);
}
assert.strictEqual(packageJson.contributes.configuration.properties['ikemenZss.openIkemenToolsOnStartup'].default, true);

const universal = commands('Universal Standards');
for (const command of ['ikemen.animationStandards.open', 'ikemen.authoringBridge.openGuide', 'ikemen.docs.openOffline', 'sff.showNamingStandard']) {
  assert(universal.includes(command), `${command} is not visibly universal`);
}
assert(!universal.some((command) => gameProfiles.includes(command) || personal.includes(command)), 'universal commands leaked into profile/preferences sections');

const help = commands('Help and Compatibility');
for (const command of ['ikemen.help.open', 'ikemen.showPlatformCapabilities', 'ikemen.docs.openOffline']) assert(help.includes(command), `${command} is missing from Help and Compatibility`);

const quick = commands('Quick Start');
for (const command of ['ikemen.character.open', 'ikemen.character.createNew', 'ikemen.stage.createNew', 'ikemen.ui.createNew', 'ikemen.file.createNew', 'ikemen.relatedWork.open', 'ikemen.productionWorkflow.open', 'ikemen.projectManager.open', 'ikemen.projectProfile.create', 'ikemen.selectDef.openWorkspace', 'ikemen.launchGame']) {
  assert(quick.includes(command), `${command} is missing from Quick Start`);
}
const quickLabels = (root('Quick Start')?.children || []).map((item) => item.label);
assert(!quick.includes('ikemen.showVersion'), 'installed version is status information, not a Quick Start task');
assert(!quickLabels.some((label) => /^IKEMaker \d/.test(label)), 'Quick Start must not contain a selectable version-only row');
const personalLabels = (root('Personal Workspace and Preferences')?.children || []).map((item) => item.label);
assert(!quick.includes('ikemen.windowsFileAssociations.configure'), 'one-time file-association setup must not occupy Quick Start');
assert(personalLabels.includes('Set .SFF / .AIR / .SND / Code File Opening…'), 'file-opening setup should remain explicit under personal preferences');
const playerSetup = commands('Player Setup');
assert(playerSetup.includes('ikemen.palette.openWorkspace'), 'Player Setup should expose the canonical Palette Workspace');
const hubSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'ikemen_hub.js'), 'utf8');
assert.match(hubSource, /setTimeout\(\(\) => vscode\.commands\.executeCommand\('workbench\.view\.extension\.ikemen'\), 1500\)/, 'IKEMaker startup focus should run after VS Code restores Explorer');

const code = commands('ZSS, CNS, and Lua');
for (const command of ['zss.createNew', 'cns.createNew', 'inp.createNew', 'cmd.createNew', 'ikemen.def.createNew', 'ikemen.lua.createNew', 'ikemen.text.createNew']) assert(code.includes(command), `${command} should be directly available in code authoring`);
assert(code.includes('ikemen.maps.openBrowser'), 'Browse Maps should be directly available under ZSS, CNS, and Lua');
assert(code.includes('ikemen.cnsConverter.open'));
assert(code.includes('ikemen.cnsConverter.character'));
assert(code.includes('zss.openProjectData'));

const character = commands('Character Authoring');
for (const command of ['ikemen.character.open', 'ikemen.character.close', 'ikemen.character.createNew', 'ikemen.file.createNew', 'sff.createNew', 'air.createNew', 'snd.createNew', 'ikemen.relatedWork.open', 'ikemen.productionWorkflow.open']) assert(character.includes(command), `${command} should also be discoverable under Character Authoring`);
const createNew = commands('Create New');
for (const command of ['ikemen.character.createNew', 'ikemen.stage.createNew', 'ikemen.ui.createNew', 'ikemen.projectProfile.create', 'sff.createNew', 'air.createNew', 'snd.createNew', 'zss.createNew', 'cns.createNew', 'inp.createNew', 'cmd.createNew', 'ikemen.def.createNew', 'ikemen.lua.createNew', 'ikemen.text.createNew', 'ikemen.paletteImport.open']) assert(createNew.includes(command), `${command} is missing from the central Create New section`);
const sff = commands('SFF and Sprites');
for (const command of ['sff.openSprMakerText', 'sff.openGroupLog', 'sff.openProjectBuildProfile', 'sff.createProjectBuildProfile']) assert(sff.includes(command), `${command} should be discoverable under SFF and Sprites`);
const sound = commands('SND and Sounds');
for (const command of ['snd.openMakerText', 'snd.chooseAudioEditor']) assert(sound.includes(command), `${command} should be discoverable under SND and Sounds`);

console.log('IKEMaker hub information-architecture tests passed');

for(const mode of ['player','simple']){
 require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=>mode})}},{});
 const walk=items=>{for(const item of items){if(item.children)walk(item.children);else if(item.command)assert(require('../src/interface_capabilities').allows(item.command.command,mode),mode+' leaked '+item.command.command);}};
 walk(buildHubItems());
}
require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'player'})}},{});
const playerCommands=visit(buildHubItems()).map(item=>item.command?.command).filter(Boolean);
assert(playerCommands.includes('ikemen.palette.openWorkspace'),'Player Tools should expose the canonical Palette Workspace');
for(const command of ['sff.openViewer','ikemen.paletteImport.open','ikemen.paletteOrganizer.open','ikemen.character.createNew'])assert(!playerCommands.includes(command),`Player Tools leaked broader authoring command ${command}`);
console.log('Player and Simple Tools trees contain only their permitted commands');
