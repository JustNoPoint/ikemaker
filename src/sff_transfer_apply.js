'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spritePng, paletteRgba, paletteAct } = require('./sff_reader');
const { stringifyCsv } = require('./sff');
const { transactionalWriteSet } = require('./mutation_safety');
const { createBuildPackage } = require('./sff_commands');
const { DEFAULT_PROFILE } = require('./sff_build_profile');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(); }
function parseIdentity(value) { const match = /^(\d+),(\d+)$/.exec(String(value || '')); if (!match) throw new Error(`Invalid resolved sprite identity ${value}.`); return { group: Number(match[1]), number: Number(match[2]) }; }
function exactPalette(archive, physicalIndex) { const palette = archive.palettes?.[physicalIndex]; if (!palette) throw new Error(`Resolved Destination palette ${physicalIndex} no longer exists.`); return palette; }
function safeRoot(value) { const root = path.resolve(String(value || '')); if (!root || path.dirname(root) === root) throw new Error('Choose a dedicated package folder for the reviewed Transfer build.'); return root; }

async function prepareSffTransferBuild({ packageRoot, seed, analysis, resolution, sourceArchive, destinationArchive }) {
  if (seed?.schema !== 'ikemaker.sff-transfer-assembly-seed' || analysis?.schema !== 'ikemaker.sff-transfer-conflict-analysis' || resolution?.schema !== 'ikemaker.sff-transfer-resolution-plan') throw new Error('The reviewed Transfer seed, analysis, and resolution plan are required.');
  if (!resolution.readyForApply || resolution.unresolved?.length) throw new Error('Resolve every Transfer placement, identity, link, and palette decision before preparing Apply.');
  if (seed.authority.requestIdentity !== analysis.requestIdentity || analysis.requestIdentity !== resolution.requestIdentity || seed.reference.identity !== resolution.referenceIdentity) throw new Error('The Transfer review, conflict analysis, and resolution plan do not share one exact authority.');
  if (path.resolve(destinationArchive.filename) !== path.resolve(seed.reference.baseFile) || path.resolve(sourceArchive.filename) !== path.resolve(seed.reference.sourceFile)) throw new Error('The Transfer archives no longer match the reviewed endpoints.');
  const root = safeRoot(packageRoot), spritesFolder = path.join(root, 'sprites'), palettesFolder = path.join(root, 'palettes'), rows = [], writes = [], portablePaletteIntake = [], imported = new Map();
  for (const item of resolution.items) {
    if (item.action === 'skip') continue;
    const sprite = sourceArchive.sprites[item.sourcePhysicalIndex]; if (!sprite) throw new Error(`Source physical sprite ${item.sourcePhysicalIndex} no longer exists.`);
    if (!['direct-copy', 'preserve-link', 'flatten-copy'].includes(item.linkAction)) throw new Error(`${item.id} has no supported resolved linked-sprite policy.`);
    const target = parseIdentity(item.destinationIdentity), preserveIndices = !['convert-truecolor', 'not-applicable'].includes(item.paletteAction), bytes = spritePng(sourceArchive, sprite, null, preserveIndices), filename = `source-p${String(item.sourcePhysicalIndex).padStart(6, '0')}-g${target.group}-i${target.number}.png`, absolute = path.join(spritesFolder, filename);
    let palette = null;
    if (item.paletteAction === 'reuse-compatible' || item.paletteAction === 'map-existing-palette') palette = exactPalette(destinationArchive, item.destinationPaletteIndex);
    else if (item.paletteAction === 'import-source-palette') {
      const targetPalette = item.destinationPaletteIndex, importKey = `${item.sourcePaletteIndex}->${targetPalette.group},${targetPalette.number}`;
      if (!imported.has(importKey)) { const colors = paletteRgba(sourceArchive, item.sourcePaletteIndex); if (!colors) throw new Error(`${item.id} source palette no longer exists.`); const act = paletteAct(colors), actName = `source-palette-${item.sourcePaletteIndex}-to-${targetPalette.group}-${targetPalette.number}.act`, actPath = path.join(palettesFolder, actName), byteHash = sha(act); writes.push([actPath, act]); portablePaletteIntake.push({ group: targetPalette.group, number: targetPalette.number, path: actPath, byteHash, tableOrder: 'index', provenance: { kind: 'reviewed-sff-transfer-palette', requestIdentity: resolution.requestIdentity, sourcePaletteIndex: item.sourcePaletteIndex } }); imported.set(importKey, targetPalette); } palette = { group: targetPalette.group, number: targetPalette.number };
    }
    let axisX = sprite.axisX, axisY = sprite.axisY;
    if (item.identityAction === 'replace-existing' && item.axisAction === 'preserve-destination') { const existing = destinationArchive.sprites[item.destinationPhysicalIndex]; if (!existing) throw new Error(`${item.id} replacement Destination occurrence no longer exists.`); axisX = existing.axisX; axisY = existing.axisY; }
    writes.push([absolute, bytes]); rows.push({ OriginalRelativePath: path.relative(root, absolute), SourceArchive: sourceArchive.filename, SourceIdentity: item.id, BaseGroup: target.group, ComputedGroup: target.group, ImageIndex: target.number, AxisX: axisX, AxisY: axisY, LayerNumber: 0, SourceSHA256: sha(bytes), ReviewStatus: 'APPROVED', ReviewReason: `Exact reviewed SFF Transfer ${resolution.requestIdentity}`, DuplicatePolicy: item.linkAction === 'preserve-link' ? 'share-identical' : 'preserve-separate', PaletteGroup: palette?.group ?? '', PaletteIndex: palette?.number ?? '' });
  }
  if (!rows.length) throw new Error('The resolved Transfer plan skips every selected sprite. Nothing was prepared.');
  const copied = resolution.items.filter(item => item.action === 'copy'), ordinalByPhysical = new Map(copied.map((item, ordinal) => [item.sourcePhysicalIndex, ordinal]));
  const reviewedPhysicalSpritePlan = { schema: 'ikemaker.reviewed-physical-sprite-plan', version: 1, destinationFingerprint: sha(destinationArchive.buffer), insertionPhysicalIndex: resolution.placement.insertionPhysicalIndex, rows: copied.map((item, manifestOrdinal) => {
    const linkTargetManifestOrdinal = item.linkAction === 'preserve-link' ? ordinalByPhysical.get(item.linkTargetPhysicalIndex) : null;
    if (item.linkAction === 'preserve-link' && !Number.isInteger(linkTargetManifestOrdinal)) throw new Error(`${item.id} cannot preserve its exact link because the reviewed target is not copied.`);
    return { manifestOrdinal, sourceIdentity: item.id, action: item.identityAction === 'replace-existing' ? 'replace' : 'insert', destinationPhysicalIndex: item.identityAction === 'replace-existing' ? item.destinationPhysicalIndex : null, linkTargetManifestOrdinal };
  }) };
  const manifest = path.join(root, 'transfer-manifest.csv'), evidence = path.join(root, 'transfer-review.json'), evidenceBytes = Buffer.from(`${JSON.stringify({ schema: 'ikemaker.sff-transfer-apply-review', version: 1, seed, analysis, resolution, reviewedPhysicalSpritePlan }, null, 2)}\n`);
  writes.push([manifest, stringifyCsv(rows)], [evidence, evidenceBytes]); transactionalWriteSet(fs, writes, { label: 'sff-transfer-reviewed-package', allowExisting: false, backup: false, journal: false });
  const outputDirectory = path.join(root, 'build'), generated = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory, outputSff: destinationArchive.filename, candidateOutputSff: path.join(outputDirectory, '.transfer-candidate.sff'), paletteSourceSff: destinationArchive.filename, portablePaletteIntake, preserveArchiveSprites: true, includeStagedPalettes: false, reviewedInsertionPhysicalIndex: resolution.placement.insertionPhysicalIndex, reviewedPhysicalSpritePlan, reviewEvidence: { identity: path.basename(evidence), byteHash: sha(evidenceBytes) }, buildProfile: { ...DEFAULT_PROFILE, profileName: 'Reviewed SFF Transfer' }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
  return Object.freeze({ generated, manifest, evidence, packageRoot: root, requestIdentity: resolution.requestIdentity, rows: Object.freeze(rows.map(row => Object.freeze({ ...row }))) });
}

module.exports = { prepareSffTransferBuild };
