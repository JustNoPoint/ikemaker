'use strict';

const crypto = require('crypto');
const { friendlyVersion, resolvedSprite, spriteIndexPlane, paletteRgba } = require('./sff_reader');
const { spriteSilhouette } = require('./sff_silhouette');
const { encodedPlane } = require('./sff_sprite_transforms');
const { rewriteArchiveRows } = require('./sff_direct_delete');

const pixelBudget = 64_000_000;
const id = row => [row.group, row.number].join(',');

function inventory(archive, reservedIndex = null) {
  const byId = new Map();
  const scanned = new Set();
  const used = new Uint8Array(256);
  let scannedPixels = 0;
  for (const sprite of archive.sprites) {
    if (byId.has(id(sprite))) throw Error('Duplicate sprite identity ' + id(sprite) + '.');
    byId.set(id(sprite), sprite);
    const owner = resolvedSprite(archive, sprite);
    if (scanned.has(owner.index) || ![5, 8].includes(owner.colorDepth)) continue;
    scanned.add(owner.index);
    scannedPixels += owner.width * owner.height;
    if (scannedPixels > pixelBudget) throw Error('Palette usage review exceeds 64 million pixels.');
    for (const index of spriteIndexPlane(archive, owner).indices) used[index] = 1;
  }
  let silhouetteIndex = 255;
  while (silhouetteIndex && used[silhouetteIndex]) silhouetteIndex--;
  if (reservedIndex === null && !silhouetteIndex) throw Error('No globally unused nonzero palette index is available.');
  return { byId, scannedPixels, silhouetteIndex: reservedIndex === null ? silhouetteIndex : reservedIndex };
}

function validateContinuation(archive, continuation, bank, color) {
  if (!continuation) return null;
  const stamp=crypto.createHash('sha256').update(archive.buffer).digest('hex');
  if (continuation.sourceHash!==stamp || continuation.bank!==bank) throw Error('Batch continuation does not match the current archive. Restore a reviewed batch before continuing.');
  const ink=continuation.silhouetteIndex;
  if (!Number.isInteger(ink)||ink<1||ink>255||JSON.stringify(color)!==JSON.stringify(continuation.color)) throw Error('Continue with the same silhouette index and color.');
  if (!Array.isArray(continuation.mappings)||!continuation.mappings.length||!Array.isArray(continuation.palettePairs)) throw Error('Batch continuation mappings or palettes are incomplete.');
  const prior=new Set(),covered=new Set();
  for(const mapping of continuation.mappings){
    const base=archive.sprites[mapping.basePhysicalIndex],layer=archive.sprites[mapping.layerPhysicalIndex];
    if(!base||!layer||id(base)!==mapping.baseId||id(layer)!==mapping.layerId||layer.group!==base.group+bank*10000||layer.number!==base.number||prior.has(base.index))throw Error('Batch continuation sprite mappings changed.');
    prior.add(base.index);
  }
  let pendingCount=0;const projectedIds=new Set(archive.palettes.map(id));
  for(const pair of continuation.palettePairs){
    const equipped=archive.palettes[pair.equippedPhysicalIndex],off=archive.palettes[pair.offPhysicalIndex];
    if(pair.pending===true){
      if(!equipped||id(equipped)!==pair.equippedId||pair.sourcePhysicalIndex!==equipped.index||pair.sourceId!==pair.equippedId||covered.has(equipped.index)||pair.offPhysicalIndex!==archive.palettes.length+pendingCount||projectedIds.has(pair.offId)||!/^\d+,\d+$/.test(pair.offId))throw Error('Pending continuation palette identities changed.');
      const coordinate=pair.offId.split(',').map(Number);if(coordinate.some(value=>value>65535))throw Error('Pending continuation palette identity exceeds SFF limits.');
      covered.add(equipped.index);projectedIds.add(pair.offId);pendingCount++;continue;
    }
    if(!equipped||!off||id(equipped)!==pair.equippedId||id(off)!==pair.offId||pair.sourcePhysicalIndex!==pair.equippedPhysicalIndex||pair.sourceId!==pair.equippedId||covered.has(equipped.index)||covered.has(off.index))throw Error('Batch continuation palette identities changed.');
    covered.add(equipped.index);covered.add(off.index);
    const onColors=paletteRgba(archive,equipped.index),offColors=paletteRgba(archive,off.index);
    for(let i=0;i<256;i++)if(JSON.stringify(onColors[i])!==JSON.stringify(i===ink?[...color,255]:offColors[i])||i===ink&&JSON.stringify(offColors[i])!==JSON.stringify([...color,0]))throw Error('Batch continuation palette colors changed.');
  }
  if(covered.size!==archive.palettes.length||archive.palettes.length+pendingCount>65536)throw Error('Batch continuation mappings or palettes are incomplete.');
  for(const sprite of archive.sprites)if(!prior.has(sprite.index)&&[5,8].includes(resolvedSprite(archive,sprite).colorDepth)&&spriteIndexPlane(archive,sprite).indices.includes(ink))throw Error('The reserved silhouette index is used outside previously baked base sprites.');
  return JSON.parse(JSON.stringify(continuation));
}

function costumePairs(palettes) {
  if (palettes.length * 2 > 65536) throw Error('Too many palettes for paired costume tables.');
  const occupied = new Set(palettes.map(id));
  if (occupied.size !== palettes.length) throw Error('Duplicate palette identities prevent exact equipment remaps.');
  const groups = new Set(palettes.map(palette => palette.group));
  let group = 2;
  while (groups.has(group)) group++;
  return palettes.map(palette => {
    return {
      sourcePhysicalIndex: palette.index, equippedPhysicalIndex: palette.index,
      offPhysicalIndex: palettes.length + palette.index,
      sourceId: id(palette), equippedId: id(palette), offId: [group, palette.index].join(',')
    };
  });
}

function plan(archive, options = {}, keepPixels = false) {
  if (friendlyVersion(archive.header.version) !== '2.1') throw Error('Silhouette baking requires SFF 2.1.');
  const bank = Number(options.bank);
  const color = options.color || options.continuation?.color || [0, 0, 0];
  if (!Number.isInteger(bank) || bank < 1 || bank > 6) throw Error('Choose an attached offset bank from 1 through 6.');
  if (!Array.isArray(color) || color.length !== 3 || !color.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw Error('Choose an RGB silhouette color.');
  const selected = options.basePhysicalIndices === undefined ? null : new Set(options.basePhysicalIndices);
  if (selected && (!selected.size || [...selected].some(i => !Number.isInteger(i) || !archive.sprites[i] || archive.sprites[i].group >= 10000))) throw Error('Select existing base sprite rows.');

  const continuation=validateContinuation(archive,options.continuation,bank,color);
  const priorIds=new Set((continuation?.mappings||[]).map(mapping=>mapping.baseId));
  const { byId, scannedPixels, silhouetteIndex } = inventory(archive,continuation?.silhouetteIndex??null);
  // A solid underlay behind a translucent edge would show through the art.
  // Keep ink only where all supported character costumes fully cover it.
  const opaqueByPalette = new Map();
  const costumeColors = archive.palettes.filter(p => p.group === 1).map(p => paletteRgba(archive, p.index));
  const frames = new Map();
  const mappings = [];
  let area = 0;
  for (const base of archive.sprites) {
    if (base.group >= 10000 || (selected && !selected.has(base.index))) continue;
    if(priorIds.has(id(base))){if(selected)throw Error('This batch overlaps an already baked base sprite: '+id(base)+'.');continue;}
    const layer = byId.get([base.group + bank * 10000, base.number].join(','));
    if (!layer) {
      if (selected) throw Error('The selected bank has no exact layer for ' + id(base) + '.');
      continue;
    }
    const body = resolvedSprite(archive, base);
    const artwork = resolvedSprite(archive, layer);
    if (![5, 8].includes(body.colorDepth) || !archive.palettes[base.paletteIndex]) throw Error('Base ' + id(base) + ' requires an indexed palette.');
    const left = Math.min(-base.axisX, -layer.axisX);
    const top = Math.min(-base.axisY, -layer.axisY);
    const width = Math.max(body.width - base.axisX, artwork.width - layer.axisX) - left;
    const height = Math.max(body.height - base.axisY, artwork.height - layer.axisY) - top;
    const axisX = -left, axisY = -top;
    area += width * height;
    if (width > 8192 || height > 8192 || area > pixelBudget || width * height > 1_000_000 || axisX > 32767 || axisY > 32767) throw Error('Composite dimensions or axes exceed safe SFF limits.');
    const mapping = { basePhysicalIndex: base.index, layerPhysicalIndex: layer.index, baseId: id(base), layerId: id(layer), width, height, axisX, axisY };
    mappings.push(mapping);
    if (!keepPixels) continue;
    const pixels = Buffer.alloc(width * height);
    let mask;
    if ([5, 8].includes(artwork.colorDepth)) {
      if (!opaqueByPalette.has(layer.paletteIndex)) {
        const sourceColors = paletteRgba(archive, layer.paletteIndex);
        if (!sourceColors) throw Error('Missing equipment palette for ' + id(layer) + '.');
        opaqueByPalette.set(layer.paletteIndex, sourceColors.map((color, i) =>
          i !== 0 && color[3] === 255 && costumeColors.every(table => table[i][3] === 255)));
      }
      const opaque = opaqueByPalette.get(layer.paletteIndex);
      const layerPlane = spriteIndexPlane(archive, layer);
      mask = { ...layerPlane, mask: Uint8Array.from(layerPlane.indices, i => opaque[i] ? 1 : 0) };
    } else {
      mask = spriteSilhouette(archive, layer, null, { alphaThreshold: 255 });
    }
    const plane = spriteIndexPlane(archive, base);
    for (let y = 0; y < mask.height; y++) {
      const start = (y - layer.axisY - top) * width - layer.axisX - left;
      for (let x = 0; x < mask.width; x++) if (mask.mask[y * mask.width + x]) pixels[start + x] = silhouetteIndex;
    }
    for (let y = 0; y < plane.height; y++) {
      const start = (y - base.axisY - top) * width - base.axisX - left;
      for (let x = 0; x < plane.width; x++) {
        const index = plane.indices[y * plane.width + x];
        if (index) pixels[start + x] = index;
      }
    }
    frames.set(base.index, { ...mapping, pixels });
  }
  if (!mappings.length) throw Error('The selected bank has no matching indexed base sprites.');
  const review = {
    kind: 'indexed-silhouette-bake-v1', sourceHash: crypto.createHash('sha256').update(archive.buffer).digest('hex'),
    bank, color: [...color], silhouetteIndex, basePhysicalIndices: selected ? [...selected].sort((a,b) => a-b) : null,
    mappings, palettePairs: continuation?continuation.palettePairs:costumePairs(archive.palettes), scannedPixels,
    ...(continuation?{continuation}:{}),cumulativeMappings:[...(continuation?.mappings||[]),...mappings]
  };
  return { review, frames };
}

function reviewSilhouetteBake(archive, options) {
  return plan(archive, options).review;
}

function buildSilhouetteBake(archive, review) {
  const options = { bank: review.bank, color: review.color };
  if(review.continuation)options.continuation=review.continuation;
  if (review.basePhysicalIndices) options.basePhysicalIndices = review.basePhysicalIndices;
  const current = plan(archive, options, true);
  if (JSON.stringify(current.review) !== JSON.stringify(review)) throw Error('Silhouette review changed; review the current archive again.');
  const { frames } = current;
  const equipped = [], off = [];
  for (const palette of archive.palettes) {
    if(review.continuation){
      const pending=review.palettePairs.find(pair=>pair.pending&&pair.equippedPhysicalIndex===palette.index);
      if(!pending){equipped.push({...palette,data:palette.dataSize?archive.buffer.subarray(archive.header.literalDataOffset+palette.dataOffset,archive.header.literalDataOffset+palette.dataOffset+palette.dataSize):null});continue;}
      const colors=paletteRgba(archive,palette.index);colors[review.silhouetteIndex]=[...review.color,255];equipped.push({...palette,colors:256,link:0,data:Buffer.from(colors.flat())});
      colors[review.silhouetteIndex][3]=0;const [group,number]=pending.offId.split(',').map(Number);off.push({...palette,group,number,colors:256,link:0,data:Buffer.from(colors.flat())});continue;
    }
    const colors = paletteRgba(archive, palette.index);
    colors[review.silhouetteIndex] = [...review.color, 255];
    equipped.push({ ...palette, colors: 256, link: 0, data: Buffer.from(colors.flat()) });
    colors[review.silhouetteIndex][3] = 0;
    const [group, number] = review.palettePairs[palette.index].offId.split(',').map(Number);
    off.push({ ...palette, group, number, colors: 256, link: 0, data: Buffer.from(colors.flat()) });
  }
  const rows = archive.sprites.map(sprite => {
    const row = { ...sprite, newIndex: sprite.index, data: sprite.dataSize ? archive.buffer.subarray(sprite.dataOffset, sprite.dataOffset + sprite.dataSize) : null };
    const frame = frames.get(sprite.index);
    if (frame) {
      const encoded = encodedPlane({ channels: 1, width: frame.width, height: frame.height, pixels: frame.pixels });
      return { ...row, ...encoded, width: frame.width, height: frame.height, axisX: frame.axisX, axisY: frame.axisY, link: 0, dataSize: encoded.data.length };
    }
    // An unchanged link may traverse a rewritten intermediate sprite.
    for (let target = sprite; !target.dataSize; target = archive.sprites[target.link]) {
      if (frames.has(target.link)) {
        const owner = resolvedSprite(archive, sprite);
        return { ...row, width: owner.width, height: owner.height, data: archive.buffer.subarray(owner.dataOffset, owner.dataOffset + owner.dataSize),
          dataSize: owner.dataSize, format: owner.format, colorDepth: owner.colorDepth, flags: owner.flags, link: 0 };
      }
    }
    return row;
  });
  const built = rewriteArchiveRows(archive, rows, equipped.concat(off));
  for (const sprite of archive.sprites) {
    const frame = frames.get(sprite.index);
    if (!frame && ![5, 8].includes(resolvedSprite(archive, sprite).colorDepth)) continue;
    const expected = frame ? frame.pixels : spriteIndexPlane(archive, sprite).indices;
    if (!spriteIndexPlane(built.archive, built.archive.sprites[sprite.index]).indices.equals(expected)) throw Error('Sprite pixel verification failed for ' + id(sprite) + '.');
  }
  return { ...built, review };
}
module.exports = { reviewSilhouetteBake, buildSilhouetteBake };


