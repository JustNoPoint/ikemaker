'use strict';

const assert = require('assert');
const { collectSffTransferDecisions } = require('../src/sff_transfer_decision_ui');

(async () => {
  const picks = ['Append at end of physical table', 'Replace existing sprite', 'Keep Destination axis', 'Copy rendered pixels (flatten link)', 'Import Source palette under a new identity'], inputs = ['2,7'];
  const vscode = { window: { showQuickPick: async items => { const wanted = picks.shift(), found = items.find(item => item.label === wanted); if (!found) throw new Error(`Missing ${wanted}: ${items.map(item => item.label).join(' | ')}`); return found; }, showInputBox: async () => inputs.shift() } }, destination = { sprites: [{ index: 0, group: 9, number: 9 }], palettes: [{ index: 0, group: 1, number: 1 }] }, analysis = { placementRequired: true, items: [{ id: '0,0@0', identity: '0,0', collision: { decisionRequired: true, destinationPhysicalIndices: [0] }, link: { decisionRequired: true, choices: ['flatten-copy', 'skip'], targetIdentity: '0,1', targetPhysicalIndex: 1 }, palette: { decisionRequired: true, choices: ['map-existing-palette', 'import-source-palette', 'convert-truecolor', 'skip'], sourcePaletteIdentity: '1,2', compatibleDestinations: [] } }] };
  const result = await collectSffTransferDecisions(vscode, analysis, destination);
  assert.deepStrictEqual(result.placement, { kind: 'append-end' }); assert.deepStrictEqual(result.items[0].identity, { action: 'replace-existing' }); assert.equal(result.items[0].axis.action, 'preserve-destination'); assert.equal(result.items[0].link.action, 'flatten-copy'); assert.deepStrictEqual(result.items[0].palette, { action: 'import-source-palette', destinationPaletteGroup: 2, destinationPaletteIndex: 7 });
  const cancelled = await collectSffTransferDecisions({ window: { showQuickPick: async () => undefined } }, { placementRequired: true, items: [] }, destination); assert.equal(cancelled, null);
  console.log('SFF Transfer conflict decision prompts preserve explicit user choice and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
