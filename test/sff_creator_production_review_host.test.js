'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { EFFECTS, MAX_OPEN_REVIEWS, STAGES, createCreatorProductionReviewHost } = require('../src/sff_creator_production_review_host');

const H = text => crypto.createHash('sha256').update(text).digest('hex');
const operationId = H('operation');
const head = H('head');

function fixture(stage, revision = 0, blockers = []) {
  const base = { schema: `fixture.${stage}`, version: 1, blockers, risks: [`${stage}-risk`], revision };
  if (stage === STAGES.TARGET) Object.assign(base, {
    selection: { targetId: 'sff-v2.1' },
    conversions: [{ id: 'convert-palette-layout' }],
    mandatoryAcknowledgements: [{ id: 'confirm-source-identity', accepted: false }]
  });
  if (stage === STAGES.ADOPTION) Object.assign(base, { candidate: { byteHash: H('candidate') }, active: { byteHash: H('active') }, comparison: {}, proposedPaths: {}, rollback: {} });
  if (stage === STAGES.LAYOUT) Object.assign(base, { candidate: {}, active: {}, paths: {}, replacementProfile: {}, stateMachine: {}, rollback: {} });
  if (stage === STAGES.HISTORY) Object.assign(base, { outcome: 'committed', reconciliationRows: [], durabilityCaveats: [], rollbackCurrentlyAvailable: true });
  const key = stage === STAGES.LAYOUT ? 'layoutPlanHash' : 'planHash';
  base[key] = hashCanonical({ ...base, [key]: undefined });
  return base;
}

function builders(state = {}) {
  return Object.fromEntries(Object.values(STAGES).map(stage => [stage, input => fixture(stage, state[stage] || 0, input.blockers || [])]));
}

function configured(builderSet = builders(), options = {}) {
  const state = { head, appendCalls: 0, retained: new Map(), throwAfterCommit: Boolean(options.throwAfterCommit) };
  const readHead = ({ operationId: found }) => ({ operationId: found, headHash: state.head, pendingMutationId: null });
  const readRetainedReview = ({ mutationId }) => state.retained.get(mutationId) || null;
  const appendReview = input => {
    state.appendCalls += 1;
    assert.strictEqual(input.expectedHeadHash, state.head, 'append receives the exact freshly read parent head');
    assert.strictEqual(input.artifacts.length, 2, 'one append retains the plan and review record together');
    for (const artifact of input.artifacts) assert.strictEqual(H(artifact.bytes), artifact.expectedByteHash);
    const proof = {
      operationId: input.operationId, mutationId: input.mutationId, parentHeadHash: input.expectedHeadHash,
      childHeadHash: H(`child:${input.mutationId}`), stage: input.stage,
      planArtifactByteHash: input.artifacts[0].expectedByteHash, reviewRecordArtifactByteHash: input.artifacts[1].expectedByteHash,
      locator: { operationId: input.operationId, mutationId: input.mutationId, checkpoint: H(`child:${input.mutationId}`) }
    };
    state.retained.set(input.mutationId, proof);
    state.head = proof.childHeadHash;
    if (state.throwAfterCommit) { state.throwAfterCommit = false; throw new Error('ambiguous transport after durable append'); }
  };
  return { host: createCreatorProductionReviewHost({ appendReview, builders: builderSet, readHead, readRetainedReview }), state };
}

function begin(host, stage, planInput = {}) {
  return host.beginReview({ stage, operationId, expectedHeadHash: head, planInput });
}

function acknowledgeAll(host, review) {
  for (const row of review.rows) host.acknowledge({ actionToken: review.actionToken, expectedHeadHash: head, confirmationId: row.id, challengeToken: row.challengeToken });
}

for (const stage of Object.values(STAGES)) {
  const { host, state } = configured(), review = begin(host, stage);
  assert.strictEqual(review.stage, stage);
  assert.strictEqual(review.executionAuthorityGranted, false);
  assert.strictEqual(review.adoptionAllowed, false);
  assert.strictEqual(review.historyWriteAuthorityGranted, false);
  assert.strictEqual(review.writesAllowed, false);
  assert.deepStrictEqual(review.effects, EFFECTS);
  assert(review.rows.some(row => row.id.startsWith('confirmation:')), `${stage} must retain its own confirmation rows`);
  assert(review.rows.some(row => row.id === `risk:${stage}-risk`), `${stage} must explicitly acknowledge risks`);
  if (stage === STAGES.TARGET) {
    assert(review.rows.some(row => row.id === 'conversion:convert-palette-layout'));
    assert(review.rows.some(row => row.id === 'mandatory:confirm-source-identity'));
  }
  assert.throws(() => host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head }), /explicit acknowledgement/);
  acknowledgeAll(host, review);
  const completed = host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head });
  assert.strictEqual(completed.status, 'retained');
  assert.strictEqual(completed.appendAllowed, false);
  assert.strictEqual(completed.executionAuthorityGranted, false);
  assert.strictEqual(completed.adoptionAllowed, false);
  assert.strictEqual(completed.historyWriteAuthorityGranted, false);
  assert.strictEqual(completed.writesAllowed, false);
  assert.deepStrictEqual(completed.effects, EFFECTS);
  assert.strictEqual(completed.planArtifactByteHash, H(completed.planArtifactBytes));
  assert.strictEqual(completed.reviewRecordArtifactByteHash, H(completed.reviewRecordBytes));
  assert.strictEqual(completed.reviewRecord.stage, stage);
  assert.strictEqual(completed.reviewRecord.status, 'reviewed-no-authority');
  assert.strictEqual(completed.reviewRecord.recordHash, hashCanonical({ ...completed.reviewRecord, recordHash: undefined }));
  assert.deepStrictEqual(completed.retainedLocator, state.retained.get(completed.mutationId).locator);
  assert.strictEqual(completed.retainedHeadHash, state.head);
  assert.strictEqual(state.appendCalls, 1);
  assert.strictEqual(host.openReviewCount(), 0);
  assert.throws(() => host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head }), /missing, expired, or already consumed/);
}

{
  const { host } = configured(), first = begin(host, STAGES.TARGET), second = begin(host, STAGES.ADOPTION);
  const firstRow = first.rows[0], secondRow = second.rows[0];
  assert.throws(() => host.acknowledge({ actionToken: first.actionToken, expectedHeadHash: head, confirmationId: firstRow.id, challengeToken: secondRow.challengeToken }), /forged|another review/);
  host.acknowledge({ actionToken: first.actionToken, expectedHeadHash: head, confirmationId: firstRow.id, challengeToken: firstRow.challengeToken });
  assert.throws(() => host.acknowledge({ actionToken: first.actionToken, expectedHeadHash: head, confirmationId: firstRow.id, challengeToken: firstRow.challengeToken }), /already consumed/);
  assert.throws(() => host.acknowledge({ actionToken: second.actionToken, expectedHeadHash: H('other-head'), confirmationId: secondRow.id, challengeToken: secondRow.challengeToken }), /head changed/);
  assert.throws(() => host.cancelReview({ actionToken: second.actionToken, expectedHeadHash: H('other-head') }), /head changed/);
  assert.strictEqual(host.cancelReview({ actionToken: second.actionToken, expectedHeadHash: head }).status, 'cancelled');
  assert.strictEqual(host.cancelReview({ actionToken: second.actionToken, expectedHeadHash: head }).status, 'already-closed');
}

{
  const builderState = {}, { host } = configured(builders(builderState)), review = begin(host, STAGES.LAYOUT);
  acknowledgeAll(host, review);
  builderState[STAGES.LAYOUT] = 1;
  assert.throws(() => host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head }), /drifted/);
  assert.strictEqual(host.openReviewCount(), 1, 'drift must not consume the review before an explicit cancel');
  assert.strictEqual(host.cancelReview({ actionToken: review.actionToken, expectedHeadHash: head }).status, 'cancelled');
}

{
  const { host } = configured();
  assert.throws(() => begin(host, STAGES.HISTORY, { blockers: ['terminal-state-unverified'] }), /non-waivable blockers/);
  assert.strictEqual(host.openReviewCount(), 0);
  assert.throws(() => host.beginReview({ stage: STAGES.TARGET, operationId, expectedHeadHash: head, planInput: {}, extra: true }), /exactly/);
  const accessor = { stage: STAGES.TARGET, operationId, expectedHeadHash: head, planInput: {} };
  Object.defineProperty(accessor, 'stage', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => host.beginReview(accessor), /accessor/);
  const validPorts = { appendReview() {}, readHead() {}, readRetainedReview() {} };
  assert.throws(() => createCreatorProductionReviewHost({ ...validPorts, builders: { unknown: () => ({}) } }), /unknown or invalid/);
  assert.throws(() => createCreatorProductionReviewHost({ builders: builders(), appendReview() {}, readHead() {} }), /exactly/);
}

{
  const { host } = configured(), opened = [];
  for (let index = 0; index < MAX_OPEN_REVIEWS; index += 1) opened.push(begin(host, STAGES.ADOPTION));
  assert.throws(() => begin(host, STAGES.ADOPTION), /too many reviews/);
  for (const review of opened) host.cancelReview({ actionToken: review.actionToken, expectedHeadHash: head });
}

{
  const { host, state } = configured(builders(), { throwAfterCommit: true }), review = begin(host, STAGES.TARGET);
  acknowledgeAll(host, review);
  assert.throws(() => host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head }), /ambiguous transport/);
  const recovered = host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head });
  assert.strictEqual(recovered.status, 'retained');
  assert.strictEqual(state.appendCalls, 1, 'deterministic replay must recover retained evidence without a second append');
}

{
  const { host, state } = configured(), review = begin(host, STAGES.ADOPTION);
  acknowledgeAll(host, review);
  state.head = H('competing-head');
  assert.throws(() => host.recordReview({ actionToken: review.actionToken, expectedHeadHash: head }), /head changed before retention/);
  assert.strictEqual(state.appendCalls, 0);
  assert.strictEqual(host.openReviewCount(), 1);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_production_review_host.js'), 'utf8');
for (const forbidden of [
  'approveCreatorExecutionLayoutPlan', 'approveCreatorHistoryReconciliationPlan', 'executeCreatorAdoption',
  'transactional_executor', 'executing_intent', 'history_writer', 'completed_bridge',
  'appendCreatorOperationCheckpoint', "require('fs')", "require('vscode')", "require('child_process')"
]) assert(!source.includes(forbidden), `production review host must not reference authority/write surface: ${forbidden}`);

console.log('SFF Creator production review host independently retains four challenged reviews without execution, adoption, history-write, or append authority');
