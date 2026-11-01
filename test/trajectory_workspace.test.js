'use strict';

const assert = require('assert');
const Module = require('module');
const commands = new Map();
const vscode = {
  commands: { registerCommand(id, handler) { commands.set(id, handler); return { dispose() {} }; }, executeCommand: async () => undefined },
  window: { activeTextEditor: null, visibleTextEditors: [], showInformationMessage() {}, showWarningMessage() {}, ViewColumn: { Active: 1 } },
  workspace: { textDocuments: [], onDidChangeTextDocument: () => ({ dispose() {} }), onDidCloseTextDocument: () => ({ dispose() {} }), openTextDocument: async () => null },
  env: { clipboard: { writeText: async () => undefined } }, Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }) }, ViewColumn: { Active: 1 }
};
const original = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
const workspace = require('../src/trajectory_workspace');
Module._load = original;
const { createTrajectoryContextAdapter } = require('../src/trajectory_context_adapters');

const plan = workspace.defaultPlan('zss');
assert.strictEqual(plan.engine.baseline, true);
assert.strictEqual(plan.runtimeEvidence, 'physical-pending');
const adapter = createTrajectoryContextAdapter({ kind: 'spatial', id: 'spatial:test', target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' }, mutation: { allowed: true, resolverId: 'trajectory.exact-cursor', owner: 'trajectory-workspace-host' } });
const owner = { plan, adapter, outputLanguage: 'zss', generation: 2, contextRevision: 1, capture: null, snapshot: null, tick: 0, pathSampleCount: 61, ghostCount: 8, ghostOpacity: 0.4 };
const model = workspace.project(owner);
assert.strictEqual(model.proposal.valid, true);
assert.strictEqual(model.preview.available, true);
assert.match(model.proposal.code, /posSet/);
const stageAdapter = createTrajectoryContextAdapter({ kind: 'stage', id: 'stage:test', target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' } });
const stagePlan = workspace.initialPlan(stageAdapter);
assert.strictEqual(stagePlan.coordinateSpace, 'stage');
assert.strictEqual(stagePlan.owner.kind, 'stage-point');
assert.throws(() => workspace.normalizeAdapterPlan({ ...stagePlan, coordinateSpace: 'owner-relative', owner: { kind: 'root', reviewed: true } }, stageAdapter), /not available/);
const screenpackAdapter = createTrajectoryContextAdapter({ kind: 'screenpack', id: 'screenpack:test', target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' } });
const screenpackPlan = workspace.initialPlan(screenpackAdapter);
assert.strictEqual(screenpackPlan.coordinateSpace, 'screen');
assert.strictEqual(screenpackPlan.owner.kind, 'screen');
const html = workspace.page ? workspace.page(model, workspace.toolbarModel(owner)) : '';
if (html) {
  assert.match(html, /Orbit Assist/);
  assert.match(html, /id="previous"/);
  assert.match(html, /id="playhead"/);
  assert.match(html, /id="next"/);
  assert.match(html, /Ghosts/);
  assert.match(html, /aria-label="Orbit path preview/);
  assert.match(html, /id="ghostTick"/);
  assert.doesNotMatch(html, /\beval\s*\(/);
}

assert.strictEqual(workspace.validMessage({ type: 'recheck' }), true);
assert.strictEqual(workspace.validMessage({ type: 'recheck', filename: 'forged.zss' }), false);
assert.strictEqual(workspace.validMessage({ type: 'copyProposal', code: 'forged' }), false);
assert.strictEqual(workspace.validMessage({ type: 'updatePlan', plan: {}, outputLanguage: 'zss', source: 'forged' }), false);
assert.strictEqual(workspace.validMessage({ type: 'preview', tick: 0, pathSampleCount: 120, ghostCount: 12, ghostOpacity: 0.35, projection: {} }), true);
assert.strictEqual(workspace.validMessage({ type: 'preview', tick: 0, plan: {} }), false);

const context = { subscriptions: [] };
workspace.registerTrajectoryWorkspace(context);
assert(commands.has('ikemen.trajectory.openAssist'));
assert.strictEqual(context.subscriptions.length, 1);
console.log('Orbit Assist workspace exposes cohesive preview controls and host-owned proposal/source authority');
