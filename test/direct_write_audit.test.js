'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'src');
const allowed = new Set(['engine_migration.js', 'engine_migration_ui.js', 'mutation_safety.js', 'save_controls.js', 'sff_build_safety.js', 'sff_commands.js', 'sff_creator_operation_vault.js', 'sff_creator_result_preparation_cleanup.js', 'sff_creator_transactional_executor.js', 'sff_viewer.js', 'snd_viewer.js', 'text_save_as.js']);
const findings = [];
for (const name of fs.readdirSync(source).filter((item) => item.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(source, name), 'utf8');
  if (/fs\.(?:writeFileSync|renameSync|copyFileSync)\s*\(/.test(text)) findings.push(name);
}
assert.deepStrictEqual(findings.sort(), [...allowed].sort(), `Raw file writes escaped the reviewed authority allowlist: ${findings.join(', ')}`);
for (const migrationFile of ['engine_migration.js', 'engine_migration_ui.js']) {
  const text = fs.readFileSync(path.join(source, migrationFile), 'utf8');
  assert.ok(/WRITE_AUTHORITY\s*=\s*'explicit-engine-migration-approval'/.test(text), `${migrationFile} must retain an explicit, reviewed write-authority marker`);
}
assert.match(fs.readFileSync(path.join(source, 'sff_build_safety.js'), 'utf8'), /WRITE_AUTHORITY\s*=\s*'reviewed-sff-build-snapshot-and-adoption'/, 'SFF candidate writes must retain their narrow reviewed authority marker');
assert.match(fs.readFileSync(path.join(source, 'sff_creator_operation_vault.js'), 'utf8'), /WRITE_AUTHORITY\s*=\s*'sealed-sff-creator-operation-vault-only'/, 'SFF operation-vault writes must retain their narrow reviewed authority marker');
assert.match(fs.readFileSync(path.join(source, 'sff_creator_result_preparation_cleanup.js'), 'utf8'), /WRITE_AUTHORITY\s*=\s*'verified-completed-result-preparation-cleanup-only'/, 'SFF result preparation cleanup must retain its narrow reviewed authority marker');
assert.match(fs.readFileSync(path.join(source, 'sff_creator_transactional_executor.js'), 'utf8'), /WRITE_AUTHORITY\s*=\s*'approved-sff-transactional-adoption-execution'/, 'SFF adoption execution must retain its narrow reviewed write-authority marker');
for (const migrated of ['pushbox_authoring.js', 'runtime_geometry.js', 'stage_workspace.js', 'screenpack_workspace.js', 'palette_master.js', 'palette_plan.js', 'palette_preview.js', 'asset_creation.js', 'character_creation.js']) {
  const text = fs.readFileSync(path.join(source, migrated), 'utf8');
  assert.ok(!/fs\.(?:writeFileSync|renameSync|copyFileSync)\s*\(/.test(text), `${migrated} bypasses mutation safety`);
}

console.log('Direct-write authority audit passed');
