'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { editorHtml, palFxControlAvailability } = require('../src/palfx_editor');
Module._load = originalLoad;

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing generated client function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let at = brace; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    else if (source[at] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, at + 1);
    }
  }
  throw new Error(`unterminated generated client function ${name}`);
}

const empty = palFxControlAvailability({ basicKind: 'builtIn', hasFxProfile: false, layerIndex: 0, layerCount: 1, hasPreview: false, draftDirty: false, draftPending: false });
assert.strictEqual(empty.update.disabled, true);
assert.match(empty.update.reason, /workspace preset/i);
assert.strictEqual(empty.remove.disabled, true);
assert.match(empty.remove.reason, /Built-in presets cannot be deleted/i);
assert.strictEqual(empty.updateFx.disabled, true);
assert.strictEqual(empty.deleteFx.disabled, true);
assert.strictEqual(empty.removeLayer.disabled, true);
assert.match(empty.removeLayer.reason, /base layer is required/i);
assert.strictEqual(empty.resetView.disabled, true);
assert.match(empty.resetView.reason, /preview image/i);
assert.strictEqual(empty.resetLayer.disabled, true);
assert.match(empty.resetLayer.reason, /default PalFX values/i);
assert.strictEqual(empty.discardDraft.disabled, true);
assert.match(empty.discardDraft.reason, /no recovered or unsaved/i);

const editable = palFxControlAvailability({ basicKind: 'custom', hasFxProfile: true, layerIndex: 1, layerCount: 2, hasEnabledLayer: true, layerFxChanged: true, hasPreview: true, draftDirty: true, draftPending: false });
for (const id of ['update', 'remove', 'updateFx', 'deleteFx', 'cloneLayer', 'removeLayer', 'resetLayer', 'copyComposer', 'insertComposer', 'resetView', 'discardDraft']) assert.strictEqual(editable[id].disabled, false, `${id} should be available in an editable saved profile`);
const allLayersDisabled = palFxControlAvailability({ hasEnabledLayer: false, layerFxChanged: true });
assert.strictEqual(allLayersDisabled.copyComposer.disabled, true);
assert.match(allLayersDisabled.copyComposer.reason, /Enable at least one FX layer/i);
assert.strictEqual(allLayersDisabled.insertComposer.disabled, true);
const maximumPending = palFxControlAvailability({ basicKind: 'custom', hasFxProfile: true, layerIndex: 4, layerCount: 5, hasPreview: true, draftDirty: true, draftPending: true });
assert.strictEqual(maximumPending.cloneLayer.disabled, true);
assert.match(maximumPending.cloneLayer.reason, /maximum/i);
assert.strictEqual(maximumPending.discardDraft.disabled, true);
assert.match(maximumPending.discardDraft.reason, /finish being kept/i);

const html = editorHtml({}, {});
const client = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
assert(html.includes('role="tablist" aria-label="PalFX editor sections"'));
assert(html.includes('role="tabpanel" aria-labelledby="palfxTabBasic"'));
assert(html.includes('role="status" aria-live="polite"'));
assert(html.includes('id="layers" role="listbox" aria-label="True-color FX layers"'));
assert(html.includes('id="fxCanvas" width="720" height="480" tabindex="0" aria-label="True-color FX preview canvas"'));
assert(html.includes('id="previewImage" type="file"') && html.includes('aria-label="Choose preview image"'));
assert(html.includes('id="previewStatus" class="muted" role="status" aria-live="polite"'));
assert(html.includes('id="playPreview" aria-pressed="false"'));
assert(html.includes('@media(max-width:720px)'));
assert(client.includes("setAttribute('aria-description',state.reason)"));
assert(client.includes("const restore=layers.contains(document.activeElement)"));
assert(client.includes("if(restore)layers.querySelector('[data-layer-index=\"'+layerIndex+'\"]')?.focus()"));
assert(client.includes("playPreview.setAttribute('aria-pressed',String(playing))"));
assert(client.includes("reader.onerror=()=>"));
assert(client.includes("image.onerror=()=>"));
assert(!client.includes("for(const tab of palFxTabs)tab.addEventListener('click',stageDraft)"), 'navigation-only tab changes must not create an edit draft');

const hueContext = { Math };
vm.createContext(hueContext);
vm.runInContext(functionSource(client, 'hueRotation') + functionSource(client, 'hueRotate'), hueContext);
assert.deepStrictEqual(Array.from(hueContext.hueRotate([25, 100, 220], 0)).map(Math.round), [25, 100, 220]);
assert.notDeepStrictEqual(Array.from(hueContext.hueRotate([25, 100, 220], 64)).map(Math.round), [25, 100, 220]);
const transformedSource = functionSource(client, 'transformed');
for (const supportedPreviewControl of ['p.sinMul', 'p.sinColor', 'p.sinHue', 'p.hue']) assert(transformedSource.includes(supportedPreviewControl), `${supportedPreviewControl} should affect the approximate preview`);

function transformPixel(palfx, { pixel = [50, 100, 150, 77], playing = true, tick = 0 } = {}) {
  let captured = null;
  const context2d = {
    drawImage() {},
    getImageData() { return { data: Uint8ClampedArray.from(pixel) }; },
    putImageData(image) { captured = Array.from(image.data); }
  };
  const context = {
    Math, Array, Number, Uint8ClampedArray, playing, tick,
    canvas: { width: 1, height: 1 },
    sourceImage() { return {}; },
    document: { createElement() { return { width: 0, height: 0, getContext() { return context2d; } }; } }
  };
  vm.createContext(context);
  vm.runInContext(functionSource(client, 'hueRotation') + functionSource(client, 'hueRotate') + transformedSource, context);
  context.transformed({ palfx });
  assert(captured, 'emitted transformed() should publish one preview pixel');
  return captured;
}

const identityFx = {
  add: [0, 0, 0], mul: [256, 256, 256], sinAdd: [0, 0, 0, 1], sinMul: [0, 0, 0, 1],
  sinColor: [0, 1], sinHue: [0, 1], color: 256, hue: 0, invertAll: 0
};
const baselinePixel = transformPixel(identityFx);
assert.deepStrictEqual(baselinePixel, [50, 100, 150, 77], 'identity PalFX must preserve RGB and alpha');

const sinMulFx = { ...identityFx, sinMul: [128, 0, 0, 4] };
assert.deepStrictEqual(transformPixel(sinMulFx, { tick: 1 }), [75, 100, 150, 77], 'SinMul reaches its positive quarter-period amplitude');
assert.deepStrictEqual(transformPixel(sinMulFx, { tick: 2 }), baselinePixel, 'SinMul returns to its midpoint at a half-period');
assert.deepStrictEqual(transformPixel(sinMulFx, { tick: 4 }), baselinePixel, 'SinMul completes one period without an off-by-one frame');

const sinColorFx = { ...identityFx, sinColor: [256, 4] };
const saturatedPixel = transformPixel(sinColorFx, { tick: 1 });
assert.notDeepStrictEqual(saturatedPixel.slice(0, 3), baselinePixel.slice(0, 3), 'SinColor changes saturation at its positive quarter-period');
assert.strictEqual(saturatedPixel[3], 77, 'SinColor must preserve alpha');
assert.deepStrictEqual(transformPixel(sinColorFx, { tick: 4 }), baselinePixel, 'SinColor returns to baseline at its period boundary');

const hueFx = { ...identityFx, hue: 64 };
const rotatedPixel = transformPixel(hueFx, { playing: false, tick: 0 });
assert.notDeepStrictEqual(rotatedPixel.slice(0, 3), baselinePixel.slice(0, 3), 'static Hue changes the emitted preview pixel');
assert.strictEqual(rotatedPixel[3], 77, 'Hue must preserve alpha');

const sinHueFx = { ...identityFx, sinHue: [64, 4] };
assert.deepStrictEqual(transformPixel(sinHueFx, { tick: 1 }), rotatedPixel, 'SinHue quarter-period matches the equivalent static hue rotation');
assert.deepStrictEqual(transformPixel(sinHueFx, { tick: 4 }), baselinePixel, 'SinHue returns to baseline at its period boundary');
assert.deepStrictEqual(transformPixel(sinHueFx, { playing: false, tick: 1 }), baselinePixel, 'paused sinusoidal preview remains at phase zero');

function classList() {
  const values = new Set();
  return { toggle(name, on) { if (on) values.add(name); else values.delete(name); }, has(name) { return values.has(name); } };
}
function tab(page) {
  return { dataset: { page }, classList: classList(), attributes: {}, tabIndex: -1, focused: 0, setAttribute(name, value) { this.attributes[name] = String(value); }, focus() { this.focused += 1; } };
}
const basicTab = tab('basic'), composerTab = tab('composer'), pages = { basic: { classList: classList() }, composer: { classList: classList() } };
const tabContext = { palFxTabs: [basicTab, composerTab], document: { getElementById(id) { return pages[id]; } } };
vm.createContext(tabContext);
vm.runInContext(functionSource(client, 'activatePalFxPage') + functionSource(client, 'handlePalFxTabKey'), tabContext);
tabContext.activatePalFxPage(basicTab);
assert.strictEqual(basicTab.attributes['aria-selected'], 'true');
assert.strictEqual(composerTab.attributes['aria-selected'], 'false');
assert.strictEqual(basicTab.tabIndex, 0);
let prevented = 0;
assert.strictEqual(tabContext.handlePalFxTabKey({ key: 'ArrowRight', preventDefault() { prevented += 1; } }, basicTab), true);
assert.strictEqual(composerTab.attributes['aria-selected'], 'true');
assert.strictEqual(composerTab.tabIndex, 0);
assert.strictEqual(composerTab.focused, 1);
assert.strictEqual(prevented, 1);
assert.strictEqual(tabContext.handlePalFxTabKey({ key: 'Home', preventDefault() { prevented += 1; } }, composerTab), true);
assert.strictEqual(basicTab.attributes['aria-selected'], 'true');
assert.strictEqual(tabContext.handlePalFxTabKey({ key: 'x', preventDefault() {} }, basicTab), false);

const selectedLayers = [];
const layerContext = { profile: { layers: [{}, {}, {}] }, selectFxLayer(index, focus) { selectedLayers.push([index, focus]); } };
vm.createContext(layerContext);
vm.runInContext(functionSource(client, 'handleFxLayerKey'), layerContext);
assert.strictEqual(layerContext.handleFxLayerKey({ key: 'ArrowUp', preventDefault() { prevented += 1; } }, 0), true);
assert.deepStrictEqual(selectedLayers.pop(), [2, true]);
assert.strictEqual(layerContext.handleFxLayerKey({ key: 'End', preventDefault() { prevented += 1; } }, 0), true);
assert.deepStrictEqual(selectedLayers.pop(), [2, true]);
assert.strictEqual(layerContext.handleFxLayerKey({ key: 'Enter', preventDefault() {} }, 1), false);

console.log('PalFX actionable states, semantic tabs, keyboard layers, emitted preview pixels, labels, and live guidance passed');
