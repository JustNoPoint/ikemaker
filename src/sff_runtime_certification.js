'use strict';

const crypto = require('crypto');

const RESULT_STATES = new Set(['pending', 'pass', 'fail']);
const REQUIRED_PLATFORMS = Object.freeze(['windows-x64', 'linux-x64']);
const OPTIONAL_PLATFORMS = Object.freeze(['macos-arm64', 'macos-x64']);
const REQUIRED_CHECKS = Object.freeze(['load', 'reopen', 'identityTable', 'renderComparison', 'transparency', 'linkedData']);
const PLATFORM_ARCHITECTURES = Object.freeze({ 'windows-x64': 'x64', 'linux-x64': 'x64', 'macos-arm64': 'arm64', 'macos-x64': 'x64' });
const WINDOWS_SCOPE = 'windows-x64', CROSS_PLATFORM_SCOPE = 'cross-platform';
function authoringValidationScope() { return process.platform === 'win32' && process.arch === 'x64' ? WINDOWS_SCOPE : CROSS_PLATFORM_SCOPE; }

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function assertManifest(manifest) {
  if (!manifest || manifest.kind !== 'ikemaker-sff-runtime-certification-fixtures' || ![2, 3, 4, 5].includes(manifest.version)) throw new Error('This is not a supported IKEMaker SFF runtime-certification manifest.');
  if (manifest.adoptionAllowed !== false) throw new Error('Runtime-certification fixtures must explicitly forbid adoption.');
  if (!Array.isArray(manifest.fixtures) || !manifest.fixtures.length) throw new Error('The certification manifest has no fixtures.');
  if (manifest.version >= 4) {
    if (!manifest.targetId || !manifest.backendId || !manifest.adapter?.id || !Number.isSafeInteger(Number(manifest.adapter.version))) throw new Error('Certification manifest v4 must bind a target, backend, and adapter version.');
    if (!manifest.strictValidator?.id || !Number.isSafeInteger(Number(manifest.strictValidator.version)) || !manifest.strictValidator.profile) throw new Error('Certification manifest v4 must bind its strict validator identity and profile.');
  }
  const ids = new Set();
  for (const fixture of manifest.fixtures) {
    if (!fixture?.id || ids.has(fixture.id) || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(fixture.id)) throw new Error('Certification fixture IDs must be unique stable names.');
    ids.add(fixture.id);
    if (fixture.runtimeExpectation !== undefined && (manifest.version !== 5 || fixture.id !== 'reserved-group-negative' || fixture.runtimeExpectation !== 'reserved-group-unaddressable' || fixture.sprites?.length !== 1 || fixture.sprites[0].group !== 65535)) throw new Error('Unknown or malformed certification runtime-negative expectation.');
    if (manifest.version === 5 && fixture.id === 'reserved-group-negative' && fixture.runtimeExpectation !== 'reserved-group-unaddressable') throw new Error('The reserved group negative fixture must retain its explicit runtime expectation.');
    if (!/^[a-f0-9]{64}$/.test(String(fixture.byteHash || ''))) throw new Error(`Certification fixture ${fixture.id} has no sealed archive hash.`);
    for (const [label, artifact] of [['specification', fixture.specification], ['strict validation report', fixture.strictValidation]]) if (!artifact?.filename || !/^[a-f0-9]{64}$/.test(String(artifact.byteHash || ''))) throw new Error(`Certification fixture ${fixture.id} has no sealed ${label}.`);
    if (manifest.version >= 3) for (const [index, sprite] of (fixture.sprites || []).entries()) {
      for (const field of ['sourcePngByteHash', 'expectedPngByteHash']) if (!/^[a-f0-9]{64}$/.test(String(sprite?.[field] || ''))) throw new Error(`Certification fixture ${fixture.id} sprite #${index} has no sealed ${field}.`);
      const trueColor = ['png24', 'png32'].includes(String(sprite?.format || '').toLowerCase());
      if (trueColor) { if (!/^[a-f0-9]{64}$/.test(String(sprite?.expectedDecodedHash || '')) || ![24, 32].includes(Number(sprite?.colorDepth))) throw new Error(`Certification fixture ${fixture.id} true-color sprite #${index} lacks its sealed decoded hash or depth.`); }
      else for (const field of ['expectedDecodedIndexHash', 'expectedPaletteRgbaHash']) if (!/^[a-f0-9]{64}$/.test(String(sprite?.[field] || ''))) throw new Error(`Certification fixture ${fixture.id} sprite #${index} has no sealed ${field}.`);
    }
  }
  return manifest;
}

function fixtureResult(fixture) {
  return {
    fixtureId: fixture.id, fixtureByteHash: fixture.byteHash,
    checks: Object.fromEntries(REQUIRED_CHECKS.map(name => [name, 'pending'])),
    checkEvidence: Object.fromEntries(REQUIRED_CHECKS.map(name => [name, []])),
    optionalDataChecks: { decodedIndexes: 'pending', paletteBytes: 'pending' },
    notes: ''
  };
}

function platformResult(platformId, manifest) {
  return { platformId, required: REQUIRED_PLATFORMS.includes(platformId), tester: '', testedAt: '', osVersion: '', architecture: platformId.split('-').at(-1), ikemenBuild: '', fixtures: manifest.fixtures.map(fixtureResult), notes: '' };
}

function createCertificationLedger(manifest, manifestBytes) {
  assertManifest(manifest);
  if (!Buffer.isBuffer(manifestBytes)) throw new Error('Bind the certification ledger to the exact manifest bytes.');
  return {
    kind: 'ikemaker-sff-runtime-certification-results', version: 2,
    fixtureManifestSha256: sha256(manifestBytes), writerProfile: manifest.writerProfile,
    adoptionAllowed: false, gatePolicy: { requiredPlatforms: [...REQUIRED_PLATFORMS], optionalPlatforms: [...OPTIONAL_PLATFORMS], requiredChecks: [...REQUIRED_CHECKS] },
    platforms: [...REQUIRED_PLATFORMS, ...OPTIONAL_PLATFORMS].map(id => platformResult(id, manifest))
  };
}

function validateCertificationLedger(manifest, manifestBytes, ledger, options = {}) {
  assertManifest(manifest);
  const validationScope = options.validationScope || CROSS_PLATFORM_SCOPE;
  if (![WINDOWS_SCOPE, CROSS_PLATFORM_SCOPE].includes(validationScope)) throw new Error('Unknown SFF certification validation scope.');
  const issues = [], expectedManifestHash = sha256(manifestBytes), fixtureMap = new Map(manifest.fixtures.map(item => [item.id, item]));
  if (!Buffer.isBuffer(manifestBytes)) throw new Error('Validate the certification ledger against the exact manifest bytes.');
  if (!ledger || ledger.kind !== 'ikemaker-sff-runtime-certification-results' || ledger.version !== 2) issues.push('Unsupported certification result schema.');
  if (ledger?.fixtureManifestSha256 !== expectedManifestHash) issues.push('The result ledger is not bound to these exact certification-manifest bytes.');
  if (ledger?.writerProfile !== manifest.writerProfile) issues.push('The result ledger is bound to the wrong writer profile.');
  if (ledger?.adoptionAllowed !== false) issues.push('The result ledger must never grant adoption authority.');
  const rows = Array.isArray(ledger?.platforms) ? ledger.platforms : [], seenPlatforms = new Set();
  for (const row of rows) {
    if (!row?.platformId || seenPlatforms.has(row.platformId)) { issues.push('Platform result IDs must be present and unique.'); continue; }
    seenPlatforms.add(row.platformId);
    if (!Object.hasOwn(PLATFORM_ARCHITECTURES, row.platformId)) { issues.push(`Unknown physical platform ${row.platformId}.`); continue; }
    if (Boolean(row.required) !== REQUIRED_PLATFORMS.includes(row.platformId)) issues.push(`${row.platformId} has the wrong required/optional classification.`);
    if (row.architecture !== PLATFORM_ARCHITECTURES[row.platformId]) issues.push(`${row.platformId} must record architecture ${PLATFORM_ARCHITECTURES[row.platformId]}.`);
    const fixtureRows = Array.isArray(row.fixtures) ? row.fixtures : [], seenFixtures = new Set();
    for (const result of fixtureRows) {
      const expected = fixtureMap.get(result?.fixtureId);
      if (!expected || seenFixtures.has(result.fixtureId)) { issues.push(`${row.platformId} contains an unknown or duplicate fixture result.`); continue; }
      seenFixtures.add(result.fixtureId);
      if (result.fixtureByteHash !== expected.byteHash) issues.push(`${row.platformId}/${result.fixtureId} is bound to the wrong fixture bytes.`);
      for (const name of REQUIRED_CHECKS) {
        const state = result.checks?.[name], evidence = result.checkEvidence?.[name];
        if (!RESULT_STATES.has(state)) { issues.push(`${row.platformId}/${result.fixtureId}/${name} has an invalid result state.`); continue; }
        if (!Array.isArray(evidence)) { issues.push(`${row.platformId}/${result.fixtureId}/${name} has no evidence list.`); continue; }
        const seenEvidence = new Set();
        for (const item of evidence) {
          const id = String(item?.id || ''), hash = String(item?.sha256 || ''), description = String(item?.description || '');
          if (!id || id.length > 500 || seenEvidence.has(id) || !/^[a-f0-9]{64}$/.test(hash) || !description.trim() || description.length > 1000) issues.push(`${row.platformId}/${result.fixtureId}/${name} has invalid or duplicate hashed evidence metadata.`);
          seenEvidence.add(id);
        }
        if (state !== 'pending' && !evidence.length) issues.push(`${row.platformId}/${result.fixtureId}/${name} must attach hashed evidence before recording ${state}.`);
      }
      for (const [name, state] of Object.entries(result.optionalDataChecks || {})) if (!['decodedIndexes', 'paletteBytes'].includes(name) || !RESULT_STATES.has(state)) issues.push(`${row.platformId}/${result.fixtureId} has an invalid optional data check.`);
    }
    for (const fixture of manifest.fixtures) if (!seenFixtures.has(fixture.id)) issues.push(`${row.platformId} is missing fixture ${fixture.id}.`);
    const hasRecordedCheck = fixtureRows.some(result => REQUIRED_CHECKS.some(name => result.checks?.[name] !== 'pending'));
    if (hasRecordedCheck) {
      const tester = String(row.tester || ''), osVersion = String(row.osVersion || ''), build = String(row.ikemenBuild || ''), testedAt = String(row.testedAt || '');
      if (!tester.trim() || tester.length > 200) issues.push(`${row.platformId} must record a bounded tester identity.`);
      if (!osVersion.trim() || osVersion.length > 500) issues.push(`${row.platformId} must record the exact bounded OS version.`);
      if (!build.trim() || build.length > 500) issues.push(`${row.platformId} must record the exact bounded IKEMEN build.`);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(testedAt) || Number.isNaN(Date.parse(testedAt)) || new Date(testedAt).toISOString() !== testedAt) issues.push(`${row.platformId} must record testedAt as an exact UTC ISO timestamp.`);
    }
  }
  for (const platformId of REQUIRED_PLATFORMS) if (!seenPlatforms.has(platformId)) issues.push(`Missing required physical platform ${platformId}.`);
  const requiredRows = REQUIRED_PLATFORMS.map(id => rows.find(row => row.platformId === id));
  const complete = row => row && row.fixtures.length === manifest.fixtures.length && row.fixtures.every(result => REQUIRED_CHECKS.every(name => result.checks[name] === 'pass' && result.checkEvidence[name].length > 0));
  const crossPlatformGateSatisfied = !issues.length && requiredRows.every(complete), scopedRows = validationScope === WINDOWS_SCOPE ? requiredRows.filter(row => row?.platformId === WINDOWS_SCOPE) : requiredRows;
  const physicalGateSatisfied = !issues.length && scopedRows.length > 0 && scopedRows.every(complete), unverifiedPlatforms = REQUIRED_PLATFORMS.filter(id => !complete(rows.find(row => row.platformId === id)));
  return { valid: issues.length === 0, issues, validationScope, physicalGateSatisfied, crossPlatformGateSatisfied, unverifiedPlatforms, adoptionAllowed: false, status: physicalGateSatisfied ? 'physical-evidence-complete-review-required' : 'physical-evidence-incomplete' };
}

function strictJson(text, label) {
  if (typeof text !== 'string' || !text.length) throw new Error(`${label} exact UTF-8 text is required.`);
  let value; try { value = JSON.parse(text); } catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  return value;
}

function validateCertificationEvidence(backend, targetId, evidence = {}) {
  try {
    const hostScope = authoringValidationScope(), validationScope = evidence.validationScope || hostScope;
    if (![WINDOWS_SCOPE, CROSS_PLATFORM_SCOPE].includes(validationScope) || validationScope === WINDOWS_SCOPE && hostScope !== WINDOWS_SCOPE) throw new Error('Windows-scoped certification cannot authorize this host. Complete its required platform evidence.');
    const manifestBytes = Buffer.from(evidence.manifestText || '', 'utf8'), ledgerBytes = Buffer.from(evidence.ledgerText || '', 'utf8');
    const manifest = strictJson(evidence.manifestText, 'Certification manifest'), ledger = strictJson(evidence.ledgerText, 'Certification ledger');
    assertManifest(manifest);
    const manifestHash = sha256(manifestBytes), approved = backend?.certificationManifestHashes || [];
    if (!approved.includes(manifestHash)) throw new Error('Certification manifest hash is not pinned for this backend.');
    if (manifest.targetId !== targetId || manifest.backendId !== backend.id || manifest.adapter?.id !== backend.adapter.id || Number(manifest.adapter?.version) !== Number(backend.adapter.version)) throw new Error('Certification manifest target/backend/adapter identity does not match the selected backend.');
    if (manifest.strictValidator?.id !== backend.strictValidator?.id || Number(manifest.strictValidator?.version) !== Number(backend.strictValidator?.version) || manifest.strictValidator?.profile !== backend.strictValidator?.profile || manifest.writerProfile !== backend.writerProfile) throw new Error('Certification manifest validator or writer profile is not approved for this backend.');
    const validation = validateCertificationLedger(manifest, manifestBytes, ledger, { validationScope });
    if (!validation.valid || !validation.physicalGateSatisfied || validation.adoptionAllowed !== false || validation.status !== 'physical-evidence-complete-review-required') throw new Error('Certification ledger does not contain complete valid physical evidence.');
    const artifacts = evidence.evidenceArtifacts;
    if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) throw new Error('Exact certification evidence artifacts are required.');
    const requiredIds = new Set();
    for (const platform of ledger.platforms.filter(item => REQUIRED_PLATFORMS.includes(item.platformId))) for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) for (const item of fixture.checkEvidence[check]) {
      if (requiredIds.has(item.id)) throw new Error(`Certification evidence ID ${item.id} is reused.`);
      requiredIds.add(item.id);
      const encoded = artifacts[item.id];
      if (typeof encoded !== 'string' || !encoded.length) throw new Error(`Certification evidence artifact ${item.id} is missing.`);
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64').replace(/=+$/,'') !== encoded.replace(/=+$/,'') || sha256(bytes) !== item.sha256) throw new Error(`Certification evidence artifact ${item.id} does not match its ledger hash.`);
    }
    if (Object.keys(artifacts).some(id => !requiredIds.has(id))) throw new Error('Certification evidence includes unreviewed extra artifacts.');
    return { valid: true, validationScope, manifestHash, ledgerHash: sha256(ledgerBytes), validation, evidenceArtifactCount: requiredIds.size, adoptionAllowed: false };
  } catch (error) { return { valid: false, error: error.message, adoptionAllowed: false }; }
}

module.exports = { RESULT_STATES, REQUIRED_PLATFORMS, OPTIONAL_PLATFORMS, REQUIRED_CHECKS, PLATFORM_ARCHITECTURES, WINDOWS_SCOPE, CROSS_PLATFORM_SCOPE, authoringValidationScope, createCertificationLedger, validateCertificationLedger, validateCertificationEvidence };
