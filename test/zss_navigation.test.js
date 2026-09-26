'use strict';

const assert = require('assert');
const { allSymbols, symbolAt, referencesFor, definitionsFor, canRename, validRename } = require('../src/zss_navigation');

const first = `[Function JNP_Test(value)]\nlet ret = map(JNP.Test.Value);\n\n[StateDef 200]\ncall JNP_Test(1);`;
const second = `[Function JNP_Other()]\nmap(JNP.Test.Value) := 4;\ncall JNP_Test(2);\nchangeState{\n\tvalue: 200;\n}`;
const entries = [{ uri: 'one', text: first }, { uri: 'two', text: second }];
const declaration = symbolAt(first, 0, 12);
assert.strictEqual(declaration.kind, 'function');
assert.strictEqual(declaration.name, 'JNP_Test');
assert.strictEqual(definitionsFor(entries, declaration).length, 1);
assert.strictEqual(referencesFor(entries, declaration, true).length, 3);
assert.strictEqual(referencesFor(entries, declaration, false).length, 2);
assert.ok(canRename(declaration));
assert.ok(validRename(declaration, 'SF6_Test.Renamed'));
assert.ok(!validRename(declaration, 'bad name'));

const map = allSymbols(second).find((entry) => entry.kind === 'map');
assert.strictEqual(definitionsFor(entries, map).length, 1);
assert.strictEqual(definitionsFor(entries, map)[0].uri, 'two');
assert.strictEqual(referencesFor(entries, map).length, 2);
assert.ok(canRename(map));

const state = allSymbols(first).find((entry) => entry.kind === 'state');
assert.strictEqual(definitionsFor(entries, state).length, 1);
assert.strictEqual(referencesFor(entries, state).length, 2);
const stateUse = allSymbols(second).find((entry) => entry.kind === 'state');
assert.strictEqual(stateUse.name, '200');
assert.strictEqual(definitionsFor(entries, stateUse)[0].uri, 'one');
assert.ok(!canRename(state));

console.log('ZSS navigation model tests passed');
