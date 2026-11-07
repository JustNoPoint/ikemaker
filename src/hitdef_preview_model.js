'use strict';

const { parseAir } = require('./air_preview_model');
const { spritePreviewPair } = require('./move_palette_preview');

function stateNumberAt(text, offset) {
  const source = String(text || '').slice(0, Math.max(0, Number(offset) || 0));
  const pattern = /(?:\[\s*StateDef\s+(-?\d+)[^\]]*\]|\bstateDef\s+(-?\d+)\s*\{)/ig;
  let match, number = null;
  while ((match = pattern.exec(source))) number = Number(match[1] ?? match[2]);
  return number;
}

function actionSummary(airText) {
  return parseAir(airText).map((action) => { const held = action.frames.findIndex(frame => frame.rawTime === -1), prefix = held < 0 ? action.frames : action.frames.slice(0, held), ticks = prefix.reduce((sum, frame) => sum + Math.max(1, Number(frame.time) || 1), 0); return { number: action.number, frames: action.frames.length, ticks: held < 0 ? ticks : null, finitePrefixTicks: ticks, holdElement: held < 0 ? null : held + 1 }; });
}

function enrichedAction(actions, archive, paletteOverride, number) {
  const action = actions.find((item) => item.number === Number(number));
  if (!action) return null;
  return {
    number: action.number,
    loopStart: action.loopStart,
    frames: action.frames.map((frame) => {
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index); let image = null;
      if (sprite) try { image = spritePreviewPair(archive, sprite, paletteOverride); } catch (_) {}
      return { ...frame, image };
    })
  };
}

function previewModel(airText, archive, paletteOverride, requestedP1, requestedP2 = 5000) {
  const actions = parseAir(airText), summaries = actionSummary(airText);
  const p1Number = actions.some((item) => item.number === Number(requestedP1)) ? Number(requestedP1) : actions[0]?.number;
  const p2Number = actions.some((item) => item.number === Number(requestedP2)) ? Number(requestedP2) : actions.find((item) => item.number >= 5000 && item.number < 5100)?.number ?? p1Number;
  return { state: actions.length ? 'ready' : 'empty', actions: summaries, p1Action: p1Number, p2Action: p2Number, p1: enrichedAction(actions, archive, paletteOverride, p1Number), p2: enrichedAction(actions, archive, paletteOverride, p2Number) };
}

module.exports = { stateNumberAt, actionSummary, enrichedAction, previewModel };
