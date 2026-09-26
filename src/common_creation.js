'use strict';

const path = require('path');
const fs = require('fs');
const { normalizeEngineTarget, engineLabel } = require('./character_creation');

function commonRequirements(engineTarget) {
  return normalizeEngineTarget(engineTarget) === 'mugen-cns'
    ? ['common1.cns']
    : ['common1.cns.zss', 'common.cmd'];
}

function findGameRootForCharacter(defPath, io = fs) {
  let current = path.dirname(path.resolve(defPath));
  while (true) {
    if (path.basename(current).toLowerCase() === 'chars') return path.dirname(current);
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

function commonStatus(defPath, engineTarget, io = fs) {
  const root = findGameRootForCharacter(defPath, io), required = commonRequirements(engineTarget);
  const files = required.map((name) => ({ name, filename: root ? path.join(root, 'data', name) : '', exists: Boolean(root && io.existsSync(path.join(root, 'data', name))) }));
  return { engineTarget: normalizeEngineTarget(engineTarget), engineLabel: engineLabel(engineTarget), root, files, missing: files.filter((item) => !item.exists) };
}

function commonCopyPlan(targetRoot, sourceFolder, engineTarget, io = fs) {
  const sourceData = path.basename(path.resolve(sourceFolder)).toLowerCase() === 'data' ? path.resolve(sourceFolder) : path.join(path.resolve(sourceFolder), 'data');
  const targetData = path.join(path.resolve(targetRoot), 'data'), files = new Map(), missingSource = [], conflicts = [];
  for (const name of commonRequirements(engineTarget)) {
    const source = path.join(sourceData, name), target = path.join(targetData, name);
    if (!io.existsSync(source)) missingSource.push(source);
    else if (io.existsSync(target)) conflicts.push(target);
    else files.set(target, io.readFileSync(source));
  }
  if (missingSource.length) throw new Error(`${engineLabel(engineTarget)} source is missing: ${missingSource.map((item) => path.basename(item)).join(', ')}`);
  if (conflicts.length) throw new Error(`Common installation will not overwrite: ${conflicts.map((item) => path.basename(item)).join(', ')}`);
  return { sourceData, targetData, engineTarget: normalizeEngineTarget(engineTarget), files };
}

module.exports = { commonRequirements, findGameRootForCharacter, commonStatus, commonCopyPlan };
