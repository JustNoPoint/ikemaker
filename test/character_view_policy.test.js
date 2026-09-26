'use strict';

const assert = require('assert');
const path = require('path');
const { characterFolder, characterLabel, characterKey, reusableViewColumn, sourceColumnFor, matchingPeer, rememberCodeFile } = require('../src/character_view_policy');

const asset = path.join('C:', 'game', 'chars', 'Ryu', 'files', 'Anim.air');
assert.strictEqual(characterFolder(asset), path.join('C:', 'game', 'chars', 'Ryu'));
assert.strictEqual(characterLabel(asset), 'Ryu');
assert.strictEqual(characterKey(asset), path.join('C:', 'game', 'chars', 'Ryu').toLowerCase());
assert.strictEqual(characterKey(path.join('C:', 'game', 'data', 'common1.cns')), '');
assert.strictEqual(characterKey(path.join('C:', 'game', 'chars', 'template', 'shared.zss')), '');
assert.strictEqual(reusableViewColumn([{ panel: { viewColumn: 3 } }], 2), 3);
assert.strictEqual(reusableViewColumn([], 2), 2);
assert.strictEqual(sourceColumnFor(3, -2), 2);
assert.strictEqual(sourceColumnFor(1, -2), -2);
const ryuAir = { characterKey: 'ryu', kind: 'air', panel: { viewColumn: 3 } };
const gokuSff = { characterKey: 'goku', kind: 'sff', panel: { viewColumn: 2 } };
const ryuSff = { characterKey: 'ryu', kind: 'sff', panel: { viewColumn: 2 } };
assert.strictEqual(matchingPeer([ryuAir, gokuSff, ryuSff], ryuAir, gokuSff), ryuSff);
assert.strictEqual(rememberCodeFile(path.join('C:', 'game', 'chars', 'Ryu', 'states.zss'), 2), true);
assert.strictEqual(rememberCodeFile(path.join('C:', 'game', 'data', 'common1.cns'), 2), false);

console.log('Character viewer tab-group policy tests passed');
