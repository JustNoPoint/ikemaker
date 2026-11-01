'use strict';

const assert = require('assert');
const { createManifestIndex, layerOneMapping, resolvePsdBaseMapping } = require('../src/sff_psd_reconstruction');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]);
const png = encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors);
const decoded = readIndexedPng8(png);
const archiveSprite = { group: 200, number: 3, axisX: 94, axisY: 148 };
const archiveIndex = {
  byIdentity: new Map([['200,3', [archiveSprite]]]),
  byDecodedImage: new Map([[`2x2:${decoded.decodedHash}`, [archiveSprite]]])
};

const manifest = createManifestIndex([{ OriginalRelativePath: 'Ryu_st LP_003.png', ComputedGroup: '200', ImageIndex: '3', AxisX: '1', AxisY: '2' }]);
const resolved = resolvePsdBaseMapping('Ryu_st LP_003.psd', png, manifest, archiveIndex);
assert.deepStrictEqual({ group: resolved.group, number: resolved.number, axisX: resolved.axisX, axisY: resolved.axisY, basis: resolved.basis }, { group: 200, number: 3, axisX: 94, axisY: 148, basis: 'manifest-identity-current-sff-axis' });
assert.deepStrictEqual(layerOneMapping(resolved), { group: 10200, number: 3, axisX: 94, axisY: 148, basis: 'layer-1-base-plus-10000' });

const fallback = resolvePsdBaseMapping('Unknown.psd', png, new Map(), archiveIndex);
assert.strictEqual(fallback.basis, 'current-sff-exact-decoded-index-match');
assert.strictEqual(fallback.group, 200);

const ambiguous = resolvePsdBaseMapping('Unknown.psd', png, new Map(), { ...archiveIndex, byDecodedImage: new Map([[`2x2:${decoded.decodedHash}`, [archiveSprite, { ...archiveSprite, number: 4 }]]]) });
assert.strictEqual(ambiguous.status, 'blocked');
assert.match(ambiguous.reason, /ambiguous/);
const archived = createManifestIndex([{ CurrentFilename: 'archive.png', SFFGroup: 60000, SFFIndex: 0 }]).get('archive')[0];
assert.throws(() => layerOneMapping({ status: 'resolved', ...archived, axisX: 0, axisY: 0 }), /outside the 0–9999 base bank/);

console.log('PSD archive reconstruction uses the manifest first, exact current-SFF fallback second, and deterministic Layer 1 identities');
