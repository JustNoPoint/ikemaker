'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-storyboard-create-'));
const saveAnswers = [], openAnswers = [], quickAnswers = [], inputAnswers = [], reviewAnswers = [], informationAnswers = [], warningAnswers = [];
const opened = [], information = [], warnings = [], errors = [];
const quickPickCalls = [];
const textDocuments = [];
const commands = new Map();
let openFailure = null, openReturnsNoPanel = false, warningHook = null;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showOpenDialog: async () => openAnswers.shift(),
    showQuickPick: async (items, options) => { quickPickCalls.push({ items, options }); return quickAnswers.shift(); },
    showInputBox: async () => inputAnswers.shift(),
    showInformationMessage: async (message, options) => {
      if (options && options.modal) return reviewAnswers.shift();
      information.push(message);
      return informationAnswers.shift();
    },
    showWarningMessage: async (message, options) => { warnings.push(message); if (options && options.modal && warningHook) warningHook(); return options && options.modal ? warningAnswers.shift() : undefined; },
    showErrorMessage: async message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }], textDocuments,
    getConfiguration: () => ({ get: (key, fallback) => key === 'authorName' ? 'Storyboard Tester' : fallback })
  },
  commands: { registerCommand: (id, handler) => { commands.set(id, handler); return { dispose() {} }; }, executeCommand: async (id, ...args) => commands.get(id)?.(...args) },
  ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './stage_workspace') return { openStageWorkspace: async () => undefined };
  if (request === './screenpack_workspace') return { openUiWorkspace: async () => undefined };
  if (request === './storyboard_workspace') return { openStoryboardWorkspace: async target => { if (openFailure) throw openFailure; if (openReturnsNoPanel) return undefined; opened.push(target.fsPath); return { filename: target.fsPath }; } };
  if (request === './air_viewer') return { openAirPreview: async () => undefined };
  return originalLoad.call(this, request, parent, main);
};

function visibleWorkspaceFiles() {
  return fs.readdirSync(root).filter(name => /\.(?:def|sff)$/i.test(name)).sort();
}

(async () => {
  try {
    const { createStoryboard, assignCreatedStoryboard, registerAssetCreation } = require('../src/asset_creation');
    const { creationPlan } = require('../src/authoring_creation_plan');
    registerAssetCreation({ subscriptions: [] });

    quickAnswers.push(undefined);
    assert.deepStrictEqual(await createStoryboard(), { created: false, cancelled: true, step: 'type' });
    const typeChoices = quickPickCalls.at(-1).items;
    assert.match(typeChoices.find(item => item.value === 'opening').description, /character DEF.*\[Arcade\].*intro\.storyboard/);
    assert.match(typeChoices.find(item => item.value === 'credits').description, /system\.def.*\[End Credits\].*storyboard/);
    assert.match(typeChoices.find(item => item.value === 'loading').description, /system\.def.*\[VS Screen\].*loading\.storyboard/);
    assert.match(typeChoices.find(item => item.value === 'interstitial').description, /no single automatic DEF assignment target/i);
    assert.doesNotMatch(typeChoices.find(item => item.value === 'interstitial').description, /screenpack|Story Mode/i, 'standalone interstitial guidance does not invent an assignment owner');
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling the storyboard type creates no connected files');

    saveAnswers.push(undefined);
    assert.deepStrictEqual(await createStoryboard('opening'), { created: false, cancelled: true, step: 'destination', type: 'opening' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling the destination creates no storyboard DEF or SFF');

    saveAnswers.push(uri(path.join(root, 'Canvas_Cancel.def'))); quickAnswers.push(undefined);
    assert.deepStrictEqual(await createStoryboard('credits'), { created: false, cancelled: true, step: 'canvas', type: 'credits' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling the canvas profile creates no connected files');

    saveAnswers.push(uri(path.join(root, 'Custom_Cancel.def'))); quickAnswers.push({ value: 'custom' }); inputAnswers.push(undefined);
    assert.deepStrictEqual(await createStoryboard('ending'), { created: false, cancelled: true, step: 'canvas', type: 'ending' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'canceling custom coordinates creates no connected files');

    saveAnswers.push(uri(path.join(root, 'Review_Cancel.def'))); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push(undefined);
    assert.deepStrictEqual(await createStoryboard('logo'), { created: false, cancelled: true, step: 'review', type: 'logo' });
    assert.deepStrictEqual(visibleWorkspaceFiles(), [], 'declining the final review creates no connected files');

    const target = path.join(root, 'Exact_Credits.def'), expected = creationPlan('storyboard', target, { type: 'credits', localCoord: [640, 480], author: 'Storyboard Tester' });
    saveAnswers.push(uri(target)); quickAnswers.push({ value: 'wide', localcoord: [640, 480] }); reviewAnswers.push('Create Workspace');
    const created = await createStoryboard('credits');
    assert.deepStrictEqual(created, { created: true, opened: true, filename: target, sffPath: path.join(root, 'Exact_Credits.sff'), type: 'credits', localCoord: [640, 480] });
    for (const file of expected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content), `${file.role} bytes match the reviewed plan`);
    assert.deepStrictEqual(opened, [target], 'completion returns to the exact newly created Storyboard Workspace owner');
    assert(information.at(-1).includes(target) && information.at(-1).includes(path.join(root, 'Exact_Credits.sff')) && /open in Storyboard Workspace/i.test(information.at(-1)) && /no character, stage, screenpack, or project files/i.test(information.at(-1)), 'completion names exact outputs, return route, and bounded side effects');

    const customTarget = path.join(root, 'Custom_854x480.def'), customExpected = creationPlan('storyboard', customTarget, { type: 'ending', localCoord: [854, 480], author: 'Storyboard Tester' });
    saveAnswers.push(uri(customTarget)); quickAnswers.push({ value: 'custom' }); inputAnswers.push('854,480'); reviewAnswers.push('Create Workspace');
    const customCreated = await createStoryboard('ending');
    assert.deepStrictEqual(customCreated, { created: true, opened: true, filename: customTarget, sffPath: path.join(root, 'Custom_854x480.sff'), type: 'ending', localCoord: [854, 480] });
    for (const file of customExpected.files) assert.deepStrictEqual(fs.readFileSync(file.filename), Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content), `custom-coordinate ${file.role} bytes match the reviewed plan`);
    assert.strictEqual(opened.at(-1), customTarget, 'custom-coordinate completion opens the exact created Storyboard Workspace owner');

    const conflictTarget = path.join(root, 'Conflict.def'), conflictSff = path.join(root, 'Conflict.sff'), originalSff = Buffer.from('existing storyboard sprites');
    fs.writeFileSync(conflictSff, originalSff);
    saveAnswers.push(uri(conflictTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
    const conflict = await createStoryboard('gameover');
    assert.strictEqual(conflict.created, false);
    assert.strictEqual(fs.existsSync(conflictTarget), false, 'a connected-file collision leaves no partial storyboard DEF');
    assert.deepStrictEqual(fs.readFileSync(conflictSff), originalSff, 'an existing connected SFF is never replaced');
    assert(errors.at(-1).includes(conflictTarget) && /No reviewed connected files were replaced/i.test(errors.at(-1)), 'collision guidance names destination and no-replacement result');

    const laterTarget = path.join(root, 'Open_Later.def');
    openFailure = new Error('Storyboard panel unavailable');
    saveAnswers.push(uri(laterTarget)); quickAnswers.push({ value: 'hd', localcoord: [1280, 720] }); reviewAnswers.push('Create Workspace');
    const openFailed = await createStoryboard('interstitial');
    assert.deepStrictEqual(openFailed, { created: true, opened: false, filename: laterTarget, sffPath: path.join(root, 'Open_Later.sff'), type: 'interstitial', localCoord: [1280, 720] });
    assert(fs.existsSync(laterTarget) && fs.existsSync(path.join(root, 'Open_Later.sff')), 'an editor-open failure preserves successfully created files');
    assert(warnings.at(-1).includes(laterTarget) && warnings.at(-1).includes(path.join(root, 'Open_Later.sff')) && /was created/i.test(warnings.at(-1)) && /could not open/i.test(warnings.at(-1)), 'open failure distinguishes saved outputs from failed return');

    const handledTarget = path.join(root, 'Handled_Open_Failure.def');
    openFailure = null; openReturnsNoPanel = true;
    saveAnswers.push(uri(handledTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
    const handledFailure = await createStoryboard('opening');
    assert.deepStrictEqual(handledFailure, { created: true, opened: false, filename: handledTarget, sffPath: path.join(root, 'Handled_Open_Failure.sff'), type: 'opening', localCoord: [320, 240] });
    assert(fs.existsSync(handledTarget) && fs.existsSync(path.join(root, 'Handled_Open_Failure.sff')), 'an opener that reports its own failure still preserves the committed files');
    assert(warnings.at(-1).includes(handledTarget) && /did not open/i.test(warnings.at(-1)), 'a resolved no-panel result is not misreported as an open workspace');

    openReturnsNoPanel = false;
    const owner = path.join(root, 'Assigned_Hero.def'), ownerBefore = '[Info]\nname = Assigned Hero\n\n[Arcade]\nintro.storyboard = old.def\n'; fs.writeFileSync(owner, ownerBefore);
    const assignedTarget = path.join(root, 'Assigned_Opening.def');
    saveAnswers.push(uri(assignedTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace'); informationAnswers.push('Assign Storyboard…'); openAnswers.push([uri(owner)]); warningAnswers.push('Assign Storyboard');
    const assigned = await createStoryboard('opening');
    assert.strictEqual(assigned.assignment.assigned, true); assert.strictEqual(assigned.assignment.changed, true); assert.strictEqual(assigned.assignment.ownerFilename, owner);
    assert(fs.readFileSync(owner, 'utf8').includes('intro.storyboard = Assigned_Opening.def'), 'the optional reviewed follow-up assigns the exact created opening in the selected character DEF');
    assert(!fs.readdirSync(root).some(name => /^\.Assigned_Hero\.def\..*\.(?:tmp|rollback)$/i.test(name)), 'a committed assignment leaves no transient recovery file behind');

    const dirtyOwner = path.join(root, 'Dirty_Hero.def'), dirtyBefore = '[Arcade]\nintro.storyboard = old.def\n'; fs.writeFileSync(dirtyOwner, dirtyBefore); textDocuments.push({ uri: uri(dirtyOwner), isDirty: true }); openAnswers.push([uri(dirtyOwner)]);
    const dirtyRejected = await assignCreatedStoryboard(assignedTarget, 'opening'); assert.strictEqual(dirtyRejected.assigned, false); assert.match(dirtyRejected.error, /Save or revert/); assert.strictEqual(fs.readFileSync(dirtyOwner, 'utf8'), dirtyBefore, 'an already-dirty native owner is never changed on disk'); textDocuments.length = 0;

    const duringOwner = path.join(root, 'During_Hero.def'), duringBefore = '[Arcade]\nintro.storyboard = old.def\n'; fs.writeFileSync(duringOwner, duringBefore); const duringDocument = { uri: uri(duringOwner), isDirty: false }; textDocuments.push(duringDocument); openAnswers.push([uri(duringOwner)]); warningAnswers.push('Assign Storyboard'); warningHook = () => { duringDocument.isDirty = true; };
    const duringRejected = await assignCreatedStoryboard(assignedTarget, 'opening'); warningHook = null; assert.strictEqual(duringRejected.assigned, false); assert.match(duringRejected.error, /gained unsaved changes/); assert.strictEqual(fs.readFileSync(duringOwner, 'utf8'), duringBefore, 'an owner that becomes dirty during modal review is never changed on disk'); textDocuments.length = 0;

    for (const [command, type, stem] of [['ikemen.storyboard.createOpening', 'opening', 'Command_Opening'], ['ikemen.storyboard.createEnding', 'ending', 'Command_Ending']]) {
      const commandTarget = path.join(root, `${stem}.def`);
      saveAnswers.push(uri(commandTarget)); quickAnswers.push({ value: 'standard', localcoord: [320, 240] }); reviewAnswers.push('Create Workspace');
      const commandResult = await vscode.commands.executeCommand(command);
      assert.strictEqual(commandResult.type, type, `${command} routes to the exact ${type} creator`);
      assert.strictEqual(commandResult.opened, true); assert.strictEqual(commandResult.filename, commandTarget);
      assert(fs.existsSync(commandTarget) && fs.existsSync(path.join(root, `${stem}.sff`)), `${command} creates and opens its reviewed connected pair`);
    }

    console.log('Storyboard create workflow proves type and picker cancellation, exact connected output, no-overwrite, owner return, open-failure guidance, optional reviewed assignment, and direct Opening/Ending command adapters');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
