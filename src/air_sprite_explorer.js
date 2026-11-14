'use strict';

const { actionSourceRanges } = require('./air_preview_model');
const crypto = require('node:crypto');

const MAX_PUBLIC_SPRITES = 4096;
const MAX_SELECTED_SPRITES = 512;
function spriteSourceRevision(archive) {
  const digest = crypto.createHash('sha256');
  if (Buffer.isBuffer(archive?.buffer)) digest.update(archive.buffer);
  digest.update(JSON.stringify((archive?.sprites || []).map(sprite => [sprite.group, sprite.number, sprite.width, sprite.height, sprite.paletteIndex, sprite.colorDepth, sprite.link])));
  return digest.digest('hex');
}

function buildSpriteExplorerModel(archive, reviews = {}) {
  const source = Array.isArray(archive?.sprites) ? archive.sprites : [];
  const sprites = source.slice(0, MAX_PUBLIC_SPRITES).map((sprite, physicalIndex) => {
    const review = reviews[`${sprite.group},${sprite.number}`] || {};
    return {
      physicalIndex,
      group: Number(sprite.group),
      number: Number(sprite.number),
      width: Number(sprite.width) || 0,
      height: Number(sprite.height) || 0,
      paletteIndex: Number.isInteger(sprite.paletteIndex) ? sprite.paletteIndex : null,
      colorDepth: Number(sprite.colorDepth) || 0,
      link: Number.isInteger(sprite.link) ? sprite.link : null,
      customName: String(review.customName || ''),
      note: String(review.note || ''),
      flags: Array.isArray(review.flags) ? review.flags.map(flag => String(flag).toLowerCase()) : []
    };
  });
  const groups = [...new Set(sprites.map(sprite => sprite.group))].sort((a, b) => a - b);
  return Object.freeze({
    available: sprites.length > 0,
    reason: sprites.length ? '' : 'No connected SFF sprites are available.',
    sprites,
    groups,
    total: source.length,
    omitted: Math.max(0, source.length - sprites.length),
    sourceRevision: spriteSourceRevision(archive)
  });
}

function resolveSelectedSprites(archive, selections, sourceRevision) {
  const sprites = Array.isArray(archive?.sprites) ? archive.sprites : [];
  if (!Array.isArray(selections) || !selections.length) throw new Error('Select at least one SFF sprite.');
  if (selections.length > MAX_SELECTED_SPRITES) throw new Error(`Select no more than ${MAX_SELECTED_SPRITES} sprites at once.`);
  if (typeof sourceRevision !== 'string' || sourceRevision !== spriteSourceRevision(archive)) throw new Error('The selected SFF source revision is stale. Reopen the Sprite Explorer and select again.');
  const seen = new Set(), result = [];
  for (const selected of selections) {
    const physicalIndex = selected?.physicalIndex;
    if (!Number.isSafeInteger(physicalIndex) || physicalIndex < 0 || physicalIndex >= sprites.length || seen.has(physicalIndex)) throw new Error('The selected SFF sprite list is stale or malformed. Reopen the Sprite Explorer and select again.');
    seen.add(physicalIndex);
    const sprite = sprites[physicalIndex];
    if (selected.group !== Number(sprite.group) || selected.number !== Number(sprite.number)) throw new Error('The selected SFF sprite identity is stale. Reopen the Sprite Explorer and select again.');
    result.push({ physicalIndex, group: Number(sprite.group), index: Number(sprite.number) });
  }
  return result;
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

function frameLines(frames, time) {
  const ticks = integer(time, 'Frame time');
  if (ticks < -1) throw new Error('Frame time must be -1 (hold) or zero or greater.');
  if (!Array.isArray(frames) || !frames.length || frames.length > MAX_SELECTED_SPRITES) throw new Error('Choose between 1 and 512 SFF sprites.');
  return frames.map(frame => `${integer(frame.group, 'Sprite group')}, ${integer(frame.index, 'Sprite index')}, 0, 0, ${ticks}`);
}

function createActionFromSpritesPatch(text, options = {}) {
  const source = String(text || ''), action = integer(options.action, 'Action number');
  if (actionSourceRanges(source).some(range => range.number === action)) throw new Error(`Action ${action} already exists.`);
  const comment = String(options.comment || '').trim();
  if (/\r|\n/.test(comment)) throw new Error('Action comments must stay on one line.');
  const eol = /\r\n/.test(source) ? '\r\n' : '\n', prefix = !source ? '' : /(?:\r\n|\r|\n)$/.test(source) ? eol : eol + eol;
  const lines = [...(comment ? [`; ${comment}`] : []), `[Begin Action ${action}]`, ...frameLines(options.frames, options.time)];
  return { start: source.length, end: source.length, text: prefix + lines.join(eol), action };
}

function appendSpritesToActionPatch(text, options = {}) {
  const source = String(text || ''), action = integer(options.action, 'Action number'), matches = actionSourceRanges(source).filter(range => range.number === action);
  if (matches.length !== 1) throw new Error(matches.length ? `Action ${action} is defined more than once. Resolve duplicate IDs in AIR Source first.` : `Action ${action} could not be located.`);
  const eol = /\r\n/.test(source) ? '\r\n' : '\n', lines = frameLines(options.frames, options.time), range = matches[0];
  const prefix = range.end > range.start && !/(?:\r\n|\r|\n)$/.test(source.slice(range.start, range.end)) ? eol : '', suffix = range.end < source.length ? eol : '';
  return { start: range.end, end: range.end, text: prefix + lines.join(eol) + suffix, action };
}

module.exports = { MAX_PUBLIC_SPRITES, MAX_SELECTED_SPRITES, spriteSourceRevision, buildSpriteExplorerModel, resolveSelectedSprites, frameLines, createActionFromSpritesPatch, appendSpritesToActionPatch };
