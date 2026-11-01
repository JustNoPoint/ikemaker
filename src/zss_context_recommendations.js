'use strict';

const catalog = require('./authoring_catalog');
const { mask } = require('./viewer_used_by_model');

const SIGNALS = Object.freeze([
  { test: /\b(?:target(?:state|bind|drop|velset|veladd|lifeadd|poweradd)?|numtarget)\b/i, query: 'check target exists', reason: 'The selected context accesses or reasons about a target, so an explicit target-existence guard may be relevant.' },
  { test: /\b(?:helper\s*\(|numhelper\b)/i, query: 'check helper exists', reason: 'The selected context uses a helper family, so a helper-existence guard may protect redirected access.' },
  { test: /\bignorehitpause\b/i, query: 'run during hit pause', reason: 'The selected context mentions hit-pause execution, so existing hit-pause-safe structures are relevant.' },
  { test: /\bpersistent\b/i, query: 'run once', reason: 'The selected context controls repeat execution, so an explicit one-time pattern may clarify the lifecycle.' },
  { test: /\b(?:for\s+\w+\s*=|\bbreak\b)/i, query: 'repeat until', reason: 'The selected context contains loop control, so the bounded loop pattern with a visible exit is relevant.' },
  { test: /\bhitdef\b/i, query: 'attack definition', reason: 'The selected context is an attack definition, so the existing modular attack section is relevant.' },
  { test: /\b(?:animtime|changestate)\b/i, query: 'recovery return', reason: 'The selected context changes state or checks animation completion, so the existing reviewed recovery pattern is relevant.' },
  { test: /\bstatedef\b/i, query: 'state entry', reason: 'The selected context is a state declaration, so existing state-entry scaffolds are relevant.' },
  { test: /\bmap\s*\(/i, query: 'store persistent value', reason: 'The selected context uses persistent map data, so existing map-assignment patterns are relevant.' }
]);

function executable(item) {
  return item?.kind === 'structure' || (item?.kind === 'recipeSection' && (item.snippet || item.structureId));
}

function contextText(text, line, selectedText = '') {
  if (String(selectedText || '').trim()) return String(selectedText);
  const lines = String(text || '').split(/\r?\n/), at = Math.max(0, Math.min(Number(line) || 0, lines.length - 1));
  return lines.slice(Math.max(0, at - 1), Math.min(lines.length, at + 2)).join('\n');
}

function codeOnly(text) {
  return mask(String(text || ''), true).split(/\r?\n/).map(line => {
    const comment = line.indexOf('#'); return comment < 0 ? line : line.slice(0, comment);
  }).join('\n');
}

function contextualRecommendations(options = {}, source = catalog) {
  const code = codeOnly(contextText(options.text, options.line, options.selectedText));
  if (!code.trim()) return { query: '', reasons: [], items: [] };
  const matched = SIGNALS.filter(signal => signal.test.test(code));
  if (!matched.length) return { query: '', reasons: [], items: [] };
  const favoriteIds = new Set(options.favoriteIds || []), recentIds = new Set(options.recentIds || []), byId = new Map();
  for (const signal of matched) for (const item of source.search(signal.query, { intentAliases: options.intentAliases || {} })) {
    if (!executable(item)) continue;
    // Project-specific/reference material is never promoted merely because a
    // keyword happened to match. A user favorite/recency choice is required.
    if (item.compatibility !== 'universal' && !favoriteIds.has(item.id) && !recentIds.has(item.id)) continue;
    const current = byId.get(item.id) || { item, reasons: new Set(), queries: new Set(), score: 0 };
    current.reasons.add(signal.reason); current.queries.add(signal.query);
    current.score += 10 + (favoriteIds.has(item.id) ? 100 : 0) + (recentIds.has(item.id) ? 20 : 0) + (item.beginnerSafe ? 2 : 0);
    byId.set(item.id, current);
  }
  const items = [...byId.values()].sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label)).slice(0, 7).map(entry => ({
    ...entry.item, reason: [...entry.reasons].join(' '), matchedQueries: [...entry.queries], favorite: favoriteIds.has(entry.item.id), recent: recentIds.has(entry.item.id)
  }));
  return { query: matched[0].query, reasons: matched.map(signal => signal.reason), items };
}

module.exports = { SIGNALS, executable, contextText, codeOnly, contextualRecommendations };
