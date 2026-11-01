'use strict';

const crypto = require('crypto');
const { hashCanonical } = require('./sff_capability_report');
const { assertSprMakerToolchainContract, SPRMAKER_EXECUTION_IMPLEMENTED } = require('./sff_v1_sprmaker_toolchain_contract');
const { assertSprMakerStagingPlan } = require('./sff_v1_sprmaker_staging_contract');

const SHA = /^[0-9a-f]{64}$/;
const LIMITS = Object.freeze({ timeoutMs: 120000, stdoutBytes: 1024 * 1024, stderrBytes: 1024 * 1024, candidateBytes: 0xffffffff });
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function createSprMakerExecutionRequest(input = {}) {
  const toolchain = assertSprMakerToolchainContract(input.toolchain), stage = assertSprMakerStagingPlan(input.stage);
  const request = { schema: 'ikemaker.sff-v1-sprmaker-execution-request', version: 1, toolchainHash: toolchain.contractHash, stagePlanHash: stage.planHash, specificationHash: stage.specificationHash, logicalHash: stage.logicalHash, recipeByteHash: stage.recipeByteHash, runnerKind: toolchain.requestedRunner, executableAlias: 'SPRMAKER.EXE', arguments: [], stdinAlias: 'INPUT.TXT', outputAlias: stage.outputAlias, limits: LIMITS, processPolicy: { shell: false, nonElevated: true, abortSignalRequired: true, descendantCleanupRequired: true, ignoreLateOutputAfterStop: true, boundedLogsRequired: true, networkDisabled: true, isolatedEnvironmentRequired: true }, intent: 'candidate-only', executionImplemented: SPRMAKER_EXECUTION_IMPLEMENTED, executionAllowed: SPRMAKER_EXECUTION_IMPLEMENTED && toolchain.executionReady === true && stage.executionEligible === true, adoptionAllowed: false };
  request.requestHash = hashCanonical(request); return freeze(request);
}
function assertSprMakerExecutionRequest(value, expectedHash = value?.requestHash) { const copy = { ...value }; delete copy.requestHash; if (value?.schema !== 'ikemaker.sff-v1-sprmaker-execution-request' || value.version !== 1 || !SHA.test(String(expectedHash || '')) || value.requestHash !== expectedHash || hashCanonical(copy) !== value.requestHash || value.adoptionAllowed !== false || value.executionImplemented !== SPRMAKER_EXECUTION_IMPLEMENTED || value.executionAllowed !== false) throw new Error('SprMaker execution request drifted or claims unavailable execution authority.'); return value; }
function validateSprMakerExecutionResult(request, result = {}, verifyCandidate) {
  assertSprMakerExecutionRequest(request);
  if (result.requestHash !== request.requestHash || result.toolchainHash !== request.toolchainHash || result.stagePlanHash !== request.stagePlanHash) throw new Error('SprMaker execution result is not bound to the exact request/toolchain/stage.');
  if (!['cancelled', 'timed-out', 'failed', 'passed'].includes(result.status)) throw new Error('SprMaker execution result has an invalid status.');
  if (!Number.isSafeInteger(result.stdoutBytes) || result.stdoutBytes < 0 || result.stdoutBytes > request.limits.stdoutBytes || !Number.isSafeInteger(result.stderrBytes) || result.stderrBytes < 0 || result.stderrBytes > request.limits.stderrBytes) throw new Error('SprMaker logs exceed the reviewed bounds.');
  if (result.status === 'cancelled' && result.cancelled !== true || result.status === 'timed-out' && result.timedOut !== true) throw new Error('SprMaker stopped-result flags do not match status.');
  if (result.status !== 'passed') return freeze({ status: result.status, requestHash: request.requestHash, candidateAccepted: false, adoptionAllowed: false });
  if (!request.executionAllowed) throw new Error('SprMaker execution is not approved by the exact toolchain and stage contracts.');
  if (result.outputAlias !== request.outputAlias || result.exitCode !== 0 || result.timedOut === true || result.cancelled === true) throw new Error('SprMaker success receipt has wrong output/process state.');
  if (!Buffer.isBuffer(result.outputBytes) && !(result.outputBytes instanceof Uint8Array)) throw new Error('SprMaker success requires exact candidate bytes.');
  const candidate = Buffer.from(result.outputBytes); if (!candidate.length || candidate.length > request.limits.candidateBytes) throw new Error('SprMaker candidate size is invalid.');
  const candidateHash = sha(candidate); if (String(result.outputByteHash || '').toLowerCase() !== candidateHash) throw new Error('SprMaker candidate hash mismatch.');
  if (typeof verifyCandidate !== 'function') throw new Error('An independent target-specific candidate verifier is required.');
  const verified = verifyCandidate(Buffer.from(candidate));
  if (verified?.validation?.status !== 'passed' || verified?.semanticComparison?.status !== 'passed' || verified.validation.candidateByteHash !== candidateHash || verified.semanticComparison.candidateByteHash !== candidateHash || verified.validation.specificationHash !== request.specificationHash || verified.semanticComparison.specificationHash !== request.specificationHash || verified.validation.logicalHash !== request.logicalHash || verified.semanticComparison.logicalHash !== request.logicalHash || verified.semanticComparison.byteEqualityRequired !== false) throw new Error('SprMaker candidate lacks exact strict validation and semantic comparison receipts.');
  const receipt = { schema: 'ikemaker.sff-v1-sprmaker-execution-receipt', version: 1, status: 'passed', requestHash: request.requestHash, toolchainHash: request.toolchainHash, stagePlanHash: request.stagePlanHash, specificationHash: request.specificationHash, logicalHash: request.logicalHash, recipeByteHash: request.recipeByteHash, candidateByteHash: candidateHash, validation: verified.validation, semanticComparison: verified.semanticComparison, byteEqualityRequired: false, candidateAccepted: true, adoptionAllowed: false };
  receipt.receiptHash = hashCanonical(receipt); return freeze(receipt);
}

module.exports = { LIMITS, createSprMakerExecutionRequest, assertSprMakerExecutionRequest, validateSprMakerExecutionResult };
