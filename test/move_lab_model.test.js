'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-move-lab-'));
const character = path.join(root, 'chars', 'Test'); fs.mkdirSync(character, { recursive: true });
const def = path.join(character, 'Test.def'), code = path.join(character, 'states.zss'), constants = path.join(character, 'constants.zss');
fs.writeFileSync(def, '[Files]\nsprite = Test.sff\nanim = Test.air\nsound = Test.snd\nst = states.zss\ncns = constants.zss\n', 'utf8');
for (const filename of ['Test.sff', 'Test.air', 'Test.snd']) fs.writeFileSync(path.join(character, filename), '', 'utf8');
fs.writeFileSync(code, '[StateDef 200]\nhitDef {\n damage: 30;\n}\n', 'utf8');
fs.writeFileSync(constants, '[Constants]\nnormal.sLP.moveID = 200\nnormal.sLP.damage = 30\n', 'utf8');

const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { window: {}, workspace: {} };
  return original.call(this, request, parent, isMain);
};
const { buildMoveLabModel, validAttackReference } = require('../src/move_lab_model');
Module._load = original;

const disk = buildMoveLabModel(def, [], [{ filename: code, line: 1, character: 0, severity: 1, message: 'Review this', source: 'test' }]);
assert.strictEqual(disk.context.character, 'Test');
assert.strictEqual(disk.totals.states, 1);
assert.strictEqual(disk.totals.controllers, 1);
assert.strictEqual(disk.totals.diagnostics, 1);
assert(disk.files.some((file) => file.kind === 'AIR' && file.exists));
assert(disk.throws.templates.some((item) => item.id === 'command'));
assert.strictEqual(disk.attacks.controllers.length, 1);
assert.strictEqual(disk.attacks.controllers[0].stateNumber, 200);
assert(disk.attacks.controllers[0].detail.includes('damage 30'));
assert.strictEqual(disk.attacks.constantProfiles.length, 1);
assert.strictEqual(disk.attacks.constantProfiles[0].prefix, 'normal.sLP');
assert.strictEqual(disk.attacks.constantProfiles[0].linkedControllerIds.length, 1);
assert.strictEqual(disk.attacks.constantProfiles[0].defPath, def);
assert.strictEqual(disk.attacks.constantProfiles[0].sourceFilename, constants);
assert.strictEqual(typeof disk.attacks.constantProfiles[0].sourceHash, 'string');
assert.strictEqual(validAttackReference({ ...disk.attacks.controllers[0], filename: disk.attacks.controllers[0].filename.toUpperCase() }, disk.attacks), disk.attacks.controllers[0], 'exact HitDef identity accepts path case differences');
assert.strictEqual(validAttackReference({ ...disk.attacks.controllers[0], sourceHash: 'stale' }, disk.attacks), null, 'stale direct-code routes are rejected');
assert.strictEqual(validAttackReference({ ...disk.attacks.controllers[0], index: 1 }, disk.attacks), null, 'a neighboring HitDef cannot satisfy the displayed route');

const planFolder = path.join(character, '.ikemen-tools', 'throw-plans'); fs.mkdirSync(planFolder, { recursive: true });
fs.writeFileSync(path.join(planFolder, 'test.json'), JSON.stringify({ name: 'Test Throw', p1Action: 0, p2Action: 0, events: [] }), 'utf8');
const withThrow = buildMoveLabModel(def, [], []);
assert.strictEqual(withThrow.throws.plans.length, 1);
assert.strictEqual(withThrow.throws.plans[0].name, 'Test Throw');

const openDocument = { fileName: code, getText: () => '[StateDef 210]\nchangeState { value: 220; }\n[StateDef 220]\n' };
const unsaved = buildMoveLabModel(def, [openDocument], []);
assert.strictEqual(unsaved.totals.states, 2, 'unsaved editor text should drive the Move Lab outline');
assert(unsaved.sources[0].states.some((state) => state.title.includes('220')));
assert.strictEqual(unsaved.attacks.controllers.length, 0, 'unsaved editor text should also drive the attack library');

fs.rmSync(root, { recursive: true, force: true });
console.log('Move Lab model tests passed');
