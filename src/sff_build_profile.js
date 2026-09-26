'use strict';

const DEFAULT_PROFILE = Object.freeze({
  version: 1,
  profileName: 'Universal IKEMEN SFF build rules',
  projectId: 'universal',
  standardSets: ['ikemen-1.0-character-core'],
  requiredAnimations: [],
  getHitIndexing: {
    enabled: true,
    groupStart: 5000,
    groupEnd: 5999,
    step: 10,
    includeSequences: ['GetHit_High', 'GetHit_Mid', 'GetHit_Crouching'],
    excludeSequences: [],
    sequenceOverrides: {},
    sequenceMappings: {
      GetHit_Fall: { group: 5040, indices: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 10 } },
      GetHit_OTG: { group: 5040, indices: { 0: 20 } },
      GetHit_Trip: { group: 5075, indices: { 0: 0, 1: 1 } },
      KO: { group: 5030, indices: { 0: 10, 1: 20, 2: 40, 3: 50 } }
    }
  }
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function integer(value) { const number = Number(value); return Number.isInteger(number) ? number : null; }
function wildcard(pattern) { return new RegExp(`^${String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i'); }

function normalizeProfile(raw = {}) {
  const base = clone(DEFAULT_PROFILE), input = raw && typeof raw === 'object' ? raw : {}, policy = input.getHitIndexing || {};
  return {
    ...base, ...input,
    version: Number(input.version) || base.version,
    profileName: String(input.profileName || base.profileName),
    projectId: String(input.projectId || base.projectId).toLowerCase(),
    standardSets: Array.isArray(input.standardSets) ? input.standardSets : base.standardSets,
    requiredAnimations: Array.isArray(input.requiredAnimations) ? input.requiredAnimations : [],
    getHitIndexing: {
      ...base.getHitIndexing, ...policy,
      includeSequences: Array.isArray(policy.includeSequences) ? policy.includeSequences : base.getHitIndexing.includeSequences,
      excludeSequences: Array.isArray(policy.excludeSequences) ? policy.excludeSequences : [],
      sequenceOverrides: policy.sequenceOverrides && typeof policy.sequenceOverrides === 'object' ? policy.sequenceOverrides : {},
      sequenceMappings: policy.sequenceMappings && typeof policy.sequenceMappings === 'object' ? policy.sequenceMappings : base.getHitIndexing.sequenceMappings
    }
  };
}

function sequenceMatches(sequence, patterns) { return patterns.some((pattern) => wildcard(pattern).test(sequence)); }

function getHitCandidate(row, rawProfile) {
  const profile = normalizeProfile(rawProfile), policy = profile.getHitIndexing;
  if (!policy.enabled) return false;
  const group = integer(row.BaseGroup ?? row.ComputedGroup), sequence = String(row.CanonicalSequenceKey || '');
  if (group === null || group < Number(policy.groupStart) || group > Number(policy.groupEnd)) return false;
  if (sequenceMatches(sequence, policy.excludeSequences)) return false;
  const explicitlyMapped = Object.keys(policy.sequenceMappings || {}).some((name) => name.toLowerCase() === sequence.toLowerCase());
  return explicitlyMapped || sequenceMatches(sequence, policy.includeSequences);
}

function expectedIdentity(row, rawProfile) {
  const profile = normalizeProfile(rawProfile), policy = profile.getHitIndexing;
  if (!getHitCandidate(row, profile)) return null;
  const sequence = String(row.CanonicalSequenceKey || ''), sourceIndex = integer(row.SourceImageIndex);
  if (sourceIndex === null) return null;
  const mappingEntry = Object.entries(policy.sequenceMappings || {}).find(([name]) => name.toLowerCase() === sequence.toLowerCase());
  const identity = (baseGroup, index) => ({ baseGroup, group: baseGroup + (integer(row.LayerNumber) || 0) * 10000, index });
  if (mappingEntry) {
    const mapping = mappingEntry[1] || {}, mapped = integer((mapping.indices || {})[String(sourceIndex)]);
    if (mapped === null) return null;
    return identity(integer(mapping.group) ?? integer(row.BaseGroup ?? row.ComputedGroup), mapped);
  }
  const override = Object.entries(policy.sequenceOverrides).find(([name]) => name.toLowerCase() === sequence.toLowerCase());
  if (override) {
    const mapped = integer((override[1] || {})[String(sourceIndex)]);
    if (mapped !== null) return identity(integer(row.BaseGroup ?? row.ComputedGroup), mapped);
  }
  return identity(integer(row.BaseGroup ?? row.ComputedGroup), sourceIndex * Number(policy.step || 10));
}

function expectedIndex(row, rawProfile) {
  return expectedIdentity(row, rawProfile)?.index ?? null;
}

function auditIndexPolicy(rows, rawProfile) {
  const profile = normalizeProfile(rawProfile), issues = [];
  for (const row of rows || []) {
    const expected = expectedIdentity(row, profile);
    if (!expected) continue;
    const actual = integer(row.ImageIndex), actualGroup = integer(row.ComputedGroup);
    if (actual !== expected.index || actualGroup !== expected.group) issues.push({ row, expected: expected.index, expectedGroup: expected.group, actual, sequence: row.CanonicalSequenceKey || '', group: actualGroup });
  }
  return { profile, issues };
}

function applyIndexPolicy(rows, rawProfile) {
  const profile = normalizeProfile(rawProfile), changes = [];
  const updated = (rows || []).map((source) => {
    const row = { ...source }, expected = expectedIdentity(row, profile), actual = integer(row.ImageIndex), actualGroup = integer(row.ComputedGroup);
    if (!expected || (actual === expected.index && actualGroup === expected.group)) return row;
    row.BaseGroup = String(expected.baseGroup);
    row.ComputedGroup = String(expected.group);
    row.ImageIndex = String(expected.index);
    const group = integer(row.ComputedGroup);
    row.CanonicalOutputFilename = `${String(group).padStart(5, '0')}_${String(expected.index).padStart(5, '0')}.png`;
    row.ReviewStatus = 'REVIEW';
    row.ReviewReason = `${profile.profileName}: native get-hit identity changed ${actualGroup},${actual ?? 'unresolved'} to ${group},${expected.index}; review AIR references before approval.`;
    changes.push({ sequence: row.CanonicalSequenceKey || '', group, fromGroup: actualGroup, from: actual, to: expected.index, source: row.OriginalRelativePath || '' });
    return row;
  });
  return { profile, rows: updated, changes };
}

function profileTemplate(projectId = 'universal', name = '') {
  const profile = clone(DEFAULT_PROFILE); profile.projectId = String(projectId).toLowerCase();
  profile.profileName = name || `${projectId} SFF build rules`;
  profile.notes = ['Native standing and crouching get-hit banks use power-of-ten sprite slots.', 'Falling, knockdown, and lying sprites use explicit native mappings modeled after KFM rather than a blanket multiplier.', 'Project-required custom animations belong in this local profile.'];
  return profile;
}

module.exports = { DEFAULT_PROFILE, normalizeProfile, getHitCandidate, expectedIdentity, expectedIndex, auditIndexPolicy, applyIndexPolicy, profileTemplate };
