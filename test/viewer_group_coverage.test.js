'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourceRoot = path.join(__dirname, '..', 'src');
const visualWorkspaces = [
  'air_viewer.js', 'sff_viewer.js', 'snd_viewer.js', 'move_constants_workspace.js',
  'code_structure_workspace.js', 'command_movelist_workspace.js',
  'character_dependency_workspace.js', 'character_health_workspace.js',
  'cns_converter_workspace.js', 'menu_modes_workspace.js', 'mutation_history.js',
  'palette_import_workspace.js', 'palfx_editor.js', 'production_workflow_workspace.js',
  'screenpack_workspace.js', 'select_def_workspace.js', 'stage_workspace.js',
  'story_dialogue_workspace.js', 'test_session_workspace.js', 'throw_creator_workspace.js',
  'hitdef_workspace.js', 'move_lab_workspace.js'
  , 'project_manager_workspace.js'
  , 'help_workspace.js'
];

for (const filename of visualWorkspaces) {
  const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8');
  assert(source.includes("require('./viewer_group')"), `${filename} must participate in the shared visual-viewer group`);
  assert(!/createWebviewPanel\([^\n]+ViewColumn\.(?:Beside|One|Two|Three)/.test(source), `${filename} must not force a separate viewer column`);
  assert(!/\.reveal\(vscode\.ViewColumn\.(?:Beside|One|Two|Three)/.test(source), `${filename} must not force an existing viewer into another column`);
}

console.log('Shared visual-viewer group coverage tests passed');
