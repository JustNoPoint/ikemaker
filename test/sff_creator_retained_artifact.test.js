'use strict';

const assert = require('assert');
const { selectCanonicalRetainedJson } = require('../src/sff_creator_retained_artifact');

const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const canonical = 'sff17d-execution-outcome-receipt';
const transactional = 'ikemaker.sff-creator-transactional-execution-receipt';
const recovery = 'ikemaker.sff-creator-execution-recovery-receipt';
const row = (name, schema) => ({ name, bytes: json({ schema, version: 1 }) });

let selected = selectCanonicalRetainedJson([row(canonical, transactional)], canonical, [transactional, recovery], 'terminal receipt');
assert.strictEqual(selected.name, canonical);
assert.strictEqual(selected.value.schema, transactional);
selected.bytes.fill(0);
assert.strictEqual(selectCanonicalRetainedJson([row(canonical, recovery)], canonical, [transactional, recovery], 'terminal receipt').value.schema, recovery, 'the canonical outcome name accepts the reviewed recovery schema');
assert.throws(() => selectCanonicalRetainedJson([row(canonical, 'wrong.schema')], canonical, [transactional, recovery], 'terminal receipt'), /one exact canonical/i);
assert.throws(() => selectCanonicalRetainedJson([row('renamed-outcome', transactional)], canonical, [transactional, recovery], 'terminal receipt'), /one exact canonical/i);
assert.throws(() => selectCanonicalRetainedJson([row(canonical, transactional), row('conflicting-outcome', recovery)], canonical, [transactional, recovery], 'terminal receipt'), /one exact canonical/i, 'a conflicting second allowed schema remains ambiguous and fails closed');
assert.throws(() => selectCanonicalRetainedJson([row(canonical, transactional), row(canonical, transactional)], canonical, [transactional, recovery], 'terminal receipt'), /one exact canonical/i, 'duplicate canonical evidence fails closed');
assert.throws(() => selectCanonicalRetainedJson([row(canonical, recovery), , row('other', 'other.schema')], canonical, [transactional, recovery], 'terminal receipt'), /dense/i);

console.log('SFF Creator canonical retained-artifact selection preserves exact names, schema alternatives, copies, and ambiguity rejection');
