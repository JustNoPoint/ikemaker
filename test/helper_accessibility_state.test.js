'use strict';
const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const vscode = { window: {}, workspace: { textDocuments: [] }, commands: {}, ViewColumn: { Active: 1 } };
const original = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
const workspace = require('../src/helper_workspace');
const helper = require('../src/helper_authoring_model');
Module._load = original;

let state = workspace.helperControlAvailability({ view: 'create', code: '', sourceCount: 0 });
assert.strictEqual(state.copy.enabled, false);
assert.match(state.copy.reason, /Generate valid Helper code/);
assert.strictEqual(state.recheck.enabled, false);
assert.match(state.recheck.reason, /Assign at least one character state source/);
assert.strictEqual(state.insert.enabled, false);
assert.match(state.insert.reason, /Recheck the exact cursor target/);
assert.strictEqual(state.insertBoth.enabled, false);
assert.match(state.insertBoth.reason, /spawn and StateDef destinations/);
assert.strictEqual(state.updateExisting.enabled, false);
assert.match(state.updateExisting.reason, /Load one static Helper/);

state = workspace.helperControlAvailability({
  view: 'create', code: '[State Helper]', sourceCount: 2, editing: true,
  authority: { snapshotDigest: 'A' }, targets: { cursor: 'cursor', pair: 'pair', controller: 'controller' }
});
for (const id of ['copy', 'recheck', 'insert', 'insertBoth', 'updateExisting', 'chooseExistingMap']) assert.strictEqual(state[id].enabled, true, `${id} should enable only after its exact prerequisite exists`);
assert.strictEqual(workspace.helperControlAvailability({ view: 'tree' }).createPanel.enabled, false);

const plan = helper.newHelper(), generated = helper.generateHelper(plan);
const model = {
  context: { project: 'Test', character: 'Hero' }, defPath: 'Hero.def',
  graph: { nodes: [{ uid: 'root', type: 'root', name: 'Root character', children: [] }], flows: [], reads: [], totals: {} },
  plan, generated, flow: helper.normalizeFlow({}), flowCode: helper.flowCode({}), sources: [],
  roles: helper.ROLES, postypes: helper.POSTYPES, flowScopes: helper.FLOW_SCOPES, flowOperations: helper.FLOW_OPERATIONS,
  suggestion: { id: 1000, stateNo: 1000, source: 'unused scan' }, defaultsSource: 'Generic',
  readiness: { status: 'not-applicable', checks: [] }, preview: { available: false }, assets: { air: '', sff: '' },
  builtinScaffolds: helper.BUILTIN_SCAFFOLDS, recipes: [], editing: null,
  navigation: { spawn: { visibleItems: [], slider: {} }, state: { visibleItems: [], slider: {} } }, sourceRole: 'spawn'
};
const html = workspace.page(model);
assert.match(html, /role="tablist" aria-label="Helper Lab views"/);
assert.match(html, /role="tabpanel"/);
assert.match(html, /aria-selected/);
assert.match(html, /ArrowRight/);
assert.match(html, /aria-label="Generated Helper code"/);
assert.match(html, /aria-label="Helper controls"/);
assert.match(html, /aria-label="Helper preview and analysis"/);
assert.match(html, /aria-label="Generated Helper output"/);
assert.match(html, /aria-label="Built-in Helper scaffold"/);
assert.match(html, /aria-label="Saved project Helper recipe"/);
assert.match(html, /aria-label="Filter Helper tree"/);
assert.match(html, /aria-label="Filter detected Helper map flow"/);
assert.match(html, /aria-label="Creation map initializers"/);
assert.match(html, /const syncRecipeLoads=/);
assert.match(html, /loadScaffold\.disabled=!scaffold\.value/);
assert.match(html, /loadRecipe\.disabled=!recipe\.value/);
assert.match(html, /id="issues" role="status" aria-live="polite"/);
assert.match(html, /id="previewStatus" role="status" aria-live="polite"/);
assert.match(html, /Projectile preview\. Edit exact Spawn X and Spawn Y values/);
assert.match(html, /Assign at least one character state source before rechecking Helper targets/);
assert.match(html, /Already at the first assigned source/);
assert.match(html, /No assigned state files\. Add one to the character DEF, then Refresh/);
assert.match(html, /generatedAuthorityClear[\s\S]*refreshHelperControlStates/);

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing generated client function ${name}`);
  const brace = source.indexOf('{', start); let depth = 0, quote = '', escaped = false;
  for (let at = brace; at < source.length; at++) {
    const char = source[at];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`unterminated generated client function ${name}`);
}
const client = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
const controls = new Map(), control = () => ({ disabled: false, title: '', attrs: {}, setAttribute(name, value) { this.attrs[name] = String(value); } });
for (const key of ['copy','insert','insertBoth','updateExisting','recheck']) controls.set(key, control());
let sourceButtons = [];
const previous = control(), next = control(), range = control(), readout = { textContent: '' }, selectControl = control(), modes = [{ dataset: { sourceMode: 'tabs' }, classList: { toggle() {} } }], roleButtons = [{ dataset: { sourceRole: 'spawn' }, classList: { toggle() {} } }];
const collection = { className: '', _html: '', set innerHTML(value) { this._html = value; sourceButtons = [...value.matchAll(/data-source-id=/g)].map(() => ({ dataset: { sourceId: 'id' } })); }, get innerHTML() { return this._html; } };
const root = {
  querySelector(selector) { return ({ '[data-source-step="previous"]': previous, '[data-source-step="next"]': next, '[data-source-slider]': range, '[data-source-readout]': readout, '[data-source-select]': selectControl, '[data-source-collection]': collection }[selector]); },
  querySelectorAll(selector) { if (selector === '[data-source-mode]') return modes; if (selector === '[data-source-id]') return sourceButtons; return []; }
};
const documentStub = {
  querySelector(selector) {
    if (selector === '.helper-source-nav[data-role="spawn"]') return root;
    if (selector.includes('copy')) return controls.get('copy');
    if (selector.includes('insertBoth')) return controls.get('insertBoth');
    if (selector.includes('insert')) return controls.get('insert');
    if (selector.includes('recheck')) return controls.get('recheck');
    return null;
  },
  querySelectorAll(selector) { return selector === '[data-source-role]' ? roleButtons : []; },
  getElementById(id) { return id === 'updateExisting' ? controls.get('updateExisting') : null; }
};
const context = {
  document: documentStub, model: { navigation: { spawn: { visibleItems: [] } }, generated: { code: '[State Helper]' }, generatedAuthority: null, generatedTargets: {}, sources: [], editing: null },
  view: 'create', helperNavigations: { spawn: { visibleItems: [], slider: {} } }, helperSourceRole: 'spawn', esc: value => String(value), helperRequestNavigation() {},
  helperControlAvailability: workspace.helperControlAvailability, $: id => documentStub.getElementById(id)
};
vm.createContext(context);
vm.runInContext(functionSource(client, 'setHelperControlState') + functionSource(client, 'refreshHelperControlStates') + functionSource(client, 'helperRenderNavigation'), context);
context.helperRenderNavigation('spawn');
assert.strictEqual(controls.get('recheck').disabled, true, 'no-source navigation projection disables Recheck');
assert.match(controls.get('recheck').title, /Assign at least one character state source/);
context.helperNavigations.spawn = { visibleItems: [{ id: 'a', label: 'A.zss' }], currentId: 'a', mode: 'tabs', slider: { previousDisabled: true, nextDisabled: true, title: '1 of 1' } };
context.helperRenderNavigation('spawn');
assert.strictEqual(controls.get('recheck').disabled, false, 'source navigation response enables Recheck from the rendered current projection');
context.helperNavigations.spawn = { visibleItems: [], mode: 'tabs', slider: {} };
context.helperRenderNavigation('spawn');
assert.strictEqual(controls.get('recheck').disabled, true, 'later empty navigation response disables Recheck instead of retaining the initial source projection');
console.log('Helper Creator actionable states, semantic views, labels, navigation guidance, and narrow contracts passed');
