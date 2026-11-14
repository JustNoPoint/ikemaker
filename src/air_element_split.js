'use strict';
const { frameElementRanges, applyActionPatches, parseAir } = require('./air_preview_model');

// A split repeats the exact authored drawing and explicit boxes, while keeping
// the original total duration and the original LoopStart on the first half.
function splitElementPatch(text, options) {
  const source = String(text), ownership = frameElementRanges(source, options.action), index = options.frameIndex;
  if (!Number.isSafeInteger(index) || !ownership.blocks[index]) throw Error('Choose an exact AIR element to split.');
  const frame = ownership.action.frames[index], block = ownership.blocks[index], first = options.firstTicks;
  if (!Number.isSafeInteger(frame.rawTime) || frame.rawTime < 2) throw Error('Split requires an element lasting at least two finite ticks.');
  if (!Number.isSafeInteger(first) || first < 1 || first >= frame.rawTime) throw Error('Choose a split tick between 1 and ' + (frame.rawTime - 1) + '.');
  const destination = index + 1 < ownership.blocks.length ? index + 1 : ownership.action.loopStart ?? 0;
  if (block.interpolation.length || ownership.blocks[destination]?.interpolation.length) throw Error('Splitting an interpolation boundary changes its timing curve. Remove or edit that interpolation in AIR Source first.');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const changeTime = (value, ticks) => value.replace(/(^[ \t]*-?\d+[ \t]*,[^,\r\n]*,[^,\r\n]*,[^,\r\n]*,[ \t]*)-?\d+/m, (_, prefix) => prefix + ticks);
  const second = block.text.replace(/^[ \t]*LoopStart[^\r\n]*(?:\r\n|\n|$)/gim, '');
  const left = changeTime(block.text, first), right = changeTime(second, frame.rawTime - first);
  const patch = { start: block.start, end: block.end, text: left + (/[\r\n]$/.test(left) ? '' : eol) + right, action: ownership.action.number, frameIndex: index };
  const next = parseAir(applyActionPatches(source, [patch])).find(item => item.number === ownership.action.number);
  if (next.frames.length !== ownership.action.frames.length + 1 || next.frames[index].rawTime + next.frames[index + 1].rawTime !== frame.rawTime) throw Error('The split duration could not be verified.');
  for (const child of next.frames.slice(index, index + 2)) {
    for (const key of ['group', 'index', 'x', 'y', 'flags', 'blend', 'scaleX', 'scaleY', 'angle', 'clsn1', 'clsn2']) {
      if (JSON.stringify(child[key]) !== JSON.stringify(frame[key])) throw Error('The split would change ' + key + '. Nothing was written.');
    }
  }
  return patch;
}
module.exports = { splitElementPatch };
