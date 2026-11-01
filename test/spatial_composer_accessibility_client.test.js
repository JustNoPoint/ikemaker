'use strict';
const assert = require('assert');
const Module = require('module');
const vm = require('vm');

const vscode = { window: { activeTextEditor: null }, workspace: { textDocuments: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, languages: { getDiagnostics: () => [] }, ViewColumn: { Active: 1 }, commands: {}, Uri: { file: fsPath => ({ fsPath }) } };
const original = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
const workspace = require('../src/spatial_composer_workspace');
Module._load = original;

const empty = workspace.spatialControlAvailability({});
assert.strictEqual(empty.sourcePrevious.disabled, true);
assert.match(empty.sourcePrevious.reason, /Assign at least one state source/);
assert.strictEqual(empty.openSource.disabled, true);
assert.strictEqual(empty.action.disabled, true);
assert.strictEqual(empty.play.disabled, true);
assert.strictEqual(empty.insertController.disabled, true);

const single = workspace.spatialControlAvailability({ itemCount: 1, index: 0, hasSource: true });
assert.match(single.sourcePrevious.reason, /Only one assigned state source/);
assert.match(single.sourceNext.reason, /Only one assigned state source/);

const first = workspace.spatialControlAvailability({ itemCount: 3, index: 0, hasSource: true, hasPreview: true, totalTicks: 12, tick: 0, hasAuthority: true, hasTarget: true });
assert.strictEqual(first.sourcePrevious.disabled, true);
assert.match(first.sourcePrevious.reason, /first assigned state source/);
assert.strictEqual(first.sourceNext.disabled, false);
assert.strictEqual(first.sourceSlider.disabled, false);
assert.strictEqual(first.action.disabled, false);
assert.strictEqual(first.play.disabled, false);
assert.strictEqual(first.previousTick.disabled, true);
assert.match(first.previousTick.reason, /first preview tick/);
assert.strictEqual(first.nextTick.disabled, false);
assert.strictEqual(first.insertController.disabled, false);

const last = workspace.spatialControlAvailability({ itemCount: 3, index: 2, pendingNavigation: true, hasSource: true, hasPreview: true, totalTicks: 12, tick: 4 });
assert.strictEqual(last.sourcePrevious.disabled, true);
assert.strictEqual(last.sourceNext.disabled, true);
assert.match(last.sourceNext.reason, /Wait for the current/);
assert.strictEqual(last.sourceSelect.disabled, true);

assert.strictEqual(workspace.spatialTabNavigation(0, 'ArrowRight', 2), 1);
assert.strictEqual(workspace.spatialTabNavigation(1, 'ArrowRight', 2), 0);
assert.strictEqual(workspace.spatialTabNavigation(0, 'ArrowLeft', 2), 1);
assert.strictEqual(workspace.spatialTabNavigation(1, 'Home', 2), 0);
assert.strictEqual(workspace.spatialTabNavigation(0, 'End', 2), 1);
assert.strictEqual(workspace.spatialTabNavigation(0, 'Enter', 2), -1);

const model = { context: { project: 'Test', character: 'Hero' }, mode: 'explod', plan: require('../src/spatial_authoring_model').newExplod(), generated: { valid: true, issues: [], code: 'explod{}' }, visual: { state: 'unavailable', actions: [] }, sources: [], navigation: { visibleItems: [], slider: {} } };
const html = workspace.page(model);
assert.deepStrictEqual(workspace.SPATIAL_MODE_IDS, ['spatialModeExplod', 'spatialModePosition']);
assert.match(html, /role="tablist" aria-label="Spatial Composer mode"/);
assert.match(html, /role="tab" aria-controls="spatialModePanel"/);
assert.match(html, /id="spatialModePanel" role="tabpanel"/);
assert.match(html, /tabindex="0" aria-label="Spatial preview\./);
assert.match(html, /id="timeline" role="listbox" aria-label="Spatial plan timeline"/);
assert.match(html, /role=\\?"option\\?" data-tick/);
assert.match(html, /e\.key==='Delete'/);
assert.match(html, /applySpatialAvailability\(\)/);
assert.match(html, /setAttribute\('aria-description',title\)/);
assert.match(html, /spatialTabTarget\(tabs\.indexOf\(tab\),event\.key,tabs\.length\)/);
assert.match(html, /generatedAuthorityClear[^]*applySpatialAvailability\(\)/);
assert.match(html, /role="region" aria-label="Spatial plan fields"/);
assert.match(html, /id="common" role="region" aria-label="Shared spatial plan fields"/);
assert.match(html, /id="specific" role="region" aria-label="Mode-specific spatial plan fields"/);
assert.match(html, /id="issues" role="status" aria-live="polite" aria-label="Generated code issues"/);
assert.match(html, /id="code" tabindex="0" aria-label="Generated controller code"/);
assert.match(html, /Local coordinates <select id="resolution"/);

const client = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(client, 'Spatial Composer must emit its client script');
function functionSource(name) {
  const start = client.indexOf('function ' + name + '('), brace = client.indexOf('{', start);
  assert(start >= 0 && brace >= 0, 'missing generated function ' + name);
  let depth = 0;
  for (let index = brace; index < client.length; index += 1) {
    if (client[index] === '{') depth += 1;
    else if (client[index] === '}' && --depth === 0) return client.slice(start, index + 1);
  }
  throw new Error('unterminated generated function ' + name);
}
const routedModes = [];
const modeNodes = workspace.SPATIAL_MODE_IDS.map((id, index) => ({
  id,
  dataset: { mode: index === 0 ? 'explod' : 'position' },
  attributes: {},
  focused: 0,
  setAttribute(name, value) { this.attributes[name] = value; },
  focus() { this.focused += 1; },
  click() { this.onclick?.(); }
}));
const panel = { setAttribute(name, value) { this[name] = value; } };
const nodes = new Map([...modeNodes.map(node => [node.id, node]), ['spatialModePanel', panel]]);
const modeContext = vm.createContext({
  spatialModeIds: workspace.SPATIAL_MODE_IDS,
  spatialTabTarget: workspace.spatialTabNavigation,
  mode: 'explod',
  document: { getElementById: id => nodes.get(id) || null },
  post(type, payload) { routedModes.push({ type, ...payload }); }
});
vm.runInContext(functionSource('modeTabs') + functionSource('configureModeTabs') + ";modeTabs().forEach(b=>b.onclick=()=>post('mode',{mode:b.dataset.mode}));configureModeTabs();", modeContext);
modeNodes[1].click();
assert.deepStrictEqual(routedModes.at(-1), { type: 'mode', mode: 'position' });
let prevented = 0;
modeNodes[0].onkeydown({ key: 'End', preventDefault() { prevented += 1; } });
assert.strictEqual(modeNodes[1].focused, 1);
assert.deepStrictEqual(routedModes.at(-1), { type: 'mode', mode: 'position' });
assert.strictEqual(prevented, 1);

const existingHtml = workspace.page({ ...model, existingExplod: { file: 'states.zss', line: 0, endLine: 2, syntax: 'zss', id: {}, owner: {}, receiver: {}, properties: [], limitations: [], edit: { fields: [] } } });
assert.match(existingHtml, /No existing Explod fields are safely editable/);
assert.match(existingHtml, /Preview an exact change before applying/);
assert.match(existingHtml, /No exact-change preview is staged/);

console.log('Spatial Composer actionable state, semantic tabs, timeline keyboard alternative, and labels passed');
