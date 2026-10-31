'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const domain = require('./palette_domain_model');
const { parseSffBuffer, resolvedPalette, paletteRgba, spritePng } = require('./sff_reader');
const { readIndexedPng } = require('./palette_indexed_png');

const INVENTORY_SCHEMA = 'ikemaker.palette-family-inventory';
const PLAN_SCHEMA = 'ikemaker.palette-family-expansion-plan';
const VERSION = 1;
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(stable(value))).digest('hex'); }
function digest(value, label) { const text = String(value || ''); if (!/^[0-9a-f]{64}$/i.test(text)) throw new Error(`${label} must be an exact SHA-256 hash.`); return text.toLowerCase(); }
function key(value) { return `${value.group},${value.number}`; }
function closedCoordinate(value, label) { return domain.coordinate(value, label); }
function exactFile(filename) {
  const resolved = path.resolve(filename);
  if (!fs.existsSync(resolved) || fs.lstatSync(resolved).isSymbolicLink() || !fs.statSync(resolved).isFile() || path.resolve(fs.realpathSync(resolved)) !== resolved) throw new Error('Palette-family inventory requires a regular non-linked SFF file.');
  const bytes = fs.readFileSync(resolved), stat = fs.statSync(resolved);
  if (bytes.length !== stat.size) throw new Error('The SFF changed while palette-family inventory was read.');
  return { filename: resolved, bytes, byteHash: sha(bytes), byteLength: bytes.length };
}
function normalizePalette(value) {
  const coordinate = closedCoordinate(value.coordinate || value, 'Palette inventory coordinate'), physicalIndex = Number(value.physicalIndex), effectiveOwnerPhysicalIndex = Number(value.effectiveOwnerPhysicalIndex), link = value.link == null ? null : Number(value.link), dataSize = Number(value.dataSize || 0), colorsHash = digest(value.colorsHash, 'Palette colors'), usedIndexes = [...new Set((value.usedIndexes || []).map(Number))].sort((a, b) => a - b), partialAlphaIndexes = [...new Set((value.partialAlphaIndexes || []).map(Number))].sort((a, b) => a - b);
  if (!Number.isInteger(physicalIndex) || physicalIndex < 0 || !Number.isInteger(effectiveOwnerPhysicalIndex) || effectiveOwnerPhysicalIndex < 0 || link !== null && (!Number.isInteger(link) || link < 0) || !Number.isInteger(dataSize) || dataSize < 0 || usedIndexes.some(index => !Number.isInteger(index) || index < 0 || index > 255) || partialAlphaIndexes.some(index => !Number.isInteger(index) || index < 0 || index > 255)) throw new Error('Palette inventory physical/link/index evidence is invalid.');
  const colors = value.colors == null ? null : value.colors.map((color, index) => { if (!Array.isArray(color) || color.length !== 4 || color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error(`Palette inventory color ${index} is invalid.`); return color.slice(); });
  if (colors && (colors.length !== 256 || sha(colors) !== colorsHash)) throw new Error('Palette inventory colors do not match their exact hash.');
  return { physicalIndex, coordinate, link, dataSize, effectiveOwnerPhysicalIndex, colorsHash, colors, usedIndexes, partialAlphaIndexes, indexedSpriteCount: Number(value.indexedSpriteCount || 0), truecolorSpriteCount: Number(value.truecolorSpriteCount || 0), unavailable: String(value.unavailable || '') };
}
function normalizeImageDataOwner(value) {
  const dataOwnerPhysicalIndex = Number(value.dataOwnerPhysicalIndex), indexPlaneHash = digest(value.indexPlaneHash, 'Image-data index plane'), usedIndexes = [...new Set((value.usedIndexes || []).map(Number))].sort((a, b) => a - b), members = (value.members || []).map(member => ({ spritePhysicalIndex: Number(member.spritePhysicalIndex), palettePhysicalIndex: Number(member.palettePhysicalIndex), effectivePaletteOwnerPhysicalIndex: Number(member.effectivePaletteOwnerPhysicalIndex) }));
  if (!Number.isInteger(dataOwnerPhysicalIndex) || dataOwnerPhysicalIndex < 0 || usedIndexes.some(index => !Number.isInteger(index) || index < 0 || index > 255) || !members.length || members.some(member => Object.values(member).some(item => !Number.isInteger(item) || item < 0)) || new Set(members.map(member => member.spritePhysicalIndex)).size !== members.length) throw new Error('Image-data owner evidence is invalid.');
  return { dataOwnerPhysicalIndex, indexPlaneHash, usedIndexes, members };
}
function normalizeInventory(value) {
  if (value?.schema !== INVENTORY_SCHEMA || value?.version !== VERSION) throw new Error('Unsupported palette-family inventory.');
  const archive = { filename: path.resolve(String(value.archive?.filename || '')), byteHash: digest(value.archive?.byteHash, 'Archive'), byteLength: Number(value.archive?.byteLength), sffVersion: String(value.archive?.sffVersion || '') };
  if (!Number.isInteger(archive.byteLength) || archive.byteLength < 1 || !['2.0', '2.1'].includes(archive.sffVersion)) throw new Error('Palette-family inventory supports exact SFF v2.0/v2.1 evidence only.');
  const palettes = (value.palettes || []).map(normalizePalette), physical = new Set();
  for (const palette of palettes) { if (physical.has(palette.physicalIndex)) throw new Error('Palette-family inventory repeats a physical palette index.'); physical.add(palette.physicalIndex); if (!physical.has(palette.effectiveOwnerPhysicalIndex) && !palettes.some(item => Number(item.physicalIndex) === palette.effectiveOwnerPhysicalIndex)) throw new Error('Palette-family inventory references a missing effective owner.'); }
  const imageDataOwners = (value.imageDataOwners || []).map(normalizeImageDataOwner), dataOwners = new Set();
  for (const owner of imageDataOwners) { if (dataOwners.has(owner.dataOwnerPhysicalIndex)) throw new Error('Palette-family inventory repeats an image-data owner.'); dataOwners.add(owner.dataOwnerPhysicalIndex); for (const member of owner.members) if (!physical.has(member.palettePhysicalIndex) || !physical.has(member.effectivePaletteOwnerPhysicalIndex)) throw new Error('Image-data owner evidence references a missing palette.'); }
  const body = { schema: INVENTORY_SCHEMA, version: VERSION, archive, palettes, imageDataOwners }, inventoryHash = sha(body);
  if (value.inventoryHash && digest(value.inventoryHash, 'Palette-family inventory') !== inventoryHash) throw new Error('Palette-family inventory hash is invalid.');
  return { ...body, inventoryHash };
}
function inventoryFromArchive(archive, evidence) {
  const major = Number(archive.header?.version?.[0]), minor = Number(archive.header?.version?.[2]), sffVersion = `${major}.${minor}`;
  if (major !== 2 || ![0, 1].includes(minor)) throw new Error('Palette-family inventory supports SFF v2.0/v2.1 only.');
  const usage = new Map(), unavailable = new Map(), dataClusters = new Map();
  const spriteOwner = (sprite, seen = new Set()) => { if (Number(sprite.dataSize) !== 0) return sprite; if (seen.has(sprite.index)) throw new Error(`Circular linked sprite at physical index ${sprite.index}.`); seen.add(sprite.index); const target = archive.sprites?.[sprite.link]; if (!target) throw new Error(`Sprite ${sprite.group},${sprite.number} links to missing physical sprite ${sprite.link}.`); return spriteOwner(target, seen); };
  for (const sprite of archive.sprites || []) {
    let owner;
    try { owner = resolvedPalette(archive, sprite.paletteIndex); } catch (error) { throw new Error(`Sprite ${sprite.group},${sprite.number} has unresolved palette ownership: ${error.message}`); }
    if (!owner) continue;
    if (!usage.has(owner.index)) usage.set(owner.index, { used: new Set([0]), indexedSpriteCount: 0, truecolorSpriteCount: 0 });
    const record = usage.get(owner.index);
    if (Number(sprite.colorDepth) > 8) { record.truecolorSpriteCount += 1; continue; }
    record.indexedSpriteCount += 1;
    try { const dataOwner = spriteOwner(sprite); let cluster = dataClusters.get(dataOwner.index); if (!cluster) { const decoded = readIndexedPng(spritePng(archive, dataOwner, null, true)); cluster = { dataOwnerPhysicalIndex: dataOwner.index, indexPlaneHash: decoded.indexPlaneHash, usedIndexes: decoded.histogram.map((count, index) => count ? index : -1).filter(index => index >= 0), members: [] }; dataClusters.set(dataOwner.index, cluster); } cluster.usedIndexes.forEach(index => record.used.add(index)); cluster.members.push({ spritePhysicalIndex: sprite.index, palettePhysicalIndex: sprite.paletteIndex, effectivePaletteOwnerPhysicalIndex: owner.index }); } catch (error) { unavailable.set(owner.index, `Indexed sprite ${sprite.group},${sprite.number} could not preserve exact indexes: ${error.message}`); }
  }
  const palettes = (archive.palettes || []).map((palette, physicalIndex) => {
    const owner = resolvedPalette(archive, physicalIndex); if (!owner) throw new Error(`Palette ${palette.group},${palette.number} has no effective owner.`);
    const colors = paletteRgba(archive, physicalIndex), record = usage.get(owner.index) || { used: new Set([0]), indexedSpriteCount: 0, truecolorSpriteCount: 0 };
    return { physicalIndex, coordinate: { group: palette.group, number: palette.number }, link: palette.link == null ? null : Number(palette.link), dataSize: Number(palette.dataSize || 0), effectiveOwnerPhysicalIndex: owner.index, colorsHash: sha(colors), colors, usedIndexes: [...record.used].sort((a, b) => a - b), partialAlphaIndexes: colors.map((color, index) => color[3] > 0 && color[3] < 255 ? index : -1).filter(index => index >= 0), indexedSpriteCount: record.indexedSpriteCount, truecolorSpriteCount: record.truecolorSpriteCount, unavailable: unavailable.get(owner.index) || '' };
  });
  return normalizeInventory({ schema: INVENTORY_SCHEMA, version: VERSION, archive: { filename: evidence.filename, byteHash: evidence.byteHash, byteLength: evidence.byteLength, sffVersion }, palettes, imageDataOwners: [...dataClusters.values()] });
}
function inventoryFromSff(filename) { const file = exactFile(filename), archive = parseSffBuffer(file.bytes, file.filename), inventory = inventoryFromArchive(archive, file), after = exactFile(file.filename); if (after.byteHash !== file.byteHash || after.byteLength !== file.byteLength) throw new Error('The SFF changed while palette-family inventory was assembled.'); return inventory; }
function normalizeProfile(value = {}) {
  const allowedSffVersions = [...new Set((value.allowedSffVersions || ['2.0', '2.1']).map(String))], maximumPaletteSlots = Number(value.maximumPaletteSlots ?? 256);
  if (!allowedSffVersions.length || allowedSffVersions.some(version => !['2.0', '2.1'].includes(version)) || !Number.isInteger(maximumPaletteSlots) || maximumPaletteSlots < 1 || maximumPaletteSlots > 256) throw new Error('Palette-family compatibility profile is invalid.');
  return { id: String(value.id || 'palette-family-indexed-v1'), allowedSffVersions, maximumPaletteSlots, allowPartialAlpha: value.allowPartialAlpha !== false };
}
function planPaletteFamily(input) {
  if (input?.cancelled) return { schema: PLAN_SCHEMA, version: VERSION, cancelled: true, readOnly: true, activeSffChanged: false, blockers: [], warnings: [], selections: [] };
  const inventory = normalizeInventory(input.inventory), archive = domain.normalizeArchive(input.archiveMetadata || {}), metadataRevision = Number(input.metadataRevision), scope = String(input.scope || 'both'), requiredNewSlots = Number(input.requiredNewSlots || 0), profile = normalizeProfile(input.profile);
  if (!Number.isInteger(metadataRevision) || metadataRevision < 0) throw new Error('Palette-family planning requires the exact metadata revision.');
  if (!['source', 'destination', 'both'].includes(scope)) throw new Error('Palette-family scope must be source, destination, or both.');
  if (!Number.isInteger(requiredNewSlots) || requiredNewSlots < 0 || requiredNewSlots > 255) throw new Error('Required new palette slots must be an integer from 0 through 255.');
  const blockers = [], warnings = [], reviewItems = [], pairs = [], selectedGroups = new Set((input.namedMappingIds || []).map(String)), groups = new Map(archive.remapPalGroups.map(group => [group.id, group]));
  for (const groupId of selectedGroups) {
    const group = groups.get(groupId);
    if (!group || group.enabled === false) { blockers.push({ code: 'MAPPING_MISSING_OR_DISABLED', groupId, message: `Named RemapPal mapping ${groupId} is missing or disabled.` }); continue; }
    if (!group.rangeMappings.length) { blockers.push({ code: 'MAPPING_UNMAPPED', groupId, message: `Named RemapPal group “${group.name}” has no directed range mapping.` }); continue; }
    if (!group.reviewedInventoryHash) blockers.push({ code: 'MAPPING_NOT_REVIEWED', groupId, message: `Named RemapPal mapping “${group.name}” is not bound to reviewed inventory evidence.` });
    else if (group.reviewedInventoryHash !== inventory.inventoryHash) blockers.push({ code: 'STALE_MAPPING_EVIDENCE', groupId, message: `Named RemapPal mapping “${group.name}” was reviewed against another palette inventory.` });
    group.rangeMappings.forEach((mapping, rangeIndex) => domain.expandRemapPalRange(mapping).forEach((pair, pairOffset) => pairs.push({ ...pair, provenance: { kind: 'named', groupId, groupName: group.name, rangeIndex, pairOffset } })));
  }
  (input.explicitRangeMappings || []).map(domain.normalizeRemapPalRange).forEach((mapping, rangeIndex) => domain.expandRemapPalRange(mapping).forEach((pair, pairOffset) => pairs.push({ ...pair, provenance: { kind: 'explicit', rangeIndex, pairOffset } })));
  if (!pairs.length && !blockers.length) blockers.push({ code: 'NO_MAPPINGS_SELECTED', message: 'Choose at least one directed RemapPal range mapping.' });
  const overlapGroups = [{ id: 'selected-plan', name: 'Selected plan', enabled: true, rangeMappings: pairs.map(pair => ({ source: { group: pair.source.group, startNumber: pair.source.number, endNumber: pair.source.number }, destination: { group: pair.destination.group, startNumber: pair.destination.number, endNumber: pair.destination.number } })) }], overlap = domain.remapPalMappingDiagnostics(overlapGroups);
  for (const issue of overlap) (issue.severity === 'error' ? blockers : warnings).push({ code: issue.code.toUpperCase().replace(/-/g, '_'), message: issue.message, coordinate: issue.coordinate });
  const byCoordinate = new Map(); for (const palette of inventory.palettes) { const coordinate = key(palette.coordinate); if (!byCoordinate.has(coordinate)) byCoordinate.set(coordinate, []); byCoordinate.get(coordinate).push(palette); }
  const selected = new Map(), duplicateEvidence = [];
  const add = (coordinate, role, pair) => {
    const matches = byCoordinate.get(key(coordinate)) || [];
    if (!matches.length) { blockers.push({ code: 'PALETTE_COORDINATE_MISSING', coordinate, message: `Palette ${key(coordinate)} is missing from the exact SFF inventory.` }); return; }
    if (matches.length > 1) { blockers.push({ code: 'PALETTE_COORDINATE_AMBIGUOUS', coordinate, physicalIndexes: matches.map(item => item.physicalIndex), message: `Palette ${key(coordinate)} resolves to multiple physical palettes.` }); return; }
    const palette = matches[0], existing = selected.get(palette.physicalIndex), provenance = { role, ...pair.provenance, counterpart: role === 'source' ? pair.destination : pair.source };
    if (existing) { existing.provenance.push(provenance); duplicateEvidence.push({ physicalIndex: palette.physicalIndex, coordinate: palette.coordinate, role, message: `Palette ${key(coordinate)} was selected more than once and is included once.` }); }
    else selected.set(palette.physicalIndex, { ...palette, provenance: [provenance], linked: palette.effectiveOwnerPhysicalIndex !== palette.physicalIndex || palette.link !== null });
  };
  for (const pair of pairs) { if (scope !== 'destination') add(pair.source, 'source', pair); if (scope !== 'source') add(pair.destination, 'destination', pair); }
  const owners = new Map();
  for (const palette of selected.values()) {
    if (palette.linked) reviewItems.push({ code: 'LINKED_OWNER_DECISION_REQUIRED', physicalIndex: palette.physicalIndex, effectiveOwnerPhysicalIndex: palette.effectiveOwnerPhysicalIndex, coordinate: palette.coordinate, message: `Palette ${key(palette.coordinate)} is linked to effective owner physical palette ${palette.effectiveOwnerPhysicalIndex}; a later slice must review ownership before topology changes.` });
    if (!owners.has(palette.effectiveOwnerPhysicalIndex)) owners.set(palette.effectiveOwnerPhysicalIndex, palette);
  }
  if (!profile.allowedSffVersions.includes(inventory.archive.sffVersion)) blockers.push({ code: 'PROFILE_SFF_VERSION', message: `Compatibility profile ${profile.id} does not allow SFF ${inventory.archive.sffVersion}.` });
  for (const palette of owners.values()) {
    if (palette.unavailable) blockers.push({ code: 'INDEX_EVIDENCE_UNAVAILABLE', effectiveOwnerPhysicalIndex: palette.effectiveOwnerPhysicalIndex, message: palette.unavailable });
    if (!profile.allowPartialAlpha && palette.partialAlphaIndexes.length) blockers.push({ code: 'PROFILE_PARTIAL_ALPHA', effectiveOwnerPhysicalIndex: palette.effectiveOwnerPhysicalIndex, indexes: palette.partialAlphaIndexes, message: `Compatibility profile ${profile.id} does not allow partial-alpha palette entries.` });
    const available = Array.from({ length: profile.maximumPaletteSlots }, (_, index) => index).filter(index => index !== 0 && !palette.usedIndexes.includes(index));
    if (available.length < requiredNewSlots) blockers.push({ code: 'PALETTE_CAPACITY', effectiveOwnerPhysicalIndex: palette.effectiveOwnerPhysicalIndex, requiredNewSlots, availableCandidateSlots: available.length, message: `Effective palette owner ${palette.effectiveOwnerPhysicalIndex} has ${available.length} unused candidate slot(s), fewer than the ${requiredNewSlots} requested.` });
  }
  const selections = [...selected.values()].sort((a, b) => a.physicalIndex - b.physicalIndex), effectiveOwners = [...owners.keys()].sort((a, b) => a - b), canProceedToTopologyReview = blockers.length === 0 && reviewItems.length === 0, summary = { scope, mappingPairCount: pairs.length, selectedPaletteCount: selections.length, effectiveOwnerCount: effectiveOwners.length, deduplicatedOverlapCount: duplicateEvidence.length, blockerCount: blockers.length, warningCount: warnings.length, linkedReviewCount: reviewItems.length };
  const body = { schema: PLAN_SCHEMA, version: VERSION, readOnly: true, activeSffChanged: false, archive: inventory.archive, inventoryHash: inventory.inventoryHash, metadataRevision, metadataHash: sha(archive), scope, namedMappingIds: [...selectedGroups], explicitRangeMappings: (input.explicitRangeMappings || []).map(domain.normalizeRemapPalRange), requiredNewSlots, profile, summary, selections, effectiveOwners, deduplicatedOverlaps: duplicateEvidence, blockers, warnings, reviewItems, canProceedToTopologyReview };
  return { ...body, planHash: sha(body) };
}
function verifyPlanBinding(plan, input) {
  if (plan?.schema !== PLAN_SCHEMA || plan?.version !== VERSION || plan?.readOnly !== true || plan?.activeSffChanged !== false) throw new Error('Palette-family expansion plan identity is invalid.');
  const inventory = normalizeInventory(input.inventory), archive = domain.normalizeArchive(input.archiveMetadata || {}), metadataRevision = Number(input.metadataRevision), body = { ...plan }; delete body.planHash;
  if (plan.planHash !== sha(body)) throw new Error('Palette-family expansion plan hash is invalid.');
  if (plan.archive.byteHash !== inventory.archive.byteHash || plan.inventoryHash !== inventory.inventoryHash) throw new Error('The SFF palette inventory changed after family review.');
  if (plan.metadataRevision !== metadataRevision || plan.metadataHash !== sha(archive)) throw new Error('Palette metadata changed after family review.');
  return plan;
}

module.exports = { INVENTORY_SCHEMA, PLAN_SCHEMA, VERSION, sha, normalizeInventory, inventoryFromArchive, inventoryFromSff, normalizeProfile, planPaletteFamily, verifyPlanBinding };
