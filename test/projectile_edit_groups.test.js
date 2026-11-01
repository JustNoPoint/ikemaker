'use strict';

const assert = require('assert');
const { TARGETS } = require('../src/projectile_edit_draft');
const { GROUPS, GROUP_BY_TARGET, groupIdForTarget, projectAuthoredGroups } = require('../src/projectile_edit_groups');

assert(Object.isFrozen(GROUPS) && GROUPS.every(group => Object.isFrozen(group) && Object.isFrozen(group.targets)));
const orderedTargets = GROUPS.flatMap(group => group.targets);
assert.strictEqual(new Set(orderedTargets).size, orderedTargets.length, 'every guarded target belongs to at most one group');
assert.deepStrictEqual(new Set(orderedTargets), new Set(Object.keys(TARGETS)), 'the ordered group table exactly covers the planner vocabulary');
for (const target of orderedTargets) assert.strictEqual(groupIdForTarget(target), GROUP_BY_TARGET.get(target));
assert.strictEqual(groupIdForTarget('forged'), '');

const fields = Object.keys(TARGETS).map(target => ({ target, status: 'omitted', editable: false }));
Object.assign(fields.find(field => field.target === 'projanim'), { status: 'ready', editable: true, authoredName: 'ProjAnim', expression: '600' });
Object.assign(fields.find(field => field.target === 'damage'), { status: 'dynamic', editable: false, authoredName: 'Damage', expression: 'map(Damage)', reason: 'Dynamic expression' });
Object.assign(fields.find(field => field.target === 'ground.hittime'), { status: 'ready', editable: true, authoredName: 'Ground.HitTime', expression: '14' });
const projected = projectAuthoredGroups(fields, { replacements: [{ target: 'ground.hittime' }] });
assert(Object.isFrozen(projected) && projected.every(group => Object.isFrozen(group) && Object.isFrozen(group.fields)));
assert.deepStrictEqual(projected.map(group => group.id), ['projectile', 'pairs', 'timing'], 'omitted-only groups are absent and authored groups keep stable order');
assert.strictEqual(projected[1].fields[0].status, 'dynamic', 'locked authored fields stay in their group');
assert.deepStrictEqual([projected[1].authoredCount, projected[1].editableCount, projected[1].omittedCount], [1, 0, 2]);
assert.strictEqual(projected[2].hasPreview, true, 'preview replacements mark their exact group');
assert.strictEqual(projected[0].hasPreview, false);
assert.deepStrictEqual(projectAuthoredGroups(fields.map(field => ({ ...field, status: 'omitted', editable: false }))), [], 'an omitted-only edit model produces no group markup DTOs');

console.log('Projectile edit groups are one ordered vocabulary, omit empty groups, retain locked authored fields, and expose preview-safe counts');
