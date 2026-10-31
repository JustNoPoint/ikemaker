'use strict';

const BUILTIN_ALIASES = Object.freeze({
  'turn toward opponent': ['turn'],
  'face opponent': ['turn'],
  'stop horizontal movement': ['velset'],
  'stop moving horizontally': ['velset'],
  'stop movement': ['velset'],
  'hit once': ['hitonce', 'one-time map latch'],
  'only hit once': ['hitonce', 'one-time map latch'],
  'run once': ['persistent', 'one-time map latch'],
  'run during hit pause': ['ignorehitpause'],
  'during hit pause': ['ignorehitpause'],
  'change animation': ['changeanim'],
  'change state': ['changestate'],
  'go to state': ['changestate'],
  'spawn helper': ['helper'],
  'create helper': ['helper'],
  'play sound': ['playsnd'],
  'stop sound': ['stopsnd'],
  'set velocity': ['velset'],
  'add velocity': ['veladd'],
  'move position': ['posadd'],
  'set position': ['posset'],
  'store local value': ['local let'],
  'store persistent value': ['map assignment'],
  'check target exists': ['check target before target access', 'numtarget'],
  'check helper exists': ['check helper before helper access', 'numhelper'],
  'repeat until': ['for with conditional break'],
  'choose between values': ['inline ifelse value', 'switch case default']
});

function normalizeAliases(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [alias, targets] of Object.entries(value)) {
    const key = String(alias || '').trim().toLowerCase(); if (!key) continue;
    const values = (Array.isArray(targets) ? targets : [targets]).filter(item => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (values.length) output[key] = [...new Set(values)];
  }
  return output;
}

function alternatives(query, customAliases = {}) {
  const normalized = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const aliases = { ...BUILTIN_ALIASES, ...normalizeAliases(customAliases) }, output = [normalized];
  for (const [alias, targets] of Object.entries(aliases)) if (normalized === alias || normalized.includes(alias)) output.push(...targets);
  return [...new Set(output)];
}

function matches(text, query, customAliases = {}) {
  const haystack = String(text || '').toLowerCase();
  return alternatives(query, customAliases).some(alternative => alternative.split(/\s+/).filter(Boolean).every(term => haystack.includes(term)));
}

module.exports = { BUILTIN_ALIASES, normalizeAliases, alternatives, matches };
