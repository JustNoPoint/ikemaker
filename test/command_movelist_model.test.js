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
const customSpacing = '\t/D,~45$L ,  R+x,\t>F|DF  ';
assert.strictEqual(model.editCommandSteps(customSpacing, 'insertAfter', 1, 'B'), '\t/D,~45$L ,  B, R+x,\t>F|DF  ', 'insertion preserves every pre-existing separator and outer whitespace');
assert.strictEqual(model.editCommandSteps(customSpacing, 'replace', 2, 'F+y'), '\t/D,~45$L ,  F+y,\t>F|DF  ', 'field editing changes only the selected step core');
assert.strictEqual(model.editCommandSteps(customSpacing, 'moveLeft', 2), '\t/D,R+x ,  ~45$L,\t>F|DF  ', 'reordering swaps only step cores and keeps positional spacing conventions');
assert.strictEqual(model.editCommandSteps(customSpacing, 'remove', 1), '\t/D,R+x,\t>F|DF  ', 'removal preserves the preceding positional separator and every untouched step');
const mixedMovelist='First\r\nSecond\nThird\rFourth';
assert.strictEqual(model.mergeNormalizedEditorText(mixedMovelist,'First\nSecond changed\nThird\nFourth','\r\n'),'First\r\nSecond changed\nThird\rFourth','source typing changes only the edited text and preserves every untouched mixed line ending');
assert.strictEqual(model.mergeNormalizedEditorText('First\r\nSecond\nThird','First\nSecond\nInserted\nThird','\r\n'),'First\r\nSecond\nInserted\nThird','a newly typed newline follows the nearest authored local convention without normalizing other lines');
assert.strictEqual(model.mergeNormalizedEditorText(mixedMovelist,mixedMovelist.replace(/\r\n|\r/g,'\n'),'\r\n'),mixedMovelist,'textarea newline normalization alone is a byte-exact no-op');

const extendedSource = `[Command] ; authored header
  name="qcf_x" ; keep name note
command\t=\tD,DF,F,x   ; keep sequence note
custom.parser.option = exact
; trailing authored note

[Command]
name = "next"
command = y`;
const extendedDocument = model.parseCommands(extendedSource, 'extended.cmd');
const patched = model.patchCommandBlock(extendedDocument, extendedDocument.commands[0], {
  name: 'qcf_x', command: 'D,DF,F,y', time: 15, steptime: -1, autogreater: 1,
  bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1
});
assert(patched.includes('command\t=\tD,DF,F,y   ; keep sequence note'), 'Apply patches only the changed assignment value');
assert(patched.includes('custom.parser.option = exact\n; trailing authored note'), 'custom parser fields and authored comments survive Apply');
assert(!patched.includes('\ntime = 15'), 'resolved defaults are not inserted when the author did not change them');
assert(patched.endsWith('[Command]\nname = "next"\ncommand = y'), 'neighboring command blocks remain byte-identical');
const mixedExtended = extendedSource.replace('command\t=\tD,DF,F,x   ; keep sequence note\n', 'command\t=\tD,DF,F,x   ; keep sequence note\r\n');
const mixedDocument = model.parseCommands(mixedExtended, 'mixed.cmd');
const mixedPatched = model.patchCommandBlock(mixedDocument, mixedDocument.commands[0], { ...mixedDocument.commands[0], command: 'D,DF,F,z', steptime: mixedDocument.commands[0].declaredStepTime });
assert(mixedPatched.includes('command\t=\tD,DF,F,z   ; keep sequence note\r\ncustom.parser.option'), 'field patching preserves mixed line endings around untouched source');

console.log('Command and movelist model tests passed');
