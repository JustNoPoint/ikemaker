'use strict';

function integer(value) {
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

function resolvePaletteWorkspaceRoute(archive, options = {}) {
  const requested = options.selection || {};
  const sprite = exactSprite(archive, requested.sprite || options.spriteSelection);
  let palette = exactPalette(archive, requested.palette || options.paletteSelection);
  if (!palette && sprite) {
    const owner = archive?.palettes?.[archive.sprites[sprite.physicalIndex]?.paletteIndex];
    if (owner) palette = { physicalIndex: owner.index, group: owner.group, number: owner.number };
  }
  const hasRequestedSelection = Boolean(requested.sprite || requested.palette || options.spriteSelection || options.paletteSelection);
  return {
    selection: hasRequestedSelection ? { sprite, palette } : null,
    context: {
      ...(options.section ? { section: String(options.section) } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'origin') ? { origin: options.origin || null } : {}),
      ...(Object.prototype.hasOwnProperty.call(options, 'returnContext') ? { returnContext: options.returnContext || null } : {})
    },
    selectionRejected: hasRequestedSelection && !sprite && !palette
  };
}

function applyPaletteWorkspaceRoute(service, filename, archive, options = {}) {
  const route = resolvePaletteWorkspaceRoute(archive, options), patch = {};
  if (Object.keys(route.context).length) patch.context = route.context;
  if (route.selection) patch.selection = route.selection;
  const session = Object.keys(patch).length ? service.mutate(filename, patch) : service.snapshot(filename);
  return { session, selectionRejected: route.selectionRejected };
}

module.exports = { exactSprite, exactPalette, resolvePaletteWorkspaceRoute, applyPaletteWorkspaceRoute };
