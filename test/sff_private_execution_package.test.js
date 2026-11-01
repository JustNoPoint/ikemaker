'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: (fsPath) => ({ fsPath }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { stagePrivateSprMakeRun } = require('../src/sff_commands');
const { createPrivateRun, cleanupPrivateRun } = require('../src/sff_build_safety');
Module._load = original;

(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-private-package-'));
  try {
    const exported = path.join(root, 'exported-package'), input = path.join(exported, 'input'), target = path.join(root, 'active.sff');
    fs.mkdirSync(input, { recursive: true });
    fs.writeFileSync(path.join(input, 'g00000_i00000.png'), 'approved-snapshot');
    fs.writeFileSync(path.join(input, 'artist-note.txt'), 'do not remove');
    const definitionPath = path.join(exported, 'sprmake2.def');
    fs.writeFileSync(definitionPath, `[Output]\r\nfilename = ${path.join(exported, '.shared-candidate.sff')}\r\n\r\n[Option]\r\ninput.dir = ${input}\r\n`);
    const generated = { outputDirectory: exported, definitionPath, outputSff: target, sprmake: path.join(root, 'sprmake2.exe') };
    const firstRun = createPrivateRun(fs, target, { parent: root }), secondRun = createPrivateRun(fs, target, { parent: root });
    const first = stagePrivateSprMakeRun(generated, firstRun), second = stagePrivateSprMakeRun(generated, secondRun);
    assert.notStrictEqual(first.outputDirectory, second.outputDirectory);
    assert.notStrictEqual(first.candidateOutputSff, second.candidateOutputSff);
    assert.strictEqual(fs.readFileSync(path.join(input, 'artist-note.txt'), 'utf8'), 'do not remove');
    assert.strictEqual(fs.readFileSync(path.join(first.outputDirectory, 'input', 'g00000_i00000.png'), 'utf8'), 'approved-snapshot');
    assert.strictEqual(fs.readFileSync(path.join(first.outputDirectory, 'input', 'artist-note.txt'), 'utf8'), 'do not remove');
    const privateDefinition = fs.readFileSync(first.definitionPath, 'utf8');
    assert(privateDefinition.includes(`filename = ${firstRun.candidate}`));
    assert(privateDefinition.includes(`input.dir = ${path.join(firstRun.directory, 'input')}`));
    assert.strictEqual(fs.readFileSync(definitionPath, 'utf8').includes('.shared-candidate.sff'), true, 'the exported package is not rewritten for an execution run');
    cleanupPrivateRun(fs, firstRun); cleanupPrivateRun(fs, secondRun);
    assert.strictEqual(fs.readFileSync(path.join(input, 'g00000_i00000.png'), 'utf8'), 'approved-snapshot', 'execution cleanup leaves exported package inputs untouched');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('SprMaker2 private execution staging preserves exported package files and uses unique candidates');
})();
