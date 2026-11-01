'use strict';

const { canonicalize, hashCanonical, createSffCapabilityReport } = require('./sff_capability_report');
const { resolveSffTargetBackend } = require('./sff_backend_registry');

const SFF_BUILD_SPECIFICATION_V2 = 2;
const SHA256 = /^[0-9a-f]{64}$/i;
const PIXEL_KINDS = new Set(['indexed8', 'rgb24', 'rgba32']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); Object.values(value).forEach(deepFreeze); return value;
}
function text(value, label) { const result = String(value || '').trim(); if (!result) throw new Error(`${label} is required.`); return result; }
function integer(value, label, minimum, maximum) { const number = Number(value); if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`); return number; }
function hash(value, label) { const result = text(value, label).toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function optionalHash(value, label) { return value == null || value === '' ? null : hash(value, label); }
function portable(value, label) { const result = text(value, label).replace(/\\/g, '/').replace(/^\.\//, ''); if (/^(?:[A-Za-z]:\/|\/)/.test(result) || result.split('/').includes('..')) throw new Error(`${label} must be a portable path.`); return result; }
function json(value, label) { return canonicalize(value == null ? {} : value, label); }

function source(value, label, requireDecoded = true) {
  const kind = text(value?.kind || 'complete-image', `${label}.kind`);
  if (!['complete-image', 'native-encoded-payload'].includes(kind)) throw new Error(`${label}.kind is unsupported.`);
  return { kind, relativePath: portable(value?.relativePath, `${label}.relativePath`), byteHash: hash(value?.byteHash, `${label}.byteHash`), decodedHash: requireDecoded ? hash(value?.decodedHash, `${label}.decodedHash`) : optionalHash(value?.decodedHash, `${label}.decodedHash`), provenance: json(value?.provenance, `${label}.provenance`) };
}
function relationship(value, label) { return value == null || value === '' ? null : text(value, label); }

function sprite(value, index) {
  const label = `logical.sprites[${index}]`, pixelKind = text(value?.pixels?.kind, `${label}.pixels.kind`);
  if (!PIXEL_KINDS.has(pixelKind)) throw new Error(`${label}.pixels.kind is unsupported.`);
  const normalized = {
    entryId: text(value?.entryId, `${label}.entryId`), physicalOrdinal: index,
    group: integer(value?.group, `${label}.group`, 0, 0xffff), number: integer(value?.number, `${label}.number`, 0, 0xffff),
    width: integer(value?.width, `${label}.width`, 1, 0xffff), height: integer(value?.height, `${label}.height`, 1, 0xffff),
    axisX: integer(value?.axisX ?? 0, `${label}.axisX`, -0x8000, 0x7fff), axisY: integer(value?.axisY ?? 0, `${label}.axisY`, -0x8000, 0x7fff),
    pixels: { kind: pixelKind, decodedHash: hash(value?.pixels?.decodedHash, `${label}.pixels.decodedHash`) },
    paletteEntryId: relationship(value?.paletteEntryId, `${label}.paletteEntryId`),
    contentLinkTargetEntryId: relationship(value?.contentLinkTargetEntryId, `${label}.contentLinkTargetEntryId`),
    source: source(value?.source, `${label}.source`, true), provenance: json(value?.provenance, `${label}.provenance`)
  };
  if (normalized.pixels.decodedHash !== normalized.source.decodedHash) throw new Error(`${label} pixel and source decoded hashes must match.`);
  return normalized;
}
function palette(value, index) {
  const label = `logical.palettes[${index}]`;
  if (!Array.isArray(value?.colors) || !value.colors.length || value.colors.length > 256) throw new Error(`${label}.colors must contain 1 through 256 RGBA entries.`);
  const colors = value.colors.map((color, c) => {
    if (!Array.isArray(color) || color.length !== 4) throw new Error(`${label}.colors[${c}] must be RGBA.`);
    return color.map((channel, n) => integer(channel, `${label}.colors[${c}][${n}]`, 0, 255));
  });
  return {
    entryId: text(value?.entryId, `${label}.entryId`), physicalOrdinal: index,
    group: integer(value?.group, `${label}.group`, 0, 0xffff), number: integer(value?.number, `${label}.number`, 0, 0xffff),
    tableOrder: text(value?.tableOrder || 'archive-index', `${label}.tableOrder`), colors,
    contentLinkTargetEntryId: relationship(value?.contentLinkTargetEntryId, `${label}.contentLinkTargetEntryId`),
    source: source(value?.source, `${label}.source`, false), provenance: json(value?.provenance, `${label}.provenance`)
  };
}
function validateReferences(sprites, palettes) {
  const all = [...sprites, ...palettes], ids = new Set();
  for (const entry of all) { if (ids.has(entry.entryId)) throw new Error(`Duplicate logical entryId ${entry.entryId}.`); ids.add(entry.entryId); }
  const paletteIds = new Set(palettes.map((entry) => entry.entryId));
  const spriteIds = new Set(sprites.map((entry) => entry.entryId));
  for (const entry of sprites) if (entry.paletteEntryId && !paletteIds.has(entry.paletteEntryId)) throw new Error(`Sprite ${entry.entryId} references missing palette ${entry.paletteEntryId}.`);
  for (const entry of sprites) if (entry.contentLinkTargetEntryId && !spriteIds.has(entry.contentLinkTargetEntryId)) throw new Error(`${entry.entryId} links to missing sprite content ${entry.contentLinkTargetEntryId}.`);
  for (const entry of palettes) if (entry.contentLinkTargetEntryId && !paletteIds.has(entry.contentLinkTargetEntryId)) throw new Error(`${entry.entryId} links to missing palette content ${entry.contentLinkTargetEntryId}.`);
  const byId = new Map(all.map((entry) => [entry.entryId, entry]));
  for (const entry of all) {
    const seen = new Set([entry.entryId]); let cursor = entry;
    while (cursor.contentLinkTargetEntryId) {
      if (seen.has(cursor.contentLinkTargetEntryId)) throw new Error(`Logical content link cycle detected at ${entry.entryId}.`);
      seen.add(cursor.contentLinkTargetEntryId); cursor = byId.get(cursor.contentLinkTargetEntryId);
    }
    if (!entry.contentLinkTargetEntryId) continue;
    const target = byId.get(entry.contentLinkTargetEntryId);
    if (spriteIds.has(entry.entryId) && (entry.width !== target.width || entry.height !== target.height || entry.pixels.kind !== target.pixels.kind || entry.pixels.decodedHash !== target.pixels.decodedHash)) throw new Error(`Sprite ${entry.entryId} logical content does not match link target ${target.entryId}.`);
    if (paletteIds.has(entry.entryId) && JSON.stringify(entry.colors) !== JSON.stringify(target.colors)) throw new Error(`Palette ${entry.entryId} logical colors do not match link target ${target.entryId}.`);
  }
}
function derivedFeatures(sprites, palettes) {
  const result = new Set();
  const featureByPixelKind = { indexed8: 'sprite.indexed8', rgb24: 'sprite.truecolor24', rgba32: 'sprite.alpha32' };
  for (const item of sprites) result.add(featureByPixelKind[item.pixels.kind]);
  if (sprites.some((item) => item.contentLinkTargetEntryId)) result.add('sprite.links');
  if (palettes.some((item) => item.contentLinkTargetEntryId)) result.add('palette.links');
  if ([...sprites, ...palettes].some((item) => item.source.kind === 'native-encoded-payload')) result.add('source.native-encoded-payload');
  if (palettes.length) result.add('palette.embedded');
  if (sprites.some((item) => item.paletteEntryId)) result.add('palette.per-sprite');
  return [...result].sort();
}
function derivedEncodingFeatures(encoding) {
  const result = new Set();
  const compression = encoding.compression || {}, crop = encoding.crop || {}, storage = encoding.storage || {};
  if (compression.default) result.add(`compression.${compression.default}`);
  for (const value of Object.values(compression.byEntryId || {})) if (value) result.add(`compression.${value}`);
  if (crop.default && crop.default !== 'none') result.add(`crop.${crop.default}`);
  for (const value of Object.values(crop.byEntryId || {})) if (value && value !== 'none') result.add(`crop.${value}`);
  if (/share|link/i.test(String(storage.spriteDefault || '')) || Object.values(storage.byEntryId || {}).some(value => /share|link/i.test(String(value)))) result.add('sprite.links');
  if (/share|link/i.test(String(storage.paletteDefault || ''))) result.add('palette.links');
  if (encoding.paletteMode) result.add(`palette.mode.${encoding.paletteMode}`);
  return [...result].sort();
}
function normalizeEncoding(value, backendId) {
  const encoding = json(value || {}, 'encodingIntent');
  const bags = encoding.backendOptions || {};
  if (!bags || typeof bags !== 'object' || Array.isArray(bags)) throw new Error('encodingIntent.backendOptions must be an object.');
  const active = Object.keys(bags).filter((key) => {
    if (bags[key] == null) return false;
    if (typeof bags[key] !== 'object' || Array.isArray(bags[key])) throw new Error(`encodingIntent.backendOptions.${key} must be an object.`);
    return Object.keys(bags[key]).length;
  });
  if (active.some((key) => key !== backendId)) throw new Error('Only the explicitly selected backend may have active backend options.');
  if (encoding.reviewedConversions !== undefined && !Array.isArray(encoding.reviewedConversions)) throw new Error('encodingIntent.reviewedConversions must be an array.');
  return { compression: encoding.compression || {}, crop: encoding.crop || {}, storage: encoding.storage || {}, paletteMode: encoding.paletteMode || null, backendOptions: bags, reviewedConversions: encoding.reviewedConversions || [] };
}
function hashSpecification(specification) { const copy = { ...specification }; delete copy.specificationHash; return hashCanonical(copy); }
function logicalHash(logical) { return hashCanonical(logical); }

function createSffBuildSpecificationV2(input = {}) {
  const { target, backend } = resolveSffTargetBackend(input.selection || {});
  if (input.logical?.sprites !== undefined && !Array.isArray(input.logical.sprites)) throw new Error('logical.sprites must be an array.');
  if (input.logical?.palettes !== undefined && !Array.isArray(input.logical.palettes)) throw new Error('logical.palettes must be an array.');
  if (input.capabilityRequest?.requiredFeatures !== undefined && !Array.isArray(input.capabilityRequest.requiredFeatures)) throw new Error('capabilityRequest.requiredFeatures must be an array.');
  const sprites = (input.logical?.sprites || []).map(sprite), palettes = (input.logical?.palettes || []).map(palette);
  validateReferences(sprites, palettes);
  const logical = { sourceRoot: portable(input.logical?.sourceRoot, 'logical.sourceRoot'), sprites, palettes, provenance: json(input.logical?.provenance, 'logical.provenance') };
  const archive = { identity: portable(input.archive?.identity ?? input.logical?.archiveIdentity, 'archive.identity'), fingerprint: optionalHash(input.archive?.fingerprint ?? input.logical?.archiveFingerprint, 'archive.fingerprint') };
  const encodingIntent = normalizeEncoding(input.encodingIntent, backend.id);
  const requiredFeatures = [...new Set([...derivedFeatures(sprites, palettes), ...derivedEncodingFeatures(encodingIntent), ...((input.capabilityRequest?.requiredFeatures || []).map((item) => text(item, 'capability feature')))])].sort();
  const conversions = encodingIntent.reviewedConversions.map((item) => json(item, 'reviewed conversion'));
  const capabilityAssessment = createSffCapabilityReport({ targetId: target.id, backendId: backend.id, requiredFeatures, conversions, evidence: input.capabilityRequest?.evidence || {} });
  const specification = {
    schema: 'ikemaker.sff-build-specification', version: SFF_BUILD_SPECIFICATION_V2,
    planId: text(input.planId, 'planId'),
    selection: { targetId: target.id, backendId: backend.id, adapter: { id: backend.adapter.id, version: backend.adapter.version } },
    archive, logical, logicalHash: logicalHash(logical), encodingIntent,
    capabilityAssessment: { ...capabilityAssessment, assessment: capabilityAssessment.exactBuildAllowed ? 'no-blockers-recorded' : 'blocked' },
    review: json(input.review || {}, 'review')
  };
  specification.specificationHash = hashSpecification(specification);
  return deepFreeze(specification);
}

function assertSffBuildSpecificationV2(specification) {
  if (!specification || specification.schema !== 'ikemaker.sff-build-specification' || specification.version !== 2) throw new Error('SFF build specification v2 is required.');
  assertDeepFrozen(specification);
  const { backend } = resolveSffTargetBackend(specification.selection || {});
  if (specification.selection?.adapter?.id !== backend.adapter.id || Number(specification.selection?.adapter?.version) !== Number(backend.adapter.version)) throw new Error('SFF v2 adapter identity/version drift detected.');
  validateReferences(specification.logical?.sprites || [], specification.logical?.palettes || []);
  if (logicalHash(specification.logical) !== specification.logicalHash) throw new Error('SFF v2 logical hash drift detected.');
  if (hashSpecification(specification) !== specification.specificationHash) throw new Error('SFF v2 specification hash drift detected.');
  return specification;
}

function assertDeepFrozen(value, label = 'specification', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Object.isFrozen(value)) throw new Error(`SFF v2 requires an immutable ${label}.`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${label}.${key}`, seen);
}

module.exports = { SFF_BUILD_SPECIFICATION_V2, createSffBuildSpecificationV2, assertSffBuildSpecificationV2, hashSpecification, logicalHash, derivedFeatures, derivedEncodingFeatures, deepFreeze, assertDeepFrozen };
