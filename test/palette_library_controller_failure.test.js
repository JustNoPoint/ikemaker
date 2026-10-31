'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  ConfigurationTarget: { WorkspaceFolder: 2 },
  workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => {} }) },
  window: { showInputBox: async () => undefined, showWarningMessage: async () => undefined }
};
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };

function digest(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }
function retainedProjection(session) {
  return JSON.parse(JSON.stringify({ candidate: session.candidate, preview: session.preview, facts: session.facts, interaction: session.interaction, applyAllowed: session.applyAllowed }));
}

(async () => {
  try {
    const { PaletteWorkspaceController } = require('../src/palette_workspace_controller');
    const serviceModule = require('../src/palette_workspace_service');
    const candidateModel = require('../src/palette_workshop_candidate_model');
    const lifecycle = require('../src/palette_library_lifecycle');
    for (const kind of ['rename', 'delete']) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `ikemaker-palette-controller-${kind}-`));
      try {
        const target = path.join(root, 'sentinel.sff'), sourceBytes = Buffer.alloc(768, 31), source = path.join(root, 'Reviewed.act');
        fs.writeFileSync(target, Buffer.from('sentinel target bytes'));
        const saved = lifecycle.save({ root, name: 'Reviewed', bytes: sourceBytes, now: new Date('2026-10-22T21:10:00.000Z') });
        assert.strictEqual(saved.filename, source);
        const service = serviceModule.configurePaletteWorkspaceService(), controller = new PaletteWorkspaceController({});
        service.open(target);
        service.select(target, { palette: { physicalIndex: 0, group: 1, number: 1 } });
        service.mutate(target, { preview: { dirty: true, colors: Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]), label: 'Retained exact draft' }, facts: { preview: 'draft' }, interaction: { selectedIndices: [3], status: 'Retained interaction state' }, applyAllowed: true });
        const beforeCandidate = service.snapshot(target), baseline = candidateModel.captureBaseline(beforeCandidate);
        service.mutate(target, { candidate: { baseline, candidate: { filename: source, byteHash: digest(source), byteLength: sourceBytes.length, format: 'act', actOrder: 'index' }, selectedIndex: 0, status: 'Active reviewed library candidate' } });
        const before = retainedProjection(service.snapshot(target)), targetHash = digest(target), changed = Buffer.concat([sourceBytes, Buffer.from([91])]);
        assert.strictEqual(before.candidate.active, true, 'failure regression begins with a real active candidate session');
        controller.libraryOwnedSelection = () => ({ library: { root }, item: { origin: 'folder' }, index: 0, filename: source });
        controller.activeCandidateRestorePatch = () => ({ candidate: { active: false } });
        let applied = 0;
        controller.applyCandidateRestorePatch = () => { applied += 1; };
        if (kind === 'rename') vscode.window.showInputBox = async () => { fs.writeFileSync(source, changed); return 'Renamed'; };
        else vscode.window.showWarningMessage = async () => { fs.writeFileSync(source, changed); return 'Delete Library File'; };
        const operation = kind === 'rename' ? controller.renameLibraryItem({ filename: target }, 0) : controller.deleteLibraryItem({ filename: target }, 0);
        await assert.rejects(operation, /changed after review/i);
        assert.strictEqual(applied, 0, `${kind} failure never applies the candidate restore patch`);
        assert.deepStrictEqual(retainedProjection(service.snapshot(target)), before, `${kind} failure leaves candidate, preview, facts, interaction, and apply authority unchanged`);
        assert.strictEqual(digest(target), targetHash, `${kind} failure never changes the active SFF`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
    console.log('Palette Library controller failures preserve the active candidate session and SFF authority');
  } finally {
    Module._load = originalLoad;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
