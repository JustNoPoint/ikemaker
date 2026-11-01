'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-create-'));
const saveAnswers = [], openedText = [], openedPreview = [], information = [], warnings = [], errors = [];
let textFailure = null, previewFailure = null, previewUnavailable = false;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  QuickPickItemKind: { Separator: -1 },
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    showTextDocument: async target => { if (textFailure) throw textFailure; openedText.push(target.fsPath); return { document: { uri: target } }; },
    showInformationMessage: async message => { information.push(message); },
    showWarningMessage: async message => { warnings.push(message); },
    showErrorMessage: async message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
  },
  commands: { executeCommand: async () => undefined },
  ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './air_viewer') return { openAirPreview: async (target, options) => { if (previewFailure) throw previewFailure; if (previewUnavailable) return undefined; openedPreview.push({ filename: target.fsPath, options }); return true; } };
  return originalLoad.call(this, request, parent, main);
};

(async () => {
  try {
    const { createAir, airTemplate } = require('../src/asset_creation');

    saveAnswers.push(undefined);
    assert.deepStrictEqual(await createAir(), { created: false, cancelled: true });
    assert.deepStrictEqual(fs.readdirSync(root), [], 'canceling the AIR destination writes no file');

    const target = path.join(root, 'Exact.air');
    saveAnswers.push(uri(target));
    assert.deepStrictEqual(await createAir(), { created: true, filename: target, textOpened: true, previewOpened: true });
    assert.strictEqual(fs.readFileSync(target, 'utf8'), airTemplate(), 'the exact reviewed starter AIR bytes are written');
    assert.deepStrictEqual(openedText, [target], 'the exact new AIR opens in the text editor');
    assert.deepStrictEqual(openedPreview, [{ filename: target, options: { allowEmpty: true, preserveFocus: true } }], 'the same exact AIR opens in the visual viewer with empty-SFF-safe options');
    assert(information.at(-1).includes(target) && /text editor and visual AIR Viewer are open/i.test(information.at(-1)) && /No SFF, DEF, character, or other project files were created/i.test(information.at(-1)), 'completion names exact output, return routes, and unchanged scope');
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['Exact.air']);

    const original = Buffer.from('existing AIR must survive\n');
    fs.writeFileSync(target, original);
    saveAnswers.push(uri(target));
    const rejected = await createAir();
    assert.strictEqual(rejected.created, false);
    assert.strictEqual(Buffer.compare(fs.readFileSync(target), original), 0, 'an existing AIR is never overwritten');
    assert(errors.at(-1).includes(target) && /No existing AIR was replaced/i.test(errors.at(-1)), 'collision guidance names the exact preserved destination');

    const recoveryTarget = path.join(root, 'Preview_Later.air');
    previewFailure = new Error('viewer unavailable');
    saveAnswers.push(uri(recoveryTarget));
    assert.deepStrictEqual(await createAir(), { created: true, filename: recoveryTarget, textOpened: true, previewOpened: false });
    assert.strictEqual(fs.readFileSync(recoveryTarget, 'utf8'), airTemplate(), 'viewer-open failure never rolls back committed AIR bytes');
    assert(warnings.at(-1).includes(recoveryTarget) && /AIR file was kept/i.test(warnings.at(-1)) && /without recreating/i.test(warnings.at(-1)), 'post-write preview failure gives an exact reopen route without misreporting creation failure');

    previewFailure = null;
    previewUnavailable = true;
    const blockedTarget = path.join(root, 'Viewer_Blocked.air');
    saveAnswers.push(uri(blockedTarget));
    assert.deepStrictEqual(await createAir(), { created: true, filename: blockedTarget, textOpened: true, previewOpened: false });
    assert.strictEqual(fs.readFileSync(blockedTarget, 'utf8'), airTemplate(), 'a viewer route that resolves without opening never changes committed AIR bytes');
    assert(warnings.at(-1).includes(blockedTarget) && /AIR Viewer did not open/i.test(warnings.at(-1)), 'a resolved no-panel result is not falsely reported as an open visual workspace');

    console.log('AIR creation proves cancellation, exact bytes, no-overwrite, text/viewer return, and post-write recovery');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
