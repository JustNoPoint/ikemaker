'use strict';

const assert = require('assert');
const { planSffTransferResolution } = require('../src/sff_transfer_resolution_model');

const collision = (status, destinationPhysicalIndices = []) => ({ status, destinationPhysicalIndices, decisionRequired: status === 'occupied', choices: status === 'occupied' ? ['add-next-free', 'replace-existing', 'skip', 'manual-identity'] : ['preserve-identity', 'manual-identity'] });
const direct = { status: 'direct', targetPhysicalIndex: null, decisionRequired: false, choices: [] }, linked = { status: 'target-not-selected', targetPhysicalIndex: 0, decisionRequired: true, choices: ['flatten-copy', 'skip'] };
const compatible = { status: 'compatible', sourcePaletteIndex: 0, decisionRequired: false, choices: ['reuse-compatible'], compatibleDestinations: [{ physicalIndex: 0 }] }, unmatched = { status: 'unmatched', sourcePaletteIndex: 1, decisionRequired: true, choices: ['map-existing-palette', 'import-source-palette', 'convert-truecolor', 'skip'], compatibleDestinations: [] };
const analysis = { schema: 'ikemaker.sff-transfer-conflict-analysis', version: 1, requestIdentity: 'A'.repeat(64), referenceIdentity: 'B'.repeat(64), placementRequired: true, placement: null, items: [
  { id: '0,0@0', physicalIndex: 0, identity: '0,0', collision: collision('occupied', [0, 2]), link: direct, palette: compatible },
  { id: '0,1@1', physicalIndex: 1, identity: '0,1', collision: collision('clear'), link: linked, palette: unmatched }
] };
const destination = { sprites: [{ index: 0, group: 0, number: 0 }, { index: 1, group: 9, number: 9 }, { index: 2, group: 0, number: 0 }], palettes: [{ index: 0, group: 0, number: 1 }, { index: 1, group: 0, number: 2 }] };
const partial = planSffTransferResolution({ analysis, destinationArchive: destination });
assert.equal(partial.readyForApply, false); assert.deepStrictEqual(partial.unresolved.map(item => item.gate), ['placement', 'identity', 'link', 'palette']);
const ready = planSffTransferResolution({ analysis, destinationArchive: destination, decisions: { placement: { kind: 'append-end' }, items: [
  { id: '0,0@0', identity: { action: 'replace-existing', destinationPhysicalIndex: 2 } },
  { id: '0,1@1', link: { action: 'flatten-copy' }, palette: { action: 'map-existing-palette', destinationPaletteIndex: 1 } }
] } });
assert.equal(ready.readyForApply, true); assert.equal(ready.placement.insertionPhysicalIndex, 3); assert.equal(ready.items[0].destinationPhysicalIndex, 2); assert.equal(ready.items[1].paletteAction, 'map-existing-palette'); assert.equal(ready.items[1].destinationPaletteIndex, 1); assert(Object.isFrozen(ready.items[0]));
assert.throws(() => planSffTransferResolution({ analysis, destinationArchive: destination, decisions: { placement: { kind: 'append-end' }, items: [{ id: '0,0@0', identity: { action: 'replace-existing' } }] } }), /exact Destination physical occurrence/);
assert.throws(() => planSffTransferResolution({ analysis, destinationArchive: destination, decisions: { items: [{ id: 'stale@9' }] } }), /stale item/);
const nextFree = planSffTransferResolution({ analysis: { ...analysis, placementRequired: false, placement: { insertionPhysicalIndex: 1 }, items: [{ ...analysis.items[0], collision: collision('occupied', [0]) }] }, destinationArchive: destination, decisions: { items: [{ id: '0,0@0', identity: { action: 'add-next-free', startIndex: 0 } }] } });
assert.equal(nextFree.items[0].destinationIdentity, '0,1');
const imported = planSffTransferResolution({ analysis: { ...analysis, placementRequired: false, placement: { insertionPhysicalIndex: 1 }, items: [{ ...analysis.items[1], collision: collision('clear'), link: direct }] }, destinationArchive: destination, decisions: { items: [{ id: '0,1@1', palette: { action: 'import-source-palette', destinationPaletteGroup: 2, destinationPaletteIndex: 3 } }] } });
assert.deepStrictEqual(imported.items[0].destinationPaletteIndex, { group: 2, number: 3 });
assert.throws(() => planSffTransferResolution({ analysis: { ...analysis, placementRequired: false, placement: { insertionPhysicalIndex: 1 }, items: [{ ...analysis.items[1], collision: collision('clear'), link: direct }] }, destinationArchive: destination, decisions: { items: [{ id: '0,1@1', palette: { action: 'import-source-palette', destinationPaletteGroup: 0, destinationPaletteIndex: 1 } }] } }), /already occupied/);
console.log('SFF Transfer partial and ready identity/link/palette/placement resolution plans passed');
