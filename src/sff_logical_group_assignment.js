'use strict';

const crypto = require('crypto');

const clone = value => JSON.parse(JSON.stringify(value));
const integer = (value, label, minimum = 0) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > 65535) throw new Error(`${label} must be an integer from ${minimum} to 65535.`);
  return parsed;
};
const identity = (group, index) => `${group},${index}`;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizedReserved(ranges = []) {
  return ranges.map((range, order) => ({
    group: integer(range.group, `Reserved range ${order + 1} group`),
    start: integer(range.start, `Reserved range ${order + 1} start`),
    end: integer(range.end, `Reserved range ${order + 1} end`),
    label: String(range.label || 'reserved range')
  })).map(range => {
    if (range.end < range.start) throw new Error(`Reserved range ${range.label} ends before it starts.`);
    return range;
  });
}

function sourceFingerprint(sources = [], overrides = {}) {
  return digest(sources.map(source => ({ id: String(source.id), byteHash: String(source.byteHash || ''), override: overrides[source.id] || null })));
}

function planLogicalGroupAssignment(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const overrides = clone(input.overrides || {});
  const selected = new Set(Array.from(input.selectedIds || [], String));
  const moved = sources.filter(source => selected.has(String(source.id)));
  if (!moved.length) throw new Error('Select one or more staged sprite sources before assigning a logical group.');
  const group = integer(input.targetGroup, 'Target group');
  const startIndex = integer(input.targetIndex, 'Starting index');
  const occupied = new Set(Array.from(input.existingIdentities || [], String));
  const selectedIds = new Set(moved.map(source => String(source.id)));
  for (const source of sources) {
    if (selectedIds.has(String(source.id))) continue;
    const override = overrides[source.id] || {};
    if (Number.isInteger(Number(override.group)) && Number.isInteger(Number(override.number))) occupied.add(identity(Number(override.group), Number(override.number)));
  }
  const reserved = normalizedReserved(input.reservedRanges);
  const airReferences = input.airReferences || {};
  const paletteBySource = input.paletteBySource || {};
  const rows = moved.map((source, offset) => {
    const index = startIndex + offset;
    if (index > 65535) throw new Error('The logical group assignment exceeds index 65535.');
    const id = identity(group, index);
    const range = reserved.find(item => item.group === group && index >= item.start && index <= item.end);
    const references = Array.isArray(airReferences[id]) ? airReferences[id].map(String) : [];
    const current = overrides[source.id] || {};
    const previousIdentity = Number.isInteger(Number(current.group)) && Number.isInteger(Number(current.number)) ? identity(Number(current.group), Number(current.number)) : '';
    return {
      sourceId: String(source.id), name: String(source.name || source.id), target: id, group, index,
      previousIdentity, collision: occupied.has(id), reserved: range ? range.label : '',
      airReferences: references, paletteId: String(paletteBySource[source.id] || current.paletteId || ''),
      status: occupied.has(id) || range ? 'review' : 'ready'
    };
  });
  const targetDuplicates = new Set();
  const seen = new Set();
  for (const row of rows) { if (seen.has(row.target)) targetDuplicates.add(row.target); seen.add(row.target); }
  for (const row of rows) if (targetDuplicates.has(row.target)) row.status = 'review';
  const paletteIds = [...new Set(rows.map(row => row.paletteId).filter(Boolean))];
  const review = {
    collisions: rows.filter(row => row.collision).map(row => row.target),
    reserved: rows.filter(row => row.reserved).map(row => ({ identity: row.target, label: row.reserved })),
    duplicateTargets: [...targetDuplicates],
    airReferences: rows.filter(row => row.airReferences.length).map(row => ({ identity: row.target, references: row.airReferences })),
    paletteIds,
    mixedPalettes: paletteIds.length > 1
  };
  const authority = { sourceFingerprint: sourceFingerprint(sources, overrides), group, startIndex, selectedIds: moved.map(source => String(source.id)), targets: rows.map(row => row.target) };
  return Object.freeze({ kind: 'sff-logical-group-assignment-plan-v1', planId: digest(authority), authority: Object.freeze(authority), rows: Object.freeze(rows.map(Object.freeze)), review: Object.freeze(review), blocked: rows.some(row => row.status === 'review') });
}

function applyLogicalGroupAssignment(input = {}) {
  const plan = input.plan;
  if (!plan || plan.kind !== 'sff-logical-group-assignment-plan-v1') throw new Error('A reviewed logical group assignment plan is required.');
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const overrides = clone(input.overrides || {});
  if (sourceFingerprint(sources, overrides) !== plan.authority.sourceFingerprint) throw new Error('The staged sources or their overrides changed; review the logical group assignment again.');
  if (plan.blocked && input.acceptReviewedRisks !== true) throw new Error('Collision, reserved-range, duplicate-target, or reference review must be accepted before applying this draft assignment.');
  for (const row of plan.rows) overrides[row.sourceId] = { ...(overrides[row.sourceId] || {}), group: row.group, number: row.index };
  return { overrides, assignmentReceipt: { kind: 'sff-logical-group-assignment-receipt-v1', planId: plan.planId, sourceFingerprint: plan.authority.sourceFingerprint, assigned: plan.rows.map(row => ({ sourceId: row.sourceId, identity: row.target })) } };
}

module.exports = { sourceFingerprint, planLogicalGroupAssignment, applyLogicalGroupAssignment };
