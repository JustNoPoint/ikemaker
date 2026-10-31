'use strict';

const assert = require('assert');
const Module = require('module');
const airBatchScope = require('../src/air_batch_scope');

let applyCalls = 0;
class WorkspaceEdit {
  replace(uri, range, text) { this.replacement = { uri, range, text }; }
}
class Range {
  constructor(...args) { this.args = args; }
}
const vscode = {
  WorkspaceEdit,
  Range,
  workspace: {
    async openTextDocument() { throw new Error('authority-bound replacement must not reopen the document'); },
    async applyEdit() { applyCalls += 1; return false; },
    textDocuments: []
  }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { parseAir, frameBatchToken, resolveFrameBatchTargets, replaceAirDocument } = require('../src/air_viewer');
Module._load = originalLoad;

const source = '[Begin Action 10]\r\n10, 0, 0, 0, 1\r\n10, 1, 0, 0, 2\r\n[Begin Action 20]\r\n20, 0, 0, 0, 3\r\n';
const session = { selectedAction: 10, airPath: 'C:\\fixture\\Anim.air' };
const actions = parseAir(source), fingerprint = airBatchScope.sourceFingerprint(source);
const ownToken = frameBatchToken(session, fingerprint, 10, 1, actions[0].frames[1]);
const otherActionToken = frameBatchToken(session, fingerprint, 20, 0, actions[1].frames[0]);

assert.deepStrictEqual([...resolveFrameBatchTargets(session, source, [ownToken]).frameIndices], [1], 'host-issued token must resolve inside the selected action');
assert.throws(() => resolveFrameBatchTargets(session, source, [otherActionToken]), /do not belong to selected Action 10/, 'a valid token from another action must fail closed');
assert.throws(() => resolveFrameBatchTargets(session, source, [ownToken, ownToken]), /invalid or duplicated/, 'duplicate marked targets must fail closed');
assert.throws(() => resolveFrameBatchTargets(session, source + '; changed\n', [ownToken]), /stale or do not belong/, 'tokens must be bound to the exact source fingerprint');

function makeDocument(text, version = 1) {
  return {
    uri: { fsPath: session.airPath }, version, text,
    get lineCount() { return this.text.split(/\r?\n/).length; },
    lineAt(index) { return { text: this.text.split(/\r?\n/)[index] || '' }; },
    getText() { return this.text; }
  };
}

(async () => {
  const stale = makeDocument(source, 2);
  await assert.rejects(
    replaceAirDocument({ ...session, panel: { webview: { postMessage() { throw new Error('must not refresh'); } } } }, 'replacement', { document: stale, version: 1, text: source }),
    /changed immediately before the edit/
  );
  assert.strictEqual(applyCalls, 0, 'a version race must emit no WorkspaceEdit');

  const current = makeDocument(source, 3);
  await assert.rejects(
    replaceAirDocument({ ...session, panel: { webview: { postMessage() { throw new Error('must not refresh'); } } } }, 'replacement', { document: current, version: 3, text: source }),
    /rejected the AIR frame edit/
  );
  assert.strictEqual(applyCalls, 1, 'a rejected applyEdit must be reported exactly once');
  console.log('air_frame_property_batch_host.test.js passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
