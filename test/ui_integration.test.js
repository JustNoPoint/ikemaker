'use strict';

const assert = require('assert');
const { identifier, characterUiBridge, previewProfile } = require('../src/ui_integration');
assert.strictEqual(identifier('JNP SF6.'), 'JNPSF6');
const source = characterUiBridge({ prefix: 'SF6_UI_', fightName: 'JNP Fight', localCoord: [1280, 720], message: 'PUNISH COUNTER' });
assert.match(source, /fightScreenVar\(info\.name\) = "JNP Fight"/);
assert.match(source, /lifebarAction\{/);
assert.match(source, /refreshtype: 2/);
assert.match(source, /PUNISH COUNTER/);
const profile = previewProfile({ p1: 'Ryu', p2: 'Ken' });
assert.strictEqual(profile.profiles[0].players[0].name, 'Ryu');
assert.match(profile.note, /Editor-only/);
console.log('Character UI integration tests passed');
