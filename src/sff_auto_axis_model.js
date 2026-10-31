'use strict';

const ANCHORS = new Set(['bottom-center', 'bounds-center', 'top-center', 'left-center', 'right-center']);

function analyzeMask(image) {
  const { width, height, mask } = image || {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !mask || mask.length !== width * height) throw new Error('The sprite alpha mask is invalid.');
  let left = width, top = height, right = -1, bottom = -1, count = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (mask[y * width + x]) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count += 1; sumX += x; sumY += y; }
  if (!count) throw new Error('The sprite is fully transparent; no axis can be estimated.');
  const bandTop = Math.max(top, bottom - Math.max(1, Math.floor((bottom - top + 1) * 0.08)) + 1), bottomXs = [];
  for (let y = bandTop; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) if (mask[y * width + x]) bottomXs.push(x);
  bottomXs.sort((a, b) => a - b);
  return Object.freeze({ width, height, mask, count, bounds: Object.freeze({ left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 }), centroid: Object.freeze({ x: sumX / count, y: sumY / count }), footX: bottomXs[Math.floor(bottomXs.length / 2)] });
}

function anchorPoint(analysis, anchor = 'bottom-center') {
  if (!ANCHORS.has(anchor)) throw new Error(`Unknown automatic-axis anchor ${anchor}.`);
  const b = analysis.bounds;
  if (anchor === 'bottom-center') return { x: analysis.footX, y: b.bottom + 1 };
  if (anchor === 'top-center') return { x: Math.round((b.left + b.right) / 2), y: b.top };
  if (anchor === 'left-center') return { x: b.left, y: Math.round((b.top + b.bottom) / 2) };
  if (anchor === 'right-center') return { x: b.right + 1, y: Math.round((b.top + b.bottom) / 2) };
  return { x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2) };
}

function anchorSuggestion(image, anchor = 'bottom-center') {
  const analysis = analyzeMask(image), point = anchorPoint(analysis, anchor);
  return Object.freeze({ axisX: point.x, axisY: point.y, confidence: anchor === 'bottom-center' ? 0.62 : 0.55, confidenceLabel: 'review', method: `alpha-${anchor}`, evidence: { bounds: analysis.bounds, opaquePixels: analysis.count } });
}

function sampledPoints(analysis, limit = 3500) {
  const step = Math.max(1, Math.ceil(Math.sqrt(analysis.count / limit))), points = [];
  for (let y = analysis.bounds.top; y <= analysis.bounds.bottom; y += step) for (let x = analysis.bounds.left; x <= analysis.bounds.right; x += step) if (analysis.mask[y * analysis.width + x]) points.push([x, y]);
  return points;
}

function directionalOverlap(points, sourceAxis, destination, destinationAxis) {
  let hits = 0;
  for (const [x, y] of points) {
    const dx = Math.round(x - sourceAxis.x + destinationAxis.x), dy = Math.round(y - sourceAxis.y + destinationAxis.y);
    if (dx >= 0 && dy >= 0 && dx < destination.width && dy < destination.height && destination.mask[dy * destination.width + dx]) hits += 1;
  }
  return points.length ? hits / points.length : 0;
}

function scoreAlignment(target, targetPoints, axis, reference, referencePoints, referenceAxis) {
  const forward = directionalOverlap(targetPoints, axis, reference, referenceAxis), backward = directionalOverlap(referencePoints, referenceAxis, target, axis);
  return Math.sqrt(forward * backward);
}

function referenceSuggestion(targetImage, referenceImage, referenceAxis, options = {}) {
  const target = analyzeMask(targetImage), reference = analyzeMask(referenceImage), targetAnchor = anchorPoint(target, options.anchor || 'bottom-center'), referenceAnchor = anchorPoint(reference, options.anchor || 'bottom-center');
  const initial = { x: Math.round(Number(referenceAxis.axisX) + targetAnchor.x - referenceAnchor.x), y: Math.round(Number(referenceAxis.axisY) + targetAnchor.y - referenceAnchor.y) };
  const maxOffset = Math.max(0, Math.min(64, Number.isSafeInteger(Number(options.maxOffset)) ? Number(options.maxOffset) : 16));
  const targetPoints = sampledPoints(target), referencePoints = sampledPoints(reference);
  let best = { axisX: initial.x, axisY: initial.y, score: -1 }; const candidates = [];
  const test = (cx, cy) => { const score = scoreAlignment(target, targetPoints, { x: cx, y: cy }, reference, referencePoints, { x: referenceAxis.axisX, y: referenceAxis.axisY }); candidates.push({ axisX: cx, axisY: cy, score }); if (score > best.score || (score === best.score && Math.abs(cx - initial.x) + Math.abs(cy - initial.y) < Math.abs(best.axisX - initial.x) + Math.abs(best.axisY - initial.y))) best = { axisX: cx, axisY: cy, score }; };
  const coarse = maxOffset > 8 ? 2 : 1;
  for (let y = initial.y - maxOffset; y <= initial.y + maxOffset; y += coarse) for (let x = initial.x - maxOffset; x <= initial.x + maxOffset; x += coarse) test(x, y);
  if (coarse > 1) for (let y = best.axisY - 2; y <= best.axisY + 2; y += 1) for (let x = best.axisX - 2; x <= best.axisX + 2; x += 1) if (Math.abs(x - initial.x) <= maxOffset && Math.abs(y - initial.y) <= maxOffset) test(x, y);
  const alternative = candidates.filter(item => Math.abs(item.axisX - best.axisX) + Math.abs(item.axisY - best.axisY) > 2).sort((a, b) => b.score - a.score)[0], margin = Math.max(0, best.score - (alternative?.score || 0));
  const confidence = Math.max(0, Math.min(1, best.score * Math.min(1, 0.55 + margin * 2.5))), label = confidence >= 0.78 ? 'high' : confidence >= 0.5 ? 'review' : 'low';
  return Object.freeze({ axisX: best.axisX, axisY: best.axisY, confidence, confidenceLabel: label, method: 'reference-silhouette', evidence: { initial, maxOffset, bestScore: best.score, runnerUpScore: alternative?.score ?? null, runnerUpMargin: margin, referenceAxis: { axisX: referenceAxis.axisX, axisY: referenceAxis.axisY }, targetBounds: target.bounds, referenceBounds: reference.bounds } });
}

function weightedMedian(items, value) {
  const ordered = [...items].sort((a, b) => value(a) - value(b)), total = ordered.reduce((sum, item) => sum + Math.max(0.05, item.confidence), 0); let seen = 0;
  for (const item of ordered) { seen += Math.max(0.05, item.confidence); if (seen >= total / 2) return value(item); }
  return value(ordered.at(-1));
}

function consensusSuggestion(targetImage, references, options = {}) {
  if (!Array.isArray(references) || !references.length) throw new Error('Choose at least one trusted reference sprite.');
  const suggestions = references.map(reference => referenceSuggestion(targetImage, reference.image, reference, options));
  const axisX = Math.round(weightedMedian(suggestions, item => item.axisX)), axisY = Math.round(weightedMedian(suggestions, item => item.axisY));
  const requestedMaxOffset = Number(options.maxOffset), maxOffset = Number.isSafeInteger(requestedMaxOffset) ? Math.max(0, Math.min(64, requestedMaxOffset)) : 16;
  const spread = Math.max(...suggestions.map(item => Math.hypot(item.axisX - axisX, item.axisY - axisY))), agreement = Math.max(0, 1 - spread / Math.max(1, maxOffset));
  const confidence = Math.max(0, Math.min(1, suggestions.reduce((sum, item) => sum + item.confidence, 0) / suggestions.length * agreement)), label = confidence >= 0.78 ? 'high' : confidence >= 0.5 ? 'review' : 'low';
  return Object.freeze({ axisX, axisY, confidence, confidenceLabel: label, method: 'multi-reference-consensus', evidence: { references: suggestions.length, spread, suggestions } });
}

module.exports = { ANCHORS, analyzeMask, anchorPoint, anchorSuggestion, referenceSuggestion, consensusSuggestion };
