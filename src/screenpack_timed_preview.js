'use strict';

const { sections } = require('./def_model');

// These are the VS defaults in the bundled IKEMEN system.base.def. A local
// preview names their origin; it never writes them into the user's motif.
const VS_DEFAULTS = Object.freeze({ time: 150, fadeIn: 15, fadeOut: 15 });
const VICTORY_DEFAULTS = Object.freeze({ time: 300, fadeIn: 0, fadeOut: 15 });

function timedScreenTiming(document, sectionName, defaults) {
  const matches = sections(document, sectionName);
  if (matches.length !== 1) return { available: false, reason: matches.length ? `Duplicate [${sectionName}] sections; review the source.` : `Add a [${sectionName}] section to preview its own elements.` };
  const values = {};
  for (const [field, key, fallback] of [['time', 'time', defaults.time], ['fadeIn', 'fadein.time', defaults.fadeIn], ['fadeOut', 'fadeout.time', defaults.fadeOut]]) {
    const entries = matches[0].entries.filter(entry => entry.normalized === key);
    if (entries.length > 1) return { available: false, reason: `Duplicate ${key} values in [${sectionName}]; review the source.` };
    if (!entries.length) { values[field] = fallback; values[`${field}Source`] = 'bundled default'; continue; }
    const value = Number(entries[0].value);
    if (!Number.isInteger(value) || value < 0 || value > 36000) return { available: false, reason: `${key} is not a supported whole tick count for the local preview; review the source.` };
    values[field] = value;
    values[`${field}Source`] = 'authored';
  }
  for (const [field, key] of [['fadeInColor', 'fadein.col'], ['fadeOutColor', 'fadeout.col']]) {
    const entries = matches[0].entries.filter(entry => entry.normalized === key);
    if (entries.length > 1) return { available: false, reason: `Duplicate ${key} values in [${sectionName}]; review the source.` };
    const parts = entries.length ? entries[0].value.split(',').map(value => Number(value.trim())) : [0, 0, 0];
    if (parts.length !== 3 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return { available: false, reason: `${key} is not an RGB color supported by the local preview; review the source.` };
    values[field] = parts;
    values[`${field}Source`] = entries.length ? 'authored' : 'bundled default';
  }
  return { available: true, ...values, totalTicks: values.fadeIn + values.time + values.fadeOut };
}
function versusTiming(document) { return timedScreenTiming(document, 'VS Screen', VS_DEFAULTS); }
function victoryTiming(document) { return timedScreenTiming(document, 'Victory Screen', VICTORY_DEFAULTS); }

function actionFrameAt(action, tick) {
  const frames = action?.frames || [];
  if (!frames.length) return null;
  let remaining = Math.max(0, Math.floor(Number(tick) || 0));
  const visit = start => { for (let index = start; index < frames.length; index++) { const frame = frames[index], duration = Number(frame.rawTime ?? frame.time) || 0; if (duration < 0) return frame; if (duration === 0) continue; if (remaining < duration) return frame; remaining -= duration; } return null; };
  const first = visit(0); if (first) return first;
  const loop = Math.max(0, Math.min(frames.length - 1, Number(action.loopStart) || 0));
  const loopDuration = frames.slice(loop).reduce((sum, frame) => sum + Math.max(0, Number(frame.rawTime ?? frame.time) || 0), 0);
  if (loopDuration < 1) return frames[frames.length - 1];
  remaining %= loopDuration;
  return visit(loop) || frames[frames.length - 1];
}

function versusFrame(timing, elapsedTicks) {
  if (!timing?.available) return null;
  const elapsed = Math.max(0, Math.floor(Number(elapsedTicks) || 0));
  const fadeIn = timing.fadeIn, visibleEnd = fadeIn + timing.time, end = visibleEnd + timing.fadeOut;
  if (elapsed >= end) return { phase: 'complete', tick: timing.time, alpha: 1, complete: true };
  if (elapsed < fadeIn) return { phase: 'fade-in', tick: 0, alpha: fadeIn ? 1 - elapsed / fadeIn : 0, complete: false };
  if (elapsed < visibleEnd) return { phase: 'visible', tick: elapsed - fadeIn, alpha: 0, complete: false };
  return { phase: 'fade-out', tick: timing.time, alpha: timing.fadeOut ? (elapsed - visibleEnd) / timing.fadeOut : 1, complete: false };
}

module.exports = { VS_DEFAULTS, VICTORY_DEFAULTS, versusTiming, victoryTiming, versusFrame, actionFrameAt };
