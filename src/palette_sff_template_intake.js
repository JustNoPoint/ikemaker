'use strict';

const crypto = require('crypto');
const path = require('path');
const { paletteRgba, spriteIndexPlane, spritePng } = require('./sff_reader');
const { decodePng } = require('./palette_index_organizer_model');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function validatedOwner(archive, start) {
  const chain = [], seen = new Set(); let at = Number(start);
  while (true) {
    if (!Number.isInteger(at) || at < 0 || !archive.palettes[at]) throw new Error(`Unresolved palette owner at physical index ${at}. Exclude this family or repair the source SFF.`);
    if (seen.has(at)) throw new Error(`Cyclic palette owner chain: ${[...chain, at].join(' → ')}. Repair the source SFF before intake.`);
    seen.add(at); chain.push(at);
    const palette = archive.palettes[at];
    if (Number(palette.dataSize) > 0) return { authoredPalettePhysicalIndex: Number(start), ownerPhysicalIndex: at, ownerChain: chain, familyId: `owner:${at}` };
    if (palette.dataSize !== 0) throw new Error(`Palette ${at} has no validated data owner.`);
    at = Number(palette.link);
  }
}

// This is read-only evidence. No PNG cache, destination, character session, or
// adoption target is touched until the inclusion review is accepted.
function inspectArchive(archive, filename) {
  const source = { filename: path.resolve(filename), byteHash: sha(archive.buffer) };
  const rows = archive.sprites.filter(sprite => [5, 8, 24, 32].includes(Number(sprite.colorDepth))).map(sprite => {
    const indexed = [5, 8].includes(Number(sprite.colorDepth));
    const row = { physicalIndex: sprite.index, group: sprite.group, number: sprite.number, axisX: sprite.axisX, axisY: sprite.axisY, width: sprite.width, height: sprite.height, colorDepth: sprite.colorDepth, palettePhysicalIndex: sprite.paletteIndex, indexed, slots: [] };
    try {
      if (indexed) {
        Object.assign(row, validatedOwner(archive, sprite.paletteIndex));
        const colors = paletteRgba(archive, sprite.paletteIndex), plane = spriteIndexPlane(archive, sprite);
        row.indexPlaneHash = sha(plane.indices); row.paletteHash = sha(Buffer.from(colors.flat()));
        row.slots = [...new Set(plane.indices)].filter(index => index !== 0).sort((a,b) => a-b).map(index => {
          if (!colors[index]) throw new Error(`Source index ${index} is outside the authored palette.`);
          return { semanticId: `${source.byteHash}:${row.familyId}:${index}`, sourceIndex: index, rgba: colors[index].slice() };
        });
      } else {
        row.familyId = 'truecolor';
        const decoded = decodePng(spritePng(archive, sprite));
        row.pixelHash = sha(decoded.rgba);
        const colors = new Map();
        for (let at = 0; at < decoded.rgba.length; at += 4) {
          const rgba = [...decoded.rgba.subarray(at, at + 4)];
          if (rgba[3]) colors.set(rgba.join(','), rgba);
        }
        row.slots = [...colors].map(([id, rgba]) => ({ semanticId: `truecolor:${id}`, sourceIndex: null, rgba }));
      }
    } catch (error) { row.error = error.message; row.slots = []; row.familyId = `invalid:${sprite.paletteIndex}`; }
    return row;
  });
  return { schema: 'ikemaker.sff-template-review', version: 1, source, rows, sourceMayBeModified: false, destination: null, adoption: null };
}

function reviewSelection(inventory, input = {}) {
  const mode = input.mode || 'preserve';
  if (!['preserve', 'combined'].includes(mode)) throw new Error('Choose preserved source indexes or explicit combined colors.');
  const requested = input.physicalIndexes === undefined ? inventory.rows.map(row => row.physicalIndex) : input.physicalIndexes;
  const selected = new Set(requested), known = new Set(inventory.rows.map(row => row.physicalIndex));
  if ([...selected].some(id => !known.has(id))) throw new Error('Sprite selection does not belong to this source archive.');
  const excludedGroups = new Set(input.excludedGroups || []), excludedFamilies = new Set(input.excludedFamilies || []);
  const rows = inventory.rows.filter(row => selected.has(row.physicalIndex) && !excludedGroups.has(row.group) && !excludedFamilies.has(row.familyId)).map(row => ({ ...row, ...(row.ownerChain ? { ownerChain: row.ownerChain.slice() } : {}), slots: row.slots.map(slot => ({ ...slot, rgba: slot.rgba.slice() })) }));
  const separators = Number(input.separators || 0);
  if (!Number.isInteger(separators) || separators < 0 || separators > 255) throw new Error('Separator slots must be a whole number from 0 to 255.');
  const slots = new Map(), reasons = rows.filter(row => row.error).map(row => `Sprite ${row.group},${row.number} [${row.physicalIndex}]: ${row.error}`);
  for (const row of rows) for (const slot of row.slots) { const key = mode === 'preserve' ? slot.semanticId : slot.rgba.join(','); if (!slots.has(key)) slots.set(key, { ...slot, slotId: key }); }
  const total = slots.size + separators;
  if (!rows.length) reasons.push('Include at least one sprite.');
  if (total > 255) reasons.push(`${total} slots exceed the 255 usable indexes by ${total - 255}. Exclude families, groups, or sprites; reduce separators; or explicitly choose combined-color mode.`);
  const rgbaCounts = new Map(); for (const slot of slots.values()) rgbaCounts.set(slot.rgba.join(','), (rgbaCounts.get(slot.rgba.join(',')) || 0) + 1);
  return { source: { ...inventory.source }, mode, rows, slots: [...slots.values()], separators, slotCount: slots.size, total, remaining: 255-total, ready: reasons.length === 0, reasons, semanticDuplicates: [...rgbaCounts.values()].some(count => count > 1), summary: `${slots.size} ${mode === 'preserve' ? 'preserved semantic' : 'combined-color'} slots + ${separators} separators = ${total}/255`, isolated: true, combineWithPrimary: false, sourceMayBeModified: false, destination: null, adoption: null };
}

// Native multi-select supplies keyboard/screen-reader checkbox behavior. The
// budget is recomputed on every selection change; Enter cannot bypass it.
function chooseReviewedSprites(window, inventory, input) {
  return new Promise(resolve => {
    const picker = window.createQuickPick(); let done = false;
    picker.canSelectMany = true; picker.ignoreFocusOut = true; picker.matchOnDescription = true; picker.matchOnDetail = true;
    picker.items = inventory.rows.filter(row => input.physicalIndexes.includes(row.physicalIndex)).map(row => ({ label: `${row.group},${row.number} — physical ${row.physicalIndex}`, description: `${row.familyId} · ${row.indexed ? 'Indexed' : 'Truecolor'} · axes ${row.axisX},${row.axisY}`, detail: row.error || `${row.slots.length} source slots; palette binding ${row.palettePhysicalIndex ?? 'none'}`, row }));
    picker.selectedItems = picker.items.filter(item => !item.row.error);
    const current = () => reviewSelection(inventory, { ...input, physicalIndexes: picker.selectedItems.map(item => item.row.physicalIndex) });
    const update = () => { const review = current(); picker.title = `Review SFF sprites — ${review.summary}`; picker.placeholder = review.ready ? 'Enter to Continue with this isolated candidate; Space toggles inclusion.' : review.reasons.join(' '); };
    const finish = value => { if (done) return; done = true; picker.dispose(); resolve(value); };
    picker.onDidChangeSelection(update);
    picker.onDidAccept(() => { const review = current(); if (review.ready) finish(review); else update(); });
    picker.onDidHide(() => finish(null)); update(); picker.show();
  });
}

module.exports = { validatedOwner, inspectArchive, reviewSelection, chooseReviewedSprites };
