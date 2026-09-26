'use strict';

const assert = require('assert');
const { parseAirInventory, auditRequirements, markdownReport } = require('../src/requirements');

const rows = [
  { ComputedGroup: '0', ImageIndex: '0', CanonicalSequenceKey: 'Stand' },
  { ComputedGroup: '7000', ImageIndex: '0', CanonicalSequenceKey: 'Unknown move' },
  { ComputedGroup: '5000', ImageIndex: '0', CanonicalSequenceKey: 'Hit reference', AxisX: '10', AxisY: '20' }
];
const air = `
[Begin Action 0]
0, 0, 0, 0, -1

[Begin Action 200]
200, 0, 0, 0, 3

[Begin Action 5000]
`;
const actions = parseAirInventory(air);
assert.strictEqual(actions.size, 3);
assert.strictEqual(actions.get(200).frames[0].group, 200);

const profile = {
  profileName: 'Test profile',
  requiredSprites: [{ group: 0, index: 0 }, { group: 5000, index: 1, label: 'Required hit frame' }],
  requiredAnimations: [{ action: 0 }, { action: 100 }, { action: 5000 }],
  axisCopies: [{ sourceGroup: 5000, sourceIndex: 0, targetGroup: 5000, targetIndex: 10, label: 'Middle axis' }],
  temporaryRanges: [{ start: 7000, end: 7999, label: 'Temporary' }],
  intentionalOmissions: []
};
const audit = auditRequirements(rows, air, profile);
assert.deepStrictEqual(audit.missingSprites.map((item) => item.key), ['5000,1']);
assert.deepStrictEqual(audit.missingAnimations.map((item) => item.action), [100]);
assert.deepStrictEqual(audit.emptyAnimations.map((item) => item.action), [5000]);
assert.deepStrictEqual(audit.missingAirSprites.map((item) => item.key), ['200,0']);
assert.deepStrictEqual(audit.unassignedSprites.map((item) => item.key), ['7000,0']);
assert.deepStrictEqual(audit.missingAxisCopies.map((item) => item.targetKey), ['5000,10']);
assert.deepStrictEqual(audit.missingAxisRoleMappings, []);
assert.ok(markdownReport(audit).includes('Review items: 6'));

const projectAudit = auditRequirements(rows, air, {
  standardSets: ['jnp-shared-gethit-axis-references'],
  axisCopies: [{ role: 'feet', sourceGroup: null, sourceIndex: null, targetGroup: null, targetIndex: null }],
  temporaryRanges: [{ start: 7000, end: 7999 }]
});
assert.deepStrictEqual(projectAudit.missingAxisRoleMappings.map((item) => item.role), ['feet', 'middle', 'head']);

console.log('character requirement tests passed');
