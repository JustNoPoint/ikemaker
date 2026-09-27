'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const view = require('../src/move_constants_view_transform');
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {}, workspace: {}, languages: {} };
  return original.call(this, request, parent, isMain);
};
const { page } = require('../src/move_lab_workspace');
Module._load = original;

const html = page({ defPath: 'Hero.def', context: { project: 'Game', character: 'Hero' }, files: [], sources: [], diagnostics: [], totals: {}, attacks: {}, visual: { state: 'ready', actions: [], p1: { frames: [] }, p2: { frames: [] }, palette: {} } });
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert(start >= 0, `generated ${name} function exists`);
  const body = script.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < script.length; index++) {
    if (script[index] === '{') depth++;
    if (script[index] === '}' && --depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`unterminated generated ${name} function`);
}

const calls = [], axes = [], controls = Object.fromEntries(['movePlay', 'movePrev', 'moveNext', 'moveP1', 'moveP2', 'moveFit'].map(id => [id, { id, value: '0' }]));
const ctx = new Proxy({}, { get(target, key) { if (!(key in target)) target[key] = (...args) => calls.push([key, ...args]); return target[key]; }, set(target, key, value) { target[key] = value; return true; } });
const canvas = {
  width: 1000, height: 500, clientWidth: 640, clientHeight: 330, parentElement: {}, style: {}, captured: null,
  getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas.clientWidth / 2, height: canvas.clientHeight / 2 }),
  setPointerCapture(id) { this.captured = id; }, hasPointerCapture(id) { return this.captured === id; }, releasePointerCapture() { this.captured = null; }
};
let observer = null, posts = 0, states = 0;
const sandbox = {
  console, moveView: view, canvasObserver: null, zoom: 2, panX: 0, panY: 0, p1WorldX: -40, p1WorldY: 0, p2WorldX: 40, p2WorldY: 0,
  tick: 0, model: { visual: { p1: { frames: [] }, p2: { frames: [] }, palette: {} } },
  document: { getElementById: id => id === 'moveCanvas' ? canvas : controls[id], querySelectorAll: () => [] },
  ResizeObserver: class { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() {} },
  image: () => null, at: () => undefined, total: () => 1, stop() {}, play() {}, post() { posts++; }, saveShellState() { states++; },
  sprite(context, frame, x, y) { axes.push({ x, y }); }
};
vm.createContext(sandbox);
vm.runInContext(`${functionSource('draw')}\n${functionSource('themedMoveDraw')}\n${functionSource('bindVisual')}\nthis.api={draw,bindVisual};this.camera=()=>({zoom,panX,panY});`, sandbox);
sandbox.api.bindVisual();
assert.deepStrictEqual([canvas.width, canvas.height], [640, 330], 'the final draw binding must resize the backing canvas on initial paint');
assert.strictEqual((axes.at(-1).x - axes.at(-2).x) / sandbox.camera().zoom, 80);
canvas.clientWidth = 800; canvas.clientHeight = 400; observer.callback();
assert.deepStrictEqual([canvas.width, canvas.height], [800, 400], 'ResizeObserver must reach the resize-aware final draw wrapper');
assert.strictEqual((axes.at(-1).x - axes.at(-2).x) / sandbox.camera().zoom, 80);

const pointer = { pointerId: 7, clientX: 150, clientY: 110, deltaY: -1, preventDefault() {} };
canvas.onpointerdown(pointer);
const before = sandbox.camera(), point = { x: pointer.clientX * canvas.width / (canvas.clientWidth / 2), y: pointer.clientY * canvas.height / (canvas.clientHeight / 2) };
const worldBefore = view.worldPoint(canvas.width / 2 + before.panX, canvas.height * .78 + before.panY, point.x, point.y, before.zoom);
canvas.onwheel(pointer);
const after = sandbox.camera(), worldAfter = view.worldPoint(canvas.width / 2 + after.panX, canvas.height * .78 + after.panY, point.x, point.y, after.zoom);
assert(Math.abs(worldAfter.x - worldBefore.x) < 1e-9 && Math.abs(worldAfter.y - worldBefore.y) < 1e-9, 'wheel zoom must retain the world point under the CSS-scaled pointer');
const afterWheel = { ...after };
canvas.onpointermove(pointer); canvas.onpointerup(pointer); canvas.onpointercancel(pointer); canvas.onlostpointercapture(pointer);
const finalCamera = sandbox.camera();
assert.deepStrictEqual([finalCamera.zoom, finalCamera.panX, finalCamera.panY], [afterWheel.zoom, afterWheel.panX, afterWheel.panY], 'wheel cancellation must prevent a stale pan event from replaying');
assert.strictEqual(posts, 0, 'camera interactions must not post an authoring message');
assert(states > 0, 'camera state remains local and recoverable');

const spriteSandbox = { zoom: 2, image: () => ({ complete: true }), console };
vm.createContext(spriteSandbox);
vm.runInContext(`${functionSource('sprite')}\nthis.sprite=sprite;`, spriteSandbox);
function spriteProbe(face) {
  const recorded = { translate: null, scale: null, boxes: [] }, probe = {
    save() {}, restore() {}, drawImage() {},
    translate(...args) { recorded.translate = args; }, scale(...args) { recorded.scale = args; },
    strokeRect(...args) { recorded.boxes.push(args); }
  };
  spriteSandbox.sprite(probe, { x: 7, y: -3, flags: 'HV', image: { axisX: 0, axisY: 0 }, clsn1: [[1, 2, 5, 6]], clsn2: [] }, 100, 200, face, false);
  return recorded;
}
assert.deepStrictEqual(spriteProbe(-1), { translate: [114, 194], scale: [2, -2], boxes: [[116, 182, 8, 8]] }, 'P2 HV collision geometry must follow the same offset and flip convention as sprite art');
assert.deepStrictEqual(spriteProbe(1), { translate: [114, 194], scale: [-2, -2], boxes: [[104, 182, 8, 8]] }, 'P1 HV collision geometry must follow the same offset and flip convention as sprite art');

console.log('Generated Move Lab camera, resize, pointer anchoring and AIR collision geometry passed');
