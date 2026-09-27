'use strict';

const assert = require('assert');
const { actionsIn, classification, frameRole, createProposal, parseAssignmentInput } = require('../src/air_clsn2_batch_model');

const fixture = `; Standing idle
[Begin Action 0]
Clsn2Default: 1
  Clsn2[0] = -10, -80, 10, 0
0, 0, 0, 0, 3
; the next explicit block owns the next frame despite these lines
Clsn2: 1
  Clsn2[0] = -8, -40, 8, 0
; retained collision note
Clsn1: 1
  Clsn1[0] = -2, -3, 4, 5
LoopStart
0, 1, 1, 2, 4, H

; Stand to crouch transition
[Begin Action 10]
10, 0, 0, 0, 2
10, 1, 0, 0, 3

; Crouch to stand transition
[Begin Action 12]
12, 0, 0, 0, 2
12, 1, 0, 0, 3

; Air Jump Start (misleading name)
[Begin Action 40]
999, 0, 0, 0, 4

; Custom hover
[Begin Action 777]
123, 9, 5, -2, 6
`;

const parsed = actionsIn(fixture);
assert.strictEqual(parsed.actions.length, 5);
assert.strictEqual(parsed.actions[0].frames[1].source, 'element');
assert.deepStrictEqual(parsed.actions[0].frames[1].effective, [[-8, -40, 8, 0]]);
assert.strictEqual(parsed.actions[3].frames[0].line > parsed.actions[3].start, true, 'AIR action IDs must not be inferred from sprite groups');

const action10 = classification(parsed.actions[1]);
assert.strictEqual(frameRole(action10, 0), 'crouch');
assert.strictEqual(frameRole(action10, 1), 'crouch');
const action12 = classification(parsed.actions[2]);
assert.strictEqual(frameRole(action12, 0), 'stand');
assert.strictEqual(frameRole(action12, 1), 'stand');
assert.deepStrictEqual(classification(parsed.actions[3]), { role: 'grounded-start', source: 'standard Action 40 suggestion' });
assert.strictEqual(classification(parsed.actions[4], { overrides: { 777: 'air' } }).role, 'air');
assert.strictEqual(classification(parsed.actions[4], { exclusions: [777], overrides: { 777: 'air' } }).role, 'excluded', 'explicit exclusion wins');
assert.deepStrictEqual(parseAssignmentInput('10=crouch, 777=custom !40'), { overrides: { 10: 'crouch', 777: 'custom' }, exclusions: [40] });

const appended = createProposal(fixture, { actions: '0', elements: '1', role: 'all', operation: 'append', boxes: [[-20, -90, 20, 0]] });
assert.deepStrictEqual(appended.changed, [{ action: 0, elements: [1], operation: 'append' }]);
assert.match(appended.text, /Clsn2: 2\n\s*Clsn2\[0\] = -10, -80, 10, 0\n\s*Clsn2\[1\] = -20, -90, 20, 0\n0, 0/, 'append must include inherited effective default boxes');

const emptied = createProposal(fixture, { actions: '0', elements: '1', role: 'all', operation: 'clearEffective' });
assert.match(emptied.text, /Clsn2: 0\n0, 0/, 'effective clear must mask an inherited default explicitly');
assert(emptied.text.includes('Clsn2Default: 1'), 'effective clear must not delete the action default');

const overrideRemoved = createProposal(fixture, { actions: '0', elements: '2', role: 'all', operation: 'removeOverride' });
assert(!overrideRemoved.text.includes('Clsn2[0] = -8, -40, 8, 0'));
assert(overrideRemoved.text.includes('; retained collision note\nClsn1: 1'), 'comments and Clsn1 between collision data and the frame must survive');
assert.deepStrictEqual(actionsIn(overrideRemoved.text).actions[0].frames[1].effective, [[-10, -80, 10, 0]], 'removing an override reveals the default');

const crouchTransition = createProposal(fixture, { actions: '10', elements: 'all', role: 'crouch', operation: 'replace', boxes: [[-9, -44, 9, 0]] });
assert.deepStrictEqual(crouchTransition.changed[0].elements, [1, 2], 'Action 10 crouch assignment starts at displayed element 1');
const standTransition = createProposal(fixture, { actions: '12', elements: '1', role: 'stand', operation: 'replace', boxes: [[-9, -84, 9, 0]] });
assert.deepStrictEqual(standTransition.changed[0].elements, [1], 'Action 12 stand assignment starts at displayed element 1 and respects a narrower range');
const noAirJumpStart = createProposal(fixture, { actions: '40', elements: 'all', role: 'air', operation: 'replace', boxes: [[-9, -84, 9, 0]] });
assert.strictEqual(noAirJumpStart.changed.length, 0, 'Action 40 must not become airborne merely because its heading contains Air/Jump');

const custom = createProposal(fixture, { actions: '777', elements: 'all', role: 'air', operation: 'replace', boxes: [[-1, -2, 3, 4]], overrides: { 777: 'air' } });
assert.deepStrictEqual(custom.changedActions, [777]);
assert(custom.text.includes('123, 9, 5, -2, 6'), 'sprite group 123 remains unrelated to AIR Action 777');

const defaulted = createProposal(fixture, { actions: '0', role: 'all', operation: 'default', boxes: [[10, 0, -10, -80]] });
assert.strictEqual((defaulted.text.match(/Clsn2(?:Default)?\s*:/g) || []).length, 1);
assert(defaulted.text.includes('Clsn2Default: 1\n  Clsn2[0] = -10, -80, 10, 0'), 'coordinates are normalized');
assert(defaulted.text.includes('Clsn1[0] = -2, -3, 4, 5'));

const cleared = createProposal(fixture, { actions: '0', role: 'all', operation: 'clearAll' });
assert.strictEqual((cleared.text.match(/Clsn2(?:Default)?\s*:/g) || []).length, 0);
assert(cleared.text.includes('; retained collision note'));
assert(cleared.text.includes('0, 1, 1, 2, 4, H'));

assert.throws(() => createProposal('[Begin Action 1]\n1,0,0,0,1\n[Begin Action 1]\n1,1,0,0,1', { actions: '1', operation: 'replace', boxes: [[0, 0, 1, 1]] }), /Duplicate AIR action ID/);
assert.throws(() => createProposal('[Begin Action 1]\nClsn2: 2\nClsn2[0]=0,0,1,1\n1,0,0,0,1', { actions: '1', operation: 'replace', boxes: [[0, 0, 1, 1]] }), /incomplete Clsn2/);
assert.throws(() => createProposal(fixture, { actions: '0', operation: 'replace', boxes: [[0, Number.POSITIVE_INFINITY, 1, 1]] }), /finite coordinates/);

console.log('AIR shared Clsn2 batch model tests passed');
