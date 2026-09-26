'use strict';

const assert = require('assert');
const { textGrammar, seedForTarget, validateDestinationSeed } = require('../src/map_registry_ui');

const document = (fileName, languageId = 'plaintext') => ({ fileName, languageId, uri: { toString: () => `file:///${fileName}` } });
const notes = document('notes.txt'), legacy = document('legacy.txt');
const choices = { [notes.uri.toString()]: 'zss', [legacy.uri.toString()]: 'ikemen-cns' };
const context = { workspaceState: { get: () => choices } };

assert.strictEqual(textGrammar(document('move.zss')), 'zss');
assert.strictEqual(textGrammar(document('commands.cmd')), 'ikemen-cns');
assert.strictEqual(textGrammar(document('states.st')), 'ikemen-cns');
assert.strictEqual(textGrammar(notes, context), 'zss');
assert.strictEqual(textGrammar(legacy, context), 'ikemen-cns');
assert.strictEqual(textGrammar(document('readme.txt')), '');
assert.strictEqual(textGrammar(document('anything.txt', 'zss')), 'zss');
const captured = { kind: 'editor', uri: 'file:///DvS/character.txt' };
assert.strictEqual(seedForTarget({ Uri: { parse: (value) => ({ value }) } }, undefined, captured).value, captured.uri, 'project scan seed must stay frozen to the captured destination even if the active editor later changes');
assert.strictEqual(seedForTarget({ Uri: { parse: () => { throw new Error('explicit seed must win'); } } }, { value: 'explicit' }, captured).value, 'explicit');
const vscode = { Uri: { parse: (value) => ({ fsPath: value.replace('file:///', ''), toString: () => value }) } };
const scoped = { scope: (seed) => seed.fsPath.includes('SF6') ? { projectId: 'sf6', identity: 'SF6.def', dependencies: ['sf6.zss'] } : { projectId: 'dvs', identity: 'DvS.def', dependencies: ['dvs.zss'] } };
const dvsTarget = { kind: 'editor', uri: 'file:///DvS/character.txt' };
assert.strictEqual(validateDestinationSeed(scoped, vscode, { fsPath: 'SF6/source.zss' }, dvsTarget).target, null, 'a browser opened for SF6 must be browse-only when the captured destination belongs to DvS');
assert.strictEqual(validateDestinationSeed(scoped, vscode, { fsPath: 'DvS/source.zss' }, dvsTarget).target, dvsTarget, 'a matching browser project must retain its insertion destination');

console.log('Map registry text grammar requires explicit generic .txt opt-in');
