'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSffBuildSpecification, specificationHash } = require('../src/sff_build_specification');
const { V1_IDENTITY_ACK, createCreatorTargetProjection } = require('../src/sff_creator_target_projection');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const H = (text) => sha(Buffer.from(text));
function colors(partial = false, seed = 0) { return Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (index * 3 + seed) & 255, 255 - index, index === 0 ? 0 : partial && index === 7 ? 128 : 255]); }
function source(name, seed, width = 2, height = 2, preparation = null) { return { relativePath: `input/${name}`, byteHash: H(`bytes:${seed}`), decodedHash: H(`decoded:${seed}`), width, height, provenance: preparation ? { preparation } : { kind: 'fixture' } }; }
function palette(entryId, group, number, options = {}) { const paletteSource = options.source || source(options.sourceName || `${entryId.replace(/[^a-z0-9]/gi, '_')}.png`, `palette:${entryId}`, 256, 1); if (!options.source) paletteSource.provenance = { kind: 'indexed-png-image-palette', sourcePngByteHash: paletteSource.byteHash }; return { entryId, group, number, tableOrder: 'sff', colors: options.colors || colors(false, number), duplicatePolicy: options.linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(options.linkTargetEntryId ? { linkTargetEntryId: options.linkTargetEntryId } : {}), source: paletteSource }; }
function sprite(entryId, group, number, paletteId, options = {}) { return { entryId, group, number, axisX: options.axisX ?? 4, axisY: options.axisY ?? 7, colorDepth: options.colorDepth ?? 8, format: options.format || 'png8', compression: options.compression || options.format || 'png8', paletteId, duplicatePolicy: options.linkTargetEntryId ? 'share-identical' : (options.duplicatePolicy || 'preserve-separate'), ...(options.linkTargetEntryId ? { linkTargetEntryId: options.linkTargetEntryId } : {}), crop: options.crop || { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: options.source || source(`${entryId}.png`, entryId, options.width || 2, options.height || 2) }; }
function specification(overrides = {}) { return createSffBuildSpecification({ planId: overrides.planId || 'creator-projection', sourceRoot: 'input', target: { archiveIdentity: 'character.sff', sffVersion: '2.1' }, sprites: overrides.sprites || [sprite('sprite:a', 10, 0, 'palette:a'), sprite('sprite:b', 10, 1, 'palette:b')], palettes: overrides.palettes || [palette('palette:a', 1, 1), palette('palette:b', 1, 2)], requirements: [], decisions: [], options: { shared: {}, backends: {} } }); }
function sealed(spec) { const artifactBytes = Buffer.from(JSON.stringify(spec)); return { artifactBytes, expectedArtifactByteHash: sha(artifactBytes), expectedLegacySpecificationHash: spec.specificationHash }; }
function selection(targetId) { return targetId === 'sff-v1' ? { targetId, backendId: 'ikemaker-builtin-sff-v1' } : targetId === 'sff-v2.0' ? { targetId, backendId: 'ikemaker-builtin-sff-v2.0' } : { targetId, backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }; }
function input(spec, targetId, extra = {}) { return { ...sealed(spec), ...selection(targetId), ...(targetId === 'sff-v1' ? { v1PaletteMapping: spec.palettes.map((item, index) => ({ sourcePaletteEntryId: item.entryId, syntheticGroup: 0, syntheticNumber: index })), v1PaletteDecisions: spec.sprites.map((item) => ({ spriteEntryId: item.entryId, mode: 'own' })), acknowledgements: [V1_IDENTITY_ACK] } : {}), ...extra }; }
function codes(plan) { return new Set(plan.blockers.map((item) => item.code)); }

const base = specification(), before = JSON.stringify(base);
for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const plan = createCreatorTargetProjection(input(base, targetId));
  assert.strictEqual(plan.eligibleForReview, true, `${targetId}: ${plan.blockers.map((item) => item.detail).join('; ')}`);
  assert.strictEqual(plan.reviewRequired, true); assert.strictEqual(plan.adapterRequestCreated, false); assert.strictEqual(plan.candidateCreated, false); assert.strictEqual(plan.adoptionAllowed, false); assert.strictEqual(plan.byteEqualityRequired, false);
  assert.strictEqual(plan.capability.candidateAdapterImplemented, true); assert.strictEqual(plan.capability.certificationRequired, true); assert.strictEqual(plan.capability.processExecutionRequired, false); assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.proposedLogical));
  assert.strictEqual(createCreatorTargetProjection(input(base, targetId)).planHash, plan.planHash);
  assert.strictEqual(plan.proposedEncodingIntent.crop.default, 'none'); assert.strictEqual(plan.sourceSnapshotRows.length, base.sprites.length + base.palettes.length);
}
assert.strictEqual(JSON.stringify(base), before, 'projection must not mutate the sealed Creator specification');
const identityAssignments = specification({ sprites: [sprite('sprite:a', 10, 0, '1,1'), sprite('sprite:b', 10, 1, '1,2')], palettes: base.palettes });
for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) assert.strictEqual(createCreatorTargetProjection(input(identityAssignments, targetId)).eligibleForReview, true, `${targetId} must resolve normal Creator group,index palette references`);

const v1 = createCreatorTargetProjection(input(base, 'sff-v1'));
assert.deepStrictEqual(v1.proposedLogical.palettes.map((item) => [item.entryId, item.group, item.number]), [['palette:a', 0, 0], ['palette:b', 0, 1]]);
assert.strictEqual(v1.proposedEncodingIntent.paletteMode, 'individual-successive'); assert.strictEqual(v1.conversions[0].id, V1_IDENTITY_ACK);
assert(codes(createCreatorTargetProjection(input(base, 'sff-v1', { acknowledgements: [] }))).has('V1_IDENTITY_ACK_REQUIRED'));
assert(codes(createCreatorTargetProjection(input(base, 'sff-v1', { v1PaletteMapping: [{ sourcePaletteEntryId: 'palette:a', syntheticGroup: 0, syntheticNumber: 1 }] }))).has('V1_PALETTE_MAPPING_INCOMPLETE'));
assert(codes(createCreatorTargetProjection(input(base, 'sff-v1', { v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'previous' }, { spriteEntryId: 'sprite:b', mode: 'own' }] }))).has('V1_PREVIOUS_PALETTE_INVALID'));
const reuse = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a'), sprite('sprite:b', 10, 1, 'palette:a')], palettes: [palette('palette:a', 1, 1)] });
assert.strictEqual(createCreatorTargetProjection(input(reuse, 'sff-v1', { v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }, { spriteEntryId: 'sprite:b', mode: 'previous' }] })).eligibleForReview, true);
const unused = specification({ palettes: [...base.palettes, palette('palette:unused', 1, 9)] }); assert(codes(createCreatorTargetProjection(input(unused, 'sff-v1'))).has('V1_UNUSED_PALETTE'));

const partial = specification({ palettes: [palette('palette:a', 1, 1, { colors: colors(true, 1) }), palette('palette:b', 1, 2)] });
assert.strictEqual(createCreatorTargetProjection(input(partial, 'sff-v2.1')).eligibleForReview, true, 'indexed RGBA palettes remain representable in v2.1');
assert(codes(createCreatorTargetProjection(input(partial, 'sff-v2.0'))).has('BINARY_ALPHA_REQUIRED'));
assert(codes(createCreatorTargetProjection(input(partial, 'sff-v1'))).has('BINARY_ALPHA_REQUIRED'));
const truecolor = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a', { colorDepth: 24, format: 'png24' }), sprite('sprite:b', 10, 1, 'palette:b')], palettes: base.palettes });
for (const targetId of ['sff-v1', 'sff-v2.0']) assert(codes(createCreatorTargetProjection(input(truecolor, targetId))).has('SUPPORTED_PNG_REQUIRED'));
assert(!codes(createCreatorTargetProjection(input(truecolor, 'sff-v2.1'))).has('SUPPORTED_PNG_REQUIRED'), 'SFF 2.1 accepts sealed PNG24 input');
assert(codes(createCreatorTargetProjection(input(truecolor, 'sff-v2.1'))).has('TRUECOLOR_PALETTE_ASSIGNMENT'), 'true-color sprites reject stale indexed palette assignments');

const duplicateIdentity = specification({ palettes: [palette('palette:a', 1, 1), palette('palette:b', 1, 1)] });
assert(codes(createCreatorTargetProjection(input(duplicateIdentity, 'sff-v2.1'))).has('DUPLICATE_PALETTE_IDENTITY'));
const duplicateColors = specification({ palettes: [palette('palette:a', 1, 1, { colors: colors(false, 4) }), palette('palette:b', 1, 2, { colors: colors(false, 4) })] });
assert(createCreatorTargetProjection(input(duplicateColors, 'sff-v1')).warnings.some((item) => item.code === 'EXACT_DUPLICATE_PALETTE_VALUES'));
assert.strictEqual(createCreatorTargetProjection(input(duplicateColors, 'sff-v1', { v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }, { spriteEntryId: 'sprite:b', mode: 'previous' }] })).eligibleForReview, true, 'v1 previous-palette reuse is governed by exact RGB values, not logical palette identity');
const globalEntryCollision = specification({ sprites: [sprite('palette:a', 10, 0, 'palette:a')], palettes: [palette('palette:a', 1, 1)] });
assert(codes(createCreatorTargetProjection(input(globalEntryCollision, 'sff-v2.1'))).has('GLOBAL_ENTRY_ID_COLLISION'));

const directLink = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a'), sprite('sprite:b', 10, 1, 'palette:a', { linkTargetEntryId: 'sprite:a', source: source('sprite:a.png', 'sprite:a') })], palettes: [palette('palette:a', 1, 1)] });
for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) assert.strictEqual(createCreatorTargetProjection(input(directLink, targetId, targetId === 'sff-v1' ? { v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }, { spriteEntryId: 'sprite:b', mode: 'previous' }] } : {})).eligibleForReview, true);
const multihop = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a'), sprite('sprite:b', 10, 1, 'palette:a', { linkTargetEntryId: 'sprite:a', source: source('sprite:a.png', 'sprite:a') }), sprite('sprite:c', 10, 2, 'palette:a', { linkTargetEntryId: 'sprite:b', source: source('sprite:a.png', 'sprite:a') })], palettes: [palette('palette:a', 1, 1)] });
assert(codes(createCreatorTargetProjection(input(multihop, 'sff-v2.0'))).has('MULTIHOP_LINK_UNSUPPORTED')); assert(!codes(createCreatorTargetProjection(input(multihop, 'sff-v2.1'))).has('MULTIHOP_LINK_UNSUPPORTED'));
const linkedPaletteSource = source('palette_a.png', 'palette:palette:a', 256, 1);
const paletteLink = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a'), sprite('sprite:b', 10, 1, 'palette:b')], palettes: [palette('palette:a', 1, 1, { colors: colors(false, 5), source: linkedPaletteSource }), palette('palette:b', 1, 2, { colors: colors(false, 5), linkTargetEntryId: 'palette:a', source: linkedPaletteSource })] });
assert(codes(createCreatorTargetProjection(input(paletteLink, 'sff-v1'))).has('V1_PALETTE_LINK_UNSUPPORTED')); assert.strictEqual(createCreatorTargetProjection(input(paletteLink, 'sff-v2.0')).eligibleForReview, true);

const cropHash = H('crop-output'), beforePrep = { kind: 'before-axis-crop', sourceByteHash: H('crop-input'), bounds: '1,2,2,2', outputByteHash: cropHash, axisDeltaX: 0, axisDeltaY: 0, originalAxis: '4,7' };
const beforeCrop = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a', { source: { ...source('crop.png', 'crop-output'), byteHash: cropHash, provenance: { preparation: beforePrep } }, crop: { mode: 'before-axis', axisDeltaX: 0, axisDeltaY: 0 } })], palettes: [palette('palette:a', 1, 1)] });
assert.strictEqual(createCreatorTargetProjection(input(beforeCrop, 'sff-v2.1')).eligibleForReview, true);
const afterPrep = { ...beforePrep, kind: 'after-axis-crop', axisDeltaX: -1, axisDeltaY: -2 };
const afterCrop = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a', { source: { ...source('crop.png', 'crop-output'), byteHash: cropHash, provenance: { preparation: afterPrep } }, crop: { mode: 'after-axis', axisDeltaX: -1, axisDeltaY: -2 } })], palettes: [palette('palette:a', 1, 1)] });
const afterPlan = createCreatorTargetProjection(input(afterCrop, 'sff-v2.1')); assert.strictEqual(afterPlan.eligibleForReview, true); assert.deepStrictEqual([afterPlan.proposedLogical.sprites[0].axisX, afterPlan.proposedLogical.sprites[0].axisY], [3, 5]);
const autocrop = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a', { crop: { mode: 'autocrop', axisDeltaX: 0, axisDeltaY: 0 } })], palettes: [palette('palette:a', 1, 1)] }); assert(codes(createCreatorTargetProjection(input(autocrop, 'sff-v2.1'))).has('AUTOCROP_UNPREPARED'));

const ambiguousPath = specification({ sprites: [sprite('sprite:a', 10, 0, 'palette:a', { source: source('same.png', 'one') }), sprite('sprite:b', 10, 1, 'palette:b', { source: source('same.png', 'two') })], palettes: base.palettes });
assert(codes(createCreatorTargetProjection(input(ambiguousPath, 'sff-v2.1'))).has('SOURCE_PATH_AMBIGUOUS'));
assert.throws(() => createCreatorTargetProjection({ ...input(base, 'sff-v2.1'), expectedArtifactByteHash: 'f'.repeat(64) }), /artifact byte hash/);
assert.throws(() => createCreatorTargetProjection({ ...input(base, 'sff-v2.1'), expectedLegacySpecificationHash: 'f'.repeat(64) }), /embedded specification hash/);
assert.throws(() => createCreatorTargetProjection({ ...input(base, 'sff-v2.1'), backendId: 'sprmake2-sff-v2.1' }), /exact implemented built-in/);
const malformed = JSON.parse(JSON.stringify(base)); malformed.palettes[0].colors[1] = [999, 0, 0, 255]; malformed.specificationHash = specificationHash(malformed); const malformedBytes = Buffer.from(JSON.stringify(malformed));
assert.throws(() => createCreatorTargetProjection({ ...input(base, 'sff-v2.1'), artifactBytes: malformedBytes, expectedArtifactByteHash: sha(malformedBytes), expectedLegacySpecificationHash: malformed.specificationHash }), /self-hashed but invalid/);
const duplicateKey = Buffer.from(JSON.stringify(base).replace('"planId":"creator-projection"', '"planId":"creator-projection","planId":"forged"'));
assert.throws(() => createCreatorTargetProjection({ ...input(base, 'sff-v2.1'), artifactBytes: duplicateKey, expectedArtifactByteHash: sha(duplicateKey) }), /Duplicate JSON object key/);
const moduleText = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_target_projection.js'), 'utf8'); assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(moduleText)); assert(!/\b(?:writeFile|spawn|execFile|randomUUID|Date\.now)\b/.test(moduleText));
console.log('SFF Creator target projection produces sealed, deterministic, review-only v1/v2.0/v2.1 plans with exact format, crop, palette, link, source and acknowledgement gates');
