'use strict';
const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');
const MAX_DEPTH = 4;
function fingerprint(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').toUpperCase(); }
function depth(value) { const number = Number(value); if (!Number.isInteger(number) || number < 0 || number > MAX_DEPTH) throw new Error(`Onion-skin depth must be from 0 to ${MAX_DEPTH}.`); return number; }
function layer(frame, frameIndex, current, direction, distance, maximum) { return Object.freeze({ direction, distance, frameIndex, element: frameIndex + 1, relative: frameIndex - current, opacity: Math.max(0.08, Math.round((0.34 / distance) * 100) / 100), group: frame.group, index: frame.index, x: frame.x, y: frame.y, flags: frame.flags, blend: frame.blend, scaleX: frame.scaleX, scaleY: frame.scaleY, angle: frame.angle, rawTime: frame.rawTime, line: frame.line, farthest: distance === maximum }); }
function snapshot(text, request = {}) {
  const source = String(text || ''), matches = parseAir(source).filter((item) => item.number === Number(request.action));
  if (matches.length !== 1) throw new Error(matches.length ? `Action ${request.action} is defined more than once.` : `Action ${request.action} could not be located.`);
  const action = matches[0], current = Number(request.frameIndex); if (!Number.isInteger(current) || current < 0 || current >= action.frames.length) throw new Error('The current AIR element could not be located for onion skinning.');
  const before = depth(request.before ?? request.depth ?? 1), after = depth(request.after ?? request.depth ?? 1), layers = [];
  for (let distance = before; distance >= 1; distance -= 1) { const index = current - distance; if (index >= 0) layers.push(layer(action.frames[index], index, current, 'previous', distance, before)); }
  for (let distance = 1; distance <= after; distance += 1) { const index = current + distance; if (index < action.frames.length) layers.push(layer(action.frames[index], index, current, 'next', distance, after)); }
  return Object.freeze({ schemaVersion: 1, sourceFingerprint: fingerprint(source), action: action.number, frameIndex: current, before, after, layers: Object.freeze(layers) });
}
module.exports = { MAX_DEPTH, fingerprint, snapshot };
