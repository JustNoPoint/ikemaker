'use strict';

function buildAirReferenceSummary(uses = {}, collisions = {}, action = null) {
  if (action === null || action === undefined || action === '') return Object.freeze({ available: false, reason: 'No AIR action selected.' });
  const number = Number(action);
  if (!Number.isInteger(number)) return Object.freeze({ available: false, reason: 'No AIR action selected.' });
  if (uses.available !== true || collisions.available !== true) return Object.freeze({ available: false, reason: uses.reason || collisions.reason || 'References are unavailable or incomplete.' });
  const issue = (uses.issues || []).find(item => item.action === number);
  if (issue) return Object.freeze({ available: false, reason: issue.reason || 'References for this Action are ambiguous.' });
  const exactRows = (uses.items || []).filter(item => item.action === number), exact = exactRows.length;
  const unresolved = (uses.occurrences || []).filter(item => item.action === number && item.status !== 'exact').length;
  const related = (collisions.items || []).filter(item => Array.isArray(item.relatedActions) && item.relatedActions.includes(number));
  const collisionOmitted = Math.max(0, Math.min(related.length, Number(collisions.perActionOmitted?.[number]) || 0)), shownRelated = collisionOmitted ? related.slice(0, related.length - collisionOmitted) : related;
  const sameState = shownRelated.filter(item => item.relation === 'same-state').length;
  const conditional = shownRelated.filter(item => item.relation === 'conditional/dynamic').length;
  const animationOmitted = Math.max(0, ...exactRows.map(item => Number(item.omitted) || 0));
  const uncertainWholeCharacter = (collisions.items || []).filter(item => item.relation === 'global/shared' || item.relation === 'unresolved').length;
  return Object.freeze({ available: true, action: number, exact, unresolved, sameState, conditional, animationOmitted, collisionOmitted, uncertainWholeCharacter, empty: exact + unresolved + sameState + conditional === 0 });
}

module.exports = { buildAirReferenceSummary };
