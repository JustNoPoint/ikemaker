'use strict';

const assert = require('assert');
const obsoleteBaseline = new RegExp(['night' + 'ly', 'release ' + 'candidate', '\\bR' + 'C\\d*\\b'].join('|'), 'i');
const api = require('../data/lua-api.json');
const { callableInsert, luaCompletionModels, luaHoverModel } = require('../src/language_intelligence');

assert.ok(api.length >= 330);
assert.ok(api.every((entry) => entry.name && entry.signature && entry.description && entry.category));
assert.ok(!obsoleteBaseline.test(JSON.stringify(api)));

const addChar = api.find((entry) => entry.name === 'addChar');
assert.ok(addChar);
assert.strictEqual(callableInsert(addChar), 'addChar(${1:defpath}, ${2:params})');
assert.ok(addChar.parameters.includes('defpath'));

const completions = luaCompletionModels({ linePrefix: 'local ok = add', experience: 'learning', api });
assert.ok(completions.some((entry) => entry.label === 'addChar'));
assert.ok(!completions.some((entry) => entry.kind === 'hook'));
assert.deepStrictEqual(luaCompletionModels({ linePrefix: '-- comment', api }), []);

const learning = luaHoverModel({ word: 'animDraw', experience: 'learning', api });
assert.ok(learning.summary.includes('animation'));
assert.ok(learning.explanation.includes('Parameters:'));
const advanced = luaHoverModel({ word: 'animDraw', experience: 'advanced', api });
assert.strictEqual(advanced.explanation, '');

console.log('Lua language intelligence tests passed');
