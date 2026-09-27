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
assert.match(cns.code, /facing = 1/);
assert.match(cns.code, /ownpal = 0/);
assert.match(cns.code, /ignorehitpause = 0/);
assert.match(cns.code, /removeongethit = 0/);
assert.doesNotMatch(cns.code, /remappal =/);
assert.doesNotMatch(cns.code, /trans =/);

function cnsControllers(code) {
  return code.split(/\n\n(?=\[State )/).map((block) => {
    const lines = block.split(/\r?\n/);
    const values = {};
    for (const line of lines.slice(1)) {
      const match = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
      if (match) values[match[1].trim().toLowerCase()] = match[2].trim();
    }
    return values;
  });
}

const parityInput = spatial.newExplod({
  language: 'cns', trigger: 'animelem = 2', id: 41, anim: 42, facing: -1,
  ownPalette: true, palette: [-1, 3], transparency: 'subadd', ignoreHitPause: true,
  removeOnGetHit: true, scale: [1.5, 0.75], angle: 12,
  timeline: [
    { tick: 3, type: 'create', position: [11, 12], velocity: [2, 3], acceleration: [0.5, -0.25] },
    { tick: 3, type: 'modify', position: [21, 22], velocity: [4, 5], acceleration: [0, 1] },
    { tick: 3, type: 'bind', bindTime: -1 },
    { tick: 8, type: 'remove' }
  ]
});
const frozenInput = JSON.stringify(parityInput);
const parityCns = spatial.generateExplod(parityInput);
const controllers = cnsControllers(parityCns.code);
assert.strictEqual(JSON.stringify(parityInput), frozenInput, 'generation must not mutate the plan');
assert.deepStrictEqual(controllers.map((item) => item.type), ['Explod', 'Explod', 'ModifyExplod', 'ExplodBindTime', 'RemoveExplod']);
assert.deepStrictEqual(controllers.map((item) => item.trigger1), ['animelem = 2', 'time = 3', 'time = 3', 'time = 3', 'time = 8']);
assert.deepStrictEqual(controllers.map((item) => item.id), ['41', '41', '41', '41', '41']);
assert.strictEqual(controllers[0].facing, '-1');
assert.strictEqual(controllers[0].ownpal, '1');
assert.strictEqual(controllers[0].remappal, '-1, 3');
assert.strictEqual(controllers[0].trans, 'subadd');
assert.strictEqual(controllers[0].ignorehitpause, '1');
assert.strictEqual(controllers[0].removeongethit, '1');
assert.strictEqual(controllers[1].pos, '11, 12');
assert.strictEqual(controllers[1].vel, '2, 3');
assert.strictEqual(controllers[1].accel, '0.5, -0.25');
assert.strictEqual(controllers[1].scale, '1.5, 0.75');
assert.strictEqual(controllers[1].angle, '12');
assert.strictEqual(controllers[2].pos, '21, 22');
assert.strictEqual(controllers[2].remappal, '-1, 3');
assert.strictEqual(controllers[2].trans, 'subadd');
assert.strictEqual(controllers[2].ownpal, undefined);
assert.strictEqual(controllers[2].ignorehitpause, undefined);
assert.strictEqual(controllers[3].time, '-1');
assert(parityCns.issues.some((issue) => /additional Explod/.test(issue.message)));

const parityZss = spatial.generateExplod({ ...parityInput, language: 'zss' });
assert.match(parityZss.code, /facing: -1/);
assert.match(parityZss.code, /ownpal: 1/);
assert.match(parityZss.code, /remappal: -1, 3/);
assert.match(parityZss.code, /trans: subadd/);
assert.match(parityZss.code, /ignorehitpause: 1/);
assert.match(parityZss.code, /removeongethit: 1/);
assert.strictEqual((parityZss.code.match(/explod\{/g) || []).length, 2);

const paletteWarning = spatial.generateExplod(spatial.newExplod({ language: 'cns', palette: [2, 1], ownPalette: false }));
assert(paletteWarning.valid);
assert(paletteWarning.issues.some((issue) => issue.field === 'ownPalette'));
assert.match(paletteWarning.code, /ownpal = 0/);
assert.match(paletteWarning.code, /remappal = 2, 1/);
for (const transparency of ['none', 'add', 'addalpha', 'add1', 'sub', 'subadd']) {
  const result = spatial.generateExplod(spatial.newExplod({ transparency }));
  assert(result.valid, transparency);
  assert.match(result.code, new RegExp(`trans: ${transparency}`));
}
for (const transparency of ['default', 'Default', 'DEFAULT']) {
  for (const language of ['zss', 'cns']) {
    const result = spatial.generateExplod(spatial.newExplod({ language, transparency, timeline: [{ tick: 2, type: 'create' }, { tick: 3, type: 'modify' }] }));
    assert(result.valid, `${language} ${transparency}`);
    assert.strictEqual(result.plan.transparency, 'default');
    assert.doesNotMatch(result.code, /\btrans\s*[:=]/i);
  }
}
for (const language of ['zss', 'cns']) {
  const mixedCase = spatial.generateExplod(spatial.newExplod({ language, transparency: 'SubAdd' }));
  assert(mixedCase.valid);
  assert.strictEqual(mixedCase.plan.transparency, 'subadd');
  assert.match(mixedCase.code, /trans\s*[:=]\s*subadd/i);
}
const injected = spatial.generateExplod(spatial.newExplod({ transparency: 'add; removeExplod{id: 1}' }));
assert.strictEqual(injected.valid, false);
assert(injected.issues.some((issue) => issue.field === 'transparency' && issue.level === 'error'));
const unappliedTimelineFields = spatial.generateExplod(spatial.newExplod({ timeline: [{ tick: 1, type: 'modify', scale: [2, 2], angle: 20 }] }));
assert(unappliedTimelineFields.issues.some((issue) => /does not apply per-event scale or angle/.test(issue.message)));

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
