'use strict';

const assert = require('assert');
const {
  parseCsv,
  stringifyCsv,
  parseSpriteName,
  validateManifest,
  layerFolderNumber,
  formFolderNumber,
  inferLayerRole,
  makeLayerRows,
  redundancyCandidates,
  manualLayerRows,
  applyManualLayerDecision,
  HYPER_FAMILIES,
  hyperFamily,
  resolveAlias
} = require('../src/sff');

const csv = 'Name,Note\r\n"A,1","said ""yes"""\r\n';
assert.deepStrictEqual(parseCsv(csv), [{ Name: 'A,1', Note: 'said "yes"' }]);
assert.deepStrictEqual(parseCsv(stringifyCsv(parseCsv(csv))), parseCsv(csv));

assert.deepStrictEqual(parseSpriteName('Ryu 2026 CvS_st LP_003.png'), {
  sequence: 'st LP', index: 3, stem: 'Ryu 2026 CvS_st LP_003'
});
assert.strictEqual(layerFolderNumber('Layer1'), 1);
assert.strictEqual(layerFolderNumber('layer4'), 4);
assert.strictEqual(layerFolderNumber('beard_layer1_work'), null);
assert.strictEqual(formFolderNumber('Form1'), 1);
assert.strictEqual(formFolderNumber('Form 2 SSBE'), 2);
assert.strictEqual(formFolderNumber('SSB'), null, 'semantic names must not silently choose a form slot');
assert.deepStrictEqual(inferLayerRole('Part Front'), { role: 'PartFront', syncLayer: '1' });
assert.deepStrictEqual(inferLayerRole('Back Part'), { role: 'PartBack', syncLayer: '-1' });
assert.deepStrictEqual(inferLayerRole('Ryu Beard'), { role: 'Cosmetic', syncLayer: '1' });

const projectAliases = { aliases: {
  contexts: { st: ['standingpose'] },
  strengths: { L: ['jabstrength'] },
  attackTypes: { P: ['fist'] },
  sequences: { 'st LP': ['quick jab'] },
  families: { DP: ['dragon upper'] }
} };
assert.strictEqual(resolveAlias('standingpose', projectAliases, ['contexts']), 'st');
assert.strictEqual(parseSpriteName('quick jab_002.png', projectAliases).sequence, 'st LP');
assert.strictEqual(parseSpriteName('standingpose jabstrength fist_002.png', projectAliases).sequence, 'st LP');

const base = {
  OriginalRelativePath: 'Ryu 2026 CvS_st LP_003.png', CanonicalSequenceKey: 'st LP',
  BaseGroup: '200', LayerNumber: '0', ComputedGroup: '200', SourceImageIndex: '3',
  ImageIndex: '3', CanonicalOutputFilename: '00200_00003.png', AxisX: '94', AxisY: '148',
  ReviewStatus: 'APPROVED', SourceSHA256: 'ABC', AssetStatus: 'active'
};
assert.deepStrictEqual(validateManifest([base]), []);
assert.deepStrictEqual(validateManifest([{ ...base, FormNumber: '2', ImageIndex: '20003' }]), []);
assert.ok(validateManifest([{ ...base, FormNumber: '2', ImageIndex: '3' }]).some((issue) => issue.includes('base item 3 + 20000')));

const layered = makeLayerRows([base], [{
  name: 'Ryu 2026 CvS_st LP_003.png', fullPath: 'C:\\beard\\frame.png', hash: 'ABC'
}], 1, {}, { role: 'Cosmetic', syncLayer: '1', owner: 'P1' });
assert.strictEqual(layered.unmatched.length, 0);
assert.strictEqual(layered.created[0].ComputedGroup, '10200');
assert.strictEqual(layered.created[0].ImageIndex, '3');
assert.strictEqual(layered.created[0].RedundancyStatus, 'CANDIDATE_EXACT');
assert.strictEqual(layered.created[0].LayerRole, 'Cosmetic');
assert.strictEqual(layered.created[0].SuggestedSyncLayer, '1');
assert.strictEqual(layered.created[0].LayerOwner, 'P1');

const partRows = makeLayerRows([base], [{
  name: 'Ryu 2026 CvS_st LP_003.png', fullPath: 'C:\\parts\\frame.png', hash: 'PART'
}], 2, {}, { role: 'PartFront', syncLayer: '1', owner: 'Review' }).created;
assert.strictEqual(manualLayerRows(partRows).length, 1);
const reviewed = applyManualLayerDecision(partRows, ['20200,3'], { owner: 'P2', syncLayer: 1 });
assert.strictEqual(reviewed.updated, 1);
assert.strictEqual(reviewed.rows[0].LayerOwner, 'P2');
assert.strictEqual(reviewed.rows[0].RuntimeLayerReview, 'HUMAN_CONFIRMED');
assert.strictEqual(reviewed.rows[0].ReviewStatus, 'APPROVED');
assert.strictEqual(manualLayerRows(reviewed.rows).length, 0);

const layer = { ...layered.created[0], ReviewStatus: 'APPROVED' };
assert.deepStrictEqual(validateManifest([base, layer]), []);
assert.strictEqual(redundancyCandidates([base, layer]).length, 1);
layer.RedundancyStatus = 'DISMISSED';
assert.strictEqual(redundancyCandidates([base, layer]).length, 0);
layer.SourceSHA256 = 'CHANGED';
assert.strictEqual(redundancyCandidates([base, layer]).length, 1);
layer.RedundancyStatus = 'CANDIDATE_MANUAL';
assert.strictEqual(redundancyCandidates([base, layer]).length, 1);

assert.strictEqual(HYPER_FAMILIES.length, 14);
const shinSho = {
  ...base, OriginalRelativePath: 'Ryu_ShinSho_013.png', CanonicalSequenceKey: 'ShinSho',
  BaseGroup: '3100', ComputedGroup: '3100', ImageIndex: '13', SourceImageIndex: '13'
};
assert.strictEqual(hyperFamily(shinSho).name, 'DP');
assert.strictEqual(hyperFamily({ ...shinSho, CanonicalSequenceKey: 'Dragon Upper' }, projectAliases).name, 'DP');
assert.deepStrictEqual(validateManifest([shinSho]), []);
assert.ok(validateManifest([{ ...shinSho, BaseGroup: '3000', ComputedGroup: '3000' }])
  .some((issue) => issue.includes('DP Hyper must use 3100-3199')));
assert.ok(validateManifest([{ ...shinSho, BaseGroup: '3105', ComputedGroup: '3105' }])
  .some((issue) => issue.includes('ten-group slots')));
assert.ok(validateManifest([{
  ...shinSho, CanonicalSequenceKey: 'UnknownHyper', FunctionalFamily: '', BaseGroup: '3200', ComputedGroup: '3200'
}]).some((issue) => issue.includes('recognized FunctionalFamily')));
assert.deepStrictEqual(validateManifest([{
  ...shinSho, CanonicalSequenceKey: 'Float', FunctionalFamily: 'FloatAerialControl', BaseGroup: '4000', ComputedGroup: '4000'
}]), []);

console.log('SFF workflow tests passed.');
