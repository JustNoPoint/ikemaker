'use strict';
const assert = require('assert');
const { airOutline, cnsOutline, registerNativeDocumentOutlines } = require('../src/native_document_outlines');

const cns = `; Standing logic
[StateDef 0]
type = S

; Idle animation
[State 0, Animate]
type = ChangeAnim
value = 0

[State 0, Stop]
type = VelSet
x = 0

[Constants]
life = 1000`;
const legacy = cnsOutline(cns);
assert.strictEqual(legacy[0].label, 'StateDef 0 — Standing logic');
assert.deepStrictEqual(legacy[0].children.map(item => item.label), ['ChangeAnim — Animate', 'VelSet — Stop']);
assert.strictEqual(legacy.at(-1).label, 'Constants');
assert(legacy[0].endLine >= legacy[0].children[1].endLine);

const air = `; Idle
[Begin Action 0]
0,0,0,0,4
Clsn2: 1
Clsn2[0] = -1,-2,3,4
0,1,0,0,2

; Alias only
[Begin Action 1]
Copy = 0

[Begin Action 1]
1,0,0,0,-1`;
const actions = airOutline(air);
assert.deepStrictEqual(actions.map(item => item.label), ['Action 0 — Idle', 'Action 1 — Alias only', 'Action 1']);
assert.strictEqual(actions[0].detail, '2 authored frames');
assert.strictEqual(actions[1].detail, '0 authored frames', 'Copy Action does not invent authored source frames');
assert.strictEqual(actions[2].detail, '1 authored frame', 'indefinite -1 duration remains an authored frame without inventing a finite tick total');
assert.deepStrictEqual(airOutline('x'.repeat(4 * 1024 * 1024 + 1)), [], 'oversized sources fail closed');
const registered = [], vscode = {
  SymbolKind: { Array: 1, Namespace: 2, Class: 3, Method: 4 },
  Range: class { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } },
  DocumentSymbol: class { constructor(label, detail, kind, range, selectionRange) { Object.assign(this, { label, detail, kind, range, selectionRange, children: [] }); } },
  languages: { registerDocumentSymbolProvider: (selector, provider) => { registered.push({ selector, provider }); return { dispose() {} }; } }
}, context = { subscriptions: [] };
registerNativeDocumentOutlines(vscode, context);
assert.deepStrictEqual(registered.map(item => item.selector.language), ['ikemen-cns', 'ikemen-air']);
const airLines = air.split(/\r?\n/), document = { lineCount: airLines.length, getText: () => air, lineAt: line => ({ text: airLines[line] }) };
const native = registered[1].provider.provideDocumentSymbols(document);
assert.strictEqual(native[0].label, 'Action 0 — Idle');
assert(native[0].range.end.line < native[1].range.start.line, 'native symbol ranges do not overlap');
console.log('Native CNS/ST and AIR outlines preserve compact authored structure');
