'use strict';

const { parseAir } = require('./air_preview_model');
const { duration } = require('./air_playback');

// Resolve the same frame and inherited collision data as the AIR viewer.
// A box on a blank or skipped frame cannot establish an attack frame.
function firstAttackArtwork(sprites, airText, actionNumber) {
  const keys = new Set(sprites.map(sprite => sprite.group + ',' + sprite.number));
  const matches = parseAir(airText).filter(action => action.number === actionNumber);
  const frames = matches.length === 1 ? matches[0].frames : [];
  const draws = (frame, index) => duration(frame, index, frames.length) > 0 && frame.group >= 0 && frame.index >= 0;
  const visible = frames.filter(draws);
  const missing = visible.filter(frame => !keys.has(frame.group + ',' + frame.index));
  const validAction = visible.length > 0 && missing.length === 0;
  const invalidAttackBoxes = frames.some(frame => frame.clsn1CompilerInvalid);
  const activeFrame = validAction && !invalidAttackBoxes ? frames.findIndex((frame, index) =>
    draws(frame, index) && !frame.clsn1CompilerInvalid && frame.clsn1.length > 0
  ) : -1;
  return {
    hasSprites: keys.size > 0,
    hasAction: validAction,
    ambiguousAction: matches.length > 1,
    actionExists: matches.length === 1,
    visibleFrames: visible.length,
    invalidAttackBoxes,
    missingSprites: [...new Set(missing.map(frame => frame.group + ',' + frame.index))],
    attackBoxFrame: activeFrame
  };
}

module.exports = { firstAttackArtwork };
