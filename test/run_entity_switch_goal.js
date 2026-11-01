'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

// Explicit release-facing source gate for synchronized entity navigation.
// Installed VS Code interaction checks remain a separate physical QA pass.
const tests = Object.freeze([
  'entity_header.test.js',
  'entity_switch_coordinator.test.js',
  'entity_switch_host.test.js',
  'entity_switch_runtime.test.js',
  'entity_switch_cross_surface_acceptance.test.js',
  'entity_restore_closed.test.js',
  'entity_target_resolver.test.js',
  'entity_file_order.test.js',
  'authoring_context_registry.test.js',
  'authoring_context_model.test.js',
  'sff_entity_retarget.test.js',
  'sff_browser_entity_retarget.test.js',
  'sff_zoom_restore.test.js',
  'sff_viewer_experience.test.js',
  'sff_browser.test.js',
  'air_entity_retarget.test.js',
  'air_browser_entity_retarget_lifecycle.test.js',
  'air_selection_restore.test.js',
  'air_viewer_reuse.test.js',
  'snd_entity_retarget_lifecycle.test.js',
  'snd_browser_entity_retarget.test.js',
  'snd_browser.test.js',
  'stage_workspace.test.js',
  'stage_lifecycle.test.js',
  'screenpack_workspace.test.js',
  'screenpack_actual_panel.test.js',
  'code_structure_workspace.test.js',
  'code_structure_lifecycle.test.js',
  'text_editor_toolbar.test.js',
  'text_editor_companion.test.js',
  'text_editor_header_only.test.js',
  'native_code_workspace_integration.test.js',
  'text_transition_layout.test.js',
  'text_editor_cold_start_activation.test.js',
  'ui_command_contract_audit.test.js',
  'web_activation.test.js'
]);

const result = spawnSync(process.execPath, ['--test', ...tests.map(name => path.join(__dirname, name))], { stdio:'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`All ${tests.length} synchronized entity-switch source acceptance files passed.`);
