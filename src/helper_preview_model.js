'use strict';

const { spriteDataUri } = require('./sff_reader');

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function key(group, index) { return `${Number(group)},${Number(index)}`; }

function projectilePath(plan, interval = 10) {
  const projectile = plan?.projectile || {}, lifetime = Math.max(1, Math.trunc(finite(projectile.lifetime, 180))), step = Math.max(1, Math.trunc(finite(interval, 10)));
  const start = Array.isArray(plan?.position) ? plan.position : [0, 0], velocity = Array.isArray(projectile.velocity) ? projectile.velocity : [0, 0], output = [];
  for (let tick = 0; tick <= lifetime; tick += step) output.push({ tick, x: finite(start[0]) + finite(velocity[0]) * tick, y: finite(start[1]) + finite(velocity[1]) * tick });
  if (output.at(-1)?.tick !== lifetime) output.push({ tick: lifetime, x: finite(start[0]) + finite(velocity[0]) * lifetime, y: finite(start[1]) + finite(velocity[1]) * lifetime });
  return output;
}

function projectilePreview(action, archive, plan, options = {}) {
  if (!action || !archive) return { available: false, reason: 'AIR action and SFF archive are required.', frames: [], path: projectilePath(plan) };
  const sprites = new Map(archive.sprites.map((sprite) => [key(sprite.group, sprite.number), sprite])), frames = [];
  for (const frame of action.frames || []) {
    const sprite = sprites.get(key(frame.group, frame.index));
    if (!sprite) { frames.push({ ...frame, missing: true, spriteKey: key(frame.group, frame.index) }); continue; }
    let image = '';
    try { image = options.images === false ? '' : spriteDataUri(archive, sprite, options.palette ?? null); } catch (_) {}
    frames.push({
      group: frame.group, index: frame.index, x: frame.x, y: frame.y, time: frame.time, flags: frame.flags,
      clsn1: frame.clsn1 || [], clsn2: frame.clsn2 || [], spriteKey: key(frame.group, frame.index),
      width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY, image, missing: !image && options.images !== false
    });
  }
  return { available: frames.some((frame) => !frame.missing), action: action.number, duration: frames.reduce((sum, frame) => sum + Math.max(1, frame.time), 0), frames, path: projectilePath(plan), playbackDefault: 'stopped' };
}

module.exports = { projectilePath, projectilePreview };
