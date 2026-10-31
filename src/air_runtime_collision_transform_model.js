'use strict';

const crypto = require('crypto');

const GROUPS = Object.freeze(['Clsn1', 'Clsn2', 'Size', 'Dummy']);
const GROUP_RANK = new Map(GROUPS.map((group, index) => [group, index]));
const MAX_BOXES = 1024;
const EPSILON = 1e-12;

function fail(message) { throw new Error(`AIR runtime collision preview: ${message}`); }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) fail(`${label} must be finite.`); return clean(number); }
function clean(value) {
  if (Object.is(value, -0) || Math.abs(value) < EPSILON) return 0;
  const nearest = Math.round(value);
  return Math.abs(value - nearest) < EPSILON ? nearest : value;
}
function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} must be a non-negative safe integer.`);
  return number;
}
function group(value, label, allowAll = false) {
  const result = String(value || '');
  if (GROUP_RANK.has(result) || (allowAll && result === 'All')) return result;
  fail(`${label} must be ${GROUPS.join(', ')}${allowAll ? ', or All' : ''}.`);
}
function pair(value, label, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (!Array.isArray(candidate) || candidate.length !== 2) fail(`${label} must contain exactly X and Y.`);
  return [finite(candidate[0], `${label} X`), finite(candidate[1], `${label} Y`)];
}
function rect(value, label) {
  if (!Array.isArray(value) || value.length !== 4) fail(`${label} must contain exactly x1, y1, x2, and y2.`);
  const numbers = value.map((entry, index) => finite(entry, `${label} value ${index + 1}`));
  return [Math.min(numbers[0], numbers[2]), Math.min(numbers[1], numbers[3]), Math.max(numbers[0], numbers[2]), Math.max(numbers[1], numbers[3])].map(clean);
}
function polygon(value) { return [[value[0], value[1]], [value[2], value[1]], [value[2], value[3]], [value[0], value[3]]]; }
function rotate(points, pivot, angle) {
  const radians = angle * Math.PI / 180, sine = Math.sin(radians), cosine = Math.cos(radians);
  return points.map(([x, y]) => {
    const translatedX = x - pivot[0], translatedY = y - pivot[1];
    return [clean(cosine * translatedX - sine * translatedY + pivot[0]), clean(sine * translatedX + cosine * translatedY + pivot[1])];
  });
}
function aabb(points) {
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  return [clean(Math.min(...xs)), clean(Math.min(...ys)), clean(Math.max(...xs)), clean(Math.max(...ys))];
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value;
}
function semanticHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }

function normalizeBoxes(value) {
  if (!Array.isArray(value)) fail('boxes must be an array.');
  if (value.length > MAX_BOXES) fail(`boxes exceed the preview limit of ${MAX_BOXES}.`);
  const boxes = value.map((item, at) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`box ${at + 1} must be an object.`);
    return { group: group(item.group, `box ${at + 1} group`), index: integer(item.index, `box ${at + 1} index`), rect: rect(item.rect, `box ${at + 1} rectangle`) };
  }).sort((left, right) => GROUP_RANK.get(left.group) - GROUP_RANK.get(right.group) || left.index - right.index);
  for (const name of GROUPS) {
    const entries = boxes.filter((box) => box.group === name);
    entries.forEach((box, index) => { if (box.index !== index) fail(`${name} effective indexes must be unique and contiguous from 0; expected ${index}, received ${box.index}.`); });
  }
  return boxes;
}

function normalizeSelection(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('selection must identify one group and index.');
  return { group: group(value.group, 'selection group'), index: integer(value.index, 'selection index') };
}

function normalizeTarget(value, selection, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must declare a target scope.`);
  const scope = String(value.scope || '').toLowerCase();
  if (scope === 'selected') {
    if (!selection) fail(`${label} selected scope requires an exact selection.`);
    if (value.group !== undefined || value.index !== undefined) fail(`${label} selected scope derives group and index from selection; do not provide a second target.`);
    return { scope, group: selection.group, index: selection.index };
  }
  if (scope === 'all') {
    if (value.index !== undefined) fail(`${label} all scope cannot include an index.`);
    return { scope, group: group(value.group, `${label} group`, true), index: null };
  }
  fail(`${label} scope must be selected or all.`);
}

function scaleWarnings(scale, label) {
  const warnings = [];
  if (scale[0] === 0) warnings.push(`${label} X scale is zero; targeted geometry collapses horizontally.`);
  else if (scale[0] < 0) warnings.push(`${label} X scale is negative; targeted geometry is mirrored before normalization.`);
  if (scale[1] === 0) warnings.push(`${label} Y scale is zero; targeted geometry collapses vertically.`);
  else if (scale[1] < 0) warnings.push(`${label} Y scale is negative; targeted geometry is mirrored before normalization.`);
  return warnings;
}

function targeted(box, target) { return target.group === 'All' || box.group === target.group ? target.scope === 'all' || box.index === target.index : false; }

function createRuntimeCollisionTransformPreview(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be an object.');
  const normalizedBoxes = normalizeBoxes(input.boxes || []), selection = normalizeSelection(input.selection);
  if (selection && !normalizedBoxes.some((box) => box.group === selection.group && box.index === selection.index)) fail(`selection ${selection.group}[${selection.index}] is not present in the supplied effective boxes.`);

  const scaleKnown = input.collisionScale !== undefined, collisionScale = pair(input.collisionScale, 'character collision scale', [1, 1]);
  const warnings = scaleKnown ? scaleWarnings(collisionScale, 'Character collision') : [];
  const original = normalizedBoxes.map((box) => {
    const scaled = box.group === 'Clsn1' || box.group === 'Clsn2'
      ? [box.rect[0] * collisionScale[0], box.rect[1] * collisionScale[1], box.rect[2] * collisionScale[0], box.rect[3] * collisionScale[1]]
      : [...box.rect];
    const originalRect = rect(scaled, `${box.group}[${box.index}] scaled rectangle`);
    return { group: box.group, index: box.index, sourceIndex: box.index, airRect: [...box.rect], originalRect, originalPolygon: polygon(originalRect), runtimeRect: [...originalRect], overrideApplied: false };
  });

  let override = null, working = original, removed = [];
  if (input.override !== undefined && input.override !== null) {
    if (!input.override || typeof input.override !== 'object' || Array.isArray(input.override)) fail('OverrideClsn preview must be an object.');
    if (input.override.reviewed !== true) fail('OverrideClsn preview requires reviewed: true.');
    const target = normalizeTarget(input.override.target, selection, 'OverrideClsn target'), overrideRect = rect(input.override.rect, 'OverrideClsn rectangle');
    override = { reviewed: true, target, rect: overrideRect };
    const deletes = overrideRect.every((value) => value === 0);
    if (deletes) {
      removed = working.filter((box) => targeted(box, target)).map((box) => ({ ...box, removedByOverride: true }));
      working = working.filter((box) => !targeted(box, target));
    } else {
      working = working.map((box) => targeted(box, target) ? { ...box, runtimeRect: [...overrideRect], overrideApplied: true } : box);
    }
    for (const name of GROUPS) {
      let index = 0;
      working = working.map((box) => box.group === name ? { ...box, index: index++ } : box);
    }
  }

  const transformInput = input.transform || {}, transformTarget = normalizeTarget(transformInput.target, selection, 'TransformClsn target');
  const transformScale = pair(transformInput.scale, 'TransformClsn scale', [1, 1]), angle = finite(transformInput.angle === undefined ? 0 : transformInput.angle, 'TransformClsn angle'), pivot = pair(transformInput.pivot, 'TransformClsn pivot', [0, 0]);
  warnings.push(...scaleWarnings(transformScale, 'TransformClsn'));
  const transform = { target: transformTarget, scale: transformScale, angle, pivot };

  let transformedCount = 0;
  const boxes = working.map((box) => {
    const applies = targeted(box, transformTarget);
    let transformedRect = [...box.runtimeRect], transformedAngle = 0, transformedPivot = [0, 0];
    if (applies) {
      transformedRect = rect([box.runtimeRect[0] * transformScale[0], box.runtimeRect[1] * transformScale[1], box.runtimeRect[2] * transformScale[0], box.runtimeRect[3] * transformScale[1]], `${box.group}[${box.index}] transformed rectangle`);
      transformedAngle = angle; transformedPivot = [...pivot]; transformedCount += 1;
    }
    const transformedPolygon = rotate(polygon(transformedRect), transformedPivot, transformedAngle);
    return { ...box, transformed: applies, transformedRect, angle: transformedAngle, pivot: transformedPivot, transformedPolygon, aabb: aabb(transformedPolygon) };
  });
  if (transformedCount === 0) warnings.push('TransformClsn target resolves to no box after OverrideClsn; the runtime transform has no visible effect in this preview.');

  const context = scaleKnown
    ? { exact: true, space: 'character-local', label: 'Exact known character collision-scale preview', collisionScale }
    : { exact: false, space: 'air-local', label: 'AIR-local preview; character collision scale is not supplied', collisionScale };
  const semantic = { schema: 'ikemaker.air-runtime-collision-transform-preview', version: 1, context, selection, override, transform, boxes, removed, warnings, transformedCount };
  return deepFreeze({ ...semantic, previewHash: semanticHash(semantic) });
}

module.exports = { GROUPS, MAX_BOXES, createRuntimeCollisionTransformPreview };
