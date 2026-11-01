'use strict';

const assert = require('assert');
const { allSymbols, symbolAt, sameSymbol, referencesFor, definitionsFor, canRename, validRename } = require('../src/zss_navigation');

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

const constants='[Constants]\nMove.Speed = 4.5\n[StateDef 0]\nvelSet{x: const(Move.Speed)}\nvelSet{y: const(Engine.Common)}',constantEntries=[{uri:'constants',text:constants}],constantUse=allSymbols(constants).find(entry=>entry.kind==='constant'&&!entry.declaration&&entry.name==='Move.Speed');assert.strictEqual(definitionsFor(constantEntries,constantUse).length,1);assert.strictEqual(referencesFor(constantEntries,constantUse,true).length,2);assert(canRename(constantUse));const engineConstant=allSymbols(constants).find(entry=>entry.kind==='constant'&&entry.name==='Engine.Common');assert.strictEqual(definitionsFor(constantEntries,engineConstant).length,0,'engine/common references do not acquire fabricated authored definitions');

const scoped = `[Function First(value)]\nlet shared := $value;\nlet result := $shared;\n[Function Second(value)]\nlet shared := $value;\nlet result := $shared;`;
const scopedSymbols = allSymbols(scoped), firstUse = scopedSymbols.find((entry) => entry.kind === 'local' && entry.name === 'shared' && !entry.declaration), secondUse = scopedSymbols.filter((entry) => entry.kind === 'local' && entry.name === 'shared' && !entry.declaration)[1];
assert.ok(firstUse && secondUse && !sameSymbol(firstUse, secondUse), 'equal local spellings in separate functions are distinct navigation identities');
assert.strictEqual(definitionsFor([{ uri: 'scoped', text: scoped }], firstUse).length, 1);
assert.strictEqual(referencesFor([{ uri: 'scoped', text: scoped }], firstUse, true).length, 2, 'local references stay inside their exact function scope');
assert.strictEqual(referencesFor([{ uri: 'scoped', text: scoped }], secondUse, true).length, 2);
assert.strictEqual(symbolAt(scoped, 2, scoped.split('\n')[2].indexOf('$shared') + 7).name, 'shared', 'the full sigiled local range remains navigable through its last character');
assert.ok(canRename(firstUse));assert.ok(validRename(firstUse,'renamed_local'));assert.ok(!validRename(firstUse,'bad.local'),'scoped locals reject dotted project-level identifiers');

const resources='[StateDef 200]\nhelper{ id: 9000; stateNo: 9000; }\nif numHelper(9000) > 0 {}\nexplod{ id: 9000; sprite: 0,0; }',resourceEntries=[{uri:'resources',text:resources}],resourceUse=allSymbols(resources).find(entry=>entry.kind==='resource'&&entry.resourceKind==='helper'&&!entry.declaration);assert(resourceUse);assert.strictEqual(definitionsFor(resourceEntries,resourceUse).length,1);assert.strictEqual(referencesFor(resourceEntries,resourceUse,true).length,2,'resource navigation joins lifecycle sites only inside the same resource namespace');assert.strictEqual(definitionsFor(resourceEntries,resourceUse)[0].resourceKind,'helper');assert(!canRename(resourceUse),'resource IDs remain review-only because changing an ID may require runtime/dynamic sites outside static proof');

console.log('ZSS navigation model tests passed');
