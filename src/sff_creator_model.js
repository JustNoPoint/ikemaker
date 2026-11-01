'use strict';

const path = require('path');

const COLLISION_POLICIES = new Set(['stop', 'skip', 'replace-staged', 'next-free']);
const NUMBERING_MODES = new Set(['consecutive', 'stepped', 'next-free', 'detected']);
const ANCHORS = new Set(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const CROP_MODES = new Set(['none', 'autocrop', 'before-axis', 'after-axis']);
const DUPLICATE_POLICIES = new Set(['preserve-separate', 'share-identical']);
const MAX_U16 = 0xffff;
const MIN_I16 = -0x8000;
const MAX_I16 = 0x7fff;

function integer(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    const range = minimum > Number.MIN_SAFE_INTEGER && maximum < Number.MAX_SAFE_INTEGER
      ? ` from ${minimum} through ${maximum}`
      : minimum > Number.MIN_SAFE_INTEGER ? ` of at least ${minimum}` : maximum < Number.MAX_SAFE_INTEGER ? ` no greater than ${maximum}` : '';
    throw new Error(`${label} must be an integer${range}.`);
  }
  return number;
}

function identity(group, number) { return `${integer(group, 'group', 0, MAX_U16)},${integer(number, 'number', 0, MAX_U16)}`; }

function compileRules(rules = []) {
  if (!Array.isArray(rules) || rules.length > 32) throw new Error('Filename detection accepts at most 32 reviewed rules.');
  return rules.map((rule, index) => {
    const id = String(rule?.id || `rule-${index + 1}`).trim();
    const pattern = String(rule?.pattern || '').trim();
    if (!id || !pattern || pattern.length > 300) throw new Error(`Filename rule ${index + 1} is incomplete or too long.`);
    let expression;
    try { expression = new RegExp(pattern, rule.caseSensitive ? '' : 'i'); } catch (error) { throw new Error(`Filename rule ${id} is invalid: ${error.message}`); }
    return { id, expression, groupCapture: integer(rule.groupCapture ?? 1, `${id}.groupCapture`, 1), numberCapture: integer(rule.numberCapture ?? 2, `${id}.numberCapture`, 1), confidence: String(rule.confidence || 'review').trim() || 'review' };
  });
}

function detectFilenameIdentity(filename, rules = []) {
  const name = path.basename(String(filename || ''));
  for (const rule of compileRules(rules)) {
    const match = rule.expression.exec(name);
    if (!match) continue;
    const group = Number(match[rule.groupCapture]), number = Number(match[rule.numberCapture]);
    if (!Number.isSafeInteger(group) || !Number.isSafeInteger(number)) return { matched: true, ruleId: rule.id, confidence: rule.confidence, error: 'Matched captures are not integers.' };
    if (group < 0 || group > MAX_U16 || number < 0 || number > MAX_U16) return { matched: true, ruleId: rule.id, confidence: rule.confidence, error: 'Matched group/index must be within 0-65535.' };
    return { matched: true, ruleId: rule.id, confidence: rule.confidence, group, number, identity: `${group},${number}` };
  }
  return { matched: false, ruleId: null, confidence: 'none' };
}

function normalizeExistingIdentity(value, index) {
  const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Occupied identity ${index + 1} must use group,index.`);
  return identity(match[1], match[2]);
}

function normalizeReservedRanges(ranges = []) {
  if (!Array.isArray(ranges) || ranges.length > 1000) throw new Error('Reserved ranges must be a list of at most 1000 reviewed ranges.');
  return ranges.map((range, index) => {
    const group = integer(range?.group, `Reserved range ${index + 1} group`, 0, MAX_U16);
    const start = integer(range?.start, `Reserved range ${index + 1} start`, 0, MAX_U16);
    const end = integer(range?.end, `Reserved range ${index + 1} end`, 0, MAX_U16);
    if (end < start) throw new Error(`Reserved range ${index + 1} must be ordered start-to-end.`);
    const label = String(range?.label || '').trim();
    if (label.length > 120) throw new Error(`Reserved range ${index + 1} label must not exceed 120 characters.`);
    return { group, start, end, label };
  });
}

function reservedAt(group, number, ranges = []) {
  return (ranges || []).find((range) => Number(range.group) === group && number >= Number(range.start) && number <= Number(range.end));
}

function nextFree(group, start, occupied, ranges, allowReserved = false) {
  group = integer(group, 'group', 0, MAX_U16);
  let number = integer(start, 'start index', 0, MAX_U16);
  while (number <= MAX_U16 && (occupied.has(`${group},${number}`) || (!allowReserved && reservedAt(group, number, ranges)))) number += 1;
  if (number > MAX_U16) throw new Error(`No free sprite index remains in group ${group} from ${start} through 65535.`);
  return number;
}

function proposedAxis(width, height, anchor = 'center', offsetX = 0, offsetY = 0) {
  if (!ANCHORS.has(anchor)) throw new Error(`Unknown axis anchor ${anchor}.`);
  const horizontal = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? width : Math.floor(width / 2);
  const vertical = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? height : Math.floor(height / 2);
  return {
    axisX: integer(horizontal + integer(offsetX, 'axis offset X'), 'calculated axis X', MIN_I16, MAX_I16),
    axisY: integer(vertical + integer(offsetY, 'axis offset Y'), 'calculated axis Y', MIN_I16, MAX_I16)
  };
}

function planSpriteIntake(sources = [], configuration = {}, existingIdentities = []) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Choose at least one sprite source.');
  const mode = String(configuration.numberingMode || 'consecutive');
  if (!NUMBERING_MODES.has(mode)) throw new Error(`Unknown numbering mode ${mode}.`);
  const collisionPolicy = String(configuration.collisionPolicy || 'stop');
  if (!COLLISION_POLICIES.has(collisionPolicy)) throw new Error(`Unknown collision policy ${collisionPolicy}.`);
  const defaultGroup = integer(configuration.group ?? 0, 'destination group', 0, MAX_U16);
  const start = integer(configuration.startIndex ?? 0, 'starting index', 0, MAX_U16);
  const step = mode === 'stepped' ? integer(configuration.step ?? 10, 'numbering step', 1, MAX_U16) : 1;
  const rules = configuration.filenameRules || [];
  if (!Array.isArray(existingIdentities) || existingIdentities.length > 1000000) throw new Error('Occupied identities must be a bounded list.');
  const occupied = new Set(existingIdentities.map(normalizeExistingIdentity));
  const reservedRanges = normalizeReservedRanges(configuration.reservedRanges || []);
  const planned = new Set();
  const rows = [], conflicts = [], skipped = [];

  for (let position = 0; position < sources.length; position += 1) {
    const source = sources[position] || {};
    const sourceId = String(source.id || `source-${position + 1}`);
    const override = configuration.overrides?.[sourceId] || {};
    const detection = detectFilenameIdentity(source.name || source.path, rules);
    let group = integer(override.group ?? (mode === 'detected' && detection.matched && !detection.error ? detection.group : defaultGroup), `${sourceId} group`, 0, MAX_U16);
    let number;
    if (override.number !== undefined) number = integer(override.number, `${sourceId} index`, 0, MAX_U16);
    else if (mode === 'detected') {
      if (!detection.matched || detection.error) {
        conflicts.push({ sourceId, reason: detection.error || 'No filename rule matched.', kind: 'detection' });
        rows.push({ sourceId, source, detection, status: 'blocked' });
        continue;
      }
      number = detection.number;
    } else if (mode === 'next-free') number = nextFree(group, start, new Set([...occupied, ...planned]), reservedRanges);
    else number = start + position * step;

    const requestedIdentity = identity(group, number);
    const reservation = reservedAt(group, number, reservedRanges);
    if (reservation && !override.allowReserved) {
      conflicts.push({ sourceId, identity: requestedIdentity, kind: 'reserved', reason: `Reserved range${reservation.label ? `: ${reservation.label}` : ''}.` });
      rows.push({ sourceId, source, detection, group, number, identity: requestedIdentity, status: 'blocked' });
      continue;
    }

    const collides = occupied.has(requestedIdentity) || planned.has(requestedIdentity);
    let resolution = 'add';
    if (collides) {
      if (collisionPolicy === 'skip') {
        const skippedRow = { sourceId, source, detection, group, number, identity: requestedIdentity, status: 'skipped', reason: 'Destination identity already exists; this source will not enter the build.' };
        skipped.push(skippedRow);
        rows.push(skippedRow);
        continue;
      }
      if (collisionPolicy === 'next-free') {
        number = nextFree(group, number, new Set([...occupied, ...planned]), reservedRanges, Boolean(override.allowReserved));
        resolution = 'renumbered';
      } else if (collisionPolicy === 'replace-staged' && planned.has(requestedIdentity)) resolution = 'replace-staged';
      else if (collisionPolicy === 'replace-staged') {
        conflicts.push({ sourceId, identity: requestedIdentity, kind: 'existing', reason: 'Replace Staged cannot replace an active archive entry.' });
        rows.push({ sourceId, source, detection, group, number, identity: requestedIdentity, status: 'blocked' });
        continue;
      } else {
        conflicts.push({ sourceId, identity: requestedIdentity, kind: 'collision', reason: 'Destination identity already exists.' });
        rows.push({ sourceId, source, detection, group, number, identity: requestedIdentity, status: 'blocked' });
        continue;
      }
    }

    const finalIdentity = identity(group, number);
    const width = integer(source.width, `${sourceId} width`, 1, MAX_U16), height = integer(source.height, `${sourceId} height`, 1, MAX_U16), cropMode = String(override.cropMode || configuration.cropMode || 'none');
    if (!CROP_MODES.has(cropMode)) throw new Error(`Unknown crop mode ${cropMode}.`);
    const cropBounds = cropMode === 'before-axis' ? source.cropBounds : null;
    if (cropMode === 'before-axis' && (!cropBounds || cropBounds.empty || !cropBounds.width || !cropBounds.height)) throw new Error(`${sourceId} needs reviewed indexed transparency bounds before Crop before axis can be used.`);
    const axisWidth = cropBounds ? cropBounds.width : width, axisHeight = cropBounds ? cropBounds.height : height;
    const axis = override.axisX !== undefined || override.axisY !== undefined
      ? { axisX: integer(override.axisX ?? 0, `${sourceId} axisX`, MIN_I16, MAX_I16), axisY: integer(override.axisY ?? 0, `${sourceId} axisY`, MIN_I16, MAX_I16) }
      : proposedAxis(axisWidth, axisHeight, override.anchor || configuration.anchor || 'center', override.offsetX ?? configuration.offsetX ?? 0, override.offsetY ?? configuration.offsetY ?? 0);
    const duplicatePolicy = String(override.duplicatePolicy || configuration.duplicatePolicy || 'preserve-separate');
    if (!DUPLICATE_POLICIES.has(duplicatePolicy)) throw new Error(`${sourceId} has an unsupported identical-sprite policy ${duplicatePolicy}.`);
    const paletteText = override.paletteId == null ? '' : String(override.paletteId).trim(), paletteMatch = /^(\d+)\s*,\s*(\d+)$/.exec(paletteText);
    if (paletteText && !paletteMatch) throw new Error(`${sourceId} palette must use group,index.`);
    const paletteId = paletteMatch ? identity(paletteMatch[1], paletteMatch[2]) : null;
    const indexingPaletteText = override.indexingPaletteId == null ? '' : String(override.indexingPaletteId).trim(), indexingPaletteMatch = /^(\d+)\s*,\s*(\d+)$/.exec(indexingPaletteText);
    if (indexingPaletteText && !indexingPaletteMatch) throw new Error(`${sourceId} indexing palette must use group,index.`);
    const indexingPaletteId = indexingPaletteMatch ? identity(indexingPaletteMatch[1], indexingPaletteMatch[2]) : null;
    const row = {
      sourceId, source, detection, group, number, identity: finalIdentity, status: 'ready', resolution,
      ...axis, cropMode, cropBounds: cropBounds || null, axisBasis: cropBounds ? { width: axisWidth, height: axisHeight, stage: 'after-reviewed-source-crop' } : { width, height, stage: 'source-image' },
      axisEvidence: override.axisEvidence || null,
      paletteChoice: override.paletteChoice || configuration.paletteChoice || null, paletteId, indexingPaletteId,
      duplicatePolicy
    };
    const previous = rows.findIndex((item) => item.identity === finalIdentity && item.status === 'ready');
    if (resolution === 'replace-staged' && previous >= 0) rows.splice(previous, 1, row);
    else rows.push(row);
    planned.add(finalIdentity);
  }

  return {
    rows,
    conflicts,
    skipped,
    ready: rows.filter((row) => row.status === 'ready'),
    summary: { sources: sources.length, ready: rows.filter((row) => row.status === 'ready').length, blocked: conflicts.length, skipped: skipped.length }
  };
}

module.exports = { ANCHORS, CROP_MODES, COLLISION_POLICIES, DUPLICATE_POLICIES, NUMBERING_MODES, detectFilenameIdentity, identity, nextFree, normalizeReservedRanges, planSpriteIntake, proposedAxis, reservedAt };
