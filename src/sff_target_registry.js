'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const SFF_TARGETS = deepFreeze([
  {
    id: 'sff-v1',
    label: 'SFF v1 — DOS/WinMUGEN Legacy',
    version: { major: 1, minor: 0 },
    capabilities: {
      'sprite.indexed8': 'supported',
      'sprite.truecolor24': 'unsupported',
      'sprite.alpha32': 'unsupported',
      'sprite.links': 'supported',
      'palette.embedded': 'supported',
      'palette.per-sprite': 'supported',
      'palette.mode.individual-successive': 'supported',
      'compression.pcx-rle8': 'supported',
      'transparency.index0-binary': 'supported'
    }
  },
  {
    id: 'sff-v2.0',
    label: 'SFF v2.0 — MUGEN 1.0',
    version: { major: 2, minor: 0 },
    capabilities: {
      'sprite.indexed8': 'supported',
      'sprite.truecolor24': 'unsupported',
      'sprite.alpha32': 'unsupported',
      'sprite.links': 'supported',
      'palette.links': 'supported',
      'palette.embedded': 'supported',
      'palette.per-sprite': 'supported',
      'palette.mode.embedded': 'supported',
      'compression.raw8': 'supported',
      'transparency.index0-binary': 'supported'
    }
  },
  {
    id: 'sff-v2.1',
    label: 'SFF v2.1 — MUGEN 1.1/IKEMEN',
    version: { major: 2, minor: 1 },
    capabilities: {
      'sprite.indexed8': 'supported',
      'sprite.truecolor24': 'supported',
      'sprite.alpha32': 'supported',
      'sprite.links': 'supported',
      'palette.links': 'supported',
      'palette.embedded': 'supported',
      'palette.per-sprite': 'supported',
      'palette.mode.embedded': 'supported',
      'compression.png8': 'supported',
      'compression.png24': 'supported',
      'compression.png32': 'supported',
      'palette.mode.true-color': 'supported'
    }
  }
]);

const TARGET_BY_ID = new Map(SFF_TARGETS.map((target) => [target.id, target]));

function listSffTargets() {
  return SFF_TARGETS;
}

function requireSffTarget(targetId) {
  const id = String(targetId || '').trim();
  if (!id) throw new Error('An explicit SFF targetId is required; IKEMaker does not select a default target.');
  const target = TARGET_BY_ID.get(id);
  if (!target) throw new Error(`Unknown SFF targetId ${id}.`);
  return target;
}

module.exports = { SFF_TARGETS, listSffTargets, requireSffTarget };
