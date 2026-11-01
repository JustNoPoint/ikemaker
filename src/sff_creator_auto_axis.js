'use strict';

const crypto = require('crypto');
const { alphaMaskFromPng } = require('./image_alpha_mask');
const { anchorSuggestion, referenceSuggestion, consensusSuggestion } = require('./sff_auto_axis_model');

const MODES = new Set(['anchor', 'reference', 'consensus']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();

function cropMask(image, bounds) {
  const x = Number(bounds?.x), y = Number(bounds?.y), width = Number(bounds?.width), height = Number(bounds?.height);
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.width || y + height > image.height) throw new Error('A Crop before axis source has invalid reviewed crop bounds.');
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) mask.set(image.mask.slice((y + row) * image.width + x, (y + row) * image.width + x + width), row * width);
  return { width, height, mask };
}

function proposeCreatorAxes(fs, sources, rows, selectedIds, options = {}) {
  const mode = String(options.mode || 'anchor'), selected = new Set((selectedIds || []).map(String)), references = new Set((options.referenceIds || []).map(String));
  if (!MODES.has(mode)) throw new Error(`Unknown Creator auto-axis method ${mode}.`);
  if (!selected.size) throw new Error('Mark at least one Creator source for automatic-axis review.');
  const byId = new Map((sources || []).map(source => [String(source.id), source])), rowById = new Map((rows || []).map(row => [String(row.sourceId), row]));
  for (const id of selected) if (!byId.has(id) || !rowById.has(id)) throw new Error(`Marked Creator source ${id} is missing or blocked.`);
  if (mode !== 'anchor' && !references.size) throw new Error('Choose at least one trusted marked reference source.');
  for (const id of references) if (!byId.has(id) || !rowById.has(id)) throw new Error(`Trusted reference ${id} is not a ready staged or target-archive source.`);
  const targets = [...selected].filter(id => mode === 'anchor' || !references.has(id));
  if (!targets.length) throw new Error('Keep at least one marked source as a target instead of a trusted reference.');
  const requestedMaximumDelta = Number(options.maximumDelta), requestedMaxOffset = Number(options.maxOffset);
  const maximumDelta = Math.max(1, Math.min(1024, Number.isSafeInteger(requestedMaximumDelta) ? requestedMaximumDelta : 128)), maxOffset = Math.max(0, Math.min(64, Number.isSafeInteger(requestedMaxOffset) ? requestedMaxOffset : 16)), anchor = String(options.anchor || 'bottom-center'), loaded = new Map();
  const image = id => {
    if (loaded.has(id)) return loaded.get(id);
    const source = byId.get(id), row = rowById.get(id), bytes = fs.readFileSync(source.path), observed = sha256(bytes);
    if (observed !== String(source.byteHash || '').toUpperCase()) throw new Error(`Creator source ${source.name || id} changed after it was staged.`);
    const original = alphaMaskFromPng(bytes), beforeAxis = row.cropMode === 'before-axis', image = beforeAxis ? cropMask(original, row.cropBounds || source.cropBounds) : original;
    const value = { image, imageHash: observed, source, coordinateBasis: beforeAxis ? { stage: 'after-reviewed-source-crop', bounds: row.cropBounds || source.cropBounds, width: image.width, height: image.height } : { stage: 'source-image', width: image.width, height: image.height } };
    loaded.set(id, value); return value;
  };
  const referenceRows = [...references].map(id => { const loadedReference = image(id), row = rowById.get(id); return { id, ...loadedReference, axisX: row.axisX, axisY: row.axisY }; });
  return targets.map(id => {
    const target = image(id), row = rowById.get(id);
    const suggestion = mode === 'anchor' ? anchorSuggestion(target.image, anchor)
      : mode === 'reference' ? referenceSuggestion(target.image, referenceRows[0].image, referenceRows[0], { anchor, maxOffset })
        : consensusSuggestion(target.image, referenceRows, { anchor, maxOffset });
    const deltaX = suggestion.axisX - row.axisX, deltaY = suggestion.axisY - row.axisY;
    return {
      sourceId: id, name: target.source.name, currentAxisX: row.axisX, currentAxisY: row.axisY,
      proposedAxisX: suggestion.axisX, proposedAxisY: suggestion.axisY, deltaX, deltaY,
      blocked: suggestion.axisX < -32768 || suggestion.axisX > 32767 || suggestion.axisY < -32768 || suggestion.axisY > 32767 || Math.abs(deltaX) > maximumDelta || Math.abs(deltaY) > maximumDelta,
      blockedReason: suggestion.axisX < -32768 || suggestion.axisX > 32767 || suggestion.axisY < -32768 || suggestion.axisY > 32767 ? 'The proposed axis is outside the signed 16-bit SFF range.' : (Math.abs(deltaX) > maximumDelta || Math.abs(deltaY) > maximumDelta ? `The proposed change exceeds the ${maximumDelta} pixel safety limit.` : ''),
      method: suggestion.method, confidence: suggestion.confidence, confidenceLabel: suggestion.confidenceLabel,
      evidence: { algorithmVersion: 1, sourceId: id, sourceImageHash: target.imageHash, sourceCoordinateBasis: target.coordinateBasis, references: referenceRows.map(item => ({ sourceId: item.id, imageHash: item.imageHash, axisX: item.axisX, axisY: item.axisY, coordinateBasis: item.coordinateBasis, provenance: item.source.provenance || null })), anchor, maxOffset, maximumDelta, analysis: suggestion.evidence }
    };
  });
}

module.exports = { MODES, cropMask, proposeCreatorAxes };
