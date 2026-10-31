'use strict';
const assert = require('assert');
const { buildSpriteExplorerModel, resolveSelectedSprites, createActionFromSpritesPatch, appendSpritesToActionPatch } = require('../src/air_sprite_explorer');

const archive = { sprites: [
  { group: 0, number: 0, width: 10, height: 20 },
  { group: 0, number: 1, width: 11, height: 21 },
  { group: 10, number: 4, width: 12, height: 22 }
] };

const model = buildSpriteExplorerModel(archive, { '0,1': { customName: 'Turn', note: 'reviewed', flags: ['Favorite', 'Axis'] } });
assert.deepStrictEqual(model.groups, [0, 10]);
assert.deepStrictEqual(model.sprites.map(item => item.physicalIndex), [0, 1, 2]);
assert.strictEqual(model.sprites[1].customName, 'Turn');
assert.deepStrictEqual(model.sprites[1].flags, ['favorite', 'axis']);
assert.deepStrictEqual(model.sprites[0].flags, []);
assert.deepStrictEqual(resolveSelectedSprites(archive, [2, 0]).map(item => [item.group, item.index]), [[10, 4], [0, 0]]);

const created = createActionFromSpritesPatch('', { action: 25, comment: 'Selected sprites', time: 3, frames: resolveSelectedSprites(archive, [1, 0]) });
assert.strictEqual(created.text, '; Selected sprites\n[Begin Action 25]\n0, 1, 0, 0, 3\n0, 0, 0, 0, 3');

const source = '[Begin Action 0]\n0, 0, 0, 0, 4\n\n; next heading\n[Begin Action 1]\n0, 1, 0, 0, 4';
const appended = appendSpritesToActionPatch(source, { action: 0, time: 2, frames: resolveSelectedSprites(archive, [2]) });
const result = source.slice(0, appended.start) + appended.text + source.slice(appended.end);
assert.ok(result.includes('0, 0, 0, 0, 4\n10, 4, 0, 0, 2\n\n; next heading'));
assert.throws(() => resolveSelectedSprites(archive, [8]), /stale or malformed/);
assert.throws(() => createActionFromSpritesPatch(source, { action: 1, time: 1, frames: [{ group: 0, index: 0 }] }), /already exists/);

console.log('air_sprite_explorer tests passed');
