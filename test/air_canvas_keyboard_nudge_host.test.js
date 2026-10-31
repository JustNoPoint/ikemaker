'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { mutateCollisionNudge } = require('../src/air_viewer');
const { sourceFingerprint } = require('../src/air_batch_scope');
Module._load = originalLoad;

const airPath = 'C:/character/main.air';
const original = '[Begin Action 100]\nClsn2: 2\nClsn2[0] = -10, -20, 10, 20\nClsn2[1] = -5, -8, 5, 8\n0,0,0,0,1\n';
const before = 'Clsn2[0] = -10, -20, 10, 20\nClsn2[1] = -5, -8, 5, 8';
const replacement = 'Clsn2[0] = -9, -20, 11, 20\nClsn2[1] = -4, -8, 6, 8';

function harness(options = {}) {
  let text = original, version = 7, applyCalls = 0, promptCalls = 0, openCalls = 0;
  const edits = [], operations = [];
  const document = {
    uri: { fsPath: airPath },
    getText: () => text,
    get version() { return version; },
    positionAt: offset => ({ offset })
  };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit {
    constructor() { edits.push(this); this.operations = []; }
    replace(uri, range, value) {
      const operation = { uri, start: range.start.offset, end: range.end.offset, replacement: value };
      this.operations.push(operation); operations.push(operation);
    }
  }
  const workspace = {
    openTextDocument: async () => { openCalls += 1; return document; },
    applyEdit: async edit => {
      applyCalls += 1;
      assert.strictEqual(edit, edits[0], 'the submitted edit is the single reviewed WorkspaceEdit');
      if (options.applyFalse) return false;
      if (!options.skipApplyMutation) {
        assert.strictEqual(edit.operations.length, 1, 'one nudge is one editor operation');
        const operation = edit.operations[0];
        text = text.slice(0, operation.start) + operation.replacement + text.slice(operation.end);
        version += 1;
      }
      return true;
    }
  };
  const planBuilder = (_session, baselineText) => {
    const start = baselineText.indexOf(before), end = start + before.length;
    assert(start >= 0, 'test source contains the reviewed collision block');
    const resulting = baselineText.slice(0, start) + replacement + baselineText.slice(end);
    return {
      action: 100, elementIndex: 0, groupKey: 'clsn2', slots: [0, 1], dx: 1, dy: 0,
      ownershipImpact: { editsSharedDefault: false, materializesInheritedDefault: false },
      sourceFingerprint: sourceFingerprint(baselineText), resultingFingerprint: sourceFingerprint(resulting),
      patch: { start, end, before, replacement }
    };
  };
  const window = {
    showWarningMessage: async (...args) => {
      promptCalls += 1;
      if (options.driftText) text += '; changed during review\n';
      if (options.driftVersion) version += 1;
      return options.cancel ? undefined : args.at(-1);
    }
  };
  return {
    session: { airPath }, services: { workspace, window, WorkspaceEdit, Range, collisionNudgeMutationPlan: planBuilder },
    document, edits, operations,
    get text() { return text; }, get version() { return version; },
    counts: () => ({ applyCalls, promptCalls, openCalls })
  };
}

(async () => {
  const cancelled = harness({ cancel: true });
  const cancelledResult = await mutateCollisionNudge(cancelled.session, {}, cancelled.services);
  assert.deepStrictEqual(cancelledResult, { applied: false, cancelled: true, message: 'Collision-box nudge cancelled.' });
  assert.deepStrictEqual(cancelled.counts(), { applyCalls: 0, promptCalls: 1, openCalls: 1 });
  assert.strictEqual(cancelled.edits.length, 0, 'cancellation creates no editor transaction');

  for (const [label, option] of [['source drift', { driftText: true }], ['version mismatch', { driftVersion: true }]]) {
    const drifted = harness(option);
    await assert.rejects(() => mutateCollisionNudge(drifted.session, {}, drifted.services), /source changed.*Nothing was applied/i, label);
    assert.strictEqual(drifted.counts().applyCalls, 0, `${label} never reaches applyEdit`);
    assert.strictEqual(drifted.edits.length, 0, `${label} creates no WorkspaceEdit`);
  }

  const rejected = harness({ applyFalse: true });
  await assert.rejects(() => mutateCollisionNudge(rejected.session, {}, rejected.services), /VS Code rejected/i);
  assert.strictEqual(rejected.counts().applyCalls, 1);
  assert.strictEqual(rejected.edits.length, 1);
  assert.strictEqual(rejected.operations.length, 1);
  assert.strictEqual(rejected.text, original, 'editor rejection leaves the source buffer unchanged');

  const unverified = harness({ skipApplyMutation: true });
  await assert.rejects(() => mutateCollisionNudge(unverified.session, {}, unverified.services), /could not be verified/i);
  assert.strictEqual(unverified.counts().applyCalls, 1);
  assert.strictEqual(unverified.edits.length, 1);
  assert.strictEqual(unverified.operations.length, 1);

  const applied = harness();
  const appliedResult = await mutateCollisionNudge(applied.session, {}, applied.services);
  assert.strictEqual(appliedResult.applied, true);
  assert.match(appliedResult.message, /VS Code Undo is available/);
  assert.strictEqual(applied.edits.length, 1, 'successful nudge creates exactly one WorkspaceEdit');
  assert.strictEqual(applied.operations.length, 1, 'successful nudge replaces one exact reviewed span');
  assert.deepStrictEqual(applied.counts(), { applyCalls: 1, promptCalls: 1, openCalls: 3 }, 'baseline, pre-apply, and post-apply verification all use the same open buffer');
  assert.strictEqual(applied.version, 8, 'the one WorkspaceEdit advances the editor buffer by one version');
  assert.strictEqual(applied.text, original.replace(before, replacement), 'verified editor text exactly matches the reviewed result');

  console.log('AIR collision keyboard nudge host transaction cancels cleanly, rejects drift/editor failures, and verifies one Undo-compatible WorkspaceEdit');
})().catch(error => { console.error(error); process.exitCode = 1; });
