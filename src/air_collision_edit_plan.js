'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { createAirCollisionInspection, deepFreeze } = require('./air_collision_inspection_model');
const { createAirCollisionEditImpact } = require('./air_collision_edit_impact_model');

const SCHEMA = 'ikemaker.air-collision-edit-plan';
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_CONTEXT_BYTES = 8192;
const HASH = /^[A-F0-9]{64}$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function plain(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value); const keys = Object.keys(value), own = Reflect.ownKeys(value), prototype = Object.getPrototypeOf(value);
  const descriptor = key => { const item = Object.getOwnPropertyDescriptor(value, key); return Boolean(item && Object.prototype.hasOwnProperty.call(item, 'value') && plain(item.value, stack)); };
  const valid = Array.isArray(value) ? own.length === keys.length + 1 && own.includes('length') && keys.length === value.length && keys.every((key, index) => Number(key) === index && descriptor(key)) : (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && descriptor(key));
  stack.delete(value); return valid;
}
function frozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => frozen(item, seen)); }
function effects() { return { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }; }
function finish(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: effects() }; return deepFreeze({ ...semantic, planHash: semanticHash(semantic) }); }
function unavailable(reason, status = 'unavailable', evidence = {}) { return finish({ status, ready: false, reason: String(reason), sourceFingerprint: String(evidence.sourceFingerprint || ''), inspectionHash: String(evidence.inspectionHash || ''), impactHash: String(evidence.impactHash || ''), capabilityFingerprint: String(evidence.capabilityFingerprint || ''), selection: evidence.selection || null, ownership: null, impact: '', patch: null, resultingFingerprint: '', context: null, limitations: [String(reason)] }); }
function normalizedRect(value) { if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isSafeInteger)) return null; const [x1, y1, x2, y2] = value.map(Number); return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; }
function linesOf(text) { const rows = []; let start = 0; for (let index = 0; index < text.length;) { if (text[index] !== '\r' && text[index] !== '\n') { index += 1; continue; } const contentEnd = index; let eol = text[index++]; if (eol === '\r' && text[index] === '\n') eol += text[index++]; rows.push({ number: rows.length + 1, start, contentEnd, end: index, content: text.slice(start, contentEnd), eol }); start = index; } rows.push({ number: rows.length + 1, start, contentEnd: text.length, end: text.length, content: text.slice(start), eol: '' }); return rows; }
function targetDecision(inspection) { const fingerprint = inspection.capabilityFingerprint, profile = inspection.target?.allocation?.id; return profile === 'indexed-label' ? { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: fingerprint, message: String(inspection.target?.allocation?.reason || '') } : { enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }; }
function validateFrozenEvidence(value, schema, hashName) { if (!value || !plain(value) || !frozen(value) || value.schema !== schema || value.version !== 1 || !HASH.test(String(value[hashName] || ''))) return false; const { [hashName]: supplied, ...semantic } = value, calculated = schema === 'ikemaker.air-collision-inspection' ? sha(JSON.stringify(semantic)) : semanticHash(semantic); return calculated === supplied; }
function parseHeader(row, expectedGroup) {
  const match = /^(\s*)(Clsn([12])(Default)?)(\s*:\s*)(\d+)([^\r\n]*)$/i.exec(row.content);
  if (!match || `clsn${match[3]}` !== expectedGroup) return null;
  const tail = match[7], commentAt = tail.indexOf(';');
  if (commentAt < 0 && tail.trim()) return null;
  return { indent: match[1], token: match[2], count: Number(match[6]), countStart: row.start + match.index + match[1].length + match[2].length + match[5].length, countEnd: row.start + match.index + match[1].length + match[2].length + match[5].length + match[6].length };
}
function parseAssignment(row, expectedGroup) {
  const match = /^(\s*)(Clsn([12]))(\s*\[\s*)(\d+)(\s*\]\s*=\s*)([^;]*?)(\s*)(;.*)?$/i.exec(row.content);
  if (!match || `clsn${match[3]}` !== expectedGroup) return null;
  const rect = normalizedRect(String(match[7]).split(',').map(value => Number(value.trim())));
  if (!rect) return null;
  const coordinateStart = row.start + match[1].length + match[2].length + match[4].length + match[5].length + match[6].length;
  return { indent: match[1], label: Number(match[5]), rect, coordinateStart, coordinateEnd: coordinateStart + match[7].length, inlineComment: match[9] || '' };
}
function exactBlock(text, lineNumber, groupKey, options = {}) {
  const rows = linesOf(text), headerRow = rows[lineNumber - 1], header = headerRow && parseHeader(headerRow, groupKey);
  if (!header || !Number.isSafeInteger(header.count) || header.count < 0 || header.count > 4096) return null;
  const assignments = [], body = [], boundaryLine = Number(options.boundaryLine); let cursor = lineNumber, last = lineNumber - 1;
  while (cursor < rows.length && assignments.length < header.count) {
    const row = rows[cursor], clean = row.content.replace(/;.*/, '').trim();
    if (Number.isSafeInteger(boundaryLine) && row.number >= boundaryLine) break;
    if (!clean) { body.push({ kind: 'trivia', row }); last = cursor; cursor += 1; continue; }
    if (!/^clsn/i.test(clean)) return null;
    const parsed = parseAssignment(row, groupKey); if (!parsed) return null;
    body.push({ kind: 'assignment', row, parsed }); assignments.push({ row, parsed }); last = cursor; cursor += 1;
  }
  if (assignments.length > header.count || (assignments.length < header.count && options.allowIncomplete !== true)) return null;
  return { rows, headerRow, header, body, assignments, incomplete: assignments.length < header.count, start: headerRow.start, end: rows[last]?.end ?? headerRow.end };
}
function commentOnly(row, indent) { const at = row.content.indexOf(';'); return at < 0 ? '' : `${indent}${row.content.slice(at).trimEnd()}${row.eol}`; }
function coordinateText(rect) { return rect.join(', '); }
function assignmentText(group, label, rect, indent, eol) { return `${indent}${group}[${label}] = ${coordinateText(rect)}${eol}`; }
function replacementBlock(block, group, after, profile, operation, selectedSlot, eol) {
  const stable = profile === 'stable-source-order', desired = new Map(after.filter(item => item.filled && (stable ? Number.isSafeInteger(item.sourceLine) : true)).map(item => [stable ? item.sourceLine : item.authoredLabel ?? item.slot, item]));
  const header = block.headerRow.content.slice(0, block.header.countStart - block.headerRow.start) + String(after.length) + block.headerRow.content.slice(block.header.countEnd - block.headerRow.start) + block.headerRow.eol;
  let output = header;
  for (const item of block.body) {
    if (item.kind === 'trivia') { output += item.row.content + item.row.eol; continue; }
    const label = item.parsed.label, identity = stable ? item.row.number : label, wanted = desired.get(identity);
    if (!wanted) { output += commentOnly(item.row, item.parsed.indent); continue; }
    if (operation.kind === 'edit' && wanted.slot === selectedSlot) output += item.row.content.slice(0, item.parsed.coordinateStart - item.row.start) + coordinateText(wanted.normalizedRect) + item.row.content.slice(item.parsed.coordinateEnd - item.row.start) + item.row.eol;
    else output += item.row.content + item.row.eol;
    desired.delete(identity);
  }
  const indent = block.assignments[0]?.parsed.indent || block.header.indent, insertionEol = eol || block.headerRow.eol || '\n';
  const additions = after.filter(item => item.filled && !Number.isSafeInteger(item.sourceLine));
  for (const record of additions.sort((a, b) => a.slot - b.slot)) output += assignmentText(block.header.token.replace(/Default$/i, ''), profile === 'indexed-label' ? record.authoredLabel ?? record.slot : record.authoredLabel ?? record.slot, record.normalizedRect, indent, insertionEol);
  return output;
}
function generatedBlock(groupKey, records, profile, indent, eol) {
  const group = groupKey === 'clsn2' ? 'Clsn2' : 'Clsn1'; let output = `${indent}${group}: ${records.length}${eol}`;
  for (const record of records) output += assignmentText(group, profile === 'indexed-label' ? record.authoredLabel ?? record.slot : record.slot, record.normalizedRect || [0, 0, 0, 0], indent, eol);
  return output;
}
function returnReplacement(block) { let output = commentOnly(block.headerRow, block.header.indent); for (const item of block.body) output += item.kind === 'trivia' ? item.row.content + item.row.eol : commentOnly(item.row, item.parsed.indent); return output; }
function boundedContext(text, start, end, replacement) { return { before: text.slice(Math.max(0, start - MAX_CONTEXT_BYTES / 2), Math.min(text.length, end + MAX_CONTEXT_BYTES / 2)), replacement: replacement.slice(0, MAX_CONTEXT_BYTES), beforeOmitted: Math.max(0, start - MAX_CONTEXT_BYTES / 2), afterOmitted: Math.max(0, text.length - end - MAX_CONTEXT_BYTES / 2), replacementOmitted: Math.max(0, replacement.length - MAX_CONTEXT_BYTES) }; }

function createAirCollisionEditPlan(input = {}) {
  let text = '', inspection = null, impact = null;
  try {
    if (!plain(input)) return unavailable('Plan evidence is not canonical plain JSON.');
    text = String(input.text || ''); inspection = input.inspection; impact = input.impact;
    if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) return unavailable(`AIR source exceeds ${MAX_SOURCE_BYTES} bytes.`);
    if (!validateFrozenEvidence(inspection, 'ikemaker.air-collision-inspection', 'inspectionHash')) return unavailable('The C8 inspection is missing, mutable, stale, or noncanonical.');
    if (!validateFrozenEvidence(impact, 'ikemaker.air-collision-edit-impact', 'impactHash')) return unavailable('The C12A impact is missing, mutable, stale, or noncanonical.');
    const capabilityFingerprint = String(input.capabilityFingerprint || ''), sourceFingerprint = sha(text), action = Number(input.action), actionOccurrence = Number(input.actionOccurrence || 0), elementIndex = Number(input.elementIndex), groupKey = input.groupKey === 'clsn2' ? 'clsn2' : input.groupKey === 'clsn1' ? 'clsn1' : '', slot = Number(input.slot), operation = input.operation || {}, evidence = { sourceFingerprint, capabilityFingerprint, inspectionHash: inspection.inspectionHash, impactHash: impact.impactHash }; let selection = { action, actionOccurrence, elementIndex, groupKey, slot, operation: { kind: String(operation.kind || '') } };
    if (!HASH.test(capabilityFingerprint) || sourceFingerprint !== inspection.sourceFingerprint || capabilityFingerprint !== inspection.capabilityFingerprint || !Number.isSafeInteger(action) || !Number.isSafeInteger(actionOccurrence) || actionOccurrence < 0 || !Number.isSafeInteger(elementIndex) || elementIndex < 0 || !groupKey || !Number.isSafeInteger(slot) || slot < 0 || !plain(operation)) return unavailable('Source, capability, or explicit edit selection evidence is invalid.', 'unavailable', { ...evidence, selection });
    if (!['add', 'edit', 'delete', 'return-to-default'].includes(operation.kind)) return unavailable('Operation must be add, edit, delete, or return-to-default.', 'conflict', { ...evidence, selection });
    const rect = operation.kind === 'add' || operation.kind === 'edit' ? normalizedRect(operation.rect) : null;
    if ((operation.kind === 'add' || operation.kind === 'edit') && !rect) return unavailable('Add/Edit coordinates must be four safe integers.', 'conflict', { ...evidence, selection });
    const operationKeys = Object.keys(operation).sort(), expectedKeys = operation.kind === 'add' || operation.kind === 'edit' ? ['kind', 'rect'] : ['kind'];
    if (operationKeys.length !== expectedKeys.length || operationKeys.some((key, index) => key !== expectedKeys[index])) return unavailable('Operation evidence contains unsupported or ambiguous fields.', 'conflict', { ...evidence, selection });
    selection = { ...selection, operation: rect ? { kind: operation.kind, rect } : { kind: operation.kind } };
    const rebuiltInspection = createAirCollisionInspection({ text, action, actionOccurrence, elementIndex, target: inspection.target?.value || null, allocationDecision: targetDecision(inspection), capabilityFingerprint, savedRuntimePlans: input.savedRuntimePlans || [], recoveryRuntimePlans: input.recoveryRuntimePlans || [] });
    if (rebuiltInspection.inspectionHash !== inspection.inspectionHash) return unavailable('The exact C8 inspection could not be reproduced from current evidence.', 'unavailable', { ...evidence, selection });
    const intent = selection.operation, rebuiltImpact = createAirCollisionEditImpact({ text, inspection: rebuiltInspection, capabilityFingerprint, action, actionOccurrence, elementIndex, groupKey, slot, intent });
    if (rebuiltImpact.impactHash !== impact.impactHash || rebuiltImpact.status === 'unavailable') return unavailable('The exact C12A edit impact could not be reproduced from current evidence.', 'unavailable', { ...evidence, selection });
    const profile = rebuiltImpact.selection.profile, status = rebuiltImpact.status, after = rebuiltImpact.proposedAfter, rows = linesOf(text), frameRow = rows[rebuiltImpact.selection.frameLine - 1];
    if (!frameRow || !Array.isArray(after)) return unavailable('The exact frame or proposed semantic result is unavailable.', 'conflict', { ...evidence, selection });
    if (profile === 'indexed-label' && operation.kind === 'delete' && slot !== rebuiltImpact.effectiveBefore.length - 1) return unavailable('Indexed-label deletion is ready only for the highest safely shrinkable allocated label.', 'conflict', { ...evidence, selection });
    let start, end, replacement, before, block = null;
    if (operation.kind === 'return-to-default') {
      block = exactBlock(text, rebuiltImpact.ownership.ownerLine, groupKey, { boundaryLine: rebuiltImpact.selection.frameLine, allowIncomplete: profile === 'stable-source-order' }); if (!block) return unavailable('The exact local collision block cannot be removed losslessly.', 'conflict', { ...evidence, selection });
      start = block.start; end = block.end; replacement = returnReplacement(block);
    } else if (status === 'inherited-default' || status === 'new-frame-block') {
      if (operation.kind !== 'add' && status === 'new-frame-block') return unavailable('A frame with no effective block supports Add only.', 'conflict', { ...evidence, selection });
      const indent = /^\s*/.exec(frameRow.content)[0], eol = frameRow.eol || (text.includes('\r\n') ? '\r\n' : '\n'); start = end = frameRow.start; replacement = generatedBlock(groupKey, after, profile, indent, eol);
    } else {
      block = exactBlock(text, rebuiltImpact.ownership.ownerLine, groupKey, { boundaryLine: rebuiltImpact.selection.frameLine, allowIncomplete: profile === 'stable-source-order' }); if (!block) return unavailable('The exact authored collision block cannot be changed losslessly.', 'conflict', { ...evidence, selection });
      const selected = rebuiltImpact.effectiveBefore.find(record => record.slot === slot), authored = selected && block.assignments.find(item => item.row.number === selected.sourceLine);
      if (operation.kind === 'edit' && selected?.filled && authored) { start = authored.parsed.coordinateStart; end = authored.parsed.coordinateEnd; replacement = coordinateText(after.find(record => record.slot === slot).normalizedRect); }
      else { start = block.start; end = block.end; replacement = replacementBlock(block, groupKey === 'clsn2' ? 'Clsn2' : 'Clsn1', after, profile, operation, slot, block.headerRow.eol || (text.includes('\r\n') ? '\r\n' : '\n')); }
    }
    before = text.slice(start, end); if (Buffer.byteLength(replacement, 'utf8') > MAX_PATCH_BYTES) return unavailable(`Exact patch exceeds ${MAX_PATCH_BYTES} bytes.`, 'conflict', { ...evidence, selection });
    const resultingText = text.slice(0, start) + replacement + text.slice(end), patch = { start, end, before, replacement };
    if (text.slice(start, end) !== before || text.slice(0, start) + replacement + text.slice(end) !== resultingText) return unavailable('Exact patch reconstruction failed.', 'unavailable', { ...evidence, selection });
    const affected = rebuiltImpact.ownership.affected, impactText = status === 'default-owner' ? `Default owner: ${affected.count} tied frame(s), ${affected.ownerCount} owner and ${affected.inheritorCount} inheritor(s).` : status === 'inherited-default' ? `Materialize all ${rebuiltImpact.materializesCount} effective ${rebuiltImpact.selection.group} boxes locally; shared default unchanged.` : operation.kind === 'return-to-default' ? `Remove this exact frame-local block and expose proven default at line ${rebuiltImpact.ownership.fallbackLine}.` : status === 'frame-specific' ? 'Change only this exact frame-local block.' : 'Create one frame-local collision block.';
    return finish({ status: 'ready', ready: true, reason: '', sourceFingerprint, inspectionHash: inspection.inspectionHash, impactHash: impact.impactHash, capabilityFingerprint, selection: { ...selection, profile, group: rebuiltImpact.selection.group, frameLine: rebuiltImpact.selection.frameLine }, ownership: rebuiltImpact.ownership, impact: impactText, patch, resultingFingerprint: sha(resultingText), context: boundedContext(text, start, end, replacement), limitations: ['One exact contiguous AIR source patch.', 'No save, filesystem write, command, clipboard, route, or editor mutation occurs in this planner.'] });
  } catch (error) { return unavailable(`Collision edit planning failed closed: ${error.message}`, 'unavailable', { sourceFingerprint: text ? sha(text) : '', inspectionHash: inspection && !utilTypes.isProxy(inspection) ? inspection.inspectionHash || '' : '', impactHash: impact && !utilTypes.isProxy(impact) ? impact.impactHash || '' : '' }); }
}

module.exports = { SCHEMA, MAX_SOURCE_BYTES, MAX_PATCH_BYTES, MAX_CONTEXT_BYTES, createAirCollisionEditPlan };
