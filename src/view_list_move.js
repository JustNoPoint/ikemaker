'use strict';

// Positions are one-based in the final list. Moving a marked block keeps the
// original relative order of every marked and unmarked row.
function moveSelectedRows(order, selected, position) {
  if (!Array.isArray(order) || !Array.isArray(selected) || !Number.isSafeInteger(position)) throw new Error('Choose a valid list position.');
  const ids = new Set(order);
  if (ids.size !== order.length || selected.some(id => !ids.has(id))) throw new Error('The selected list rows changed. Refresh the view order.');
  const moving = new Set(selected), block = order.filter(id => moving.has(id)), remaining = order.filter(id => !moving.has(id));
  if (!block.length) throw new Error('Select at least one list row.');
  if (position < 1 || position > remaining.length + 1) throw new Error(`Choose a position from 1 to ${remaining.length + 1}.`);
  const next = [...remaining.slice(0, position - 1), ...block, ...remaining.slice(position - 1)];
  return { order: next, changed: next.some((id, index) => id !== order[index]), start: position, count: block.length };
}

function edgeScrollVelocity(pointerY, top, bottom, zone = 32) {
  if (![pointerY, top, bottom, zone].every(Number.isFinite) || bottom <= top || zone <= 0) return 0;
  const distance = pointerY < top + zone ? pointerY - (top + zone) : pointerY > bottom - zone ? pointerY - (bottom - zone) : 0;
  return distance ? Math.sign(distance) * Math.max(4, Math.min(32, Math.round(Math.abs(distance) * 0.65))) : 0;
}

module.exports = { moveSelectedRows, edgeScrollVelocity };
