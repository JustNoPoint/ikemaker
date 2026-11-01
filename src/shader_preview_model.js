'use strict';

const { spriteDataUri } = require('./sff_reader');

const PREVIEW_SCHEMA = 'ikemaker.shader-preview/v1';
const MAX_PREVIEW_FRAMES = 256;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_FRAME_PIXELS = 4 * 1024 * 1024;
const MAX_PREVIEW_PIXELS = 16 * 1024 * 1024;
const PNG_DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_SIGNATURE = '89504e470d0a1a0a';
const MISSING_SPRITE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function integer(value, fallback) { const number = Number(value); return Number.isInteger(number) ? number : fallback; }
function pngInfo(value) {
  const match = PNG_DATA_URI.exec(String(value || ''));
  if (!match) throw new Error('Shader previews accept local PNG data only.');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('Shader previews require a valid PNG header.');
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), pixels = width * height;
  if (!width || !height || !Number.isSafeInteger(pixels) || pixels > MAX_FRAME_PIXELS) {
    throw new Error(`Shader preview images are limited to ${MAX_FRAME_PIXELS} pixels per frame.`);
  }
  return { bytes: bytes.length, width, height, pixels };
}
function normalizeFrame(value, index) {
  const dataUri = String(value?.dataUri || ''), image = pngInfo(dataUri);
  if (image.bytes > MAX_FRAME_BYTES) throw new Error(`Preview frame ${index + 1} exceeds the 4 MiB limit.`);
  return Object.freeze({
    id: String(value?.id || `frame-${index + 1}`), label: String(value?.label || `Frame ${index + 1}`), dataUri,
    group: integer(value?.group, 0), index: integer(value?.index, 0), x: finite(value?.x, 0), y: finite(value?.y, 0),
    scaleX: finite(value?.scaleX, 1), scaleY: finite(value?.scaleY, 1), angle: finite(value?.angle, 0),
    ticks: Math.max(1, integer(value?.ticks, 1)), hold: value?.hold === true, missing: value?.missing === true,
    bytes: image.bytes, width: image.width, height: image.height, pixels: image.pixels
  });
}
function normalizeShaderPreview(value = {}) {
  const sourceKind = value.sourceKind === 'air' ? 'air' : 'sff', sourceLabel = String(value.sourceLabel || (sourceKind === 'air' ? 'Decoded AIR animation' : 'Decoded SFF sprite'));
  const input = Array.isArray(value.frames) ? value.frames : [];
  if (input.length > MAX_PREVIEW_FRAMES) throw new Error(`Shader previews are limited to ${MAX_PREVIEW_FRAMES} frames.`);
  const frames = input.map(normalizeFrame), bytes = frames.reduce((sum, frame) => sum + frame.bytes, 0), pixels = frames.reduce((sum, frame) => sum + frame.pixels, 0);
  if (bytes > MAX_PREVIEW_BYTES) throw new Error('Shader preview frames exceed the 16 MiB session limit.');
  if (pixels > MAX_PREVIEW_PIXELS) throw new Error(`Shader preview frames exceed the ${MAX_PREVIEW_PIXELS}-pixel session limit.`);
  return Object.freeze({ schema: PREVIEW_SCHEMA, sourceKind, sourceLabel, frames: Object.freeze(frames), loopStart: Math.max(0, Math.min(frames.length ? frames.length - 1 : 0, integer(value.loopStart, 0))), bytes, pixels });
}
function previewFromSff(archive, sprite, paletteOverride = null) {
  if (!archive || !sprite) throw new Error('An SFF archive and sprite are required.');
  return normalizeShaderPreview({ sourceKind: 'sff', sourceLabel: `Decoded SFF sprite ${sprite.group},${sprite.number}`, frames: [{ id: `sff:${sprite.index}`, label: `${sprite.group},${sprite.number}`, group: sprite.group, index: sprite.number, dataUri: spriteDataUri(archive, sprite, paletteOverride) }] });
}
function previewFromAir(archive, action, paletteForGroup = null) {
  if (!archive || !action || !Array.isArray(action.frames)) throw new Error('An SFF archive and parsed AIR action are required.');
  const byKey = new Map((archive.sprites || []).map(sprite => [`${sprite.group},${sprite.number}`, sprite]));
  const frames = action.frames.map((frame, frameIndex) => {
    const sprite = byKey.get(`${frame.group},${frame.index}`);
    if (!sprite) return {
      id: `air:${action.number}:${frameIndex}`, label: `Missing sprite · ${frame.group},${frame.index}`,
      group: frame.group, index: frame.index, x: frame.x, y: frame.y,
      scaleX: 1, scaleY: 1, angle: frame.angle, ticks: frame.time, hold: frame.rawTime === -1,
      missing: true, dataUri: MISSING_SPRITE_PNG
    };
    const palette = typeof paletteForGroup === 'function' ? paletteForGroup(frame.group, frame.index, sprite) : paletteForGroup;
    return {
      id: `air:${action.number}:${frameIndex}`, label: `Element ${frameIndex + 1} · ${frame.group},${frame.index}`,
      group: frame.group, index: frame.index, x: frame.x, y: frame.y,
      scaleX: String(frame.flags || '').includes('H') ? -frame.scaleX : frame.scaleX,
      scaleY: String(frame.flags || '').includes('V') ? -frame.scaleY : frame.scaleY,
      angle: frame.angle, ticks: frame.time, hold: frame.rawTime === -1,
      dataUri: spriteDataUri(archive, sprite, palette)
    };
  });
  return normalizeShaderPreview({ sourceKind: 'air', sourceLabel: `Decoded AIR action ${action.number}`, frames, loopStart: action.loopStart });
}

module.exports = {
  PREVIEW_SCHEMA, MAX_PREVIEW_FRAMES, MAX_FRAME_BYTES, MAX_PREVIEW_BYTES, MAX_FRAME_PIXELS, MAX_PREVIEW_PIXELS,
  normalizeShaderPreview, previewFromSff, previewFromAir
};
