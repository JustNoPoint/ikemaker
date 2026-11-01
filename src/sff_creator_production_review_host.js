'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');
const { createCreatorTargetProjection } = require('./sff_creator_target_projection');
const { createCreatorAdoptionPlan } = require('./sff_creator_adoption_plan');
const { createCreatorExecutionLayoutPlan } = require('./sff_creator_execution_layout_plan');
const { createCreatorHistoryReconciliationPlan } = require('./sff_creator_history_reconciliation_plan');
const { CONFIRMATION_KEYS: TARGET_CONFIRMATIONS } = require('./sff_creator_target_projection_approval');
const { CONFIRMATION_KEYS: ADOPTION_CONFIRMATIONS } = require('./sff_creator_adoption_approval');
const { CONFIRMATION_KEYS: LAYOUT_CONFIRMATIONS } = require('./sff_creator_execution_layout_approval');
const { CONFIRMATION_KEYS: HISTORY_CONFIRMATIONS } = require('./sff_creator_history_reconciliation_approval');

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_OPEN_REVIEWS = 32;
const STAGES = Object.freeze({
  TARGET: 'target-projection',
  ADOPTION: 'adoption-impact',
  LAYOUT: 'execution-layout',
  HISTORY: 'history-reconciliation'
});
const STAGE_ORDER = Object.freeze([STAGES.TARGET, STAGES.ADOPTION, STAGES.LAYOUT, STAGES.HISTORY]);
const CONFIRMATIONS = Object.freeze({
  [STAGES.TARGET]: Object.freeze([...TARGET_CONFIRMATIONS]),
  [STAGES.ADOPTION]: Object.freeze([...ADOPTION_CONFIRMATIONS]),
  [STAGES.LAYOUT]: Object.freeze([...LAYOUT_CONFIRMATIONS]),
  [STAGES.HISTORY]: Object.freeze([...HISTORY_CONFIRMATIONS])
});
const EFFECTS = Object.freeze({
  writes: false,
  processes: false,
  approvalsGranted: false,
  backendExecution: false,
  executionStarted: false,
  activeArchiveModified: false,
  candidateModified: false,
  historyModified: false,
  historyAppended: false
});

function fail(message) { throw new Error(`SFF Creator production review host: ${message}`); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function token() { return crypto.randomBytes(32).toString('hex'); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a plain non-proxy object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort();
  if (Object.getOwnPropertySymbols(value).length) fail(`${label} must not contain symbol keys.`);
  if (JSON.stringify(found) !== JSON.stringify([...keys].sort())) fail(`${label} must contain exactly: ${[...keys].sort().join(', ')}.`);
  for (const key of found) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property, not an accessor.`);
  return Object.fromEntries(found.map(key => [key, descriptors[key].value]));
}
function checkedHash(value, label) { if (!SHA256.test(String(value || ''))) fail(`${label} must be a lowercase SHA-256 hash.`); return value; }
function checkedText(value, label) { if (typeof value !== 'string' || !value || value.length > 256) fail(`${label} must be nonempty bounded text.`); return value; }
function uniqueSorted(values, label) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value || value.length > 256)) fail(`${label} must be bounded nonempty strings.`);
  const normalized = [...new Set(values)].sort();
  if (normalized.length !== values.length) fail(`${label} contains duplicates.`);
  return normalized;
}
function planHash(stage, plan) {
  const value = stage === STAGES.LAYOUT ? plan?.layoutPlanHash : plan?.planHash;
  return checkedHash(value, `${stage} plan hash`);
}
function blockers(plan) { return Array.isArray(plan?.blockers) ? plan.blockers : []; }
function rowIds(stage, plan) {
  const rows = CONFIRMATIONS[stage].map(id => `confirmation:${id}`);
  for (const id of uniqueSorted(Array.isArray(plan.risks) ? plan.risks : [], `${stage} risks`)) rows.push(`risk:${id}`);
  if (stage === STAGES.TARGET) {
    for (const id of uniqueSorted((plan.conversions || []).map(row => checkedText(row?.id, 'conversion id')), 'target conversion ids')) rows.push(`conversion:${id}`);
    for (const id of uniqueSorted((plan.mandatoryAcknowledgements || []).map(row => checkedText(row?.id, 'mandatory acknowledgement id')), 'target mandatory acknowledgement ids')) rows.push(`mandatory:${id}`);
  }
  return Object.freeze(rows.sort());
}
function builderMap(overrides) {
  const supplied = overrides || {};
  exactKeys(supplied, Object.keys(supplied), 'dependency overrides');
  const allowed = new Set(STAGE_ORDER);
  for (const [stage, build] of Object.entries(supplied)) if (!allowed.has(stage) || typeof build !== 'function') fail(`unknown or invalid plan builder override: ${stage}.`);
  return Object.freeze({
    [STAGES.TARGET]: supplied[STAGES.TARGET] || createCreatorTargetProjection,
    [STAGES.ADOPTION]: supplied[STAGES.ADOPTION] || createCreatorAdoptionPlan,
    [STAGES.LAYOUT]: supplied[STAGES.LAYOUT] || createCreatorExecutionLayoutPlan,
    [STAGES.HISTORY]: supplied[STAGES.HISTORY] || createCreatorHistoryReconciliationPlan
  });
}
function artifactBytes(value) { return Buffer.from(`${JSON.stringify(canonicalize(value, 'production review artifact'))}\n`); }
function stageSummary(stage, plan) {
  if (stage === STAGES.TARGET) return { selection: plan.selection, conversions: plan.conversions, mandatoryAcknowledgements: plan.mandatoryAcknowledgements };
  if (stage === STAGES.ADOPTION) return { candidate: plan.candidate, active: plan.active, comparison: plan.comparison, proposedPaths: plan.proposedPaths, rollback: plan.rollback };
  if (stage === STAGES.LAYOUT) return { candidate: plan.candidate, active: plan.active, paths: plan.paths, replacementProfile: plan.replacementProfile, stateMachine: plan.stateMachine, rollback: plan.rollback };
  return { outcome: plan.outcome, reconciliationRows: plan.reconciliationRows, durabilityCaveats: plan.durabilityCaveats, rollbackCurrentlyAvailable: plan.rollbackCurrentlyAvailable };
}

function retentionPorts(config) {
  const value = exactKeys(config, ['appendReview', 'builders', 'readHead', 'readRetainedReview'], 'production review host dependencies');
  for (const key of ['appendReview', 'readHead', 'readRetainedReview']) if (typeof value[key] !== 'function') fail(`${key} must be a function.`);
  return { appendReview: value.appendReview, builders: builderMap(value.builders), readHead: value.readHead, readRetainedReview: value.readRetainedReview };
}
function liveHead(value, operationId) {
  const row = exactKeys(snapshotPlainJson(value, 'live review head'), ['headHash', 'operationId', 'pendingMutationId'], 'live review head');
  if (row.operationId !== operationId) fail('live review head operationId drifted.');
  checkedHash(row.headHash, 'live review head hash');
  if (row.pendingMutationId !== null) checkedHash(row.pendingMutationId, 'live review pending mutation id');
  return row;
}
function retainedProof(value, expected) {
  if (value == null) return null;
  const row = exactKeys(snapshotPlainJson(value, 'retained review proof'), ['childHeadHash', 'locator', 'mutationId', 'operationId', 'parentHeadHash', 'planArtifactByteHash', 'reviewRecordArtifactByteHash', 'stage'], 'retained review proof');
  for (const key of ['childHeadHash', 'mutationId', 'operationId', 'parentHeadHash', 'planArtifactByteHash', 'reviewRecordArtifactByteHash']) checkedHash(row[key], `retained review proof ${key}`);
  if (!row.locator || typeof row.locator !== 'object' || Array.isArray(row.locator)) fail('retained review proof locator must be a retained plain object.');
  for (const key of ['mutationId', 'operationId', 'parentHeadHash', 'planArtifactByteHash', 'reviewRecordArtifactByteHash', 'stage']) if (row[key] !== expected[key]) fail(`retained review proof ${key} drifted.`);
  return Object.freeze(row);
}

function createCreatorProductionReviewHost(rawConfig = {}) {
  const { appendReview, builders, readHead, readRetainedReview } = retentionPorts(rawConfig), sessions = new Map();

  function beginReview(rawInput) {
    const input = exactKeys(rawInput, ['expectedHeadHash', 'operationId', 'planInput', 'stage'], 'begin input');
    const stage = checkedText(input.stage, 'stage');
    if (!STAGE_ORDER.includes(stage)) fail(`unsupported stage: ${stage}.`);
    const operationId = checkedHash(input.operationId, 'operationId'), expectedHeadHash = checkedHash(input.expectedHeadHash, 'expectedHeadHash');
    if (sessions.size >= MAX_OPEN_REVIEWS) fail('too many reviews are open; cancel or finish one first.');
    const planInput = snapshotPlainJson(input.planInput, `${stage} plan input`), plan = builders[stage](planInput), hash = planHash(stage, plan), foundBlockers = blockers(plan);
    if (foundBlockers.length) fail(`${stage} contains non-waivable blockers: ${foundBlockers.join(', ')}.`);
    const actionToken = token(), ids = rowIds(stage, plan), challenges = new Map(ids.map(id => [id, token()]));
    sessions.set(actionToken, { actionToken, stage, operationId, expectedHeadHash, planInput, planHash: hash, plan, ids, challenges, acknowledged: new Set() });
    return Object.freeze({
      schema: 'ikemaker.sff-creator-production-review', version: 1, status: 'review-required', stage, operationId, expectedHeadHash, planHash: hash, actionToken,
      rows: Object.freeze(ids.map(id => Object.freeze({ id, challengeToken: challenges.get(id) }))),
      summary: canonicalize(stageSummary(stage, plan), 'production review summary'),
      executionAuthorityGranted: false, adoptionAllowed: false, historyWriteAuthorityGranted: false, writesAllowed: false, effects: EFFECTS
    });
  }

  function acknowledge(rawInput) {
    const input = exactKeys(rawInput, ['actionToken', 'challengeToken', 'confirmationId', 'expectedHeadHash'], 'acknowledgement input'), session = sessions.get(input.actionToken);
    if (!session) fail('review action token is missing, expired, or already consumed.');
    if (input.expectedHeadHash !== session.expectedHeadHash) fail('review head changed before acknowledgement.');
    const expected = session.challenges.get(input.confirmationId);
    if (!expected || expected !== input.challengeToken) fail('confirmation challenge is missing, forged, or belongs to another review.');
    if (session.acknowledged.has(input.confirmationId)) fail('confirmation challenge was already consumed.');
    session.acknowledged.add(input.confirmationId);
    return Object.freeze({ status: 'acknowledged', stage: session.stage, confirmationId: input.confirmationId, remaining: session.ids.length - session.acknowledged.size });
  }

  function recordReview(rawInput) {
    const input = exactKeys(rawInput, ['actionToken', 'expectedHeadHash'], 'record input'), session = sessions.get(input.actionToken);
    if (!session) fail('review action token is missing, expired, or already consumed.');
    if (input.expectedHeadHash !== session.expectedHeadHash) fail('review head changed before completion.');
    const missing = session.ids.filter(id => !session.acknowledged.has(id));
    if (missing.length) fail(`review still requires explicit acknowledgement: ${missing.join(', ')}.`);
    const fresh = builders[session.stage](session.planInput), freshHash = planHash(session.stage, fresh);
    if (freshHash !== session.planHash || hashCanonical(fresh) !== hashCanonical(session.plan)) fail('review plan drifted after acknowledgement; start a fresh review.');
    const planBytes = artifactBytes(fresh), reviewedIds = [...session.acknowledged].sort(), core = {
      schema: 'ikemaker.sff-creator-production-review-record', version: 1, status: 'reviewed-no-authority', stage: session.stage,
      operationId: session.operationId, parentHeadHash: session.expectedHeadHash, planHash: session.planHash, planArtifactByteHash: sha(planBytes), reviewedIds,
      executionAuthorityGranted: false, adoptionAllowed: false, historyWriteAuthorityGranted: false, writesAllowed: false, currentStateGuaranteed: false, effects: EFFECTS
    }, record = Object.freeze({ ...core, recordHash: hashCanonical(core) }), recordBytes = artifactBytes(record), mutationId = hashCanonical({
      domain: 'ikemaker.sff-creator-production-review-retention', version: 1, operationId: session.operationId, stage: session.stage,
      parentHeadHash: session.expectedHeadHash, planHash: session.planHash, planArtifactByteHash: sha(planBytes), reviewRecordHash: record.recordHash,
      reviewRecordArtifactByteHash: sha(recordBytes)
    }), expectedProof = { mutationId, operationId: session.operationId, parentHeadHash: session.expectedHeadHash, planArtifactByteHash: sha(planBytes), reviewRecordArtifactByteHash: sha(recordBytes), stage: session.stage };
    const before = liveHead(readHead({ operationId: session.operationId }), session.operationId);
    let retained;
    if (before.headHash === session.expectedHeadHash || before.pendingMutationId === mutationId) {
      appendReview({
        operationId: session.operationId, expectedHeadHash: session.expectedHeadHash, mutationId, stage: session.stage,
        artifacts: Object.freeze([
          Object.freeze({ name: `production-review-${session.stage}-plan`, bytes: Buffer.from(planBytes), expectedByteHash: sha(planBytes) }),
          Object.freeze({ name: `production-review-${session.stage}-record`, bytes: Buffer.from(recordBytes), expectedByteHash: sha(recordBytes) })
        ])
      });
      retained = retainedProof(readRetainedReview(expectedProof), expectedProof);
      if (!retained) fail('review append returned without independently readable retained evidence.');
      const after = liveHead(readHead({ operationId: session.operationId }), session.operationId);
      if (after.headHash !== retained.childHeadHash) fail('retained review child head is not the exact live head after append.');
    } else {
      retained = retainedProof(readRetainedReview(expectedProof), expectedProof);
      if (!retained || before.headHash !== retained.childHeadHash) fail('review head changed before retention; reload the exact operation head.');
    }
    sessions.delete(input.actionToken);
    return Object.freeze({
      status: 'retained', stage: session.stage, operationId: session.operationId, expectedHeadHash: session.expectedHeadHash, mutationId,
      planHash: session.planHash, planArtifactBytes: Buffer.from(planBytes), planArtifactByteHash: sha(planBytes), reviewRecord: record,
      reviewRecordBytes: Buffer.from(recordBytes), reviewRecordArtifactByteHash: sha(recordBytes), retainedLocator: retained.locator, retainedHeadHash: retained.childHeadHash, appendAllowed: false,
      executionAuthorityGranted: false, adoptionAllowed: false, historyWriteAuthorityGranted: false, writesAllowed: false, effects: EFFECTS
    });
  }

  function cancelReview(rawInput) {
    const input = exactKeys(rawInput, ['actionToken', 'expectedHeadHash'], 'cancel input'), session = sessions.get(input.actionToken);
    if (!session) return Object.freeze({ status: 'already-closed', writesAllowed: false, effects: EFFECTS });
    if (input.expectedHeadHash !== session.expectedHeadHash) fail('review head changed before cancellation.');
    sessions.delete(input.actionToken);
    return Object.freeze({ status: 'cancelled', stage: session.stage, writesAllowed: false, effects: EFFECTS });
  }

  function openReviewCount() { return sessions.size; }
  return Object.freeze({ acknowledge, beginReview, cancelReview, openReviewCount, recordReview });
}

module.exports = { EFFECTS, MAX_OPEN_REVIEWS, STAGES, createCreatorProductionReviewHost };
