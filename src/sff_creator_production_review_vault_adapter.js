'use strict';

const crypto = require('crypto');
const { hashCanonical } = require('./sff_capability_report');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { createCreatorProductionReviewHost, STAGES } = require('./sff_creator_production_review_host');
const {
  appendCreatorOperationCheckpoint,
  discoverCreatorOperationVaults,
  readCreatorOperationVaultCheckpointSnapshot
} = require('./sff_creator_operation_vault');

const SHA = /^[0-9a-f]{64}$/;
const LIFECYCLES = Object.freeze({
  [STAGES.TARGET]: 'ProjectionReview',
  [STAGES.ADOPTION]: 'AdoptionReview',
  [STAGES.LAYOUT]: 'LayoutReview',
  [STAGES.HISTORY]: Object.freeze(['TerminalNeedsHistory', 'HistoryReview'])
});
function acceptsLifecycle(stage, lifecycleState) { const expected = LIFECYCLES[stage]; return Array.isArray(expected) ? expected.includes(lifecycleState) : expected === lifecycleState; }
function fail(message) { throw new Error(`SFF Creator production review vault adapter: ${message}`); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function names(stage) { return { plan: `production-review-${stage}-plan`, record: `production-review-${stage}-record` }; }
function authority(operationId, stage, kind, parentHeadHash, mutationId, row) {
  return hashCanonical({ domain: 'ikemaker.sff-creator-production-review-artifact-authority', version: 1, operationId, stage, kind, parentHeadHash, mutationId, artifactName: row.name, artifactByteHash: row.expectedByteHash });
}
function locator(raw) {
  const keys = ['builders', 'expectedOperationId', 'expectedVaultRoot', 'operationDirectory'], found = Object.keys(raw || {}).sort();
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || JSON.stringify(found) !== JSON.stringify(keys.sort())) fail('configuration must contain exact locator and builder fields.');
  if (!SHA.test(raw.expectedOperationId) || typeof raw.expectedVaultRoot !== 'string' || !raw.expectedVaultRoot || typeof raw.operationDirectory !== 'string' || !raw.operationDirectory) fail('configuration locator is invalid.');
  return raw;
}

function buildCreatorProductionReviewVaultPorts(rawConfig, vaultApi = {}) {
  const config = locator(rawConfig), api = {
    append: vaultApi.append || appendCreatorOperationCheckpoint,
    discover: vaultApi.discover || discoverCreatorOperationVaults,
    snapshot: vaultApi.snapshot || readCreatorOperationVaultCheckpointSnapshot
  }, replayInputs = new Map();
  for (const [key, value] of Object.entries(api)) if (typeof value !== 'function') fail(`${key} dependency must be a function.`);

  function state() {
    const found = api.discover({ vaultRoot: config.expectedVaultRoot, maximumOperations: 256 }), durable = found.operations.find(row => row.operationId === config.expectedOperationId);
    if (durable) return { headHash: durable.latestCheckpointHash, pendingMutationId: null };
    const attention = found.attentionOperations.find(row => row.operationId === config.expectedOperationId);
    if (attention?.classification === 'append-interrupted' && attention.latestCheckpointHash && SHA.test(attention.mutationId || '')) return { headHash: attention.latestCheckpointHash, pendingMutationId: attention.mutationId };
    fail('operation is missing, ambiguous, corrupt, or unavailable for review retention.');
  }
  function snapshot(headHash) {
    return api.snapshot({ operationDirectory: config.operationDirectory, expectedOperationId: config.expectedOperationId, expectedLatestCheckpointHash: headHash, expectedVaultRoot: config.expectedVaultRoot });
  }
  function readHead({ operationId }) {
    if (operationId !== config.expectedOperationId) fail('readHead operationId drifted.');
    const current = state();
    return { operationId, ...current };
  }
  function appendReview(input) {
    if (input.operationId !== config.expectedOperationId || !SHA.test(input.mutationId || '') || !LIFECYCLES[input.stage]) fail('append request identity or stage is invalid.');
    const fixed = names(input.stage);
    if (!Array.isArray(input.artifacts) || input.artifacts.length !== 2 || input.artifacts[0].name !== fixed.plan || input.artifacts[1].name !== fixed.record || input.artifacts.some(row => !Buffer.isBuffer(row.bytes) || sha(row.bytes) !== row.expectedByteHash)) fail('review append must contain the exact hashed plan and record pair.');
    const requestHash = hashCanonical({ operationId: input.operationId, expectedHeadHash: input.expectedHeadHash, mutationId: input.mutationId, stage: input.stage, artifacts: input.artifacts.map(row => ({ name: row.name, expectedByteHash: row.expectedByteHash, byteLength: row.bytes.length })) }), replay = replayInputs.get(input.mutationId);
    if (replay && replay.requestHash !== requestHash) fail('review mutation replay request drifted.');
    let appendInput = replay?.appendInput;
    if (!appendInput) {
      const current = state();
      if (current.pendingMutationId !== null || current.headHash !== input.expectedHeadHash) fail('review append parent changed or is owned by another mutation.');
      const held = snapshot(input.expectedHeadHash), a = held.authority;
      if (!acceptsLifecycle(input.stage, a.lifecycleState)) fail(`review stage ${input.stage} requires lifecycle ${Array.isArray(LIFECYCLES[input.stage]) ? LIFECYCLES[input.stage].join(' or ') : LIFECYCLES[input.stage]}.`);
      const replacements = new Set([fixed.plan, fixed.record]);
      if (a.artifacts.some(row => replacements.has(row.name)) || a.artifactAuthorities.some(row => replacements.has(row.name))) fail(`review stage ${input.stage} already has retained fixed-name evidence; it cannot be replaced.`);
      const retained = typeof held.readRetainedInventoryBytes === 'function' ? held.readRetainedInventoryBytes() : { artifacts: a.artifacts.map(row => ({ name: row.name, bytes: held.readArtifactBytes(row.name) })), binaries: a.binaries.map(row => ({ name: row.name, bytes: held.readBinaryBytes(row.name) })) }, retainedArtifacts = new Map(retained.artifacts.map(row => [row.name, row.bytes])), retainedBinaries = new Map(retained.binaries.map(row => [row.name, row.bytes])), inheritedArtifacts = a.artifacts.map(row => ({ name: row.name, bytes: Buffer.from(retainedArtifacts.get(row.name)), expectedByteHash: row.byteHash, authorityHash: row.authorityHash })), inheritedBinaries = a.binaries.map(row => ({ name: row.name, bytes: Buffer.from(retainedBinaries.get(row.name)), expectedByteHash: row.byteHash, authorityHash: row.authorityHash }));
      const added = input.artifacts.map((row, index) => ({ ...row, authorityHash: authority(input.operationId, input.stage, index ? 'record' : 'plan', input.expectedHeadHash, input.mutationId, row) })), addedAuthorities = added.map(row => ({ name: row.name, hash: row.authorityHash }));
      appendInput = {
        vaultRoot: a.vaultRootSeal.path, workspaceRoot: a.workspaceRootSeal.path, workspaceId: a.workspaceId, operationId: a.operationId,
        targetId: a.targetId, backendId: a.backendId, adapterId: a.adapterId, activePath: a.activePath, candidatePath: a.candidatePath,
        historyRoot: a.historyRoot, lifecycleState: a.lifecycleState, terminalHistoryEvidence: a.terminalHistoryEvidence,
        artifactAuthorities: [...a.artifactAuthorities, ...addedAuthorities].sort((x, y) => x.name.localeCompare(y.name)),
        artifacts: [...inheritedArtifacts, ...added].sort((x, y) => x.name.localeCompare(y.name)), binaries: inheritedBinaries.sort((x, y) => x.name.localeCompare(y.name)),
        operationDirectory: config.operationDirectory, expectedPreviousCheckpointHash: input.expectedHeadHash, mutationId: input.mutationId
      };
      replayInputs.set(input.mutationId, { appendInput, requestHash });
    }
    return api.append(appendInput);
  }
  function readRetainedReview(expected) {
    if (expected.operationId !== config.expectedOperationId) fail('retained review operationId drifted.');
    const current = state();
    if (current.pendingMutationId !== null) return null;
    const held = snapshot(current.headHash), chain = held.authority.chain, child = chain.at(-1);
    if (!child || child.previousCheckpointHash !== expected.parentHeadHash) return null;
    const fixed = names(expected.stage), planRow = held.authority.artifacts.find(row => row.name === fixed.plan), recordRow = held.authority.artifacts.find(row => row.name === fixed.record);
    if (!planRow || !recordRow || planRow.byteHash !== expected.planArtifactByteHash || recordRow.byteHash !== expected.reviewRecordArtifactByteHash) return null;
    const plan = decodeStrictJsonArtifact(held.readArtifactBytes(fixed.plan), 'retained production review plan').parsed, record = decodeStrictJsonArtifact(held.readArtifactBytes(fixed.record), 'retained production review record').parsed, planHashKey = expected.stage === STAGES.LAYOUT ? 'layoutPlanHash' : 'planHash';
    if (record.schema !== 'ikemaker.sff-creator-production-review-record' || record.version !== 1 || record.status !== 'reviewed-no-authority' || record.operationId !== expected.operationId || record.stage !== expected.stage || record.parentHeadHash !== expected.parentHeadHash || record.planArtifactByteHash !== expected.planArtifactByteHash || record.executionAuthorityGranted !== false || record.adoptionAllowed !== false || record.historyWriteAuthorityGranted !== false || record.writesAllowed !== false || hashCanonical({ ...record, recordHash: undefined }) !== record.recordHash) return null;
    if (plan[planHashKey] !== record.planHash || hashCanonical({ ...plan, [planHashKey]: undefined }) !== record.planHash) return null;
    const calculated = hashCanonical({ domain: 'ikemaker.sff-creator-production-review-retention', version: 1, operationId: record.operationId, stage: record.stage, parentHeadHash: record.parentHeadHash, planHash: record.planHash, planArtifactByteHash: planRow.byteHash, reviewRecordHash: record.recordHash, reviewRecordArtifactByteHash: recordRow.byteHash });
    if (calculated !== expected.mutationId) return null;
    const planAuthority = authority(expected.operationId, expected.stage, 'plan', expected.parentHeadHash, expected.mutationId, { name: fixed.plan, expectedByteHash: planRow.byteHash }), recordAuthority = authority(expected.operationId, expected.stage, 'record', expected.parentHeadHash, expected.mutationId, { name: fixed.record, expectedByteHash: recordRow.byteHash }), namedPlan = held.authority.artifactAuthorities.find(row => row.name === fixed.plan), namedRecord = held.authority.artifactAuthorities.find(row => row.name === fixed.record);
    if (planRow.authorityHash !== planAuthority || recordRow.authorityHash !== recordAuthority || namedPlan?.hash !== planAuthority || namedRecord?.hash !== recordAuthority) return null;
    return { operationId: expected.operationId, mutationId: expected.mutationId, parentHeadHash: expected.parentHeadHash, childHeadHash: current.headHash, stage: expected.stage, planArtifactByteHash: planRow.byteHash, reviewRecordArtifactByteHash: recordRow.byteHash, locator: { operationDirectory: config.operationDirectory, expectedOperationId: config.expectedOperationId, expectedLatestCheckpointHash: current.headHash, expectedVaultRoot: config.expectedVaultRoot, planArtifactName: fixed.plan, reviewRecordArtifactName: fixed.record } };
  }
  return Object.freeze({ appendReview, builders: config.builders, readHead, readRetainedReview });
}

function createCreatorProductionReviewHostForVault(config) {
  return createCreatorProductionReviewHost(buildCreatorProductionReviewVaultPorts(config));
}

module.exports = { buildCreatorProductionReviewVaultPorts, createCreatorProductionReviewHostForVault };
