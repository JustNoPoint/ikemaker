'use strict';

const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');
const { createAirCollisionInspection } = require('./air_collision_inspection_model');
const { createAirCollisionEditImpact } = require('./air_collision_edit_impact_model');
const { createAirCollisionEditPlan } = require('./air_collision_edit_plan');

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function applyPatch(text, patch) { return text.slice(0, patch.start) + patch.replacement + text.slice(patch.end); }
function compactDiff(before, after) {
  let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let oldEnd = before.length, newEnd = after.length; while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  return { start, end: oldEnd, before: before.slice(start, oldEnd), replacement: after.slice(start, newEnd) };
}
function contextFor(text, options, groupKey) {
  const inspection = createAirCollisionInspection({ text, action: options.action, actionOccurrence: 0, elementIndex: options.elementIndex, target: options.target || null, allocationDecision: options.allocationDecision || null, capabilityFingerprint: options.capabilityFingerprint, savedRuntimePlans: options.savedRuntimePlans || [], recoveryRuntimePlans: options.recoveryRuntimePlans || [] });
  const group = inspection.groups?.[groupKey], profile = inspection.target?.allocation?.id, candidate = group?.projection?.candidates?.find(item => item.profile === profile && item.authoritative === true);
  return { inspection, group, records: candidate?.slots || [] };
}
function editOnce(text, options, groupKey, slot, operation) {
  const { inspection } = contextFor(text, options, groupKey);
  const impact = createAirCollisionEditImpact({ text, inspection, capabilityFingerprint: options.capabilityFingerprint, action: options.action, actionOccurrence: 0, elementIndex: options.elementIndex, groupKey, slot, intent: operation });
  const plan = createAirCollisionEditPlan({ text, inspection, impact, capabilityFingerprint: options.capabilityFingerprint, action: options.action, actionOccurrence: 0, elementIndex: options.elementIndex, groupKey, slot, operation, savedRuntimePlans: options.savedRuntimePlans || [], recoveryRuntimePlans: options.recoveryRuntimePlans || [] });
  if (!plan.ready) throw new Error(plan.reason || 'The reviewed collision conversion could not be planned safely.');
  return { text: applyPatch(text, plan.patch), plan };
}
function validate(input) {
  const text = String(input.text || ''), action = Number(input.action), elementIndex = Number(input.elementIndex), groupKey = input.groupKey;
  if (!text || !Number.isSafeInteger(action) || !Number.isSafeInteger(elementIndex) || elementIndex < 0 || !['clsn1', 'clsn2'].includes(groupKey) || !/^[A-F0-9]{64}$/.test(String(input.capabilityFingerprint || ''))) throw new Error('The collision conversion selection is invalid.');
  const matches = parseAir(text).filter(item => item.number === action), frame = matches.length === 1 ? matches[0].frames[elementIndex] : null;
  if (!frame || matches[0].readOnly) throw new Error('The selected Action is missing, duplicated, or read-only.');
  return { text, action, elementIndex, groupKey, frame };
}
function buildGroupConversion(input = {}) {
  const valid = validate(input), slots = [...new Set((input.slots || []).map(Number))].filter(Number.isSafeInteger).sort((a, b) => b - a);
  if (!slots.length) throw new Error('Select one or more exact collision boxes first.');
  const source = valid.groupKey, target = source === 'clsn1' ? 'clsn2' : 'clsn1', initial = contextFor(valid.text, input, source);
  if (!['element'].includes(initial.group?.ownership)) throw new Error('Convert this inherited/default group to a local block before changing selected boxes between Clsn1 and Clsn2.');
  const initialTarget = contextFor(valid.text, input, target);
  if (initialTarget.group?.ownership === 'default-declared-for-this-element') throw new Error('Convert the target Default block to local ownership first so adding converted boxes cannot silently change later frames.');
  const chosen = slots.map(slot => initial.records.find(record => record.slot === slot)).filter(record => record?.filled && Array.isArray(record.normalizedRect));
  if (chosen.length !== slots.length) throw new Error('One or more selected collision slots are stale or unfilled.');
  let working = valid.text;
  for (const record of chosen) working = editOnce(working, input, source, record.slot, { kind: 'delete' }).text;
  for (const record of chosen.slice().reverse()) {
    const targetContext = contextFor(working, input, target), empty = targetContext.records.find(item => !item.filled), slot = empty ? empty.slot : targetContext.records.length;
    working = editOnce(working, input, target, slot, { kind: 'add', rect: record.normalizedRect.map(Number) }).text;
  }
  const patch = compactDiff(valid.text, working);
  return Object.freeze({ kind: 'group', action: valid.action, elementIndex: valid.elementIndex, sourceGroup: source, targetGroup: target, count: chosen.length, sourceFingerprint: sha(valid.text), resultingFingerprint: sha(working), patch, impact: `${chosen.length} selected ${source === 'clsn1' ? 'Clsn1' : 'Clsn2'} box${chosen.length === 1 ? '' : 'es'} will become ${target === 'clsn1' ? 'Clsn1' : 'Clsn2'} on this frame.` });
}
function lineRows(text) { const rows = []; let start = 0; for (const match of text.matchAll(/\r\n|\n|\r/g)) { rows.push({ start, end: match.index, fullEnd: match.index + match[0].length, text: text.slice(start, match.index) }); start = match.index + match[0].length; } rows.push({ start, end: text.length, fullEnd: text.length, text: text.slice(start) }); return rows; }
function buildOwnershipConversion(input = {}) {
  const valid = validate(input), key = valid.groupKey, ownership = valid.frame[`${key}Ownership`], line = valid.frame[`${key}Line`];
  let working = valid.text, direction = '';
  if (ownership === 'inherited-default') {
    const current = contextFor(working, input, key), record = current.records.find(item => item.filled && Array.isArray(item.normalizedRect));
    if (!record) throw new Error('The inherited default has no filled collision box to materialize locally.');
    working = editOnce(working, input, key, record.slot, { kind: 'edit', rect: record.normalizedRect.map(Number) }).text; direction = 'default-to-local';
  } else if (ownership === 'element' || ownership === 'default-declared-for-this-element') {
    const rows = lineRows(working), row = rows[Number(line) - 1]; if (!row) throw new Error('The exact collision header line is unavailable.');
    const expected = key === 'clsn1' ? 'Clsn1' : 'Clsn2', regex = new RegExp(`\\b${expected}(Default)?(?=\\s*:)`, 'i'), match = regex.exec(row.text); if (!match) throw new Error('The exact collision ownership header could not be found losslessly.');
    const token = ownership === 'element' ? `${expected}Default` : expected, start = row.start + match.index;
    working = working.slice(0, start) + token + working.slice(start + match[0].length); direction = ownership === 'element' ? 'local-to-default' : 'default-to-local';
  } else throw new Error('The selected frame has no collision block to convert between local and default ownership.');
  const beforeAction = parseAir(valid.text).find(item => item.number === valid.action), afterAction = parseAir(working).find(item => item.number === valid.action), changed = beforeAction.frames.reduce((count, frame, index) => {
    const after = afterAction.frames[index]; return count + (frame[`${key}Ownership`] !== after?.[`${key}Ownership`] || frame[`${key}Line`] !== after?.[`${key}Line`] ? 1 : 0);
  }, 0), patch = compactDiff(valid.text, working), label = key === 'clsn1' ? 'Clsn1' : 'Clsn2';
  return Object.freeze({ kind: 'ownership', action: valid.action, elementIndex: valid.elementIndex, groupKey: key, direction, count: changed, sourceFingerprint: sha(valid.text), resultingFingerprint: sha(working), patch, impact: direction === 'local-to-default' ? `${label} becomes a shared Default block; ${changed} frame ownership record${changed === 1 ? '' : 's'} will change.` : `${label} becomes frame-local; ${changed} frame ownership record${changed === 1 ? '' : 's'} will change.` });
}

module.exports = { buildGroupConversion, buildOwnershipConversion, compactDiff };
