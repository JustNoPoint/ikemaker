'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const original = Module._load, calls = [];
  Module._load = function(request, parent, main) {
    if (parent?.filename?.endsWith('sff_transfer_apply.js') && request === './sff_reader') return { spritePng: (_archive, sprite, _palette, preserve) => Buffer.from(`png-${sprite.index}-${preserve}`), paletteRgba: () => Array.from({ length: 256 }, (_, i) => [i, i, i, i ? 255 : 0]), paletteAct: colors => Buffer.from(`act-${colors.length}`) };
    if (parent?.filename?.endsWith('sff_transfer_apply.js') && request === './sff_commands') return { createBuildPackage: async args => { calls.push(args); return { outputSff: args.outputSff, targetSnapshot: { exact: true }, outputDirectory: args.outputDirectory, definitionPath: 'definition' }; } };
    return original.call(this, request, parent, main);
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-transfer-apply-'));
  try {
    const { prepareSffTransferBuild } = require('../src/sff_transfer_apply'), sourceFile = path.join(root, 'source.sff'), destinationFile = path.join(root, 'destination.sff');
    const sourceArchive = { filename: sourceFile, buffer: Buffer.from('source'), sprites: [{ index: 0, group: 0, number: 0, axisX: 4, axisY: 5 }], palettes: [{ index: 0, group: 1, number: 1 }] }, destinationArchive = { filename: destinationFile, buffer: Buffer.from('destination'), sprites: [{ index: 0, group: 9, number: 9, axisX: 10, axisY: 11 }], palettes: [{ index: 0, group: 1, number: 1 }] };
    const requestIdentity = 'A'.repeat(64), referenceIdentity = 'B'.repeat(64), seed = { schema: 'ikemaker.sff-transfer-assembly-seed', authority: { requestIdentity }, reference: { identity: referenceIdentity, sourceFile, baseFile: destinationFile } }, analysis = { schema: 'ikemaker.sff-transfer-conflict-analysis', requestIdentity }, resolution = { schema: 'ikemaker.sff-transfer-resolution-plan', requestIdentity, referenceIdentity, readyForApply: true, unresolved: [], placement: { insertionPhysicalIndex: 1 }, items: [{ id: '0,0@0', sourcePhysicalIndex: 0, action: 'copy', destinationIdentity: '20,3', destinationPhysicalIndex: null, identityAction: 'manual-identity', axisAction: 'source-axis', linkAction: 'flatten-copy', paletteAction: 'reuse-compatible', sourcePaletteIndex: 0, destinationPaletteIndex: 0 }] };
    const prepared = await prepareSffTransferBuild({ packageRoot: path.join(root, 'package'), seed, analysis, resolution, sourceArchive, destinationArchive });
    assert(fs.existsSync(prepared.manifest)); assert(fs.existsSync(prepared.evidence)); assert.match(fs.readFileSync(prepared.manifest, 'utf8'), /20,3,4,5/);
    assert.equal(calls[0].outputSff, destinationFile); assert.equal(calls[0].paletteSourceSff, destinationFile); assert.equal(calls[0].preserveArchiveSprites, true); assert.equal(calls[0].reviewedInsertionPhysicalIndex, 1); assert.match(calls[0].reviewEvidence.byteHash, /^[A-F0-9]{64}$/);
    assert.equal(calls[0].reviewedPhysicalSpritePlan.schema, 'ikemaker.reviewed-physical-sprite-plan'); assert.deepStrictEqual(calls[0].reviewedPhysicalSpritePlan.rows, [{ manifestOrdinal: 0, sourceIdentity: '0,0@0', action: 'insert', destinationPhysicalIndex: null, linkTargetManifestOrdinal: null }]);
    const importResolution = { ...resolution, items: [{ ...resolution.items[0], destinationIdentity: '20,4', paletteAction: 'import-source-palette', destinationPaletteIndex: { group: 2, number: 7 } }] };
    await prepareSffTransferBuild({ packageRoot: path.join(root, 'import-package'), seed, analysis, resolution: importResolution, sourceArchive, destinationArchive });
    assert.equal(calls[1].portablePaletteIntake[0].group, 2); assert.equal(calls[1].portablePaletteIntake[0].number, 7); assert(fs.existsSync(calls[1].portablePaletteIntake[0].path));
    await assert.rejects(() => prepareSffTransferBuild({ packageRoot: path.join(root, 'bad'), seed, analysis, resolution: { ...resolution, readyForApply: false, unresolved: [{ gate: 'palette' }] }, sourceArchive, destinationArchive }), /Resolve every/);
    console.log('SFF Transfer reviewed package delegates to the native candidate build owner');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
