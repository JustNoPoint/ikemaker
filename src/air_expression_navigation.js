'use strict';

const path = require('path');
const { hash } = require('./mutation_safety');

const canonical = value => path.resolve(String(value || '')).toLowerCase();

function resolveSelectedAnimationOccurrence(snapshot, request = {}) {
  const unavailable = reason => Object.freeze({ available: false, reason, occurrence: null });
  const sourceText = String(request.sourceText ?? '');
  const sourcePath = path.resolve(String(request.sourcePath || ''));
  if (!snapshot?.complete || snapshot.publicUses?.available !== true) return unavailable(snapshot?.reason || snapshot?.publicUses?.reason || 'The bounded animation-reference inventory is unavailable.');
  if (!sourcePath || hash(sourceText) !== request.sourceHash) return unavailable('The selected source changed before its animation expression could be resolved.');
  const start = Number(request.selectionStart), end = Number(request.selectionEnd);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > sourceText.length) return unavailable('The editor selection is outside the current source document.');
  const matches = (snapshot.publicUses.occurrences || []).filter(item => {
    if (canonical(item.sourcePath) !== canonical(sourcePath) || item.sourceHash !== request.sourceHash) return false;
    if (!Number.isSafeInteger(item.expressionStart) || !Number.isSafeInteger(item.expressionEnd) || item.expressionStart < 0 || item.expressionEnd <= item.expressionStart) return false;
    const inside = start === end ? start >= item.expressionStart && start < item.expressionEnd : start >= item.expressionStart && end <= item.expressionEnd;
    if (!inside) return false;
    return !(item.excludedSpans || []).some(span => start === end ? start >= span.start && start < span.end : start < span.end && end > span.start);
  });
  if (matches.length !== 1) return unavailable(matches.length ? 'The selection overlaps more than one recognized animation expression.' : 'Select or place the caret inside a supported animation value expression.');
  return Object.freeze({ available: true, reason: '', occurrence: matches[0], exact: matches[0].status === 'exact' });
}

function consumeAnimationTargetRoute(snapshot, route, consumed = new Set()) {
  const token = String(route || '');
  if (!/^[0-9a-f]{48}$/.test(token) || consumed.has(token)) return null;
  const authority = snapshot?.targetAuthorities?.get(token);
  if (!authority || authority.route !== token) return null;
  consumed.add(token);
  snapshot.targetAuthorities.delete(token);
  return authority;
}

module.exports = { resolveSelectedAnimationOccurrence, consumeAnimationTargetRoute };
