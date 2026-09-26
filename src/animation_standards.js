'use strict';

const catalog = require('../data/animation-standards.json');

function standardSet(id) {
  return (catalog.sets || []).find((entry) => entry.id === id) || null;
}

function uniqueBy(values, key) {
  const found = new Map();
  for (const value of values) if (!found.has(String(value[key]))) found.set(String(value[key]), value);
  return [...found.values()];
}

function resolveStandards(ids = []) {
  const sets = ids.map(standardSet).filter(Boolean);
  return {
    sets,
    requiredAnimations: uniqueBy(sets.flatMap((entry) => entry.requiredAnimations || []), 'action'),
    recommendedAnimations: uniqueBy(sets.flatMap((entry) => entry.recommendedAnimations || []), 'action'),
    requiredAxisRoles: uniqueBy(sets.flatMap((entry) => entry.requiredAxisRoles || []), 'role')
  };
}

function actionNumbers(text) {
  const numbers = new Set();
  const expression = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/gim;
  let match;
  while ((match = expression.exec(String(text || '')))) numbers.add(Number(match[1]));
  return numbers;
}

function auditAnimationStandards(text, ids = ['ikemen-1.0-character-core']) {
  const resolved = resolveStandards(ids);
  const actions = actionNumbers(text);
  return {
    ...resolved,
    actions,
    missingAnimations: resolved.requiredAnimations.filter((entry) => !actions.has(Number(entry.action)))
  };
}

module.exports = { catalog, standardSet, resolveStandards, actionNumbers, auditAnimationStandards };
