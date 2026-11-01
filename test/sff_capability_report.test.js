'use strict';

const assert = require('assert');
const fs = require('fs');
const childProcess = require('child_process');
const { DISPLAY_STATUSES, backendStatus, createSffCapabilityReport } = require('../src/sff_capability_report');
const { requireSffBackend } = require('../src/sff_backend_registry');

const builtin = requireSffBackend('ikemaker-builtin-sff-v21-png8-prerelease');
const builtin20 = requireSffBackend('ikemaker-builtin-sff-v2.0');
const sprmake20 = requireSffBackend('sprmake2-sff-v2.0');
const sprmaker = requireSffBackend('elecbyte-sprmaker-sff-v1');
const hash = character => character.repeat(64);
const toolEvidence = (backend, targetId, toolHash = hash('a')) => ({
  tool: { available: true, byteHash: toolHash, version: 'reviewed-test-version' },
  targetProbe: {
    status: 'passed', targetId, observedTargetId: targetId, backendId: backend.id,
    adapterId: backend.adapter.id, adapterVersion: backend.adapter.version,
    toolByteHash: toolHash, outputByteHash: hash('b'), validatorId: `strict-${targetId}`,
    validatorVersion: 1, semanticComparisonPassed: true
  }
});

assert.deepStrictEqual(DISPLAY_STATUSES, ['Built-in Certified', 'Built-in Experimental', 'External Ready', 'External Needs Runner', 'Unavailable']);
assert.strictEqual(backendStatus(requireSffBackend('ikemaker-builtin-sff-v1')).display, 'Built-in Experimental');
assert.strictEqual(backendStatus(builtin).display, 'Built-in Experimental');
assert.strictEqual(backendStatus(builtin20).display, 'Built-in Experimental');
assert.strictEqual(backendStatus(builtin, { certification: { status: 'passed', physicalGateSatisfied: true } }).display, 'Built-in Experimental');
const certifiedEvidence = { certification: {
  status: 'passed', backendId: builtin.id, targetId: 'sff-v2.1', adapterId: builtin.adapter.id, adapterVersion: builtin.adapter.version,
  profile: 'sff-v2.1-png8-strict-v2', validation: { valid: true, physicalGateSatisfied: true, adoptionAllowed: false, status: 'physical-evidence-complete-review-required' },
  ledgerHash: hash('1'), manifestHash: hash('2'), currentManifestHash: hash('2')
} };
assert.strictEqual(backendStatus(builtin, certifiedEvidence).display, 'Built-in Experimental', 'caller-authored certification summaries cannot self-certify');
assert.strictEqual(backendStatus(builtin, { certification: { ...certifiedEvidence.certification, currentManifestHash: 'drift' } }).display, 'Built-in Experimental');
assert.strictEqual(backendStatus(sprmake20).display, 'Unavailable');
assert.strictEqual(backendStatus(sprmake20, toolEvidence(sprmake20, 'sff-v2.1')).display, 'Unavailable');
assert.strictEqual(backendStatus(sprmake20, toolEvidence(sprmake20, 'sff-v2.0')).display, 'External Ready');
const sprmakerHash = sprmaker.approvedToolHashes[0];
const sprmakerEvidence = toolEvidence(sprmaker, 'sff-v1', sprmakerHash);
assert.strictEqual(backendStatus(sprmaker, { tool: sprmakerEvidence.tool }).display, 'Unavailable');
assert.strictEqual(backendStatus(sprmaker, { ...sprmakerEvidence, runner: { approved: true, probeStatus: 'passed', binaryHash: hash('3'), sourceHash: hash('4'), manifestHash: hash('5') } }).display, 'Unavailable', 'contract-only SprMaker cannot become ready from caller-authored runner summaries');
assert.strictEqual(backendStatus(sprmaker, { ...sprmakerEvidence, nativeProbe: { status: 'passed', toolByteHash: sprmakerHash } }).display, 'Unavailable', 'contract-only SprMaker cannot become ready from caller-authored native summaries');
assert.strictEqual(backendStatus(sprmaker, { tool: sprmakerEvidence.tool, nativeProbe: { status: 'passed', toolByteHash: sprmakerHash } }).display, 'Unavailable', 'native execution alone does not prove target-specific output');
assert.strictEqual(backendStatus(sprmaker, { ...sprmakerEvidence, tool: { ...sprmakerEvidence.tool, byteHash: hash('f') }, nativeProbe: { status: 'passed', toolByteHash: hash('f') } }).display, 'Unavailable', 'the pinned legacy tool hash is enforced');

const experimental = createSffCapabilityReport({
  targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: ['sprite.indexed8']
});
assert.strictEqual(experimental.status.display, 'Built-in Experimental');
assert.strictEqual(experimental.exactBuildAllowed, false);
assert(experimental.mismatches.some((item) => item.origin === 'certification' && item.disposition === 'block'));

const fabricated = createSffCapabilityReport({
  targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: ['sprite.indexed8'], evidence: certifiedEvidence
});
assert.strictEqual(fabricated.exactBuildAllowed, false);

const unsupported = createSffCapabilityReport({
  targetId: 'sff-v2.0', backendId: sprmake20.id, requiredFeatures: ['sprite.alpha32'],
  evidence: toolEvidence(sprmake20, 'sff-v2.0')
});
assert.strictEqual(unsupported.features['sprite.alpha32'].effective, 'unsupported');
assert.strictEqual(unsupported.mismatches[0].origin, 'target');

const raw20 = createSffCapabilityReport({ targetId: 'sff-v2.0', backendId: builtin20.id, requiredFeatures: ['sprite.indexed8', 'compression.raw8', 'transparency.index0-binary'] });
assert.strictEqual(raw20.features['compression.raw8'].effective, 'supported');
assert.strictEqual(raw20.status.display, 'Built-in Experimental');
assert.strictEqual(raw20.exactBuildAllowed, false, 'implemented structural support remains blocked until exact physical certification evidence is supplied');
const wrong20 = createSffCapabilityReport({ targetId: 'sff-v2.0', backendId: builtin20.id, requiredFeatures: ['compression.png8'] });
assert.strictEqual(wrong20.features['compression.png8'].effective, 'unproven');

const conversion = createSffCapabilityReport({
  targetId: 'sff-v2.0', backendId: sprmake20.id, requiredFeatures: ['sprite.indexed8'],
  evidence: toolEvidence(sprmake20, 'sff-v2.0'),
  conversions: [{ feature: 'sprite.alpha32', detail: 'Quantize only after separate review.' }]
});
assert.strictEqual(conversion.exactBuildAllowed, false);
assert(conversion.mismatches.some((item) => item.disposition === 'separate-reviewed-conversion'));

const repeat = createSffCapabilityReport({
  targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: ['sprite.indexed8'], evidence: certifiedEvidence
});
assert.strictEqual(repeat.snapshotHash, fabricated.snapshotHash);
const drift = createSffCapabilityReport({
  targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: ['sprite.indexed8'], evidence: { ...certifiedEvidence, note: 'changed' }
});
assert.notStrictEqual(drift.snapshotHash, fabricated.snapshotHash);
assert.throws(() => createSffCapabilityReport({ targetId: 'sff-v2.1', backendId: builtin.id, evidence: { bad: Infinity } }), /finite JSON numbers/);
assert.throws(() => createSffCapabilityReport({ targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: 'sprite.indexed8' }), /must be an array/);
assert.throws(() => createSffCapabilityReport({ targetId: 'sff-v2.1', backendId: builtin.id, conversions: [{ feature: 'x', origin: 'guess' }] }), /Invalid conversion mismatch origin/);

let sideEffects = 0;
const originalWrite = fs.writeFileSync, originalSpawn = childProcess.spawn;
fs.writeFileSync = () => { sideEffects += 1; };
childProcess.spawn = () => { sideEffects += 1; };
try {
  createSffCapabilityReport({ targetId: 'sff-v2.1', backendId: builtin.id, requiredFeatures: [] });
} finally {
  fs.writeFileSync = originalWrite; childProcess.spawn = originalSpawn;
}
assert.strictEqual(sideEffects, 0, 'registry/report queries must not write or launch processes');

console.log('SFF capability reports fail closed and derive status from evidence');
