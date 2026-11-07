'use strict';

const { requireSffTarget } = require('./sff_target_registry');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const INDEXED_BASE = Object.freeze({
  'sprite.indexed8': 'supported',
  'sprite.truecolor24': 'unsupported',
  'sprite.alpha32': 'unsupported',
  'sprite.links': 'supported',
  'palette.embedded': 'supported',
  'palette.per-sprite': 'supported'
});

const SFF_BACKENDS = deepFreeze([
  {
    id: 'ikemaker-builtin-sff-v1', label: 'IKEMaker Built-in SFF v1.01 PCX8 (Experimental)', kind: 'built-in',
    targetIds: ['sff-v1'], adapter: { id: 'builtin-v1-pcx8', version: 1 }, implemented: true,
    adoptionSupported: false,
    writerProfile: 'sff-v1.01-pcx8-individual-successive-compare-only',
    strictValidator: { id: 'ikemaker-sff-v1-pcx8-strict', version: 1, profile: 'sff-v1.01-pcx8-individual-successive-strict-v1' },
    certificationManifestHashes: ['d07d13fc64af4b26d65736e38e0fd262d57435bbb1853204a9b9f6c1dfefc3a0'],
    capabilities: {
      ...INDEXED_BASE,
      'palette.mode.individual-successive': 'supported',
      'compression.pcx-rle8': 'supported',
      'transparency.index0-binary': 'supported',
      'palette.mode.shared': 'unsupported'
    }
  },
  {
    id: 'elecbyte-sprmaker-sff-v1', label: 'Elecbyte SprMaker (SFF v1)', kind: 'external',
    targetIds: ['sff-v1'], adapter: { id: 'sprmaker-v1', version: 1 }, implemented: false,
    contractImplemented: true, executionImplemented: false, adoptionSupported: false,
    environment: { requiresLegacyRunner: true },
    approvedToolHashes: ['e1852fce2043d760bad3173012f89eae24d2f101e069966c66974ab5bbb1d6af'],
    capabilities: { ...INDEXED_BASE, 'sprite.links': 'unsupported', 'palette.mode.individual-successive': 'supported', 'palette.mode.shared': 'unsupported', 'compression.pcx-rle8': 'supported', 'transparency.index0-binary': 'supported' }
  },
  {
    id: 'ikemaker-builtin-sff-v2.0', label: 'IKEMaker Built-in SFF v2.0 RAW8 (Experimental)', kind: 'built-in',
    targetIds: ['sff-v2.0'], adapter: { id: 'builtin-v20-raw8', version: 1 }, implemented: true,
    adoptionSupported: false,
    writerProfile: 'sff-v2.0-raw8-compare-only',
    strictValidator: { id: 'ikemaker-sff-v20-raw8-strict', version: 1, profile: 'sff-v2.0-raw8-strict-v1' },
    certificationManifestHashes: ['85cc7ab7741c822c05ba43dc7df596710599c9990e66732475089dd36a370e43'],
    capabilities: { ...INDEXED_BASE, 'palette.links': 'supported', 'palette.mode.embedded': 'supported', 'compression.raw8': 'supported', 'transparency.index0-binary': 'supported' }
  },
  {
    id: 'sprmake2-sff-v2.0', label: 'SprMake2 (SFF v2.0)', kind: 'external',
    targetIds: ['sff-v2.0'], adapter: { id: 'sprmake2-v20', version: 1 }, implemented: true,
    capabilities: INDEXED_BASE
  },
  {
    id: 'ikemaker-builtin-sff-v21-png8-prerelease', label: 'IKEMaker Built-in SFF v2.1 PNG8 / True Color', kind: 'built-in',
    targetIds: ['sff-v2.1'], adapter: { id: 'builtin-v21-png8', version: 1 }, implemented: true,
    adoptionSupported: false,
    writerProfile: 'sff-v2.1-mixed-png',
    strictValidator: { id: 'ikemaker-sff-v21-mixed-png-strict', version: 1, profile: 'sff-v2.1-png8-png24-png32-strict-v1' },
    certificationManifestHashes: ['16c5198039798c7dd655171d92b6cfe722277e3367741ae8c961277efe93b1a4', '2fb44def90d514de20cdc8df641f262e71c105f980d344e7b9cb0b9743969db0'],
    capabilities: { ...INDEXED_BASE, 'sprite.truecolor24': 'supported', 'sprite.alpha32': 'supported', 'palette.links': 'supported', 'palette.mode.embedded': 'supported', 'palette.mode.true-color': 'supported', 'compression.png8': 'supported', 'compression.png24': 'supported', 'compression.png32': 'supported' }
  },
  {
    id: 'sprmake2-sff-v2.1', label: 'SprMake2 (SFF v2.1)', kind: 'external',
    targetIds: ['sff-v2.1'], adapter: { id: 'sprmake2-v21', version: 1 }, implemented: true,
    capabilities: {
      'sprite.indexed8': 'supported', 'sprite.truecolor24': 'unproven', 'sprite.alpha32': 'unproven',
      'sprite.links': 'supported', 'palette.embedded': 'supported', 'palette.per-sprite': 'supported'
    }
  }
]);

const BACKEND_BY_ID = new Map(SFF_BACKENDS.map((backend) => [backend.id, backend]));

function listSffBackends(targetId) {
  const target = requireSffTarget(targetId);
  return deepFreeze(SFF_BACKENDS.filter((backend) => backend.targetIds.includes(target.id)));
}

function requireSffBackend(backendId) {
  const id = String(backendId || '').trim();
  if (!id) throw new Error('An explicit SFF backendId is required; IKEMaker does not select a default backend.');
  const backend = BACKEND_BY_ID.get(id);
  if (!backend) throw new Error(`Unknown SFF backendId ${id}.`);
  return backend;
}

function resolveSffTargetBackend(selection = {}) {
  const target = requireSffTarget(selection.targetId);
  const backend = requireSffBackend(selection.backendId);
  if (!backend.targetIds.includes(target.id)) {
    throw new Error(`SFF backend ${backend.id} is incompatible with target ${target.id}; no fallback was selected.`);
  }
  return deepFreeze({ target, backend });
}

module.exports = { SFF_BACKENDS, listSffBackends, requireSffBackend, resolveSffTargetBackend };
