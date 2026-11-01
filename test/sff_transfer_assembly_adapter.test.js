'use strict';

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const { snapshot } = require('../src/sff_view_organization');
const { createTransferSession, setTransferSelection, createTransferRequest, stageTransferReview } = require('../src/asset_transfer_session');
const { createSffTransferAssemblySeed, validateSffTransferAssemblySeed, referenceIdentity } = require('../src/sff_transfer_assembly_adapter');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const archive = (filename, bytes, sprites) => ({ filename, buffer: Buffer.from(bytes), header: { literalDataOffset: 0 }, palettes: [], sprites });
const sourceFile = path.resolve('source.sff'), destinationFile = path.resolve('destination.sff');
const source = archive(sourceFile, 'source-exact-bytes', [
  { index: 0, group: 0, number: 0, axisX: 1, axisY: 2, width: 1, height: 1, format: 0, colorDepth: 32, paletteIndex: 0, dataOffset: 0, dataSize: 1 },
  { index: 1, group: 10, number: 20, axisX: 3, axisY: 4, width: 1, height: 1, format: 0, colorDepth: 32, paletteIndex: 0, dataOffset: 1, dataSize: 1 }
]);
const destination = archive(destinationFile, 'destination-exact-bytes', [
  { index: 0, group: 9, number: 9, axisX: 0, axisY: 0, width: 1, height: 1, format: 0, colorDepth: 32, paletteIndex: 0, dataOffset: 0, dataSize: 1 }
]);
const sourceScope = snapshot(source), destinationScope = snapshot(destination);
const endpoint = (role, filename, fingerprint) => ({ kind: 'sff', entityIdentity: `${role}-entity`, fileIdentity: filename, fingerprint, label: role });
const referenceBody = { baseFile: destinationFile, sourceFile, baseHash: destinationScope.fingerprint, sourceHash: sourceScope.fingerprint };
const reference = { ...referenceBody, identity: referenceIdentity(referenceBody) };
const selectedRow = sourceScope.rows[1], selection = [{ id: `${selectedRow.identity}@${selectedRow.physicalIndex}`, physicalIndex: selectedRow.physicalIndex, label: '10,20 physical 1', contentFingerprint: selectedRow.evidence, metadataFingerprint: selectedRow.topology }];

function reviewed(boundary) {
  let session = createTransferSession({ kind: 'sff', sessionId: 'transfer-session', source: endpoint('source', sourceFile, sourceScope.fingerprint), destination: endpoint('destination', destinationFile, destinationScope.fingerprint) });
  session = setTransferSelection(session, 'source', selection);
  const request = createTransferRequest(session, { method: boundary ? 'drag-drop' : 'copy-selected', boundary });
  return stageTransferReview(session, request, { status: 'ready', reviewFingerprint: request.requestIdentity, summary: 'ready' });
}

const dragSession = reviewed({ kind: 'between-sprites', id: '9,9@0', position: 1 });
const seed = createSffTransferAssemblySeed({ reference, session: dragSession, sourceArchive: source, destinationArchive: destination });
assert.equal(seed.schema, 'ikemaker.sff-transfer-assembly-seed');
assert.deepStrictEqual(seed.sourceSelection.physicalIndices, [1]);
assert.equal(seed.destinationBoundary.placement, 'after');
assert.equal(seed.destinationBoundary.insertionPhysicalIndex, 1);
assert.equal(seed.placementRequired, false);
assert.equal(seed.decisions.paletteCompatibility, 'review-required');
assert.deepStrictEqual(seed.effects, { filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });
assert(Object.isFrozen(seed) && Object.isFrozen(seed.sourceSelection.items[0]));
assert.deepStrictEqual(validateSffTransferAssemblySeed({ seed, reference, sourceArchive: source, destinationArchive: destination }), seed);

const copySeed = createSffTransferAssemblySeed({ reference, session: reviewed(null), sourceArchive: source, destinationArchive: destination });
assert.equal(copySeed.destinationBoundary, null);
assert.equal(copySeed.placementRequired, true, 'Copy Selected must not invent an insertion boundary');

const notReady = { ...dragSession, pendingReview: { ...dragSession.pendingReview, status: 'blocked' } };
assert.throws(() => createSffTransferAssemblySeed({ reference, session: notReady, sourceArchive: source, destinationArchive: destination }), /current ready/);
assert.throws(() => createSffTransferAssemblySeed({ reference: { ...reference, sourceHash: sha('different') }, session: dragSession, sourceArchive: source, destinationArchive: destination }), /reference identity/);

const staleBoundary = reviewed({ kind: 'between-sprites', id: '9,8@0', position: 1 });
assert.throws(() => createSffTransferAssemblySeed({ reference, session: staleBoundary, sourceArchive: source, destinationArchive: destination }), /boundary is stale or mismatched/);

const wrongRow = sourceScope.rows[0], forgedSelection = [{ id: `${wrongRow.identity}@${wrongRow.physicalIndex}`, physicalIndex: wrongRow.physicalIndex, label: 'forged', contentFingerprint: selectedRow.evidence, metadataFingerprint: selectedRow.topology }];
let forged = createTransferSession({ kind: 'sff', sessionId: 'forged-session', source: endpoint('source', sourceFile, sourceScope.fingerprint), destination: endpoint('destination', destinationFile, destinationScope.fingerprint) });
forged = setTransferSelection(forged, 'source', forgedSelection);
const forgedRequest = createTransferRequest(forged, { method: 'copy-selected' });
forged = stageTransferReview(forged, forgedRequest, { status: 'ready', reviewFingerprint: forgedRequest.requestIdentity, summary: 'ready' });
assert.throws(() => createSffTransferAssemblySeed({ reference, session: forged, sourceArchive: source, destinationArchive: destination }), /Source physical sprite evidence/);

const clone = value => JSON.parse(JSON.stringify(value));
const changedSelection = clone(seed); changedSelection.sourceSelection.items[0].label = 'tampered label';
assert.throws(() => validateSffTransferAssemblySeed({ seed: changedSelection, reference, sourceArchive: source, destinationArchive: destination }), /reviewed request identity/);
const changedBoundary = clone(seed); changedBoundary.destinationBoundary.position = 0; changedBoundary.destinationBoundary.placement = 'before'; changedBoundary.destinationBoundary.insertionPhysicalIndex = 0;
assert.throws(() => validateSffTransferAssemblySeed({ seed: changedBoundary, reference, sourceArchive: source, destinationArchive: destination }), /reviewed request identity/);
const changedAuthority = clone(seed); changedAuthority.authority.sourceFingerprint = sha('changed authority');
assert.throws(() => validateSffTransferAssemblySeed({ seed: changedAuthority, reference, sourceArchive: source, destinationArchive: destination }), /authority fingerprints/);
const bypass = clone(seed); bypass.decisions.paletteCompatibility = 'accepted';
assert.throws(() => validateSffTransferAssemblySeed({ seed: bypass, reference, sourceArchive: source, destinationArchive: destination }), /cannot bypass/);
const effect = clone(seed); effect.effects.filesystem = true;
assert.throws(() => validateSffTransferAssemblySeed({ seed: effect, reference, sourceArchive: source, destinationArchive: destination }), /cannot grant/);
const unknown = clone(seed); unknown.authority.extra = true;
assert.throws(() => validateSffTransferAssemblySeed({ seed: unknown, reference, sourceArchive: source, destinationArchive: destination }), /unsupported field extra/);
const staleSource = { ...source, buffer: Buffer.from('stale-source-bytes') };
assert.throws(() => validateSffTransferAssemblySeed({ seed, reference, sourceArchive: staleSource, destinationArchive: destination }), /Source SFF changed/);

const accessorSeed = clone(seed);
Object.defineProperty(accessorSeed.sourceSelection.items[0], 'label', { enumerable: true, get() { throw new Error('getter must not run'); } });
assert.throws(() => validateSffTransferAssemblySeed({ seed: accessorSeed, reference, sourceArchive: source, destinationArchive: destination }), /cannot be an accessor/);

const accessorReference = { baseFile: destinationFile, sourceFile, baseHash: destinationScope.fingerprint, sourceHash: sourceScope.fingerprint };
Object.defineProperty(accessorReference, 'identity', { enumerable: true, get() { throw new Error('getter must not run'); } });
assert.throws(() => createSffTransferAssemblySeed({ reference: accessorReference, session: dragSession, sourceArchive: source, destinationArchive: destination }), /cannot be an accessor/);

const implementation = require('fs').readFileSync(require.resolve('../src/sff_transfer_assembly_adapter'), 'utf8');
for (const forbidden of ['writeFile', 'transactionalWrite', 'workspaceState', "require('vscode')"]) assert(!implementation.includes(forbidden), `adapter must not contain ${forbidden}`);

console.log('SFF Transfer ready-review to exact Assembly seed authority passed');
