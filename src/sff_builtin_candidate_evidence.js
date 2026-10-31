'use strict';

const crypto = require('crypto');
const { types } = require('util');
const { assertAdapterRequest } = require('./sff_backend_adapter_contract');
const { hashCanonical } = require('./sff_capability_report');
const { createSffBuildSpecification } = require('./sff_build_specification');
const { assertSffBuildSpecificationV2, deepFreeze } = require('./sff_build_specification_v2');
const { assertSffV1Pcx8, SFF_V1_PCX8_VALIDATOR_ID, SFF_V1_PCX8_VALIDATOR_VERSION } = require('./sff_v1_pcx8_strict_validator');
const { assertSffV20Raw8, resolveStored, SFF_V20_RAW8_VALIDATOR_ID, SFF_V20_RAW8_VALIDATOR_VERSION } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed, SFF_V21_MIXED_VALIDATOR_ID, SFF_V21_MIXED_VALIDATOR_VERSION } = require('./sff_v21_mixed_strict_validator');

const MAX_ARCHIVE_BYTES = 0xffffffff;
const BUILT_IN_CANDIDATE_TARGETS = deepFreeze({
  'sff-v1': { backendId: 'ikemaker-builtin-sff-v1', adapterId: 'builtin-v1-pcx8', adapterVersion: 1, validatorId: SFF_V1_PCX8_VALIDATOR_ID, validatorVersion: SFF_V1_PCX8_VALIDATOR_VERSION, byteCeiling: MAX_ARCHIVE_BYTES },
  'sff-v2.0': { backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8', adapterVersion: 1, validatorId: SFF_V20_RAW8_VALIDATOR_ID, validatorVersion: SFF_V20_RAW8_VALIDATOR_VERSION, byteCeiling: MAX_ARCHIVE_BYTES },
  'sff-v2.1': { backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8', adapterVersion: 1, validatorId: SFF_V21_MIXED_VALIDATOR_ID, validatorVersion: SFF_V21_MIXED_VALIDATOR_VERSION, byteCeiling: MAX_ARCHIVE_BYTES }
});

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in candidate evidence: ${message}`); }
function inertJsonSnapshot(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(`${label} must contain only finite numbers.`); return value; }
  if (types.isProxy(value)) fail(`${label} must contain only non-proxy JSON data.`);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) fail(`${label} must contain only non-proxy JSON data.`);
  if (ancestors.has(value)) fail(`${label} must not be circular.`);
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) fail(`${label} must contain only plain JSON objects and arrays.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), symbols = Object.getOwnPropertySymbols(value), keys = Reflect.ownKeys(descriptors).filter(key => typeof key === 'string' && !(array && key === 'length'));
  if (symbols.length) fail(`${label} must not contain symbol properties.`);
  if (array && (keys.some(key => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) || keys.length !== value.length)) fail(`${label} arrays must be dense and contain no extra properties.`);
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property, not an accessor.`);
  ancestors.add(value);
  const result = array ? Array.from({ length: value.length }, (_, index) => inertJsonSnapshot(descriptors[String(index)].value, `${label}[${index}]`, ancestors)) : Object.fromEntries(keys.map(key => [key, inertJsonSnapshot(descriptors[key].value, `${label}.${key}`, ancestors)]));
  ancestors.delete(value);
  return result;
}
function assertCandidateByteCeiling(targetId, byteLength) {
  const target = BUILT_IN_CANDIDATE_TARGETS[targetId];
  if (!target) fail(`target ${targetId || 'missing'} is not supported.`);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) fail('candidate byte length must be a nonnegative safe integer.');
  if (byteLength > target.byteCeiling) fail(`candidate exceeds the target-specific ${target.byteCeiling}-byte preparse ceiling.`);
  return byteLength;
}
function storageGate(specification, kind) {
  const storage = specification.encodingIntent?.storage || {};
  for (const entry of specification.logical[kind]) {
    const expected = entry.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate';
    const choice = storage.byEntryId?.[entry.entryId] || storage[kind === 'sprites' ? 'spriteDefault' : 'paletteDefault'] || expected;
    if (choice !== expected) fail(`storage for ${kind === 'sprites' ? 'sprite ' : 'palette '}${entry.entryId} conflicts with its logical link.`);
  }
}
function gateV1(specification) {
  const encoding = specification.encodingIntent || {}, compression = encoding.compression || {}, crop = encoding.crop || {}, options = encoding.backendOptions?.['ikemaker-builtin-sff-v1'] || {};
  if (encoding.reviewedConversions?.length) fail('reviewed conversions must be completed into sealed indexed sources before writing.');
  if (encoding.paletteMode !== 'individual-successive') fail('paletteMode must explicitly be individual-successive; global shared-palette mode is not certified.');
  const modes = [compression.default, ...Object.values(compression.byEntryId || {})].filter(Boolean); if (!modes.length || modes.some(value => value !== 'pcx-rle8')) fail('compression must explicitly be pcx-rle8.');
  if ([crop.default, ...Object.values(crop.byEntryId || {})].filter(Boolean).some(value => value !== 'none')) fail('crop must be none.');
  if (Object.entries(encoding.backendOptions || {}).some(([key, value]) => key !== 'ikemaker-builtin-sff-v1' && value && Object.keys(value).length)) fail('only the selected backend may have active backend options.');
  if (Object.keys(options).some(key => key !== 'paletteBySpriteEntryId')) fail('backend options contain an unsupported field.');
  const decisions = options.paletteBySpriteEntryId, spriteIds = new Set(specification.logical.sprites.map(entry => entry.entryId));
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) fail('paletteBySpriteEntryId must explicitly choose own or previous for every sprite.');
  if (Object.keys(decisions).length !== spriteIds.size || Object.keys(decisions).some(key => !spriteIds.has(key))) fail('paletteBySpriteEntryId must contain exactly every sprite entryId and no extras.');
  for (const [entryId, decision] of Object.entries(decisions)) if (!['own', 'previous'].includes(decision)) fail(`palette decision for ${entryId} must be own or previous.`);
  const paletteIds = new Set(), firstUses = [];
  specification.logical.palettes.forEach((palette, index) => { if (palette.group !== 0 || palette.number !== index) fail(`palette ${palette.entryId} must use synthetic identity 0,${index}.`); if (palette.contentLinkTargetEntryId) fail(`palette ${palette.entryId} cannot use a v2-style content link in SFF v1.`); paletteIds.add(palette.entryId); });
  for (const sprite of specification.logical.sprites) { if (!sprite.paletteEntryId || !paletteIds.has(sprite.paletteEntryId)) fail(`sprite ${sprite.entryId} must reference one logical palette.`); if (!firstUses.includes(sprite.paletteEntryId)) firstUses.push(sprite.paletteEntryId); }
  storageGate(specification, 'sprites');
  if (firstUses.length !== specification.logical.palettes.length || firstUses.some((id, index) => id !== specification.logical.palettes[index].entryId)) fail('logical palette order must equal first physical sprite-use order, and every palette must be used.');
}
function gateV20(specification) {
  const encoding = specification.encodingIntent || {}, compression = encoding.compression || {}, crop = encoding.crop || {};
  if (Object.values(encoding.backendOptions || {}).some(value => value && Object.keys(value).length)) fail('backend options must be empty for the sealed RAW8 profile.');
  if (encoding.reviewedConversions?.length) fail('reviewed conversions must be completed into new logical sources before writing.');
  if (encoding.paletteMode && encoding.paletteMode !== 'embedded') fail('palette mode must be embedded.');
  const modes = [compression.default, ...Object.values(compression.byEntryId || {})].filter(Boolean); if (!modes.length || modes.some(value => value !== 'raw8')) fail('compression must be explicitly raw8.');
  if ([crop.default, ...Object.values(crop.byEntryId || {})].filter(Boolean).some(value => value !== 'none')) fail('crop must be none.');
  storageGate(specification, 'sprites'); storageGate(specification, 'palettes');
}
function gateV21(specification) {
  const encoding = specification.encodingIntent || {}, compression = encoding.compression || {}, crop = encoding.crop || {}, options = encoding.backendOptions || {};
  if (Object.keys(options[specification.selection.backendId] || {}).length) fail('built-in backend options must be empty.');
  if (Object.keys(options).some(key => key !== specification.selection.backendId && Object.keys(options[key] || {}).length)) fail('unselected backend options are not allowed.');
  if (encoding.reviewedConversions?.length) fail('reviewed conversions must produce a new logical source before this adapter runs.');
  if (encoding.paletteMode && !['embedded', 'true-color'].includes(encoding.paletteMode)) fail('palette mode must be embedded or true-color.');
  const byId = compression.byEntryId || {}, expectedCompression = { indexed8: 'png8', rgb24: 'png24', rgba32: 'png32' };
  for (const sprite of specification.logical.sprites) {
    const expected = expectedCompression[sprite.pixels.kind], actual = byId[sprite.entryId] || compression.default;
    if (!expected || actual !== expected) fail(`compression for sprite ${sprite.entryId} must be explicitly ${expected || 'a supported PNG encoding'}.`);
    if (sprite.pixels.kind === 'indexed8' && !sprite.paletteEntryId) fail(`indexed sprite ${sprite.entryId} requires a palette assignment.`);
    if (sprite.pixels.kind !== 'indexed8' && sprite.paletteEntryId) fail(`true-color sprite ${sprite.entryId} must not carry an indexed palette assignment.`);
  }
  if ([crop.default, ...Object.values(crop.byEntryId || {})].filter(Boolean).some(value => value !== 'none')) fail('crop must be none; prepared crop projection is not yet proven.');
  storageGate(specification, 'sprites'); storageGate(specification, 'palettes');
}
function assertBuiltInCandidateSpecificationProfile(specification, expectedTargetId) {
  const target = BUILT_IN_CANDIDATE_TARGETS[expectedTargetId];
  if (!target || specification?.selection?.targetId !== expectedTargetId || specification.selection.backendId !== target.backendId || specification.selection.adapter?.id !== target.adapterId || Number(specification.selection.adapter?.version) !== target.adapterVersion) fail(`specification selection does not match built-in target ${expectedTargetId}.`);
  if (expectedTargetId === 'sff-v1') gateV1(specification); else if (expectedTargetId === 'sff-v2.0') gateV20(specification); else gateV21(specification);
  return specification;
}
function assertBuiltInCandidateRequestProfile(request, expectedTargetId) {
  if (types.isProxy(request)) fail('adapter request must not be a Proxy.');
  if (!request || typeof request !== 'object' || Array.isArray(request) || Buffer.isBuffer(request) || Object.getPrototypeOf(request) !== Object.prototype) fail('adapter request must be a plain object.');
  request = deepFreeze(inertJsonSnapshot(request, 'adapter request'));
  const selectedTargetId = expectedTargetId === undefined ? request.targetId : expectedTargetId;
  assertAdapterRequest(request, request?.requestHash);
  const target = BUILT_IN_CANDIDATE_TARGETS[selectedTargetId];
  if (!target || request.targetId !== selectedTargetId || request.backendId !== target.backendId || request.adapter?.id !== target.adapterId || Number(request.adapter?.version) !== target.adapterVersion || request.expectedValidator?.id !== target.validatorId || Number(request.expectedValidator?.version) !== target.validatorVersion || request.adoptionAllowed !== false) fail(`request selection does not match built-in target ${selectedTargetId}.`);
  assertBuiltInCandidateSpecificationProfile(request.specification, selectedTargetId);
  return request;
}
function projectV21RequestSpecification(request) {
  let specification;
  if (request?.schema === 'ikemaker.sff-build-specification' && request?.version === 2) {
    specification = assertSffBuildSpecificationV2(request);
    const review = specification.review?.creatorTestBuild;
    assertBuiltInCandidateSpecificationProfile(specification, 'sff-v2.1');
    const reviewKeys = Object.keys(specification.review || {}).sort(), keys = Object.keys(review || {}).sort(), expected = ['adoptionAllowed', 'certificationRequired', 'humanReviewComplete', 'projectionPlanHash'];
    if (JSON.stringify(reviewKeys) !== JSON.stringify(['creatorTestBuild']) || !review || Object.getPrototypeOf(review) !== Object.prototype || JSON.stringify(keys) !== JSON.stringify(expected) || review.humanReviewComplete !== false || review.adoptionAllowed !== false || review.certificationRequired !== true || !/^[0-9a-f]{64}$/.test(String(review.projectionPlanHash || ''))) fail('direct v2 projection is reserved for one closed, explicitly non-authoritative Creator test-build review record.');
  } else {
    request = assertBuiltInCandidateRequestProfile(request, 'sff-v2.1');
    specification = request.specification;
  }
  for (const sprite of specification.logical.sprites) if (!['indexed8', 'rgb24', 'rgba32'].includes(sprite.pixels.kind) || sprite.source.kind !== 'complete-image') fail(`sprite ${sprite.entryId} is outside supported complete-image PNG input.`);
  for (const palette of specification.logical.palettes) if (palette.colors.length !== 256) fail(`palette ${palette.entryId} must contain exactly 256 RGBA colors.`);
  const palettes = specification.logical.palettes.map(entry => ({ entryId: entry.entryId, group: entry.group, number: entry.number, tableOrder: 'sff', linkTargetEntryId: entry.contentLinkTargetEntryId, duplicatePolicy: entry.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate', colors: entry.colors, source: { relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash, width: 256, height: 1, provenance: { ...entry.source.provenance, v2EntryId: entry.entryId } } }));
  const encodings = { indexed8: ['png8', 8], rgb24: ['png24', 24], rgba32: ['png32', 32] };
  const sprites = specification.logical.sprites.map(entry => { const [format, colorDepth] = encodings[entry.pixels.kind]; return { entryId: entry.entryId, group: entry.group, number: entry.number, axisX: entry.axisX, axisY: entry.axisY, colorDepth, format, compression: format, paletteId: entry.paletteEntryId, linkTargetEntryId: entry.contentLinkTargetEntryId, duplicatePolicy: entry.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash, width: entry.width, height: entry.height, provenance: { ...entry.source.provenance, v2EntryId: entry.entryId } } }; });
  const kinds = new Set(sprites.map(entry => entry.format));
  return createSffBuildSpecification({ planId: `v2-adapter-${specification.planId}`, sourceRoot: specification.logical.sourceRoot, target: { archiveIdentity: specification.archive.identity, archiveFingerprint: specification.archive.fingerprint, sffVersion: '2.1' }, sprites, palettes, requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', ...(kinds.has('png8') ? ['sprite-png8', 'embedded-palettes'] : []), ...(kinds.has('png24') || kinds.has('png32') ? ['sprite-truecolor'] : [])], decisions: [], options: { shared: { v2SpecificationHash: specification.specificationHash }, backends: {} } });
}
function resolved(list, index) { const seen = new Set(); let row = list[index]; while (row && !row.dataSize) { if (seen.has(row.index)) fail('validator returned a link cycle.'); seen.add(row.index); row = list[row.link]; } if (!row) fail('validator returned a missing link target.'); return row; }
function baseReceipt(request, candidateHash, checks, extra) { if (Object.values(checks).some(value => value !== true)) fail('independent semantic comparison failed.'); return { status: 'passed', targetId: request.targetId, backendId: request.backendId, candidateByteHash: candidateHash, specificationHash: request.specificationHash, logicalHash: request.logicalHash, validationCandidateByteHash: candidateHash, checks, ...extra, byteEqualityRequired: false }; }
function semanticV1(request, candidateHash, report) {
  const logical = request.specification.logical, paletteById = new Map(logical.palettes.map((entry, index) => [entry.entryId, { index, rgbHash: sha(Buffer.from(entry.colors.flatMap(color => color.slice(0, 3)))) }])), positions = new Map(logical.sprites.map((entry, index) => [entry.entryId, index]));
  const sprites = logical.sprites.map((entry, index) => { const actual = report.sprites[index], palette = paletteById.get(entry.paletteEntryId); return { entryId: entry.entryId, physicalIndex: index, identity: [actual.group, actual.number], axis: [actual.axisX, actual.axisY], dimensions: [actual.width, actual.height], decodedHash: actual.decodedIndexHash, effectivePaletteRgbHash: actual.paletteRgbHash, expectedPaletteRgbHash: palette?.rgbHash || null, logicalPaletteId: entry.paletteEntryId, logicalPaletteOrdinal: palette?.index ?? null, link: actual.declaredLength ? null : actual.link, expectedLink: entry.contentLinkTargetEntryId ? positions.get(entry.contentLinkTargetEntryId) : null, paletteSame: actual.paletteSame }; });
  const checks = { physicalOrder: sprites.every((row, index) => row.physicalIndex === index), identities: sprites.every((row, index) => row.identity[0] === logical.sprites[index].group && row.identity[1] === logical.sprites[index].number), axes: sprites.every((row, index) => row.axis[0] === logical.sprites[index].axisX && row.axis[1] === logical.sprites[index].axisY), dimensions: sprites.every((row, index) => row.dimensions[0] === logical.sprites[index].width && row.dimensions[1] === logical.sprites[index].height), decodedPixels: sprites.every((row, index) => row.decodedHash === logical.sprites[index].pixels.decodedHash), effectivePalettes: sprites.every(row => row.effectivePaletteRgbHash === row.expectedPaletteRgbHash), paletteAssignments: sprites.every(row => row.effectivePaletteRgbHash === row.expectedPaletteRgbHash && Number.isInteger(row.logicalPaletteOrdinal)), paletteValues: sprites.every(row => row.effectivePaletteRgbHash === row.expectedPaletteRgbHash), links: sprites.every(row => row.link === row.expectedLink), transparency: logical.palettes.every(entry => entry.colors.length === 256 && entry.colors.every((color, index) => color[3] === (index === 0 ? 0 : 255))), syntheticPaletteIdentitiesOnly: logical.palettes.every((entry, index) => entry.group === 0 && entry.number === index) };
  return baseReceipt(request, candidateHash, checks, { sprites, palettes: logical.palettes.map((entry, index) => ({ entryId: entry.entryId, logicalSyntheticIdentity: [0, index], physicallyAddressable: false })), primaryVersion: report.header.version });
}
function semanticV2(request, candidateHash, report, v21) {
  const logical = request.specification.logical, spritePositions = new Map(logical.sprites.map((entry, index) => [entry.entryId, index])), palettePositions = new Map(logical.palettes.map((entry, index) => [entry.entryId, index]));
  const sprites = logical.sprites.map((entry, index) => { const actual = report.sprites[index], owner = v21 ? actual : resolveStored(report.sprites, index, 'sprite'); return { entryId: entry.entryId, physicalIndex: index, identity: [actual.group, actual.number], axis: [actual.axisX, actual.axisY], dimensions: [actual.width, actual.height], decodedHash: v21 ? (actual.decodedHash || actual.decodedIndexHash) : owner.decodedIndexHash, paletteIndex: actual.paletteIndex, expectedPaletteIndex: entry.pixels.kind === 'indexed8' ? palettePositions.get(entry.paletteEntryId) : null, indexed: entry.pixels.kind === 'indexed8', link: actual.dataSize ? null : actual.link, expectedLink: entry.contentLinkTargetEntryId ? spritePositions.get(entry.contentLinkTargetEntryId) : null }; });
  const palettes = logical.palettes.map((entry, index) => { const actual = report.palettes[index], owner = v21 ? resolved(report.palettes, index) : resolveStored(report.palettes, index, 'palette'), expectedRgbaHash = sha(Buffer.from(entry.colors.flat())); return { entryId: entry.entryId, physicalIndex: index, identity: [actual.group, actual.number], rgbaHash: owner.rgbaHash, expectedRgbaHash, link: actual.dataSize ? null : actual.link, expectedLink: entry.contentLinkTargetEntryId ? palettePositions.get(entry.contentLinkTargetEntryId) : null, ...(v21 ? { transparentIndexes: entry.colors.map((color, colorIndex) => color[3] === 0 ? colorIndex : null).filter(value => value !== null) } : { binaryTransparency: entry.colors.every((color, colorIndex) => color[3] === (colorIndex === 0 ? 0 : 255)) }) }; });
  const checks = { physicalOrder: sprites.every((entry, index) => entry.physicalIndex === index) && palettes.every((entry, index) => entry.physicalIndex === index), identities: sprites.every((entry, index) => entry.identity[0] === logical.sprites[index].group && entry.identity[1] === logical.sprites[index].number) && palettes.every((entry, index) => entry.identity[0] === logical.palettes[index].group && entry.identity[1] === logical.palettes[index].number), axes: sprites.every((entry, index) => entry.axis[0] === logical.sprites[index].axisX && entry.axis[1] === logical.sprites[index].axisY), dimensions: sprites.every((entry, index) => entry.dimensions[0] === logical.sprites[index].width && entry.dimensions[1] === logical.sprites[index].height), decodedPixels: sprites.every((entry, index) => entry.decodedHash === logical.sprites[index].pixels.decodedHash), paletteAssignments: sprites.every(entry => !entry.indexed || entry.paletteIndex === entry.expectedPaletteIndex), paletteValues: palettes.every(entry => entry.rgbaHash === entry.expectedRgbaHash), links: sprites.every(entry => entry.link === entry.expectedLink) && palettes.every(entry => entry.link === entry.expectedLink), transparency: v21 ? palettes.every((entry, index) => entry.transparentIndexes.length === logical.palettes[index].colors.filter(color => color[3] === 0).length) : palettes.every(entry => entry.binaryTransparency) };
  return baseReceipt(request, candidateHash, checks, { [v21 ? 'entries' : 'sprites']: sprites, palettes, ...(v21 ? {} : { primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion }) });
}
function deriveBuiltInCandidateEvidence(rawInput) {
  if (types.isProxy(rawInput)) fail('input must not be a Proxy.');
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || Buffer.isBuffer(rawInput) || Object.getPrototypeOf(rawInput) !== Object.prototype) fail('input must be a plain object.');
  const ownKeys = Reflect.ownKeys(rawInput);
  if (ownKeys.some(key => typeof key === 'symbol') || ownKeys.length !== 2 || !ownKeys.includes('request') || !ownKeys.includes('candidateBytes')) fail('input must contain exactly request and candidateBytes as enumerable own data properties.');
  const requestDescriptor = Object.getOwnPropertyDescriptor(rawInput, 'request'), candidateDescriptor = Object.getOwnPropertyDescriptor(rawInput, 'candidateBytes');
  if (!requestDescriptor || !candidateDescriptor || !requestDescriptor.enumerable || !candidateDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(requestDescriptor, 'value') || !Object.prototype.hasOwnProperty.call(candidateDescriptor, 'value')) fail('input request and candidateBytes must be enumerable own data properties.');
  let request = requestDescriptor.value; const candidateBytes = candidateDescriptor.value;
  if (types.isProxy(candidateBytes) || !Buffer.isBuffer(candidateBytes)) fail('candidateBytes must be a non-proxy Buffer.');
  request = assertBuiltInCandidateRequestProfile(request);
  assertCandidateByteCeiling(request.targetId, candidateBytes.length);
  const bytes = Buffer.from(candidateBytes), candidateHash = sha(bytes), target = BUILT_IN_CANDIDATE_TARGETS[request.targetId]; let report, strictReportHash, semanticComparison;
  if (request.targetId === 'sff-v1') { report = assertSffV1Pcx8(bytes, request.specification, { limits: { archiveBytes: target.byteCeiling } }); strictReportHash = hashCanonical({ kind: report.kind, profile: report.profile, version: report.header.version, groupCount: report.header.groupCount, spriteCount: report.sprites.length }); semanticComparison = semanticV1(request, candidateHash, report); }
  else if (request.targetId === 'sff-v2.0') { report = assertSffV20Raw8(bytes, request.specification, { compatibilityProfile: 'canonical', limits: { archiveBytes: target.byteCeiling } }); strictReportHash = hashCanonical({ kind: report.kind, profile: report.profile, primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length }); semanticComparison = semanticV2(request, candidateHash, report, false); }
  else { const projected = projectV21RequestSpecification(request); report = assertSffV21Mixed(bytes, projected, { compatibilityProfile: 'canonical' }); strictReportHash = hashCanonical(report); semanticComparison = semanticV2(request, candidateHash, report, true); }
  return deepFreeze({ byteHash: candidateHash, validation: { status: 'passed', targetId: request.targetId, backendId: request.backendId, validatorId: target.validatorId, validatorVersion: target.validatorVersion, candidateByteHash: candidateHash, specificationHash: request.specificationHash, logicalHash: request.logicalHash, strictReportHash }, semanticComparison });
}

module.exports = { BUILT_IN_CANDIDATE_TARGETS, assertBuiltInCandidateSpecificationProfile, assertBuiltInCandidateRequestProfile, assertCandidateByteCeiling, projectV21RequestSpecification, deriveBuiltInCandidateEvidence };
