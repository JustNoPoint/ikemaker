'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-source-create-'));
const saveAnswers = [], pickAnswers = [], opened = [], information = [], warnings = [], errors = [];
let openFailure = null;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  QuickPickItemKind: { Separator: -1 },
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showQuickPick: async () => pickAnswers.shift(),
    showTextDocument: async target => { if (openFailure) throw openFailure; opened.push(target.fsPath); return { document: { uri: target } }; },
    showInformationMessage: async message => { information.push(message); },
    showWarningMessage: async message => { warnings.push(message); },
    showErrorMessage: async message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (_key, fallback) => fallback })
  },
  commands: { executeCommand: async () => undefined },
  ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, main);
};

(async () => {
  try {
    const { SOURCE_FILE_TYPES, createAnySourceFile, createSourceFile, sourceFileTemplate } = require('../src/asset_creation');

    saveAnswers.push(undefined);
    const cancelled = await createSourceFile('zss', 'New_Code.zss', 'ZSS state/code file');
    assert.deepStrictEqual(cancelled, { created: false, cancelled: true });
    assert.deepStrictEqual(fs.readdirSync(root), [], 'canceling the destination picker creates no file or mutation journal');

    const target = path.join(root, 'Exact_Code.zss');
    pickAnswers.push(SOURCE_FILE_TYPES.find(item => item.extension === 'zss'));
    saveAnswers.push(uri(target));
    const created = await createAnySourceFile();
    assert.deepStrictEqual(created, { created: true, opened: true, filename: target });
    assert.strictEqual(fs.readFileSync(target, 'utf8'), sourceFileTemplate('zss'), 'the exact selected source template is written byte-for-byte');
    assert.deepStrictEqual(opened, [target], 'completion opens the exact newly created source file');
    assert(information.at(-1).includes(target) && /open and ready to edit/i.test(information.at(-1)) && /no other project or asset files/i.test(information.at(-1)), 'completion names the exact destination, open return route, and bounded output scope');
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['Exact_Code.zss'], 'ordinary source creation writes only the reviewed destination');

    const originalBytes = Buffer.from('existing source must survive\n');
    fs.writeFileSync(target, originalBytes);
    saveAnswers.push(uri(target));
    const rejected = await createSourceFile('zss', 'New_Code.zss', 'ZSS state/code file');
    assert.strictEqual(rejected.created, false);
    assert.strictEqual(Buffer.compare(fs.readFileSync(target), originalBytes), 0, 'an existing destination is never overwritten');
    assert(/already exists and was not replaced/i.test(errors.at(-1)), 'the failure explains the no-overwrite policy and exact retry boundary');

    const createdButNotOpened = path.join(root, 'Open_Later.lua');
    openFailure = new Error('editor unavailable');
    saveAnswers.push(uri(createdButNotOpened));
    const openFailed = await createSourceFile('lua', 'New_Script.lua', 'Lua source file');
    assert.deepStrictEqual(openFailed, { created: true, opened: false, filename: createdButNotOpened });
    assert.strictEqual(fs.readFileSync(createdButNotOpened, 'utf8'), sourceFileTemplate('lua'));
    assert(warnings.at(-1).includes(createdButNotOpened) && /was created/i.test(warnings.at(-1)) && /could not open/i.test(warnings.at(-1)), 'post-write open failure never falsely reports that creation failed');

    const beforePickerCancel = new Set(fs.readdirSync(root));
    pickAnswers.push(undefined);
    assert.strictEqual(await createAnySourceFile(), undefined);
    assert.deepStrictEqual(new Set(fs.readdirSync(root)), beforePickerCancel, 'canceling the type picker creates no destination');

    openFailure = null;
    for (const type of SOURCE_FILE_TYPES) {
      const filename = path.join(root, `Provider_${type.extension}.${type.extension}`);
      saveAnswers.push(uri(filename));
      const result = await createSourceFile(type.extension, `New_${type.extension}.${type.extension}`, type.label);
      assert.deepStrictEqual(result, { created: true, opened: true, filename }, `${type.extension} provider reaches the shared reviewed writer and editor return`);
      assert.strictEqual(fs.readFileSync(filename, 'utf8'), sourceFileTemplate(type.extension), `${type.extension} provider writes its exact reviewed template`);
    }

    console.log('Every source provider proves exact output/editor return; shared creation proves no-write cancellation and no-overwrite');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
