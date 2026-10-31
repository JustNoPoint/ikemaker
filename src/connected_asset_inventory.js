'use strict';
const fs = require('fs');
const path = require('path');
const { hash } = require('./mutation_safety');

function key(filename) { return path.resolve(filename).toLowerCase(); }

function connectedAssetInventory(filename, ownerDefs = [], kind, services = {}) {
  if (!['air', 'sff', 'snd'].includes(kind)) throw new Error('Connected asset kind must be AIR, SFF, or SND.');
  const fileSystem = services.fs || fs, resolveAssigned = services.resolveAssigned || require('./related_work').resolveAssigned, archiveRegistry = services.archiveRegistry || require('./viewer_navigation').archiveRegistry;
  const current = path.resolve(filename), currentKey = key(current), extension = `.${kind}`, seen = new Map(), items = [];
  const add = (candidate, label, binding = {}) => {
    if (typeof candidate !== 'string' || !candidate || path.extname(candidate).toLowerCase() !== extension || !fileSystem.existsSync(candidate)) return;
    const resolved = path.resolve(candidate), identity = key(resolved), declaredSffPath = typeof binding.sffPath === 'string' && binding.sffPath ? path.resolve(binding.sffPath) : '', sffPath = declaredSffPath && fileSystem.existsSync(declaredSffPath) ? declaredSffPath : '';
    const prior = seen.get(identity);
    if (prior) {
      if (binding.bindingKind && binding.bindingKind !== 'current' && prior.bindingKind !== 'current' && key(prior.declaredSffPath || '.') !== key(declaredSffPath || '.')) {
        prior.available = false; prior.ambiguous = true; prior.reason = `${path.basename(resolved)} is connected through more than one sprite archive. Review the owning DEF assignments before opening it.`;
      }
      return;
    }
    const item = { filename: resolved, label, sffPath, declaredSffPath, definitionPath: binding.definitionPath ? path.resolve(binding.definitionPath) : '', ownerDef: binding.ownerDef ? path.resolve(binding.ownerDef) : '', bindingKind: binding.bindingKind || 'current', available: true, ambiguous: false, reason: '' };
    if(kind==='air'&&item.bindingKind==='shared'&&!sffPath){item.available=false;item.reason=declaredSffPath?`${path.basename(resolved)} is connected to missing sprite archive ${path.basename(declaredSffPath)}. Repair the shared DEF before opening it.`:`${path.basename(resolved)} has no connected sprite archive. Assign its SFF in the shared DEF before opening it.`;}
    seen.set(identity, item); items.push(item);
  };
  const owners = [...new Set((ownerDefs || []).filter(value => typeof value === 'string' && path.isAbsolute(value)).map(value => path.resolve(value)))].sort((a, b) => a.localeCompare(b));
  if (!owners.length) add(current, path.basename(current), { bindingKind: 'current' });
  for (const ownerDef of owners) {
    const assignedAssets = resolveAssigned(ownerDef) || {}, assigned = assignedAssets[kind];
    add(assigned, `Character · ${path.basename(assigned || current)}`, { bindingKind: 'primary', ownerDef, sffPath: assignedAssets.sff });
    for (const record of archiveRegistry(ownerDef)?.candidates || []) add(record[kind], `${record.displayPrefix || String(record.prefix || 'Connected').toUpperCase()} · ${path.basename(record[kind] || current)}`, { bindingKind: 'shared', ownerDef, sffPath: record.sff, definitionPath: record.def });
  }
  add(current, `Current · ${path.basename(current)}`, { bindingKind: 'current' });
  return items.map(item => ({ ...item, id: `${kind}-${hash(`ikemaker-connected-${kind}-v1\0${key(item.filename)}`).slice(0, 24)}`, current: key(item.filename) === currentKey }));
}

module.exports = { connectedAssetInventory };
