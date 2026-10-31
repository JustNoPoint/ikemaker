'use strict';

const fs = require('fs');
const path = require('path');
const { readSff } = require('./sff_reader');

const MAX_REFERENCES = 8192;

function boundedInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 65535 ? number : null;
}

function parseSpriteReference(value) {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(String(value ?? ''));
  if (!match) return null;
  const group = boundedInteger(match[1]), number = boundedInteger(match[2]);
  return group === null || number === null ? null : Object.freeze([group, number]);
}

function projectSpriteReferences(archive, maximum = MAX_REFERENCES) {
  const limit = Math.max(1, Math.min(MAX_REFERENCES, Number(maximum) || MAX_REFERENCES));
  const groups = new Map();
  for (const sprite of archive?.sprites || []) {
    const group = boundedInteger(sprite.group), number = boundedInteger(sprite.number);
    if (group === null || number === null) continue;
    const key = `${group},${number}`, row = groups.get(key) || { key, group, number, physicalIndexes: [], width: Number(sprite.width) || 0, height: Number(sprite.height) || 0, axisX: Number(sprite.axisX) || 0, axisY: Number(sprite.axisY) || 0 };
    row.physicalIndexes.push(Number.isSafeInteger(sprite.index) ? sprite.index : row.physicalIndexes.length);
    groups.set(key, row);
  }
  const all = [...groups.values()].sort((left, right) => left.group - right.group || left.number - right.number);
  const rows = all.slice(0, limit).map(row => Object.freeze({
    ...row,
    physicalIndexes: Object.freeze([...row.physicalIndexes]),
    ambiguous: row.physicalIndexes.length > 1,
    label: `${row.group},${row.number}`,
    description: `${row.width}×${row.height} · axis ${row.axisX},${row.axisY}`,
    detail: row.physicalIndexes.length > 1 ? `${row.physicalIndexes.length} physical entries share this reference; source code cannot distinguish them.` : `Physical sprite ${row.physicalIndexes[0]}`
  }));
  return Object.freeze({ rows: Object.freeze(rows), total: all.length, truncated: all.length > rows.length });
}

async function manualReference(vscode, options) {
  const value = await vscode.window.showInputBox({
    title: options.title || 'Sprite group,index',
    value: parseSpriteReference(options.value) ? String(options.value).replace(/\s+/g, '') : '0,0',
    prompt: options.prompt || 'Enter the sprite group and index.',
    validateInput: candidate => parseSpriteReference(candidate) ? undefined : 'Enter two whole numbers from 0 to 65535, separated by a comma.'
  });
  const parsed = value === undefined ? null : parseSpriteReference(value);
  return value === undefined ? undefined : parsed ? parsed.join(',') : undefined;
}

async function pickSpriteReference(vscode, sffPath, options = {}) {
  const filename = typeof sffPath === 'string' && sffPath ? path.resolve(sffPath) : '';
  const fileSystem = options.fileSystem || fs, reader = options.reader || readSff;
  if (!filename || !fileSystem.existsSync(filename)) return manualReference(vscode, options);
  let projection;
  try { projection = projectSpriteReferences(reader(filename), options.maximum); }
  catch (_) { return manualReference(vscode, options); }
  if (!projection.rows.length) return manualReference(vscode, options);
  const suggested = parseSpriteReference(options.value), suggestedKey = suggested?.join(','), rows = [...projection.rows];
  if (suggestedKey) rows.sort((left, right) => Number(right.key === suggestedKey) - Number(left.key === suggestedKey) || left.group - right.group || left.number - right.number);
  const items = rows.map(row => ({ ...row, picked: row.key === suggestedKey }));
  items.push({ label: '$(edit) Enter group,index manually…', description: 'Use a valid reference not shown in this bounded list.', manual: true });
  const picked = await vscode.window.showQuickPick(items, {
    title: options.title || `Choose sprite from ${path.basename(filename)}`,
    placeHolder: projection.truncated ? `Showing ${projection.rows.length} of ${projection.total} references. Search this list or choose manual entry.` : `Choose one of ${projection.total} sprite references.`,
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked) return undefined;
  return picked.manual ? manualReference(vscode, options) : picked.key;
}

module.exports = { MAX_REFERENCES, parseSpriteReference, projectSpriteReferences, pickSpriteReference };
