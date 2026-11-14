'use strict';

// Each rendered role has a separate monotonically issued request ticket. A PNG
// decoder may finish after a newer response, so acceptance is checked twice.
function createSffSpriteRequestAuthority() {
  let sequence = 0;
  const pending = new Map();
  const channel = message => message.layerSlot ? 'layer' + message.layerSlot : message.onionFor !== null && message.onionFor !== undefined ? 'onion' : 'base';
  function issue(message) {
    const imageRequestId = ++sequence;
    pending.set(channel(message), { imageRequestId, imageBindingGeneration: message.imageBindingGeneration, physicalIndex: message.index, group: message.group, number: message.number });
    return { ...message, imageRequestId };
  }
  function accepts(message) {
    const current = pending.get(channel(message));
    return Boolean(current && current.imageRequestId === message.imageRequestId && current.imageBindingGeneration === message.imageBindingGeneration && current.physicalIndex === message.physicalIndex && current.group === message.group && current.number === message.number);
  }
  function invalidate(prefix) {
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
  }
  return { issue, accepts, invalidate };
}

function validateSffPreviewLayerSources(value) {
  for (const layer of Array.isArray(value?.layers) ? value.layers : []) {
    if (!['normal', 'add', 'subtract', 'multiply', 'screen'].includes(layer?.blend || 'normal')) throw Error('SFF preview blend must be normal, add, subtract, multiply, or screen.');
    if (layer?.id === 'base') continue;
    const source = layer.source || {};
    if (source.kind === 'bank') {
      if (!Number.isInteger(source.bank) || source.bank < 0 || source.bank > 6) throw Error('Sprite bank must be a whole number from 0 through 6.');
      continue;
    }
    if (source.kind !== 'sprite') throw Error('SFF preview layers require a sprite reference.');
    for (const key of ['group', 'index']) if (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > 65535) throw Error('Sprite ' + key + ' must be a whole number from 0 through 65535.');
  }
  return value;
}
module.exports = { createSffSpriteRequestAuthority, validateSffPreviewLayerSources };
