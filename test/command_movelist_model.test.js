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
const customBareOperators = model.parseCommands('[Command]\nname="custom-bare"\ncommand=foo+bar|baz\n', 'custom.cmd').commands[0];
assert(!model.diagnosticsFor(customBareOperators, [customBareOperators]).some((issue) => issue.code === 'mixed-step-operators'), 'unknown custom operators remain advisory-neutral rather than being forced through native button grammar');
const tenth = model.parseCommands('[Command]\nname="macro"\ncommand=m\n', 'offline.cmd').commands[0];
assert(model.diagnosticsFor(tenth, [tenth]).some((issue) => issue.code === 'offline-m-button'));
const overlaps = model.parseCommands(`[Command]\nname="jab"\ncommand=x\n[Command]\nname="jab_chain"\ncommand=x, y\n[Command]\nname="jab_alias"\ncommand=x\n[Command]\nname="jab"\ncommand=~x\n`).commands;
const matrix = model.commandConflictMatrix(overlaps);
assert(matrix.some(item => item.kind === 'prefix-overlap' && item.left === 0 && item.right === 1));
assert(matrix.some(item => item.kind === 'sequence-alias' && item.left === 0 && item.right === 2));
assert(matrix.some(item => item.kind === 'same-name-alternative' && item.left === 0 && item.right === 3));
assert(matrix.every(item => !/error/i.test(item.label)), 'overlaps remain review information, not invented engine errors');
const customWhitespaceConflicts = model.commandConflictMatrix(model.parseCommands('[Command]\nname="spaced"\ncommand=macro("a b")\n[Command]\nname="joined"\ncommand=macro("ab")\n[Command]\nname="native1"\ncommand=D, DF, x\n[Command]\nname="native2"\ncommand=D,DF,x\n').commands);
assert(!customWhitespaceConflicts.some(item => item.left === 0 && item.right === 1), 'review never erases potentially meaningful custom-parser whitespace to invent an alias');
assert(customWhitespaceConflicts.some(item => item.left === 2 && item.right === 3 && item.kind === 'sequence-alias'), 'ordinary native input comparison remains whitespace-insensitive');
const caseSensitiveConflicts = model.commandConflictMatrix(model.parseCommands('[Command]\nname="back"\ncommand=B\n[Command]\nname="button-b"\ncommand=b\n').commands);
assert.strictEqual(caseSensitiveConflicts.length, 0, 'facing-relative uppercase B and lowercase b button are never collapsed into one sequence');
const orderReview = model.commandInsertionReview(model.parseCommands('[Command]\nname="qcf_x"\ncommand=D, DF, F, x\n[Command]\nname="other"\ncommand=a\n').commands, { name: 'double_qcf_x', command: 'D, DF, F, D, DF, F, x' });
assert.strictEqual(orderReview.beforeIndex, 0, 'a more-specific contained motion is recommended before the shorter existing motion');
assert(orderReview.overlaps.some(item => item.name === 'qcf_x' && item.relation === 'draft-more-specific'));
const orderedDocument = model.parseCommands('[Defaults]\r\ncommand.time = 15\r\n\r\n[Command]\r\nname = "qcf_x"\r\ncommand = D, DF, F, x\r\n', 'ordered.cmd');
const inserted = model.insertCommandBlock(orderedDocument, model.commandBlock({ name: 'double_qcf_x', command: 'D, DF, F, D, DF, F, x', time: 15, steptime: 5 }), 0);
assert(inserted.indexOf('name = "double_qcf_x"') < inserted.indexOf('name = "qcf_x"'), 'reviewed insertion preserves command read order');
assert(inserted.includes('\r\n'), 'reviewed insertion follows the source line-ending convention');
assert.strictEqual(model.facingCommandTrigger({ leftName: 'walk_left', rightName: 'walk_right' }), '(facing = 1 && command = "walk_right") || (facing = -1 && command = "walk_left")');
assert(model.aerialTurnPolicy({ mode: 'distance', distance: 24 }).includes('p2Dist x < const240p(-24)'));
assert.throws(() => model.validateCommandBlockText('[Command]\nname="x"\ncommand=x\n[State 0]\ntype=Null'), /exactly one \[Command\] block/);
const everyFieldBlock = model.commandBlock({ authoringMode: 'ikemen-commercial', name: 'qcr_x', command: 'D, DR, R, x', time: 15, steptime: 5, autogreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 });
assert(everyFieldBlock.includes('time = 15') && everyFieldBlock.includes('steptime = 5'), 'starter recipes never omit or lock either timing control');
assert.strictEqual(model.commandBlockText(orderedDocument, orderedDocument.commands[0]).split(/\r\n|\r|\n/)[0], '[Command]');
assert.strictEqual(model.normalizeCommandStepForReview(' >~45$L + x '), '>~45$L+x');
assert.strictEqual(model.normalizeCommandStepForReview('custom bare Token'), 'custom bare Token', 'unknown bare custom syntax is compared conservatively');
assert.deepStrictEqual(model.nativeInputAtoms('>~45$L+x'), ['>~45$L','x']);
assert.deepStrictEqual(model.nativeInputAtoms('macro("D,F", x)'), [], 'custom parser arguments are not mined for invented native input tokens');
const customMotion = model.parseCommands('[Command]\nname="custom_motion"\ncommand=macro("D,F", x), x\n').commands[0];
assert(!model.diagnosticsFor(customMotion, [customMotion]).some((issue) => issue.code === 'negative-edge-counterpart'), 'custom-parser text does not receive native motion policy suggestions');
const customMarkers = model.parseCommands('[Command]\nname="custom_markers"\ncommand=macro("$F", m), x\n').commands[0];
assert(!model.diagnosticsFor(customMarkers, [customMarkers]).some((issue) => ['direction-modifier','offline-m-button'].includes(issue.code)), 'custom arguments do not produce native modifier or compatibility-button warnings');

const rewritten = model.replaceCommandBlock(parsed, parsed.commands[0], model.commandBlock({ name: 'qcf_y', command: 'D, DF, F, y', time: 14, steptime: 5 }));
assert(rewritten.includes('name = "qcf_y"'));
assert(rewritten.includes('[Command]\nname = "dash_f"'));
const classicCrReplaced=model.replaceCommandBlock(model.parseCommands('[Command]\rname="x"\rcommand=x\r','classic.cmd'),model.parseCommands('[Command]\rname="x"\rcommand=x\r','classic.cmd').commands[0],'[Command]\rname="y"\rcommand=y');
assert.strictEqual(classicCrReplaced,'[Command]\rname="y"\rcommand=y\r','legacy whole-block replacement retains classic CR when explicitly used');

const movelists = model.parseMovelistAssignments('[Files]\nmovelist = base.dat\nmovelist2 = mode.dat\n', 'C:\\game\\chars\\Ryu\\Ryu.def');
assert.deepStrictEqual(movelists.map((item) => item.slot), [0, 2]);
assert.strictEqual(model.movelistPreview('<#ff0000>:Special:</> _QDF^P')[0].glyphs.join(','), 'QDF,P');
const classicCrMovelists = model.parseMovelistAssignments('[Info]\rname = "Ryu"\r[Files]\rmovelist = base.dat\rmovelist3 = custom.dat\r', 'C:\\game\\chars\\Ryu\\Ryu.def');
assert.deepStrictEqual(classicCrMovelists.map(item => [item.slot,item.value]), [[0,'base.dat'],[3,'custom.dat']], 'classic CR-only DEF files retain separate movelist assignments');
assert.deepStrictEqual(model.movelistPreview('_QDF\rText\r^P').map(line => line.glyphs), [['QDF'],[],['P']], 'classic CR-only displayed movelists retain separate preview lines');
assert(model.changeMovelistSnippet(2).includes('value = 2'));

assert.deepStrictEqual(model.INSERTABLE_INPUTS.slice(0, 4).map((item) => item.value), ['L', 'R', 'B', 'F']);
assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === 'L').basis, 'absolute');
assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === 'B').basis, 'relative');
for (const token of ['DL','DR','UL','UR']) assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === token).basis, 'absolute', `${token} is offered as an explicit screen-space diagonal`);
for (const token of ['DB','DF','UB','UF']) assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === token).basis, 'relative', `${token} is offered as an explicit facing-relative diagonal`);
for (const token of ['x','y','z','a','b','c','s','w','m']) assert.strictEqual(model.INSERTABLE_INPUTS.find((item) => item.value === token).basis, 'button');
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'relative-qcf').steps, ['D','DF','F']);
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'absolute-qcr').steps, ['D','DR','R']);
assert(model.COMMAND_SEQUENCE_RECIPES.some((item) => item.id === 'relative-hcf') && model.COMMAND_SEQUENCE_RECIPES.some((item) => item.id === 'absolute-hcr'), 'motion paths cover both explicit direction bases');
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'relative-double-qcf').steps, ['D','DF','F','D','DF','F'], 'double motions are explicit editable native steps');
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'relative-charge-bf').steps, ['/B','F'], 'relative charge recipes use native hold syntax without inventing timing policy');
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'absolute-circle-right').steps, ['R','DR','D','DL','L','UL','U','UR'], 'absolute full-circle recipes retain screen-direction notation');
assert.deepStrictEqual(model.COMMAND_SEQUENCE_RECIPES.find((item) => item.id === 'vertical-charge-du').steps, ['/D','U'], 'facing-independent charge remains separate from relative and absolute policy');
assert.strictEqual(model.inputBasis('b'), 'Button input', 'native lowercase b remains distinct from uppercase facing-relative B');
assert.strictEqual(model.inputBasis('~45$L+x'), 'Absolute screen direction');
assert.strictEqual(model.inputBasis('>~45$L+x'), 'Absolute screen direction', 'combined exact/release/direction modifiers do not hide the authored basis');
assert.strictEqual(model.inputBasis('DF+x'), 'Facing-relative direction');
assert.strictEqual(model.inputBasis('DR|F'), 'Mixed absolute + facing-relative');
assert.strictEqual(model.convertDirectionBasis('>~45$L+x', 'relative'), '>~45$B+x', 'selected-step conversion preserves modifiers and simultaneous buttons');
assert.strictEqual(model.convertDirectionBasis(' /DL | UR ', 'relative'), ' /DB | UF ', 'conversion preserves authored operator spacing and outer whitespace');
assert.strictEqual(model.convertDirectionBasis('>~45$B+x', 'absolute'), '>~45$L+x');
assert.strictEqual(model.convertDirectionBasis('macro("L,R", F+x)', 'relative'), 'macro("L,R", F+x)', 'custom-parser steps are never rewritten as native directions');
assert.strictEqual(model.convertDirectionBasis('D+x', 'absolute'), 'D+x', 'direction-neutral steps remain byte-identical');
assert.strictEqual(model.convertCommandDirectionBasis('\t/D, ~45$L , R+x, macro("L,R"), UF  ', 'relative'), '\t/D, ~45$B , F+x, macro("L,R"), UF  ', 'whole-command conversion preserves separators and custom syntax while changing only recognized native directions');
assert.strictEqual(model.convertCommandDirectionBasis('D, DB, F+x, macro("B,F")', 'absolute'), 'D, DL, R+x, macro("B,F")', 'whole-command absolute conversion leaves custom direction-like parser arguments untouched');
assert.strictEqual(model.combineNativeInput('F', 'x', 'simultaneous'), 'F+x');
assert.strictEqual(model.combineNativeInput('x | y ', 'z', 'alternative'), 'x | y | z ', 'matching native relation extends the step using the author\'s existing operator spacing');
assert.strictEqual(model.combineNativeInput('x+y', 'z', 'alternative'), 'x+y', 'a relation helper never creates invalid mixed native operators');
assert.strictEqual(model.combineNativeInput('macro("F", x)', 'y', 'simultaneous'), 'macro("F", x)', 'custom-parser steps are never combined as native atoms');
assert.strictEqual(model.editNativeStepModifier(' F + x ', 'hold', 'apply'), ' /F + /x ', 'step modifier editing applies explicitly to each native atom while preserving spacing');
assert.strictEqual(model.editNativeStepModifier('>~45$F+x', 'release', 'apply', 12), '>~12$F+~12x', 'release duration replaces only existing release markers and retains other authored modifiers');
assert.strictEqual(model.editNativeStepModifier('>/~12$F + />~12x', 'release', 'remove'), '>/$F + />x', 'removing a modifier leaves every unrelated modifier and operator byte intact');
assert.strictEqual(model.editNativeStepModifier('/F|/x', 'exact', 'apply'), '>/F|>/x');
assert.strictEqual(model.editNativeStepModifier('>$F+x', 'direction', 'remove'), '>F+x');
assert.strictEqual(model.editNativeStepModifier('macro("F+x", ~30B)', 'hold', 'apply'), 'macro("F+x", ~30B)', 'custom-parser steps are never rewritten by modifier helpers');
assert.strictEqual(model.releaseFinalButtons('D, DF, F, x+y', 12), 'D, DF, F, ~12x+~12y', 'negative-edge draft helper changes only final native button atoms');
assert.strictEqual(model.releaseFinalButtons('D, DF, F+x', ''), 'D, DF, F+~x', 'a final direction/button combination retains its direction and relation');
assert.strictEqual(model.releaseFinalButtons('D, DF, F, >/~30$x'), 'D, DF, F, >/~30$x', 'an already released final button remains byte-identical');
assert.strictEqual(model.releaseFinalButtons('D, DF, macro("x+y")', 8), 'D, DF, macro("x+y")', 'custom final syntax is never interpreted as native buttons');
assert.strictEqual(model.mirrorNativeStep('>~45$DL+x|UR'), '>~45$DR+x|UL', 'step mirroring preserves modifiers, button relations, and authored operators');
assert.strictEqual(model.mirrorCommandDirections('D, DF, F+x, macro("L,R"), R'), 'D, DB, B+x, macro("L,R"), L', 'whole-command mirroring touches only recognized native direction steps');
assert.strictEqual(model.mirrorCommandDirections('macro("F,B", fn(L,R))'), 'macro("F,B", fn(L,R))', 'custom parser direction-like arguments remain byte-identical during mirroring');
const mirrorRoundTrip='\t/D, >~45$DF+x | y, macro("L,R"), UL  ';assert.strictEqual(model.mirrorCommandDirections(model.mirrorCommandDirections(mirrorRoundTrip)),mirrorRoundTrip,'mirroring twice is an exact byte-for-byte round trip for native and custom mixed command source');
const authored = '/D, ~45$L, R+x, >F|DF';
assert.strictEqual(model.editCommandSteps(authored, 'insertAfter', 1, 'B'), '/D, ~45$L, B, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'duplicate', 2), '/D, ~45$L, R+x, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'moveLeft', 2), '/D, R+x, ~45$L, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'moveFirst', 2), 'R+x, /D, ~45$L, >F|DF');
assert.strictEqual(model.editCommandSteps(authored, 'moveLast', 1), '/D, R+x, >F|DF, ~45$L');
assert.strictEqual(model.editCommandSteps(authored, 'remove', 1), '/D, R+x, >F|DF');
assert.strictEqual(model.editCommandSteps('', 'insertAfter', 0, 'L'), 'L');
const customSpacing = '\t/D,~45$L ,  R+x,\t>F|DF  ';
assert.strictEqual(model.editCommandSteps(customSpacing, 'insertAfter', 1, 'B'), '\t/D,~45$L ,  B, R+x,\t>F|DF  ', 'insertion preserves every pre-existing separator and outer whitespace');
assert.strictEqual(model.editCommandSteps(customSpacing, 'replace', 2, 'F+y'), '\t/D,~45$L ,  F+y,\t>F|DF  ', 'field editing changes only the selected step core');
assert.strictEqual(model.editCommandSteps(customSpacing, 'moveLeft', 2), '\t/D,R+x ,  ~45$L,\t>F|DF  ', 'reordering swaps only step cores and keeps positional spacing conventions');
assert.strictEqual(model.editCommandSteps(customSpacing, 'moveFirst', 2), '\tR+x,/D ,  ~45$L,\t>F|DF  ', 'move-to-start preserves every positional separator and outer whitespace');
assert.strictEqual(model.editCommandSteps(customSpacing, 'moveLast', 1), '\t/D,R+x ,  >F|DF,\t~45$L  ', 'move-to-end preserves every positional separator and outer whitespace');
assert.strictEqual(model.editCommandSteps(customSpacing, 'remove', 1), '\t/D,R+x,\t>F|DF  ', 'removal preserves the preceding positional separator and every untouched step');
const nestedCustom = 'macro("left,right", fn(1, 2)), F, x';
assert.deepStrictEqual(model.splitSteps(nestedCustom), ['macro("left,right", fn(1, 2))', 'F', 'x'], 'custom-parser commas inside quotes and nested calls are not invented into timeline boundaries');
assert.strictEqual(model.editCommandSteps(nestedCustom, 'replace', 1, 'B'), 'macro("left,right", fn(1, 2)), B, x', 'timeline replacement touches only a real top-level step beside custom syntax');
assert.strictEqual(model.editCommandSteps("custom{'a,b': [1,2]}, F, x", 'insertAfter', 0, 'D'), "custom{'a,b': [1,2]}, D, F, x", 'nested bracket and brace commas remain literal during insertion');
assert.strictEqual(model.editCommandSteps('custom("a,\\"b,c"), F, x', 'remove', 1), 'custom("a,\\"b,c"), x', 'escaped quotes do not expose inner commas as editable steps');
const customOperators = model.parseCommands('[Command]\nname="custom"\ncommand=macro("x+y|z", fn(a+b|c)), F, x\n').commands[0];
assert.strictEqual(customOperators.steps[0].relation, 'single', 'operators nested in custom-parser calls or quotes remain literal source');
assert.strictEqual(customOperators.steps[0].mixedRelation, false, 'literal nested operators do not produce a false native mixed-operator error');
assert(!model.diagnosticsFor(customOperators, [customOperators]).some((issue) => issue.code === 'mixed-step-operators'));
assert.strictEqual(model.inputBasis('macro("L|R", fn(B+F))'), 'Custom native input', 'nested direction-looking custom arguments do not receive a false absolute/relative label');
const quotedSemicolon = model.parseCommands("[Command]\nname='custom;name' ; real comment\ncommand=macro('a;b', \"c;d\"), F, x ; trailing note\n").commands[0];
assert.strictEqual(quotedSemicolon.name, 'custom;name', 'single-quoted custom values retain semicolons before the real comment');
assert.strictEqual(quotedSemicolon.command, "macro('a;b', \"c;d\"), F, x", 'quoted semicolons survive command parsing while the authored trailing comment stays separate');
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
const legacyCrSource = '[Command]\rname = "legacy"\rcommand = D, DF, F, x ; keep\rcustom.option = yes\r\r[Command]\nname = "neighbor"\ncommand = y';
const legacyCrDocument = model.parseCommands(legacyCrSource, 'legacy.cmd');
assert.strictEqual(legacyCrDocument.commands.length, 2, 'classic CR-only and mixed-line-ending command files remain parseable');
const legacyCrPatched = model.patchCommandBlock(legacyCrDocument, legacyCrDocument.commands[0], { ...legacyCrDocument.commands[0], command: 'D, DF, F, z', steptime: legacyCrDocument.commands[0].declaredStepTime });
assert(legacyCrPatched.startsWith('[Command]\rname = "legacy"\rcommand = D, DF, F, z ; keep\rcustom.option = yes\r'), 'reviewed Apply preserves CR-only lines, comments, and custom parser fields');
const addedBlock='[Command]\nname = "added"\ncommand = F, x';
assert.strictEqual(model.appendCommandBlock(model.parseCommands('[Defaults]\r\ncommand.time = 15\r\n','crlf.cmd'),addedBlock),'[Defaults]\r\ncommand.time = 15\r\n\r\n[Command]\r\nname = "added"\r\ncommand = F, x\r\n','new definitions follow the nearest CRLF convention');
assert.strictEqual(model.appendCommandBlock(model.parseCommands('[Defaults]\rcommand.time = 15\r','cr.cmd'),addedBlock),'[Defaults]\rcommand.time = 15\r\r[Command]\rname = "added"\rcommand = F, x\r','new definitions preserve classic CR-only files');
const classicCrPatchSource='[Command]\rname = "x"\rcommand = x\r',classicCrPatchDocument=model.parseCommands(classicCrPatchSource,'cr.cmd');
assert.strictEqual(model.patchCommandBlock(classicCrPatchDocument,classicCrPatchDocument.commands[0],{...classicCrPatchDocument.commands[0],bufferTime:2}),'[Command]\rname = "x"\rcommand = x\rbuffer.time = 2\r','adding a reviewed field preserves the final classic CR terminator');
assert.strictEqual(model.appendCommandBlock(model.parseCommands('[Defaults]\r\ncommand.time = 15\n','mixed.cmd'),addedBlock),'[Defaults]\r\ncommand.time = 15\n\n[Command]\nname = "added"\ncommand = F, x\n','mixed files use the nearest authored ending for newly appended source without touching prior bytes');
assert.strictEqual(model.appendCommandBlock(model.parseCommands('','empty.cmd'),addedBlock),addedBlock+'\n','a new file receives one conventional final newline');
assert.strictEqual(model.appendCommandBlock(model.parseCommands('','empty-crlf.cmd'),addedBlock.replace(/\n/g,'\r\n')+'\r\n'),addedBlock.replace(/\n/g,'\r\n')+'\r\n','an explicitly authored final CRLF is retained rather than doubled');
const pairedPreset=addedBlock+'\n\n[Command]\nname = "added"\ncommand = F, y';
assert(model.appendCommandBlock(model.parseCommands('; classic\r','paired.cmd'),pairedPreset).endsWith('[Command]\rname = "added"\rcommand = F, x\r\r[Command]\rname = "added"\rcommand = F, y\r'),'paired preset definitions inherit CR-only convention throughout the appended block');
assert(legacyCrPatched.endsWith('[Command]\nname = "neighbor"\ncommand = y'), 'reviewed Apply does not normalize a neighboring LF-authored command');
const customTimingSource = '[Defaults]\ncommand.time = 18\n[Command]\nname = "custom_timing"\ncommand = D, DF, F, x\ntime = parser.time.window\nsteptime = parser.step.window\ncustom.option = exact\n';
const customTimingDocument = model.parseCommands(customTimingSource, 'custom-parser.cmd');
const customTimingPatched = model.patchCommandBlock(customTimingDocument, customTimingDocument.commands[0], { ...customTimingDocument.commands[0], command: 'D, DF, F, y', steptime: customTimingDocument.commands[0].declaredStepTime });
assert(customTimingPatched.includes('time = parser.time.window\nsteptime = parser.step.window'), 'editing another field never replaces custom-parser timing expressions with resolved numeric fallbacks');
assert(customTimingPatched.includes('custom.option = exact'), 'custom-parser fields remain byte-preserved beside an edited native sequence');

console.log('Command and movelist model tests passed');
