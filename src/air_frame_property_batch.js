'use strict';

const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');

const PROPERTIES = Object.freeze({
  x: Object.freeze({ label: 'X offset', kind: 'integer', modes: Object.freeze(['set', 'add']) }),
  y: Object.freeze({ label: 'Y offset', kind: 'integer', modes: Object.freeze(['set', 'add']) }),
  time: Object.freeze({ label: 'Time', kind: 'integer', modes: Object.freeze(['set', 'add']) }),
  flags: Object.freeze({ label: 'Flip', kind: 'flags', modes: Object.freeze(['set']) }),
  blend: Object.freeze({ label: 'Blend', kind: 'blend', modes: Object.freeze(['set']) }),
  scaleX: Object.freeze({ label: 'X scale', kind: 'number', modes: Object.freeze(['set', 'multiply']) }),
  scaleY: Object.freeze({ label: 'Y scale', kind: 'number', modes: Object.freeze(['set', 'multiply']) }),
  angle: Object.freeze({ label: 'Angle', kind: 'number', modes: Object.freeze(['set', 'add']) })
});
const MAX_FRAMES = 512;

function fingerprint(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').toUpperCase(); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }
function actionFor(text, actionNumber) {
  const matches = parseAir(text).filter((item) => item.number === Number(actionNumber));
  if (matches.length !== 1) throw new Error(matches.length ? `Action ${actionNumber} is defined more than once.` : `Action ${actionNumber} could not be located.`);
  return matches[0];
}
function selectedIndices(values, count) {
  const indices = [...new Set((values || []).map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  if (!indices.length) throw new Error('Mark at least one AIR element before starting a property batch edit.');
  if (indices.length > MAX_FRAMES) throw new Error(`A property batch may contain at most ${MAX_FRAMES} AIR elements.`);
  if (indices.some((index) => index < 0 || index >= count)) throw new Error('The marked AIR element set contains an element that no longer exists.');
  return indices;
}
function normalizedValue(property, value) {
  const spec = PROPERTIES[property];
  if (!spec) throw new Error(`Unsupported AIR frame property: ${property || 'none'}.`);
  if (spec.kind === 'flags') { const clean = String(value || '').trim().toUpperCase(); if (clean && !/^(?:H|V|HV|VH)$/.test(clean)) throw new Error('Flip must be empty, H, V, or HV.'); return clean === 'VH' ? 'HV' : clean; }
  if (spec.kind === 'blend') { const clean = String(value || '').trim().toUpperCase(); if (Buffer.byteLength(clean, 'utf8') > 128) throw new Error('Blend must use 128 UTF-8 bytes or fewer.'); if (/[;,\u0000-\u001f\u007f]/.test(clean)) throw new Error('Blend must be one AIR field without commas, comments, or control characters.'); return clean; }
  const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${spec.label} must be a finite number.`);
  if (spec.kind === 'integer' && !Number.isSafeInteger(number)) throw new Error(`${spec.label} must be a whole number.`);
  return number;
}
function resultValue(frame, property, mode, operand) {
  const current = property === 'time' ? frame.rawTime : frame[property];
  if (mode === 'set') return operand;
  if (mode === 'add') return current + operand;
  if (mode === 'multiply') return current * operand;
  throw new Error(`Unsupported ${property} operation: ${mode}.`);
}
const FIELD_INDEX = Object.freeze({ x: 2, y: 3, time: 4, flags: 5, blend: 6, scaleX: 7, scaleY: 8, angle: 9 });
function lineRange(text, lineNumber) {
  const source = String(text || ''); let line = 1, start = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) { if (line === lineNumber) return { start, end: match.index }; line += 1; start = match.index + match[0].length; }
  if (line === lineNumber) return { start, end: source.length };
  throw new Error(`AIR line ${lineNumber} could not be located.`);
}
function replaceFieldInLine(line, property, value) {
  const fieldIndex = FIELD_INDEX[property]; if (!Number.isInteger(fieldIndex)) throw new Error(`Unsupported AIR frame property: ${property}.`);
  const commentAt = line.indexOf(';'), code = commentAt >= 0 ? line.slice(0, commentAt) : line, comment = commentAt >= 0 ? line.slice(commentAt) : '';
  const commas = []; for (let index = 0; index < code.length; index += 1) if (code[index] === ',') commas.push(index);
  const count = commas.length + 1, rendered = String(value);
  if (fieldIndex >= count) {
    const trailing = /\s*$/.exec(code)[0], body = code.slice(0, code.length - trailing.length), missing = fieldIndex - count;
    return `${body}${','.repeat(missing + 1).split('').join(' ')}${missing >= 0 ? ' ' : ''}${rendered}${trailing}${comment}`;
  }
  const start = fieldIndex === 0 ? 0 : commas[fieldIndex - 1] + 1, end = fieldIndex < commas.length ? commas[fieldIndex] : code.length, segment = code.slice(start, end), leading = /^\s*/.exec(segment)[0], nonLeading = segment.slice(leading.length), trailing = /\s*$/.exec(nonLeading)[0];
  return code.slice(0, start) + leading + rendered + trailing + code.slice(end) + comment;
}
function patchField(text, lineNumber, property, value) { const range = lineRange(text, lineNumber), line = text.slice(range.start, range.end); return text.slice(0, range.start) + replaceFieldInLine(line, property, value) + text.slice(range.end); }
function review(text, request = {}) {
  const source = String(text || ''), action = actionFor(source, request.action), property = String(request.property || ''), spec = PROPERTIES[property];
  if (!spec) throw new Error(`Unsupported AIR frame property: ${property || 'none'}.`);
  const mode = String(request.mode || 'set'); if (!spec.modes.includes(mode)) throw new Error(`${spec.label} does not support the ${mode} operation.`);
  const operand = normalizedValue(property, request.value), indices = selectedIndices(request.frameIndices, action.frames.length);
  const changes = indices.map((frameIndex) => { const frame = action.frames[frameIndex], before = property === 'time' ? frame.rawTime : frame[property], after = normalizedValue(property, resultValue(frame, property, mode, operand)); if (property === 'time' && after < -1) throw new Error('Frame time cannot be below -1 (the AIR hold sentinel).'); return Object.freeze({ frameIndex, element: frameIndex + 1, line: frame.line, sprite: Object.freeze([frame.group, frame.index]), before, after }); });
  const authority = Object.freeze({ schemaVersion: 1, sourceFingerprint: fingerprint(source), action: action.number, property, mode, operand, frameIndices: Object.freeze(indices), changes: Object.freeze(changes) });
  return Object.freeze({ ...authority, reviewDigest: digest(authority) });
}
function validateReview(reviewPlan) {
  if (!reviewPlan || reviewPlan.schemaVersion !== 1) throw new Error('The AIR property review is invalid.');
  const { reviewDigest, ...authority } = reviewPlan;
  if (!/^[A-F0-9]{64}$/.test(String(reviewDigest || '')) || digest(authority) !== reviewDigest) throw new Error('The AIR property review changed after it was created. Nothing was written.');
  return authority;
}
function applyReviewed(text, reviewPlan) {
  const source = String(text || ''), authority = validateReview(reviewPlan);
  if (fingerprint(source) !== authority.sourceFingerprint) throw new Error('The AIR source changed while the property batch was being reviewed. Nothing was written; review the current source and try again.');
  const action = actionFor(source, authority.action), indices = selectedIndices(authority.frameIndices, action.frames.length);
  let output = source;
  for (const frameIndex of indices) {
    const frame = actionFor(output, authority.action).frames[frameIndex], expected = authority.changes.find((item) => item.frameIndex === frameIndex);
    if (!expected || frame.line !== expected.line || frame.group !== expected.sprite[0] || frame.index !== expected.sprite[1]) throw new Error('A reviewed AIR element no longer matches its exact source identity. Nothing was written.');
    output = patchField(output, frame.line, authority.property, expected.after);
  }
  return output;
}

module.exports = { PROPERTIES, MAX_FRAMES, fingerprint, review, applyReviewed, replaceFieldInLine, patchField };
