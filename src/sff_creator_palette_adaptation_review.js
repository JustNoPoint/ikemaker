'use strict';

const crypto = require('crypto');
const workflow = require('./sff_unmatched_color_workflow');
const suggestions = require('./palette_adaptation_suggestions');
const { normalizeBinding, verifyAcceptance: verifyReplacementAcceptance } = require('./sff_creator_replacement_rule_review');

const REVIEW_SCHEMA = 'ikemaker.sff-creator-palette-adaptation-review';
const ACCEPTANCE_SCHEMA = 'ikemaker.sff-creator-palette-adaptation-acceptance';
const PATCH_SCHEMA = 'ikemaker.sff-unmatched-color-map-index-patch';
const VERSION = 1;
const MAX_REVIEW_ROWS = suggestions.MAX_PUBLIC_ROWS;

function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function hash(value) { return crypto.createHash('sha256').update(Buffer.from(stable(value))).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function exactObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error(`${label} has an unsupported payload shape.`); }
function token(value) { const result = String(value || '').toLowerCase(); if (!/^[0-9a-f]{48}$/.test(result)) throw new Error('Nearest-color review token source returned an invalid opaque ID.'); return result; }
function digest(value, label) { const result = String(value || '').toLowerCase(); if (!/^[0-9a-f]{64}$/.test(result)) throw new Error(`${label} must be an exact SHA-256 hash.`); return result; }
function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`${label} must be a bounded nonnegative integer.`); return value; }
function rgba(value, label) { if (!Array.isArray(value) || value.length !== 4 || value.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error(`${label} must contain four integer channels from 0 through 255.`); return value.slice(); }
function unique(values, label) { const seen = new Set(); for (const value of values) { if (seen.has(value)) throw new Error(`${label} contains a duplicate identity.`); seen.add(value); } return seen; }
function verifyRetainedBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw new Error('Nearest-color retained binding is invalid.');
  const patch = { schema: 'ikemaker.sff-unmatched-color-resolution-patch', version: 1, scanHash: binding.scanHash, decisions: {}, appliedRuleIds: [], acceptedIssueIds: [], ignoredIssueIds: [] };
  const body = { schema: 'ikemaker.sff-creator-replacement-rule-acceptance', version: 1, reviewId: '0'.repeat(48), actionId: '1'.repeat(48), acceptedRowIds: [], resolutionPatch: patch, provenance: { binding, bindingHash: binding.bindingHash, actionKind: 'accept-row' } };
  verifyReplacementAcceptance({ ...body, acceptanceHash: hash(body) });
  return binding;
}

function exactRuleIssueIds(binding) {
  const applied = workflow.applyRules(binding.scan, binding.document.rules, binding.evidence.scope, binding.evidence.master.colors);
  return new Set(Object.keys(applied.resolutions));
}

function modelFor(binding, excludedIssueIds = []) {
  const excluded = new Set(excludedIssueIds);
  if (excluded.size > MAX_REVIEW_ROWS || [...excluded].some(issueId => !binding.scan.issues.some(issue => issue.issueId === issueId))) throw new Error('Nearest-color review exclusion contains an unavailable issue.');
  for (const issueId of exactRuleIssueIds(binding)) excluded.add(issueId);
  const model = suggestions.suggest(binding.scan, binding.evidence.master.colors, { protectedIndices: [0] });
  return { model, rows: model.rows.filter(row => !excluded.has(row.issueId)), excluded };
}

function decisionFor(binding, row, candidate) {
  const issue = binding.scan.issues.find(item => item.issueId === row.issueId);
  if (!issue) throw new Error('Nearest-color issue is no longer available.');
  return { kind: 'map-index', destinationIndex: candidate.index, destinationRgba: candidate.rgba.slice(), includedOccurrenceIndexes: issue.occurrences.map((_, index) => index) };
}

function verifyPatch(value) {
  exactObject(value, ['schema', 'version', 'scanHash', 'suggestionHash', 'decisions', 'acceptedIssueIds'], 'Nearest-color resolution patch');
  if (value.schema !== PATCH_SCHEMA || value.version !== VERSION) throw new Error('Nearest-color resolution patch schema is invalid.');
  digest(value.scanHash, 'Nearest-color scan hash'); digest(value.suggestionHash, 'Nearest-color suggestion hash');
  if (!value.decisions || typeof value.decisions !== 'object' || Array.isArray(value.decisions) || Object.keys(value.decisions).length > MAX_REVIEW_ROWS) throw new Error('Nearest-color decisions are invalid.');
  if (!Array.isArray(value.acceptedIssueIds) || value.acceptedIssueIds.length > MAX_REVIEW_ROWS) throw new Error('Nearest-color accepted issue identities are invalid.');
  unique(value.acceptedIssueIds, 'Nearest-color accepted issue identities');
  let occurrenceCount = 0;
  for (const [issueId, decision] of Object.entries(value.decisions)) {
    if (typeof issueId !== 'string' || !issueId || Buffer.byteLength(issueId, 'utf8') > 1024) throw new Error('Nearest-color issue identity is invalid.');
    exactObject(decision, ['kind', 'destinationIndex', 'destinationRgba', 'includedOccurrenceIndexes'], 'Nearest-color decision');
    if (decision.kind !== 'map-index') throw new Error('Nearest-color decisions must map to one exact master index.');
    integer(decision.destinationIndex, 'Nearest-color destination index', 255); rgba(decision.destinationRgba, 'Nearest-color destination RGBA');
    if (!Array.isArray(decision.includedOccurrenceIndexes) || decision.includedOccurrenceIndexes.some(index => !Number.isSafeInteger(index) || index < 0)) throw new Error('Nearest-color occurrence selection is invalid.');
    unique(decision.includedOccurrenceIndexes, 'Nearest-color occurrence selection'); occurrenceCount += decision.includedOccurrenceIndexes.length;
    if (!Number.isSafeInteger(occurrenceCount) || occurrenceCount > workflow.MAX_UNMATCHED_OCCURRENCES) throw new Error('Nearest-color patch exceeds its aggregate occurrence limit.');
  }
  if (stable(Object.keys(value.decisions).sort()) !== stable(value.acceptedIssueIds.slice().sort())) throw new Error('Nearest-color patch decision evidence is inconsistent.');
  return value;
}

function verifyAcceptance(value) {
  exactObject(value, ['schema', 'version', 'reviewId', 'actionId', 'acceptedRowIds', 'resolutionPatch', 'provenance', 'acceptanceHash'], 'Nearest-color acceptance');
  if (value.schema !== ACCEPTANCE_SCHEMA || value.version !== VERSION || !/^[0-9a-f]{48}$/.test(String(value.reviewId || '')) || !/^[0-9a-f]{48}$/.test(String(value.actionId || ''))) throw new Error('Nearest-color acceptance route evidence is invalid.');
  if (!Array.isArray(value.acceptedRowIds) || !value.acceptedRowIds.length || value.acceptedRowIds.length > MAX_REVIEW_ROWS || value.acceptedRowIds.some(id => !/^[0-9a-f]{48}$/.test(String(id || '')))) throw new Error('Nearest-color accepted row evidence is invalid.');
  unique(value.acceptedRowIds, 'Nearest-color accepted rows'); verifyPatch(value.resolutionPatch);
  exactObject(value.provenance, ['binding', 'bindingHash'], 'Nearest-color acceptance provenance');
  verifyRetainedBinding(value.provenance.binding); if (value.provenance.bindingHash !== value.provenance.binding.bindingHash) throw new Error('Nearest-color acceptance provenance is invalid.');
  const body = { ...value }; delete body.acceptanceHash; if (value.acceptanceHash !== hash(body)) throw new Error('Nearest-color acceptance changed after host review.');
  return value;
}

function revalidateAcceptance(value, currentBinding) {
  const acceptance = verifyAcceptance(value), current = normalizeBinding(currentBinding);
  if (stable(acceptance.provenance.binding) !== stable(current.evidence)) throw new Error('Creator, target, master palette, ordered sources, scan, or replacement rules changed after nearest-color acceptance. Review suggestions again.');
  const modeled = modelFor(current), byIssue = new Map(modeled.rows.map(row => [row.issueId, row]));
  if (acceptance.resolutionPatch.scanHash !== current.scan.scanHash || acceptance.resolutionPatch.suggestionHash !== modeled.model.suggestionHash) throw new Error('Nearest-color suggestion evidence changed after acceptance.');
  for (const [issueId, decision] of Object.entries(acceptance.resolutionPatch.decisions)) {
    const row = byIssue.get(issueId); if (!row) throw new Error(`Accepted nearest-color issue ${issueId} is no longer reviewable.`);
    const candidate = row.candidates.find(item => item.index === decision.destinationIndex && stable(item.rgba) === stable(decision.destinationRgba));
    if (!candidate || stable(decisionFor(current, row, candidate)) !== stable(decision)) throw new Error(`Accepted nearest-color decision ${issueId} no longer matches its reviewed candidate.`);
  }
  return acceptance;
}

function applyAcceptanceToDecisions(value, currentBinding, existingDecisions = {}) {
  const acceptance = revalidateAcceptance(value, currentBinding), next = clone(existingDecisions || {});
  if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Existing unmatched-color decisions must be an object.');
  for (const [issueId, decision] of Object.entries(acceptance.resolutionPatch.decisions)) {
    if (next[issueId] && stable(next[issueId]) !== stable(decision)) throw new Error(`Unmatched-color issue ${issueId} already has a different retained decision.`);
    next[issueId] = clone(decision);
  }
  return workflow.resolve(normalizeBinding(currentBinding).scan, next);
}

class PaletteAdaptationReviewAuthority {
  constructor(options = {}) { this.issueToken = options.token || (() => crypto.randomBytes(24).toString('hex')); this.current = null; }
  revoke() { this.current = null; }
  begin(input, options = {}) {
    this.revoke(); const binding = normalizeBinding(input), modeled = modelFor(binding, options.excludeIssueIds || []), reviewId = token(this.issueToken());
    const rowAuthorities = new Map(), candidateAuthorities = new Map(), publicRows = [];
    for (const row of modeled.rows) {
      const rowId = token(this.issueToken()), publicCandidates = [];
      rowAuthorities.set(rowId, row);
      for (const candidate of row.candidates) { const candidateId = token(this.issueToken()); candidateAuthorities.set(candidateId, { rowId, candidate }); publicCandidates.push({ candidateId, index: candidate.index, rgba: candidate.rgba.slice(), distanceSquared: candidate.distanceSquared, maxChannelDelta: candidate.maxChannelDelta }); }
      publicRows.push({ rowId, sourceRgba: row.sourceRgba.slice(), candidates: publicCandidates, candidateCount: row.candidateCount, omittedCandidateCount: row.omittedCandidateCount, ambiguous: row.ambiguous, tiedNearestCount: row.tiedNearestCount || 0, suggestedCandidateId: row.suggestedIndex === null ? '' : publicCandidates.find(candidate => candidate.index === row.suggestedIndex)?.candidateId || '', affectedImageCount: row.affectedImageCount, affectedPixelCount: row.affectedPixelCount, reason: row.reason });
    }
    const actionId = token(this.issueToken()), review = { schema: REVIEW_SCHEMA, version: VERSION, reviewId, actionId, generation: binding.evidence.creatorGeneration, draftRevision: binding.evidence.draftRevision, summary: { issueCount: modeled.model.summary.issueCount, reviewableRowCount: publicRows.length, omittedRowCount: modeled.model.summary.omittedRowCount, excludedIssueCount: modeled.excluded.size }, policy: clone(modeled.model.policy), rows: publicRows };
    this.current = { reviewId, actionId, binding, suggestionHash: modeled.model.suggestionHash, rowAuthorities, candidateAuthorities }; return clone(review);
  }
  accept(request = {}, currentBinding) {
    const session = this.current;
    if (!session || session.reviewId !== String(request.reviewId || '')) throw new Error('Nearest-color review expired or was already used.');
    this.revoke();
    if (session.actionId !== String(request.actionId || '')) throw new Error('Nearest-color action is invalid or was already used.');
    if (!Array.isArray(request.selections) || !request.selections.length || request.selections.length > MAX_REVIEW_ROWS) throw new Error('Select at least one nearest-color row to review and apply.');
    const current = normalizeBinding(currentBinding);
    if (stable(current.evidence) !== stable(session.binding.evidence)) throw new Error('Creator, target, master palette, ordered sources, scan, or replacement rules changed. Nothing was accepted.');
    const modeled = modelFor(current); if (modeled.model.suggestionHash !== session.suggestionHash) throw new Error('Nearest-color suggestions changed. Nothing was accepted.');
    const rowIds = request.selections.map(item => String(item?.rowId || '')); unique(rowIds, 'Nearest-color selected rows');
    const decisions = {}, acceptedRowIds = [];
    for (const selection of request.selections) {
      exactObject(selection, ['rowId', 'candidateId'], 'Nearest-color selection');
      const rowId = String(selection.rowId), candidateId = String(selection.candidateId), row = session.rowAuthorities.get(rowId), authority = session.candidateAuthorities.get(candidateId);
      if (!row || !authority || authority.rowId !== rowId) throw new Error('Nearest-color row or candidate authority expired. Nothing was accepted.');
      decisions[row.issueId] = decisionFor(current, row, authority.candidate); acceptedRowIds.push(rowId);
    }
    const resolutionPatch = { schema: PATCH_SCHEMA, version: VERSION, scanHash: current.scan.scanHash, suggestionHash: session.suggestionHash, decisions, acceptedIssueIds: Object.keys(decisions).sort() };
    const provenance = { binding: clone(current.evidence), bindingHash: current.evidence.bindingHash }, body = { schema: ACCEPTANCE_SCHEMA, version: VERSION, reviewId: session.reviewId, actionId: session.actionId, acceptedRowIds, resolutionPatch, provenance };
    return { ...body, acceptanceHash: hash(body) };
  }
}

module.exports = { REVIEW_SCHEMA, ACCEPTANCE_SCHEMA, PATCH_SCHEMA, VERSION, MAX_REVIEW_ROWS, PaletteAdaptationReviewAuthority, verifyPatch, verifyAcceptance, revalidateAcceptance, applyAcceptanceToDecisions, hash };
