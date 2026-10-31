'use strict';

const assert = require('assert');
const { airTransferSelectionItems, analyzeAirTransfer } = require('../src/air_transfer_model');
const { resolveAirTransfer } = require('../src/air_transfer_resolution');
const { validateAirTransferApply, applyAirTransferPlan } = require('../src/air_transfer_apply');

const source = '[Begin Action 1]\n0,0,0,0,1\n', destination = '[Begin Action 2]\n1,1,0,0,1\n';
const review = analyzeAirTransfer({ sourceText: source, destinationText: destination, selection: airTransferSelectionItems(source, [0]) });
const plan = resolveAirTransfer({ review, sourceText: source, destinationText: destination, decisions: [{ id: review.items[0].id, identity: 'preserve-action', copyDependency: 'preserve' }] });
assert.equal(validateAirTransferApply({ plan, sourceText: source, destinationText: destination }).oneUndoStep, true);
assert.throws(() => validateAirTransferApply({ plan, sourceText: source + '; stale', destinationText: destination }), /source changed/);
let applied = 0, saved = 0, replacement = null;
class WorkspaceEdit { replace(uri, range, text) { replacement = { uri, range, text }; } }
class Range { constructor(...values) { this.values = values; } }
const vscode = { WorkspaceEdit, Range, workspace: { applyEdit: async () => { applied += 1; return true; }, saveAll: async () => { saved += 1; } } };
const document = { uri: { fsPath: 'destination.air' }, lineCount: 2, lineAt: index => ({ text: index ? '' : '[Begin Action 2]' }), getText: () => destination };
(async () => {
  const result = await applyAirTransferPlan(vscode, { plan, sourceText: source, document });
  assert.equal(result.status, 'applied-in-editor'); assert.equal(result.autosaved, false); assert.equal(result.undoSteps, 1); assert.equal(applied, 1); assert.equal(saved, 0); assert.equal(replacement.text, plan.outputText);
  await assert.rejects(() => applyAirTransferPlan(vscode, { plan, sourceText: source, document: { ...document, getText: () => destination + '; changed' } }), /destination changed/); assert.equal(applied, 1);
  console.log('AIR Transfer final revalidation, one undoable WorkspaceEdit and no autosave passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
