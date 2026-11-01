'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { assertSffV21Png8 } = require('../src/sff_v21_strict_validator');
const family = require('../src/palette_family_planner');
const migration = require('../src/palette_index_migration_model');
const topology = require('../src/palette_family_topology_candidate');
const assignment = require('../src/palette_family_color_assignment');
const writer = require('../src/palette_family_candidate_writer');
const domain = require('../src/palette_domain_model');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const palette = Array.from({ length: 256 }, (_, index) => [index, (index * 2) & 255, 255 - index, index === 0 ? 0 : 255]);
const pixels = Buffer.from([0, 1, 2, 1]);
const png = encodeIndexedPng({ width: 2, height: 2 }, pixels, palette);

function fixture(root) {
  const sffFilename = path.join(root, 'active21.sff');
  const metadataFilename = path.join(root, '.ikemen-tools', 'palette-workspace', 'domains.json');
  const candidatePath = path.join(root, '.ikemen-tools', 'palette-workspace', 'candidate21.sff');
  const sprites = [0, 1].map(index => ({
    entryId: `sprite:${index}`, group: 20, number: index, axisX: index, axisY: -index,
    colorDepth: 8, format: 'png8', compression: 'png8', paletteId: `palette:${index}`,
    duplicatePolicy: index ? 'share-identical' : 'preserve-separate',
    ...(index ? { linkTargetEntryId: 'sprite:0' } : {}), crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 },
    source: { relativePath: `sprite-${index}.png`, byteHash: sha(png), decodedHash: sha(pixels), width: 2, height: 2 }
  }));
  const paletteRows = [
    { entryId: 'palette:0', group: 1, number: 1, colors: palette, tableOrder: 'sff', duplicatePolicy: 'preserve-separate',source:{relativePath:'palette-0.png',byteHash:sha(png),decodedHash:sha(pixels),width:2,height:2} },
    { entryId: 'palette:1', group: 2, number: 1, colors: palette, tableOrder: 'sff', duplicatePolicy: 'share-identical', linkTargetEntryId: 'palette:0',source:{relativePath:'palette-1.png',byteHash:sha(png),decodedHash:sha(pixels),width:2,height:2} }
  ];
  const specification=createSffBuildSpecification({planId:'family-v21-source',sourceRoot:'embedded',target:{archiveIdentity:'active21.sff',archiveFingerprint:null,sffVersion:'2.1'},requirements:['sff-v2.1','preserve-authored-physical-order','immutable-source-snapshots','candidate-before-adoption','sprite-png8','embedded-palettes'],sprites,palettes:paletteRows,decisions:[],options:{shared:{fullRebuild:true},backends:{}}});
  const bytes = createSffV21Png8Bytes(specification, { sources: new Map([['sprite-0.png', png], ['sprite-1.png', png]]) });
  fs.mkdirSync(path.dirname(metadataFilename), { recursive: true });
  fs.writeFileSync(sffFilename, bytes);
  const parsed = assertSffV21Png8(bytes);
  const inventory = family.normalizeInventory({
    schema: family.INVENTORY_SCHEMA, version: 1,
    archive: { filename: sffFilename, byteHash: sha(bytes), byteLength: bytes.length, sffVersion: '2.1' },
    palettes: [
      { physicalIndex: 0, coordinate: { group: 1, number: 1 }, link: null, dataSize: 1024, effectiveOwnerPhysicalIndex: 0, colorsHash: family.sha(palette), colors: palette, usedIndexes: [0, 1, 2], partialAlphaIndexes: [], indexedSpriteCount: 1, truecolorSpriteCount: 0, unavailable: '' },
      { physicalIndex: 1, coordinate: { group: 2, number: 1 }, link: 0, dataSize: 0, effectiveOwnerPhysicalIndex: 0, colorsHash: family.sha(palette), colors: palette, usedIndexes: [0, 1, 2], partialAlphaIndexes: [], indexedSpriteCount: 1, truecolorSpriteCount: 0, unavailable: '' }
    ],
    imageDataOwners: [{ dataOwnerPhysicalIndex: 0, indexPlaneHash: sha(pixels), usedIndexes: [0, 1, 2], members: [{ spritePhysicalIndex: 0, palettePhysicalIndex: 0, effectivePaletteOwnerPhysicalIndex: 0 }, { spritePhysicalIndex: 1, palettePhysicalIndex: 1, effectivePaletteOwnerPhysicalIndex: 0 }] }]
  });
  const group = { id: 'family-v21-map', name: 'V21 costumes', enabled: true, reviewedInventoryHash: inventory.inventoryHash, rangeMappings: ['1,1-1,1 -> 2,1-2,1'] };
  const archiveMetadata = { ...domain.emptyArchive(), remapPalGroups: [group] };
  const metadataDocument = domain.normalizeRegistry({ schema: domain.SCHEMA, version: 2, revision: 2, conventions: { rules: [] }, archives: { 'active21.sff': archiveMetadata } });
  fs.writeFileSync(metadataFilename, `${JSON.stringify(metadataDocument, null, 2)}\n`);
  const expansionPlan = family.planPaletteFamily({ inventory, archiveMetadata, metadataRevision: 2, namedMappingIds: [group.id], scope: 'both' });
  const topologyAuthority = { authorityHash: 'f'.repeat(64), colors: palette };
  const base = migration.createPlan({ operationId: 'family-v21-topology', sourceAuthorityHash: topologyAuthority.authorityHash, colors: palette, usedSourceIndexes: [0, 1, 2], reclaimableSourceIndexes: [250] });
  const topologyPlan = migration.insertColor(base, 250, [9, 8, 7, 255], 'v21 accent');
  const aliasDecisions = { 1: 'materialize-independent' };
  const topologyCandidate = topology.createCandidate({ inventory, expansionPlan, archiveMetadata, metadataRevision: 2, topologyPlan, topologyAuthority, aliasDecisions });
  let state = assignment.createState({ candidate: topologyCandidate, expansionPlan });
  state = assignment.applyBatchScope(state, [90, 80, 70, 200]);
  return { sffFilename, metadataFilename, candidatePath, operationId: 'family-v21-adopt', inventory, archiveMetadata, metadataRevision: 2, metadataDocument, archiveKey: 'active21.sff', expansionPlan, topologyPlan, topologyAuthority, topologyCandidate, aliasDecisions, assignment: state, colorSummary: assignment.summary(state), source: parsed };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-family-v21-'));
try {
  const input = fixture(root), built = writer.buildCandidate(input), report = assertSffV21Png8(fs.readFileSync(input.candidatePath));
  assert(built.verification.verified);
  assert.strictEqual(report.palettes[1].dataSize, 1024, 'explicit materialize decision creates an independent palette table');
  assert.strictEqual(report.sprites[1].dataSize, 0, 'unrelated sprite link intent is preserved');
  assert.strictEqual(report.sprites[0].decodedIndexHash, report.sprites[1].decodedIndexHash, 'shared data owner is remapped exactly once and inherited by its link');
  assert.deepStrictEqual(report.palettes[1].colorsRgba[250], [90, 80, 70, 200]);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Palette-family SFF v2.1 indexed owner remap, alias materialization, link preservation, and exact color verification tests passed');
