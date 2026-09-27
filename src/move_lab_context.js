'use strict';

const path = require('path');
const contexts = new Map();
const key = filename => path.resolve(filename || '').toLowerCase();

function remember(defPath, value) {
  if (!defPath || !value || typeof value.kind !== 'string') return;
  contexts.set(key(defPath), { ...value, defPath: path.resolve(defPath) });
}
function current(defPath) { return contexts.get(key(defPath)) || null; }
function clear(defPath, expected) {
  const id = key(defPath), existing = contexts.get(id);
  if (!expected || existing === expected) contexts.delete(id);
}

module.exports = { remember, current, clear };
