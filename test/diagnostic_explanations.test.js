'use strict';

const assert = require('assert');
const { analyzeZss } = require('../src/analyzer');
const { EXPLANATIONS, explanationFor, explanationMarkdown, registerDiagnosticExplanations } = require('../src/diagnostic_explanations');

const expected = [
  'negative-time-zero', 'redirect-guard', 'root-context', 'opponent-guard', 'team-mode',
  'literal-player-slot', 'targetstate-guard', 'customstate-contract', 'customstate-anim-owner', 'customstate-anim-owner-exception', 'cross-entity-write',
  'forced-order', 'loop-progress', 'loop-redirect', 'map-prefix', 'function-prefix', 'unused-let', 'missing-command',
  'first-active-element-mismatch', 'idle-element-mismatch', 'missing-function',
  'function-arity', 'function-argument-kind', 'stale-function-comment', 'unresolved-scoped-name', 'unsupported-nightly-string', 'string-map-add', 'unsupported-nightly-command-expression', 'nightly-command-redirect-bug', 'unsupported-nightly-string-position', 'unsupported-expanded-string-expression', 'unsupported-nightly-depth-camera', 'unsupported-engine-capability', 'invalid-def-map-value', 'invalid-typed-constant-value', 'missing-def-file', 'unsupported-nightly-shader-surface', 'ambiguous-function', 'function-order', 'duplicate-function', 'air-missing-sff-sprite',
  'missing-state', 'negative-state-transfer', 'duplicate-statedef',
  'air-runtime-missing-sff-sprite', 'air-legacy-missing-sff-sprite',
  'air-sff-missing-summary', 'missing-air-action', 'missing-sound', 'missing-sprite', 'missing-commonfx-action', 'missing-commonfx-sound',
  'playsnd-loop-auto-channel', 'stopsnd-global-channel', 'modifysnd-auto-position'
];
assert.deepStrictEqual(Object.keys(EXPLANATIONS).sort(), [...expected].sort());
for (const code of expected) {
  const entry = explanationFor(code);
  assert.ok(entry && entry[0] && entry[1] && entry[2].length, `${code} needs complete guidance`);
  const markdown = explanationMarkdown(code, 'Example diagnostic message.');
  assert.ok(markdown.includes(`\`${code}\``));
  assert.ok(markdown.includes('## Review steps'));
  assert.ok(markdown.includes('does not modify the project'));
}
assert.strictEqual(explanationFor('unknown'), null);
assert.strictEqual(explanationMarkdown('unknown'), '');

const analyzerCodes = new Set(analyzeZss(`[StateDef -2]\nif time = 0 {\n  targetState{value: 5000}\n}\n`, { mapPrefixes: ['P_'], functionPrefixes: ['P_'] }).issues.map((issue) => issue.code));
for (const code of analyzerCodes) assert.ok(explanationFor(code), `Analyzer code ${code} lacks an explanation`);

let provider;
class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
const registrations = [];
registerDiagnosticExplanations({
  CodeAction, CodeActionKind: { QuickFix: 'quickfix' }, ViewColumn: { Beside: 2 },
  commands: { registerCommand: () => ({ dispose() {} }) },
  languages: { registerCodeActionsProvider: (_selector, value) => { provider = value; return { dispose() {} }; } },
  window: { showInformationMessage() {}, showTextDocument: async () => {} },
  workspace: { openTextDocument: async () => ({}) }
}, { subscriptions: registrations });
const missingDiagnostic = { code: 'missing-command', message: 'Missing command' }, document = { uri: { fsPath: 'Ryu.zss' } };
const missingActions = provider.provideCodeActions(document, null, { diagnostics: [missingDiagnostic] });
assert.deepStrictEqual(missingActions.map(action => action.title), ['Explain IKEMEN diagnostic: missing-command', 'Open the character Command & Movelist editor']);
const missingFileActions=provider.provideCodeActions({uri:{fsPath:'Ryu.def'}},null,{diagnostics:[{code:'missing-def-file',message:'Missing file'}]});assert.deepStrictEqual(missingFileActions.map(action=>action.title),['Explain IKEMEN diagnostic: missing-def-file','Open Character Connection Tree']);assert.strictEqual(missingFileActions[1].command.command,'ikemen.characterDependencies.open');
assert.strictEqual(missingActions[1].command.command, 'ikemen.commandMovelist.openEditor');
assert.strictEqual(missingActions[1].command.arguments[0], document.uri, 'the direct repair route retains the exact invoking code document for owner resolution');
const stringActions=provider.provideCodeActions(document,null,{diagnostics:[{code:'unsupported-nightly-string',message:'Nightly string'}]});
assert.deepStrictEqual(stringActions.map(action=>action.title),['Explain IKEMEN diagnostic: unsupported-nightly-string','Review the project engine target']);
assert.strictEqual(stringActions[1].command.command,'ikemen.projectManager.open');
const commandExpressionActions=provider.provideCodeActions(document,null,{diagnostics:[{code:'unsupported-nightly-command-expression',message:'Dynamic command name'}]});
assert.deepStrictEqual(commandExpressionActions.map(action=>action.title),['Explain IKEMEN diagnostic: unsupported-nightly-command-expression','Review the project engine target']);
const stringPositionActions=provider.provideCodeActions(document,null,{diagnostics:[{code:'unsupported-nightly-string-position',message:'Nightly controller string'}]});
assert.deepStrictEqual(stringPositionActions.map(action=>action.title),['Explain IKEMEN diagnostic: unsupported-nightly-string-position','Review the project engine target']);
assert.strictEqual(commandExpressionActions[1].command.arguments[0],document.uri);

console.log('Diagnostic explanation tests passed');
