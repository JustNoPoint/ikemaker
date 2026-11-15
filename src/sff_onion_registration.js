'use strict';

const { analyzeMask, referenceSuggestion } = require('./sff_auto_axis_model');
const METHODS = Object.freeze(['silhouette', 'box-center', 'bottom-center', 'center-of-mass', 'color-match']);

function registrationPoint(image, method) {
  const analysis = analyzeMask(image), bounds = analysis.bounds;
  if (method === 'center-of-mass') return analysis.centroid;
  return {
    x: (bounds.left + bounds.right) / 2,
    y: method === 'bottom-center' ? bounds.bottom + 1 : (bounds.top + bounds.bottom) / 2
  };
}

// Sampling by occupied-pixel ordinal avoids dropping thin/checkered silhouettes.
function sampleOpaquePoints(image, limit = 512) {
  const count = analyzeMask(image).count, sampleCount = Math.min(count, limit);
  const ordinals = Array.from({ length: sampleCount }, (_, index) =>
    sampleCount === 1 ? 0 : Math.round(index * (count - 1) / (sampleCount - 1)));
  const points = [];
  let ordinal = 0, next = 0;
  for (let pixel = 0; pixel < image.mask.length && next < ordinals.length; pixel++) {
    if (!image.mask[pixel]) continue;
    if (ordinal === ordinals[next]) {
      points.push([pixel % image.width, Math.floor(pixel / image.width)]);
      next++;
    }
    ordinal++;
  }
  return points;
}

function colorAlignmentScore(points, target, reference, axis, referenceAxis) {
  let score = 0;
  for (const [x, y] of points) {
    const rx = Math.round(x - axis.x + referenceAxis.axisX);
    const ry = Math.round(y - axis.y + referenceAxis.axisY);
    if (rx < 0 || ry < 0 || rx >= reference.width || ry >= reference.height ||
        !reference.mask[ry * reference.width + rx]) continue;
    const a = (y * target.width + x) * 4, b = (ry * reference.width + rx) * 4;
    const distance = Math.abs(target.rgba[a] - reference.rgba[b]) +
      Math.abs(target.rgba[a + 1] - reference.rgba[b + 1]) +
      Math.abs(target.rgba[a + 2] - reference.rgba[b + 2]);
    score += 1 - distance / 765;
  }
  return points.length ? score / points.length : 0;
}

function nearestAxis(desired, current) {
  const move = desired - current;
  const magnitude = Math.abs(move);
  const whole = Math.floor(magnitude);
  return current + Math.sign(move) * (whole + (magnitude - whole > .5 + 1e-9 ? 1 : 0));
}

function registrationSuggestion(target, reference, referenceAxis, method = 'silhouette', currentAxis = referenceAxis) {
  if (!METHODS.includes(method)) throw new Error('Choose a supported onion registration method.');
  if (method === 'silhouette') return referenceSuggestion(target, reference, referenceAxis, { maxOffset: 16 });
  const pointMethod = method === 'color-match' ? 'box-center' : method;
  const targetPoint = registrationPoint(target, pointMethod), referencePoint = registrationPoint(reference, pointMethod);
  const initial = {
    x: nearestAxis(referenceAxis.axisX + targetPoint.x - referencePoint.x, currentAxis.axisX),
    y: nearestAxis(referenceAxis.axisY + targetPoint.y - referencePoint.y, currentAxis.axisY)
  };
  if (method !== 'color-match') {
    return {
      axisX: initial.x, axisY: initial.y, confidence: .55, confidenceLabel: 'review', method,
      evidence: { initial, searchBoundary: false }
    };
  }
  if (!target.rgba || !reference.rgba) throw new Error('Color registration requires decoded color pixels.');
  const points = sampleOpaquePoints(target);
  let best = { axisX: initial.x, axisY: initial.y, score: -1 };
  for (let dy = -16; dy <= 16; dy++) {
    for (let dx = -16; dx <= 16; dx++) {
      const axisX = initial.x + dx, axisY = initial.y + dy;
      const score = colorAlignmentScore(points, target, reference, { x: axisX, y: axisY }, referenceAxis);
      const nearer = Math.abs(dx) + Math.abs(dy) < Math.abs(best.axisX - initial.x) + Math.abs(best.axisY - initial.y);
      if (score > best.score || score === best.score && nearer) best = { axisX, axisY, score };
    }
  }
  const searchBoundary = Math.abs(best.axisX - initial.x) === 16 || Math.abs(best.axisY - initial.y) === 16;
  const confidence = Math.min(searchBoundary ? .49 : 1, best.score);
  return {
    axisX: best.axisX, axisY: best.axisY, confidence,
    confidenceLabel: confidence >= .78 ? 'high' : confidence >= .5 ? 'review' : 'low', method,
    evidence: { initial, maxOffset: 16, searchBoundary, bestScore: best.score, sampledPixels: points.length }
  };
}

module.exports = { METHODS, registrationPoint, registrationSuggestion, sampleOpaquePoints };
