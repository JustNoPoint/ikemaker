'use strict';

const path = require('path');
const { sanitizeWorkSets } = require('./sff_batch_scope');

const KEY = 'ikemaker.assetWorkSets.v1';
const normalize = value => process.platform === 'win32' ? path.resolve(String(value || '')).toLowerCase() : path.resolve(String(value || ''));

class AssetWorkSets {
  constructor(state, workspaceRoot = process.cwd()) { this.state = state; this.workspaceRoot = normalize(workspaceRoot); }
  resourceKey(kind, resource) { return `${String(kind)}:${this.workspaceRoot}:${normalize(resource)}`; }
  all() { const value = this.state?.get?.(KEY, {}); return value && typeof value === 'object' ? value : {}; }
  read(kind, resource) { return sanitizeWorkSets(this.all()[this.resourceKey(kind, resource)]); }
  async write(kind, resource, values) {
    const all = this.all(), key = this.resourceKey(kind, resource), safe = sanitizeWorkSets(values);
    if (safe.length) all[key] = safe; else delete all[key];
    await this.state?.update?.(KEY, all);
    return safe;
  }
  async upsert(kind, resource, value) {
    const values = this.read(kind, resource).filter(item => item.id !== value.id);
    values.push(value); return this.write(kind, resource, values);
  }
  async remove(kind, resource, id) { return this.write(kind, resource, this.read(kind, resource).filter(item => item.id !== id)); }
}

module.exports = { KEY, AssetWorkSets };
