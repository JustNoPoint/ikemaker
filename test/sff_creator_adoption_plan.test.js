'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { persistenceInput } = require('./sff_creator_candidate_persistence.test');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { persistCreatorCandidate } = require('../src/sff_creator_candidate_persistence');
const { createCreatorAdoptionPlan } = require('../src/sff_creator_adoption_plan');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function adoptionInput(persistInput, persisted, backupBasename) {
  const artifact = Buffer.from(JSON.stringify(persisted.receipt, null, 2));
  return { persistenceInput: persistInput, persistedReceiptArtifactBytes: artifact, expectedPersistedReceiptArtifactByteHash: sha(artifact), expectedPersistedReceiptHash: persisted.receiptHash, expectedCandidateDispatchReceiptHash: persisted.receipt.candidateDispatchReceiptHash, expectedRequestHash: persisted.receipt.requestHash, expectedSpecificationHash: persisted.receipt.specificationHash, expectedApprovalReceiptHash: persisted.receipt.approvalReceiptHash, expectedSourceSnapshotHash: persisted.receipt.sourceSnapshotHash, expectedSourceValidationHash: persisted.receipt.sourceValidationHash, expectedCandidateByteHash: persisted.receipt.candidateByteHash, expectedPersistenceValidationHash: persisted.receipt.persistenceValidationHash, backupBasename };
}
function inventory(directory) { return fs.readdirSync(directory, { withFileTypes: true }).map((item) => `${item.name}:${item.isDirectory() ? 'd' : 'f'}`).sort(); }

function runTests() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-adoption-plan-')); try {
  const evidence = {}, records = {};
  for (const [targetId, kit] of Object.entries(kits)) evidence[targetId] = certification(kit.generate(path.join(root, `cert-${targetId.replace(/[^a-z0-9]/gi, '_')}`)));
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, evidence[targetId]), dispatched = dispatchCreatorApprovedCandidate(fixture.input), activeDir = path.join(root, `active-${targetId.replace(/[^a-z0-9]/gi, '_')}`), staging = path.join(root, `staging-${targetId.replace(/[^a-z0-9]/gi, '_')}`); fs.mkdirSync(activeDir); fs.mkdirSync(staging);
    const active = path.join(activeDir, 'active.sff'); fs.writeFileSync(active, dispatched.readCandidateBytes()); const persistInput = persistenceInput(fixture.input, staging, active, 'candidate.sff'), persisted = persistCreatorCandidate(persistInput), input = adoptionInput(persistInput, persisted, `active-before-${targetId.replace(/[^a-z0-9]/gi, '-')}.sff.bak`);
    const beforeActive = fs.readFileSync(active), beforeCandidate = fs.readFileSync(persisted.stagingCandidatePath), activeInventory = inventory(activeDir), stagingInventory = inventory(staging);
    const plan = createCreatorAdoptionPlan(input), repeat = createCreatorAdoptionPlan(input); records[targetId] = { fixture, dispatched, active, staging, persisted, input, plan };
    assert.strictEqual(plan.planHash, repeat.planHash); assert(Object.isFrozen(plan)); assert.strictEqual(plan.candidate.targetId, targetId); assert.strictEqual(plan.active.inspection.status, 'recognized-supported-profile'); assert.strictEqual(plan.active.driftedSincePersistence, false); assert.strictEqual(plan.comparison.fullRenderEquivalent, targetId === 'sff-v1' ? false : true); assert.strictEqual(plan.reviewRequired, true); assert.strictEqual(plan.humanReviewComplete, false); assert.strictEqual(plan.backupCreated, false); assert.strictEqual(plan.replacementCommitted, false); assert.strictEqual(plan.activeArchiveModified, false); assert.strictEqual(plan.adoptionAllowed, false); assert.strictEqual(plan.byteEqualityRequired, false);
    if (targetId === 'sff-v1') { assert.strictEqual(plan.comparison.categories.paletteValues.changed, 0); assert(plan.comparison.categories.paletteAssignments.unknown > 0); assert(plan.comparison.categories.transparency.unknown > 0); assert.strictEqual(plan.comparison.renderEquivalence, 'unknown'); }
    assert.deepStrictEqual(fs.readFileSync(active), beforeActive); assert.deepStrictEqual(fs.readFileSync(persisted.stagingCandidatePath), beforeCandidate); assert.deepStrictEqual(inventory(activeDir), activeInventory); assert.deepStrictEqual(inventory(staging), stagingInventory);
  }

  const crossActiveDir = path.join(root, 'active-cross-v20-to-v21'), crossStaging = path.join(root, 'staging-cross-v20-to-v21'); fs.mkdirSync(crossActiveDir); fs.mkdirSync(crossStaging);
  const crossActive = path.join(crossActiveDir, 'active.sff'); fs.writeFileSync(crossActive, records['sff-v2.0'].dispatched.readCandidateBytes());
  const crossPersistInput = persistenceInput(records['sff-v2.1'].fixture.input, crossStaging, crossActive, 'candidate.sff'), crossPersisted = persistCreatorCandidate(crossPersistInput), crossPlan = createCreatorAdoptionPlan(adoptionInput(crossPersistInput, crossPersisted, 'active-before-cross.sff.bak'));
  assert.strictEqual(crossPlan.active.inspection.targetId, 'sff-v2.0'); assert.strictEqual(crossPlan.candidate.targetId, 'sff-v2.1'); assert(crossPlan.risks.includes('archive-format-change')); assert.strictEqual(crossPlan.comparison.renderEquivalence, 'equal', 'cross-format rendering is comparable when indexes, RGB values, alpha, axes and dimensions match');

  const emptyActiveDir = path.join(root, 'active-empty'), emptyStaging = path.join(root, 'staging-empty'); fs.mkdirSync(emptyActiveDir); fs.mkdirSync(emptyStaging); const emptyActive = path.join(emptyActiveDir, 'active.sff'); fs.writeFileSync(emptyActive, Buffer.alloc(0));
  const emptyPersistInput = persistenceInput(records['sff-v2.1'].fixture.input, emptyStaging, emptyActive, 'candidate.sff'), emptyPersisted = persistCreatorCandidate(emptyPersistInput), emptyPlan = createCreatorAdoptionPlan(adoptionInput(emptyPersistInput, emptyPersisted, 'active-before-empty.sff.bak'));
  assert.strictEqual(emptyPlan.active.inspection.status, 'unrecognized-or-corrupt'); assert.strictEqual(emptyPlan.requiresElevatedReview, true); assert.strictEqual(emptyPlan.standardAdoptionEligible, false);

  const baseRecord = records['sff-v2.1'], base = baseRecord.input;
  for (const key of ['expectedPersistedReceiptArtifactByteHash', 'expectedPersistedReceiptHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSpecificationHash', 'expectedApprovalReceiptHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedCandidateByteHash', 'expectedPersistenceValidationHash']) assert.throws(() => createCreatorAdoptionPlan({ ...base, [key]: 'f'.repeat(64) }), /hash|authority|drift/i);
  const receipt = JSON.parse(base.persistedReceiptArtifactBytes.toString('utf8')), forged = { ...receipt, adoptionAllowed: true }, forgedBytes = Buffer.from(JSON.stringify(forged)); assert.throws(() => createCreatorAdoptionPlan({ ...base, persistedReceiptArtifactBytes: forgedBytes, expectedPersistedReceiptArtifactByteHash: sha(forgedBytes), expectedPersistedReceiptHash: require('../src/sff_capability_report').hashCanonical(forged) }), /candidate-only authority|upstream authority/);
  const swappedActive = path.join(path.dirname(baseRecord.active), 'other.sff'); fs.writeFileSync(swappedActive, fs.readFileSync(baseRecord.active)); assert.throws(() => createCreatorAdoptionPlan({ ...base, persistenceInput: { ...base.persistenceInput, activeArchivePath: swappedActive } }), /does not match.*destination authority/);
  const collision = path.join(path.dirname(baseRecord.active), 'collision.sff.bak'); fs.writeFileSync(collision, Buffer.from('keep')); const collisionPlan = createCreatorAdoptionPlan({ ...base, backupBasename: path.basename(collision) }); assert(collisionPlan.blockers.includes('backup-path-exists')); assert.strictEqual(fs.readFileSync(collision, 'utf8'), 'keep');
  const activeOriginal = fs.readFileSync(baseRecord.active); fs.writeFileSync(baseRecord.active, Buffer.from('changed active')); const driftPlan = createCreatorAdoptionPlan(base); assert.strictEqual(driftPlan.active.driftedSincePersistence, true); assert(driftPlan.blockers.includes('active-archive-drift')); assert(driftPlan.risks.includes('active-inspection-unrecognized-or-corrupt')); fs.writeFileSync(baseRecord.active, activeOriginal);
  const candidateOriginal = fs.readFileSync(baseRecord.persisted.stagingCandidatePath); fs.writeFileSync(baseRecord.persisted.stagingCandidatePath, Buffer.from('changed candidate')); assert.throws(() => createCreatorAdoptionPlan(base), /candidate bytes drifted/); fs.writeFileSync(baseRecord.persisted.stagingCandidatePath, candidateOriginal);
  for (const bad of ['../escape.bak', 'C:\\escape.bak', 'bad:name.bak', 'CON.bak', 'bad name.bak']) assert.throws(() => createCreatorAdoptionPlan({ ...base, backupBasename: bad }), /backupBasename/);
  assert.throws(() => createCreatorAdoptionPlan({ ...base, approve: true }), /exactly the reviewed fields/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_adoption_plan.js'), 'utf8'); assert(!/\b(?:writeFile|mkdir|unlink|rename|linkSync|spawn|execFile)\b/.test(source));
  console.log('SFF Creator adoption planning revalidates staged and active archives, reports honest semantic risks, and performs zero writes or adoption');
} finally { fs.rmSync(root, { recursive: true, force: true }); } }

if (require.main === module) runTests();
module.exports = { adoptionInput };
