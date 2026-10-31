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
const viewerNavigation = require('../src/viewer_navigation');
Module._load = original;

assert.strictEqual(viewerNavigation.allowsArchiveContext('moves.zss'), false, 'text/ZSS Related Work must ignore stale archive-family context and use DEF assignments');
for (const asset of ['shared.air', 'shared.sff', 'shared.snd']) {
  assert.strictEqual(viewerNavigation.allowsArchiveContext(asset), false, 'a filename alone cannot prove a visual archive-family handoff');
  assert.strictEqual(viewerNavigation.allowsArchiveContext(asset, { panel: {}, kind: path.extname(asset).slice(1) }), true, 'a live visual panel may retain its intentional archive family');
}

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
  'production_workflow_workspace.js', 'screenpack_workspace.js', 'select_def_workspace.js',
  'stage_workspace.js', 'story_dialogue_workspace.js', 'test_session_workspace.js', 'throw_creator_workspace.js', 'mutation_history.js', 'character_health_workspace.js', 'cns_converter_workspace.js'
];
for (const filename of cohesiveScreens) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
  assert(source.includes('renderUniversalToolbar') || source.includes('launchControlsHtml'), `${filename} is missing universal-v1 chrome`);
  assert(source.includes('universalToolbarClientScript') || source.includes('launchControlsClientScript'), `${filename} is missing the universal client bridge`);
}

const launch = fs.readFileSync(path.join(__dirname, '..', 'src', 'launch_controls.js'), 'utf8');
assert(!launch.includes('data-ikemen-launch="game"'), 'variable legacy launch rows are retired');
assert(launch.includes('universal_toolbar_webview'), 'legacy consumers bind through universal-v1');

console.log('Related-work navigation and screen-cohesion tests passed');
