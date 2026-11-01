'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { buildCommandInputReferenceSnapshot, validateCommandInputSourceAuthority } = require('../src/command_input_reference_authority');

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const zss = `
State 200 {
  AssertCommand {
    name: "fireball";
    buffer.time: 0;
  }
  AssertCommand { name: map(command_name); }
  AssertCommand { name: ""; }
  AssertCommand { buffer.time: 2; }
  AssertCommand { RedirectID: 7; name: "fireball"; }
  AssertInput { flag2: F; flag8: x; }
  ShiftInput { RedirectID: 20; input: L; output: none; }
  ShiftInput { input: none; output: none; }
  ShiftInput { input: B; output: x; }
  AssertAnalogVector { leftx: .5; righttrigger: 1; }
  AssertSpecial { flag: NoInput; flag2: NoAICheat; }
  let axis = Analog(LeftX);
  let invalidAxis = Analog(BogusAxis);
  if Command = "fireball" || SelfCommand = "fireball" {
  }
  if player(1), Command = "fireball" {
  }
  if target, Command = "fireball" || helper, Command = "fireball" || enemy, Command = "fireball" || enemynear, Command = "fireball" || partner, Command = "fireball" {
  }
  # AssertCommand { name: "commented"; }
  let fake = "AssertInput { flag: x; }";
  let fakeCommand = "Command = \\"fireball\\"";
}
`;
const cns = `
[State 0]
type = AssertInput
flag8 = m

[State 1]
type = AssertCommand
name = "missing"
buffer.time = -2
`;
const lua = `-- commandBufReset(9)\n--[[ commandBufReset(8) ]]\nlocal fake = [=[commandBufReset(7)]=]\nlocal emoji = "🎮"\nobj.commandBufReset(6)\nCommandBufReset(5)\ncommandBufReset()\ncommandBufReset(playerNo)`;
const sources = [
  { available: true, dirty: false, filename: 'C:/Game/Hero/state.zss', syntax: 'zss', text: zss, sourceHash: hash(zss), version: 2 },
  { available: true, dirty: false, filename: 'C:/Game/Hero/legacy.cns', syntax: 'cns', text: cns, sourceHash: hash(cns), version: null },
  { available: true, dirty: false, filename: 'C:/Game/Hero/input.lua', syntax: 'lua', text: lua, sourceHash: hash(lua), version: 4 }
];
let sequence = 0;
const context = { inventoryComplete: true, assignedSources: sources.map(item => item.filename), sources, commandFamilies: [{ name: 'fireball', count: 2 }], generation: 7, nightly: true, token: () => (++sequence).toString(16).padStart(48, '0') };
const snapshot = buildCommandInputReferenceSnapshot(context);
assert(snapshot.public.available);
assert.strictEqual(snapshot.public.occurrences.filter(item => item.relation === 'command-assert').length, 6);
assert.strictEqual(snapshot.public.occurrences.find(item => item.commandName === 'fireball').status, 'exact');
assert(snapshot.public.occurrences.some(item => item.relation === 'command-assert' && item.status === 'dynamic'));
assert(snapshot.public.occurrences.some(item => item.relation === 'command-assert' && item.status === 'random'));
assert(snapshot.public.occurrences.some(item => item.relation === 'command-assert' && item.status === 'unresolved' && /requires name/.test(item.reason)), 'omitted name is distinguished from an explicit empty-string random selector');
assert(snapshot.public.occurrences.some(item => item.commandName === 'missing' && item.status === 'missing'));
assert(snapshot.public.occurrences.some(item => item.relation === 'command-assert' && item.redirect && item.status === 'dynamic'), 'redirected AssertCommand is not certified against the local family');
const digital = snapshot.public.occurrences.filter(item => item.relation === 'digital-assert');
assert.strictEqual(digital.length, 2, 'flag2/flag8-only controllers are indexed');
assert(digital.some(item => item.details.includes('F, x')));
const shift = snapshot.public.occurrences.find(item => item.relation === 'digital-remap' && item.redirect);
assert.match(shift.reason, /RedirectID/);
assert(snapshot.public.occurrences.some(item => item.relation === 'digital-remap' && item.details.includes('none → none restores mappings')));
assert(snapshot.public.occurrences.some(item => item.relation === 'digital-remap' && item.details.includes('B → x') && item.status === 'unresolved'), 'ShiftInput rejects facing-relative B/F tokens just like the compiler');
assert(snapshot.public.occurrences.some(item => item.relation === 'analog-assert' && item.details.includes('omitted axes are written as zero')));
assert(snapshot.public.occurrences.some(item => item.relation === 'analog-query'));
assert(snapshot.public.occurrences.some(item => item.relation === 'analog-query' && item.details.includes('BogusAxis') && item.status === 'unresolved'));
const queries = snapshot.public.occurrences.filter(item => item.relation === 'command-query');
assert.strictEqual(queries.length, 8, 'Command and SelfCommand triggers stay distinct typed relationships while quoted fake code is excluded');
assert(queries.some(item => item.controller === 'Command trigger' && item.commandName === 'fireball' && item.status === 'exact'));
assert(queries.some(item => item.controller === 'SelfCommand trigger' && item.commandName === 'fireball' && item.status === 'dynamic' && /working state owner/.test(item.reason)), 'even a literal SelfCommand remains unresolved without current working-state ownership proof');
for (const redirect of ['player(1)', 'target', 'helper', 'enemy', 'enemynear', 'partner']) assert(queries.some(item => item.redirect.toLowerCase().includes(redirect) && item.status === 'dynamic'), `${redirect} Command queries do not claim local command ownership`);
assert(snapshot.public.occurrences.some(item => item.relation === 'input-policy' && item.details.includes('NoInput, NoAICheat')));
const luaRows = snapshot.public.occurrences.filter(item => item.relation === 'lua-buffer-reset');
assert.strictEqual(luaRows.length, 2, 'Lua comments are excluded and Lua calls remain typed separately');
assert(luaRows.some(item => item.status === 'dynamic'));
for (const item of luaRows) assert.strictEqual(lua.slice(item.start, item.end).startsWith('commandBufReset('), true, 'Lua authority offsets remain exact UTF-16 offsets after astral characters');
const exact = snapshot.public.occurrences.find(item => item.commandName === 'fireball'), authority = snapshot.authorities.get(exact.route);
sequence = 0;
assert(validateCommandInputSourceAuthority(authority, context));
assert(!validateCommandInputSourceAuthority(authority, { ...context, generation: 8 }));
assert.strictEqual(buildCommandInputReferenceSnapshot({ ...context, sources: [{ ...sources[0], dirty: true }], assignedSources: [sources[0].filename] }).public.available, false);

console.log('Command/input reference authority tests passed');
