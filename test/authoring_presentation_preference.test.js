'use strict';

const assert = require('assert');
const {
  NATIVE, INTEGRATED, ASK, UNSET, DEFAULT_KEY,
  AuthoringPresentationPreference, normalizePreference, readAuthoringPresentationPreference
} = require('../src/authoring_presentation_preference');

function storage(initial = {}) {
  const values = { ...initial }, updates = [];
  return {
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback; },
    async update(key, value) { updates.push({ key, value }); if (value === undefined) delete values[key]; else values[key] = value; },
    values, updates
  };
}

(async () => {
  assert.strictEqual(normalizePreference(' NATIVE '), NATIVE);
  assert.strictEqual(normalizePreference('unexpected'), UNSET);
  let store = storage(), prompts = 0;
  let preference = new AuthoringPresentationPreference({ storage: store, prompt: async () => { prompts++; return null; } });
  assert.strictEqual(preference.read(), UNSET, 'unset is not conflated with ask');
  assert.strictEqual(prompts, 0, 'reading the preference is lazy');
  assert.strictEqual(await preference.resolve({ taskId: 'one', sessionId: 'a', requestedPresentation: INTEGRATED }), INTEGRATED, 'dismissal preserves the already-requested integrated route');
  assert.strictEqual(await preference.resolve({ taskId: 'two', sessionId: 'a', requestedPresentation: NATIVE }), NATIVE, 'dismissal preserves the already-requested native route');
  assert.strictEqual(store.updates.length, 0, 'dismissal never writes a preference');
  store = storage();
  preference = new AuthoringPresentationPreference({ storage:store, fallback:NATIVE, prompt:async()=>{throw new Error('prompt unavailable');} });
  assert.strictEqual(await preference.resolve({ taskId:'failed', sessionId:'prompt', requestedPresentation:NATIVE }),NATIVE,'prompt failure uses the requested safe Native route');
  assert.strictEqual(store.updates.length,0,'prompt failure cannot write a preference');

  store = storage({ 'ikemaker.preferIntegratedAuthoring': true });
  assert.strictEqual(readAuthoringPresentationPreference(store), INTEGRATED, 'legacy boolean preferences remain a read-only fallback');
  assert.strictEqual(store.updates.length, 0);

  store = storage({ [DEFAULT_KEY]: NATIVE }); prompts = 0;
  preference = new AuthoringPresentationPreference({ storage: store, prompt: async () => { prompts++; } });
  assert.strictEqual(await preference.resolve({ taskId: 'one', sessionId: 'a' }), NATIVE);
  assert.strictEqual(prompts, 0, 'an explicit preference bypasses prompting');

  store = storage();
  preference = new AuthoringPresentationPreference({ storage: store, prompt: async items => items.find(item => item.value === INTEGRATED) });
  assert.strictEqual(await preference.resolve({ taskId: 'one', sessionId: 'a' }), INTEGRATED);
  assert.deepStrictEqual(store.updates, [{ key: DEFAULT_KEY, value: INTEGRATED }], 'first choice is remembered only when explicitly marked by the offered item');

  store = storage({ [DEFAULT_KEY]: ASK });
  const scopes = [];
  preference = new AuthoringPresentationPreference({ storage: store, prompt: async (items, context) => { scopes.push(context.scope); return items[0]; } });
  assert.strictEqual(await preference.resolve({ taskId: 'task', sessionId: 'one' }), INTEGRATED);
  assert.strictEqual(await preference.resolve({ taskId: 'task', sessionId: 'one' }), INTEGRATED);
  assert.strictEqual(await preference.resolve({ taskId: 'task', sessionId: 'two' }), INTEGRATED);
  assert.deepStrictEqual(scopes, ['task\0one', 'task\0two'], 'ask is cached only within one task/session');
  assert.strictEqual(store.updates.length, 0, 'ask choices are never persisted');

  let active = 0, maximum = 0, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  preference = new AuthoringPresentationPreference({ storage: storage({ [DEFAULT_KEY]: ASK }), prompt: async items => {
    calls++; active++; maximum = Math.max(maximum, active); await gate; active--; return items[1];
  } });
  const first = preference.resolve({ taskId: 'same', sessionId: 'same' });
  const second = preference.resolve({ taskId: 'same', sessionId: 'same' });
  await Promise.resolve(); release();
  assert.deepStrictEqual(await Promise.all([first, second]), [NATIVE, NATIVE]);
  assert.strictEqual(calls, 1, 'concurrent requests for one scope share the resolved choice');
  assert.strictEqual(maximum, 1, 'prompt decisions are serialized');

  preference = new AuthoringPresentationPreference({ fallback: NATIVE });
  assert.strictEqual(await preference.resolve(), NATIVE, 'hosts without a prompt retain the safe native fallback');
  assert.strictEqual(await new AuthoringPresentationPreference({ fallback: ASK }).resolve(), NATIVE, 'an unresolved Ask fallback fails closed to Native');

  store = storage();
  store.update = async () => { throw new Error('storage unavailable'); };
  prompts = 0;
  preference = new AuthoringPresentationPreference({ storage: store, prompt: async items => { prompts++; return items.find(item => item.value === INTEGRATED); } });
  assert.strictEqual(await preference.resolve({ requestedPresentation: NATIVE }), INTEGRATED, 'a selected route still opens when remembering fails');
  assert.strictEqual(preference.read(), UNSET, 'a failed write cannot create a false remembered choice');
  assert.strictEqual(await preference.resolve({ requestedPresentation: NATIVE }), INTEGRATED);
  assert.strictEqual(prompts, 2, 'failed persistence prompts again instead of caching a false choice');
  preference.dispose();

  console.log('Authoring presentation unset, legacy, lazy, remembered, ask-scope, dismissal and concurrency tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
