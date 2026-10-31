'use strict';

const crypto = require('crypto');
const { filterEntry, enabledCapabilityIds } = require('./catalog_capability_filter');

const MAX_MARKERS = 256;
const ACCESSIBLE_MARKER = 'New or changed in selected engine build';
function sha(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function freezeList(values) { return Object.freeze(values.map((value) => Object.freeze(value))); }
function targetIdentity(target = {}) {
  if (String(target.channel || '').toLowerCase() !== 'nightly') return '';
  const exact = target.commit || target.buildId || target.artifactSha256 || target.assetId;
  return typeof exact === 'string' && exact.trim() ? exact.trim() : '';
}
function targetLabel(target = {}) { return String(target.version || target.buildId || target.commit || 'selected Nightly'); }
function canonicalParameter(parameter = {}) { return Object.freeze({ name: String(parameter.name || ''), placeholder: String(parameter.placeholder || ''), description: String(parameter.description || ''), required: parameter.required === true, capabilityId: String(parameter.capabilityId || '') }); }
function canonicalContract(entry = {}, capabilities = []) { return Object.freeze({ name: String(entry.name || ''), description: String(entry.description || ''), status: String(entry.status || ''), params: freezeList((entry.params || []).map(canonicalParameter)), capabilities: Object.freeze([...new Set(capabilities.map(String))].sort()) }); }
function contractHash(contract) { return sha(['ikemaker-controller-contract-v1', contract]); }
function parameterMap(entry) { return new Map((entry?.params || []).map((item) => [String(item.name).toLowerCase(), item])); }
function changedParameter(stable, current) { return ['placeholder', 'description', 'required'].some((key) => String(stable?.[key] ?? '') !== String(current?.[key] ?? '')); }
function acknowledgementMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value).slice(0, MAX_MARKERS).filter(([name, item]) => typeof name === 'string' && item && /^[0-9a-f]{64}$/i.test(String(item.contractHash || ''))));
}
function hidden(target, note) { return Object.freeze({ visible: false, authorityReady: false, target: targetLabel(target), snapshotId: '', count: 0, unreviewedCount: 0, items: Object.freeze([]), groups: Object.freeze([]), note }); }

function project(catalog, snapshot = {}, options = {}) {
  const target = snapshot.target || {}, channel = String(target.channel || '').toLowerCase();
  if (channel !== 'nightly') return hidden(target, 'Controller change markers are hidden unless the project targets an exact Nightly build.');
  const exactTarget = targetIdentity(target);
  if (!exactTarget) return hidden(target, 'Controller change review is unavailable because the selected Nightly target has no exact build identity.');
  const enabled = enabledCapabilityIds(snapshot), stableSnapshot = { enabledCapabilities: [] }, rows = [], effectiveContracts = [], acknowledged = acknowledgementMap(options.acknowledged);
  for (const source of Array.isArray(catalog) ? catalog.slice(0, 2048) : []) {
    const stable = filterEntry(source, stableSnapshot), current = filterEntry(source, snapshot);
    if (!current) continue;
    const capabilities = [...new Set([source.capabilityId, ...(source.params || []).map((item) => item.capabilityId), ...(source.capabilityAugmentations || []).map((item) => item.capabilityId)].filter((value) => value && enabled.has(String(value).toLowerCase())))].sort();
    const contract = canonicalContract(current, capabilities), currentHash = contractHash(contract);
    effectiveContracts.push([String(current.name).toLowerCase(), currentHash]);
    const stableContract = stable ? canonicalContract(stable, []) : null, introduced = !stable, contractChanged = stableContract && contractHash(stableContract) !== currentHash, priorAcknowledgement = acknowledged.get(String(current.name).toLowerCase()), changedSinceReview = Boolean(priorAcknowledgement && String(priorAcknowledgement.contractHash).toLowerCase() !== currentHash);
    if (!introduced && !contractChanged && !changedSinceReview) continue;
    const stableParams = parameterMap(stable), added = [], changed = [];
    for (const parameter of current.params || []) { const prior = stableParams.get(String(parameter.name).toLowerCase()); if (!prior) added.push(parameter.name); else if (changedParameter(prior, parameter)) changed.push(parameter.name); }
    const controllerChanged = Boolean(stable) && (String(stable.description || '') !== String(current.description || '') || String(stable.status || '') !== String(current.status || ''));
    const details = [];
    if (introduced) details.push('not the IKEMEN GO 1.0 baseline');
    if (added.length) details.push(`new option${added.length === 1 ? '' : 's'}: ${added.join(', ')}`);
    if (changed.length) details.push(`changed contract${changed.length === 1 ? '' : 's'}: ${changed.join(', ')}`);
    if (controllerChanged) details.push('expanded controller documentation');
    if (!introduced && !contractChanged && changedSinceReview) details.push('contract changed since it was last reviewed and now matches the stable baseline');
    rows.push({ label: current.name, kind: 'controller-change', status: introduced ? 'Nightly controller' : added.length ? 'Expanded on Nightly' : 'Changed on Nightly', description: `${details.join(' · ')}.${capabilities.length ? ` Verified capability: ${capabilities.join(', ')}.` : ''}`, compatibility: targetLabel(target), changeKind: introduced ? 'introduced' : added.length ? 'expanded' : 'changed', controller: current.name, contract, contractHash: currentHash, addedParameters: Object.freeze(added), changedParameters: Object.freeze(changed), capabilities: Object.freeze(capabilities), referenceOnly: true });
  }
  effectiveContracts.sort((a, b) => a[0].localeCompare(b[0]));
  const snapshotId = sha(['ikemaker-controller-knowledge-v1', exactTarget, String(snapshot.catalogRevision || ''), effectiveContracts]);
  const items = rows.sort((left, right) => left.label.localeCompare(right.label)).slice(0, MAX_MARKERS).map((row) => {
    const prior = acknowledged.get(String(row.controller).toLowerCase()), marked = !prior || String(prior.contractHash).toLowerCase() !== row.contractHash;
    return Object.freeze({ ...row, id: sha(['controller-review', row.controller, row.contractHash]).slice(0, 32), snapshotId, marked, changeMarker: marked ? Object.freeze({ marked: true, text: ACCESSIBLE_MARKER, snapshotId, contractHash: row.contractHash }) : null });
  });
  const groupMap = new Map();
  for (const item of items) { const group = item.status === 'Nightly controller' ? 'new' : 'changed'; if (!groupMap.has(group)) groupMap.set(group, []); groupMap.get(group).push(item); }
  const groups = [...groupMap.entries()].map(([id, children]) => Object.freeze({ id, count: children.length, unreviewedCount: children.filter((item) => item.marked).length, changeMarker: children.some((item) => item.marked) ? Object.freeze({ marked: true, text: ACCESSIBLE_MARKER, snapshotId }) : null, controllerNames: Object.freeze(children.map((item) => item.controller)) }));
  return Object.freeze({ visible: true, authorityReady: true, target: targetLabel(target), exactTarget, snapshotId, count: items.length, unreviewedCount: items.filter((item) => item.marked).length, truncated: rows.length > items.length, items: Object.freeze(items), groups: Object.freeze(groups), note: 'Read-only controller-contract changes for the selected exact Nightly target. Review markers never rewrite source or switch engine targets.' });
}

module.exports = { MAX_MARKERS, ACCESSIBLE_MARKER, targetIdentity, canonicalContract, contractHash, project };
