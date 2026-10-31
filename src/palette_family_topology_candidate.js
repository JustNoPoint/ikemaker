'use strict';

const family = require('./palette_family_planner');
const migration = require('./palette_index_migration_model');

const SCHEMA = 'ikemaker.palette-family-topology-candidate';
const VERSION = 1;
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha(value) { return family.sha(Buffer.from(stable(value))); }
function decisionMap(value) { const result = new Map(); for (const [key, decision] of Object.entries(value || {})) { const physicalIndex = Number(key); if (!Number.isInteger(physicalIndex) || physicalIndex < 0 || !['keep-inherited-owner-color', 'materialize-independent'].includes(decision)) throw new Error('Alias decisions require a physical palette index and an explicit keep or materialize choice.'); result.set(physicalIndex, decision); } return result; }
function topologySlots(plan) { return plan.slots.map((slot, destinationIndex) => slot == null ? { destinationIndex, kind: 'empty' } : slot.kind === 'source' ? { destinationIndex, kind: 'source', sourceIndex: slot.sourceIndex, label: slot.label || '' } : { destinationIndex, kind: slot.kind, rgba: slot.rgba.slice(), label: slot.label || '' }); }
function colorsFor(slots, colors) { if (!Array.isArray(colors) || colors.length !== 256) throw new Error('Every affected palette must retain an exact 256-entry color table.'); return slots.map(slot => slot.kind === 'source' ? colors[slot.sourceIndex].slice() : slot.kind === 'new' || slot.kind === 'reserved' ? slot.rgba.slice() : [0, 0, 0, 0]); }
function createCandidate(input) {
  if (input?.cancelled) return { schema: SCHEMA, version: VERSION, cancelled: true, candidateOnly: true, activeSffChanged: false, adoption: false };
  const inventory = family.normalizeInventory(input.inventory), expansion = family.verifyPlanBinding(input.expansionPlan, { inventory, archiveMetadata: input.archiveMetadata, metadataRevision: input.metadataRevision });
  if (expansion.cancelled || expansion.blockers.length) throw new Error('Palette-family expansion must be complete and blocker-free before topology review.');
  const topology = migration.assertAuthority(input.topologyPlan, input.topologyAuthority), mapped = migration.mapping(topology), topologyPlanHash = migration.semanticHash(topology), slotTopology = topologySlots(topology), aliases = decisionMap(input.aliasDecisions), paletteByPhysical = new Map(inventory.palettes.map(palette => [palette.physicalIndex, palette])), selected = new Map(expansion.selections.map(palette => [palette.physicalIndex, palette])), materialized = new Set(), ownerMutations = new Set(), aliasDecisionEvidence = [];
  for (const selection of selected.values()) {
    const current = paletteByPhysical.get(selection.physicalIndex); if (!current || current.effectiveOwnerPhysicalIndex !== selection.effectiveOwnerPhysicalIndex || current.colorsHash !== selection.colorsHash) throw new Error('Selected palette evidence changed after family expansion.');
    if (selection.linked) {
      const decision = aliases.get(selection.physicalIndex); if (!decision) throw new Error(`Linked palette ${selection.coordinate.group},${selection.coordinate.number} requires an explicit keep or materialize decision.`);
      if (decision === 'materialize-independent') materialized.add(selection.physicalIndex); else ownerMutations.add(selection.effectiveOwnerPhysicalIndex);
      aliasDecisionEvidence.push({ physicalIndex: selection.physicalIndex, effectiveOwnerPhysicalIndex: selection.effectiveOwnerPhysicalIndex, decision });
    } else ownerMutations.add(selection.effectiveOwnerPhysicalIndex);
  }
  for (const physicalIndex of aliases.keys()) if (!selected.has(physicalIndex) || !selected.get(physicalIndex).linked) throw new Error(`Alias decision ${physicalIndex} does not belong to a selected linked palette.`);
  const affectedPhysical = new Set(), inheritedUnselected = [];
  for (const palette of inventory.palettes) {
    if (materialized.has(palette.physicalIndex) || ownerMutations.has(palette.effectiveOwnerPhysicalIndex)) { affectedPhysical.add(palette.physicalIndex); if (!selected.has(palette.physicalIndex)) inheritedUnselected.push({ physicalIndex: palette.physicalIndex, coordinate: palette.coordinate, effectiveOwnerPhysicalIndex: palette.effectiveOwnerPhysicalIndex, reason: 'inherits-selected-owner-topology' }); }
  }
  const unionUsed = new Set([0]), imageRemaps = [];
  for (const cluster of inventory.imageDataOwners) {
    const affected = cluster.members.filter(member => affectedPhysical.has(member.palettePhysicalIndex)), unaffected = cluster.members.filter(member => !affectedPhysical.has(member.palettePhysicalIndex));
    if (affected.length && unaffected.length) throw new Error(`Shared image-data owner ${cluster.dataOwnerPhysicalIndex} would receive conflicting topology: ${affected.length} affected and ${unaffected.length} unaffected sprite assignment(s).`);
    if (affected.length) { cluster.usedIndexes.forEach(index => unionUsed.add(index)); imageRemaps.push({ dataOwnerPhysicalIndex: cluster.dataOwnerPhysicalIndex, indexPlaneHash: cluster.indexPlaneHash, spritePhysicalIndexes: [...new Set(affected.map(member => member.spritePhysicalIndex))].sort((a, b) => a - b), palettePhysicalIndexes: [...new Set(affected.map(member => member.palettePhysicalIndex))].sort((a, b) => a - b), topologyMappingHash: mapped.mappingHash, remapCount: 1 }); }
  }
  if (!inventory.imageDataOwners.length) for (const physicalIndex of affectedPhysical) (paletteByPhysical.get(physicalIndex)?.usedIndexes || []).forEach(index => unionUsed.add(index));
  for (const sourceIndex of topology.reclaimableSourceIndexes) if (unionUsed.has(sourceIndex)) throw new Error(`Source index ${sourceIndex} was marked reclaimable but is used by the selected palette family.`);
  for (const sourceIndex of unionUsed) if (mapped.oldToNew[sourceIndex] == null) throw new Error(`Family topology omits used source index ${sourceIndex}.`);
  const outputOwners = new Map();
  for (const effectiveOwnerPhysicalIndex of ownerMutations) outputOwners.set(effectiveOwnerPhysicalIndex, { physicalIndex: effectiveOwnerPhysicalIndex, sourceEffectiveOwnerPhysicalIndex: effectiveOwnerPhysicalIndex, materialized: false });
  for (const physicalIndex of materialized) outputOwners.set(physicalIndex, { physicalIndex, sourceEffectiveOwnerPhysicalIndex: paletteByPhysical.get(physicalIndex).effectiveOwnerPhysicalIndex, materialized: true });
  const candidatePaletteTables = [];
  for (const output of outputOwners.values()) {
    const source = paletteByPhysical.get(output.sourceEffectiveOwnerPhysicalIndex); if (!source?.colors) throw new Error(`Exact colors are unavailable for effective palette owner ${output.sourceEffectiveOwnerPhysicalIndex}.`);
    const colors = colorsFor(slotTopology, source.colors); candidatePaletteTables.push({ ...output, sourceColorsHash: source.colorsHash, candidateColorsHash: sha(colors), colors, outputLink: output.materialized ? null : source.link });
  }
  candidatePaletteTables.sort((a, b) => a.physicalIndex - b.physicalIndex); imageRemaps.sort((a, b) => a.dataOwnerPhysicalIndex - b.dataOwnerPhysicalIndex);
  const body = { schema: SCHEMA, version: VERSION, candidateOnly: true, activeSffChanged: false, adoption: false, archive: inventory.archive, inventoryHash: inventory.inventoryHash, metadataRevision: expansion.metadataRevision, metadataHash: expansion.metadataHash, expansionPlanHash: expansion.planHash, topologyPlanHash, topologySourceAuthorityHash: topology.sourceAuthorityHash, topologyMappingHash: mapped.mappingHash, slotTopology, unionUsedIndexes: [...unionUsed].sort((a, b) => a - b), aliasDecisions: aliasDecisionEvidence.sort((a, b) => a.physicalIndex - b.physicalIndex), affectedPalettePhysicalIndexes: [...affectedPhysical].sort((a, b) => a - b), inheritedUnselected, candidatePaletteTables, imageRemaps, summary: { selectedPaletteCount: selected.size, affectedPaletteCount: affectedPhysical.size, outputPaletteTableCount: candidatePaletteTables.length, imageDataRemapCount: imageRemaps.length, materializedAliasCount: materialized.size, inheritedUnselectedCount: inheritedUnselected.length } };
  return { ...body, candidateHash: sha(body) };
}
function verifyCandidate(candidate, input) {
  if (candidate?.schema !== SCHEMA || candidate?.version !== VERSION || candidate?.candidateOnly !== true || candidate?.activeSffChanged !== false || candidate?.adoption !== false) throw new Error('Palette-family topology candidate identity is invalid.');
  const { candidateHash, ...body } = candidate; if (candidateHash !== sha(body)) throw new Error('Palette-family topology candidate hash is invalid.');
  const inventory = family.normalizeInventory(input.inventory), expansion = family.verifyPlanBinding(input.expansionPlan, { inventory, archiveMetadata: input.archiveMetadata, metadataRevision: input.metadataRevision }), topology = migration.assertAuthority(input.topologyPlan, input.topologyAuthority), mapped = migration.mapping(topology);
  if (candidate.archive.byteHash !== inventory.archive.byteHash || candidate.inventoryHash !== inventory.inventoryHash || candidate.metadataRevision !== expansion.metadataRevision || candidate.metadataHash !== expansion.metadataHash || candidate.expansionPlanHash !== expansion.planHash || candidate.topologyPlanHash !== migration.semanticHash(topology) || candidate.topologySourceAuthorityHash !== topology.sourceAuthorityHash || candidate.topologyMappingHash !== mapped.mappingHash) throw new Error('Palette-family topology candidate source bindings changed.');
  const expected = createCandidate(input); if (expected.candidateHash !== candidate.candidateHash || stable(expected) !== stable(candidate)) throw new Error('Palette-family topology candidate failed independent semantic reconstruction.');
  const outputIds = new Set(), dataOwners = new Set();
  for (const output of candidate.candidatePaletteTables) { if (outputIds.has(output.physicalIndex) || !Array.isArray(output.colors) || output.colors.length !== 256 || sha(output.colors) !== output.candidateColorsHash) throw new Error('Palette-family candidate palette output is duplicated or invalid.'); outputIds.add(output.physicalIndex); }
  for (const remap of candidate.imageRemaps) { if (dataOwners.has(remap.dataOwnerPhysicalIndex) || remap.remapCount !== 1 || remap.topologyMappingHash !== candidate.topologyMappingHash) throw new Error('Palette-family candidate image-data remap is duplicated or invalid.'); dataOwners.add(remap.dataOwnerPhysicalIndex); }
  return candidate;
}

module.exports = { SCHEMA, VERSION, createCandidate, verifyCandidate };
