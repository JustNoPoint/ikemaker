'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const moveView = require('../src/move_constants_view_transform');

const source = fs.readFileSync(path.join(__dirname, '../src/move_constants_workspace.js'), 'utf8');
const cancelStart = source.indexOf('function cancelCanvasDrag('), zoomStart = source.indexOf('function setViewZoom(', cancelStart), zoomEnd = source.indexOf('function centerView(', zoomStart);
const handlersStart = source.indexOf('canvas.onpointerdown=e=>'), handlersEnd = source.indexOf('canvas.ondblclick=', handlersStart);
assert(cancelStart >= 0 && zoomStart > cancelStart && zoomEnd > zoomStart && handlersStart >= 0 && handlersEnd > handlersStart);
const cameraFunctions = source.slice(cancelStart, zoomEnd), handlers = source.slice(handlersStart, handlersEnd);

function interaction(mode) {
  const canvas = {
    width: 960, height: 540, style: {}, captured: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    setPointerCapture(id) { this.captured = id; }, hasPointerCapture(id) { return this.captured === id; }, releasePointerCapture() { this.captured = null; }
  };
  const fields = { viewZoom: {}, viewZoomValue: {}, opponentX: {}, opponentY: {}, status: {} }, messages = [];
  const sandbox = {
    console, moveView, canvas, viewZoom: 2, panX: 0, panY: 0, opponentWorldX: 40, opponentWorldY: -1,
    draft: { sparkX: 10, sparkY: 20 }, pointer: null, drag: null,
    $: id => id === 'canvas' ? canvas : fields[id], document: { querySelector: () => null },
    canvasPoint: e => ({ x: e.clientX, y: e.clientY, dx: 1, dy: 1 }),
    overSpark: () => mode === 'spark' ? { valueX: 10, valueY: 20, xKey: 'sparkX', yKey: 'sparkY' } : null,
    overOpponent: () => mode === 'opponent', stop() {}, draw() {}, renderReaction() {}, renderTimeline() {}, saveState() {}, coordinateText: String,
    moveDrafts: { notice() {} }, vscode: { postMessage(message) { messages.push(message); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${cameraFunctions}\n${handlers}\nthis.state=()=>({viewZoom,panX,panY,opponentWorldX,opponentWorldY,draft:{...draft},pointer,drag});`, sandbox);
  const event = { pointerId: 5, clientX: 620, clientY: 260, deltaY: -1, preventDefault() {} };
  canvas.onpointerdown(event);
  const authoredBefore = sandbox.state();
  canvas.onwheel(event);
  const afterWheel = sandbox.state();
  canvas.onpointermove(event); canvas.onpointerup(event); canvas.onpointercancel(event); canvas.onlostpointercapture(event);
  const final = sandbox.state();
  assert.strictEqual(final.pointer, null); assert.strictEqual(final.drag, null);
  assert.deepStrictEqual(final.draft, authoredBefore.draft, `${mode} draft must survive drag -> wheel -> same pointer unchanged`);
  assert.deepStrictEqual([final.opponentWorldX, final.opponentWorldY], [authoredBefore.opponentWorldX, authoredBefore.opponentWorldY], `${mode} opponent world position must not replay a stale drag`);
  assert.deepStrictEqual([final.viewZoom, final.panX, final.panY], [afterWheel.viewZoom, afterWheel.panX, afterWheel.panY], `${mode} stale pointer events must not change the camera after wheel cancellation`);
  assert.strictEqual(messages.length, 0, `${mode} camera path must not Apply authored code`);
}
for (const mode of ['opponent', 'spark', 'pan']) interaction(mode);

function exactFunction(name, endName) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf(`function ${endName}(`, start);
  assert(start >= 0 && end > start); return source.slice(start, end);
}
const constantsCanvas = { width: 960, height: 540 }, translations = [];
const drawSandbox = {
  console, moveView, canvas: constantsCanvas, panX: 0, panY: 0, opponentWorldX: 40, opponentWorldY: -1, viewZoom: 2, opponentEnabled: true,
  $: () => constantsCanvas, reactionFrame: () => ({ x: 7, y: -3, flags: '', image: { axisX: 0, axisY: 0 } }), cachedImage: () => ({ complete: true })
};
vm.createContext(drawSandbox);
vm.runInContext(`${exactFunction('previewOrigin', 'sparkPoint')}\n${exactFunction('drawOpponent', 'draw')}\nthis.axis=opponentScreenPoint;this.paint=drawOpponent;`, drawSandbox);
const ctx = { save() {}, restore() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, translate(x, y) { translations.push([x, y]); }, scale() {} };
for (const zoom of [2, 1, .25, 2]) {
  drawSandbox.viewZoom = zoom; translations.length = 0; drawSandbox.paint(ctx, zoom);
  const axis = drawSandbox.axis();
  assert.deepStrictEqual(moveView.worldPoint(480, 432, axis.x, axis.y, zoom), { x: 40, y: -1 });
  assert.deepStrictEqual(translations[0], [axis.x + 7 * zoom, axis.y - 3 * zoom], 'frozen nonzero AIR offsets must share the participant zoom transform');
}

console.log('Generated Move Constants drag cancellation and frozen-frame zoom interactions passed');
