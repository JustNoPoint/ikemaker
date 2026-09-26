'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-project-profile-'));
  const inputs = ['My New Game', 'my-new-game'];
  const commands = [];
  const vscode = {
    Uri: { file: (filename) => ({ scheme: 'file', fsPath: filename }) },
    window: {
      activeTextEditor: null,
      tabGroups: { activeTabGroup: null, all: [] },
      visibleTextEditors: [],
      showOpenDialog: async () => [{ scheme: 'file', fsPath: root }],
      showInputBox: async () => inputs.shift(),
      showQuickPick: async (items) => items[0],
      showTextDocument: async () => {},
      showInformationMessage: async () => {},
      showErrorMessage: async (message) => { throw new Error(message); },
      showWarningMessage: async () => {}
    },
    workspace: {
      workspaceFolders: [],
      getWorkspaceFolder: () => null,
      openTextDocument: async (uri) => uri
    },
    commands: { executeCommand: async (...args) => { commands.push(args); } }
  };
  const original = Module._load;
  Module._load = function patched(request, parent, main) {
    if (request === 'vscode') return vscode;
    return original.call(this, request, parent, main);
  };
  const { createProjectProfile } = require('../src/project_context_ui');
  Module._load = original;
  try {
    await createProjectProfile();
    const filename = path.join(root, '.ikemen', 'project-registry.json');
    assert(fs.existsSync(filename), 'the complete project registry was not created');
    const registry = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const project = registry.projects.find((item) => item.id === 'my-new-game');
    assert(project, 'the new project was not registered');
    assert.strictEqual(project.roots[0], '.');
    assert.strictEqual(project.distributionIntent, 'hobby');
    assert.strictEqual(project.contentBasis, 'original');
    assert.strictEqual(project.sourceResearch, false);
    assert.strictEqual(commands[0][0], 'ikemen.projectManager.open', 'game creation should finish in the visual Project & Team Manager');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('Game/project profile creation tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
