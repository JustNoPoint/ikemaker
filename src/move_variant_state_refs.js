'use strict';
const path = require('node:path');
const { maskSource } = require('./state_transfer_model');

function reviewStateReferences(copy) {
  const masked = maskSource(copy.text, copy.component.syntax);
  const refs = [];
  function add(at, expression, detail, patch) {
    const line = copy.component.startLine + copy.text.slice(0, at).split('\n').length;
    refs.push({ description: path.basename(copy.source.filename) + ':' + line + ' · ' + expression + ' — ' + detail, patch });
  }
  for (const transfer of copy.parsed.transfers) {
    if (!['changestate', 'selfstate'].includes(transfer.kind) || transfer.literal !== copy.state ||
        transfer.redirected || transfer.ambiguous || transfer.dynamic) continue;
    add(transfer.start, transfer.controller + ' → ' + copy.state, 'literal return to the original state',
      { start: transfer.start, end: transfer.end, text: String(copy.newState) });
  }
  for (const match of masked.matchAll(/\bstateno\s*([+-])\s*(\d+)\b/gi)) {
    const delta = Number(match[2]) * (match[1] === '-' ? -1 : 1);
    add(match.index, match[0], 'in the copied state this can resolve to ' + (copy.newState + delta) + ' instead of ' + (copy.state + delta));
  }
  for (const match of masked.matchAll(/\bstateno\s*(?:!=|=)\s*(\d+)\b/gi)) {
    if (Number(match[1]) === copy.state) add(match.index, match[0], 'comparison keeps the original ID; check the evaluated player');
  }
  return refs;
}
function sharedFamilyReferences(copy, sources) {
  const { inspectSource } = require('./helper_authoring_model');
  const seen = new Set(), details = [];
  for (const spawn of inspectSource({ filename: copy.source.filename, text: copy.text }).spawns) {
    const family = String(spawn.params.id ?? '');
    if (!/^\d+$/.test(family) || seen.has(family)) continue;
    seen.add(family);
    const uses = new RegExp('\\b(?:NumHelper|Helper)\\s*\\(\\s*' + Number(family) + '\\s*\\)', 'gi');
    let count = 0;
    for (const source of sources) {
      const masked = maskSource(source.text, /\.zss$/i.test(source.filename) ? 'zss' : 'cns');
      count += Array.from(masked.matchAll(uses)).length;
    }
    details.push('Shared Helper family ' + family + ': ' + count + ' literal NumHelper/Helper reference(s) in assigned sources. Both variants use this ID.');
  }
  return details;
}
function animationUses(text, syntax) {
  const changes = require('./state_change_animation_authority').parseChangeAnimations(text, syntax);
  const effects = require('./explod_animation_reference_authority').parseExplodAnimationReferences(text, syntax);
  const records = [...changes, ...effects].filter(record => record.expression).map(record => ({
    label: record.kind, line: record.controllerLine, expression: record.expression, action: record.action
  }));
  const masked = maskSource(text, syntax);
  const fields = /\b(projanim|projhitanim|projremanim|projcancelanim|sparkno|guard\.sparkno)\s*[:=]\s*([^;\r\n}]+)/gi;
  for (const match of masked.matchAll(fields)) {
    const expression = match[2].trim();
    const id = /^[sSfF]?(\d+)$/.exec(expression);
    records.push({ label: match[1], line: masked.slice(0, match.index).split('\n').length - 1,
      expression, action: id ? Number(id[1]) : null });
  }
  return records;
}
module.exports = { reviewStateReferences, sharedFamilyReferences, animationUses };
