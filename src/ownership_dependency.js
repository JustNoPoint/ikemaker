'use strict';

function validateDependency(source = {}, target = {}) {
  const reasons = [];
  if (source.ownership === 'universal' && ['game', 'character'].includes(target.ownership)) reasons.push('Universal code cannot depend on game- or character-specific material.');
  if (source.ownership === 'game' && target.ownership === 'character') reasons.push('Game policy cannot depend on one character implementation.');
  if (source.ownership === 'game' && target.ownership === 'game' && source.projectId && target.projectId && source.projectId !== target.projectId) reasons.push('One game cannot create a live dependency on another game. Port the behavior with destination adaptation and sign-off.');
  if (source.ownership === 'character' && target.ownership === 'character' && source.characterId && target.characterId && source.characterId !== target.characterId) reasons.push('Character implementations should not create hidden live dependencies on another character.');
  return { allowed: !reasons.length, level: reasons.length ? 'error' : 'suggestion', reasons };
}

module.exports = { validateDependency };
