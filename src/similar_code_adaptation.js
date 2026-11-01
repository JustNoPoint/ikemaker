'use strict';

const crypto = require('crypto');

const DEPENDENCY_KINDS = Object.freeze([
  'functions', 'maps', 'constants', 'commands', 'states', 'animations',
  'sounds', 'helpers', 'explods', 'projectiles'
]);
const MAX_VALUES_PER_KIND = 32;
const MAX_REVIEW_ROWS = 160;
const MAX_REVIEW_BYTES = 128 * 1024;

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
function boundedValue(value) {
  const text = String(value ?? '').trim();
  return text && Buffer.byteLength(text, 'utf8') <= 512 && !/[\u0000-\u001f\u007f]/.test(text) ? text : '';
}
function valuesFor(dependencies, kind) {
  const seen = new Set(), values = [];
  for (const raw of Array.isArray(dependencies?.[kind]) ? dependencies[kind] : []) {
    const value = boundedValue(raw), key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key); values.push(value);
    if (values.length >= MAX_VALUES_PER_KIND) break;
  }
  return values;
}
function literalStatus(kind, value) {
  if (['states', 'animations'].includes(kind)) return /^-?\d+$/.test(value) ? 'literal' : 'dynamic';
  if (['helpers', 'explods', 'projectiles'].includes(kind)) return /^-?\d+$/.test(value) ? 'literal' : 'dynamic';
  if (kind === 'sounds') return /^(?:[a-z]\s*)?-?\d+\s*,\s*-?\d+$/i.test(value) ? 'literal' : 'dynamic';
  return 'literal';
}
function normalizeSource(source, label) {
  if (!source || typeof source.filename !== 'string' || !source.filename || !Number.isInteger(source.line) || source.line < 0 || !/^[a-f0-9]{64}$/i.test(String(source.fingerprint || ''))) {
    throw new Error(`Similar Code adaptation requires an exact ${label} source fingerprint.`);
  }
  return Object.freeze({ filename: source.filename, line: source.line, endLine: Number.isInteger(source.endLine) && source.endLine >= source.line ? source.endLine : source.line, fingerprint: source.fingerprint.toLowerCase() });
}
function reviewCore(value) {
  return { version:1,current:value.current,reference:value.reference,currentLanguage:value.currentLanguage,referenceLanguage:value.referenceLanguage,target:value.target,rows:(value.rows||[]).map(row=>({id:row.id,kind:row.kind,referenceValue:row.referenceValue,status:row.status==='reviewed-substitution'?'needs-selection':row.status,alternatives:[...(row.alternatives||[])]})) };
}
function reviewIdentity(value){return digest(JSON.stringify(reviewCore(value)));}
function buildAdaptationReview(input = {}) {
  const current = normalizeSource(input.currentSource, 'current'), reference = normalizeSource(input.referenceSource, 'reference');
  const currentLanguage = boundedValue(input.currentLanguage).toLowerCase(), referenceLanguage = boundedValue(input.referenceLanguage).toLowerCase();
  const rows = [];let omittedCount=0,reviewBytes=0;
  for (const kind of DEPENDENCY_KINDS) {
    const currentValues = valuesFor(input.currentDependencies, kind), referenceValues = valuesFor(input.referenceDependencies, kind);
    const currentLookup = new Map(currentValues.map(value => [value.toLocaleLowerCase(), value]));
    for (const referenceValue of referenceValues) {
      const exact = currentLookup.get(referenceValue.toLocaleLowerCase()) || '', dynamic = literalStatus(kind, referenceValue) === 'dynamic';
      const status = dynamic ? 'dynamic-unresolved' : exact ? 'already-matched' : currentValues.length ? 'needs-selection' : 'unresolved';
      const id = digest(JSON.stringify([kind, referenceValue])).slice(0, 24);
      const row=Object.freeze({
        id, kind, referenceValue, status, selectedValue: exact,
        alternatives: Object.freeze([...currentValues]),
        reviewed: Boolean(exact),
        note: dynamic
          ? 'This authored expression is not a literal dependency and cannot be substituted automatically.'
          : exact
            ? 'The current block already uses the same exact dependency.'
            : currentValues.length
              ? 'Choose an explicit current-block value only after confirming equivalent intent.'
              : 'No same-kind current-block value is available. Keep this dependency only after project ownership is verified.'
      }),rowBytes=Buffer.byteLength(JSON.stringify(row),'utf8');
      if(rows.length>=MAX_REVIEW_ROWS||reviewBytes+rowBytes>MAX_REVIEW_BYTES){omittedCount+=1;continue;}
      rows.push(row);reviewBytes+=rowBytes;
    }
  }
  const languageCompatible = Boolean(currentLanguage && currentLanguage === referenceLanguage);
  const target = Object.freeze({
    channel: boundedValue(input.target?.channel).toLowerCase() || 'unknown',
    version: boundedValue(input.target?.version),
    capabilityFingerprint: boundedValue(input.target?.capabilityFingerprint),
    catalogFingerprint: boundedValue(input.target?.catalogFingerprint),
    contextFingerprint: boundedValue(input.target?.contextFingerprint)
  });
  const blockers = [];
  if (!languageCompatible) blockers.push(`The reference language ${referenceLanguage || 'unknown'} does not match the current language ${currentLanguage || 'unknown'}.`);
  blockers.push('Engine compatibility has not been proven for an adapted block. This review cannot insert or rewrite source.');
  if (rows.some(row => row.status === 'dynamic-unresolved')) blockers.push('One or more authored dependency expressions are dynamic and require manual source review.');
  if (rows.some(row => row.status === 'unresolved')) blockers.push('One or more reference dependencies have no same-kind current-block alternative.');
  const draft={
    schema: 'ikemaker.similar-code-adaptation-review', version: 1,
    current, reference, currentLanguage, referenceLanguage,
    languageCompatible, target, rows: Object.freeze(rows), blockers: Object.freeze(blockers),
    omittedCount,note:omittedCount?`${omittedCount} dependency row(s) were omitted by the 128 KiB review bound.`:'',
    mutationAllowed: false,
    status: blockers.length ? 'review-only-blocked' : 'review-only'
  };
  return Object.freeze({...draft,reviewId:reviewIdentity(draft)});
}

function chooseSubstitution(review, rowId, selectedValue) {
  if (!review || review.schema !== 'ikemaker.similar-code-adaptation-review' || !/^[a-f0-9]{64}$/i.test(String(review.reviewId || '')) || reviewIdentity(review)!==String(review.reviewId).toLowerCase()) throw new Error('The adaptation review is invalid or stale.');
  const row = review.rows.find(value => value.id === rowId);
  if (!row) throw new Error('The adaptation dependency is not part of the current review.');
  if(row.status==='dynamic-unresolved')throw new Error('Dynamic dependency expressions require manual source review and cannot receive a substitution choice.');
  const selected = boundedValue(selectedValue), allowed = row.alternatives.find(value => value.toLocaleLowerCase() === selected.toLocaleLowerCase());
  if (!allowed) throw new Error('Choose one of the exact same-kind dependencies offered by the current block.');
  const rows = review.rows.map(value => value.id === row.id ? Object.freeze({ ...value, selectedValue: allowed, reviewed: true, status: allowed.toLocaleLowerCase() === value.referenceValue.toLocaleLowerCase() ? 'already-matched' : 'reviewed-substitution' }) : value);
  return Object.freeze({ ...review, rows:Object.freeze(rows), mutationAllowed:false, status:'review-only-blocked' });
}

function recheckAdaptationReview(review, sources = {}) {
  if (!review || review.schema !== 'ikemaker.similar-code-adaptation-review') return Object.freeze({ current:false, reason:'The adaptation review is missing.' });
  const currentFingerprint = boundedValue(sources.currentFingerprint).toLowerCase(), referenceFingerprint = boundedValue(sources.referenceFingerprint).toLowerCase();
  if (currentFingerprint !== review.current.fingerprint || referenceFingerprint !== review.reference.fingerprint) return Object.freeze({ current:false, reason:'The current or reference source changed. Refresh Similar Code before reviewing substitutions.' });
  return Object.freeze({ current:true, reason:'' });
}

module.exports = { DEPENDENCY_KINDS, MAX_VALUES_PER_KIND, MAX_REVIEW_ROWS, MAX_REVIEW_BYTES, buildAdaptationReview, chooseSubstitution, recheckAdaptationReview, literalStatus, reviewIdentity };
