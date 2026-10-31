'use strict';

const crypto = require('crypto');
const { createSffV21Bytes } = require('./sff_v21_writer');
const { assertSffV21Mixed } = require('./sff_v21_mixed_strict_validator');

const BUILTIN_SFF_V21_PNG8_BACKEND = Object.freeze({
  id: 'ikemaker-builtin-sff-v21-png8',
  label: 'IKEMaker Built-in SFF v2.1 PNG8 / True Color (Compare only)',
  mode: 'compare-only',
  candidateOnly: true,
  adoptionSupported: false,
  fullRebuildOnly: true,
  version: '2.1',
  spriteFormats: Object.freeze(['png8', 'png24', 'png32']),
  colorDepths: Object.freeze([8, 24, 32]),
  paletteColors: 256,
  emptyArchiveSupported: true,
  cropModes: Object.freeze(['none', 'before-axis', 'after-axis']),
  duplicatePolicies: Object.freeze(['preserve-separate', 'share-identical']),
  linksSupported: true,
  quantizationSupported: false,
  alternateCompressionSupported: false,
  validationProfile: 'sff-v2.1-png8-png24-png32-strict-v1'
});

const BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND = Object.freeze({
  ...BUILTIN_SFF_V21_PNG8_BACKEND,
  id: 'ikemaker-builtin-sff-v21-png8-prerelease',
  label: 'IKEMaker Built-in SFF v2.1 PNG8 / True Color (Pre-release comparison)',
  mode: 'prerelease-comparison-output',
  candidateOnly: true,
  adoptionSupported: false,
  requiresSprMake2Comparison: true
});

const BUILTIN_SFF_REVIEWED_PHYSICAL_TRANSFER_BACKEND = Object.freeze({
  ...BUILTIN_SFF_V21_PNG8_BACKEND,
  id: 'ikemaker-builtin-reviewed-physical-transfer',
  label: 'IKEMaker Built-in SFF v2.1 (Reviewed physical Transfer)',
  mode: 'reviewed-physical-transfer',
  candidateOnly: false,
  adoptionSupported: true,
  requiresReviewedPhysicalPlan: true
});

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function createBuiltInCompareCandidate(specification, options = {}) {
  const bytes = createSffV21Bytes(specification, options);
  const validation = assertSffV21Mixed(bytes, specification, options.validationOptions || {});
  return {
    kind: 'private-compare-candidate',
    adoptionAllowed: false,
    backend: BUILTIN_SFF_V21_PNG8_BACKEND,
    specificationHash: specification.specificationHash,
    byteHash: sha256(bytes),
    bytes,
    validation: {
      status: 'passed',
      profile: validation.profile,
      evidence: validation.evidence,
      physicalOrder: validation.physicalOrder
    }
  };
}

function createBuiltInPreReleaseCandidate(specification, options = {}) {
  const bytes = createSffV21Bytes(specification, options);
  const validation = assertSffV21Mixed(bytes, specification, { ...(options.validationOptions || {}), compatibilityProfile: 'canonical' });
  return {
    kind: 'private-prerelease-comparison-candidate',
    adoptionAllowed: false,
    comparisonRequired: true,
    backend: BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND,
    specificationHash: specification.specificationHash,
    byteHash: sha256(bytes),
    bytes,
    validation: {
      status: 'passed',
      profile: validation.profile,
      compatibilityProfile: validation.compatibilityProfile,
      evidence: validation.evidence,
      physicalOrder: validation.physicalOrder
    }
  };
}

function createBuiltInReviewedPhysicalTransferCandidate(specification, options = {}) {
  if (!specification?.options?.shared?.reviewedPhysicalSpritePlan) throw new Error('Reviewed physical Transfer backend requires a sealed physical sprite plan.');
  const bytes = createSffV21Bytes(specification, options);
  const validation = assertSffV21Mixed(bytes, specification, { ...(options.validationOptions || {}), compatibilityProfile: 'canonical' });
  return {
    kind: 'private-reviewed-physical-transfer-candidate',
    adoptionAllowed: true,
    backend: BUILTIN_SFF_REVIEWED_PHYSICAL_TRANSFER_BACKEND,
    specificationHash: specification.specificationHash,
    byteHash: sha256(bytes),
    bytes,
    validation: {
      status: 'passed',
      profile: validation.profile,
      compatibilityProfile: validation.compatibilityProfile,
      evidence: validation.evidence,
      physicalOrder: validation.physicalOrder
    }
  };
}

module.exports = { BUILTIN_SFF_V21_PNG8_BACKEND, BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND, BUILTIN_SFF_REVIEWED_PHYSICAL_TRANSFER_BACKEND, createBuiltInCompareCandidate, createBuiltInPreReleaseCandidate, createBuiltInReviewedPhysicalTransferCandidate };
