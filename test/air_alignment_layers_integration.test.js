'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: () => [{ number: 0, line: 1, frames: [{ group: 0, index: 0 }, { group: 0, index: 1 }] }],
    inferCharacterFiles: () => ({}),
    showAirAlignmentLayers: async () => ({ stale: false, drawn: 1, missing: 0 }),
    applyAirAlignmentMove: async () => ({ status: 'applied', message: 'Moved.' })
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildModel, html } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const source = fs.readFileSync(path.join(__dirname, '../src/air_docking_workspace.js'), 'utf8');
const model = buildModel(path.resolve('/char/main.air'), '[Begin Action 0]\n0,0,0,0,1\n0,1,0,0,1', '', null, { action: 0, elementIndex: 1, view: 'layers' });
assert.strictEqual(model.initialView, 'layers');
const page = html(model);
const client = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';
assert.doesNotThrow(() => new vm.Script(client, { filename: 'air-alignment-browser-client.js' }));
assert(page.includes('data-primary="layers"') && page.includes('id="alignmentLayers"'), 'Alignment Layers reuses the one AIR companion browser.');
assert(page.includes('Show and Move are independent') && page.includes('reviewed, undoable AIR edit'), 'The browser distinguishes preview selection from the reviewed write concisely.');
assert(page.includes("type:'alignmentLayers'") && page.includes('sourceFingerprint:model.sourceFingerprint'), 'Every projection request remains bound to the exact AIR source.');
assert(page.includes('alignmentRefs.length>=32') && page.includes('slice(0,64)'), 'The client mirrors the bounded model limits.');
assert(page.includes('Select visible') && page.includes('Base only') && page.includes('Remove added layers'), 'Repeated layer-selection work has compact bulk actions.');
assert(source.includes("messageType === 'alignmentLayers'") && source.includes('createAirAlignmentLayers({'), 'The host rebuilds the pure exact-element projection instead of trusting webview geometry.');
assert(source.includes('showAirAlignmentLayers(data.airPath, projection, () => record.latestAlignmentRequest === request)'), 'The accepted projection is forwarded to the existing AIR viewer with a current-request guard.');
assert(source.includes("messageType === 'alignmentMove'") && source.includes('applyAirAlignmentMove(data.airPath, move)'), 'Moves are delegated to the sole AIR viewer mutation owner.');
assert(source.includes('refreshRecord(record, { alignmentContinuation: result.continuation })'), 'A successful move bootstraps the refreshed browser with the host-owned re-keyed composition.');
assert(source.includes("messageType === 'browserState' && message.primaryView === 'layers'"), 'The internal browser view survives host state publication.');
assert(client.includes("['references','collisions','sprites','layers','actions'].includes(message.primaryView)"), 'A reused browser accepts the explicit Alignment Layers destination.');
assert(client.includes("model.initialView==='layers'?'layers'"), 'An explicit new/restored Alignment Layers request wins over stale saved browser mode.');
assert(client.includes("alignmentStatus.dataset.error='true'") && client.includes("if(!alignmentStatus.dataset.error)alignmentStatus.textContent"), 'Validation errors remain visible in the aria-live status instead of being replaced by the empty state.');
assert(client.includes('sprites unavailable') && page.includes('source/default palette'), 'The browser reports omitted sprite layers and palette provenance.');
assert(page.includes('id="alignmentNudgeLeft"') && client.includes("event.key==='ArrowLeft'") && client.includes('event.shiftKey?10:1'), 'Buttons and focus-scoped arrow keys provide one-unit and Shift-ten-unit reviewed nudges without duplicating a second editor.');
assert(client.includes('function updateAlignmentAvailability()') && client.includes("for(const id of ['alignmentApplyMove','alignmentNudgeLeft','alignmentNudgeUp','alignmentNudgeDown','alignmentNudgeRight'])") && client.includes('Select at least one visible layer to move.'), 'Move and nudge controls stay disabled with an actionable reason when no exact visible layer is selected.');
assert(client.includes('alignmentBootstrap') && !client.includes('alignmentStates=[];alignmentPrimaryKey=null;requestAlignment()'), 'The refreshed browser restores the bounded host continuation instead of clearing the working composition or issuing a stale request.');

const continued = buildModel(path.resolve('/char/main.air'), '[Begin Action 0]\n0,0,0,0,1\n0,1,0,0,1', '', null, { action: 0, elementIndex: 1, view: 'layers', alignmentContinuation: { sourceFingerprint: model.sourceFingerprint, alignment: [{ action: 0, actionOccurrence: 0, elementIndex: 0 }], onion: { before: 1, after: 0 }, states: [{ key: 'A'.repeat(64), visible: true, selected: false }], primaryKey: 'A'.repeat(64) } });
assert.deepStrictEqual(continued.initialAlignment.onion, { before: 1, after: 0 });
assert.strictEqual(continued.initialAlignment.alignment.length, 1);
assert.strictEqual(continued.initialAlignment.states[0].selected, false);

const viewer = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8');
assert(viewer.includes("type:'openAlignmentLayers'") && viewer.includes("view: 'layers'"), 'The AIR viewer has one direct route to the internal Alignment Layers tab.');
assert(viewer.includes('async function showAirAlignmentLayers') && viewer.includes("type: 'alignmentLayersPreview'"), 'Preview composition reuses the existing AIR viewer session.');
assert(viewer.includes("layer.kind !== 'base' && layer.visible === true"), 'The base remains the authoritative current element and hidden overlays stay out of the preview.');
assert(viewer.includes('Offset Whole Actions') && !viewer.includes('<h2>Alignment Tool</h2>'), 'The older bulk command is clearly distinguished from element alignment.');

Module._load = function patchedViewer(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { viewerHtml } = require('../src/air_viewer');
Module._load = originalLoad;
const viewerPage = viewerHtml({ title: 'main.air', airPath: path.resolve('/char/main.air'), sffPath: '', palettes: [], actions: [{ number: 0, line: 1, frames: [{ group: 0, index: 0, x: 0, y: 0, time: 1, flags: '', line: 2, clsn1: [], clsn2: [] }] }] });
assert(viewerPage.includes('id="collisionContextAlignmentLayers"') && viewerPage.includes('Add / remove alignment layers…'), 'The existing AIR canvas context menu exposes the same browser-owned layer workflow even when no collision box is selected.');
const viewerClient = viewerPage.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';
function clientFunction(sourceText, name) { const start = sourceText.indexOf(`function ${name}(`); assert(start >= 0, `missing ${name}`); const open = sourceText.indexOf('{', start); let depth = 0; for (let index = open; index < sourceText.length; index += 1) { if (sourceText[index] === '{') depth += 1; else if (sourceText[index] === '}' && --depth === 0) return sourceText.slice(start, index + 1); } throw new Error(`unterminated ${name}`); }
const imageInstances = [];
class DeferredImage { constructor() { imageInstances.push(this); } decode() { return Promise.resolve(); } set src(value) { this.value = value; } }
const race = { alignmentCompositionHash: '', alignmentImages: new Map(), imageCache: new Map(), drawCount: 0, Image: DeferredImage, Map, Array, String };
race.draw = () => { race.drawCount += 1; };
vm.createContext(race); vm.runInContext(clientFunction(viewerClient, 'acceptAlignmentImages'), race);
(async () => {
  race.acceptAlignmentImages({ compositionHash: 'A', items: [{ slot: 'a', cacheKey: 'a', dataUri: 'a' }] });
  race.acceptAlignmentImages({ compositionHash: 'B', items: [{ slot: 'b', cacheKey: 'b', dataUri: 'b' }] });
  await imageInstances[1].onload();
  await imageInstances[0].onload();
  assert.deepStrictEqual([...race.alignmentImages.keys()], ['b'], 'a late decode from composition A cannot replace newer composition B');
  assert.strictEqual(race.drawCount, 1, 'only the current composition publishes a decoded image set');
  console.log('AIR Alignment Layers browser/viewer integration is single-surface, bounded, source-bound, and race-safe');
})().catch(error => { console.error(error); process.exitCode = 1; });
