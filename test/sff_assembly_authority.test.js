'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

const picker = deferred(), writes = [], builds = [], errors = [];
const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  window: {
    showOpenDialog: async () => picker.promise,
    showWarningMessage: async message => { errors.push(String(message)); },
    showErrorMessage: async message => { errors.push(String(message)); },
    showInformationMessage: async () => undefined,
    showTextDocument: async () => undefined
  }
};
const original = Module._load;
Module._load = function(request, parent, main) {
  const assembly = /sff_assembly_workspace/.test(parent?.filename || '');
  if (!assembly) return original.call(this, request, parent, main);
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff() {}, friendlyVersion: () => '2.1', spritePng: () => Buffer.from('png') };
  if (request === './sff') return { stringifyCsv: () => 'csv\n' };
  if (request === './sff_names') return { spriteSystemName: () => ({ systemName: '' }) };
  if (request === './sff_commands') return { createBuildPackage: async request => { builds.push(request); return { batchPath: 'build.cmd' }; } };
  if (request === './sff_build_profile') return { DEFAULT_PROFILE: {} };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value };
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => undefined };
  if (request === './mutation_safety') return { transactionalWriteSet(_fs, entries) { writes.push(entries); }, transactionalWrite() {}, beginExternalMutation() { return { rollback() {}, complete() {} }; } };
  if (request === './sff_transfer_assembly_adapter') return { validateSffTransferAssemblySeed: value => value.seed };
  if (request === './sff_transfer_conflict_model') return { analyzeSffTransferConflicts: () => ({}) };
  if (request === './sff_transfer_resolution_model') return { planSffTransferResolution: () => ({ readyForApply: false }) };
  if (request === './sff_transfer_decision_ui') return { collectSffTransferDecisions: async () => null };
  if (request === './sff_transfer_apply') return { prepareSffTransferBuild: async () => { throw new Error('not expected'); } };
  return original.call(this, request, parent, main);
};

const workspace = require('../src/sff_assembly_workspace');
Module._load = original;

const base = { filename: 'base.sff', sprites: [{ index: 0, group: 0, number: 0, axisX: 5, axisY: 6 }] };
const source = { filename: 'source.sff', sprites: [{ index: 0, group: 10, number: 0, axisX: 1, axisY: 2 }] };
const operation = { selection: { indices: [0] }, targetGroup: 0, mode: 'append', preserveDestinationAxis: true, label: 'append: 1 sprite(s) → 0' };
const digest = 'a'.repeat(64), draft = { operations: [operation], selected: [0], mode: 'append', preserveDestinationAxis: true };

assert(workspace.validAssemblyMessage({ type: 'assemblyDraft', identity: digest, revision: 1, draft }, base, source));
assert(!workspace.validAssemblyMessage({ type: 'assemblyDraft', identity: digest, revision: 1, draft, extra: true }, base, source), 'extra message fields must fail closed');
assert(!workspace.validAssemblyMessage({ type: 'assemblyDraft', identity: digest, revision: 0, draft }, base, source), 'non-positive draft revisions must fail closed');
assert(!workspace.validAssemblyMessage({ type: 'assemblyDraft', identity: digest, revision: 1, draft: { ...draft, selected: [99] } }, base, source), 'selection outside the exact Source archive must fail closed');
assert(!workspace.validAssemblyMessage({ type: 'build', identity: digest, revision: 1, operations: [] }, base, source), 'an empty build cannot reach the package route');
assert(!workspace.validAssemblyMessage({ type: 'build', identity: digest, revision: 1, operations: [{ ...operation, targetGroup: 999 }] }, base, source), 'a forged Destination group must fail closed');
assert(!workspace.validAssemblyMessage({ type: 'resolveAssemblyTransfer', transferIdentity: digest }, base, source, null), 'Transfer actions require the exact active reviewed seed');

(async () => {
  let current = true;
  const pending = workspace.createAssemblyPackage(base, source, [operation], { checkCurrent: () => current });
  await new Promise(resolve => setImmediate(resolve));
  current = false;
  picker.resolve([{ fsPath: path.resolve('reviewed-output') }]);
  await assert.rejects(pending, /sources or the assembly plan changed/);
  assert.strictEqual(writes.length, 0, 'a stale folder-picker result must not create a package');
  assert.strictEqual(builds.length, 0, 'a stale folder-picker result must not create build files');

  let checks = 0;
  vscode.window.showOpenDialog = async () => [{ fsPath: path.resolve('reviewed-output-2') }];
  await assert.rejects(
    workspace.createAssemblyPackage(base, source, [operation], { checkCurrent: () => ++checks < 3 }),
    /sources or the assembly plan changed/,
    'authority must be checked again immediately before the transactional write'
  );
  assert.strictEqual(checks, 3);
  assert.strictEqual(writes.length, 0);
  assert.strictEqual(builds.length, 0);
  console.log('SFF Assembly exact message admission and stale package-picker authority passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
