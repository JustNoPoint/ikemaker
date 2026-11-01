'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { persistenceInput } = require('./sff_creator_candidate_persistence.test');
const { adoptionInput } = require('./sff_creator_adoption_plan.test');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { persistCreatorCandidate } = require('../src/sff_creator_candidate_persistence');
const { createCreatorAdoptionPlan } = require('../src/sff_creator_adoption_plan');
const { CONFIRMATION_KEYS, approveCreatorAdoptionPlan } = require('../src/sff_creator_adoption_approval');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function categories(plan) { return Object.keys(plan.comparison.categories).sort().map((id) => { const row = plan.comparison.categories[id]; return { id, changed: row.changed, added: row.added, removed: row.removed, unknown: row.unknown }; }); }
function decision(plan) { return { status: 'approved', approvalMode: plan.risks.length ? 'elevated' : 'standard', planHash: plan.planHash, candidate: JSON.parse(JSON.stringify(plan.candidate)), active: { path: plan.active.path, realpath: plan.active.realpath, identity: plan.active.identity, byteHash: plan.active.byteHash, byteLength: plan.active.byteLength, inspectionStatus: plan.active.inspection.status, inspectionTargetId: plan.active.inspection.targetId, recognizedVersion: plan.active.inspection.recognizedVersion, driftedSincePersistence: plan.active.driftedSincePersistence }, comparison: { semanticEquivalence: plan.comparison.semanticEquivalence, renderEquivalence: plan.comparison.renderEquivalence, categories: categories(plan) }, format: { activeTargetId: plan.active.inspection.targetId, activeRecognizedVersion: plan.active.inspection.recognizedVersion, candidateTargetId: plan.candidate.targetId, formatRelation: plan.active.inspection.targetId == null ? 'unknown' : plan.active.inspection.targetId === plan.candidate.targetId ? 'same' : 'changed', activeInspectionStatus: plan.active.inspection.status }, paths: JSON.parse(JSON.stringify(plan.proposedPaths)), rollback: JSON.parse(JSON.stringify(plan.rollback)), acknowledgedRiskIds: [...plan.risks], confirmations: Object.fromEntries(CONFIRMATION_KEYS.map((key) => [key, true])) }; }
function approvalInput(planInput, plan, approvalDecision = decision(plan)) { const artifact = Buffer.from(JSON.stringify(plan, null, 2)); return { adoptionPlanInput: planInput, adoptionPlanArtifactBytes: artifact, expectedAdoptionPlanArtifactByteHash: sha(artifact), expectedAdoptionPlanHash: plan.planHash, approvalDecision }; }
function buildChain(targetId, root, evidence, activeBytes = null, suffix = '') {
  const fixture = buildFixture(targetId, evidence), dispatched = dispatchCreatorApprovedCandidate(fixture.input), label = `${targetId.replace(/[^a-z0-9]/gi, '_')}${suffix}`, activeDir = path.join(root, `active-${label}`), staging = path.join(root, `staging-${label}`); fs.mkdirSync(activeDir); fs.mkdirSync(staging); const active = path.join(activeDir, 'active.sff'); fs.writeFileSync(active, dispatched.readCandidateBytes());
  if (activeBytes != null) fs.writeFileSync(active, activeBytes);
  const persistInput = persistenceInput(fixture.input, staging, active), persisted = persistCreatorCandidate(persistInput), planInput = adoptionInput(persistInput, persisted, `active-${targetId.replace(/[^a-z0-9]/gi, '-')}.bak`), plan = createCreatorAdoptionPlan(planInput); return { activeDir, staging, active, persisted, planInput, plan };
}
function inventory(directory) { return fs.readdirSync(directory).sort(); }

function runTests() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-adoption-approval-')); try {
  const evidence = {}; for (const targetId of ['sff-v1', 'sff-v2.1']) evidence[targetId] = certification(kits[targetId].generate(path.join(root, `cert-${targetId.replace(/[^a-z0-9]/gi, '_')}`)));
  const standard = buildChain('sff-v2.1', root, evidence['sff-v2.1']), elevated = buildChain('sff-v1', root, evidence['sff-v1']), unknownFormat = buildChain('sff-v2.1', root, evidence['sff-v2.1'], Buffer.from('not a recognized SFF archive'), '-unknown');
  assert.strictEqual(standard.plan.risks.length, 0); assert(elevated.plan.risks.includes('semantic-comparison-has-unknowns'));
  for (const record of [standard, elevated]) {
    const input = approvalInput(record.planInput, record.plan), activeBefore = fs.readFileSync(record.active), candidateBefore = fs.readFileSync(record.persisted.stagingCandidatePath), activeInventory = inventory(record.activeDir), stagingInventory = inventory(record.staging);
    const result = approveCreatorAdoptionPlan(input), repeat = approveCreatorAdoptionPlan(input); assert.strictEqual(result.receiptHash, repeat.receiptHash); assert(Object.isFrozen(result)); assert(Object.isFrozen(result.receipt)); assert.strictEqual(result.receipt.approvalMode, record.plan.risks.length ? 'elevated' : 'standard'); assert.strictEqual(result.receipt.adoptionPlanApproved, true); assert.strictEqual(result.receipt.humanReviewComplete, true); assert.strictEqual(result.receipt.currentStateGuaranteed, false); assert.strictEqual(result.receipt.executionAllowed, false); assert.strictEqual(result.receipt.backupCreated, false); assert.strictEqual(result.receipt.replacementCommitted, false); assert.strictEqual(result.receipt.activeArchiveModified, false); assert.strictEqual(result.receipt.adoptionAllowed, false); assert.strictEqual(result.receipt.byteEqualityRequired, false);
    assert.deepStrictEqual(fs.readFileSync(record.active), activeBefore); assert.deepStrictEqual(fs.readFileSync(record.persisted.stagingCandidatePath), candidateBefore); assert.deepStrictEqual(inventory(record.activeDir), activeInventory); assert.deepStrictEqual(inventory(record.staging), stagingInventory);
  }
  const base = approvalInput(standard.planInput, standard.plan), reordered = Buffer.from(JSON.stringify({ planHash: standard.plan.planHash, ...standard.plan }, null, 4)); assert(approveCreatorAdoptionPlan({ ...base, adoptionPlanArtifactBytes: reordered, expectedAdoptionPlanArtifactByteHash: sha(reordered) }));
  assert.throws(() => approveCreatorAdoptionPlan({ ...base, expectedAdoptionPlanArtifactByteHash: 'f'.repeat(64) }), /artifact byte hash/); assert.throws(() => approveCreatorAdoptionPlan({ ...base, expectedAdoptionPlanHash: 'f'.repeat(64) }), /plan hash/i);
  const forged = { ...standard.plan, activeArchiveModified: true }; forged.planHash = require('../src/sff_capability_report').hashCanonical({ ...forged, planHash: undefined }); const forgedBytes = Buffer.from(JSON.stringify(forged)); assert.throws(() => approveCreatorAdoptionPlan({ ...base, adoptionPlanArtifactBytes: forgedBytes, expectedAdoptionPlanArtifactByteHash: sha(forgedBytes), expectedAdoptionPlanHash: forged.planHash }), /claims approval|does not exactly match/);
  const badMode = decision(standard.plan); badMode.approvalMode = 'elevated'; assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: badMode }), /must be standard/);
  const badRisk = decision(elevated.plan); badRisk.acknowledgedRiskIds = []; assert.throws(() => approveCreatorAdoptionPlan({ ...approvalInput(elevated.planInput, elevated.plan), approvalDecision: badRisk }), /exact plan risk list/);
  const duplicateRisk = decision(elevated.plan); duplicateRisk.acknowledgedRiskIds.push(duplicateRisk.acknowledgedRiskIds[0]); assert.throws(() => approveCreatorAdoptionPlan({ ...approvalInput(elevated.planInput, elevated.plan), approvalDecision: duplicateRisk }), /exact plan risk list/);
  const unknownApproval = approveCreatorAdoptionPlan(approvalInput(unknownFormat.planInput, unknownFormat.plan)); assert.strictEqual(unknownApproval.receipt.format.formatRelation, 'unknown'); assert.strictEqual(unknownApproval.receipt.approvalMode, 'elevated');
  assert(unknownFormat.plan.risks.length > 1); const reorderedRisks = decision(unknownFormat.plan); reorderedRisks.acknowledgedRiskIds.reverse(); assert.throws(() => approveCreatorAdoptionPlan({ ...approvalInput(unknownFormat.planInput, unknownFormat.plan), approvalDecision: reorderedRisks }), /exact plan risk list/);
  const badCategory = decision(standard.plan); badCategory.comparison.categories[0].unknown += 1; assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: badCategory }), /comparison does not exactly match/);
  const reorderedCategories = decision(standard.plan); reorderedCategories.comparison.categories.reverse(); assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: reorderedCategories }), /comparison does not exactly match/);
  const extraNested = decision(standard.plan); extraNested.candidate.unreviewed = true; assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: extraNested }), /candidate must contain exactly/);
  const accessorNested = decision(standard.plan); Object.defineProperty(accessorNested.rollback, 'sourceByteHash', { enumerable: true, get() { return standard.plan.rollback.sourceByteHash; } }); assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: accessorNested }), /accessor/);
  const badConfirmation = decision(standard.plan); badConfirmation.confirmations.activeFingerprint = false; assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: badConfirmation }), /must be exactly true/);
  const proxied = decision(standard.plan); proxied.paths = new Proxy(proxied.paths, {}); assert.throws(() => approveCreatorAdoptionPlan({ ...base, approvalDecision: proxied }), /non-proxy/);
  const collision = path.join(standard.activeDir, 'blocked.bak'); fs.writeFileSync(collision, Buffer.from('keep')); const blockedPlanInput = { ...standard.planInput, backupBasename: path.basename(collision) }, blockedPlan = createCreatorAdoptionPlan(blockedPlanInput), blockedApproval = approvalInput(blockedPlanInput, blockedPlan, decision(blockedPlan)); assert.throws(() => approveCreatorAdoptionPlan(blockedApproval), /non-waivable blockers/); assert.strictEqual(fs.readFileSync(collision, 'utf8'), 'keep');
  const changed = fs.readFileSync(standard.active); fs.writeFileSync(standard.active, Buffer.from('drift')); assert.throws(() => approveCreatorAdoptionPlan(base), /blockers|does not exactly match|plan hash/i); fs.writeFileSync(standard.active, changed);
  assert.throws(() => approveCreatorAdoptionPlan({ ...base, execute: true }), /contain exactly/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_adoption_approval.js'), 'utf8'); assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(source)); assert(!/\b(?:writeFile|mkdir|unlink|rename|linkSync|spawn|execFile)\b/.test(source));
  console.log('SFF Creator adoption approval binds exact standard/elevated review decisions while granting no execution or adoption authority');
} finally { fs.rmSync(root, { recursive: true, force: true }); } }

if (require.main === module) runTests();
module.exports = { approvalInput, decision, buildChain };
