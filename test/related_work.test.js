'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    QuickPickItemKind: { Separator: -1 }, window: {}, workspace: {}, commands: {},
    Uri: { file: (fsPath) => ({ fsPath }) }
  };
  return original.call(this, request, parent, main);
};
const related = require('../src/related_work');
Module._load = original;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-related-'));
try {
  const character = path.join(root, 'chars', 'Ryu'); fs.mkdirSync(character, { recursive: true });
  for (const file of ['Ryu.sff', 'Ryu.air', 'Ryu.snd', 'commands.zss', 'constants.cns', 'normals.zss']) fs.writeFileSync(path.join(character, file), '');
  const def = path.join(character, 'Ryu.def');
  fs.writeFileSync(def, '[Files]\nsprite = Ryu.sff\nanim = Ryu.air\nsound = Ryu.snd\ncmd = commands.zss\ncns = constants.cns\nst = normals.zss\n');
  const assets = related.resolveAssigned(def);
  assert.strictEqual(assets.sff, path.join(character, 'Ryu.sff'));
  assert.strictEqual(assets.air, path.join(character, 'Ryu.air'));
  assert.strictEqual(assets.snd, path.join(character, 'Ryu.snd'));
  assert(assets.code.includes(path.join(character, 'normals.zss')));
  const items = related.currentItems('air', def, assets, root).filter((item) => item.target);
  for (const target of ['source', 'connections', 'code', 'converter', 'commands', 'constants', 'sff', 'air', 'snd', 'palette', 'palfx', 'workflow', 'tests', 'health', 'roster', 'menus', 'story', 'screenpack', 'stage', 'recovery']) {
    assert(items.some((item) => item.target === target), `missing related-work target ${target}`);
  }
  const debugSeparator = related.currentItems('air', def, assets, root).findIndex((item) => item.label === 'Debug and testing');
  const productionSeparator = related.currentItems('air', def, assets, root).findIndex((item) => item.label === 'Production');
  assert(debugSeparator >= 0 && productionSeparator > debugSeparator, 'debug tools should have a dedicated section before production');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

const cohesiveScreens = [
  'air_viewer.js', 'sff_viewer.js', 'snd_viewer.js', 'palfx_editor.js', 'character_dependency_workspace.js',
  'code_structure_workspace.js', 'command_movelist_workspace.js', 'menu_modes_workspace.js', 'move_constants_workspace.js',
  'palette_import_workspace.js', 'production_workflow_workspace.js', 'screenpack_workspace.js', 'select_def_workspace.js',
  'stage_workspace.js', 'story_dialogue_workspace.js', 'test_session_workspace.js', 'throw_creator_workspace.js', 'mutation_history.js', 'character_health_workspace.js', 'cns_converter_workspace.js'
];
for (const filename of cohesiveScreens) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
  assert(source.includes('launchControlsHtml'), `${filename} is missing the universal header controls`);
  assert(source.includes('launchControlsClientScript'), `${filename} is missing the universal header client bridge`);
  assert(source.includes('handleLaunchMessage'), `${filename} does not handle universal launch/related-work actions`);
}

const launch = fs.readFileSync(path.join(__dirname, '..', 'src', 'launch_controls.js'), 'utf8');
assert(launch.indexOf('Related Work…') < launch.indexOf('data-ikemen-launch="game"'), 'navigation should precede launch actions consistently');
for (const shortcut of ['Ctrl+Alt+F5', 'Ctrl+Alt+F6', 'Ctrl+Alt+F7']) assert(launch.includes(shortcut), `missing visible shortcut ${shortcut}`);
assert(launch.includes('@media(max-width:900px)'), 'shared controls need a compact responsive layout');

console.log('Related-work navigation and screen-cohesion tests passed');
