'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sourceEscapeActions, registerAirSourceEscapeProvider } = require('../src/air_source_escape_provider');

const air = path.resolve('C:/chars/Ryu/Ryu.air');
const zss = path.resolve('C:/chars/Ryu/common.zss');
const unrelated = path.resolve('C:/chars/Ryu/other.zss');
assert.deepStrictEqual(sourceEscapeActions(air, () => null, candidate => candidate === air).map(item => item.title), ['← AIR'], 'a directly opened AIR source can return but is not treated as a routed disposable source');
assert.deepStrictEqual(sourceEscapeActions(zss, candidate => candidate === zss ? {} : null, () => false).map(item => item.title), ['← AIR', '× Source'], 'an exact routed source exposes both compact escape actions');
assert.deepStrictEqual(sourceEscapeActions(unrelated, () => null, () => false), [], 'same-character but unrelated sources receive no forged escape route');
assert.deepStrictEqual(sourceEscapeActions(zss, () => ({ available: false, origin: air, line: 899 }), () => false).map(item => [item.title,item.command,item.line]), [['↻ AIR','air.reopenActionsBrowser',899]], 'a disposed exact origin retains a sealed reopen action instead of losing every escape control');

let provider, changed = 0, changeListener;
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { Object.assign(this, { startLine, startCharacter, endLine, endCharacter }); } }
class CodeLens { constructor(range, command) { Object.assign(this, { range, command }); } }
class EventEmitter { constructor() { this.event = listener => { this.listener = listener; return { dispose() {} }; }; } fire() { changed += 1; this.listener?.(); } dispose() {} }
const vscode = {
  Range, CodeLens, EventEmitter,
  languages: { registerCodeLensProvider(selector, value) { assert.deepStrictEqual(selector, { scheme: 'file' }); provider = value; return { dispose() {} }; } }
};
const routed = new Set([zss]);
const direct = new Set([air]);
registerAirSourceEscapeProvider({ subscriptions: [] }, { vscode, routedLookup: candidate => routed.has(candidate) ? { line: 899 } : null, directLookup: candidate => direct.has(candidate), onDidChange: listener => { changeListener = listener; return { dispose() {} }; } });
const document = filename => ({ fileName: filename, uri: { scheme: 'file', fsPath: filename }, lineCount: 1000, lineAt: line => ({ range: new Range(line, 0, line, 1) }) });
const routedLenses = provider.provideCodeLenses(document(zss));
assert.deepStrictEqual(routedLenses.map(item => item.command.title), ['← AIR', '× Source']);
assert.deepStrictEqual(routedLenses.map(item => item.command.command), ['air.focusActionsBrowser', 'air.closeSourceAndReturn']);
assert(routedLenses.every(item => item.command.arguments[0].fsPath === zss), 'each control carries the exact routed document URI');
assert(routedLenses.every(item => item.range.startLine === 899), 'both controls stay at the exact revealed source line instead of disappearing at line 1');
assert.deepStrictEqual(provider.provideCodeLenses(document(air)).map(item => item.command.title), ['← AIR']);
assert.deepStrictEqual(provider.provideCodeLenses(document(unrelated)), []);
assert.deepStrictEqual(provider.provideCodeLenses({ ...document(zss), uri: { scheme: 'untitled' } }), []);
changeListener();
assert.strictEqual(changed, 1, 'handoff lifecycle changes refresh already-open native source controls');

const manifest = require('../package.json'), escapeBinding = manifest.contributes.keybindings.find(item => item.command === 'air.focusActionsBrowser' && item.key === 'escape');
assert(escapeBinding, 'an exact routed source has a direct Escape path');
assert.match(escapeBinding.when, /editorTextFocus/);
assert.match(escapeBinding.when, /ikemen\.airSourceReturnAvailable/);
for (const protectedContext of ['suggestWidgetVisible','renameInputVisible','findInputFocussed','inSnippetMode','quickInputVisible']) assert(escapeBinding.when.includes(`!${protectedContext}`), `Escape does not steal ${protectedContext}`);
const toolbarSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'text_editor_toolbar.js'), 'utf8');
assert.match(toolbarSource, /event\.key!==['"]Escape['"][\s\S]{0,240}type:['"]focus-air-browser['"]/, 'the visible Code Navigation return strip handles Escape through the same strict type-only action');

console.log('AIR routed sources expose compact in-editor escape controls independent of window chrome');
