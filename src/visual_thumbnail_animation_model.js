'use strict';

const DEFAULT_LIMITS = Object.freeze({ actions: 256, framesPerAction: 120, totalFrames: 2000, minimumDurationMs: 50, maximumDurationMs: 2000 });

function boundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function limits(options = {}) {
  const value = (name, fallback, maximum) => boundedInteger(options[name], 1, maximum) ? options[name] : fallback;
  return Object.freeze({
    actions: value('actions', DEFAULT_LIMITS.actions, 512),
    framesPerAction: value('framesPerAction', DEFAULT_LIMITS.framesPerAction, 512),
    totalFrames: value('totalFrames', DEFAULT_LIMITS.totalFrames, 4096),
    minimumDurationMs: value('minimumDurationMs', DEFAULT_LIMITS.minimumDurationMs, 1000),
    maximumDurationMs: value('maximumDurationMs', DEFAULT_LIMITS.maximumDurationMs, 10000)
  });
}

function frameDuration(time, bounds) {
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.max(bounds.minimumDurationMs, Math.min(bounds.maximumDurationMs, Math.round(time * (1000 / 60))));
}

function planThumbnailAnimations(actions, actionNumbers, options = {}) {
  const bounds = limits(options), animations = {}, spriteKeys = [], seenSprites = new Set(), seenActions = new Set();
  let total = 0;
  for (const actionNumber of Array.isArray(actionNumbers) ? actionNumbers : []) {
    if (!Number.isSafeInteger(actionNumber) || seenActions.has(actionNumber) || seenActions.size >= bounds.actions || total >= bounds.totalFrames) continue;
    seenActions.add(actionNumber);
    const source = actions && actions[actionNumber], frames = [];
    if (!source || !Array.isArray(source.frames)) continue;
    let truncated = false;
    for (const frame of source.frames) {
      if (frames.length >= bounds.framesPerAction || total >= bounds.totalFrames) { truncated = true; break; }
      const sprite = frame && frame.sprite, durationMs = frameDuration(frame && frame.time, bounds);
      if (!Array.isArray(sprite) || sprite.length !== 2 || !sprite.every(value => boundedInteger(value, 0, 2147483647)) || durationMs === null) continue;
      const thumbnailKey = `${sprite[0]},${sprite[1]}`;
      frames.push(Object.freeze({ thumbnailKey, durationMs }));total += 1;
      if (!seenSprites.has(thumbnailKey)) { seenSprites.add(thumbnailKey);spriteKeys.push(thumbnailKey); }
    }
    if (frames.length > 1) animations[String(actionNumber)] = Object.freeze({ frames: Object.freeze(frames), truncated });
  }
  return Object.freeze({ animations: Object.freeze(animations), spriteKeys: Object.freeze(spriteKeys), limits: bounds });
}

function hydrateThumbnailAnimations(plan, images) {
  const result = {};
  if (!plan || !plan.animations || !images || typeof images !== 'object') return Object.freeze(result);
  for (const [actionNumber, animation] of Object.entries(plan.animations)) {
    const frames = animation.frames.filter(frame => typeof images[frame.thumbnailKey] === 'string');
    if (frames.length > 1) result[actionNumber] = Object.freeze({ frames: Object.freeze(frames), truncated: animation.truncated === true || frames.length !== animation.frames.length });
  }
  return Object.freeze(result);
}

function projectRowAnimations(rows, actionNumbersByOrdinal, animations) {
  const result = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const actionNumber = actionNumbersByOrdinal && actionNumbersByOrdinal[row.ordinal], animation = actionNumber !== null && actionNumber !== undefined && animations && animations[String(actionNumber)];
    if (animation) result[row.id] = animation;
  }
  return Object.freeze(result);
}

module.exports = { DEFAULT_LIMITS, frameDuration, planThumbnailAnimations, hydrateThumbnailAnimations, projectRowAnimations };
