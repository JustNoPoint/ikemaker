'use strict';

const crypto = require('crypto');
const workflow = require('./sff_unmatched_color_workflow');
const { paletteFingerprint } = require('./palette_master');

const MAX_PUBLIC_CANDIDATES = 3;
const MAX_PUBLIC_ROWS = 512;
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function hash(value) { return crypto.createHash('sha256').update(Buffer.from(stable(value))).digest('hex'); }
function rgba(value, label) { if (!Array.isArray(value) || value.length !== 4 || value.some(item => !Number.isInteger(item) || item < 0 || item > 255)) throw new Error(`${label} must be exact RGBA bytes.`); return value.slice(); }

function suggest(scanState, masterColors, options = {}) {
  const scan = workflow.verify(scanState);
  if (!Array.isArray(masterColors) || masterColors.length !== 256) throw new Error('Nearest-color review requires exactly 256 master colors.');
  const colors = masterColors.map((color, index) => rgba(color, `Master index ${index}`));
  if (paletteFingerprint(colors).toLowerCase() !== scan.masterFingerprint) throw new Error('Nearest-color master palette no longer matches the unmatched-color scan.');
  const requestedProtected = options.protectedIndices === undefined ? [] : options.protectedIndices;
  if (!Array.isArray(requestedProtected) || Object.getPrototypeOf(requestedProtected) !== Array.prototype || requestedProtected.length > 256 || requestedProtected.some(index => !Number.isInteger(index) || index < 0 || index > 255)) throw new Error('Protected palette indexes must be a plain array of at most 256 integers from 0 through 255.');
  const protectedIndices = [...new Set([0, ...requestedProtected])];
  const protectedSet = new Set(protectedIndices), rows = [];
  for (const issue of scan.issues.slice(0, MAX_PUBLIC_ROWS)) {
    const source = rgba(issue.sourceRgba, 'Unmatched source color');
    if (source[3] === 0) { rows.push({ issueId: issue.issueId, sourceRgba: source, candidates: [], candidateCount: 0, omittedCandidateCount: 0, ambiguous: false, reason: 'fully-transparent-source', affectedImageCount: issue.affectedImageCount, affectedPixelCount: issue.affectedPixelCount }); continue; }
    const eligible = [];
    for (let index = 0; index < colors.length; index += 1) {
      const destination = colors[index];
      if (protectedSet.has(index) || destination[3] !== source[3] || (source[3] === 255 && destination[3] !== 255)) continue;
      const deltas = [0, 1, 2].map(channel => Math.abs(source[channel] - destination[channel])), distanceSquared = deltas.reduce((sum, value) => sum + value * value, 0);
      eligible.push({ index, rgba: destination.slice(), distanceSquared, maxChannelDelta: Math.max(...deltas) });
    }
    eligible.sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index);
    const minimum = eligible[0]?.distanceSquared ?? null, tiedNearestCount = minimum === null ? 0 : eligible.filter(item => item.distanceSquared === minimum).length;
    rows.push({ issueId: issue.issueId, sourceRgba: source, candidates: eligible.slice(0, MAX_PUBLIC_CANDIDATES), candidateCount: eligible.length, omittedCandidateCount: Math.max(0, eligible.length - MAX_PUBLIC_CANDIDATES), ambiguous: tiedNearestCount > 1, tiedNearestCount, suggestedIndex: tiedNearestCount === 1 ? eligible[0].index : null, affectedImageCount: issue.affectedImageCount, affectedPixelCount: issue.affectedPixelCount, reason: eligible.length ? 'review-required' : 'no-alpha-compatible-destination' });
  }
  const body = { schema: 'ikemaker.palette-adaptation-suggestions', version: 1, scanHash: scan.scanHash, masterFingerprint: scan.masterFingerprint, policy: { metric: 'rgb-squared-integer', alpha: 'exact-alpha', protectedIndices: protectedIndices.sort((a, b) => a - b), automaticAcceptance: false }, summary: { issueCount: scan.issues.length, publicRowCount: rows.length, omittedRowCount: Math.max(0, scan.issues.length - rows.length) }, rows };
  return { ...body, suggestionHash: hash(body) };
}

module.exports = { MAX_PUBLIC_CANDIDATES, MAX_PUBLIC_ROWS, suggest, hash };
