'use strict';
const assert = require('assert');
const spatial = require('../src/spatial_authoring_model');

const explod = spatial.generateExplod(spatial.newExplod({ id: 2200, anim: 2201, space: 'screen', anchor: 'none', position: [160, 40], timeline: [{ tick: 4, type: 'modify', position: [170, 42], velocity: [1, 0] }, { tick: 9, type: 'remove' }] }));
assert(explod.valid);
assert.match(explod.code, /space: screen/);
assert.match(explod.code, /modifyExplod/);
assert.match(explod.code, /removeExplod/);

const cns = spatial.generateExplod(spatial.newExplod({ language: 'cns', id: 4, anim: 5 }));
assert.match(cns.code, /type = Explod/);
assert.match(cns.code, /ID = 4/);

const target = spatial.generatePosition(spatial.newPosition({ subject: 'target', position: [18, -40], bindTime: 3 }));
assert.match(target.code, /targetBind\{time: 3; pos: 18, -40\}/);
const lock = spatial.generatePosition(spatial.newPosition({ mode: 'screen-lock', position: [80, 120] }));
assert(lock.issues.some((issue) => /camera-sensitive/.test(issue.message)));
assert.match(lock.code, /screenBound/);
assert.match(lock.code, /80 - screenPos x/);
assert.match(lock.code, /if 1/);

assert.deepStrictEqual(spatial.screenToLocal({ x: 400, y: 300 }, { width: 800, height: 600 }, [320, 240]), [160, 120]);
assert.deepStrictEqual(spatial.snapPosition([3, -2], { left: 0, floor: 0 }), [0, 0]);
const part = spatial.explodFromThrowPart({ name: 'Front arm', explodId: 7000, anim: 7000, layerNo: 1, removeTick: 12 });
assert.strictEqual(part.id, 7000); assert.strictEqual(part.timeline[0].type, 'remove');
console.log('Spatial authoring model tests passed');
