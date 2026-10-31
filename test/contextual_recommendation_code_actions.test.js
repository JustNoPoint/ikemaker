'use strict';
const assert = require('assert');
const { recommendationAt, registerContextualRecommendationCodeActions } = require('../src/contextual_recommendation_code_actions');

const fakeCatalog = { search: () => [{ id: 'guard', kind: 'structure', label: 'Target guard', source: 'test', compatibility: 'universal', beginnerSafe: true }] };
const document = { uri: {}, getText: () => '[StateDef 200]\ntarget, lifeAdd{ value: -20; }' };
assert(recommendationAt(document, 1, {}, fakeCatalog)?.reason.includes('target-existence'));
assert.strictEqual(recommendationAt({ ...document, getText: () => '# target, lifeAdd{ value: -20; }' }, 0, {}, fakeCatalog), null, 'comments do not create suggestion lightbulbs');

let provider, mode = 'manual';
class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
const vscode = {
  CodeAction, CodeActionKind: { Empty: '' },
  workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'contextualRecommendations.mode' ? mode : fallback }) },
  languages: { registerCodeActionsProvider(_selector, value) { provider = value; return { dispose() {} }; } }
};
registerContextualRecommendationCodeActions(vscode, { subscriptions: [] });
assert.deepStrictEqual(provider.provideCodeActions(document, { start: { line: 1 } }), [], 'manual mode remains explicit-command only');
mode = 'off';
assert.deepStrictEqual(provider.provideCodeActions(document, { start: { line: 1 } }), [], 'off mode remains silent');
mode = 'suggestions';
const actions = provider.provideCodeActions(document, { start: { line: 1 } });
assert.strictEqual(actions.length, 1);
assert.strictEqual(actions[0].command.command, 'zss.contextualRecommendations');
assert.match(actions[0].detail, /Nothing is inserted/);
console.log('Optional contextual recommendations use a quiet native lightbulb and never mutate source directly');
