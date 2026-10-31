'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-stage-create-'));
const saveAnswers = [], quickAnswers = [], inputAnswers = [], reviewAnswers = [];
const opened = [], information = [], warnings = [], errors = [];
let openFailure = null, openResult = { kind: 'stage-panel' }, resolvedOpenError = null;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showQuickPick: async () => quickAnswers.shift(),
    showInputBox: async () => inputAnswers.shift(),
    showInformationMessage: async (message, options) => {
      if (options && options.modal) return reviewAnswers.shift();
      information.push(message);
      return undefined;
    },
    showWarningMessage: async message => { warnings.push(message); },
    showErrorMessage: async message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (key, fallback) => key === 'authorName' ? 'Stage Tester' : fallback })
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
  ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './stage_workspace') return { openStageWorkspace: async target => { if (openFailure) throw openFailure; opened.push(target.fsPath); if (resolvedOpenError) errors.push(resolvedOpenError); return openResult; } };
  if (request === './screenpack_workspace') return { openUiWorkspace: async () => undefined };
  if (request === './storyboard_workspace') return { openStoryboardWorkspace: async () => undefined };
  if (request === './air_viewer') return { openAirPreview: async () => undefined };
  return originalLoad.call(this, request, parent, main);
};

function visibleWorkspaceFiles() {
  return fs.readdirSync(root).filter(name => /\.(?:def|sff)$/i.test(name)).sort();
}

(async () => {
  try {
    const { createStage } = require('../src/asset_creation');
    const { creationPlan } = require('../src/authoring_creation_plan');

    saveAnswers.push(undefined);
    assert.deepStrictEqual(await createStage(), { created: false, cancelled: true, step: 'destination' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling the stage destination creates no DEF or SFF');

    saveAnswers.push(uri(path.join(root, 'Canvas_Cancel.def'))); quickAnswers.push(undefined);
    assert.deepStrictEqual(await createStage(), { created: false, cancelled: true, step: 'canvas' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling the canvas profile creates no connected files');

    saveAnswers.push(uri(path.join(root, 'Custom_Cancel.def'))); quickAnswers.push({ value: 'custom' }); inputAnswers.push(undefined);
    assert.deepStrictEqual(await createStage(), { created: false, cancelled: true, step: 'canvas' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling custom canvas coordinates creates no connected files');

    saveAnswers.push(uri(path.join(root, 'Review_Cancel.def'))); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push(undefined);
    assert.deepStrictEqual(await createStage(), { created: false, cancelled: true, step: 'review' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'declining the final connected-file review creates no DEF or SFF');

    const customTarget = path.join(root, 'Custom_854x480.def'), customExpected = creationPlan('stage', customTarget, { localCoord: [854, 480], author: 'Stage Tester' });
    saveAnswers.push(uri(customTarget)); quickAnswers.push({ value: 'custom' }); inputAnswers.push('854,480'); reviewAnswers.push('Create Workspace');
    const customCreated = await createStage();
    assert.deepStrictEqual(customCreated, { created: true, opened: true, filename: customTarget, sffPath: path.join(root, 'Custom_854x480.sff'), localCoord: [854, 480] });
    for (const file of customExpected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content), `custom-coordinate ${file.role} bytes match the reviewed plan`);

    const target = path.join(root, 'Exact_Stage.def'), expected = creationPlan('stage', target, { localCoord: [640, 480], author: 'Stage Tester' });
    saveAnswers.push(uri(target)); quickAnswers.push({ value: 'wide', localcoord: [640, 480] }); reviewAnswers.push('Create Workspace');
    const created = await createStage();
    assert.deepStrictEqual(created, { created: true, opened: true, filename: target, sffPath: path.join(root, 'Exact_Stage.sff'), localCoord: [640, 480] });
    for (const file of expected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content), `${file.role} bytes match the reviewed creation plan`);
    assert.deepStrictEqual(opened, [customTarget, target], 'each completion returns to its exact newly created Stage Workspace owner');
    assert(information.at(-1).includes(target) && information.at(-1).includes(path.join(root, 'Exact_Stage.sff')) && /open in Stage Workspace/i.test(information.at(-1)) && /no character, screenpack, or project files/i.test(information.at(-1)), 'completion names both exact outputs, the open return route, and bounded side effects');

    const conflictTarget = path.join(root, 'Conflict.def'), conflictSff = path.join(root, 'Conflict.sff'), originalSff = Buffer.from('existing stage sprites');
    fs.writeFileSync(conflictSff, originalSff);
    saveAnswers.push(uri(conflictTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
    const conflict = await createStage();
    assert.strictEqual(conflict.created, false);
    assert.strictEqual(fs.existsSync(conflictTarget), false, 'a connected-file collision cannot leave a partial stage DEF');
    assert.deepStrictEqual(fs.readFileSync(conflictSff), originalSff, 'an existing connected SFF is never replaced');
    assert(errors.at(-1).includes(conflictTarget) && /No reviewed connected files were replaced/i.test(errors.at(-1)), 'collision guidance names the reviewed stage destination and no-replacement result');

    const unresolvedTarget = path.join(root, 'Resolved_Without_Panel.def'), errorsBeforeResolvedOpen = errors.length;
    openResult = undefined; resolvedOpenError = 'Could not open stage workspace: rendered panel failed';
    saveAnswers.push(uri(unresolvedTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
    const resolvedWithoutPanel = await createStage();
    assert.deepStrictEqual(resolvedWithoutPanel, { created: true, opened: false, filename: unresolvedTarget, sffPath: path.join(root, 'Resolved_Without_Panel.sff'), localCoord: [320, 240] });
    assert(fs.existsSync(unresolvedTarget) && fs.existsSync(path.join(root, 'Resolved_Without_Panel.sff')), 'a resolved-without-panel opener preserves the successfully created connected files');
    assert.strictEqual(errors.length, errorsBeforeResolvedOpen + 1, 'createStage does not add a duplicate error when the Stage opener already reported its resolved failure');
    assert(warnings.at(-1).includes(unresolvedTarget) && /did not open/i.test(warnings.at(-1)) && /Open that exact stage DEF/i.test(warnings.at(-1)), 'resolved opener failure gives an exact owner recovery route instead of claiming the panel opened');

    const laterTarget = path.join(root, 'Open_Later.def');
    openResult = { kind: 'stage-panel' }; resolvedOpenError = null;
    openFailure = new Error('Stage panel unavailable');
    saveAnswers.push(uri(laterTarget)); quickAnswers.push({ value: 'hd', localcoord: [1280, 720] }); reviewAnswers.push('Create Workspace');
    const openFailed = await createStage();
    assert.deepStrictEqual(openFailed, { created: true, opened: false, filename: laterTarget, sffPath: path.join(root, 'Open_Later.sff'), localCoord: [1280, 720] });
    assert(fs.existsSync(laterTarget) && fs.existsSync(path.join(root, 'Open_Later.sff')), 'an editor-open failure does not discard successfully created reviewed files');
    assert(warnings.at(-1).includes(laterTarget) && warnings.at(-1).includes(path.join(root, 'Open_Later.sff')) && /was created/i.test(warnings.at(-1)) && /could not open/i.test(warnings.at(-1)), 'open failure distinguishes saved outputs from the failed return route');

    console.log('Stage create workflow proves cancellation, exact connected outputs, no-overwrite, return, and open-failure guidance');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
