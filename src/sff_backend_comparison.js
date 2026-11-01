'use strict';

// Pure, candidate-only comparison authority. This module deliberately has no
// filesystem adoption dependency and returns no callback capable of writing an
// active archive.

const crypto = require('crypto');
const { specificationHash } = require('./sff_build_specification');
const { createBuiltInCompareCandidate } = require('./sff_builtin_backend');
const { assertSffV21Png8 } = require('./sff_v21_strict_validator');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function requireBytes(value, label) {
  if (value instanceof Uint8Array && !Buffer.isBuffer(value)) value = Buffer.from(value);
  if (!Buffer.isBuffer(value)) throw new Error(`${label} must be immutable candidate bytes.`);
  return Buffer.from(value);
}

function assertDeepFrozen(value, label = 'specification', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Object.isFrozen(value)) throw new Error(`SFF backend comparison requires an immutable ${label}.`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${label}.${key}`, seen);
}

function assertCanonicalSpecification(specification) {
  if (!specification || typeof specification !== 'object') throw new Error('SFF backend comparison requires one reviewed build specification.');
  assertDeepFrozen(specification);
  const reviewed = String(specification.specificationHash || '').toLowerCase();
  const actual = specificationHash(specification);
  if (!/^[0-9a-f]{64}$/.test(reviewed) || reviewed !== actual) {
    throw new Error('SFF backend comparison rejected specification drift: the reviewed hash no longer matches its content.');
  }
  return reviewed;
}

function resolvedEntry(entries, index) {
  const seen = new Set();
  let current = entries[index];
  while (current && !current.dataSize) {
    if (seen.has(current.index)) throw new Error(`Validated candidate contains a link cycle at physical entry #${index}.`);
    seen.add(current.index);
    current = entries[current.link];
  }
  if (!current) throw new Error(`Validated candidate link #${index} has no stored target.`);
  return current;
}

function storageFact(entry, entries) {
  const resolved = resolvedEntry(entries, entry.index);
  return {
    kind: entry.dataSize ? 'stored' : 'linked',
    linkedToPhysicalIndex: entry.dataSize ? null : entry.link,
    resolvedPhysicalIndex: resolved.index
  };
}

function semanticModel(validation) {
  const palettes = validation.palettes || [];
  const sprites = validation.sprites || [];
  return {
    profile: validation.profile,
    physicalSpriteOrder: sprites.map((sprite) => `${sprite.group},${sprite.number}`),
    physicalPaletteOrder: palettes.map((palette) => `${palette.group},${palette.number}`),
    sprites: sprites.map((sprite) => {
      const palette = palettes[sprite.paletteIndex];
      const resolvedPalette = palette ? resolvedEntry(palettes, palette.index) : null;
      return {
        physicalIndex: sprite.index,
        identity: `${sprite.group},${sprite.number}`,
        axis: [sprite.axisX, sprite.axisY],
        dimensions: [sprite.width, sprite.height],
        format: sprite.format,
        colorDepth: sprite.colorDepth,
        decodedIndexHash: sprite.decodedIndexHash,
        paletteAssignment: palette ? {
          physicalIndex: palette.index,
          identity: `${palette.group},${palette.number}`,
          resolvedColorHash: resolvedPalette.rgbaHash
        } : null,
        storage: storageFact(sprite, sprites)
      };
    }),
    palettes: palettes.map((palette) => {
      const resolved = resolvedEntry(palettes, palette.index);
      return {
        physicalIndex: palette.index,
        identity: `${palette.group},${palette.number}`,
        colorCount: palette.colors,
        resolvedColorHash: resolved.rgbaHash,
        storage: storageFact(palette, palettes)
      };
    })
  };
}

function firstDifference(left, right, path = 'semantic') {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, sprMake2: left, builtIn: right };
    if (left.length !== right.length) return { path: `${path}.length`, sprMake2: left.length, builtIn: right.length };
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const difference = firstDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return { path, sprMake2: left, builtIn: right };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

class SffCandidateComparisonError extends Error {
  constructor(message, report = null) {
    super(message);
    this.name = 'SffCandidateComparisonError';
    this.report = report;
  }
}

function compareSffBackends(input = {}, dependencies = {}) {
  const specification = input.specification;
  const initialSpecificationHash = assertCanonicalSpecification(specification);
  const sprMake2Bytes = requireBytes(input.sprMake2CandidateBytes, 'SprMake2 candidate');
  const validate = dependencies.validate || assertSffV21Png8;
  const createBuiltIn = dependencies.createBuiltIn || createBuiltInCompareCandidate;

  // The built-in candidate is created and validated first. Pre-release
  // production may provide the already generated bytes, but this pure
  // comparison authority still exposes no adoption callback.
  let builtInBytes, builtInBackendId = String(input.builtInBackendId || '');
  if (input.builtInCandidateBytes !== undefined) builtInBytes = requireBytes(input.builtInCandidateBytes, 'IKEMaker built-in candidate');
  else {
    const builtInCandidate = createBuiltIn(specification, input.builtInOptions || {});
    if (!builtInCandidate || builtInCandidate.adoptionAllowed !== false || builtInCandidate.backend?.adoptionSupported !== false) {
      throw new Error('Built-in comparison backend violated its compare-only, no-adoption contract.');
    }
    builtInBytes = requireBytes(builtInCandidate.bytes, 'IKEMaker built-in candidate');
    builtInBackendId = builtInCandidate.backend.id;
  }
  const builtInValidation = validate(builtInBytes, specification, { ...(input.validationOptions || {}), compatibilityProfile: 'canonical' });
  const sprMake2Validation = validate(sprMake2Bytes, specification, { ...(input.validationOptions || {}), compatibilityProfile: 'sprmake2-v2.1' });

  if (initialSpecificationHash !== specificationHash(specification)) {
    throw new Error('SFF backend comparison rejected source/specification drift during candidate generation.');
  }

  const sprMake2Semantic = semanticModel(sprMake2Validation);
  const builtInSemantic = semanticModel(builtInValidation);
  const difference = firstDifference(sprMake2Semantic, builtInSemantic);
  const report = deepFreeze({
    schema: 'ikemaker.sff-backend-comparison',
    version: 1,
    status: difference ? 'rejected-semantic-mismatch' : 'equivalent',
    specificationHash: initialSpecificationHash,
    validationProfile: sprMake2Validation.profile,
    compatibilityProfiles: { sprMake2: sprMake2Validation.compatibilityProfile, builtIn: builtInValidation.compatibilityProfile },
    independentlyValidated: true,
    sourceSnapshotContract: 'reviewed-byte-and-decoded-hashes',
    byteEquivalent: sprMake2Bytes.equals(builtInBytes),
    semanticEquivalent: !difference,
    firstDifference: difference,
    adoption: {
      attempted: false,
      sprMake2CandidateAdopted: false,
      builtInCandidateAdopted: false,
      supportedByThisWorkflow: false
    },
    candidates: {
      sprMake2: { backendId: 'sprmake2', byteHash: sha256(sprMake2Bytes), byteLength: sprMake2Bytes.length, adoptionAllowed: false },
      builtIn: { backendId: builtInBackendId || 'ikemaker-builtin-sff-v21-png8', byteHash: sha256(builtInBytes), byteLength: builtInBytes.length, adoptionAllowed: false }
    },
    semantic: { sprMake2: sprMake2Semantic, builtIn: builtInSemantic }
  });
  if (difference) throw new SffCandidateComparisonError(`SFF candidates passed structural validation but differ at ${difference.path}. Neither candidate was adopted.`, report);
  return report;
}

module.exports = {
  SffCandidateComparisonError,
  compareSffBackends,
  semanticModel
};
