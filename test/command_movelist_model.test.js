'use strict';

const assert = require('assert');
const model = require('../src/command_movelist_model');

const source = `[Defaults]
command.time = 18
command.steptime = 7
command.buffer.time = 2

[Command]
name = "qcf_x"
command = D, DF, F, x
time = 15
steptime = 6
buffer.hitpause = 1

[Command]
name = "dash_f"
command = F, F
autogreater = 0
`;
const parsed = model.parseCommands(source, 'test.cmd');
assert.strictEqual(parsed.commands.length, 2);
assert.strictEqual(parsed.commands[0].steps.length, 4);
assert.strictEqual(parsed.commands[0].time, 15);
assert.strictEqual(parsed.commands[0].stepTime, 6);
assert.strictEqual(parsed.commands[0].bufferTime, 2);
assert.strictEqual(parsed.commands[1].stepTime, 7);
assert(model.diagnosticsFor(parsed.commands[0], parsed.commands).some((issue) => issue.code === 'negative-edge-counterpart'));
assert(!model.diagnosticsFor(parsed.commands[1], parsed.commands).some((issue) => issue.code === 'autogreater-repeat'));

const invalid = model.parseCommands('[Command]\nname="bad"\ncommand=x+y|z\n', 'bad.cmd').commands[0];
assert(model.diagnosticsFor(invalid, [invalid]).some((issue) => issue.code === 'mixed-step-operators'));
const tenth = model.parseCommands('[Command]\nname="macro"\ncommand=m\n', 'offline.cmd').commands[0];
assert(model.diagnosticsFor(tenth, [tenth]).some((issue) => issue.code === 'offline-m-button'));

const rewritten = model.replaceCommandBlock(parsed, parsed.commands[0], model.commandBlock({ name: 'qcf_y', command: 'D, DF, F, y', time: 14, steptime: 5 }));
assert(rewritten.includes('name = "qcf_y"'));
assert(rewritten.includes('[Command]\nname = "dash_f"'));

const movelists = model.parseMovelistAssignments('[Files]\nmovelist = base.dat\nmovelist2 = mode.dat\n', 'C:\\game\\chars\\Ryu\\Ryu.def');
assert.deepStrictEqual(movelists.map((item) => item.slot), [0, 2]);
assert.strictEqual(model.movelistPreview('<#ff0000>:Special:</> _QDF^P')[0].glyphs.join(','), 'QDF,P');
assert(model.changeMovelistSnippet(2).includes('value = 2'));

assert.deepStrictEqual(model.INSERTABLE_INPUTS.slice(0, 4).map((item) => item.value), ['L', 'R', 'B', 'F']);
assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === 'L').basis, 'absolute');
assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === 'B').basis, 'relative');
const authored = '/D, ~45$L, R+x, >F|DF';
assert.strictEqual(model.editCommandSteps(authored, 'insertAfter', 1, 'B'), '/D, ~45$L, B, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'duplicate', 2), '/D, ~45$L, R+x, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'moveLeft', 2), '/D, R+x, ~45$L, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'remove', 1), '/D, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps('', 'insertAfter', 0, 'L'), 'L');

console.log('Command and movelist model tests passed');
