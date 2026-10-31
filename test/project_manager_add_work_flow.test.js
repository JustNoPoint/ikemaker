'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const registryModel = require('../src/project_registry');

const originalLoad = Module._load;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-manager-add-work-'));
const registryDirectory = path.join(root, '.ikemen');
const registryFile = path.join(registryDirectory, 'project-registry.json');
fs.mkdirSync(registryDirectory, { recursive: true });
const initialRegistry = registryModel.normalize({
  projects: [{ id: 'game', name: 'Test Game' }],
  teams: [{ id: 'team', name: 'Test Team' }]
});
fs.writeFileSync(registryFile, `${JSON.stringify(initialRegistry, null, 2)}\n`);

let receiver = null;
let inputAnswers = [];
let quickAnswers = [];
let folderAnswers = [];
const writes = [];
const messages = [];
const sessions = new Map();
const panel = {
  title: '',
  reveal() {},
  dispose() {},
  onDidDispose() {},
  webview: {
    cspSource: 'test:',
    options: {},
    html: '',
    postMessage: async message => { messages.push(message); return true; },
    onDidReceiveMessage: callback => { receiver = callback; return { dispose() {} }; }
  }
};
const vscode = {
  ViewColumn: { Active: 1, Beside: 2 },
  Uri: { file: fsPath => ({ fsPath }) },
  window: {
    createWebviewPanel: () => panel,
    showInputBox: async () => inputAnswers.shift(),
    showQuickPick: async (items, options) => {
      const answer = quickAnswers.shift();
      return typeof answer === 'function' ? answer(items, options) : answer;
    },
    showOpenDialog: async () => folderAnswers.shift(),
    showErrorMessage: async message => { throw new Error(`Unexpected Project Manager error: ${message}`); },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showTextDocument: async () => undefined
  },
  workspace: { openTextDocument: async () => ({}) },
  commands: { executeCommand: async () => undefined }
};
const projectContext = {
  readRegistry() {
    const raw = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    return { filename: registryFile, registry: registryModel.normalize(raw), issues: [] };
  },
  writeRegistry(filename, registry, label, expectedHash) {
    assert.strictEqual(filename, registryFile, 'the exact open registry remains the write destination');
    assert(expectedHash, 'the real manager handler carries its optimistic source hash to the write boundary');
    writes.push({ filename, label, registry: registryModel.normalize(registry) });
    fs.writeFileSync(filename, `${JSON.stringify(registry, null, 2)}\n`);
  },
  contextRoot() { return ''; },
  workspaceRoot() { return ''; },
  activeUri() { return undefined; }
};

Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './project_context_ui') return projectContext;
  if (request === './viewer_group') return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './viewer_sessions') return {
    has: value => [...sessions.values()].includes(value),
    register: (value, filename, kind) => sessions.set(`${path.resolve(filename).toLowerCase()}|${kind}`, value),
    updateSource: () => {},
    find: (filename, kind) => sessions.get(`${path.resolve(filename).toLowerCase()}|${kind}`)
  };
  if (request === './viewer_close') return { support() {}, prepare: async () => true };
  if (request === './webview_policy') return { protect: value => value };
  return originalLoad.call(this, request, parent, main);
};

function chooseValue(value) { return items => items.find(item => item.value === value); }
function chooseEmpty(items) { return items[0]; }
function fileInventory() {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute); else files.push(path.relative(root, absolute).replace(/\\/g, '/'));
    }
  };
  visit(root);
  return files.sort();
}
async function invokeAddWork() {
  const generation = panel.ikemenProjectManagerGeneration;
  await receiver({ type: 'addWork', generation, focus: { action: 'addWork', view: 'work' } });
}
async function expectCancelled(label, setup) {
  const beforeBytes = fs.readFileSync(registryFile);
  const beforeFiles = fileInventory();
  const beforeWrites = writes.length;
  inputAnswers = [];
  quickAnswers = [];
  folderAnswers = [];
  setup();
  await invokeAddWork();
  assert.deepStrictEqual(fs.readFileSync(registryFile), beforeBytes, `${label} must leave registry bytes unchanged`);
  assert.deepStrictEqual(fileInventory(), beforeFiles, `${label} must create no character, stage, screenpack, asset, or registry side file`);
  assert.strictEqual(writes.length, beforeWrites, `${label} must not reach the registry write boundary`);
}

(async () => {
  try {
    const workspace = require('../src/project_manager_workspace');
    await workspace.openProjectManager({ fsPath: registryFile }, 'work');
    assert(receiver, 'opening the real Project Manager installs its message receiver');

    await expectCancelled('name cancellation', () => { inputAnswers = [undefined]; });
    await expectCancelled('type cancellation', () => { inputAnswers = ['Cancelled Type']; quickAnswers = [undefined]; });
    await expectCancelled('folder-choice cancellation', () => { inputAnswers = ['Cancelled Folder']; quickAnswers = [chooseValue('character'), undefined]; });
    await expectCancelled('browse-folder cancellation', () => { inputAnswers = ['Cancelled Browse']; quickAnswers = [chooseValue('character'), chooseValue('browse')]; folderAnswers = [undefined]; });
    await expectCancelled('optional game picker cancellation', () => { inputAnswers = ['Cancelled Game']; quickAnswers = [chooseValue('character'), chooseValue('none'), undefined]; });
    await expectCancelled('optional team picker cancellation', () => { inputAnswers = ['Cancelled Team']; quickAnswers = [chooseValue('character'), chooseValue('none'), chooseEmpty, undefined]; });

    inputAnswers = ['Hero Work'];
    quickAnswers = [chooseValue('character'), chooseValue('none'), chooseEmpty, chooseEmpty];
    const beforeFiles = fileInventory();
    await invokeAddWork();
    assert.strictEqual(writes.length, 1, 'a completed Add Work flow performs exactly one registry write');
    assert.strictEqual(writes[0].label, 'add-work-project');
    const saved = registryModel.normalize(JSON.parse(fs.readFileSync(registryFile, 'utf8')));
    const created = saved.workProjects.find(item => item.id === 'hero-work');
    assert(created, 'the exact registry contains the newly created work-project entry');
    assert.deepStrictEqual(
      { name: created.name, type: created.type, root: created.root, gameId: created.gameId, teamId: created.teamId },
      { name: 'Hero Work', type: 'character', root: '', gameId: '', teamId: '' },
      'the explicit No game / No team choices remain valid unassigned values rather than cancellation'
    );
    assert.deepStrictEqual(fileInventory(), beforeFiles, 'successful registry creation changes no character, stage, screenpack, or asset files');
    assert(panel.webview.html.includes(`Created work-project entry “Hero Work” (hero-work) in ${registryFile}.`), 'the existing live status names the exact created entry and registry destination');
    assert(panel.webview.html.includes('No character, stage, screenpack, or asset files were created or moved.'), 'success guidance distinguishes registry metadata from authored assets');
    assert(panel.webview.html.includes('"defaultView":"work"'), 'the refreshed manager returns to the Work Projects section');
    assert(panel.webview.html.includes('"action":"addWork"'), 'the refreshed manager retains the initiating Add Work focus route');
    assert(messages.some(message => message.type === 'projectManagerBusy' && message.busy), 'the real flow exposes its pending state');
    console.log('Project Manager Add Work cancellation, exact registry output, unassigned choices, destination guidance, and return passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
