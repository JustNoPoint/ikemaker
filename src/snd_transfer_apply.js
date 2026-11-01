'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { archiveFingerprint } = require('./snd_transfer_model');
const { soundBuffer } = require('./snd_reader');
const soundBuild = require('./sound_build');
const { transactionalWriteSet } = require('./mutation_safety');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }
function safeRoot(value) { const result = path.resolve(String(value || '')); if (!result || path.dirname(result) === result) throw new Error('Choose a dedicated SND Transfer package folder.'); return result; }
function prepareSndTransferBuild({ packageRoot, analysis, resolution, sourceArchive, destinationArchive, boundary = null }) {
  if (analysis?.schema !== 'ikemaker.snd-transfer-analysis' || resolution?.schema !== 'ikemaker.snd-transfer-resolution-plan' || resolution.status !== 'ready' || resolution.unresolved?.length) throw new Error('A ready reviewed SND Transfer analysis and resolution are required.');
  if (analysis.analysisIdentity !== resolution.analysisIdentity || archiveFingerprint(sourceArchive) !== analysis.sourceFingerprint || archiveFingerprint(destinationArchive) !== analysis.destinationFingerprint) throw new Error('The reviewed SND Transfer archives or authority changed. Nothing was prepared.');
  if (destinationArchive.entries.some(entry => entry.duplicateOf !== null)) throw new Error('The Destination SND contains duplicate group,index entries. Resolve them before a SndMaker preservation build.');
  const root = safeRoot(packageRoot), wavRoot = path.join(root, 'wav'), candidate = path.join(root, 'candidate.snd'), writes = [], rows = destinationArchive.entries.map(entry => ({ kind: 'destination', group: entry.group, index: entry.index, bytes: Buffer.from(soundBuffer(destinationArchive, entry)), sourcePhysicalIndex: entry.archiveIndex }));
  const replacements = new Map(), additions = [];
  for (const item of resolution.items) {
    if (item.action === 'skip') continue;
    const sourceEntry = sourceArchive.entries[item.sourcePhysicalIndex]; if (!sourceEntry) throw new Error(`${item.id} no longer exists in the Source SND.`);
    const bytes = Buffer.from(soundBuffer(sourceArchive, sourceEntry)); if (sha(bytes) !== item.contentFingerprint) throw new Error(`${item.id} WAV bytes changed after review.`);
    const row = { kind: item.action, group: item.destinationGroup, index: item.destinationIndex, bytes, sourcePhysicalIndex: item.sourcePhysicalIndex, sourceId: item.id };
    if (item.action === 'replace') { if (!Number.isSafeInteger(item.destinationPhysicalIndex) || replacements.has(item.destinationPhysicalIndex) || !rows[item.destinationPhysicalIndex]) throw new Error(`${item.id} has a stale or repeated exact Destination replacement.`); replacements.set(item.destinationPhysicalIndex, row); }
    else additions.push(row);
  }
  for (const [at, row] of replacements) rows[at] = row;
  if(boundary!==null){if(!boundary||boundary.kind!=='between-sounds'||!Number.isSafeInteger(boundary.position)||boundary.position<0||boundary.position>rows.length)throw new Error('The reviewed SND insertion boundary is invalid or stale.');rows.splice(boundary.position,0,...additions);}else rows.push(...additions);
  const identities = new Set(), manifestEntries = [], evidenceRows = [];
  rows.forEach((row, physicalIndex) => { const identity = `${row.group},${row.index}`; if (identities.has(identity)) throw new Error(`The reviewed SND candidate would contain duplicate identity ${identity}.`); identities.add(identity); const name = `sound-p${String(physicalIndex).padStart(6, '0')}-g${row.group}-i${row.index}.wav`, absolute = path.join(wavRoot, name); writes.push([absolute, row.bytes]); manifestEntries.push({ source: `wav/${name}`, group: row.group, index: row.index }); evidenceRows.push({ physicalIndex, identity, sourceKind: row.kind, sourcePhysicalIndex: row.sourcePhysicalIndex, sourceId: row.sourceId || null, byteHash: sha(row.bytes), byteLength: row.bytes.length }); });
  if (!manifestEntries.length) throw new Error('The reviewed SND Transfer candidate would be empty.');
  const manifestPath = path.join(root, 'build.txt'), evidencePath = path.join(root, 'transfer-review.json'), manifest = { output: path.basename(candidate), entries: manifestEntries }, evidence = Buffer.from(`${JSON.stringify({ schema: 'ikemaker.snd-transfer-build-review', version: 1, analysisIdentity: analysis.analysisIdentity, planIdentity: resolution.planIdentity, sourceFingerprint: analysis.sourceFingerprint, destinationFingerprint: analysis.destinationFingerprint, rows: evidenceRows }, null, 2)}\n`);
  writes.push([manifestPath, soundBuild.stringify(manifest)], [evidencePath, evidence]); transactionalWriteSet(fs, writes, { label: 'snd-transfer-reviewed-package', allowExisting: false, backup: false, journal: false });
  const validation = soundBuild.validate(manifest, manifestPath); if (validation.errors.length) throw new Error(`Prepared SndMaker manifest is invalid: ${validation.errors.join(' ')}`);
  return Object.freeze({ schema: 'ikemaker.snd-transfer-build-package', version: 1, packageRoot: root, manifestPath, candidate, evidencePath, evidenceFingerprint: sha(evidence), analysisIdentity: analysis.analysisIdentity, planIdentity: resolution.planIdentity, entries: Object.freeze(evidenceRows.map(row => Object.freeze(row))), activeDestinationUnchanged: archiveFingerprint(destinationArchive) === analysis.destinationFingerprint });
}

module.exports = { prepareSndTransferBuild };
