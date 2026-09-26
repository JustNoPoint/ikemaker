'use strict';

const { parseAir } = require('./air_preview_model');
const { spriteDataUri } = require('./sff_reader');

function stateNumberAt(text, offset) {
  const source = String(text || '').slice(0, Math.max(0, Number(offset) || 0));
  const pattern = /(?:\[\s*StateDef\s+(-?\d+)[^\]]*\]|\bstateDef\s+(-?\d+)\s*\{)/ig;
  let match, number = null;
  while ((match = pattern.exec(source))) number = Number(match[1] ?? match[2]);
  return number;
}

function actionSummary(airText) {
  return parseAir(airText).map((action) => ({ number: action.number, frames: action.frames.length, ticks: action.frames.reduce((sum, frame) => sum + Math.max(1, Number(frame.time) || 1), 0) }));
}

function enrichedAction(actions, archive, paletteIndex, number) {
  const action = actions.find((item) => item.number === Number(number));
  if (!action) return null;
  return {
    number: action.number,
    loopStart: action.loopStart,
    frames: action.frames.map((frame) => {
      const sprite = archive.sprites.find((item) => item.group === frame.group && item.number === frame.index); let image = null;
      if (sprite) try { image = { src: spriteDataUri(archive, sprite, paletteIndex), width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
      return { ...frame, image };
    })
  };
}

function previewModel(airText, archive, paletteIndex, requestedP1, requestedP2 = 5000) {
  const actions = parseAir(airText), summaries = actionSummary(airText);
  const p1Number = actions.some((item) => item.number === Number(requestedP1)) ? Number(requestedP1) : actions[0]?.number;
  const p2Number = actions.some((item) => item.number === Number(requestedP2)) ? Number(requestedP2) : actions.find((item) => item.number >= 5000 && item.number < 5100)?.number ?? p1Number;
  return { state: actions.length ? 'ready' : 'empty', actions: summaries, p1Action: p1Number, p2Action: p2Number, p1: enrichedAction(actions, archive, paletteIndex, p1Number), p2: enrichedAction(actions, archive, paletteIndex, p2Number) };
}

module.exports = { stateNumberAt, actionSummary, enrichedAction, previewModel };
