'use strict';

function sourceId(source) {
  return String(source?.id || '');
}

function normalizeMarkedIds(sources, markedIds, draggedId) {
  const present = new Set((sources || []).map(sourceId));
  const requested = new Set(Array.from(markedIds || [], value => String(value)));
  const dragged = String(draggedId || '');
  if (dragged && present.has(dragged) && !requested.has(dragged)) return new Set([dragged]);
  const retained = new Set([...requested].filter(id => present.has(id)));
  if (!retained.size && dragged && present.has(dragged)) retained.add(dragged);
  return retained;
}

function moveSourceBlock(sources, markedIds, draggedId, targetId, placement = 'before') {
  const input = Array.isArray(sources) ? sources : [];
  const marked = normalizeMarkedIds(input, markedIds, draggedId);
  const target = String(targetId || '');
  if (!marked.size || !target || marked.has(target) || !input.some(source => sourceId(source) === target)) {
    return { changed: false, sources: input.slice(), movedIds: [] };
  }
  const moved = input.filter(source => marked.has(sourceId(source)));
  const remaining = input.filter(source => !marked.has(sourceId(source)));
  const targetIndex = remaining.findIndex(source => sourceId(source) === target);
  if (targetIndex < 0) return { changed: false, sources: input.slice(), movedIds: [] };
  const insertionIndex = targetIndex + (placement === 'after' ? 1 : 0);
  const reordered = remaining.slice();
  reordered.splice(insertionIndex, 0, ...moved);
  const changed = reordered.some((source, index) => source !== input[index]);
  return { changed, sources: reordered, movedIds: moved.map(sourceId) };
}

module.exports = { normalizeMarkedIds, moveSourceBlock };
