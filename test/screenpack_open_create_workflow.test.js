'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-screenpack-create-'));
const saveAnswers = [], canvasAnswers = [], inputAnswers = [], reviewAnswers = [], information = [], warnings = [], errors = [], opened = [];
let openFailure = null;
let openResult = { kind: 'screenpack-panel' };
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  Uri: { file: uri, joinPath: (base, name) => uri(path.join(base.fsPath, name)) },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showQuickPick: async () => canvasAnswers.shift(),
    showInputBox: async () => inputAnswers.shift(),
    showInformationMessage: async (message, options) => {
      if (options && options.modal) return reviewAnswers.shift();
      information.push(message); return undefined;
    },
    showWarningMessage: message => { warnings.push(message); },
    showErrorMessage: message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (key, fallback) => key === 'authorName' ? 'Workflow Author' : fallback })
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
  QuickPickItemKind: { Separator: -1 }, ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './screenpack_workspace') return { openUiWorkspace: async target => { opened.push(target.fsPath); if (openFailure) throw openFailure; if (!openResult) errors.push('Could not open UI workspace: handled populate failure'); return openResult; } };
  if (request === './stage_workspace') return { openStageWorkspace: async () => undefined };
  if (request === './storyboard_workspace') return { openStoryboardWorkspace: async () => undefined };
  if (request === './air_viewer') return { openAirPreview: async () => undefined };
  return originalLoad.call(this, request, parent, main);
};

const creation = require('../src/asset_creation');
const { creationPlan } = require('../src/authoring_creation_plan');
Module._load = originalLoad;

function fileSnapshot(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true }).filter(item => fs.statSync(path.join(directory, item)).isFile()).sort();
}

async function successfulCreate(directory, openError = null, panelResult = { kind: 'screenpack-panel' }) {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'system.def');
  saveAnswers.push(uri(target));
  canvasAnswers.push({ value: '640x480', localcoord: [640, 480] });
  reviewAnswers.push('Create Workspace');
  openFailure = openError;
  openResult = panelResult;
  const result = await creation.createUi();
  openFailure = null;
  openResult = { kind: 'screenpack-panel' };
  return { target, result };
}

(async () => {
  const successDirectory = path.join(root, 'success');
  const { target, result } = await successfulCreate(successDirectory);
  const expected = creationPlan('screenpack', target, { localCoord: [640, 480], author: 'Workflow Author' });
  assert.deepStrictEqual(result, { created: true, opened: true, filename: target, files: expected.files.map(file => file.filename) });
  assert.deepStrictEqual(fileSnapshot(successDirectory), ['fight.def', 'fight.sff', 'system.def', 'system.sff']);
  for (const file of expected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.from(file.content), `${file.role} bytes must match the reviewed plan`);
  assert.strictEqual(opened.at(-1), target, 'the completed workflow opens the exact created system.def owner');
  assert(information.at(-1).includes(target) && expected.files.every(file => information.at(-1).includes(file.filename)), 'success guidance names the exact owner and every created destination');

  const customDirectory = path.join(root, 'custom-success'); fs.mkdirSync(customDirectory, { recursive: true });
  const customTarget = path.join(customDirectory, 'system.def'), customExpected = creationPlan('screenpack', customTarget, { localCoord: [854, 480], author: 'Workflow Author' });
  saveAnswers.push(uri(customTarget)); canvasAnswers.push({ value: 'custom' }); inputAnswers.push('854,480'); reviewAnswers.push('Create Workspace');
  const customResult = await creation.createUi();
  assert.deepStrictEqual(customResult, { created: true, opened: true, filename: customTarget, files: customExpected.files.map(file => file.filename) });
  for (const file of customExpected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.from(file.content), `custom-coordinate ${file.role} bytes match the reviewed plan`);
  assert.strictEqual(opened.at(-1), customTarget, 'custom-coordinate completion opens the exact created system.def owner');

  const cancelDestination = path.join(root, 'cancel-destination');
  saveAnswers.push(undefined);
  assert.deepStrictEqual(await creation.createUi(), { created: false, cancelled: true, step: 'destination' });
  assert.deepStrictEqual(fileSnapshot(cancelDestination), [], 'destination cancellation writes nothing');

  const cancelCanvas = path.join(root, 'cancel-canvas'), cancelCanvasTarget = path.join(cancelCanvas, 'system.def');
  saveAnswers.push(uri(cancelCanvasTarget)); canvasAnswers.push(undefined);
  assert.deepStrictEqual(await creation.createUi(), { created: false, cancelled: true, step: 'canvas' });
  assert.deepStrictEqual(fileSnapshot(cancelCanvas), [], 'canvas cancellation writes nothing');

  const cancelReview = path.join(root, 'cancel-review'), cancelReviewTarget = path.join(cancelReview, 'system.def');
  saveAnswers.push(uri(cancelReviewTarget)); canvasAnswers.push({ value: '320x240', localcoord: [320, 240] }); reviewAnswers.push(undefined);
  assert.deepStrictEqual(await creation.createUi(), { created: false, cancelled: true, step: 'review' });
  assert.deepStrictEqual(fileSnapshot(cancelReview), [], 'final review cancellation writes nothing');

  const existingDirectory = path.join(root, 'existing'); fs.mkdirSync(existingDirectory, { recursive: true });
  const existingTarget = path.join(existingDirectory, 'system.def'), original = Buffer.from('existing-screenpack-owner'); fs.writeFileSync(existingTarget, original);
  saveAnswers.push(uri(existingTarget)); canvasAnswers.push({ value: '320x240', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
  const existingResult = await creation.createUi();
  assert.strictEqual(existingResult.created, false); assert.deepStrictEqual(fs.readFileSync(existingTarget), original);
  assert.deepStrictEqual(fileSnapshot(existingDirectory), ['system.def'], 'an existing destination prevents every connected-file write');
  assert(errors.at(-1).includes(existingTarget), 'write failure guidance names the exact blocked destination');

  const recoveryDirectory = path.join(root, 'open-recovery');
  const recovery = await successfulCreate(recoveryDirectory, new Error('viewer unavailable'));
  assert.strictEqual(recovery.result.created, true); assert.strictEqual(recovery.result.opened, false);
  assert(warnings.at(-1).includes(recovery.target) && warnings.at(-1).includes('viewer unavailable'), 'post-write open failure distinguishes created bytes and names the exact recovery owner');
  assert.deepStrictEqual(fileSnapshot(recoveryDirectory), ['fight.def', 'fight.sff', 'system.def', 'system.sff'], 'opening failure never rolls back a successfully committed reviewed workspace');

  const handledDirectory = path.join(root, 'handled-open-failure'), errorsBeforeHandled = errors.length;
  const handled = await successfulCreate(handledDirectory, null, null);
  assert.strictEqual(handled.result.created, true); assert.strictEqual(handled.result.opened, false);
  assert.strictEqual(errors.length, errorsBeforeHandled + 1, 'the opener owns the single handled populate-error message');
  assert(warnings.at(-1).includes(handled.target) && !warnings.at(-1).includes('undefined'), 'resolved-empty opener recovery names system.def without inventing an error or reporting opened success');
  assert.deepStrictEqual(fileSnapshot(handledDirectory), ['fight.def', 'fight.sff', 'system.def', 'system.sff'], 'a handled panel failure preserves the exact committed connected files');

  console.log('Screenpack create workflow proves exact connected bytes, no-write cancellation/no-overwrite, exact owner return, and open-failure recovery');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
