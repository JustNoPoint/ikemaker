'use strict';

const assert = require('assert');
const { expectedIndex, auditIndexPolicy, applyIndexPolicy, normalizeProfile } = require('../src/sff_build_profile');

const rows = [
  { OriginalRelativePath: 'GetHit_High_000.png', CanonicalSequenceKey: 'GetHit_High', Family: 'GetHit', BaseGroup: '5000', ComputedGroup: '5000', SourceImageIndex: '0', ImageIndex: '0', ReviewStatus: 'APPROVED' },
  { OriginalRelativePath: 'GetHit_High_001.png', CanonicalSequenceKey: 'GetHit_High', Family: 'GetHit', BaseGroup: '5000', ComputedGroup: '5000', SourceImageIndex: '1', ImageIndex: '1', ReviewStatus: 'APPROVED' },
  { OriginalRelativePath: 'GetHit_High_002.png', CanonicalSequenceKey: 'GetHit_High', Family: 'GetHit', BaseGroup: '5000', ComputedGroup: '15000', LayerNumber: '1', SourceImageIndex: '2', ImageIndex: '2', ReviewStatus: 'APPROVED' },
  { OriginalRelativePath: 'Palette.png', CanonicalSequenceKey: 'PaletteTemplate', BaseGroup: '5900', ComputedGroup: '5900', SourceImageIndex: '1', ImageIndex: '1', ReviewStatus: 'APPROVED' },
  { OriginalRelativePath: 'Idle_001.png', CanonicalSequenceKey: 'Idle', BaseGroup: '0', ComputedGroup: '0', SourceImageIndex: '1', ImageIndex: '1', ReviewStatus: 'APPROVED' }
];

assert.strictEqual(expectedIndex(rows[0], {}), 0);
assert.strictEqual(expectedIndex(rows[1], {}), 10);
assert.strictEqual(expectedIndex(rows[2], {}), 20, 'layer copies inherit their base get-hit indexing');
assert.strictEqual(expectedIndex(rows[3], {}), null, 'unrelated 5000-range assets are not rewritten');
assert.strictEqual(expectedIndex(rows[4], {}), null);
assert.strictEqual(auditIndexPolicy(rows, {}).issues.length, 2);

const applied = applyIndexPolicy(rows, {});
assert.strictEqual(applied.changes.length, 2);
assert.strictEqual(applied.rows[1].ImageIndex, '10');
assert.strictEqual(applied.rows[1].CanonicalOutputFilename, '05000_00010.png');
assert.strictEqual(applied.rows[1].ReviewStatus, 'REVIEW');
assert.strictEqual(applied.rows[2].CanonicalOutputFilename, '15000_00020.png');

const custom = normalizeProfile({ getHitIndexing: { sequenceOverrides: { GetHit_High: { 1: 15 } } } });
assert.strictEqual(expectedIndex(rows[1], custom), 15);

const nativeFall = { CanonicalSequenceKey: 'GetHit_Fall', BaseGroup: '5050', ComputedGroup: '5050', SourceImageIndex: '5', ImageIndex: '5' };
const nativeOtg = { CanonicalSequenceKey: 'GetHit_OTG', BaseGroup: '5080', ComputedGroup: '5080', SourceImageIndex: '0', ImageIndex: '0' };
assert.strictEqual(expectedIndex(nativeFall, {}), 10, 'native fall slots use their explicit KFM-style mapping');
const nativeApplied = applyIndexPolicy([nativeFall, nativeOtg], {});
assert.deepStrictEqual(nativeApplied.rows.map(row => [row.ComputedGroup, row.ImageIndex]), [['5040', '10'], ['5040', '20']]);
assert.strictEqual(auditIndexPolicy(applied.rows, {}).issues.length, 0, 'an applied layered mapping must audit cleanly');

console.log('SFF build profile tests passed');
