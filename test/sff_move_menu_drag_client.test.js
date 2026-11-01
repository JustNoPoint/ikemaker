'use strict';

const assert = require('assert');
const vm = require('vm');
const { clientScript } = require('../src/floating_panel_drag');

class Target {
  constructor() { this.listeners = new Map(); this.captured = new Set(); this.style = {}; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  dispatch(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
}

const handle = new Target();
const classes = new Set();
const menu = {
  style: { left: '10px', top: '20px' },
  classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
  getBoundingClientRect() { return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0, width: 250, height: 180 }; }
};
const window = { innerWidth: 300, innerHeight: 220 };
vm.runInNewContext(clientScript({ panel: 'menu', handle: 'handle', margin: 4 }), { menu, handle, window });

function event(overrides = {}) {
  return {
    button: 0, pointerId: 7, clientX: 20, clientY: 30,
    target: { closest: () => null }, prevented: false, stopped: false, immediate: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.immediate = true; },
    ...overrides
  };
}

const down = event();
handle.dispatch('pointerdown', down);
assert(handle.hasPointerCapture(7), 'dragging captures the initiating pointer');
assert(classes.has('dragging'), 'dragging exposes the grabbing state');
assert.strictEqual(handle.style.cursor, 'grabbing', 'the header cursor changes from grab to grabbing during movement');
assert(down.prevented && down.stopped, 'the drag start cannot select text or activate the canvas');

const move = event({ clientX: 600, clientY: 600 });
handle.dispatch('pointermove', move);
assert.deepStrictEqual(menu.style, { left: '46px', top: '36px' }, 'dragging clamps the complete panel inside the viewport');
assert(move.prevented && move.stopped, 'drag motion stays owned by the header');

const up = event({ clientX: 600, clientY: 600 });
handle.dispatch('pointerup', up);
assert(!handle.hasPointerCapture(7) && !classes.has('dragging'), 'pointer release ends capture and the grabbing state');
assert.strictEqual(handle.style.cursor, 'grab', 'the header restores its grab cursor after release');
const click = event();
handle.dispatch('click', click);
assert(click.prevented && click.immediate, 'the click synthesized after a drag cannot activate a header descendant');

const buttonDown = event({ pointerId: 8, target: { closest: selector => selector.includes('button') ? {} : null } });
handle.dispatch('pointerdown', buttonDown);
assert(!handle.hasPointerCapture(8) && !buttonDown.prevented, 'buttons and other controls inside a header retain their normal interaction');

menu.style.left = '200px'; menu.style.top = '200px'; window.innerWidth = 180; window.innerHeight = 150;
menu.ikemenClampDrag();
assert.deepStrictEqual(menu.style, { left: '4px', top: '4px' }, 'the retained open position reclamps safely when the viewport becomes narrower than the panel');
const select = event(); handle.dispatch('selectstart', select); assert(select.prevented, 'header text selection is suppressed');

console.log('SFF floating context panel drag capture, clamping, control exclusion, and click suppression passed');
