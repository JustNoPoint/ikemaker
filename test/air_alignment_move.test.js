'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { moveAirAlignmentLayerText, rebindAirAlignmentProjection, applyAirAlignmentMove, showAirAlignmentLayers, parseAir } = require('../src/air_viewer');
const { createAirAlignmentLayers, digest } = require('../src/air_alignment_layers_model');
Module._load = originalLoad;

const airPath = path.normalize(path.resolve('alignment-move.air'));
const text = '[Begin Action 0]\n0, 0, 10, 20, 4\n\n[Begin Action 5]\n0, 1, -2, 8, 6\n';
const baseInput = { airPath, text, sourceFingerprint: digest(text), base: { action: 0, actionOccurrence: 0, elementIndex: 0 }, alignment: [{ action: 5, actionOccurrence: 0, elementIndex: 0 }], onion: { before: 0, after: 0 }, states: [], primaryKey: null };
const first = createAirAlignmentLayers(baseInput);
const projection = createAirAlignmentLayers({ ...baseInput, states: first.layers.map(layer => ({ key: layer.key, visible: true, selected: true })) });
const moved = moveAirAlignmentLayerText(text, projection, 3, -4);
const actions = parseAir(moved.text);
assert.deepStrictEqual([actions[0].frames[0].x, actions[0].frames[0].y], [13, 16]);
assert.deepStrictEqual([actions[1].frames[0].x, actions[1].frames[0].y], [1, 4]);
assert.strictEqual(moved.targets.length, 2, 'all and only effective move targets are changed by one pure plan');
assert.throws(() => moveAirAlignmentLayerText(text, projection, 0, 0), /at least one non-zero/);
assert.throws(() => moveAirAlignmentLayerText(text, { ...projection, effects: { ...projection.effects, mutationAuthority: true } }, 1, 0), /read-only model/);
assert.strictEqual(text.includes('10, 20'), true, 'planning never mutates its source string');

async function hostAcceptance() {
  const makeDocument = () => ({ fileName: airPath, version: 7, getText() { return this.text; }, text });
  const request = { ...baseInput, dx: 3, dy: -4, states: projection.layers.map(layer => ({ key: layer.key, visible: true, selected: true })) };
  const run = async ({ answer = true, beforeAnswer, onOpen, document = makeDocument(), moveRequest = request } = {}) => {
    const session = { airPath, sourceMutationBusy: false, sourceSaveBusy: false, panel: { webview: { postMessage: async () => true } } };
    let replaceCount = 0, finishCount = 0, replacement = '', openCount = 0;
    const services = {
      session,
      workspace: { openTextDocument: async () => { openCount += 1; if (onOpen) await onOpen({ session, document, openCount }); return document; } },
      window: { showWarningMessage: async (...args) => { if (beforeAnswer) beforeAnswer({ session, document }); return answer ? args[2] : undefined; } },
      replaceAirDocument: async (_session, updated, authority) => { replaceCount += 1; replacement = updated; assert.strictEqual(authority.document, document); assert.strictEqual(authority.version, 7); assert.strictEqual(authority.text, text); return document; },
      finishFrameEdit: async () => { finishCount += 1; }
    };
    let result, error;
    try { result = await applyAirAlignmentMove(airPath, moveRequest, services); } catch (caught) { error = caught; }
    return { result, error, replaceCount, finishCount, replacement, session };
  };

  const success = await run();
  assert.strictEqual(success.error, undefined);
  assert.strictEqual(success.result.status, 'applied');
  assert.strictEqual(success.replaceCount, 1, 'a successful multi-target move submits exactly one document edit');
  assert.strictEqual(success.finishCount, 1);
  assert.strictEqual(success.result.continuation.sourceFingerprint, digest(success.replacement));
  assert(success.result.continuation.states.every(item => /^[A-F0-9]{64}$/.test(item.key)), 'the host returns only fresh exact keys for the verified resulting text');
  const applied = parseAir(success.replacement);
  assert.deepStrictEqual([applied[0].frames[0].x, applied[0].frames[0].y, applied[1].frames[0].x, applied[1].frames[0].y], [13, 16, 1, 4]);

  const cancelled = await run({ answer: false });
  assert.strictEqual(cancelled.result.status, 'cancelled');
  assert.strictEqual(cancelled.replaceCount, 0, 'cancelling the modal never edits the AIR source');

  const drifted = await run({ beforeAnswer: ({ document }) => { document.text += '\n; changed during review'; document.version += 1; } });
  assert.match(drifted.error.message, /changed while.*reviewed/i);
  assert.strictEqual(drifted.replaceCount, 0, 'source drift during review fails before the edit owner runs');

  const raced = await run({ beforeAnswer: ({ session }) => { session.sourceMutationBusy = true; } });
  assert.match(raced.error.message, /another AIR edit or save started/i);
  assert.strictEqual(raced.replaceCount, 0, 'a competing edit acquired during confirmation fails closed');

  const racedDuringReopen = await run({ onOpen: ({ session, openCount }) => { if (openCount === 2) session.sourceSaveBusy = true; } });
  assert.match(racedDuringReopen.error.message, /another AIR edit or save started/i);
  assert.strictEqual(racedDuringReopen.replaceCount, 0, 'a save acquiring ownership during the post-review document reopen also fails closed');

  const initial = createAirAlignmentLayers(baseInput);
  const noneSelected = { ...request, states: initial.layers.map(layer => ({ key: layer.key, visible: true, selected: false })) };
  const zero = await run({ moveRequest: noneSelected });
  assert.match(zero.error.message, /select at least one visible/i);
  assert.strictEqual(zero.replaceCount, 0, 'zero selected layers never falls back to moving Base');

  let releaseDocument;
  const delayedDocument = new Promise(resolve => { releaseDocument = resolve; });
  let latest = 'A'; const messages = [];
  const staleSession = { airPath, byKey: new Map(), archive: {}, panel: { webview: { postMessage: async message => { messages.push(message); return true; } } } };
  const stalePreview = showAirAlignmentLayers(airPath, projection, () => latest === 'A', { session: staleSession, workspace: { textDocuments: [], openTextDocument: async () => delayedDocument } });
  latest = 'B'; releaseDocument(makeDocument());
  const staleResult = await stalePreview;
  assert.strictEqual(staleResult.stale, true);
  assert.deepStrictEqual(messages, [], 'a delayed superseded preview can neither select an Action nor publish an overlay');

  const richText = '[Begin Action 0]\n0, 0, 0, 0, 4\n0, 1, 2, 3, 4\n0, 2, 4, 6, 4\n\n[Begin Action 5]\n5, 0, 8, 9, 4\n';
  const richInput = { airPath, text: richText, sourceFingerprint: digest(richText), base: { action: 0, actionOccurrence: 0, elementIndex: 1 }, alignment: [{ action: 5, actionOccurrence: 0, elementIndex: 0 }], onion: { before: 1, after: 1 }, states: [], primaryKey: null };
  const richSeed = createAirAlignmentLayers(richInput), byKind = kind => richSeed.layers.find(layer => layer.kind === kind), before = richSeed.layers.find(layer => layer.relation === 'previous'), after = richSeed.layers.find(layer => layer.relation === 'next'), alignment = byKind('alignment');
  const richProjection = createAirAlignmentLayers({ ...richInput, states: richSeed.layers.map(layer => ({ key: layer.key, visible: layer !== after, selected: layer.kind === 'base' || layer.kind === 'alignment' || layer === after })), primaryKey: alignment.key });
  const richPlan = moveAirAlignmentLayerText(richText, richProjection, 1, 2), continuation = rebindAirAlignmentProjection(richPlan.text, richProjection, richInput), rebound = createAirAlignmentLayers({ ...richInput, text: richPlan.text, sourceFingerprint: continuation.sourceFingerprint, states: continuation.states, primaryKey: continuation.primaryKey });
  const logical = layer => `${layer.kind}|${layer.identity.action}|${layer.identity.actionOccurrence}|${layer.identity.elementIndex}`;
  const oldByLogical = new Map(richProjection.layers.map(layer => [logical(layer), layer]));
  for (const layer of rebound.layers) {
    const old = oldByLogical.get(logical(layer));
    assert.strictEqual(layer.visible, old.visible); assert.strictEqual(layer.selected, old.selected);
    if (old.effectiveMoveTarget) assert.notStrictEqual(layer.key, old.key, 'moved exact elements receive fresh identities');
  }
  assert.strictEqual(logical(rebound.layers.find(layer => layer.primary)), logical(alignment), 'primary identity is rebound by exact descriptor');
  assert.strictEqual(rebound.layers.find(layer => logical(layer) === logical(before)).selected, false, 'visible unselected onion semantics survive');
  assert.strictEqual(rebound.layers.find(layer => logical(layer) === logical(after)).visible, false, 'hidden selected onion semantics survive without becoming a move target');
}

hostAcceptance().then(() => console.log('AIR Alignment Layers move owner is exact, single-edit, cancellation-safe, race-safe, and source-pure')).catch(error => { console.error(error); process.exitCode = 1; });
