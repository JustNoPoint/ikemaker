'use strict';
const assert = require('assert');
const intent = require('../src/intent_search');
const catalog = require('../src/authoring_catalog');

assert(intent.matches('Turn changes the player facing.', 'turn toward opponent'));
assert(intent.matches('VelSet controller with x and y parameters', 'stop horizontal movement'));
assert(intent.matches('ignoreHitPause if', 'run during hit pause'));
assert(intent.matches('VelSet controller', 'my stop motion', { 'my stop motion': 'velset' }));
assert(intent.matches('Check target before target access', 'safe target', { 'safe target': ['numtarget', 'check target before target access'] }));
assert(!intent.matches('PlaySnd controller', 'stop horizontal movement'));
assert.deepStrictEqual(intent.normalizeAliases({ ' My Phrase ': ' VelSet ', empty: '', bad: 4 }), { 'my phrase': ['velset'] });
assert(catalog.search('run during hit pause').some(item => item.id.includes('ignoreHitPause')));
assert(catalog.search('my local', { intentAliases: { 'my local': 'local let' } }).some(item => item.id === 'standard.structure.let'));
console.log('Intent search resolves expert-language phrases and project aliases without changing source');
