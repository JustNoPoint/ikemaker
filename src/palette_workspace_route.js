'use strict';
const { indexed } = require('./palette_sprite_associations');

function integer(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function exactSprite(archive, requested) {
  if (!requested || typeof requested !== 'object') return null;
  const physicalIndex = integer(requested.physicalIndex);
  if (physicalIndex === null) return null;
  const sprite = archive?.sprites?.[physicalIndex];
  if (!sprite || sprite.index !== physicalIndex) return null;
  if (integer(requested.group) !== null && sprite.group !== integer(requested.group)) return null;
  if (integer(requested.number) !== null && sprite.number !== integer(requested.number)) return null;
  return { physicalIndex: sprite.index, group: sprite.group, number: sprite.number };
}

function exactPalette(archive, requested) {
  if (!requested || typeof requested !== 'object') return null;
  const physicalIndex = integer(requested.physicalIndex ?? requested.palettePhysicalIndex);
  if (physicalIndex === null) return null;
  const palette = archive?.palettes?.[physicalIndex];
  if (!palette || palette.index !== physicalIndex) return null;
  if (integer(requested.group) !== null && palette.group !== integer(requested.group)) return null;
  if (integer(requested.number) !== null && palette.number !== integer(requested.number)) return null;
  return { physicalIndex: palette.index, group: palette.group, number: palette.number };
}

function attachedPalette(archive, spriteSelection) {
  const sprite = spriteSelection && archive?.sprites?.[spriteSelection.physicalIndex];
  if (!sprite || !indexed(archive, sprite)) return null;
  const palette = archive?.palettes?.[sprite.paletteIndex];
  return palette ? { physicalIndex: palette.index, group: palette.group, number: palette.number } : null;
}

function initialPaletteSelection(archive, current) {
  if (current?.sprite?.physicalIndex !== null && current?.sprite?.physicalIndex !== undefined) return null;
  if (current?.palette?.physicalIndex !== null && current?.palette?.physicalIndex !== undefined) return null;
  const first = archive?.sprites?.[0] || null;
  const sprite = first ? { physicalIndex:first.index,group:first.group,number:first.number } : null;
  const palette = attachedPalette(archive,sprite) || (!first && archive?.palettes?.[0] ? {physicalIndex:archive.palettes[0].index,group:archive.palettes[0].group,number:archive.palettes[0].number} : null);
  return {sprite,palette};
}

function resolvePaletteWorkspaceRoute(archive, options = {}) {
  const requested = options.selection || {};
  const sprite = exactSprite(archive, requested.sprite || options.spriteSelection);
  const explicitPalette = exactPalette(archive, requested.palette || options.paletteSelection);
  const attached = attachedPalette(archive, sprite);
  const palette = explicitPalette || attached;
  const hasRequestedSelection = Boolean(requested.sprite || requested.palette || options.spriteSelection || options.paletteSelection);
  const selectionRejected = Boolean((requested.sprite || options.spriteSelection) && !sprite || (requested.palette || options.paletteSelection) && !explicitPalette);
  const previewOverride = Boolean(sprite && explicitPalette && (!attached || attached.physicalIndex !== explicitPalette.physicalIndex));
  return {
    selection: hasRequestedSelection && !selectionRejected ? { sprite, palette } : null,
    context: {
      ...(options.section ? { section: String(options.section) } : {}),
      ...(sprite && palette ? { paletteSpriteMode: previewOverride ? 'preview-current' : 'associated' } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'origin') ? { origin: options.origin || null } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'returnContext') ? { returnContext: options.returnContext || null } : {})
    },
    selectionRejected
  };
}

function applyPaletteWorkspaceRoute(service, filename, archive, options = {}) {
  const route = resolvePaletteWorkspaceRoute(archive, options), patch = {};
  if(route.selectionRejected)throw Error('The SFF sprite or palette selection changed. Refresh the viewer and choose it again.');
  if (Object.keys(route.context).length) patch.context = route.context;
  if (route.selection) patch.selection = route.selection;
  const session = Object.keys(patch).length ? service.mutate(filename, patch) : service.snapshot(filename);
  return { session, selectionRejected: route.selectionRejected };
}

module.exports = { exactSprite, exactPalette, attachedPalette, initialPaletteSelection, resolvePaletteWorkspaceRoute, applyPaletteWorkspaceRoute };
