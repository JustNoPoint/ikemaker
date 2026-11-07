'use strict';

const crypto = require('crypto');
const { createSffBuildSpecification, canonicalize: canonicalizeLegacy, specificationHash: legacySpecificationHash } = require('./sff_build_specification');
const { createSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');

const MIGRATION_CONTRACT_VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function requiredHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }

function readSealedLegacyV21Specification(input = {}) {
  const { bytes, parsed: legacy } = decodeStrictJsonArtifact(input.artifactBytes, 'Legacy specification');
  const artifactHash = sha(bytes), expectedArtifact = requiredHash(input.expectedArtifactByteHash, 'expectedArtifactByteHash');
  if (artifactHash !== expectedArtifact) throw new Error('Legacy specification artifact byte hash does not match the independent receipt.');
  if (legacy?.schema !== 'ikemaker.sff-build-specification' || legacy?.version !== 1) throw new Error('Only ikemaker.sff-build-specification v1 can use this migration bridge.');
  if (String(legacy.target?.sffVersion) !== '2.1') throw new Error('This migration bridge accepts only sealed legacy SFF v2.1 specifications.');
  const expectedSpecification = requiredHash(input.expectedLegacySpecificationHash, 'expectedLegacySpecificationHash');
  const embedded = requiredHash(legacy.specificationHash, 'legacy specificationHash');
  if (embedded !== expectedSpecification) throw new Error('Legacy embedded specification hash does not match the independent receipt.');
  if (legacySpecificationHash(legacy) !== embedded) throw new Error('Legacy specification content was modified or rehashed incorrectly.');
  let normalized;
  try {
    normalized = createSffBuildSpecification({ planId: legacy.planId, sourceRoot: legacy.sourceRoot, target: legacy.target, sprites: legacy.sprites, palettes: legacy.palettes, requirements: legacy.requirements, decisions: legacy.decisions, options: legacy.options });
  } catch (error) { throw new Error(`Legacy specification is self-hashed but invalid: ${error.message}`); }
  if (JSON.stringify(canonicalizeLegacy(normalized)) !== JSON.stringify(canonicalizeLegacy(legacy))) throw new Error('Legacy specification is self-hashed but is not the canonical Creator schema-v1 form.');
  return deepFreeze({ specification: normalized, sourceArtifactByteHash: artifactHash, legacySpecificationHash: embedded });
}

function migrateSealedLegacyV21Specification(input = {}) {
  const sealed = readSealedLegacyV21Specification(input), legacy = sealed.specification, artifactHash = sealed.sourceArtifactByteHash, embedded = sealed.legacySpecificationHash;

  const palettes = (legacy.palettes || []).map((item) => ({
    entryId: item.entryId, group: item.group, number: item.number, tableOrder: 'archive-index', colors: item.colors,
    contentLinkTargetEntryId: item.linkTargetEntryId || null,
    source: { kind: 'complete-image', relativePath: item.source?.relativePath, byteHash: item.source?.byteHash, decodedHash: item.source?.decodedHash || null, provenance: item.source?.provenance || {} },
    provenance: { migratedFromLegacyDuplicatePolicy: item.duplicatePolicy }
  }));
  const paletteEntryByIdentity = new Map(palettes.map((item) => [`${item.group},${item.number}`, item.entryId]));
  const sprites = (legacy.sprites || []).map((item) => {
    const pixelKind = Number(item.colorDepth) === 8 ? 'indexed8' : Number(item.colorDepth) === 24 ? 'rgb24' : Number(item.colorDepth) === 32 ? 'rgba32' : null;
    if (!pixelKind) throw new Error(`Legacy sprite ${item.entryId} has unsupported color depth ${item.colorDepth}.`);
    const legacyPaletteIdentity = item.paletteId ? String(item.paletteId).replace(/\s+/g, '') : null;
    const paletteEntryId = legacyPaletteIdentity ? paletteEntryByIdentity.get(legacyPaletteIdentity) : null;
    if (legacyPaletteIdentity && !paletteEntryId) throw new Error(`Legacy sprite ${item.entryId} references missing palette identity ${legacyPaletteIdentity}.`);
    return {
      entryId: item.entryId, group: item.group, number: item.number, width: item.source?.width, height: item.source?.height, axisX: item.axisX, axisY: item.axisY,
      pixels: { kind: pixelKind, decodedHash: item.source?.decodedHash }, paletteEntryId, contentLinkTargetEntryId: item.linkTargetEntryId || null,
      source: { kind: 'complete-image', relativePath: item.source?.relativePath, byteHash: item.source?.byteHash, decodedHash: item.source?.decodedHash, provenance: item.source?.provenance || {} },
      provenance: { migratedFormat: item.format, migratedCompression: item.compression, migratedDuplicatePolicy: item.duplicatePolicy, migratedCrop: item.crop || null, migratedPaletteIdentity: item.paletteId || null }
    };
  });
  const review = {
    ...(input.review || {}),
    migration: {
      sourceSchema: legacy.schema, sourceVersion: legacy.version, sourceArtifactByteHash: artifactHash,
      legacySpecificationHash: embedded, migrationContractVersion: MIGRATION_CONTRACT_VERSION,
      explicitSelection: { targetId: 'sff-v2.1', backendId: input.backendId }, reviewRequired: true,
      decisions: legacy.decisions || [], legacyEnvelope: { requirements: legacy.requirements || [], options: legacy.options || {} }
    }
  };
  const optimization = require('./sff_png8_optimization'), mode = optimization.legacyPng8Optimization(legacy), encodingIntent = { ...(input.encodingIntent || {}) };
  if (mode !== optimization.NONE && optimization.NATIVE_V21.has(input.backendId)) {
    const bags = { ...(encodingIntent.backendOptions || {}) }, selected = { ...(bags[input.backendId] || {}) };
    if (selected.png8Optimization !== undefined && selected.png8Optimization !== mode) throw new Error('PNG8 optimization drifted from the sealed legacy build profile.');
    bags[input.backendId] = { ...selected, png8Optimization: mode }; encodingIntent.backendOptions = bags;
  }
  return createSffBuildSpecificationV2({
    planId: legacy.planId,
    selection: { targetId: 'sff-v2.1', backendId: input.backendId },
    archive: { identity: legacy.target.archiveIdentity, fingerprint: legacy.target.archiveFingerprint },
    logical: { sourceRoot: legacy.sourceRoot, sprites, palettes, provenance: { migratedFromSealedLegacyV21: true } },
    encodingIntent, capabilityRequest: input.capabilityRequest || {}, review
  });
}

module.exports = { MIGRATION_CONTRACT_VERSION, readSealedLegacyV21Specification, migrateSealedLegacyV21Specification };
