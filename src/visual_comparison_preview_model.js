'use strict';

const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_AREA = 16_777_216;
const MAX_ONION_LAYERS_PER_SIDE = 512;
const ASPECTS = new Set(['file', '4:3', '16:9', '21:9']);
const SLOTS = new Set(['A', 'B']);
const ONION_MODES = new Set(['off', 'previous', 'next', 'both']);

function plain(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function bounded(value, maximum, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > maximum || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function positiveInteger(value, maximum = MAX_CANVAS_DIMENSION) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function screenpackCaptureDescriptor(value) {
  if (!plain(value) || !SLOTS.has(value.slot) || !ASPECTS.has(value.aspect)) throw new Error('The Screenpack comparison capture is invalid.');
  const sourceHash = bounded(value.sourceHash, 128);
  const screenIdentity = bounded(value.screenIdentity, 512);
  const screenLabel = bounded(value.screenLabel, 256);
  const profileIdentity = bounded(value.profileIdentity, 128);
  const profileLabel = bounded(value.profileLabel, 128);
  const width = Number(value.width), height = Number(value.height);
  if (!sourceHash || !screenIdentity || !screenLabel || !profileIdentity || !profileLabel ||
      !positiveInteger(width) || !positiveInteger(height) || width * height > MAX_CANVAS_AREA) {
    throw new Error('The Screenpack comparison capture exceeds its safe bounds.');
  }
  return Object.freeze({
    slot: value.slot,
    sourceHash,
    screenIdentity,
    screenLabel,
    profileIdentity,
    profileLabel,
    aspect: value.aspect,
    width,
    height,
    guides: value.guides === true,
    visibleLayers: Object.freeze(Array.isArray(value.visibleLayers)
      ? [...new Set(value.visibleLayers.filter(layer => Number.isSafeInteger(layer) && layer >= -128 && layer <= 128))].slice(0, 64)
      : []),
    hasPreviewOverrides: value.hasPreviewOverrides === true
  });
}

function screenpackCapturesCompatible(left, right) {
  try {
    const a = screenpackCaptureDescriptor(left), b = screenpackCaptureDescriptor(right);
    return a.slot !== b.slot && a.sourceHash === b.sourceHash && a.screenIdentity === b.screenIdentity &&
      a.width === b.width && a.height === b.height;
  } catch (_) {
    return false;
  }
}

function onionPreferences(value = {}) {
  const mode = ONION_MODES.has(value.mode) ? value.mode : 'off';
  const raw = Number(value.opacity);
  const opacity = Number.isFinite(raw) ? Math.max(0.05, Math.min(0.75, raw)) : 0.25;
  return Object.freeze({ mode, opacity });
}

function safeLayer(layer, index) {
  if (!plain(layer)) return null;
  const label = bounded(String(layer.label ?? layer.name ?? `Layer ${index + 1}`), 256);
  const x = Number(layer.x ?? layer.offset?.[0] ?? 0), y = Number(layer.y ?? layer.offset?.[1] ?? 0);
  if (!label || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) return null;
  return Object.freeze({ index, label, x, y });
}

function adjacentSceneOnionPlan(scenes, selectedIndex, modeValue = 'off', opacityValue = 0.25) {
  const preferences = onionPreferences({ mode: modeValue, opacity: opacityValue });
  if (!Array.isArray(scenes) || !Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= scenes.length || scenes.length > 4096) {
    return Object.freeze({ ...preferences, previous: null, next: null, truncated: false });
  }
  const makeSide = (direction, index) => {
    const scene = scenes[index];
    if (!plain(scene) || !Array.isArray(scene.layers)) return null;
    const number = Number(scene.number);
    if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) return null;
    const layers = scene.layers.slice(0, MAX_ONION_LAYERS_PER_SIDE).map(safeLayer).filter(Boolean);
    return Object.freeze({ direction, sceneIndex: index, sceneNumber: number, layers: Object.freeze(layers), truncated: scene.layers.length > MAX_ONION_LAYERS_PER_SIDE });
  };
  const previous = (preferences.mode === 'previous' || preferences.mode === 'both') && selectedIndex > 0 ? makeSide('previous', selectedIndex - 1) : null;
  const next = (preferences.mode === 'next' || preferences.mode === 'both') && selectedIndex + 1 < scenes.length ? makeSide('next', selectedIndex + 1) : null;
  return Object.freeze({ ...preferences, previous, next, truncated: Boolean(previous?.truncated || next?.truncated) });
}

function clientScript() {
  return `(()=>{const MAX_CANVAS_DIMENSION=${MAX_CANVAS_DIMENSION},MAX_CANVAS_AREA=${MAX_CANVAS_AREA},MAX_ONION_LAYERS_PER_SIDE=${MAX_ONION_LAYERS_PER_SIDE},ASPECTS=new Set(${JSON.stringify([...ASPECTS])}),SLOTS=new Set(${JSON.stringify([...SLOTS])}),ONION_MODES=new Set(${JSON.stringify([...ONION_MODES])});${plain.toString()}${bounded.toString()}${positiveInteger.toString()}${screenpackCaptureDescriptor.toString()}${screenpackCapturesCompatible.toString()}${onionPreferences.toString()}${safeLayer.toString()}${adjacentSceneOnionPlan.toString()}globalThis.ikemenVisualComparisonPreview=Object.freeze({screenpackCaptureDescriptor,screenpackCapturesCompatible,onionPreferences,adjacentSceneOnionPlan});})();`;
}

module.exports = {
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_AREA,
  MAX_ONION_LAYERS_PER_SIDE,
  screenpackCaptureDescriptor,
  screenpackCapturesCompatible,
  onionPreferences,
  adjacentSceneOnionPlan,
  clientScript
};
