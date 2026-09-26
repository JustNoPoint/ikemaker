'use strict';

const assert = require('assert');
const vm = require('vm');
const { clientScript, applyConflict } = require('../src/move_code_drafts');

let state = {}, sent = [];
const section = { stableId: 'c:/ryu.zss:move-state:200', id: 'c:/ryu.zss:move-state:200', filename: 'C:/Ryu.zss', kind: 'move-state', signature: '200', sourceHash: 'OLD', text: '[StateDef 200]\nold', startLine: 10, endLine: 11 };
const context = {
  model: { files: { defPath: 'C:/Ryu.def' }, codeDrafts: {} },
  move: { id: 'normal.slp' },
  vscode: { getState: () => state, setState: value => { state = value; }, postMessage: message => sent.push(message) },
  globalThis: {}
};
vm.createContext(context);
vm.runInContext(clientScript(), context);
const run = code => vm.runInContext(code, context);
context.section = section;

run("codeDraftStore.stage(section, '[StateDef 200]\\ndraft')");
assert(context.globalThis.ikemenHasUnappliedForms(), 'code draft participates in close protection');
assert.equal(sent.at(-1).draft.baseHash, 'OLD');
assert.equal(sent.at(-1).draft.baseStartLine, 10);
assert(run('codeDraftStore.actionState(section).canApply'), 'first typed change enables Apply');
assert(run('codeDraftStore.actionState(section).canDiscard'), 'first typed change enables Discard');
const originalDraft = sent.at(-1).draft;
assert.equal(applyConflict(section, originalDraft, { text: originalDraft.value, baseHash: 'OLD' }, 'OLD'), '');

section.sourceHash = 'NEW'; section.text = '[StateDef 200]\nexternal'; section.startLine = 14; section.endLine = 15;
assert(run('codeDraftStore.conflict(section)'), 'same-range source changes conflict');
assert.equal(run('codeDraftStore.apply(section)'), null, 'stale draft cannot apply under refreshed source hash');
assert(!run('codeDraftStore.actionState(section).canApply'), 'conflict keeps Apply disabled');
assert(!sent.some(message => message.type === 'applyCodeSection'));
assert.equal(applyConflict(section, originalDraft, { text: originalDraft.value, baseHash: 'OLD' }, 'NEW'), 'source-refreshed');

run('codeDraftStore.rebase(section)');
assert(!run('codeDraftStore.conflict(section)'), 'explicit rebase adopts the reviewed current source');
const request = run('codeDraftStore.apply(section)');
const apply = sent.find(message => message.requestId === request);
assert.equal(apply.baseHash, 'NEW');
assert.equal(apply.text, '[StateDef 200]\ndraft');
assert(run('codeDraftStore.actionState(section).pending'), 'in-flight Apply is tracked');
assert(!run('codeDraftStore.actionState(section).canDiscard'), 'pending Apply protects Discard');

run("codeDraftStore.stage(section, '[StateDef 200]\\nnewer edit')");
context.message = { requestId: request, cleared: true };
assert(!run('codeDraftStore.acknowledge(message)'), 'old acknowledgement cannot clear newer typing');
assert.equal(run('codeDraftStore.value(section)'), '[StateDef 200]\nnewer edit');
run("codeDraftStore.stage(section, '[StateDef 200]\\nexternal')");
assert(!run('codeDraftStore.actionState(section).changed'), 'typing back to the reviewed base disables Apply and Discard');
run("codeDraftStore.stage(section, '[StateDef 200]\\nnewer edit')");
context.other = { stableId: 'c:/ryu.zss:move-state:210', filename: 'C:/Ryu.zss', kind: 'move-state', signature: '210', sourceHash: 'NEW', text: '[StateDef 210]\nbase', startLine: 20, endLine: 21 };
run("codeDraftStore.stage(other, '[StateDef 210]\\ndraft')");
assert.equal(run('codeDraftStore.orphaned([section,other]).length'), 0, 'drafts for other known move sections are not false orphans');
run('codeDraftStore.discard(other)');

const restoredState = JSON.parse(JSON.stringify(state)), restoredSent = [];
const restored = { model: context.model, move: context.move, section, vscode: { getState: () => restoredState, setState: value => Object.assign(restoredState, value), postMessage: message => restoredSent.push(message) }, globalThis: {} };
vm.createContext(restored); vm.runInContext(clientScript(), restored);
assert.equal(vm.runInContext('codeDraftStore.value(section)', restored), '[StateDef 200]\nnewer edit', 'webview reload restores code draft');
restored.model.files.defPath = 'C:/Other.def';
assert(!vm.runInContext('codeDraftStore.hasDrafts()', restored), 'another character does not inherit this character draft');
restored.model.files.defPath = 'C:/Ryu.def';
vm.runInContext('codeDraftStore.discard(section)', restored);
assert(!vm.runInContext('codeDraftStore.hasDrafts()', restored), 'discard clears recovery and close state');

console.log('Connected-code drafts retain immutable bases, block stale writes and line shifts, survive reload, isolate characters, protect close, and preserve newer in-flight edits');
