'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const path = require('path');

const originalLoad = Module._load;
const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  ViewColumn: { One: 1, Beside: 2 },
  ConfigurationTarget: { WorkspaceFolder: 1 },
  commands: { executeCommand: async () => false },
  workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => {} }) },
  window: { showOpenDialog: async () => undefined, showWarningMessage: async () => undefined, showInformationMessage: async () => undefined }
};
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };

(async () => {
  try {
    const { PaletteWorkspaceController } = require('../src/palette_workspace_controller'), root=fs.mkdtempSync(path.join(os.tmpdir(),'palette-session-route-')),source=path.join(root,'cached-source.png'),sessionFile=path.join(root,'cached-image-session.ikemaker.json');fs.writeFileSync(source,Buffer.from('source'));
    const owner = new PaletteWorkspaceController({}), loaded = { collective: { evidence: [{ filename: source }], imageCount: 1 } }, posted = [], state = { filename: path.join(root,'character.sff'), busy: false, post: message => posted.push(message) };
    let activated = null, restored = null;
    owner.choosePaletteImageSession = async () => ({ filename: sessionFile, loaded });
    owner.activateInlineTemplate = (target, chosen) => { activated = { target, chosen }; target.inlineSource = { filename: source }; return true; };
    owner.restorePaletteImageSession = (filename, panel, selectedFile, selectedSession, options) => { restored = { filename, panel, selectedFile, selectedSession, options }; return {}; };
    assert.strictEqual(await owner.handleSff(state, { type: 'workspaceAction', action: 'loadPaletteImageSession' }), true);
    assert.strictEqual(activated,null,'session loading bypasses the ordinary folder-intake projection');
    assert.strictEqual(restored.filename, source);
    assert.strictEqual(restored.selectedFile, sessionFile);
    assert.strictEqual(restored.selectedSession, loaded);
    assert.strictEqual(restored.options.organizer.templateSource.kind, 'image-session');
    assert(posted.some(message => message.type === 'paletteImageSessionProgress'), 'loading from the SFF surface reports visible progress');
    console.log('Palette image-session SFF route tests passed');
  } finally {
    Module._load = originalLoad;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
