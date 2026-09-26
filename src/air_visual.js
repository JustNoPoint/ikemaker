'use strict';

// Shared by the viewer and comparison; coordinates use the character origin.
function runtime() {
  const layers = new WeakMap();
  function parseBlend(value) {
    const text = String(value || '').trim().toUpperCase(), normal = { mode: 'none', src: 255, dst: 0 };
    if (!text) return normal;
    if (text === 'A') return { mode: 'add', src: 255, dst: 255 };
    if (text === 'A1') return { mode: 'add', src: 255, dst: 128 };
    if (text === 'S') return { mode: 'sub', src: 255, dst: 255 };
    if (text === 'SA') return { mode: 'subadd', src: 255, dst: 255 };
    const match = /^(AS|SS|SAS)(\d+)(?:D(\d+))?$/.exec(text);
    if (!match) return normal;
    return { mode: match[1] === 'AS' ? 'add' : match[1] === 'SS' ? 'sub' : 'subadd', src: Math.min(255, Number(match[2])), dst: match[3] === undefined ? (match[1] === 'AS' ? 0 : 255) : Math.min(255, Number(match[3])) };
  }
  function blendPixels(destination, source, blend) {
    let src = Math.max(0, Math.min(255, Math.floor(blend.src))), dst = Math.max(0, Math.min(255, Math.floor(blend.dst)));
    if (src + dst === 256) dst = 255 - src;
    src /= 255; dst /= 255;
    for (let i = 0; i < source.length; i += 4) {
      const alpha = source[i + 3] / 255;
      if (!alpha) continue;
      const gray = (source[i] + source[i + 1] + source[i + 2]) / 3;
      for (let channel = 0; channel < 3; channel++) {
        const background = destination[i + channel], foreground = source[i + channel] * alpha * src;
        destination[i + channel] = blend.mode === 'subadd'
          ? Math.max(0, background - gray * alpha * dst) + foreground
          : background * (1 - alpha * (1 - dst)) + (blend.mode === 'sub' ? -foreground : foreground);
      }
    }
    return destination;
  }
  function sample(action, index, elapsed) {
    const frame = action.frames[index];
    if (!frame) return null;
    const next = action.frames[index + 1 < action.frames.length ? index + 1 : Math.max(0, Math.min(action.frames.length - 1, action.loopStart || 0))];
    const progress = frame.rawTime > 0 ? Math.max(0, Math.min(1, Math.floor(Number(elapsed) || 0) / frame.rawTime)) : 0;
    const result = { ...frame }, enabled = next.interpolate || [];
    const mix = (from, to) => from + (to - from) * progress;
    if (enabled.includes('offset')) {
      for (const [field, flag] of [['x', 'H'], ['y', 'V']]) {
        const direction = frame.flags.includes(flag) ? -1 : 1, nextDirection = next.flags.includes(flag) ? -1 : 1;
        result[field] = mix(frame[field], next[field] * nextDirection * direction);
      }
    }
    if (enabled.includes('scale')) { result.scaleX = mix(frame.scaleX ?? 1, next.scaleX ?? 1); result.scaleY = mix(frame.scaleY ?? 1, next.scaleY ?? 1); }
    if (enabled.includes('angle')) result.angle = mix(frame.angle ?? 0, next.angle ?? 0);
    const blend = parseBlend(frame.blend);
    if (enabled.includes('blend') && blend.mode !== 'none') {
      const target = parseBlend(next.blend);
      result.blendState = { mode: blend.mode, src: mix(blend.src, target.src), dst: mix(blend.dst, target.dst) };
    }
    return result;
  }
  function transform(frame) {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const sx = finite(frame.scaleX ?? 1, 1) * (frame.flags.includes('H') ? -1 : 1);
    const sy = finite(frame.scaleY ?? 1, 1) * (frame.flags.includes('V') ? -1 : 1);
    const radians = -finite(frame.angle ?? 0, 0) * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    return [cos * sx, sin * sx, -sin * sy, cos * sy, finite(frame.x, 0), finite(frame.y, 0)];
  }
  function drawSprite(ctx, image, sprite, frame) {
    const blend = frame.blendState || parseBlend(frame.blend);
    if (blend.mode !== 'none') {
      const matrix = ctx.getTransform(), points = corners({ ...sprite, width: image.width, height: image.height }, frame).map(([x, y]) => [matrix.a*x + matrix.c*y + matrix.e, matrix.b*x + matrix.d*y + matrix.f]);
      const x = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))) - 1), y = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))) - 1);
      const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...points.map(p => p[0]))) + 1), bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...points.map(p => p[1]))) + 1);
      if (right <= x || bottom <= y) return;
      let layer = layers.get(ctx);
      if (!layer) { const canvas = document.createElement('canvas'); layer = canvas.getContext('2d', { willReadFrequently: true }); layers.set(ctx, layer); }
      if (layer.canvas.width !== ctx.canvas.width || layer.canvas.height !== ctx.canvas.height) { layer.canvas.width = ctx.canvas.width; layer.canvas.height = ctx.canvas.height; }
      layer.resetTransform(); layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height); layer.setTransform(matrix);
      layer.transform(...transform(frame)); layer.imageSmoothingEnabled = false; layer.drawImage(image, -sprite.axisX, -sprite.axisY);
      const destination = ctx.getImageData(x, y, right - x, bottom - y), source = layer.getImageData(x, y, right - x, bottom - y);
      blendPixels(destination.data, source.data, blend); ctx.putImageData(destination, x, y);
      return;
    }
    ctx.save();
    ctx.transform(...transform(frame));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, -sprite.axisX, -sprite.axisY);
    ctx.restore();
  }
  function corners(sprite, frame) {
    const [a, b, c, d, e, f] = transform(frame), points = [];
    for (const x of [-sprite.axisX, sprite.width - sprite.axisX]) {
      for (const y of [-sprite.axisY, sprite.height - sprite.axisY]) points.push([a * x + c * y + e, b * x + d * y + f]);
    }
    return points;
  }
  function motionCorners(sprite, action, index) {
    const frame = action.frames[index], end = sample(action, index, Math.max(0, frame.rawTime));
    const points = [...corners(sprite, frame), ...corners(sprite, end)];
    if ((frame.angle ?? 0) !== (end.angle ?? 0)) {
      const sx = Math.max(Math.abs(frame.scaleX ?? 1), Math.abs(end.scaleX ?? 1)), sy = Math.max(Math.abs(frame.scaleY ?? 1), Math.abs(end.scaleY ?? 1));
      const radius = Math.hypot(Math.max(Math.abs(sprite.axisX), Math.abs(sprite.width - sprite.axisX)) * sx, Math.max(Math.abs(sprite.axisY), Math.abs(sprite.height - sprite.axisY)) * sy);
      for (const f of [frame, end]) points.push([f.x - radius, f.y - radius], [f.x + radius, f.y + radius]);
    }
    return points;
  }
  return { parseBlend, blendPixels, sample, transform, drawSprite, corners, motionCorners };
}

module.exports = { runtime, ...runtime() };
