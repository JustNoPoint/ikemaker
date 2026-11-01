'use strict';

const model = require('./visual_component_model');

const STORAGE_KEY = 'ikemaker.visualComponents.v1';

function createVisualComponentLibrary(storage, key = STORAGE_KEY) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.update !== 'function') throw new Error('Visual component storage is unavailable.');
  const read = () => model.normalizeStore(storage.get(key, {}));
  const write = async value => { const normalized = model.normalizeStore(value); await storage.update(key, normalized); return normalized; };
  return Object.freeze({
    key,
    read,
    list(kind = '') { return read().components.filter(component => !kind || component.kind === kind); },
    async save(component) { return write(model.upsert(read(), component)); },
    async remove(id) { const before = read(), next = model.remove(before, id); if (next.components.length === before.components.length) throw new Error('That reusable component no longer exists.'); return write(next); }
  });
}

module.exports = { STORAGE_KEY, createVisualComponentLibrary };
