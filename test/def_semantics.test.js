'use strict';

const assert = require('assert');
const path = require('path');
const { classifyReference, references } = require('../src/def_semantics');

const characterDef = path.join('D:', 'game', 'chars', 'Ryu', 'Ryu.def');
assert.strictEqual(classifyReference(characterDef, 'sprite', 'files/Ryu.sff').ownership, 'character');
assert.strictEqual(classifyReference(characterDef, 'st', 'states/normals.zss').ownership, 'character');
assert.strictEqual(classifyReference(characterDef, 'stcommon', 'common.zss').ownership, 'common');
assert.strictEqual(classifyReference(characterDef, 'st9', '../../common/states.zss').ownership, 'common');
assert.strictEqual(classifyReference(characterDef, 'fx', 'shared/sounds.def').ownership, 'common');
assert.strictEqual(classifyReference(characterDef, 'name', 'Ryu'), null);

const found = references('[Info]\nname = "Ryu"\n[Files]\nsprite = files/Ryu.sff ; local\nstcommon = ../../data/common.zss\n', characterDef);
assert.deepStrictEqual(found.map((item) => [item.key, item.value, item.ownership]), [
  ['sprite', 'files/Ryu.sff', 'character'],
  ['stcommon', '../../data/common.zss', 'common']
]);
assert.strictEqual(found[0].resolvedPath,path.resolve(path.dirname(characterDef),'files/Ryu.sff'),'DEF ownership records retain the exact resolved target used by native hover and navigation');
assert.strictEqual(found[1].resolvedPath,path.resolve(path.dirname(characterDef),'../../data/common.zss'),'shared references retain their exact resolved target without substituting a project-local file');

console.log('DEF semantic ownership tests passed');
