'use strict';

// Display metadata only. Physical indexes and authored coordinates remain untouched.
function paletteIdentityDisplay(archive, palette) {
  const legacy = Boolean(archive.header?.legacy || palette.legacy);
  const physicalIndex = Number(palette.index ?? palette.physicalIndex);
  if (!legacy) return {
    identityLabel: `${palette.group},${palette.number}`,
    identityDetail: `Authored palette ${palette.group},${palette.number} · archive slot ${physicalIndex} (zero-based)`,
    legacyIdentity: false
  };
  const recordedOwner = archive.sprites[palette.sourceSpriteIndex];
  const ownsTable = sprite => sprite && sprite.paletteIndex === physicalIndex && sprite.dataSize > 0;
  const owner = ownsTable(recordedOwner) ? recordedOwner : archive.sprites.find(ownsTable);
  const source = owner ? `sprite ${owner.group},${owner.number}` : 'legacy PCX';
  return {
    identityLabel: `Palette from ${source}`,
    identityDetail: `SFF v1 · display ID ${palette.group},${palette.number} is temporary, not an authored palette ID · extracted table ${physicalIndex} (zero-based)`,
    legacyIdentity: true
  };
}

module.exports = { paletteIdentityDisplay };
