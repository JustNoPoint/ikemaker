'use strict';

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function normalizeLayer(raw = {}, index = 0) {
  const id = String(raw.id || '').trim();
  if (!id) throw new Error(`Layer ${index + 1} has no stable identity.`);
  return Object.freeze({
    ...raw,
    id,
    name: String(raw.name || `Layer ${index + 1}`),
    x: finite(raw.x),
    y: finite(raw.y),
    opacity: clamp(finite(raw.opacity, 1), 0, 1),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    order: index
  });
}

function normalizeStack(layers) {
  if (!Array.isArray(layers)) throw new Error('A layer stack is required.');
  const seen = new Set();
  return Object.freeze(layers.map((raw, index) => {
    const layer = normalizeLayer(raw, index);
    if (seen.has(layer.id)) throw new Error(`Layer identity ${layer.id} is repeated.`);
    seen.add(layer.id); return layer;
  }));
}

function selectedIds(stack, ids) {
  const available = new Set(stack.map(layer => layer.id));
  return new Set((ids || []).map(String).filter(id => available.has(id)));
}

function mapSelected(layers, ids, transform) {
  const stack = normalizeStack(layers), selected = selectedIds(stack, ids);
  if (!selected.size) throw new Error('Select at least one layer.');
  return normalizeStack(stack.map(layer => selected.has(layer.id) && !layer.locked ? transform(layer) : layer));
}

function move(layers, ids, deltaX, deltaY) {
  const dx = finite(deltaX), dy = finite(deltaY);
  return mapSelected(layers, ids, layer => ({ ...layer, x: layer.x + dx, y: layer.y + dy }));
}

function setOpacity(layers, ids, opacity) {
  const value = clamp(finite(opacity, 1), 0, 1);
  return mapSelected(layers, ids, layer => ({ ...layer, opacity: value }));
}

function setVisibility(layers, ids, visible) { return mapSelected(layers, ids, layer => ({ ...layer, visible: Boolean(visible) })); }
function setLocked(layers, ids, locked) {
  const source = normalizeStack(layers), selected = selectedIds(source, ids);
  if (!selected.size) throw new Error('Select at least one layer.');
  return normalizeStack(source.map(layer => selected.has(layer.id) ? { ...layer, locked: Boolean(locked) } : layer));
}

function reorder(layers, ids, operation) {
  const stack = [...normalizeStack(layers)], selected = selectedIds(stack, ids);
  if (!selected.size) throw new Error('Select at least one layer.');
  if (!['up', 'down', 'top', 'bottom'].includes(operation)) throw new Error('Choose up, down, top, or bottom layer ordering.');
  const movable = id => selected.has(id) && !stack.find(layer => layer.id === id).locked;
  if (operation === 'top' || operation === 'bottom') {
    const result = [], segment = [];
    const flush = () => { const chosen = segment.filter(layer => movable(layer.id)), rest = segment.filter(layer => !movable(layer.id)); result.push(...(operation === 'top' ? [...rest, ...chosen] : [...chosen, ...rest])); segment.length = 0; };
    for (const layer of stack) { if (layer.locked) { flush(); result.push(layer); } else segment.push(layer); }
    flush(); return normalizeStack(result);
  }
  if (operation === 'up') {
    for (let index = stack.length - 2; index >= 0; index -= 1) if (movable(stack[index].id) && !selected.has(stack[index + 1].id) && !stack[index + 1].locked) [stack[index], stack[index + 1]] = [stack[index + 1], stack[index]];
  } else {
    for (let index = 1; index < stack.length; index += 1) if (movable(stack[index].id) && !selected.has(stack[index - 1].id) && !stack[index - 1].locked) [stack[index], stack[index - 1]] = [stack[index - 1], stack[index]];
  }
  return normalizeStack(stack);
}

function reorderAt(layers, ids, targetId, before = true) {
  const stack = [...normalizeStack(layers)], selected = selectedIds(stack, ids), target = String(targetId || '');
  if (!selected.size) throw new Error('Select at least one layer.');
  if (!stack.some(layer => layer.id === target)) throw new Error('The target layer no longer exists.');
  if (selected.has(target)) return normalizeStack(stack);
  const moving = stack.filter(layer => selected.has(layer.id) && !layer.locked), retained = stack.filter(layer => !moving.includes(layer));
  const index = retained.findIndex(layer => layer.id === target); if (index < 0) return normalizeStack(stack);
  retained.splice(index + (before ? 0 : 1), 0, ...moving);
  return normalizeStack(retained);
}

function reviewedStack(layers, review) {
  const base = normalizeStack(layers), byId = new Map(base.map(layer => [layer.id, layer]));
  if (!Array.isArray(review) || review.length !== base.length) throw new Error('The reviewed layer stack is incomplete.');
  const seen = new Set(), result = review.map((item, order) => {
    if (!item || Object.keys(item).sort().join('\0') !== ['id','visible','x','y'].sort().join('\0')) throw new Error('The reviewed layer state contains unsupported fields.');
    const id = String(item.id || ''), source = byId.get(id);
    if (!source || seen.has(id)) throw new Error('The reviewed layer order contains an unknown or repeated identity.');
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || Math.abs(item.x) > 1000000 || Math.abs(item.y) > 1000000 || typeof item.visible !== 'boolean') throw new Error(`Layer ${id} has invalid reviewed placement or visibility.`);
    seen.add(id); return { ...source, deltaX: item.x, deltaY: item.y, visible: item.visible, renderOrder: order };
  });
  const normalized = normalizeStack(result);
  return Object.freeze({ layers: normalized, drawStack: Object.freeze(normalized.filter(layer => layer.visible)) });
}

function selectionAfterClick(currentIds, clickedId, modifiers = {}) {
  const current = new Set((currentIds || []).map(String)), id = String(clickedId || '');
  if (!id) return Object.freeze([...current]);
  if (modifiers.ctrl || modifiers.meta) { current.has(id) ? current.delete(id) : current.add(id); return Object.freeze([...current]); }
  if (!modifiers.shift) return Object.freeze([id]);
  current.add(id); return Object.freeze([...current]);
}

module.exports = { normalizeLayer, normalizeStack, move, setOpacity, setVisibility, setLocked, reorder, reorderAt, reviewedStack, selectionAfterClick };
