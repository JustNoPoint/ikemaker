'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-create-'));
const quickAnswers = [], saveAnswers = [], opened = [], information = [], warnings = [], errors = [];
let openFailure = null;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  QuickPickItemKind: { Separator: -1 },
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  window: {
    activeTextEditor: null,
    showQuickPick: async items => { const answer = quickAnswers.shift(); if (typeof answer === 'string') return items.find(item => item.value === answer); return answer; },
    showSaveDialog: async () => saveAnswers.shift(),
    showInputBox: async () => undefined,
    showTextDocument: async () => undefined,
    showInformationMessage: async message => { information.push(message); },
    showWarningMessage: async message => { warnings.push(message); },
    showErrorMessage: async message => { errors.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(root) }],
    getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
  },
  commands: {
    executeCommand: async (...args) => { if (openFailure) throw openFailure; opened.push(args); }
  },
  ConfigurationTarget: { Workspace: 2 }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, main);
};

(async () => {
  try {
    const { createSff } = require('../src/asset_creation');
    const { blankSff } = require('../src/asset_templates');

    quickAnswers.push(undefined);
    assert.deepStrictEqual(await createSff(), { created: false, cancelled: true, step: 'format' });
    assert.deepStrictEqual(fs.readdirSync(root), [], 'canceling the SFF format creates no archive');

    quickAnswers.push('2.1'); saveAnswers.push(undefined);
    assert.deepStrictEqual(await createSff(), { created: false, cancelled: true, step: 'destination' });
    assert.deepStrictEqual(fs.readdirSync(root), [], 'canceling the destination after choosing a format creates no archive');

    const v21 = path.join(root, 'Exact-2.1.sff');
    quickAnswers.push('2.1'); saveAnswers.push(uri(v21));
    assert.deepStrictEqual(await createSff(), { created: true, opened: true, filename: v21, version: '2.1' });
    assert(fs.readFileSync(v21).equals(blankSff('2.1')), 'SFF 2.1 creation writes the exact reviewed empty archive bytes');
    assert.deepStrictEqual(opened.at(-1), ['vscode.openWith', uri(v21), 'ikemen.sffWorkspace', { preview: false }], 'the exact new archive returns to its SFF Workspace');
    assert(information.at(-1).includes(v21) && /structurally valid and empty/i.test(information.at(-1)) && /no sprites, palettes, AIR, DEF, character, or project files/i.test(information.at(-1)), 'completion names the exact destination, empty state, unchanged scope, and next intake path');

    const existing = Buffer.from('existing SFF must survive');
    fs.writeFileSync(v21, existing);
    quickAnswers.push('2.1'); saveAnswers.push(uri(v21));
    const collision = await createSff();
    assert.strictEqual(collision.created, false);
    assert(fs.readFileSync(v21).equals(existing), 'an existing SFF destination is never overwritten');
    assert(errors.at(-1).includes(v21) && /No existing SFF was replaced/i.test(errors.at(-1)), 'collision guidance names the exact preserved destination');

    const v20 = path.join(root, 'Open-Later-2.0.sff');
    openFailure = new Error('workspace unavailable');
    quickAnswers.push('2.0'); saveAnswers.push(uri(v20));
    assert.deepStrictEqual(await createSff(), { created: true, opened: false, filename: v20, version: '2.0' });
    assert(fs.readFileSync(v20).equals(blankSff('2.0')), 'workspace-open failure preserves the exact committed SFF 2.0 bytes');
    assert(warnings.at(-1).includes(v20) && /empty archive was kept/i.test(warnings.at(-1)) && /without recreating/i.test(warnings.at(-1)), 'post-write open failure gives an exact recovery route without misreporting creation failure');

    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['Exact-2.1.sff', 'Open-Later-2.0.sff'], 'the representative creator writes only the two explicitly reviewed archive destinations');
    console.log('SFF archive creation proves format/destination cancellation, exact v2 bytes, no-overwrite, owner return, and open recovery');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
