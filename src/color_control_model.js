'use strict';

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function clampByte(value) {
  return Math.round(clamp(value, 0, 255));
}

function wrapHue(value) {
  const hue = Number(value);
  if (!Number.isFinite(hue)) return 0;
  return ((hue % 360) + 360) % 360;
}

function normalizeRgba(color, defaultAlpha = 255) {
  const source = color || {};
  return {
    r: clampByte(source.r),
    g: clampByte(source.g),
    b: clampByte(source.b),
    a: clampByte(source.a === undefined ? defaultAlpha : source.a)
  };
}

function parseHex(value, defaultAlpha = 255) {
  let text = String(value == null ? '' : value).trim();
  if (text.startsWith('#')) text = text.slice(1);
  if (/^[0-9a-f]{3,4}$/i.test(text)) text = [...text].map((digit) => digit + digit).join('');
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return null;
  return {
    r: parseInt(text.slice(0, 2), 16),
    g: parseInt(text.slice(2, 4), 16),
    b: parseInt(text.slice(4, 6), 16),
    a: text.length === 8 ? parseInt(text.slice(6, 8), 16) : clampByte(defaultAlpha)
  };
}

function formatHex(color, options = {}) {
  const rgba = normalizeRgba(color);
  const alpha = options.alpha || 'auto';
  const includeAlpha = alpha === 'always' || (alpha === 'auto' && rgba.a !== 255);
  const body = [rgba.r, rgba.g, rgba.b, ...(includeAlpha ? [rgba.a] : [])]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
  return `${options.prefix === false ? '' : '#'}${options.uppercase === false ? body : body.toUpperCase()}`;
}

function rgbToHsl(color) {
  const { r, g, b } = normalizeRgba(color);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return { h: wrapHue(hue), s: saturation * 100, l: lightness * 100, a: normalizeRgba(color).a };
}

function hslToRgb(hsl, options = {}) {
  const hue = wrapHue(hsl && hsl.h);
  const saturation = clamp(hsl && hsl.s, 0, 100) / 100;
  const lightness = clamp(hsl && hsl.l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  let parts;
  if (sector < 1) parts = [chroma, secondary, 0];
  else if (sector < 2) parts = [secondary, chroma, 0];
  else if (sector < 3) parts = [0, chroma, secondary];
  else if (sector < 4) parts = [0, secondary, chroma];
  else if (sector < 5) parts = [secondary, 0, chroma];
  else parts = [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  const alpha = options.preserveAlpha && options.current
    ? normalizeRgba(options.current).a
    : clampByte(hsl && hsl.a === undefined ? 255 : hsl.a);
  return normalizeRgba({ r: (parts[0] + match) * 255, g: (parts[1] + match) * 255, b: (parts[2] + match) * 255, a: alpha });
}

function rgbToHsv(color) {
  const { r, g, b, a } = normalizeRgba(color);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return { h: wrapHue(hue), s: maximum ? (delta / maximum) * 100 : 0, v: maximum * 100, a };
}

function hsvToRgb(hsv, options = {}) {
  const hue = wrapHue(hsv && hsv.h);
  const saturation = clamp(hsv && hsv.s, 0, 100) / 100;
  const value = clamp(hsv && hsv.v, 0, 100) / 100;
  const chroma = value * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  let parts;
  if (sector < 1) parts = [chroma, secondary, 0];
  else if (sector < 2) parts = [secondary, chroma, 0];
  else if (sector < 3) parts = [0, chroma, secondary];
  else if (sector < 4) parts = [0, secondary, chroma];
  else if (sector < 5) parts = [secondary, 0, chroma];
  else parts = [chroma, 0, secondary];
  const match = value - chroma;
  const alpha = options.preserveAlpha && options.current
    ? normalizeRgba(options.current).a
    : clampByte(hsv && hsv.a === undefined ? 255 : hsv.a);
  return normalizeRgba({ r: (parts[0] + match) * 255, g: (parts[1] + match) * 255, b: (parts[2] + match) * 255, a: alpha });
}

function updateRgba(color, changes, options = {}) {
  const current = normalizeRgba(color);
  const next = Object.assign({}, current, changes || {});
  if (options.preserveAlpha !== false) next.a = current.a;
  return normalizeRgba(next);
}

function adjustmentStep(shiftKey = false) {
  return shiftKey ? 10 : 1;
}

function wheelDeltaToStep(deltaY, shiftKey = false) {
  if (!Number.isFinite(Number(deltaY)) || Number(deltaY) === 0) return 0;
  return (Number(deltaY) < 0 ? 1 : -1) * adjustmentStep(shiftKey);
}

function adjustChannel(color, channel, delta, options = {}) {
  if (!['r', 'g', 'b', 'a'].includes(channel)) throw new RangeError(`Unsupported color channel: ${channel}`);
  const current = normalizeRgba(color);
  if (channel === 'a' && options.preserveAlpha) return current;
  current[channel] = clampByte(current[channel] + Number(delta || 0));
  return current;
}

function adjustChannelFromWheel(color, channel, deltaY, options = {}) {
  return adjustChannel(color, channel, wheelDeltaToStep(deltaY, options.shiftKey), options);
}

function rgbaCss(color) {
  const value = normalizeRgba(color);
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${(value.a / 255).toFixed(3)})`;
}

function saturationValueFromPoint(x, y, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return {
    s: clamp((Number(x) / safeWidth) * 100, 0, 100),
    v: clamp((1 - (Number(y) / safeHeight)) * 100, 0, 100)
  };
}

function hueFromVerticalPoint(y, height) {
  const safeHeight = Math.max(1, Number(height) || 1);
  return wrapHue((Number(y) / safeHeight) * 360);
}

function cssChannelGradient(channel, color) {
  const value = normalizeRgba(color);
  const start = Object.assign({}, value);
  const end = Object.assign({}, value);
  if (['r', 'g', 'b', 'a'].includes(channel)) {
    start[channel] = 0;
    end[channel] = 255;
    return `linear-gradient(90deg, ${rgbaCss(start)}, ${rgbaCss(end)})`;
  }
  if (channel === 'h') return 'linear-gradient(90deg, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)';
  throw new RangeError(`Unsupported gradient channel: ${channel}`);
}

module.exports = {
  clamp,
  clampByte,
  wrapHue,
  normalizeRgba,
  parseHex,
  formatHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  updateRgba,
  adjustmentStep,
  wheelDeltaToStep,
  adjustChannel,
  adjustChannelFromWheel,
  rgbaCss,
  saturationValueFromPoint,
  hueFromVerticalPoint,
  cssChannelGradient
};
