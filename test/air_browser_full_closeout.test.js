'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const realParseAir = require('../src/air_preview_model').parseAir;

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: realParseAir, inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { html } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const page = html({
  airPath: path.resolve('/char/main.air'), sourceFingerprint: 'A'.repeat(64),
  actions: [{ number: 0, name: 'Standing', category: 'idle', aliases: [], sourceOrder: 0, line: 1, frames: [{ group: 0, index: 0 }] }],
  spriteExplorer: { available: false, reason: 'The connected SFF is unavailable.', sprites: [], groups: [], omitted: 0 },
  references: { available: false, reason: 'test', items: [], occurrences: [], collisions: { available: false, reason: 'test', items: [] } },
  initialView: 'actions', initialCollisionMode: 'inspect', initialTransform: {}, initialProperty: {},
  initialAssistance: { referenceElementIndex: 0, targetElementIndices: [], groups: { clsn1: { enabled: true, cap: 4 }, clsn2: { enabled: true, cap: 4 } }, locks: { frames: [], boxes: [] }, targetPosition: 0 }
});
const client = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';

for (const token of [
  "windowMode.onclick", "original.onclick", "source.onclick", "closeBrowser.onclick",
  "filter.oninput=render", "sort.onchange", "animateThumbnails.onchange",
  "spriteGroupFilter.oninput", "spriteReviewFilter.onchange", "spriteDialog.addEventListener('close'",
  "alignmentAction.onchange", "alignmentBefore.onchange", "alignmentApplyMove",
  "referenceFilter').oninput=renderReferences", "wireTabKeys(collisionModeTabs",
  "collisionElementInput.onchange", "collisionRecordInput.oninput", "collisionSlotInput.oninput",
  "transformCanvas.onpointerdown", "transformPivotX", "runtimeControllerReviewButton.onclick",
  "propertyFamily.onchange", "propertyDestinationApply.onclick", "queryConditionReviewButton.onclick",
  "assistGenerate').onclick", "assistReviewSelected.onclick", "assistApplyReviewed.onclick"
]) assert(client.includes(token), `missing exact generated-client route contract: ${token}`);

assert(client.includes("panel.id='collisionInspectPanel'"));
assert(client.includes("collisionInspectParts.splice(0,collisionInspectParts.length,panel)"));
assert(client.includes("summary.setAttribute('role','status')"));
assert(client.includes("assistPreview.setAttribute('role','img')"));
assert(client.includes("transformCanvas.title='Pointer: choose a custom pivot. Keyboard: use the exact Pivot X and Pivot Y fields.'"));
assert(client.includes("setActionableDisabled(open,true,'Opening exact source…'"), 'one-use source buttons explain their consumed/opening state');
assert(client.includes("setActionableDisabled(button,true,'Opening exact source…'"), 'character-context source buttons explain their consumed/opening state');
for (const id of ['transformStatus', 'runtimeControllerStatus', 'propertyStatus', 'propertyRuntimeEvidenceStatus', 'propertyDestinationStatus', 'characterCollisionContextStatus', 'queryConditionStatus', 'assistProtectStatus']) {
  assert(client.includes(`'${id}'`), `${id} participates in the centralized live-status contract`);
}
assert(page.includes('@media(max-width:520px){.property-controls.assistance-setup{grid-template-columns:1fr}'));
assert(page.includes('@media(max-width:760px){.collision-layers,.transform-stage{grid-template-columns:1fr}'));

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'IKEMaker-Control-Route-Inventory.json'), 'utf8'));
const air = inventory.bySurface.find(item => item.surface === 'air.browser');
assert(air, 'AIR Browser surface is present in the generated route inventory');
assert.strictEqual(air.pending, 0, 'every currently discovered AIR Browser candidate is classified');
assert(air.audited >= 250, 'the complete current AIR Browser candidate set is retained');
for (const row of inventory.controls.filter(item => item.surface === 'air.browser')) {
  assert.strictEqual(row.status, 'audited', `${row.control} remains unclassified`);
  assert(row.destination && row.evidence && row.visibleReason, `${row.control} has truthful destination, evidence, and state guidance`);
}

console.log(`AIR Browser full closeout covers ${air.audited} current candidates with zero pending route rows`);
