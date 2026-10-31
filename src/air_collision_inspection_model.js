'use strict';

const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');

const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_RUNTIME_PLAN_BADGES = 4096;
const GROUPS = Object.freeze(['clsn1', 'clsn2']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }
function fail(message) { throw new Error(`AIR collision inspection: ${message}`); }
function integer(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) fail(`${label} must be a non-negative safe integer.`); return number; }
function sourceLines(text) { return String(text).split(/\r?\n/); }
function codeExtent(line) { const comment = String(line).indexOf(';'), end = comment < 0 ? String(line).length : comment; const start = /^\s*/.exec(String(line).slice(0, end))[0].length; return { start, end: Math.max(start, end) }; }
function lineRange(lineNumber, text) { const extent = codeExtent(text); return { start: { line: lineNumber - 1, character: extent.start }, end: { line: lineNumber - 1, character: extent.end } }; }
function allocationProfile(input = {}) {
  const target = input.target && typeof input.target === 'object' ? input.target : null;
  const decision = input.allocationDecision && typeof input.allocationDecision === 'object' ? input.allocationDecision : {};
  const channel = String(target?.channel || '').toLowerCase(), version = String(target?.version || '').toLowerCase();
  if (channel === 'stable' || /^1\.0(?:\.0)?$/.test(version)) return { id: 'stable-source-order', status: 'verified', authoritative: true, reason: 'The exact Stable 1.0 target uses source-order AIR collision allocation.' };
  const capabilityId = String(decision.capability?.id || decision.capabilityId || ''), status = String(decision.status || '').toLowerCase(), allowed = new Set(['supported', 'changed', 'fallback', 'deprecated']);
  const fingerprint = String(input.capabilityFingerprint || ''), decisionFingerprint = String(decision.capabilityFingerprint || '');
  if (decision.enabled === true && capabilityId === 'collision.air-index-allocation' && allowed.has(status) && fingerprint && decisionFingerprint === fingerprint) return { id: 'indexed-label', status: 'verified', authoritative: true, reason: decision.message || 'The exact target uses verified indexed-label AIR allocation.' };
  return { id: 'target-unresolved', status: 'unknown', authoritative: false, reason: decision.message || 'The exact AIR collision allocation profile is unresolved for this target.' };
}
function blockHeader(lines, lineNumber) {
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) return null;
  const raw = lines[lineNumber - 1], clean = raw.replace(/;.*/, ''), match = /^\s*Clsn([12])(Default)?\s*:\s*(\d+)\s*$/i.exec(clean);
  if (!match) return null;
  return { raw, token: clean.trim().split(':')[0].trim(), declaredText: match[3], declared: Number.isSafeInteger(Number(match[3])) ? Number(match[3]) : null, default: Boolean(match[2]), line: lineNumber, range: lineRange(lineNumber, raw) };
}
function assignmentEvidence(lines, record, sourceOrder) {
  const line = integer(record.line, 'assignment source line'), rawLine = lines[line - 1] || '', code = rawLine.replace(/;.*/, ''), equals = code.indexOf('='), extent = codeExtent(rawLine);
  const prefix = equals >= 0 ? code.slice(0, equals).trim() : '', coordinates = equals >= 0 ? code.slice(equals + 1).trim() : '';
  return {
    sourceOrder, line, range: { start: { line: line - 1, character: extent.start }, end: { line: line - 1, character: extent.end } },
    rawLine, rawPrefix: prefix, authoredGroupToken: String(record.authoredGroupToken || ''), rawIndexText: String(record.indexText ?? ''), parsedLabel: Number.isInteger(record.index) ? record.index : null,
    rawCoordinateText: coordinates, rawRect: [...(record.rawRect || record.rect || [])], normalizedRect: [...(record.rect || [])], stableSlot: Number.isInteger(record.stableSlot) ? record.stableSlot : null,
    indexedSlot: Number.isInteger(record.indexedSlot) ? record.indexedSlot : null, indexedAllocation: String(record.allocation || 'unknown')
  };
}
function slots(records) {
  return (records || []).map(record => ({ slot: Number(record.index), normalizedRect: [...record.rect], sourceLine: Number.isInteger(record.line) ? record.line : null, authoredLabel: Number.isInteger(record.authoredIndex) ? record.authoredIndex : null, allocation: String(record.allocation || 'unknown'), filled: Number.isInteger(record.line) }));
}
function canonicalRuntimePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
  const kind = String(plan.kind || '').toLowerCase(), groups = new Set(['Clsn1', 'Clsn2', 'Size', 'Dummy']);
  if (!['overrideclsn', 'transformclsn'].includes(kind) || !Number.isSafeInteger(Number(plan.action)) || !Number.isSafeInteger(Number(plan.element)) || Number(plan.element) < 1 || !groups.has(String(plan.group || '')) || !Number.isInteger(Number(plan.index))) return false;
  const finiteList = (value, length) => Array.isArray(value) && value.length === length && value.every(item => Number.isFinite(Number(item)));
  if (kind === 'overrideclsn') return finiteList(plan.rect, 4);
  return plan.needsReview !== true && Number(plan.index) >= -1 && finiteList(plan.scale, 2) && Number.isFinite(Number(plan.angle)) && finiteList(plan.pivot, 2);
}
function compactRuntimePlans(savedInput = [], recoveryInput = [], selection = {}) {
  const saved = Array.isArray(savedInput) ? savedInput : [], recovery = Array.isArray(recoveryInput) ? recoveryInput : [];
  if (saved.length + recovery.length > MAX_RUNTIME_PLAN_BADGES) fail(`runtime plan badges exceed ${MAX_RUNTIME_PLAN_BADGES}.`);
  const counts = { override: 0, transform: 0, saved: 0, recovery: 0 }, omitted = { saved: 0, recovery: 0, total: 0 }, expectedAction = Number(selection.action), expectedElement = Number(selection.elementIndex) + 1;
  const scan = (plans, channel) => { for (const plan of plans) {
    const scoped = Number(plan?.action) === expectedAction && Number(plan?.element) === expectedElement;
    if (!scoped || !canonicalRuntimePlan(plan)) { omitted[channel] += 1; omitted.total += 1; continue; }
    if (String(plan.kind).toLowerCase() === 'overrideclsn') counts.override += 1; else counts.transform += 1;
    counts[channel] += 1;
  } };
  scan(saved, 'saved'); scan(recovery, 'recovery');
  return { applied: false, label: 'Runtime additions not applied here', counts, total: counts.saved + counts.recovery, omitted };
}
function unavailableGroup(name, ownership, reason, runtimeAdditions, provenance = {}) {
  return { group: name === 'clsn1' ? 'Clsn1' : 'Clsn2', ownership, provenance, authored: { available: false, reason, block: null, assignments: [], diagnostics: [] }, projection: { status: 'unavailable', reason, profile: null, candidates: [] }, runtimeAdditions };
}
function groupInspection({ key, frame, lines, profile, projectionAllowed, projectionReason, runtimeAdditions, provenance }) {
  const name = key === 'clsn1' ? 'Clsn1' : 'Clsn2', ownership = String(frame[`${key}Ownership`] || frame[`${key}Source`] || 'none');
  const line = frame[`${key}Line`], header = blockHeader(lines, line), rawRecords = frame[`${key}AuthoredRecords`] || [];
  if (!header && ownership === 'none') return unavailableGroup(key, ownership, 'No authored collision block supplies this group for the selected element.', runtimeAdditions, provenance);
  if (!header) return unavailableGroup(key, ownership, 'The authoritative collision block could not be resolved in this AIR source.', runtimeAdditions, provenance);
  const assignments = rawRecords.map((record, index) => assignmentEvidence(lines, record, index));
  const endLine = Math.max(header.line, Number(frame[`${key}EvidenceEndLine`]) || header.line, ...(assignments.map(item => item.line)));
  const diagnostics = (frame[`${key}Diagnostics`] || []).map(item => ({ kind: String(item.kind || 'unknown'), message: String(item.message || ''), line: Number(item.line), range: lineRange(Number(item.line), lines[Number(item.line) - 1] || '') }));
  const authored = { available: true, reason: '', block: { ...header, endLine, range: { start: header.range.start, end: lineRange(endLine, lines[endLine - 1] || '').end }, compilerInvalid: Boolean(frame[`${key}CompilerInvalid`]) }, assignments, diagnostics };
  if (!projectionAllowed) return { group: name, ownership, provenance, authored, projection: { status: 'unavailable', reason: projectionReason, profile: null, candidates: [] }, runtimeAdditions };
  const stable = { profile: 'stable-source-order', authoritative: profile.id === 'stable-source-order', status: 'parsed', slots: slots(frame[`${key}StableRecords`]) };
  const indexedInvalid = Boolean(frame[`${key}CompilerInvalid`]), indexed = { profile: 'indexed-label', authoritative: profile.id === 'indexed-label' && !indexedInvalid, status: indexedInvalid ? 'compiler-invalid' : 'parsed', slots: slots(frame[`${key}IndexedRecords`]) };
  const candidates = profile.id === 'stable-source-order' ? [stable] : profile.id === 'indexed-label' ? [indexed] : [{ ...stable, authoritative: false }, { ...indexed, authoritative: false }];
  return { group: name, ownership, provenance, authored, projection: { status: indexedInvalid && profile.id === 'indexed-label' ? 'compiler-invalid' : profile.status, reason: indexedInvalid && profile.id === 'indexed-label' ? 'The indexed target rejects this malformed or truncated collision block; displayed slots are explanatory only.' : profile.reason, profile: profile.id, candidates }, runtimeAdditions };
}

function createAirCollisionInspection(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be an object.');
  const text = String(input.text || '');
  if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) fail(`source exceeds ${MAX_SOURCE_BYTES} bytes.`);
  const actionNumber = Number(input.action), occurrence = input.actionOccurrence === undefined ? 0 : integer(input.actionOccurrence, 'Action occurrence'), elementIndex = integer(input.elementIndex ?? 0, 'element index');
  if (!Number.isSafeInteger(actionNumber)) fail('Action number must be a safe integer.');
  const parsed = parseAir(text), matches = parsed.filter(action => action.number === actionNumber), action = matches[occurrence], sourceFingerprint = hash(text), capabilityFingerprint = String(input.capabilityFingerprint || hash({ target: input.target || null, decision: input.allocationDecision || null })), profile = allocationProfile({ ...input, capabilityFingerprint }), runtimeAdditions = compactRuntimePlans(input.savedRuntimePlans, input.recoveryRuntimePlans, { action: actionNumber, elementIndex });
  const base = { schema: 'ikemaker.air-collision-inspection', version: 1, sourceFingerprint, capabilityFingerprint, target: { value: input.target || null, allocation: profile }, selection: { requestedAction: actionNumber, actionOccurrence: occurrence, elementIndex, elementNumber: elementIndex + 1 }, runtimeAdditions };
  if (!action) {
    const reason = `Action ${actionNumber} occurrence ${occurrence + 1} is unavailable.`;
    const provenance = { via: 'unresolved', authoritativeAction: null };
    const semantic = { ...base, available: false, reason, selection: { ...base.selection, authoritativeAction: null, frameSourceLine: null, readOnly: true, sourceMode: 'unresolved', copyChain: [] }, groups: { clsn1: unavailableGroup('clsn1', 'unresolved', reason, runtimeAdditions, provenance), clsn2: unavailableGroup('clsn2', 'unresolved', reason, runtimeAdditions, provenance) } };
    return deepFreeze({ ...semantic, inspectionHash: hash(semantic) });
  }
  const duplicate = matches.length > 1, frame = action.frames[elementIndex], unresolved = !frame;
  const sourceMode = action.copyResolved ? 'copy-action' : action.fallthroughAction !== undefined ? 'fallthrough' : unresolved ? 'unresolved' : 'authored';
  const projectionAllowed = !duplicate && !unresolved && !action.copyError;
  const reason = duplicate ? `Action ${actionNumber} is defined ${matches.length} times; parsed-slot authority is ambiguous.` : action.copyError || (unresolved ? `Element ${elementIndex + 1} is unavailable for Action ${actionNumber}.` : '');
  const selection = { ...base.selection, actionLine: action.line, authoritativeAction: projectionAllowed ? Number(action.resolvedFrom ?? action.number) : null, frameSourceLine: frame?.line || null, readOnly: Boolean(action.readOnly || duplicate || unresolved), sourceMode, copyAction: Number.isInteger(action.copyAction) ? action.copyAction : null, fallthroughAction: Number.isInteger(action.fallthroughAction) ? action.fallthroughAction : null, copyChain: frame?.copyChain ? [...frame.copyChain] : [] };
  const lines = sourceLines(text), groups = {}, provenance = { via: sourceMode, authoritativeAction: selection.authoritativeAction };
  for (const key of GROUPS) groups[key] = frame ? groupInspection({ key, frame, lines, profile, projectionAllowed, projectionReason: reason, runtimeAdditions, provenance }) : unavailableGroup(key, 'unresolved', reason, runtimeAdditions, provenance);
  const semantic = { ...base, available: Boolean(frame), reason, selection, groups };
  return deepFreeze({ ...semantic, inspectionHash: hash(semantic) });
}

module.exports = { MAX_SOURCE_BYTES, MAX_RUNTIME_PLAN_BADGES, GROUPS, allocationProfile, createAirCollisionInspection, deepFreeze };
