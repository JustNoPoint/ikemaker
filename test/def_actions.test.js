'use strict';

const assert = require('assert');
const { embeddedActions } = require('../src/def_actions');

const actions = embeddedActions(`
[Begin Action 10]
; comment
100, 2, -3, 4, 5

[Begin Action -1]
200, 0, 0, 0, -1
`);

assert.deepStrictEqual(actions[10], { frames: [{ sprite: [100, 2], offset: [-3, 4], time: 5 }], sprite: [100, 2], offset: [-3, 4], time: 5 });
assert.deepStrictEqual(actions[-1], { frames: [{ sprite: [200, 0], offset: [0, 0], time: -1 }], sprite: [200, 0], offset: [0, 0], time: -1 });
console.log('Embedded DEF action tests passed');
