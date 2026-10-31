'use strict';

const assert = require('assert');
const api = require('../src/asset_transfer_session');

const hash = character => character.repeat(64);
const endpoint = (role, suffix, kind = 'sff') => ({ kind, entityIdentity: `character:${suffix}`, fileIdentity: `C:/chars/${suffix}/${suffix}.${kind}`, fingerprint: hash(role === 'source' ? 'A' : 'B'), label: `${suffix} ${kind.toUpperCase()}` });
const item = (id, character = 'C', physicalIndex) => ({ id, contentFingerprint: hash(character), ...(physicalIndex === undefined ? {} : { physicalIndex }) });
const seed = () => api.createTransferSession({ kind: 'sff', sessionId: 'session-1', source: endpoint('source', 'ryu'), destination: endpoint('destination', 'ken'), sourceSelection: [item('0,0', 'C', 0), item('0,1', 'D', 1)] });

let session = seed();
assert(Object.isFrozen(session) && Object.isFrozen(session.source) && Object.isFrozen(session.selections.source));
assert.strictEqual(session.source.role, 'source'); assert.strictEqual(session.destination.role, 'destination');
assert.strictEqual(session.source.pinned, true); assert.strictEqual(session.destination.pinned, true);
assert.deepStrictEqual(session.effects, { filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });
assert.throws(() => api.createTransferSession({ kind: 'sff', source: endpoint('source', 'same'), destination: endpoint('source', 'same') }), /different exact endpoints/);
assert.throws(() => api.createTransferSession({ kind: 'sff', source: endpoint('source', 'ryu'), destination: { ...endpoint('destination', 'ken'), fileIdentity:endpoint('source','ryu').fileIdentity } }), /different physical asset files/);
assert.throws(() => api.createTransferSession({ kind: 'sff', source: endpoint('source', 'ryu'), destination: endpoint('destination', 'ken', 'air') }), /session asset kind/);

const copied = api.createTransferRequest(session, { method: 'copy-selected', boundary: { kind: 'between-sprites', id: '0,9', position: 10 } });
const dropped = api.createTransferRequest(session, { method: 'drag-drop', boundary: { kind: 'between-sprites', id: '0,9', position: 10 } });
assert.strictEqual(copied.requestIdentity, dropped.requestIdentity, 'Copy Selected and drag/drop share one canonical reviewed-copy identity');
assert.notStrictEqual(copied.initiatedBy, dropped.initiatedBy, 'the initiating affordance remains available for telemetry/presentation');
assert.strictEqual(api.requestStillCurrent(session, copied), true);

const selected = api.setTransferSelection(session, 'source', [item('1,0', 'E', 2)]);
assert.strictEqual(api.requestStillCurrent(selected, copied), false, 'selection changes invalidate pending request authority');
assert.strictEqual(selected.pendingReview, null); assert.strictEqual(selected.revision, session.revision + 1);

session = api.stageTransferReview(session, copied, { status: 'ready', reviewFingerprint: hash('F'), summary: 'Two additions reviewed.' });
assert(Object.isFrozen(session.pendingReview));
const cancelledReview = api.cancelTransferReview(session);
assert.strictEqual(cancelledReview.pendingReview, null); assert.deepStrictEqual(cancelledReview.effects, session.effects, 'cancel has no mutation or persistence effect');

session = api.rememberTransferMapping(session, { sourceId: '0,0', sourceContentFingerprint: hash('C'), destinationId: '700,0', destinationContentFingerprint: hash('9'), paletteFingerprint: hash('8') });
assert(api.reusableTransferMapping(session, '0,0', hash('C'), hash('8')));
assert.strictEqual(api.reusableTransferMapping(session, '0,0', hash('D'), hash('8')), null, 'content drift prevents mapping reuse');
assert.strictEqual(api.reusableTransferMapping(session, '0,0', hash('C'), hash('7')), null, 'palette evidence drift prevents mapping reuse');

const beforeSwap = session, swapped = api.swapTransferEndpoints(session);
assert.strictEqual(swapped.source.fileIdentity, beforeSwap.destination.fileIdentity);
assert.strictEqual(swapped.destination.fileIdentity, beforeSwap.source.fileIdentity);
assert.deepStrictEqual(swapped.selections.destination.map(value => value.id), beforeSwap.selections.source.map(value => value.id), 'selection remains attached to its endpoint across Swap Sides');
assert.deepStrictEqual(swapped.mappings, []); assert.strictEqual(swapped.pendingReview, null); assert.strictEqual(swapped.generation, beforeSwap.generation + 1);

const changed = api.changeTransferEndpoint(beforeSwap, 'destination', endpoint('destination', 'chunli'));
assert.deepStrictEqual(changed.selections.destination, []); assert.deepStrictEqual(changed.mappings, []); assert.strictEqual(changed.pendingReview, null);
assert.strictEqual(api.requestStillCurrent(changed, copied), false, 'endpoint changes invalidate the prior request');

const reviewedRequest = api.createTransferRequest(changed, { method: 'copy-selected' });
const reviewed = api.stageTransferReview(changed, reviewedRequest, { status: 'ready', reviewFingerprint: hash('1'), summary: 'Reviewed exact SFF endpoints.' });
const projected = api.projectTransferResult(reviewed, reviewedRequest, [{ id: '0,0', destinationId: '700,0', status: 'added', message: 'Added.' }, { id: '0,1', status: 'failed', message: 'Palette dependency changed.' }]);
assert.strictEqual(projected.status, 'partial-failure'); assert.strictEqual(projected.counts.added, 1); assert.strictEqual(projected.counts.failed, 1);
assert.strictEqual(projected.sourceUnchanged, true); assert.strictEqual(projected.requiresRecovery, true); assert.strictEqual(projected.effects.destinationMutation, false, 'the foundation only projects results and owns no writer');
const recorded = api.recordTransferResult(reviewed, reviewedRequest, projected.details);
assert.strictEqual(recorded.result.status, 'partial-failure'); assert.strictEqual(recorded.pendingReview, null);

let finalizable = api.setTransferSelection(seed(), 'source', [item('0,0', 'C', 0)]), finalRequest = api.createTransferRequest(finalizable, { method: 'copy-selected' });
finalizable = api.stageTransferReview(finalizable, finalRequest, { status: 'ready', reviewFingerprint: finalRequest.requestIdentity, summary: 'ready' });
const rebasedDestination = { ...endpoint('destination', 'ken'), fingerprint: hash('9') }, finalized = api.finalizeTransferApply(finalizable, finalRequest, [{ id: '0,0', status: 'added', destinationId: '700,0', message: 'verified' }], rebasedDestination, [{ sourceId: '0,0', sourceContentFingerprint: hash('C'), destinationId: '700,0', destinationContentFingerprint: hash('8'), paletteFingerprint: hash('7'), destinationPhysicalIndex: 3, destinationPhysicalOccurrence: 1 }]);
assert.strictEqual(finalized.destination.fingerprint, hash('9')); assert.strictEqual(finalized.result.status, 'completed'); assert.strictEqual(finalized.mappings.length, 1); assert.strictEqual(finalized.mappings[0].destinationPhysicalIndex,3);assert.strictEqual(finalized.mappings[0].destinationPhysicalOccurrence,1); assert.strictEqual(finalized.generation, finalizable.generation + 1); assert(api.reusableTransferMapping(finalized, '0,0', hash('C'), hash('7')));
assert.throws(() => api.finalizeTransferApply(finalizable, finalRequest, [{ id: '0,0', status: 'added', destinationId: '700,0', message: 'verified' }], rebasedDestination, [{ sourceId: '0,0', sourceContentFingerprint: hash('C'), destinationId: '700,0', destinationContentFingerprint: hash('8'), destinationPhysicalIndex: 3 }]), /provided together/);
assert.throws(() => api.finalizeTransferApply(finalizable, finalRequest, [{ id: '0,0', status: 'added', destinationId: '700,0', message: 'verified' }], { ...rebasedDestination, fileIdentity: 'other.sff' }, []), /same exact Destination/);
assert.throws(() => api.finalizeTransferApply(finalizable, finalRequest, [{ id: '0,0', status: 'failed', message: 'failed' }], rebasedDestination, []), /cannot rebase/);

const cancelled = api.cancelTransferSession(recorded);
assert.strictEqual(cancelled.status, 'cancelled'); assert.deepStrictEqual(cancelled.mappings, []); assert.strictEqual(cancelled.result, null);
assert.throws(() => api.createTransferRequest(cancelled), /cancelled/);
assert.strictEqual(api.cancelTransferSession(cancelled), cancelled, 'repeated cancellation is an idempotent no-op');

assert.throws(() => api.createTransferRequest(api.setTransferSelection(seed(), 'source', [])), /Select at least one/);
assert.throws(() => api.setTransferSelection(seed(), 'source', [item('0,0', 'C', 0), item('0,0', 'D', 0)]), /duplicate exact item/);
assert.throws(() => api.setTransferSelection(seed(), 'source', Array.from({ length: api.MAX_SELECTION + 1 }, (_, index) => item(String(index)))), /at most/);
assert.throws(() => api.createTransferSession({ kind: 'sff', source: { ...endpoint('source', 'ryu'), extra: true }, destination: endpoint('destination', 'ken') }), /unsupported field/);
assert.throws(() => api.createTransferSession({ kind: 'sff', source: { ...endpoint('source', 'ryu'), fingerprint: 'not-a-hash' }, destination: endpoint('destination', 'ken') }), /SHA-256/);

let accessorRuns = 0; const hostile = { kind: 'sff', entityIdentity: 'hostile', fileIdentity: 'hostile.sff', fingerprint: hash('A'), label: 'Hostile' };
Object.defineProperty(hostile, 'extra', { enumerable: true, get() { accessorRuns++; return 'value'; } });
assert.throws(() => api.createTransferSession({ kind: 'sff', source: hostile, destination: endpoint('destination', 'ken') }), /accessor/);
assert.strictEqual(accessorRuns, 0, 'validation never executes hostile accessors');
const inherited = Object.create({ extra: true }); Object.assign(inherited, endpoint('source', 'ryu'));
assert.throws(() => api.createTransferSession({ kind: 'sff', source: inherited, destination: endpoint('destination', 'ken') }), /plain object/);
const nullPrototype = Object.assign(Object.create(null), endpoint('source', 'ryu'));
assert.doesNotThrow(() => api.createTransferSession({ kind: 'sff', source: nullPrototype, destination: endpoint('destination', 'ken') }), 'safe null-prototype records remain admissible');

console.log('Asset Transfer exact endpoint, request parity, invalidation, mapping, result, bounds and hostile-input foundation passed');
