'use strict';

const path = require('path');

const listeners = new Set();

function normalizeFilename(filename) {
  return typeof filename === 'string' && filename.trim() && path.isAbsolute(filename)
    ? path.resolve(filename)
    : '';
}

function onDidChangeProjectRegistry(listener) {
  if (typeof listener !== 'function') throw new TypeError('Project-registry listener must be a function.');
  listeners.add(listener);
  return { dispose() { listeners.delete(listener); } };
}

function notifyProjectRegistryChanged(filename, reason = 'write') {
  const normalized = normalizeFilename(filename);
  if (!normalized) return false;
  const event = Object.freeze({
    filename: normalized,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 128) : 'write'
  });
  for (const listener of [...listeners]) {
    try { listener(event); } catch (_) { /* One observer cannot block registry persistence or other observers. */ }
  }
  return true;
}

module.exports = { normalizeFilename, onDidChangeProjectRegistry, notifyProjectRegistryChanged };
