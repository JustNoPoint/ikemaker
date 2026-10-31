'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { airTransferSelectionItems, analyzeAirTransfer } = require('../src/air_transfer_model');
const { resolveAirTransfer } = require('../src/air_transfer_resolution');
const { parseAir } = require('../src/air_preview_model');
const { createTransferSession, createTransferRequest, stageTransferReview, finalizeTransferApply } = require('../src/asset_transfer_session');
const { createAirTransferSffContinuation, acceptFinalizedSffTransfer } = require('../src/air_transfer_sff_adapter');

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function frozen(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) frozen(item, seen); return Object.freeze(value); }
function clone(value, edit) { const result = JSON.parse(JSON.stringify(value)); edit(result); return frozen(result); }
function endpoint(role, fingerprint) { return { kind: 'sff', entityIdentity: `character:${role}`, fileIdentity: `C:/${role}.sff`, fingerprint, label: role }; }
function selection(id, physicalIndex, content) { return { id, physicalIndex, label: id, contentFingerprint: hash(content), metadataFingerprint: hash(`meta:${content}`) }; }

const airSource = `[Begin Action 0]\n0,0,0,0,2\n2,3,0,0,1\n`, airSelection = airTransferSelectionItems(airSource, [0]);
const airReview = analyzeAirTransfer({
  sourceText: airSource, destinationText: '', selection: airSelection, dependencyMode: 'animation-with-sprites',
  sourceSff: { sprites: [{ index: 0, group: 0, number: 0 }, { index: 4, group: 2, number: 3 }] }, destinationSff: { sprites: [] }
});
const sourceFingerprint = hash('source-sff'), beforeDestinationFingerprint = hash('destination-before'), afterDestinationFingerprint = hash('destination-after');
const sourceSelection = [selection('0,0@0', 0, 'sprite-a'), selection('2,3@4', 4, 'sprite-b')];
let session = createTransferSession({ kind: 'sff', sessionId: 'air-sff-session', source: endpoint('source', sourceFingerprint), destination: endpoint('destination', beforeDestinationFingerprint), sourceSelection, destinationSelection: [] });
const request = createTransferRequest(session, { method: 'copy-selected' });
session = stageTransferReview(session, request, { status: 'ready', reviewFingerprint: request.requestIdentity, summary: 'ready' });
const continuation = createAirTransferSffContinuation({ airReview, sffSession: session });
assert.equal(continuation.dependencies.length, 2); assert.equal(continuation.dependencies[1].sourceId, '2,3@4'); assert(Object.isFrozen(continuation.dependencies[0])); assert(/^[A-F0-9]{64}$/.test(continuation.continuationIdentity));

const details = [
  { id: '0,0@0', status: 'added', destinationId: '20,1', message: 'added' },
  { id: '2,3@4', status: 'replaced', destinationId: '21,7', message: 'replaced' }
];
const mappings = [
  { sourceId: '0,0@0', sourceContentFingerprint: sourceSelection[0].contentFingerprint, destinationId: '20,1', destinationContentFingerprint: hash('destination-a') },
  { sourceId: '2,3@4', sourceContentFingerprint: sourceSelection[1].contentFingerprint, destinationId: '21,7', destinationContentFingerprint: hash('destination-b') }
];
const finalized = finalizeTransferApply(session, request, details, endpoint('destination', afterDestinationFingerprint), mappings);
const receipt = acceptFinalizedSffTransfer({ continuation, sffSession: finalized });
assert.deepStrictEqual(receipt.spriteMappings, [
  { sourceId: '0,0', destinationGroup: 20, destinationIndex: 1, verified: true },
  { sourceId: '2,3', destinationGroup: 21, destinationIndex: 7, verified: true }
]);
assert.equal(receipt.destinationEndpoint.fingerprint, afterDestinationFingerprint); assert(Object.isFrozen(receipt.spriteMappings)); assert(/^[A-F0-9]{64}$/.test(receipt.receiptIdentity));
const airPlan = resolveAirTransfer({ review: airReview, sourceText: airSource, destinationText: '', decisions: [{ id: airReview.items[0].id, identity: 'preserve-action', copyDependency: 'preserve-copy' }], spriteMappings: receipt.spriteMappings });
assert.equal(airPlan.status, 'ready'); assert.deepStrictEqual(parseAir(airPlan.outputText)[0].frames.map(frame => [frame.group, frame.index]), [[20, 1], [21, 7]], 'the adapter emits the exact mapping shape consumed by AIR resolution');

assert.throws(() => createAirTransferSffContinuation({ airReview, sffSession: createTransferSession({ kind: 'sff', sessionId: 'not-ready', source: endpoint('source', sourceFingerprint), destination: endpoint('destination', beforeDestinationFingerprint), sourceSelection, destinationSelection: [] }) }), /ready SFF Transfer review/);
const wrongPhysicalSession = (() => { let value = createTransferSession({ kind: 'sff', sessionId: 'wrong-physical', source: endpoint('source', sourceFingerprint), destination: endpoint('destination', beforeDestinationFingerprint), sourceSelection: [selection('0,0@8', 8, 'sprite-a'), sourceSelection[1]], destinationSelection: [] }); const review = createTransferRequest(value, { method: 'copy-selected' }); return stageTransferReview(value, review, { status: 'ready', reviewFingerprint: review.requestIdentity, summary: 'ready' }); })();
assert.throws(() => createAirTransferSffContinuation({ airReview, sffSession: wrongPhysicalSession }), /exact Source occurrence/);

assert.throws(() => acceptFinalizedSffTransfer({ continuation: JSON.parse(JSON.stringify(continuation)), sffSession: finalized }), /mutable/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { value.result.status = 'failed'; value.result.counts.failed = 1; value.result.requiresRecovery = true; }) }), /successful finalized/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { value.mappings = value.mappings.slice(0, 1); }) }), /no exact verified mapping.*2,3/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { value.mappings[0].sourceContentFingerprint = hash('wrong-source-content'); }) }), /content evidence|no exact verified mapping.*0,0/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { value.mappings[0].destinationEndpointFingerprint = beforeDestinationFingerprint; }) }), /exact reviewed endpoints/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { const mapping = value.mappings[0]; mapping.destinationId = '-1,3'; value.result.details[0].destinationId = '-1,3'; const evidence = { ...mapping }; delete evidence.evidenceFingerprint; mapping.evidenceFingerprint = hash(canonical(evidence)); }) }), /non-negative Destination/);
assert.throws(() => acceptFinalizedSffTransfer({ continuation, sffSession: clone(finalized, value => { value.sessionId = 'other-session'; }) }), /handoff generation/);

let getterRuns = 0; const hostile = {}; Object.defineProperty(hostile, 'continuation', { enumerable: true, get() { getterRuns += 1; return continuation; } });
assert.throws(() => acceptFinalizedSffTransfer(hostile), /accessor|plain data/i); assert.equal(getterRuns, 0);

console.log('AIR/SFF continuation accepts only exact successful finalized SFF mappings and emits resolution-ready sprite remaps');
