'use strict';

const NATIVE = 'native';
const INTEGRATED = 'integrated';
const ASK = 'ask';
const UNSET = 'unset';
const VALUES = Object.freeze([NATIVE, INTEGRATED, ASK]);
const DEFAULT_KEY = 'ikemaker.authoringPresentationPreference';
const DEFAULT_LEGACY_KEYS = Object.freeze(['ikemaker.authoringPresentation', 'ikemaker.preferIntegratedAuthoring']);

function normalizePreference(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (VALUES.includes(normalized)) return normalized;
  return UNSET;
}

function legacyPreference(value) {
  if (value === true) return INTEGRATED;
  if (value === false) return NATIVE;
  const normalized = normalizePreference(value);
  return normalized === UNSET ? UNSET : normalized;
}

function readFrom(storage, key, fallback) {
  if (!storage || typeof storage.get !== 'function') return fallback;
  return storage.get(key, fallback);
}

function choiceValue(choice) {
  if (choice === undefined || choice === null) return null;
  if (typeof choice === 'string') {
    const value = normalizePreference(choice);
    return value === UNSET ? null : { value, remember: false };
  }
  const value = normalizePreference(choice.value ?? choice.preference ?? choice.mode);
  return value === UNSET ? null : { value, remember: Boolean(choice.remember ?? choice.persist) };
}

class AuthoringPresentationPreference {
  constructor(options = {}) {
    this.storage = options.storage || options.state || null;
    this.key = options.key || DEFAULT_KEY;
    this.legacyKeys = options.legacyKeys || (options.legacyKey ? [options.legacyKey] : DEFAULT_LEGACY_KEYS);
    this.prompt = options.prompt || null;
    const fallback = normalizePreference(options.fallback);
    this.fallback = fallback === NATIVE || fallback === INTEGRATED ? fallback : NATIVE;
    this._scopeChoices = new Map();
    this._unscoped = 0;
    this._queue = Promise.resolve();
  }

  read() {
    const direct = normalizePreference(readFrom(this.storage, this.key, undefined));
    if (direct !== UNSET) return direct;
    for (const key of this.legacyKeys) {
      const legacy = legacyPreference(readFrom(this.storage, key, undefined));
      if (legacy !== UNSET) return legacy;
    }
    return UNSET;
  }

  async write(value) {
    return this._serialize(() => this._write(value));
  }

  async _write(value) {
    const normalized = normalizePreference(value);
    if (!this.storage || typeof this.storage.update !== 'function') return false;
    await this.storage.update(this.key, normalized === UNSET ? undefined : normalized);
    if (normalized !== ASK) this._scopeChoices.clear();
    return true;
  }

  resolve(request = {}) {
    const taskId = request.taskId ?? request.task;
    const sessionId = request.sessionId ?? request.session;
    const scope = taskId === undefined && sessionId === undefined
      ? `unscoped\0${this._unscoped++}`
      : `${String(taskId ?? '')}\0${String(sessionId ?? '')}`;
    return this._serialize(async () => {
      const requested = normalizePreference(request.requestedPresentation ?? request.legacyFallback);
      const legacyRoute = requested === NATIVE || requested === INTEGRATED ? requested : this.fallback;
      const preference = this.read();
      if (preference === NATIVE || preference === INTEGRATED) return preference;
      if (preference === ASK && this._scopeChoices.has(scope)) return this._scopeChoices.get(scope);

      const prompt = request.prompt || this.prompt;
      if (typeof prompt !== 'function') return legacyRoute;
      const choices = preference === UNSET
        ? Object.freeze([
          Object.freeze({ label: 'Native editor + coding tools', description: 'Remember this choice', value: INTEGRATED, remember: true }),
          Object.freeze({ label: 'Native editors only', description: 'Remember this choice', value: NATIVE, remember: true }),
          Object.freeze({ label: 'Ask each task', description: 'Choose once per task and session', value: ASK, remember: true })
        ])
        : Object.freeze([
          Object.freeze({ label: 'Native editor + coding tools', value: INTEGRATED, remember: false }),
          Object.freeze({ label: 'Native editors only', value: NATIVE, remember: false })
        ]);
      let selected;
      try { selected = choiceValue(await prompt(choices, { preference, scope, taskId: request.taskId ?? request.task, sessionId: request.sessionId ?? request.session })); }
      catch (_) { return legacyRoute; }
      if (!selected) return legacyRoute;
      if (preference === UNSET && selected.remember) { try { await this._write(selected.value); } catch (_) {} }
      if (selected.value === ASK) {
        const perScopeChoices = Object.freeze([
          Object.freeze({ label: 'Native editor + coding tools', value: INTEGRATED, remember: false }),
          Object.freeze({ label: 'Native editors only', value: NATIVE, remember: false })
        ]);
        let scoped;
        try { scoped = choiceValue(await prompt(perScopeChoices, { preference: ASK, scope, taskId: request.taskId ?? request.task, sessionId: request.sessionId ?? request.session })); }
        catch (_) { return legacyRoute; }
        if (!scoped || scoped.value === ASK) return legacyRoute;
        this._scopeChoices.set(scope, scoped.value);
        return scoped.value;
      }
      if (preference === ASK) this._scopeChoices.set(scope, selected.value);
      return selected.value;
    });
  }

  clearSession(taskId, sessionId) {
    return this._scopeChoices.delete(`${String(taskId ?? '')}\0${String(sessionId ?? '')}`);
  }

  dispose() { this._scopeChoices.clear(); }

  _serialize(operation) {
    const result = this._queue.then(operation, operation);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function createAuthoringPresentationPreference(options) { return new AuthoringPresentationPreference(options); }
function readAuthoringPresentationPreference(storage, options = {}) { return new AuthoringPresentationPreference({ ...options, storage }).read(); }

module.exports = {
  NATIVE,
  INTEGRATED,
  ASK,
  UNSET,
  PRESENTATION_VALUES: VALUES,
  DEFAULT_KEY,
  AuthoringPresentationPreference,
  createAuthoringPresentationPreference,
  readAuthoringPresentationPreference,
  normalizePreference
};
