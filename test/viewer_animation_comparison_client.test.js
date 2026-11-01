'use strict';

const assert = require('assert');
const vm = require('vm');
const { client } = require('../src/viewer_animation_comparison');

const element = (extra = {}) => ({ disabled: false, title: '', textContent: '', value: '', checked: true, dataset: {}, focus() { this.focused = true; }, ...extra });
const context2d = () => ({ clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, scale() {}, strokeRect() {}, imageSmoothingEnabled: true, fillStyle: '', strokeStyle: '', lineWidth: 1 });
const elements = {
  swap: element(), comparisonStatus: element({ textContent: 'Loading both frozen animations…' }),
  'play-both': element({ disabled: true }), reset: element(), tick: element({ value: '0' }), seek: element(), boxes: element({ checked: true }),
  'animation-0': element({ getContext: () => context2d() }), 'animation-1': element({ getContext: () => context2d() }),
  'status-0': element(), 'status-1': element()
};
const sideButtons = [element({ disabled: true, textContent: 'Play', dataset: { play: '0' } }), element({ disabled: true, textContent: 'Play', dataset: { play: '1' } })];
const frame = { group: -1, index: 0, identity: '-1,0', clsn1: [], clsn2: [] };
const models = [0, 1].map(index => ({ identity: index ? 'AIR 2' : 'AIR 1', animation: { frames: [frame], images: {}, loopStart: null } }));
const messages = [], listeners = [];
const document = {
  hidden: false,
  getElementById(id) { return elements[id]; },
  querySelectorAll(selector) { if (selector === '[data-play],#play-both') return [...sideButtons, elements['play-both']]; if (selector === '[data-play]') return sideButtons; return []; }
};
const sandbox = {
  models,
  playback: { locate: () => ({ index: 0, elapsed: 0 }) },
  bounds: () => ({ left: 0, right: 1, top: 0, bottom: 1 }),
  visual: { sample: () => frame, drawSprite() {} },
  vscode: { setState(value) { this.state = value; }, postMessage(message) { messages.push(message); } },
  document,
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  Image: class {},
  addEventListener(type, listener) { if (type === 'message') listeners.push(listener); },
  console
};

(async () => {
  vm.runInNewContext(`(${client.toString()})(models,playback,bounds,visual,vscode)`, sandbox);
  assert.equal(elements['play-both'].disabled, true);
  elements['play-both'].onclick(); assert.equal(sideButtons[0].textContent, 'Play', 'disabled playback is a real no-op while loading');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['play-both'].disabled, false); assert(sideButtons.every(button => button.disabled === false));
  assert.match(elements.comparisonStatus.textContent, /Ready/); assert.match(elements['play-both'].title, /both frozen animations/);
  sideButtons[0].onclick(); assert.equal(sideButtons[0].textContent, 'Pause');
  elements['play-both'].onclick(); assert(sideButtons.every(button => button.textContent === 'Pause'));
  elements.tick.value = '-12'; elements.seek.onclick(); assert.equal(elements.tick.value, '0'); assert(sideButtons.every(button => button.textContent === 'Play'));
  sideButtons[1].onclick(); elements.reset.onclick(); assert.equal(elements.tick.value, '0'); assert(sideButtons.every(button => button.textContent === 'Play'));
  elements.boxes.checked = false; assert.doesNotThrow(() => elements.boxes.onchange());
  elements.swap.onclick(); assert.deepEqual(messages.pop(), { type: 'swap' }); assert.equal(elements.swap.disabled, true); assert.match(elements.comparisonStatus.textContent, /Saving and swapping/);
  for (const listener of listeners) listener({ data: { type: 'comparisonSwapResult', ok: false } });
  assert.equal(elements.swap.disabled, false); assert.match(elements.comparisonStatus.textContent, /try again/); assert.equal(elements.swap.focused, true);
  assert.match(elements['status-0'].textContent, /Tick 0 · Element 1 \/ 1 · Blank frame/);
  console.log('AIR comparison client exposes loading reasons, synchronized controls, bounded seek/reset, collision toggle, and recoverable Swap');
})().catch(error => { console.error(error); process.exitCode = 1; });
