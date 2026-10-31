'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { layeredPsdPlan, layeredPsdHtml, generateLayerCode, sealLayeredPsdReview } = require('../src/layered_psd_workspace');
Module._load = load;

function control(document) {
  return {
    disabled: false, title: '', value: '', textContent: '', checked: false, innerHTML: '', dataset: {},
    focus() { document.activeElement = this; },
    classList: { add() {}, remove() {} }
  };
}

function client(html) {
  const document = { activeElement: null }, elements = {}, rows = [], sent = [], listeners = {};
  for (const id of ['layers','preview','code','status','copy','sff','verify','folder','owner','orderUp','orderDown','orderTop','orderBottom','deltaX','deltaY','move']) elements[id] = control(document);
  elements.deltaX.value = elements.deltaY.value = '0';
  Object.defineProperty(elements.layers, 'innerHTML', {
    get() { return this._html || ''; },
    set(value) {
      this._html = value; rows.length = 0;
      for (const match of value.matchAll(/<div class="layer ([^"]*)" data-layer="([^"]+)">([\s\S]*?)<\/button><\/div>/g)) {
        const row = control(document), box = control(document), button = control(document);
        row.dataset.layer = match[2]; row.className = match[1]; row.getBoundingClientRect = () => ({ top: 0, height: 20 });
        box.checked = /<input[^>]* checked/.test(match[3]);
        button.ariaSelected = /aria-selected="true"/.test(match[3]);
        button.tabIndex = /tabindex="0"/.test(match[3]) ? 0 : -1;
        row.querySelector = selector => selector === 'button' ? button : selector === 'input' ? box : null;
        row.button = button; row.box = box; rows.push(row);
      }
    }
  });
  document.getElementById = id => elements[id] || null;
  document.querySelectorAll = selector => selector === '[data-layer]' ? rows : selector === '[data-layer] button,[data-layer] input' ? rows.flatMap(row => [row.button, row.box]) : [];
  document.querySelector = selector => { const match = selector.match(/^\[data-layer="([^"]+)"\] button$/); return match ? rows.find(row => row.dataset.layer === match[1])?.button || null : null; };
  const context = {
    document, CSS: { escape: value => value }, console,
    acquireVsCodeApi: () => ({ postMessage: message => sent.push(JSON.parse(JSON.stringify(message))) }),
    addEventListener: (type, callback) => { (listeners[type] ||= []).push(callback); }
  };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { document, elements, rows, sent, emit(message) { for (const callback of listeners.message || []) callback({ data: message }); } };
}

const records = [
  { index: 0, width: 320, height: 240, name: 'Composite' },
  { index: 1, width: 320, height: 240, name: '!!!', visible: true, opacity: 1, compose: 'over' },
  { index: 2, width: 320, height: 240, name: 'Bottom', visible: true, opacity: 1, compose: 'over' }
];
const edgeNames = ['!!!', '   ', '  spaced name  ', 'Ryu & <Ken> "quote"', '日本語', '&amp;'];
for (const target of ['stage', 'ui', 'story']) {
  const edgeRecords = [{ index: 0, width: 320, height: 240, name: 'Composite' }, ...edgeNames.map((name, index) => ({ index: index + 1, width: 320, height: 240, name, visible: true, opacity: 1, compose: 'over' }))];
  const edgePlan = layeredPsdPlan(edgeRecords, { target, stackDirection: 'top-first', group: 10, startIndex: 20 });
  for (const layer of edgePlan.layers) layer.dataUri = 'data:image/png;base64,AA==';
  const options = { origin: [3, 4], layerNo: 0, firstLayer: 7, firstBlock: 9, backgroundPrefix: 'TitleBG' };
  const edgeHtml = layeredPsdHtml({ ...edgePlan, targetLabel: target, psdPath: 'D:/edge.psd', outputDirectory: 'D:/out', warnings: [], codeConfig: { target, origin: options.origin, layerNo: options.layerNo, firstLayer: options.firstLayer, firstBlock: options.firstBlock, uiPrefix: 'TitleBG' } });
  const edgeUi=client(edgeHtml),allDraw=[...edgePlan.layers].sort((left,right)=>left.renderOrder-right.renderOrder),states=allDraw.map(layer=>({id:layer.id,x:0,y:0,visible:true})),sealed=sealLayeredPsdReview(edgePlan,allDraw,states,options);
  assert.strictEqual(edgeUi.elements.code.value, sealed.code, `${target} client live code must equal the actual host sealing path for punctuation, whitespace, quote/entity-like, and non-ASCII names`);
  edgeUi.elements.copy.onclick();
  assert.deepStrictEqual(edgeUi.sent.at(-1),{type:'copyCode',code:sealed.code},`${target} Copy must send the exact host-sealed source`);
}
const plan = layeredPsdPlan(records, { target: 'stage', stackDirection: 'top-first', group: 10, startIndex: 20 });
for (const layer of plan.layers) layer.dataUri = 'data:image/png;base64,AA==';
const html = layeredPsdHtml({ ...plan, ownerFile: 'D:/stage.def', targetLabel: 'Stage', psdPath: 'D:/layers.psd', outputDirectory: 'D:/out', warnings: [], codeConfig: { target: 'stage', origin: [0, 0], layerNo: 0, firstLayer: 0, firstBlock: 0, uiPrefix: 'TitleBG' } });
const ui = client(html), { elements } = ui;
assert.strictEqual(elements.code.value, generateLayerCode(plan, { origin:[0,0], layerNo:0, firstLayer:0, firstBlock:0, backgroundPrefix:'TitleBG' }), 'client preview/copy code exactly matches host sealing for punctuation-only layer names');

assert.strictEqual(elements.orderUp.disabled, true);
assert.match(elements.orderUp.title, /Select one or more PSD layers first/);
assert.strictEqual(elements.verify.disabled, true);
assert.match(elements.verify.title, /Open SFF intake/);
assert.strictEqual(ui.rows.filter(row => row.button.tabIndex === 0).length, 1, 'layer list has one roving tab stop');

ui.rows[0].button.onclick({ shiftKey: false, ctrlKey: false, metaKey: false });
assert.strictEqual(elements.orderUp.disabled, false, 'selection enables ordering controls');
assert.strictEqual(ui.rows[0].button.ariaSelected, true);
let prevented = false;
ui.rows[0].button.onkeydown({ key: 'ArrowDown', shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() { prevented = true; } });
assert.strictEqual(prevented, true);
assert.strictEqual(ui.rows[1].button.ariaSelected, true, 'Arrow navigation moves the active selection');
assert.strictEqual(ui.rows[1].button.tabIndex, 0, 'Arrow navigation moves the roving tab stop');
assert.strictEqual(ui.document.activeElement, ui.rows[1].button, 'selection rerender restores focus to the exact active option');
ui.rows[1].button.onkeydown({ key:'Home', shiftKey:false, ctrlKey:false, metaKey:false, preventDefault(){} });
assert.strictEqual(ui.rows[0].button.tabIndex,0,'Home executes the first-option roving focus path');
ui.rows[0].button.onkeydown({ key:'End', shiftKey:false, ctrlKey:false, metaKey:false, preventDefault(){} });
assert.strictEqual(ui.rows.at(-1).button.tabIndex,0,'End executes the last-option roving focus path');
ui.rows[0].button.onclick({ shiftKey:false, ctrlKey:true, metaKey:false });
assert.strictEqual(ui.rows.filter(row=>row.button.ariaSelected).length, 2, 'Ctrl selection toggles an additional exact layer');
ui.rows[1].button.onclick({ shiftKey:true, ctrlKey:false, metaKey:false });
assert.strictEqual(ui.rows.filter(row=>row.button.ariaSelected).length, 2, 'Shift selection executes the anchored range path');

function transfer() { const values = new Map(); return { types:[], effectAllowed:'', setData(type,value){values.set(type,value);if(!this.types.includes(type))this.types.push(type)}, getData(type){return values.get(type)||''} }; }
const beforeExternalDrop = elements.code.value, external = transfer(); external.setData('text/plain','foreign');
ui.rows[0].ondrop({ dataTransfer:external, preventDefault(){ throw new Error('external drop must not be accepted'); }, clientY:15 });
assert.strictEqual(elements.code.value,beforeExternalDrop,'external drops cannot replay stale internal layer IDs');
ui.rows[0].button.onclick({shiftKey:false,ctrlKey:false,metaKey:false});
const internal = transfer(); ui.rows[0].button.ondragstart({dataTransfer:internal,preventDefault(){}});
ui.rows[1].ondragover({dataTransfer:internal,preventDefault(){}});
const reviewMessagesBeforeDrop=ui.sent.filter(message=>message.type==='reviewChanged').length;
ui.rows[1].ondrop({dataTransfer:internal,preventDefault(){},clientY:15});
assert.strictEqual(ui.sent.filter(message=>message.type==='reviewChanged').length,reviewMessagesBeforeDrop+1,'exact internal drag token performs one reviewed reorder');
const staleInternal=internal;ui.rows[0].ondrop({dataTransfer:staleInternal,preventDefault(){throw new Error('consumed drag token must be rejected')},clientY:15});
const forgedSource=transfer();ui.rows[0].button.ondragstart({dataTransfer:forgedSource,preventDefault(){}});const forged=transfer();forged.setData('application/x-ikemaker-layered-psd','forged-token');ui.rows[1].ondrop({dataTransfer:forged,preventDefault(){throw new Error('forged token must be rejected')},clientY:15});
const ended=transfer();ui.rows[0].button.ondragstart({dataTransfer:ended,preventDefault(){}});ui.rows[0].button.ondragend();ui.rows[1].ondrop({dataTransfer:ended,preventDefault(){throw new Error('dragend-cleared token must be rejected')},clientY:15});

ui.rows.at(-1).button.onclick({shiftKey:false,ctrlKey:false,metaKey:false});
const beforeKeyboardOrder=elements.code.value;elements.orderTop.onclick();
assert.notStrictEqual(elements.code.value,beforeKeyboardOrder,'ordering buttons execute the keyboard-accessible drag alternative');

const rowBeforeHostAction = ui.rows[0];
rowBeforeHostAction.button.focus();
elements.copy.onclick();
assert.strictEqual(ui.sent.at(-1).type, 'copyCode');
assert.strictEqual(elements.copy.disabled, true, 'an asynchronous host action locks competing actions immediately');
assert.match(elements.copy.title, /Wait for the current/);
assert.strictEqual(ui.rows[0].button.disabled, true, 'host busy state also locks layer edits and drag starts');
assert.strictEqual(ui.rows[0].button.draggable, false);
assert.strictEqual(ui.rows[0], rowBeforeHostAction, 'header busy updates do not rebuild the layer list or steal layer/header focus');
assert.strictEqual(ui.document.activeElement,rowBeforeHostAction.button,'busy start preserves the exact active layer option');
let busyDragPrevented=false;const busyTransfer=transfer();ui.rows[0].button.ondragstart({dataTransfer:busyTransfer,preventDefault(){busyDragPrevented=true}});assert.strictEqual(busyDragPrevented,true,'busy state cancels a new internal drag');assert.deepStrictEqual(busyTransfer.types,[]);
ui.emit({ type: 'layeredActionState', busy: false, message: 'Copied.' });
assert.strictEqual(elements.copy.disabled, false);
assert.strictEqual(ui.rows[0], rowBeforeHostAction, 'host completion updates availability in place');
assert.strictEqual(ui.document.activeElement,rowBeforeHostAction.button,'host completion preserves the exact active layer option');

elements.sff.onclick();
assert.strictEqual(ui.sent.at(-1).type, 'openSffIntake');
ui.emit({ type: 'intakeStarted', message: 'Intake ready.' });
ui.emit({ type: 'layeredActionState', busy: false, message: 'Intake opened.' });
assert.strictEqual(elements.verify.disabled, false, 'exact intake completion enables verification');
elements.verify.onclick();
assert.strictEqual(ui.sent.at(-1).type, 'verifyAdoption');
assert.strictEqual(elements.verify.disabled, true);
ui.emit({ type: 'reviewInvalidated', message: 'Review changed.' });
ui.emit({ type: 'layeredActionState', busy: false, message: 'Review changed.' });
assert.strictEqual(elements.verify.disabled, true, 'review invalidation revokes prior verification readiness');
assert.match(elements.verify.title, /Open SFF intake/);

elements.owner.onclick();
assert.strictEqual(ui.sent.at(-1).type, 'openOwner', 'the explicit return route opens the exact attached owner source');
ui.emit({ type: 'layeredActionState', busy: false, message: 'Owner source opened.' });

ui.rows[0].box.checked = false;
ui.rows[0].box.onchange({ stopPropagation() {} });
assert.strictEqual(ui.sent.at(-1).type, 'reviewChanged', 'visibility edits invalidate host verification authority');

console.log('Layered PSD generated client exposes keyboard selection, actionable disabled states, busy lockout, focus, and verification readiness');
