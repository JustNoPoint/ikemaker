'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AirClsn2BatchService, MAPPING_KEY } = require('../src/air_clsn2_batch_service');
const { actionsIn } = require('../src/air_clsn2_batch_model');

const original = `; Source
[Begin Action 0]
Clsn2Default: 1
Clsn2[0] = -10, -80, 10, 0
0, 0, 0, 0, 2

; Target
[Begin Action 20]
20, 0, 0, 0, 3
20, 1, 0, 0, 4
`;
const selectionText = 'Clsn2Default: 1\nClsn2[0] = -10, -80, 10, 0';

function documentFor(text = original, filename = 'C:\\fixture\\Anim.air') {
  const uri = { fsPath: filename, toString: () => `file:///${filename.replace(/\\/g, '/')}` };
  return {
    uri, fileName: uri.fsPath, languageId: 'ikemen-air', version: 1, text,
    get lineCount() { return this.text.split(/\r?\n/).length; },
    getText(selection) { return selection ? selectionText : this.text; },
    lineAt(line) { return { text: this.text.split(/\r?\n/)[line] || '' }; }
  };
}

class WorkspaceEdit { constructor() { this.replacements = []; } replace(uri, range, text) { this.replacements.push({ uri, range, text }); } }
class Range { constructor(...values) { this.values = values; } }

function harness(options = {}) {
  const document = documentFor(options.text || original, options.airPath), applied = [], diffs = [], infos = [], stored = {}, refreshes = [];
  const state = { reviewCalls: 0, activeEditor: { document, selection: {} } };
  const vscode = {
    WorkspaceEdit, Range,
    workspace: {
      textDocuments: [document],
      async openTextDocument(value) { return value && value.content !== undefined ? { uri: { toString: () => 'untitled:preview' }, languageId: value.language, getText: () => value.content } : document; },
      async applyEdit(edit) { applied.push(edit); document.text = edit.replacements[0].text; document.version += 1; return true; }
    },
    commands: { async executeCommand(...args) { diffs.push(args); } },
    window: {
      get activeTextEditor() { return state.activeEditor; },
      async showQuickPick(items, prompt) {
        if (/Remembered assignment owner/.test(prompt.title)) return options.ownerCancelled ? undefined : items[options.ownerChoice ?? 0];
        if (/Operation/.test(prompt.title)) return items.find((item) => item.operation === (options.operation || 'replace'));
        if (/Target role/.test(prompt.title)) return items.find((item) => item.role === (options.role || 'all'));
        if (/Assignment memory/.test(prompt.title)) return options.memoryCancelled ? undefined : items.find((item) => item.remember === true);
        throw new Error(`Unexpected QuickPick: ${prompt.title}`);
      },
      async showInputBox(prompt) {
        if (/Target actions/.test(prompt.title)) return options.actions || '20';
        if (/Target animation elements/.test(prompt.title)) return options.elements || 'all';
        if (/Override or exclude/.test(prompt.title)) return options.assignmentInput || '20=custom';
        throw new Error(`Unexpected InputBox: ${prompt.title}`);
      },
      async showWarningMessage(message, detail) {
        if (/Review Clsn2 batch/.test(message)) {
          state.reviewCalls += 1;
          if (options.cancelReview) return undefined;
          if (options.changeAssignments && state.reviewCalls === 1) return 'Change Assignments';
          return 'Preview Diff';
        }
        if (/Apply the reviewed/.test(message)) {
          if (options.mutateBeforeApply) { document.text += '; concurrent edit\n'; document.version += 1; }
          return options.cancelApply ? undefined : 'Apply Changes';
        }
        throw new Error(`Unexpected warning: ${message}\n${detail?.detail || ''}`);
      },
      showInformationMessage(message) { infos.push(message); }
    }
  };
  const context = { workspaceState: { get: (key, fallback) => Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : fallback, update: async (key, value) => { stored[key] = value; } } };
  return { document, applied, diffs, infos, stored, refreshes, state, service: new AirClsn2BatchService(vscode, context) };
}

(async () => {
  const textRun = harness();
  const textSource = await textRun.service.textSource(textRun.state.activeEditor);
  const noOwner = await textRun.service.resolveOwnerScope(textSource);
  assert.strictEqual(noOwner.ownerDef, '');
  assert.match(noOwner.ownerScopeLabel, /AIR-only scope/, 'an AIR with no owner uses a disclosed AIR-only scope');
  const textResult = await textRun.service.run(textSource);
  assert.strictEqual(textResult.status, 'applied');
  assert.strictEqual(textRun.applied.length, 1);
  assert.strictEqual(textRun.diffs.length, 1);
  assert.deepStrictEqual(textResult.proposal.changed.map((item) => item.elements), [[1, 2]]);

  const visualRun = harness();
  const parsed = actionsIn(visualRun.document.text), sourceAction = parsed.actions[0];
  const messages = [];
  const session = {
    airPath: visualRun.document.fileName, defPath: 'C:\\fixture\\Ryu.def', disposed: false,
    async refreshAfterClsn2(document, selection) { messages.push({ document, selection }); }
  };
  const visualSource = await visualRun.service.visualSource(session, { action: 0, frameIndex: 0, pendingGuardPassed: true, sourceSnapshot: { action: 0, frameIndex: 0, actionText: parsed.lines.slice(sourceAction.start, sourceAction.end).join('\n') } });
  const visualResult = await visualRun.service.run(visualSource);
  assert.strictEqual(visualResult.status, 'applied');
  assert.strictEqual(visualResult.proposal.text, textResult.proposal.text, 'text and visual adapters must produce byte-identical output for identical inputs');
  assert.deepStrictEqual(visualResult.proposal.changed, textResult.proposal.changed);
  assert.deepStrictEqual(messages[0].selection, { action: 0, frameIndex: 0 }, 'the visual route retains its selected source element after success');

  const switched = harness();
  switched.state.activeEditor = { document: documentFor('[Begin Action 999]\n999,0,0,0,1'), selection: {} };
  const captured = { kind: 'text', airPath: switched.document.fileName, document: switched.document, selectionText };
  await switched.service.run(captured);
  assert.strictEqual(switched.applied.length, 1, 'an active-editor switch must not redirect the captured AIR transaction');
  assert(switched.document.text.includes('[Begin Action 20]'));

  const stale = harness({ mutateBeforeApply: true });
  await assert.rejects(() => stale.service.run({ kind: 'text', airPath: stale.document.fileName, document: stale.document, selectionText }), /changed while this batch was being reviewed/);
  assert.strictEqual(stale.applied.length, 0, 'a mutation during final confirmation creates zero edits');

  const cancelled = harness({ cancelReview: true });
  const cancelledResult = await cancelled.service.run({ kind: 'text', airPath: cancelled.document.fileName, document: cancelled.document, selectionText });
  assert.strictEqual(cancelledResult.status, 'cancelled');
  assert.strictEqual(cancelled.applied.length, 0);
  assert.strictEqual(cancelled.stored[MAPPING_KEY], undefined, 'cancel writes no preference');

  const remembered = harness({ changeAssignments: true, assignmentInput: '20=custom' });
  const rememberedSource = { kind: 'text', airPath: remembered.document.fileName, ownerDef: '', document: remembered.document, selectionText };
  await remembered.service.run(rememberedSource);
  assert.strictEqual(remembered.service.savedMappings(rememberedSource)[20], 'custom');

  const memoryCancelled = harness({ changeAssignments: true, memoryCancelled: true });
  const memoryResult = await memoryCancelled.service.run({ kind: 'text', airPath: memoryCancelled.document.fileName, document: memoryCancelled.document, selectionText });
  assert.strictEqual(memoryResult.status, 'cancelled');
  assert.strictEqual(memoryCancelled.stored[MAPPING_KEY], undefined);

  const badVisual = harness();
  await assert.rejects(() => badVisual.service.visualSource({ airPath: badVisual.document.fileName, disposed: true }, { pendingGuardPassed: true }), /no longer available/);
  await assert.rejects(() => badVisual.service.visualSource({ airPath: badVisual.document.fileName, disposed: false }, { action: 0, frameIndex: 0, pendingGuardPassed: false }), /Finish or revert/);
  await assert.rejects(() => badVisual.service.visualSource({ airPath: badVisual.document.fileName, disposed: false }, { action: 0, frameIndex: 0, pendingGuardPassed: true, sourceSnapshot: { action: 0, frameIndex: 0, actionText: 'stale' } }), /source changed/);

  const customText = `${original}\n; Authored special\n[Begin Action 777]\n777, 0, 0, 0, 3\n`;
  const customRun = harness({ text: customText, actions: '777', role: 'custom', changeAssignments: true, assignmentInput: '777=custom' });
  const customResult = await customRun.service.run({ kind: 'text', airPath: customRun.document.fileName, document: customRun.document, selectionText });
  assert.strictEqual(customResult.status, 'applied', 'a zero-target custom review must allow assignment before Apply');
  assert.strictEqual(customRun.state.reviewCalls, 2, 'custom assignment is reviewed once empty and once with its explicit target');
  assert.deepStrictEqual(customResult.proposal.changedActions, [777]);

  const excludedRun = harness({ changeAssignments: true, assignmentInput: '20=custom' });
  const excludedSource = { kind: 'text', airPath: excludedRun.document.fileName, ownerDef: '', document: excludedRun.document, selectionText };
  await excludedRun.service.rememberMappings(excludedSource, { 20: 'excluded', 99: 'stand' });
  const excludedResult = await excludedRun.service.run(excludedSource);
  assert.strictEqual(excludedResult.status, 'applied', 'a saved exclusion must remain reassignable in the zero-target review');
  assert.strictEqual(excludedRun.state.reviewCalls, 2);
  assert.strictEqual(excludedRun.service.savedMappings(excludedSource)[99], 'stand', 'remembering a new reviewed assignment preserves unrelated saved assignments');
  assert.strictEqual(excludedRun.service.savedMappings(excludedSource)[20], 'custom');

  const ownerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-clsn2-owner-'));
  try {
    const airPath = path.join(ownerRoot, 'Anim.air'), ryu = path.join(ownerRoot, 'Ryu.def'), ken = path.join(ownerRoot, 'Ken.def');
    fs.writeFileSync(airPath, original);
    fs.writeFileSync(ryu, '[Files]\nanim = Anim.air\n');
    const ownerRun = harness({ airPath });
    const textAdapter = await ownerRun.service.resolveOwnerScope(await ownerRun.service.textSource(ownerRun.state.activeEditor));
    const ownerParsed = actionsIn(ownerRun.document.text), ownerAction = ownerParsed.actions[0];
    const visualAdapter = await ownerRun.service.resolveOwnerScope(await ownerRun.service.visualSource({ airPath, defPath: ryu, disposed: false }, { action: 0, frameIndex: 0, pendingGuardPassed: true, sourceSnapshot: { action: 0, frameIndex: 0, actionText: ownerParsed.lines.slice(ownerAction.start, ownerAction.end).join('\n') } }));
    assert.strictEqual(textAdapter.ownerDef, ryu);
    assert.strictEqual(ownerRun.service.mappingScope(textAdapter), ownerRun.service.mappingScope(visualAdapter), 'actual text and visual adapters resolve the same single owner scope');
    await ownerRun.service.rememberMappings(textAdapter, { 10: 'crouch' });
    assert.strictEqual(ownerRun.service.savedMappings(visualAdapter)[10], 'crouch');

    fs.writeFileSync(ken, '[Files]\nanim = Anim.air\n');
    const sharedRun = harness({ airPath, ownerChoice: 1 });
    const sharedText = await sharedRun.service.resolveOwnerScope(await sharedRun.service.textSource(sharedRun.state.activeEditor));
    assert.strictEqual(sharedText.ownerDef, ryu, 'a shared AIR uses the explicitly chosen DEF instead of a silently inferred first owner');
    const airOnlyRun = harness({ airPath, ownerChoice: 2 });
    const airOnly = await airOnlyRun.service.resolveOwnerScope(await airOnlyRun.service.textSource(airOnlyRun.state.activeEditor));
    assert.strictEqual(airOnly.ownerDef, '', 'shared AIR can explicitly choose AIR-only mapping scope');
    assert.notStrictEqual(sharedRun.service.mappingScope(sharedText), airOnlyRun.service.mappingScope(airOnly));
  } finally { fs.rmSync(ownerRoot, { recursive: true, force: true }); }

  console.log('AIR shared Clsn2 batch service tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
