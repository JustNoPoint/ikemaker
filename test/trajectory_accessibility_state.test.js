'use strict';

const assert = require('assert');
const Module = require('module');
const vscode = {
  commands: { registerCommand() { return { dispose() {} }; }, executeCommand: async () => undefined },
  window: { activeTextEditor: null, visibleTextEditors: [], showInformationMessage() {}, showWarningMessage() {} },
  workspace: { textDocuments: [], onDidChangeTextDocument: () => ({ dispose() {} }), onDidCloseTextDocument: () => ({ dispose() {} }) },
  env: { clipboard: { writeText: async () => undefined } },
  Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }) },
  ViewColumn: { Active: 1 }
};
const original = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
const workspace = require('../src/trajectory_workspace');
const { createTrajectoryContextAdapter } = require('../src/trajectory_context_adapters');
Module._load = original;

const base = { pending: false, previewAvailable: true, tick: 10, maximum: 60, ghostCount: 8, proposalValid: true, hasCode: true, sourceReady: true, canRecheck: true, hasAuthority: true, hasTarget: true };
let state = workspace.trajectoryControlAvailability(base);
for (const id of ['previous','next','play','playhead','fit','ghostTick','previewSettings','copy','source','recheck','insert']) assert.strictEqual(state[id].disabled, false, `${id} should be available in a fully reviewed state`);

state = workspace.trajectoryControlAvailability({ ...base, tick: 0 });
assert.strictEqual(state.previous.disabled, true);
assert.match(state.previous.reason, /first trajectory tick/i);
state = workspace.trajectoryControlAvailability({ ...base, tick: 60 });
assert.strictEqual(state.next.disabled, true);
assert.match(state.next.reason, /final trajectory tick/i);
state = workspace.trajectoryControlAvailability({ ...base, pending: true });
for (const id of ['previous','next','playhead','fit','ghostTick','previewSettings']) { assert.strictEqual(state[id].disabled, true); assert.match(state[id].reason, /wait for the current trajectory preview/i); }
state = workspace.trajectoryControlAvailability({ ...base, previewAvailable: false, ghostCount: 0 });
for (const id of ['previous','next','play','playhead','fit','ghostTick']) assert.match(state[id].reason, /valid trajectory preview/i);
state = workspace.trajectoryControlAvailability({ ...base, ghostCount: 0 });
assert.strictEqual(state.ghostTick.disabled, true);
assert.match(state.ghostTick.reason, /increase Ghosts/i);
state = workspace.trajectoryControlAvailability({ ...base, proposalValid: false, hasCode: false, sourceReady: false, canRecheck: false, recheckReason: 'Open an assigned source.', hasAuthority: false, hasTarget: false });
assert.match(state.copy.reason, /resolve the reported trajectory issues/i);
assert.match(state.source.reason, /recheck an assigned native source cursor/i);
assert.strictEqual(state.recheck.reason, 'Open an assigned source.');
assert.match(state.insert.reason, /resolve the reported trajectory issues/i);
state = workspace.trajectoryControlAvailability({ ...base, hasAuthority: false, hasTarget: false });
assert.match(state.insert.reason, /recheck an assigned native source cursor/i);

const adapter = createTrajectoryContextAdapter({ kind: 'spatial', id: 'spatial:a11y', target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' }, mutation: { allowed: true, resolverId: 'trajectory.exact-cursor', owner: 'trajectory-workspace-host' } });
const owner = { plan: workspace.initialPlan(adapter), adapter, outputLanguage: 'zss', generation: 1, contextRevision: 1, capture: null, snapshot: null, tick: 0, pathSampleCount: 61, ghostCount: 8, ghostOpacity: 0.35 };
const model = workspace.project(owner), html = workspace.page(model, workspace.toolbarModel(owner));
assert.strictEqual(model.recheck.available, false, 'recheck must fail closed without an assigned character source');
assert.match(model.recheck.reason, /assigned character state source/i);
for (const contract of ['role="group" aria-label="Trajectory parameters"','role="toolbar" aria-label="Trajectory preview controls"','id="issues" role="status" aria-live="polite"','id="code" tabindex="0" aria-label="Generated trajectory controller"','trajectoryControlAvailability=','function refreshControlAvailability()','setAttribute(\'aria-description\',reason)','pending=true;refreshControlAvailability()']) assert(html.includes(contract), `missing generated client accessibility contract: ${contract}`);
assert(!html.includes("$('insert').disabled=!model.authority"), 'insert availability must be owned by the actionable state helper');

console.log('Orbit Assist actionable states, semantic regions, and generated-client refresh wiring passed');
