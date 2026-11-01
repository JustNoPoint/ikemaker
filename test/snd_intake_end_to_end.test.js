'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { commands: { registerCommand() { return { dispose() {} }; } }, window: {} };
  return originalLoad.call(this, request, parent, main);
};
const workspace = require('../src/snd_intake_workspace');
Module._load = originalLoad;

function wav(payload) {
  let body = Buffer.from(payload); if (body.length % 2) body = Buffer.concat([body, Buffer.from([0])]);
  const bytes = Buffer.alloc(44 + body.length);
  bytes.write('RIFF', 0, 'ascii'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8, 'ascii'); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28); bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34);
  bytes.write('data', 36, 'ascii'); bytes.writeUInt32LE(body.length, 40); body.copy(bytes, 44); return bytes;
}

function api(overrides = {}) {
  return { window: {
    async showOpenDialog() { return []; },
    async showInputBox() { return '4,2'; },
    async showQuickPick() { throw new Error('No collision was expected.'); },
    async showWarningMessage(_message, _options, ...actions) { return actions.includes('Prepare Without Updating SND') ? 'Prepare Without Updating SND' : actions[0]; },
    async showInformationMessage() {},
    ...overrides
  } };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-snd-workflow-'));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-snd-source-'));
  try {
    const manifestPath = path.join(root, 'build.txt'), sndPath = path.join(root, 'active.snd'), retainedRoot = path.join(root, 'wav', 'imported'), source = path.join(sourceRoot, 'incoming.wav');
    const baselineManifest = 'active.snd\r\n', baselineSnd = Buffer.from('ACTIVE SND MUST STAY UNCHANGED'), sourceBytes = wav('incoming');
    fs.writeFileSync(manifestPath, baselineManifest); fs.writeFileSync(sndPath, baselineSnd); fs.writeFileSync(source, sourceBytes);

    assert.strictEqual(await workspace.open({}, api()), null, 'cancelling the manifest picker exits before intake');
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'manifest-picker cancellation creates no retained WAV files');
    assert.strictEqual(await workspace.open({ manifestPath }, api()), null, 'cancelling the WAV picker exits before intake');
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'WAV-picker cancellation creates no retained WAV files');
    assert.strictEqual(await workspace.open({ manifestPath, paths: [source] }, api({ async showInputBox() { return undefined; } })), null, 'cancelling the destination prompt exits before review');
    assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), baselineManifest);
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'destination-prompt cancellation creates no retained WAV files');

    const progressNotices = [];
    const progressCancelled = await workspace.open({ manifestPath, paths: [source], destinationHint: { kind: 'append', group: 4, startIndex: 2 } }, api({
      async withProgress(_options, task) { return task({ report() {} }, { isCancellationRequested: true }); },
      async showWarningMessage() { throw new Error('cancelled validation must not reach final review'); },
      async showInformationMessage(message) { progressNotices.push(message); }
    }));
    assert.strictEqual(progressCancelled, null); assert(progressNotices.some(message => /cancelled/.test(message)), 'progress cancellation is explained');
    assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), baselineManifest, 'progress cancellation performs no manifest write');
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'progress cancellation creates no retained WAV files');

    const collisionManifest = 'active.snd\r\nold.wav\r\n4\r\n2\r\n'; fs.writeFileSync(manifestPath, collisionManifest);
    const collisionCancelled = await workspace.open({ manifestPath, paths: [source], destinationHint: { kind: 'replace-or-insert', group: 4, index: 2 } }, api({ async showQuickPick() { return undefined; } }));
    assert.strictEqual(collisionCancelled, null); assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), collisionManifest, 'cancelling collision resolution performs no write');
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'collision-choice cancellation creates no retained WAV files');
    const manualCancelled = await workspace.open({ manifestPath, paths: [source], destinationHint: { kind: 'replace-or-insert', group: 4, index: 2 } }, api({
      async showQuickPick() { return { action: 'manual' }; }, async showInputBox() { return undefined; }
    }));
    assert.strictEqual(manualCancelled, null); assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), collisionManifest, 'cancelling a manual collision destination performs no write');
    assert.strictEqual(fs.existsSync(retainedRoot), false, 'manual-identity cancellation creates no retained WAV files');

    fs.writeFileSync(manifestPath, baselineManifest); const notices = [];
    let directBuilds = 0;
    const result = await workspace.open({ manifestPath, paths: [source], destinationHint: { kind: 'append', group: 4, startIndex: 2 }, buildSndManifest: async () => { directBuilds += 1; return { built: true, output: sndPath }; } }, api({
      async showInformationMessage(message) { notices.push(message); }
    }));
    assert(result && result.plan.operations.length === 1, 'accepted review returns the exact materialized plan');
    const saved = require('../src/sound_build').read(manifestPath);
    assert.deepStrictEqual(saved.entries.map(entry => [entry.group, entry.index]), [[4, 2]]);
    const retainedPath = path.resolve(root, saved.entries[0].source);
    assert(fs.existsSync(retainedPath), 'the reviewed external WAV is retained inside the build workspace');
    assert(fs.readFileSync(retainedPath).equals(sourceBytes), 'the retained WAV bytes exactly equal the chosen external source bytes');
    assert(fs.readFileSync(sndPath).equals(baselineSnd), 'the injected builder owns the SND mutation boundary');
    assert.strictEqual(directBuilds, 1, 'accepted standard intake immediately invokes one direct current-SND build without a second confirmation');
    console.log('SND intake exact output, cancellation forks, and direct current-SND build passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(sourceRoot, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
