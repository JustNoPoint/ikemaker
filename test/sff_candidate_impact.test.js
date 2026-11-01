'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { candidateImpactSummary, writeSffExecutionReceipt } = require('../src/sff_commands');
Module._load = original;
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 0x55, index === 0 ? 0 : 255]);
const png = encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors), decodedHash = readIndexedPng8(png).decodedHash;
const source = { relativePath: 'input/a.png', byteHash: sha256(png), decodedHash, width: 2, height: 2, provenance: { kind: 'candidate-impact-test' } };
const sprite = (entryId, group, number, axisX) => ({ entryId, group, number, axisX, axisY: 5, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source });
const specification = sprites => createSffBuildSpecification({
  planId: `impact-${sprites.length}-${sprites.map(item => item.axisX).join('-')}`, sourceRoot: 'input',
  target: { archiveIdentity: 'candidate.sff', archiveFingerprint: null, sffVersion: '2.1' },
  sprites,
  palettes: [{ entryId: 'palette:1,1', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors, source }],
  requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'], decisions: [], options: { shared: {}, backends: {} }
});
const sources = new Map([['input/a.png', png]]);
const active = createSffV21Png8Bytes(specification([sprite('sprite:a', 5, 0, 2)]), { sources });
const unchanged = candidateImpactSummary(active, active);
assert.deepStrictEqual({ added: unchanged.sprites.addedCount, changed: unchanged.sprites.changedCount, removed: unchanged.sprites.removedCount, unchanged: unchanged.sprites.unchangedCount }, { added: 0, changed: 0, removed: 0, unchanged: 1 });
assert.strictEqual(unchanged.palettes.unchangedCount, 1);

const candidate = createSffV21Png8Bytes(specification([sprite('sprite:a', 5, 0, 8), sprite('sprite:b', 5, 1, 2)]), { sources });
const impact = candidateImpactSummary(active, candidate);
assert.deepStrictEqual({ added: impact.sprites.addedCount, changed: impact.sprites.changedCount, removed: impact.sprites.removedCount, unchanged: impact.sprites.unchangedCount }, { added: 1, changed: 1, removed: 0, unchanged: 0 });
assert.deepStrictEqual(impact.sprites.added, [{ identity: '5,1', occurrence: 1 }]);
assert.deepStrictEqual(impact.sprites.changed[0].fieldsChanged, ['axisX']);
assert.strictEqual(impact.palettes.unchangedCount, 1);
assert.strictEqual(candidateImpactSummary(Buffer.alloc(0), candidate).sprites.addedCount, 2, 'new archives compare against an explicit empty active state');

const receiptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-execution-receipt-'));
const receipt = writeSffExecutionReceipt({ outputDirectory: receiptRoot, outputSff: path.join(receiptRoot, 'active.sff'), receiptHash: 'a'.repeat(64), specificationHash: 'b'.repeat(64), sprmake: path.join(receiptRoot, 'sprmake2.exe') }, { candidateHash: sha256(candidate), candidateByteLength: candidate.length, validation: { friendly: { status: 'passed' }, strict: { status: 'passed' } }, impact, outcome: 'validated-and-adopted', adoption: { filename: path.join(receiptRoot, 'active.sff'), backup: path.join(receiptRoot, 'active.sff.bak'), journal: path.join(receiptRoot, 'journal.json') }, finalTargetHash: sha256(candidate) });
const persisted = JSON.parse(fs.readFileSync(receipt.path, 'utf8'));
assert.strictEqual(persisted.packageReceiptHash, 'a'.repeat(64));
assert.strictEqual(persisted.specificationHash, 'b'.repeat(64));
assert.strictEqual(persisted.candidate.byteHash, sha256(candidate));
assert.strictEqual(persisted.outcome, 'validated-and-adopted');
assert.strictEqual(persisted.adoption.finalTargetHash, sha256(candidate));
assert.strictEqual(persisted.adoption.backupIdentity, 'active.sff.bak');
const dualReceipt = writeSffExecutionReceipt({ outputDirectory: receiptRoot, outputSff: path.join(receiptRoot, 'dual.sff'), receiptHash: 'c'.repeat(64), specificationHash: 'd'.repeat(64), sprmake: path.join(receiptRoot, 'sprmake2.exe') }, { backend: { id: 'sprmake2', comparisonRequired: true, builtInTestIdentity: 'dual.IKEMaker.test.sff' }, candidateHash: sha256(candidate), candidateByteLength: candidate.length, validation: { strict: { status: 'passed', compatibilityProfile: 'sprmake2-v2.1' } }, comparison: { status: 'equivalent', sprMake2CandidateHash: sha256(candidate), builtInCandidateHash: 'e'.repeat(64), builtInTestIdentity: 'dual.IKEMaker.test.sff', buildOrder: ['ikemaker-builtin-sff-v21-png8-prerelease', 'sprmake2'] }, impact, outcome: 'dual-validated-sprmake2-update-cancelled', adoption: null });
const persistedDual = JSON.parse(fs.readFileSync(dualReceipt.path, 'utf8'));
assert.strictEqual(persistedDual.backend.id, 'sprmake2');
assert.strictEqual(persistedDual.backend.comparisonRequired, true);
assert.strictEqual(persistedDual.backend.builtInTestIdentity, 'dual.IKEMaker.test.sff');
assert.strictEqual(persistedDual.comparison.status, 'equivalent');
assert.deepStrictEqual(persistedDual.comparison.buildOrder, ['ikemaker-builtin-sff-v21-png8-prerelease', 'sprmake2']);
assert.strictEqual(persistedDual.adoption, null);

console.log('SFF candidate impact reports exact active-versus-validated sprite and palette changes');
