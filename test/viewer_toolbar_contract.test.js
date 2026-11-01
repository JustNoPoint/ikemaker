'use strict';

const assert = require('assert');
const { CONTRACT_ID, DIMENSIONS, GROUPS, SLOTS, SPECIALIST_ACTION_IDS, slotIds } = require('../src/viewer_toolbar_contract');
const { SURFACES } = require('../src/viewer_surface_registry');

const expected = [
  'new', 'close', 'open', 'save', 'auto-save', 'save-as', 'text-source', 'connected-resources',
  'backup', 'recovery', 'run', 'versus', 'training', 'restart',
  'project', 'stage', 'sprites', 'animations', 'commands', 'states', 'sounds', 'palettes', 'code-structure', 'viewer-browser',
  'actions-search', 'suite-switch', 'updates', 'help', 'settings'
];

assert.deepStrictEqual(slotIds(), expected, 'universal toolbar slot order is a compatibility contract');
assert.strictEqual(new Set(expected).size, expected.length, 'universal toolbar slots must be unique');
assert.strictEqual(CONTRACT_ID, 'universal-v1');
assert.deepStrictEqual(DIMENSIONS, { width: 27, height: 27, unit: 'css-px', wrap: 'whole-groups', horizontalScroll: false });
assert(Object.isFrozen(DIMENSIONS) && Object.isFrozen(GROUPS) && Object.isFrozen(SLOTS), 'toolbar contract must be deeply immutable');
assert(GROUPS.every((group) => Object.isFrozen(group) && Object.isFrozen(group.slots)), 'toolbar groups and slots must be immutable');
assert(SLOTS.every((slot) => slot.group && Number.isInteger(slot.groupIndex) && Number.isInteger(slot.slotIndex)), 'each universal slot must have stable group coordinates');
assert(SLOTS.every((slot) => /^universal\./.test(slot.actionId)), 'each universal slot requires a canonical action identity');
assert.strictEqual(new Set(SLOTS.map((slot) => slot.actionId)).size, SLOTS.length, 'canonical universal action identities must be unique');
assert(SPECIALIST_ACTION_IDS.every((id) => !expected.includes(id)), 'specialist actions cannot occupy universal slots');
for (const forbidden of ['snd.element.add', 'snd.element.delete', 'snd.element.replace', 'snd.element.export', 'snd.special.audio-play', 'snd.special.audio-loop', 'snd.special.audio-pause', 'snd.element.stop']) {
  assert(SPECIALIST_ACTION_IDS.includes(forbidden), `${forbidden} must remain a local SND control`);
}
for (const surface of SURFACES) {
  if (surface.toolbarPolicy === 'excluded') assert.strictEqual(surface.toolbarContractId, '', `${surface.id} must not claim the universal toolbar`);
  else assert.strictEqual(surface.toolbarContractId, CONTRACT_ID, `${surface.id} must target the universal toolbar contract`);
}

console.log('Invariant viewer toolbar contract tests passed');
