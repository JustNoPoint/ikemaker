'use strict';

const listeners = new Set();

function onDidChangeEngineCapabilities(listener) {
  if (typeof listener !== 'function') throw new TypeError('Engine-capability listener must be a function.');
  listeners.add(listener);
  return { dispose() { listeners.delete(listener); } };
}

function notifyEngineCapabilitiesChanged(reason = 'engine-knowledge-change') {
  const normalizedReason = typeof reason === 'string' && reason.trim()
    ? reason.trim().slice(0, 128)
    : 'engine-knowledge-change';
  const event = Object.freeze({ reason: normalizedReason });
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (_) {
      // Capability persistence must not depend on observers.
    }
  }
  return true;
}

module.exports = { onDidChangeEngineCapabilities, notifyEngineCapabilitiesChanged };
