'use strict';

function identity(sprite) { return `${Number(sprite.group)},${Number(sprite.number ?? sprite.index)}`; }
function entry(sprite, archive, sourceIndex = null) {
  return { archive, sourceIndex: sourceIndex ?? sprite.index, group: Number(sprite.group), number: Number(sprite.number ?? sprite.index), axisX: Number(sprite.axisX || 0), axisY: Number(sprite.axisY || 0), width: Number(sprite.width || 0), height: Number(sprite.height || 0), paletteIndex: Number(sprite.paletteIndex || 0) };
}

function selectedSprites(archive, selection = {}) {
  const indices = new Set((selection.indices || []).map(Number));
  const groups = new Set((selection.groups || []).map(Number));
  return archive.sprites.filter((sprite) => indices.has(sprite.index) || groups.has(sprite.group));
}

function nextFree(group, used, start = 0) {
  let value = Math.max(0, Number(start) || 0);
  while (used.has(`${group},${value}`)) value += 1;
  return value;
}

function buildAssembly(base, source, operations = []) {
  let rows = base.sprites.map((sprite) => entry(sprite, 'base'));
  const changes = [], conflicts = [];
  for (const operation of operations) {
    const picked = selectedSprites(source, operation.selection);
    let cursor = Number(operation.startIndex || 0);
    for (const sprite of picked) {
      const targetGroup = Number.isInteger(Number(operation.targetGroup)) ? Number(operation.targetGroup) : Number(sprite.group);
      let targetNumber = operation.mode === 'append' ? nextFree(targetGroup, new Set(rows.map(identity)), cursor) : Number(sprite.number);
      if (operation.mode === 'replace-selection') targetNumber = Number((operation.destinationNumbers || [])[changes.length] ?? targetNumber);
      const key = `${targetGroup},${targetNumber}`, existing = rows.findIndex((row) => identity(row) === key);
      if (existing >= 0 && operation.mode !== 'replace' && operation.mode !== 'replace-selection') {
        conflicts.push({ identity: key, source: identity(sprite), reason: 'Destination identity already exists.' });
        continue;
      }
      const next = { ...entry(sprite, 'source'), group: targetGroup, number: targetNumber };
      if (operation.preserveDestinationAxis && existing >= 0) { next.axisX = rows[existing].axisX; next.axisY = rows[existing].axisY; }
      if (existing >= 0) rows.splice(existing, 1, next); else rows.push(next);
      changes.push({ mode: existing >= 0 ? 'replace' : 'add', identity: key, source: identity(sprite) });
      cursor = targetNumber + 1;
    }
  }
  rows = rows.sort((a, b) => a.group - b.group || a.number - b.number);
  return { rows, changes, conflicts };
}

function operationLabel(operation) {
  const count = (operation.selection?.indices || []).length;
  const groups = (operation.selection?.groups || []).join(', ');
  return `${operation.mode || 'append'}: ${count ? `${count} sprite(s)` : `group(s) ${groups}`} → ${operation.targetGroup ?? 'original groups'}`;
}

module.exports = { identity, selectedSprites, nextFree, buildAssembly, operationLabel };
