'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const registryModel = require('../src/project_registry');
const mutationSafety = require('../src/mutation_safety');
const registryEvents = require('../src/project_registry_events');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-manager-real-registry-'));
const registryDirectory = path.join(root, '.ikemen');
const registryFile = path.join(registryDirectory, 'project-registry.json');
fs.mkdirSync(registryDirectory, { recursive: true });
const initialRegistry = registryModel.normalize({
  projects: [{ id: 'game', name: 'Assigned Game' }],
  teams: [{ id: 'team', name: 'Assigned Team' }]
});
fs.writeFileSync(registryFile, `${JSON.stringify(initialRegistry, null, 2)}\n`);

let receiver = null;
let inputAnswers = [];
let quickAnswers = [];
const messages = [];
const errors = [];
const transactionCalls = [];
const events = [];
const sessions = new Map();
const panel = {
  title: '', reveal() {}, dispose() {}, onDidDispose() {},
  webview: {
    cspSource: 'test:', options: {}, html: '',
    postMessage: async message => { messages.push(message); return true; },
    onDidReceiveMessage: callback => { receiver = callback; return { dispose() {} }; }
  }
};
const vscode = {
  ViewColumn: { Active: 1, Beside: 2 },
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  window: {
    activeTextEditor: null,
    tabGroups: { activeTabGroup: null, all: [] },
    visibleTextEditors: [],
    createWebviewPanel: () => panel,
    showInputBox: async () => inputAnswers.shift(),
    showQuickPick: async (items, options) => {
      const answer = quickAnswers.shift();
      return typeof answer === 'function' ? answer(items, options) : answer;
    },
    showOpenDialog: async () => undefined,
    showErrorMessage: async message => { errors.push(message); return undefined; },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showTextDocument: async () => undefined
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: root } }],
    getWorkspaceFolder: () => ({ uri: { fsPath: root } }),
    openTextDocument: async () => ({})
  },
  commands: { executeCommand: async () => undefined }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './mutation_safety' && /project_context_ui\.js$/i.test(parent?.filename || '')) {
    return {
      ...mutationSafety,
      transactionalWrite(fsModule, filename, content, options) {
        transactionCalls.push({ filename: path.resolve(filename), options: { ...options } });
        return mutationSafety.transactionalWrite(fsModule, filename, content, options);
      }
    };
  }
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
function chooseId(id) { return items => items.find(item => item.id === id); }
function inventory() {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(path.relative(root, absolute).replace(/\\/g, '/'));
    }
  };
  visit(root);
  return files.sort();
}
async function addAssignedWork(teamChoice) {
  inputAnswers = ['Assigned Hero'];
  quickAnswers = [chooseValue('character'), chooseValue('none'), chooseId('game'), teamChoice];
  const generation = panel.ikemenProjectManagerGeneration;
  await receiver({ type: 'addWork', generation, focus: { action: 'addWork', view: 'work' } });
}

(async () => {
  const subscription = registryEvents.onDidChangeProjectRegistry(event => events.push(event));
  try {
    const workspace = require('../src/project_manager_workspace');
    await workspace.openProjectManager({ fsPath: registryFile }, 'work');
    assert(receiver, 'the real Project Manager receiver is installed');

    const initialBytes = fs.readFileSync(registryFile);
    const initialHash = mutationSafety.hash(initialBytes);
    const initialFiles = inventory();
    await addAssignedWork(undefined);
    assert.deepStrictEqual(fs.readFileSync(registryFile), initialBytes, 'cancelling the final team/approval choice writes nothing');
    assert.deepStrictEqual(inventory(), initialFiles, 'cancelled approval creates no transient or persistent file');
    assert.strictEqual(transactionCalls.length, 0, 'cancelled approval never reaches the production writer');
    assert.strictEqual(events.length, 0, 'cancelled approval publishes no registry notification');

    await addAssignedWork(chooseId('team'));
    assert.strictEqual(transactionCalls.length, 1, 'approved Add Work reaches the production writer exactly once');
    assert.strictEqual(transactionCalls[0].filename, path.resolve(registryFile));
    assert.strictEqual(transactionCalls[0].options.label, 'add-work-project');
    assert.strictEqual(transactionCalls[0].options.expectedHash, initialHash, 'the receiver composes the exact loaded-byte hash into the production transaction');
    assert.strictEqual(transactionCalls[0].options.journal, undefined, 'Add Work does not request a persistent transaction journal or backup');
    const saved = registryModel.normalize(JSON.parse(fs.readFileSync(registryFile, 'utf8')));
    const created = saved.workProjects.find(item => item.id === 'assigned-hero');
    assert.deepStrictEqual(
      { name: created?.name, type: created?.type, root: created?.root, gameId: created?.gameId, teamId: created?.teamId },
      { name: 'Assigned Hero', type: 'character', root: '', gameId: 'game', teamId: 'team' },
      'the assigned game/team branches survive receiver composition and the real writer'
    );
    assert.deepStrictEqual(events, [{ filename: path.resolve(registryFile), reason: 'add-work-project' }], 'one successful production write publishes one exact registry notification');
    assert.deepStrictEqual(inventory(), ['.ikemen/project-registry.json'], 'success leaves no persistent automatic backup, journal, or transient file');
    assert(panel.webview.html.includes('Created work-project entry “Assigned Hero” (assigned-hero)'), 'the receiver returns through the exact success status');

    const externallyChanged = { ...saved, registryVersion: saved.registryVersion + 1 };
    fs.writeFileSync(registryFile, `${JSON.stringify(externallyChanged, null, 2)}\n`);
    const externalBytes = fs.readFileSync(registryFile);
    const eventCount = events.length;
    let staleThrown = null;
    try { await addAssignedWork(chooseId('team')); } catch (error) { staleThrown = error; }
    assert.strictEqual(staleThrown, null, 'the receiver contains the stale-writer error after presenting its notification');
    assert.match(errors.at(-1) || staleThrown?.message || '', /changed after it was loaded and was not overwritten/, 'stale production rejection is reported by the receiver');
    assert.deepStrictEqual(fs.readFileSync(registryFile), externalBytes, 'stale rejection preserves the externally changed registry bytes');
    assert.strictEqual(events.length, eventCount, 'stale rejection publishes no success notification');
    assert.deepStrictEqual(inventory(), ['.ikemen/project-registry.json'], 'stale rejection cleans any temporary transaction material');
    assert.strictEqual(transactionCalls.length, 2, 'the stale attempt reaches the same production authority exactly once');
    assert.notStrictEqual(transactionCalls[1].options.expectedHash, mutationSafety.hash(externalBytes), 'the stale attempt retains the earlier reviewed source hash');

    assert(messages.some(message => message.type === 'projectManagerBusy' && message.busy), 'composition retains the visible pending notification');
    console.log('Project Manager Add Work composes approval, assigned branches, exact hash, production write/event, stale rejection, and transient cleanup');
  } finally {
    subscription.dispose();
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
