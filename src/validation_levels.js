'use strict';

const LEVELS = ['error', 'warning', 'convention', 'suggestion'];
const ALIASES = { information: 'convention', info: 'convention', hint: 'suggestion' };

function normalizeLevel(value) {
  const level = String(value || 'warning').toLowerCase();
  return LEVELS.includes(level) ? level : ALIASES[level] || 'warning';
}
function enabled(issue, settings = {}) {
  const level = normalizeLevel(issue.level || issue.severity);
  const levels = Array.isArray(settings.enabledLevels) && settings.enabledLevels.length ? settings.enabledLevels : LEVELS;
  if (!levels.includes(level)) return false;
  if (level === 'convention' && (settings.disabledConventionRules || []).includes(String(issue.code || ''))) return false;
  return true;
}
function group(issues = [], settings = {}) {
  const result = Object.fromEntries(LEVELS.map((level) => [level, []]));
  for (const issue of issues) if (enabled(issue, settings)) result[normalizeLevel(issue.level || issue.severity)].push(issue);
  return result;
}

module.exports = { LEVELS, normalizeLevel, enabled, group };
