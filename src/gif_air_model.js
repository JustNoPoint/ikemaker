'use strict';

const TICK_MS_60 = 1000 / 60;

function cumulativeTiming(delaysMs = [], tickRate = 60) {
  let elapsedMs = 0, assignedTicks = 0;
  return delaysMs.map((raw, sourceIndex) => {
    const delayMs = Math.max(0, Number(raw) || 0); elapsedMs += delayMs;
    const targetTicks = Math.round(elapsedMs * tickRate / 1000), ticks = Math.max(1, targetTicks - assignedTicks); assignedTicks += ticks;
    return { sourceIndex, delayMs, ticks };
  });
}

function resampleTiming(delaysMs = [], tickRate = 60) {
  const safe = delaysMs.map((value) => Math.max(0, Number(value) || 0)), totalMs = safe.reduce((sum, value) => sum + value, 0), outputTicks = Math.max(1, Math.round(totalMs * tickRate / 1000));
  const boundaries = []; let elapsed = 0; for (const delay of safe) { elapsed += delay; boundaries.push(elapsed); }
  const samples = [];
  for (let tick = 0; tick < outputTicks; tick += 1) {
    const at = Math.min(Math.max(0, totalMs - Number.EPSILON), (tick + 0.5) * 1000 / tickRate); let sourceIndex = boundaries.findIndex((boundary) => at < boundary); if (sourceIndex < 0) sourceIndex = Math.max(0, safe.length - 1);
    const previous = samples[samples.length - 1]; if (previous && previous.sourceIndex === sourceIndex) previous.ticks += 1; else samples.push({ sourceIndex, ticks: 1, delayMs: safe[sourceIndex] || 0 });
  }
  return samples;
}

function timingAnalysis(delaysMs = [], tickRate = 60) {
  const safe = delaysMs.map(Number).filter((value) => value > 0), sourceMs = safe.reduce((sum, value) => sum + value, 0), fasterFrames = safe.filter((value) => value < 1000 / tickRate).length;
  const cumulative = cumulativeTiming(safe, tickRate), preservedTicks = cumulative.reduce((sum, item) => sum + item.ticks, 0), idealTicks = sourceMs * tickRate / 1000;
  return { sourceFrames: safe.length, sourceMs, idealTicks, preservedTicks, fasterFrames, exact: fasterFrames === 0 && Math.abs(preservedTicks - idealTicks) < 0.001 };
}

function gifActionBlock(options = {}) {
  const action = Number(options.action), group = Number(options.group), startIndex = Number(options.startIndex || 0), count = Number(options.frameCount), x = Number(options.x || 0), y = Number(options.y || 0), ticks = Number(options.ticks || 1), delays = Array.isArray(options.delaysMs) ? options.delaysMs : [];
  if (![action, group, startIndex, count, x, y, ticks].every(Number.isFinite) || !Number.isInteger(count) || count < 1) throw new Error('Action, sprite range, offsets, timing, and frame count must be valid numbers.');
  const plan = options.useGifTiming ? (options.resampleTo60 ? resampleTiming(delays.slice(0, count)) : cumulativeTiming(delays.slice(0, count))) : Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex, ticks: Math.max(1, Math.round(ticks)), delayMs: 0 }));
  const lines = [`; Imported intentionally from GIF: ${options.sourceName || 'source.gif'}`, options.resampleTo60 ? '; GIF timing resampled to 60 Hz; source frames not sampled at a game tick were omitted.' : options.useGifTiming ? '; GIF timing cumulatively quantized to 60 Hz; every source frame was retained.' : '; GIF timing ignored; uniform AIR timing was chosen.', '; Review sprite identities, offsets, collisions, and timing before saving.', `[Begin Action ${action}]`];
  for (const item of plan) {
    lines.push(`${group},${startIndex + item.sourceIndex},${x},${y},${item.ticks}${options.useGifTiming ? ` ; GIF reference ${item.delayMs} ms` : ''}`);
  }
  return lines.join('\r\n');
}

function actionRange(text, actionNumber) {
  const lines = String(text || '').split(/\r?\n/), header = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i;
  let start = -1, end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const match = header.exec(lines[index].replace(/;.*/, '').trim());
    if (!match) continue;
    if (start >= 0) { end = index; break; }
    if (Number(match[1]) === Number(actionNumber)) start = index;
  }
  return start < 0 ? null : { start, end };
}

function upsertGifAction(text, actionNumber, block, replace = false) {
  const source = String(text || ''), eol = /\r\n/.test(source) ? '\r\n' : '\n', range = actionRange(source, actionNumber);
  if (range && !replace) throw new Error(`Action ${actionNumber} already exists.`);
  if (!range) return `${source.replace(/\s*$/, '')}${source.trim() ? `${eol}${eol}` : ''}${String(block).replace(/\r?\n/g, eol)}${eol}`;
  const lines = source.split(/\r?\n/); lines.splice(range.start, range.end - range.start, ...String(block).split(/\r?\n/), ''); return lines.join(eol);
}

module.exports = { TICK_MS_60, cumulativeTiming, resampleTiming, timingAnalysis, gifActionBlock, actionRange, upsertGifAction };
