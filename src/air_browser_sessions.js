'use strict';

const path = require('path');
const sessions = new Map();
const changeListeners = new Set();
const key = filename => {
  const resolved = path.resolve(filename || '.');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
const has = filename => Boolean(filename && sessions.has(key(filename)));
const onDidChangeSourceHandoff = listener => {
  if (typeof listener !== 'function') return { dispose() {} };
  changeListeners.add(listener);
  return { dispose() { changeListeners.delete(listener); } };
};
const notifySourceHandoffChanged = (filename, available) => {
  if (!filename) return 0;
  const change = Object.freeze({ filename: key(filename), available: available === true });
  let notified = 0;
  for (const listener of [...changeListeners]) {
    try { listener(change); notified += 1; } catch (_) {}
  }
  return notified;
};

module.exports = { sessions, key, has, onDidChangeSourceHandoff, notifySourceHandoffChanged };
