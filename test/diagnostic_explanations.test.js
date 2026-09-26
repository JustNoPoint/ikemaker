'use strict';

const assert = require('assert');
const { analyzeZss } = require('../src/analyzer');
const { EXPLANATIONS, explanationFor, explanationMarkdown } = require('../src/diagnostic_explanations');

const expected = [
  'negative-time-zero', 'redirect-guard', 'root-context', 'opponent-guard', 'team-mode',
  'literal-player-slot', 'targetstate-guard', 'customstate-contract', 'cross-entity-write',
  'forced-order', 'loop-progress', 'loop-redirect', 'map-prefix', 'function-prefix',
  'first-active-element-mismatch', 'idle-element-mismatch', 'missing-function',
  'function-arity', 'function-order', 'duplicate-function', 'air-missing-sff-sprite',
  'air-runtime-missing-sff-sprite', 'air-legacy-missing-sff-sprite',
  'air-sff-missing-summary'
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

console.log('Diagnostic explanation tests passed');
