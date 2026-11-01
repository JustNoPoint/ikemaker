'use strict';

const assert = require('assert');
const crypto = require('crypto');
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
const intake = require('../src/snd_intake_model');
Module._load = originalLoad;

function wav(payload) {
  let body = Buffer.from(payload); if (body.length % 2) body = Buffer.concat([body, Buffer.from([0])]);
  const bytes = Buffer.alloc(44 + body.length);
  bytes.write('RIFF', 0, 'ascii'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8, 'ascii'); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28); bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write('data', 36, 'ascii'); bytes.writeUInt32LE(body.length, 40); body.copy(bytes, 44);
  return bytes;
}
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-snd-intake-'));
(async () => { try {
  const manifestPath = path.join(root, 'build.txt'), sndPath = path.join(root, 'output.snd');
  const first = path.join(root, 'first.wav'), second = path.join(root, 'second.wav');
  fs.writeFileSync(first, wav('first')); fs.writeFileSync(second, wav('second'));
  const malformed = path.join(root, 'malformed.wav'); fs.writeFileSync(malformed, Buffer.from('RIFF....WAVE'));
  const inconsistent = path.join(root, 'inconsistent.wav'), inconsistentBytes = wav('bad header'); inconsistentBytes.writeUInt16LE(2, 22); inconsistentBytes.writeUInt16LE(1, 32); inconsistentBytes.writeUInt32LE(1, 28); fs.writeFileSync(inconsistent, inconsistentBytes);
  fs.writeFileSync(sndPath, Buffer.from('UNCHANGED SND'));
  fs.writeFileSync(manifestPath, 'output.snd\r\nold.wav\r\n1\r\n0\r\n');
  assert.throws(() => workspace.stageBatch({ manifestPath, paths: [malformed], destinationHint: { kind: 'append', group: 0, startIndex: 0 } }), /No supported WAV source passed intake validation/);
  assert.throws(() => workspace.stageBatch({ manifestPath, paths: [inconsistent], destinationHint: { kind: 'append', group: 0, startIndex: 0 } }), /No supported WAV source passed intake validation/, 'internally inconsistent PCM headers are rejected');
  assert.throws(() => workspace.stageBatch({ manifestPath: sndPath, paths: [first], destinationHint: { kind: 'append', group: 0, startIndex: 0 } }), /never writes an SND archive/i);

  const state = workspace.stageBatch({ manifestPath, paths: [first, second], destinationHint: { kind: 'replace-or-insert', group: 1, index: 0 }, generation: 7, sessionNonce: 'test-session' });
  assert.deepStrictEqual(state.candidate.records.map(item => path.basename(item.canonicalPath)), ['first.wav', 'second.wav'], 'picker/drop order is exact');
  assert.strictEqual(state.draft.rows[0].state, 'collision');
  assert.deepStrictEqual(state.draft.rows.map(row => [row.group, row.index]), [[1, 0], [1, 1]]);
  let draft = intake.resolveRow(state.draft, state.draft.rows[0].rowId, { action: 'replace' }, state.manifest);
  const preview = workspace.buildWriteSet(state, draft);
  assert.deepStrictEqual(preview.plan.operations.map(item => item.action), ['replace', 'add']);
  assert.deepStrictEqual(preview.nextManifest.entries.map(item => [item.group, item.index]), [[1, 0], [1, 1]], 'replacement keeps its manifest ordinal and additions preserve reviewed order');
  assert(preview.nextManifest.entries.every(item => /^wav\/imported\//.test(item.source)), 'external WAVs become project-local retained sources');

  workspace.applyReviewedBatch(state, draft);
  const saved = require('../src/sound_build').read(manifestPath);
  assert.deepStrictEqual(saved.entries.map(item => [item.group, item.index]), [[1, 0], [1, 1]]);
  assert.strictEqual(fs.readFileSync(sndPath, 'utf8'), 'UNCHANGED SND', 'batch intake never mutates or rebuilds the SND output');
  for (const entry of saved.entries) assert(fs.existsSync(path.resolve(root, entry.source)), `retained source exists: ${entry.source}`);

  const staleManifest = workspace.stageBatch({ manifestPath, paths: [first], destinationHint: { kind: 'append', group: 2, startIndex: 0 }, generation: 8, sessionNonce: 'stale-manifest' });
  fs.appendFileSync(manifestPath, '; changed elsewhere\r\n');
  assert.throws(() => workspace.buildWriteSet(staleManifest, staleManifest.draft), /manifest changed/i, 'manifest drift rejects the reviewed plan');
  fs.writeFileSync(manifestPath, require('../src/sound_build').stringify(saved));

  const staleSource = workspace.stageBatch({ manifestPath, paths: [first], destinationHint: { kind: 'append', group: 3, startIndex: 0 }, generation: 9, sessionNonce: 'stale-source' });
  fs.writeFileSync(first, wav('changed after review'));
  assert.throws(() => workspace.buildWriteSet(staleSource, staleSource.draft), /source changed after review/i, 'source drift rejects the reviewed plan');

  const wrongSession = { ...staleSource.session, sessionId: sha(Buffer.from('other')) };
  assert.throws(() => workspace.buildWriteSet(staleSource, staleSource.draft, { currentSession: wrongSession }), /candidate is absent or stale/i);

  const pickerManifest = path.join(root, 'picker-build.txt'), pickerWav = path.join(root, 'picker.wav'), pickerCalls = [];
  fs.writeFileSync(pickerManifest, 'picker-output.snd\r\n'); fs.writeFileSync(pickerWav, wav('picker'));
  const api = { window: {
    async showOpenDialog(options) { pickerCalls.push(options); return [{ fsPath: pickerWav }]; },
    async showInputBox() { return '5,3'; },
    async showQuickPick() { throw new Error('No collision was expected.'); },
    async showWarningMessage(message, options, ...actions) { return actions.includes('Prepare Without Updating SND') ? 'Prepare Without Updating SND' : undefined; },
    async showInformationMessage() {}
  } };
  await workspace.open({ manifestPath: pickerManifest, buildSndManifest: async () => ({ built: true, output: path.join(root, 'picker-output.snd') }) }, api);
  assert.strictEqual(pickerCalls.length, 1);
  assert.strictEqual(pickerCalls[0].canSelectMany, true, 'the keyboard/file-picker route accepts the same ordered batch as drop intake');
  assert.deepStrictEqual(require('../src/sound_build').read(pickerManifest).entries.map(item => [item.group, item.index]), [[5, 3]]);

  const directManifest = path.join(root, 'direct-build.txt'), directWav = path.join(root, 'direct.wav'), directBuilds = [];
  fs.writeFileSync(directManifest, 'direct-output.snd\r\n'); fs.writeFileSync(directWav, wav('direct'));
  const directApi = { window: {
    async showInputBox() { return '7,2'; },
    async showQuickPick() { throw new Error('No collision was expected.'); },
    async showWarningMessage(message, options, ...actions) { return actions.includes('Add to Current SND') ? 'Add to Current SND' : undefined; },
    async showInformationMessage() {}
  } };
  const direct = await workspace.open({
    manifestPath: directManifest,
    paths: [directWav],
    buildSndManifest: async (filename, options) => { directBuilds.push({ filename, options }); return { built: true, output: path.join(root, 'direct-output.snd') }; }
  }, directApi);
  assert.deepStrictEqual(require('../src/sound_build').read(directManifest).entries.map(item => [item.group, item.index]), [[7, 2]]);
  assert.strictEqual(directBuilds.length, 1, 'compact SND intake can immediately run the shared validated builder');
  assert.strictEqual(directBuilds[0].filename, directManifest);
  assert.strictEqual(directBuilds[0].options.confirm, false, 'the explicit Add to Current SND choice is the single build confirmation');
  assert.strictEqual(direct.build.built, true);

  let inheritedPrompt;
  const inherited = await workspace.chooseDestination({ window: { async showInputBox(options) { inheritedPrompt = options; return options.value; } } }, 200, 4);
  assert.strictEqual(inheritedPrompt.value, '200,4', 'sound intake proposes the selected sound group and next index');
  assert.deepStrictEqual(inherited, { kind: 'replace-or-insert', group: 200, index: 4 });

  const cancelManifest = path.join(root, 'cancel-build.txt'); fs.writeFileSync(cancelManifest, 'cancel-output.snd\r\n');
  const notices = [], cancelApi = { window: {
    async showInputBox() { return '6,0'; },
    async withProgress(_options, task) { return task({ report() {} }, { isCancellationRequested: true }); },
    async showInformationMessage(message) { notices.push(message); },
    async showWarningMessage() { throw new Error('A cancelled intake must not reach review.'); }
  } };
  const cancelled = await workspace.open({ manifestPath: cancelManifest, paths: [second] }, cancelApi);
  assert.strictEqual(cancelled, null);
  assert.strictEqual(fs.readFileSync(cancelManifest, 'utf8'), 'cancel-output.snd\r\n');
  assert(notices.some(message => /cancelled/.test(message)), 'cancellation is visible and leaves no partial manifest candidate');
  console.log('SND reviewed batch workspace preserves order, resolves collisions, retains WAVs locally, rejects stale state, keeps picker parity, and never mutates SND output');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
