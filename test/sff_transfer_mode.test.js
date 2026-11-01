'use strict';

const assert = require('assert');
const { createSffTransferMode, capabilityProjection, EFFECTS } = require('../src/sff_transfer_mode');

const hash = character => character.repeat(64);
const endpoint = (name, fingerprint = hash(name === 'ryu' ? 'A' : name === 'ken' ? 'B' : 'C')) => ({ kind: 'sff', entityIdentity: `character:${name}`, fileIdentity: `C:/chars/${name}/${name}.sff`, fingerprint, label: name });
const item = (id, fingerprint = hash('D'), physicalIndex = 0) => ({ id, contentFingerprint: fingerprint, physicalIndex });

function harness(overrides = {}) {
  const calls = { opened: [], closed: [], roles: [], restored: [], reviewed: [], continued: [], writes: 0 }, live = new Map(), evidence = new Map([['ryu', endpoint('ryu')], ['ken', endpoint('ken')], ['chunli', endpoint('chunli')]]), normal = Object.freeze({ identity: 'character:normal', panel: 'ordinary-sff-panel' });
  const key = value => String(value?.entityIdentity || '').split(':').at(-1);
  const services = {
    captureNormalContext: async () => normal,
    resolveEndpoint: async candidate => candidate === 'cancel' ? null : evidence.get(typeof candidate === 'string' ? candidate : key(candidate)) || candidate,
    revalidateEndpoint: async value => evidence.get(key(value)) || value,
    openPinnedEndpoint: async (value, options) => {
      const result = { id: `${options.sessionId}:${options.role}:${key(value)}:${calls.opened.length}`, endpointIdentity: value.identity, role: options.role };
      calls.opened.push({ value, options, result }); live.set(result.id, { result, options }); return result;
    },
    closePinnedEndpoints: async (handles, options) => { calls.closed.push({ handles, options }); for (const handle of handles) { const record = live.get(handle.id); live.delete(handle.id); record?.options.callbacks.closed(handle.id); } },
    guardClose: async () => true,
    restoreNormalContext: async value => { calls.restored.push(value); return true; },
    updateEndpointRoles: async (changes, context) => { calls.roles.push({ changes, context }); },
    buildReview: async input => { calls.reviewed.push(input); return { status: 'ready', reviewFingerprint: input.request.requestIdentity, summary: 'Reviewed exact sprites.' }; },
    continueAssembly: async reference => { calls.continued.push(reference); return { status: 'opened-advanced' }; },
    ...overrides
  };
  return { mode: createSffTransferMode(services), services, calls, evidence, normal, live };
}

(async () => {
  assert.deepStrictEqual(capabilityProjection('source', 2), { role: 'source', pinned: true, readOnly: true, canSelect: true, canCopySelected: true, canAcceptReviewedCopy: false, canMutateSource: false, canApplyTransfer: false, reason: 'Transfer Copy keeps the source endpoint read-only.', effects: EFFECTS });
  assert.strictEqual(capabilityProjection('destination').readOnly, false); assert.strictEqual(capabilityProjection('destination').canApplyTransfer, false, 'the lifecycle foundation owns no destination writer');

  const h = harness();
  const opened = await h.mode.open({ source: 'ryu', destination: 'ken', sessionId: 'sff-transfer-1' });
  assert.strictEqual(opened.status, 'opened'); assert.strictEqual(h.calls.opened.length, 2); assert.strictEqual(h.mode.snapshot().handles.source.role, 'source'); assert.strictEqual(h.mode.snapshot().handles.destination.role, 'destination');
  assert.strictEqual(h.mode.snapshot().normalContextRetained, true); assert.strictEqual(h.calls.writes, 0);
  await assert.rejects(() => h.mode.open({ source: 'ryu', destination: 'chunli' }), /Only one/);

  const sourceHandle = h.mode.snapshot().handles.source.id, destinationHandle = h.mode.snapshot().handles.destination.id;
  h.mode.setSelection('source', [item('0,0'), item('0,1', hash('E'), 1)], sourceHandle);
  assert.strictEqual(h.mode.snapshot().capabilities.source.canCopySelected, true);
  assert.throws(() => h.mode.setSelection('source', [item('0,2')], destinationHandle), /does not match/);
  const copied = await h.mode.reviewSelection('copy-selected', { boundary: { kind: 'between-sprites', id: '10,4', position: 5 } });
  h.mode.cancelReview();
  const dragHarness = harness(); await dragHarness.mode.open({ source: 'ryu', destination: 'ken', sessionId: 'sff-transfer-1' }); dragHarness.mode.setSelection('source', [item('0,0'), item('0,1', hash('E'), 1)], dragHarness.mode.snapshot().handles.source.id);
  const dropped = await dragHarness.mode.reviewSelection('drag-drop', { boundary: { kind: 'between-sprites', id: '10,4', position: 5 } });
  assert.strictEqual(copied.request.requestIdentity, dropped.request.requestIdentity, 'Copy Selected and DnD enter one canonical reviewed-copy path');
  assert.strictEqual(h.calls.reviewed.length, 1); assert.strictEqual(dragHarness.calls.reviewed.length, 1); assert.strictEqual(h.calls.writes, 0);

  const beforeSwap = h.mode.snapshot(); await h.mode.swapSides(); const afterSwap = h.mode.snapshot();
  assert.strictEqual(h.calls.roles.length, 1); assert.strictEqual(afterSwap.handles.source.id, beforeSwap.handles.destination.id); assert.strictEqual(afterSwap.handles.destination.id, beforeSwap.handles.source.id);
  assert.deepStrictEqual(afterSwap.session.selections.destination.map(value => value.id), ['0,0', '0,1']); assert.strictEqual(afterSwap.session.pendingReview, null); assert.deepStrictEqual(afterSwap.session.mappings, []);
  h.live.get(afterSwap.handles.source.id).options.callbacks.selectionChanged([item('700,0')]);
  assert.deepStrictEqual(h.mode.snapshot().session.selections.source.map(value => value.id), ['700,0'], 'endpoint callbacks follow the current role after Swap Sides');
  assert.deepStrictEqual(h.mode.snapshot().session.selections.destination.map(value => value.id), ['0,0', '0,1'], 'swapped callback cannot overwrite the other endpoint selection');

  await h.mode.reviewSelection();
  const continuation = await h.mode.continueInAssembly(); assert.strictEqual(continuation.status, 'opened-advanced'); assert.strictEqual(h.calls.continued.length, 1);
  assert.strictEqual(h.calls.continued[0].source.fileIdentity, afterSwap.session.source.fileIdentity); assert.strictEqual(h.calls.continued[0].session.pendingReview.status, 'ready', 'the receiving adapter gets the exact ready session authority rather than a reconstructed selection'); assert.strictEqual(h.calls.writes, 0, 'Assembly is an explicit callback, never an implicit write');
  const reviewedItem = h.calls.continued[0].request.selection[0], oldDestination = afterSwap.session.destination, rebasedDestination = { kind: oldDestination.kind, entityIdentity: oldDestination.entityIdentity, fileIdentity: oldDestination.fileIdentity, fingerprint: hash('9'), label: oldDestination.label }, recorded = h.mode.finalizeAssemblyResult(h.calls.continued[0].request.requestIdentity, [{ id: reviewedItem.id, status: 'added', destinationId: '700,0', message: 'verified' }], rebasedDestination, [{ sourceId: reviewedItem.id, sourceContentFingerprint: reviewedItem.contentFingerprint, destinationId: '700,0', destinationContentFingerprint: hash('8') }]); assert.strictEqual(recorded.status, 'completed'); assert.strictEqual(h.mode.snapshot().session.pendingReview, null); assert.strictEqual(h.mode.snapshot().session.result.counts.added, 1); assert.strictEqual(h.mode.snapshot().session.destination.fingerprint, hash('9'));
  assert.throws(() => h.mode.finalizeAssemblyResult(h.calls.continued[0].request.requestIdentity, [], rebasedDestination, []), /current ready/);
  h.evidence.set('ryu', endpoint('ryu', hash('9')));

  const changed = await h.mode.changeEndpoint('source', 'chunli'); assert.strictEqual(changed.status, 'changed'); assert.strictEqual(h.mode.snapshot().session.source.entityIdentity, 'character:chunli');
  assert.deepStrictEqual(h.mode.snapshot().session.selections.source, []); assert.strictEqual(h.mode.snapshot().session.pendingReview, null); assert(h.calls.closed.some(call => call.options.reason === 'change-endpoint'));

  const exited = await h.mode.exit(); assert.strictEqual(exited.status, 'exited'); assert.strictEqual(exited.normalContextRestored, true); assert.deepStrictEqual(h.calls.restored, [h.normal]); assert.strictEqual(h.mode.snapshot().active, false); assert.strictEqual(h.calls.writes, 0);

  const cancelDestination = harness(); const cancelled = await cancelDestination.mode.open({ source: 'ryu', destination: 'cancel' }); assert.strictEqual(cancelled.status, 'cancelled'); assert.strictEqual(cancelDestination.calls.opened.length, 0); assert.strictEqual(cancelDestination.mode.snapshot().active, false);

  let openCount = 0; const failedOpen = harness({ openPinnedEndpoint: async (value, options) => { openCount++; if (openCount === 2) throw new Error('destination failed'); return { id: `open-${openCount}`, endpointIdentity: value.identity, role: options.role }; } });
  await assert.rejects(() => failedOpen.mode.open({ source: 'ryu', destination: 'ken' }), /destination failed/); assert.strictEqual(failedOpen.calls.closed.length, 1); assert.strictEqual(failedOpen.calls.closed[0].options.force, true); assert.strictEqual(failedOpen.mode.snapshot().active, false);

  const staleOpen = harness({ resolveEndpoint: async candidate => candidate }); staleOpen.evidence.set('ken', endpoint('ken', hash('9'))); await assert.rejects(() => staleOpen.mode.open({ source: endpoint('ryu'), destination: endpoint('ken') }), /destination SFF endpoint changed/); assert.strictEqual(staleOpen.calls.opened.length, 0);

  const staleReview = harness(); await staleReview.mode.open({ source: 'ryu', destination: 'ken' }); staleReview.mode.setSelection('source', [item('0,0')], staleReview.mode.snapshot().handles.source.id); staleReview.evidence.set('ryu', endpoint('ryu', hash('8'))); await assert.rejects(() => staleReview.mode.reviewSelection(), /source SFF endpoint changed/); assert.strictEqual(staleReview.calls.reviewed.length, 0);

  const guarded = harness({ guardClose: async () => false }); await guarded.mode.open({ source: 'ryu', destination: 'ken' }); const guardedExit = await guarded.mode.exit(); assert.strictEqual(guardedExit.status, 'cancelled'); assert.strictEqual(guarded.calls.closed.length, 0); assert.strictEqual(guarded.calls.restored.length, 0); assert.strictEqual(guarded.mode.snapshot().active, true);
  const guardedChange = await guarded.mode.changeEndpoint('destination', 'chunli'); assert.strictEqual(guardedChange.status, 'cancelled'); assert.strictEqual(guarded.calls.opened.length, 2, 'close cancellation occurs before replacement endpoint opens');

  const closed = harness(); await closed.mode.open({ source: 'ryu', destination: 'ken' }); closed.mode.setSelection('source', [item('0,0')], closed.mode.snapshot().handles.source.id); await closed.mode.reviewSelection(); const closeId = closed.mode.snapshot().handles.source.id; assert.strictEqual(closed.mode.endpointClosed(closeId), true); assert.strictEqual(closed.mode.snapshot().degraded, true); assert.strictEqual(closed.mode.snapshot().session.status, 'cancelled'); assert.strictEqual(closed.mode.snapshot().session.pendingReview, null);

  const roleFailure = harness({ updateEndpointRoles: async () => { throw new Error('role update failed'); } }); await roleFailure.mode.open({ source: 'ryu', destination: 'ken' }); const roleBefore = roleFailure.mode.snapshot(); await assert.rejects(() => roleFailure.mode.swapSides(), /role update failed/); assert.strictEqual(roleFailure.mode.snapshot().session.source.identity, roleBefore.session.source.identity, 'failed host role update leaves model authority unchanged');

  const wrongHandle = harness({ openPinnedEndpoint: async value => ({ id: 'bad', endpointIdentity: value.identity, role: 'destination' }) }); await assert.rejects(() => wrongHandle.mode.open({ source: 'ryu', destination: 'ken' }), /does not match/);

  const noAssembly = harness({ continueAssembly: undefined }); await noAssembly.mode.open({ source: 'ryu', destination: 'ken' }); noAssembly.mode.setSelection('source', [item('0,0')], noAssembly.mode.snapshot().handles.source.id); await noAssembly.mode.reviewSelection(); assert.strictEqual((await noAssembly.mode.continueInAssembly()).status, 'unavailable');

  console.log('SFF Transfer in-memory lifecycle, atomic pins, exact handles, review parity, swap/change, guarded exit, stale rejection and no-write boundary passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
