'use strict';

const assert = require('assert');
const { CommandPresetImportAuthority } = require('../src/command_preset_import_authority');

let index = 0;
const authority = new CommandPresetImportAuthority({ token: () => (++index).toString(16).padStart(48, '0') });
const context = { sessionId: 'session-a', generation: 4, source: 'c:\\presets\\moves.inp2', fileHash: 'file-a', storeSnapshot: '[]', capabilities: { target: { channel: 'stable' } }, planHash: 'plan-a' };
const token = authority.issue(context);
assert.deepStrictEqual(authority.consume(token, context).generation, 4);
assert.throws(() => authority.consume(token, context), /already used/, 'authority is one-use');

for (const mutation of [
  { fileHash: 'file-b' }, { storeSnapshot: '[{}]' }, { generation: 5 }, { source: 'c:\\other.inp2' },
  { capabilities: { target: { channel: 'nightly' } } }, { planHash: 'plan-b' }
]) {
  const next = authority.issue(context);
  assert.throws(() => authority.consume(next, { ...context, ...mutation }), /changed after review/);
  assert.throws(() => authority.consume(next, context), /already used/, 'a rejected token is consumed and cannot be replayed');
}

console.log('One-use command preset import authority tests passed');
