'use strict';

const assert = require('assert');
const vm = require('vm');
const { clientScript } = require('../src/move_constants_overview');

class Element {
  constructor(id = '') { this.id = id; this.dataset = {}; this.value = ''; this.hidden = false; this.open = true; this.classList = { toggle() {} }; }
  focus() { document.activeElement = this; this.focused = true; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  scrollIntoView() { this.scrolled = true; }
  set innerHTML(value) { this._html = value; parse(value); }
  get innerHTML() { return this._html || ''; }
}
const elements = {}, dynamic = [], listeners = {};
function add(element) { if (element.id) elements[element.id] = element; dynamic.push(element); return element; }
function parse(html) {
  dynamic.splice(0, dynamic.length, ...dynamic.filter(item => ['moveOverview', 'overviewDrawer', 'problems'].includes(item.id)));
  for (const match of html.matchAll(/<(button|input|select)[^>]*>/g)) {
    const source = match[0], id = /\sid="([^"]+)"/.exec(source), element = add(new Element(id?.[1] || ''));
    for (const data of source.matchAll(/data-([a-z-]+)="([^"]*)"/g)) element.dataset[data[1].replace(/-([a-z])/g, (_, value) => value.toUpperCase())] = data[2];
    const value = /value="([^"]*)"/.exec(source); if (value) element.value = value[1];
  }
}
add(new Element('moveOverview')); add(new Element('overviewDrawer')); add(new Element('problems'));
const categories = [new Element(), new Element()]; categories[0].dataset.category = 'Damage'; categories[1].dataset.category = 'Timing'; dynamic.push(...categories);
const document = {
  activeElement: null, body: {}, getElementById: id => elements[id] || null,
  querySelectorAll(selector) {
    if (selector === '.category') return categories;
    if (selector === '.code-section') return [];
    const data = /^\[data-([a-z-]+)\]$/.exec(selector);
    if (data) { const key = data[1].replace(/-([a-z])/g, (_, value) => value.toUpperCase()); return dynamic.filter(item => item.dataset[key] !== undefined); }
    return [];
  }
};
const sent = [], states = [], initialState = { moveFormDrafts: { keep: { damage: 50 } }, moveCodeDrafts: { keep: { value: 'draft' } }, categoryOpen: ['Damage'] };
let currentState = initialState, selected = [], frame = 0;
let orphaned=[],discarded=[];
const context = {
  saved: { ...initialState }, document, window: { addEventListener(type, callback, capture) { (listeners[type] ||= []).push({ callback, capture }); } },
  queueMicrotask: callback => callback(), vscode: { getState: () => currentState, setState: value => { currentState = value; states.push(value); }, postMessage: message => sent.push(message) },
  model: { files: { defPath: 'C:/Game/Ryu/Ryu.def' }, moves: [{ id: 'normal.slp', prefix: 'normal.sLP', timeline: { actionNumber: 200, frames: [{}] } }], overview: {
    constantProfiles: [{ id: 'normal.slp', prefix: 'normal.sLP', moveID: 200, sourceFilename: 'C:/Game/Ryu/constants.zss', sourceHash: 'profile-hash', supported: true }],
    controllers: [{ id: 'c:/game/ryu/normals.zss#0', filename: 'C:/Game/Ryu/normals.zss', fileLabel: 'normals.zss', index: 0, line: 7, label: 'State 200 · HitDef 1', detail: 'damage 30', sourceHash: 'code-hash' }],
    specialists: [{ id: 'helper-one', filename: 'C:/Game/Ryu/normals.zss', fileLabel: 'normals.zss', index: 0, line: 12, label: 'Helper creation site 1', kind: 'helper', reference: { defPath: 'C:/Game/Ryu/Ryu.def', kind: 'helper', id: 'helper-one', sourceHash: 'helper-hash' } }],
    problems: [{ id: 'overview-one', level: 'warning', title: 'Review timing', detail: 'AIR mismatch', members: [{key:'member-one',problemId:'timing-1',sourceId:'normal.slp',moveLabel:'normal.sLP',target:'source',filename:'C:/Game/Ryu/Anim.air',line:20,sourceHash:'air-hash'}] }]
  } },
  move: { id: 'normal.slp', timeline: { frames: [{}] } }, frame, savedFrame: 0,
  $: id => document.getElementById(id), esc: value => String(value ?? ''),
  codeDraftStore:{orphaned:()=>orphaned,discardId:id=>discarded.push(id)},
  selectMove: id => selected.push(id), renderTimeline() {}, renderHeader() {}, draw() {}, saveState() {},
  Number, String, Object, Array, Set, Math, JSON, console
};
context.globalThis = context;
vm.createContext(context); vm.runInContext(clientScript(), context);
const ui = vm.runInContext('moveOverviewUi', context);

ui.render();
elements.moveOverview.onclick();
assert.strictEqual(elements.overviewDrawer.hidden, false, 'drawer opens in place');
assert.match(elements.overviewDrawer.innerHTML, /Direct code · inspect exact HitDef/);
document.querySelectorAll('[data-overview-profile]')[0].onclick();
assert.strictEqual(sent.at(-1).type, 'overviewProfile');
assert.strictEqual(sent.at(-1).reference.profileId, 'normal.slp');
document.querySelectorAll('[data-overview-attack]')[0].onclick();
assert.strictEqual(sent.at(-1).type, 'selectDirectComponent');
assert.strictEqual(sent.at(-1).reference.sourceHash, 'code-hash');
document.querySelectorAll('[data-overview-specialist]')[0].onclick();
assert.strictEqual(sent.at(-1).type, 'selectDirectComponent');
assert.strictEqual(sent.at(-1).reference.sourceHash, 'helper-hash');
orphaned=[{sectionId:'old-state',draft:{filename:'C:/Game/Ryu/normals.zss',signature:'200',kind:'state',baseStartLine:4,baseEndLine:8,value:'[StateDef 200]\nctrl: 0;'}}];ui.render();assert.match(elements.overviewDrawer.innerHTML,/Retained code drafts/);assert.match(elements.overviewDrawer.innerHTML,/StateDef 200/);document.querySelectorAll('[data-overview-discard-orphan]')[0].onclick();assert.deepStrictEqual(discarded,['old-state'],'orphaned behavior text remains visible and explicitly discardable from Overview');orphaned=[];

ui.renderProblems();
elements.problemScope.value = 'all'; elements.problemScope.onchange({ target: elements.problemScope });
assert.match(elements.problems.innerHTML, /1\/1 result/);
document.querySelectorAll('[data-overview-problem]')[0].onclick();
assert.strictEqual(sent.at(-1).type, 'overviewProblem');
assert.strictEqual(sent.at(-1).reference.sourceHash, 'air-hash');
assert.strictEqual(sent.at(-1).reference.memberKey, 'member-one');

categories[0].open = true; categories[1].open = false; ui.restoreCategories();
assert.strictEqual(categories[0].open, true); assert.strictEqual(categories[1].open, false);
categories[0].ontoggle();
assert.deepStrictEqual(currentState.moveFormDrafts, initialState.moveFormDrafts, 'drawer preferences preserve move drafts');
assert.deepStrictEqual(currentState.moveCodeDrafts, initialState.moveCodeDrafts, 'drawer preferences preserve connected-code drafts');

const search = elements.overviewSearch; search.selectionStart = search.selectionEnd = 2; search.focus();
search.value='abc';search.oninput({target:search});assert.strictEqual(document.activeElement.selectionStart,2,'search redraw preserves its caret');
for (const listener of listeners.message.filter(item => item.capture)) listener.callback({ data: { type: 'model' } });
assert.strictEqual(document.activeElement.id, 'overviewSearch', 'refresh restores drawer focus');
assert.strictEqual(document.activeElement.selectionStart, 2, 'refresh restores the input selection');
elements.closeOverview.onclick();assert.strictEqual(document.activeElement.id,'moveOverview','closing returns focus to the drawer trigger');
console.log('Move Constants overview drawer preserves drafts/state and routes exact profiles, HitDefs, and problems');
