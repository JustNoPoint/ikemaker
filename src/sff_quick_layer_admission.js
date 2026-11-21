'use strict';

const {validateSolidBackground} = require('./sff_psd_intake');

// Resolve browser choices against the original host-owned PSD admissions.
function resolveLayerIntake(admission, sourceIds, plan) {
  if (!Array.isArray(plan) || !plan.length || new Set(sourceIds).size !== sourceIds.length) {
    throw Error('Review the selected PSD layers again.');
  }
  const positions = new Map(sourceIds.map((id, i) => [id, i]));
  const assigned = new Map();
  const slotsByFrame = new Map();
  const backgroundByFrame = new Map();
  let bakeSlot;
  for (const row of plan) {
    if (!row || !Array.isArray(row.sourceIds) || !row.sourceIds.length ||
        !['skip', 'background', 0, 1, 2, 3, 4].includes(row.slot)) {
      throw Error('Choose Base, Layer 1–4, Transparency background, or Skip for each PSD layer.');
    }
    if (typeof row.slot === 'number' && !/^(own|true-color|master:\d+,\d+)$/.test(row.palette)) {
      throw Error('Choose a palette for every artwork layer.');
    }
    if (row.bake) {
      if (!(row.slot >= 1 && row.slot <= 4) || (bakeSlot !== undefined && bakeSlot !== row.slot)) {
        throw Error('Choose one artwork layer for silhouette review.');
      }
      bakeSlot = row.slot;
    }
    for (const id of row.sourceIds) {
      const index = positions.get(id);
      const proof = admission.sourceProvenance[index];
      if (assigned.has(id) || !proof || proof.role !== 'separate-layer' || !Number.isInteger(proof.sequenceOrdinal)) {
        throw Error('Each reviewed PSD page must belong to exactly one layer.');
      }
      assigned.set(id, row);
      if (row.slot === 'skip') continue;
      const frame = proof.sequenceOrdinal;
      if (!slotsByFrame.has(frame)) slotsByFrame.set(frame, new Set());
      const slots = slotsByFrame.get(frame);
      if (slots.has(row.slot)) throw Error('Two pages of the same PSD use the same slot. Review the layer assignments.');
      slots.add(row.slot);
      if (row.slot === 'background') {
        const background = validateSolidBackground(admission.admittedBuffers[index]);
        backgroundByFrame.set(frame, background.transparencyKey);
      }
    }
  }
  if (assigned.size !== positions.size) throw Error('Assign or skip every selected PSD page.');
  const result = {...admission, paths: [], admittedBuffers: [], sourceProvenance: [], bakeSlot};
  for (const [i, id] of sourceIds.entries()) {
    const row = assigned.get(id);
    if (typeof row.slot !== 'number') continue;
    result.paths.push(admission.paths[i]);
    result.admittedBuffers.push(admission.admittedBuffers[i]);
    const proof = admission.sourceProvenance[i];
    const transparencyKey = backgroundByFrame.get(proof.sequenceOrdinal);
    result.sourceProvenance.push({...proof, quickLayer: {
      slot: row.slot, palette: row.palette, bake: !!row.bake,
      ...(transparencyKey ? {transparencyKey} : {})
    }});
  }
  if (!result.paths.length) throw Error('Select at least one artwork layer or base sprite.');
  return result;
}

function selectedBakeRows(ready, slot) {
  return ready.filter(row => {
    const layer = row.source?.provenance?.quickLayer;
    return layer?.slot === slot && layer.bake === true;
  });
}

function assertBakeBases(archive, ready, slot) {
  if (slot === undefined) return;
  const incoming = new Map(ready.map(row => [[row.group, row.number].join(','), row]));
  const existing = new Map(archive.sprites.map(sprite => [[sprite.group, sprite.number].join(','), sprite]));
  const layers = selectedBakeRows(ready, slot);
  if (!layers.length) throw Error('Select at least one frame of the layer to bake.');
  for (const row of layers) {
    const id = [row.group - 10000 * slot, row.number].join(',');
    const added = incoming.get(id);
    const sprite = existing.get(id);
    const isIndexed = added ? added.source.provenance.quickLayer.palette !== 'true-color'
      : sprite && [5, 8].includes(require('./sff_reader').resolvedSprite(archive, sprite).colorDepth);
    if (!isIndexed) throw Error('Silhouette review needs an indexed base sprite at ' + id +
      '. Include its base with a master or independent palette, or turn off silhouette review to import only.');
  }
}

function continueSavedBatches(filename, before, savedBytes) {
  const fs = require('fs');
  const history = require('./sff_silhouette_bake_history');
  try {
    if (!fs.existsSync(history.location(filename))) return '';
    const after = require('./sff_reader').parseSffBuffer(savedBytes || fs.readFileSync(filename));
    const result = history.rebaseAfterAdditiveImport(filename, before, after);
    return result.reason || '';
  } catch (error) {
    return 'Could not carry forward the previous silhouette batch. ' + error.message;
  }
}

function bakeReceipt(built, slot) {
  if (!built.verified || slot === undefined) return null;
  const layerIds = selectedBakeRows(built.finalReady, slot)
    .map(row => [row.group, row.number].join(','));
  if (!layerIds.length) throw Error('No written layer frames were identified for the requested silhouette review.');
  return {expectedHash: built.byteHash, bank: slot, layerIds};
}
module.exports = {resolveLayerIntake, assertBakeBases, continueSavedBatches, bakeReceipt};
