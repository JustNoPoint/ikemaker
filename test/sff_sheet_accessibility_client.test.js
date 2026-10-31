'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {} };
  return original.call(this, request, parent, main);
};
const { html } = require('../src/sff_sheet_workspace');
Module._load = original;

const model = {
  sessionId: 'client', sourceName: 'sheet.png', sourceDataUri: 'source', total: 1, currentDataUri: 'frame', thumbs: [], componentAuditAvailable: false, componentCandidates: [], attachmentSuggestions: null,
  state: { phase: 'axis-review', cursor: 1, logicalGroup: 0, currentFrame: null, classifications: [], componentAttachments: [], problems: [], unresolvedProblems: [], axisReviews: [] }
};
const markup = html(model), script = markup.slice(markup.indexOf('<script>') + 8, markup.indexOf('</script>'));
const imageChunk = script.slice(script.indexOf('function imageFrom'), script.indexOf('function renderAxisResults'));
const handlerChunk = script.slice(script.indexOf('function closeAxisVisual'), script.lastIndexOf('render();'));

const listeners = { keydown: [], message: [] }, messages = [], images = [];
const document = { activeElement: null, body: null };
function element(id, tagName = 'DIV') {
  return {
    id, tagName, hidden: false, textContent: '', value: 'onion', isConnected: true, disabled: false,
    listeners: {}, focusCount: 0,
    focus() { this.focusCount++; document.activeElement = this; },
    contains(node) { return node === this || node?.dialogOwner === this; },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    querySelectorAll() { return [elements.axisVisualMode, elements.axisVisualCanvas, elements.axisVisualClose]; }
  };
}
const elements = {
  axisVisual: element('axisVisual'), axisVisualMode: element('axisVisualMode', 'SELECT'), axisVisualCanvas: element('axisVisualCanvas', 'CANVAS'), axisVisualCaption: element('axisVisualCaption'), axisVisualClose: element('axisVisualClose', 'BUTTON'),
  problemCode: element('problemCode', 'SELECT'), problemNote: element('problemNote', 'TEXTAREA'), phase: element('phase'), rectX: element('rectX', 'INPUT'),
  keep: element('keep', 'BUTTON'), back: element('back', 'BUTTON'), checkpointBack: element('checkpointBack', 'BUTTON'), continueGroup: element('continueGroup', 'BUTTON'), axisContinue: element('axisContinue', 'BUTTON'), newGroup: element('newGroup', 'BUTTON'), problem: element('problem', 'BUTTON'), axisStop: element('axisStop', 'BUTTON')
};
document.body = element('body', 'BODY');
elements.axisVisualCanvas.dialogOwner = elements.axisVisual;
elements.axisVisualMode.dialogOwner = elements.axisVisual;
elements.axisVisualClose.dialogOwner = elements.axisVisual;
const context2d = { setTransform() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
elements.axisVisualCanvas.getContext = () => context2d;
class DeferredImage {
  constructor() { this.width = 2; this.height = 2; images.push(this); }
  set src(value) { this.source = value; }
}
const opener = element('opener', 'BUTTON'), unrelated = element('unrelated', 'INPUT');
const context = vm.createContext({
  console, Promise, Image: DeferredImage, document, elements, opener, unrelated,
  axisVisualData: null, axisVisualEpoch: 0, reviewBusy: false, axisVisualReturnFocus: null, showSource: false, model,
  byId: id => elements[id], refreshAvailability() {}, render() {}, send(action, payload) { messages.push({ type: 'action', action, payload }); },
  vscode: { postMessage: message => messages.push(message) },
  addEventListener(type, handler) { listeners[type].push(handler); }
});
vm.runInContext(`${imageChunk}\n${handlerChunk}`, context);

function keyEvent(key, target) {
  return {
    key, code: key === ' ' ? 'Space' : '', target, repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }
  };
}
const dialogKey = elements.axisVisual.listeners.keydown[0], windowKey = listeners.keydown[0], receive = listeners.message[0];
assert(dialogKey && windowKey && receive, 'generated comparison and window handlers must register');

elements.axisVisual.hidden = false;
document.activeElement = elements.axisVisualCanvas;
vm.runInContext('axisVisualReturnFocus=opener;axisVisualData={reference:{},target:{}}', context);
const escape = keyEvent('Escape', elements.axisVisualCanvas);
dialogKey(escape);
windowKey(escape);
assert.strictEqual(escape.defaultPrevented, true);
assert.strictEqual(escape.propagationStopped, true, 'comparison Escape must not bubble into workspace shortcuts');
assert.strictEqual(elements.axisVisual.hidden, true);
assert.strictEqual(document.activeElement, opener, 'comparison Escape restores its exact opener');
assert(!messages.some(message => message.type === 'close'), 'consumed comparison Escape must not close the workspace');

const preview = suffix => ({ type: 'axisPreview', reference: { frameId: `r${suffix}`, axisX: 0, axisY: 0, dataUri: `r${suffix}` }, target: { frameId: `t${suffix}`, axisX: 0, axisY: 0, dataUri: `t${suffix}` } });
document.activeElement = opener;
vm.runInContext('axisVisualReturnFocus=opener', context);
receive({ data: preview('close') });
const closeImages = images.splice(0, 2);
elements.axisVisualClose.onclick();
document.activeElement = unrelated;
closeImages.forEach(image => image.onload());

(async () => {
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(elements.axisVisual.hidden, true, 'late decode after Close cannot reopen the dialog');
  assert.strictEqual(document.activeElement, unrelated, 'late decode after Close preserves unrelated focus');

  document.activeElement = opener;
  vm.runInContext('axisVisualReturnFocus=opener', context);
  receive({ data: preview('state') });
  const stateImages = images.splice(0, 2), priorCaption = elements.axisVisualCaption.textContent;
  document.activeElement = unrelated;
  receive({ data: { type: 'state', model: { ...model, state: { ...model.state, phase: 'complete' } } } });
  stateImages[0].onerror();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(elements.axisVisual.hidden, true, 'late rejection after state replacement cannot reopen the dialog');
  assert.strictEqual(elements.axisVisualCaption.textContent, priorCaption, 'late stale rejection cannot publish an obsolete error');
  assert.strictEqual(document.activeElement, unrelated, 'late rejection after state replacement preserves unrelated focus');

  document.activeElement = opener;
  vm.runInContext('axisVisualReturnFocus=opener', context);
  receive({ data: preview('success') });
  const successImages = images.splice(0, 2);
  successImages.forEach(image => image.onload());
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(elements.axisVisual.hidden, false, 'current owned decode reveals the comparison');
  assert.strictEqual(document.activeElement, elements.axisVisualClose, 'current owned decode enters the modal at Close comparison');
  elements.axisVisualClose.onclick();

  document.activeElement = opener;
  vm.runInContext('axisVisualReturnFocus=opener', context);
  receive({ data: preview('focus') });
  const focusImages = images.splice(0, 2);
  document.activeElement = unrelated;
  focusImages.forEach(image => image.onload());
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(elements.axisVisual.hidden, true, 'current decode is abandoned when focus ownership moved elsewhere');
  assert.strictEqual(document.activeElement, unrelated, 'abandoned current decode preserves deliberately moved focus');

  vm.runInContext("model={...model,state:{...model.state,phase:'review'}};reviewBusy=true", context);
  const actionsBeforeBusyKey = messages.filter(message => message.type === 'action').length, busyUp = keyEvent('ArrowUp', document.body);
  windowKey(busyUp);
  assert.strictEqual(busyUp.defaultPrevented, true, 'busy mutation shortcut is consumed instead of leaking');
  assert.strictEqual(messages.filter(message => message.type === 'action').length, actionsBeforeBusyKey, 'busy Arrow shortcut cannot bypass disabled review controls');
  receive({ data: { type: 'error', message: 'Recovered after the pending operation failed.' } });
  const recoveredUp = keyEvent('ArrowUp', document.body);
  windowKey(recoveredUp);
  const recoveredActions = messages.filter(message => message.type === 'action');
  assert.strictEqual(recoveredActions.length, actionsBeforeBusyKey + 1, 'terminal error recovery restores one allowed keyboard action');
  assert.strictEqual(recoveredActions.at(-1).action, 'keep');

  console.log('Executed SFF sheet-review combined Escape, busy shortcut, and deferred comparison lifecycle tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
