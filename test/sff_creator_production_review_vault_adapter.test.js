'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { STAGES } = require('../src/sff_creator_production_review_host');
const { createCreatorProductionReviewHostForVault } = require('../src/sff_creator_production_review_vault_adapter');
const { appendCreatorOperationCheckpoint, createCreatorOperationVault, readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');

const H = value => crypto.createHash('sha256').update(value).digest('hex');
function plan(stage) {
  const value = { schema: `fixture.${stage}`, version: 1, blockers: [], risks: ['review-risk'] };
  if (stage === STAGES.TARGET) Object.assign(value, { selection: { targetId: 'sff-v2.1' }, conversions: [{ id: 'conversion-one' }], mandatoryAcknowledgements: [{ id: 'ack-one' }] });
  if (stage === STAGES.ADOPTION) Object.assign(value, { candidate: {}, active: {}, comparison: {}, proposedPaths: {}, rollback: {} });
  if (stage === STAGES.LAYOUT) Object.assign(value, { candidate: {}, active: {}, paths: {}, replacementProfile: {}, stateMachine: {}, rollback: {} });
  if (stage === STAGES.HISTORY) Object.assign(value, { outcome: 'committed', reconciliationRows: [], durabilityCaveats: [], rollbackCurrentlyAvailable: true });
  const key = stage === STAGES.LAYOUT ? 'layoutPlanHash' : 'planHash';
  value[key] = hashCanonical({ ...value, [key]: undefined });
  return value;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-production-review-vault-'));
try {
  const workspace = path.join(root, 'workspace'), vault = path.join(root, 'vault'), history = path.join(root, 'history');
  for (const directory of [workspace, vault, history]) fs.mkdirSync(directory);
  const activePath = path.join(workspace, 'active.sff'), candidatePath = path.join(workspace, 'candidate.sff');
  fs.writeFileSync(activePath, 'active'); fs.writeFileSync(candidatePath, 'candidate');
  const operationId = H('production-review-operation'), workspaceId = H('production-review-workspace'), seedBytes = Buffer.from('{"seed":true}\n'), seedAuthority = H('seed-authority');
  const created = createCreatorOperationVault({
    vaultRoot: vault, workspaceRoot: workspace, workspaceId, operationId, targetId: 'sff-v2.1', backendId: 'backend', adapterId: 'adapter',
    activePath, candidatePath, historyRoot: history, lifecycleState: 'ProjectionReview', terminalHistoryEvidence: null,
    artifactAuthorities: [{ name: 'seed', hash: seedAuthority }], artifacts: [{ name: 'seed', bytes: seedBytes, expectedByteHash: H(seedBytes), authorityHash: seedAuthority }], binaries: []
  });
  const builders = Object.fromEntries(Object.values(STAGES).map(stage => [stage, () => plan(stage)]));
  const config = { builders, expectedOperationId: operationId, expectedVaultRoot: vault, operationDirectory: created.operationDirectory };
  const transition = (fromHead, lifecycleState) => {
    const held = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: created.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: fromHead, expectedVaultRoot: vault }), a = held.authority;
    return appendCreatorOperationCheckpoint({
      vaultRoot: a.vaultRootSeal.path, workspaceRoot: a.workspaceRootSeal.path, workspaceId: a.workspaceId, operationId: a.operationId, targetId: a.targetId, backendId: a.backendId, adapterId: a.adapterId,
      activePath: a.activePath, candidatePath: a.candidatePath, historyRoot: a.historyRoot, lifecycleState, terminalHistoryEvidence: null,
      artifactAuthorities: a.artifactAuthorities.map(row => ({ ...row })), artifacts: a.artifacts.map(row => ({ name: row.name, bytes: held.readArtifactBytes(row.name), expectedByteHash: row.byteHash, authorityHash: row.authorityHash })),
      binaries: a.binaries.map(row => ({ name: row.name, bytes: held.readBinaryBytes(row.name), expectedByteHash: row.byteHash, authorityHash: row.authorityHash })),
      operationDirectory: created.operationDirectory, expectedPreviousCheckpointHash: fromHead, mutationId: H(`transition:${fromHead}:${lifecycleState}`)
    });
  };
  const host = createCreatorProductionReviewHostForVault(config);
  const review = host.beginReview({ stage: STAGES.TARGET, operationId, expectedHeadHash: created.latestCheckpointHash, planInput: {} });
  for (const row of review.rows) host.acknowledge({ actionToken: review.actionToken, expectedHeadHash: created.latestCheckpointHash, confirmationId: row.id, challengeToken: row.challengeToken });
  const retained = host.recordReview({ actionToken: review.actionToken, expectedHeadHash: created.latestCheckpointHash });
  assert.strictEqual(retained.status, 'retained');
  assert.notStrictEqual(retained.retainedHeadHash, created.latestCheckpointHash);
  assert.strictEqual(retained.retainedLocator.expectedLatestCheckpointHash, retained.retainedHeadHash);
  const snapshot = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: created.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: retained.retainedHeadHash, expectedVaultRoot: vault });
  assert.strictEqual(snapshot.authority.lifecycleState, 'ProjectionReview');
  assert.strictEqual(snapshot.authority.chain.at(-1).previousCheckpointHash, created.latestCheckpointHash);
  assert.deepStrictEqual(snapshot.readArtifactBytes('seed'), seedBytes);
  assert.strictEqual(H(snapshot.readArtifactBytes('production-review-target-projection-plan')), retained.planArtifactByteHash);
  assert.strictEqual(H(snapshot.readArtifactBytes('production-review-target-projection-record')), retained.reviewRecordArtifactByteHash);
  const duplicateHost = createCreatorProductionReviewHostForVault(config), duplicate = duplicateHost.beginReview({ stage: STAGES.TARGET, operationId, expectedHeadHash: retained.retainedHeadHash, planInput: {} });
  for (const row of duplicate.rows) duplicateHost.acknowledge({ actionToken: duplicate.actionToken, expectedHeadHash: retained.retainedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken });
  assert.throws(() => duplicateHost.recordReview({ actionToken: duplicate.actionToken, expectedHeadHash: retained.retainedHeadHash }), /already has retained fixed-name evidence/);
  const afterCollision = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: created.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: retained.retainedHeadHash, expectedVaultRoot: vault });
  assert.strictEqual(afterCollision.authority.chain.length, snapshot.authority.chain.length, 'same-stage collision must not append or replace evidence');
  let stagedHead = retained.retainedHeadHash;
  for (const [stage, lifecycleState] of [[STAGES.ADOPTION, 'AdoptionReview'], [STAGES.LAYOUT, 'LayoutReview'], [STAGES.HISTORY, 'HistoryReview']]) {
    stagedHead = transition(stagedHead, lifecycleState).latestCheckpointHash;
    const stagedHost = createCreatorProductionReviewHostForVault(config), stagedReview = stagedHost.beginReview({ stage, operationId, expectedHeadHash: stagedHead, planInput: {} });
    for (const row of stagedReview.rows) stagedHost.acknowledge({ actionToken: stagedReview.actionToken, expectedHeadHash: stagedHead, confirmationId: row.id, challengeToken: row.challengeToken });
    stagedHead = stagedHost.recordReview({ actionToken: stagedReview.actionToken, expectedHeadHash: stagedHead }).retainedHeadHash;
  }
  const allStages = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: created.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: stagedHead, expectedVaultRoot: vault });
  for (const stage of Object.values(STAGES)) for (const kind of ['plan', 'record']) assert(allStages.authority.artifacts.some(row => row.name === `production-review-${stage}-${kind}`), `${stage} ${kind} must coexist`);
  assert.strictEqual(fs.readFileSync(activePath, 'utf8'), 'active');
  assert.strictEqual(fs.readFileSync(candidatePath, 'utf8'), 'candidate');
  assert.strictEqual(fs.readdirSync(history).length, 0);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('SFF Creator production review vault adapter retains the exact challenged review in one real checkpoint without changing lifecycle or project assets');
