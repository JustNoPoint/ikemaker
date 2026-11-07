'use strict';
const { actionSourceRanges } = require('./air_preview_model');
const TICK_MS_60 = 1000 / 60, MAX_FRAMES = 65535, MAX_TIMING_TICKS = 1000000;
function integer(value, label, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be a whole number from ${minimum} through ${maximum}.`);
  return value;
}
function timingInput(delaysMs, tickRate) {
  integer(tickRate, 'Tick rate', 1, 1000);
  if (!Array.isArray(delaysMs) || !delaysMs.length || delaysMs.length > MAX_FRAMES || delaysMs.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 86400000)) throw new Error('GIF timing needs a finite positive delay for every frame. Choose explicit uniform timing when delays are unavailable or zero.');
  const totalMs = delaysMs.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalMs) || Math.round(totalMs * tickRate / 1000) > MAX_TIMING_TICKS) throw new Error('GIF timing exceeds the bounded one-million-tick import limit. Choose a smaller sequence or explicit uniform timing.');
  return totalMs;
}
function cumulativeTiming(delaysMs = [], tickRate = 60) {
  timingInput(delaysMs, tickRate); let elapsedMs = 0, assignedTicks = 0;
  return delaysMs.map((delayMs, sourceIndex) => {
    elapsedMs += delayMs;
    const targetTicks = Math.round(elapsedMs * tickRate / 1000), ticks = Math.max(1, targetTicks - assignedTicks); assignedTicks += ticks;
    return { sourceIndex, delayMs, ticks };
  });
}
function resampleTiming(delaysMs = [], tickRate = 60) {
  const totalMs = timingInput(delaysMs, tickRate), outputTicks = Math.max(1, Math.round(totalMs * tickRate / 1000)), boundaries = [];
  let elapsed = 0, sourceIndex = 0; for (const delay of delaysMs) { elapsed += delay; boundaries.push(elapsed); }
  const samples = [];
  for (let tick = 0; tick < outputTicks; tick += 1) {
    const at = Math.min(Math.max(0, totalMs - Number.EPSILON), (tick + 0.5) * 1000 / tickRate);
    while (sourceIndex < boundaries.length - 1 && at >= boundaries[sourceIndex]) sourceIndex++;
    const previous = samples[samples.length - 1]; if (previous && previous.sourceIndex === sourceIndex) previous.ticks++; else samples.push({ sourceIndex, ticks: 1, delayMs: delaysMs[sourceIndex] });
  }
  return samples;
}
function timingAnalysis(delaysMs = [], tickRate = 60) {
  const sourceMs = timingInput(delaysMs, tickRate), cumulative = cumulativeTiming(delaysMs, tickRate), fasterFrames = delaysMs.filter(value => value < 1000 / tickRate).length, preservedTicks = cumulative.reduce((sum, item) => sum + item.ticks, 0), idealTicks = sourceMs * tickRate / 1000;
  return { sourceFrames: delaysMs.length, sourceMs, idealTicks, preservedTicks, fasterFrames, exact: fasterFrames === 0 && Math.abs(preservedTicks - idealTicks) < 0.001 };
}
function gifActionBlock(options = {}) {
  const action = integer(options.action, 'Action', -2147483648, 2147483647), group = integer(options.group, 'Sprite group', 0, 65535), startIndex = integer(options.startIndex ?? 0, 'First sprite index', 0, 65535), count = integer(options.frameCount, 'Frame count', 1, MAX_FRAMES), x = integer(options.x ?? 0, 'X offset', -2147483648, 2147483647), y = integer(options.y ?? 0, 'Y offset', -2147483648, 2147483647), ticks = integer(options.ticks ?? 1, 'Frame ticks', 1, 2147483647), delays = options.delaysMs;
  const spriteRefs = Array.isArray(options.spriteRefs) ? options.spriteRefs : [];
  if (spriteRefs.length && (spriteRefs.length !== count || spriteRefs.some(item => !item || !Number.isSafeInteger(item.group) || item.group < 0 || item.group > 65535 || !Number.isSafeInteger(item.index) || item.index < 0 || item.index > 65535))) throw new Error('Every GIF frame needs one reviewed SFF sprite identity from 0 through 65535.');
  if (!spriteRefs.length && startIndex + count - 1 > 65535) throw new Error('The GIF sprite range exceeds SFF index 65535.');
  if (options.useGifTiming && (!Array.isArray(delays) || delays.length !== count)) throw new Error('GIF timing needs exactly one positive delay per sprite frame. Choose explicit uniform timing instead.');
  const plan = options.useGifTiming ? (options.resampleTo60 ? resampleTiming(delays) : cumulativeTiming(delays)) : Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex, ticks, delayMs: 0 }));
  const sourceName = String(options.sourceName || 'source.gif'); if (/[\r\n]/.test(sourceName) || sourceName.length > 1024) throw new Error('GIF source name must stay on one bounded comment line.');
  const loopMode = options.loopMode ?? 'loop'; if (!['loop', 'hold-last'].includes(loopMode)) throw new Error('Choose explicit AIR looping or last-frame hold.');
  const lines = [`[Begin Action ${action}]`, `; Imported intentionally from GIF: ${sourceName}`, options.useGifTiming && options.resampleTo60 ? '; GIF timing resampled to 60 Hz; source frames not sampled at a game tick were omitted.' : options.useGifTiming ? '; GIF timing cumulatively quantized to 60 Hz; every source frame was retained.' : '; GIF timing ignored; uniform AIR timing was chosen.', '; Review sprite identities, offsets, collisions, and timing before saving.'];
  for (const item of plan) { const sprite = spriteRefs[item.sourceIndex] || { group, index: startIndex + item.sourceIndex }; lines.push(`${sprite.group},${sprite.index},${x},${y},${item.ticks}${options.useGifTiming ? ` ; GIF reference ${item.delayMs} ms` : ''}`); }
  lines.splice(1, 0, loopMode === 'hold-last' ? '; AIR playback: play once, then hold the final frame.' : '; AIR playback: loop; GIF repeat counts are not reproduced.');
  if (loopMode === 'hold-last') lines[lines.length - 1] = lines[lines.length - 1].replace(/^(\d+,\d+,-?\d+,-?\d+,)\d+/, '$1-1');
  return lines.join('\r\n');
}
function ownedAction(text, actionNumber) {
  integer(actionNumber, 'Action', -2147483648, 2147483647);
  const source = String(text || ''), ranges = actionSourceRanges(source.replace(/^\uFEFF/, ' ')).filter(range => range.number === actionNumber);
  if (ranges.length > 1) throw new Error(`Action ${actionNumber} is defined more than once. Resolve duplicate IDs in AIR Source first.`);
  if (!ranges.length) return null;
  const range = ranges[0], start = range.start === 0 && source.startsWith('\uFEFF') ? 1 : range.start;
  let offset = start, end = start;
  for (const line of source.slice(start, range.end).match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []) { offset += line.length; if (line.trim() && !line.trim().startsWith(';')) end = offset; }
  return { ...range, start, end, text: source.slice(start, end) };
}
function actionRange(text, actionNumber) {
  const source = String(text || ''), range = ownedAction(source, actionNumber); if (!range) return null;
  return { start: range.lineIndex, end: source.slice(0, range.end).split(/\r?\n/).length - (/[\r\n]$/.test(source.slice(0, range.end)) ? 1 : 0) };
}
function gifReplacementInfo(text, actionNumber) {
  const source = String(text || ''), range = ownedAction(source, actionNumber); if (!range) return null;
  let start = range.start;
  const prefix = source.slice(0, start), legacy = /(?:^|\r?\n)(; Imported intentionally from GIF: [^\r\n]*\r?\n; GIF timing (?:ignored; uniform AIR timing was chosen\.|cumulatively quantized to 60 Hz; every source frame was retained\.|resampled to 60 Hz; source frames not sampled at a game tick were omitted\.)\r?\n; Review sprite identities, offsets, collisions, and timing before saving\.\r?\n)$/;
  const match = legacy.exec(prefix); if (match) start -= match[1].length;
  const before = source.slice(start, range.end), plainFrame = /^[+-]?\d+\s*,\s*[+-]?\d+\s*,\s*[+-]?\d+\s*,\s*[+-]?\d+\s*,\s*[+-]?\d+$/;
  // The generated replacement owns only plain frame data. Anything else can
  // encode authored behavior, including future directives and optional fields.
  const authoredData = range.text.split(/\r\n|\r|\n/).some((line, index) => {
    const content = line.split(';', 1)[0].trim();
    if (!content || index === 0 && /^\[\s*Begin\s+Action\s+[+-]?\d+\s*\]$/i.test(content)) return false;
    return !plainFrame.test(content);
  });
  return { start, end: range.end, before, authoredData };
}
function upsertGifAction(text, actionNumber, block, replace = false, options = {}) {
  const source = String(text || ''), eol = /\r\n/.test(source) ? '\r\n' : '\n', range = gifReplacementInfo(source, actionNumber), generated = String(block), blockRanges = actionSourceRanges(generated);
  if (blockRanges.length !== 1 || blockRanges[0].number !== actionNumber) throw new Error('The generated GIF action does not match the reviewed destination action.');
  if (range && !replace) throw new Error(`Action ${actionNumber} already exists.`);
  if (range?.authoredData && options.replaceAuthoredData !== true) throw new Error('This action contains authored AIR directives or extended frame fields. Preserve them, or explicitly review replacing that data before applying the GIF action.');
  const normalized = generated.replace(/\r?\n/g, eol);
  if (!range) return source + (source ? /\r?\n$/.test(source) ? eol : eol + eol : '') + normalized + eol;
  return source.slice(0, range.start) + normalized + (/\r?\n$/.test(range.before) ? eol : '') + source.slice(range.end);
}
module.exports = { TICK_MS_60, MAX_FRAMES, MAX_TIMING_TICKS, cumulativeTiming, resampleTiming, timingAnalysis, gifActionBlock, actionRange, gifReplacementInfo, upsertGifAction };
