'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, main);
};
try {
  const { resolveAppliedPhysicalMappings } = require('../src/sff_assembly_workspace');
  const result = resolveAppliedPhysicalMappings({
    resolution: { items: [{ id: '10,4@source-2', action: 'copy', destinationIdentity: '10,4' }] },
    validated: { sourceSelection: { items: [{ id: '10,4@source-2', contentFingerprint: 'SOURCE' }] } },
    specification: { sprites: [
      { group: 10, number: 4, source: { provenance: { kind: 'preserved-archive-sprite' } } },
      { group: 10, number: 4, source: { provenance: { sourceIdentity: '10,4@source-2' } } }
    ] },
    finalRows: [{ identity: '10,4', evidence: 'OLD' }, { identity: '10,4', evidence: 'NEW' }]
  });
  assert.deepStrictEqual(result, [{ sourceId: '10,4@source-2', sourceContentFingerprint: 'SOURCE', destinationId: '10,4', destinationPhysicalIndex: 1, destinationPhysicalOccurrence: 1, destinationContentFingerprint: 'NEW' }]);
  assert.throws(() => resolveAppliedPhysicalMappings({ resolution: { items: [{ id: 'x', action: 'copy', destinationIdentity: '10,4' }] }, validated: { sourceSelection: { items: [{ id: 'x', contentFingerprint: 'SOURCE' }] } }, specification: { sprites: [] }, finalRows: [] }), /sealed physical Destination mapping/);
  console.log('SFF Transfer result mapping preserves exact duplicate physical occurrence authority');
} finally { Module._load = original; }
