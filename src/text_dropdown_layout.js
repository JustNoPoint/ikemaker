'use strict';

const DEFAULT_MAX_RATIO = 0.72;

function cloneValue(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('Editor layout must not contain cycles.');
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) clone[key] = cloneValue(value[key], seen);
  seen.delete(value);
  return clone;
}

function cloneLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new TypeError('Editor layout must be an object.');
  return cloneValue(layout);
}

function childGroups(node) {
  return Array.isArray(node?.groups) ? node.groups : [];
}

function leafPaths(layout) {
  const paths = [];
  const visit = (node, path) => {
    const groups = childGroups(node);
    if (!groups.length) {
      paths.push(path);
      return;
    }
    groups.forEach((group, index) => visit(group, path.concat(index)));
  };
  childGroups(layout).forEach((group, index) => visit(group, [index]));
  return paths;
}

function nodeAtPath(layout, path) {
  let node = layout;
  for (const index of path) {
    const groups = childGroups(node);
    if (!Number.isInteger(index) || index < 0 || index >= groups.length) return null;
    node = groups[index];
  }
  return node;
}

function normalizedWeights(groups) {
  const explicit = groups.map(group => Number(group?.size));
  const valid = explicit.every(size => Number.isFinite(size) && size > 0);
  const weights = valid ? explicit : groups.map(() => 1);
  const total = weights.reduce((sum, size) => sum + size, 0);
  return weights.map(size => size / total);
}

function verticalAncestor(layout, leafPath) {
  let node = layout, orientation = layout.orientation === 1 ? 1 : 0, match = null;
  for (let depth = 0; depth < leafPath.length; depth += 1) {
    const groups = childGroups(node), childIndex = leafPath[depth];
    if (groups.length > 1 && orientation === 1) match = { path: leafPath.slice(0, depth), childIndex };
    node = groups[childIndex];
    if (!node) break;
    orientation = orientation === 1 ? 0 : 1;
  }
  return match;
}

function resizeDropdownLayout(layout, targetLeafOrdinal, factor, cap = DEFAULT_MAX_RATIO) {
  const snapshot = cloneLayout(layout), paths = leafPaths(snapshot);
  if (!Number.isInteger(targetLeafOrdinal) || targetLeafOrdinal < 0 || targetLeafOrdinal >= paths.length) return null;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(cap) || cap <= 0 || cap >= 1) return null;
  const ancestor = verticalAncestor(snapshot, paths[targetLeafOrdinal]);
  if (!ancestor) return null;
  const container = nodeAtPath(snapshot, ancestor.path), groups = childGroups(container), weights = normalizedWeights(groups);
  const current = weights[ancestor.childIndex], requested = Math.max(current, Math.min(cap, current * factor));
  if (requested <= current) return snapshot;
  const remainingBefore = 1 - current, remainingAfter = 1 - requested;
  groups.forEach((group, index) => {
    group.size = index === ancestor.childIndex
      ? requested
      : remainingBefore > 0 ? weights[index] * remainingAfter / remainingBefore : remainingAfter / (groups.length - 1);
  });
  return snapshot;
}

function structuralValue(value) {
  if (Array.isArray(value)) return value.map(structuralValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (key !== 'size') result[key] = structuralValue(value[key]);
  }
  return result;
}

function topologyFingerprint(layout) {
  return JSON.stringify(structuralValue(layout));
}

function prepareDropdownLayout(layout, targetLeafOrdinal, factor, cap = DEFAULT_MAX_RATIO) {
  const snapshot = cloneLayout(layout), expanded = resizeDropdownLayout(snapshot, targetLeafOrdinal, factor, cap);
  if (!expanded) return null;
  return Object.freeze({
    snapshot,
    expanded,
    snapshotTopology: topologyFingerprint(snapshot),
    expandedTopology: topologyFingerprint(expanded)
  });
}

function restoreDropdownLayout(currentLayout, prepared) {
  if (!prepared?.snapshot || typeof prepared.expandedTopology !== 'string') return null;
  if (topologyFingerprint(currentLayout) !== prepared.expandedTopology) return null;
  return cloneLayout(prepared.snapshot);
}

module.exports = {
  DEFAULT_MAX_RATIO,
  cloneLayout,
  leafPaths,
  resizeDropdownLayout,
  topologyFingerprint,
  prepareDropdownLayout,
  restoreDropdownLayout
};
