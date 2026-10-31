'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { COLLISION_APPEARANCE_STORAGE_KEY, COLLISION_APPEARANCE_SCHEMA, loadCollisionAppearancePreference, saveCollisionAppearancePreference } = require('../src/air_viewer');
Module._load = originalLoad;

(async () => {
  const values = new Map(), state = { get(key) { return values.get(key); }, async update(key, value) { values.set(key, value); } };
  assert.strictEqual(loadCollisionAppearancePreference(state).configured, false);
  const saved = await saveCollisionAppearancePreference({ opacity: .42, lineWidth: 3.6, scaleWithZoom: true, colors: { clsn1: '#112233', clsn1Default: '#223344', clsn2: '#334455', clsn2Default: '#445566', push: '#556677' } }, state);
  assert.strictEqual(saved.lineWidth, 3.5, 'stored line thickness follows the visible half-pixel control steps');
  const envelope = values.get(COLLISION_APPEARANCE_STORAGE_KEY);
  assert.strictEqual(envelope.schema, COLLISION_APPEARANCE_SCHEMA);
  assert.strictEqual(envelope.version, 1);
  const reopened = loadCollisionAppearancePreference(state);
  assert.strictEqual(reopened.configured, true);
  assert.deepStrictEqual(reopened.value, saved, 'a new AIR viewer instance reloads every workspace appearance value');
  values.set(COLLISION_APPEARANCE_STORAGE_KEY, { schema: COLLISION_APPEARANCE_SCHEMA, version: 2, value: saved });
  assert.strictEqual(loadCollisionAppearancePreference(state).configured, false, 'future or corrupt preference envelopes fail safely to defaults');
  console.log('AIR collision appearance persists across reload/reopen in one validated workspace preference');
})().catch(error => { console.error(error); process.exitCode = 1; });
