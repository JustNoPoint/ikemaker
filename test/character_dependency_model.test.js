'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCharacterDependencyModel, referencedPath, assignedPath } = require('../src/character_dependency_model');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-character-tree-'));
try {
  const character = path.join(directory, 'chars', 'Ryu'), shared = path.join(directory, 'chars', 'template'), data = path.join(directory, 'data');
  fs.mkdirSync(character, { recursive: true }); fs.mkdirSync(shared, { recursive: true }); fs.mkdirSync(data, { recursive: true });
  const def = path.join(character, 'Ryu.def');
  fs.writeFileSync(def, '[Files]\nsprite=Ryu.sff\nanim=Ryu.air\ncmd=Ryu.mfg\nst=../template/common.zss\nst1=normals.zss\nst2=options.txt\nsound=missing.snd\n');
  fs.writeFileSync(path.join(character, 'Ryu.sff'), ''); fs.writeFileSync(path.join(character, 'Ryu.air'), '');
  fs.writeFileSync(path.join(character, 'Ryu.mfg'), '[Command]\nname = "x"\ncommand = x\n');
  fs.writeFileSync(path.join(character, 'normals.zss'), '[StateDef 200]\ncall SharedHit();\nchangeState{value: 9000;}\n');
  fs.writeFileSync(path.join(character, 'options.txt'), '[Function TxtOptions()]\ncall SharedHit();\n');
  fs.writeFileSync(path.join(shared, 'common.zss'), '[Function SharedHit()]\n[StateDef 9000]\n');
  const model = buildCharacterDependencyModel(def);
  assert.strictEqual(model.character, 'Ryu');
  assert.strictEqual(model.summary.missing, 1);
  assert.ok(model.edges.some((edge) => edge.type === 'assignment' && edge.label === '[Files] st'));
  assert.ok(model.nodes.some((node) => node.filename.endsWith('Ryu.mfg') && node.kind === 'Commands'));
  assert.ok(model.edges.some((edge) => edge.type === 'function' && /SharedHit/.test(edge.label)));
  assert.ok(model.edges.some((edge) => edge.type === 'state' && /9000/.test(edge.label)));
  assert.ok(model.edges.some((edge) => edge.type === 'function' && edge.from.endsWith('options.txt') && /SharedHit/.test(edge.label)));
  assert.strictEqual(referencedPath(def, 'Ryu.air'), path.join(character, 'Ryu.air'));
  assert.strictEqual(referencedPath(def, 'not a path'), '');
  fs.writeFileSync(path.join(data, 'common1.cns'), '[Statedef 0]\n');
  assert.strictEqual(assignedPath(def, 'common1.cns', 'stcommon'), path.join(data, 'common1.cns'));
  fs.unlinkSync(path.join(data, 'common1.cns'));
  fs.writeFileSync(path.join(data, 'common1.cns.zss'), '[StateDef 0]\n');
  assert.strictEqual(assignedPath(def, 'common1.cns', 'stcommon'), path.join(data, 'common1.cns.zss'));
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
console.log('Character dependency model tests passed');
