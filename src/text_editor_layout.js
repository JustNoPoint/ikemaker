'use strict';

// In the live VS Code workbench used by IKEMaker, orientation 1 stacks these
// groups as rows. Keep this contract shared so startup and restoration cannot
// disagree about the attached text-header topology.
const ATTACHED_TEXT_LAYOUT = Object.freeze({
  orientation: 1,
  groups: Object.freeze([
    Object.freeze({ size: 0.28 }),
    Object.freeze({ size: 0.72 })
  ])
});

const MIN_HEADER_RATIO = 0.16;
const MAX_HEADER_RATIO = 0.34;
const HEADER_FIT_MARGIN = 12;

function clampHeaderRatio(value) {
  return Math.max(MIN_HEADER_RATIO, Math.min(MAX_HEADER_RATIO, Number(value) || ATTACHED_TEXT_LAYOUT.groups[0].size));
}

function attachedTextLayout(headerRatio = ATTACHED_TEXT_LAYOUT.groups[0].size) {
  const fitted = clampHeaderRatio(headerRatio);
  return {
    orientation: ATTACHED_TEXT_LAYOUT.orientation,
    groups: [{ size: fitted }, { size: 1 - fitted }]
  };
}

function attachedLayoutShape(layout) {
  if (!layout || layout.orientation !== ATTACHED_TEXT_LAYOUT.orientation || !Array.isArray(layout.groups) || layout.groups.length !== 2 || !layout.groups.every(group => !Array.isArray(group?.groups) || group.groups.length === 0)) return false;
  const sizes = layout.groups.map(group => Number(group?.size));
  return sizes.every(value => Number.isFinite(value) && value > 0 && value < 1) && sizes[0] < sizes[1] && Math.abs(sizes[0] + sizes[1] - 1) < 0.03;
}

function fittedHeaderRatio(layout, measurement) {
  if (!attachedLayoutShape(layout) || !measurement || !Number.isFinite(measurement.contentHeight) || !Number.isFinite(measurement.viewportHeight)) return null;
  const contentHeight = Number(measurement.contentHeight), viewportHeight = Number(measurement.viewportHeight), current = Number(layout.groups[0].size);
  if (contentHeight < 60 || contentHeight > 600 || viewportHeight < 80 || viewportHeight > 3000) return null;
  return clampHeaderRatio(current * (contentHeight + HEADER_FIT_MARGIN) / viewportHeight);
}

module.exports = { ATTACHED_TEXT_LAYOUT, MIN_HEADER_RATIO, MAX_HEADER_RATIO, HEADER_FIT_MARGIN, clampHeaderRatio, attachedTextLayout, attachedLayoutShape, fittedHeaderRatio };
