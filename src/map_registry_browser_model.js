'use strict';

function inScope(entry, scopeId) { return (entry.scopeIds || []).includes(scopeId); }
function matchesPath(entry, path) { return (path || []).every((segment, index) => entry.suggestedPath?.[index] === segment); }
function searchText(entry) { return [entry.name, entry.family, entry.ownership, ...(entry.notes || []).map((note) => note.text), ...(entry.files || [])].join(' ').toLowerCase(); }
function filterEntries(entries, scopeId, path = [], query = '') {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (entries || []).filter((entry) => inScope(entry, scopeId) && matchesPath(entry, path) && terms.every((term) => searchText(entry).includes(term)));
}
function nextSegments(entries, scopeId, path = [], query = '') {
  const current = filterEntries(entries, scopeId, path, query), groups = new Map(), index = path.length;
  for (const entry of current) {
    const segment = entry.suggestedPath?.[index]; if (!segment) continue;
    if (!groups.has(segment)) groups.set(segment, new Set()); groups.get(segment).add(entry.name.toLowerCase());
  }
  return [...groups.entries()].map(([segment, names]) => ({ segment, count: names.size, fewer: Math.max(0, current.length - names.size) })).sort((a, b) => a.segment.localeCompare(b.segment, undefined, { numeric: true, sensitivity: 'base' }));
}
function validPath(entries, scopeId, path = []) {
  const result = [...path]; while (result.length && !filterEntries(entries, scopeId, result, '').length) result.pop(); return result;
}
function scopeTotals(entries, scopes) { return (scopes || []).map((scope) => ({ ...scope, mapCount: new Set((entries || []).filter((entry) => inScope(entry, scope.id)).map((entry) => entry.name.toLowerCase())).size })); }

module.exports = { inScope, matchesPath, filterEntries, nextSegments, validPath, scopeTotals };
