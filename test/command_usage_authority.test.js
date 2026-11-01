'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash } = require('../src/mutation_safety');
const authority = require('../src/command_usage_authority');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-command-use-'));
const defPath = path.join(root, 'Hero.def'), sourcePath = path.join(root, 'Hero.zss'), commandPath = path.join(root, 'Hero.cmd');
const defText = '[Files]\ncmd = Hero.cmd\nst = Hero.zss\n';
const sourceText = `[StateDef 200; type: S]\nif command = "fireball" || command = "fireball" {\n\tchangeState{value: 210}\n}\nif SelfCommand = "fireball" { changeState{value: 210} }\nif enemynear, Command = "fireball" { changeState{value: 210} }\n# command = "commented"\nlet note := 'command = "ordinary"';\nif command != "release" { changeState{value: 0} }`;
const commandText = `[Command]\nname = "fireball"\ncommand = D, DF, F, x\n\n[Command]\nname = "fireball"\ncommand = D, DF, F, y\n\n[Command]\nname = "Release"\ncommand = ~x\n`;
fs.writeFileSync(defPath, defText); fs.writeFileSync(sourcePath, sourceText); fs.writeFileSync(commandPath, commandText);

const component = { kind: 'state', syntax: 'zss', filename: sourcePath, startLine: 0, endLine: sourceText.split('\n').length - 1, text: sourceText, sourceHash: hash(sourceText), rangeHash: hash(sourceText), stableId: 'state-200', signature: '200', reference: { defPath } };
const base = { defPath, defText, defDirty: false, sourceText, commandPath, commandText, commandHash: hash(commandText), commandVersion: null, commandAvailable: true, generation: 7 };
let serial = 0;
const built = authority.buildCommandUsageAuthorities(component, { ...base, token: () => (++serial).toString(16).padStart(48, '0') });
assert.strictEqual(built.publicUses.available, true);
assert.deepStrictEqual(built.publicUses.items.map(item => [item.name, item.trigger, item.redirected, item.familyCount, item.available]), [['fireball', 'command', false, 2, true], ['fireball', 'command', false, 2, true], ['fireball', 'selfcommand', false, undefined, false], ['fireball', 'command', true, undefined, false], ['release', 'command', false, undefined, false]], 'trigger ownership remains explicit, SelfCommand and redirected uses do not certify the local family, same-name definitions form a family, and differently cased names stay unresolved');
assert.match(built.publicUses.items.find(item => item.trigger === 'selfcommand').reason, /working state owner/);
assert.strictEqual(built.authorities.size, 2);
const first = [...built.authorities.values()][0];
assert.strictEqual(first.familyCount, 2); assert.strictEqual(first.commandName, 'fireball');
assert.strictEqual(Object.prototype.hasOwnProperty.call(first, 'family'), false, 'routes bind compact family identity instead of duplicating definition arrays per occurrence');
assert(authority.validateCommandUsageAuthority(first, component, { ...base, token: () => first.route }));
assert.strictEqual(authority.validateCommandUsageAuthority({ ...first, commandName: 'Fireball' }, component, { ...base, token: () => first.route }), null, 'forged case-sensitive identity fails closed');
assert.strictEqual(authority.validateCommandUsageAuthority(first, component, { ...base, generation: 8, token: () => first.route }), null, 'stale generation fails closed');
assert.strictEqual(authority.validateCommandUsageAuthority(first, component, { ...base, commandText: commandText.replace('F, x', 'F, z'), commandHash: hash(commandText.replace('F, x', 'F, z')), token: () => first.route }), null, 'same-range command drift fails closed');
assert.deepStrictEqual(authority.buildCommandUsageAuthorities(component, { ...base, capabilities: { channel: 'stable' }, token: () => 'a'.repeat(48) }).publicUses.items.map(item => item.name), authority.buildCommandUsageAuthorities(component, { ...base, capabilities: { channel: 'nightly', features: ['string-command'] }, token: () => 'b'.repeat(48) }).publicUses.items.map(item => item.name), 'classic command-use projection is target-neutral');

const cnsText = `[StateDef 300]\rtrigger1 = command = "x" ; command = "ignored"\rtrigger2 = command = var(0)\r`;
const cns = { ...component, syntax: 'cns', filename: path.join(root, 'Hero.cns'), endLine: 3, text: cnsText.replace(/\r/g, '\n'), sourceHash: hash(cnsText), rangeHash: hash(cnsText.replace(/\r/g, '\n')) };
const cnsBuilt = authority.buildCommandUsageAuthorities(cns, { ...base, sourceText: cnsText, token: () => 'c'.repeat(48) });
assert.deepStrictEqual(cnsBuilt.publicUses.items.map(item => item.name), ['x'], 'CNS semicolon comments and dynamic expressions are excluded');

const missing = authority.buildCommandUsageAuthorities(component, { ...base, defDirty: true, token: () => 'd'.repeat(48) });
assert.strictEqual(missing.publicUses.available, false);
const manyUses = `[StateDef 1]\n${Array.from({ length: authority.MAX_COMPONENT_COMMAND_USES + 1 }, () => 'if command = "fireball" {}').join('\n')}`;
const oversizedComponent = { ...component, endLine: authority.MAX_COMPONENT_COMMAND_USES + 1, text: manyUses, sourceHash: hash(manyUses), rangeHash: hash(manyUses) };
assert.strictEqual(authority.buildCommandUsageAuthorities(oversizedComponent, { ...base, sourceText: manyUses, token: () => 'e'.repeat(48) }).publicUses.available, false, 'occurrence overflow fails closed rather than exposing a partial route set');

let parses = 0;
const sharedSnapshot = authority.buildCommandFamilySnapshot({ ...base, parseCommands: (...args) => { parses += 1; return require('../src/command_movelist_model').parseCommands(...args); } });
for (let index = 0; index < 200; index += 1) authority.buildCommandUsageAuthorities({ ...component, stableId: `state-${index}` }, { ...base, commandSnapshot: sharedSnapshot, token: () => (index + 1).toString(16).padStart(48, '0') });
assert.strictEqual(parses, 1, 'many selected blocks and repeated uses reuse one immutable command-family parse/index for the decoration generation');
const definitionFlood = Array.from({ length: authority.MAX_COMMAND_DEFINITIONS + 1 }, (_, index) => `[Command]\nname = "c${index}"\ncommand = x`).join('\n');
const flooded = authority.buildCommandFamilySnapshot({ commandPath, commandText: definitionFlood, commandHash: hash(definitionFlood), commandVersion: null, commandAvailable: true });
assert.strictEqual(flooded.complete, false, 'global command-definition overflow invalidates the whole family snapshot');
const familyFlood = Array.from({ length: authority.MAX_COMMAND_FAMILY_DEFINITIONS + 1 }, () => '[Command]\nname = "same"\ncommand = x').join('\n');
assert.strictEqual(authority.buildCommandFamilySnapshot({ commandPath, commandText: familyFlood, commandHash: hash(familyFlood), commandVersion: null, commandAvailable: true }).complete, false, 'same-name family overflow invalidates the whole family snapshot');

const target = authority.readCommandTargetContext(defPath, { openDocuments: [] });
assert(target && authority.validateCommandFamilyTarget(first, target), 'closed exact DEF and command bytes validate the target family');
const openCommand = { fileName: commandPath, version: 4, isDirty: true, isClosed: false, getText: () => commandText };
const openTarget = authority.readCommandTargetContext(defPath, { openDocuments: [openCommand] });
const openBuilt = authority.buildCommandUsageAuthorities(component, { ...base, commandVersion: '4', token: () => 'f'.repeat(48) }), openRoute = [...openBuilt.authorities.values()][0];
assert(authority.validateCommandFamilyTarget(openRoute, openTarget), 'a dirty open command document is valid only when its exact adopted version is bound');
openCommand.version = 5;
assert(!authority.validateCommandFamilyTarget(openRoute, authority.readCommandTargetContext(defPath, { openDocuments: [openCommand] })), 'open command version drift revokes target adoption even when text bytes match');

fs.rmSync(root, { recursive: true, force: true });
console.log('Exact selected-block command uses and same-name command-family authority passed');
