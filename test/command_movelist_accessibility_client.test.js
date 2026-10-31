'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { textDocuments: [], getWorkspaceFolder: () => undefined } };
  return originalLoad.call(this, request, parent, isMain);
};
const workspace = require('../src/command_movelist_workspace');
const { INSERTABLE_INPUTS, COMMAND_SEQUENCE_RECIPES } = require('../src/command_movelist_model');
Module._load = originalLoad;

const data = {
  files: { defFile: 'Ryu.def', commandFile: 'Ryu.cmd', movelistFile: 'Ryu.dat', movelists: [] },
  defaults: { time: 15, stepTime: -1, autoGreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 },
  commands: [{ name: 'fireball', command: 'D, DF, F, x', time: 15, stepTime: 10, declaredStepTime: 10, autoGreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1, diagnostics: [] }],
  movelistText: 'Fireball _QDF\n', movelistEol: '\n', initialCommandIndex: 0, knownTimings: [], presets: [], insertableInputs: INSERTABLE_INPUTS, sequenceRecipes: COMMAND_SEQUENCE_RECIPES,
  glyphCatalog: { state: 'ready', entries: [], tokens: [] }
};
const page = workspace.enhanceCommandHtml(workspace.html(data));
const script = page.match(/<script>([\s\S]*)<\/script>/)[1];

for (const id of ['name','sequence','time','steptime','autogreater','bufferTime','bufferHitpause','bufferPauseend','bufferShared']) {
  assert(page.includes(`for="${id}"`), `visible command label is associated with ${id}`);
}
for (const label of ['Red numeric value','Green numeric value','Blue numeric value','Hue numeric value','Saturation numeric value','Brightness value numeric input']) {
  assert(page.includes(`aria-label="${label}"`), `numeric color companion is named: ${label}`);
}
assert(page.includes('class="movelist-tabs" role="tablist" aria-label="Displayed movelist editing mode"'));
assert(page.includes('class="movelist-find-tools" role="search" aria-label="Find and replace in displayed movelist"'), 'find and replace controls are a named search region outside the tablist semantics');
assert(page.includes('role="tab" aria-selected="true" aria-controls="movelistSourcePane"'));
assert(page.includes('role="tabpanel" aria-labelledby="movelistVisualTab"'));
assert(page.includes('id="commands" role="list" aria-label="Command definitions"'));
assert(!page.includes('id="commands" role="listbox"'), 'command rows no longer nest buttons inside listbox options');
assert(script.includes('role="listitem" aria-current="'), 'generated command, timeline, and movelist rows expose non-nested current-item state');

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert(start >= 0, `missing generated function ${name}`);
  const brace = script.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < script.length; i++) {
    if (script[i] === '{') depth++;
    if (script[i] === '}' && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`unterminated generated function ${name}`);
}

function node(id) {
  const classes = new Set();
  return {
    id, disabled: false, hidden: false, title: '', textContent: '', innerHTML: '', value: '', tabIndex: 0,
    dataset: {}, attrs: {}, focused: 0,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, force) { const active = force === undefined ? !classes.has(value) : force; active ? classes.add(value) : classes.delete(value); return active; } },
    setAttribute(name, value) { this.attrs[name] = String(value); }, getAttribute(name) { return this.attrs[name] ?? null; }, removeAttribute(name) { delete this.attrs[name]; },
    focus() { this.focused++; tabContext.document.activeElement = this; },
    append(...children) { this.children = (this.children || []).concat(children); },
    querySelector() { return null; }
  };
}

const tabNodes = new Map(['movelistSourceTab','movelistVisualTab','movelistSourcePane','movelistVisualPane'].map(id => [id, node(id)]));
const tabContext = vm.createContext({
  byId: id => tabNodes.get(id), movelistMode: 'source', previewMovelist() {}, persistUi() {},
  document: { activeElement: null }
});
vm.runInContext(`${functionSource('showMovelistMode')};${functionSource('handleMovelistModeKey')}`, tabContext);
vm.runInContext(`showMovelistMode('visual',true)`, tabContext);
assert.strictEqual(tabNodes.get('movelistVisualTab').attrs['aria-selected'], 'true');
assert.strictEqual(tabNodes.get('movelistVisualTab').tabIndex, 0);
assert(tabNodes.get('movelistSourcePane').classList.contains('hidden'));
assert.strictEqual(tabNodes.get('movelistVisualTab').focused, 1);
let prevented = 0;
vm.runInContext('handleMovelistModeKey', tabContext)({ key: 'ArrowLeft', currentTarget: tabNodes.get('movelistVisualTab'), preventDefault() { prevented++; } });
assert.strictEqual(tabNodes.get('movelistSourceTab').attrs['aria-selected'], 'true');
assert.strictEqual(tabNodes.get('movelistSourceTab').focused, 1);
vm.runInContext('handleMovelistModeKey', tabContext)({ key: 'End', currentTarget: tabNodes.get('movelistSourceTab'), preventDefault() { prevented++; } });
assert.strictEqual(tabNodes.get('movelistVisualTab').attrs['aria-selected'], 'true');
assert.strictEqual(prevented, 2);

const availabilityNodes = new Map([['undoTimeline',node('undoTimeline')],['redoTimeline',node('redoTimeline')]]);
availabilityNodes.get('undoTimeline').title = 'Undo the last timeline-only draft edit';
availabilityNodes.get('redoTimeline').title = 'Redo the last timeline-only draft edit';
const availabilityContext = vm.createContext({ byId: id => availabilityNodes.get(id), timelineUndo: [], timelineRedo: [] });
vm.runInContext(`${functionSource('setControlAvailability')};${functionSource('updateTimelineHistory')}`, availabilityContext);
vm.runInContext('updateTimelineHistory()', availabilityContext);
assert.strictEqual(availabilityNodes.get('undoTimeline').disabled, true);
assert.match(availabilityNodes.get('undoTimeline').title, /No timeline-only draft edit/);
availabilityContext.timelineUndo.push({ sequence: 'x' });
vm.runInContext('updateTimelineHistory()', availabilityContext);
assert.strictEqual(availabilityNodes.get('undoTimeline').disabled, false);
assert.strictEqual(availabilityNodes.get('undoTimeline').title, 'Undo the last timeline-only draft edit');

const refresh = node('refreshConnections'), connectionBody = { scrollTop: 9, addEventListener() {} }, sent = [];
const bridgeNodes = new Map([
  ['refreshConnections', refresh], ['connectionFilter', { value: '' }],
  ...['connectionScope','connectionRelation','connectionStatus'].map(id => [id, { value: 'all', options: [{ value: 'all' }] }]),
  ['connectionsWorkspace', { querySelector: () => connectionBody }]
]);
const bridgeContext = vm.createContext({
  restoredUi: { connectionsVisible: false }, byId: id => bridgeNodes.get(id),
  connectionFilterState: () => ({}), persistUi() {}, showConnections() {},
  vscode: { getState: () => ({}), setState() {}, postMessage: message => sent.push(message) },
  window: { addEventListener() {} }, Number, Array
});
vm.runInContext(`${functionSource('setControlAvailability')};${workspace.commandConnectionsClientBridge()}`, bridgeContext);
refresh.onclick();
assert.strictEqual(refresh.disabled, true);
assert.match(refresh.title, /Refreshing code connections/);
assert.deepStrictEqual(sent.map(item => ({ ...item })), [{ type: 'refreshCommandConnections' }]);

const connectionRoot = node('connectionList');
Object.defineProperty(connectionRoot, 'textContent', { get() { return ''; }, set() { this.children = []; } });
const connectionNodes = new Map([
  ['connectionList', connectionRoot], ['connectionSummary', node('connectionSummary')], ['connectionLimitations', node('connectionLimitations')],
  ['connectionScope', { value: 'all' }], ['connectionRelation', { value: 'all' }], ['connectionStatus', { value: 'all' }], ['connectionFilter', { value: '' }]
]);
const occurrence = { controller: 'AssertCommand', commandName: 'fireball', relation: 'command-assert', status: 'unresolved', compatibility: 'dynamic', file: 'Ryu.zss', line: 4, details: [], reason: 'The command name is computed at runtime.', route: '' };
const connectionContext = vm.createContext({
  data: { commands: data.commands, connections: { available: true, occurrences: [occurrence], limitations: [], totals: { exact: 0, related: 0, unresolved: 1 } } },
  byId: id => connectionNodes.get(id), selectedCommand: () => data.commands[0], setControlAvailability: undefined,
  document: { createElement: tag => node(tag) }, vscode: { postMessage: message => sent.push(message) }
});
vm.runInContext(`${functionSource('setControlAvailability')};${functionSource('connectionStatusGroup')};${functionSource('selectedConnectionName')};${functionSource('renderConnections')}`, connectionContext);
vm.runInContext('renderConnections()', connectionContext);
let connectionOpen = connectionRoot.children[0].children[2];
assert.strictEqual(connectionOpen.disabled, true);
assert.strictEqual(connectionOpen.title, occurrence.reason);
occurrence.route = 'a'.repeat(48); occurrence.reason = '';
vm.runInContext('renderConnections()', connectionContext);
connectionOpen = connectionRoot.children[0].children[2];
assert.strictEqual(connectionOpen.disabled, false);
assert.strictEqual(connectionOpen.title, 'Open the exact authored source span');

const findIds = ['movelistFind','movelistMatchCase','previousMovelistMatch','nextMovelistMatch','previewMovelistReplace','replaceMovelistCurrent','replaceMovelistLine','replaceMovelistAll','clearMovelistFind'];
const findNodes = new Map(findIds.map(id => [id, node(id)]));
findNodes.get('movelistFind').value = '';
findNodes.get('movelistMatchCase').checked = false;
const findContext = vm.createContext({
  byId: id => findNodes.get(id), movelistDraft: 'alpha\nbeta alpha', selectedMovelistLine: 0,
  movelistFindReplaceAvailability: workspace.movelistFindReplaceAvailability
});
vm.runInContext(`${functionSource('setControlAvailability')};${functionSource('movelistLineRecords')};${functionSource('movelistLiteralMatches')};${functionSource('updateMovelistReplaceControls')}`, findContext);
vm.runInContext('updateMovelistReplaceControls()', findContext);
assert.strictEqual(findNodes.get('nextMovelistMatch').disabled, true);
assert.match(findNodes.get('nextMovelistMatch').title, /Enter text or a glyph token/);
assert.strictEqual(findNodes.get('clearMovelistFind').disabled, true);
assert.match(findNodes.get('clearMovelistFind').title, /already empty/);
findNodes.get('movelistFind').value = 'alpha';
vm.runInContext('updateMovelistReplaceControls()', findContext);
assert.strictEqual(findNodes.get('previousMovelistMatch').disabled, false);
assert.strictEqual(findNodes.get('replaceMovelistAll').disabled, false);
assert.strictEqual(findNodes.get('replaceMovelistLine').disabled, false);
findContext.selectedMovelistLine = 1;
findNodes.get('movelistFind').value = 'beta';
vm.runInContext('updateMovelistReplaceControls()', findContext);
assert.strictEqual(findNodes.get('replaceMovelistLine').disabled, false);
findContext.selectedMovelistLine = 0;
vm.runInContext('updateMovelistReplaceControls()', findContext);
assert.strictEqual(findNodes.get('replaceMovelistLine').disabled, true);
assert.match(findNodes.get('replaceMovelistLine').title, /selected movelist line has no literal match/);
findNodes.get('movelistFind').value = 'missing';
vm.runInContext('updateMovelistReplaceControls()', findContext);
assert.strictEqual(findNodes.get('previewMovelistReplace').disabled, true);
assert.match(findNodes.get('previewMovelistReplace').title, /No literal matches/);

for (const label of ['Search command definitions','Command definition view','Color tag on selected movelist line','Generated native command syntax']) {
  assert(page.includes(`aria-label="${label}"`), `full closeout names ${label}`);
}
assert(page.includes('id="presetPanel" class="preset-draft hidden" role="region" aria-labelledby="presetTitle"'));
assert(page.includes('id="connectionList" role="list" aria-label="Code connection results"'));
assert(page.includes('id="connectionLimitations" role="note" aria-label="Code connection limitations"'));

const fallbackControl = node('combineStep');
fallbackControl.disabled = true;
fallbackControl.title = 'Combine +';
const fallbackContext = vm.createContext({ byId: () => fallbackControl });
vm.runInContext(`${functionSource('setControlAvailability')};${functionSource('commandMovelistDisabledReason')};${functionSource('syncCommandMovelistDisabledControl')}`, fallbackContext);
vm.runInContext('syncCommandMovelistDisabledControl', fallbackContext)(fallbackControl);
assert.strictEqual(fallbackControl.attrs['aria-disabled'], 'true');
assert.match(fallbackControl.attrs['aria-description'], /Select an applicable command step/);
fallbackControl.disabled = false;
vm.runInContext('syncCommandMovelistDisabledControl', fallbackContext)(fallbackControl);
assert.strictEqual(fallbackControl.attrs['aria-description'], undefined);
assert.strictEqual(fallbackControl.title, 'Combine +');

const movelistActionNodes = new Map([['saveMovelist',node('saveMovelist')],['revertMovelistDraft',node('revertMovelistDraft')]]);
const movelistAvailabilityContext = vm.createContext({
  byId: id => movelistActionNodes.get(id), setControlAvailability: undefined,
  data: { files: { movelistFile: 'Ryu.dat' }, movelistText: 'loaded' }, movelistDraft: 'loaded'
});
vm.runInContext(`${functionSource('setControlAvailability')};${functionSource('updateMovelistDraftAvailability')}`, movelistAvailabilityContext);
vm.runInContext('updateMovelistDraftAvailability()', movelistAvailabilityContext);
assert.strictEqual(movelistActionNodes.get('saveMovelist').disabled, true);
assert.match(movelistActionNodes.get('saveMovelist').title, /No reviewed displayed-movelist changes/);
movelistAvailabilityContext.movelistDraft = 'changed';
vm.runInContext('updateMovelistDraftAvailability()', movelistAvailabilityContext);
assert.strictEqual(movelistActionNodes.get('saveMovelist').disabled, false);
assert.strictEqual(movelistActionNodes.get('revertMovelistDraft').disabled, false);
movelistAvailabilityContext.data.files.movelistFile = '';
vm.runInContext('updateMovelistDraftAvailability()', movelistAvailabilityContext);
assert.strictEqual(movelistActionNodes.get('saveMovelist').disabled, true);
assert.match(movelistActionNodes.get('saveMovelist').title, /Assign a displayed movelist file/);

const selectedRow = node('selectedCommand'), searchField = node('commandSearch'), focusBody = node('body'), focusGuard = node('rerenderGuard'), unrelatedFocus = node('unrelatedFocus'), focusFrames = [];
const focusContext = vm.createContext({
  globalThis: { requestAnimationFrame: callback => focusFrames.push(callback) },
  document: { activeElement: focusGuard, body: focusBody, querySelector: selector => selector.includes('[data-index="0"]') ? selectedRow : null },
  byId: id => id === 'commandSearch' ? searchField : null
});
vm.runInContext(functionSource('restoreCommandListFocus'), focusContext);
vm.runInContext('restoreCommandListFocus(0)', focusContext);
focusFrames.shift()();
assert.strictEqual(selectedRow.focused, 1, 'command selection rerender restores the selected row focus');
focusContext.document.activeElement = focusGuard;
vm.runInContext('restoreCommandListFocus(0)', focusContext);
focusContext.document.activeElement = unrelatedFocus;
focusFrames.shift()();
assert.strictEqual(selectedRow.focused, 1, 'a deferred command-row restore does not steal unrelated focus');
focusContext.document.activeElement = focusGuard;
focusContext.document.querySelector = () => null;
vm.runInContext('restoreCommandListFocus(0)', focusContext);
focusFrames.shift()();
assert.strictEqual(searchField.focused, 1, 'a removed command row falls back safely to command search');

const presetPanel = node('presetPanel'), presetTarget = node('presetTrigger'), presetFallback = node('addCommand'), presetBody = node('body'), presetEditorFocus = node('presetDraft'), presetUnrelated = node('unrelated'), presetFrames = [];
presetPanel.classList.remove('hidden'); presetTarget.isConnected = true;
const presetContext = vm.createContext({
  presetId: 'preset', presetReturnFocus: presetTarget,
  byId: id => id === 'presetPanel' ? presetPanel : id === 'addCommand' ? presetFallback : node(id),
  document: { activeElement: presetEditorFocus, body: presetBody },
  storePresetDraft() {}, persistUi() {}, globalThis: { requestAnimationFrame: callback => presetFrames.push(callback) }
});
vm.runInContext(functionSource('closePresetDraft'), presetContext);
vm.runInContext('closePresetDraft()', presetContext);
assert(presetPanel.classList.contains('hidden'));
presetFrames.shift()();
assert.strictEqual(presetTarget.focused, 1, 'closing the inline preset editor restores its invoker');
presetContext.presetId = 'preset'; presetContext.presetReturnFocus = presetTarget; presetContext.document.activeElement = presetEditorFocus;
vm.runInContext('closePresetDraft()', presetContext);
presetContext.document.activeElement = presetUnrelated;
presetFrames.shift()();
assert.strictEqual(presetTarget.focused, 1, 'a deferred preset restore does not steal unrelated focus');
presetContext.presetId = 'preset'; presetTarget.isConnected = false; presetContext.presetReturnFocus = presetTarget; presetContext.document.activeElement = presetEditorFocus;
vm.runInContext('closePresetDraft()', presetContext);
presetFrames.shift()();
assert.strictEqual(presetFallback.focused, 1, 'a removed preset invoker falls back safely to Add Command');

console.log('Command and Movelist executable accessibility states passed');
