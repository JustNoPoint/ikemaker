'use strict';

const { readSealedLegacyV21Specification } = require('./sff_build_specification_v1_migration');
const { resolveSffTargetBackend } = require('./sff_backend_registry');
const { hashCanonical } = require('./sff_capability_report');

const SHA256 = /^[0-9a-f]{64}$/i;
const V1_IDENTITY_ACK = 'palette-identities-not-physically-addressable-in-sff-v1';
const SELECTIONS = Object.freeze({
  'sff-v1\0ikemaker-builtin-sff-v1': Object.freeze({ adapterId: 'builtin-v1-pcx8', adapterVersion: 1, compression: 'pcx-rle8', paletteMode: 'individual-successive' }),
  'sff-v2.0\0ikemaker-builtin-sff-v2.0': Object.freeze({ adapterId: 'builtin-v20-raw8', adapterVersion: 1, compression: 'raw8', paletteMode: 'embedded' }),
  'sff-v2.1\0ikemaker-builtin-sff-v21-png8-prerelease': Object.freeze({ adapterId: 'builtin-v21-png8', adapterVersion: 1, compression: 'png8', paletteMode: 'embedded' })
});

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function portable(value) { const text = String(value || '').replace(/\\/g, '/').replace(/^\.\//, ''); return Boolean(text) && !/^(?:[A-Za-z]:\/|\/)/.test(text) && !text.split('/').includes('..'); }
function hash(value) { return SHA256.test(String(value || '')); }
function issue(list, code, detail, entryId = null) { list.push({ code, detail, entryId }); }
function sameColors(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function parsePair(value) { const match = /^(-?\d+),(-?\d+)$/.exec(String(value || '').replace(/\s+/g, '')); return match ? [Number(match[1]), Number(match[2])] : null; }
function parseBounds(value) { const match = /^(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(String(value || '').replace(/\s+/g, '')); return match ? { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) } : null; }

function validatePreparedCrop(sprite, blockers) {
  const mode = sprite.crop?.mode || 'none', deltaX = Number(sprite.crop?.axisDeltaX || 0), deltaY = Number(sprite.crop?.axisDeltaY || 0);
  if (mode === 'none') {
    if (deltaX !== 0 || deltaY !== 0) issue(blockers, 'CROP_DELTA_WITHOUT_CROP', `Sprite ${sprite.entryId} has an axis delta without a prepared crop.`, sprite.entryId);
    return { finalAxisX: sprite.axisX, finalAxisY: sprite.axisY };
  }
  if (mode === 'autocrop') { issue(blockers, 'AUTOCROP_UNPREPARED', `Sprite ${sprite.entryId} still delegates autocrop to a backend.`, sprite.entryId); return { finalAxisX: sprite.axisX, finalAxisY: sprite.axisY }; }
  if (!['before-axis', 'after-axis'].includes(mode)) { issue(blockers, 'CROP_MODE_UNSUPPORTED', `Sprite ${sprite.entryId} uses unsupported crop mode ${mode}.`, sprite.entryId); return { finalAxisX: sprite.axisX, finalAxisY: sprite.axisY }; }
  const preparation = sprite.source?.provenance?.preparation, expectedKind = `${mode}-crop`, bounds = parseBounds(preparation?.bounds), originalAxis = parsePair(preparation?.originalAxis);
  if (!preparation || preparation.kind !== expectedKind || !bounds || bounds.width !== sprite.source.width || bounds.height !== sprite.source.height || String(preparation.outputByteHash || '').toLowerCase() !== String(sprite.source.byteHash || '').toLowerCase() || !hash(preparation.sourceByteHash) || !originalAxis) {
    issue(blockers, 'CROP_PREPARATION_UNSEALED', `Sprite ${sprite.entryId} lacks exact ${expectedKind} source, bounds, output-hash, dimensions, or original-axis evidence.`, sprite.entryId);
  }
  if (mode === 'before-axis' && (deltaX !== 0 || deltaY !== 0 || Number(preparation?.axisDeltaX || 0) !== 0 || Number(preparation?.axisDeltaY || 0) !== 0)) issue(blockers, 'BEFORE_AXIS_DELTA_INVALID', `Sprite ${sprite.entryId} crop-before-axis must have a zero axis delta.`, sprite.entryId);
  if (mode === 'after-axis') {
    if (deltaX !== -Number(bounds?.x || 0) || deltaY !== -Number(bounds?.y || 0) || Number(preparation?.axisDeltaX) !== deltaX || Number(preparation?.axisDeltaY) !== deltaY) issue(blockers, 'AFTER_AXIS_DELTA_INVALID', `Sprite ${sprite.entryId} axis delta does not preserve the reviewed crop origin.`, sprite.entryId);
    if (originalAxis && (originalAxis[0] !== sprite.axisX || originalAxis[1] !== sprite.axisY)) issue(blockers, 'AFTER_AXIS_ORIGINAL_INVALID', `Sprite ${sprite.entryId} original-axis evidence differs from its reviewed axis.`, sprite.entryId);
  }
  const finalAxisX = sprite.axisX + deltaX, finalAxisY = sprite.axisY + deltaY;
  if (!Number.isSafeInteger(finalAxisX) || !Number.isSafeInteger(finalAxisY) || finalAxisX < -0x8000 || finalAxisX > 0x7fff || finalAxisY < -0x8000 || finalAxisY > 0x7fff) issue(blockers, 'FINAL_AXIS_OUT_OF_RANGE', `Sprite ${sprite.entryId} prepared axis is outside the signed 16-bit target range.`, sprite.entryId);
  return { finalAxisX, finalAxisY };
}

function validateLink(entry, entries, targetId, kind, blockers, resolvedPaletteBySprite = null, palettesByEntry = null) {
  const index = entries.indexOf(entry), linked = Boolean(entry.linkTargetEntryId), shared = entry.duplicatePolicy === 'share-identical';
  if (linked !== shared) issue(blockers, 'STORAGE_LINK_MISMATCH', `${kind} ${entry.entryId} duplicate policy and explicit link disagree.`, entry.entryId);
  if (!linked) return;
  const targetIndex = entries.findIndex((candidate) => candidate.entryId === entry.linkTargetEntryId), target = entries[targetIndex];
  if (!target || targetIndex >= index) { issue(blockers, 'LINK_NOT_BACKWARD', `${kind} ${entry.entryId} does not link directly backward.`, entry.entryId); return; }
  if (targetIndex > 0xffff) issue(blockers, 'LINK_TARGET_OUT_OF_RANGE', `${kind} ${entry.entryId} link target exceeds the target format's 16-bit physical link field.`, entry.entryId);
  if (targetId !== 'sff-v2.1' && target.linkTargetEntryId) issue(blockers, 'MULTIHOP_LINK_UNSUPPORTED', `${kind} ${entry.entryId} requests an unproven multihop link for ${targetId}.`, entry.entryId);
  if (kind === 'Sprite') {
    if (entry.source.width !== target.source.width || entry.source.height !== target.source.height || entry.source.decodedHash !== target.source.decodedHash) issue(blockers, 'SPRITE_LINK_CONTENT_MISMATCH', `Sprite ${entry.entryId} differs from link target ${target.entryId}.`, entry.entryId);
    if (targetId === 'sff-v1' && !sameColors(
      palettesByEntry?.get(resolvedPaletteBySprite?.get(entry.entryId))?.colors,
      palettesByEntry?.get(resolvedPaletteBySprite?.get(target.entryId))?.colors
    )) issue(blockers, 'V1_SPRITE_LINK_PALETTE_MISMATCH', `Sprite ${entry.entryId} uses different palette values from its SFF v1 link target ${target.entryId}.`, entry.entryId);
  } else if (!sameColors(entry.colors, target.colors)) issue(blockers, 'PALETTE_LINK_CONTENT_MISMATCH', `Palette ${entry.entryId} differs from link target ${target.entryId}.`, entry.entryId);
}

function sourceSeal(projectedSprites, projectedPalettes, blockers) {
  const paths = new Map(), rows = [];
  for (const entry of [...projectedSprites, ...projectedPalettes]) {
    const source = entry.source || {};
    if (!portable(source.relativePath) || !hash(source.byteHash) || (entry.pixels && !hash(source.decodedHash))) issue(blockers, 'SOURCE_SEAL_INVALID', `Entry ${entry.entryId} has an invalid portable source or source hash.`, entry.entryId);
    const prior = paths.get(source.relativePath), byteHash = String(source.byteHash || '').toLowerCase();
    if (prior && prior !== byteHash) issue(blockers, 'SOURCE_PATH_AMBIGUOUS', `Source path ${source.relativePath} names different sealed bytes.`, entry.entryId);
    paths.set(source.relativePath, byteHash);
    rows.push({ entryId: entry.entryId, relativePath: source.relativePath, byteHash, decodedHash: source.decodedHash || null, kind: 'complete-image' });
  }
  return rows;
}

function v1Contract(input, legacy, palettesByEntry, resolvedPaletteBySprite, blockers, warnings, conversions, acknowledgements) {
  const paletteForSprite = (sprite) => palettesByEntry.get(resolvedPaletteBySprite.get(sprite.entryId));
  const firstUse = [];
  for (const sprite of legacy.sprites) { const paletteId = resolvedPaletteBySprite.get(sprite.entryId); if (paletteId && !firstUse.includes(paletteId)) firstUse.push(paletteId); }
  const unused = legacy.palettes.filter((palette) => !firstUse.includes(palette.entryId));
  for (const palette of unused) issue(blockers, 'V1_UNUSED_PALETTE', `Palette ${palette.entryId} is unused and cannot be silently omitted.`, palette.entryId);
  const mapping = Array.isArray(input.v1PaletteMapping) ? input.v1PaletteMapping : [];
  if (mapping.length !== firstUse.length) issue(blockers, 'V1_PALETTE_MAPPING_INCOMPLETE', 'SFF v1 requires one ordered synthetic mapping for every used palette.');
  firstUse.forEach((entryId, index) => {
    const row = mapping[index];
    if (!row || row.sourcePaletteEntryId !== entryId || !Number.isSafeInteger(row.syntheticGroup) || row.syntheticGroup !== 0 || !Number.isSafeInteger(row.syntheticNumber) || row.syntheticNumber !== index) issue(blockers, 'V1_PALETTE_MAPPING_ORDER', `SFF v1 palette ${entryId} must map to synthetic identity 0,${index} in first-use order.`, entryId);
  });
  if (new Set(mapping.map((row) => row?.sourcePaletteEntryId)).size !== mapping.length || mapping.some((row) => !firstUse.includes(row?.sourcePaletteEntryId))) issue(blockers, 'V1_PALETTE_MAPPING_EXTRANEOUS', 'SFF v1 palette mapping contains a duplicate or unknown palette.');
  const accepted = new Set(Array.isArray(input.acknowledgements) ? input.acknowledgements : []);
  acknowledgements.push({ id: V1_IDENTITY_ACK, accepted: accepted.has(V1_IDENTITY_ACK), detail: 'SFF v1 stores effective palettes per sprite; logical 0,n identities are review labels and are not physically addressable palette records.' });
  conversions.push({ id: V1_IDENTITY_ACK, kind: 'target-representation', losslessPixels: true, byteEqualityRequired: false });
  if (!accepted.has(V1_IDENTITY_ACK)) issue(blockers, 'V1_IDENTITY_ACK_REQUIRED', `Acknowledge ${V1_IDENTITY_ACK} before this plan can enter review.`);
  const decisions = Array.isArray(input.v1PaletteDecisions) ? input.v1PaletteDecisions : [], bySprite = new Map();
  for (const row of decisions) {
    if (!row || bySprite.has(row.spriteEntryId) || !['own', 'previous'].includes(row.mode)) { issue(blockers, 'V1_PALETTE_DECISION_INVALID', 'SFF v1 palette decisions must uniquely choose own or previous for every sprite.'); continue; }
    bySprite.set(row.spriteEntryId, row.mode);
  }
  for (let index = 0; index < legacy.sprites.length; index += 1) {
    const sprite = legacy.sprites[index], mode = bySprite.get(sprite.entryId);
    if (!mode) issue(blockers, 'V1_PALETTE_DECISION_MISSING', `Sprite ${sprite.entryId} lacks an own/previous palette decision.`, sprite.entryId);
    if (mode === 'previous' && (index === 0 || !sameColors(paletteForSprite(legacy.sprites[index - 1])?.colors, paletteForSprite(sprite)?.colors))) issue(blockers, 'V1_PREVIOUS_PALETTE_INVALID', `Sprite ${sprite.entryId} may reuse only the immediately preceding exact palette values.`, sprite.entryId);
    if (sprite.linkTargetEntryId && mode !== 'previous') issue(blockers, 'V1_LINK_REQUIRES_PREVIOUS', `Linked SFF v1 sprite ${sprite.entryId} requires explicit previous-palette intent.`, sprite.entryId);
  }
  if (bySprite.size !== legacy.sprites.length || [...bySprite.keys()].some((id) => !legacy.sprites.some((sprite) => sprite.entryId === id))) issue(blockers, 'V1_PALETTE_DECISION_SET', 'SFF v1 palette decisions must contain exactly every sprite entryId.');
  const colorGroups = new Map();
  for (const palette of legacy.palettes) { const key = JSON.stringify(palette.colors); if (!colorGroups.has(key)) colorGroups.set(key, []); colorGroups.get(key).push(palette.entryId); }
  for (const ids of colorGroups.values()) if (ids.length > 1) warnings.push({ code: 'EXACT_DUPLICATE_PALETTE_VALUES', detail: `Palettes ${ids.join(', ')} have identical RGBA values and remain separate.`, entryIds: ids });
  for (const palette of legacy.palettes) {
    if (palette.linkTargetEntryId) issue(blockers, 'V1_PALETTE_LINK_UNSUPPORTED', `Palette ${palette.entryId} uses a link/global sharing mode unsupported by the built-in SFF v1 profile.`, palette.entryId);
    if (palette.source.provenance?.kind !== 'indexed-png-image-palette' || !/\.png$/i.test(palette.source.relativePath) || !hash(palette.source.decodedHash) || String(palette.source.provenance?.sourcePngByteHash || '').toLowerCase() !== String(palette.source.byteHash || '').toLowerCase()) issue(blockers, 'V1_PALETTE_PNG_EVIDENCE_REQUIRED', `Palette ${palette.entryId} needs sealed indexed-PNG palette evidence for the current v1 adapter.`, palette.entryId);
  }
  return { firstUse, mapping, decisions: Object.fromEntries(legacy.sprites.map((sprite) => [sprite.entryId, bySprite.get(sprite.entryId) || null])), palettesByEntry };
}

function createCreatorTargetProjection(input = {}) {
  const sealed = readSealedLegacyV21Specification(input), legacy = sealed.specification, targetId = String(input.targetId || ''), backendId = String(input.backendId || ''), selection = SELECTIONS[`${targetId}\0${backendId}`];
  if (!selection) throw new Error('Creator target projection requires one exact implemented built-in target/backend selection; no fallback is available.');
  const resolved = resolveSffTargetBackend({ targetId, backendId });
  if (resolved.backend.kind !== 'built-in' || resolved.backend.implemented !== true || resolved.backend.adapter.id !== selection.adapterId || Number(resolved.backend.adapter.version) !== selection.adapterVersion) throw new Error('Creator target projection selection drifted from the current built-in backend registry.');
  const blockers = [], warnings = [], conversions = [], mandatoryAcknowledgements = [], spriteIds = new Set(), paletteIds = new Set(), palettesByIdentity = new Map(), palettesByEntry = new Map();
  for (const palette of legacy.palettes) {
    if (paletteIds.has(palette.entryId)) issue(blockers, 'DUPLICATE_PALETTE_ENTRY', `Palette entryId ${palette.entryId} repeats.`, palette.entryId); paletteIds.add(palette.entryId); palettesByEntry.set(palette.entryId, palette);
    const identity = `${palette.group},${palette.number}`; if (palettesByIdentity.has(identity)) issue(blockers, 'DUPLICATE_PALETTE_IDENTITY', `Palette identity ${identity} is ambiguous.`, palette.entryId); palettesByIdentity.set(identity, palette);
    if (!Array.isArray(palette.colors) || palette.colors.length !== 256) issue(blockers, 'PALETTE_SIZE_INVALID', `Palette ${palette.entryId} must contain exactly 256 colors.`, palette.entryId);
    else if (palette.colors.some((color) => !Array.isArray(color) || color.length !== 4 || color.some((channel) => !Number.isSafeInteger(channel) || channel < 0 || channel > 255))) issue(blockers, 'PALETTE_RGBA_INVALID', `Palette ${palette.entryId} contains a non-RGBA8 color.`, palette.entryId);
    if (['sff-v1', 'sff-v2.0'].includes(targetId) && palette.colors.some((color, index) => !Array.isArray(color) || color.length !== 4 || Number(color[3]) !== (index === 0 ? 0 : 255))) issue(blockers, 'BINARY_ALPHA_REQUIRED', `Palette ${palette.entryId} is not index-0 transparent with every other index opaque.`, palette.entryId);
  }
  const preparedAxes = new Map(), resolvedPaletteBySprite = new Map();
  for (const sprite of legacy.sprites) {
    if (spriteIds.has(sprite.entryId)) issue(blockers, 'DUPLICATE_SPRITE_ENTRY', `Sprite entryId ${sprite.entryId} repeats.`, sprite.entryId); spriteIds.add(sprite.entryId);
    const format = String(sprite.format).toLowerCase(), compression = String(sprite.compression).toLowerCase(), trueColorAllowed = targetId === 'sff-v2.1' && ((sprite.colorDepth === 24 && format === 'png24' && compression === 'png24') || (sprite.colorDepth === 32 && format === 'png32' && compression === 'png32'));
    if (!(sprite.colorDepth === 8 && format === 'png8' && compression === 'png8') && !trueColorAllowed) issue(blockers, 'SUPPORTED_PNG_REQUIRED', `Sprite ${sprite.entryId} is not sealed PNG8 input${targetId === 'sff-v2.1' ? ' or SFF 2.1 PNG24/PNG32 true-color input' : ''}.`, sprite.entryId);
    const rawPaletteId = String(sprite.paletteId || '').trim(), byEntry = palettesByEntry.get(rawPaletteId), pair = parsePair(rawPaletteId), byIdentity = pair ? palettesByIdentity.get(`${pair[0]},${pair[1]}`) : null;
    if (byEntry && byIdentity && byEntry.entryId !== byIdentity.entryId) issue(blockers, 'PALETTE_ASSIGNMENT_AMBIGUOUS', `Sprite ${sprite.entryId} palette reference ${rawPaletteId} matches different entry and identity records.`, sprite.entryId);
    const assigned = byEntry || byIdentity;
    if (sprite.colorDepth === 8) {
      if (!assigned) issue(blockers, 'PALETTE_ASSIGNMENT_REQUIRED', `Sprite ${sprite.entryId} lacks one unambiguous palette assignment.`, sprite.entryId);
      else resolvedPaletteBySprite.set(sprite.entryId, assigned.entryId);
    } else if (rawPaletteId) issue(blockers, 'TRUECOLOR_PALETTE_ASSIGNMENT', `True-color sprite ${sprite.entryId} must not retain an indexed palette assignment.`, sprite.entryId);
    preparedAxes.set(sprite.entryId, validatePreparedCrop(sprite, blockers));
  }
  for (const entryId of spriteIds) if (paletteIds.has(entryId)) issue(blockers, 'GLOBAL_ENTRY_ID_COLLISION', `Entry ID ${entryId} is shared by a sprite and palette and cannot enter the schema-v2 source vault.`, entryId);
  for (const sprite of legacy.sprites) validateLink(sprite, legacy.sprites, targetId, 'Sprite', blockers, resolvedPaletteBySprite, palettesByEntry);
  for (const palette of legacy.palettes) validateLink(palette, legacy.palettes, targetId, 'Palette', blockers);
  let v1 = null;
  if (targetId === 'sff-v1') v1 = v1Contract(input, legacy, palettesByEntry, resolvedPaletteBySprite, blockers, warnings, conversions, mandatoryAcknowledgements);
  const paletteOrder = targetId === 'sff-v1' ? v1.firstUse.map((id) => palettesByEntry.get(id)).filter(Boolean) : legacy.palettes;
  const proposedPalettes = paletteOrder.map((palette, index) => ({ entryId: palette.entryId, group: targetId === 'sff-v1' ? 0 : palette.group, number: targetId === 'sff-v1' ? index : palette.number, tableOrder: 'archive-index', colors: palette.colors, contentLinkTargetEntryId: targetId === 'sff-v1' ? null : palette.linkTargetEntryId || null, source: { kind: 'complete-image', relativePath: palette.source.relativePath, byteHash: palette.source.byteHash, decodedHash: palette.source.decodedHash || null, provenance: { ...palette.source.provenance, creatorLegacyIdentity: [palette.group, palette.number] } }, provenance: { creatorLegacyEntryId: palette.entryId, creatorLegacyIdentity: [palette.group, palette.number], targetIdentitySynthetic: targetId === 'sff-v1' } }));
  const proposedSprites = legacy.sprites.map((sprite, physicalOrdinal) => ({ entryId: sprite.entryId, physicalOrdinal, group: sprite.group, number: sprite.number, width: sprite.source.width, height: sprite.source.height, axisX: preparedAxes.get(sprite.entryId).finalAxisX, axisY: preparedAxes.get(sprite.entryId).finalAxisY, pixels: { kind: sprite.colorDepth === 24 ? 'rgb24' : sprite.colorDepth === 32 ? 'rgba32' : 'indexed8', decodedHash: sprite.source.decodedHash }, paletteEntryId: resolvedPaletteBySprite.get(sprite.entryId) || null, contentLinkTargetEntryId: sprite.linkTargetEntryId || null, source: { kind: 'complete-image', relativePath: sprite.source.relativePath, byteHash: sprite.source.byteHash, decodedHash: sprite.source.decodedHash, provenance: { ...sprite.source.provenance, creatorCropMaterialized: sprite.crop.mode !== 'none' } }, provenance: { creatorLegacyEntryId: sprite.entryId, creatorLegacyPaletteReference: sprite.paletteId, creatorLegacyCrop: sprite.crop } }));
  const storage = Object.fromEntries([...legacy.sprites, ...legacy.palettes].map((entry) => [entry.entryId, entry.linkTargetEntryId ? 'share-identical' : 'preserve-separate']));
  const backendOptions = targetId === 'sff-v1' ? { [backendId]: { paletteBySpriteEntryId: v1.decisions } } : { [backendId]: {} };
  const compressionByEntryId = Object.fromEntries(proposedSprites.filter(sprite => sprite.pixels.kind !== 'indexed8').map(sprite => [sprite.entryId, sprite.pixels.kind === 'rgb24' ? 'png24' : 'png32']));
  const proposedEncodingIntent = { compression: { default: selection.compression, byEntryId: compressionByEntryId }, crop: { default: 'none', byEntryId: {} }, storage: { byEntryId: storage }, paletteMode: proposedSprites.length && proposedSprites.every(sprite => sprite.pixels.kind !== 'indexed8') ? 'true-color' : selection.paletteMode, backendOptions, reviewedConversions: [] };
  const sourceSnapshotRows = sourceSeal(proposedSprites, proposedPalettes, blockers), eligibleForReview = blockers.length === 0;
  const plan = {
    schema: 'ikemaker.sff-creator-target-projection', version: 1, reviewRequired: true, eligibleForReview,
    adapterRequestCreated: false, candidateCreated: false, adoptionAllowed: false, byteEqualityRequired: false,
    sourceArtifactByteHash: sealed.sourceArtifactByteHash, legacySpecificationHash: sealed.legacySpecificationHash,
    sourcePlanId: legacy.planId, archive: { identity: legacy.target.archiveIdentity, fingerprint: legacy.target.archiveFingerprint || null },
    selection: { targetId, backendId, adapter: { id: selection.adapterId, version: selection.adapterVersion } },
    capability: { candidateAdapterImplemented: true, certificationRequired: true, adapterRequestRequired: true, processExecutionRequired: false, adoptionSupported: false },
    proposedLogical: { sourceRoot: legacy.sourceRoot, sprites: proposedSprites, palettes: proposedPalettes, provenance: { projectedFromCreatorLegacyV1: true, sourceArtifactByteHash: sealed.sourceArtifactByteHash, legacySpecificationHash: sealed.legacySpecificationHash } },
    proposedEncodingIntent, sourceSnapshotRows, blockers, warnings, conversions, mandatoryAcknowledgements
  };
  plan.planHash = hashCanonical(plan);
  return deepFreeze(plan);
}

module.exports = { V1_IDENTITY_ACK, createCreatorTargetProjection };
