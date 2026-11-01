'use strict';
const assert = require('assert');
const { storySourceReferences, resolveStorySource, validStorySourceReference } = require('../src/story_dialogue_model');

const uri = 'file:///C:/game/data/select.def';
const records = [
  { role: 'select-root', uri, id: '', logicalRecord: '[StoryMode]\r\nname = ryu', line: 0 },
  { role: 'story-arc', uri, id: 'Ryu', logicalRecord: 'name = Ryu\r\npath = data/story/ryu.lua', line: 4 },
  { role: 'story-arc', uri, id: 'Ryu', logicalRecord: 'name = Ryu\npath = data/story/ryu.lua', line: 20 }
];
const projected = storySourceReferences(records);
assert.equal(projected.length, 3);
assert.equal(projected[0].reference.normalizedId, '');
assert.equal(projected[1].reference.matchCount, 2);
assert.equal(projected[1].reference.occurrence, 0);
assert.equal(projected[2].reference.occurrence, 1);
assert(Object.isFrozen(projected[1].reference));
assert(validStorySourceReference(projected[1].reference));

const shifted = records.map((record) => ({ ...record, line: record.line + 9 }));
assert.equal(resolveStorySource(shifted, projected[2].reference).record.line, 29, 'unrelated preceding-line shifts relocate the exact record');
const changed = shifted.map((record, index) => index === 2 ? { ...record, logicalRecord: `${record.logicalRecord}\nunlock = false` } : record);
assert.equal(resolveStorySource(changed, projected[2].reference), null, 'changed logical record fails closed');
assert.equal(resolveStorySource(shifted.slice(0, 2), projected[1].reference), null, 'changed duplicate count fails closed');
assert.equal(resolveStorySource(records, { ...projected[1].reference, line: 4 }), null, 'line is never accepted as identity');
assert.equal(validStorySourceReference(Object.assign(Object.create({ forged: true }), projected[1].reference)), false);
assert.equal(validStorySourceReference({ ...projected[1].reference, extra: true }), false);
assert.equal(validStorySourceReference({ ...projected[1].reference, normalizedId: '' }), false);
console.log('Story Dialogue D1 stable source identity, relocation, ambiguity, and strict schema tests passed');
