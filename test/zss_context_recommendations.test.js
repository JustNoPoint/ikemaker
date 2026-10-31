'use strict';

const assert = require('assert');
const { contextualRecommendations } = require('../src/zss_context_recommendations');

let result = contextualRecommendations({ text: 'target, lifeAdd{value: -20}', line: 0 });
assert(result.items.some(item => item.structureId === 'targetGuard'), 'literal target access recommends the existing target guard');
assert(result.items.every(item => item.reason && item.compatibility === 'universal'), 'every suggestion explains its context and preserves project conventions by default');

result = contextualRecommendations({ text: '# target, lifeAdd{value: -20}\nlet note = "hitDef";', line: 0 });
assert.deepStrictEqual(result.items, [], 'comments and strings do not produce contextual recommendations');
result = contextualRecommendations({ text: 'velSet{x: 0}', line: 0 });
assert.deepStrictEqual(result.items, [], 'uncertain context fails silent instead of offering generic guesses');

const fakeCatalog = { search: () => [
  { id: 'universal', kind: 'structure', label: 'Universal', detail: '', compatibility: 'universal', structureId: 'targetGuard' },
  { id: 'project', kind: 'recipeSection', label: 'Project convention', detail: '', compatibility: 'reference', snippet: 'reviewed;' },
  { id: 'whole', kind: 'recipe', label: 'Whole recipe', detail: '', compatibility: 'universal' }
] };
result = contextualRecommendations({ text: 'target, stateNo', line: 0 }, fakeCatalog);
assert.deepStrictEqual(result.items.map(item => item.id), ['universal'], 'project/reference and non-insertable whole recipes are not promoted from a coincidental match');
result = contextualRecommendations({ text: 'target, stateNo', line: 0, favoriteIds: ['project'] }, fakeCatalog);
assert.deepStrictEqual(result.items.map(item => item.id), ['project', 'universal'], 'an existing explicit favorite may preserve and promote a project convention');

result = contextualRecommendations({ text: 'hitDef{\n attr: S, NA\n}', line: 1, selectedText: 'for i = 0; 10; 1 { break; }' });
assert(result.items.some(item => item.structureId === 'forBreak'), 'an explicit selection is authoritative over nearby unrelated lines');
console.log('Manual contextual ZSS recommendation model tests passed');
