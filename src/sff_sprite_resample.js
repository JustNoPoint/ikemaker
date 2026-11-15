'use strict';

const roundAway = value => value < 0 ? -Math.round(-value) : Math.round(value);
const byte = value => Math.max(0, Math.min(255, roundAway(value)));
const validSize = (width, height) => Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 1000000;

function weightedPixel(plane, taps, scratch = null) {
  if (plane.channels === 1) {
    const weights = scratch || new Float64Array(256);
    weights.fill(0);
    for (const [x, y, weight] of taps) if (x >= 0 && y >= 0 && x < plane.width && y < plane.height && weight > 0) weights[plane.pixels[y * plane.width + x]] += weight;
    let best = 0;
    for (let index = 1; index < 256; index++) if (weights[index] > weights[best] || best === 0 && weights[index] > 0 && weights[index] === weights[0]) best = index;
    return [best];
  }
  let total = 0, alpha = 0;
  const rgb = [0, 0, 0];
  for (const [x, y, weight] of taps) {
    if (x < 0 || y < 0 || x >= plane.width || y >= plane.height || weight <= 0) continue;
    const at = (y * plane.width + x) * 4, coverage = plane.pixels[at + 3] / 255;
    total += weight; alpha += coverage * weight;
    for (let channel = 0; channel < 3; channel++) rgb[channel] += plane.pixels[at + channel] * coverage * weight;
  }
  if (!total) return [0, 0, 0, plane.colorDepth === 24 ? 255 : 0];
  return [...rgb.map(value => byte(value / total)), plane.colorDepth === 24 ? 255 : byte(alpha / total * 255)];
}

function nearestPixel(plane, x, y) {
  if (x < 0 || y < 0 || x >= plane.width || y >= plane.height) return plane.channels === 1 ? [0] : [0, 0, 0, plane.colorDepth === 24 ? 255 : 0];
  return plane.pixels.subarray((y * plane.width + x) * plane.channels, (y * plane.width + x + 1) * plane.channels);
}

function bilinearTaps(x, y, fixedPoint = false) {
  const left = Math.floor(x), top = Math.floor(y), taps = [];
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (1 - Math.abs(left + dx - x)) * (1 - Math.abs(top + dy - y));
    taps.push([left + dx, top + dy, fixedPoint ? Math.trunc(weight * 1024) : weight]);
  }
  return taps;
}

function scalePlane(plane, sprite, width, height, interpolation = 'nearest') {
  if (!validSize(width, height)) throw new Error('Scaled output must be 1–8192 per dimension and at most one million pixels.');
  if (!['nearest', 'area', 'bilinear'].includes(interpolation)) throw new Error('Choose nearest, area or bilinear interpolation.');
  if (interpolation === 'bilinear' && plane.channels === 1) throw new Error('Bilinear blending requires truecolor pixels. Indexed area sampling preserves existing indexes.');
  const pixels = Buffer.alloc(width * height * plane.channels), scratch = plane.channels === 1 ? new Float64Array(256) : null;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value;
    if (interpolation === 'nearest') {
      value = nearestPixel(plane, Math.min(plane.width - 1, Math.floor((x + .5) * plane.width / width)), Math.min(plane.height - 1, Math.floor((y + .5) * plane.height / height)));
    } else if (interpolation === 'bilinear') {
      const px = Math.max(0, Math.min(plane.width - 1, (x + .5) * plane.width / width - .5));
      const py = Math.max(0, Math.min(plane.height - 1, (y + .5) * plane.height / height - .5));
      value = weightedPixel(plane, bilinearTaps(px, py), scratch);
    } else {
      const left = x * plane.width / width, right = (x + 1) * plane.width / width;
      const top = y * plane.height / height, bottom = (y + 1) * plane.height / height;
      function* taps() {
        for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) yield [sx, sy, (Math.min(right, sx + 1) - Math.max(left, sx)) * (Math.min(bottom, sy + 1) - Math.max(top, sy))];
      }
      value = weightedPixel(plane, taps(), scratch);
    }
    pixels.set(value, (y * width + x) * plane.channels);
  }
  return { ...plane, width, height, pixels, axisX: roundAway(sprite.axisX * width / plane.width), axisY: roundAway(sprite.axisY * height / plane.height) };
}

function rotationFit(width, height, degrees) {
  const radians = degrees * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]].map(([x, y]) => [x * cosine - y * sine, x * sine + y * cosine]);
  const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
  return { width: roundAway(Math.max(...xs) - Math.min(...xs)) + 1, height: roundAway(Math.max(...ys) - Math.min(...ys)) + 1, offsetX: roundAway(-Math.min(...xs)), offsetY: roundAway(-Math.min(...ys)) };
}

function rotatePlane(plane, sprite, operation, options = {}) {
  const pivot = options.pivot || 'sprite', interpolation = options.interpolation || 'area';
  if (!['sprite', 'axis', 'top-left'].includes(pivot)) throw new Error('Choose Sprite, Axis or Top-left pivot.');
  if (!['nearest', 'area', 'bilinear'].includes(interpolation)) throw new Error('Choose a supported rotation sampler.');
  let degrees = { 'rotate-cw': 90, 'rotate-ccw': 270, 'rotate-180': 180 }[operation] ?? Number(options.degrees);
  if (operation.startsWith('flip-')) degrees = 0;
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 36000) throw new Error('Rotation must be a finite degree value from -36000 through 36000.');
  degrees = ((degrees % 360) + 360) % 360;
  const quarter = Math.abs(degrees / 90 - Math.round(degrees / 90)) < 1e-9;
  const exact = operation.startsWith('flip-') || quarter && options.fit !== false;
  let width, height, axisX = sprite.axisX, axisY = sprite.axisY, pixels;
  if (exact) {
    const q = Math.round(degrees / 90) % 4;
    width = q % 2 ? plane.height : plane.width; height = q % 2 ? plane.width : plane.height;
    const destination = (x, y) => operation === 'flip-x' ? [plane.width - 1 - x, y] : operation === 'flip-y' ? [x, plane.height - 1 - y] : q === 1 ? [plane.height - 1 - y, x] : q === 2 ? [plane.width - 1 - x, plane.height - 1 - y] : q === 3 ? [y, plane.width - 1 - x] : [x, y];
    pixels = Buffer.alloc(width * height * plane.channels);
    for (let y = 0; y < plane.height; y++) for (let x = 0; x < plane.width; x++) {
      const [dx, dy] = destination(x, y), at = (y * plane.width + x) * plane.channels;
      pixels.set(plane.pixels.subarray(at, at + plane.channels), (dy * width + dx) * plane.channels);
    }
    if (pivot === 'axis') [axisX, axisY] = destination(sprite.axisX, sprite.axisY);
    else if (pivot === 'sprite') { axisX += Math.trunc((width - plane.width) / 2); axisY += Math.trunc((height - plane.height) / 2); }
  } else {
    if (interpolation === 'bilinear' && plane.channels === 1) throw new Error('Bilinear rotation requires truecolor. Use nearest or area to retain indexed colors.');
    const place = options.fit === false ? { width: Number(options.width), height: Number(options.height), offsetX: Number(options.offsetX), offsetY: Number(options.offsetY) } : rotationFit(plane.width, plane.height, degrees);
    width = place.width; height = place.height;
    if (!validSize(width, height) || !Number.isInteger(place.offsetX) || !Number.isInteger(place.offsetY)) throw new Error('Rotation canvas needs valid whole dimensions and X/Y placement offsets.');
    const radians = degrees * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians), scratch = plane.channels === 1 ? new Float64Array(256) : null;
    const destination = (x, y) => [x * cosine - y * sine + place.offsetX, x * sine + y * cosine + place.offsetY];
    if (pivot === 'axis') [axisX, axisY] = destination(sprite.axisX, sprite.axisY).map(roundAway);
    else if (pivot === 'sprite') {
      const centerX = (plane.width - 1) / 2, centerY = (plane.height - 1) / 2, moved = destination(centerX, centerY);
      axisX = roundAway(moved[0] - centerX + sprite.axisX); axisY = roundAway(moved[1] - centerY + sprite.axisY);
    }
    pixels = Buffer.alloc(width * height * plane.channels);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const qx = x - place.offsetX, qy = y - place.offsetY, px = qx * cosine + qy * sine, py = -qx * sine + qy * cosine;
      const value = interpolation === 'nearest' ? nearestPixel(plane, Math.floor(px + .5), Math.floor(py + .5)) : weightedPixel(plane, bilinearTaps(px, py, plane.channels === 1 && interpolation === 'area'), scratch);
      pixels.set(value, (y * width + x) * plane.channels);
    }
  }
  return { ...plane, width, height, pixels, axisX, axisY };
}

module.exports = { roundAway, scalePlane, rotatePlane, rotationFit, weightedPixel };
