'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { prepareCreatorTestBuild } = require('./sff_creator_test_build');
const { projectV21RequestSpecification } = require('./sff_builtin_candidate_evidence');
const { assertSffV21Png8, SFF_V21_PNG8_VALIDATOR_PROFILE } = require('./sff_v21_strict_validator');
const { transactionalWriteSet } = require('./mutation_safety');
const commands = require('./sff_commands');
const comparisonModule = require('./sff_backend_comparison');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(canonicalize(value, 'dual test build evidence'))}\n`); }
function within(child, parent) { const relative = path.relative(path.resolve(parent), path.resolve(child)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function fail(message) { throw new Error(`SFF Creator dual test build: ${message}`); }
const DEFAULT_LIMITS = Object.freeze({ toolBytes: 64 * 1024 * 1024, definitionBytes: 8 * 1024 * 1024, candidateBytes: 1024 * 1024 * 1024, evidenceBytes: 8 * 1024 * 1024, processLogBytes: 1024 * 1024, timeoutMs: 120000 });
function identity(stat) { return `${stat.dev}:${stat.ino}`; }
function sealDirectory(directory, parent = null, label = 'directory') {
  const lexical = path.resolve(directory), stat = fs.lstatSync(lexical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} is not a direct regular directory.`);
  const realpath = fs.realpathSync.native(lexical), realStat = fs.statSync(realpath);
  if (!realStat.isDirectory() || identity(stat) !== identity(realStat)) fail(`${label} identity is ambiguous.`);
  if (parent && (!within(lexical, parent.lexical) || !within(realpath, parent.realpath))) fail(`${label} escapes its sealed parent.`);
  return Object.freeze({ lexical, realpath, identity: identity(realStat) });
}
function recheckDirectory(seal, label) { const current = sealDirectory(seal.lexical, null, label); if (current.realpath !== seal.realpath || current.identity !== seal.identity) fail(`${label} identity drifted.`); }
function readRegular(filename, expectedHash, label, maxBytes = Number.MAX_SAFE_INTEGER) {
  const before = fs.lstatSync(filename); if (!before.isFile() || before.isSymbolicLink()) fail(`${label} is not a regular file.`);
  if (before.size > maxBytes) fail(`${label} exceeds the bounded ${maxBytes}-byte limit.`);
  const bytes = fs.readFileSync(filename), after = fs.lstatSync(filename);
  if (identity(before) !== identity(after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail(`${label} changed while read.`);
  if (expectedHash && sha(bytes) !== expectedHash) fail(`${label} hash drifted.`);
  return bytes;
}
function readSealedFile(filename, root, expectedHash, label, maxBytes) {
  const lexical = path.resolve(filename); if (!within(lexical, root.lexical)) fail(`${label} escapes its sealed root.`);
  const lexicalStat = fs.lstatSync(lexical); if (!lexicalStat.isFile() || lexicalStat.isSymbolicLink()) fail(`${label} is not a direct regular file.`);
  if (lexicalStat.size > maxBytes) fail(`${label} exceeds the bounded ${maxBytes}-byte limit.`);
  const realpath = fs.realpathSync.native(lexical);
  if (!within(realpath, root.realpath)) fail(`${label} resolves outside its sealed root.`);
  const stat = fs.statSync(realpath); if (identity(stat) !== identity(lexicalStat)) fail(`${label} identity is ambiguous.`);
  const bytes = readRegular(lexical, expectedHash, label, maxBytes), afterRealpath = fs.realpathSync.native(lexical), afterStat = fs.statSync(afterRealpath);
  if (afterRealpath !== realpath || identity(afterStat) !== identity(stat)) fail(`${label} identity drifted while read.`);
  return Object.freeze({ bytes, lexical, realpath, identity: identity(stat), byteHash: sha(bytes) });
}
function ensureOutputRoot(buildRoot) {
  const directory = path.join(buildRoot.lexical, 'test-candidates');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  return sealDirectory(directory, buildRoot, 'test candidate directory');
}
function toolIdentity(filename, maxBytes) {
  const resolved = path.resolve(filename), bytes = readRegular(resolved, null, 'SprMake2 executable', maxBytes);
  const stat = fs.statSync(resolved);
  return Object.freeze({ identity: path.basename(resolved), byteHash: sha(bytes), byteLength: bytes.length, fileIdentity: identity(stat), realpath: fs.realpathSync.native(resolved) });
}
function assertStrictSprMake2Verification(result, candidateHash, specificationHash) {
  if (!result || result.strict?.status !== 'passed') fail('SprMake2 strict verification did not pass.');
  if (result.strict.profile !== SFF_V21_PNG8_VALIDATOR_PROFILE || result.strict.compatibilityProfile !== 'sprmake2-v2.1') fail('SprMake2 strict verification used the wrong validator or compatibility profile.');
  if (result.candidateByteHash !== candidateHash || result.strict.candidateByteHash !== candidateHash) fail('SprMake2 verification is not bound to the exact candidate hash.');
  if (result.specificationHash !== specificationHash || result.strict.specificationHash !== specificationHash) fail('SprMake2 verification is not bound to the exact reviewed specification.');
}
function assertComparison(report, rejected, builtHash, sprHash) {
  if (!report || typeof report !== 'object') fail('comparison returned malformed evidence.');
  if (report.schema !== 'ikemaker.sff-backend-comparison' || report.version !== 1 || report.independentlyValidated !== true) fail('comparison returned malformed or non-independent evidence.');
  if (rejected ? report.status !== 'rejected-semantic-mismatch' || report.semanticEquivalent !== false : report.status !== 'equivalent' || report.semanticEquivalent !== true) fail('comparison status and semantic result are inconsistent.');
  if (report.candidates?.builtIn?.byteHash !== builtHash || report.candidates?.sprMake2?.byteHash !== sprHash) fail('comparison evidence does not bind the exact independently verified candidates.');
  const candidateKeys = ['adoptionAllowed', 'backendId', 'byteHash', 'byteLength'];
  for (const candidate of [report.candidates.builtIn, report.candidates.sprMake2]) if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify(candidateKeys)) fail('comparison candidate evidence is not a closed record.');
  if (report.candidates.builtIn.adoptionAllowed !== false || report.candidates.sprMake2.adoptionAllowed !== false) fail('comparison candidate evidence is not closed against adoption.');
  if (report.adoption?.attempted !== false || report.adoption?.sprMake2CandidateAdopted !== false || report.adoption?.builtInCandidateAdopted !== false || report.adoption?.supportedByThisWorkflow !== false) fail('comparison evidence is not closed against adoption authority.');
}
function cleanupFailedOwnedRun(directory, seal, marker, token, transactionToken) {
  try {
    recheckDirectory(seal, 'failed private run directory');
    const temporary = `.${path.basename(marker)}.${transactionToken}.tmp`, names = fs.readdirSync(directory), allowed = new Set([path.basename(marker), temporary]);
    if (names.some(name => !allowed.has(name))) return false;
    for (const name of names) {
      const filename = path.join(directory, name), stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 || fs.readFileSync(filename, 'ascii') !== token) return false;
    }
    fs.rmSync(directory, { recursive: true, force: true });
    return true;
  } catch (_) { return false; }
}
function createOwnedRun(writeSet = transactionalWriteSet) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-pair-')), seal = sealDirectory(directory, null, 'private run directory');
  const token = crypto.randomBytes(32).toString('hex'), marker = path.join(directory, '.ikemaker-owned-run'), transactionToken = `owned-marker-${crypto.randomBytes(8).toString('hex')}`;
  try {
    writeSet(fs, [[marker, Buffer.from(token, 'ascii')]], { label: 'sff-creator-private-run-owner', allowExisting: false, backup: false, journal: false, token: transactionToken });
    fs.chmodSync(marker, 0o600);
  } catch (error) {
    cleanupFailedOwnedRun(directory, seal, marker, token, transactionToken);
    throw error;
  }
  const markerSeal = readSealedFile(marker, seal, null, 'private run ownership marker', 128);
  return Object.freeze({ directory, candidate: path.join(directory, 'candidate-sprmake2.sff'), seal, token, marker: markerSeal });
}
function cleanupOwnedRun(run) {
  try {
    recheckDirectory(run.seal, 'private run directory');
    const marker = readSealedFile(run.marker.lexical, run.seal, run.marker.byteHash, 'private run ownership marker', 128);
    if (marker.identity !== run.marker.identity || marker.bytes.toString('ascii') !== run.token) return false;
    fs.rmSync(run.directory, { recursive: true, force: true }); return true;
  } catch (_) { return false; }
}

async function createCreatorDualV21TestBuild(input = {}, options = {}) {
  if (input.targetId !== 'sff-v2.1') fail('the dual-writer route is explicitly v2.1-only; no v2.0 or fallback route exists.');
  const deps = {
    prepare: options.prepareCreatorTestBuild || prepareCreatorTestBuild,
    stage: options.stagePrivateSprMakeRun || commands.stagePrivateSprMakeRun,
    run: options.runSprMake || commands.runSprMake,
    verify: options.verifyCandidateArchive || commands.verifyCandidateArchive,
    compatibility: options.sprMake2Compatibility || commands.sprMake2Compatibility,
    compare: options.compareSffBackends || comparisonModule.compareSffBackends,
    writeMarkerSet: options.writeMarkerSet || transactionalWriteSet
  };
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0) fail(`invalid ${name} safety limit.`);
  const prepared = deps.prepare(input), generated = input.build;
  if (!Buffer.isBuffer(prepared.candidate) || prepared.candidate.length > limits.candidateBytes) fail(`IKEMaker candidate exceeds the bounded ${limits.candidateBytes}-byte limit.`);
  if (!generated?.specification || generated.specification.specificationHash !== generated.specificationHash) fail('the SprMake2 package does not carry the same reviewed specification authority.');
  if (generated.sprMake2Available === false) fail(generated.sprMake2UnavailableReason || 'SprMake2 is unavailable.');
  const compatibility = deps.compatibility(generated.specification); if (!compatibility?.available) fail(`SprMake2 is incompatible: ${(compatibility?.reasons || []).join('; ')}`);
  if (!generated.sprmake || !fs.existsSync(generated.sprmake)) fail(`SprMake2 was not found: ${generated.sprmake || '(missing)'}`);
  const tool = toolIdentity(generated.sprmake, limits.toolBytes), definition = readSealedFile(generated.definitionPath, prepared.buildRoot, null, 'SprMake2 definition', limits.definitionBytes);
  const outputRoot = ensureOutputRoot(prepared.buildRoot), run = createOwnedRun(deps.writeMarkerSet);
  try {
    const staged = deps.stage(generated, run);
    if (!within(staged.outputDirectory, run.seal.lexical) || !within(staged.definitionPath, run.seal.lexical) || !within(staged.candidateOutputSff, run.seal.lexical)) fail('staged SprMake2 paths escape the sealed private run.');
    const stagedDefinition = readSealedFile(staged.definitionPath, run.seal, null, 'staged SprMake2 definition', limits.definitionBytes);
    recheckDirectory(run.seal, 'private run directory'); prepared.revalidate();
    const dispatchTool = toolIdentity(generated.sprmake, limits.toolBytes); if (dispatchTool.fileIdentity !== tool.fileIdentity || dispatchTool.realpath !== tool.realpath || dispatchTool.byteHash !== tool.byteHash) fail('SprMake2 executable identity drifted before dispatch.');
    const dispatchDefinition = readSealedFile(generated.definitionPath, prepared.buildRoot, definition.byteHash, 'SprMake2 definition dispatch check', limits.definitionBytes); if (dispatchDefinition.identity !== definition.identity || dispatchDefinition.realpath !== definition.realpath) fail('SprMake2 definition identity drifted before dispatch.');
    const log = await deps.run(staged, { maxOutputBytes: limits.processLogBytes, timeoutMs: limits.timeoutMs, signal: options.signal });
    if (Buffer.byteLength(String(log || ''), 'utf8') > limits.processLogBytes) fail(`SprMaker2 output exceeded the bounded ${limits.processLogBytes}-byte process log limit.`);
    recheckDirectory(run.seal, 'private run directory'); readSealedFile(stagedDefinition.lexical, run.seal, stagedDefinition.byteHash, 'staged SprMake2 definition final check', limits.definitionBytes);
    const sprBytes = readSealedFile(staged.candidateOutputSff, run.seal, null, 'private SprMake2 candidate', limits.candidateBytes).bytes;
    const sprHash = sha(sprBytes);
    const sprValidation = deps.verify(staged.candidateOutputSff, generated);
    assertStrictSprMake2Verification(sprValidation, sprHash, generated.specificationHash);
    const builtInProjected = projectV21RequestSpecification(prepared.specification);
    const builtInValidation = assertSffV21Png8(prepared.candidate, builtInProjected, { compatibilityProfile: 'canonical' });
    if (builtInValidation.profile !== SFF_V21_PNG8_VALIDATOR_PROFILE || builtInValidation.compatibilityProfile !== 'canonical') fail('IKEMaker candidate used the wrong strict validator profile.');
    let comparison, rejected = false;
    try { comparison = deps.compare({ specification: generated.specification, sprMake2CandidateBytes: sprBytes, builtInCandidateBytes: prepared.candidate, builtInBackendId: prepared.route.backendId }); }
    catch (error) {
      if (!(error instanceof comparisonModule.SffCandidateComparisonError) || !error.report) throw error;
      comparison = error.report; rejected = true;
    }
    const builtHash = prepared.candidateHash;
    assertComparison(comparison, rejected, builtHash, sprHash);
    if (typeof options.beforePublish === 'function') await options.beforePublish();
    prepared.revalidate(); recheckDirectory(outputRoot, 'test candidate directory');
    const finalTool = toolIdentity(generated.sprmake, limits.toolBytes); if (finalTool.fileIdentity !== tool.fileIdentity || finalTool.realpath !== tool.realpath || finalTool.byteHash !== tool.byteHash) fail('SprMake2 executable identity drifted.');
    const finalDefinition = readSealedFile(generated.definitionPath, prepared.buildRoot, definition.byteHash, 'SprMake2 definition final check', limits.definitionBytes); if (finalDefinition.identity !== definition.identity || finalDefinition.realpath !== definition.realpath) fail('SprMake2 definition identity drifted.');
    const pairHash = hashCanonical({ specificationHash: prepared.specification.specificationHash, projectionPlanHash: prepared.projection.planHash, builtHash, sprHash, comparison: comparison.status });
    const rejection = rejected ? 'REJECTED-NOT-EQUIVALENT-' : '';
    const builtPath = path.join(outputRoot.lexical, `${rejection}ikemaker-v21-png8-${builtHash.slice(0, 16)}.sff`);
    const sprPath = path.join(outputRoot.lexical, `${rejection}sprmake2-v21-png8-${sprHash.slice(0, 16)}.sff`);
    const reportPath = path.join(outputRoot.lexical, `${rejection}comparison-${pairHash.slice(0, 16)}.json`);
    const receiptPath = path.join(outputRoot.lexical, `pair-${pairHash.slice(0, 16)}.receipt.json`);
    const builtValidatorHash = hashCanonical({ ...builtInValidation, candidateByteHash: builtHash, specificationHash: prepared.specification.specificationHash }), sprValidatorHash = hashCanonical(sprValidation);
    const report = { ...comparison, purpose: 'TEST BUILD ONLY · No Adoption', packageSpecificationHash: generated.specificationHash, testSpecificationHash: prepared.specification.specificationHash, projectionPlanHash: prepared.projection.planHash, sourceSnapshotHash: prepared.sourceSnapshotHash, validators: { builtIn: { profile: builtInValidation.profile, compatibilityProfile: builtInValidation.compatibilityProfile, candidateByteHash: builtHash, specificationHash: prepared.specification.specificationHash, reportHash: builtValidatorHash }, sprMake2: { profile: sprValidation.strict.profile, compatibilityProfile: sprValidation.strict.compatibilityProfile, candidateByteHash: sprHash, specificationHash: generated.specificationHash, reportHash: sprValidatorHash } }, tool: { ...tool, definitionIdentity: path.basename(definition.lexical), definitionByteHash: definition.byteHash, stagedDefinitionByteHash: stagedDefinition.byteHash }, boundedLogTail: String(log || '').slice(-4000) };
    const reportBytes = jsonBytes(report), reportHash = sha(reportBytes);
    if (reportBytes.length > limits.evidenceBytes) fail(`comparison report exceeds the bounded ${limits.evidenceBytes}-byte limit.`);
    const writes = [[builtPath, prepared.candidate], [sprPath, sprBytes], [reportPath, reportBytes]];
    let receipt = null, receiptBytes = null;
    if (!rejected) {
      const core = { schema: 'ikemaker.sff-creator-test-pair-receipt', version: 1, status: 'validated-equivalent-test-pair', purpose: 'TEST BUILD ONLY · No Adoption', targetId: 'sff-v2.1', packageSpecificationHash: generated.specificationHash, packageSpecificationArtifactByteHash: String(generated.specificationArtifactByteHash || input.build.specificationArtifactByteHash).toLowerCase(), testSpecificationHash: prepared.specification.specificationHash, projectionPlanHash: prepared.projection.planHash, sourceSnapshotHash: prepared.sourceSnapshotHash, activeTarget: prepared.activeTarget, tool, candidates: { ikemaker: { identity: path.basename(builtPath), byteHash: builtHash, validatorReportHash: builtValidatorHash }, sprmake2: { identity: path.basename(sprPath), byteHash: sprHash, validatorReportHash: sprValidatorHash } }, comparison: { identity: path.basename(reportPath), byteHash: reportHash, status: comparison.status, semanticEquivalent: comparison.semanticEquivalent, byteEquivalent: comparison.byteEquivalent }, humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, approvalAuthorityGranted: false, dispatchAuthorityGranted: false, persistenceAuthorityGranted: false, executionAuthorityGranted: false, recoveryAuthorityGranted: false, vaultAuthorityGranted: false, historyAuthorityGranted: false, completedAuthorityGranted: false, completed: false, lifecycleState: null };
      receipt = { ...core, receiptHash: hashCanonical(core) }; receiptBytes = jsonBytes(receipt); if (receiptBytes.length > limits.evidenceBytes) fail(`pair receipt exceeds the bounded ${limits.evidenceBytes}-byte limit.`); writes.push([receiptPath, receiptBytes]);
    }
    for (const [filename] of writes) if (fs.existsSync(filename)) fail(`deterministic output already exists: ${path.basename(filename)}; no file was overwritten.`);
    recheckDirectory(outputRoot, 'test candidate directory'); prepared.revalidate();
    transactionalWriteSet(fs, writes, { label: rejected ? 'sff-creator-rejected-test-pair' : 'sff-creator-test-pair', allowExisting: false, backup: false, journal: false });
    if (typeof options.afterPublish === 'function') await options.afterPublish({ builtPath, sprPath, reportPath, receiptPath: rejected ? null : receiptPath });
    const reopenedBuilt = readSealedFile(builtPath, outputRoot, builtHash, 'persisted IKEMaker candidate', limits.candidateBytes).bytes, reopenedSpr = readSealedFile(sprPath, outputRoot, sprHash, 'persisted SprMake2 candidate', limits.candidateBytes).bytes;
    assertSffV21Png8(reopenedBuilt, builtInProjected, { compatibilityProfile: 'canonical' });
    let reopenedComparison;
    try { reopenedComparison = deps.compare({ specification: generated.specification, sprMake2CandidateBytes: reopenedSpr, builtInCandidateBytes: reopenedBuilt, builtInBackendId: prepared.route.backendId }); }
    catch (error) { if (!rejected || !(error instanceof comparisonModule.SffCandidateComparisonError) || !error.report) throw error; reopenedComparison = error.report; }
    assertComparison(reopenedComparison, rejected, builtHash, sprHash);
    const reopenedReportBytes = readSealedFile(reportPath, outputRoot, reportHash, 'persisted comparison report', limits.evidenceBytes).bytes, reopenedReport = JSON.parse(reopenedReportBytes.toString('utf8'));
    assertComparison(reopenedReport, rejected, builtHash, sprHash);
    if (reopenedReport.validators?.builtIn?.candidateByteHash !== builtHash || reopenedReport.validators?.sprMake2?.candidateByteHash !== sprHash || reopenedReport.packageSpecificationHash !== generated.specificationHash) fail('persisted comparison report cross-bindings drifted.');
    if (!rejected) {
      const reopenedReceiptBytes = readSealedFile(receiptPath, outputRoot, sha(receiptBytes), 'persisted pair receipt', limits.evidenceBytes).bytes, reopenedReceipt = JSON.parse(reopenedReceiptBytes.toString('utf8'));
      if (reopenedReceipt.receiptHash !== receipt.receiptHash || hashCanonical(Object.fromEntries(Object.entries(reopenedReceipt).filter(([key]) => key !== 'receiptHash'))) !== receipt.receiptHash) fail('persisted pair receipt hash drifted.');
      if (reopenedReceipt.candidates?.ikemaker?.identity !== path.basename(builtPath) || reopenedReceipt.candidates.ikemaker.byteHash !== builtHash || reopenedReceipt.candidates?.sprmake2?.identity !== path.basename(sprPath) || reopenedReceipt.candidates.sprmake2.byteHash !== sprHash || reopenedReceipt.comparison?.identity !== path.basename(reportPath) || reopenedReceipt.comparison.byteHash !== reportHash || reopenedReceipt.comparison.status !== 'equivalent' || reopenedReceipt.comparison.semanticEquivalent !== true) fail('persisted pair receipt cross-bindings drifted.');
    } else if (fs.existsSync(receiptPath)) fail('a rejected comparison must never retain a success receipt.');
    return Object.freeze({ status: rejected ? 'rejected-not-equivalent' : 'test-pair-created', purpose: 'TEST BUILD ONLY · No Adoption', builtInCandidatePath: builtPath, builtInCandidateHash: builtHash, sprMake2CandidatePath: sprPath, sprMake2CandidateHash: sprHash, comparisonReportPath: reportPath, comparisonReportHash: reportHash, receiptPath: rejected ? null : receiptPath, semanticEquivalent: !rejected, adoptionAllowed: false, draftResetAllowed: false });
  } finally {
    if (typeof options.beforeCleanup === 'function') await options.beforeCleanup(run);
    cleanupOwnedRun(run);
  }
}

module.exports = { DEFAULT_LIMITS, createCreatorDualV21TestBuild };
