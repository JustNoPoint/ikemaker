'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [{ number: 200, line: 1, frames: [{ group: 0, index: 0 }] }], inferCharacterFiles: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildModel, html } = require('../src/air_docking_workspace');
Module._load = originalLoad;

function clientFunction(source, name) {
  const start = source.indexOf(`function ${name}(`); assert(start >= 0, `missing ${name}`); const open = source.indexOf('{', start); let depth = 0;
  for (let index = open; index < source.length; index += 1) { if (source[index] === '{') depth += 1; else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1); }
  throw new Error(`unterminated ${name}`);
}
const model = buildModel('/char/main.air', '[Begin Action 200]\n0,0,0,0,1', '', { available: false, items: [], occurrences: [], collisions: { available: false, items: [] } }, { action: 200, view: 'collisions', collisionMode: 'transform', ownerDef: '/char/main.def' }), page = html(model), script = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
assert.doesNotThrow(() => new vm.Script(script), 'runtime-controller browser additions remain valid generated JavaScript');
for (const id of ['runtimeControllerReview', 'runtimeControllerPrevious', 'runtimeControllerSlider', 'runtimeControllerNext', 'runtimeController', 'runtimeControllerGroup', 'runtimeControllerIndex', 'runtimeControllerDiff', 'runtimeControllerReviewButton', 'runtimeControllerApply']) assert(page.includes(`id="${id}"`), `${id} is present in the existing Transform surface`);
assert(page.includes("runtimeControllerReview.classList.toggle('hidden',response&&!available)"), 'Stable/unknown results hide the Nightly-only editor');
assert(page.includes("Number(message.request)!==runtimeControllerRequest||collisionMode!=='transform'"), 'late or off-mode runtime-controller results are ignored');
assert(page.includes('runtimeControllerPrevious.onclick') && page.includes('runtimeControllerSlider.oninput') && page.includes('runtimeControllerNext.onclick'), 'controller arrows and slider share one bounded selection path');
const renderSource = clientFunction(script, 'renderRuntimeControllerReview'); assert(!renderSource.includes('.innerHTML'), 'host-provided labels and diffs never use innerHTML'); assert(renderSource.includes('runtimeControllerDiff.textContent='), 'bounded source diff uses textContent');

const sent = [], context = { primaryView: 'collisions', collisionMode: 'transform', selected: { number: 200 }, collisionElement: 0, collisionGroup: 'clsn1', collisionSlot: 2, runtimeControllerRequest: 4, runtimeController: { value: 'A'.repeat(64) }, runtimeControllerStatus: { textContent: '' }, runtimeControllerDiff: { textContent: 'old' }, clearRuntimeControllerApply() { context.cleared = true; }, runtimeDraft: () => ({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 1, 1] }), vscode: { postMessage: message => sent.push(message) } };
vm.createContext(context); vm.runInContext(clientFunction(script, 'requestRuntimeController'), context); context.requestRuntimeController(true);
assert.strictEqual(context.cleared, true); assert.strictEqual(context.runtimeControllerDiff.textContent, ''); assert.strictEqual(sent.length, 1); assert.deepStrictEqual(JSON.parse(JSON.stringify(sent[0])), { type: 'reviewRuntimeController', request: 5, reviewKind: 'runtime-controller-replace', candidateId: 'A'.repeat(64), action: 200, elementIndex: 0, groupKey: 'clsn1', index: 2, draft: { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 1, 1] } });
const invalidationSent = [], invalidation = { runtimeControllerRequest: 8, runtimeControllerResponse: { plan: { status: 'ready' }, applyAuthority: { token: 'b'.repeat(48) }, candidates: [] }, runtimeControllerDiff: { textContent: 'reviewed diff' }, clearRuntimeControllerApply() { invalidation.cleared = true; }, vscode: { postMessage: message => invalidationSent.push(message) } };
vm.createContext(invalidation); vm.runInContext(clientFunction(script, 'invalidateRuntimeControllerChoice'), invalidation); invalidation.invalidateRuntimeControllerChoice();
assert.strictEqual(invalidation.runtimeControllerRequest, 9, 'client invalidation advances the correlation request'); assert.strictEqual(invalidation.runtimeControllerResponse.plan, null); assert.strictEqual(invalidation.runtimeControllerResponse.applyAuthority, null); assert.strictEqual(invalidation.runtimeControllerDiff.textContent, ''); assert.strictEqual(invalidation.cleared, true); assert.deepStrictEqual(JSON.parse(JSON.stringify(invalidationSent)), [{ type: 'invalidateRuntimeControllerReview' }]);
assert(script.includes("runtimeControllerReview.ontoggle=()=>{if(runtimeControllerReview.open)requestRuntimeController(false);else invalidateRuntimeControllerChoice()}"), 'closing the source-controller details revokes authority synchronously');
assert(script.includes("for(const input of [runtimeControllerGroup,runtimeControllerIndex,...runtimeRectInputs])input.onchange=()=>{invalidateRuntimeControllerChoice();refreshRuntimeControllerGeometry()}"), 'every Override field revokes authority and refreshes matching geometry synchronously');
assert(script.includes('function changedTransform(){invalidateRuntimeControllerChoice();'), 'shared Transform fields revoke authority before rebuilding preview');
assert(script.includes("function choosePivot(event){if(!transformViewport||collisionMode!=='transform'||runtimeCandidate()?.kind==='OverrideClsn')return;invalidateRuntimeControllerChoice();"), 'pivot dragging is suppressed for Override and otherwise revokes authority before coordinate conversion');
const geometry = { runtimeControllerRequest: 0, runtimeControllerResponse: { candidates: [{ id: 'A', kind: 'TransformClsn' }, { id: 'B', kind: 'TransformClsn' }, { id: 'O', kind: 'OverrideClsn' }] }, runtimeController: { value: '', dataset: {} }, transformProjection: { stale: true }, transformScaleSource: { stale: true }, transformViewport: { stale: true }, invalidateRuntimeControllerChoice() { geometry.invalidations = (geometry.invalidations || 0) + 1; }, renderRuntimeControllerReview() {}, requestTransform() { geometry.transformRequests = (geometry.transformRequests || 0) + 1; }, renderTransform() { geometry.overrideRenders = (geometry.overrideRenders || 0) + 1; } };
vm.createContext(geometry); for (const name of ['runtimeCandidate', 'refreshRuntimeControllerGeometry', 'setRuntimeControllerPosition']) vm.runInContext(clientFunction(script, name), geometry);
geometry.setRuntimeControllerPosition(1); geometry.setRuntimeControllerPosition(2); geometry.setRuntimeControllerPosition(3);
assert.strictEqual(geometry.transformRequests, 2, 'Transform controller A→B rebuilds the known-input C9 preview for each selection'); assert.strictEqual(geometry.overrideRenders, 1, 'Override selection clears Transform geometry and redraws the Override overlay'); assert.strictEqual(geometry.invalidations, 3); assert.strictEqual(geometry.transformProjection, null); assert.strictEqual(geometry.runtimeController.value, 'O');
const override = { runtimeControllerResponse: { candidates: [{ id: 'O', kind: 'OverrideClsn' }] }, runtimeController: { value: 'O' }, runtimeControllerGroup: { value: '2' }, runtimeControllerIndex: { value: '3' }, runtimeRectInputs: ['10', '-5', '-2', '8'].map(value => ({ value })) };
vm.createContext(override); vm.runInContext(clientFunction(script, 'runtimeCandidate'), override); vm.runInContext(clientFunction(script, 'runtimeOverrideGeometry'), override);
assert.deepStrictEqual(JSON.parse(JSON.stringify(override.runtimeOverrideGeometry())), { status: 'ready', group: 2, index: 3, rect: [-2, -5, 10, 8] }, 'Override select/edit preview normalizes its own finite replacement rect');
assert(script.includes('Known-input OverrideClsn source draft · AIR axis · not live runtime.'), 'Override canvas labels source-draft geometry honestly');
const surfaceControls = [{ disabled: true }, { disabled: true }], surface = { runtimeControllerResponse: { candidates: [{ id: 'T', kind: 'TransformClsn' }, { id: 'O', kind: 'OverrideClsn' }] }, runtimeController: { value: '' }, transformInputControls: { classList: { toggle(name, value) { assert.strictEqual(name, 'hidden'); surface.hidden = value; } }, querySelectorAll() { return surfaceControls; } } };
vm.createContext(surface); vm.runInContext(clientFunction(script, 'runtimeCandidate'), surface); vm.runInContext(clientFunction(script, 'syncRuntimeControllerSurface'), surface);
surface.syncRuntimeControllerSurface(); assert.strictEqual(surface.hidden, false); assert(surfaceControls.every(control => control.disabled === false), 'no candidate restores ordinary C9 controls');
surface.runtimeController.value = 'T'; surface.syncRuntimeControllerSurface(); assert.strictEqual(surface.hidden, false); assert(surfaceControls.every(control => control.disabled === false), 'Transform selection keeps Transform controls usable');
surface.runtimeController.value = 'O'; surface.syncRuntimeControllerSurface(); assert.strictEqual(surface.hidden, true); assert(surfaceControls.every(control => control.disabled === true), 'Override selection hides and disables irrelevant Transform controls');
surface.runtimeController.value = 'T'; surface.syncRuntimeControllerSurface(); assert.strictEqual(surface.hidden, false); assert(surfaceControls.every(control => control.disabled === false), 'returning to Transform restores controls');
console.log('AIR runtime-controller browser stays compact, slider-driven, target-hidden, stale-safe, and textContent-only');
