'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
let answers = [], buildCalls = [];
const vscode = { window: {
  showQuickPick: async () => answers.shift(),
  showOpenDialog: async () => answers.shift(),
  showInputBox: async () => answers.shift(),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined
} };
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_commands' && /artist_intake_workspace/.test(parent.filename)) return { createBuildPackage: async (options) => { buildCalls.push(options); return {}; } };
  return originalLoad.call(this, request, parent, main);
};
const workspace = require('../src/artist_intake_workspace');
Module._load = originalLoad;

// Exercise the actual generated client with the browser's reserved window.name.
const elements = new Map(), messages = [], listeners = {};
const element = (id) => { if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', insertBefore() {} }); return elements.get(id); };
const document = { getElementById: element, querySelectorAll: () => [], querySelector: () => element('header'), createElement: () => ({}) };
const context = { document, name: 'reserved window name', acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }), addEventListener: (type, callback) => { (listeners[type] ||= []).push(callback); } };
for (const id of ['category', 'group', 'start', 'axisX', 'axisY']) context[id] = element(id);
const model = { frames: [], sourceFiles: [] };
vm.runInNewContext(workspace.html(model).match(/<script>([\s\S]*)<\/script>/)[1], context);
listeners.message.forEach(callback => callback({ data: { type: 'model', model: { frames: [{ sourceLabel: 'frame.png', uri: '', duplicateOf: null }] } } }));
element('category').value = 'Special';
element('category').onchange();
assert.strictEqual(element('name').value, 'Special 00');
element('name').value = 'Custom sequence';
element('assign').onclick();
element('package').onclick();
assert.strictEqual(messages.at(-1).assignments[0].name, 'Custom sequence');
assert.strictEqual(context.name, 'reserved window name');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-intake-regression-'));
  const source = path.join(root, 'source.png');
  fs.writeFileSync(source, 'disposable source fixture');
  const input = { sourceFiles: [source], artistSource: 'source.png', sourceType: 'folder', frames: [{ filename: source }] };
  const assignments = [{ indices: [0], category: 'Special', name: 'Custom sequence', group: 1000, startIndex: 0, axisX: 0, axisY: 0 }];
  try {
    for (const sequence of [[undefined], [{ shared: true }, undefined], [{ shared: false }, undefined], [{ shared: false }, [{ fsPath: root }], undefined]]) {
      answers = sequence.slice();
      await workspace.createPackage(input, assignments);
      assert.deepStrictEqual(fs.readdirSync(root), ['source.png']);
      assert.strictEqual(buildCalls.length, 0);
    }
    answers = [{ shared: true }, [{ fsPath: source }]];
    await assert.rejects(workspace.createPackage(input, assignments), /must be indexed/);
    assert.deepStrictEqual(fs.readdirSync(root), ['source.png']);
    assert.strictEqual(buildCalls.length, 0);
    fs.writeFileSync(source, require('../src/sff_reader').rgbaPng(1, 1, Buffer.from([255, 0, 0, 255])));
    answers = [{ shared: true }, [{ fsPath: source }]];
    await assert.rejects(workspace.createPackage(input, assignments), /must be indexed/);
    assert.deepStrictEqual(fs.readdirSync(root), ['source.png']);
    assert.strictEqual(buildCalls.length, 0);
    answers = [{ shared: false }, [{ fsPath: root }], 'review'];
    await workspace.createPackage(input, assignments);
    assert.strictEqual(buildCalls.length, 1);
    const info = JSON.parse(fs.readFileSync(path.join(root, 'review-intake', 'artist-intake.json'), 'utf8'));
    assert.deepStrictEqual(info.sourceFiles, ['source.png']);
    assert.strictEqual(info.assignments[0].name, 'Custom sequence');
    assert.strictEqual(info.palettePolicy, 'SOURCE_PNG_PALETTES');
    console.log('Artist Intake client naming and package cancellation tests passed');
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(root).startsWith('ikemaker-intake-regression-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
