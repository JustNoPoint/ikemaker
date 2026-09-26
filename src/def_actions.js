'use strict';

function embeddedActions(text) {
  const lines = String(text || '').split(/\r?\n/), result = {};
  let action = null;
  for (const raw of lines) {
    const heading = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i.exec(raw);
    if (heading) { action = Number(heading[1]); if (!result[action]) result[action] = { frames: [] }; continue; }
    if (action === null) continue;
    const code = raw.replace(/;.*$/, '').trim();
    const frame = /^(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+)/.exec(code);
    if (frame) {
      const item = { sprite: [Number(frame[1]), Number(frame[2])], offset: [Number(frame[3]), Number(frame[4])], time: Number(frame[5]) };
      result[action].frames.push(item);
      if (!result[action].sprite) Object.assign(result[action], item);
    }
  }
  return result;
}

module.exports = { embeddedActions };
