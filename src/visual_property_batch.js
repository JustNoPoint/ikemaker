'use strict';

const { parseDef, normalize, setSectionEntry } = require('./def_model');

function exactSection(document, line) {
  const section = document.sections.find(item => item.name && item.line === Number(line));
  if (!section) throw new Error(`The section at line ${Number(line) + 1} no longer exists.`);
  return section;
}

function normalizeChanges(changes) {
  const result = [];
  for (const [key, value] of Object.entries(changes || {})) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey || /[\r\n=\[\]]/.test(cleanKey)) throw new Error(`Invalid property name: ${key}.`);
    const cleanValue = String(value == null ? '' : value).replace(/[\r\n]/g, ' ').trim();
    if (cleanValue.length > 100000) throw new Error(`${cleanKey} is too large for a reviewed batch edit.`);
    result.push({ key: cleanKey, normalized: normalize(cleanKey), value: cleanValue });
  }
  if (!result.length) throw new Error('Choose at least one property to apply.');
  return result;
}

function batchSetEntries(text, sectionLines, changes, options = {}) {
  const mode = options.mode === 'missing' ? 'missing' : 'overwrite', source = String(text), document = parseDef(source);
  const lines = [...new Set((sectionLines || []).map(Number))];
  if (!lines.length) throw new Error('Choose at least one target section.');
  const targets = lines.map(line => exactSection(document, line)).sort((left, right) => right.line - left.line), normalizedChanges = normalizeChanges(changes);
  let next = source; const applied = [], skipped = [];
  for (const target of targets) {
    for (const change of normalizedChanges) {
      const fresh = parseDef(next), section = exactSection(fresh, target.line), existing = section.entries.find(entry => entry.normalized === change.normalized);
      if (mode === 'missing' && existing) { skipped.push({ section: section.name, key: change.key, reason: 'already exists' }); continue; }
      next = setSectionEntry(fresh, section.line, change.key, change.value);
      applied.push({ section: section.name, key: change.key, previous: existing?.value, value: change.value });
    }
  }
  return Object.freeze({ text: next, mode, applied: Object.freeze(applied), skipped: Object.freeze(skipped) });
}

function inheritSectionEntries(text, sourceLine, targetLines, keys, options = {}) {
  const document = parseDef(text), source = exactSection(document, sourceLine), wanted = new Set((keys || []).map(normalize).filter(Boolean));
  const entries = source.entries.filter(entry => !wanted.size || wanted.has(entry.normalized));
  if (!entries.length) throw new Error(`No matching properties were found in [${source.name}].`);
  const targets = (targetLines || []).map(Number).filter(line => line !== source.line);
  if (!targets.length) throw new Error('Choose at least one different target section.');
  return batchSetEntries(text, targets, Object.fromEntries(entries.map(entry => [entry.key, entry.value])), options);
}

function batchSummary(plan) {
  if (!plan || !Array.isArray(plan.applied)) throw new Error('A reviewed batch plan is required.');
  const sections = new Set(plan.applied.map(item => item.section));
  return `${plan.applied.length} property change(s) across ${sections.size} section(s)${plan.skipped.length ? `; ${plan.skipped.length} existing value(s) retained` : ''}.`;
}

module.exports = { normalizeChanges, batchSetEntries, inheritSectionEntries, batchSummary };
