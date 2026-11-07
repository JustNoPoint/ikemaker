'use strict';

// Counts describe the final ready rows, not all incoming sources: replacing a
// staged source still creates one addition, whereas replace-active keeps an
// existing archive identity and must never be presented as an addition.
function creatorOperationSummary(plan, draft) {
  const ready = Array.isArray(plan?.ready) ? plan.ready : [];
  const replacementIds = new Set(draft?.replaceSpriteIdentities || []);
  const replacements = ready.filter(row => row.resolution === 'replace-active' || replacementIds.has(row.identity)).length;
  const additions = ready.length - replacements;
  const deletions = new Set(draft?.deletedSpriteIdentities || []).size;
  return { additions, replacements, deletions, label: `${additions} addition(s), ${replacements} replacement(s), and ${deletions} deletion(s)` };
}

function creatorCandidateImpactLines(impact) {
  return [
    `Sprites: ${impact.sprites.addedCount} added, ${impact.sprites.removedCount} removed; ${impact.sprites.changedCount} with header/PNG differences, ${impact.sprites.unchangedCount} with no compared differences`,
    'Sprite counts compare selected header fields and rendered PNG bytes. Recompilation can change PNG encoding while preserving pixels. Full archive validation checks the reviewed sprite and palette requirements separately.',
    `Palette RGBA tables: ${impact.palettes.addedCount} added, ${impact.palettes.changedCount} changed, ${impact.palettes.removedCount} removed, ${impact.palettes.unchangedCount} identical`
  ];
}

module.exports = { creatorOperationSummary, creatorCandidateImpactLines };
